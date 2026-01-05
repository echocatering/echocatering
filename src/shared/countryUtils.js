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
  return countrySource
    .map((entry) => {
      if (!entry) return null;
      const code = String(entry.code || '').toUpperCase();
      if (!code) return null;
      return {
        code,
        name: entry.name || code
      };
    })
    .filter(Boolean);
};

export { ISO_CODE_REGEX };

export const getCountryDisplayList = (cocktail) => {
  if (!cocktail) return [];
  if (Array.isArray(cocktail.countries) && cocktail.countries.length) {
    return formatCountryList(cocktail.countries);
  }

  const fallbackCodes = Array.isArray(cocktail.countryCodes)
    ? cocktail.countryCodes
    : Array.isArray(cocktail.regions)
      ? cocktail.regions
      : [];

  return fallbackCodes
    .map((code) => {
      const upper = String(code || '').toUpperCase();
      if (!upper) return null;
      return {
        code: upper,
        name: upper
      };
    })
    .filter(Boolean);
};

