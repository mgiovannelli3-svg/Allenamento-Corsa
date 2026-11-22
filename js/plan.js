// Il piano verso la Mezza di Napoli (21 febbraio 2027) e le regole che lo adattano ogni giorno.
import { fmtPace, addDays, localDateKey, runsBetween, mondayOf } from './analysis.js';
import { feedbackEffect } from './feedback.js';

// Tipi di allenamento. La descrizione usa i ritmi calcolati dallo stato di forma attuale.
const pr = ([a, b]) => `${fmtPace(a)}-${fmtPace(b)}/km`;
export const TYPES = {
  easy:      { name: 'Facile', quality: false, text: (p, z) => `Corsa facile, cuore sotto ${z.easy} (circa ${pr(p.easy)}). Devi riuscire a parlare.` },
  veryeasy:  { name: 'Molto facile', quality: false, text: (p, z) => `Corsa molto facile, cuore sotto ${z.easy - 7}. Anche più lento di ${fmtPace(p.easy[1])}/km va benissimo.` },
  strides:   { name: 'Facile + allunghi', quality: false, text: (p, z) => `Corsa facile (cuore sotto ${z.easy}), poi 6 allunghi da 20" in progressione con 1' di recupero camminando. Su fondo piano.` },
  easyfin:   { name: 'Facile, finale sciolto', quality: false, text: (p, z) => `Corsa facile (cuore sotto ${z.easy}), gli ultimi 10 minuti un po' più sciolti senza superare ${z.medium}.` },
  medium:    { name: 'Ritmo medio', quality: true, text: (p, z, w) => `2 km facili + ${w.reps} a ritmo medio (${pr(p.medium)}, ${z.easy + 1}-${z.medium} bpm), recupero 2' di corsetta + 1,5 km facili.` },
  threshold: { name: 'Soglia', quality: true, text: (p, z, w) => `2 km facili + ${w.reps} a soglia (${pr(p.threshold)}, ${z.medium + 1}-${z.threshold - 3} bpm), recupero 2' di corsetta + 1,5 km facili.` },
  racepace:  { name: 'Ritmo gara', quality: true, text: (p, z, w) => `2 km facili + ${w.reps} a ritmo gara (${fmtPace(p.race)}/km), recupero 3' di corsetta + 1,5 km facili.` },
  long:      { name: 'Lungo facile', quality: false, long: true, text: (p, z) => `Lungo tutto facile, cuore sotto ${z.easy}. Porta acqua se supera i 75 minuti.` },
  longprog:  { name: 'Lungo con finale', quality: true, long: true, text: (p, z, w) => `Lungo facile con gli ultimi ${w.fin} km a ritmo medio (${pr(p.medium)}).` },
  longrace:  { name: 'Lungo con ritmo gara', quality: true, long: true, text: (p, z, w) => `Lungo facile con gli ultimi ${w.fin} km a ritmo gara (${fmtPace(p.race)}/km). Prova anche gel e acqua come in gara.` },
  test:      { name: 'Test 5 km', quality: true, text: () => `2 km di riscaldamento + 5 km al massimo, regolari + 2 km di defaticamento. Al mattino e in piano: serve a ricalcolare tutti i ritmi.` },
  shake:     { name: 'Sgambata pre-gara', quality: false, text: (p) => `20 minuti facilissimi + 3 allunghi brevi. Domani si corre: niente di più.` },
  race:      { name: 'Mezza di Napoli', quality: true, text: (p) => `Partenza prudente: primi 3 km a ${fmtPace(p.race + 5)}/km, poi ${fmtPace(p.race)}/km. Se al 15° km stai bene, spingi.` },
};

