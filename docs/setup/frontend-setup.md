# Mobile App — Setup Guide

**Module location:** `client/`
**Technology:** React Native (Expo SDK 51)

---

## What This Module Does

The WasteWise mobile app is a React Native application built with Expo. Users install Expo Go on their phone to run the app during development — no build process is needed. The app communicates exclusively with the Node.js backend (port 5000); it never calls the AI service, quantum service, or Ethereum directly.

### Screens

| Screen | File | Purpose |
|--------|------|---------|
| LoginScreen | `src/screens/LoginScreen.js` | JWT authentication for returning users |
| RegisterScreen | `src/screens/RegisterScreen.js` | Create account; optionally supply Ethereum wallet address for token rewards |
| HomeScreen | `src/screens/HomeScreen.js` | Token balance, submission count, recent activity feed |
| SubmitScreen | `src/screens/SubmitScreen.js` | Camera capture or image picker, GPS location, weight input — calls `POST /api/submissions` |
| RewardsScreen | `src/screens/RewardsScreen.js` | Transaction history showing each reward split: 70% received / 30% pending |
| MapScreen | `src/screens/MapScreen.js` | Optimized waste collection routes rendered as polylines on react-native-maps; heatmap of submission locations |

### Components and services

| File | Purpose |
|------|---------|
| `src/components/SubmissionCard.js` | Reusable card showing one submission with status badge and confidence score |
| `src/components/TokenBalance.js` | Displays current WWT token balance from the backend |
| `src/services/api.js` | Axios instance pre-configured with base URL and JWT header injection |

---

## Prerequisites

- Node.js 20 or newer
- npm 9 or newer
- **Expo Go** app installed on your Android or iOS phone (free — search "Expo Go" in the App Store or Google Play)
- Your phone and development computer must be on the **same WiFi network**
- The backend must be running on port 5000 before you test submissions

---

## Setup Steps

### 1. Install dependencies

```bash
cd client
npm install
```

### 2. Find your local IP address

The phone needs to reach your computer's backend over the local network. `localhost` does not work from a physical device — you must use your machine's actual IP address.

**Mac / Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Windows:**
```bash
ipconfig
```

Look for an address like `192.168.1.5` or `10.0.0.12`. If you see multiple, use the one on your WiFi adapter.

### 3. Create your `.env` file

```bash
# In the client/ directory
```

Create a file named `.env` with this content, replacing the IP with your actual address:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.5:5000/api
```

Do not use `localhost` or `127.0.0.1` — these refer to the phone itself, not your computer.

### 4. Confirm the backend is reachable

From your terminal, make sure the backend is running:
```bash
curl http://192.168.1.5:5000/health
```

You should see `{"status":"ok",...}`. If this fails from your computer, the phone definitely cannot reach it either — fix the backend first.

---

## Running the App

```bash
npm start
```

Expo Dev Tools opens in your terminal and shows a QR code. Open Expo Go on your phone and scan the QR code. The app loads in a few seconds.

### Troubleshooting QR code scanning

- Make sure your phone and laptop are on the same WiFi network
- If scanning fails, type the `exp://...` URL shown in the terminal into the Expo Go "Enter URL manually" field
- If you are on a university/corporate network with client isolation, WiFi may block device-to-device traffic — use your phone's hotspot instead and reconnect your laptop to it

### Android emulator

```bash
npm run android
```

Requires Android Studio with an AVD configured. The emulator uses `10.0.2.2` to reach localhost on the host machine, so you may need to adjust `EXPO_PUBLIC_API_URL` to `http://10.0.2.2:5000/api` for emulator testing.

### iOS simulator (Mac only)

```bash
npm run ios
```

Requires Xcode installed. The simulator uses `localhost` to reach the host machine, so `http://localhost:5000/api` works here.

---

## Testing the Full Submission Flow

Follow these steps in order to verify the complete pipeline (mobile → backend → AI → blockchain):

1. **Register a new account** on the RegisterScreen. Enter your name, email, password, and an Ethereum wallet address in MetaMask format (`0x...`). This wallet address is where WWT tokens will be minted.

2. **Log in** if you were not automatically logged in after registration.

3. **Check the HomeScreen** — token balance should show 0 WWT and submission count 0.

4. **Go to SubmitScreen:**
   - Tap "Take Photo" and photograph any plastic item (a bottle, bag, or container)
   - Allow camera permissions if prompted
   - Allow location permissions if prompted — the GPS coordinates are required
   - Enter a weight (for example: `0.5` for 500 grams)
   - Tap "Submit"

5. **Wait for verification** (2–5 seconds). The screen shows a loading indicator while the backend calls the AI service.

6. **Check the result:**
   - If the AI service is running with a trained model and approves the submission: you see an "APPROVED" result and the HomeScreen token balance increases by approximately 3.5 WWT (70% of 5 WWT for 500 g).
   - If the AI service is in stub mode: you see "REJECTED_INVALID_MATERIAL". This is expected — see the AI setup guide.
   - If the backend is running but AI service is offline: you see a "PENDING" status. The submission is saved but not yet verified.

7. **Check RewardsScreen** — approved submissions show the 70%/30% split. The 30% pending amount is released when a recycling company confirms physical receipt via `POST /api/rewards/release`.

8. **Check MapScreen** — if routes have been generated via the quantum service, they appear as coloured polylines over Nairobi. The heatmap layer shows submission density by location.

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "Network request failed" | `EXPO_PUBLIC_API_URL` uses `localhost` or wrong IP | Check your IP with `ifconfig`/`ipconfig` and update `.env`; restart Expo with `npm start -- --clear` |
| "Unable to resolve module" at startup | node_modules missing or corrupt | `npm install` then `expo start --clear` |
| Camera permission denied | App does not have camera access | Phone Settings → Apps → Expo Go → Permissions → Camera → Allow |
| Location permission denied | App does not have location access | Phone Settings → Apps → Expo Go → Permissions → Location → Allow while using app |
| QR code scanned but app shows blank screen | Bundle failed to build | Check the terminal for red error messages — usually a missing package |
| "Your app is not connected to the internet" in Expo Go | Phone and laptop on different networks | Both must be on the same WiFi; try using phone hotspot |
| Token balance shows 0 after approved submission | Wallet address not set on the account | Register with a valid `0x...` MetaMask address; the backend mints to the stored wallet address |
| App crashes on MapScreen | react-native-maps not fully linked | Run `expo start --clear`; on Android emulator, Google Play Services must be installed |

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Yes | Full base URL of the backend API including `/api`. Must use your machine's LAN IP, not localhost. |

Expo requires the `EXPO_PUBLIC_` prefix for variables that need to be accessible in the app bundle. Variables without this prefix are not exposed to the app code.

---

## Clearing the Cache

If you make changes to `.env` or encounter stale module errors:

```bash
npm start -- --clear
```

Or:
```bash
expo start --clear
```

This clears Metro bundler's cache and forces a clean rebuild.
