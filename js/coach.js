// Il coach che spiega e fa domande: stato di forma, previsioni, ritmi, cosa fa il piano per migliorare,
// peso / HRV / battiti a riposo (detti a voce), piede, alimentazione, sonno.
// Tutto gratis e senza internet: le risposte nascono dai dati delle corse e da regole scritte qui.
import { TYPES, PHASES, phaseOf, describe } from './plan.js';
import { activePlan, DAY_NAMES } from './schedule.js';
import { fitness, paces, effAround, fmtPace, fmtTime, addDays, parseKey, localDateKey } from './analysis.js';

const HALF = 21.0975;
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const dayLabel = key => { const d = parseKey(key); return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`; };
const num = n => String(n).replace('.', ',');
const km1 = n => num(Math.round(n * 10) / 10);
// tempi detti a voce: "1 ora 38 minuti e 20 secondi" si capisce meglio di 1:38:20
const tSpoken = sec => {
  sec = Math.round(sec);
  if (sec >= 3600) { const m = Math.round(sec / 60), h = Math.floor(m / 60), mm = m % 60; return `${h} ora${mm ? ` e ${mm} minut${mm === 1 ? 'o' : 'i'}` : ''}`; }
  const m = Math.floor(sec / 60), ss = sec % 60; return `${m} minuti${ss ? ` e ${ss} secondi` : ''}`;
};
const paceRange = ([a, b]) => `${fmtPace(a)}-${fmtPace(b)}`;

export const YES = /^(si|certo|ok|okay|va bene|volentieri|dai|perche no|sicuro|esatto|un po|poco|abbastanza|ancora)\b/;
export const NO = /^(no|nessun|niente|nulla|per niente|macche|neanche|tutto ok|tutto bene|zero)\b/;

const PHASE_GOAL = {
  'Ripartenza': 'ricostruire la base con corse facili e qualche allungo, senza stressare il piede',
  'Base e soglia': 'aggiungere le sedute a soglia, che alzano il ritmo che riesci a tenere a lungo, e allungare il lungo',
  'Specifico mezza': 'abituare le gambe al ritmo gara con lunghi che finiscono veloci',
  'Scarico e gara': 'calare i chilometri per arrivare fresco e riposato alla gara',
};

function ctx(db, todayKey) {
  const fit = fitness(db.runs, db.profile, todayKey);
  const p = paces(fit.halfSec, db.profile);
  const plan = activePlan(db.state, todayKey);
  return { fit, p, plan, z: db.profile.zones, prof: db.profile };
}

// ---------- Stato di forma ----------
export function formaReply(db, todayKey) {
  const { fit, prof, z } = ctx(db, todayKey);
  if (!db.runs.length) return { reply: 'Non ho ancora le tue corse. Caricale dalla scheda Dati e poi ti dico come stai.' };
  const parts = [];
  if (fit.halfSec) {
    const diff = Math.round(fit.halfSec - prof.goalSec);
    parts.push(`Con i dati di oggi stimo che in una mezza faresti circa ${tSpoken(fit.halfSec)}.`);
    if (diff <= 0) parts.push(`Il tuo obiettivo a Napoli è ${tSpoken(prof.goalSec)}: sei già in linea, ora si tratta di consolidare.`);
    else if (diff <= 120) parts.push(`L'obiettivo a Napoli è ${tSpoken(prof.goalSec)}: mancano circa ${Math.round(diff / 60) || 1} minuti, e ci sono ancora settimane di lavoro. È alla tua portata.`);
    else parts.push(`L'obiettivo a Napoli è ${tSpoken(prof.goalSec)}: oggi sei a circa ${Math.round(diff / 60)} minuti. È normale dopo lo stop per il piede: il grosso del miglioramento arriva con le sedute di gennaio.`);
  } else parts.push('Non ho ancora abbastanza uscite facili con il cuore registrato per stimare il tempo sulla mezza.');

  const before = effAround(db.runs, addDays(todayKey, -42), 30);
  if (fit.effNow && before) {
    const d = Math.round(before - fit.effNow);
    if (d >= 4) parts.push(`Rispetto a sei settimane fa, a parità di battiti corri ${d} secondi al chilometro più veloce: stai migliorando.`);
    else if (d <= -4) parts.push(`Rispetto a sei settimane fa, a parità di battiti sei ${-d} secondi al chilometro più lento. Può dipendere da caldo, stanchezza o percorsi più duri: lo tengo d'occhio.`);
    else parts.push('Rispetto a sei settimane fa la forma è stabile.');
  }
  if (fit.loadState.key !== 'nodata') parts.push(`${fit.loadState.label}. ${fit.loadState.text} Nelle ultime 4 settimane hai fatto in media ${km1(fit.km28avg)} km a settimana.`);
  if (fit.easyTooHard) parts.push(`Una cosa da sistemare: meno della metà del tempo lo passi sotto i ${z.easy} battiti. Le uscite facili devono essere più lente.`);
  return { reply: parts.join(' '), ask: 'migliora', askText: 'Vuoi sapere cosa faccio nelle prossime settimane per farti migliorare?' };
}

