# MongoDB Atlas + Render Setup Guide

## Step 1: Set Up MongoDB Atlas

1. **Create Account**
   - Go to https://www.mongodb.com/cloud/atlas
   - Sign up for a free account

2. **Create a Cluster**
   - Click "Build a Database"
   - Choose "FREE" (M0) tier
   - Select a cloud provider and region (choose closest to you)
   - Click "Create"

3. **Create Database User**
   - Go to "Database Access" in left sidebar
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Username: `echocatering` (or your choice)
   - Password: Generate a secure password (save it!)
   - Database User Privileges: "Atlas admin" or "Read and write to any database"
   - Click "Add User"

4. **Whitelist Your IP**
   - Go to "Network Access" in left sidebar
   - Click "Add IP Address"
   - For development: Click "Add Current IP Address"
   - For Render: Click "Allow Access from Anywhere" (0.0.0.0/0) - **Only for production**
   - Click "Confirm"

5. **Get Connection String**
   - Go to "Database" → Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string
   - It looks like: `mongodb+srv://username:password@cluster.mongodb.net/echo-catering?retryWrites=true&w=majority`
   - Replace `<password>` with your database user password
   - Replace `echo-catering` with your database name (or keep it)

## Step 2: Local Development Setup

1. **Create `.env` file** in the root directory:
   ```bash
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/echo-catering?retryWrites=true&w=majority
   PORT=5002
   JWT_SECRET=your-secret-key-change-this
   NODE_ENV=development
   ```

2. **Test Connection**:
   ```bash
   npm run setup
   ```

## Step 3: Deploy to Render

1. **Push Code to GitHub** (already done!)

2. **Create Render Account**
   - Go to https://render.com
   - Sign up with GitHub

3. **Create Web Service**
   - Click "New" → "Web Service"
   - Connect your GitHub repository: `echocatering/echocatering`
   - Settings:
     - **Name**: `echo-catering-api`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `node server/index.js`
     - **Plan**: Free (or paid if needed)

4. **Add Environment Variables in Render**
   - Go to your service → "Environment"
   - Add:
     - `MONGODB_URI`: Your MongoDB Atlas connection string
     - `PORT`: `5002` (or let Render assign it)
     - `JWT_SECRET`: A random secret string
     - `NODE_ENV`: `production`
     - `ALLOWED_ORIGINS`: Your frontend URL (if deploying frontend separately)

5. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy your app
   - Your API will be available at: `https://your-service-name.onrender.com`

## Step 4: Update MongoDB Atlas Network Access

After Render deploys, you'll get an IP address. Add it to MongoDB Atlas:
- Go to MongoDB Atlas → Network Access
- Add Render's IP (or use 0.0.0.0/0 for simplicity in development)

## Important Notes

- **Never commit `.env` file** - it's in `.gitignore`
- **Uploads folder is excluded** - use cloud storage (S3, Cloudinary) for production
- **Free tiers have limits** - MongoDB Atlas free: 512MB, Render free: spins down after inactivity

## Troubleshooting

- **Connection timeout**: Check Network Access in MongoDB Atlas
- **Authentication failed**: Verify username/password in connection string
- **Render build fails**: Check build logs, ensure all dependencies are in `package.json`

