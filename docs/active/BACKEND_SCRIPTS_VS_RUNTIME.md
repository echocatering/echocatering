# Backend: Runtime vs Manual Scripts

## Runtime code (deployed on Render)

- **Entrypoint**: `server/index.js`
  - Starts Express
  - Validates required env vars at startup:
    - `MONGODB_URI`
    - `CLOUDINARY_CLOUD_NAME`
    - `CLOUDINARY_API_KEY`
    - `CLOUDINARY_API_SECRET`
  - Connects to MongoDB (with retry for Atlas)
  - Registers all `/api/*` routes
  - Serves the React build from `build/` in production

- **Important rule**: Runtime must **not** depend on local files for gallery media.
  - Gallery media is Cloudinary-only.
  - MongoDB is the source of truth for gallery metadata + Cloudinary URLs.

## Manual scripts (run locally by a developer)

The `scripts/` directory contains utilities for **one-off maintenance**. These scripts are **not** imported by runtime code and **do not run** on Render.

- Examples:
  - `scripts/active/uploadGalleryToCloudinary.js` (manual upload helper)
  - `scripts/active/checkCloudinaryData.js` (manual diagnostics)
  - `server/check-env.js` (manual env diagnostics)

## Removed dead code

- Deleted:
  - `scripts/active/uploadGalleryUrls.js` (manual backfill via mappings)
  - `gallery-mappings.json`

These were manual-only artifacts and are not needed now that uploads write Cloudinary URLs directly into MongoDB.



