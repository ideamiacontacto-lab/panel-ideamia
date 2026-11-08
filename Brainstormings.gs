/* ---------------- Brainstormings → campañas de Trello (8/11/2026, pedido de Joaquín) ----------------
   Cuando en la web de brainstormings se vota una campaña (estado "cerrada" con decisión), busca su tarjeta "Campaña · …" en la lista
   "Brainstorming / Campañas" del SCL de la marca, tilda el paso del brainstorming y el de la idea (con el nombre de la ganadora)
   y deja un comentario con la idea. Si la marca no tiene tarjeta para esa campaña, la crea.
   Corre sola cada hora (instalarSincroBrainstormings, una vez desde el editor). No repite: anota lo hecho en la propiedad BS_SINCRO,
   y si el paso del brainstorming ya estaba tildado no comenta de nuevo.
   Prueba sin escribir nada: probarSincroBrainstormings() desde el editor. Usa trello_, norm_ y P de Code.gs. */

const BS_API = 'https://script.google.com/macros/s/AKfycbxGXxMvqd5GbQwQhK6lUuSRItmGO8mTTuq7Fpt-eP58K99TGvZAiVxchbMpHNJRqqnh/exec';
const BS_WEB = 'https://ideamiacontacto-lab.github.io/brainstormings-ideamia/';
// marca de la web de brainstormings (por su nombre) → tablero SCL. El orden importa: Mayorista antes que Quality.
const BS_TABLEROS = [
  [/mayorista/, '696a746c1901e234ccc467d2', 'Quality Mayorista'],
  [/quality/, '69697243024762c55f8b4e5e', 'Quality'],
  [/varisco|^gv$/, '696a6e454cf51cbeae98281d', 'Gabriel Varisco'],   // antes que Isco: "Var-isco" contiene "isco"
  [/isco/, '6958509ec8f0e4043dc84b94', 'Isco'],
  [/tritato/, '6a0ceb2f4204804167d79dbb', 'Tritato'],
  [/1tal|una tal/, '6a2852f47aaca4e58682d2f8', '1tal'],
  [/dyb|demichelis/, '696976b41025ff6cb5748b76', 'DyB'],
  [/vice/, '6aad67718ce0494ed30f0efd', 'Vice'],
  [/sfb|skilful/, '696a7785cfc75317f0faea0d', 'SFB'],
  [/upper/, '6ab69e15e95a82218820dfe5', 'Upper']
];
const BS_VACIAS = { dia: 1, del: 1, de: 1, la: 1, el: 1, los: 1, las: 1, y: 1, campana: 1 };

