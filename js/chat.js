// Il coach in chat: capisce frasi semplici in italiano per cambiare i giorni del piano.
// Non usa internet: riconosce parole chiave (giorni, "sposta", "salta", "lungo"...).
import { TYPES } from './plan.js';
import { activePlan, slotsFromDays, DAY_NAMES } from './schedule.js';
import { addDays, parseKey, mondayOf } from './analysis.js';

const DAY_WORDS = [
  [/\b(domenica|dom)\b/, 0], [/\b(lunedi|lun)\b/, 1], [/\b(martedi)\b/, 2], [/\b(mercoledi|mer)\b/, 3],
  [/\b(giovedi|gio)\b/, 4], [/\b(venerdi|ven)\b/, 5], [/\b(sabato|sab)\b/, 6],
];
const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const dayLabel = key => { const d = parseKey(key); return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`; };
const wName = w => `${TYPES[w.type].name.toLowerCase()} (${String(w.km).replace('.', ',')} km)`;

// Trova i riferimenti a giorni nella frase, nell'ordine in cui compaiono.
function findDays(t) {
  const hits = [];
  for (const [re, wd] of DAY_WORDS) { const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(t))) hits.push({ i: m.index, wd }); }
  for (const [re, rel] of [[/\bdopodomani\b/g, 2], [/\bdomani\b/g, 1], [/\boggi\b/g, 0]]) { let m; while ((m = re.exec(t))) hits.push({ i: m.index, rel }); }
  // "domani" dentro "dopodomani" non va contato due volte
  return hits.sort((a, b) => a.i - b.i);
}
// Un giorno della settimana -> la prossima data con quel giorno (oggi compreso)
function nextDate(todayKey, hit, from = todayKey) {
  if (hit.rel != null) return addDays(todayKey, hit.rel);
  for (let i = 0; i < 7; i++) { const k = addDays(from, i); if (parseKey(k).getDay() === hit.wd) return k; }
}

const HELP = `Posso cambiare il piano così:
• "Posso correre lunedì, mercoledì, venerdì e domenica" (da 3 a 4 giorni)
• "Il lungo lo faccio il sabato"
• "Sposta domani a giovedì" oppure "sposta il lungo a sabato"
• "Salta oggi" (se non riesci a correre)
• "Com'è la mia settimana?"
• "Torna al piano originale"`;

export function answer(text, db, todayKey) {
  const t = norm(text).trim();
  const st = db.state;
  st.moves = st.moves || {};
  const plan = activePlan(st, todayKey);
  const upcoming = plan.filter(w => w.date >= todayKey && !w.skipped);
  const days = findDays(t);

  if (!t) return { reply: HELP };

  // Ripristino
  if (/(ripristin|originale|annulla tutt|come prima|resetta|azzera)/.test(t)) {
    delete st.schedules; st.moves = {};
    return { reply: 'Fatto: sono tornato al piano originale (martedì e giovedì, facoltativo il sabato, lungo la domenica).', changed: true };
  }

  // Com'è la settimana
  if (/(settimana|quali giorni|che giorni|programma|cosa (devo|ho)|prossim)/.test(t) && !/(spost|salt|posso|voglio|preferisc)/.test(t)) {
    const mon = mondayOf(todayKey), sun = addDays(mon, 13);
    const list = plan.filter(w => w.date >= todayKey && w.date <= sun);
    if (!list.length) return { reply: 'Non ci sono allenamenti nei prossimi giorni.' };
    return { reply: 'Ecco i prossimi allenamenti:\n' + list.map(w => `• ${dayLabel(w.date)}: ${w.skipped ? 'saltato' : wName(w)}${w.optional ? ', facoltativo' : ''}`).join('\n') };
  }

  // Saltare un allenamento
  if (/(salt|non (posso|riesco) (a )?correre|non corro|cancella|togli)/.test(t)) {
    const hit = days[0] || { rel: 0 };
    const date = nextDate(todayKey, hit);
    const w = plan.find(x => x.date === date && !x.skipped);
    if (!w) return { reply: `${cap(dayLabel(date))} non c'è nessun allenamento in programma: niente da saltare.` };
    if (w.type === 'race') return { reply: 'La gara non la tolgo! Se hai un problema parliamone con calma.' };
    st.moves[w.orig] = 'skip';
    const tip = TYPES[w.type].long ? ' Se vuoi recuperare il lungo, puoi anche spostarlo: scrivi per esempio "sposta il lungo a sabato".' : ' Non recuperarlo: riparti dal prossimo allenamento.';
    return { reply: `Ok, ho tolto ${wName(w)} di ${dayLabel(date)}.${tip}`, changed: true };
  }

  // Spostare un allenamento
  if (/(spost|anticip|posticip|rimand|invece di|al posto di|cambia)/.test(t) && (days.length || /lungo|ripetut|qualita|veloce|soglia|test/.test(t))) {
    let w, target;
    const kind = /lungo/.test(t) ? 'long' : /(ripetut|qualita|veloce|soglia|ritmo|medio)/.test(t) ? 'quality' : /test/.test(t) ? 'test' : null;
    if (kind && days.length >= 1 && !(days.length >= 2)) {
      w = upcoming.find(x => kind === 'long' ? TYPES[x.type].long : kind === 'test' ? x.type === 'test' : TYPES[x.type].quality && !TYPES[x.type].long);
      if (!w) return { reply: 'Non trovo quell\'allenamento nei prossimi giorni.' };
      target = nearest(w.date, days[0], todayKey);
    } else if (days.length >= 2) {
      const from = nextDate(todayKey, days[0]);
      w = plan.find(x => x.date === from && !x.skipped);
      if (!w) return { reply: `${cap(dayLabel(from))} non c'è nessun allenamento da spostare.` };
      target = nearest(w.date, days[1], todayKey);
    } else return { reply: 'Dimmi da quale giorno a quale giorno, per esempio "sposta domani a giovedì".' };
    if (!target || target < todayKey) return { reply: 'Non posso spostarlo nel passato. Scegli un giorno da oggi in poi.' };
    if (w.type === 'race') return { reply: 'La gara ha la sua data: quella non si sposta.' };
    if (target === w.date) return { reply: `È già ${dayLabel(target)}.` };
    const other = plan.find(x => x.date === target && !x.skipped && x !== w);
    if (other) {
      if (other.type === 'race') return { reply: 'Quel giorno c\'è la gara: scegli un altro giorno.' };
      st.moves[other.orig] = w.date;
    }
    st.moves[w.orig] = target;
    let reply = `Fatto: ${wName(w)} passa da ${dayLabel(w.date)} a ${dayLabel(target)}.`;
    if (other) reply += ` Al suo posto, ${dayLabel(w.date)}, ho messo ${wName(other)}.`;
    reply += warnBackToBack(activePlan(st, todayKey), target);
    return { reply, changed: true };
  }

  // Giorni fissi di allenamento (e giorno del lungo)
  const longMatch = t.match(/lungo[a-z ]{0,25}?\b(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/);
  const longDay = longMatch ? DAY_WORDS.find(([re]) => re.test(longMatch[1]))[1] : null;
  const wdays = days.filter(h => h.wd != null).map(h => h.wd);
  if (wdays.length >= 2 || (longDay != null && /(lungo)/.test(t))) {
    let list = [...new Set(wdays)];
    const last = (st.schedules || []).slice(-1)[0];
    const cur = last?.days || [2, 4, 6, 0];
    if (list.length < 2 && longDay != null) {
      // solo il giorno del lungo: tengo gli altri giorni e sposto quello del lungo
      const old = last?.slots?.long ?? 0;
      list = [...new Set(cur.filter(d => d !== old && d !== longDay).concat(longDay))];
    }
    const slots = slotsFromDays(list, longDay);
    if (slots.error === 'few') return { reply: 'Con meno di 3 uscite a settimana la preparazione per la mezza non regge. Dimmi almeno 3 giorni (il quarto è facoltativo).' };
    if (slots.error === 'many') return { reply: 'Più di 4 uscite a settimana per ora sono troppe, col piede da proteggere. Scegline 3 o 4.' };
    st.schedules = (st.schedules || []).filter(x => x.since < todayKey).concat({ days: list, slots, since: todayKey });
    // i nuovi giorni sostituiscono gli spostamenti singoli fatti per i prossimi giorni
    for (const k of Object.keys(st.moves)) if (k > todayKey) delete st.moves[k];
    const names = d => DAY_NAMES[d];
    let reply = `Fatto, da oggi il piano segue i tuoi giorni:\n• ${cap(names(slots.main))}: seduta principale (ritmo, soglia o allunghi)\n• ${cap(names(slots.easy))}: uscita facile\n${slots.opt != null ? `• ${cap(names(slots.opt))}: uscita facoltativa molto facile\n` : ''}• ${cap(names(slots.long))}: lungo`;
    if (slots.opt == null) reply += '\nCon 3 giorni tolgo l\'uscita facoltativa.';
    const gap = (slots.long - slots.main + 7) % 7;
    if (gap === 1 || gap === 6) reply += '\nAttenzione: la seduta principale e il lungo sono in giorni attaccati. Va bene, ma se ti senti stanco fai la seduta più facile.';
    reply += '\nLa settimana della gara resta com\'è.';
    return { reply, changed: true };
  }

  if (/(ciao|aiuto|help|cosa (sai|puoi)|come funziona)/.test(t)) return { reply: HELP };
  return { reply: 'Non ho capito. ' + HELP };
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Il giorno con quel nome più vicino all'allenamento (stessa settimana, o la successiva se è già passato)
function nearest(fromDate, hit, todayKey) {
  if (hit.rel != null) return addDays(todayKey, hit.rel);
  const mon = mondayOf(fromDate);
  const off = (hit.wd + 6) % 7;
  let k = addDays(mon, off);
  if (k < todayKey) k = addDays(k, 7);
  return k;
}

function warnBackToBack(plan, date) {
  const w = plan.find(x => x.date === date && !x.skipped);
  if (!w || !TYPES[w.type].quality) return '';
  const near = plan.filter(x => !x.skipped && x !== w && (x.date === addDays(date, 1) || x.date === addDays(date, -1)) && TYPES[x.type].quality);
  return near.length ? ' Attenzione: il giorno accanto c\'è un\'altra seduta impegnativa. Se ti senti stanco, fai la seconda più facile.' : '';
}
