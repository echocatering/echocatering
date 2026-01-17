const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const sharp = require('sharp');
const multer = require('multer');
const Cocktail = require('../models/Cocktail');
const { uploadToCloudinary } = require('../utils/cloudinary');

const router = express.Router();
const execAsync = promisify(exec);

// Progress tracking for frame-by-frame processing (global, for backward compatibility)
const processingStatus = {
  active: false,
  stage: null,
  progress: 0,
  total: 0,
  message: '',
  startTime: null,
  estimatedTimeRemaining: null
};

// Per-item processing status tracking (keyed by itemNumber)
const itemProcessingStatus = new Map(); // itemNumber -> { active, stage, progress, total, message, startTime, estimatedTimeRemaining, error }

// Helper to update both global and per-item status
const updateProcessingStatus = (itemNumber, updates) => {
  // Update global status
  Object.assign(processingStatus, updates);
  
  // Update per-item status if itemNumber provided
  if (itemNumber && Number.isFinite(itemNumber)) {
    const itemStatus = itemProcessingStatus.get(itemNumber);
    if (itemStatus) {
      Object.assign(itemStatus, updates);
      itemProcessingStatus.set(itemNumber, itemStatus);
    }
  }
};

// Configure multer for video uploads
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../server/uploads/processing/input');
    fs.promises.mkdir(uploadDir, { recursive: true }).then(() => {
      cb(null, uploadDir);
    }).catch(cb);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `input-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|mov|avi|webm|mkv/;
    if (allowedTypes.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  }
});

/**
 * Generate background video with radial edge extension and blur effects
 * POST /api/video-processing/generate-background
 */
router.post('/generate-background', async (req, res) => {
  try {
    const { videoPath } = req.body;
    
    if (!videoPath) {
      return res.status(400).json({ error: 'videoPath is required' });
    }

    // Handle both absolute paths (starting with /) and relative paths
    const cleanPath = videoPath.replace(/^\//, '');
    const inputPath = path.join(__dirname, '..', cleanPath);
    
    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    // Output path
    const outputDir = path.join(__dirname, '..', 'uploads', 'test');
    await fs.promises.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'backgroundtest.mp4');

    // Get video dimensions, duration, and frame rate - count frames explicitly
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,r_frame_rate -count_frames -show_entries stream=nb_read_frames -of json "${inputPath}"`;
    const { stdout } = await execAsync(probeCmd);
    const probeData = JSON.parse(stdout);
    const stream = probeData.streams?.[0];
    
    if (!stream) {
      return res.status(400).json({ error: 'Could not read video properties' });
    }
    
    // Parse frame rate (format is "30/1" or "29.97/1")
    let fps = 30; // Default fallback
    if (stream.r_frame_rate) {
      const [num, den] = stream.r_frame_rate.split('/').map(Number);
      if (den && den > 0) {
        fps = num / den;
      }
    }
    
    // Get actual frame count - use nb_read_frames (more accurate) or nb_frames
    let actualFrameCount = null;
    if (stream.nb_read_frames) {
      actualFrameCount = parseInt(stream.nb_read_frames);
    } else if (stream.nb_frames) {
      actualFrameCount = parseInt(stream.nb_frames);
    }
    
    const duration = parseFloat(stream.duration) || 0;
    
    console.log(`Video properties: ${fps.toFixed(3)} fps, ${duration.toFixed(3)}s duration, ${actualFrameCount || 'unknown'} frames`);

    // Fixed dimensions (matches browser structure)
    const outerSize = 1080; // Fixed 1080x1080 outer square
    const innerSize = 360;  // Fixed 360x360 inner square (centered)
    
    // Calculate inner container position (centered in 1080x1080)
    const centerX = outerSize / 2;
    const centerY = outerSize / 2;
    const innerLeft = Math.floor(centerX - innerSize / 2);  // 360
    const innerTop = Math.floor(centerY - innerSize / 2);   // 360
    const innerRight = innerLeft + innerSize;  // 720
    const innerBottom = innerTop + innerSize;  // 720
    
    // Extract frames to temporary directory
    const tempDir = path.join(outputDir, 'temp_frames');
    await fs.promises.mkdir(tempDir, { recursive: true });
    
    // Extract video frames at inner size (for edge sampling)
    const videoFramesDir = path.join(outputDir, 'video_frames');
    await fs.promises.mkdir(videoFramesDir, { recursive: true });
    
    console.log('Extracting frames frame-by-frame to ensure no drops...');
    
    // If we have frame count, extract frame-by-frame
    if (actualFrameCount && actualFrameCount > 0) {
      const frameInterval = 1 / fps; // Time between frames in seconds
      
      for (let frameNum = 0; frameNum < actualFrameCount; frameNum++) {
        const timestamp = frameNum * frameInterval;
        const frameFileName = `frame_${String(frameNum + 1).padStart(6, '0')}.png`;
        const framePath = path.join(videoFramesDir, frameFileName);
        
        // Extract single frame at exact timestamp
        // -ss: seek to timestamp
        // -frames:v 1: extract exactly 1 frame
        // -vsync 0: don't drop or duplicate
        const extractCmd = `ffmpeg -ss ${timestamp.toFixed(6)} -i "${inputPath}" -vf "scale=${innerSize}:${innerSize}:force_original_aspect_ratio=decrease" -frames:v 1 -vsync 0 -y "${framePath}"`;
        
        try {
          await execAsync(extractCmd);
          if ((frameNum + 1) % 100 === 0) {
            console.log(`Extracted ${frameNum + 1}/${actualFrameCount} frames...`);
          }
        } catch (error) {
          console.error(`Error extracting frame ${frameNum + 1} at timestamp ${timestamp}:`, error.message);
          // Continue with next frame
        }
      }
      
      console.log(`Frame-by-frame extraction complete: ${actualFrameCount} frames`);
    } else {
      // Fallback: extract all frames at once if we don't have frame count
      console.log('Frame count unknown, using batch extraction...');
      const videoExtractCmd = `ffmpeg -i "${inputPath}" -vf "scale=${innerSize}:${innerSize}:force_original_aspect_ratio=decrease" -vsync 0 -start_number 1 "${videoFramesDir}/frame_%06d.png"`;
      await execAsync(videoExtractCmd);
    }
    
    // Verify frame extraction - count actual extracted frames with proper numeric sorting
    const extractedFrames = (await fs.promises.readdir(videoFramesDir))
      .filter(f => f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });
    
    console.log(`Extracted ${extractedFrames.length} frames (expected: ${actualFrameCount || 'unknown'})`);
    
    if (actualFrameCount && extractedFrames.length !== actualFrameCount) {
      console.error(`CRITICAL: Frame count mismatch! Extracted ${extractedFrames.length} but video has ${actualFrameCount} frames`);
      console.error(`Missing ${actualFrameCount - extractedFrames.length} frames`);
    }
    
    // We don't need outer frames - we'll build the 1080x1080 structure from scratch
    
    // Process each frame (use video frames directory) - ensure proper sorting
    const frameFiles = (await fs.promises.readdir(videoFramesDir))
      .filter(f => f.endsWith('.png'))
      .sort((a, b) => {
        // Extract frame numbers for proper numeric sorting
        const numA = parseInt(a.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });
    
    console.log(`Processing ${frameFiles.length} frames (sorted correctly)...`);
    
    // Verify we have frames
    if (frameFiles.length === 0) {
      return res.status(500).json({ error: 'No frames extracted from video' });
    }
    
    // Verify frame sequence is continuous
    for (let i = 0; i < frameFiles.length; i++) {
      const expectedNum = i + 1;
      const frameNum = parseInt(frameFiles[i].match(/\d+/)?.[0] || '0');
      if (frameNum !== expectedNum) {
        console.warn(`Frame sequence gap detected: expected frame ${expectedNum}, got frame ${frameNum}`);
      }
    }
    
    const processedDir = path.join(outputDir, 'processed_frames');
    await fs.promises.mkdir(processedDir, { recursive: true });
    
    // Process frames in batches to avoid memory issues
    const batchSize = 10;
    for (let i = 0; i < frameFiles.length; i += batchSize) {
      const batch = frameFiles.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (frameFile) => {
        const videoFramePath = path.join(videoFramesDir, frameFile);
        const outputFramePath = path.join(processedDir, frameFile);
        
        // Load video frame at 360x360 (matches browser)
        let videoData;
        try {
          videoData = await sharp(videoFramePath)
            .ensureAlpha()
            .raw()
            .toBuffer();
        } catch (error) {
          console.error(`Error loading video frame ${frameFile}: ${error.message}`);
          return; // Skip this frame
        }
        
        if (!videoData || videoData.length === 0) {
          console.error(`Empty video data for frame ${frameFile}`);
          return; // Skip this frame
        }
        
        // Helper to get pixel from VIDEO (matches browser getVideoPixel)
        const getVideoPixel = (x, y) => {
          const clampedX = Math.max(0, Math.min(innerSize - 1, Math.floor(x)));
          const clampedY = Math.max(0, Math.min(innerSize - 1, Math.floor(y)));
          const idx = (clampedY * innerSize + clampedX) * 4;
          if (idx >= 0 && idx < videoData.length - 3) {
            return {
              r: videoData[idx],
              g: videoData[idx + 1],
              b: videoData[idx + 2],
              a: videoData[idx + 3]
            };
          }
          return { r: 0, g: 0, b: 0, a: 0 };
        };
        
        // Create 1080x1080 output image data (black background, build from scratch)
        const outputData = Buffer.alloc(outerSize * outerSize * 4);
        
        // Process each pixel in 1080x1080 canvas (matches browser logic exactly)
        for (let y = 0; y < outerSize; y++) {
          for (let x = 0; x < outerSize; x++) {
            const idx = (y * outerSize + x) * 4;
            
            // Inside video area (360x360) - skip (video will be drawn on top)
            if (x >= innerLeft && x < innerRight && y >= innerTop && y < innerBottom) {
              continue;
            }
            
            // Find nearest edge point (matches browser logic exactly)
            // Priority: check horizontal first (left/right), then vertical (top/bottom)
            let edgeX, edgeY;
            if (x < innerLeft) {
              // Left of video
              edgeX = innerLeft;
              edgeY = Math.max(innerTop, Math.min(innerBottom - 1, y));
            } else if (x >= innerRight) {
              // Right of video (x >= 720)
              edgeX = innerRight - 1;  // 719 (last pixel of video)
              edgeY = Math.max(innerTop, Math.min(innerBottom - 1, y));
            } else if (y < innerTop) {
              // Above video (x is in range, but y < 360)
              edgeX = Math.max(innerLeft, Math.min(innerRight - 1, x));
              edgeY = innerTop;
            } else if (y >= innerBottom) {
              // Below video (x is in range, but y >= 720)
              edgeX = Math.max(innerLeft, Math.min(innerRight - 1, x));
              edgeY = innerBottom - 1;  // 719 (last pixel of video)
            } else {
              // Should not reach here (inside video area already skipped)
              continue;
            }
            
            // Sample pixel from VIDEO edge (convert to video coordinates - matches browser)
            // innerLeft = 360, innerTop = 360, so edgeX=719 -> videoEdgeX=359 (last pixel of 360x360)
            const videoEdgeX = edgeX - innerLeft;
            const videoEdgeY = edgeY - innerTop;
            
            // Debug: verify coordinates are in valid range [0, innerSize-1]
            if (videoEdgeX < 0 || videoEdgeX >= innerSize || videoEdgeY < 0 || videoEdgeY >= innerSize) {
              console.warn(`Invalid video coordinates: x=${x}, y=${y}, edgeX=${edgeX}, edgeY=${edgeY}, videoEdgeX=${videoEdgeX}, videoEdgeY=${videoEdgeY}`);
            }
            const pixel = getVideoPixel(videoEdgeX, videoEdgeY);
            
            // Calculate distance and fade (matches browser exactly)
            const dx = x - edgeX;
            const dy = y - edgeY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxFadeDistance = outerSize * 0.5;
            const fadeFactor = Math.max(0.3, 1 - Math.min(distance / maxFadeDistance, 0.7));
            
            outputData[idx] = pixel.r;
            outputData[idx + 1] = pixel.g;
            outputData[idx + 2] = pixel.b;
            outputData[idx + 3] = Math.floor(pixel.a * fadeFactor);
          }
        }
        
        // Save processed frame (1080x1080 with outer radial projection)
        await sharp(outputData, {
          raw: {
            width: outerSize,
            height: outerSize,
            channels: 4
          }
        })
        .png()
        .toFile(outputFramePath);
      }));
      
      console.log(`Processed ${Math.min(i + batchSize, frameFiles.length)}/${frameFiles.length} frames`);
    }
    
    // Apply blur to background and create overlay with inward projection
    console.log('Applying blur and creating overlay...');
    
    // Keep original frames for overlay creation (don't delete tempDir yet)
    // First pass: blur the background (everything except inner area)
    const blurredDir = path.join(outputDir, 'blurred_frames');
    await fs.promises.mkdir(blurredDir, { recursive: true });
    
    // Process frames to add blur to background only
    for (let i = 0; i < frameFiles.length; i += batchSize) {
      const batch = frameFiles.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (frameFile) => {
        const framePath = path.join(processedDir, frameFile);
        const blurredFramePath = path.join(blurredDir, frameFile);
        
        // Load the processed frame
        const { data } = await sharp(framePath)
          .ensureAlpha()
          .raw()
          .toBuffer();
        
        // Create a mask for the inner area (to preserve it from blur)
        const mask = Buffer.alloc(outerSize * outerSize * 4);
        for (let y = 0; y < outerSize; y++) {
          for (let x = 0; x < outerSize; x++) {
            const idx = (y * outerSize + x) * 4;
            if (x >= innerLeft && x < innerRight && y >= innerTop && y < innerBottom) {
              // Inside video area - keep original (no blur)
              mask[idx] = 255;
              mask[idx + 1] = 255;
              mask[idx + 2] = 255;
              mask[idx + 3] = 255;
            } else {
              // Outside - will be blurred
              mask[idx] = 0;
              mask[idx + 1] = 0;
              mask[idx + 2] = 0;
              mask[idx + 3] = 0;
            }
          }
        }
        
        // Blur the entire frame (matches browser: blur everything, then draw sharp video on top)
        const tempBlurred = path.join(blurredDir, `temp_${frameFile}`);
        await sharp(framePath)
          .blur(20)
          .toFile(tempBlurred);
        
        // Composite: blurred background + sharp video center (matches browser exactly)
        // The video will be composited later in the final step, so just save the blurred background
        await sharp(tempBlurred)
          .toFile(blurredFramePath);
        
        // Cleanup temp
        await fs.promises.unlink(tempBlurred).catch(() => {});
      }));
      
      console.log(`Applied blur to ${Math.min(i + batchSize, frameFiles.length)}/${frameFiles.length} frames`);
    }
    
    // Now create inward projection overlay frames
    console.log('Creating inward projection overlay...');
    const overlayDir = path.join(outputDir, 'overlay_frames');
    await fs.promises.mkdir(overlayDir, { recursive: true });
    
    for (let i = 0; i < frameFiles.length; i += batchSize) {
      const batch = frameFiles.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (frameFile) => {
        const videoFramePath = path.join(videoFramesDir, frameFile);
        const overlayFramePath = path.join(overlayDir, frameFile);
        
        // Load video frame at inner size (matches browser - samples from video)
        let videoData;
        try {
          videoData = await sharp(videoFramePath)
            .ensureAlpha()
            .raw()
            .toBuffer();
        } catch (error) {
          console.error(`Error loading video frame ${frameFile}:`, error.message);
          return;
        }
        
        if (!videoData || videoData.length === 0) {
          console.error(`Empty video data for frame ${frameFile}`);
          return;
        }
        
        // Create overlay with inward projection (matches browser exactly)
        const overlayData = Buffer.alloc(innerSize * innerSize * 4);
        const videoCenterX = innerSize / 2;
        const videoCenterY = innerSize / 2;
        const maxDistance = Math.sqrt(videoCenterX * videoCenterX + videoCenterY * videoCenterY);
        
        const getVideoPixel = (x, y) => {
          const clampedX = Math.max(0, Math.min(innerSize - 1, Math.floor(x)));
          const clampedY = Math.max(0, Math.min(innerSize - 1, Math.floor(y)));
          const idx = (clampedY * innerSize + clampedX) * 4;
          if (idx >= 0 && idx < videoData.length - 3) {
            return {
              r: videoData[idx],
              g: videoData[idx + 1],
              b: videoData[idx + 2],
              a: videoData[idx + 3]
            };
          }
          return { r: 0, g: 0, b: 0, a: 0 };
        };
        
        for (let y = 0; y < innerSize; y++) {
          for (let x = 0; x < innerSize; x++) {
            const idx = (y * innerSize + x) * 4;
            
            const dx = x - videoCenterX;
            const dy = y - videoCenterY;
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
            
            // Find edge pixel based on angle
            let edgeX, edgeY;
            if (normalizedAngle >= Math.PI * 7/4 || normalizedAngle < Math.PI * 1/4) {
              edgeX = innerSize - 1;
              if (Math.abs(dx) > 0.001) {
                edgeY = Math.floor(videoCenterY + (dy / dx) * (edgeX - videoCenterX));
              } else {
                edgeY = Math.floor(videoCenterY);
              }
              edgeY = Math.max(0, Math.min(innerSize - 1, edgeY));
            } else if (normalizedAngle >= Math.PI * 1/4 && normalizedAngle < Math.PI * 3/4) {
              edgeY = innerSize - 1;
              if (Math.abs(dy) > 0.001) {
                edgeX = Math.floor(videoCenterX + (dx / dy) * (edgeY - videoCenterY));
              } else {
                edgeX = Math.floor(videoCenterX);
              }
              edgeX = Math.max(0, Math.min(innerSize - 1, edgeX));
            } else if (normalizedAngle >= Math.PI * 3/4 && normalizedAngle < Math.PI * 5/4) {
              edgeX = 0;
              if (Math.abs(dx) > 0.001) {
                edgeY = Math.floor(videoCenterY + (dy / dx) * (edgeX - videoCenterX));
              } else {
                edgeY = Math.floor(videoCenterY);
              }
              edgeY = Math.max(0, Math.min(innerSize - 1, edgeY));
            } else {
              edgeY = 0;
              if (Math.abs(dy) > 0.001) {
                edgeX = Math.floor(videoCenterX + (dx / dy) * (edgeY - videoCenterY));
              } else {
                edgeX = Math.floor(videoCenterX);
              }
              edgeX = Math.max(0, Math.min(innerSize - 1, edgeX));
            }
            
            const pixel = getVideoPixel(edgeX, edgeY);
            const normalizedDistance = distanceFromCenter / maxDistance;
            const fadeFactor = normalizedDistance < 0.1 ? normalizedDistance * 10 : 1;
            
            overlayData[idx] = pixel.r;
            overlayData[idx + 1] = pixel.g;
            overlayData[idx + 2] = pixel.b;
            overlayData[idx + 3] = Math.floor(pixel.a * fadeFactor);
          }
        }
        
        // Save overlay frame
        await sharp(overlayData, {
          raw: {
            width: innerSize,
            height: innerSize,
            channels: 4
          }
        })
        .blur(20) // Apply blur to overlay
        .png()
        .toFile(overlayFramePath);
      }));
      
      console.log(`Created overlay for ${Math.min(i + batchSize, frameFiles.length)}/${frameFiles.length} frames`);
    }
    
    // Composite all layers: blurred background + sharp video + blurred overlay
    console.log('Compositing final frames...');
    const finalDir = path.join(outputDir, 'final_frames');
    await fs.promises.mkdir(finalDir, { recursive: true });
    
    let processedCount = 0;
    for (const frameFile of frameFiles) {
      const blurredPath = path.join(blurredDir, frameFile);
      const overlayPath = path.join(overlayDir, frameFile);
      const videoFramePath = path.join(videoFramesDir, frameFile);
      const finalPath = path.join(finalDir, frameFile);
      
      // Verify all required files exist before compositing
      const filesExist = await Promise.all([
        fs.promises.access(blurredPath).then(() => true).catch(() => false),
        fs.promises.access(overlayPath).then(() => true).catch(() => false),
        fs.promises.access(videoFramePath).then(() => true).catch(() => false)
      ]);
      
      if (!filesExist.every(exists => exists)) {
        console.error(`Missing files for frame ${frameFile}, skipping`);
        continue;
      }
      
      // Composite: blurred background + sharp video (at inner size) + blurred overlay on top
      // This matches browser: blurred background, sharp video, blurred overlay
      try {
        await sharp(blurredPath)
          .composite([
            {
              input: videoFramePath,
              left: innerLeft,
              top: innerTop,
              blend: 'over'
            },
            {
              input: overlayPath,
              left: innerLeft,
              top: innerTop,
              blend: 'over'
            }
          ])
          .toFile(finalPath);
        processedCount++;
      } catch (error) {
        console.error(`Error compositing frame ${frameFile}:`, error.message);
        // Continue processing other frames
      }
    }
    
    console.log(`Composited ${processedCount}/${frameFiles.length} frames successfully`);
    
    // Verify we have the same number of final frames as input frames
    const finalFrameFiles = (await fs.promises.readdir(finalDir))
      .filter(f => f.endsWith('.png'))
      .sort();
    
    if (finalFrameFiles.length !== frameFiles.length) {
      console.warn(`Frame count mismatch: ${finalFrameFiles.length} final frames vs ${frameFiles.length} input frames`);
    }
    
    // Encode final video - use exact frame count and duration to calculate precise frame rate
    const finalFrameCount = frameFiles.length;
    const videoDuration = duration || parseFloat(stream.duration) || 0;
    
    // Calculate frame rate based on actual extracted frames and video duration
    // This ensures perfect frame-for-frame matching
    let encodeFps = fps;
    if (videoDuration > 0 && finalFrameCount > 0) {
      encodeFps = finalFrameCount / videoDuration;
    }
    
    console.log(`Encoding final video: ${finalFrameCount} frames, duration: ${videoDuration.toFixed(3)}s, calculated fps: ${encodeFps.toFixed(6)}`);
    
    // Use -r for input frame rate and -vsync 0 to preserve all frames exactly
    // -r sets the input frame rate (how fast to read frames)
    // -vsync 0 ensures no frames are dropped or duplicated
    const encodeCmd = `ffmpeg -y -r ${encodeFps.toFixed(6)} -i "${finalDir}/frame_%06d.png" -vsync 0 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart -r ${encodeFps.toFixed(6)} "${outputPath}"`;
    await execAsync(encodeCmd);
    
    // Verify output video frame count
    const verifyCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
    try {
      const { stdout: outputFrameCount } = await execAsync(verifyCmd);
      const outputFrames = parseInt(outputFrameCount.trim()) || 0;
      console.log(`Output video has ${outputFrames} frames (input had ${finalFrameCount})`);
      if (outputFrames !== finalFrameCount) {
        console.warn(`Frame count mismatch in output! Expected ${finalFrameCount}, got ${outputFrames}`);
      }
    } catch (e) {
      console.warn('Could not verify output frame count:', e.message);
    }
    
    // Cleanup temp directories
    await fs.promises.rm(videoFramesDir, { recursive: true, force: true });
    await fs.promises.rm(processedDir, { recursive: true, force: true });
    await fs.promises.rm(blurredDir, { recursive: true, force: true });
    await fs.promises.rm(overlayDir, { recursive: true, force: true });
    await fs.promises.rm(finalDir, { recursive: true, force: true });
    
    console.log('Background video generated successfully!');
    
    res.json({
      success: true,
      outputUrl: '/uploads/test/backgroundtest.mp4',
      message: 'Background video generated successfully'
    });
    
  } catch (error) {
    console.error('Error generating background video:', error);
    res.status(500).json({
      error: 'Failed to generate background video',
      message: error.message
    });
  }
});