// ---------- Cosa fa il piano per migliorare ----------
export function miglioraReply(db, todayKey) {
  const { plan, z } = ctx(db, todayKey);
  const ph = phaseOf(todayKey) || PHASES.find(x => x.from > todayKey);
  const parts = [];
  if (ph) {
    const i = PHASES.indexOf(ph);
    parts.push(`Siamo nella fase "${ph.name}", fino a ${dayLabel(ph.to)}: lo scopo è ${PHASE_GOAL[ph.name]}.`);
    const nx = PHASES[i + 1];
    if (nx) parts.push(`Poi arriva "${nx.name}": ${PHASE_GOAL[nx.name]}.`);
  }
  const next4 = plan.filter(w => w.date >= todayKey && w.date <= addDays(todayKey, 28) && !w.skipped);
  const longs = next4.filter(w => TYPES[w.type].long);
  if (longs.length >= 2) parts.push(`Il lungo cresce da ${num(longs[0].km)} a ${num(Math.max(...longs.map(w => w.km)))} km nelle prossime 4 settimane: è quello che ti fa tenere fino al 21° chilometro.`);
  const q = next4.filter(w => TYPES[w.type].quality && !TYPES[w.type].long && w.type !== 'race');
  if (q.length) {
    const names = [...new Set(q.map(w => TYPES[w.type].name.toLowerCase()))];
    parts.push(`Le sedute impegnative in arrivo sono: ${names.join(', ')}. Servono a spostare in avanti il ritmo che riesci a tenere.`);
  }
  const test = plan.find(w => w.type === 'test' && w.date >= todayKey && !w.skipped);
  if (test) parts.push(`${cap(dayLabel(test.date))} c'è il test di 5 chilometri: mi dice di nuovo a che punto sei e ricalcolo tutti i ritmi.`);
  parts.push(`La cosa più importante che puoi fare tu: le uscite facili davvero facili, cuore sotto ${z.easy}, e non saltare il lungo. Il piede viene prima di tutto: se fa male, me lo dici e alleggerisco.`);
  return { reply: parts.join(' '), ask: 'ritmi', askText: 'Vuoi sapere a che ritmo correre?' };
}

function ritmiReply(db, todayKey) {
  const { p, z } = ctx(db, todayKey);
  return { reply: `Ecco i tuoi ritmi di adesso, al chilometro:\n• Facile: ${paceRange(p.easy)}, ma conta di più il cuore sotto ${z.easy}\n• Medio: ${paceRange(p.medium)}\n• Soglia: ${paceRange(p.threshold)}\n• Veloce: ${paceRange(p.fast)}\n• Ritmo gara per l'obiettivo: ${fmtPace(p.race)}\nDopo il test di dicembre li ricalcolo.` };
}

