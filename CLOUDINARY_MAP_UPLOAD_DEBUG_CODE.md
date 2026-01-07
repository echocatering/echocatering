# Cloudinary Map Upload Debug Code

Complete standalone code for debugging the map upload feature.

## 1. Backend Route (server/routes/menuItems.js)

```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const Cocktail = require('../models/Cocktail');
const { authenticateToken, requireEditor } = require('../middleware/auth');
const { videoDir } = require('../utils/fileStorage');
const { cloudinary } = require('../utils/cloudinary');

const router = express.Router();

// Multer configuration for map uploads
const mapUpload = multer({
  dest: videoDir, // Saves to server/uploads/items/
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// @route   POST /api/menu-items/map/:itemNumber
// @desc    Save map snapshot PNG for an item
// @access  Private (Editor)
router.post('/map/:itemNumber',
  authenticateToken,
  requireEditor,
  mapUpload.single('map'),
  async (req, res) => {
    const itemNumber = Number(req.params.itemNumber);

    // ========== DEBUG: Log req.file ==========
    console.log('========== MAP UPLOAD DEBUG ==========');
    console.log('req.file:', JSON.stringify(req.file, null, 2));
    console.log('req.file details:', {
      fieldname: req.file?.fieldname,
      originalname: req.file?.originalname,
      encoding: req.file?.encoding,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
      destination: req.file?.destination,
      filename: req.file?.filename,
      path: req.file?.path,
      buffer: req.file?.buffer ? `Buffer(${req.file.buffer.length} bytes)` : 'no buffer'
    });
    console.log('req.body:', JSON.stringify(req.body, null, 2));
    console.log('req.headers:', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    });
    console.log('=======================================');

    if (!Number.isFinite(itemNumber)) {
      return res.status(400).json({ error: 'Invalid item number' });
    }

    if (!req.file) {
      console.error('❌ No file received in map upload');
      return res.status(400).json({ error: 'No map file uploaded' });
    }

    const tempFilePath = req.file.path;

    try {
      console.log(`📸 Received map upload for itemNumber: ${itemNumber}`);
      console.log(`   - filename: ${req.file.filename}`);
      console.log(`   - path: ${tempFilePath}`);
      console.log(`   - size: ${req.file.size} bytes`);
      console.log(`   - mimetype: ${req.file.mimetype}`);
      console.log(`   - originalname: ${req.file.originalname}`);

      // Verify file exists on disk
      try {
        const stats = await fs.stat(tempFilePath);
        console.log(`   ✅ File exists on disk: ${stats.size} bytes`);
      } catch (statErr) {
        console.error(`   ❌ File does not exist on disk: ${statErr.message}`);
        throw new Error(`Uploaded file not found on disk: ${tempFilePath}`);
      }

      // Find cocktail
      const cocktail = await Cocktail.findOne({ itemNumber: itemNumber });
      if (!cocktail) {
        await fs.unlink(tempFilePath); // cleanup
        return res.status(404).json({ error: 'Cocktail not found' });
      }

      // Upload to Cloudinary
      console.log(`   ☁️  Uploading map snapshot to Cloudinary...`);
      console.log(`   - Public ID: ${itemNumber}_map`);
      console.log(`   - Folder: echo-catering/maps`);
      
      const uploadResult = await cloudinary.uploader.upload(tempFilePath, {
        folder: 'echo-catering/maps',
        public_id: `${itemNumber}_map`,
        resource_type: 'image',
        overwrite: true,
      });

      console.log('   Cloudinary upload result:', {
        secure_url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        bytes: uploadResult.bytes
      });

      if (!uploadResult || !uploadResult.secure_url) {
        throw new Error('Cloudinary upload failed - no secure_url returned');
      }

      console.log(`   ✅ Uploaded to Cloudinary: ${uploadResult.secure_url}`);
      console.log(`   📌 Public ID: ${uploadResult.public_id}`);

      // Update cocktail
      cocktail.cloudinaryMapSnapshotUrl = uploadResult.secure_url;
      cocktail.cloudinaryMapSnapshotPublicId = uploadResult.public_id;
      cocktail.mapSnapshotFile = null; // clear local reference
      await cocktail.save();

      console.log(`   ✅ Database updated for itemNumber: ${itemNumber}`);

      // Delete temp file
      await fs.unlink(tempFilePath);
      console.log(`🗑️  Deleted temp file: ${tempFilePath}`);

      res.json({
        success: true,
        itemNumber: itemNumber,
        cloudinaryUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      });
    } catch (err) {
      console.error('❌ Error saving map snapshot:', err);
      console.error('   Error details:', err.message);
      console.error('   Stack:', err.stack);
      // Cleanup temp file if exists
      try { 
        await fs.unlink(tempFilePath); 
        console.log(`🗑️  Cleaned up temp file after error: ${tempFilePath}`);
      } catch (cleanupErr) {
        console.warn('⚠️  Failed to cleanup temp file:', cleanupErr);
      }
      res.status(500).json({ 
        error: 'Server error saving map snapshot',
        message: err.message 
      });
    }
  }
);

module.exports = router;
```

