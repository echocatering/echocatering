const NBSP = '\u00A0';
const NB_HYPHEN = '\u2011';
const NB_SEPARATOR = `${NBSP}${NB_HYPHEN}${NBSP}`;

export function formatIngredientRow(row) {
  if (row === null || row === undefined) return '';
  let str = typeof row === 'string' ? row : String(row);

  str = str
    .replace(/\s*,\s*/g, NB_SEPARATOR)
    .replace(/\s+-\s+/g, NB_SEPARATOR)
    .replace(/\s*\u2011\s*/g, NB_SEPARATOR)
    .replace(new RegExp(`^(${NBSP}*${NB_HYPHEN}${NBSP}*)+`, 'g'), '')
    .replace(new RegExp(`(${NBSP}*${NB_HYPHEN}${NBSP}*)+$`, 'g'), '')
    .trim();

  return str;
}

export function normalizeIngredients(rawIngredients) {
  if (rawIngredients === null || rawIngredients === undefined) return [];

  const cleanToken = (token) => {
    if (token === null || token === undefined) return '';

    const str = typeof token === 'string'
      ? token
      : (typeof token === 'number' || typeof token === 'boolean')
        ? String(token)
        : '';

    if (!str) return '';

    const trimmed = str
      .split('\r')
      .join('')
      .trim();

    return trimmed;
  };

  const splitStringIntoTokens = (value) => {
    const out = [];
    const commaParts = String(value).split(',');

    for (const part of commaParts) {
      const lineParts = String(part).split('\n');
      for (const lp of lineParts) {
        const cleaned = cleanToken(lp);
        if (cleaned) out.push(cleaned);
      }
    }

    return out;
  };

  if (Array.isArray(rawIngredients)) {
    const flattened = rawIngredients.flat(Infinity);
    const out = [];

    for (const item of flattened) {
      if (typeof item === 'string') {
        out.push(...splitStringIntoTokens(item));
        continue;
      }

      const cleaned = cleanToken(item);
      if (cleaned) out.push(cleaned);
    }

    return out;
  }

  if (typeof rawIngredients === 'string') {
    return splitStringIntoTokens(rawIngredients);
  }

  return [];
}