/**
 * Generate background video with frame-by-frame extraction (ensures no dropped frames)
 * POST /api/video-processing/generate-background-fbf
 */
router.post('/generate-background-fbf', async (req, res) => {
  // Declare variables at function scope for error handler access
  let outputDir = 'test';
  let inputPath = null;
  let preprocess = false;
  
  try {
    // Initialize progress tracking
    // If itemNumber is provided, also initialize per-item status
    const itemNumber = req.body.itemNumber ? parseInt(req.body.itemNumber) : null;
    const usePerItemStatus = itemNumber && Number.isFinite(itemNumber);
    
    if (usePerItemStatus) {
      const itemStatus = itemProcessingStatus.get(itemNumber) || {
        active: true,
        stage: 'initializing',
        progress: 0,
        total: 0,
        message: 'Starting frame-by-frame processing...',
        startTime: Date.now(),
        estimatedTimeRemaining: null,
        error: null
      };
      itemStatus.active = true;
      itemStatus.stage = 'initializing';
      itemStatus.progress = 0;
      itemStatus.total = 0;
      itemStatus.message = 'Starting frame-by-frame processing...';
      itemStatus.startTime = Date.now();
      itemStatus.estimatedTimeRemaining = null;
      itemStatus.error = null;
      itemProcessingStatus.set(itemNumber, itemStatus);
    }
    
    processingStatus.active = true;
    processingStatus.stage = 'initializing';
    processingStatus.progress = 0;
    processingStatus.total = 0;
    processingStatus.message = 'Starting frame-by-frame processing...';
    processingStatus.startTime = Date.now();
    processingStatus.estimatedTimeRemaining = null;
    
    const { videoPath, maxDuration, preprocess: preprocessParam = false, trimStart = 0, trimDuration = null, outputFilename = null, outputDir: outputDirParam = 'test' } = req.body;
    outputDir = outputDirParam;
    preprocess = preprocessParam;
    
    if (!videoPath) {
      processingStatus.active = false;
      return res.status(400).json({ error: 'videoPath is required' });
    }

    // Handle both absolute paths (starting with /) and relative paths
    const cleanPath = videoPath.replace(/^\//, '');
    inputPath = path.join(__dirname, '..', cleanPath);
    
    if (!fs.existsSync(inputPath)) {
      processingStatus.active = false;
      return res.status(404).json({ error: 'Video file not found' });
    }

    // Preprocess inline if requested (crop to 1:1, trim)
    if (preprocess) {
      processingStatus.message = 'Preprocessing video (crop to 1:1, trim)...';
      console.log('[Frame-by-Frame] Preprocessing video inline...');
      
      // Get video dimensions
      const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${inputPath}"`;
      const { stdout } = await execAsync(probeCmd);
      const probeData = JSON.parse(stdout);
      const stream = probeData.streams?.[0];
      
      if (!stream) {
        processingStatus.active = false;
        return res.status(400).json({ error: 'Could not read video properties' });
      }

      const originalWidth = stream.width;
      const originalHeight = stream.height;
      
      // Crop to 1:1, keep height, center crop
      const cropSize = originalHeight;
      const cropX = Math.floor((originalWidth - cropSize) / 2);
      
      // Create temporary preprocessed file
      const tempPreprocessedPath = path.join(__dirname, '..', 'uploads', 'test', `temp_preprocessed_${Date.now()}.mov`);
      const trimStartSec = trimStart || 2;
      const trimDurationSec = trimDuration || maxDuration || 16;
      
      const preprocessCmd = `ffmpeg -y -ss ${trimStartSec} -i "${inputPath}" -t ${trimDurationSec} -vf "crop=${cropSize}:${cropSize}:${cropX}:0" -c:v prores_ks -profile:v 3 -an "${tempPreprocessedPath}"`;
      
      await execAsync(preprocessCmd);
      console.log('[Frame-by-Frame] Preprocessing complete');
      
      // Use preprocessed file as input
      inputPath = tempPreprocessedPath;
    }

    // Output path - different filename for frame-by-frame version
    const outputDirectory = path.join(__dirname, '..', 'uploads', outputDir);
    await fs.promises.mkdir(outputDirectory, { recursive: true });
    let outputName;
    if (outputFilename) {
      outputName = outputFilename.endsWith('.mp4') ? outputFilename : `${outputFilename}.mp4`;
    } else {
      outputName = maxDuration ? `background_fbf_${maxDuration}s.mp4` : 'background_fbf.mp4';
    }
    const outputPath = path.join(outputDirectory, outputName);

    // Get video dimensions, duration, and frame rate - count frames explicitly
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,r_frame_rate -count_frames -show_entries stream=nb_read_frames -of json "${inputPath}"`;
    const { stdout } = await execAsync(probeCmd);
    const probeData = JSON.parse(stdout);
    const stream = probeData.streams?.[0];
    
    if (!stream) {
      return res.status(400).json({ error: 'Could not read video properties' });
    }
    
    // Parse frame rate
    let fps = 30;
    if (stream.r_frame_rate) {
      const [num, den] = stream.r_frame_rate.split('/').map(Number);
      if (den && den > 0) {
        fps = num / den;
      }
    }
    
    // Get actual frame count
    let actualFrameCount = null;
    if (stream.nb_read_frames) {
      actualFrameCount = parseInt(stream.nb_read_frames);
    } else if (stream.nb_frames) {
      actualFrameCount = parseInt(stream.nb_frames);
    }
    
    const duration = parseFloat(stream.duration) || 0;
    
    // Get original video dimensions
    const originalWidth = parseInt(stream.width) || 1080;
    const originalHeight = parseInt(stream.height) || 1080;
    const originalSize = Math.min(originalWidth, originalHeight); // Use smaller dimension for square
    
    console.log(`[Frame-by-Frame] Video: ${originalWidth}x${originalHeight}, ${fps.toFixed(3)} fps, ${duration.toFixed(3)}s, ${actualFrameCount || 'unknown'} frames`);
    
    // Update progress
    processingStatus.total = actualFrameCount || 0;
    processingStatus.stage = 'extracting';
    processingStatus.message = `Extracting ${actualFrameCount || 'unknown'} frames...`;

    // Calculate dimensions: outer 3240x3240, inner 1080x1080 (but extract at high res for crisp quality)
    const outerSize = 3240;  // Fixed outer container
    const innerSize = 1080;   // Inner video area size (final size in output)
    const innerLeft = Math.floor((outerSize - innerSize) / 2);  // 1080 (centered)
    const innerTop = Math.floor((outerSize - innerSize) / 2);   // 1080 (centered)
    const innerRight = innerLeft + innerSize;  // 2160
    const innerBottom = innerTop + innerSize;   // 2160
    
    // Extract video at very high resolution for crisp quality (at least 3x inner size to preserve quality)
    const extractSize = Math.max(originalSize, innerSize * 3);  // At least 3x inner size (3240), or original if larger
    
    console.log(`[Frame-by-Frame] Dimensions: Outer ${outerSize}x${outerSize}, Inner ${innerSize}x${innerSize} (will be scaled from ${extractSize}x${extractSize} for crisp quality)`);
    
    // Extract frames frame-by-frame
    const videoFramesDir = path.join(outputDir, 'video_frames_fbf');
    await fs.promises.mkdir(videoFramesDir, { recursive: true });
    
    console.log('[Frame-by-Frame] Extracting frames one-by-one...');
    
    // Limit to maxDuration if specified
    let framesToProcess = actualFrameCount || 0;
    if (maxDuration && maxDuration > 0 && actualFrameCount) {
      const maxFrames = Math.ceil(maxDuration * fps);
      framesToProcess = Math.min(actualFrameCount, maxFrames);
      console.log(`[Frame-by-Frame] Limiting to first ${maxDuration}s (${framesToProcess} frames)`);
    }
    
    if (actualFrameCount && actualFrameCount > 0) {
      const frameInterval = 1 / fps;
      
      for (let frameNum = 0; frameNum < framesToProcess; frameNum++) {
        const timestamp = frameNum * frameInterval;
        const frameFileName = `frame_${String(frameNum + 1).padStart(6, '0')}.png`;
        const framePath = path.join(videoFramesDir, frameFileName);
        
        // Extract at high resolution (extractSize) for crisp quality, will be scaled down to innerSize during compositing
        const extractCmd = `ffmpeg -ss ${timestamp.toFixed(6)} -i "${inputPath}" -vf "scale=${extractSize}:${extractSize}:force_original_aspect_ratio=increase" -frames:v 1 -vsync 0 -y "${framePath}"`;
        
        try {
          await execAsync(extractCmd);
          processingStatus.progress = frameNum + 1;
          processingStatus.message = `Extracting frame ${frameNum + 1}/${framesToProcess}...`;
          if ((frameNum + 1) % 100 === 0) {
            console.log(`[Frame-by-Frame] Extracted ${frameNum + 1}/${framesToProcess} frames...`);
          }
        } catch (error) {
          console.error(`[Frame-by-Frame] Error extracting frame ${frameNum + 1}:`, error.message);
        }
      }
      
      console.log(`[Frame-by-Frame] Extraction complete: ${framesToProcess} frames`);
    } else {
      return res.status(400).json({ error: 'Could not determine frame count' });
    }
    
    // Get extracted frames (limit to framesToProcess if maxDuration was set)
    let frameFiles = (await fs.promises.readdir(videoFramesDir))
      .filter(f => f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });
    
    // Limit to framesToProcess if maxDuration was specified
    if (maxDuration && framesToProcess && frameFiles.length > framesToProcess) {
      frameFiles = frameFiles.slice(0, framesToProcess);
    }
    
    console.log(`[Frame-by-Frame] Processing ${frameFiles.length} frames...`);
    
    // PREPROCESS: Apply white/off-white fade to video frames in parallel (much faster)
    console.log('[Frame-by-Frame] Preprocessing video frames (white/off-white fade)...');
    processingStatus.stage = 'preprocessing';
    processingStatus.progress = 0;
    processingStatus.message = `Preprocessing ${frameFiles.length} frames (white/off-white fade)...`;
    
    const preprocessedDir = path.join(outputDir, 'preprocessed_video_frames_fbf');
    await fs.promises.mkdir(preprocessedDir, { recursive: true });
    
    const whiteThreshold = 150; // Match the tested version from apply-white-fade
    const innerSizeForFade = innerSize; // Apply fade at final inner size
    const centerX = innerSizeForFade / 2;
    const centerY = innerSizeForFade / 2;
    const maxDistance = innerSizeForFade / 2;
    const fadeStartDistance = maxDistance * 0.8; // Start fade at 80% from center (outer 20% fade zone)
    const fadeEndDistance = maxDistance;
    const fadeRange = fadeEndDistance - fadeStartDistance;
    const fadeStartDistanceSq = fadeStartDistance * fadeStartDistance;
    const fadeEndDistanceSq = fadeEndDistance * fadeEndDistance;
    
    const preprocessBatchSize = 20; // Larger batch for preprocessing
    for (let i = 0; i < frameFiles.length; i += preprocessBatchSize) {
      const batch = frameFiles.slice(i, i + preprocessBatchSize);
      
      await Promise.all(batch.map(async (frameFile) => {
        const videoFramePath = path.join(videoFramesDir, frameFile);
        const preprocessedPath = path.join(preprocessedDir, frameFile);
        
        try {
          // Resize to innerSize first (for fade calculations)
          // Use 'contain' to preserve entire video without clipping
          const resizedBuffer = await sharp(videoFramePath)
            .resize(innerSizeForFade, innerSizeForFade, {
              kernel: 'lanczos3',
              fit: 'contain',
              position: 'center',
              withoutEnlargement: false
            })
            .sharpen()
            .ensureAlpha()
            .raw()
            .toBuffer();
          
          const videoData = Buffer.from(resizedBuffer);
          
          // Apply white/off-white fade using the tested logic from apply-white-fade
          // Extend bounds to cover corners (corner distance is sqrt(2) * maxDistance)
          const maxCornerDistance = maxDistance * Math.sqrt(2);
          const processingRadius = Math.max(fadeEndDistance, maxCornerDistance * 1.05); // Process slightly beyond corners
          const startY = Math.floor(centerY - processingRadius);
          const endY = Math.ceil(centerY + processingRadius);
          const startX = Math.floor(centerX - processingRadius);
          const endX = Math.ceil(centerX + processingRadius);
          
          for (let y = Math.max(0, startY); y < Math.min(innerSizeForFade, endY); y++) {
            for (let x = Math.max(0, startX); x < Math.min(innerSizeForFade, endX); x++) {
              const idx = (y * innerSizeForFade + x) * 4;
              const r = videoData[idx];
              const g = videoData[idx + 1];
              const b = videoData[idx + 2];
              const a = videoData[idx + 3];
              
              // Calculate distance from center first
              const dx = x - centerX;
              const dy = y - centerY;
              const distanceSq = dx * dx + dy * dy;
              
              // Normal mode: Only process white/off-white pixels
              const avgBrightness = (r + g + b) / 3;
              const isWhite = (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) || avgBrightness > 170;
              if (a === 0 || !isWhite) {
                continue;
              }
              
              const distanceFromCenter = Math.sqrt(distanceSq);
              
              // Only apply fade to white pixels in the fade zone
              // Extend fade range to fully cover corners (including the very corner pixels)
              if (distanceSq >= fadeStartDistanceSq) {
                // Corner pixels are further from center, so extend fade end to fully cover corners
                const maxCornerDistance = maxDistance * Math.sqrt(2); // Distance to corner
                const effectiveFadeEnd = Math.max(fadeEndDistance, maxCornerDistance * 1.05); // Extend slightly beyond corners to ensure full coverage
                const effectiveFadeRange = effectiveFadeEnd - fadeStartDistance;
                
                if (distanceFromCenter <= effectiveFadeEnd) {
                  // Smooth ease-in-out curve for gradual transition
                  const t = (distanceFromCenter - fadeStartDistance) / effectiveFadeRange; // Normalized 0-1
                  const smoothT = t * t * (3 - 2 * t); // Smooth step (ease-in-out)
                  const fadeFactor = Math.max(0, 1 - smoothT);
                  videoData[idx + 3] = Math.floor(a * fadeFactor);
                  // If fully transparent, set RGB to black to ensure proper transparency
                  if (videoData[idx + 3] === 0) {
                    videoData[idx] = 0;     // R
                    videoData[idx + 1] = 0; // G
                    videoData[idx + 2] = 0; // B
                  }
                } else {
                  // Pixels beyond effectiveFadeEnd (very corner pixels) - make fully transparent if white
                  videoData[idx + 3] = 0;
                  videoData[idx] = 0;     // R
                  videoData[idx + 1] = 0; // G
                  videoData[idx + 2] = 0; // B
                }
              }
            }
          }
          
          // Apply 5px border fade - make outer 5px fully transparent (regardless of color)
          const borderWidth = 5;
          for (let y = 0; y < innerSizeForFade; y++) {
            for (let x = 0; x < innerSizeForFade; x++) {
              // Check if pixel is within 5px of any edge
              const distFromLeft = x;
              const distFromRight = innerSizeForFade - 1 - x;
              const distFromTop = y;
              const distFromBottom = innerSizeForFade - 1 - y;
              const minDistFromEdge = Math.min(distFromLeft, distFromRight, distFromTop, distFromBottom);
              
              if (minDistFromEdge < borderWidth) {
                const idx = (y * innerSizeForFade + x) * 4;
                // Make fully transparent
                videoData[idx + 3] = 0;
                videoData[idx] = 0;     // R
                videoData[idx + 1] = 0; // G
                videoData[idx + 2] = 0; // B
              }
            }
          }
          
          // Ensure non-white pixels are fully opaque (except those in the 5px border which are already transparent)
          for (let i = 0; i < videoData.length; i += 4) {
            const r = videoData[i];
            const g = videoData[i + 1];
            const b = videoData[i + 2];
            const avgBrightness = (r + g + b) / 3;
            const isWhite = (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) || avgBrightness > 170;
            if (!isWhite && videoData[i + 3] > 0) {
              videoData[i + 3] = 255; // Ensure non-white pixels are fully opaque
            }
            if (videoData[i + 3] === 0) {
              videoData[i] = 0;     // R
              videoData[i + 1] = 0; // G
              videoData[i + 2] = 0; // B
            }
          }
          
          // Save preprocessed frame
          await sharp(videoData, {
            raw: {
              width: innerSizeForFade,
              height: innerSizeForFade,
              channels: 4
            }
          })
          .ensureAlpha()
          .png({ compressionLevel: 9, adaptiveFiltering: true })
          .toFile(preprocessedPath);
          
        } catch (error) {
          console.error(`[Frame-by-Frame] Error preprocessing ${frameFile}:`, error.message);
        }
      }));
      
      processingStatus.progress = Math.min(i + preprocessBatchSize, frameFiles.length);
      processingStatus.message = `Preprocessing: ${processingStatus.progress}/${frameFiles.length} frames...`;
      
      if ((i + preprocessBatchSize) % 100 === 0 || i + preprocessBatchSize >= frameFiles.length) {
        console.log(`[Frame-by-Frame] Preprocessed ${processingStatus.progress}/${frameFiles.length} frames...`);
      }
    }
    
    console.log('[Frame-by-Frame] Preprocessing complete!');
    
    // Update progress
    processingStatus.stage = 'processing';
    processingStatus.progress = 0;
    processingStatus.message = `Processing outer projection for ${frameFiles.length} frames...`;
    
    // Process frames (same logic as original - outer projection, blur, overlay, composite)
    const processedDir = path.join(outputDir, 'processed_frames_fbf');
    await fs.promises.mkdir(processedDir, { recursive: true });
    
    const batchSize = 10;
    for (let i = 0; i < frameFiles.length; i += batchSize) {
      const batch = frameFiles.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (frameFile) => {
        const videoFramePath = path.join(videoFramesDir, frameFile);
        const outputFramePath = path.join(processedDir, frameFile);
        
        let videoData;
        try {
          videoData = await sharp(videoFramePath)
            .ensureAlpha()
            .raw()
            .toBuffer();
        } catch (error) {
          console.error(`[Frame-by-Frame] Error loading frame ${frameFile}:`, error.message);
          return;
        }
        
        if (!videoData || videoData.length === 0) return;
        
        // Helper to get pixel from VIDEO (extracted at extractSize, but we sample at innerSize coordinates)
        const getVideoPixel = (x, y) => {
          // Map innerSize coordinates (0-360) to extractSize coordinates (0-extractSize)
          const scaleFactor = extractSize / innerSize;
          const extractX = Math.floor(x * scaleFactor);
          const extractY = Math.floor(y * scaleFactor);
          const clampedX = Math.max(0, Math.min(extractSize - 1, extractX));
          const clampedY = Math.max(0, Math.min(extractSize - 1, extractY));
          const idx = (clampedY * extractSize + clampedX) * 4;
          if (idx >= 0 && idx < videoData.length - 3) {
            return {
              r: videoData[idx],
              g: videoData[idx + 1],
              b: videoData[idx + 2],
              a: videoData[idx + 3]
            };
          }
          return { r: 0, g: 0, b: 0, a: 0 };
        };
        
        const outputData = Buffer.alloc(outerSize * outerSize * 4, 0);
        
        for (let y = 0; y < outerSize; y++) {
          for (let x = 0; x < outerSize; x++) {
            const idx = (y * outerSize + x) * 4;
            
            if (x >= innerLeft && x < innerRight && y >= innerTop && y < innerBottom) {
              continue;
            }
            
            let edgeX, edgeY;
            if (x < innerLeft) {
              edgeX = innerLeft;
              edgeY = Math.max(innerTop, Math.min(innerBottom - 1, y));
            } else if (x >= innerRight) {
              edgeX = innerRight - 1;
              edgeY = Math.max(innerTop, Math.min(innerBottom - 1, y));
            } else if (y < innerTop) {
              edgeX = Math.max(innerLeft, Math.min(innerRight - 1, x));
              edgeY = innerTop;
            } else {
              edgeX = Math.max(innerLeft, Math.min(innerRight - 1, x));
              edgeY = innerBottom - 1;
            }
            
            const videoEdgeX = edgeX - innerLeft;
            const videoEdgeY = edgeY - innerTop;
            const pixel = getVideoPixel(videoEdgeX, videoEdgeY);
            
            // No fade - fully opaque
            outputData[idx] = pixel.r;
            outputData[idx + 1] = pixel.g;
            outputData[idx + 2] = pixel.b;
            outputData[idx + 3] = pixel.a;
          }
        }
        
        await sharp(outputData, {
          raw: {
            width: outerSize,
            height: outerSize,
            channels: 4
          }
        })
        .png()
        .toFile(outputFramePath);
      }));
      
      if ((i + batchSize) % 50 === 0 || i + batchSize >= frameFiles.length) {
        const processed = Math.min(i + batchSize, frameFiles.length);
        processingStatus.progress = processed;
        processingStatus.message = `Processing outer projection: ${processed}/${frameFiles.length} frames`;
        console.log(`[Frame-by-Frame] Processed ${processed}/${frameFiles.length} frames`);
      }
    }
    
    // Apply blur
    console.log('[Frame-by-Frame] Applying blur...');
    processingStatus.stage = 'blurring';
    processingStatus.progress = 0;
    processingStatus.message = `Applying blur to ${frameFiles.length} frames...`;
    const blurredDir = path.join(outputDir, 'blurred_frames_fbf');
    await fs.promises.mkdir(blurredDir, { recursive: true });
    
    let blurCount = 0;
    for (const frameFile of frameFiles) {
      const processedPath = path.join(processedDir, frameFile);
      const blurredPath = path.join(blurredDir, frameFile);
      // Apply stronger blur to entire background (sigma value - higher = more blur)
      // Using 50 for much stronger blur effect that covers the whole background
      await sharp(processedPath)
        .blur(50)
        .toFile(blurredPath);
      blurCount++;
      if (blurCount % 50 === 0 || blurCount === frameFiles.length) {
        processingStatus.progress = blurCount;
        processingStatus.message = `Applying blur: ${blurCount}/${frameFiles.length} frames`;
      }
    }
    
    // Overlay creation removed - not being used in compositing
    
    // Composite
    console.log('[Frame-by-Frame] Compositing...');
    processingStatus.stage = 'compositing';
    processingStatus.progress = 0;
    processingStatus.message = `Compositing ${frameFiles.length} frames...`;
    const finalDir = path.join(outputDir, 'final_frames_fbf');
    await fs.promises.mkdir(finalDir, { recursive: true });
    
    let compositeCount = 0;
    for (const frameFile of frameFiles) {
        const blurredPath = path.join(blurredDir, frameFile);
        const videoFramePath = path.join(videoFramesDir, frameFile);
        const finalPath = path.join(finalDir, frameFile);
      
      try {
        // Composite: blurred background + preprocessed video (already has white/off-white fade applied)
        // Use the preprocessed frame directly (much faster - no processing needed here)
        const preprocessedPath = path.join(preprocessedDir, frameFile);
        
        await sharp(blurredPath)
          .composite([
            {
              input: preprocessedPath,
              left: innerLeft,
              top: innerTop,
              blend: 'over'
            }
          ])
          .ensureAlpha()
          .toFile(finalPath);
        compositeCount++;
        if (compositeCount % 50 === 0 || compositeCount === frameFiles.length) {
          processingStatus.progress = compositeCount;
          processingStatus.message = `Compositing: ${compositeCount}/${frameFiles.length} frames`;
        }
      } catch (error) {
        console.error(`[Frame-by-Frame] Error compositing ${frameFile}:`, error.message);
      }
    }
    
    // Encode
    const finalFrameCount = frameFiles.length;
    const videoDuration = duration || parseFloat(stream.duration) || 0;
    let encodeFps = fps;
    if (videoDuration > 0 && finalFrameCount > 0) {
      encodeFps = finalFrameCount / videoDuration;
    }
    
    console.log(`[Frame-by-Frame] Encoding: ${finalFrameCount} frames, ${videoDuration.toFixed(3)}s, ${encodeFps.toFixed(6)} fps`);
    
    processingStatus.stage = 'encoding';
    processingStatus.progress = 0;
    processingStatus.message = `Encoding ${finalFrameCount} frames to video...`;
    
    // Use provided encodingCRF for final encoding
    const encodingPreset = req.body.encodingPreset || 'medium';
    const encodingCRF = req.body.encodingCRF || 24; // Use provided CRF or default to 24
    
    // Reuse dimensions already calculated above (outerSize, innerSize, innerLeft, innerTop)
    
    console.log(`[Frame-by-Frame] Encoding with CRF ${encodingCRF}, preset: ${encodingPreset}`);
    processingStatus.message = `Encoding ${finalFrameCount} frames with CRF ${encodingCRF}...`;
    const encodeCmd = `ffmpeg -y -framerate ${encodeFps.toFixed(6)} -i "${finalDir}/frame_%06d.png" -fps_mode passthrough -c:v libx264 -preset ${encodingPreset} -crf ${encodingCRF} -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
    
    // Run final compositing with progress tracking
    // ffmpeg outputs progress info to stderr in format: frame=1234 fps=30.5 q=23.0 size=12345kB time=00:00:41.23 bitrate=1234.5kbits/s
    const childProcess = exec(encodeCmd);
    const encodingStartTime = Date.now();
    
    childProcess.stderr.on('data', (data) => {
      const output = data.toString();
      // Parse frame number from ffmpeg output
      // Look for patterns like "frame= 1234" or "frame=1234"
      const frameMatch = output.match(/frame=\s*(\d+)/);
      if (frameMatch) {
        const currentFrame = parseInt(frameMatch[1]);
        if (currentFrame > processingStatus.progress) {
          processingStatus.progress = currentFrame;
          processingStatus.message = `Encoding frame ${currentFrame}/${finalFrameCount}...`;
          
          // Calculate estimated time remaining
          const elapsed = Date.now() - encodingStartTime;
          if (elapsed > 0 && currentFrame > 0) {
            const framesPerMs = currentFrame / elapsed;
            const remainingFrames = finalFrameCount - currentFrame;
            if (framesPerMs > 0 && remainingFrames > 0) {
              const remainingMs = remainingFrames / framesPerMs;
              processingStatus.estimatedTimeRemaining = Math.round(remainingMs);
            }
          }
        }
      }
    });
    
    await new Promise((resolve, reject) => {
      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg encoding failed with code ${code}`));
        }
      });
      
      childProcess.on('error', (error) => {
        reject(error);
      });
    });
    
    processingStatus.progress = finalFrameCount;
    processingStatus.message = 'Encoding complete!';
    
    // CRITICAL: Assert that output file exists and has non-zero size before returning
    // This ensures the file is fully written to disk
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Output file not found after encoding: ${outputPath}`);
    }
    
    const outputStats = await fs.promises.stat(outputPath);
    if (outputStats.size === 0) {
      throw new Error(`Output file is empty (0 bytes): ${outputPath}`);
    }
    
    console.log(`[generate-background-fbf] ✅ Output file verified: ${outputPath} (${(outputStats.size / (1024 * 1024)).toFixed(2)} MB)`);
    
    // Cleanup temp preprocessed file if it was created
    if (preprocess && inputPath.includes('temp_preprocessed_')) {
      try {
        await fs.promises.unlink(inputPath);
        console.log('[Frame-by-Frame] Cleaned up temporary preprocessed file');
      } catch (error) {
        console.warn('[Frame-by-Frame] Could not delete temp preprocessed file:', error.message);
      }
    }
    
    // Cleanup temp directories (but NOT the output file)
    await fs.promises.rm(videoFramesDir, { recursive: true, force: true });
    await fs.promises.rm(preprocessedDir, { recursive: true, force: true });
    await fs.promises.rm(processedDir, { recursive: true, force: true });
    await fs.promises.rm(blurredDir, { recursive: true, force: true });
    await fs.promises.rm(finalDir, { recursive: true, force: true });
    
    console.log('[Frame-by-Frame] Complete!');
    
    // Reset progress tracking
    processingStatus.active = false;
    processingStatus.stage = 'complete';
    processingStatus.message = 'Processing complete!';
    
    // Return absolute output path explicitly
    const absoluteOutputPath = path.resolve(outputPath);
    console.log(`[generate-background-fbf] Returning absolute output path: ${absoluteOutputPath}`);
    
    res.json({
      success: true,
      outputPath: absoluteOutputPath, // Explicit absolute path
      outputUrl: `/uploads/${outputDir}/${outputName}`, // Relative URL for compatibility
      message: 'Frame-by-frame background video generated',
      frameCount: finalFrameCount,
      duration: videoDuration,
      fps: encodeFps
    });
    
  } catch (error) {
    console.error('[Frame-by-Frame] Error:', error);
    
    // Cleanup temp directories on error
    const outputDirectory = path.join(__dirname, '..', 'uploads', outputDir);
    const tempDirs = [
      path.join(outputDirectory, 'video_frames'),
      path.join(outputDirectory, 'preprocessed_video_frames_fbf'),
      path.join(outputDirectory, 'processed_frames'),
      path.join(outputDirectory, 'blurred_frames'),
      path.join(outputDirectory, 'final_frames')
    ];
    
    for (const dir of tempDirs) {
      try {
        if (fs.existsSync(dir)) {
          await fs.promises.rm(dir, { recursive: true, force: true });
          console.log(`🧹 Cleaned up temp directory on error: ${path.basename(dir)}`);
        }
      } catch (cleanupError) {
        console.warn(`⚠️  Could not delete temp directory ${path.basename(dir)}:`, cleanupError.message);
      }
    }
    
    // Cleanup temp preprocessed file if it was created
    if (preprocess && inputPath && inputPath.includes('temp_preprocessed_')) {
      try {
        await fs.promises.unlink(inputPath);
        console.log('[Frame-by-Frame] Cleaned up temporary preprocessed file on error');
      } catch (cleanupError) {
        console.warn('[Frame-by-Frame] Could not delete temp preprocessed file:', cleanupError.message);
      }
    }
    
    processingStatus.active = false;
    processingStatus.stage = 'error';
    processingStatus.message = `Error: ${error.message}`;
    res.status(500).json({
      error: 'Failed to generate background video',
      message: error.message
    });
  }
});

/**
 * Record browser view using Puppeteer (pixel-perfect capture)
 * POST /api/video-processing/record-browser
 */
router.post('/record-browser', async (req, res) => {
  let browser;
  let page;
  
  try {
    const { url = 'http://localhost:3000/test/video-edge', duration = 10, fps = 30 } = req.body;
    
    // Create output directory
    const outputDir = path.join(__dirname, '../../server/uploads/test/recorded_frames');
    await fs.promises.mkdir(outputDir, { recursive: true });
    
    const outputPath = path.join(__dirname, '../../server/uploads/test/backgroundtest.mp4');
    
    console.log('Launching headless browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    page = await browser.newPage();
    
    // Set viewport to match your screen size (adjust as needed)
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1
    });
    
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    // Wait for video to load and start playing
    console.log('Waiting for video to load...');
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video && video.readyState >= 2;
    }, { timeout: 30000 });
    
    // Wait for canvas to be ready
    console.log('Waiting for canvas to render...');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas && canvas.width > 0 && canvas.height > 0;
    }, { timeout: 30000 });
    
    // Wait a bit for video to start playing and effects to render
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get the container element to capture
    const containerSelector = '[data-testid="outer-container"], .outer-container, body';
    
    console.log(`Capturing frames at ${fps} fps for ${duration} seconds...`);
    const totalFrames = Math.floor(duration * fps);
    const frameInterval = 1000 / fps;
    
    for (let i = 0; i < totalFrames; i++) {
      const framePath = path.join(outputDir, `frame_${String(i + 1).padStart(6, '0')}.png`);
      
      // Capture screenshot of the container
      const element = await page.$(containerSelector);
      if (element) {
        await element.screenshot({
          path: framePath,
          type: 'png'
        });
      } else {
        // Fallback to full page screenshot
        await page.screenshot({
          path: framePath,
          type: 'png',
          fullPage: false
        });
      }
      
      if ((i + 1) % 30 === 0) {
        console.log(`Captured ${i + 1}/${totalFrames} frames`);
      }
      
      // Wait for next frame (account for screenshot time)
      if (i < totalFrames - 1) {
        await new Promise(resolve => setTimeout(resolve, frameInterval));
      }
    }
    
    console.log(`Captured all ${totalFrames} frames`);
    console.log('Encoding video...');
    
    // Encode frames into video
    const encodeCmd = `ffmpeg -y -r ${fps} -i "${outputDir}/frame_%06d.png" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
    await execAsync(encodeCmd);
    
    // Cleanup frames
    const frameFiles = await fs.promises.readdir(outputDir);
    await Promise.all(frameFiles.map(file => 
      fs.promises.unlink(path.join(outputDir, file))
    ));
    await fs.promises.rmdir(outputDir);
    
    console.log('Browser recording completed successfully!');
    
    res.json({
      success: true,
      outputUrl: '/uploads/test/backgroundtest.mp4',
      message: 'Browser recording completed successfully',
      frames: totalFrames,
      duration: duration
    });
    
  } catch (error) {
    console.error('Error recording browser:', error);
    res.status(500).json({
      error: 'Failed to record browser',
      message: error.message
    });
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
});

/**
 * Upload and convert browser recording to MP4
 * POST /api/video-processing/upload-recording
 */
router.post('/upload-recording', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }
    
    const inputPath = req.file.path;
    const outputDir = path.join(__dirname, '../../server/uploads/test');
    await fs.promises.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'backgroundtest.mp4');
    
    console.log('Converting browser recording to MP4...');
    
    // Convert WebM to MP4
    const convertCmd = `ffmpeg -y -i "${inputPath}" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -an -movflags +faststart "${outputPath}"`;
    await execAsync(convertCmd);
    
    // Cleanup input file
    await fs.promises.unlink(inputPath);
    
    console.log('Recording converted successfully!');
    
    res.json({
      success: true,
      outputUrl: '/uploads/test/backgroundtest.mp4',
      message: 'Recording converted successfully'
    });
    
  } catch (error) {
    console.error('Error processing recording:', error);
    res.status(500).json({
      error: 'Failed to process recording',
      message: error.message
    });
  }
});

/**
 * Preprocess video: crop to 1:1, trim, remove first 2 seconds
 * POST /api/video-processing/preprocess-video
 */
router.post('/preprocess-video', async (req, res) => {
  try {
    const { inputPath: inputPathParam, outputName = 'test1.mov' } = req.body;
    
    // Default to test.mov if no input specified
    const inputFileName = inputPathParam || 'test.mov';
    const inputPath = path.join(__dirname, '..', 'uploads', 'test', inputFileName);
    
    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ error: `Video file not found: ${inputFileName}` });
    }

    const outputDir = path.join(__dirname, '..', 'uploads', 'test');
    await fs.promises.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, outputName);

    console.log(`[Preprocess] Processing ${inputFileName}...`);
    console.log(`[Preprocess] Input: ${inputPath}`);
    console.log(`[Preprocess] Output: ${outputPath}`);

    // Get video dimensions to calculate crop
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${inputPath}"`;
    const { stdout } = await execAsync(probeCmd);
    const probeData = JSON.parse(stdout);
    const stream = probeData.streams?.[0];
    
    if (!stream) {
      return res.status(400).json({ error: 'Could not read video properties' });
    }

    const originalWidth = stream.width;
    const originalHeight = stream.height;
    
    // Crop to 1:1, keep height, center crop
    const cropSize = originalHeight; // Use height as the square size
    const cropX = Math.floor((originalWidth - cropSize) / 2); // Center horizontally
    
    console.log(`[Preprocess] Original: ${originalWidth}x${originalHeight}`);
    console.log(`[Preprocess] Cropping to: ${cropSize}x${cropSize} from x=${cropX}`);

    // FFmpeg command:
    // -ss 2: skip first 2 seconds
    // -t 16: trim to 16 seconds total
    // -vf crop: crop to 1:1 (centered, keep height)
    // -c:v prores_ks -profile:v 3: ProRes 4444 (lossless, works with MOV)
    // -c:a copy: copy audio if present
    // Note: Can't use copy codec with filters, so using ProRes 4444 (lossless) for MOV format
    const preprocessCmd = `ffmpeg -y -ss 2 -i "${inputPath}" -t 16 -vf "crop=${cropSize}:${cropSize}:${cropX}:0" -c:v prores_ks -profile:v 3 -an "${outputPath}"`;
    
    console.log(`[Preprocess] Running: ${preprocessCmd}`);
    await execAsync(preprocessCmd);

    // Verify output
    const verifyCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of json "${outputPath}"`;
    const { stdout: verifyStdout } = await execAsync(verifyCmd);
    const verifyData = JSON.parse(verifyStdout);
    const verifyStream = verifyData.streams?.[0];
    
    const fileSize = (await fs.promises.stat(outputPath)).size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

    console.log(`[Preprocess] Complete! Output: ${verifyStream.width}x${verifyStream.height}, ${parseFloat(verifyStream.duration).toFixed(2)}s, ${fileSizeMB}MB`);

    res.json({
      success: true,
      outputPath: `/uploads/test/${outputName}`,
      outputFile: outputName,
      dimensions: `${verifyStream.width}x${verifyStream.height}`,
      duration: parseFloat(verifyStream.duration).toFixed(2),
      fileSizeMB: fileSizeMB,
      message: 'Video preprocessed successfully'
    });

  } catch (error) {
    console.error('[Preprocess] Error:', error);
    res.status(500).json({
      error: 'Failed to preprocess video',
      message: error.message
    });
  }
});

/**
 * Apply white pixel transparency fade to video (no background compositing)
 * POST /api/video-processing/apply-white-fade
 */
router.post('/apply-white-fade', async (req, res) => {
  try {
    const { inputPath: inputPathParam = 'test1.mov', outputName = 'test2.mov' } = req.body;
    
    const inputPath = path.join(__dirname, '..', 'uploads', 'test', inputPathParam);
    
    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ error: `Video file not found: ${inputPathParam}` });
    }

    const outputDir = path.join(__dirname, '..', 'uploads', 'test');
    await fs.promises.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, outputName);

    console.log(`[White Fade] Processing ${inputPathParam}...`);
    console.log(`[White Fade] Output: ${outputName}`);

    // Get video properties
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,r_frame_rate -count_frames -show_entries stream=nb_read_frames -of json "${inputPath}"`;
    const { stdout } = await execAsync(probeCmd);
    const probeData = JSON.parse(stdout);
    const stream = probeData.streams?.[0];
    
    if (!stream) {
      return res.status(400).json({ error: 'Could not read video properties' });
    }

    let fps = 30;
    if (stream.r_frame_rate) {
      const [num, den] = stream.r_frame_rate.split('/').map(Number);
      if (den && den > 0) {
        fps = num / den;
      }
    }

    const actualFrameCount = stream.nb_read_frames ? parseInt(stream.nb_read_frames) : null;
    const duration = parseFloat(stream.duration) || 0;
    const originalWidth = stream.width;
    const originalHeight = stream.height;
    const videoSize = Math.min(originalWidth, originalHeight); // Use smaller dimension for square

    console.log(`[White Fade] Video: ${originalWidth}x${originalHeight}, ${fps.toFixed(3)} fps, ${duration.toFixed(3)}s, ${actualFrameCount || 'unknown'} frames`);

    // Extract frames
    const framesDir = path.join(outputDir, 'white_fade_frames');
    await fs.promises.mkdir(framesDir, { recursive: true });

    console.log('[White Fade] Extracting frames...');
    
    if (actualFrameCount && actualFrameCount > 0) {
      const frameInterval = 1 / fps;
      
      for (let frameNum = 0; frameNum < actualFrameCount; frameNum++) {
        const timestamp = frameNum * frameInterval;
        const frameFileName = `frame_${String(frameNum + 1).padStart(6, '0')}.png`;
        const framePath = path.join(framesDir, frameFileName);
        
        const extractCmd = `ffmpeg -ss ${timestamp.toFixed(6)} -i "${inputPath}" -frames:v 1 -vsync 0 -y "${framePath}"`;
        
        try {
          await execAsync(extractCmd);
          if ((frameNum + 1) % 100 === 0) {
            console.log(`[White Fade] Extracted ${frameNum + 1}/${actualFrameCount} frames...`);
          }
        } catch (error) {
          console.error(`[White Fade] Error extracting frame ${frameNum + 1}:`, error.message);
        }
      }
    } else {
      return res.status(400).json({ error: 'Could not determine frame count' });
    }

    // Get extracted frames
    const frameFiles = (await fs.promises.readdir(framesDir))
      .filter(f => f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });

    console.log(`[White Fade] Processing ${frameFiles.length} frames with white pixel fade...`);

    // Process frames with white pixel fade
    const processedDir = path.join(outputDir, 'white_fade_processed');
    await fs.promises.mkdir(processedDir, { recursive: true });

    const whiteThreshold = 150; // Much more aggressive - catch many more white/off-white pixels
    const testMode = false; // TEST MODE disabled - only target white/off-white pixels
    const batchSize = 20;

    for (let i = 0; i < frameFiles.length; i += batchSize) {
      const batch = frameFiles.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (frameFile) => {
        const framePath = path.join(framesDir, frameFile);
        const processedPath = path.join(processedDir, frameFile);
        
        try {
          // Load frame and get dimensions
          const frameMetadata = await sharp(framePath).metadata();
          const frameWidth = frameMetadata.width;
          const frameHeight = frameMetadata.height;
          const frameSize = Math.min(frameWidth, frameHeight);
          
          // Resize to square if needed, maintaining aspect ratio
          const resizedBuffer = await sharp(framePath)
            .resize(frameSize, frameSize, {
              kernel: 'lanczos3',
              fit: 'cover',
              position: 'center'
            })
            .ensureAlpha()
            .raw()
            .toBuffer();
          
          const videoData = Buffer.from(resizedBuffer);
          const centerX = frameSize / 2;
          const centerY = frameSize / 2;
          const maxDistance = frameSize / 2;
          const fadeStartDistance = maxDistance * 0.8; // Outer 20%
          const fadeEndDistance = maxDistance;
          const fadeRange = fadeEndDistance - fadeStartDistance;
          const fadeStartDistanceSq = fadeStartDistance * fadeStartDistance;
          const fadeEndDistanceSq = fadeEndDistance * fadeEndDistance;
          
          // Apply white/off-white fade
          const startY = Math.floor(centerY - fadeEndDistance);
          const endY = Math.ceil(centerY + fadeEndDistance);
          const startX = Math.floor(centerX - fadeEndDistance);
          const endX = Math.ceil(centerX + fadeEndDistance);
          
          for (let y = Math.max(0, startY); y < Math.min(frameSize, endY); y++) {
            for (let x = Math.max(0, startX); x < Math.min(frameSize, endX); x++) {
              const idx = (y * frameSize + x) * 4;
              const r = videoData[idx];
              const g = videoData[idx + 1];
              const b = videoData[idx + 2];
              const a = videoData[idx + 3];
              
              // Calculate distance from center first
              const dx = x - centerX;
              const dy = y - centerY;
              const distanceSq = dx * dx + dy * dy;
              
              // TEST MODE: Make ALL pixels in outer 20% transparent (regardless of color)
              if (testMode) {
                if (distanceSq >= fadeStartDistanceSq && distanceSq <= fadeEndDistanceSq) {
                  const distanceFromCenter = Math.sqrt(distanceSq);
                  // Smooth ease-in-out curve for gradual transition
                const t = (distanceFromCenter - fadeStartDistance) / fadeRange; // Normalized 0-1
                const smoothT = t * t * (3 - 2 * t); // Smooth step (ease-in-out)
                const fadeFactor = Math.max(0, 1 - smoothT);
                  videoData[idx + 3] = Math.floor(a * fadeFactor);
                  if (videoData[idx + 3] === 0) {
                    videoData[idx] = 0; videoData[idx + 1] = 0; videoData[idx + 2] = 0;
                  }
                } else if (distanceSq > fadeEndDistanceSq) {
                  videoData[idx + 3] = 0;
                  videoData[idx] = 0; videoData[idx + 1] = 0; videoData[idx + 2] = 0;
                }
                continue;
              }
              
              // Normal mode: Only process white/off-white pixels
              const avgBrightness = (r + g + b) / 3;
              const isWhite = (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) || avgBrightness > 170;
              if (a === 0 || !isWhite) {
                continue;
              }
              
              const distanceFromCenter = Math.sqrt(distanceSq);
              
              if (distanceSq >= fadeStartDistanceSq && distanceSq <= fadeEndDistanceSq) {
                // Smooth ease-in-out curve for gradual transition
                const t = (distanceFromCenter - fadeStartDistance) / fadeRange; // Normalized 0-1
                const smoothT = t * t * (3 - 2 * t); // Smooth step (ease-in-out)
                const fadeFactor = Math.max(0, 1 - smoothT);
                videoData[idx + 3] = Math.floor(a * fadeFactor);
                // If fully transparent, set RGB to black to ensure proper transparency
                if (videoData[idx + 3] === 0) {
                  videoData[idx] = 0;     // R
                  videoData[idx + 1] = 0; // G
                  videoData[idx + 2] = 0; // B
                }
              } else if (distanceSq > fadeEndDistanceSq) {
                videoData[idx + 3] = 0;
                // Set RGB to black when fully transparent
                videoData[idx] = 0;     // R
                videoData[idx + 1] = 0; // G
                videoData[idx + 2] = 0; // B
              }
            }
          }
          
          // Ensure non-white pixels are fully opaque (skip in test mode)
          if (!testMode) {
            for (let i = 0; i < videoData.length; i += 4) {
              const r = videoData[i];
              const g = videoData[i + 1];
              const b = videoData[i + 2];
              const avgBrightness = (r + g + b) / 3;
              const isWhite = (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) || avgBrightness > 170;
              if (!isWhite && videoData[i + 3] > 0) {
                videoData[i + 3] = 255;
              }
              // If pixel is transparent, ensure RGB is black
              if (videoData[i + 3] === 0) {
                videoData[i] = 0;     // R
                videoData[i + 1] = 0; // G
                videoData[i + 2] = 0; // B
              }
            }
          } else {
            // In test mode, ensure all transparent pixels have black RGB
            for (let i = 0; i < videoData.length; i += 4) {
              if (videoData[i + 3] === 0) {
                videoData[i] = 0;     // R
                videoData[i + 1] = 0; // G
                videoData[i + 2] = 0; // B
              }
            }
          }
          
          // Save processed frame with alpha channel explicitly preserved
          await sharp(videoData, {
            raw: {
              width: frameSize,
              height: frameSize,
              channels: 4
            }
          })
          .ensureAlpha()  // Ensure alpha channel is present
          .png({ compressionLevel: 9, adaptiveFiltering: true })
          .toFile(processedPath);
          
          // Verify first frame has transparent pixels
          if (i === 0 && batch.indexOf(frameFile) === 0) {
            let transparentCount = 0;
            let totalPixels = 0;
            for (let idx = 0; idx < videoData.length; idx += 4) {
              totalPixels++;
              if (videoData[idx + 3] === 0) {
                transparentCount++;
              }
            }
            console.log(`[White Fade] First frame verification: ${transparentCount}/${totalPixels} pixels are transparent (${((transparentCount/totalPixels)*100).toFixed(2)}%)`);
          }
          
        } catch (error) {
          console.error(`[White Fade] Error processing ${frameFile}:`, error.message);
        }
      }));
      
      if ((i + batchSize) % 100 === 0 || i + batchSize >= frameFiles.length) {
        console.log(`[White Fade] Processed ${Math.min(i + batchSize, frameFiles.length)}/${frameFiles.length} frames...`);
      }
    }

    // Composite processed frames over bright green background, then encode
    console.log('[White Fade] Compositing over bright green background and encoding...');
    const encodeFps = actualFrameCount && duration > 0 ? actualFrameCount / duration : fps;
    
    // Get frame dimensions from first processed frame and verify it has alpha
    const firstFramePath = path.join(processedDir, frameFiles[0]);
    const frameMetadata = await sharp(firstFramePath).metadata();
    const frameWidth = frameMetadata.width;
    const frameHeight = frameMetadata.height;
    const hasAlpha = frameMetadata.hasAlpha;
    console.log(`[White Fade] Frame dimensions: ${frameWidth}x${frameHeight}, hasAlpha: ${hasAlpha}`);
    
    if (!hasAlpha) {
      console.warn('[White Fade] WARNING: Processed frames do not have alpha channel!');
    }
    
    // Create green background video and composite processed frames on top
    // Use ProRes 4444 which is more compatible with VLC and handles alpha correctly
    const encodeCmd = `ffmpeg -y -f lavfi -i "color=c=0x00FF00:s=${frameWidth}x${frameHeight}:d=${duration.toFixed(3)}:r=${encodeFps.toFixed(6)}" -framerate ${encodeFps.toFixed(6)} -i "${processedDir}/frame_%06d.png" -filter_complex "[0:v]format=yuva444p[bg];[1:v]format=yuva444p[fg];[bg][fg]overlay=0:0:shortest=1[out]" -map "[out]" -fps_mode passthrough -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -movflags +faststart "${outputPath}"`;
    
    await execAsync(encodeCmd);

    // Cleanup
    await fs.promises.rm(framesDir, { recursive: true, force: true });
    await fs.promises.rm(processedDir, { recursive: true, force: true });

    console.log('[White Fade] Complete!');

    res.json({
      success: true,
      outputPath: `/uploads/test/${outputName}`,
      outputFile: outputName,
      message: 'White pixel fade applied successfully'
    });

  } catch (error) {
    console.error('[White Fade] Error:', error);
    res.status(500).json({
      error: 'Failed to apply white pixel fade',
      message: error.message
    });
  }
});

