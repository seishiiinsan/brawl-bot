const stamp = () => new Date().toLocaleString('fr-FR');

export const logger = {
  info: (message) => console.log(`[${stamp()}] ℹ️  ${message}`),
  warn: (message) => console.warn(`[${stamp()}] ⚠️  ${message}`),
  error: (message) => console.error(`[${stamp()}] ❌ ${message}`),
};