function bsEstado_() {
  const r = UrlFetchApp.fetch(BS_API, { method: 'post', contentType: 'text/plain', payload: JSON.stringify({ method: 'GET', route: 'state' }), muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() >= 300) throw new Error('la web de brainstormings respondió ' + r.getResponseCode());
  const d = JSON.parse(r.getContentText());
  return (d.data || d).state;
}
const bsPalabras_ = s => norm_(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length >= 3 && !BS_VACIAS[w]);
const bsDia_ = s => { const d = new Date(String(s).slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? null : d; };
const bsFecha_ = s => { const d = bsDia_(s); return d ? Utilities.formatDate(d, 'UTC', 'dd/MM') : ''; };

// la tarjeta de campaña que corresponde: mismo tablero, nombre que empieza con "Campaña", vence cerca de la fecha del brief
// y comparte alguna palabra con el nombre del brainstorming (o vence a menos de 3 días si no comparte ninguna)
function bsBuscarTarjeta_(cards, camp) {
  const f = bsDia_(camp.fecha), pal = bsPalabras_(camp.nombre);
  let mejor = null, pMejor = -1;
  cards.filter(c => /^campa/.test(norm_(c.name))).forEach(c => {
    const due = c.due ? new Date(c.due) : null;
    const dias = f && due ? Math.abs(due - f) / 864e5 : 999;
    if (dias > 25) return;
    const n = bsPalabras_(c.name), comun = pal.filter(w => n.some(x => x === w || (w.length >= 5 && x.indexOf(w.slice(0, 5)) === 0))).length;
    if (!comun && dias > 3) return;
    const p = comun * 100 - dias;
    if (p > pMejor) { pMejor = p; mejor = c; }
  });
  return mejor;
}

function bsComentario_(camp, ideas) {
  const l = ['**Brainstorming votado el ' + bsFecha_(camp.reveladoEn || camp.decision.fecha) + '** (web de brainstormings: ' + BS_WEB + ')', ''];
  ideas.forEach(i => {
    l.push('**Idea que va: ' + i.nombre + '**' + (i.queEs ? ' · ' + i.queEs : '') + (i.queHace ? '. Objetivo: ' + i.queHace : ''));
    if (i.queSeVe) l.push(String(i.queSeVe).slice(0, 900));
    l.push('');
  });
  if (camp.decision.porqueVa) l.push('Por qué va: ' + camp.decision.porqueVa, '');
  if (camp.problema) l.push('Problema del brief: ' + camp.problema);
  if (camp.numero) l.push('Número: ' + camp.numero + (camp.numeroHoy ? ' (hoy ' + camp.numeroHoy + ')' : ''));
  l.push('', '_Lo cargó solo el panel desde la web de brainstormings._');
  return l.join('\n').slice(0, 15000);
}

// Desde el editor (sin argumento) solo prueba; escribe en Trello cuando la llama el disparador (recibe el evento) o sincronizarBrainstormingsAhora().
function sincronizarBrainstormings(dry) {
  dry = dry === true || dry === undefined;
  const hecho = (() => { try { return JSON.parse(P.getProperty('BS_SINCRO') || '{}'); } catch (e) { return {}; } })();
  const st = bsEstado_(), marcas = {}, log = [];
  (st.marcas || []).forEach(m => marcas[m.id] = m.nombre);
  const hoy = new Date(Date.now() - 3 * 864e5);
  const votadas = (st.campanas || []).filter(c => c.estado === 'cerrada' && c.decision && !hecho[c.id] && (bsDia_(c.fecha) || hoy) >= hoy);
  const listas = {};
  votadas.forEach(camp => {
    const nomMarca = marcas[camp.marcaId] || '', t = BS_TABLEROS.filter(x => x[0].test(norm_(nomMarca)))[0];
    if (!t) { log.push(camp.nombre + ' (' + nomMarca + '): marca sin tablero conocido'); return; }
    const ids = camp.decision.vas && camp.decision.vas.length ? camp.decision.vas : [camp.decision.va].filter(Boolean);
    const ideas = (st.ideas || []).filter(i => ids.indexOf(i.id) >= 0);
    if (!ideas.length) { log.push(camp.nombre + ' (' + t[2] + '): votada pero sin idea ganadora a la vista'); return; }
    if (!listas[t[1]]) {
      const ls = trello_('/boards/' + t[1] + '/lists', { fields: 'name', filter: 'open' });
      const l = ls.filter(x => /brainstorm|campan/.test(norm_(x.name)))[0];
      listas[t[1]] = l ? { id: l.id, cards: trello_('/lists/' + l.id + '/cards', { fields: 'name,due', checklists: 'all' }) } : { id: null, cards: [] };
    }
    const L = listas[t[1]];
    if (!L.id) { log.push(camp.nombre + ' (' + t[2] + '): el SCL no tiene lista de Brainstorming / Campañas'); return; }
    const nombreIdea = ideas.map(i => i.nombre).join(' + ');
    let card = bsBuscarTarjeta_(L.cards, camp), creada = false;
    if (!card) {
      log.push(camp.nombre + ' (' + t[2] + '): no tenía tarjeta, se crea');
      if (dry) { hecho[camp.id] = 'prueba'; return; }
      const f = bsDia_(camp.fecha);
      card = trello_('/cards', { idList: L.id, pos: 'top', name: 'Campaña · ' + String(camp.nombre).trim() + ' · ' + t[2], due: f ? f.toISOString() : null,
        desc: '**Fecha:** ' + (bsFecha_(camp.fecha) || 'a confirmar') + '\n**Nivel:** a confirmar\n\nLa creó el panel cuando se votó el brainstorming. **Falta completar el kit de campaña con fechas:** pedido al cliente, recibirlo, presentar en la reunión del viernes, piezas a diseño, reel a guion / producción, ads, foto de perfil y destacadas, y volver a la normalidad.\n\n**Cómo funciona:** cada paso tiene su fecha en el checklist. Los pedidos al cliente los hace la social media. Si en la fecha de "Recibir" no llegó, avisale a Joaquín para que insista.' }, 'post');
      const ch = trello_('/checklists', { idCard: card.id, name: 'Kit de campaña' }, 'post');
      trello_('/checklists/' + ch.id + '/checkItems', { name: bsFecha_(camp.reveladoEn || camp.decision.fecha) + ' · Brainstorming e idea: "' + nombreIdea + '" (hecho)', checked: 'true', pos: 'bottom' }, 'post');
      card.checklists = [];
      creada = true;
    }
    // pasos a tildar: el del brainstorming (o kickoff) y el primero de "definir idea" / "bajada creativa"
    const items = [].concat.apply([], (card.checklists || []).map(ch => ch.checkItems || []));
    const bs = items.filter(i => /brainstorm|kickoff/.test(norm_(i.name)));
    const yaEstaba = bs.length && bs.every(i => i.state === 'complete');
    // si el brainstorming ya estaba tildado (lo marcó alguien a mano) no se toca nada más: el paso de la idea puede ser algo que todavía no se hizo
    const tildar = yaEstaba ? [] : bs.filter(i => i.state !== 'complete').map(i => ({ id: i.id, name: i.name }));
    const idea = yaEstaba ? null : items.filter(i => i.state !== 'complete' && /definir idea|bajada creativa/.test(norm_(i.name)) && !/brainstorm|kickoff/.test(norm_(i.name)))[0];
    if (idea) tildar.push({ id: idea.id, name: /"/.test(idea.name) ? idea.name : idea.name + ': "' + nombreIdea + '"' });
    log.push(camp.nombre + ' (' + t[2] + ') → ' + card.name + ' · tilda ' + tildar.length + (yaEstaba ? ' · ya estaba hecho, sin comentario' : ' · comenta la idea "' + nombreIdea + '"'));
    if (!dry) {
      tildar.forEach(i => trello_('/cards/' + card.id + '/checkItem/' + i.id, { state: 'complete', name: i.name }, 'put'));
      if (!yaEstaba || creada) trello_('/cards/' + card.id + '/actions/comments', { text: bsComentario_(camp, ideas) }, 'post');
    }
    hecho[camp.id] = card.id;
  });
  if (!dry) {
    P.setProperty('BS_SINCRO', JSON.stringify(hecho));
    P.setProperty('BS_SINCRO_ULTIMA', new Date().toISOString() + ' · ' + (log.join(' | ') || 'nada nuevo').slice(0, 800));
  }
  console.log((dry ? 'PRUEBA (no escribe nada)\n' : '') + (log.join('\n') || 'Nada nuevo: no hay brainstormings votados sin pasar a Trello.'));
  return log;
}
function probarSincroBrainstormings() { return sincronizarBrainstormings(true); }
function sincronizarBrainstormingsAhora() { return sincronizarBrainstormings(false); }
function instalarSincroBrainstormings() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sincronizarBrainstormings').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sincronizarBrainstormings').timeBased().everyHours(1).create();
  console.log('Listo: sincronizarBrainstormings corre sola cada hora.');
}