/**
 * Get status of frame-by-frame background generation
 * GET /api/video-processing/generate-background-fbf-status
 */
router.get('/generate-background-fbf-status', (req, res) => {
  const status = {
    active: processingStatus.active,
    stage: processingStatus.stage,
    progress: processingStatus.progress,
    total: processingStatus.total,
    percentage: processingStatus.total > 0 ? Math.round((processingStatus.progress / processingStatus.total) * 100) : 0,
    message: processingStatus.message,
    startTime: processingStatus.startTime,
    elapsedTime: processingStatus.startTime ? Date.now() - processingStatus.startTime : null,
    estimatedTimeRemaining: processingStatus.estimatedTimeRemaining
  };
  
  // Always pretty print JSON
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(status, null, 2));
});

/**
 * Test single frame with transparency - processes just the first frame
 * POST /api/video-processing/test-single-frame
 */
router.post('/test-single-frame', async (req, res) => {
  try {
    const { inputPath: inputPathParam = 'test1.mov' } = req.body;
    
    const inputPath = path.join(__dirname, '..', 'uploads', 'test', inputPathParam);
    
    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ error: `Video file not found: ${inputPathParam}` });
    }

    const outputDir = path.join(__dirname, '..', 'uploads', 'test');
    await fs.promises.mkdir(outputDir, { recursive: true });
    const testFramePath = path.join(outputDir, 'test_frame.png');
    const processedFramePath = path.join(outputDir, 'test_frame_processed.png');
    const finalFramePath = path.join(outputDir, 'test_frame_final.png');

    console.log(`[Single Frame Test] Extracting first frame from ${inputPathParam}...`);

    // Extract first frame
    const extractCmd = `ffmpeg -y -i "${inputPath}" -frames:v 1 -vsync 0 "${testFramePath}"`;
    await execAsync(extractCmd);

    // Get frame dimensions
    const frameMetadata = await sharp(testFramePath).metadata();
    const frameWidth = frameMetadata.width;
    const frameHeight = frameMetadata.height;
    const frameSize = Math.min(frameWidth, frameHeight);

    console.log(`[Single Frame Test] Frame: ${frameWidth}x${frameHeight}, processing at ${frameSize}x${frameSize}...`);

    // Process frame with white pixel detection (only white/off-white pixels in outer 20%)
    const whiteThreshold = 150;
    const resizedBuffer = await sharp(testFramePath)
      .resize(frameSize, frameSize, {
        kernel: 'lanczos3',
        fit: 'cover',
        position: 'center'
      })
      .ensureAlpha()
      .raw()
      .toBuffer();

    const videoData = Buffer.from(resizedBuffer);
    const centerX = frameSize / 2;
    const centerY = frameSize / 2;
    const maxDistance = frameSize / 2;
    const fadeStartDistance = maxDistance * 0.8; // Outer 20%
    const fadeEndDistance = maxDistance;
    const fadeRange = fadeEndDistance - fadeStartDistance;
    const fadeStartDistanceSq = fadeStartDistance * fadeStartDistance;
    const fadeEndDistanceSq = fadeEndDistance * fadeEndDistance;

    // Only process white/off-white pixels in outer 20%
    const startY = Math.floor(centerY - fadeEndDistance);
    const endY = Math.ceil(centerY + fadeEndDistance);
    const startX = Math.floor(centerX - fadeEndDistance);
    const endX = Math.ceil(centerX + fadeEndDistance);

    for (let y = Math.max(0, startY); y < Math.min(frameSize, endY); y++) {
      for (let x = Math.max(0, startX); x < Math.min(frameSize, endX); x++) {
        const idx = (y * frameSize + x) * 4;
        const r = videoData[idx];
        const g = videoData[idx + 1];
        const b = videoData[idx + 2];
        const a = videoData[idx + 3];
        
        // Check if pixel is white/off-white
        const avgBrightness = (r + g + b) / 3;
        const isWhite = (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) || avgBrightness > 170;
        if (a === 0 || !isWhite) {
          continue;
        }
        
        const dx = x - centerX;
        const dy = y - centerY;
        const distanceSq = dx * dx + dy * dy;
        
        const distanceFromCenter = Math.sqrt(distanceSq);
        
        if (distanceSq >= fadeStartDistanceSq && distanceSq <= fadeEndDistanceSq) {
          // Smooth ease-in-out curve for gradual transition
          const t = (distanceFromCenter - fadeStartDistance) / fadeRange; // Normalized 0-1
          const smoothT = t * t * (3 - 2 * t); // Smooth step (ease-in-out)
          const fadeFactor = Math.max(0, 1 - smoothT);
          videoData[idx + 3] = Math.floor(a * fadeFactor);
          if (videoData[idx + 3] === 0) {
            videoData[idx] = 0; videoData[idx + 1] = 0; videoData[idx + 2] = 0;
          }
        } else if (distanceSq > fadeEndDistanceSq) {
          videoData[idx + 3] = 0;
          videoData[idx] = 0; videoData[idx + 1] = 0; videoData[idx + 2] = 0;
        }
      }
    }
    
    // Ensure non-white pixels are fully opaque
    for (let i = 0; i < videoData.length; i += 4) {
      const r = videoData[i];
      const g = videoData[i + 1];
      const b = videoData[i + 2];
      const avgBrightness = (r + g + b) / 3;
      const isWhite = (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) || avgBrightness > 170;
      if (!isWhite && videoData[i + 3] > 0) {
        videoData[i + 3] = 255;
      }
      if (videoData[i + 3] === 0) {
        videoData[i] = 0; videoData[i + 1] = 0; videoData[i + 2] = 0;
      }
    }

    // Count transparent pixels
    let transparentCount = 0;
    let totalPixels = 0;
    for (let i = 0; i < videoData.length; i += 4) {
      totalPixels++;
      if (videoData[i + 3] === 0) {
        transparentCount++;
      }
    }
    console.log(`[Single Frame Test] Transparent pixels: ${transparentCount}/${totalPixels} (${((transparentCount/totalPixels)*100).toFixed(2)}%)`);

    // Save processed frame
    await sharp(videoData, {
      raw: {
        width: frameSize,
        height: frameSize,
        channels: 4
      }
    })
    .ensureAlpha()
    .png()
    .toFile(processedFramePath);

    // Verify processed frame has alpha
    const processedMetadata = await sharp(processedFramePath).metadata();
    console.log(`[Single Frame Test] Processed frame hasAlpha: ${processedMetadata.hasAlpha}`);

    // Composite over green background - manually blend to ensure alpha is respected
    const greenBackgroundBuffer = Buffer.alloc(frameSize * frameSize * 4);
    for (let i = 0; i < greenBackgroundBuffer.length; i += 4) {
      greenBackgroundBuffer[i] = 0;     // R
      greenBackgroundBuffer[i + 1] = 255; // G
      greenBackgroundBuffer[i + 2] = 0;   // B
      greenBackgroundBuffer[i + 3] = 255; // A (fully opaque)
    }

    // Manually composite: where processed frame is transparent, show green
    for (let i = 0; i < videoData.length; i += 4) {
      const alpha = videoData[i + 3] / 255; // Normalize to 0-1
      if (alpha < 1) {
        // Blend: result = foreground * alpha + background * (1 - alpha)
        greenBackgroundBuffer[i] = Math.round(videoData[i] * alpha + 0 * (1 - alpha));     // R
        greenBackgroundBuffer[i + 1] = Math.round(videoData[i + 1] * alpha + 255 * (1 - alpha)); // G
        greenBackgroundBuffer[i + 2] = Math.round(videoData[i + 2] * alpha + 0 * (1 - alpha));   // B
        greenBackgroundBuffer[i + 3] = 255; // Final composite is always opaque
      } else {
        // Fully opaque foreground pixel
        greenBackgroundBuffer[i] = videoData[i];
        greenBackgroundBuffer[i + 1] = videoData[i + 1];
        greenBackgroundBuffer[i + 2] = videoData[i + 2];
        greenBackgroundBuffer[i + 3] = 255;
      }
    }

    await sharp(greenBackgroundBuffer, {
      raw: {
        width: frameSize,
        height: frameSize,
        channels: 4
      }
    })
    .png()
    .toFile(finalFramePath);

    console.log(`[Single Frame Test] Complete! Check test_frame_final.png`);

    res.json({
      success: true,
      outputPath: `/uploads/test/test_frame_final.png`,
      transparentPixels: `${transparentCount}/${totalPixels} (${((transparentCount/totalPixels)*100).toFixed(2)}%)`,
      hasAlpha: processedMetadata.hasAlpha,
      message: 'Single frame test complete - check test_frame_final.png for green background showing through'
    });

  } catch (error) {
    console.error('[Single Frame Test] Error:', error);
    res.status(500).json({
      error: 'Failed to test single frame',
      message: error.message
    });
  }
});