## 2. Cloudinary Configuration (server/utils/cloudinary.js)

```javascript
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify configuration on load
console.log('Cloudinary Configuration:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Missing',
  api_key: process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ Missing',
  api_secret: process.env.CLOUDINARY_API_SECRET ? '✅ Set' : '❌ Missing',
});

module.exports = {
  cloudinary,
};
```

## 3. Frontend saveMapSnapshot Function (src/admin/components/MenuManager.js)

```javascript
import { useAuth } from '../contexts/AuthContext';

// Inside MenuManager component:
const { apiCall } = useAuth();

// Save map as PNG directly to server (mandatory for all non-premix categories)
const saveMapSnapshot = async (itemNumber) => {
  if (!itemNumber || !Number.isFinite(itemNumber)) {
    console.warn('⚠️ Cannot save map snapshot: no itemNumber provided');
    return;
  }

  console.log('========== FRONTEND MAP SNAPSHOT DEBUG ==========');
  console.log('Starting map snapshot save for itemNumber:', itemNumber);

  // Use direct SVG ref - the actual SVG element (no searching)
  let svg = svgRef.current;
  let attempts = 0;
  const maxAttempts = 20;
  
  // Wait for SVG to be ready
  while (!svg && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    svg = svgRef.current;
    attempts++;
  }
  
  if (!svg) {
    throw new Error('Map SVG not ready. Please ensure the map is fully loaded.');
  }

  console.log('✅ SVG element found');

  // Ensure highlights are up to date before saving
  // selectedRegions comes from editingCocktail.regions - this is the current state
  refreshMapHighlights();
  
  // Wait a moment for DOM updates to apply
  await new Promise(resolve => setTimeout(resolve, 50));

  // Clone the SVG with all current styles
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  
  // Remove white background rectangles
  const rects = clone.querySelectorAll('rect');
  rects.forEach(rect => {
    const fill = rect.getAttribute('fill') || rect.style.fill || '';
    const fillLower = fill.toLowerCase();
    if (fillLower === '#ffffff' || fillLower === '#fff' || fillLower === 'white' || 
        fillLower === '#f5f5f5' || fillLower === '#fafafa' || fillLower === 'rgb(255, 255, 255)') {
      rect.remove();
    }
  });
  
  clone.style.backgroundColor = 'transparent';
  clone.style.background = 'transparent';
  
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', '0 0 2000 857');
  }
  clone.setAttribute('width', '1200');
  clone.setAttribute('height', '600');
  
  console.log('✅ SVG cloned and processed');

  // Serialize SVG
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  console.log('✅ SVG serialized, size:', svgBlob.size, 'bytes');

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        console.log('✅ Image loaded, dimensions:', img.width, 'x', img.height);
        resolve(img);
      };
      img.onerror = (err) => {
        console.error('❌ Image load error:', err);
        reject(err);
      };
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 600;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    console.log('✅ Canvas created and image drawn');

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          console.log('✅ PNG blob created, size:', result.size, 'bytes');
          console.log('   Blob type:', result.type);
          resolve(result);
        } else {
          console.error('❌ Failed to create PNG blob');
          reject(new Error('Failed to render map snapshot'));
        }
      }, 'image/png', 1.0);
    });

    // Send PNG directly to server
    const formData = new FormData();
    formData.append('map', blob, `${itemNumber}.png`);
    
    console.log('✅ FormData created');
    console.log('   FormData entries:');
    for (let [key, value] of formData.entries()) {
      console.log(`   - ${key}:`, value instanceof File ? 
        `File(${value.name}, ${value.size} bytes, ${value.type})` : 
        value);
    }
    
    console.log('📤 Sending to server:', `/menu-items/map/${itemNumber}`);
    console.log('   Method: POST');
    console.log('   Body type: FormData');
    
    const response = await apiCall(`/menu-items/map/${itemNumber}`, {
      method: 'POST',
      body: formData
    });
    
    console.log('📥 Server response:', response);
    
    if (!response || !response.success) {
      throw new Error(response?.message || response?.error || 'Server did not confirm map save');
    }
    
    console.log('✅ Map snapshot saved successfully!');
    console.log('   Cloudinary URL:', response.cloudinaryUrl);
    console.log('==========================================');
    
  } catch (error) {
    console.error('❌ Error saving map snapshot:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    throw error;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};
```

