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

// Load the highlighting function (same as generateMapSnapshots.js)
const aliasMap = require('../src/shared/countryAliasMap.json');
const ISO_CODE_REGEX = /^[A-Za-z]{2}$/;

function getCodeFromAttributes(id, name, className, aliasMap) {
  if (id && ISO_CODE_REGEX.test(id)) {
    return id.toUpperCase();
  }
  if (name && aliasMap[name]) {
    return aliasMap[name].toUpperCase();
  }
  if (className && aliasMap[className]) {
    return aliasMap[className].toUpperCase();
  }
  return null;
}

function highlightCountriesInSVG(svgContent, countryCodes) {
  if (!countryCodes || countryCodes.length === 0) {
    return svgContent;
  }

  const selectedCodes = new Set(countryCodes.map(code => String(code).toUpperCase()));
  let modifiedSvg = svgContent;
  
  // Update root SVG
  modifiedSvg = modifiedSvg.replace(/<svg([^>]*)>/i, (match, attrs) => {
    let newAttrs = attrs.replace(/fill\s*=\s*["'][^"']*["']/gi, '')
                        .replace(/stroke\s*=\s*["'][^"']*["']/gi, '')
                        .replace(/stroke-width\s*=\s*["'][^"']*["']/gi, '')
                        .replace(/stroke-linecap\s*=\s*["'][^"']*["']/gi, '')
                        .replace(/stroke-linejoin\s*=\s*["'][^"']*["']/gi, '');
    newAttrs += ' fill="#ececec" stroke="#ececec"';
    return `<svg${newAttrs}>`;
  });
  
  // Process all path elements
  modifiedSvg = modifiedSvg.replace(/<path\b([^>]*)>/g, (match, attrs) => {
    const idMatch = attrs.match(/id\s*=\s*["']([^"']+)["']/i);
    const classMatch = attrs.match(/class\s*=\s*["']([^"']+)["']/i);
    const nameMatch = attrs.match(/name\s*=\s*["']([^"']+)["']/i);
    
    const id = idMatch ? idMatch[1] : null;
    const className = classMatch ? classMatch[1] : null;
    const name = nameMatch ? nameMatch[1] : null;
    
    const code = getCodeFromAttributes(id, name, className, aliasMap);
    const isSelected = code && selectedCodes.has(code);
    
    const fillColor = isSelected ? '#666666' : '#ececec';
    const strokeColor = fillColor;
    
    let newAttrs = attrs;
    newAttrs = newAttrs.replace(/fill\s*=\s*["'][^"']*["']/gi, '');
    newAttrs = newAttrs.replace(/stroke\s*=\s*["'][^"']*["']/gi, '');
    newAttrs = newAttrs.replace(/stroke-width\s*=\s*["'][^"']*["']/gi, '');
    newAttrs = newAttrs.replace(/stroke-linecap\s*=\s*["'][^"']*["']/gi, '');
    newAttrs = newAttrs.replace(/stroke-linejoin\s*=\s*["'][^"']*["']/gi, '');
    newAttrs = newAttrs.replace(/style\s*=\s*["'][^"']*["']/gi, '');
    
    newAttrs = newAttrs.trim();
    if (newAttrs && !newAttrs.endsWith(' ')) {
      newAttrs += ' ';
    }
    newAttrs += `fill="${fillColor}" stroke="none" stroke-width="0" style="fill:${fillColor} !important;stroke:none !important;stroke-width:0 !important;"`;
    
    return `<path ${newAttrs}>`;
  });
  
  return modifiedSvg;
}

async function verifyMapSnapshots() {
  try {
    console.log('🔍 Verifying map snapshot SVG generation...\n');
    
    const baseSvg = fs.readFileSync(svgPath, 'utf8');
    const cocktails = await Cocktail.find({}).sort({ itemId: 1 });
    
    console.log(`📋 Checking ${cocktails.length} cocktail(s)\n`);
    
    for (const cocktail of cocktails) {
      if (!cocktail.itemId || !cocktail.regions || cocktail.regions.length === 0) {
        continue;
      }
      
      console.log(`\n📝 Checking: ${cocktail.name} (${cocktail.itemId})`);
      console.log(`   Regions: ${cocktail.regions.join(', ')}`);
      
      // Generate highlighted SVG
      const highlightedSvg = highlightCountriesInSVG(baseSvg, cocktail.regions);
      
      // Check all paths for stroke attributes
      const paths = highlightedSvg.match(/<path[^>]*>/g) || [];
      console.log(`   Total paths: ${paths.length}`);
      
      // Count paths with different stroke settings
      let strokeNone = 0;
      let strokeColor = 0;
      let strokeWidth0 = 0;
      let hasStroke = 0;
      let hasStyleStroke = 0;
      
      // Sample a few paths to inspect
      const samplePaths = paths.slice(0, 5);
      
      paths.forEach(path => {
        if (path.includes('stroke="none"')) strokeNone++;
        if (path.includes('stroke-width="0"')) strokeWidth0++;
        if (path.match(/stroke="[^"]*"/) && !path.includes('stroke="none"')) {
          strokeColor++;
          const strokeMatch = path.match(/stroke="([^"]*)"/);
          if (strokeMatch && strokeMatch[1] !== 'none') {
            hasStroke++;
          }
        }
        if (path.includes('stroke:none')) hasStyleStroke++;
      });
      
      console.log(`   Paths with stroke="none": ${strokeNone}`);
      console.log(`   Paths with stroke-width="0": ${strokeWidth0}`);
      console.log(`   Paths with other stroke colors: ${strokeColor}`);
      console.log(`   Paths with stroke:none in style: ${hasStyleStroke}`);
      
      // Check sample paths
      console.log(`\n   Sample paths (first 3):`);
      samplePaths.forEach((p, i) => {
        const strokeMatch = p.match(/stroke="([^"]*)"/);
        const strokeWidthMatch = p.match(/stroke-width="([^"]*)"/);
        const styleMatch = p.match(/style="([^"]*)"/);
        console.log(`   ${i + 1}. stroke="${strokeMatch ? strokeMatch[1] : 'NOT FOUND'}", stroke-width="${strokeWidthMatch ? strokeWidthMatch[1] : 'NOT FOUND'}"`);
        if (styleMatch) {
          console.log(`      style: ${styleMatch[1].substring(0, 100)}...`);
        }
      });
      
      // Check for any paths that still have visible strokes
      const problematicPaths = paths.filter(p => {
        const hasVisibleStroke = p.includes('stroke="#') || 
                                 (p.match(/stroke="([^"]*)"/) && !p.match(/stroke="(none|#ececec)"/));
        return hasVisibleStroke;
      });
      
      if (problematicPaths.length > 0) {
        console.log(`\n   ⚠️  Found ${problematicPaths.length} paths with visible strokes:`);
        problematicPaths.slice(0, 3).forEach((p, i) => {
          console.log(`   ${i + 1}. ${p.substring(0, 150)}...`);
        });
      } else {
        console.log(`\n   ✅ All paths have stroke="none" or stroke-width="0"`);
      }
      
      // Save a test SVG file for manual inspection
      const testSvgPath = path.join(cocktailsDir, `test-${cocktail.itemId}.svg`);
      fs.writeFileSync(testSvgPath, highlightedSvg);
      console.log(`   💾 Test SVG saved to: ${testSvgPath}`);
    }
    
  } catch (error) {
    console.error('❌ Verification error:', error);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

verifyMapSnapshots();

