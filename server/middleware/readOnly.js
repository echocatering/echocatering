/**
 * Read-only mode middleware
 *
 * When READ_ONLY_MODE is enabled, block all mutating HTTP methods to prevent
 * uploads/deletes/edits against production data while developing layout locally.
 *
 * Allows: GET, HEAD, OPTIONS
 * Blocks: POST, PUT, PATCH, DELETE
 */
function isReadOnlyEnabled() {
  const v = String(process.env.READ_ONLY_MODE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function readOnlyMiddleware(req, res, next) {
  if (!isReadOnlyEnabled()) return next();

  const method = String(req.method || '').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  return res.status(403).json({
    message: 'Read-only mode enabled: mutating requests are disabled on this server.',
    method,
    path: req.originalUrl,
  });
}

module.exports = { readOnlyMiddleware, isReadOnlyEnabled };


