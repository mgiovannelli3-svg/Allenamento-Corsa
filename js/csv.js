// Legge il file Activities.csv esportato da Garmin Connect (versione italiana).
// Il formato è particolare: ogni riga è racchiusa tra virgolette, i decimali usano la virgola.

function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function num(s) {
  if (s == null) return null;
  s = String(s).replace(/^'/, '').trim();
  if (!s || s === '--') return null;
  const v = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function hms(s) {
  if (!s || s === '--') return null;
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((a, b) => a * 60 + b, 0);
}

export function parseActivitiesCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]);
  const idx = name => header.findIndex(h => h.trim().toLowerCase() === name);
  const col = { type: idx('tipo di attività'), date: idx('data'), dist: idx('distanza'), time: idx('tempo'), hr: idx('fc media'), max: idx('fc max'), asc: idx('ascesa totale') };
  if (col.date < 0 || col.dist < 0) throw new Error('Il CSV non sembra un export di Garmin Connect');
  const runs = [];
  for (const line of lines.slice(1)) {
    let cells = splitCsvLine(line);
    if (cells.length === 1) cells = splitCsvLine(cells[0]); // riga intera tra virgolette
    const type = (cells[col.type] || '').toLowerCase();
    if (!type.includes('corsa') && !type.includes('running')) continue;
    const m = (cells[col.date] || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) continue;
    const start = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); // ora locale
    const km = num(cells[col.dist]);
    const sec = hms(cells[col.time]?.split(',')[0]);
    if (!km || !sec) continue;
    runs.push({
      id: start.toISOString().slice(0, 16),
      start: start.toISOString(),
      km, sec,
      avgHr: num(cells[col.hr]),
      maxHr: num(cells[col.max]),
      ascent: num(cells[col.asc]),
      zoneSec: null, eff: null, drift: null, best5k: null,
      source: 'csv',
    });
  }
  return runs;
}