/**
 * Composite video with transparency over black background (to visualize faded pixels)
 * POST /api/video-processing/composite-on-black
 */
router.post('/composite-on-black', async (req, res) => {
  try {
    const { inputPath: inputPathParam = 'test2.mov', outputName = 'test3.mov' } = req.body;
    
    const inputPath = path.join(__dirname, '..', 'uploads', 'test', inputPathParam);
    
    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ error: `Video file not found: ${inputPathParam}` });
    }

    const outputDir = path.join(__dirname, '..', 'uploads', 'test');
    await fs.promises.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, outputName);

    console.log(`[Green Background] Processing ${inputPathParam}...`);
    console.log(`[Green Background] Output: ${outputName}`);

    // Get video properties to match dimensions
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,r_frame_rate -of json "${inputPath}"`;
    const { stdout } = await execAsync(probeCmd);
    const probeData = JSON.parse(stdout);
    const stream = probeData.streams?.[0];
    
    if (!stream) {
      return res.status(400).json({ error: 'Could not read video properties' });
    }

    const width = stream.width;
    const height = stream.height;
    const duration = parseFloat(stream.duration) || 0;
    
    let fps = 30;
    if (stream.r_frame_rate) {
      const [num, den] = stream.r_frame_rate.split('/').map(Number);
      if (den && den > 0) {
        fps = num / den;
      }
    }

    console.log(`[Green Background] Video: ${width}x${height}, ${fps.toFixed(3)} fps, ${duration.toFixed(3)}s`);

    // Composite input video over bright green background
    // Using FFmpeg: create bright green background, then overlay the input video with alpha channel
    // The input video's alpha channel will show through as green where transparent
    // Use format=yuva444p to ensure alpha is preserved, then overlay with alpha blending
    const compositeCmd = `ffmpeg -y -f lavfi -i "color=c=0x00FF00:s=${width}x${height}:d=${duration.toFixed(3)}:r=${fps.toFixed(3)}" -i "${inputPath}" -filter_complex "[0:v]format=yuva444p[bg];[bg][1:v]overlay=0:0:format=yuva444p:shortest=1" -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -an -movflags +faststart "${outputPath}"`;
    
    console.log(`[Green Background] Compositing ${inputPathParam} over bright green background...`);
    await execAsync(compositeCmd);

    console.log('[Green Background] Complete!');

    res.json({
      success: true,
      outputPath: `/uploads/test/${outputName}`,
      outputFile: outputName,
      message: 'Video composited over bright green background successfully'
    });

  } catch (error) {
    console.error('[Green Background] Error:', error);
    res.status(500).json({
      error: 'Failed to composite video on green background',
      message: error.message
    });
  }
});

// Helper function to generate icon video (480x480, <2MB, highest quality)
// Helper: sample first-frame top row brightest pixel and compute gain
const sampleTopRowWhiteBalanceScale = async (inputPath) => {
  // Extract first frame to a temporary PNG
  const tempFramePath = path.join(path.dirname(inputPath), `wb_frame_${Date.now()}.png`);
  try {
    const extractCmd = `ffmpeg -y -i "${inputPath}" -frames:v 1 "${tempFramePath}"`;
    await execAsync(extractCmd);

    const { data, info } = await sharp(tempFramePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    if (!width || !height || channels < 3) {
      throw new Error('Could not read frame pixels for white balance');
    }

    let topRowMax = -Infinity;
    const stride = channels;

    for (let idx = 0; idx < data.length; idx += stride) {
      const pixelIndex = idx / stride;
      const y = Math.floor(pixelIndex / width);
      if (y !== 0) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const maxChannel = Math.max(r, g, b);

      if (maxChannel > topRowMax) {
        topRowMax = maxChannel;
      }
    }

    if (!Number.isFinite(topRowMax) || topRowMax <= 0) {
      throw new Error('Brightest pixel on top row not found');
    }

    const scale = 255 / topRowMax;
    return { scale };
  } finally {
    fs.promises.unlink(tempFramePath).catch(() => {});
  }
};

// Helper: apply uniform RGB gain while preserving hue
const applyUniformGain = async (inputPath, outputPath, scale) => {
  const scaleStr = scale.toFixed(6);
  const cmd = `ffmpeg -y -i "${inputPath}" -vf "colorchannelmixer=rr=${scaleStr}:gg=${scaleStr}:bb=${scaleStr}" -c:v prores_ks -profile:v 3 -an "${outputPath}"`;
  await execAsync(cmd);
};

// Helper function to generate icon video (480x480, <2MB, highest quality)
const generateIconVideo = async (inputPath, outputPath, itemNumber) => {
  console.log(`[generateIconVideo] Starting icon generation for item ${itemNumber}`);
  console.log(`   Input: ${inputPath}`);
  console.log(`   Output: ${outputPath}`);
  console.log(`   Input exists: ${fs.existsSync(inputPath)}`);
  
  const status = itemProcessingStatus.get(itemNumber);
  if (status) {
    status.stage = 'creating-icon';
    status.message = 'Creating icon version...';
    status.progress = 0;
    status.total = 100;
    itemProcessingStatus.set(itemNumber, status);
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Try different quality settings until we get under 2MB
  // Use CRF 18 for very high quality, with fallbacks if file size exceeds 2MB
  const qualitySettings = [
    { crf: 18, scale: '480:480' }, // Very high quality (target)
    { crf: 20, scale: '480:480' }, // High quality fallback
    { crf: 22, scale: '480:480' }, // Good quality fallback
    { crf: 24, scale: '480:480' }, // Medium quality fallback
  ];
  
  const maxSizeMB = 2; // Target file size: 2MB or under

  for (let i = 0; i < qualitySettings.length; i++) {
    const setting = qualitySettings[i];
    if (status) {
      status.message = `Creating icon (${setting.scale}, CRF ${setting.crf})...`;
      status.progress = Math.floor((i / qualitySettings.length) * 100);
      itemProcessingStatus.set(itemNumber, status);
    }
    
    console.log(`[generateIconVideo] Trying quality setting ${i + 1}/${qualitySettings.length}: CRF ${setting.crf}, scale ${setting.scale}`);
    
    const tempOutput = outputPath.replace('.mp4', '_temp.mp4');
    const cmd = `ffmpeg -y -i "${inputPath}" -vf "scale=${setting.scale}:force_original_aspect_ratio=decrease,pad=${setting.scale}:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -crf ${setting.crf} -preset slow -an -movflags +faststart "${tempOutput}"`;
    
    try {
    await execAsync(cmd);
      console.log(`[generateIconVideo] FFmpeg command completed for setting ${i + 1}`);
    } catch (error) {
      console.error(`[generateIconVideo] FFmpeg failed for setting ${i + 1}:`, error.message);
      // Try next setting
      await fs.promises.unlink(tempOutput).catch(() => {});
      continue;
    }
    
    // Check if temp file was created
    if (!fs.existsSync(tempOutput)) {
      console.warn(`[generateIconVideo] Temp output file not created for setting ${i + 1}`);
      continue;
    }
    
    // Check file size
    const stats = await fs.promises.stat(tempOutput);
    const sizeMB = stats.size / (1024 * 1024);
    console.log(`[generateIconVideo] Setting ${i + 1} produced file size: ${sizeMB.toFixed(2)} MB`);
    
    if (sizeMB < maxSizeMB) {
      // Success - move to final location
      console.log(`[generateIconVideo] ✅ File size acceptable (${sizeMB.toFixed(2)} MB < ${maxSizeMB} MB)`);
      await fs.promises.rename(tempOutput, outputPath);
      
      // Verify final file exists
      if (fs.existsSync(outputPath)) {
        console.log(`[generateIconVideo] ✅ Icon video created successfully: ${outputPath}`);
      if (status) {
        status.message = 'Icon created successfully';
        status.progress = 100;
          itemProcessingStatus.set(itemNumber, status);
      }
      return { success: true, sizeMB, quality: setting };
      } else {
        throw new Error(`Failed to create icon video: file not found after rename`);
      }
    } else {
      // Too large, try next setting
      console.log(`[generateIconVideo] File too large (${sizeMB.toFixed(2)} MB >= ${maxSizeMB} MB), trying next setting...`);
      await fs.promises.unlink(tempOutput).catch(() => {});
    }
  }
  
  // If all settings failed, use the last one anyway (best effort)
  console.log(`[generateIconVideo] All quality settings exceeded 2MB, using last attempt anyway`);
  const finalTemp = outputPath.replace('.mp4', '_temp.mp4');
  if (fs.existsSync(finalTemp)) {
    await fs.promises.rename(finalTemp, outputPath);
    if (fs.existsSync(outputPath)) {
      const finalStats = await fs.promises.stat(outputPath);
      const finalSizeMB = finalStats.size / (1024 * 1024);
      console.log(`[generateIconVideo] ✅ Icon video created (exceeds 2MB): ${finalSizeMB.toFixed(2)} MB`);
  if (status) {
        status.message = `Icon created (${finalSizeMB.toFixed(2)} MB, exceeds 2MB target)`;
    status.progress = 100;
        itemProcessingStatus.set(itemNumber, status);
      }
      return { success: true, sizeMB: finalSizeMB, quality: qualitySettings[qualitySettings.length - 1] };
    }
  }
  
  // If we get here, icon generation completely failed
  throw new Error(`Failed to generate icon video after trying all quality settings`);
};