function previsioniReply(db, todayKey, t) {
  const { fit, prof } = ctx(db, todayKey);
  if (!fit.halfSec) return formaReply(db, todayKey);
  const at = km => fit.halfSec * Math.pow(km / HALF, 1.06);
  const want = /\b5 ?(km|k|chilometri)\b/.test(t) ? [5] : /\b10 ?(km|k|chilometri)\b/.test(t) ? [10] : [5, 10, HALF];
  const lines = want.map(km => `• ${km === HALF ? 'Mezza maratona' : km + ' km'}: circa ${tSpoken(at(km))} (${fmtPace(at(km) / km)} al km)`);
  return { reply: `Se corressi oggi, al massimo e su un percorso piatto, stimo:\n${lines.join('\n')}\nSono stime dai battiti nelle uscite facili: il test di 5 km di dicembre le renderà più precise. L'obiettivo a Napoli resta ${tSpoken(prof.goalSec)}.` };
}

function gareReply(db, todayKey) {
  const days = Math.round((parseKey(db.profile.raceDate) - parseKey(todayKey)) / 86400000);
  return { reply: `Mancano ${days} giorni alla ${db.profile.raceName} (${dayLabel(db.profile.raceDate)}), cioè circa ${Math.floor(days / 7)} settimane. Obiettivo: ${tSpoken(db.profile.goalSec)}, ${fmtPace(db.profile.goalSec / HALF)} al km.` };
}

function oggiReply(db, todayKey) {
  const { plan, p, z } = ctx(db, todayKey);
  const w = plan.find(x => x.date === todayKey && !x.skipped);
  if (!w) {
    const n = plan.find(x => x.date > todayKey && !x.skipped);
    return { reply: `Oggi riposo. ${n ? `Il prossimo allenamento è ${dayLabel(n.date)}: ${TYPES[n.type].name.toLowerCase()}, ${num(n.km)} km.` : ''} Il riposo fa parte dell'allenamento: è lì che il corpo si rinforza.` };
  }
  return { reply: `Oggi: ${TYPES[w.type].name.toLowerCase()}, ${num(w.km)} km. ${describe(w, p, z)}${w.why ? ` Serve a: ${w.why.toLowerCase()}.` : ''}` };
}

