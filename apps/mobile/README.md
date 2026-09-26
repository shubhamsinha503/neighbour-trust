# Neighbour Trust — mobile (Expo)

A real native app (not the TWA wrapper), built with Expo + React Native +
expo-router. It talks to the **same FastAPI backend** the website uses, so there
is no duplicated data logic — only a native UI.

## What's here so far

- **Home** (`app/index.tsx`) — search + locality list, live from the API.
- **Report** (`app/[slug].tsx`) — Trust Score, category scores, sources.
- **5 languages** (`src/i18n.tsx`) — English, हिन्दी, ಕನ್ನಡ, తెలుగు, मराठी, with a
  chip switcher on the home screen. Same dictionaries as the web app.

The verdict sentence stays English — the same API-generated boundary the website
has, to be fixed when the API becomes language-aware.

## Run it

```bash
cd apps/mobile
npm install

# Point the app at your running API. On a phone, localhost is the phone, so use
# your computer's LAN IP (find it with `ipconfig`/`ifconfig`), not localhost:
EXPO_PUBLIC_API_BASE_URL="http://<your-computer-ip>:8000" npm start
```

Then:

- **On your phone:** install **Expo Go** (App Store / Play Store) and scan the QR
  code the terminal prints. Phone and computer must be on the same Wi-Fi.
- **In a browser:** press `w` in the Expo terminal (uses `localhost:8000`).

The API must be running (`make api` in the repo root) and seeded (`make seed`).

## Next steps

- Persist the chosen language across launches (AsyncStorage).
- Category detail screens (air quality, schools, connectivity, sunlight).
- Offline shell and push notifications — the native-only wins over the TWA.
- A shared i18n package so web and mobile use one source of translations.
