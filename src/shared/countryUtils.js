import countryAliasMap from './countryAliasMap.json';

const ISO_CODE_REGEX = /^[A-Za-z]{2}$/;

export const buildCountryList = (rawList = []) => {
  const byCode = new Map();

  rawList.forEach((item) => {
    if (!item) return;
    const code = String(item.code || '').toUpperCase();
    if (!ISO_CODE_REGEX.test(code)) return;
    const name = item.name || item.title || code;
    if (!byCode.has(code)) {
      byCode.set(code, { code, name, svgId: item.svgId || code });
    }
  });

  Object.entries(countryAliasMap).forEach(([name, code]) => {
    const upper = String(code).toUpperCase();
    if (ISO_CODE_REGEX.test(upper) && !byCode.has(upper)) {
      byCode.set(upper, { code: upper, name, svgId: upper });
    }
  });

  return Array.from(byCode.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export const buildCountryMap = (countries = []) => {
  return countries.reduce((acc, entry) => {
    if (!entry) return acc;
    const code = String(entry.code || '').toUpperCase();
    if (!code) return acc;
    acc[code] = {
      code,
      name: entry.name || code,
      svgId: entry.svgId || code
    };
    return acc;
  }, {});
};

export const formatCountryList = (countrySource = []) => {
  if (!Array.isArray(countrySource)) return [];
  const byCode = new Map();
  
  countrySource.forEach((entry) => {
    if (!entry) return;
    const code = String(entry.code || '').toUpperCase();
    if (!code) return;
    // Only add if we haven't seen this code before (deduplicate)
    if (!byCode.has(code)) {
      // Use entry.name if it exists and is different from code, otherwise look up the name
      const providedName = entry.name || entry.title;
      const name = (providedName && providedName !== code) 
        ? providedName 
        : getCountryNameFromCode(code);
      byCode.set(code, {
        code,
        name: name
      });
    }
  });
  
  return Array.from(byCode.values());
};

export { ISO_CODE_REGEX };

// Create a reverse lookup map: code -> name
const createCodeToNameMap = () => {
  const codeToName = new Map();
  Object.entries(countryAliasMap).forEach(([name, code]) => {
    const upper = String(code).toUpperCase();
    if (ISO_CODE_REGEX.test(upper)) {
      // If multiple names map to the same code, keep the first one
      if (!codeToName.has(upper)) {
        codeToName.set(upper, name);
      }
    }
  });
  return codeToName;
};

// Cache the code-to-name map
const codeToNameMap = createCodeToNameMap();

// Helper to get country name from code
// This uses the alias map, but ideally should fetch from API for complete coverage
const getCountryNameFromCode = (code) => {
  const upper = String(code || '').toUpperCase();
  const name = codeToNameMap.get(upper);
  if (name) return name;
  
  // Common country codes not in alias map - add more as needed
  const commonCountries = {
    'IN': 'India',
    'PE': 'Peru',
    'MX': 'Mexico',
    'BR': 'Brazil',
    'DE': 'Germany',
    'ES': 'Spain',
    'PT': 'Portugal',
    'NL': 'Netherlands',
    'BE': 'Belgium',
    'CH': 'Switzerland',
    'AT': 'Austria',
    'SE': 'Sweden',
    'NO': 'Norway',
    'FI': 'Finland',
    'PL': 'Poland',
    'CZ': 'Czech Republic',
    'HU': 'Hungary',
    'RO': 'Romania',
    'BG': 'Bulgaria',
    'HR': 'Croatia',
    'RS': 'Serbia',
    'SI': 'Slovenia',
    'SK': 'Slovakia',
    'IE': 'Ireland',
    'IS': 'Iceland',
    'LU': 'Luxembourg',
    'MT': 'Malta',
    'CY': 'Cyprus',
    'EE': 'Estonia',
    'LV': 'Latvia',
    'LT': 'Lithuania',
    'JP': 'Japan',
    'KR': 'South Korea',
    'CN': 'China',
    'TH': 'Thailand',
    'VN': 'Vietnam',
    'PH': 'Philippines',
    'MY': 'Malaysia',
    'SG': 'Singapore',
    'ID': 'Indonesia',
    'AU': 'Australia',
    'NZ': 'New Zealand',
    'ZA': 'South Africa',
    'EG': 'Egypt',
    'MA': 'Morocco',
    'TN': 'Tunisia',
    'DZ': 'Algeria',
    'KE': 'Kenya',
    'GH': 'Ghana',
    'NG': 'Nigeria',
    'AR': 'Argentina',
    'CL': 'Chile',
    'CO': 'Colombia',
    'VE': 'Venezuela',
    'EC': 'Ecuador',
    'BO': 'Bolivia',
    'PY': 'Paraguay',
    'UY': 'Uruguay',
    'CR': 'Costa Rica',
    'PA': 'Panama',
    'GT': 'Guatemala',
    'HN': 'Honduras',
    'NI': 'Nicaragua',
    'SV': 'El Salvador',
    'DO': 'Dominican Republic',
    'CU': 'Cuba',
    'JM': 'Jamaica',
    'TT': 'Trinidad and Tobago',
    'BB': 'Barbados',
    'BS': 'Bahamas',
    'RU': 'Russia',
    'UA': 'Ukraine',
    'BY': 'Belarus',
    'KZ': 'Kazakhstan',
    'GE': 'Georgia',
    'AM': 'Armenia',
    'AZ': 'Azerbaijan',
    'TR': 'Turkey',
    'IL': 'Israel',
    'SA': 'Saudi Arabia',
    'AE': 'United Arab Emirates',
    'QA': 'Qatar',
    'KW': 'Kuwait',
    'BH': 'Bahrain',
    'OM': 'Oman',
    'JO': 'Jordan',
    'LB': 'Lebanon',
    'SY': 'Syria',
    'IQ': 'Iraq',
    'IR': 'Iran',
    'PK': 'Pakistan',
    'BD': 'Bangladesh',
    'LK': 'Sri Lanka',
    'NP': 'Nepal',
    'BT': 'Bhutan',
    'MM': 'Myanmar',
    'LA': 'Laos',
    'KH': 'Cambodia',
    'BN': 'Brunei',
    'TL': 'East Timor',
    'FJ': 'Fiji',
    'PG': 'Papua New Guinea',
    'SB': 'Solomon Islands',
    'VU': 'Vanuatu',
    'NC': 'New Caledonia',
    'PF': 'French Polynesia',
    'WS': 'Samoa',
    'TO': 'Tonga',
    'KI': 'Kiribati',
    'TV': 'Tuvalu',
    'NR': 'Nauru',
    'PW': 'Palau',
    'FM': 'Micronesia',
    'MH': 'Marshall Islands'
  };
  
  return commonCountries[upper] || upper;
};

export const getCountryDisplayList = (cocktail) => {
  if (!cocktail) return [];
  
  // First, try to use the countries array if it exists
  if (Array.isArray(cocktail.countries) && cocktail.countries.length) {
    const result = formatCountryList(cocktail.countries);
    // Debug: log if names are missing
    result.forEach(entry => {
      if (entry.name === entry.code) {
        console.warn(`[countryUtils] Country ${entry.code} has no name, looked up: ${getCountryNameFromCode(entry.code)}`);
      }
    });
    return result;
  }

  // Fallback to countryCodes or regions
  const fallbackCodes = Array.isArray(cocktail.countryCodes)
    ? cocktail.countryCodes
    : Array.isArray(cocktail.regions)
      ? cocktail.regions
      : [];

  // Deduplicate fallback codes and look up country names
  const byCode = new Map();
  fallbackCodes.forEach((code) => {
    const upper = String(code || '').toUpperCase();
    if (!upper) return;
    // Only add if we haven't seen this code before (deduplicate)
    if (!byCode.has(upper)) {
      const lookedUpName = getCountryNameFromCode(upper);
      // Debug: log if lookup failed
      if (lookedUpName === upper) {
        console.warn(`[countryUtils] Could not find country name for code: ${upper}`);
      }
      byCode.set(upper, {
        code: upper,
        name: lookedUpName
      });
    }
  });
  
  return Array.from(byCode.values());
};

