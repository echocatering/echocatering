# Debugging Guide: Menu Gallery Data Flow

## Step 1: Open Browser Developer Tools

1. Open your browser (Chrome/Firefox/Safari)
2. Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
3. Go to the **Console** tab
4. Clear the console (click the clear button or press `Cmd+K` / `Ctrl+L`)

## Step 2: Check Network Requests

1. Go to the **Network** tab in Developer Tools
2. Filter by "Fetch/XHR" to see API calls
3. Refresh the page (`Cmd+R` / `Ctrl+R`)
4. Look for a request to `/api/cocktails/menu-gallery`
5. Click on it to see:
   - **Request URL**: Should be `http://localhost:5001/api/cocktails/menu-gallery`
   - **Response**: Click "Response" tab to see the actual data returned
   - **Status**: Should be `200 OK`

## Step 3: Check Console Logs

After refreshing, you should see logs in this order:

### Expected Log Flow:

1. `🔍 [DEBUG] fetchMenuGalleryData: Starting fetch...`
   - Shows the API URL being called
   
2. `🔍 [DEBUG] Response status: 200 OK`
   - Confirms the API responded successfully
   
3. `✅ [DEBUG] Successfully fetched menu gallery data`
   - Shows the data structure received
   
4. `📊 [DEBUG] Data structure:`
   - Shows summary of cocktails per category
   - Should show: `originals: { videoCount: 3, cocktailNames: [...] }`
   
5. `🔍 [DEBUG] Home.js: Rendering EchoCocktailSubpage for category "originals"`
   - Shows what data is being passed to the component
   - Check `videoFiles` and `cocktailNames` arrays

## Step 4: What to Look For

### ✅ Good Signs:
- API returns data with `videoCount: 3` for originals
- `cocktailNames` shows: `["AMBER THEORY", "GREEN SILENCE", "GOLDEN BASILISK"]`
- `videoFiles` shows: `["item1.mp4", "item2.mp4", "item3.mp4"]`

### ❌ Problem Signs:
- API returns empty arrays: `videoCount: 0`
- Wrong API URL (not `localhost:5001`)
- Network error (CORS, connection refused)
- Data shows hardcoded names like "GREEN SILENCE" but with wrong video files

## Step 5: Check for Multiple API Calls

In the Network tab, check if there are:
- Multiple calls to `/api/cocktails/menu-gallery` (should only be 1)
- Calls to other endpoints like `/api/cocktails` (this is normal for admin)
- Any failed requests (red status codes)

## Step 6: Verify Data Flow

1. Check what `EchoCocktailSubpage` receives:
   - Look for: `🔄 EchoCocktailSubpage: Category changed to "originals"`
   - Should show the `videoFiles` array it received

2. Check if hardcoded data is being used:
   - Search console for: `cocktail2.mp4`, `cocktail3.mp4`, `cocktail4.mp4`
   - If you see these, hardcoded data is being used instead of API data

## Common Issues:

### Issue 1: API Returns Empty Data
- **Check**: Server console logs (terminal where server is running)
- **Look for**: `📊 menu-gallery: Found X cocktails from database`
- **Fix**: If it says "Found 0", check database connection

### Issue 2: Wrong API URL
- **Check**: Console log `🔍 [DEBUG] Full URL:`
- **Should be**: `http://localhost:5001/api/cocktails/menu-gallery`
- **Fix**: Check `REACT_APP_API_URL` environment variable

### Issue 3: CORS Error
- **Check**: Console for CORS error message
- **Fix**: Check server CORS configuration in `server/index.js`

### Issue 4: Hardcoded Data Still Showing
- **Check**: Network tab - is the API call actually happening?
- **Check**: Console - what data is `EchoCocktailSubpage` receiving?
- **Fix**: May need to clear browser cache or check if component is using fallback data

## Quick Test Commands:

```bash
# Test API directly
curl http://localhost:5001/api/cocktails/menu-gallery

# Check server is running
curl http://localhost:5001/api/health

# Check if cocktails exist
curl http://localhost:5001/api/cocktails
```

