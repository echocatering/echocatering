# Render Deployment Guide - Echo Catering

**Status:** Ready for Deployment  
**Last Updated:** January 2025

---

## 🎯 Quick Start

Your app is fully integrated with Cloudinary and ready to deploy. Follow these steps:

---

## ✅ Pre-Deployment Checklist

- ✅ All assets integrated with Cloudinary
- ✅ Server configured to serve React build in production
- ✅ `render.yaml` configured
- ✅ Environment variables documented

---

## 🚀 Step-by-Step Deployment

### Step 1: Push Code to GitHub

```bash
# Verify all changes are committed
git status

# Push to GitHub
git push origin main
```

### Step 2: Create Render Web Service

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click "New"** → **"Web Service"**
3. **Connect Repository**:
   - Connect your GitHub account if not already connected
   - Select repository: `echo-catering` (or your repo name)
4. **Configure Service**:
   - **Name**: `echo-catering` (or your preferred name)
   - **Environment**: `Node`
   - **Region**: Choose closest to your users (e.g., `Oregon (US West)`)
   - **Branch**: `main`
   - **Root Directory**: Leave empty
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node server/index.js`
   - **Plan**: Free (or paid for better performance)

### Step 3: Set Environment Variables

**⚠️ CRITICAL:** Add these in Render dashboard → Your Service → **Environment** tab:

#### Required Variables:

```
NODE_ENV=production
PORT=5002
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/echo-catering?retryWrites=true&w=majority
JWT_SECRET=your-strong-random-secret-key-here
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

#### Optional Variables:

