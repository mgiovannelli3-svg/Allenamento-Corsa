// Le impressioni dopo la corsa ("vento contro, tanta salita, gambe pesanti..."):
// riconosce le condizioni, le confronta con i dati del Garmin e decide se cambiare i prossimi giorni.
import { TYPES, matchPlan } from './plan.js';
import { activePlan, DAY_NAMES } from './schedule.js';
import { addDays, localDateKey, fmtPace, parseKey } from './analysis.js';

const has = (t, re) => re.test(t);
const andList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1];
export const COND = {
  wind: /vento/,
  hill: /(salit|collin|dislivell|ponti?\b|scalinat|scale\b|montagn)/,
  trail: /(sterrat|terra\b|sentier|campagna|erba|sabbia|spiaggia|fango|ghiai|pista ciclabile sterr)/,
  road: /(asfalt|strada|lungomare|marciapied)/,
  track: /(pista\b|anello|campo di atletica)/,
  heat: /(caldo|afa|afos|sole forte|umid)/,
  cold: /(freddo|pioggia|piovev|bagnat)/,
  tired: /(stanc|pesant|fatic|dura\b|duro\b|cott|scarich|svuotat|senza energi|dormito (male|poco))/,
  good: /(bene|benissimo|sciolt|leggero|leggera|ottim|alla grande|facile|in forma|perfett)/,
  bad: /(male\b|malissimo|non (e )?andata|non andava|disastro|piantato)/,
  pain: /(dolor|fastidi|male (al|alla|ai|sotto)|tallone|pianta del piede|fascite|polpacci?o? (tirav|indurit|dolent)|ginocchi|tendin|contrattur)/,
};

export function looksLikeFeedback(t) {
  return Object.entries(COND).some(([k, re]) => k !== 'road' && k !== 'track' && re.test(t)) || /(com.? e andata|impressioni|ho corso|appena finito|corsa di oggi)/.test(t);
}

export function feedback(t, db, todayKey) {
  const f = {};
  for (const [k, re] of Object.entries(COND)) if (has(t, re)) f[k] = true;
  if (f.pain) f.bad = f.bad || false;
  if (/non (ho )?(avuto|sentito) (nessun )?(dolor|fastidi)|niente dolor|nessun dolor|zero dolor/.test(t)) delete f.pain;
  if (/non (ero|mi sento|sono) stanc|non era pesant/.test(t)) delete f.tired;
  if (f.bad && /(non (e )?andata male)/.test(t)) delete f.bad;

  const st = db.state;
  st.feedback = st.feedback || {};
  const runs = db.runs;
  const run = [...runs].reverse().find(r => { const k = localDateKey(r.start); return k === todayKey || k === addDays(todayKey, -1); });
  const day = run ? localDateKey(run.start) : todayKey;
  st.feedback[day] = { ...f, text: t.slice(0, 300) };
  if (f.pain) st.heelPain[day] = true;

  const z = db.profile.zones;
  const parts = [];
  let tooHard = false;
  const why = [f.wind && 'vento', f.hill && 'salita', f.trail && 'sterrato', f.heat && 'caldo'].filter(Boolean);

  if (!run) {
    parts.push('Mi sono segnato le tue impressioni. Non trovo ancora la corsa di oggi: caricala dalla scheda Dati e la confronto con quello che mi hai detto.');
  } else {
    // condizioni della corsa: servono a non falsare la stima della forma
    run.cond = { wind: !!f.wind, hill: !!f.hill, trail: !!f.trail, heat: !!f.heat };
    const plan = activePlan(st, todayKey);
    const item = matchPlan(runs, todayKey, plan).find(m => m.run && m.run.id === run.id);
    const type = item ? TYPES[item.type] : null;
    const pace = fmtPace(run.sec / run.km);
    parts.push(`${run.km.toString().replace('.', ',')} km a ${pace} al km${run.avgHr ? `, cuore medio ${run.avgHr}` : ''}${item ? ` (era: ${type.name.toLowerCase()})` : ''}.`);
    const easyRun = !item || !type.quality;
    if (easyRun && run.avgHr && run.avgHr > z.easy) {
      if (why.length) parts.push(`Il cuore è sopra il limite delle uscite facili (${z.easy}), ma con ${andList(why)} è normale che salga. Non la conto come uscita troppo forte e non la uso per misurare la tua forma.`);
      else { tooHard = true; parts.push(`Il cuore è sopra il limite delle uscite facili (${z.easy}). La prossima volta rallenta anche di 20-30 secondi al km: deve sembrarti quasi troppo facile.`); }
    } else if (easyRun && run.avgHr) {
      parts.push(why.length ? `Con ${andList(why)} sei rimasto comunque sotto i ${z.easy} battiti: ottimo controllo.` : 'Cuore nella zona giusta: uscita fatta bene.');
    } else if (!easyRun) {
      parts.push(why.length ? `In una seduta di qualità ${andList(why)} rallentano il passo: guarda più i battiti che il cronometro, va bene così.` : 'Seduta di qualità registrata.');
    }
    if (why.length && !(easyRun && run.avgHr > z.easy)) parts.push(`Segno che c'erano ${andList(why)}: non userò questa corsa per stimare la tua forma, perché i ritmi sarebbero falsati.`);
    if (f.trail) parts.push('Lo sterrato va bene per le uscite facili e protegge le gambe; per le sedute veloci meglio asfalto o pista.');
  }

  if (f.good && !f.bad && !f.tired && !f.pain) parts.push(tooHard ? 'Ottimo che ti sentissi bene: vuol dire che puoi andare anche più piano senza perdere niente.' : 'Sensazioni buone: è il segnale che il carico è giusto.');

  // Effetto sui prossimi giorni
  const plan = activePlan(st, todayKey);
  const next = plan.find(w => w.date > todayKey && !w.skipped);
  const nextTxt = next ? `${DAY_NAMES[parseKey(next.date).getDay()]} (${TYPES[next.type].name.toLowerCase()}, ${String(next.km).replace('.', ',')} km)` : null;
  if (f.pain) {
    parts.push(`Il dolore viene prima di tutto. ${nextTxt ? `Il prossimo allenamento, ${nextTxt}, diventa una corsa corta e molto facile, senza allunghi né salite.` : ''} Domattina segna nella scheda Oggi se senti il tallone ai primi passi. Se il dolore dura più di 7 giorni, vai dal medico o dal fisioterapista.`);
  } else if (f.tired || f.bad) {
    parts.push(nextTxt ? `Visto che eri stanco, ${nextTxt} lo accorcio un po'. Se domattina ti senti ancora scarico, segnalalo nella scheda Oggi e lo trasformo in una corsa facile.` : 'Riposa bene stanotte.');
  } else if (nextTxt) {
    parts.push(`Il piano non cambia: prossimo allenamento ${nextTxt}.`);
  }
  return { reply: parts.join(' '), changed: true };
}

// Effetto delle impressioni sull'allenamento del giorno: chiamata da today() in plan.js
export function feedbackEffect(state, todayKey) {
  const fb = state.feedback || {};
  for (const n of [1, 2, 3]) {
    const d = addDays(todayKey, -n), f = fb[d];
    if (!f) continue;
    if (f.pain) return { kind: 'pain', date: d };
    if ((f.tired || f.bad) && n <= 2) return { kind: 'tired', date: d };
  }
  return null;
}
