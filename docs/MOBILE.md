# Cronos as a phone app

The plan for turning Cronos into an installable iOS/Android app, and what's already in place.

## Already in place

- **Accounts in Supabase.** Every account's data lives in Supabase (`src/core/account/`), so
  a phone signs in and sees the same data as the web. Nothing to migrate between devices.
- **Storage behind an interface.** Items go through `StorageAdapter` (`src/core/storage.ts`);
  the sign-in session goes through `KeyValueStore` (`src/core/account/supabase.ts`). Each can
  be swapped without touching features.
- **No SDK lock-in.** The Supabase client is plain `fetch`, so it runs in a WebView or React
  Native as-is.
- **Phone layout.** Bottom tab bar with More, safe-area spacing, touch drag, pinch zoom on the
  field.

## Recommended route: Capacitor

Capacitor wraps the existing web app in a native shell, so the same code ships to the web,
iOS and Android.

1. `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
2. `npx cap init Cronos com.yourname.cronos --web-dir=dist`
3. Build the Supabase settings in (`.env.local`, see `supabase/README.md`), then
   `npm run build && npx cap add ios && npx cap add android`
4. `npx cap open ios` / `npx cap open android` to run on a device.

### Changes for the phone build

| What | Web today | Phone |
|---|---|---|
| Sign-in session | `localStorage` (`browserKeyValue`) | Secure storage (Keychain / Keystore) through a `KeyValueStore`. |
| Email links (confirm, reset password) | Come back to the web address | A deep link (`cronos://…`) or the hosted web app; add it under Supabase → Authentication → Redirect URLs. |
| Changes from other devices | Appear on reload | Reload on `App.addListener("resume")`, or subscribe to Supabase Realtime for live updates. |
| No connection | Saves fail and are undone, with a message | Same; a local copy and queue would be needed to work offline. |
