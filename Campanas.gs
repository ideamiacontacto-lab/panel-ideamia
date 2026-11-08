/* ---------------- Campañas con dueña (8/11/2026, pedido de Joaquín) ----------------
   Lee las tarjetas "Campaña · …" de la lista "Brainstorming / Campañas" de cada SCL. Cada una tiene el checklist
   "Kit de campaña" con pasos que empiezan con su fecha ("vie 13/11 · Pedirle a Guido…").
   - Social media: ve en Hoy el PRÓXIMO paso de cada campaña de sus marcas y lo marca hecho desde ahí.
   - Project: ve el semáforo de todas las marcas y arriba "Te toca a vos" (cliente que no respondió, pasos muy atrasados).
   GET ?action=campanas&k=…&p=<persona> · POST action 'campanaPaso' {card, item, hecho}. Guardado 10 min (CMP_VER lo renueva). */

// tablero SCL → marca (slug de la pestaña Marcas) y la social media por si la pestaña no la tiene
const CMP_TABLEROS = [
  ['6958509ec8f0e4043dc84b94', ['isco'], 'Isco', 'orne'],
  ['696a6e454cf51cbeae98281d', ['gabriel-varisco', 'gv'], 'Gabriel Varisco', 'orne'],
  ['6a0ceb2f4204804167d79dbb', ['tritato'], 'Tritato', 'orne'],
  ['6aad67718ce0494ed30f0efd', ['vice-burger', 'vice'], 'Vice', 'orne'],
  ['696a7785cfc75317f0faea0d', ['sfb', 'skilfulblack'], 'SFB', 'orne'],
  ['69697243024762c55f8b4e5e', ['quality-tienda', 'quality'], 'Quality', 'rama'],
  ['696a746c1901e234ccc467d2', ['quality-mayorista'], 'Quality Mayorista', 'rama'],
  ['696976b41025ff6cb5748b76', ['dyb'], 'DyB', 'rama'],
  ['6a2852f47aaca4e58682d2f8', ['1talquecocina', '1tal'], '1tal', 'rama'],
  ['6ab69e15e95a82218820dfe5', ['upper-trip', 'upper'], 'Upper', 'rama']
];
const CMP_DIAS_ATRAS = 7, CMP_DIAS_ADELANTE = 56;

// "vie 13/11 · Pedirle…" → fecha (el año: el que deje el paso más cerca del vencimiento de la campaña)
function cmpFechaPaso_(texto, due) {
  const m = /^\s*(?:[a-záéíóú]{3}\s+)?(\d{1,2})\/(\d{1,2})\s*·\s*/i.exec(String(texto || ''));
  if (!m) return null;
  const ref = due ? new Date(due) : new Date(), y0 = ref.getFullYear();
  let mejor = null;
  [y0 - 1, y0, y0 + 1].forEach(y => { const d = new Date(y, Number(m[2]) - 1, Number(m[1]), 12); if (!mejor || Math.abs(d - ref) < Math.abs(mejor - ref)) mejor = d; });
  return mejor;
}
const cmpTextoPaso_ = t => String(t || '').replace(/^\s*(?:[a-záéíóú]{3}\s+)?\d{1,2}\/\d{1,2}\s*·\s*/i, '').trim();
const cmpDiasA_ = d => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - (() => { const h = hoyAR_(); return new Date(h.getFullYear(), h.getMonth(), h.getDate()); })()) / 864e5);

function cmpLeer_() {
  const cat = catalogo_(), smDe = {};
  (cat.marcas || []).forEach(m => smDe[m.slug] = m.sm);
  const listas = trelloVarios_(CMP_TABLEROS.map(t => '/boards/' + t[0] + '/lists?fields=name&filter=open'));
  const cual = CMP_TABLEROS.map((t, i) => ((listas[i] || []).filter(l => /brainstorm|campan/.test(norm_(l.name)))[0] || null));
  const conLista = CMP_TABLEROS.map((t, i) => i).filter(i => cual[i]);
  const cards = trelloVarios_(conLista.map(i => '/lists/' + cual[i].id + '/cards?fields=name,due,dueComplete,shortUrl,pos&checklists=all&checklist_fields=name,pos'));
  const out = [], fallas = CMP_TABLEROS.filter((t, i) => listas[i] == null).map(t => t[2]);
  conLista.forEach((i, j) => {
    const t = CMP_TABLEROS[i], slug = t[1].filter(s => smDe[s] != null)[0] || t[1][0], sm = smDe[slug] || t[3];
    if (cards[j] == null) { fallas.push(t[2]); return; }
    cards[j].filter(c => /^campa/.test(norm_(c.name)) && !c.dueComplete).forEach(c => {
      const pasos = [];
      (c.checklists || []).slice().sort((a, b) => a.pos - b.pos).forEach(ch => (ch.checkItems || []).slice().sort((a, b) => a.pos - b.pos)
        .forEach(it => pasos.push({ id: it.id, cl: ch.id, raw: it.name, t: cmpTextoPaso_(it.name), f: cmpFechaPaso_(it.name, c.due), ok: it.state === 'complete' })));
      const prox = pasos.filter(p => !p.ok)[0] || null, idx = prox ? pasos.indexOf(prox) : -1;
      const nivel = (/\bN([1-4])\b/.exec(c.name) || [])[1] || '';
      let estado = 'ok', dias = prox && prox.f ? cmpDiasA_(prox.f) : null;
      if (!pasos.length) estado = 'sinkit';
      else if (!prox) estado = 'lista';
      else {
        const recibir = /recibir/.test(norm_(prox.t)), pidio = idx > 0 && pasos[idx - 1].ok && /pedi|pedir/.test(norm_(pasos[idx - 1].t));
        if (recibir && dias != null && dias < 0) estado = 'cliente';
        else if (recibir && pidio) estado = 'espera';
        else if (dias != null && dias < 0) estado = 'atrasado';
        else if (dias != null && dias <= 2) estado = 'pronto';
      }
      out.push({ id: c.id, url: c.shortUrl, n: String(c.name).replace(/^campa[ñn]a\s*(N\d)?\s*·\s*/i, '').replace(/\s*·\s*[^·]+$/, '').trim(), nivel: nivel ? 'N' + nivel : '', slug, marca: t[2], sm,
        due: c.due, hechos: pasos.filter(p => p.ok).length, total: pasos.length, estado, dias,
        paso: prox ? { id: prox.id, cl: prox.cl, t: prox.t, f: prox.f ? ymd_(prox.f) : null, raw: prox.raw } : null,
        prev: idx > 0 ? { id: pasos[idx - 1].id, t: pasos[idx - 1].t } : null });
    });
  });
  return { leido: new Date().toISOString(), campanas: out, fallas };
}

