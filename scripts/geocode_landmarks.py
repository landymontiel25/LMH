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
    (what was actually matched, so a flagged row can be judged at a glance
    instead of trusted blindly).

How a row is judged (see judge()): a Nominatim hit counts as OK when it
lands on the requested house number (or, for a landmark with no house
number, on a named feature rather than a whole city or road) in the
requested city. Nominatim's `importance` score is NOT used: it is ~0.00007
for an exact house-number match and high only for famous places, so it
says nothing about whether *this* address matched.

Fallbacks, each recorded in Geocode_Match so nothing is silent:
  - a ZIP-qualified query that returns nothing, or only a road, is retried
    without the ZIP (OSM's postcode data is patchy);
  - an address whose house number OSM does not carry is interpolated by the
    US Census Bureau geocoder (TIGER address ranges), marked "census:";
  - an Address written as explicit coordinates ("Approx 37.2297 -121.7567
    ...") -- a plaque on a trail, say -- is reverse-geocoded to confirm the
    point is in the requested city, marked "reverse:".

Rate limit: Nominatim's public server allows 1 request/second. This script
respects that. For 195 rows, expect ~4 minutes to run.

--cache-dir: a folder of JSON files, one per query, each shaped
    {"query": "<exact query string>", "results": [...], "source": "search"}
("source" is "search" when omitted; "census" and "reverse" files hold those
services' raw responses). Rows whose query has no saved response are listed
in DIR/pending.json (with the exact URL to fetch) and marked PENDING in the
output. That is how this was run from a sandbox that could not reach the
geocoders directly: fetch the URLs by other means, drop the responses in
the folder, run again. Row numbers everywhere are the CSV data-row index,
1-based.
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
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
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


def explicit_coords(address):
    """'Approx 37.2536 -121.8016 (Lowe's parking lot)' -> (37.2536, -121.8016)."""
    m = re.search(r"(-?\d{1,2}\.\d{3,})\s*,?\s+(-?\d{1,3}\.\d{3,})", address or "")
    return (float(m.group(1)), float(m.group(2))) if m else None


def result_city(addr):
    for key in ("city", "town", "village", "municipality", "hamlet", "county"):
        if addr.get(key):
            return addr[key]
    return ""


def same_city(city, addr):
    got_city = result_city(addr)
    if not city or not got_city:
        return True
    # OSM has no city for unincorporated land (the Stanford Dish sits on
    # county land); a county-only address cannot contradict the CSV.
    if not any(addr.get(k) for k in ("city", "town", "village", "municipality", "hamlet")):
        return True
    if city.lower() in got_city.lower() or got_city.lower() in city.lower():
        return True
    # A county-level hit is fine when the county carries the city's name.
    return bool(addr.get("county") and city.lower() in addr.get("county", "").lower() and not addr.get("city"))


def judge(result, address, city, zip_code):
    """Decide OK vs LOW_CONFIDENCE_REVIEW for a Nominatim hit."""
    addr = result.get("address", {}) or {}
    reasons = []

    wanted = house_number_range(address)
    got = addr.get("house_number")
    # OSM sometimes carries the number in the feature's name instead of an
    # addr:housenumber tag (the "164 South Park" historic marker, campus
    # driveways named "2200 Mission College Boulevard"); that still pins
    # the requested building.
    name_num = re.match(r"^\s*(\d+)\b", result.get("name") or "")
    if wanted:
        nums = [int(n) for n in re.findall(r"\d+", got or "")]
        if name_num:
            nums.append(int(name_num.group(1)))
        if not nums:
            reasons.append(f"no house number in match ({result.get('addresstype')})")
        elif not any(wanted[0] <= n <= wanted[1] for n in nums):
            reasons.append(f"house number {got or name_num.group(1)} != {address.split()[0]}")
    elif result.get("addresstype") in AREA_TYPES:
        # A district can be the landmark (Fisherman's Wharf, South Park):
        # then the district feature itself is the right pin.
        feature = (result.get("name") or "").strip().lower()
        if not (feature and feature == (address or "").strip().lower()):
            reasons.append(f"matched an area ({result.get('addresstype')}), not a place")

    got_zip = addr.get("postcode", "")
    zip_agrees = bool(zip_code and got_zip and got_zip[:5] == zip_code[:5])

    # Nominatim files some places under a neighbouring town label; that is
    # fine when the ZIP agrees (Mount Hamilton is San Jose to OSM). A
    # different city with a different ZIP is not.
    if not same_city(city, addr) and not zip_agrees:
        reasons.append(f"city {result_city(addr)} != {city}")

    # OSM postcodes are patchy (Townsend St filed under 94017, Mission
    # Dolores under UCSF's 94143), so a ZIP disagreement is noted for the
    # reviewer but does not on its own flag a house-number + city match.
    note = ""
    if zip_code and got_zip and not zip_agrees:
        note = f"(osm zip {got_zip}, csv {zip_code})"

    if reasons:
        return "LOW_CONFIDENCE_REVIEW", "; ".join(reasons + ([note] if note else []))
    return "OK", note


def is_road_only(result):
    return (result.get("class") == "highway") and not (result.get("address") or {}).get("house_number")


class LiveTransport:
    def __init__(self):
        import requests  # noqa: F401 -- only needed for live runs
        self.requests = requests
        self.pending = []

    def _get(self, url, params):
        resp = self.requests.get(url, params=params, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        time.sleep(RATE_LIMIT_SECONDS)
        return resp.json()

    def search(self, query):
        return self._get(NOMINATIM_URL, {"q": query, "format": "json", "limit": 1, "addressdetails": 1})

    def reverse(self, lat, lon):
        r = self._get(NOMINATIM_REVERSE_URL, {"lat": lat, "lon": lon, "format": "json", "addressdetails": 1, "zoom": 18})
        return [r] if r and "error" not in r else []

    def census(self, query):
        r = self._get(CENSUS_URL, {"address": query, "benchmark": "Public_AR_Current", "format": "json"})
        return (r.get("result") or {}).get("addressMatches") or []


class CacheTransport:
    def __init__(self, cache_dir):
        self.cache_dir = cache_dir
        self.by_key = {}
        self.pending = []
        os.makedirs(cache_dir, exist_ok=True)
        for name in sorted(os.listdir(cache_dir)):
            if not name.endswith(".json") or name == "pending.json":
                continue
            try:
                with open(os.path.join(cache_dir, name), encoding="utf-8") as f:
                    saved = json.load(f)
                if isinstance(saved.get("results"), list) and saved.get("query"):
                    self.by_key[(saved.get("source", "search"), saved["query"])] = saved["results"]
            except (ValueError, AttributeError):
                print(f"  ! unreadable cache file {name}, ignoring", file=sys.stderr)

    def _lookup(self, source, query, url):
        try:
            return self.by_key[(source, query)]
        except KeyError:
            self.pending.append({"source": source, "query": query, "url": url})
            raise

    def search(self, query):
        return self._lookup("search", query, build_url(query))

    def reverse(self, lat, lon):
        params = {"lat": lat, "lon": lon, "format": "json", "addressdetails": 1, "zoom": 18}
        return self._lookup("reverse", f"reverse:{lat},{lon}", f"{NOMINATIM_REVERSE_URL}?{urllib.parse.urlencode(params)}")

    def census(self, query):
        params = {"address": query, "benchmark": "Public_AR_Current", "format": "json"}
        return self._lookup("census", query, f"{CENSUS_URL}?{urllib.parse.urlencode(params)}")


def geocode(transport, address, city, state, zip_code):
    """Geocode one row. Returns (lat, lon, status, match)."""
    coords = explicit_coords(address)
    if coords:
        # The row already carries a point; confirm it is where the row says.
        hits = transport.reverse(*coords)
        if not hits:
            return None, None, "NOT_FOUND", "reverse: nothing at those coordinates"
        addr = hits[0].get("address", {}) or {}
        if not same_city(city, addr):
            return None, None, "LOW_CONFIDENCE_REVIEW", f"reverse: city {result_city(addr)} != {city} | {hits[0].get('display_name', '')}"
        return coords[0], coords[1], "OK", f"reverse: {hits[0].get('display_name', '')}"

    query = build_query(address, city, state, zip_code)
    results = transport.search(query)
    used = query
    # OSM postcode data is patchy enough that a ZIP-qualified query can miss
    # a feature (or rank a road above it) that the same query finds without
    # the ZIP.
    if zip_code and (not results or (not house_number_range(address) and is_road_only(results[0]))):
        retry = build_query(address, city, state, "")
        again = transport.search(retry)
        if again and (not results or not (is_road_only(again[0]) or again[0].get("addresstype") in AREA_TYPES)):
            results, used = again, retry

    if results:
        top = results[0]
        status, why = judge(top, address, city, zip_code)
        match = top.get("display_name", "")
        if used != query:
            match = f"(matched without ZIP) {match}"
        if status == "OK":
            return top["lat"], top["lon"], status, f"{why} {match}".strip()
    else:
        status, why, top = "NOT_FOUND", "", None

    # A street address OSM has no house number for: interpolate it on the
    # Census Bureau's TIGER address ranges rather than pin a whole road.
    if house_number_range(address):
        matches = transport.census(query)
        if matches:
            m = matches[0]
            comp = m.get("addressComponents", {})
            if (zip_code and comp.get("zip") == zip_code[:5]) or comp.get("city", "").lower() == city.lower():
                rng = f"{comp.get('fromAddress')}-{comp.get('toAddress')}"
                return (m["coordinates"]["y"], m["coordinates"]["x"], "OK",
                        f"census: {m.get('matchedAddress')} (interpolated on TIGER range {rng})")

    if top is None:
        return None, None, "NOT_FOUND", ""
    return top["lat"], top["lon"], status, f"{why} | {top.get('display_name', '')}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache-dir", help="replay saved geocoder responses instead of calling the services")
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

    total = len(rows)
    for i, row in enumerate(rows, 1):
        if only is not None and i not in only and row["Name"] in previous:
            for k in ("Latitude", "Longitude", "Geocode_Status", "Geocode_Match"):
                row[k] = previous[row["Name"]].get(k, "")
            continue
        print(f"[{i}/{total}] Geocoding: {row['Name']}")
        try:
            lat, lon, status, match = geocode(
                transport,
                row.get("Address", ""),
                row.get("City", ""),
                row.get("State", ""),
                row.get("Zip", ""),
            )
        except KeyError:
            lat, lon, status, match = None, None, "PENDING", ""
        except Exception as e:  # network errors on a live run
            lat, lon, status, match = None, None, f"ERROR: {e}", ""
        row["Latitude"] = lat or ""
        row["Longitude"] = lon or ""
        row["Geocode_Status"] = status
        row["Geocode_Match"] = match

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    if args.cache_dir:
        with open(os.path.join(args.cache_dir, "pending.json"), "w", encoding="utf-8") as f:
            json.dump(transport.pending, f, indent=1)

    counts = {}
    for r in rows:
        k = r["Geocode_Status"].split(":")[0]
        counts[k] = counts.get(k, 0) + 1
    census = sum(1 for r in rows if r["Geocode_Match"].startswith("census:"))
    reverse = sum(1 for r in rows if r["Geocode_Match"].startswith("reverse:"))
    nozip = sum(1 for r in rows if "matched without ZIP" in r["Geocode_Match"])
    print("\nDone. " + ", ".join(f"{v} {k}" for k, v in sorted(counts.items()))
          + f" ({census} via Census interpolation, {reverse} via reverse lookup, {nozip} matched without ZIP)")
    for r in rows:
        if r["Geocode_Status"] in ("NOT_FOUND", "LOW_CONFIDENCE_REVIEW"):
            print(f"  {r['Geocode_Status']:22} {r['Name']} -- {r['Address']}, {r['City']} {r['Zip']}"
                  f"{'  => ' + r['Geocode_Match'] if r['Geocode_Match'] else ''}")
    if transport.pending:
        print(f"{len(transport.pending)} queries have no cached response; see {args.cache_dir}/pending.json")
    print(f"Output written to {args.output}")


if __name__ == "__main__":
    main()