```
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

**Where to find Cloudinary credentials:**
1. Go to https://cloudinary.com/console
2. Dashboard shows: **Cloud Name**, **API Key**, **API Secret**
3. Copy these values exactly

**Where to find MongoDB URI:**
1. Go to MongoDB Atlas → Your Cluster → "Connect"
2. Choose "Connect your application"
3. Copy the connection string
4. Replace `<password>` with your database user password

### Step 4: Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Run `npm install`
   - Run `npm run build` (creates React production build)
   - Start server with `node server/index.js`
3. **Monitor build logs** - First deployment takes 5-10 minutes

### Step 5: Verify Deployment

After deployment completes (green "Live" status):

1. **Check Health Endpoint**:
   ```
   https://your-service-name.onrender.com/api/health
   ```
   Should return: `{"status":"OK","timestamp":"..."}`

2. **Check Homepage**:
   ```
   https://your-service-name.onrender.com
   ```
   Should load your React app

3. **Test Cloudinary Assets**:
   - Visit menu gallery - videos should load from Cloudinary
   - Check admin panel - logo should display from Cloudinary
   - Verify all images/videos are loading correctly

---

## 🔧 Configuration Details

### Build Process

1. **`npm install`**: Installs all dependencies
2. **`npm run build`**: 
   - Builds React app with `craco build`
   - Creates optimized `build/` folder
   - Minifies CSS, JS, and assets
3. **`node server/index.js`**: 
   - Starts Express server
   - Serves React build in production
   - Handles API routes and static files

### Server Configuration

The server automatically:
- ✅ Serves React build files (`/build/`)
- ✅ Handles client-side routing (returns `index.html` for non-API routes)
- ✅ Serves static assets (`/assets/`, `/uploads/` for legacy files)
- ✅ Handles API routes (`/api/*`)
- ✅ Connects to MongoDB Atlas
- ✅ Allows Render domain in CORS automatically
- ✅ Includes security middleware (helmet, CORS, rate limiting)

### Cloudinary Integration

**All assets are now served from Cloudinary:**
- ✅ Videos: `echo-catering/videos/{itemNumber}_full` and `{itemNumber}_icon`
- ✅ Images: `echo-catering/gallery/{number}_gallery`
- ✅ Logo: `echo-catering/logo/logo`
- ✅ Maps: `echo-catering/maps/{itemNumber}_map`
- ✅ About images: `echo-catering/about/{sectionNumber}_about`

**No local file storage needed** - everything is in Cloudinary!

---

## 🐛 Troubleshooting

### Build Fails

**Error: "Module not found"**
- Check `package.json` has all dependencies
- Verify `npm install` completes successfully in logs

**Error: "Build script failed"**
- Check React build errors in logs
- Verify all imports are correct
- Check for syntax errors

### Deployment Fails

**Error: "Cannot find module 'server/index.js'"**
- Verify `startCommand` is: `node server/index.js`
- Check file structure is correct

**Error: "Port already in use"**
- Render assigns PORT automatically via `process.env.PORT`
- Don't hardcode port (already handled in code)

### Site Loads but Shows 404

**Issue: React routes return 404**
- ✅ Fixed: Server serves `index.html` for non-API routes
- Verify `build/` folder exists after build
- Check server logs for routing errors

### Database Connection Fails

**Error: "MongoDB connection error"**
- Verify `MONGODB_URI` is set correctly in Render
- Check MongoDB Atlas → Network Access allows `0.0.0.0/0` (all IPs)
- Test connection string locally first
- Verify username/password are correct

### Cloudinary Assets Not Loading

**Issue: Images/videos return 404 or don't display**
- Verify all 3 Cloudinary env vars are set:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
- Check Cloudinary dashboard - assets should be visible
- Verify asset URLs in database match Cloudinary URLs
- Check browser console for CORS errors

### CORS Errors

**Error: "CORS policy blocked"**
- Server automatically allows Render domain (`RENDER_EXTERNAL_URL`)
- If using custom domain, add to `ALLOWED_ORIGINS` env var
- Format: `https://yourdomain.com,https://www.yourdomain.com`

---

## 📊 Post-Deployment Checklist

### 1. Test Everything

- [ ] Homepage loads correctly
- [ ] Navigation works
- [ ] Menu gallery displays items with Cloudinary videos
- [ ] About page loads with Cloudinary images
- [ ] Contact form works
- [ ] Admin panel accessible at `/admin`
- [ ] Admin login works
- [ ] File uploads work (logo, gallery, videos)
- [ ] Uploaded files appear in Cloudinary
- [ ] Videos process and upload to Cloudinary

### 2. Monitor Logs

- Check Render logs for errors
- Monitor MongoDB Atlas for connection issues
- Watch for rate limiting (100 requests/15min on free tier)
- Check Cloudinary dashboard for upload activity

### 3. Performance

- **Free tier**: Spins down after 15 minutes of inactivity
- **First request** after spin-down may take 30-60 seconds
- **Consider paid tier** for production use
- **Cloudinary CDN** handles asset delivery (fast worldwide)

---

## 🔐 Security Notes

1. **Environment Variables**: Never commit `.env` to git ✅
2. **MongoDB Password**: Store securely in Render dashboard ✅
3. **JWT Secret**: Use strong random string (32+ characters) ✅
4. **Cloudinary Secrets**: Keep API secret secure ✅
5. **CORS**: Server allows Render domain automatically ✅
6. **Rate Limiting**: Enabled in production (100 requests/15min) ✅

---

## 📚 Related Files

- `render.yaml` - Render service configuration
- `server/index.js` - Express server (serves React build)
- `package.json` - Dependencies and build scripts
- `docs/active/DEPLOYMENT_GUIDE.md` - Detailed deployment guide
- `docs/active/MONGODB_ATLAS_SETUP.md` - MongoDB setup

---

## 🎯 Next Steps After Deployment

1. **Test thoroughly** on live site
2. **Set up custom domain** (optional, in Render dashboard)
3. **Configure SSL** (automatic on Render)
4. **Monitor performance** and optimize as needed
5. **Set up monitoring/alerts** (optional)

---

## 💡 Tips

- **Free tier limitations**: 
  - Spins down after 15 min inactivity
  - 750 hours/month free
  - Consider paid tier for production

- **Cloudinary free tier**:
  - 25 GB storage
  - 25 GB bandwidth/month
  - Should be sufficient for most use cases

- **MongoDB Atlas free tier**:
  - 512 MB storage
  - Shared cluster
  - Perfect for development/small production

---

**Ready to deploy?** Follow the steps above and your site will be live on Render! 🚀


