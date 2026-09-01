const VALID = /^[0289PYLQGRJCUV]{3,15}$/;

/** Normalise un tag Brawl Stars : "#2g0jr8vq", "2G0JR8VQ" -> "#2G0JR8VQ". */
export function normalizeTag(input) {
  if (!input) return null;
  const cleaned = String(input)
    .trim()
    .toUpperCase()
    .replace(/^#/, '')
    .replace(/O/g, '0')
    .replace(/[^0-9A-Z]/g, '');
  if (!VALID.test(cleaned)) return null;
  return `#${cleaned}`;
}

/** Encodage pour l'URL de l'API (le # doit devenir %23). */
export function encodeTag(tag) {
  return encodeURIComponent(tag.startsWith('#') ? tag : `#${tag}`);
}
