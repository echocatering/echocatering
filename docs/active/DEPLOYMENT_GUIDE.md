# Deployment Guide - Echo Catering

**Last Updated:** January 2025  
**Status:** Ready for Deployment

---

## 🎯 Overview

This guide walks you through deploying the Echo Catering application to Render.

---

## ✅ Pre-Deployment Checklist

### 1. Code is Ready
- ✅ All cleanup and organization complete
- ✅ Video processing cleanup improvements committed
- ✅ Server configured to serve React build in production
- ✅ `render.yaml` created with correct build command

### 2. Local Testing
Before deploying, test locally:
```bash
# Build the React app
npm run build

# Test production server
NODE_ENV=production node server/index.js

# Visit http://localhost:5002
# Verify:
# - Homepage loads
# - API endpoints work (/api/health)
# - Static assets load (/assets/images/...)
```

---

## 🚀 Render Deployment Steps

### Step 1: Push Code to GitHub

```bash
# Make sure all changes are committed
git status

# Push to GitHub (if not already pushed)
git push origin main
```

### Step 2: Create Render Web Service

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click "New"** → **"Web Service"**
3. **Connect Repository**:
   - Select your GitHub repository: `echocatering/echocatering`
   - Or paste: `https://github.com/echocatering/echocatering`
4. **Configure Service**:
   - **Name**: `echo-catering` (or your preferred name)
   - **Environment**: `Node`
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Root Directory**: Leave empty (root is fine)
   - **Build Command**: `npm install && npm run build` (or Render will use `render.yaml`)
   - **Start Command**: `node server/index.js`
   - **Plan**: Free (or paid if needed)

### Step 3: Set Environment Variables

In Render dashboard, go to your service → **Environment** tab, add:

#### Required Variables:
```
NODE_ENV=production
PORT=5002
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/echo-catering?retryWrites=true&w=majority
JWT_SECRET=your-secret-key-change-this-to-random-string
```

#### Optional (if using Cloudinary):
```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

**⚠️ Important:**
- Replace `MONGODB_URI` with your actual MongoDB Atlas connection string
- Generate a strong random string for `JWT_SECRET`
- Never commit these values to git

### Step 4: Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Run `npm install`
   - Run `npm run build` (creates `build/` folder)
   - Start the server with `node server/index.js`
3. Monitor the build logs for any errors

### Step 5: Verify Deployment

After deployment completes:

1. **Check Health Endpoint**:
   ```
   https://your-service-name.onrender.com/api/health
   ```
   Should return: `{"status":"OK","timestamp":"..."}`

2. **Check Homepage**:
   ```
   https://your-service-name.onrender.com
   ```
   Should load the React app

3. **Test API**:
   ```
   https://your-service-name.onrender.com/api/menu-items
   ```
   Should return menu items (if database is connected)

---

## 🔧 Configuration Details

### Build Process

1. **`npm install`**: Installs all dependencies
2. **`npm run build`**: 
   - Builds React app
   - Creates `build/` folder with optimized production files
   - Minifies CSS, JS, and assets
3. **`node server/index.js`**: 
   - Starts Express server
   - Serves React build in production mode
   - Handles API routes and static files

### Server Configuration

The server (`server/index.js`) now:
- ✅ Serves React build files in production (`/build/`)
- ✅ Handles client-side routing (returns `index.html` for non-API routes)
- ✅ Serves static assets (`/assets/`, `/uploads/`, etc.)
- ✅ Handles API routes (`/api/*`)
- ✅ Connects to MongoDB Atlas
- ✅ Includes security middleware (helmet, CORS, rate limiting)

---

## 🐛 Troubleshooting

### Build Fails

**Error: CSS Minimizer Error**
- ✅ Fixed: Removed problematic `@import` and `data:image` URIs
- If it happens again, check `src/admin/App.css` and `src/index.css`

**Error: Module not found**
- Check `package.json` has all dependencies
- Run `npm install` locally to verify

### Deployment Fails

**Error: "Cannot find module"**
- Check `startCommand` is correct: `node server/index.js`
- Verify `server/index.js` exists

**Error: "Port already in use"**
- Render assigns PORT automatically
- Don't hardcode port in code (use `process.env.PORT`)

### Site Loads but Shows 404

**Issue: React routes return 404**
- ✅ Fixed: Server now serves `index.html` for non-API routes
- Verify `build/` folder exists after build
- Check server logs for errors

### Database Connection Fails

**Error: "MongoDB connection error"**
- Verify `MONGODB_URI` is set correctly in Render
- Check MongoDB Atlas Network Access allows Render's IP
- Test connection string locally first

### Static Files Not Loading

**Issue: Images/videos return 404**
- Check static file routes in `server/index.js`
- Verify file paths match (e.g., `/assets/images/...`)
- Check CORS headers if loading from different domain

---

## 📊 Post-Deployment

### 1. Test Everything

- [ ] Homepage loads
- [ ] Navigation works
- [ ] Menu gallery displays items
- [ ] About page loads
- [ ] Contact form works
- [ ] Admin panel accessible
- [ ] File uploads work (if using Cloudinary)

### 2. Monitor Logs

- Check Render logs for errors
- Monitor MongoDB Atlas for connection issues
- Watch for rate limiting (if traffic is high)

### 3. Performance

- Free tier spins down after inactivity (15 min)
- First request after spin-down may be slow
- Consider paid tier for production

---

## 🔐 Security Notes

1. **Environment Variables**: Never commit `.env` to git
2. **MongoDB Password**: Store securely in Render dashboard
3. **JWT Secret**: Use strong random string
4. **CORS**: Currently allows all origins in dev, restrict in production
5. **Rate Limiting**: Enabled in production (100 requests/15min)

---

## 📚 Related Documentation

- `docs/active/DEPLOYMENT_STATUS.md` - Current deployment status
- `docs/active/MONGODB_ATLAS_SETUP.md` - MongoDB setup guide
- `docs/active/PUBLIC_FOLDER_RESTRUCTURE.md` - Asset organization

---

## 🎯 Next Steps After Deployment

1. **Test thoroughly** on live site
2. **Migrate files to Cloudinary** (if using)
3. **Set up custom domain** (optional)
4. **Configure SSL** (automatic on Render)
5. **Monitor and optimize** performance

---

**Questions?** Check the logs, review the code, or consult the other documentation files.

