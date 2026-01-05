# Scripts Directory

This directory contains utility scripts for the Echo Catering project.

## Structure

### `active/` - Currently Used Scripts
Scripts that are actively used for maintenance, generation, or migration:
- **cleanup/** - Cleanup utilities (test files, temp files)
- **generate/** - Code generation scripts (item info, map snapshots, thumbnails)
- **migrateToCloudinary.js** - Migration script for moving files to Cloudinary

### `archive/` - Historical/One-Time Scripts
Scripts that were used for one-time setup, migrations, or testing:
- **setup/** - Initial setup and migration scripts (20+ files)
- **migrations/** - Data migration scripts
- **helpers/** - One-time helper scripts
- **test/** - Test scripts
- **verify/** - Verification scripts

## Usage

Active scripts can be run directly:
```bash
node scripts/active/migrateToCloudinary.js
node scripts/active/generate/generateMapSnapshots.js
```

Archived scripts are kept for reference but are not actively maintained.


