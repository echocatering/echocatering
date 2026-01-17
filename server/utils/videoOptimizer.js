const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

/**
 * Optimize video file for web playback
 * Converts to H.264 codec, scales to 480px width, optimizes bitrate
 * 
 * @param {string} videoPath - Full path to the video file
 * @returns {Promise<{success: boolean, originalSize: number, optimizedSize: number, message: string}>}
 */
async function optimizeVideo(videoPath) {
  try {
    // Check if file exists
    if (!fs.existsSync(videoPath)) {
      return {
        success: false,
        message: `Video file not found: ${videoPath}`
      };
    }

    // Get original file size
    const originalStats = fs.statSync(videoPath);
    const originalSize = originalStats.size;

    // Check video codec and dimensions
    const probeCommand = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of json "${videoPath}"`;
    
    let needsOptimization = false;
    try {
      const { stdout } = await execAsync(probeCommand);
      const probeData = JSON.parse(stdout);
      const stream = probeData.streams?.[0];
      
      if (stream) {
        const codec = stream.codec_name?.toLowerCase();
        const width = parseInt(stream.width) || 0;
        
        // Check if optimization is needed
        // Optimize if: not h264, or width > 600px, or file size > 2MB
        if (codec !== 'h264' || width > 600 || originalSize > 2 * 1024 * 1024) {
          needsOptimization = true;
          console.log(`📹 Video needs optimization: codec=${codec}, width=${width}px, size=${(originalSize/1024/1024).toFixed(2)}MB`);
        } else {
          console.log(`✅ Video already optimized: codec=${codec}, width=${width}px, size=${(originalSize/1024/1024).toFixed(2)}MB`);
          return {
            success: true,
            originalSize,
            optimizedSize: originalSize,
            message: 'Video already optimized',
            skipped: true
          };
        }
      }
    } catch (probeError) {
      console.warn('⚠️  Could not probe video, will attempt optimization anyway:', probeError.message);
      needsOptimization = true; // Optimize if we can't check
    }

    if (!needsOptimization) {
      return {
        success: true,
        originalSize,
        optimizedSize: originalSize,
        message: 'Video already optimized',
        skipped: true
      };
    }

    // Create temporary optimized file
    const tempPath = videoPath + '.optimizing';
    const dir = path.dirname(videoPath);
    const ext = path.extname(videoPath);
    const baseName = path.basename(videoPath, ext);
    const tempOptimized = path.join(dir, `${baseName}_optimized${ext}`);

    // FFmpeg optimization command
    // -c:v libx264: Use H.264 codec
    // -preset medium: Balance between speed and compression
    // -crf 23: Quality setting (lower = better quality, 18-28 is good range)
    // -vf "scale=480:-2": Scale to 480px width, maintain aspect ratio
    // -c:a copy: Copy audio stream (no re-encoding)
    // -movflags +faststart: Move metadata to beginning for web streaming
    const optimizeCommand = `ffmpeg -i "${videoPath}" -c:v libx264 -preset medium -crf 23 -vf "scale=480:-2" -an -movflags +faststart -y "${tempOptimized}"`;

    console.log(`🔄 Optimizing video: ${path.basename(videoPath)}`);
    console.log(`   Command: ${optimizeCommand.replace(videoPath, 'INPUT').replace(tempOptimized, 'OUTPUT')}`);

    try {
      const { stdout, stderr } = await execAsync(optimizeCommand);
      
      // Check if optimized file was created
      if (!fs.existsSync(tempOptimized)) {
        throw new Error('Optimized file was not created');
      }

      // Get optimized file size
      const optimizedStats = fs.statSync(tempOptimized);
      const optimizedSize = optimizedStats.size;

      // Replace original with optimized version
      // Backup original first (optional - you might want to keep originals)
      const backupPath = videoPath + '.backup';
      fs.copyFileSync(videoPath, backupPath);
      
      // Replace original with optimized
      fs.renameSync(tempOptimized, videoPath);
      
      // Optionally delete backup after successful replacement
      // fs.unlinkSync(backupPath);

      const sizeReduction = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
      console.log(`✅ Video optimized successfully:`);
      console.log(`   Original: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Optimized: ${(optimizedSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Reduction: ${sizeReduction}%`);

      return {
        success: true,
        originalSize,
        optimizedSize,
        sizeReduction: parseFloat(sizeReduction),
        message: `Optimized: ${sizeReduction}% smaller`
      };
    } catch (ffmpegError) {
      // Clean up temp file if it exists
      if (fs.existsSync(tempOptimized)) {
        fs.unlinkSync(tempOptimized);
      }
      throw ffmpegError;
    }
  } catch (error) {
    console.error(`❌ Video optimization failed for ${path.basename(videoPath)}:`, error.message);
    return {
      success: false,
      originalSize: fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 0,
      optimizedSize: 0,
      message: `Optimization failed: ${error.message}`
    };
  }
}

module.exports = {
  optimizeVideo
};






