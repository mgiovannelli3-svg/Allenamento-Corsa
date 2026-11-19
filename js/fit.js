// Lettore minimo di file FIT (Garmin). Estrae solo ciò che serve all'app:
// il riepilogo della sessione e i punti registrati (battiti, velocità, distanza).

const FIT_EPOCH = 631065600; // 31/12/1989 in secondi Unix

const BASE_SIZES = { 0x00: 1, 0x01: 1, 0x02: 1, 0x83: 2, 0x84: 2, 0x85: 4, 0x86: 4, 0x07: 1, 0x88: 4, 0x89: 8, 0x0a: 1, 0x8b: 2, 0x8c: 4, 0x0d: 1, 0x8e: 8, 0x8f: 8, 0x90: 8 };

function readValue(view, offset, size, baseType, little) {
  const t = baseType & 0x1f;
  switch (t) {
    case 0x00: case 0x02: case 0x0a: case 0x0d: { // enum, uint8, uint8z, byte
      if (size !== 1) return null;
      const v = view.getUint8(offset);
      return (t === 0x0a ? v === 0 : v === 0xff) ? null : v;
    }
    case 0x01: { if (size !== 1) return null; const v = view.getInt8(offset); return v === 0x7f ? null : v; }
    case 0x03: { if (size !== 2) return null; const v = view.getInt16(offset, little); return v === 0x7fff ? null : v; }
    case 0x04: case 0x0b: { if (size !== 2) return null; const v = view.getUint16(offset, little); return (t === 0x0b ? v === 0 : v === 0xffff) ? null : v; }
    case 0x05: { if (size !== 4) return null; const v = view.getInt32(offset, little); return v === 0x7fffffff ? null : v; }
    case 0x06: case 0x0c: { if (size !== 4) return null; const v = view.getUint32(offset, little); return (t === 0x0c ? v === 0 : v === 0xffffffff) ? null : v; }
    case 0x08: { if (size !== 4) return null; const v = view.getFloat32(offset, little); return Number.isFinite(v) ? v : null; }
    default: return null; // stringhe e tipi a 64 bit: non servono
  }
}

// Campi che ci interessano, per numero di messaggio globale
const WANTED = {
  18: { 2: 'start_time', 5: 'sport', 7: 'elapsed', 8: 'timer', 9: 'distance', 14: 'avg_speed', 16: 'avg_hr', 17: 'max_hr', 22: 'ascent', 124: 'enh_avg_speed' }, // session
  20: { 253: 'timestamp', 3: 'hr', 5: 'distance', 6: 'speed', 73: 'enh_speed' }, // record
};

export function parseFit(buffer) {
  const view = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset || 0, buffer.byteLength);
  const headerSize = view.getUint8(0);
  const dataSize = view.getUint32(4, true);
  const sig = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (sig !== '.FIT') throw new Error('Non è un file FIT');
  const end = Math.min(headerSize + dataSize, view.byteLength);
  const defs = {};
  const sessions = [];
  const records = [];
  let lastTimestamp = 0;
  let p = headerSize;

  while (p < end) {
    const h = view.getUint8(p++);
    let local, compressedOffset = null;
    if (h & 0x80) { // timestamp compresso
      local = (h >> 5) & 0x03;
      compressedOffset = h & 0x1f;
    } else {
      local = h & 0x0f;
      if (h & 0x40) { // definizione
        const hasDev = (h & 0x20) !== 0;
        const little = view.getUint8(p + 1) === 0;
        const global = view.getUint16(p + 2, little);
        const n = view.getUint8(p + 4);
        p += 5;
        const fields = [];
        let size = 0;
        for (let i = 0; i < n; i++) {
          const f = { num: view.getUint8(p), size: view.getUint8(p + 1), type: view.getUint8(p + 2), offset: size };
          size += f.size; fields.push(f); p += 3;
        }
        if (hasDev) {
          const nd = view.getUint8(p++);
          for (let i = 0; i < nd; i++) { size += view.getUint8(p + 1); p += 3; }
        }
        defs[local] = { global, little, fields, size };
        continue;
      }
    }
    const def = defs[local];
    if (!def) throw new Error('File FIT non valido');
    const wanted = WANTED[def.global];
    if (wanted) {
      const msg = {};
      for (const f of def.fields) {
        const name = wanted[f.num];
        if (name) msg[name] = readValue(view, p + f.offset, f.size, f.type, def.little);
      }
      if (msg.timestamp != null) lastTimestamp = msg.timestamp;
      if (compressedOffset !== null) {
        let ts = (lastTimestamp & ~0x1f) + compressedOffset;
        if (compressedOffset < (lastTimestamp & 0x1f)) ts += 0x20;
        msg.timestamp = lastTimestamp = ts;
      }
      if (def.global === 18) sessions.push(msg);
      else records.push(msg);
    } else if (def.fields.some(f => f.num === 253)) {
      const f = def.fields.find(f => f.num === 253);
      const ts = readValue(view, p + f.offset, f.size, f.type, def.little);
      if (ts != null) lastTimestamp = ts;
    }
    p += def.size;
  }
  return { sessions, records };
}

