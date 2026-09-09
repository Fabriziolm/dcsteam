# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Next.js 15 App Router application written in TypeScript. UI routes and feature modules live in `app/`; `app/page.tsx` selects the role-based dashboard, while files such as `operative-portal.tsx` and `admin-weekly-reports.tsx` own specific workflows. Shared infrastructure belongs in `lib/` (currently the Supabase client). Static logos, icons, the PWA manifest, and service worker live in `public/`.

Supabase database changes are append-only SQL files under `supabase/migrations/`, named with a sortable timestamp and purpose, for example `20260907120000_auxiliary_expense_receipts.sql`. Edge Functions are in `supabase/functions/<function-name>/index.ts`. Deployment automation is defined in `.github/workflows/`, and security notes belong in `docs/` or `SECURITY.md`.

## Build, Test, and Development Commands

- `npm.cmd install` installs locked dependencies from `package-lock.json`.
- `npm.cmd run dev` starts the local development server at `http://localhost:3000`.
- `npm.cmd run build` performs the production build, TypeScript validation, static generation, and export to `out/`.
- `npm.cmd run start` serves a production Next.js build when applicable.
- `npm.cmd run lint` runs the configured Next.js lint command.

Use `npm` instead of `npm.cmd` on macOS or Linux.

## Coding Style & Naming Conventions

TypeScript strict mode is enabled. Use two-space indentation, double quotes in TS/TSX, semicolons, and functional React components with hooks. Name components and types in PascalCase, functions and state in camelCase, and CSS classes in kebab-case. Keep role names and database status strings consistent with existing Spanish values. Prefer feature-focused modules over adding more logic to `page.tsx`.

## Testing Guidelines

No automated test framework or coverage threshold is currently configured. Before submitting changes, run `npm.cmd run build` and manually exercise affected roles and mobile flows. For Supabase changes, verify both allowed and denied RLS cases. If tests are introduced, colocate them as `*.test.ts` or `*.test.tsx` near the feature.

## Commit & Pull Request Guidelines

History generally uses concise imperative subjects, often Conventional Commit prefixes such as `fix:` and `feat:`. Keep each commit focused. Pull requests should explain the user-visible outcome, list validation performed, identify migrations, link relevant issues, and include screenshots or short recordings for UI changes.

## Security & Configuration

Copy `.env.example` for local setup. Never commit `.env.local`, service-role keys, access tokens, or customer data. Enforce authorization in Supabase RLS or security-definer functions, not only in the UI.
