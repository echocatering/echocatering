const fs = require('fs');
const path = require('path');

const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
const videoDir = path.join(uploadsRoot, 'items');
const mapDir = path.join(uploadsRoot, 'maps');

function ensureUploadDirs() {
  [uploadsRoot, videoDir, mapDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function getItemDir(itemId) {
  if (!itemId) return videoDir;
  return path.join(videoDir, itemId);
}

function ensureItemDir(itemId) {
  ensureUploadDirs();
  const dir = getItemDir(itemId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function resolveUploadPath(type, filename) {
  if (!filename) return null;
  const safeName = filename.replace(/(\.\.(\/|\\|$))+/g, '');
  if (type === 'video') {
    return path.join(videoDir, safeName);
  }
  if (type === 'map') {
    return path.join(mapDir, safeName);
  }
  return path.join(uploadsRoot, safeName);
}

function deleteUpload(type, filename) {
  const fullPath = resolveUploadPath(type, filename);
  if (!fullPath) return;
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn(`⚠️  Failed to delete ${type} file ${filename}:`, err.message);
  }
}

async function removeItemDir(itemId) {
  if (!itemId) return;
  const dir = getItemDir(itemId);
  try {
    // Log before removal attempt for diagnostics
    console.log(`🧹 Attempting to remove item dir ${dir}`);
    await fs.promises.rm(dir, { recursive: true, force: true });
    console.log(`🧹 Successfully removed item dir ${dir}`);
    return true;
  } catch (err) {
    console.warn(`⚠️  Failed to remove item dir ${dir}:`, err.message);
    return false;
  }
}

function getPreviewDir(itemId) {
  if (!itemId) return null;
  return path.join(videoDir, `${itemId}_preview`);
}

async function ensurePreviewDir(itemId) {
  const dir = getPreviewDir(itemId);
  if (!dir) return null;
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  return dir;
}

async function removePreviewDir(itemId) {
  const dir = getPreviewDir(itemId);
  if (!dir) return;
  try {
    if (fs.existsSync(dir)) {
      await fs.promises.rm(dir, { recursive: true, force: true });
      console.log(`🧹 Removed preview dir ${dir}`);
    }
  } catch (err) {
    console.warn(`⚠️  Failed to remove preview dir ${dir}:`, err.message);
  }
}

async function cleanupOldPreviews(itemId, maxPreviews = 8) {
  const dir = getPreviewDir(itemId);
  if (!dir || !fs.existsSync(dir)) return;
  
  try {
    const files = await fs.promises.readdir(dir);
    const previewFiles = files
      .filter(f => f.endsWith('.mp4'))
      .map(f => ({
        name: f,
        path: path.join(dir, f),
        time: fs.statSync(path.join(dir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // Newest first
    
    // Remove oldest if over limit
    if (previewFiles.length >= maxPreviews) {
      const toRemove = previewFiles.slice(maxPreviews);
      for (const file of toRemove) {
        await fs.promises.unlink(file.path);
        console.log(`🗑️  Removed old preview: ${file.name}`);
      }
    }
  } catch (err) {
    console.warn(`⚠️  Failed to cleanup old previews:`, err.message);
  }
}

module.exports = {
  ensureUploadDirs,
  resolveUploadPath,
  deleteUpload,
  videoDir,
  mapDir,
  getItemDir,
  ensureItemDir,
  removeItemDir,
  getPreviewDir,
  ensurePreviewDir,
  removePreviewDir,
  cleanupOldPreviews
};

