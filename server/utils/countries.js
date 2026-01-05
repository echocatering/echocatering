const fs = require('fs');
const path = require('path');
const aliasMap = require('../../src/shared/countryAliasMap.json');

const ISO_CODE_REGEX = /^[A-Za-z]{2}$/i;

let cachedCountries = null;
let cachedCodesSet = null;

const attributeRegex = /([a-zA-Z_:]+)\s*=\s*"([^"]*)"/g;
const pathRegex = /<path\b([^>]*)>/g;

const resolveCountryCode = ({ id, nameAttr, classAttr }) => {
  if (id && ISO_CODE_REGEX.test(id)) {
    return String(id).toUpperCase();
  }
  if (nameAttr && aliasMap[nameAttr]) {
    return aliasMap[nameAttr];
  }
  if (classAttr && aliasMap[classAttr]) {
    return aliasMap[classAttr];
  }
  return null;
};

function parseCountriesFromSVG(svgContent) {
  const countries = [];
  const seen = new Set();
  let match;

  while ((match = pathRegex.exec(svgContent)) !== null) {
    const attrString = match[1];
    const attrs = {};
    let attrMatch;
    while ((attrMatch = attributeRegex.exec(attrString)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    const code = resolveCountryCode({
      id: attrs.id,
      nameAttr: attrs.name,
      classAttr: attrs.class
    });
    if (!code || seen.has(code)) continue;
    seen.add(code);
    countries.push({
      code,
      name: attrs.name || attrs.class || code,
      svgId: attrs.id || code
    });
  }

  const aliasEntries = Object.entries(aliasMap);
  aliasEntries.forEach(([name, code]) => {
    const upper = String(code).toUpperCase();
    if (!seen.has(upper) && ISO_CODE_REGEX.test(upper)) {
      seen.add(upper);
      countries.push({
        code: upper,
        name,
        svgId: upper
      });
    }
  });

  return countries;
}

function loadCountries() {
  if (cachedCountries) return cachedCountries;
  // Fallback: parse from SVG
  const svgPath = path.join(__dirname, '..', '..', 'public', 'resources', 'worldmap.svg');
  try {
    const svg = fs.readFileSync(svgPath, 'utf8');
    cachedCountries = parseCountriesFromSVG(svg);
    cachedCodesSet = new Set(cachedCountries.map(c => String(c.code).toUpperCase()));
  } catch (e) {
    cachedCountries = [];
    cachedCodesSet = new Set();
  }
  return cachedCountries;
}

function getCountries() {
  return loadCountries();
}

function getCountryByCode(code) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  return loadCountries().find(c => c.code === upper) || null;
}

function isValidCountryCode(code) {
  if (!code) return false;
  if (!cachedCodesSet) loadCountries();
  return cachedCodesSet.has(String(code).toUpperCase());
}

module.exports = {
  getCountries,
  getCountryByCode,
  isValidCountryCode
};


