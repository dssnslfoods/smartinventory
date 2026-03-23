# SmartInventory

## Tech Stack
- React + TS + Vite
- Supabase
- React Query
- Zustand
- Tailwind

## Local Setup
1. Run `npm install`
2. Run `npm run dev`

## Environment Variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

> Note: Preview mode is disabled when Supabase is not configured.

## Scripts
- `dev`
- `build`
- `preview`
- `lint`

## Key Routes/Modules
Refer to `src/App.tsx` for key routes/modules.

## Database Migrations Location
- All migrations are located in `supabase/*.sql`

## Deployment Steps for Firebase Hosting
1. Run `npm run build`
2. Deploy using `firebase deploy` referencing `firebase.json`.
