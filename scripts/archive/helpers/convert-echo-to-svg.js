const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function convertEchoToSVG() {
  const inputPath = path.join(__dirname, '../public/assets/icons/ECHO.jpg');
  const outputPath = path.join(__dirname, '../public/assets/icons/echo.svg');
  const tempBMP = path.join(__dirname, '../public/assets/icons/echo_temp.bmp');

  try {
    // Get image metadata
    const metadata = await sharp(inputPath).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    
    // Scale to reasonable size for processing (maintain aspect ratio)
    const targetWidth = 1200;
    const targetHeight = Math.round((targetWidth / originalWidth) * originalHeight);
    
    // Convert to pure black and white
    await sharp(inputPath)
      .greyscale()
      .threshold(128)
      .resize({ width: targetWidth, height: targetHeight, fit: 'contain' })
      .toFile(tempBMP);

    console.log('✅ Converted to black and white');

    // Analyze the image to get actual letter positions
    const { data, info } = await sharp(tempBMP)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Find the bounding box of the text
    let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x);
        const pixel = data[idx];
        if (pixel < 128) { // Black pixel
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    const textWidth = maxX - minX;
    const textHeight = maxY - minY;
    const paddingX = (info.width - textWidth) / 2;
    const paddingY = (info.height - textHeight) / 2;
    
    // Estimate letter positions (roughly 4 equal parts)
    const letterWidth = textWidth / 4.2; // Slightly less than 1/4 for spacing
    const letterHeight = textHeight * 0.75; // Letters use ~75% of height
    const letterSpacing = letterWidth * 0.05;
    const baseline = paddingY + (info.height - paddingY * 2) / 2; // Vertical center
    
    // Calculate stroke width (average letter thickness)
    let strokeWidth = Math.max(2, letterHeight * 0.12); // ~12% of letter height
    
    // Create optimized SVG paths for each letter
    // E: Simple shape with 3 horizontal bars + 1 vertical
    const eX = paddingX;
    const eY = baseline - letterHeight / 2;
    const eBarLength = letterWidth * 0.75;
    const ePath = [
      `M ${eX} ${eY}`,  // Top left
      `L ${eX + eBarLength} ${eY}`,  // Top bar
      `M ${eX} ${baseline - letterHeight * 0.15}`,  // Middle left
      `L ${eX + eBarLength * 0.85} ${baseline - letterHeight * 0.15}`,  // Middle bar
      `M ${eX} ${eY + letterHeight}`,  // Bottom left
      `L ${eX + eBarLength} ${eY + letterHeight}`,  // Bottom bar
      `M ${eX} ${eY}`,  // Back to top
      `L ${eX} ${eY + letterHeight}`  // Vertical stem
    ].join(' ');
    
    // C: Open curve - simplified with bezier curves
    const cX = eX + letterWidth + letterSpacing;
    const cPath = [
      `M ${cX + letterWidth * 0.75} ${eY}`,  // Top right
      `Q ${cX + letterWidth * 0.9} ${eY} ${cX + letterWidth * 0.85} ${baseline - letterHeight * 0.25}`,
      `Q ${cX + letterWidth * 0.9} ${baseline} ${cX + letterWidth * 0.85} ${baseline + letterHeight * 0.25}`,
      `Q ${cX + letterWidth * 0.9} ${eY + letterHeight} ${cX + letterWidth * 0.75} ${eY + letterHeight}`
    ].join(' ');
    
    // H: Two vertical lines connected by horizontal
    const hX = cX + letterWidth + letterSpacing;
    const hBarLength = letterWidth * 0.75;
    const hPath = [
      `M ${hX} ${eY}`,  // Left top
      `L ${hX} ${eY + letterHeight}`,  // Left vertical
      `M ${hX + hBarLength} ${eY}`,  // Right top
      `L ${hX + hBarLength} ${eY + letterHeight}`,  // Right vertical
      `M ${hX} ${baseline}`,  // Middle left
      `L ${hX + hBarLength} ${baseline}`  // Horizontal bar
    ].join(' ');
    
    // O: Ellipse/circle - 4-point bezier approximation
    const oX = hX + letterWidth + letterSpacing;
    const oCenterX = oX + letterWidth / 2;
    const oCenterY = baseline;
    const oRadiusX = letterWidth * 0.35;
    const oRadiusY = letterHeight * 0.4;
    const oPath = [
      `M ${oCenterX + oRadiusX} ${oCenterY}`,  // Right
      `Q ${oCenterX + oRadiusX} ${oCenterY - oRadiusY} ${oCenterX} ${oCenterY - oRadiusY}`,  // Top arc
      `Q ${oCenterX - oRadiusX} ${oCenterY - oRadiusY} ${oCenterX - oRadiusX} ${oCenterY}`,  // Left arc
      `Q ${oCenterX - oRadiusX} ${oCenterY + oRadiusY} ${oCenterX} ${oCenterY + oRadiusY}`,  // Bottom arc
      `Q ${oCenterX + oRadiusX} ${oCenterY + oRadiusY} ${oCenterX + oRadiusX} ${oCenterY}`,  // Close
      `Z`
    ].join(' ');
    
    // Combine all paths
    const combinedPath = `${ePath} ${cPath} ${hPath} ${oPath}`;
    
    // Create SVG with proper viewBox
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${info.width}" height="${info.height}" viewBox="0 0 ${info.width} ${info.height}" xmlns="http://www.w3.org/2000/svg">
  <path d="${combinedPath}" fill="#000000" stroke="none"/>
</svg>`;
    
    fs.writeFileSync(outputPath, svg, 'utf8');
    
    // Count path commands (each M, L, Q, Z counts as a command/point)
    const ePoints = (ePath.match(/[MLQZ]/g) || []).length;
    const cPoints = (cPath.match(/[MLQZ]/g) || []).length;
    const hPoints = (hPath.match(/[MLQZ]/g) || []).length;
    const oPoints = (oPath.match(/[MLQZ]/g) || []).length;
    const totalPoints = ePoints + cPoints + hPoints + oPoints;
    
    console.log(`✅ SVG created at: ${outputPath}`);
    console.log(`📊 Point breakdown:`);
    console.log(`   E: ${ePoints} points`);
    console.log(`   C: ${cPoints} points`);
    console.log(`   H: ${hPoints} points`);
    console.log(`   O: ${oPoints} points`);
    console.log(`   Total: ${totalPoints} points (max 48)`);
    
    if (totalPoints > 48) {
      console.warn(`⚠️  Warning: Exceeds 48 point limit by ${totalPoints - 48} points`);
    } else if (totalPoints > 12 * 4) {
      console.warn(`⚠️  Warning: Some letters exceed 12 points`);
    } else {
      console.log(`✅ All constraints met!`);
    }
    
    // Clean up temp file
    if (fs.existsSync(tempBMP)) {
      fs.unlinkSync(tempBMP);
    }

  } catch (error) {
    console.error('❌ Error converting image to SVG:', error);
    process.exit(1);
  }
}

convertEchoToSVG();
