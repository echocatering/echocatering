/**
 * generatePosIcons.js
 * 
 * Generates PWA icons for the POS app from the SVG logo.
 * Creates 192x192 and 512x512 PNG icons with purple background.
 * 
 * Run with: node scripts/active/generate/generatePosIcons.js
 * 
 * Requirements: sharp (npm install sharp)
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.error('sharp is not installed. Run: npm install sharp');
    console.log('\nAlternatively, create icons manually:');
    console.log('1. Open the SVG in a graphics editor');
    console.log('2. Add a purple (#800080) background');
    console.log('3. Export as 192x192 and 512x512 PNG');
    console.log('4. Save to public/assets/icons/pos-icon-192.png and pos-icon-512.png');
    process.exit(1);
  }

  const svgPath = path.join(__dirname, '../../../public/assets/icons/LOGO_favicon.svg');
  const outputDir = path.join(__dirname, '../../../public/assets/icons');

  // Read the SVG
  let svgContent = fs.readFileSync(svgPath, 'utf8');
  
  // The SVG has white strokes, so we need a colored background
  // Modify SVG to add a purple background rectangle
  svgContent = svgContent.replace(
    '<svg ',
    '<svg style="background-color: #800080" '
  );

  const sizes = [192, 512];

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `pos-icon-${size}.png`);
    
    // Create a purple background with the logo on top
    const background = Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#800080"/>
      </svg>`
    );

    try {
      // Create background
      const bgImage = await sharp(background)
        .resize(size, size)
        .png()
        .toBuffer();

      // Resize SVG
      const logoImage = await sharp(Buffer.from(svgContent))
        .resize(Math.floor(size * 0.7), Math.floor(size * 0.7), { fit: 'contain' })
        .png()
        .toBuffer();

      // Composite logo on background
      await sharp(bgImage)
        .composite([{
          input: logoImage,
          gravity: 'center'
        }])
        .png()
        .toFile(outputPath);

      console.log(`✅ Created ${outputPath}`);
    } catch (err) {
      console.error(`❌ Failed to create ${size}x${size} icon:`, err.message);
    }
  }

  console.log('\n✅ Icon generation complete!');
}

generateIcons().catch(console.error);
