"""
Geocode all landmarks in sv-sf-landmarks-final-219.csv using OpenStreetMap's
free Nominatim geocoder (same service src/lib/geocode.js already uses for
address autocomplete).

Usage:
    pip install requests --break-system-packages
    python geocode_landmarks.py                       # live Nominatim
    python geocode_landmarks.py --cache-dir DIR       # replay saved responses
    python geocode_landmarks.py --only 12,40,57       # re-run just these rows

Output:
    sv-sf-landmarks-geocoded.csv -- same file, plus Latitude/Longitude,
    Geocode_Status (OK / NOT_FOUND / LOW_CONFIDENCE_REVIEW) and Geocode_Match
    (what Nominatim actually matched, so a flagged row can be judged at a
    glance instead of trusted blindly).

Rate limit: Nominatim's public server allows 1 request/second. This script
respects that. For 195 rows, expect ~4 minutes to run.

--cache-dir: a folder of JSON files, one per query, each shaped
    {"query": "<exact query string>", "results": [<raw Nominatim results>]}
Rows whose query has no saved response are listed in DIR/pending.json (with
the exact URL to fetch) and marked PENDING in the output. That is how this
was run from a sandbox that could not reach nominatim.openstreetmap.org
directly: fetch the URLs by other means, drop the responses in the folder,
run again. Row numbers everywhere are the CSV data-row index, 1-based.
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse

INPUT_FILE = "sv-sf-landmarks-final-219.csv"
OUTPUT_FILE = "sv-sf-landmarks-geocoded.csv"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "LandmarkHunters-Geocoder/1.0 (contact: you@example.com)"}
RATE_LIMIT_SECONDS = 1.1  # stay under Nominatim's 1 req/sec public limit

# Result types that mean Nominatim gave up on the address and fell back to
# an area. A pin on "San Francisco" is not a landmark location.
AREA_TYPES = {
    "city", "town", "village", "hamlet", "county", "state", "country",
    "postcode", "suburb", "neighbourhood", "quarter", "borough", "municipality",
    "city_district", "district", "region", "state_district", "administrative",
}


def build_query(address, city, state, zip_code):
    return f"{address}, {city}, {state} {zip_code}".strip(", ")


def build_url(query):
    params = {"q": query, "format": "json", "limit": 1, "addressdetails": 1}
    return f"{NOMINATIM_URL}?{urllib.parse.urlencode(params)}"


def house_number_range(address):
    """'710-720 Steiner St' -> (710, 720); '2865 Sand Hill Road' -> (2865, 2865);
    'Pier 39' or 'Grant Ave and Bush St' -> None (no house number)."""
    m = re.match(r"^\s*(\d+)(?:\s*-\s*(\d+))?\s+[A-Za-z]", address or "")
    if not m:
        return None
    lo = int(m.group(1))
    hi = int(m.group(2)) if m.group(2) else lo
    return (min(lo, hi), max(lo, hi))


def result_city(addr):
    for key in ("city", "town", "village", "municipality", "hamlet", "county"):
        if addr.get(key):
            return addr[key]
    return ""


def judge(result, address, city, zip_code):
    """Decide OK vs LOW_CONFIDENCE_REVIEW for a Nominatim hit.

    Nominatim's `importance` is near zero for ordinary buildings (an exact
    house-number match scores ~0.00007) and high only for famous places, so
    it says nothing about whether *this* address matched. What does: did
    the hit land on the requested house number (or, for addresses without
    one, on a real feature rather than a whole city), and is it in the
    requested city and ZIP.
    """
    addr = result.get("address", {}) or {}
    reasons = []

    wanted = house_number_range(address)
    got = addr.get("house_number")
    if wanted:
        if not got:
            reasons.append(f"no house number in match ({result.get('addresstype')})")
        else:
            nums = [int(n) for n in re.findall(r"\d+", got)]
            if not any(wanted[0] <= n <= wanted[1] for n in nums):
                reasons.append(f"house number {got} != {address.split()[0]}")
    elif result.get("addresstype") in AREA_TYPES:
        reasons.append(f"matched an area ({result.get('addresstype')}), not a place")

    got_city = result_city(addr)
    if city and got_city and city.lower() not in got_city.lower() and got_city.lower() not in city.lower():
        # Nominatim files some places under a neighbouring town, or only
        # the county; a county hit is fine, a different city is not.
        if addr.get("county") and city.lower() in addr.get("county", "").lower() and not addr.get("city"):
            pass
        else:
            reasons.append(f"city {got_city} != {city}")

    # OSM postcodes are patchy (Townsend St filed under 94017, Mission
    # Dolores under UCSF's 94143), so a ZIP disagreement is noted for the
    # reviewer but does not on its own flag a house-number + city match.
    got_zip = addr.get("postcode", "")
    note = ""
    if zip_code and got_zip and got_zip[:5] != zip_code[:5]:
        note = f"(osm zip {got_zip}, csv {zip_code})"

    if reasons:
        return "LOW_CONFIDENCE_REVIEW", "; ".join(reasons + ([note] if note else []))
    return "OK", note


class LiveTransport:
    def __init__(self):
        import requests  # noqa: F401 -- only needed for live runs
        self.requests = requests

    def fetch(self, query):
        params = {"q": query, "format": "json", "limit": 1, "addressdetails": 1}
        resp = self.requests.get(NOMINATIM_URL, params=params, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        time.sleep(RATE_LIMIT_SECONDS)
        return resp.json()


class CacheTransport:
    def __init__(self, cache_dir):
        self.cache_dir = cache_dir
        self.by_query = {}
        os.makedirs(cache_dir, exist_ok=True)
        for name in sorted(os.listdir(cache_dir)):
            if not name.endswith(".json") or name == "pending.json":
                continue
            path = os.path.join(cache_dir, name)
            try:
                with open(path, encoding="utf-8") as f:
                    saved = json.load(f)
                if isinstance(saved.get("results"), list) and saved.get("query"):
                    self.by_query[saved["query"]] = saved["results"]
            except (ValueError, AttributeError):
                print(f"  ! unreadable cache file {name}, ignoring", file=sys.stderr)
        self.pending = []

    def fetch(self, query):
        if query in self.by_query:
            return self.by_query[query]
        raise KeyError(query)


def geocode(transport, row_no, address, city, state, zip_code):
    """Geocode one address. Returns (lat, lon, status, match)."""
    query = build_query(address, city, state, zip_code)
    try:
        results = transport.fetch(query)
    except KeyError:
        transport.pending.append({"row": row_no, "query": query, "url": build_url(query)})
        return None, None, "PENDING", ""
    except Exception as e:  # network errors on a live run
        return None, None, f"ERROR: {e}", ""
    if not results:
        return None, None, "NOT_FOUND", ""
    top = results[0]
    status, why = judge(top, address, city, zip_code)
    match = top.get("display_name", "")
    if why:
        match = f"{why} | {match}"
    return top["lat"], top["lon"], status, match


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache-dir", help="replay saved Nominatim responses instead of calling the API")
    ap.add_argument("--only", help="comma-separated 1-based row numbers to (re)geocode; other rows keep "
                                   "whatever the existing output file says")
    ap.add_argument("--input", default=INPUT_FILE)
    ap.add_argument("--output", default=OUTPUT_FILE)
    args = ap.parse_args()

    with open(args.input, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [r for r in reader if (r.get("Name") or "").strip()]
        fieldnames = list(reader.fieldnames) + ["Latitude", "Longitude", "Geocode_Status", "Geocode_Match"]

    previous = {}
    if args.only and os.path.exists(args.output):
        with open(args.output, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                previous[r["Name"]] = r
    only = {int(n) for n in args.only.split(",")} if args.only else None

    transport = CacheTransport(args.cache_dir) if args.cache_dir else LiveTransport()
    transport.pending = getattr(transport, "pending", [])

    total = len(rows)
    for i, row in enumerate(rows, 1):
        if only is not None and i not in only and row["Name"] in previous:
            for k in ("Latitude", "Longitude", "Geocode_Status", "Geocode_Match"):
                row[k] = previous[row["Name"]].get(k, "")
            continue
        print(f"[{i}/{total}] Geocoding: {row['Name']}")
        lat, lon, status, match = geocode(
            transport, i,
            row.get("Address", ""),
            row.get("City", ""),
            row.get("State", ""),
            row.get("Zip", ""),
        )
        row["Latitude"] = lat or ""
        row["Longitude"] = lon or ""
        row["Geocode_Status"] = status
        row["Geocode_Match"] = match

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    if args.cache_dir:
        with open(os.path.join(args.cache_dir, "pending.json"), "w", encoding="utf-8") as f:
            json.dump(transport.pending, f, indent=1)

    counts = {}
    for r in rows:
        counts[r["Geocode_Status"].split(":")[0]] = counts.get(r["Geocode_Status"].split(":")[0], 0) + 1
    print(f"\nDone. " + ", ".join(f"{v} {k}" for k, v in sorted(counts.items())))
    for r in rows:
        if r["Geocode_Status"] in ("NOT_FOUND", "LOW_CONFIDENCE_REVIEW"):
            print(f"  {r['Geocode_Status']:22} {r['Name']} -- {r['Address']}, {r['City']} {r['Zip']}"
                  f"{'  => ' + r['Geocode_Match'] if r['Geocode_Match'] else ''}")
    if transport.pending:
        print(f"{len(transport.pending)} queries have no cached response; see {args.cache_dir}/pending.json")
    print(f"Output written to {args.output}")


if __name__ == "__main__":
    main()
