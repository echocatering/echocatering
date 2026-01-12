# Local Layout Dev Setup (Prod Data + Read-Only API)

Goal: edit layout locally with hot reload while consuming the same **Atlas metadata** and **Cloudinary URLs** as production, without risking uploads/deletes/edits.

## Required: local `.env` (project root)

Create/update a `.env` in the project root (same folder as `package.json`) with:

- `PORT=5002`
- `READ_ONLY_MODE=true`
- `CLOUDINARY_CLOUD_NAME=...`
- `CLOUDINARY_API_KEY=...`
- `CLOUDINARY_API_SECRET=...`
- `MONGODB_URI=...` (recommended: **read-only Atlas user**)

## Run locally

- Backend: `npm run server` (API on `http://localhost:5002`)
- Frontend: `npm start` (UI on `http://localhost:3000`)
- Or both: `npm run dev`

## Verify

- `GET http://localhost:5002/api/media/logo` should return a Cloudinary URL in `content`
- `GET http://localhost:5002/api/media/gallery` should return an array of Cloudinary assets

## Read-only enforcement

When `READ_ONLY_MODE=true`, the backend returns **403** for:

- POST
- PUT
- PATCH
- DELETE

This prevents accidental production writes during local layout work.