// [data, tipo, km, a cosa serve, dettagli, facoltativo]
const W = (date, type, km, why, extra = {}) => ({ date, type, km, why, ...extra });
export const PLAN = [
  // Settimana 0 — Ripartire piano
  W('2026-11-20', 'easy', 7, 'Prendere il ritmo giusto', { altDate: '2026-11-19', alt: 'Va bene anche giovedì 19' }),
  W('2026-11-22', 'easyfin', 10, 'Base aerobica'),
  // Settimana 1 (spostata da Marco: lunedì e mercoledì invece di martedì e giovedì)
  W('2026-11-23', 'strides', 8, 'Riattivare la velocità senza fatica'),
  W('2026-11-25', 'easy', 7, 'Base aerobica'),
  W('2026-11-28', 'veryeasy', 5, 'Volume leggero', { optional: true }),
  W('2026-11-29', 'long', 11, 'Resistenza'),
  // Settimana 2
  W('2026-12-01', 'medium', 9, 'Primo stimolo di ritmo', { reps: "3 x 8'" }),
  W('2026-12-03', 'strides', 8, 'Base e tecnica'),
  W('2026-12-05', 'veryeasy', 5, 'Volume leggero', { optional: true }),
  W('2026-12-06', 'long', 12, 'Resistenza'),
  // Settimana 3
  W('2026-12-08', 'threshold', 10, 'Alzare la soglia: è il ritmo della mezza', { reps: "3 x 10'" }),
  W('2026-12-10', 'easy', 8, 'Recupero attivo'),
  W('2026-12-12', 'veryeasy', 5, 'Volume leggero', { optional: true }),
  W('2026-12-13', 'longprog', 13, 'Resistenza e chiusura in progressione', { fin: 2 }),
  // Settimana 4 — Scarico e test
  W('2026-12-15', 'strides', 7, 'Assorbire il lavoro'),
  W('2026-12-17', 'easy', 6, 'Arrivare freschi al test'),
  W('2026-12-19', 'test', 9, 'Ricalcolare tutti i ritmi', { altDate: '2026-12-20', alt: 'Va bene anche domenica 20' }),
  // Base e soglia (21 dic - 17 gen)
  W('2026-12-22', 'threshold', 10, 'Soglia', { reps: "3 x 10'" }),
  W('2026-12-24', 'easy', 8, 'Base aerobica'),
  W('2026-12-26', 'veryeasy', 6, 'Volume leggero', { optional: true }),
  W('2026-12-27', 'long', 14, 'Resistenza'),
  W('2026-12-29', 'strides', 8, 'Velocità senza fatica'),
  W('2026-12-31', 'threshold', 10, 'Soglia più lunga', { reps: "2 x 12'" }),
  W('2027-01-02', 'veryeasy', 6, 'Volume leggero', { optional: true }),
  W('2027-01-03', 'long', 15, 'Resistenza'),
  W('2027-01-05', 'threshold', 11, 'Soglia: blocchi lunghi', { reps: "2 x 15'" }),
  W('2027-01-07', 'easy', 8, 'Recupero attivo'),
  W('2027-01-09', 'veryeasy', 6, 'Volume leggero', { optional: true }),
  W('2027-01-10', 'longprog', 16, 'Resistenza e progressione', { fin: 3 }),
  W('2027-01-12', 'strides', 7, 'Settimana di scarico'),
  W('2027-01-14', 'medium', 9, 'Tenere vivo il ritmo', { reps: "3 x 8'" }),
  W('2027-01-16', 'veryeasy', 5, 'Volume leggero', { optional: true }),
  W('2027-01-17', 'long', 12, 'Scarico'),
  // Specifico mezza (18 gen - 7 feb)
  W('2027-01-19', 'racepace', 11, 'Abituarsi al ritmo gara', { reps: '3 x 2 km' }),
  W('2027-01-21', 'easy', 8, 'Base aerobica'),
  W('2027-01-23', 'veryeasy', 6, 'Volume leggero', { optional: true }),
  W('2027-01-24', 'long', 17, 'Resistenza'),
  W('2027-01-26', 'racepace', 12, 'Il cuore della preparazione', { reps: '3 x 3 km' }),
  W('2027-01-28', 'strides', 8, 'Velocità senza fatica'),
  W('2027-01-30', 'veryeasy', 6, 'Volume leggero', { optional: true }),
  W('2027-01-31', 'long', 19, 'Resistenza'),
  W('2027-02-02', 'threshold', 11, 'Soglia', { reps: "2 x 15'" }),
  W('2027-02-04', 'easy', 8, 'Recupero attivo'),
  W('2027-02-06', 'veryeasy', 6, 'Volume leggero', { optional: true }),
  W('2027-02-07', 'longrace', 20, 'Prova generale', { fin: 5 }),
  // Scarico e gara
  W('2027-02-09', 'racepace', 10, 'Richiamo del ritmo gara', { reps: '2 x 3 km' }),
  W('2027-02-11', 'easy', 8, 'Recupero'),
  W('2027-02-13', 'veryeasy', 5, 'Volume leggero', { optional: true }),
  W('2027-02-14', 'long', 14, 'Scarico'),
  W('2027-02-16', 'racepace', 8, 'Ultimo richiamo', { reps: '3 x 1 km' }),
  W('2027-02-18', 'strides', 6, 'Ultima seduta: gambe fresche'),
  W('2027-02-20', 'shake', 3, 'Sciogliere le gambe', { optional: true }),
  W('2027-02-21', 'race', 21.1, 'La gara!'),
];

