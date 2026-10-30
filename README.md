# Instami

A mobile-first dating app: swipe Discover, Likes, Chats (on-device E2EE demo), Shorts, Events, invites and rewards, a Security center, rule-based AI autocorrect and smart replies, and an optional Supabase backend. Ships as a PWA and can be wrapped for Android/iOS with Capacitor.

## What is real and what is a prototype

| Area | Status |
|---|---|
| UI, swipe, profile editor, photo upload (resized, EXIF stripped) | Working, stored on-device |
| Matching with sample profiles | Simulated (some people like you back, some later, some never) |
| Supabase accounts, profiles, matching, cloud chat | Implemented, **not yet tested against a live project** |
| Gold plan | Simulated. No payment is taken and the plan lives on-device |
| AI autocorrect / smart replies | Rule-based and on-device, not an LLM |
| Video date | Real peer-to-peer WebRTC call between matched cloud accounts (needs `supabase/calls.sql`); sample profiles show only your own camera. STUN only, so some strict networks need a TURN server |
| Events, offers, rewards | Sample data, device-local |

## 1. Publish as a PWA on GitHub Pages

1. Repo **Settings → Pages**, source: branch `main`, folder `/ (root)`.
2. Open `https://<your-user>.github.io/instami/` and use *Add to Home screen* (or **Profile → Install Instami app**).

The invite links use the placeholder domain `instami.app`; change `inviteLink` in `index.html` to your real URL.

## 2. Turn on the backend (Supabase)

1. Create a free project at supabase.com.
2. SQL editor: run `supabase/schema.sql` (tables, row-level security, mutual-like trigger, `photos` bucket), then `supabase/calls.sql` (video-call signalling).
3. Put the project URL and **anon** key in `config.js`. Never use the `service_role` key.
4. Auth settings: keep email sign-in on and add your site URL.
5. Open the app → **Profile → Account & cloud sync**.

Cloud chats use TLS and row-level security but are not end-to-end encrypted.

## 3. Android / iOS with Capacitor

```
npm install
npx cap add android      # and/or: npx cap add ios (macOS only)
npm run cap:android      # copies the web app into www/, syncs, opens Android Studio
```

You need Android Studio with JDK 17+ and the Android SDK (iOS needs Xcode on a Mac). Update `appId` in `capacitor.config.json` to your own.

## Before charging or launching publicly

- Real payments: Google Play Billing / Apple In-App Purchase (or Stripe on the web), with the plan verified on your server (`profiles.premium_until`).
- Privacy policy, terms of service, account deletion, 18+ checks and a moderation / report workflow.
- Rotate nothing into the repo: keep secrets out of `config.js` (the anon key is public by design).
