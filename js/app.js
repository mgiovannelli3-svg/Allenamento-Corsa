import { load, save, reset, mergeRuns } from './store.js';
import { fitToRun } from './fit.js';
import { unzipFits } from './zip.js';
import { parseActivitiesCsv } from './csv.js';
import { fitness, paces, weeklyKm, fmtPace, fmtTime, localDateKey, addDays, mondayOf, parseKey, bestTestCandidate, DAY } from './analysis.js';
import { TYPES, describe, today, matchPlan, weekSummary, phaseOf } from './plan.js';
import { activePlan } from './schedule.js';
import { answer } from './chat.js';

let db = load();
let tab = 'oggi';
try { tab = sessionStorage.getItem('tab') || 'oggi'; } catch {}

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const todayKey = () => localDateKey(new Date());
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const fmtDay = (key, long = false) => { const d = parseKey(key); return long ? `${['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}` : `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`; };
const fmtKm = km => (Math.round(km * 10) / 10).toLocaleString('it-IT');

function model() {
  const t = todayKey();
  const fit = fitness(db.runs, db.profile, t);
  const p = paces(fit.halfSec, db.profile);
  const plan = activePlan(db.state, t);
  return { t, fit, p, plan };
}

// ---------- OGGI ----------
function viewOggi() {
  const { t, fit, p, plan } = model();
  const z = db.profile.zones;
  const d = today(t, db.runs, fit, p, db.profile, db.state, plan);
  const daysToRace = Math.round((parseKey(db.profile.raceDate) - parseKey(t)) / DAY);
  const ph = phaseOf(t);
  let card;
  const next = d.next;
  const nextLine = next ? `<p class="muted">Prossimo: <b>${fmtDay(next.date, true)}</b> · ${TYPES[next.type].name}, ${fmtKm(next.km)} km</p>` : '';
  const runLine = r => `${fmtKm(r.km)} km in ${fmtTime(r.sec)}, ${fmtPace(r.sec / r.km)}/km${r.avgHr ? `, cuore medio ${r.avgHr}` : ''}`;
  if (d.done) {
    const a = d.adjusted, r = a.run;
    card = `<div class="card hero done">
      <div class="eyebrow">Oggi · fatto</div>
      <h2>${esc(TYPES[a.type].name)} <span class="km">✓</span></h2>
      <p>${runLine(r)}.</p>
      ${a.movedFrom ? `<p class="muted">Era previsto per ${fmtDay(a.movedFrom, true)}: l'ho segnato come fatto, quindi quel giorno è riposo.</p>` : ''}
      ${d.verdict ? `<p class="verdict">${esc(d.verdict)}</p>` : ''}
      ${nextLine}
      <button class="btn primary small" id="tellRun">🎤 Racconta com'è andata</button>
    </div>`;
  } else if (!d.adjusted) {
    const extra = d.doneToday[d.doneToday.length - 1];
    card = `<div class="card hero rest">
      <div class="eyebrow">Oggi</div>
      ${extra ? `<h2>Corsa extra ✓</h2><p>${runLine(extra)}. Oggi non era in programma: va bene, ma tienila facile e non aggiungerne altre in settimana.</p><button class="btn primary small" id="tellRun">🎤 Racconta com'è andata</button>`
      : `<h2>Riposo</h2><p>Se ti va: 20-30 minuti di forza (squat, affondi, ponte glutei, polpacci, plank) e gli esercizi per il piede.</p>`}
      ${nextLine}
    </div>`;
  } else if (d.adjusted.type === 'rest') {
    card = `<div class="card hero stop"><div class="eyebrow">Oggi</div><h2>Stop alla corsa</h2><p>Riposo e controllo dal medico o dal fisioterapista.</p></div>`;
  } else {
    const a = d.adjusted, changed = a.type !== d.planned.type || a.km !== d.planned.km;
    card = `<div class="card hero ${TYPES[a.type].quality ? 'quality' : 'easy'}">
      <div class="eyebrow">Oggi${a.optional ? ' · facoltativo' : ''}${a.movedFrom ? ` · previsto ${fmtDay(a.movedFrom)}` : ''}</div>
      <h2>${esc(TYPES[a.type].name)} <span class="km">${fmtKm(a.km)} km</span></h2>
      <p>${esc(describe(a, p, z))}</p>
      <p class="muted">A cosa serve: ${esc(a.why)}</p>
      ${changed ? `<p class="changed">Adattato: il piano prevedeva ${esc(TYPES[d.planned.type].name.toLowerCase())}, ${fmtKm(d.planned.km)} km.</p>` : ''}
      ${d.verdict ? `<p class="verdict">${esc(d.verdict)}</p>` : '<p class="muted">Hai già corso? Carica la corsa dalla scheda Dati e la segno come fatta.</p>'}
    </div>`;
  }
  const notes = d.notes.map(n => `<div class="note ${n.level}">${esc(n.text)}</div>`).join('');
  const st = db.state;
  const wk = weekSummary(d.matched, mondayOf(t), db.runs);
  const pct = wk.planned ? Math.min(100, Math.round(wk.done / wk.planned * 100)) : 0;
  return `
    <section>
      <div class="dateline">${fmtDay(t, true)}${ph ? ` · ${ph.name}` : ''}</div>
      ${card}
      <div class="card check">
        <div class="q">Come stai stamattina?</div>
        <label class="toggle"><input type="checkbox" data-flag="heelPain" ${st.heelPain[t] ? 'checked' : ''}> Dolore al tallone ai primi passi</label>
        <label class="toggle"><input type="checkbox" data-flag="tired" ${st.tired[t] ? 'checked' : ''}> Molto stanco o dormito male</label>
      </div>
      ${notes}
      <div class="card">
        <div class="row between"><b>Questa settimana</b><span>${fmtKm(wk.done)} di ${fmtKm(wk.planned)} km</span></div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <ul class="week">${wk.items.map(m => `<li class="${m.status}"><span class="dot"></span><span class="wd">${fmtDay(m.date)}</span><span class="wt">${esc(TYPES[m.type].name)}${m.optional ? ' (facoltativo)' : ''}</span><span class="wk">${fmtKm(m.km)} km</span></li>`).join('') || '<li class="muted">Nessun allenamento in piano</li>'}</ul>
      </div>
      <div class="card countdown">
        <div><span class="big">${daysToRace >= 0 ? daysToRace : '–'}</span> giorni alla ${esc(db.profile.raceName)}</div>
        <div class="muted">Stima di oggi: <b>${fit.halfSec ? fmtTime(fit.halfSec) : '–'}</b> · obiettivo ${fmtTime(db.profile.goalSec)}</div>
      </div>
      ${db.runs.length ? '' : `<div class="note info">Non hai ancora caricato le tue corse. Vai su <b>Dati</b> e carica i file del Garmin: l'app calcolerà la tua forma e adatterà il piano.</div>`}
    </section>`;
}

// ---------- FORMA ----------
function viewForma() {
  const { t, fit, p, plan } = model();
  const z = db.profile.zones;
  if (!db.runs.length) return `<section><h1>Stato di forma</h1><div class="note info">Carica le corse dalla scheda <b>Dati</b> per vedere il tuo stato di forma.</div></section>`;
  const weeks = weeklyKm(db.runs, t, 10);
  const effS = fit.effSeries.filter(e => e.date >= addDays(t, -365));
  const anc = fit.anchor;
  const drop = anc && fit.effNow ? Math.round((fit.effNow / anc.eff - 1) * 100) : null;
  const last = [...db.runs].slice(-8).reverse();
  const zp = fit.zonePct;
  return `<section>
    <h1>Stato di forma</h1>
    <div class="grid2">
      <div class="card stat"><div class="eyebrow">Stima mezza oggi</div><div class="big">${fit.halfSec ? fmtTime(fit.halfSec) : '–'}</div><div class="muted">${anc ? `rispetto a: ${esc(anc.label)}` : ''}</div></div>
      <div class="card stat load-${fit.loadState.key}"><div class="eyebrow">Carico</div><div class="big small">${esc(fit.loadState.label)}</div><div class="muted">${fit.ratio ? `ultimi 7 giorni ${Math.round(fit.ratio * 100)}% della media` : ''}</div></div>
    </div>
    <div class="card"><p>${esc(fit.loadState.text)}</p>
      ${drop != null ? `<p>A 140 battiti oggi corri a <b>${fmtPace(fit.effNow)}/km</b>; al momento del riferimento correvi a ${fmtPace(anc.eff)}/km. ${drop > 0 ? `Ti manca circa il ${drop}% per tornare a quel livello.` : `Sei ${-drop}% più efficiente di allora.`}</p>` : ''}
    </div>
    <div class="card"><b>Passo a 140 battiti</b><div class="muted">Più in alto = più in forma. Solo le corse con almeno 5 minuti tra 136 e 144 battiti.</div>${effChart(effS)}</div>
    <div class="card"><b>Km a settimana</b>${barChart(weeks)}</div>
    ${zp ? `<div class="card"><b>Intensità ultime 4 settimane</b>
      <div class="zones">${['Facile', 'Medio', 'Soglia', 'Veloce'].map((n, i) => `<span class="z${i}" style="flex:${zp[i] || 0.0001}"></span>`).join('')}</div>
      <div class="zleg">${['Facile', 'Medio', 'Soglia', 'Veloce'].map((n, i) => `<span><i class="z${i}"></i>${n} ${zp[i]}%</span>`).join('')}</div>
      <p class="muted">Obiettivo: almeno 75-80% facile.</p></div>` : ''}
    <div class="card"><b>I tuoi ritmi oggi</b>
      <table class="tbl"><tr><th>Zona</th><th>Battiti</th><th>Passo</th></tr>
      <tr><td>Facile</td><td>fino a ${z.easy}</td><td>${fmtPace(p.easy[0])}-${fmtPace(p.easy[1])}</td></tr>
      <tr><td>Medio</td><td>${z.easy + 1}-${z.medium}</td><td>${fmtPace(p.medium[0])}-${fmtPace(p.medium[1])}</td></tr>
      <tr><td>Soglia</td><td>${z.medium + 1}-${z.threshold}</td><td>${fmtPace(p.threshold[0])}-${fmtPace(p.threshold[1])}</td></tr>
      <tr><td>Veloce</td><td>oltre ${z.threshold}</td><td>${fmtPace(p.fast[0])}-${fmtPace(p.fast[1])}</td></tr>
      <tr><td>Ritmo gara</td><td></td><td>${fmtPace(p.race)}</td></tr></table>
      <p class="muted">Si aggiornano da soli quando carichi nuove corse e dopo il test dei 5 km.</p>
    </div>
    <div class="card"><b>Ultime corse</b><ul class="runs">${last.map(runRow).join('')}</ul></div>
  </section>`;
}

function runRow(r) {
  const k = localDateKey(r.start);
  const time = new Date(r.start).toTimeString().slice(0, 5);
  return `<li><span class="wd">${fmtDay(k)} <small>${time}</small></span><span>${fmtKm(r.km)} km</span><span>${fmtPace(r.sec / r.km)}/km</span><span>${r.avgHr ? r.avgHr + ' bpm' : ''}</span></li>`;
}

function effChart(series) {
  if (series.length < 2) return '<p class="muted">Servono più corse.</p>';
  const W = 340, H = 150, P = 28;
  const t0 = parseKey(series[0].date).getTime(), t1 = parseKey(series[series.length - 1].date).getTime() || t0 + 1;
  const vals = series.map(s => s.eff);
  const lo = Math.min(...vals) - 5, hi = Math.max(...vals) + 5;
  const x = d => P + (parseKey(d).getTime() - t0) / Math.max(1, t1 - t0) * (W - P - 6);
  const y = v => 6 + (v - lo) / (hi - lo) * (H - 26);
  // media mobile su 5 corse
  const avg = series.map((s, i) => { const w = series.slice(Math.max(0, i - 4), i + 1); return { date: s.date, eff: w.reduce((a, b) => a + b.eff, 0) / w.length }; });
  const ticks = [lo + 5, (lo + hi) / 2, hi - 5];
  const months = []; let lastM = '';
  for (const s of series) { const m = s.date.slice(0, 7); if (m !== lastM) { months.push(s.date); lastM = m; } }
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Passo a 140 battiti nel tempo">
    ${ticks.map(v => `<line x1="${P}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${P - 4}" y="${y(v) + 3}" class="ax" text-anchor="end">${fmtPace(v)}</text>`).join('')}
    ${months.filter((_, i) => i % 2 === 0).map(d => `<text x="${x(d)}" y="${H - 4}" class="ax">${MESI[parseKey(d).getMonth()]}</text>`).join('')}
    ${series.map(s => `<circle cx="${x(s.date)}" cy="${y(s.eff)}" r="2.2" class="pt"/>`).join('')}
    ${segments(avg).map(seg => `<polyline points="${seg.map(s => `${x(s.date)},${y(s.eff)}`).join(' ')}" class="line"/>`).join('')}
  </svg>`;
}

// spezza la linea dove mancano dati per più di 3 settimane (es. lo stop per la fascite)
function segments(series) {
  const out = [[]];
  series.forEach((s, i) => { if (i && parseKey(s.date) - parseKey(series[i - 1].date) > 21 * DAY) out.push([]); out[out.length - 1].push(s); });
  return out.filter(seg => seg.length > 1);
}

function barChart(weeks) {
  const W = 340, H = 140, P = 22;
  const max = Math.max(10, ...weeks.map(w => w.km));
  const bw = (W - P) / weeks.length;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Km per settimana">
    ${weeks.map((w, i) => { const h = w.km / max * (H - 36); const d = parseKey(w.week); return `<rect x="${P + i * bw + 3}" y="${H - 18 - h}" width="${bw - 6}" height="${h}" rx="3" class="barr"/>
      <text x="${P + i * bw + bw / 2}" y="${H - 22 - h}" text-anchor="middle" class="val">${Math.round(w.km)}</text>
      <text x="${P + i * bw + bw / 2}" y="${H - 5}" text-anchor="middle" class="ax">${d.getDate()}/${d.getMonth() + 1}</text>`; }).join('')}
  </svg>`;
}

// ---------- PIANO ----------
function viewPiano() {
  const { t, fit, p, plan } = model();
  const matched = matchPlan(db.runs, t, plan);
  const mondays = [...new Set(plan.map(w => mondayOf(w.date)))];
  let html = `<section><h1>Piano verso Napoli</h1>
    <p class="muted">${db.state.schedules?.length || Object.keys(db.state.moves || {}).length ? 'Il piano segue le modifiche che hai chiesto al Coach.' : 'Martedì e giovedì le uscite in settimana, lungo la domenica, sabato facoltativo.'} Per cambiare giorni scrivi al <b>Coach</b>. Se salti un allenamento non recuperarlo: riparti dal successivo. Tocca un allenamento per i dettagli.</p>`;
  let lastPhase = '';
  for (const mon of mondays) {
    const wk = weekSummary(matched, mon, db.runs);
    const ph = wk.phase?.name || '';
    if (ph !== lastPhase) { html += `<h2 class="phase">${esc(ph)}</h2>`; lastPhase = ph; }
    const current = t >= mon && t <= addDays(mon, 6);
    html += `<div class="card week-card ${current ? 'current' : ''}">
      <div class="row between"><b>Settimana del ${fmtDay(mon)}</b><span class="muted">${wk.done ? `${fmtKm(wk.done)} / ` : ''}${fmtKm(wk.planned)}${wk.plannedMax > wk.planned ? `-${fmtKm(wk.plannedMax)}` : ''} km</span></div>
      <ul class="week">${wk.items.map(m => `<li class="${m.status}"><details><summary><span class="dot"></span><span class="wd">${fmtDay(m.date)}</span><span class="wt">${esc(TYPES[m.type].name)}${m.optional ? ' (fac.)' : ''}</span><span class="wk">${fmtKm(m.km)} km</span></summary>
        <div class="det">${esc(describe(m, p, db.profile.zones))}<br><span class="muted">${esc(m.why)}${m.alt ? ' · ' + esc(m.alt) : ''}</span>${m.run ? `<br>Fatto: ${fmtKm(m.run.km)} km a ${fmtPace(m.run.sec / m.run.km)}/km${m.run.avgHr ? `, cuore medio ${m.run.avgHr}` : ''}` : ''}</div></details></li>`).join('')}</ul>
    </div>`;
  }
  return html + `<div class="card"><b>Ogni giorno, 10 minuti per il piede</b><ul class="plain">
    <li>Sollevamenti sui polpacci lenti su un gradino: 3 x 12, scendendo in 3 secondi, prima a gambe tese poi a ginocchia piegate.</li>
    <li>Allungamento del polpaccio al muro, 2 x 30" per gamba, e pallina sotto la pianta.</li>
    <li>Asciugamano raccolto con le dita dei piedi, 2 x 1'.</li></ul></div></section>`;
}

// ---------- DATI ----------
function viewDati() {
  const pf = db.profile, z = pf.zones;
  const cand = bestTestCandidate(db.runs, pf);
  const hasTest = pf.tests.length > 0;
  const first = db.runs[0], lastR = db.runs[db.runs.length - 1];
  return `<section><h1>Dati</h1>
    <div class="card">
      <b>Carica le corse dal Garmin</b>
      <p class="muted">Puoi scegliere più file insieme: i .zip scaricati da Garmin Connect (anche l'export completo), i file .fit o il file Activities.csv. I doppioni vengono ignorati.</p>
      <label class="btn primary file-btn" for="files">Scegli i file</label>
      <input type="file" id="files" multiple class="file-input">
      <div id="importMsg" class="muted" aria-live="polite"></div>
      <p>${db.runs.length ? `Hai <b>${db.runs.length}</b> corse salvate, dal ${fmtDay(localDateKey(first.start))} ${parseKey(localDateKey(first.start)).getFullYear()} al ${fmtDay(localDateKey(lastR.start))} ${parseKey(localDateKey(lastR.start)).getFullYear()}.` : 'Nessuna corsa salvata.'}</p>
      <details class="help"><summary>Come scarico i file dal Garmin?</summary>
        <ol><li>Dal browser del telefono apri <b>connect.garmin.com</b> e accedi.</li>
        <li>Apri l'attività, tocca l'icona a ingranaggio e scegli <b>Esporta originale</b>: scarica un file .zip.</li>
        <li>Torna qui, tocca <b>Scegli i file</b> e seleziona lo zip dai Download.</li></ol>
        <p>Il file .fit dà il quadro completo (battiti secondo per secondo). Il CSV dà solo i riassunti.</p></details>
    </div>
    <div class="card"><b>Hai un codice dello storico?</b>
      <p class="muted">Se ti ho mandato un link o un codice con le tue corse, incollalo qui.</p>
      <form id="codeForm"><textarea id="code" name="code" rows="3" placeholder="Incolla qui il codice o il link"></textarea><button class="btn small">Carica lo storico</button></form>
    </div>
    ${cand && !hasTest ? `<div class="note info">Ho trovato il tuo test: 5 km in <b>${fmtTime(cand.best5k)}</b> il ${fmtDay(localDateKey(cand.start))}. <button class="btn small" id="useTest" data-sec="${cand.best5k}" data-date="${localDateKey(cand.start)}">Usalo per ricalcolare i ritmi</button></div>` : ''}
    <div class="card"><b>Test 5 km</b>
      <p class="muted">Dopo il test, il tempo dei 5 km ricalcola stima della mezza e ritmi.</p>
      ${pf.tests.map((t, i) => `<div class="row between"><span>${fmtDay(t.date)}: ${fmtTime(t.sec)}</span><button class="btn small ghost" data-deltest="${i}">Togli</button></div>`).join('')}
      <form id="testForm" class="row"><input type="date" name="date" value="${todayKey()}" required><input name="time" placeholder="mm:ss" pattern="\\d{1,2}:\\d{2}" required inputmode="numeric" size="6"><button class="btn small">Aggiungi</button></form>
    </div>
    <form class="card" id="profileForm"><b>Impostazioni</b>
      <div class="field"><span>Facile: battiti fino a</span><input type="number" name="easy" value="${z.easy}" min="100" max="200"></div>
      <div class="field"><span>Medio: battiti fino a</span><input type="number" name="medium" value="${z.medium}" min="100" max="200"></div>
      <div class="field"><span>Soglia: battiti fino a</span><input type="number" name="threshold" value="${z.threshold}" min="100" max="210"></div>
      <div class="field"><span>Obiettivo a Napoli</span><input name="goal" value="${fmtTime(pf.goalSec)}" pattern="\\d:\\d{2}:\\d{2}"></div>
      <button class="btn">Salva</button>
    </form>
    <div class="card"><b>Copia di sicurezza</b>
      <p class="muted">I dati restano solo su questo telefono. Salva una copia ogni tanto, o per spostarli su un altro dispositivo.</p>
      <div class="row"><button class="btn" id="export">Scarica copia</button><button class="btn ghost danger" id="wipe">Cancella tutto</button></div>
    </div>
  </section>`;
}

// ---------- IMPORT ----------
async function importFiles(files) {
  const msg = $('#importMsg');
  const zones = db.profile.zones;
  const runs = []; const errors = []; let skipped = 0;
  let n = 0;
  for (const f of files) {
    n++; if (msg) msg.textContent = `Leggo ${n} di ${files.length}…`;
    try {
      const name = f.name.toLowerCase();
      if (name.endsWith('.csv')) runs.push(...parseActivitiesCsv(await f.text()));
      else if (name.endsWith('.json')) {
        const data = JSON.parse(await f.text());
        if (Array.isArray(data.runs)) runs.push(...data.runs);
        if (data.profile) db.profile = { ...db.profile, ...data.profile };
        if (data.state) db.state = { ...db.state, ...data.state };
      } else {
        const buf = await f.arrayBuffer();
        const fits = name.endsWith('.zip') ? await unzipFits(buf) : [{ name: f.name, data: buf }];
        for (const x of fits) { const r = fitToRun(x.data, zones); if (r) runs.push(r); else skipped++; }
      }
    } catch (e) { errors.push(`${f.name}: ${e.message}`); }
  }
  const { added, updated } = mergeRuns(db, runs);
  save(db);
  render();
  const m = $('#importMsg');
  if (m) m.innerHTML = `<span class="ok">Fatto: ${added ? `${added} corse nuove` : 'nessuna corsa nuova'}${updated && updated > added ? `, ${updated} completate col file FIT` : ''}.</span>${skipped ? ` ${skipped} attività non di corsa ignorate.` : ''}${errors.length ? `<br>Non riesco a leggere: ${errors.map(esc).join('; ')}` : ''}`;
}

function parseTime(s) {
  const parts = String(s).trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((a, b) => a * 60 + b, 0);
}

// ---------- COACH (chat e voce) ----------
const SUGGEST = ['Com\'è andata: vento contro e un po\' di salita, gambe pesanti', 'Com\'è la mia settimana?', 'Posso correre lunedì, mercoledì, venerdì e domenica', 'Il lungo lo faccio il sabato', 'Sposta domani a giovedì', 'Salta oggi', 'Torna al piano originale'];
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let listening = null;
function viewCoach() {
  const chat = db.state.chat || [];
  const voice = db.state.voice !== false;
  const msgs = chat.length ? chat : [{ from: 'coach', text: 'Ciao Marco! Appena finisci di correre tocca il microfono e raccontami com\'è andata: vento, salite, asfalto o sterrato, come ti sentivi. Ti dico com\'è andata e se cambio i prossimi allenamenti. Puoi anche chiedermi di cambiare i giorni del piano.' }];
  return `<section class="coach"><div class="row between"><h1>Coach</h1><button class="btn small ghost" id="voiceToggle" aria-pressed="${voice}">${voice ? 'Voce: sì' : 'Voce: no'}</button></div>
    <div class="msgs" id="msgs">${msgs.map((m, i) => `<div class="msg ${m.from}">${esc(m.text).replace(/\n/g, '<br>')}${m.from === 'coach' ? `<button class="listen" data-listen="${i}" aria-label="Ascolta">🔊</button>` : ''}</div>`).join('')}</div>
    <div class="chips">${SUGGEST.map(s => `<button class="chip" data-say="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <form id="chatForm" class="chatbar"><button type="button" class="mic" id="mic" aria-label="Parla">🎤</button><input id="chatInput" name="q" autocomplete="off" placeholder="Scrivi o tocca il microfono…" aria-label="Messaggio per il coach"><button class="btn primary small" aria-label="Invia">Invia</button></form>
    <p class="muted" id="micHint"></p>
    ${chat.length ? '<button class="btn small ghost" id="clearChat">Cancella la conversazione</button>' : ''}
  </section>`;
}
function say(text) {
  if (listening) { listening.onend = null; try { listening.stop(); } catch {} listening = null; }
  text = String(text || '').trim();
  if (!text) return;
  const res = answer(text, db, todayKey());
  const chat = db.state.chat = (db.state.chat || []);
  chat.push({ from: 'me', text }, { from: 'coach', text: res.reply });
  db.state.chat = chat.slice(-40);
  save(db); render();
  const box = $('#msgs'); if (box) box.lastElementChild?.scrollIntoView({ block: 'end' });
  if (db.state.voice !== false) speak(res.reply);
}
// Lettura ad alta voce con la voce italiana del telefono
function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/•/g, '').replace(/\n+/g, '. '));
    u.lang = 'it-IT';
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('it'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch {}
}
// Dettatura: usa il riconoscimento vocale del telefono se c'è, altrimenti il microfono della tastiera
function startMic() {
  const input = $('#chatInput'), hint = $('#micHint'), mic = $('#mic');
  if (!input) return;
  if (!SR) {
    input.focus();
    if (hint) hint.textContent = 'Tocca il microfono sulla tastiera del telefono e parla. Poi premi Invia.';
    return;
  }
  if (listening) { listening.stop(); return; }
  try {
    const rec = new SR();
    rec.lang = 'it-IT'; rec.interimResults = true; rec.continuous = true;
    let finalText = '';
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      input.value = (finalText + interim).trim();
    };
    rec.onerror = ev => { if (hint) hint.textContent = ev.error === 'not-allowed' ? 'Il telefono non ha dato il permesso al microfono. Usa il microfono della tastiera.' : 'Non ti ho sentito bene. Riprova o usa il microfono della tastiera.'; };
    rec.onend = () => { listening = null; mic?.classList.remove('on'); if (hint) hint.textContent = ''; if (input.value.trim()) say(input.value); };
    rec.start();
    listening = rec; mic?.classList.add('on');
    if (hint) hint.textContent = 'Ti ascolto… tocca di nuovo il microfono quando hai finito.';
  } catch { input.focus(); if (hint) hint.textContent = 'Tocca il microfono sulla tastiera del telefono e parla.'; }
}

// ---------- RENDER ----------
const VIEWS = { oggi: viewOggi, forma: viewForma, piano: viewPiano, coach: viewCoach, dati: viewDati };
function render() {
  $('#main').innerHTML = VIEWS[tab]();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'piano') document.querySelector('.week-card.current')?.scrollIntoView({ block: 'start' });
}

document.addEventListener('click', e => {
  const nb = e.target.closest('nav button');
  if (nb) { tab = nb.dataset.tab; try { sessionStorage.setItem('tab', tab); } catch {} render(); window.scrollTo(0, 0); return; }
  const chip = e.target.closest('[data-say]'); if (chip) { say(chip.dataset.say); return; }
  if (e.target.closest('#mic')) { startMic(); return; }
  const li = e.target.closest('[data-listen]'); if (li) { const m = (db.state.chat || [])[+li.dataset.listen]; speak(m ? m.text : $('.msg.coach')?.textContent || ''); return; }
  if (e.target.id === 'voiceToggle') { db.state.voice = db.state.voice === false; save(db); render(); return; }
  if (e.target.id === 'tellRun') { tab = 'coach'; render(); setTimeout(startMic, 50); return; }
  if (e.target.id === 'clearChat') { db.state.chat = []; save(db); render(); return; }
  if (e.target.id === 'export') {
    const blob = new Blob([JSON.stringify(db)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `allenamento-corsa-${todayKey()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  if (e.target.id === 'wipe') {
    if (e.target.dataset.confirm) { db = reset(); render(); }
    else { e.target.dataset.confirm = '1'; e.target.textContent = 'Tocca di nuovo per confermare'; }
  }
  if (e.target.id === 'useTest') { db.profile.tests.push({ date: e.target.dataset.date, sec: +e.target.dataset.sec }); save(db); render(); }
  if (e.target.dataset.deltest != null) { db.profile.tests.splice(+e.target.dataset.deltest, 1); save(db); render(); }
});

document.addEventListener('change', e => {
  if (e.target.id === 'files' && e.target.files.length) importFiles([...e.target.files]);
  if (e.target.dataset.flag) {
    const f = e.target.dataset.flag, t = todayKey();
    if (e.target.checked) db.state[f][t] = true; else delete db.state[f][t];
    save(db); render();
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (e.target.id === 'codeForm') { await importCode(String(fd.get('code') || '')); return; }
  if (e.target.id === 'chatForm') { say(fd.get('q')); return; }
  if (e.target.id === 'testForm') {
    const sec = parseTime(fd.get('time'));
    if (sec && sec > 600 && sec < 3600) { db.profile.tests.push({ date: fd.get('date'), sec }); db.profile.tests.sort((a, b) => a.date.localeCompare(b.date)); }
  }
  if (e.target.id === 'profileForm') {
    const zz = { easy: +fd.get('easy'), medium: +fd.get('medium'), threshold: +fd.get('threshold') };
    if (zz.easy < zz.medium && zz.medium < zz.threshold) db.profile.zones = zz;
    const g = parseTime(fd.get('goal')); if (g && g > 3600) db.profile.goalSec = g;
  }
  save(db); render();
});

// Storico passato come codice (compresso e in base64) nel link: #storico=...
// Il pezzo dopo # non viene mai inviato al server: i dati restano tra il link e il telefono.
async function decodeCode(text) {
  const m = text.trim().match(/storico=([A-Za-z0-9_-]+)/) || text.trim().match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) throw new Error('Il codice non sembra giusto: copialo tutto, dall\'inizio alla fine.');
  const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
  const bin = Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}
async function importCode(text) {
  let msg;
  try {
    const data = await decodeCode(text);
    if (!Array.isArray(data.runs)) throw new Error('Il codice non contiene corse.');
    const { added } = mergeRuns(db, data.runs); save(db);
    msg = `<span class="ok">Storico caricato: ${added} corse nuove, ${db.runs.length} in totale.</span>`;
  } catch (e) { msg = `<span class="err">${esc(e.message || 'Codice non valido')}</span>`; }
  tab = 'dati'; render();
  const m = $('#importMsg'); if (m) m.innerHTML = msg;
}
if (location.hash.startsWith('#storico=')) {
  const h = location.hash;
  try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  importCode(h);
}

render();
// Se non ci sono dati e accanto all'app c'è un file "dati-iniziali.json" (copia di sicurezza), lo carico.
if (!db.runs.length) fetch('dati-iniziali.json').then(r => r.ok ? r.json() : null).then(data => {
  if (!data || !Array.isArray(data.runs) || db.runs.length) return;
  mergeRuns(db, data.runs); save(db); render();
}).catch(() => {});
// aggiorna "oggi" se l'app resta aperta oltre la mezzanotte
let lastDay = todayKey();
document.addEventListener('visibilitychange', () => { if (!document.hidden && todayKey() !== lastDay) { lastDay = todayKey(); render(); } });

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
