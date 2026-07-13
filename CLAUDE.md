# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

ERP web app for "Ateliê Débora Freitas" (a dressmaking/tailoring atelier). Multi-page vanilla HTML/CSS/JS app (no framework, no SPA router) backed by Firebase (Auth, Realtime Database, Firestore), built/bundled with Vite. All UI text and code comments are in Portuguese (pt-BR).

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — production build via Vite (multi-page build, see `vite.config.js`)
- `npm run preview` — preview the production build
- `npm test` — runs `jest`, but there are currently no test files and no Jest config in the repo, so this will not do anything meaningful until tests are added
- No lint script is defined in `package.json` and no ESLint config file exists yet, even though `eslint`/`eslint-config-prettier` are installed as devDependencies
- `.prettierrc` exists (semi, singleQuote, printWidth 100, tabWidth 2, es5 trailing commas) but there's no `format` script — run `npx prettier --write .` directly if asked to format

## Architecture

This is a **multi-page app**: each top-level `.html` file in the repo root is an independent Vite build entry (see `rollupOptions.input` in `vite.config.js`). There is no client-side router — navigation is plain `<a href="...">` between pages. `home.html` is the post-login menu linking to all feature pages: `dashboard.html` (estoque/inventory), `crm.html`, `produtos.html`, `contas.html` (financeiro), `projetos.html`, `saida.html` (stock out), `gestao.html` (Kanban board), `vendas.html` (sales & rental), `relatorios.html`, `cronograma.html` (weekly schedule, linked from gestao).

### Firebase: mid-migration, two coexisting patterns

The codebase is in the middle of migrating from the legacy Firebase v8 global-namespace API to the v9 modular SDK, and **both patterns exist side by side**. Be aware of this when editing any page-level script:

- **Modern (target) pattern**: `js/firebase-config.js` is an ES module (`<script type="module" src="/js/firebase-config.js">`) using the v9 modular SDK (`initializeApp`, `getAuth`, `getDatabase`, `getFirestore`). It exports `auth`, `database` (RTDB), `db` (Firestore), and also assigns `window.auth`, `window.db` (RTDB instance), `window.firebaseApp` for legacy compatibility with non-module scripts.
- **Legacy pattern (still present in several pages)**: some inline `<script>` blocks and `js/gestao.js` call `firebase.initializeApp(...)`, `firebase.auth()`, `firebase.firestore()`, `firebase.database()` — i.e. they assume the old global `firebase` namespace object exists. There are **no** Firebase CDN `<script>` tags left in any HTML file (they were stripped by `scripts/migrate.js`), so any page still relying on the global `firebase` object (`home.html`, `crm.html`, `cronograma.html`, `gestao.html`/`js/gestao.js`, `relatorios.html`, `vendas.html`) is likely broken (`ReferenceError: firebase is not defined`) unless/until it's fully migrated to import from `js/firebase-config.js`.
- Additionally, `window.db` from `firebase-config.js` is the **Realtime Database** instance, but some legacy code (e.g. `js/crm.js`) calls Firestore-style methods like `db.collection(...)` on it — another sign the migration is incomplete. Check which Firebase product (RTDB vs Firestore) a given page's data actually needs before assuming `db` works as-is.
- `scripts/migrate.js` is a one-off codemod (run manually with Node, not wired into `npm` scripts) that rewrites HTML files to remove old Firebase CDN `<script>` tags and inject `<script type="module" src="/js/firebase-config.js">`. Useful as a reference for what "migrated" should look like, but it does not fix inline script bodies that still use the v8 API.
- When migrating a page, follow the pattern already completed in `dashboard.html`/`gestao.html`/`crm.html`/`produtos.html`/`contas.html`/`cronograma.html`/`vendas.html`/`projetos.html`'s `<head>` (`<script type="module" src="/js/firebase-config.js">`), and update any inline `firebase.xxx()` calls to use `window.auth`/`window.db` (or import directly from `js/firebase-config.js` if the script is converted to `type="module"`).

### Per-page script organization

Only three pages have been extracted into dedicated files under `js/`: `crm.js` (crm.html), `dashboard.js` (dashboard.html — despite the name, drives inventory/produtos/contas/projetos quick-add forms, not just the dashboard), and `gestao.js` (gestao.html, also drives the Kanban board and feeds `cronograma.html`'s weekly view via a shared `atualizarKanban`/`gerarCronogramaSemanal` pattern). All other pages (`contas.html`, `produtos.html`, `projetos.html`, `relatorios.html`, `saida.html`, `vendas.html`, `cronograma.html`) keep their logic in a large inline `<script>` block at the bottom of the file. When making non-trivial changes to one of these pages, expect to edit the inline script rather than looking for a corresponding `js/*.js` file.

### Auth

`js/auth.js` exports `login`, `logout`, `checkAuth` using the v9 modular SDK against `auth` from `js/firebase-config.js`, with SweetAlert2 (`sweetalert2`) for user feedback dialogs. Most protected pages instead do their own inline `onAuthStateChanged` redirect-to-`index.html` check rather than calling `checkAuth()` — check the existing pattern in a given file before adding a new one.

### Styling

Three global stylesheets under `css/`: `style.css` (shared design system — CSS variables like `--surface`, `--primary`, `--text-muted`, base layout), `crm.css`, and `gestao.css` (page-specific). Most pages also carry a large page-specific `<style>` block inline in the `<head>` rather than a dedicated CSS file — this is the norm, not an exception to fix.

### Dependencies of note

- `firebase` (v9+ modular SDK)
- `sweetalert2` for dialogs/toasts (though several pages implement their own ad hoc `showToast`/`showLoader` DOM-based helpers instead, e.g. `js/dashboard.js`)
- `dompurify` — available for sanitizing any HTML rendered from user/DB input
- `date-fns` — available for date handling (`cronograma.html`'s week logic currently uses raw `Date` math instead)
- Charting: `chart.js` and `chartjs-plugin-datalabels` are loaded via CDN `<script>` tags directly in HTML (`dashboard.html`, `projetos.html`, `contas.html`), not via npm/bundled import
