const NBSP = ' ';

export function num(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Math.round(value).toLocaleString('fr-FR').replace(/\s/g, NBSP);
}

/** Delta signe, avec fleche : +1234 / -56 / = */
export function delta(value) {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '±0';
  const abs = Math.abs(value);
  const text = Number.isInteger(value) ? num(abs) : abs.toFixed(1).replace('.', ',');
  return `${value > 0 ? '+' : '−'}${text}`;
}

export function deltaEmoji(value) {
  if (value === null || value === undefined || value === 0) return '➖';
  return value > 0 ? '📈' : '📉';
}

export function percent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits).replace('.', ',')}${NBSP}%`;
}

/** Duree lisible a partir de secondes. */
export function duration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`;
}

/** "20240115T193000.000Z" -> Date */
export function parseBattleTime(raw) {
  if (!raw) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(raw);
  if (!m) return new Date(raw);
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

/** Timestamp Discord relatif : <t:1700000000:R> */
export function relative(date) {
  if (!date) return '—';
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`;
}

export function truncate(text, max = 1024) {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Petite barre de progression en caracteres pleins. */
export function bar(ratio, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Duree longue, lisible : "3 j 4 h", "5 h 20 min", "40 min". */
export function humanSpan(ms) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} j ${rest} h` : `${days} j`;
}