const toDate = fitTs => new Date((fitTs + FIT_EPOCH) * 1000);

// Trasforma un file FIT in una "corsa" riassunta, con le statistiche già calcolate.
// zones: { easy, medium, threshold } limiti superiori dei battiti per zona.
export function fitToRun(buffer, zones, source = 'fit') {
  const { sessions, records } = parseFit(buffer);
  const s = sessions[0];
  if (!s || s.start_time == null) throw new Error('Il file non contiene un allenamento');
  if (s.sport != null && s.sport !== 1) return null; // 1 = corsa
  const start = toDate(s.start_time);
  const pts = records
    .filter(r => r.timestamp != null)
    .map(r => ({ t: r.timestamp, hr: r.hr, d: r.distance != null ? r.distance / 100 : null, v: (r.enh_speed ?? r.speed) != null ? (r.enh_speed ?? r.speed) / 1000 : null }));
  const run = {
    id: start.toISOString().slice(0, 16),
    start: start.toISOString(),
    km: round((s.distance ?? 0) / 100000, 2),
    sec: Math.round((s.timer ?? s.elapsed ?? 0) / 1000),
    avgHr: s.avg_hr ?? null,
    maxHr: s.max_hr ?? null,
    ascent: s.ascent ?? null,
    source,
  };
  Object.assign(run, analysePoints(pts, zones));
  return run;
}

function round(x, d = 0) { const k = 10 ** d; return Math.round(x * k) / k; }

// Analisi dei punti: tempo nelle zone, passo a 136-144 battiti, deriva cardiaca, miglior 5 km.
export function analysePoints(pts, zones) {
  const out = { zoneSec: [0, 0, 0, 0], eff: null, drift: null, best5k: null };
  if (pts.length < 10) return out;
  let effDist = 0, effSec = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > 15) continue; // pause
    const hr = b.hr ?? a.hr;
    if (hr == null) continue;
    const z = hr <= zones.easy ? 0 : hr <= zones.medium ? 1 : hr <= zones.threshold ? 2 : 3;
    out.zoneSec[z] += dt;
    const v = b.v ?? a.v;
    if (hr >= 136 && hr <= 144 && v != null && v > 1.8 && v < 6.5) { effDist += v * dt; effSec += dt; }
  }
  // passo medio (sec/km) quando il cuore è tra 136 e 144: misura dell'efficienza aerobica
  if (effSec >= 300) out.eff = Math.round(effSec / (effDist / 1000));

  // deriva: rapporto velocità/battiti prima metà vs seconda metà (solo uscite di 40+ minuti)
  const moving = pts.filter(p => p.hr && p.v && p.v > 1.8);
  if (moving.length > 2400 / 2 && pts[pts.length - 1].t - pts[0].t >= 2400) {
    const half = Math.floor(moving.length / 2);
    const ratio = arr => arr.reduce((s, p) => s + p.v, 0) / arr.reduce((s, p) => s + p.hr, 0);
    const r1 = ratio(moving.slice(Math.floor(half * 0.2), half)); // salto il riscaldamento
    const r2 = ratio(moving.slice(half));
    out.drift = round((r1 / r2 - 1) * 100, 1);
  }

  // miglior 5 km continuo (per riconoscere il test)
  const dpts = pts.filter(p => p.d != null);
  if (dpts.length && dpts[dpts.length - 1].d - dpts[0].d >= 5000) {
    let j = 0, best = Infinity;
    for (let i = 0; i < dpts.length; i++) {
      while (j < dpts.length && dpts[j].d - dpts[i].d < 5000) j++;
      if (j >= dpts.length) break;
      const dt = dpts[j].t - dpts[i].t;
      if (dt < best) best = dt;
    }
    if (best < Infinity) out.best5k = best;
  }
  return out;
}