export const PHASES = [
  { from: '2026-11-19', to: '2026-12-20', name: 'Ripartenza' },
  { from: '2026-12-21', to: '2027-01-17', name: 'Base e soglia' },
  { from: '2027-01-18', to: '2027-02-07', name: 'Specifico mezza' },
  { from: '2027-02-08', to: '2027-02-21', name: 'Scarico e gara' },
];

export const phaseOf = key => PHASES.find(p => key >= p.from && key <= p.to) || null;

export function describe(w, p, zones) { return TYPES[w.type].text(p, zones, w); }

// Le corse fatte in un giorno
export const runsOn = (runs, key) => runs.filter(r => localDateKey(r.start) === key);

// Abbina le corse fatte agli allenamenti del piano (stesso giorno o, per i facoltativi e i
// giorni "alternativi", il giorno prima/dopo).
export function matchPlan(runs, todayKey, plan = PLAN) {
  const used = new Set();
  const live = plan.filter(o => !o.skipped);
  return plan.map(w => {
    let run = runsOn(runs, w.date).find(r => !used.has(r.id));
    if (!run) for (const d of [-1, 1]) { run = runsOn(runs, addDays(w.date, d)).find(r => !used.has(r.id) && !live.some(o => o.date === localDateKey(r.start))); if (run) break; }
    if (run) used.add(run.id);
    const status = run ? 'done' : w.skipped ? 'skipped' : w.date < addDays(todayKey, -1) ? (w.optional ? 'skipped' : 'missed') : w.date <= todayKey ? 'today' : 'future';
    return { ...w, run, status };
  });
}