## 4. apiCall Helper Function (src/admin/contexts/AuthContext.js)

```javascript
// Inside AuthContext component
const apiCall = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Don't set Content-Type for FormData (let browser set it with boundary)
  const headers = {};
  
  // Prepare body - stringify JSON objects, keep FormData as-is
  let body = options.body;
  if (!(body instanceof FormData)) {
    // Stringify JSON objects/arrays
    if (typeof body === 'object' && body !== null) {
      body = JSON.stringify(body);
    }
    headers['Content-Type'] = 'application/json';
  }
  
  // Merge with any custom headers
  Object.assign(headers, options.headers);

  // Add authentication token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  console.log('🌐 Making API call to:', url);
  console.log('📋 Headers:', headers);
  console.log('📦 Body type:', body instanceof FormData ? 'FormData' : typeof body);
  if (body instanceof FormData) {
    console.log('   FormData entries:', Array.from(body.entries()).map(([k, v]) => 
      [k, v instanceof File ? `File(${v.name}, ${v.size} bytes)` : v]
    ));
  }

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body,
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Server error');
    }

    return data;
  } catch (error) {
    console.error('💥 API call error:', error);
    throw error;
  }
};
```

## 5. Required Imports and Dependencies

### Backend (package.json dependencies):
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "cloudinary": "^2.8.0",
    "mongoose": "^8.0.3",
    "dotenv": "^16.3.1"
  }
}
```

### Frontend (package.json dependencies):
```json
{
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  }
}
```

## 6. Environment Variables (.env)

```bash
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# MongoDB
MONGODB_URI=mongodb://localhost:27017/echo-catering

# Server
PORT=5002
NODE_ENV=development
```

## 7. Debug Checklist

When debugging, check:

1. **Frontend:**
   - ✅ SVG element exists (`svgRef.current` is not null)
   - ✅ Canvas blob is created successfully
   - ✅ FormData contains the blob with fieldname 'map'
   - ✅ apiCall includes Authorization header
   - ✅ Request reaches server (check Network tab)

2. **Backend:**
   - ✅ `req.file` exists and has all properties
   - ✅ File exists on disk at `req.file.path`
   - ✅ Cloudinary credentials are set in environment
   - ✅ Cocktail record exists for the itemNumber
   - ✅ Cloudinary upload returns `secure_url`

3. **Common Issues:**
   - FormData fieldname must be `'map'` (matches multer `single('map')`)
   - File size must be under 10MB
   - Cloudinary environment variables must be set
   - Authentication token must be valid
   - User must have editor permissions

## 8. Testing the Route Directly

You can test the route with curl:

```bash
# Get auth token first (from login)
TOKEN="your_jwt_token_here"

# Create a test PNG file
# (or use an existing PNG)

# Upload it
curl -X POST http://localhost:5002/api/menu-items/map/1 \
  -H "Authorization: Bearer $TOKEN" \
  -F "map=@test-map.png"
```

