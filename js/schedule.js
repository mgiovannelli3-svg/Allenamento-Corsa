// Personalizzazioni del piano: giorni fissi di allenamento, spostamenti e salti singoli.
// Il piano originale (PLAN) non cambia: qui si calcola il piano "attivo" a partire dalle scelte salvate.
import { PLAN } from './plan.js';
import { addDays, mondayOf, parseKey } from './analysis.js';

export const DAY_NAMES = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const offset = wd => (wd + 6) % 7; // lunedì = 0 ... domenica = 6
const RACE_WEEK = mondayOf('2027-02-21');

// Ogni allenamento ha un "posto" nella settimana: seduta principale, uscita facile, facoltativa, lungo.
export function slotOf(w) {
  const wd = parseKey(w.date).getDay();
  if (wd === 0) return 'long';
  if (wd === 6) return w.optional ? 'opt' : 'long';
  if (wd === 2) return 'main';
  return 'easy'; // giovedì (e il venerdì 20 novembre)
}

// Giorni scelti -> giorno per ogni posto. days: numeri JS (0 = domenica).
export function slotsFromDays(days, longDay) {
  const list = [...new Set(days)].sort((a, b) => offset(a) - offset(b));
  if (list.length < 3) return { error: 'few' };
  if (list.length > 4) return { error: 'many' };
  let long = longDay != null && list.includes(longDay) ? longDay : null;
  if (long == null) long = [...list].reverse().find(d => d === 0 || d === 6) ?? list[list.length - 1];
  const rest = list.filter(d => d !== long);
  return { main: rest[0], easy: rest[1], opt: rest[2] ?? null, long };
}

// Il piano attivo: PLAN + giorni fissi (da una certa data in poi) + spostamenti singoli.
export function activePlan(state, todayKey) {
  const list = state.schedules || [];
  let plan = PLAN.map(w => ({ ...w, orig: w.date }));
  if (list.length) {
    plan = plan.flatMap(w => {
      const mon = mondayOf(w.date);
      // vale la scelta più recente fatta prima di questo allenamento
      const sch = [...list].reverse().find(x => x.since <= w.date);
      if (!sch || w.type === 'race' || mon >= RACE_WEEK) return [w]; // la settimana della gara non si tocca
      const slot = slotOf(w);
      const day = sch.slots[slot];
      if (day == null) return slot === 'opt' ? [] : [w]; // con 3 giorni il facoltativo sparisce
      const date = addDays(mon, offset(day));
      if (date <= sch.since && date !== w.date) return [w]; // non sposto niente su oggi o nel passato
      const { altDate, alt, ...rest } = w;
      return [{ ...rest, date }];
    });
  }
  const moves = state.moves || {};
  plan = plan.map(w => {
    const m = moves[w.orig];
    if (!m) return w;
    if (m === 'skip') return { ...w, skipped: true };
    const { altDate, alt, ...rest } = w;
    return { ...rest, date: m, movedFrom: w.date };
  });
  return plan.sort((a, b) => a.date.localeCompare(b.date));
}