// Il cuore dell'app: l'allenamento di oggi, adattato a come stai.
// state: { heelPain: {date: true}, tired: {date: true} }
export function today(todayKey, runs, fit, p, profile, state, plan = PLAN) {
  const matched = matchPlan(runs, todayKey, plan);
  const notes = [];
  let w = matched.find(m => m.date === todayKey && !m.skipped) || null;
  const skippedToday = matched.find(m => m.date === todayKey && m.skipped && m.status !== 'done');
  if (skippedToday) notes.push({ level: 'info', text: `Oggi era previsto: ${TYPES[skippedToday.type].name.toLowerCase()}, ${skippedToday.km} km. L'hai tolto tu dalla chat: non va recuperato.` });
  // un allenamento con due date possibili (es. "gio 19 o ven 20") vale anche oggi, se non è già fatto
  if (!w) {
    const y = matched.find(m => m.altDate === todayKey);
    if (y && y.status !== 'done') w = { ...y, movedFrom: y.date };
  }
  const doneToday = runsOn(runs, todayKey);
  // la corsa di oggi può aver "coperto" un allenamento di un giorno vicino (es. quello di venerdì fatto giovedì)
  const coveredToday = matched.find(m => m.run && localDateKey(m.run.start) === todayKey);
  if (coveredToday && (!w || w.status !== 'done' || w.run !== coveredToday.run)) w = { ...coveredToday, movedFrom: coveredToday.date !== todayKey ? coveredToday.date : undefined };
  const out = { planned: w, adjusted: w ? { ...w } : null, notes, doneToday, matched, rest: !w, done: !!coveredToday, next: matched.find(m => m.date > todayKey && m.status !== 'done' && !m.skipped) || null };
  if (!out.done) {

  // 1. Il piede prima di tutto
  const painDays = Object.keys(state.heelPain || {}).filter(k => k > addDays(todayKey, -10) && k <= todayKey).length;
  if (state.heelPain?.[todayKey]) {
    if (painDays >= 7) {
      notes.push({ level: 'stop', text: `Hai segnato dolore al tallone in ${painDays} degli ultimi 10 giorni. Fermati con la corsa e fatti vedere da un medico o da un fisioterapista prima di riprendere.` });
      if (out.adjusted) Object.assign(out.adjusted, { type: 'rest', km: 0 });
    } else if (out.adjusted) {
      notes.push({ level: 'warn', text: 'Dolore al tallone: oggi niente ritmo, salite o allunghi. Uscita corta e molto facile, oppure riposo se il dolore non passa dopo 10 minuti. Fai gli esercizi per il piede.' });
      Object.assign(out.adjusted, { type: 'veryeasy', km: Math.min(w.km, 5) });
    }
  } else if (painDays >= 2 && out.adjusted && TYPES[w.type].quality) {
    notes.push({ level: 'warn', text: `Il tallone ti ha dato fastidio ${painDays} volte negli ultimi 10 giorni: oggi tengo la seduta ma senza la parte veloce.` });
    Object.assign(out.adjusted, { type: TYPES[w.type].long ? 'long' : 'easy' });
  }

  // 1b. Quello che mi hai raccontato dopo le ultime corse
  const fe = feedbackEffect(state, todayKey);
  if (fe && out.adjusted && out.adjusted.type !== 'rest' && !state.heelPain?.[todayKey]) {
    if (fe.kind === 'pain') {
      Object.assign(out.adjusted, { type: 'veryeasy', km: Math.min(out.adjusted.km, 5) });
      notes.push({ level: 'warn', text: 'Dopo l\'ultima corsa mi hai detto di aver sentito dolore: oggi solo corsa corta e molto facile, niente allunghi o salite. Se il dolore c\'è anche camminando, riposa.' });
    } else if (out.adjusted.type !== 'race' && out.adjusted.type !== 'test') {
      out.adjusted.km = Math.max(4, Math.round(out.adjusted.km * 0.85));
      notes.push({ level: 'info', text: 'Dopo l\'ultima corsa eri stanco: accorcio un po\' l\'uscita di oggi. Se ti senti ancora scarico, segna "Molto stanco" qui sotto e la trasformo in corsa facile.' });
    }
  }

  // 2. Stanchezza e carico
  const tired = state.tired?.[todayKey];
  if (out.adjusted && out.adjusted.type !== 'rest' && !state.heelPain?.[todayKey]) {
    const isQ = TYPES[out.adjusted.type].quality && out.adjusted.type !== 'race';
    if (tired || (fit.ratio != null && fit.ratio > 1.45)) {
      if (isQ) Object.assign(out.adjusted, { type: TYPES[out.adjusted.type].long ? 'long' : 'easy' });
      out.adjusted.km = Math.round(out.adjusted.km * 0.8);
      notes.push({ level: 'warn', text: tired ? 'Ti senti molto stanco: oggi solo corsa facile e più corta. Se dura più di 3 giorni, ripeti la settimana invece di andare avanti.' : 'Negli ultimi 7 giorni hai caricato molto più del solito: oggi accorcio e tolgo il ritmo.' });
    } else if (fit.ratio != null && fit.ratio > 1.3 && TYPES[out.adjusted.type].long) {
      out.adjusted.km = Math.round(out.adjusted.km * 0.9);
      notes.push({ level: 'info', text: 'Settimana già carica: accorcio il lungo del 10%.' });
    }
    // seduta dura ieri e oggi qualità: meglio spostare
    const yRuns = runsOn(runs, addDays(todayKey, -1));
    const yHard = yRuns.some(r => r.zoneSec && (r.zoneSec[2] + r.zoneSec[3]) / (r.sec || 1) > 0.4);
    if (yHard && isQ && !tired) notes.push({ level: 'info', text: 'Ieri hai corso forte: se ti senti le gambe pesanti, oggi fai facile e sposta la seduta a domani.' });
  }

  // 3. La settimana scorsa: se ne hai fatta meno di metà, non correre avanti
  const lastMon = addDays(mondayOf(todayKey), -7), lastSun = addDays(lastMon, 6);
  const lastWeek = matched.filter(m => m.date >= lastMon && m.date <= lastSun && !m.optional && !m.skipped);
  const plannedKm = lastWeek.reduce((s, m) => s + m.km, 0);
  const doneKm = runsBetween(runs, lastMon, lastSun).reduce((s, r) => s + r.km, 0);
  const lastRunKey = runs.length ? localDateKey(runs[runs.length - 1].start) : null;
  const upToDate = lastRunKey && lastRunKey >= addDays(todayKey, -4);
  if (lastRunKey && !upToDate) notes.push({ level: 'info', text: `L'ultima corsa caricata è del ${lastRunKey.split('-').reverse().join('/')}. Carica le uscite recenti (scheda Dati) così adatto il piano a quello che hai fatto davvero.` });
  if (upToDate && plannedKm > 0 && doneKm < plannedKm * 0.55 && out.adjusted && !['rest', 'race', 'test'].includes(out.adjusted.type)) {
    out.adjusted.km = Math.max(5, Math.round(out.adjusted.km * 0.85));
    notes.push({ level: 'info', text: `La settimana scorsa hai fatto ${Math.round(doneKm)} km su ${plannedKm} previsti: questa settimana accorcio un po' le uscite. Gli allenamenti saltati non si recuperano.` });
  }

  }

  // 4. Le facili sono davvero facili?
  if (fit.easyTooHard) notes.push({ level: 'tip', text: `Nelle ultime 4 settimane solo il ${fit.zonePct[0]}% del tempo è stato sotto ${profile.zones.easy} battiti. Rallenta le uscite facili: è da lì che è nata la tua mezza in 1:36.` });

  // 5. Corsa a pranzo
  if (out.adjusted && out.adjusted.type !== 'rest' && !out.done) {
    const lunch = runs.slice(-6).filter(r => { const h = new Date(r.start).getHours(); return h >= 12 && h <= 15; }).length >= 3;
    if (lunch) notes.push({ level: 'tip', text: 'Se corri all\'ora di pranzo il cuore sta circa 10 battiti più alto allo stesso passo: guida col cuore, non col passo.' });
  }

  // Cosa hai già fatto oggi rispetto al piano
  if (doneToday.length && out.adjusted) {
    const r = doneToday[doneToday.length - 1];
    const easyType = ['easy', 'veryeasy', 'strides', 'easyfin', 'long', 'shake'].includes(out.adjusted.type);
    if (easyType && r.avgHr && r.avgHr > profile.zones.easy) out.verdict = `Fatto! Però il cuore medio era ${r.avgHr}: per un'uscita facile doveva stare sotto ${profile.zones.easy}. La prossima volta rallenta.`;
    else out.verdict = 'Fatto, ben eseguito. Ora recupero: bevi, mangia e fai gli esercizi per il piede.';
  }
  return out;
}

export function weekSummary(matched, mondayKey, runs) {
  const sun = addDays(mondayKey, 6);
  const items = matched.filter(m => m.date >= mondayKey && m.date <= sun);
  const planned = items.filter(m => !m.optional && !m.skipped).reduce((s, m) => s + m.km, 0);
  const plannedMax = items.filter(m => !m.skipped).reduce((s, m) => s + m.km, 0);
  const done = runsBetween(runs, mondayKey, sun).reduce((s, r) => s + r.km, 0);
  return { items, planned, plannedMax, done: Math.round(done * 10) / 10, phase: phaseOf(mondayKey) || phaseOf(sun) };
}
