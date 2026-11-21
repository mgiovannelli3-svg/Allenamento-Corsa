// Calcoli sullo stato di forma: carico, efficienza, stima della mezza, ritmi di allenamento.

export const DAY = 86400000;
const HALF = 21.0975;

export function localDateKey(d) {
  d = new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(key, n) { const d = parseKey(key); d.setDate(d.getDate() + n); return localDateKey(d); }
export function mondayOf(key) { const d = parseKey(key); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return localDateKey(d); }

export function fmtPace(sec) {
  if (sec == null || !isFinite(sec)) return '–';
  sec = Math.round(sec);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
export function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return '–';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Fatica di una corsa: minuti pesati per intensità
export function runLoad(run, profile) {
  const w = [1, 1.5, 2.2, 3];
  if (run.zoneSec) return run.zoneSec.reduce((s, v, i) => s + v * w[i], 0) / 60;
  const hr = run.avgHr ?? profile.zones.easy;
  const z = hr <= profile.zones.easy ? 0 : hr <= profile.zones.medium ? 1 : hr <= profile.zones.threshold ? 2 : 3;
  return (run.sec / 60) * w[z];
}

export function runsBetween(runs, fromKey, toKey) {
  return runs.filter(r => { const k = localDateKey(r.start); return k >= fromKey && k <= toKey; });
}

// Efficienza: passo (sec/km) a 136-144 battiti. Più basso = più in forma.
export function effAround(runs, key, daysBack = 30) {
  // le corse con vento, salita o sterrato (dette dopo la corsa) non contano: i ritmi sono falsati
  runs = runs.filter(r => !(r.cond && (r.cond.wind || r.cond.hill || r.cond.trail)));
  const vals = runsBetween(runs, addDays(key, -daysBack), key).map(r => r.eff).filter(Boolean);
  if (vals.length >= 2) return median(vals);
  // se nell'ultimo mese mancano uscite facili, uso le ultime 5 disponibili
  const older = runs.filter(r => r.eff && localDateKey(r.start) <= key).slice(-5).map(r => r.eff);
  return older.length ? median(older) : null;
}

// Un "punto di riferimento" è una gara o un test di cui conosciamo il tempo.
// Tutto il resto si stima confrontando l'efficienza di oggi con quella di quel momento.
export function anchors(runs, profile) {
  const list = [];
  const ref = profile.reference; // gara di riferimento
  if (ref) list.push({ date: ref.date, halfSec: ref.sec * Math.pow(HALF / ref.km, 1.06), label: ref.label });
  for (const t of profile.tests || []) list.push({ date: t.date, halfSec: t.sec * Math.pow(HALF / 5, 1.06), label: `Test 5 km (${fmtTime(t.sec)})` });
  list.sort((a, b) => a.date.localeCompare(b.date));
  for (const a of list) a.eff = effAround(runs, addDays(a.date, -1), 42) ?? profile.defaultEff;
  return list;
}

export function weeklyKm(runs, todayKey, weeks = 10) {
  const out = [];
  let mon = mondayOf(todayKey);
  for (let i = 0; i < weeks; i++) {
    const sun = addDays(mon, 6);
    const km = runsBetween(runs, mon, sun).reduce((s, r) => s + r.km, 0);
    out.unshift({ week: mon, km: Math.round(km * 10) / 10 });
    mon = addDays(mon, -7);
  }
  return out;
}

export function fitness(runs, profile, todayKey) {
  runs = [...runs].sort((a, b) => a.start.localeCompare(b.start));
  const last7 = runsBetween(runs, addDays(todayKey, -6), todayKey);
  const last28 = runsBetween(runs, addDays(todayKey, -27), todayKey);
  const acute = last7.reduce((s, r) => s + runLoad(r, profile), 0);
  const chronic = last28.reduce((s, r) => s + runLoad(r, profile), 0) / 4;
  const ratio = chronic > 0 ? acute / chronic : null;
  const km7 = last7.reduce((s, r) => s + r.km, 0);
  const km28avg = last28.reduce((s, r) => s + r.km, 0) / 4;

  let loadState;
  if (ratio == null) loadState = { key: 'nodata', label: 'Pochi dati', text: 'Carica le tue ultime corse per vedere come stai.' };
  else if (ratio > 1.35) loadState = { key: 'high', label: 'Stai caricando troppo', text: 'Negli ultimi 7 giorni hai fatto molto di più del solito. Rischio infortuni più alto: alleggerisci.' };
  else if (ratio < 0.75) loadState = { key: 'low', label: 'Stai scaricando', text: 'Ultimi 7 giorni più leggeri del solito: bene se è voluto, altrimenti riprendi con calma.' };
  else loadState = { key: 'ok', label: 'Carico giusto', text: 'Stai aumentando in modo graduale. Continua così.' };

  // distribuzione dell'intensità nelle ultime 4 settimane
  const zs = [0, 0, 0, 0];
  for (const r of last28) if (r.zoneSec) r.zoneSec.forEach((v, i) => zs[i] += v);
  const zTot = zs.reduce((a, b) => a + b, 0);
  const zonePct = zTot ? zs.map(v => Math.round(v / zTot * 100)) : null;

  // efficienza e stima della mezza
  const effNow = effAround(runs, todayKey, 30);
  const anc = anchors(runs, profile).filter(a => a.date <= todayKey).pop();
  let halfSec = null;
  if (anc && effNow) {
    halfSec = anc.halfSec * (effNow / anc.eff);
    if (km28avg < 30) halfSec *= 1.015; // poca abitudine al volume: la tenuta sui 21 km cala
  }
  const effSeries = runs.filter(r => r.eff).map(r => ({ date: localDateKey(r.start), eff: r.eff }));
  const easyRuns = last28.filter(r => r.avgHr && r.zoneSec);
  const easyTooHard = last28.length >= 3 && zonePct && zonePct[0] < 50;

  return { acute, chronic, ratio, loadState, km7, km28avg, zonePct, effNow, anchor: anc, halfSec, effSeries, easyTooHard, runs28: last28.length, easyRuns };
}

// Ritmi di allenamento ricavati dalla stima della mezza (stesse regole del piano scritto a novembre)
export function paces(halfSec, profile) {
  const hp = (halfSec ?? profile.reference.sec * 1.06) / HALF;
  const goal = profile.goalSec / HALF;
  return {
    half: hp,
    easy: [hp + 67, hp + 92],
    medium: [hp + 37, hp + 47],
    threshold: [hp + 2, hp + 12],
    fast: [hp - 13, hp - 3],
    race: goal,
  };
}

export function bestTestCandidate(runs, profile) {
  // cerca, nelle date del test, una corsa con un 5 km tirato
  const [from, to] = profile.testWindow;
  return runsBetween(runs, from, to).filter(r => r.best5k && r.best5k < 5 * 330 && (r.maxHr ?? 0) >= profile.zones.medium).sort((a, b) => a.best5k - b.best5k)[0] || null;
}
