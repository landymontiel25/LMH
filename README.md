# Landmark Hunters

A mobile-friendly trip planner for real landmarks in Miami, Milan/Monza, and Villanova/Main Line/Philadelphia — with GPS check-ins and a shared points leaderboard.

## Run it locally

```bash
npm install
npm run dev
```

Trip planning (starting location, region, interests, landmark selection, itinerary) works immediately with no setup — it's stored in your browser's `localStorage`.

## Connect the leaderboard (Firebase)

Points and the leaderboard are shared across users, so they need a real backend. The app uses Firebase's free Spark tier (Auth + Firestore). Until you configure it, sign-in and the leaderboard will show a "not configured" message — everything else still works.

1. Create a free project at [console.firebase.google.com](https://console.firebase.google.com).
2. In **Build → Authentication → Sign-in method**, enable **Email/Password** and **Google**.
3. In **Build → Firestore Database**, click **Create database** (start in production mode).
4. In **Project settings → General**, scroll to "Your apps," add a **Web app**, and copy the config values.
5. Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   ```

6. Restart `npm run dev`.

### Firestore security rules

In **Firestore Database → Rules**, use:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /checkins/{checkinId} {
      allow read: if true;
      allow create: if request.auth != null
        && checkinId == request.auth.uid + '_' + request.resource.data.landmarkId
        && request.resource.data.userId == request.auth.uid;
      allow update, delete: if false;
    }
    match /leaderboard_entries/{entryId} {
      allow read: if true;
      allow write: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }
  }
}
```

This keeps writes limited to the signed-in user's own points and prevents claiming the same landmark twice (the `checkins` doc ID is deterministic per user+landmark).

## How the leaderboard resets

Each check-in increments per-period aggregate documents (`leaderboard_entries`) keyed by ISO week / calendar month / calendar year. When a new period starts, its key is new, so the leaderboard naturally shows zero for that period — no scheduled job required.

## Tech

- React + Vite, mobile-responsive
- React Router (hash routing, so it works from a static file host)
- Firebase Auth (email/password + Google) and Firestore (leaderboard only)
- Browser Geolocation API for the ~150m check-in radius
- Trip/itinerary state in `localStorage`
- OpenStreetMap Nominatim for free geocoding of the starting location
