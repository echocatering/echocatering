# How to Check Debug Logs - Step by Step

## Part 1: Check Browser Console (Frontend)

### On Mac:
1. Open your website in Chrome or Safari
2. Press **Command + Option + I** (or **Command + Option + J**)
   - OR right-click on the page → "Inspect" → "Console" tab
3. You should see a panel open at the bottom or side
4. Click the **"Console"** tab at the top
5. Refresh the page (Command + R)
6. Look for messages that start with:
   - `🔍 DEBUG`
   - `✅ Using cloudinaryUrl`
   - `⚠️ Using fallback`

### On Windows:
1. Open your website in Chrome
2. Press **F12** (or **Ctrl + Shift + I**)
   - OR right-click on the page → "Inspect" → "Console" tab
3. Click the **"Console"** tab
4. Refresh the page (F5 or Ctrl + R)
5. Look for the same debug messages

### What to Copy:
Copy any lines that show:
- `cloudinaryUrl: ...`
- `imagePath: ...`
- `Using cloudinaryUrl:` or `Using fallback`

---

## Part 2: Check Server Terminal (Backend)

### Find Your Server Terminal:
1. Look for the terminal/command prompt window where you started your server
2. It should show something like:
   ```
   🚀 Server running on port 5002
   📊 Health check: http://localhost:5002/api/health
   ```

### When You Load the Page:
1. Go to your website in the browser
2. Refresh the page
3. Go back to the server terminal
4. You should see new messages appear that start with:
   - `🔍 DEBUG - First gallery image from DB:`
   - `🔍 DEBUG - First image as JSON:`

### What to Copy:
Copy the entire debug block that shows:
- `cloudinaryUrl: ...`
- `imagePath: ...`
- `hasCloudinaryUrl: ...`

---

## Part 3: Take a Screenshot or Copy Text

### Option A: Screenshot
- Take a screenshot of:
  1. The browser console showing the debug messages
  2. The server terminal showing the debug messages

### Option B: Copy Text
- Select and copy the debug messages
- Paste them here

---

## Quick Test:

1. **Open your website** (usually `http://localhost:3000` or `http://localhost:5002`)
2. **Open browser console** (Command+Option+I on Mac, F12 on Windows)
3. **Refresh the page**
4. **Look for** messages with 🔍 or ⚠️ or ✅
5. **Copy those messages** and share them

That's it! The debug messages will tell us exactly what's happening.