function cmpTodas_(fresco) {
  const c = CacheService.getScriptCache(), k = 'cmp:' + (P.getProperty('CMP_VER') || '0');
  if (!fresco) { const h = c.get(k); if (h) { try { return JSON.parse(h); } catch (e) {} } }
  const r = cmpLeer_();
  try { const s = JSON.stringify(r); if (s.length < 95000) c.put(k, s, 600); } catch (e) {}
  return r;
}

// lo que ve cada uno: la social media, sus marcas; el project, todas. Ventana: lo atrasado + lo que vence en 8 semanas.
function campanasVista_(clave, esProj, fresco) {
  const r = cmpTodas_(fresco), hoy = hoyAR_();
  const enVentana = c => {
    const dd = c.due ? cmpDiasA_(new Date(c.due)) : null;
    if (c.estado === 'lista') return dd != null && dd >= -3 && dd <= 7;   // terminada: se ve unos días para el festejo
    return c.estado === 'atrasado' || c.estado === 'cliente' || dd == null || (dd >= -CMP_DIAS_ATRAS && dd <= CMP_DIAS_ADELANTE);
  };
  const orden = { cliente: 0, atrasado: 1, pronto: 2, espera: 3, ok: 4, sinkit: 5, lista: 6 };
  const lista = r.campanas.filter(c => (esProj || c.sm === clave) && enVentana(c))
    .sort((a, b) => (orden[a.estado] - orden[b.estado]) || ((a.paso && a.paso.f || '9') < (b.paso && b.paso.f || '9') ? -1 : 1));
  const teToca = esProj ? lista.filter(c => c.estado === 'cliente' || (c.estado === 'atrasado' && c.dias != null && c.dias <= -3)) : [];
  return { ok: true, leido: r.leido, hoy: ymd_(hoy), campanas: lista, teToca: teToca.map(c => c.id), fallas: r.fallas };
}

function campanaPaso_(b, clave, esProj) {
  const card = String(b.card || ''), item = String(b.item || '');
  if (!/^[a-f0-9]{24}$/.test(card) || !/^[a-f0-9]{24}$/.test(item)) return { error: 'datos', mensaje: 'Falta la tarjeta o el paso' };
  const c = cmpTodas_(false).campanas.filter(x => x.id === card)[0];
  if (c && !esProj && c.sm !== clave) return { error: 'permiso', mensaje: 'Esa campaña es de otra marca' };
  trello_('/cards/' + card + '/checkItem/' + item, { state: b.hecho === false ? 'incomplete' : 'complete' }, 'put');
  P.setProperty('CMP_VER', String(Date.now()));
  return { ok: true, vista: campanasVista_(clave, esProj, true) };
}

// prueba desde el editor (solo lee): cuántas campañas ve cada uno y las primeras del project
function probarCampanas() {
  const p = campanasVista_('project', true, true), o = campanasVista_('orne', false), r = campanasVista_('rama', false);
  console.log('Project: ' + p.campanas.length + ' (te toca ' + p.teToca.length + ') · Orne: ' + o.campanas.length + ' · Rama: ' + r.campanas.length + (p.fallas.length ? ' · sin leer: ' + p.fallas.join(', ') : ''));
  p.campanas.forEach(c => console.log(c.estado + ' · ' + c.marca + ' · ' + c.n + ' · ' + c.hechos + '/' + c.total + ' · ' + (c.paso ? (c.paso.f || '?') + ' ' + c.paso.t : '-')));
}