// ---------- Peso, HRV, battiti a riposo ----------
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
function lastVals(map, todayKey, days, excludeToday = true) {
  return Object.entries(map || {}).filter(([k]) => k > addDays(todayKey, -days) && (excludeToday ? k < todayKey : k <= todayKey)).sort().map(([, v]) => v);
}
function metricReply(db, todayKey, t) {
  const st = db.state; st.metrics = st.metrics || { weight: {}, hrv: {}, rhr: {} };
  const m = st.metrics;
  const n = re => { const x = t.match(re); return x ? parseFloat(x[1].replace(',', '.')) : null; };
  const w = n(/\b(?:peso|pesavo|peso di|bilancia)\D{0,12}(\d{2,3}(?:[.,]\d)?)/) ?? n(/\b(\d{2,3}(?:[.,]\d)?) ?(?:kg|chili|chilo)\b/);
  const h = n(/\bhrv\D{0,15}(\d{2,3})\b/) ?? n(/variabilita\D{0,30}(\d{2,3})\b/);
  const r = n(/(?:a riposo|battiti minimi|fc minima)\D{0,15}(\d{2,3})\b/) ?? n(/\b(\d{2,3})\D{0,15}a riposo/);
  const out = [];
  let changed = false;
  if (w && w > 35 && w < 200) {
    const prev = lastVals(m.weight, todayKey, 60);
    m.weight[todayKey] = w; changed = true;
    let s = `Segnato: ${num(w)} kg.`;
    if (prev.length) { const d = Math.round((w - prev[0]) * 10) / 10; s += d ? ` ${d < 0 ? 'Meno' : 'Più'} ${num(Math.abs(d))} kg rispetto al ${dayLabel(Object.keys(m.weight).filter(k => k > addDays(todayKey, -60) && k < todayKey).sort()[0])}.` : ' Stabile.'; }
    s += ' Se vuoi calare, fallo piano: al massimo mezzo chilo a settimana, e mai nelle ultime 3 settimane prima della gara. Ogni chilo in meno vale circa 2-3 secondi al chilometro, ma solo se non perdi energia negli allenamenti.';
    out.push(s);
  }
  if (h && h > 10 && h < 200) {
    const prev = lastVals(m.hrv, todayKey, 8);
    m.hrv[todayKey] = h; changed = true;
    let s = `Segnato: HRV ${h}.`;
    if (prev.length >= 3) {
      const a = avg(prev);
      if (h < a * 0.85) { st.tired = st.tired || {}; st.tired[todayKey] = true; s += ` È più bassa del solito (la tua media è ${Math.round(a)}): il corpo non ha ancora recuperato. Oggi trasformo l'allenamento in una corsa facile e più corta.`; }
      else if (h > a * 1.15) s += ` È più alta del solito (media ${Math.round(a)}): recupero buono.`;
      else s += ` In linea con la tua media (${Math.round(a)}): puoi allenarti come da programma.`;
    } else s += ' Dimmela ogni mattina: dopo 3 giorni la confronto con la tua media e se è bassa alleggerisco l\'allenamento.';
    out.push(s);
  }
  if (r && r > 30 && r < 110) {
    const prev = lastVals(m.rhr, todayKey, 8);
    m.rhr[todayKey] = r; changed = true;
    let s = `Segnato: ${r} battiti a riposo.`;
    if (prev.length >= 3) {
      const a = avg(prev);
      if (r >= a + 5) { st.tired = st.tired || {}; st.tired[todayKey] = true; s += ` Sono ${Math.round(r - a)} in più della tua media: segno di stanchezza o di un malanno in arrivo. Oggi solo corsa facile e corta.`; }
      else s += ` In linea con la tua media (${Math.round(a)}).`;
    } else s += ' Dimmeli per qualche mattina e li confronto con la tua media.';
    out.push(s);
  }
  if (out.length) return { reply: out.join(' '), changed };

  // domande senza numeri
  if (/hrv|variabilita/.test(t)) {
    const v = lastVals(m.hrv, todayKey, 8, false);
    return { reply: `L'HRV misura quanto varia il tempo tra un battito e l'altro durante la notte: più è alta rispetto al tuo solito, meglio hai recuperato. Conta il confronto con te stesso, non il numero assoluto. Dal Garmin che ho importato non arriva: lo trovi nell'app Garmin Connect alla voce "Stato HRV". ${v.length ? `Ultimi valori che mi hai detto: ${v.join(', ')}.` : 'Dimmelo la mattina, per esempio "HRV 48", e se è bassa alleggerisco l\'allenamento.'}`, ask: 'hrv', askText: 'Qual è la tua HRV di stanotte?' };
  }
  if (/pes[oi]|dimagr|chili|bilancia/.test(t)) {
    const v = Object.entries(m.weight).sort().slice(-1)[0];
    return { reply: `Il peso non arriva dai dati delle corse. ${v ? `L'ultimo che mi hai detto è ${num(v[1])} kg (${dayLabel(v[0])}).` : 'Dimmelo, per esempio "peso 74,5", e lo segno.'} Per la mezza conta più la costanza che la bilancia: se vuoi calare, al massimo mezzo chilo a settimana, carboidrati prima dei lunghi e delle sedute di qualità, e nessuna dieta nelle ultime 3 settimane prima di Napoli.`, ask: 'peso', askText: 'Quanto pesi in questi giorni?' };
  }
  return { reply: `I battiti a riposo si misurano al mattino appena sveglio; il Garmin li mostra nell'app Connect. Se un giorno sono 5 o più sopra il tuo solito, sei stanco o sta arrivando un malanno. Dimmeli, per esempio "52 a riposo".`, ask: 'rhr', askText: 'Quanti battiti a riposo avevi stamattina?' };
}

// ---------- Consigli generali ----------
const TIPS = [
  [/(tallon|fascit|pianta del piede|\bpiede\b|plantare)/, () => 'Per la fascite plantare le regole sono tre. Primo: ogni mattina controlla i primi passi appena alzato, è il segnale più sincero; se fanno male, segnalo nella scheda Oggi e alleggerisco. Secondo: allunga i polpacci due volte al giorno, 30 secondi per gamba, e fai rotolare una pallina sotto la pianta. Terzo: niente scalze in casa e scarpe non consumate. Se il dolore dura più di 7 giorni, vai dal fisioterapista.'],
  [/(sonno|dormi|dormito|riposo notturno)/, () => 'Il sonno è l\'allenamento invisibile: punta a 7-8 ore. Dopo una notte corta fai facile anche se il piano dice qualità: dimmi "ho dormito male" e lo sistemo. Prima del lungo cerca di dormire bene due notti di fila, non solo quella prima.'],
  [/(mangi|aliment|cibo|colazione|carboidrat|gel|integrat|bere|acqua|idrata)/, () => 'Prima delle sedute di qualità e dei lunghi mangia carboidrati 2-3 ore prima (pane, riso, pasta, banana). Dopo, entro un\'ora, carboidrati e proteine. Per la mezza: un gel al 7° e al 14° chilometro con un sorso d\'acqua, provandoli prima nei lunghi a ritmo gara, mai per la prima volta in gara.'],
  [/(scarp)/, () => 'Le scarpe vanno cambiate dopo 600-800 km, prima se senti la suola schiacciata. Con la fascite meglio una scarpa con buona ammortizzazione e un po\' di rialzo al tallone. Per la gara usa scarpe già provate in almeno due lunghi.'],
  [/(stretching|riscald|defatic|allungament|esercizi|forza|palestra|core)/, () => 'Prima delle sedute veloci: 10-15 minuti di corsa facile e qualche allungo. Dopo: 5 minuti di corsa lenta. Due volte a settimana 15 minuti di esercizi: polpacci in punta di piedi su un gradino, ponte per i glutei, plank. Proteggono il piede e le ginocchia.'],
  [/(zone|zona|battiti|cuore|frequenza)/, (db) => { const z = db.profile.zones; return `Le tue zone di battito: facile fino a ${z.easy}, medio ${z.easy + 1}-${z.medium}, soglia ${z.medium + 1}-${z.threshold}, sopra ${z.threshold} è veloce. Circa l'80% del tempo deve stare nella zona facile: è lì che costruisci il motore.`; }],
  [/(malat|influenz|raffredd|febbre)/, () => 'Con la febbre niente corsa. Con un raffreddore leggero solo corsa facile e corta. Dopo una malattia riparti con 2-3 uscite facili prima di rifare sedute impegnative: dimmi "salta oggi" se serve.'],
];

// ---------- Domande del coach: entrata e risposte brevi ----------
export function opening(db, todayKey, hour) {
  const st = db.state;
  const run = [...db.runs].sort((a, b) => a.start.localeCompare(b.start)).reverse().find(r => { const k = localDateKey(r.start); return k === todayKey || k === addDays(todayKey, -1); });
  if (run && !(st.feedback || {})[localDateKey(run.start)]) {
    const when = localDateKey(run.start) === todayKey ? 'di oggi' : 'di ieri';
    return { text: `Ciao Marco! Ho visto la corsa ${when}: ${km1(run.km)} km a ${fmtPace(run.sec / run.km)} al km. Com'è andata? Dimmi se c'era vento, salita, se eri su asfalto o sterrato, e come ti sentivi.`, ask: 'feedback' };
  }
  if (hour < 12 && !st.heelPain?.[todayKey] && (st.asked || {}).heel !== todayKey) {
    st.asked = { ...(st.asked || {}), heel: todayKey };
    return { text: 'Buongiorno Marco! Una domanda veloce: stamattina, ai primi passi appena alzato, hai sentito il tallone?', ask: 'heel' };
  }
  const o = oggiReply(db, todayKey).reply;
  return { text: `Ciao Marco! ${o} Vuoi sapere a che punto è la tua forma?`, ask: 'forma' };
}

// risposte a una domanda del coach ("sì", "no", un numero...)
export function followUp(ask, t, db, todayKey) {
  const yes = YES.test(t) || /^(mi fa|fa male|sento|ho sentito)/.test(t), no = NO.test(t) || /^non (ho|mi)/.test(t);
  const st = db.state;
  if (ask === 'heel' || ask === 'heelRun') {
    if (no && !yes) return { reply: ask === 'heel' ? 'Ottimo, il piede risponde bene. Allenamento confermato.' : 'Bene, il piede regge il carico. Così si va avanti.' };
    if (yes) {
      st.heelPain = st.heelPain || {}; st.heelPain[todayKey] = true;
      return { reply: 'Segnato. Oggi niente qualità: corsa corta e molto facile, oppure riposo se il dolore è forte. Allunga i polpacci e fai rotolare una pallina sotto il piede. Se dura più di 7 giorni, vai dal fisioterapista.', changed: true };
    }
  }
  if (ask === 'forma' && yes) return formaReply(db, todayKey);
  if (ask === 'migliora' && yes) return miglioraReply(db, todayKey);
  if (ask === 'ritmi' && yes) return ritmiReply(db, todayKey);
  if ((ask === 'forma' || ask === 'migliora' || ask === 'ritmi') && no) return { reply: 'Va bene. Quando vuoi chiedimi "come sto?" oppure "cosa devo fare oggi?".' };
  if (ask === 'hrv' && /^\d{2,3}\b/.test(t)) return metricReply(db, todayKey, 'hrv ' + t);
  if (ask === 'peso' && /^\d{2,3}([.,]\d)?\b/.test(t)) return metricReply(db, todayKey, 'peso ' + t);
  if (ask === 'rhr' && /^\d{2,3}\b/.test(t)) return metricReply(db, todayKey, t.match(/^\d+/)[0] + ' a riposo');
  return null;
}

// domande libere su forma, previsioni, ritmi, salute
export function topic(t, db, todayKey) {
  if (/(stato di forma|come sto\b|la (mia )?forma\b|a che punto|in che forma|come sono messo|sto migliorando|sono migliorat)/.test(t) && !/(migliorar|cosa fai|cosa farai|come fai)/.test(t)) return formaReply(db, todayKey);
  if (/(migliorar|cosa (fai|farai|intendi)|come (mi )?(fai|farai) (a )?migliora|strategia|perche (questo|il) piano|a cosa serv)/.test(t)) return miglioraReply(db, todayKey);
  if (/(previsi|prevedi|stima|che tempo|quanto (posso|potrei)|in quanto|tempo (sulla|in|nella)|quanto faccio|quanto farei|\b(sui|nei|sulla|in una) (5|10|21|mezza))/.test(t)) return previsioniReply(db, todayKey, t);
  if (/(ritm|passo|che velocita|quanto (devo )?andare)/.test(t)) return ritmiReply(db, todayKey);
  if (/(quanto manca|giorni alla|napoli|la gara|obiettivo)/.test(t)) return gareReply(db, todayKey);
  if (/(hrv|variabilita|\bpes[oi]\b|dimagr|chili|\bkg\b|bilancia|a riposo|battiti minimi)/.test(t)) return metricReply(db, todayKey, t);
  if (/(oggi cosa|cosa (devo fare|faccio) oggi|allenamento di oggi|oggi che|che (allenamento|faccio) oggi)/.test(t)) return oggiReply(db, todayKey);
  for (const [re, fn] of TIPS) if (re.test(t)) {
    let reply = fn(db), changed = false;
    // "mi fa male il tallone": lo segno anche, così il piano di oggi si alleggerisce
    if (/(tallon|piede|plantare)/.test(t) && /(fa male|dolor|fastidi|sento)/.test(t) && !/non (mi )?(fa|sento)/.test(t)) {
      db.state.heelPain = db.state.heelPain || {}; db.state.heelPain[todayKey] = true; changed = true;
      reply = 'Ho segnato il dolore al tallone di oggi: l\'allenamento diventa corto e molto facile, o riposo se fa male camminando. ' + reply;
    }
    return { reply, changed };
  }
  return null;
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
