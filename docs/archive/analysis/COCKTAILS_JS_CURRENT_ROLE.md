# Current Role of cocktails.js

## Overview
After making InventoryManager the single source of truth, `cocktails.js` now serves a **reduced but important role**:

## Primary Functions

### 1. **File Storage & Management** (Main Role)
- **Video Uploads**: Handles video file uploads via Multer, saves as `itemNumber.mp4` (e.g., `1.mp4`, `2.mp4`)
- **Map Snapshot Uploads**: Dedicated endpoint `/map/:itemNumber` saves map PNGs as `itemNumber.png`
- **File Optimization**: Automatically optimizes uploaded videos for web playback
- **File Cleanup**: Deletes old files when new ones are uploaded

### 2. **MenuManager-Only Fields Storage** (Backup/Reference)
The Cocktail model now stores **only** fields that aren't in Inventory:
- `concept` - MenuManager concept text
- `videoFile` - Video filename reference
- `mapSnapshotFile` - Map snapshot filename reference  
- `narrative` - MenuManager narrative text
- `itemNumber` / `itemId` - Identifiers (also in Inventory, but kept here for reference)
- `order` - Display order
- `status` / `isActive` - Active/archived status
- `featured` - Featured flag

**Note**: Most other fields (name, region, ingredients, garnish, etc.) are now stored in Inventory as the single source of truth.

### 3. **Data Merging for MenuManager UI**
The `/menu-manager` endpoint:
- Reads shared fields from **Inventory** (source of truth)
- Merges with MenuManager-only fields from **Cocktail model**
- Merges with recipe data from **Recipe model**
- Returns combined data for MenuManager UI

### 4. **Public API** (Legacy Support)
- `GET /api/cocktails` - Still serves cocktails for public-facing website
- `GET /api/cocktails/:id` - Individual cocktail lookup
- `GET /api/cocktails/menu-gallery` - Gallery data

### 5. **Backward Compatibility**
- Maintains Cocktail model structure for existing integrations
- Provides fallback data if Inventory doesn't have certain fields
- Migration support for old items without itemNumber/itemId

## What It's NOT Doing Anymore

❌ **NOT the source of truth** for:
- `name` (comes from Inventory)
- `region` / `regions` (comes from Inventory)
- `ingredients` (comes from Inventory)
- `garnish` (comes from RecipeBuilder via Inventory)
- Most category-specific fields (style, type, spirit, etc. - all in Inventory)

## Summary

**cocktails.js is now primarily:**
1. A **file storage handler** (videos, map snapshots)
2. A **backup/reference store** for MenuManager-specific fields
3. A **data merger** that combines Inventory + Cocktail + Recipe data
4. A **public API provider** for the website

The Cocktail model is **minimal** compared to before - it's essentially a lightweight reference table that stores file references and MenuManager-specific metadata, while Inventory holds the actual data.

