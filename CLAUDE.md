# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Archivo Paranormal" — a Spanish-language web app for uploading and browsing paranormal media (images/video/audio) organized into themed folders (Fantasmas, Duendes, Exorcismo, etc.), with an admin moderation queue. Flask + PostgreSQL backend, vanilla JS/HTML/CSS frontend (no build step, no framework).

## Commands

This project runs on **Windows** (PowerShell). Paths below use Windows conventions.

```powershell
# Setup (the venv is already created at .\venv — Python 3.14)
python -m venv venv
.\venv\Scripts\Activate.ps1
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env     # then fill in DB_* and SECRET_KEY

# Database (PostgreSQL must be running — this machine has 14, 16 and 18; .env uses 5432)
psql -U postgres -d paranormal_db -f schema.sql

# Run
.\venv\Scripts\python.exe app.py   # serves on http://localhost:5000, debug=True
```

**Dependency pins are Python-3.14-specific.** `psycopg2-binary` and `Pillow` must stay at
versions that publish cp314 Windows wheels (currently 2.9.12 and 12.3.0). The older pins from
the macOS setup (2.9.9 / 11.0.0) have no cp314 wheel and fail to build from source on Windows.

There are no tests, linter, or formatter configured in this repo.

## Architecture

**Single-file backend.** All routes, DB access, and business logic live in `app.py` — there's no blueprint/module split. New endpoints should follow the existing pattern: a route function that calls the `query()` helper directly.

**DB access pattern.** `query(sql, params, fetchone, commit)` in `app.py` opens a new `psycopg2` connection per call (no pooling) and returns dict rows (`RealDictCursor`). There is no ORM. Always parameterize queries — string-built SQL (e.g. the `check_rate_limit` window) is the exception, not the pattern to copy.

**`schema.sql` is stale relative to `app.py`.** The code references columns and tables that do not exist in `schema.sql` (e.g. `usuarios.username`, `archivos.asunto`, `archivos.oculto`, `archivos.visitas_count`, plus whole tables `comentarios`, `reacciones`, `guardados`, `visitas`, `reportes`, `login_intentos`). Don't treat `schema.sql` as ground truth for the current DB shape — if you need to know the real schema, read the queries in `app.py`. If you add a column/table used by new code, update `schema.sql` to match.

**Auth & roles.** Session-cookie auth (Flask `session`, no JWT). Four `perfil` levels drive both backend gating and frontend UI:
- `0` Super Administrador — everything; only a super admin can create/edit other perfil-0/1 users (`es_super_admin()`, `app.py`)
- `1` Administrador — full access, moderation, user management
- `2` Estándar — can upload (subject to `puede_subir` flag and admin approval)
- `3` Restringido — read-only

`login_required` / `admin_required` decorators in `app.py` gate routes. There's a login rate-limiter (`check_rate_limit`/`registrar_intento`, `login_intentos` table) keyed by email+IP; note it's defined **twice** in `app.py` (the second definition wins).

**Upload/moderation pipeline.** This is the core workflow:
1. User uploads → file saved to `uploads/aduana/<uuid>.<ext>` with a DB row (`estado='pendiente'`).
2. Admin reviews via `/api/admin/pendientes` (file served from aduana via `/api/aduana/<nombre>`, admin-only).
3. Approve (`/api/admin/aprobar/<id>`) moves the file with `os.rename` into `uploads/aprobados/<categoria>/` and flips `estado='aprobado'`.
4. Reject (`/api/admin/rechazar/<id>`) deletes the file from aduana and sets `estado='rechazado'`.
5. Approved files are served publicly only through `/api/archivo/<nombre_guardado>`, which checks `estado='aprobado'` before calling `send_from_directory` — never construct direct paths into `uploads/aprobados/`.

**Categories live in the DB.** The `categorias` table is the source of truth — the admin panel creates/deletes them at runtime. `CATEGORIAS_SEED` in `app.py` only seeds that table on first startup, and `static/dashboard.js` fetches `/api/categorias` (its hardcoded array is a fallback for when that fetch fails). Don't add a category by editing the constants.

**"Modo Incognito" category** is special-cased: the uploader's username is stripped from API responses for files in that category (see `archivos_por_categoria` and `mis_guardados` in `app.py`).

**File type detection.** `tipo_por_extension()` in `app.py` and the mirrored `EXTENSIONES`/`detectarTipo()` in `static/dashboard.js` classify uploads as `imagen`/`video`/`audio`/`otro` from the file extension — keep the extension sets in sync if you add formats.

**Frontend.** No build step — plain HTML pages in `static/` each load `auth.js` (session bar, toasts, nav) and `temas.js` (color theme switcher, persisted to `localStorage`) plus a page-specific script (`dashboard.js`, `carpeta.js`, `admin.js`, `perfil.js`). Pages call the JSON API directly with `fetch`; there's no client-side router or state management. `static/<page>.html` is served both at `/` (index) and via the catch-all `/<path:filename>` route in `app.py`.

**File limits.** Enforced both client-side (`static/dashboard.js`, informational) and server-side: `MAX_CONTENT_MB` env var (default 50MB) via Flask's `MAX_CONTENT_LENGTH`, and a 200-word cap on descriptions for perfil-2 uploads (`app.py` `upload()`).