/**
 * Upload processed videos to Cloudinary and update database
 * @param {number} itemNumber - Item number
 * @param {string} mainVideoPath - Path to main video file
 * @param {string} iconVideoPath - Path to icon video file
 * @param {object} status - Processing status object to update
 * @returns {Promise<object>} Object with cloudinaryVideoUrl and cloudinaryIconUrl
 */
const uploadVideosToCloudinary = async (itemNumber, mainVideoPath, iconVideoPath, status) => {
  const results = {
    cloudinaryVideoUrl: null,
    cloudinaryIconUrl: null,
    error: null
  };
  
  console.log(`[uploadVideosToCloudinary] Starting upload for item ${itemNumber}`);
  console.log(`   Main video path: ${mainVideoPath}`);
  console.log(`   Icon video path: ${iconVideoPath}`);
  console.log(`   Main video exists: ${fs.existsSync(mainVideoPath)}`);
  console.log(`   Icon video exists: ${fs.existsSync(iconVideoPath)}`);
  
  // Check Cloudinary configuration
  const cloudinaryConfig = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY ? '***' + process.env.CLOUDINARY_API_KEY.slice(-4) : 'NOT SET',
    api_secret: process.env.CLOUDINARY_API_SECRET ? '***' + process.env.CLOUDINARY_API_SECRET.slice(-4) : 'NOT SET'
  };
  console.log(`[uploadVideosToCloudinary] Cloudinary config check:`, cloudinaryConfig);
  
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    const error = 'Cloudinary environment variables not configured! Check .env file.';
    console.error(`❌ ${error}`);
    results.error = error;
    return results;
  }
  
  try {
    // Update status
    status.stage = 'cloudinary-upload';
    status.message = 'Uploading videos to Cloudinary...';
    status.progress = 92;
    itemProcessingStatus.set(itemNumber, status);
    
    // Upload main video - CRITICAL: This must succeed
    // Main video path is already verified to exist before this function is called
    status.message = 'Uploading main video to Cloudinary...';
    itemProcessingStatus.set(itemNumber, status);
    
    console.log(`[uploadVideosToCloudinary] Uploading main video: ${mainVideoPath}`);
    console.log(`   Folder: echo-catering/videos`);
    console.log(`   Public ID: ${itemNumber}_full`);
    
    // Use Cloudinary SDK directly (like gallery/logo)
    const { cloudinary } = require('../utils/cloudinary');
    
    const mainVideoResult = await cloudinary.uploader.upload(mainVideoPath, {
      public_id: `${itemNumber}_full`,
      folder: 'echo-catering/videos', // Creates echo-catering/videos/{itemNumber}_full
      resource_type: 'video',
      overwrite: true, // Enable overwrite for re-processing
    });
    
    // CRITICAL: Assert secure_url was returned
    if (!mainVideoResult || !mainVideoResult.secure_url) {
      throw new Error(`Main video upload did not return secure_url. Result: ${JSON.stringify(mainVideoResult)}`);
    }
    
    results.cloudinaryVideoUrl = mainVideoResult.secure_url;
    console.log(`✅ Main video uploaded to Cloudinary: ${mainVideoResult.secure_url}`);
    console.log(`   Public ID: ${mainVideoResult.public_id}`);
    status.progress = 96;
    itemProcessingStatus.set(itemNumber, status);
    
    // Upload icon video - Independent, non-blocking
    // Icon upload failure should not block the main video
    if (fs.existsSync(iconVideoPath)) {
      status.message = 'Uploading icon video to Cloudinary...';
      itemProcessingStatus.set(itemNumber, status);
      
      console.log(`[uploadVideosToCloudinary] Uploading icon video: ${iconVideoPath}`);
      console.log(`   Folder: echo-catering/videos`);
      console.log(`   Public ID: ${itemNumber}_icon`);
      
      try {
        const iconVideoResult = await cloudinary.uploader.upload(iconVideoPath, {
          public_id: `${itemNumber}_icon`,
          folder: 'echo-catering/videos', // Creates echo-catering/videos/{itemNumber}_icon
          resource_type: 'video',
          overwrite: true, // Enable overwrite for re-processing
        });
        
        if (iconVideoResult && iconVideoResult.secure_url) {
          results.cloudinaryIconUrl = iconVideoResult.secure_url;
          console.log(`✅ Icon video uploaded to Cloudinary: ${iconVideoResult.secure_url}`);
          console.log(`   Public ID: ${iconVideoResult.public_id}`);
        } else {
          console.warn(`⚠️  Icon video upload did not return secure_url (non-fatal)`);
        }
        status.progress = 98;
        itemProcessingStatus.set(itemNumber, status);
      } catch (iconError) {
        // Icon upload failure is non-fatal - log but don't throw
        console.warn(`⚠️  Icon video upload failed (non-fatal): ${iconError.message}`);
        if (!results.error) {
          results.error = `Icon upload failed: ${iconError.message}`;
        } else {
          results.error += `; Icon upload failed: ${iconError.message}`;
        }
      }
    } else {
      console.warn(`⚠️  Icon video not found: ${iconVideoPath} (non-fatal)`);
      // Icon video missing is non-fatal - don't add to error
    }
    
    // CRITICAL: Main video URL must exist (already verified above)
    // Update database with Cloudinary URLs
    status.message = 'Updating database with Cloudinary URLs...';
    itemProcessingStatus.set(itemNumber, status);
    
    const updateData = {
      cloudinaryVideoUrl: results.cloudinaryVideoUrl, // Always present (verified above)
      cloudinaryVideoPublicId: mainVideoResult.public_id // Use actual public_id from Cloudinary
    };
    
    if (results.cloudinaryIconUrl) {
      updateData.cloudinaryIconUrl = results.cloudinaryIconUrl;
      // Get icon public_id from the result if it was uploaded
      const iconPublicId = iconVideoPath && fs.existsSync(iconVideoPath) 
        ? `echo-catering/videos/${itemNumber}_icon` 
        : null;
      if (iconPublicId) {
        updateData.cloudinaryIconPublicId = iconPublicId;
      }
    }
    
    console.log(`[uploadVideosToCloudinary] Updating database with:`, updateData);
    
    // Find cocktail by itemNumber and update
    const cocktail = await Cocktail.findOne({ itemNumber: itemNumber });
    if (!cocktail) {
      throw new Error(`Cocktail not found for itemNumber ${itemNumber} - cannot update database`);
    }
    
    Object.assign(cocktail, updateData);
    await cocktail.save();
    console.log(`✅ Database updated with Cloudinary URLs for item ${itemNumber}`);
    console.log(`   cloudinaryVideoUrl: ${cocktail.cloudinaryVideoUrl}`);
    console.log(`   cloudinaryIconUrl: ${cocktail.cloudinaryIconUrl || 'not set'}`);
    
    status.progress = 99;
    itemProcessingStatus.set(itemNumber, status);
    
    return results;
  } catch (error) {
    console.error(`❌ Cloudinary upload failed for item ${itemNumber}:`, error);
    console.error(`   Error stack:`, error.stack);
    // Re-throw error - Cloudinary upload failure is now FATAL
    throw error;
  }
};

