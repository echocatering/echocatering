const mongoose = require('mongoose');
const Cocktail = require('../server/models/Cocktail');
const fs = require('fs');
const path = require('path');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

const svgPath = path.join(__dirname, '../../public/assets/images/worldmap.svg');
const cocktailsDir = path.join(__dirname, '../server/uploads/items');

// Function to get country code from path attributes (same logic as frontend)
function getCodeFromAttributes(id, name, className, aliasMap) {
  const ISO_CODE_REGEX = /^[A-Za-z]{2}$/;
  
  // Check id attribute first
  if (id && ISO_CODE_REGEX.test(id)) {
    return id.toUpperCase();
  }
  
  // Check name attribute
  if (name && aliasMap[name]) {
    return aliasMap[name].toUpperCase();
  }
  
  // Check class attribute
  if (className && aliasMap[className]) {
    return aliasMap[className].toUpperCase();
  }
  
  return null;
}

// Function to highlight countries in SVG (matches frontend logic exactly)
function highlightCountriesInSVG(svgContent, countryCodes) {
  if (!countryCodes || countryCodes.length === 0) {
    return svgContent;
  }

  const selectedCodes = new Set(countryCodes.map(code => String(code).toUpperCase()));
  
  // Load country alias map for name-to-code matching
  let aliasMap = {};
  try {
    aliasMap = require('../src/shared/countryAliasMap.json');
  } catch (e) {
    console.warn('⚠️  Could not load country alias map');
  }
  
  // Process SVG to highlight selected countries
  // Use the same logic as frontend getCodeFromAttributes
  let modifiedSvg = svgContent;
  
  // First, update root SVG to explicitly remove all stroke attributes
  // This ensures no stroke is inherited by child paths
  modifiedSvg = modifiedSvg.replace(/<svg([^>]*)>/i, (match, attrs) => {
    // Remove ALL stroke-related attributes from root SVG
    let newAttrs = attrs.replace(/fill\s*=\s*["'][^"']*["']/gi, '')
                        .replace(/stroke\s*=\s*["'][^"']*["']/gi, '')
                        .replace(/stroke-width\s*=\s*["'][^"']*["']/gi, '')
                        .replace(/stroke-linecap\s*=\s*["'][^"']*["']/gi, '')
                        .replace(/stroke-linejoin\s*=\s*["'][^"']*["']/gi, '');
    // Explicitly set stroke to lighter gray (#f5f5f5) on root
    // This ensures all paths inherit the correct stroke color
    const defaultStroke = '#fcfcfc';  // Very light gray for borders (two shades lighter)
    newAttrs += ` fill="#ececec" stroke="${defaultStroke}" stroke-width="0.4" style="stroke:${defaultStroke} !important;stroke-width:0.4 !important;"`;
    return `<svg${newAttrs}>`;
  });
  
  // Process all path elements
  modifiedSvg = modifiedSvg.replace(/<path\b([^>]*)>/g, (match, attrs) => {
    // Extract id, class, and name attributes (handle both single and double quotes)
    const idMatch = attrs.match(/id\s*=\s*["']([^"']+)["']/i);
    const classMatch = attrs.match(/class\s*=\s*["']([^"']+)["']/i);
    const nameMatch = attrs.match(/name\s*=\s*["']([^"']+)["']/i);
    
    const id = idMatch ? idMatch[1] : null;
    const className = classMatch ? classMatch[1] : null;
    const name = nameMatch ? nameMatch[1] : null;
    
    // Get country code using same logic as frontend
    const code = getCodeFromAttributes(id, name, className, aliasMap);
    
    // Determine if this country is selected
    const isSelected = code && selectedCodes.has(code);
    
    // Set colors based on selection
    // Selected: dark gray fill (#666666), Unselected: light gray fill (#ececec)
    // ALL borders use an even lighter gray than unhighlighted fill
    const unhighlightedFill = '#ececec';  // Light gray for unhighlighted countries
    const highlightedFill = '#666666';   // Dark gray for highlighted countries
    const fillColor = isSelected ? highlightedFill : unhighlightedFill;
    const strokeColor = '#fcfcfc'; // Very light gray for borders (two shades lighter)
    
    // Build new path tag with correct colors
    let newAttrs = attrs;
    
    // Remove existing fill, stroke, stroke-width, and style attributes
    // This ensures we have complete control over the colors
    newAttrs = newAttrs.replace(/fill\s*=\s*["'][^"']*["']/gi, '');
    newAttrs = newAttrs.replace(/stroke\s*=\s*["'][^"']*["']/gi, '');
    newAttrs = newAttrs.replace(/stroke-width\s*=\s*["'][^"']*["']/gi, '');
    newAttrs = newAttrs.replace(/stroke-linecap\s*=\s*["'][^"']*["']/gi, '');
    newAttrs = newAttrs.replace(/stroke-linejoin\s*=\s*["'][^"']*["']/gi, '');
    newAttrs = newAttrs.replace(/style\s*=\s*["'][^"']*["']/gi, '');
    
    // Clean up any extra spaces
    newAttrs = newAttrs.trim();
    
    // Add explicit fill, stroke, and style attributes
    // Stroke is an even lighter gray (#f5f5f5) than unhighlighted fill
    if (newAttrs && !newAttrs.endsWith(' ')) {
      newAttrs += ' ';
    }
    // Set stroke to lighter gray (#f5f5f5) with !important
    // stroke-width is 0.4 to make borders visible on highlighted countries
    const strokeColorValue = '#fcfcfc';  // Very light gray for borders (two shades lighter)
    newAttrs += `fill="${fillColor}" stroke="${strokeColorValue}" stroke-width="0.4" style="fill:${fillColor} !important;stroke:${strokeColorValue} !important;stroke-width:0.4 !important;"`;
    
    return `<path ${newAttrs}>`;
  });
  
  return modifiedSvg;
}

