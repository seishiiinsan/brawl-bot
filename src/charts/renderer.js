import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

// Palette alignee sur le theme sombre de Discord.
export const THEME = {
  background: '#1e1f22',
  panel: '#2b2d31',
  grid: '#3a3d43',
  axis: '#5c6067',
  text: '#dbdee1',
  muted: '#949ba4',
  accent: '#ffcc00',
  series: ['#ffcc00', '#5865f2', '#43b581', '#eb459e', '#00b0f4', '#f57731'],
  positive: '#43b581',
  negative: '#ed4245',
};

const FONT = (size, weight = '400') =>
  `${weight} ${size}px "DejaVu Sans", "Noto Sans", Arial, sans-serif`;

try {
  GlobalFonts.registerFromPath?.('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu Sans');
} catch {
  /* police systeme par defaut */
}

function niceScale(min, max, ticks = 5) {
  if (min === max) {
    // Serie plate : on ouvre artificiellement la fenetre pour eviter une ligne collee au bord.
    const pad = Math.max(1, Math.abs(min) * 0.05);
    min -= pad;
    max += pad;
  }
  const range = max - min;
  const rawStep = range / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return {
    min: Math.floor(min / step) * step,
    max: Math.ceil(max / step) * step,
    step,
  };
}

function formatNumber(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1).replace('.0', '')}k`;
  return String(Math.round(value));
}

function formatTime(timestamp, spanMs) {
  const date = new Date(timestamp);
  if (spanMs <= 36 * 3600_000) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  if (spanMs <= 10 * 86_400_000) {
    // Sur quelques jours, la date seule se repete d'une graduation a l'autre.
    return date
      .toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit' })
      .replace(', ', ' ')
      .replace(/:\d+$/, 'h');
  }
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

/** Valeur exacte, lisible : les trophees se comptent a l'unite. */
function formatExact(value) {
  return Math.round(value).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
}

/** Attenue une couleur hex vers le fond : degrade du haut vers le bas d'un classement. */
function shade(hex, factor) {
  const value = parseInt(hex.slice(1), 16);
  const mix = (channel) => Math.round(channel * factor + 0x1e * (1 - factor));
  return `rgb(${mix((value >> 16) & 255)}, ${mix((value >> 8) & 255)}, ${mix(value & 255)})`;
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function header(ctx, width, title, subtitle) {
  ctx.fillStyle = THEME.text;
  ctx.font = FONT(26, '700');
  ctx.textAlign = 'left';
  ctx.fillText(title, 32, 44);
  if (subtitle) {
    ctx.fillStyle = THEME.muted;
    ctx.font = FONT(15);
    ctx.fillText(subtitle, 32, 68);
  }
  ctx.fillStyle = THEME.grid;
  ctx.fillRect(32, 82, width - 64, 1);
}

/**
 * Courbe temporelle multi-series.
 * series : [{ label, color, points: [{ t, v }] }]
 */
export function renderLineChart({ title, subtitle, series, width = 1000, height = 520, footer }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = THEME.background;
  ctx.fillRect(0, 0, width, height);
  header(ctx, width, title, subtitle);

  const usable = series.filter((s) => s.points.length > 0);
  const plot = { x: 78, y: 110, w: width - 78 - 36, h: height - 110 - (footer ? 76 : 56) };

  if (usable.length === 0) {
    ctx.fillStyle = THEME.muted;
    ctx.font = FONT(18);
    ctx.textAlign = 'center';
    ctx.fillText('Pas encore assez de données pour tracer une courbe.', width / 2, height / 2);
    return canvas.toBuffer('image/png');
  }

  const allPoints = usable.flatMap((s) => s.points);
  const tMin = Math.min(...allPoints.map((p) => p.t));
  const tMax = Math.max(...allPoints.map((p) => p.t));
  const span = Math.max(1, tMax - tMin);
  const scale = niceScale(
    Math.min(...allPoints.map((p) => p.v)),
    Math.max(...allPoints.map((p) => p.v)),
  );

  const px = (t) => plot.x + ((t - tMin) / span) * plot.w;
  const py = (v) => plot.y + plot.h - ((v - scale.min) / (scale.max - scale.min)) * plot.h;

  // Grille horizontale + graduations Y
  ctx.textAlign = 'right';
  ctx.font = FONT(13);
  for (let v = scale.min; v <= scale.max + 1e-9; v += scale.step) {
    const y = py(v);
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, y + 0.5);
    ctx.lineTo(plot.x + plot.w, y + 0.5);
    ctx.stroke();
    ctx.fillStyle = THEME.muted;
    ctx.fillText(formatNumber(v), plot.x - 10, y + 4);
  }

  // Graduations X
  ctx.textAlign = 'center';
  const xTicks = Math.min(7, Math.max(2, Math.floor(plot.w / 130)));
  for (let i = 0; i <= xTicks; i++) {
    const t = tMin + (span * i) / xTicks;
    const x = px(t);
    ctx.strokeStyle = THEME.grid;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, plot.y);
    ctx.lineTo(x + 0.5, plot.y + plot.h);
    ctx.stroke();
    ctx.fillStyle = THEME.muted;
    // Les graduations extremes debordent du cadre : on les aligne vers l'interieur.
    ctx.textAlign = i === 0 ? 'left' : i === xTicks ? 'right' : 'center';
    ctx.fillText(formatTime(t, span), x, plot.y + plot.h + 20);
  }

  usable.forEach((serie, index) => {
    const color = serie.color ?? THEME.series[index % THEME.series.length];
    const points = [...serie.points].sort((a, b) => a.t - b.t);

    // Aire sous la courbe (uniquement en mono-serie, sinon illisible)
    if (usable.length === 1) {
      const gradient = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.h);
      gradient.addColorStop(0, `${color}55`);
      gradient.addColorStop(1, `${color}00`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(px(points[0].t), plot.y + plot.h);
      for (const p of points) ctx.lineTo(px(p.t), py(p.v));
      ctx.lineTo(px(points.at(-1).t), plot.y + plot.h);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.t), py(p.v)) : ctx.lineTo(px(p.t), py(p.v))));
    ctx.stroke();

    // Points : seulement si la serie est courte, sinon ca fait du bruit.
    if (points.length <= 40) {
      ctx.fillStyle = color;
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(px(p.t), py(p.v), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Derniere valeur mise en avant
    const last = points.at(-1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px(last.t), py(last.v), 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.font = FONT(14, '600');
    ctx.textAlign = 'right';
    ctx.fillText(formatExact(last.v), Math.min(px(last.t) + 10, plot.x + plot.w), py(last.v) - 12);
  });

  // Legende
  if (usable.length > 1) {
    let x = plot.x;
    const y = height - 22;
    ctx.font = FONT(14);
    ctx.textAlign = 'left';
    usable.forEach((serie, index) => {
      const color = serie.color ?? THEME.series[index % THEME.series.length];
      ctx.fillStyle = color;
      roundedRect(ctx, x, y - 10, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = THEME.text;
      ctx.fillText(serie.label, x + 18, y);
      x += 28 + ctx.measureText(serie.label).width;
    });
  } else if (footer) {
    ctx.fillStyle = THEME.muted;
    ctx.font = FONT(13);
    ctx.textAlign = 'left';
    ctx.fillText(footer, plot.x, height - 20);
  }

  return canvas.toBuffer('image/png');
}

/**
 * Barres horizontales (top brawlers, repartition par mode...).
 * items : [{ label, value, color, hint }]
 */
export function renderBarChart({ title, subtitle, items, width = 1000, footer, valueFormat }) {
  const rowHeight = 34;
  const top = 110;
  const height = top + items.length * rowHeight + (footer ? 56 : 32);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = THEME.background;
  ctx.fillRect(0, 0, width, height);
  header(ctx, width, title, subtitle);

  const labelWidth = 150;
  const valueWidth = 190;
  const barX = 32 + labelWidth;
  const barW = width - barX - valueWidth - 32;
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const fmt = valueFormat ?? formatExact;

  items.forEach((item, index) => {
    const y = top + index * rowHeight;
    ctx.fillStyle = THEME.muted;
    ctx.font = FONT(14);
    ctx.textAlign = 'right';
    ctx.fillText(item.label.slice(0, 20), barX - 12, y + 20);

    ctx.fillStyle = THEME.panel;
    roundedRect(ctx, barX, y + 7, barW, 18, 9);
    ctx.fill();

    const w = Math.max(4, (Math.abs(item.value) / max) * barW);
    ctx.fillStyle = item.color ?? shade(THEME.accent, 1 - (index / Math.max(1, items.length)) * 0.45);
    roundedRect(ctx, barX, y + 7, w, 18, 9);
    ctx.fill();

    const value = fmt(item.value);
    ctx.fillStyle = THEME.text;
    ctx.font = FONT(14, '600');
    ctx.textAlign = 'left';
    ctx.fillText(value, barX + barW + 12, y + 21);

    if (item.hint) {
      const valueWidthPx = ctx.measureText(value).width;
      ctx.fillStyle = THEME.muted;
      ctx.font = FONT(12);
      ctx.fillText(item.hint, barX + barW + 20 + valueWidthPx, y + 21);
    }
  });

  if (footer) {
    ctx.fillStyle = THEME.muted;
    ctx.font = FONT(13);
    ctx.textAlign = 'left';
    ctx.fillText(footer, 32, height - 18);
  }

  return canvas.toBuffer('image/png');
}