// Helper function to process video with per-item status tracking
// This function will be called asynchronously and update per-item status
const processVideoForItem = async (itemNumber) => {
  const status = {
    active: true,
    stage: 'preprocessing',
    progress: 0,
    total: 100,
    message: 'Starting processing...',
    startTime: Date.now(),
    estimatedTimeRemaining: null,
    error: null,
    itemNumber: itemNumber // Include itemNumber so frontend can match it
  };
  
  itemProcessingStatus.set(itemNumber, status);
  
  try {
    // Find uploaded file in temp_files
    const tempDir = path.join(__dirname, '..', 'uploads', 'items', 'temp_files', String(itemNumber));
    const uploadedFiles = await fs.promises.readdir(tempDir).catch(() => []);
    const originalFile = uploadedFiles.find(f => f.startsWith(`${itemNumber}_original`));
    
    if (!originalFile) {
      throw new Error('Original video file not found in temp_files');
    }
    
    const inputPath = path.join(tempDir, originalFile);
    
    // Step 1: Preprocessing (crop to 1:1, trim to 15.58s)
    status.stage = 'preprocessing';
    status.message = 'Cropping and trimming video...';
    status.progress = 5;
    
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${inputPath}"`;
    const { stdout } = await execAsync(probeCmd);
    const probeData = JSON.parse(stdout);
    const stream = probeData.streams?.[0];
    
    if (!stream) {
      throw new Error('Could not read video properties');
    }
    
    const originalWidth = stream.width;
    const originalHeight = stream.height;
    const cropSize = originalHeight;
    const cropX = Math.floor((originalWidth - cropSize) / 2);
    
    const preprocessedPath = path.join(tempDir, `${itemNumber}_preprocessed.mov`);
    const preprocessCmd = `ffmpeg -y -ss 2 -i "${inputPath}" -t 15.58 -vf "crop=${cropSize}:${cropSize}:${cropX}:0" -c:v prores_ks -profile:v 3 -an "${preprocessedPath}"`;
    
    await execAsync(preprocessCmd);
    status.progress = 10;

    // Step 1b: White balance using top-row brightest pixel
    status.stage = 'white-balance';
    status.message = 'Applying white balance...';
    const wbPath = path.join(tempDir, `${itemNumber}_preprocessed_wb.mov`);
    const { scale: wbScale } = await sampleTopRowWhiteBalanceScale(preprocessedPath);
    await applyUniformGain(preprocessedPath, wbPath, wbScale);
    status.progress = 15;
    
    // Cleanup: Delete preprocessed file now that we have white-balanced version
    try {
      await fs.promises.unlink(preprocessedPath);
      console.log(`✅ Cleaned up intermediate preprocessed file for item ${itemNumber}`);
    } catch (cleanupError) {
      console.warn(`⚠️  Could not delete preprocessed file for item ${itemNumber}:`, cleanupError.message);
    }
    
    // Step 2: Generate icon video first (synchronously) since it uses wbPath
    // We need to do this before deleting temp folder
    status.stage = 'icon-generation';
    status.message = 'Generating icon video...';
    status.progress = 18;
    itemProcessingStatus.set(itemNumber, status);
    
    const iconOutputPath = path.join(__dirname, '..', 'uploads', 'items', `${itemNumber}_icon.mp4`);
    console.log(`[processVideoForItem] Generating icon video for item ${itemNumber}`);
    console.log(`   Input path: ${wbPath}`);
    console.log(`   Output path: ${iconOutputPath}`);
    console.log(`   Input exists: ${fs.existsSync(wbPath)}`);
    
    // Ensure items directory exists
    const itemsDir = path.dirname(iconOutputPath);
    await fs.promises.mkdir(itemsDir, { recursive: true });
    
    try {
      const iconResult = await generateIconVideo(wbPath, iconOutputPath, itemNumber);
      console.log(`✅ Icon video generated successfully for item ${itemNumber}:`, iconResult);
      console.log(`   Icon file exists: ${fs.existsSync(iconOutputPath)}`);
      if (fs.existsSync(iconOutputPath)) {
        const iconStats = await fs.promises.stat(iconOutputPath);
        console.log(`   Icon file size: ${(iconStats.size / (1024 * 1024)).toFixed(2)} MB`);
      }
    } catch (err) {
      console.error(`❌ Icon generation error for item ${itemNumber}:`, err);
      console.error(`   Error stack:`, err.stack);
      // Don't fail the whole process if icon fails, but log it clearly
      status.error = status.error ? `${status.error}; Icon generation failed: ${err.message}` : `Icon generation failed: ${err.message}`;
    }
    status.progress = 20;
    itemProcessingStatus.set(itemNumber, status);
    
    // Step 3: Call existing generate-background-fbf endpoint
    // We'll make an HTTP call to the existing endpoint, passing itemNumber so it updates per-item status
    const outputPath = path.join(__dirname, '..', 'uploads', 'items', `${itemNumber}.mp4`);
    const relativePreprocessedPath = wbPath.replace(path.join(__dirname, '..'), '').replace(/\\/g, '/').replace(/^\//, '');
    
    status.stage = 'processing';
    status.message = 'Starting video processing...';
    
    // Make HTTP call to existing endpoint
    const http = require('http');
    const requestData = JSON.stringify({
      videoPath: relativePreprocessedPath,
      maxDuration: 15.58,
      preprocess: false, // Already preprocessed
      encodingCRF: 30,
      outputFilename: `${itemNumber}.mp4`,
      itemNumber: itemNumber, // Pass itemNumber so endpoint updates per-item status
      outputDir: 'items' // Specify output directory
    });
    
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 5002,
      path: '/api/video-processing/generate-background-fbf',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };
    
    // Sync global status to per-item status while processing
    const statusSyncInterval = setInterval(() => {
      if (processingStatus.active) {
        status.stage = processingStatus.stage || status.stage;
        status.message = processingStatus.message || status.message;
        if (processingStatus.total > 0) {
          status.progress = Math.min(90, 10 + Math.floor((processingStatus.progress / processingStatus.total) * 80));
        }
        status.total = 100;
        itemProcessingStatus.set(itemNumber, status);
      }
    }, 500);
    
    let mainVideoPath = null;
    
    try {
      await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            clearInterval(statusSyncInterval);
            if (res.statusCode === 200) {
              try {
                const responseData = JSON.parse(data);
                // Get absolute output path directly from response
                if (responseData.outputPath) {
                  mainVideoPath = responseData.outputPath;
                  console.log(`[processVideoForItem] Main video path returned from generation: ${mainVideoPath}`);
              } else {
                  // Fallback: construct path from outputUrl if outputPath not provided
                  const relativePath = responseData.outputUrl || `/uploads/items/${itemNumber}.mp4`;
                  mainVideoPath = path.join(__dirname, '..', relativePath.replace(/^\//, ''));
                  console.log(`[processVideoForItem] Constructed main video path from outputUrl: ${mainVideoPath}`);
                }
                  resolve();
              } catch (parseError) {
                reject(new Error(`Failed to parse response: ${parseError.message}. Response: ${data}`));
              }
            } else {
              reject(new Error(`Processing failed: ${res.statusCode} - ${data}`));
            }
          });
        });
        
        req.on('error', (error) => {
          clearInterval(statusSyncInterval);
          reject(error);
        });
        
        req.write(requestData);
        req.end();
      });
      
      // CRITICAL: Assert main video path was received
      if (!mainVideoPath) {
        throw new Error('Main video path not returned from generation step');
      }
      
      // CRITICAL: Assert main video file exists and has non-zero size
      if (!fs.existsSync(mainVideoPath)) {
        throw new Error(`Main video file does not exist: ${mainVideoPath}`);
      }
      
      const mainVideoStats = await fs.promises.stat(mainVideoPath);
      if (mainVideoStats.size === 0) {
        throw new Error(`Main video file is empty (0 bytes): ${mainVideoPath}`);
      }
      
      console.log(`[processVideoForItem] ✅ Main video verified: ${mainVideoPath} (${(mainVideoStats.size / (1024 * 1024)).toFixed(2)} MB)`);
      
      status.progress = 90;
      status.message = 'Finalizing...';
      itemProcessingStatus.set(itemNumber, status);
      
    } catch (error) {
      clearInterval(statusSyncInterval);
      throw error;
    }
    
    // CRITICAL: Enforce hard invariant - main video MUST exist before Cloudinary upload
    if (!mainVideoPath || !fs.existsSync(mainVideoPath)) {
      const error = `Main video file does not exist before Cloudinary upload: ${mainVideoPath || 'null'}`;
      console.error(`[processVideoForItem] ❌ ${error}`);
      status.active = false;
      status.stage = 'error';
      status.error = error;
      status.message = `Error: ${error}`;
      itemProcessingStatus.set(itemNumber, status);
      throw new Error(error);
    }
    
    // Verify main video has non-zero size
    const mainVideoStats = await fs.promises.stat(mainVideoPath);
    if (mainVideoStats.size === 0) {
      const error = `Main video file is empty (0 bytes): ${mainVideoPath}`;
      console.error(`[processVideoForItem] ❌ ${error}`);
      status.active = false;
      status.stage = 'error';
      status.error = error;
      status.message = `Error: ${error}`;
      itemProcessingStatus.set(itemNumber, status);
      throw new Error(error);
    }
    
    // Icon video path (may or may not exist - that's OK)
    const iconVideoPath = path.join(__dirname, '..', 'uploads', 'items', `${itemNumber}_icon.mp4`);
    const iconVideoExists = fs.existsSync(iconVideoPath);
    
    // Log invariant before Cloudinary upload
    console.log(`[processVideoForItem] ✅ Invariant check before Cloudinary upload:`);
    console.log(`   Main video path: ${mainVideoPath}`);
    console.log(`   Main video exists: true`);
    console.log(`   Main video size: ${(mainVideoStats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   Icon video path: ${iconVideoPath}`);
    console.log(`   Icon video exists: ${iconVideoExists}`);
    if (iconVideoExists) {
      const iconStats = await fs.promises.stat(iconVideoPath);
      console.log(`   Icon video size: ${(iconStats.size / (1024 * 1024)).toFixed(2)} MB`);
    }
    
    // ✅ Upload to Cloudinary and update database
    // This step is now guaranteed to have a valid main video file
    console.log(`[processVideoForItem] Starting Cloudinary upload for item ${itemNumber}...`);
    
    let cloudinaryResults;
    try {
      cloudinaryResults = await uploadVideosToCloudinary(
        itemNumber,
        mainVideoPath,
        iconVideoPath,
        status
      );
      
      // CRITICAL: If main video upload failed, this is a fatal error
      if (!cloudinaryResults.cloudinaryVideoUrl) {
        const error = `Main video Cloudinary upload failed: ${cloudinaryResults.error || 'No URL returned'}`;
        console.error(`[processVideoForItem] ❌ ${error}`);
        status.active = false;
        status.stage = 'error';
        status.error = error;
        status.message = `Error: ${error}`;
        itemProcessingStatus.set(itemNumber, status);
        throw new Error(error);
      }
      
      console.log(`[processVideoForItem] ✅ Cloudinary upload complete for item ${itemNumber}`);
      console.log(`   Main video: ${cloudinaryResults.cloudinaryVideoUrl}`);
      console.log(`   Icon video: ${cloudinaryResults.cloudinaryIconUrl || 'not uploaded (non-fatal)'}`);
      
    } catch (cloudinaryError) {
      // Cloudinary upload failure is FATAL - do not mark as complete
      console.error(`[processVideoForItem] ❌ Cloudinary upload error (FATAL):`, cloudinaryError);
      console.error(`   Error stack:`, cloudinaryError.stack);
      status.active = false;
      status.stage = 'error';
      status.error = `Cloudinary upload failed: ${cloudinaryError.message}`;
      status.message = `Error: ${cloudinaryError.message}`;
      itemProcessingStatus.set(itemNumber, status);
      throw cloudinaryError; // Re-throw to prevent cleanup and completion
    }
    
    // CRITICAL: Only cleanup AFTER successful Cloudinary upload and database update
    // Cleanup should never run if Cloudinary upload fails (caught above)
    
    // Delete temp folder (contains all intermediate processing files)
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      console.log(`✅ Cleaned up temp folder for item ${itemNumber} (after successful Cloudinary upload)`);
    } catch (cleanupError) {
      console.warn(`⚠️  Failed to delete temp folder for item ${itemNumber}:`, cleanupError.message);
      // Non-fatal - don't fail processing
    }
    
    // Delete final video files from uploads/items (Cloudinary-only storage)
    // Main video
    try {
      if (fs.existsSync(mainVideoPath)) {
        await fs.promises.unlink(mainVideoPath);
        console.log(`✅ Deleted local main video file: ${mainVideoPath}`);
      }
    } catch (deleteError) {
      console.warn(`⚠️  Failed to delete local main video file:`, deleteError.message);
      // Non-fatal - Cloudinary upload already succeeded
    }
    
    // Icon video (if it exists)
    if (iconVideoPath && fs.existsSync(iconVideoPath)) {
      try {
        await fs.promises.unlink(iconVideoPath);
        console.log(`✅ Deleted local icon video file: ${iconVideoPath}`);
      } catch (deleteError) {
        console.warn(`⚠️  Failed to delete local icon video file:`, deleteError.message);
        // Non-fatal - Cloudinary upload already succeeded
      }
    }
    
    // Only mark as complete if we got here (main video exists, uploaded successfully, DB updated)
    status.stage = 'complete';
    status.message = 'Processing complete!';
    status.progress = 100;
    status.active = false;
    
  } catch (error) {
    // CRITICAL: On any fatal error, mark processing as failed and inactive
    status.active = false;
    status.stage = 'error';
    status.error = error.message;
    status.message = `Error: ${error.message}`;
    itemProcessingStatus.set(itemNumber, status);
    
    console.error(`[processVideoForItem] ❌ Fatal error processing item ${itemNumber}:`, error);
    console.error(`   Error stack:`, error.stack);
    
    // Do NOT cleanup on error - keep files for debugging
    // Original file and temp folder remain for manual inspection
    
    throw error;
  }
};