// Function to convert SVG to PNG using sharp
async function convertSVGToPNG(svgContent, outputPath) {
  try {
    const sharp = require('sharp');
    
    // Convert SVG to PNG using sharp
    // Sharp can handle SVG directly
    const buffer = Buffer.from(svgContent);
    
    // Use transparent background for PNG
    const backgroundColor = { r: 0, g: 0, b: 0, alpha: 0 };  // Transparent
    
    // Use higher density for crisp rendering
    // Increase density to reduce anti-aliasing artifacts that create visible borders
    await sharp(buffer, { 
      density: 600,  // Higher density to reduce anti-aliasing
      unlimited: true  // Allow unlimited SVG size
    })
      .resize(1200, 600, {
        fit: 'contain',
        background: backgroundColor,  // Transparent background
        kernel: sharp.kernel.lanczos3  // High-quality resampling
      })
      .png({ 
        quality: 100,
        compressionLevel: 6,
        palette: false,  // Disable palette mode to preserve exact colors
        effort: 10,  // Maximum compression effort
        colors: 256  // Ensure enough colors for grayscale rendering
      })
      .toFile(outputPath);
    
    return true;
  } catch (error) {
    console.error('❌ Error converting SVG to PNG:', error.message);
    if (error.message.includes('Input buffer contains unsupported image format')) {
      console.error('   SVG might be malformed. Check the SVG structure.');
    }
    console.log('💡 Make sure sharp is installed: npm install sharp');
    return false;
  }
}

async function generateMapSnapshots() {
  try {
    console.log('🔄 Starting map snapshot generation for existing cocktails...\n');
    
    // Check if SVG file exists
    if (!fs.existsSync(svgPath)) {
      console.error(`❌ SVG file not found: ${svgPath}`);
      process.exit(1);
    }
    
    // Read the base SVG
    const baseSvg = fs.readFileSync(svgPath, 'utf8');
    console.log('✅ Loaded world map SVG\n');
    
    // Get all cocktails
    const cocktails = await Cocktail.find({}).sort({ itemId: 1 });
    console.log(`📋 Found ${cocktails.length} cocktail(s) to process\n`);
    
    if (cocktails.length === 0) {
      console.log('ℹ️  No cocktails to process');
      process.exit(0);
    }
    
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const cocktail of cocktails) {
      try {
        // Get itemNumber - use itemNumber if available, otherwise parse from itemId
        let itemNumber = cocktail.itemNumber;
        if (!itemNumber && cocktail.itemId) {
          const match = String(cocktail.itemId).match(/^item(\d+)$/);
          itemNumber = match ? parseInt(match[1], 10) : null;
        }
        
        if (!itemNumber) {
          console.log(`⏭️  Skipping ${cocktail.name} (no itemNumber or itemId)`);
          skippedCount++;
          continue;
        }
        
        if (!cocktail.regions || cocktail.regions.length === 0) {
          console.log(`⏭️  Skipping ${cocktail.name} (no regions selected)`);
          skippedCount++;
          continue;
        }
        
        console.log(`\n📝 Processing: ${cocktail.name} (itemNumber: ${itemNumber})`);
        console.log(`   Regions: ${cocktail.regions.join(', ')}`);
        
        // Highlight countries in SVG
        const highlightedSvg = highlightCountriesInSVG(baseSvg, cocktail.regions);
        
        // Debug: Check if highlighting worked by counting highlighted paths
        const highlightedCount = (highlightedSvg.match(/fill="#666666"/g) || []).length;
        const unhighlightedCount = (highlightedSvg.match(/fill="#ececec"/g) || []).length;
        console.log(`   Debug: Found ${highlightedCount} highlighted paths, ${unhighlightedCount} unhighlighted paths`);
        
        // Ensure SVG has proper attributes for rendering
        // Don't add a background rectangle - we want transparent background
        // The light gray countries will be visible with their #ececec fill
        let processedSvg = highlightedSvg;
        
        // Output path - use itemNumber format: 36.png
        const outputPath = path.join(cocktailsDir, `${itemNumber}.png`);
        
        // Convert SVG to PNG
        console.log(`   Converting SVG to PNG...`);
        const success = await convertSVGToPNG(processedSvg, outputPath);
        
        if (success) {
          // Update database - use itemNumber format: 36.png
          cocktail.mapSnapshotFile = `${itemNumber}.png`;
          await cocktail.save();
          
          const stats = fs.statSync(outputPath);
          const sizeKB = (stats.size / 1024).toFixed(2);
          console.log(`   ✅ Generated: ${itemNumber}.png (${sizeKB} KB)`);
          successCount++;
        } else {
          console.log(`   ❌ Failed to convert SVG to PNG`);
          errorCount++;
        }
        
      } catch (error) {
        console.error(`   ❌ Error processing ${cocktail.name}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n📊 Generation Summary:`);
    console.log(`   ✅ Generated: ${successCount} PNG file(s)`);
    console.log(`   ⏭️  Skipped: ${skippedCount} cocktail(s)`);
    console.log(`   ❌ Errors: ${errorCount} cocktail(s)`);
    console.log(`   📁 Total: ${cocktails.length} cocktail(s)`);
    
    if (successCount > 0) {
      console.log(`\n✅ Map snapshot generation completed!`);
      console.log(`\n📝 Next steps:`);
      console.log(`   1. Verify PNG files in server/uploads/items/`);
      console.log(`   2. Check that database entries are updated`);
    }
    
  } catch (error) {
    console.error('❌ Generation error:', error);
    process.exit(1);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

// Run generation
generateMapSnapshots();

