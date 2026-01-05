#!/usr/bin/env node

/**
 * Cleanup Script: Delete Test and Temporary Files
 * 
 * This script safely deletes:
 * - server/uploads/test/ (test videos and frame files)
 * - server/uploads/items/temp_files/ (temporary processing files)
 * - server/uploads/gallery/thumbnails/ (local thumbnails - Cloudinary generates these)
 * 
 * WARNING: This will permanently delete files. Make sure you don't need them!
 */

const fs = require('fs');
const path = require('path');

const directoriesToDelete = [
  path.join(__dirname, '../../server/uploads/test'),
  path.join(__dirname, '../../server/uploads/items/temp_files'),
  path.join(__dirname, '../../server/uploads/gallery/thumbnails'),
];

const calculateSize = (dirPath) => {
  let totalSize = 0;
  let fileCount = 0;
  
  if (!fs.existsSync(dirPath)) {
    return { size: 0, count: 0 };
  }
  
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      const subDir = calculateSize(filePath);
      totalSize += subDir.size;
      fileCount += subDir.count;
    } else {
      totalSize += stats.size;
      fileCount++;
    }
  }
  
  return { size: totalSize, count: fileCount };
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const deleteDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    console.log(`   ⏭️  Directory doesn't exist: ${dirPath}`);
    return { deleted: false, size: 0, count: 0 };
  }
  
  const { size, count } = calculateSize(dirPath);
  
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`   ✅ Deleted: ${formatBytes(size)} (${count} files)`);
    return { deleted: true, size, count };
  } catch (error) {
    console.error(`   ❌ Error deleting ${dirPath}:`, error.message);
    return { deleted: false, size, count };
  }
};

const main = () => {
  console.log('🧹 Cleanup Script: Delete Test and Temporary Files\n');
  console.log('='.repeat(60));
  console.log('⚠️  WARNING: This will permanently delete files!');
  console.log('='.repeat(60));
  console.log('\nDirectories to delete:');
  
  let totalSize = 0;
  let totalFiles = 0;
  
  directoriesToDelete.forEach((dir, index) => {
    const relativePath = path.relative(process.cwd(), dir);
    const { size, count } = calculateSize(dir);
    totalSize += size;
    totalFiles += count;
    
    console.log(`\n${index + 1}. ${relativePath}`);
    console.log(`   Size: ${formatBytes(size)}`);
    console.log(`   Files: ${count}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Total to delete: ${formatBytes(totalSize)} (${totalFiles} files)`);
  console.log('='.repeat(60));
  
  // Check if running with --yes flag
  const args = process.argv.slice(2);
  const confirmed = args.includes('--yes') || args.includes('-y');
  
  if (!confirmed) {
    console.log('\n⚠️  To proceed, run with --yes flag:');
    console.log('   node scripts/active/cleanup/cleanup-test-files.js --yes\n');
    process.exit(0);
  }
  
  console.log('\n🚀 Starting cleanup...\n');
  
  let deletedSize = 0;
  let deletedFiles = 0;
  let failedCount = 0;
  
  directoriesToDelete.forEach((dir, index) => {
    const relativePath = path.relative(process.cwd(), dir);
    console.log(`[${index + 1}/${directoriesToDelete.length}] ${relativePath}`);
    
    const result = deleteDirectory(dir);
    if (result.deleted) {
      deletedSize += result.size;
      deletedFiles += result.count;
    } else {
      failedCount++;
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Cleanup Summary:');
  console.log(`   ✅ Deleted: ${formatBytes(deletedSize)} (${deletedFiles} files)`);
  if (failedCount > 0) {
    console.log(`   ❌ Failed: ${failedCount} directories`);
  }
  console.log('='.repeat(60));
  console.log('\n✨ Cleanup complete!\n');
};

main();