// Configure multer for base video uploads to temp_files
const tempUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const itemNumber = req.params.itemNumber;
    const uploadDir = path.join(__dirname, '..', 'uploads', 'items', 'temp_files', String(itemNumber));
    // Remove existing temp folder if it exists (cleanup before new upload)
    fs.promises.rm(uploadDir, { recursive: true, force: true })
      .catch(() => {}) // Ignore errors if folder doesn't exist
      .then(() => fs.promises.mkdir(uploadDir, { recursive: true }))
      .then(() => cb(null, uploadDir))
      .catch(cb);
  },
  filename: (req, file, cb) => {
    const itemNumber = req.params.itemNumber;
    const ext = path.extname(file.originalname) || '.mov';
    cb(null, `${itemNumber}_original${ext}`);
  }
});

const tempUpload = multer({
  storage: tempUploadStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|mov|avi|webm|mkv/i;
    if (allowedTypes.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  }
});

/**
 * Upload base video to temp_files
 * POST /api/video-processing/upload-base/:itemNumber
 */
router.post('/upload-base/:itemNumber', tempUpload.single('video'), async (req, res) => {
  try {
    const itemNumber = parseInt(req.params.itemNumber);
    if (!itemNumber || !Number.isFinite(itemNumber)) {
      return res.status(400).json({ error: 'Invalid itemNumber' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({
      success: true,
      message: 'Video uploaded successfully',
      filePath: req.file.path,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Upload base video error:', error);
    res.status(500).json({ error: 'Upload failed', message: error.message });
  }
});

/**
 * Get processing status for an item
 * GET /api/video-processing/status/:itemNumber
 */
router.get('/status/:itemNumber', async (req, res) => {
  try {
    const itemNumber = parseInt(req.params.itemNumber);
    if (!itemNumber || !Number.isFinite(itemNumber)) {
      return res.status(400).json({ error: 'Invalid itemNumber' });
    }
    
    const status = itemProcessingStatus.get(itemNumber);
    if (!status) {
      return res.json({
        active: false,
        stage: null,
        progress: 0,
        total: 0,
        message: 'No processing in progress',
        itemNumber
      });
    }
    
    res.json({
      ...status,
      itemNumber
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Failed to get status', message: error.message });
  }
});

/**
 * Get all active processing jobs
 * GET /api/video-processing/active-jobs
 */
router.get('/active-jobs', (req, res) => {
  try {
    const activeJobs = [];
    for (const [itemNumber, status] of itemProcessingStatus.entries()) {
      if (status.active) {
        activeJobs.push({
          itemNumber,
          ...status
        });
      }
    }
    res.json({
      count: activeJobs.length,
      jobs: activeJobs
    });
  } catch (error) {
    console.error('Get active jobs error:', error);
    res.status(500).json({ error: 'Failed to get active jobs', message: error.message });
  }
});

/**
 * Process video for an item (full pipeline)
 * POST /api/video-processing/process/:itemNumber
 */
router.post('/process/:itemNumber', async (req, res) => {
  const itemNumber = parseInt(req.params.itemNumber);
  
  if (!itemNumber || !Number.isFinite(itemNumber)) {
    return res.status(400).json({ error: 'Invalid itemNumber' });
  }
  
  // Check if already processing
  const existingStatus = itemProcessingStatus.get(itemNumber);
  if (existingStatus && existingStatus.active) {
    return res.status(409).json({ error: 'Processing already in progress for this item' });
  }
  
  // Verify uploaded file exists
  const tempDir = path.join(__dirname, '..', 'uploads', 'items', 'temp_files', String(itemNumber));
  const uploadedFiles = await fs.promises.readdir(tempDir).catch(() => []);
  const originalFile = uploadedFiles.find(f => f.startsWith(`${itemNumber}_original`));
  
  if (!originalFile) {
    return res.status(404).json({ error: 'No uploaded video found. Please upload a video first.' });
  }
  
  // Start processing asynchronously (don't await)
  processVideoForItem(itemNumber).catch(error => {
    console.error(`Error processing item ${itemNumber}:`, error);
    const status = itemProcessingStatus.get(itemNumber);
    if (status) {
      status.active = false;
      status.error = error.message;
      status.message = `Error: ${error.message}`;
    }
  });
  
  res.json({
    success: true,
    message: 'Processing started',
    itemNumber
  });
});

/**
 * Process icon video only
 * POST /api/video-processing/process-icon/:itemNumber
 */
router.post('/process-icon/:itemNumber', tempUpload.single('video'), async (req, res) => {
  try {
    const itemNumber = parseInt(req.params.itemNumber);
    if (!itemNumber || !Number.isFinite(itemNumber)) {
      return res.status(400).json({ error: 'Invalid itemNumber' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const status = {
      active: true,
      stage: 'creating-icon',
      progress: 0,
      total: 100,
      message: 'Creating icon version...',
      startTime: Date.now(),
      estimatedTimeRemaining: null,
      error: null
    };
    
    itemProcessingStatus.set(itemNumber, status);
    
    const iconOutputPath = path.join(__dirname, '..', 'uploads', 'cocktails', `${itemNumber}_icon.mp4`);
    const tempDir = path.dirname(req.file.path);
    const wbInputPath = req.file.path;
    const wbPath = path.join(tempDir, `${itemNumber}_icon_wb.mov`);

    // Apply white balance before icon encoding
    try {
      status.stage = 'white-balance';
      status.message = 'Applying white balance...';
      const { scale: wbScale } = await sampleTopRowWhiteBalanceScale(wbInputPath);
      await applyUniformGain(wbInputPath, wbPath, wbScale);
      status.stage = 'creating-icon';
      status.message = 'Creating icon version...';
      status.progress = 10;
    } catch (error) {
      status.active = false;
      status.error = error.message;
      status.message = `Error: ${error.message}`;
      return res.status(500).json({ error: 'Failed to start icon processing', message: error.message });
    }
    
    // Process icon in background
    generateIconVideo(wbPath, iconOutputPath, itemNumber)
      .then(() => {
        status.active = false;
        status.progress = 100;
        status.message = 'Icon created successfully';
      })
      .catch(error => {
        status.active = false;
        status.error = error.message;
        status.message = `Error: ${error.message}`;
      });
    
    res.json({
      success: true,
      message: 'Icon processing started',
      itemNumber
    });
  } catch (error) {
    console.error('Process icon error:', error);
    res.status(500).json({ error: 'Failed to start icon processing', message: error.message });
  }
});

module.exports = router;

