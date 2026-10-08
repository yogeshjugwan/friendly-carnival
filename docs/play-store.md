# Publishing randomCall on Google Play

randomCall is already an installable web app (manifest, icons, service
worker). Google Play accepts it as a **Trusted Web Activity (TWA)**: a small
Android app that opens the site full-screen. Updates to the website reach the
app instantly — you only rebuild the app to change its icon or name.

## What you need

- A Google Play developer account (one-time $25).
- Node 18+ and Java 17 on your computer (Bubblewrap can install the Android SDK for you).

## 1. Build the app with Bubblewrap

```bash
npm i -g @bubblewrap/cli
mkdir randomcall-android && cd randomcall-android
bubblewrap init --manifest https://call-random-call.vercel.app/manifest.webmanifest
```

Answer the questions (suggested values):

- Application ID / package: `app.randomcall.twa` (pick yours; it can't change later)
- App name: `randomCall`, launcher name: `randomCall`
- Display mode: `standalone`, orientation: `portrait`
- Signing key: let Bubblewrap create one — **back up the `.keystore` file and its passwords**; you need them for every update.

Then:

```bash
bubblewrap build
```

This makes `app-release-bundle.aab` (upload to Play) and `app-release-signed.apk` (install on a phone to test).

## 2. Link the app and the website

Get the signing certificate fingerprint:

```bash
bubblewrap fingerprint list
```

In **Vercel → Project → Settings → Environment Variables** add:

- `ANDROID_PACKAGE_NAME` = your package, e.g. `app.randomcall.twa`
- `ANDROID_CERT_SHA256` = the SHA-256 fingerprint (`AA:BB:…`)

Redeploy. Check https://call-random-call.vercel.app/.well-known/assetlinks.json shows them.

If you use **Play App Signing** (recommended), Google re-signs the app: copy the
"App signing key certificate" SHA-256 from Play Console → Setup → App
integrity, and add it to `ANDROID_CERT_SHA256` too (comma-separated).

## 3. Play Console

1. Create the app, upload the `.aab` to an internal testing track first.
2. **Content rating:** it's a social app where users meet strangers by video — answer honestly; expect an 18+ / Mature rating.
3. **Data safety:** camera and microphone (calls, not stored), email (accounts), device ID, purchases (Stripe / Razorpay), crash data if you add it.
4. **Payments:** Google Play requires its own billing for digital goods sold *inside* Android apps (coins, Plus). Options: use Play Billing in the app, or hide the purchase buttons in the Android app and let people buy on the website. Ask before launch which you prefer — we can detect the TWA (`document.referrer` starts with `android-app://`) and switch.
5. Add screenshots (phone), a 512×512 icon (`apps/web/public/icon-512.png`) and a feature graphic (1024×500).

## Updating

Website changes are live in the app immediately. To change the icon/name, bump
the version in `twa-manifest.json`, run `bubblewrap update && bubblewrap build`,
and upload the new `.aab`.
