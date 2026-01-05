# Cloudinary Setup Guide

## Step 1: Create Cloudinary Account

1. Go to: https://cloudinary.com/users/register/free
2. Sign up with:
   - Email
   - Google
   - GitHub
3. Complete the registration

## Step 2: Get Your API Credentials

After signing up, you'll be taken to the Dashboard. You'll see:

- **Cloud Name**: Your unique cloud identifier
- **API Key**: Your API key
- **API Secret**: Your API secret (click "Reveal" to see it)

**Important:** Copy these three values - you'll need them for your `.env` file.

## Step 3: Add Credentials to .env

Add these to your `.env` file:
```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## Step 4: Test Upload

After setup, test uploading an image through your admin panel to verify it's working.

## Free Tier Limits

- **Storage**: 25GB
- **Bandwidth**: 25GB/month
- **Transformations**: Unlimited
- **Video**: 25GB storage, 25GB bandwidth

Perfect for development and small to medium projects!

