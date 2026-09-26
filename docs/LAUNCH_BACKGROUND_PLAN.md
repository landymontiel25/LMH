# Launch plan: background location and notifications

Goal for the App Store launch: Mapr reaches you when the app is closed.
You walk out of the shooting range and get "Rate the shooting range?".
You show up at Dunkin' for the third morning and get "Want Dunkin' on
your itinerary?". A friend shares a Mapr project and your phone buzzes.

## Where the app is today

| Piece | Today | Why it stops there |
| --- | --- | --- |
| Habit learning (`src/lib/habitTracking.js`) | Learns routines only while the app is open. Stored on the phone only. | No background location. `Info.plist` asks for "While Using" location only. |
| "Rate the place you just left" | Mapr asks in chat, or when you next open the app. | Same: the app can't tell you left while it's closed. |
| Streak warning | Banner and an in-app notification while the app is open. | No local notifications installed. |
| Friend requests, group invites, project shares (`src/lib/notifications.js`) | In-app list, seen next time you open the app. | No push: needs a paid Apple Developer account, an APNs key and a server that sends. |

## The approach

Two different kinds of notification, built two different ways.

**1. On-device notifications (no server, no push setup).** The phone
decides and shows these itself:

- **Leaving a place → "Rate it?"** and **arriving at a habit place →
  "Add it to your itinerary?"** use iOS *region monitoring*. The app hands
  iOS up to 20 circles (your habit places and today's itinerary stops). iOS
  watches them with almost no battery cost and wakes the app on enter/exit,
  even if you swiped it closed.
- **Learning new routines while closed** uses iOS *visit monitoring*
  (`CLVisit`). iOS reports "arrived at / left this spot" on its own
  schedule, again waking the app. The app queues each visit and feeds it
  into the existing habit logic, which stays the same.
- **Streak warning** becomes a scheduled local notification 5 hours before
  the streak lapses, cancelled when you check in or vote. This needs no
  location at all.

No existing Capacitor plugin does region + visit monitoring well, so this
is a small custom Swift plugin (`ios/App/App/BackgroundPlaces.swift`, about
150-200 lines) plus `@capacitor/local-notifications`. The plugin posts the
notification straight from Swift, because the web view may not be running
when iOS wakes the app.

**2. Real push (server → your phone).** For anything another person
causes: friend requests, group trip invites, Mapr project shares, a
friend's reply in a shared chat.

- Phone side: `@capacitor-firebase/messaging` registers for push and saves
  the device token to `users/{uid}/devices/{token}`.
- Server side: a Firebase Cloud Function on `notifications/{id}` create
  sends the push through Firebase Cloud Messaging, which forwards it to
  Apple. Every existing `notifyUser()` call then pushes automatically, with
  no client changes.

## Also worth doing before launch

- **Sync habit places to your account** (`users/{uid}` private field or
  subcollection). Today a new phone or a reinstall forgets every routine.
- **Ask for "Always" location at the right moment:** only after you turn on
  habit tracking in Settings, with a screen that says why first. Apple
  rejects apps that ask for "Always" on first launch or without a clear
  reason.
- **Settings toggles** for each notification type, so people can keep the
  ones they want.

## What you need to do (I can't do these)

1. **Join the Apple Developer Program** ($99/year). Approval can take
   1-2 days, longer for an organization (needs a D-U-N-S number). Nothing
   below can be tested on a real phone or shipped without it.
2. **A Mac with Xcode** to build, run on your iPhone and upload to
   TestFlight. I write the Swift and JavaScript here, but I can't compile or
   run iOS code in this environment.
3. **Create an APNs key** (Apple Developer site → Keys → Apple Push
   Notifications service) and upload the `.p8` file to Firebase console →
   Project settings → Cloud Messaging.
4. **Switch Firebase to the Blaze plan** (pay as you go) so Cloud Functions
   can run. At this app's size it should cost close to nothing.
5. **Test in the real world on TestFlight:** walk into and out of places.
   The iPhone simulator can't fake region and visit wake-ups reliably.

## Order and rough timing

| Step | What | Needs | Time |
| --- | --- | --- | --- |
| 1 | Streak warning as a local notification | Mac to test | 1 day |
| 2 | Swift plugin: region + visit monitoring, "Always" permission flow, `Info.plist` strings | Mac to test | 3-4 days |
| 3 | Wire habits and "rate the place you left" to the plugin; sync habits to your account | Step 2 | 2 days |
| 4 | Push: device tokens, Cloud Function, per-type toggles | Apple account, APNs key, Blaze | 2-3 days |
| 5 | TestFlight field test, fix what real life breaks | Steps 1-4 | 3-5 days |
| 6 | App Store review | Everything | 1-3 days, plus buffer for a possible rejection over "Always" location |

Steps 1-3 need no Apple account to write, only to test. Starting step 4
depends on items 1, 3 and 4 in the list above.

## App Store review notes

- `Info.plist` needs `NSLocationAlwaysAndWhenInUseUsageDescription` with a
  concrete reason, for example: "Landmark Hunters notices places you visit
  often so Mapr can suggest nearby stops and ask how a place was after you
  leave. Your routine stays on your phone."
- Region and visit monitoring don't need the `location` background mode.
  Leaving that mode out avoids Apple asking why the app tracks
  continuously.
- The App Privacy label must list precise location. The only location that
  leaves the phone is the one-time place-name lookup
  (`api/places-nearby.js`).
- Review notes should explain how to see the feature: turn on habit
  tracking in Settings, then visit a place.

## Open questions

- Is the Apple Developer account set up yet, and under a person or a
  company?
- Who has the Mac for building and testing?
- Launch date, to plan the TestFlight week backwards from it.
