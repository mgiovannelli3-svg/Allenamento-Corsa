// Salvataggio sul telefono: i dati restano solo sul tuo dispositivo.

const KEY = 'allenamento-corsa:v1';

export const DEFAULT_PROFILE = {
  zones: { easy: 142, medium: 152, threshold: 165 }, // limiti superiori: facile, medio, soglia
  reference: { date: '2026-02-22', km: 21.0975, sec: 5758, label: 'Mezza del 22 febbraio 2026 (1:35:58)' },
  goalSec: 5880, // obiettivo a Napoli: 1:38:00
  raceDate: '2027-02-21',
  raceName: 'Mezza di Napoli',
  testWindow: ['2026-12-18', '2026-12-21'],
  tests: [],
  defaultEff: 333,
};

const fresh = () => ({ runs: [], profile: structuredClone(DEFAULT_PROFILE), state: { heelPain: {}, tired: {} } });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    const base = fresh();
    return { runs: data.runs || [], profile: { ...base.profile, ...data.profile, zones: { ...base.profile.zones, ...(data.profile?.zones || {}) } }, state: { ...base.state, ...data.state } };
  } catch { return fresh(); }
}

export function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch { return false; }
}

export function reset() { try { localStorage.removeItem(KEY); } catch {} return fresh(); }

// Aggiunge corse evitando i doppioni. Un FIT vince sempre su una riga del CSV.
export function mergeRuns(db, incoming) {
  const byId = new Map(db.runs.map(r => [r.id, r]));
  let added = 0, updated = 0;
  for (const r of incoming) {
    const twin = byId.get(r.id) || [...byId.values()].find(o => Math.abs(new Date(o.start) - new Date(r.start)) < 180000 && Math.abs(o.km - r.km) < 0.3);
    if (!twin) { byId.set(r.id, r); added++; }
    else if (twin.source === 'csv' && r.source !== 'csv') { byId.delete(twin.id); byId.set(r.id, r); updated++; }
  }
  db.runs = [...byId.values()].sort((a, b) => a.start.localeCompare(b.start));
  return { added, updated };
}
