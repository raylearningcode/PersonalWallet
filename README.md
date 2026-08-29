# FinPath

A personal finance wallet: track transactions, manage budgets and savings goals, and get AI-powered spending insights — as a web app and a native Android/iOS app via Capacitor.

Built with React 19, Vite 8, TypeScript, Tailwind CSS, Supabase, and TanStack Query.

## Prerequisites

- Node.js **22+** (CI runs on Node 22)
- npm (ships with Node)

## Install

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

| Variable                  | Required | Description                                                          |
| ------------------------- | -------- | -------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`       | Yes      | Supabase project URL                                                  |
| `VITE_SUPABASE_ANON_KEY`  | Yes      | Supabase anon/publishable key                                        |
| `VITE_GEMINI_API_KEY`     | Optional | Google Gemini API key for AI features (receipt scanning, insights)   |

Missing variables are validated at startup — the app shows a clear error if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is unset.

## Development

```bash
npm run dev
```

Runs the Vite dev server (default: http://localhost:5173).

## Build

```bash
npm run build
```

Type-checks (`tsc -b`) and bundles the web app into `dist/` (includes PWA service worker generation).

## Tests

```bash
npm test -- --run
```

Runs the Vitest suite (unit + component tests). **Tests must stay green — CI runs them on every push to `main` and fails the build if any test fails.** Run `npm test` without `--run` for watch mode during development.

## Mobile (Capacitor)

The native projects live in `android/` and `ios/`. After changing web code or adding/updating a Capacitor plugin:

```bash
npm run cap:sync          # build web app + sync both platforms
npx cap sync android      # sync just Android
```

Then open the native project:

```bash
npm run cap:android       # build + sync + open Android Studio
npm run cap:ios           # build + sync + open Xcode
```

## CI

The `build-android.yml` workflow (`.github/workflows/`) runs on every push to `main` and on manual dispatch (`workflow_dispatch`): installs dependencies, runs the test suite, builds the web app, syncs Capacitor, and builds a debug APK uploaded as a build artifact.
