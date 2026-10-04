# Nestra — Google Play listing copy

Paste-ready text for the Play Console store listing, plus recommended answers
for the Data safety form. Everything here is written to be accurate to what the
app actually does — no "verified scores", no claims the data cannot back.

Review it before submitting; it is listing copy, not legal advice.

---

## App name (max 30)

```
Nestra
```

## Short description (max 80)

```
Honest, sourced data to check a neighbourhood before you rent or buy.
```
(67 characters.)

## Full description (max 4000)

```
Nestra helps you judge a neighbourhood before you commit to it — with data that
shows its work.

Most property apps are trying to sell you the house. Nestra isn't. It pulls
together public information about an area so you can decide for yourself, and
every number on a locality's report tells you three things most apps hide: where
it came from, how old it is, and how much to trust it.

WHAT YOU CAN CHECK

• Air quality — AQI, PM2.5, PM10 and more, from government (CPCB) and community
  sensors.
• Schools — how many are within walking and driving distance, from UDISE and
  OpenStreetMap.
• Connectivity — metro and rail stations, hospitals, clinics, markets and parks
  nearby.
• Healthcare & green spaces — what's actually around you, counted from the map.
• Safety & water signals — drawn from published local news, clearly labelled as
  press coverage rather than official statistics.
• Sun & Shadow map — see how sunlight falls across an area through the day.

HOW IT'S DIFFERENT

• Every figure names its source and date. If we don't have data for something,
  the card says so instead of inventing a number.
• No invented "trust scores" presented as fact — the data is the point.
• No account required. Open the app and start reading.
• No ads, and no third-party advertising or tracking built into the app.

PRIVATE BY DEFAULT

• Localities you save and your language stay on your phone — there's no sign-in
  and nothing is uploaded.
• The optional "Show my neighbourhood" button uses approximate location only to
  open the city you're in; your coordinates are turned into a city name on your
  device and never sent to us. Skip it and search by name instead — the app
  works the same.

WHERE WE COVER

Delhi, Bengaluru, Gurugram, Hyderabad and Mumbai, with more areas being added.
Coverage and the amount of data vary by locality, and the app is honest about
that on every card.

Available in English, Hindi, Kannada, Telugu and Marathi.

Nestra — know here you live.
```

---

## Data safety form (recommended answers)

Play's "collect" / "share" means **transmitted off the device**. These answers
reflect how the app actually behaves; double-check each against the current build
before submitting.

- **Does your app collect or share any of the required user data types?**
  - **Location (approximate):** The app requests approximate foreground location
    for the "Show my neighbourhood" button, but it is reverse-geocoded to a city
    name **on the device** and the coordinates are **not transmitted off the
    device**. Under Play's definition this is **not collected** (processed
    on-device only). Declare the location *permission* where Play asks about
    permissions; do **not** declare location as a collected/shared data type.
  - **No personal identifiers, contacts, photos, messages, financial info,
    health data, or device IDs** are collected or shared.
  - **App activity:** the app sends which locality/search you request to the
    server to return public data. This carries no account or device identifier.
    Server access logs contain an IP address (standard hosting logging, not used
    to track users) — Play does not require declaring standard server logs as
    collection; if in doubt, you may declare "App interactions" as collected,
    not shared, used only for App functionality, not linked to identity.
- **Is all data encrypted in transit?** Yes (HTTPS).
- **Do you provide a way to request data deletion?** The app stores saved items
  only on-device; clearing app data or uninstalling removes them. There is no
  account to delete. (The website's optional sign-in has its own one-tap delete,
  documented in the privacy policy.)

## Other required fields

- **Privacy policy URL:** `https://<your-web-domain>/privacy`
  (e.g. `https://neighbourtrust.com/privacy` — use whatever domain the web app
  is actually deployed at.)
- **App category:** Lifestyle (or House & Home).
- **Content rating:** complete the questionnaire — the app has no mature
  content; expect "Everyone".
- **Contact email:** an address you monitor.

## Graphics checklist (see scripts/make_icons.py, scripts/make_feature_graphic.py)

- App icon 512×512 (PNG, no alpha for the Play icon).
- Feature graphic 1024×500.
- At least 2 phone screenshots (take them from the app: Home, a locality report,
  a category detail, the Sun & Shadow map).
