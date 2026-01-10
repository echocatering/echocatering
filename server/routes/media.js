const express = require('express');
const { cloudinary } = require('../utils/cloudinary');

const router = express.Router();

// Cloudinary folder conventions (source of truth for media)
const FOLDERS = {
  gallery: 'echo-catering/gallery',
  logo: 'echo-catering/logo',
};

// Small in-memory cache to avoid hammering Cloudinary on every page load.
// (Cloudinary Admin APIs are rate-limited; this keeps the site snappy.)
const cache = new Map();
const CACHE_TTL_MS = 15 * 1000; // 15s

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function listCloudinaryByPrefix({ prefix, resourceType = 'image', max = 500 }) {
  const results = [];
  let nextCursor = undefined;

  // Cloudinary API expects prefix like "folder/subfolder"
  const normalizedPrefix = String(prefix || '').replace(/\/+$/, '');

  while (results.length < max) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await cloudinary.api.resources({
      type: 'upload',
      prefix: normalizedPrefix,
      resource_type: resourceType,
      max_results: Math.min(500, max - results.length),
      next_cursor: nextCursor,
    });

    const batch = Array.isArray(resp?.resources) ? resp.resources : [];
    results.push(...batch);

    nextCursor = resp?.next_cursor;
    if (!nextCursor) break;
  }

  return results;
}

// GET /api/media/gallery
// Source of truth: list current Cloudinary resources in the gallery folder.
router.get('/gallery', async (req, res) => {
  try {
    const cacheKey = 'gallery';
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const folder = FOLDERS.gallery;

    // List images and videos (galleryUpload allows both)
    const [images, videos] = await Promise.all([
      listCloudinaryByPrefix({ prefix: folder, resourceType: 'image', max: 500 }),
      listCloudinaryByPrefix({ prefix: folder, resourceType: 'video', max: 500 }),
    ]);

    const merged = [...images, ...videos]
      .filter((r) => r?.secure_url)
      .map((r) => ({
        publicId: r.public_id,
        url: r.secure_url,
        resourceType: r.resource_type,
        format: r.format,
        bytes: r.bytes,
        width: r.width,
        height: r.height,
        duration: r.duration,
        createdAt: r.created_at,
      }))
      // Newest first feels most intuitive for “what’s in Cloudinary right now”
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    cacheSet(cacheKey, merged);
    return res.json(merged);
  } catch (error) {
    console.error('Get Cloudinary gallery error:', error);
    return res.status(502).json({
      message: 'Cloudinary gallery listing failed',
      // Keep this small/safe; helps diagnose misconfigured credentials in production.
      error: {
        name: error?.name,
        message: error?.message,
        http_code: error?.http_code || error?.statusCode,
      },
    });
  }
});

// GET /api/media/logo
// Source of truth: newest logo in Cloudinary logo folder.
router.get('/logo', async (req, res) => {
  try {
    const cacheKey = 'logo';
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const folder = FOLDERS.logo;
    const resources = await listCloudinaryByPrefix({ prefix: folder, resourceType: 'image', max: 50 });

    const newest = resources
      .filter((r) => r?.secure_url)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

    const payload = {
      // Keep compatibility with existing frontend code that expects `content`
      content: newest?.secure_url || '',
      publicId: newest?.public_id || '',
      title: 'ECHO Catering Logo',
      altText: 'ECHO Catering Logo',
      createdAt: newest?.created_at || null,
    };

    cacheSet(cacheKey, payload);
    return res.json(payload);
  } catch (error) {
    console.error('Get Cloudinary logo error:', error);
    return res.status(502).json({
      message: 'Cloudinary logo lookup failed',
      error: {
        name: error?.name,
        message: error?.message,
        http_code: error?.http_code || error?.statusCode,
      },
    });
  }
});

// GET /api/media/ping
// Diagnostic: verify Cloudinary Admin API connectivity from the server.
router.get('/ping', async (req, res) => {
  try {
    const cfg = cloudinary.config() || {};
    const result = await cloudinary.api.ping();
    return res.json({
      ok: true,
      cloudinary: {
        cloudName: cfg.cloud_name || null,
        hasApiKey: !!cfg.api_key,
        hasApiSecret: !!cfg.api_secret,
      },
      result,
    });
  } catch (error) {
    console.error('Cloudinary ping error:', error);
    return res.status(502).json({
      ok: false,
      message: 'Cloudinary ping failed',
      cloudinary: {
        cloudName: cloudinary.config()?.cloud_name || null,
        hasApiKey: !!cloudinary.config()?.api_key,
        hasApiSecret: !!cloudinary.config()?.api_secret,
      },
      error: {
        type: typeof error,
        toString: String(error),
        keys: error && typeof error === 'object' ? Object.keys(error) : [],
        // Cloudinary often nests useful details under `error.error`
        nestedKeys: error?.error && typeof error.error === 'object' ? Object.keys(error.error) : [],
        message: error?.message || error?.error?.message,
        name: error?.name || error?.error?.name,
        http_code: error?.http_code || error?.statusCode || error?.error?.http_code,
      },
    });
  }
});

module.exports = router;


