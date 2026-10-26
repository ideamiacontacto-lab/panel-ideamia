/* Panel diario · Ideamia
   Lee todo del Apps Script (Trello + Calendar + IA + Registro) y lo ordena en "qué hago hoy".
   Sin API_URL en config.js funciona en modo demo. */
(function () {
  const C = window.PANEL_CONFIG || {};
  const qs = new URLSearchParams(location.search);
  const DEMO = !C.API_URL || qs.get('demo') === '1';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  // descripción de una tarjeta con los links clickeables (los sueltos y los [texto](url) de Trello): abren en otra pestaña
  const escL = s => esc(s).replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"])/g, (m, t, u, v) => {
    const url = (u || v).replace(/&amp;/g, '&');
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="word-break:break-all">' + (t || v) + '</a>';
  });
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('pi:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pi:' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const NOW = DEMO ? new Date(2026, 9, 7, 12, 30) : new Date();
  const S = {
    data: null, proj: null, abiertos: {}, reloj: null, tab: (() => { const q = new URLSearchParams(location.search).get('tab'); return q === 'plan' || q === 'okr' ? q : LS.get('tab', 'hoy'); })(), embExtra: (() => { const q = new URLSearchParams(location.search), x = ['marca', 'vista'].filter(k => q.get(k)).map(k => '&' + k + '=' + encodeURIComponent(q.get(k))).join(''); return { plan: x, okr: '' }; })(), marca: 'todas', plan: null, planCargando: false, filtroRes: '', filtroReg: '',
    // la persona y la clave del equipo se comparten con Reportes y Brainstormings (mismo origen → mismo localStorage)
    persona: qs.get('p') || LS.get('persona', null) || (localStorage.getItem('ideamia:persona') !== 'project' ? localStorage.getItem('ideamia:persona') : null) || null,
    key: LS.get('key', '') || localStorage.getItem('ideamia:clave') || '', pkey: LS.get('pkey', ''), sync: false,
    projTab: LS.get('projtab', 'mio'), projMarca: '',
    movil: window.matchMedia('(max-width:700px)').matches, segSem: null, diaSem: null
  };
  // si ya había entrado antes de que existiera la sesión compartida, la clave se copia ahora
  try { if (!localStorage.getItem('ideamia:clave') && (S.key || S.pkey)) localStorage.setItem('ideamia:clave', S.key || S.pkey); } catch (e) {}

  /* ---------------- iconos ---------------- */
  const I = {
    cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3.2l1.6-2.5h6.4L16.8 8H20v11H4z"/><circle cx="12" cy="13.2" r="3.4"/></svg>',
    reel: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/></svg>',
    story: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" stroke-dasharray="3.2 2.4"/><circle cx="12" cy="12" r="4"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.400-6.5 11-6.500 11z"/><circle cx="12" cy="10" r="2.300"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg>',
    clip: '<svg viewBox="0 0 24 24"><path d="M20 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5M16 5.5a3 3 0 010 5.6M18 14c1.7.6 2.7 2.3 3 5"/></svg>',
    inbox: '<svg viewBox="0 0 24 24"><path d="M4 13l2.5-7h11L20 13v6H4zM4 13h4.5l1 2h5l1-2H20"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.6L19.5 10l-5.7 1.4L12 17l-1.8-5.6L4.5 10l5.7-1.4z"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
    archive: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5 8.5V19h14V8.5M10 12.5h4"/></svg>',
    msg: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/></svg>',
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>'
  };

  /* ---------------- fechas ---------------- */
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const DIAS_L = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ymdD = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const diasA = d => Math.round((sod(d) - sod(NOW)) / 864e5);
  const dm = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  const hm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const corto = d => DIAS[d.getDay()] + ' ' + d.getDate();
  function cuando(d) {
    const n = diasA(d);
    if (n < -1) return 'venció hace ' + (-n) + ' días';
    if (n === -1) return 'venció ayer';
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    if (n < 7) return DIAS_L[d.getDay()].toLowerCase() + ' ' + d.getDate();
    return corto(d) + '/' + (d.getMonth() + 1);
  }
  function hace(txt) { // "2026-10-07 09:12" o ISO
    if (!txt) return '';
    const d = /T/.test(txt) ? new Date(txt) : new Date(txt.replace(' ', 'T'));
    const min = Math.round((NOW - d) / 6e4);
    if (min < 2) return 'recién';
    if (min < 60) return 'hace ' + min + ' min';
    if (min < 60 * 24) return 'hace ' + Math.round(min / 60) + ' h';
    const dd = Math.round(min / 1440); return dd === 1 ? 'ayer' : 'hace ' + dd + ' días';
  }
  const plazo = h => h < 1 ? Math.max(1, Math.round(h * 60)) + ' min' : h < 48 ? Math.round(h) + ' h' : Math.round(h / 24) + ' días';
  const ahoraTxt = () => { const d = DEMO ? NOW : new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + hm(d); };

  /* ---------------- marcas ---------------- */
  const PALETA = ['#FFF200', '#7CC4FF', '#FF8FB1', '#5CE38A', '#FFB454', '#B69CFF', '#4FD1C5', '#FF7A59', '#D0D0D0', '#E9A8FF'];
  const marca = slug => (S.data && S.data.marcas.find(m => m.slug === slug)) || (S.proj && S.proj.marcas.find(m => m.slug === slug)) || null;
  const color = slug => { const all = (S.data ? S.data.marcas : (S.proj ? S.proj.marcas : [])).map(m => m.slug); const i = all.indexOf(slug); return i < 0 ? '#888' : PALETA[i % PALETA.length]; };
  const tagM = slug => slug ? '<span class="tag"><i style="background:' + color(slug) + '"></i>' + esc((marca(slug) || { nombre: slug }).nombre) + '</span>' : '';
  const pasa = slugs => S.marca === 'todas' || (Array.isArray(slugs) ? slugs : [slugs]).indexOf(S.marca) >= 0;

  /* ---------------- red ---------------- */
  async function get(params) {
    if (DEMO) return null;
    const u = C.API_URL + '?' + new URLSearchParams(params).toString();
    // el primer pedido ya salió desde index.html mientras bajaba este archivo: se usa ese
    if (window.__pre && window.__pre.u === u) { const p = window.__pre.r; window.__pre = null; try { return await p; } catch (e) {} }
    const r = await fetch(u, { cache: 'no-store' });
    return r.json();
  }
  async function post(body) {
    if (DEMO) { await new Promise(r => setTimeout(r, 350)); return { ok: true, demo: true }; }
    const r = await fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ k: S.key || S.pkey, persona: S.data ? S.data.yo.clave : S.persona }, body)) });
    const j = await r.json();
    // los pasos que sí se hicieron viajan con el error (ej.: el comentario quedó pero la tarjeta no se movió)
    if (j.error) throw Object.assign(new Error(j.mensaje || j.error), { pasos: j.pasos || [] });
    return j;
  }

  let toastT;
  function toast(msg, deshacer) {
    const t = $('#toast');
    t.innerHTML = '<span>' + msg + '</span>' + (deshacer ? '<button>Deshacer</button>' : '');
    if (deshacer) $('button', t).onclick = () => { t.classList.remove('on'); deshacer(); };
    // los mensajes largos (pasos de una acción) quedan más tiempo
    t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), msg.length > 90 ? 8000 : 4200);
  }

  /* ---------------- estado de cada cosa ---------------- */
  const hecho = o => !!(o && o.estado && (o.estado.estado === 'hecho' || o.estado.estado === 'agendada'));
  function inputPide(c) { // ¿hay que volver a preguntar por este input?
    if (!c.estado) return 'nuevo';
    if (c.estado.estado === 'archivado') return null;
    if (c.estado.estado === 'recordar') return new Date(c.estado.detalle) <= new Date() ? 'pospuesto' : null; // "recordame después"
    const f = c.estado.fecha ? new Date(c.estado.fecha.replace(' ', 'T')) : NOW;
    return (NOW - f) / 864e5 >= (S.data.ajustes.inputDias || 3) ? 'recordar' : null;
  }
  // solo los inputs de los tableros SCL (los del Project son viejos)
  const inputs = () => S.data.cards.filter(c => c.cat === 'input' && (!c.tipo || c.tipo === 'scl') && !(c.estado && c.estado.estado === 'archivado'));
  const reuPend = () => S.data.reuniones.filter(r => !hecho(r));

  /* ---------------- tareas de hoy ---------------- */
  function tareasHoy() {
    const D = S.data, out = [];
    D.cards.forEach(c => {
      if (!['corr', 'trabajo', 'urgente', 'espera'].includes(c.cat) && c.tipo !== 'project') return;
      if (c.tipo === 'project' && !c.due) return;
      const d = c.due ? new Date(c.due) : null, n = d ? diasA(d) : 99;
      if (c.cat !== 'corr' && n > D.ajustes.porVencer) return;
      if (c.cat === 'corr' && n > D.ajustes.porVencer && n !== 99) return;
      out.push({
        k: 'card:' + c.id, tipo: 'card', marca: c.m[0], t: c.n, url: c.url, obj: c,
        meta: [c.cat === 'corr' ? 'Corrección' : (c.tipo === 'project' ? 'Project · ' + (c.origen || c.lista) : c.lista), d ? (n < 0 ? '<span class="pill bad">' + cuando(d) + '</span>' : 'vence ' + cuando(d)) : 'sin fecha'],
        u: n < 0 ? 4 : n === 0 ? 3 : n === 1 ? 2 : 1
      });
    });
    D.eventos.forEach(e => {
      const s = new Date(e.s), n = diasA(s);
      if (n < 0 || n > 1) return;
      out.push({ k: 'cal:' + e.id, tipo: 'evento', marca: e.marcas[0] || '', marcas: e.marcas, t: e.t, obj: e, meta: ['Calendario', n === 0 ? (e.dia ? 'hoy' : 'hoy ' + hm(s)) : (e.dia ? 'mañana' : 'mañana ' + hm(s))], u: n === 0 ? 3 : 1 });
    });
    D.rutinas.forEach(r => out.push({ k: r.clave, tipo: 'rutina', marca: r.marca, t: r.tarea, obj: r, hint: r.ayuda, enlace: r.enlace, meta: [r.vencida && r.etiqueta === 'esta semana' ? 'pendiente desde el ' + (r.id === 'salida' ? 'miércoles' : r.id === 'canal' || r.id === 'coordinar' ? 'viernes' : 'lunes') : r.vencida ? '<span class="pill warn">vencida</span>' : r.etiqueta], u: r.vencida ? 2 : 1 }));
    D.reuniones.forEach(r => {
      if (hecho(r)) return;
      const faltan = r.hasta - NOW.getDate();
      out.push({ k: r.clave, tipo: 'reunion', marca: r.marca, t: 'Organizar: ' + r.nombre, obj: r, meta: ['con ' + r.con, r.vencida ? '<span class="pill bad">se pasó la fecha</span>' : 'tiene que ser del ' + r.desde + ' al ' + r.hasta], u: r.vencida ? 4 : faltan <= 3 ? 3 : 1 });
    });
    inputs().forEach(c => {
      const p = inputPide(c); if (!p) return;
      out.push({ k: 'inp:' + c.id, tipo: 'input', marca: c.m[0], t: (p === 'nuevo' ? 'Input nuevo: ' : p === 'pospuesto' ? 'Te pediste acordarte: ' : '¿Seguís necesitando? ') + c.n, obj: c, meta: [p === 'nuevo' ? 'cargado ' + hace(c.act) : p === 'pospuesto' ? 'lo pospusiste' : 'lo tocaste ' + hace(c.estado.fecha)], u: p === 'pospuesto' ? 3 : p === 'nuevo' ? 2 : 1 });
    });
    // guiones que piden algo: sin fecha de entrega, Fede atrasado o por entregar ya, listos para ver en la reunión
    guiones().filter(g => !g.salio).forEach(g => {
      const e = g.entrega ? new Date(g.entrega) : null, n = e ? diasA(e) : 99, base = { k: 'gui:' + g.id, tipo: 'guion', marca: g.m[0], obj: g, url: g.ourl || g.url };
      if (g.gest === 'pendiente' && !e) out.push(Object.assign(base, { t: 'Guion sin fecha de entrega: ' + g.n, meta: ['<span class="pill bad">ponele fecha de inicio en SCL</span>', 'Fede no sabe cuándo entregarlo'], u: 3 }));
      else if (g.gest === 'pendiente' && n <= 1) out.push(Object.assign(base, { t: 'Guion de Fede: ' + g.n, meta: [n < 0 ? '<span class="pill bad">atrasado · era el ' + dm(e) + '</span>' : '<span class="pill warn">lo entrega ' + cuando(e) + '</span>', 'Guiones · pendiente de entrega'], u: n < 0 ? 4 : 2 }));
      else if (g.gest === 'revisar') out.push(Object.assign(base, { t: 'Guion listo para revisar: ' + g.n, meta: ['verlo en la reunión del ' + dm(proxLunes()), 'Guiones · listos para revisión'], u: 2 }));
    });
    // piezas que están pendientes en Diseño o Producción y no tienen fecha de salida en SCL: hay que decidir qué se hace con ellas
    D.cards.filter(c => c.cat === 'sinfecha').forEach(c => out.push({ k: 'card:' + c.id, tipo: 'guion', sub: c.formato === 'reel' || c.formato === 'video' || c.formato === 'historia' ? 'sfvid' : 'sfdis', marca: c.m[0], obj: c, url: c.ourl || c.url, t: (c.formato === 'reel' || c.formato === 'video' ? 'Reel' : c.formato === 'historia' ? 'Historia' : 'Diseño') + ' sin fecha: ' + c.n, meta: ['<span class="pill warn">¿qué hacemos con esto?</span>', 'ponele fecha en SCL, pasalo a "Para más adelante" o archivalo'], u: 2 }));
    // cumpleaños de hoy y de mañana (tarjeta "Cumpleaños" de la lista Datos de la marca)
    Object.keys((D.anual || {}).marcas || {}).forEach(s => (D.anual.marcas[s].items || []).filter(x => x.nivel === 5).forEach(x => {
      const n = diasA(new Date(NOW.getFullYear(), x.mes, x.dia));
      if (n === 0 || n === 1) out.push({ k: 'cum:' + s + ':' + x.mes + '-' + x.dia + ':' + x.nombre, tipo: 'guion', sub: 'cum', marca: s, obj: {}, url: D.anual.marcas[s].cumples || '#', t: x.nombre + (n === 0 ? ' · es hoy' : ' · es mañana'), meta: ['<span class="pill y">🎂 saludo en historias</span>'], u: n === 0 ? 3 : 1 });
    }));
    // reportes que faltan cargar en la web de reportes (se van solos cuando los cargan)
    (D.reportes || []).forEach(r => {
      const v = new Date(r.vence), h = (v - new Date()) / 36e5;
      out.push({ k: r.k, tipo: 'reporte', marca: r.marca, t: r.label, obj: r, url: D.linkReportes, meta: [h < 0 ? '<span class="pill bad">vencido hace ' + plazo(-h) + '</span>' : h < 24 ? '<span class="pill warn">vence en ' + plazo(h) + '</span>' : 'vence ' + cuando(v) + ' ' + hm(v)], u: h < 0 ? 4 : h < 24 ? 3 : 2 });
    });
    return out.filter(x => pasa(x.marcas && x.marcas.length ? x.marcas : (x.marca ? [x.marca] : [S.marca]))).sort((a, b) => (hecho(a.obj) - hecho(b.obj)) || (b.u - a.u));
  }
  /* Las rutinas y reuniones que se repiten por marca van en un solo renglón con una ficha por marca. */
  function agrupado() {
    const t = tareasHoy(), out = [], grupos = {};
    t.forEach(x => {
      if ((x.tipo === 'rutina' || x.tipo === 'reunion') && x.marca) {
        const g = x.tipo + ':' + x.obj.id;
        if (!grupos[g]) { grupos[g] = { k: g, tipo: 'grupo', sub: x.tipo, t: x.t, hint: x.hint, enlace: x.enlace, items: [], meta: x.meta, u: 0, obj: {} }; out.push(grupos[g]); }
        grupos[g].items.push(x); grupos[g].u = Math.max(grupos[g].u, x.u);
      } else out.push(x);
    });
    out.forEach(x => { if (x.tipo === 'grupo') { x.obj.estado = x.items.every(i => hecho(i.obj)) ? { estado: 'hecho' } : null; if (x.items.length === 1) Object.assign(x, x.items[0]); } });
    return out.sort((a, b) => (hecho(a.obj) - hecho(b.obj)) || (b.u - a.u));
  }

  /* ---------------- sugerencias (reglas + IA) ---------------- */
  function sugerencias() {
    const D = S.data, out = [];
    // entregas que vienen (del calendario)
    const prox = (re) => D.eventos.filter(e => re.test(e.t) && diasA(new Date(e.s)) >= 0).sort((a, b) => new Date(a.s) - new Date(b.s))[0];
    const cal = prox(/calendario/i), reels = prox(/ideas de reels/i);
    if (cal && diasA(new Date(cal.s)) <= 9) {
      const d = new Date(cal.s), obj = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
      out.push({ c: 'y', h: '<b>' + cuando(d).replace(/^./, x => x.toUpperCase()) + ' entregás calendario.</b> Cada marca tiene que quedar cubierta hasta el <b>' + dm(obj) + '</b>.', go: 'marcas', a: 'Ver cobertura' });
    }
    if (reels && diasA(new Date(reels.s)) <= 7) out.push({ c: 'y', h: '<b>' + cuando(new Date(reels.s)).replace(/^./, x => x.toUpperCase()) + ' entregás 4 ideas de reels</b> del mes que viene. Revisá si los guiones que hay se pueden hacer como están.', go: 'marcas', a: 'Abrir Guiones' });
    // cobertura por marca
    D.marcas.filter(m => pasa(m.slug)).forEach(m => {
      const cv = D.cobertura && D.cobertura[m.slug]; if (!cv) return;
      if (!cv.hasta) { out.push({ c: 'bad', h: '<b>' + esc(m.nombre) + '</b> no tiene fechas cargadas en el calendario editorial.', go: 'marcas' }); return; }
      const falta = Math.round((ymdD(cv.objetivo) - ymdD(cv.hasta)) / 864e5);
      if (falta > 0) out.push({ c: falta > 7 ? 'bad' : 'warn', h: '<b>' + esc(m.nombre) + '</b>: calendario cargado hasta el ' + dm(ymdD(cv.hasta)) + '. Para llegar al ' + dm(ymdD(cv.objetivo)) + ' faltan <b>' + falta + ' días</b> de contenido.', go: 'marcas' });
    });
    // correcciones vencidas
    const venc = D.cards.filter(c => c.cat === 'corr' && c.due && diasA(new Date(c.due)) < 0 && pasa(c.m));
    if (venc.length) out.push({ c: 'bad', h: '<b>' + venc.length + (venc.length === 1 ? ' corrección vencida' : ' correcciones vencidas') + '</b>: ' + venc.slice(0, 3).map(c => esc(c.n)).join(', ') + '.', go: 'hoy' });
    // efemérides cerca que no están en el calendario
    D.cards.filter(c => c.cat === 'efem' && pasa(c.m) && !c.enCalendario).map(c => ({ c, n: diasA(new Date(c.due)) })).filter(x => x.n >= 0 && x.n <= 25).sort((a, b) => a.n - b.n).slice(0, 3).forEach(x => {
      out.push({ c: 'warn', h: '<b>' + esc(x.c.n) + '</b> (' + esc((marca(x.c.m[0]) || {}).nombre || '') + ') ' + (x.n === 0 ? 'es hoy' : 'en ' + x.n + ' días') + ' y no la veo en el calendario editorial.' + (x.c.ia ? '<br><span style="color:var(--muted)">' + esc(x.c.ia.titular) + '</span>' : ''), go: 'agenda', a: 'Ver agenda' });
    });
    // inputs con lectura de la IA
    inputs().filter(c => pasa(c.m) && c.ia && inputPide(c)).slice(0, 3).forEach(c => out.push({ c: 'y', h: esc(c.ia.titular), go: 'inputs', a: 'Ver recomendación · ' + esc((marca(c.m[0]) || {}).nombre || '') }));
    // reuniones por vencer
    const rp = reuPend().filter(r => pasa(r.marca || S.marca) && (r.vencida || r.hasta - NOW.getDate() <= 4));
    if (rp.length) out.push({ c: 'bad', h: '<b>' + rp.length + (rp.length === 1 ? ' reunión' : ' reuniones') + ' sin fecha</b> y se termina la ventana: ' + rp.slice(0, 3).map(r => esc(r.nombre) + (r.marca ? ' · ' + esc((marca(r.marca) || {}).nombre) : '')).join(', ') + '.', go: 'reuniones', a: 'Agendar' });
    if (!out.length) out.push({ c: 'ok', h: 'Todo en orden por ahora. Buen momento para adelantar el calendario del mes que viene.' });
    return out;
  }

  /* ---------------- render general ---------------- */
  function render() {
    const app = $('#app');
    if (S.proj) { document.body.classList.toggle('movil', S.movil); document.body.classList.remove('nav6'); app.innerHTML = vistaProject(); const vw = document.getElementById('view'); if (vw && S._ultTab !== 'p:' + S.projTab) { vw.classList.add('entra'); S._ultTab = 'p:' + S.projTab; setTimeout(() => contar(app), 0); } if (!S._revelado) { const h = app.querySelector('.mhead h1'); if (h) { h.classList.add('revela'); S._revelado = 1; } } bind(app); embSync(); return; }
    const D = S.data; if (!D) return;
    const t = agrupado(), tot = t.length, ok = t.filter(x => hecho(x.obj)).length;
    const hoyD = NOW, nombre = apodo(), pfYo = perfilDe(D.yo.clave);
    const nInp = inputs().filter(c => inputPide(c) && pasa(c.m)).length, nReu = reuPend().filter(r => pasa(r.marca || S.marca)).length;
    const nRep = (D.reportes || []).filter(r => pasa(r.marca)).length;
    const fecha = DIAS_L[hoyD.getDay()] + ' ' + hoyD.getDate() + ' de ' + MESES[hoyD.getMonth()];
    const saludo = hoyD.getHours() < 13 ? 'buen día' : hoyD.getHours() < 20 ? 'buenas tardes' : 'buenas noches';
    // marcas: un botón que abre una lista con el color de cada marca (igual en la compu y en el celular)
    const nomMarca = S.marca === 'todas' ? 'Todas las marcas' : esc((marca(S.marca) || {}).nombre || S.marca);
    const selMarca = '<div class="mpop" id="mpop"><button class="mpop-b" data-mpop aria-haspopup="listbox"><span class="dot" style="background:' + (S.marca === 'todas' ? 'var(--y)' : color(S.marca)) + '"></span><span class="mpop-n">' + nomMarca + '</span><i>▾</i></button>' +
      '<div class="mpop-l hidden" role="listbox">' + ['todas'].concat(D.marcas.map(m => m.slug)).map(s => '<button class="mpop-i' + (S.marca === s ? ' on' : '') + '" data-marca="' + s + '" role="option"><span class="dot" style="background:' + (s === 'todas' ? 'var(--y)' : color(s)) + '"></span>' + (s === 'todas' ? 'Todas las marcas' : esc(marca(s).nombre)) + (S.marca === s ? '<em>✓</em>' : '') + '</button>').join('') + '</div></div>';
    // Ivo: solo Revisión, Guiones y Discord; entra directo a Revisión
    const ivo = esRevisa(), film = esFilm();
    if (!ivo && !film && !S._popDia) { S._popDia = 1; setTimeout(popDia, 1200); }   // una vez por día: ¿Claude te ordena el día?
    // filmmaker: solo Mi semana y Discord
    const TABS_F = ['film', 'fhist', 'fgui', 'fpres', 'discord'];
    if (film && TABS_F.indexOf(S.tab) < 0) S.tab = 'film';
    if (!film && TABS_F.indexOf(S.tab) >= 0 && S.tab !== 'discord') S.tab = 'hoy';
    // el calendario anual es solo de social media, dirección y project: si no llegó, la pestaña no existe
    if (S.tab === 'anual' && !S.data.anual) S.tab = film ? 'film' : 'hoy';
    // CM: entra directo a Programar (lo del día por hora); a nadie más le aparece
    if (!esCMyo() && S.tab === 'cmdia') S.tab = 'hoy';
    // CM (pedido de Joaquín, 26/10/2026): sin Equipo ni Guiones
    if (esCMyo() && (S.tab === 'equipo' || S.tab === 'guiones')) S.tab = 'cmdia';
    if (esCMyo() && !S._cmIni) { S._cmIni = 1; if (S.tab === 'hoy') S.tab = 'cmdia'; }
    // la agenda privada (ideamia.contacto) y Fotos son solo del project y dirección: a nadie más se le abren, aunque la pestaña haya quedado guardada en este navegador
    if (!esRevisa() && (S.tab === 'fotos' || S.tab === 'agp')) S.tab = film ? 'film' : 'hoy';
    if (ivo && ['revision', 'guiones', 'discord', 'agp', 'fotos', 'anual'].indexOf(S.tab) < 0) S.tab = 'revision';
    if (!ivo && S.tab === 'revision') S.tab = 'hoy';
    const conPlan = conPlanYo();
    if ((S.tab === 'plan' || S.tab === 'okr') && !conPlan) S.tab = 'hoy';
    const Rv = ivo ? datosRevision() : null;
    const resumenIvo = ivo ? (Rv.atras.length ? '<b class="rojo">Faltó entregar ' + Rv.atras.length + '</b> · tocá Entregas' : 'Tocá cada recuadro para ver lo suyo') : '';
    const vista = ({ cmdia: vCmDia, hoy: vHoy, semana: vSemana, inputs: vInputs, reuniones: vReuniones, agenda: vAgenda, recursos: vRecursos, colabs: vColabs, marcas: vMarcas, guiones: vGuiones, discord: vDiscord, revision: vRevision, mas: vMas, anual: vAnual, agp: vAgendaPriv, fotos: vFotos, film: vFilm, fhist: vFilm, fgui: vFilm, fpres: vFilm, prods: vProds, plan: vEmb, okr: vEmb, equipo: vEquipoSM }[S.tab] || vHoy)(t);
    // la misma navegación en la compu y en el celular: Hoy · Semana · Inputs · Discord · Más (Ivo: Revisión · Guiones · Discord)
    const nMas = guionAtencion() + nReu;
    const Df = film ? datosFilm() : null, nSemF = es => Df.porHacer.filter(c => Df.sem(c) === 0 && es(c)).length;
    const nav = film ? [['film', 'Reels', I.reel, nSemF(c => c.formato !== 'historia'), true], ['fhist', 'Historias', I.story, nSemF(c => c.formato === 'historia'), true], ['fgui', 'Guiones', I.doc, Df.guiones.filter(x => x.gest === 'revisar').length], ['fpres', 'Agenda', I.pin, Df.visPend.length + prodPend(), true], ['discord', 'Discord', I.msg, dcSinVer().length, true]] : ivo
      ? [['revision', 'Revisión', I.pen, Rv.rev.length, true], ['guiones', 'Guiones', I.flag, guionAtencion(), true], ['agp', 'Agenda', I.cal, 0], ['fotos', 'Fotos', I.cam, fotosPend(), true], ['anual', 'Anual', I.star, 0], ['discord', 'Discord', I.msg, dcSinVer().length, true]]
      : S.movil ? (esCMyo() ? [['cmdia', 'Programar', I.cal, datosCM().hoy.filter(c => !datosCM().hecho(c)).length + datosCM().atras.length, datosCM().atras.length > 0]] : []).concat([['hoy', 'Hoy', I.check, tot - ok]], esCMyo() ? [] : [['inputs', 'Inputs', I.inbox, nInp, true]]).concat(conPlan ? [['plan', 'Plan', I.flag, 0], ['okr', 'Objetivos', I.star, 0]] : [], D.anual ? [['anual', 'Anual', I.cal, 0]] : [], conPlan && D.anual ? [] : [['discord', 'Discord', I.msg, dcSinVer().length, true]], [['mas', 'Más', I.grid, nMas + dcSinVer().length, nMas + dcSinVer().length > 0]]).slice(0, 6)
      : (esCMyo() ? [['cmdia', 'Programar', I.cal, datosCM().hoy.filter(c => !datosCM().hecho(c)).length + datosCM().atras.length, datosCM().atras.length > 0]] : []).concat([['hoy', 'Hoy', I.check, tot - ok]], esCMyo() ? [] : [['inputs', 'Inputs', I.inbox, nInp, true]]).concat([['reuniones', 'Reuniones', I.users, nReu, nReu > 0]].concat(esCMyo() ? [] : [['equipo', 'Equipo', I.users, 0]], conPlan ? [['plan', 'Plan', I.flag, 0], ['okr', 'Objetivos', I.star, 0]] : [], D.anual ? [['anual', 'Anual', I.cal, 0]] : [], [ ['discord', 'Discord', I.msg, dcSinVer().length, true], ['mas', 'Más', I.grid, nMas, nMas > 0]]));
    const enMas = !ivo && ['agenda', 'recursos', 'marcas', 'guiones', 'prods', 'mas', 'colabs'].concat(S.movil ? ['reuniones', 'equipo'] : []).indexOf(S.tab) >= 0;
    const TIT = { cmdia: 'Programar', plan: 'Plan', okr: 'Objetivos', film: 'Reels', fhist: 'Historias', fgui: 'Guiones', fpres: 'Agenda', prods: 'Producciones', equipo: 'Equipo', semana: 'Semana', anual: 'Calendario anual', inputs: 'Inputs', reuniones: 'Reuniones', agenda: 'Agenda', recursos: 'Recursos', colabs: 'Colaboradores', marcas: 'Marcas', guiones: 'Guiones', discord: 'Discord', revision: 'Revisión', mas: 'Más', agp: 'Agenda privada', fotos: 'Fotografía' };
    const portada = S.tab === (film ? 'film' : ivo ? 'revision' : 'hoy');
    const head = portada
      ? '<section class="mhead"><div>' + (pfYo.foto ? ava(pfYo, nombre) : '') + '<div class="kick">/ ' + fecha + ' <span class="sal">· ' + saludo + '</span></div><h1>Hola, <span class="nom">' + esc(nombre) + '</span></h1><p>' + (ivo ? resumenIvo : tot - ok ? 'Te quedan <b>' + (tot - ok) + '</b> · ' + ok + ' de ' + tot + ' hechas' : '<b>Todo listo</b> por hoy') + (!ivo && racha() > 1 ? ' · <span class="racha">🔥 ' + racha() + ' días seguidos</span>' : '') + '' + btnAyuda() + '</p></div>' + (ivo ? '' : anillo(ok, tot)) + '</section>' + (ivo ? '' : avisos())
      : '<div class="mtit">' + (!ivo && (['agenda', 'recursos', 'marcas', 'guiones', 'prods', 'colabs'].indexOf(S.tab) >= 0 || (S.movil && ['reuniones', 'equipo'].indexOf(S.tab) >= 0)) ? '<button class="volver" data-tab="mas" aria-label="Volver">‹</button>' : '') + '<h1>' + TIT[S.tab] + '</h1>' + btnAyuda() + '<span>' + fecha + '</span></div>';
    const headF = film && portada ? '<section class="mhead"><div><div class="kick">/ ' + fecha + ' <span class="sal">· ' + saludo + '</span></div><h1>Hola, <span class="nom">' + esc(nombre) + '</span></h1><p>' + resumenFilm() + btnAyuda() + '</p></div></section>' : head;
    const botonNav = x => '<button class="' + (S.movil ? '' : 'tab') + ((S.tab === x[0] || (x[0] === 'mas' && enMas) || (x[0] === 'hoy' && S.tab === 'semana')) ? ' on' : '') + '" data-tab="' + x[0] + '">' + (S.movil ? x[2] + '<span>' + x[1] + '</span>' + (x[3] ? '<em class="' + (x[4] ? 'hot' : '') + '">' + x[3] + '</em>' : '') : x[1] + (x[3] ? '<span class="badge' + (x[4] ? ' hot' : '') + '">' + x[3] + '</span>' : '')) + '</button>';
    const ctrl = '<div class="ctrl"><div class="ctrl-in">' + (S.movil ? '' : '<nav class="tabs">' + nav.map(botonNav).join('') + '</nav>') + (S.tab === 'mas' ? '' : selMarca) + '</div></div>';
    const hoySem = !ivo && !film && (S.tab === 'hoy' || S.tab === 'semana') ? '<div class="hoysem" role="tablist"><button role="tab" class="' + (S.tab === 'hoy' ? 'on' : '') + '" data-tab="hoy">Hoy<em>' + (tot - ok) + '</em></button><button role="tab" class="' + (S.tab === 'semana' ? 'on' : '') + '" data-tab="semana">Semana' + (nRep ? '<em class="hot">' + nRep + '</em>' : '') + '</button></div>' : '';
    app.innerHTML = S.movil
      ? headF + (S.tab === 'mas' ? '' : ctrl) + '<div class="view" id="view">' + hoySem + bannerEstado() + vista + '</div><nav class="bnav">' + nav.map(botonNav).join('') + '</nav>'
      : ctrl + headF + '<div class="view" id="view">' + hoySem + bannerEstado() + vista + '</div>';
    document.body.classList.toggle('movil', S.movil);
    document.body.classList.toggle('ivo', esRevisa());
    document.body.classList.toggle('nav6', nav.length === 6);
    // movimiento (v2): la vista entra escalonada solo al cambiar de pestaña, y el saludo se revela una sola vez por sesión
    const vw = document.getElementById('view');
    if (vw && S._ultTab !== S.tab) { vw.classList.add('entra'); S._ultTab = S.tab; setTimeout(() => contar(app), 0); }
    if (!S._revelado) { const h = app.querySelector('.mhead h1, .hero h1'); if (h) { h.classList.add('revela'); S._revelado = 1; } }
    bind(app);
    if (S.tab === 'mas') cajasEnPestanas($('#view'), 'mas');
    if (S.tab === 'guiones' || S.tab === 'fgui') carpetasEnPestanas($('#view'), S.tab);
    if (S.tab === 'cmdia' && S.movil) seccionesEnPestanas($('#view .cm-cols'), 'cmdia', 2);   // CM en el celu: Programables / A mano, una por vez
    if (S.tab === 'fgui' || S.tab === 'fpres') seccionesEnPestanas($('#view'), S.tab, 2);   // Bauti: una sección por vez (Reuniones/Guiones; Producciones/Visitas/Asistencias)
    if (S.tab === 'semana' && !S.movil) seccionesEnPestanas($('#view'), 'semana');
    if (S.tab === 'reuniones' || S.tab === 'equipo') seccionesEnPestanas($('#view'), S.tab);
    renderTop();
    embSync();
  }
  // los números grandes cuentan desde 0 al entrar a una pestaña (650 ms, curva que frena al final)
  function contar(root) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.querySelectorAll('.hoy-sts .mio-st b, .gtab b, .fl-sts .mio-st b, .revtabs .rp b, .anillo b, .semana-h b').forEach(el => {
      const t = el.firstChild; if (!t || t.nodeType !== 3) return;
      const n = parseInt(t.textContent, 10); if (!(n > 1) || n > 999 || String(n) !== t.textContent.trim()) return;
      const t0 = performance.now(), d = 650;
      const paso = ahora => { const k = Math.min(1, (ahora - t0) / d); t.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(paso); };
      t.textContent = '0'; requestAnimationFrame(paso);
      setTimeout(() => { t.textContent = String(n); }, d + 150);   // por si la pestaña del navegador está en segundo plano (ahí no corre la animación)
    });
  }
  function anillo(ok, tot) {
    const p = tot ? Math.round(ok / tot * 100) : 0;
    return '<div class="anillo' + (tot && ok === tot ? ' full' : '') + '" style="--p:' + p + '"><div><b>' + ok + '<small>/' + tot + '</small></b><span>hecho hoy</span></div></div>';
  }
  const PZ = 'M20 20 H42 C40 12 44 6 50 6 C56 6 60 12 58 20 H80 V42 C88 40 94 44 94 50 C94 56 88 60 80 58 V80 H58 C60 88 56 94 50 94 C44 94 40 88 42 80 H20 V58 C12 60 6 56 6 50 C6 44 12 40 20 42 Z';
  const PIEZAS = '<div class="piezas" aria-hidden="true"><svg viewBox="0 0 300 260"><g class="p p1" style="--r:-8deg"><path transform="translate(150 20) scale(1.25)" d="' + PZ + '" fill="#E9E9E9"/></g><g class="p p2" style="--r:6deg"><path transform="translate(40 110) scale(1.05)" d="' + PZ + '" fill="#FFF200"/></g><g class="p p3" style="--r:12deg"><path transform="translate(175 150) scale(.9)" d="' + PZ + '" fill="#4A4A4A"/></g></svg></div>';
  // la cinta amarilla solo aparece si hay algo vencido (es una alarma, no decoración)
  function cintaUrgente() {
    const D = S.data, ahora = new Date();
    const hay = (D.reportes || []).some(r => pasa(r.marca) && new Date(r.vence) < ahora) || vencidas().length || reuPend().some(r => r.vencida && pasa(r.marca || S.marca));
    return hay ? cinta() : '';
  }
  // cuándo se creó una tarjeta de Trello (va dentro de su id) = cuándo se la cargaron
  const cargada = c => /^[0-9a-f]{24}$/.test(c.id) ? new Date(parseInt(c.id.slice(0, 8), 16) * 1000) : null;
  // en las piezas de Ivo: cuándo se la cargaron, cuándo le pusieron la fecha de salida (y si se la cambiaron), si es urgente y si la pidieron después del plazo
  const diaCorto = d => diasA(d) === 0 ? 'hoy ' + hm(d) : diasA(d) === -1 ? 'ayer ' + hm(d) : DIAS[d.getDay()] + ' ' + dm(d);
  const datoPieza = (c, plazo) => {
    const h = c.hist || {}, k = h.cargada ? new Date(h.cargada) : cargada(c), f = h.fecha ? new Date(h.fecha) : null;
    const urg = (c.lab || []).some(x => /urgent/i.test(x)), ultimo = [k, f].filter(Boolean).sort((a, b) => b - a)[0];
    return (urg ? '<span class="pill bad">urgente</span>' : '') +
      (k ? '<span>cargada ' + diaCorto(k) + '</span>' : '') +
      (f ? '<span>fecha puesta ' + diaCorto(f) + (h.antes ? ' (antes ' + dm(new Date(h.antes)) + ')' : '') + '</span>' : '') +
      (ultimo && plazo && ultimo > plazo ? '<span class="pill warn">pedida tarde</span>' : '');
  };
  // cinta amarilla que corre con lo urgente y lo que se viene
  function cinta() {
    const D = S.data, it = [];
    (D.reportes || []).filter(r => pasa(r.marca)).slice(0, 4).forEach(r => { const h = (new Date(r.vence) - new Date()) / 36e5; it.push('<b>' + (h < 0 ? 'vencido' : 'reporte') + '</b>' + esc(r.label) + (h < 0 ? '' : ' · ' + (h < 24 ? 'vence en ' + plazo(h) : cuando(new Date(r.vence))))); });
    const nV = vencidas().length; if (nV) it.push('<b>' + nV + '</b>tarjetas vencidas');
    const nI = inputs().filter(c => inputPide(c) && pasa(c.m)).length; if (nI) it.push('<b>' + nI + '</b>inputs para revisar');
    const nR = reuPend().filter(r => pasa(r.marca || S.marca)).length; if (nR) it.push('<b>' + nR + '</b>reuniones sin fecha');
    proximasFechas(30).slice(0, 5).forEach(f => it.push(esc(f.n) + ' · ' + cuando(f.d)));
    if (!it.length) return '';
    const fila = it.map(x => '<span>' + x + '</span>').join('');
    return '<div class="cinta" aria-hidden="true"><div class="pista">' + fila + fila + '</div></div>';
  }
  // festejo: confeti donde tocaste
  let ptr = { x: innerWidth / 2, y: innerHeight / 2 };
  document.addEventListener('pointerdown', e => { ptr = { x: e.clientX, y: e.clientY }; }, true);
  function confeti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cs = ['#FFF200', '#F5F5F5', '#7CC4FF', '#5CE38A', '#FFB454'];
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('i'), a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 70;
      d.className = 'cf'; d.style.left = ptr.x + 'px'; d.style.top = ptr.y + 'px'; d.style.background = cs[i % cs.length];
      d.style.setProperty('--dx', Math.cos(a) * v + 'px'); d.style.setProperty('--dy', Math.sin(a) * v - 30 + 'px'); d.style.setProperty('--r', (Math.random() * 540 - 270) + 'deg');
      document.body.appendChild(d); setTimeout(() => d.remove(), 950);
    }
  }

  /* ---------------- estado de los datos: avisa si lo que se ve puede estar viejo o incompleto ---------------- */
  function minutosDesde(iso) { return iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null; }
  function datosViejos() {
    const gen = S.data && ((S.data.estadoDatos || {}).generado || S.data.generado), min = minutosDesde(gen), h = new Date().getHours();
    // de día Trello se lee cada 10 min; de noche, una vez por hora
    return min != null && min > (h >= 8 && h < 21 ? 25 : 75) ? min : 0;
  }
  function bannerEstado() {
    if (!S.data || (DEMO && !qs.get('probarEstado'))) return '';
    if (DEMO) S.data.estadoDatos = { generado: new Date(Date.now() - 48 * 60000).toISOString(), incompletos: ['Diseño ISCO (Trello 429)'] }; // solo para ver el recuadro en el demo
    const E = S.data.estadoDatos || {}, L = [], gen = E.generado || S.data.generado;
    const cuanto = m => m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' días';
    let grave = false;
    if (S.falloCarga) { grave = true; L.push('<b>Sin conexión con el panel</b> (' + esc(S.falloCarga.msg) + '). Estás viendo lo último guardado en este dispositivo' + (gen ? ', con Trello de hace ' + cuanto(minutosDesde(gen)) : '') + '. Puede faltar lo más nuevo.'); }
    if (E.falla && (!gen || new Date(E.falla.cuando) > new Date(gen))) { grave = true; L.push('<b>La última lectura de Trello falló</b> (' + hace(E.falla.cuando) + '): ' + esc(E.falla.mensaje) + '. Lo que ves es de hace ' + cuanto(minutosDesde(gen)) + '.'); }
    else if (datosViejos()) L.push('<b>Trello se leyó hace ' + cuanto(datosViejos()) + '.</b> Puede que no se vean todas las tarjetas actuales.');
    if ((E.incompletos || []).length) L.push('<b>No se pudieron leer ' + E.incompletos.length + (E.incompletos.length === 1 ? ' tablero' : ' tableros') + ':</b> ' + E.incompletos.map(esc).join(', ') + '. Sus tarjetas son de la lectura anterior.');
    if (!L.length) return '';
    return '<div class="estado-av' + (grave ? ' bad' : '') + '"><span class="ei">!</span><div>' + L.join('<br>') + '</div>' + (S.falloCarga ? '<button class="btn ghost" data-reconectar>Reintentar</button>' : '<button class="btn ghost" data-rf>Leer Trello ahora</button>') + '</div>';
  }
  function reconectar() {
    if (S.sync) return;
    S.sync = true; render();
    cargar(true).then(() => { S.sync = false; render(); toast('✓ Conectado de nuevo: estás viendo los datos actuales.'); })
      .catch(e => { S.sync = false; S.falloCarga = { msg: e.message || 'sin conexión', cuando: new Date().toISOString() }; render(); toast('Sigue sin conexión: ' + esc(e.message || '')); });
  }

  function renderTop() {
    const D = S.data, w = $('#who');
    if (D || S.proj) {
      const yo = D ? D.yo : { nombre: yoNombre(), rol: 'Project' };
      const pf = perfilDe(claveYo());
      w.innerHTML = ava(pf, pf.apodo || yo.nombre) + '<b>' + esc(pf.apodo || yo.nombre) + '</b><span class="r">' + esc(yo.rol) + ' · tu perfil</span>'; w.classList.remove('hidden');
      w.title = 'Personalizá tu panel o cambiá de persona';
      w.onclick = () => perfilEditar(false);
    }
    const gen = (D && ((D.estadoDatos || {}).generado || D.generado)) || (!D && S.proj && S.proj.mio && S.proj.mio.leido) || null;
    $('#sync').innerHTML = (gen ? '<span class="txt' + (datosViejos() || S.falloCarga ? ' viejo' : '') + '">Trello ' + hace(gen) + '</span>' : '') + '<button id="rf" title="Leer Trello ahora (tarda ~1 minuto)">' + (S.sync ? '<span class="spin">↻</span>' : '↻') + '</button>';
    $('#rf').onclick = S.proj && !D ? () => refrescarMio() : actualizar;
  }

  /* ---------------- vista HOY ---------------- */
  function filaGrupo(x) {
    const done = hecho(x.obj), n = x.items.filter(i => hecho(i.obj)).length;
    const chips = x.items.map(i => {
      const ok = hecho(i.obj), m = marca(i.marca) || { nombre: i.marca };
      if (x.sub === 'reunion') return '<button class="mk' + (ok ? ' on' : '') + (i.u >= 3 && !ok ? ' late' : '') + '" ' + (ok ? 'disabled' : 'data-agendar="' + esc(i.k) + '"') + '><i style="background:' + color(i.marca) + '"></i>' + esc(m.nombre) + (ok && i.obj.estado.detalle ? ' · ' + corto(ymdD(i.obj.estado.detalle.slice(0, 10))) : '') + '</button>';
      return '<button class="mk mkc' + (ok ? ' on' : '') + '" data-check="' + esc(i.k) + '" aria-pressed="' + ok + '"><b class="mk-c">' + (ok ? '✓' : '') + '</b><i style="background:' + color(i.marca) + '"></i>' + esc(m.nombre) + '</button>';
    }).join('');
    const ico = x.sub === 'reunion' ? '<span class="ico">' + I.users + '</span>' : '<span class="prog' + (done ? ' full' : '') + '">' + n + '/' + x.items.length + '</span>';
    return '<div class="row' + (done ? ' done' : '') + ' u' + Math.min(x.u || 1, 4) + '">' + ico + '<div><div class="tt">' + esc(x.t) + '</div><div class="mt">' + x.meta.filter(Boolean).map(m => '<span>' + m + '</span>').join('') + '</div><div class="mks">' + chips + '</div>' + (x.hint && !done ? '<div class="hint">' + esc(x.hint) + '</div>' : '') + '</div><div>' + botonEnlace(enlaceDe(x), x.items.filter(i => !hecho(i.obj)).map(i => i.marca)) + '</div></div>';
  }
  // "crear:produccion" en la columna enlace de Rutinas = botón para crear la tarjeta en ese tablero de la marca
  // las rutinas cuya ayuda dice "cargalo como input" (ej. activaciones externas) muestran un botón que crea la tarjeta en Inputs del SCL
  const enlaceDe = x => { const t = x.t || x.tarea || ''; return x.enlace || (/como input/i.test(x.hint || x.nota || x.ayuda || '') ? 'crear:input' : /correcci/i.test(t) ? 'ver:corr' : /pendientes/i.test(t) && /project/i.test(t) ? 'anotar:pend' : ''); };
  function botonEnlace(enlace, marcas) {
    if (!enlace) return '';
    if (/^anotar:pend/.test(enlace)) return '<button class="btn" data-pend>' + I.pen + ' Anotar pendientes</button>';   // arma la lista y le llega al project (Bandeja de Project + privado)
    if (/^ver:corr/.test(enlace)) return '<button class="btn" data-ver-corr>Ver correcciones</button>';   // lleva a Hoy y abre Correcciones y Tarjetas por vencer
    const m = /^crear:(\w+)/.exec(enlace);
    if (m) return '<button class="btn" data-crear-en="' + esc(m[1]) + '" data-marcas="' + esc((marcas || []).filter(Boolean).join(',')) + '">' + (m[1] === 'input' ? '＋ Cargar como input' : '＋ Tarjeta en ' + esc(NOM_T[m[1]] || m[1])) + '</button>';
    return '<a class="go" href="' + esc(enlace) + '" target="_blank" rel="noopener">' + I.out + '</a>';
  }
  function fila(x) {
    if (x.tipo === 'grupo') return filaGrupo(x);
    const done = hecho(x.obj);
    let accion = '';
    if (x.tipo === 'reporte') accion = '<a class="btn y" href="' + esc(x.url) + '" target="_blank" rel="noopener">Cargar ↗</a>';
    else if (x.tipo === 'reunion') accion = '<button class="btn y" data-agendar="' + esc(x.k) + '">' + I.cal + 'Agendar</button>';
    else if (x.tipo === 'guion') accion = '<a class="btn" href="' + esc(x.url) + '" target="_blank" rel="noopener">Abrir ↗</a>';
    else if (x.tipo === 'input') accion = '<button class="btn" data-det-input="' + esc(x.obj.id) + '">Revisar</button>';
    else if (x.url) accion = '<a class="go" href="' + esc(x.url) + '" target="_blank" rel="noopener" title="Abrir en Trello">' + I.out + '</a>';
    else if (enlaceDe(x)) accion = botonEnlace(enlaceDe(x), [x.marca]);
    // las piezas sin fecha se pueden tildar como resueltas (queda guardado como cualquier tarjeta); los guiones y cumpleaños solo informan
    const chk = (x.tipo === 'reunion' || x.tipo === 'input' || x.tipo === 'reporte' || (x.tipo === 'guion' && !/^sf/.test(x.sub || '')))
      ? '<span class="ico">' + (x.tipo === 'reunion' ? I.users : x.tipo === 'reporte' ? I.flag : x.sub === 'sfvid' ? I.reel : x.sub === 'sfdis' ? I.grid : x.sub === 'cum' ? I.star : x.tipo === 'guion' ? I.pen : I.inbox) + '</span>'
      : '<button class="chk" data-check="' + esc(x.k) + '" aria-label="Marcar como hecho">' + I.check + '</button>';
    return '<div class="row' + (done ? ' done' : '') + ' u' + Math.min(x.u || 1, 4) + '">' + chk + '<div><div class="tt">' + ((x.tipo === 'card' || x.tipo === 'input') && x.obj.id ? '<button class="lnk" ' + (x.tipo === 'input' ? 'data-det-input' : 'data-card-det') + '="' + esc(x.obj.id) + '">' + esc(x.t) + '</button>' : esc(x.t)) + '</div><div class="mt">' + tagM(x.marca) + x.meta.filter(Boolean).map(m => '<span>' + m + '</span>').join('') + (done && x.obj.estado && x.obj.estado.fecha ? '<span>hecho ' + hace(x.obj.estado.fecha) + '</span>' : '') + '</div>' + (x.hint && !done ? '<div class="hint">' + esc(x.hint) + '</div>' : '') + '</div><div class="acc">' + (!done && x.k && !esRevisa() ? '<button class="star' + (esPrio(x.k) ? ' on' : '') + '" data-star="' + esc(x.k) + '" title="Prioridad de hoy">' + (esPrio(x.k) ? '★' : '☆') + '</button>' : '') + (!done && (x.tipo === 'card' || x.tipo === 'input') && x.obj.id ? '<button class="rc-bell" data-rec="' + esc(x.obj.id) + '" title="Recordame esta tarjeta">🔔</button>' : '') + accion + '</div></div>';
  }
  function vHoy(t) {
    const pend = t.filter(x => !hecho(x.obj)), done = t.filter(x => hecho(x.obj));
    const urg = pend.filter(x => x.u >= 3), resto = pend.filter(x => x.u < 3);
    const L = S.data.links;
    // accesos rápidos + los próximos 7 días
    const nVen = vencidas().length, fs = proximasFechas(30), nInp = inputs().filter(c => inputPide(c) && pasa(c.m)).length, nReu = reuPend().filter(r => pasa(r.marca || S.marca)).length;
    const ag = itemsAgenda(7);
    const tira = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + i), de = ag.filter(it => diasA(it.d) === i);
      const tipos = { evento: 0, card: 0, fecha: 0, reunion: 0 }; de.forEach(it => tipos[it.tipo]++);
      return '<button class="dia' + (i === 0 ? ' hoy' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' fin' : '') + '" data-dia="' + i + '"><small>' + (i === 0 ? 'hoy' : DIAS[d.getDay()]) + '</small><b>' + d.getDate() + '</b><span class="pts">' +
        (tipos.card ? '<i class="p-card" title="vencimientos"></i>' : '') + (tipos.evento || tipos.reunion ? '<i class="p-ev" title="calendario"></i>' : '') + (tipos.fecha ? '<i class="p-f" title="fechas"></i>' : '') + '</span><em>' + (de.length ? de.length : '') + '</em></button>';
    }).join('');
    const rapidos = '<div class="rapidos">' +
      (() => { const n = porSalir().length; return '<button class="rp' + (n ? ' warn' : '') + '" data-por-salir><b>' + n + '</b><span>por salir<br><small>reels y carruseles · ¿están ok?</small></span></button>'; })() +
      '<button class="rp' + (nInp ? ' y' : '') + '" data-tab="inputs"><b>' + nInp + '</b><span>inputs<br><small>para revisar</small></span></button>' +
      '<button class="rp' + (nReu ? ' warn' : '') + '" data-tab="reuniones"><b>' + nReu + '</b><span>reuniones<br><small>sin fecha</small></span></button>' +
      '<button class="rp" data-fechas><b>' + fs.length + '</b><span>fechas<br><small>próximos 30 días</small></span></button></div>';
    const festejo = t.length && !pend.length ? '<div class="festejo"><b>¡Día<br>completo!</b><span>Terminaste todo lo de hoy. ' + (S.movil ? 'En <b>Más</b> tenés' : 'Al costado tenés') + ' fechas y sugerencias para adelantar.</span></div>' : '';
    const md = miDia(t, pend, done);
    // una pantalla, una pregunta: ¿qué hago ahora? Primero la tarea; los avisos son chips chicos (solo los que no están en cero)
    return festejo + md.arranque + '<div class="hoy1">' + md.cuerpo + '</div>';
  }
  // "Para mantener todos los meses" (22/10/2026): pedidos fijos de cada marca que se cargan en Trello con una etiqueta
  const linL = () => ((S.data || {}).lineamientos || []).filter(x => pasa(x.m));
  function linBarra() { const L = linL(); return L.length ? '<button class="lin-bar" data-lin><span class="ic">' + I.pin + '</span><b>Para mantener todos los meses</b><em>' + L.length + '</em><i>›</i></button>' : ''; }
  function linVer() {
    const L = linL(), g = {}; L.forEach(x => (g[x.m] = g[x.m] || []).push(x));
    hoja('Para mantener todos los meses', '<p class="intro">Pedidos fijos de tus marcas: valen todos los meses hasta que se saque la etiqueta en Trello.</p>' +
      Object.keys(g).map(m => '<div class="lin-m"><div class="lin-mh"><span class="dotm" style="background:' + color(m) + '"></span>' + esc((marca(m) || {}).nombre || m) + '</div>' +
        g[m].map(x => '<div class="lin-i"><a class="lnk" href="' + esc(x.url) + '" target="_blank" rel="noopener"><b>' + esc(x.n) + '</b></a>' + (x.d ? '<p>' + escL(x.d) + '</p>' : '') + '</div>').join('') + '</div>').join(''));
  }
  function avisos() {
    const D = S.data, ahora = new Date();
    const nDc = D.discord ? dcSinVer().length : 0, nSal = porSalir().length, nInp = inputs().filter(c => inputPide(c) && pasa(c.m)).length;
    const reps = (D.reportes || []).filter(r => pasa(r.marca)), nRepV = reps.filter(r => new Date(r.vence) < ahora).length;
    const nVen = vencidas().length, nReu = reuPend().filter(r => pasa(r.marca || S.marca)).length, nGui = guionAtencion();
    // recuadros: los números que importan, una sola vez, y cada uno lleva a lo suyo (antes: cinta + chips + etiquetas repetían lo mismo)
    const tl = (n, t, s, attr, cl) => '<button class="mio-st' + (n ? ' ' + cl : '') + '" ' + attr + '><b>' + n + '</b><span>' + t + '</span><small>' + s + '</small></button>';
    return '<div class="mio-sts hoy-sts">' + tl(nVen, 'Vencidas', 'tarjetas pasadas de fecha', 'data-vencidas', 'bad') + tl(nInp, 'Inputs', 'pedidos para revisar', 'data-tab="inputs"', 'y') + tl(nSal, 'Por salir', 'chequealas antes', 'data-por-salir', 'warn') +
      tl(reps.length, 'Reportes', nRepV ? nRepV + (nRepV === 1 ? ' vencido' : ' vencidos') : 'para cargar', 'data-tab="semana"', nRepV ? 'bad' : '') + tl(nDc, 'Menciones', 'en Discord, sin leer', 'data-tab="discord"', 'dc') + '</div>' + linBarra();
  }

  /* ---------------- "Mi día": arrancar con 3 prioridades (estilo Sunsama), línea de tiempo con lo que tiene hora
     (estilo Structured) y el resto agrupado en Hoy / Mañana / Esta semana (estilo Todoist) ---------------- */
  // en el celular cada sección muestra 5 y el resto se abre con "Ver todas"
  const corta = (id, L) => !S.movil || S.abiertos[id] || L.length <= 6 ? L.map(fila).join('') : L.slice(0, 5).map(fila).join('') + '<button class="vermas" data-pliegue="' + id + '">Ver ' + (L.length - 5) + ' más</button>';
  const hoyId = () => NOW.toDateString();
  // racha: días hábiles seguidos en que eligió sus prioridades ("Listo, a trabajar"); el fin de semana no la corta
  const diaKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function racha() {
    const hechos = {}; LS.get('racha', []).forEach(x => hechos[x] = 1);
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
    if (!hechos[diaKey(d)]) d.setDate(d.getDate() - 1); // si todavía no arrancó hoy, la racha sigue viva desde ayer
    let n = 0;
    for (let i = 0; i < 90; i++) {
      if (d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() - 1); continue; }
      if (!hechos[diaKey(d)]) break;
      n++; d.setDate(d.getDate() - 1);
    }
    return n;
  }
  function sumarRacha() {
    const k = diaKey(NOW), dias = LS.get('racha', []);
    if (dias.indexOf(k) < 0) { dias.push(k); LS.set('racha', dias.slice(-200)); }
    // queda en la pestaña Registro del Sheet: el project ve quién arranca el día con el panel
    if (!DEMO) post({ action: 'marcar', tipo: 'plan', clave: 'plan:' + k, marca: '', estado: 'hecho', periodo: k, detalle: 'marcó sus prioridades del día' }).catch(() => {});
  }
  // estrella de una tarea: entra o sale de las prioridades de hoy (tope 5; la primera del día suma racha)
  const esPrio = k => { const p = LS.get('plan', {}); return p.dia === hoyId() && (p.ids || []).indexOf(k) >= 0; };
  function togglePrio(k) {
    const plan = LS.get('plan', {}), hoyPlan = plan.dia === hoyId(), ids = hoyPlan ? (plan.ids || []).slice() : [];
    const i = ids.indexOf(k), primera = !ids.length;
    if (i >= 0) ids.splice(i, 1);
    else { if (ids.length >= 5) { toast('Con 3 prioridades alcanza: sacá una antes de sumar otra.'); return; } ids.push(k); }
    LS.set('plan', { dia: hoyId(), ids, skip: !!(hoyPlan && plan.skip) });
    if (primera && ids.length) { sumarRacha(); confeti(); const n = racha(); toast(n > 1 ? '🔥 ' + n + ' días seguidos marcando prioridades. ¡Seguí así!' : '⭐ Primera prioridad del día. Mañana suma racha.'); }
    render();
  }
  // hora del día para la línea de tiempo (solo lo que pasa hoy y tiene horario)
  const horaDe = x => { const o = x.obj || {}; let d = null;
    if (x.tipo === 'evento' && !o.dia) d = new Date(o.s);
    else if (x.tipo === 'card' && o.due) d = new Date(o.due);
    else if (x.tipo === 'reporte' && o.vence) d = new Date(o.vence);
    return d && diasA(d) === 0 ? d : null; };
  const diaDe = x => { const o = x.obj || {}; const d = x.tipo === 'card' ? o.due : x.tipo === 'reporte' ? o.vence : x.tipo === 'evento' ? o.s : x.tipo === 'guion' ? o.entrega : null; return d ? diasA(new Date(d)) : 0; };
  function miDia(t, pend, done) {
    // prioridades del día: opcionales. Se marcan con la estrella de cada tarea; la primera del día suma racha.
    const plan = LS.get('plan', {}), hoyPlan = plan.dia === hoyId(), prioIds = hoyPlan ? (plan.ids || []) : [], porK = {};
    t.forEach(x => porK[x.k] = x);
    let arranque = '', cuerpo = '';
    if (!prioIds.length && !(hoyPlan && plan.skip) && pend.length) {
      arranque = '<div class="arr-mini"><span class="arr-ic">☆</span><div><b>¿Querés marcar tus prioridades de hoy?</b><small>Es opcional. Tocá la estrella de las tareas que querés hacer primero (con 3 alcanza) y quedan arriba de todo.' + (racha() ? ' 🔥 Llevás ' + racha() + (racha() === 1 ? ' día' : ' días') + ' seguidos.' : '') + '</small></div><button class="btn ghost" data-prio-skip>Hoy no</button></div>';
    }
    const prio = prioIds.map(k => porK[k]).filter(Boolean), enPrio = {};
    prio.forEach(x => enPrio[x.k] = 1);
    if (prio.length) {
      const ok = prio.filter(x => hecho(x.obj)).length;
      cuerpo += '<div class="sec prios"><div class="sec-h"><h2>Tus prioridades<small>' + ok + ' de ' + prio.length + '</small></h2><button class="act lnk" data-prio-reset>quitar todas</button></div><div class="list">' + prio.map(fila).join('') + '</div></div>';
    }

    const resto = pend.filter(x => !enPrio[x.k]);
    const conHora = resto.map(x => ({ x, h: horaDe(x) })).filter(o => o.h).sort((a, b) => a.h - b.h);
    const sinHora = resto.filter(x => !horaDe(x));
    if (conHora.length) {
      let puesto = false;
      const ahora = '<div class="tl-ahora"><span>' + hm(NOW) + '</span><i></i><b>ahora</b></div>';
      cuerpo += '<div class="sec"><div class="sec-h"><h2>Mi día<small>' + conHora.length + ' con horario</small></h2></div><div class="tl">' +
        conHora.map(o => { let s = ''; if (!puesto && o.h > NOW) { puesto = true; s = ahora; }
          return s + '<div class="tl-i' + (o.h < NOW ? ' pasado' : '') + '"><span class="tl-h">' + hm(o.h) + '</span><span class="tl-p" style="--c:' + color(o.x.marca) + '"></span><div class="tl-c">' + fila(o.x) + '</div></div>'; }).join('') +
        (puesto ? '' : ahora) + '</div></div>';
    }
    // lo del día, agrupado por tipo en cards plegables; solo se abre sola la más urgente
    const hoyL = sinHora.filter(x => diaDe(x) <= 0), usados = {};
    const TIPOS_HOY = [['corr', 'Correcciones', I.pen, x => x.tipo === 'card' && x.obj.cat === 'corr'], ['card', 'Tarjetas por vencer', I.flag, x => x.tipo === 'card'], ['reporte', 'Reportes', I.flag, x => x.tipo === 'reporte'], ['sfdis', 'Diseños sin fecha', I.grid, x => x.sub === 'sfdis'], ['sfvid', 'Reels e historias sin fecha', I.reel, x => x.sub === 'sfvid'], ['cum', 'Cumpleaños', I.star, x => x.sub === 'cum'], ['guion', 'Guiones', I.pen, x => x.tipo === 'guion'], ['input', 'Inputs', I.inbox, x => x.tipo === 'input'], ['reunion', 'Reuniones', I.users, x => x.tipo === 'reunion' || x.sub === 'reunion'], ['evento', 'Calendario', I.cal, x => x.tipo === 'evento'], ['rutina', 'Rutinas', I.check, () => true]];
    const grupos = TIPOS_HOY.map(tp => { const L = hoyL.filter(x => !usados[x.k] && tp[3](x)); L.forEach(x => usados[x.k] = 1); return [tp, L.sort((a, b) => b.u - a.u)]; })
      .filter(g => g[1].length).sort((a, b) => Math.max.apply(null, b[1].map(x => x.u)) - Math.max.apply(null, a[1].map(x => x.u)));
    let abrio = false;
    const modoHoy = S.marca !== 'todas' ? 'tipo' : LS.get('hoymodo', 'tipo');   // con una marca elegida, "Por marca" no tiene sentido
    const segHoy = S.marca !== 'todas' ? '' : '<div class="seg hoy-seg"><button class="' + (modoHoy === 'tipo' ? 'on' : '') + '" data-hoymodo="tipo">Por tipo</button><button class="' + (modoHoy === 'marca' ? 'on' : '') + '" data-hoymodo="marca">Por marca</button></div>';
    // v2 (22/10/2026): "Por tipo" ya no son carpetas una abajo de la otra sino pestañas: se ve un grupo por vez (menos scroll),
    // con Mañana, Esta semana y Hecho como pestañas más. Arranca en el grupo más urgente y recuerda el último elegido.
    const man = sinHora.filter(x => diaDe(x) === 1), sem = sinHora.filter(x => diaDe(x) >= 2);
    let enPestanas = false;
    if (grupos.length && modoHoy === 'marca') {
      const gm = {}; hoyL.forEach(x => (gm[x.marca || ''] = gm[x.marca || ''] || []).push(x));
      const km = Object.keys(gm).sort((a, b) => (!a) - (!b) || gm[b].filter(x => x.u >= 3).length - gm[a].filter(x => x.u >= 3).length || gm[b].length - gm[a].length);
      cuerpo += '<div class="sec"><div class="sec-h"><h2>En el día<small>' + hoyL.length + '</small></h2></div>' + segHoy + km.map((s, i) => {
        const L = gm[s].sort((a, b) => b.u - a.u), urg = L.filter(x => x.u >= 3).length;
        return tarjeta('hm-' + (s || 'general'), s ? esc((marca(s) || {}).nombre || s) : 'General · de todas las marcas', L.length, urg ? urg + (urg === 1 ? ' urgente' : ' urgentes') : '', i === 0 && urg > 0, () => L.map(fila).join(''), null, s ? color(s) : 'var(--dim)');
      }).join('') + '</div>';
    } else
    if (modoHoy !== 'marca' && (grupos.length || man.length || sem.length || done.length)) {
      enPestanas = true;
      const G = grupos.map(([tp, L]) => ({ id: tp[0], n: tp[1], ic: tp[2], L }));
      if (man.length) G.push({ id: 'man', n: 'Mañana', ic: I.cal, L: man.sort((a, b) => b.u - a.u) });
      if (sem.length) G.push({ id: 'sem', n: 'Esta semana', ic: I.cal, L: sem.sort((a, b) => b.u - a.u) });
      if (done.length) G.push({ id: 'hecho', n: 'Hecho', ic: I.check, L: done, hecho: true });
      let sel = LS.get('hoygrupo', ''); if (!G.some(g => g.id === sel)) sel = G[0].id;
      const g0 = G.find(g => g.id === sel);
      cuerpo += '<div class="sec hoy-g"><div class="sec-h"><h2>En el día<small>' + hoyL.length + '</small></h2>' + segHoy + '</div>' +
        '<div class="gtabs" role="tablist">' + G.map((g, i) => { const urg = g.hecho ? 0 : g.L.filter(x => x.u >= 3).length;
          return '<button role="tab" aria-selected="' + (g.id === sel) + '" class="gtab' + (g.id === sel ? ' on' : '') + (urg ? ' urg' : '') + (g.hecho ? ' hecho' : '') + '" data-hoyg="' + g.id + '"><i class="gtab-n">' + String(i + 1).padStart(2, '0') + '</i><span class="gtab-ic">' + g.ic + '</span><span class="gtab-t">' + g.n + '</span><b>' + g.L.length + '</b>' + (urg ? '<em>' + urg + ' urg.</em>' : '') + '</button>'; }).join('') + '</div>' +
        '<div class="list gpanel" role="tabpanel">' + g0.L.map(fila).join('') + '</div></div>';
    } else
    if (grupos.length) cuerpo += '<div class="sec"><div class="sec-h"><h2>En el día<small>' + hoyL.length + '</small></h2></div>' + segHoy + grupos.map(([tp, L]) => {
      const urg = L.filter(x => x.u >= 3).length, def = !abrio && urg > 0; if (def) abrio = true;
      return tarjeta('h-' + tp[0], tp[1], L.length, urg ? urg + (urg === 1 ? ' urgente' : ' urgentes') : '', def, () => L.map(fila).join(''), tp[2]);
    }).join('') + '</div>';
    if (!enPestanas && (man.length || sem.length)) cuerpo += '<div class="sec"><div class="sec-h"><h2>Después</h2></div>' +
      (man.length ? tarjeta('h-man', 'Mañana', man.length, '', false, () => man.sort((a, b) => b.u - a.u).map(fila).join(''), I.cal) : '') +
      (sem.length ? tarjeta('h-sem', 'Esta semana', sem.length, '', false, () => sem.sort((a, b) => b.u - a.u).map(fila).join(''), I.cal) : '') + '</div>';
    if (!t.length) cuerpo += '<div class="empty">Nada para hoy.</div>';
    if (done.length && !enPestanas) cuerpo += '<div class="sec"><button class="pliegue' + (S.abiertos.hecho ? ' on' : '') + '" data-pliegue="hecho"><span>Hecho<small>' + done.length + '</small></span><i>' + (S.abiertos.hecho ? '−' : '+') + '</i></button>' + (S.abiertos.hecho ? '<div class="list">' + done.map(fila).join('') + '</div>' : '') + '</div>';
    return { arranque, cuerpo };
  }
  // atajos grandes a las otras dos webs del estudio
  function atajos() {
    const D = S.data, L = D.links || {}, nRep = (D.reportes || []).filter(r => pasa(r.marca)).length;
    const a = (url, ico, t, sub, cl) => url ? '<a class="atajo' + (cl || '') + '" href="' + esc(url) + '" target="_blank" rel="noopener"><span class="ic">' + ico + '</span><span><b>' + t + '</b><small>' + sub + '</small></span><i>↗</i></a>' : '';
    return '<div class="atajos">' +
      a(D.linkReportes || L.reportes, I.flag, '¿Reportes?', nRep ? nRep + ' por cargar' : 'todo al día ✓', nRep ? ' hot' : '') +
      a(L.brainstorming, I.star, 'Brainstormings', L.claveBrain ? 'contraseña: <u>' + esc(L.claveBrain) + '</u>' : 'ideas y votación') + '</div>' +
      (L.claveBrain ? '<button class="btn ghost copiar-clave" data-copiar-clave>Copiar la contraseña de brainstormings</button>' : '');
  }
  function costado(chico) {
    const fs = proximasFechas(30), L = S.data.links;
    const seVienen = fs.filter(f => f.tipo !== 'feriado' || diasA(f.d) <= 14).slice(0, chico ? 4 : 6);
    const cm = esCMyo();   // CM (pedido de Joaquín, 26/10/2026): sin Se vienen ni Sugerencias
    return (!cm && seVienen.length ? '<div class="box sv-box"><h3><span class="spark">✦</span>Se vienen</h3><div class="sv-car">' + seVienen.map(f => '<button class="fecha" data-fecha="' + esc(fkey(f)) + '"><span class="fd"><b>' + f.d.getDate() + '</b><small>' + MESES[f.d.getMonth()].slice(0, 3) + '</small></span><span class="fn">' + esc(f.n) + '<small>' + (f.tipo === 'feriado' ? 'feriado' : f.tipo === 'sugerida' ? 'sugerida para ' + (f.marcas.length > 2 ? f.marcas.length + ' marcas' : f.marcas.map(s => (marca(s) || {}).nombre).join(', ')) : (marca(f.marcas[0]) || {}).nombre + (f.enCalendario ? '' : ' · no está en el calendario')) + '</small></span><span class="fq">' + cuando(f.d) + '</span></button>').join('') + '</div><div style="padding:8px 0 12px"><button class="btn ghost" data-fechas>Ver todas</button></div></div>' : '') +
      (cm ? '' : (() => { const sg = sugerencias(), max = S.todasSug ? 99 : chico ? 3 : 6; return '<div class="box"><h3><span class="spark">✦</span>Sugerencias <small style="color:var(--dim);font-weight:500;letter-spacing:0;text-transform:none">· se calculan solas con Trello y el calendario</small></h3>' + sg.slice(0, max).map(s => '<div class="sug"><i class="' + s.c + '"></i><div>' + s.h + (s.go && s.a ? '<br><button class="a" data-tab="' + s.go + '">' + s.a + ' →</button>' : '') + '</div></div>').join('') + (sg.length > max ? '<div style="padding:6px 0 12px"><button class="btn ghost" id="mas">Ver ' + (sg.length - max) + ' más</button></div>' : '') + '</div>'; })()) +
      '<div class="box"><h3>Accesos</h3><div class="links">' +
      [[L.reportes, 'Reportes', 'semanal · mensual'], [L.brainstorming, 'Brainstorming', 'ideas y campañas'], [S.data.project, 'Trello Project', 'pedidos y urgencias'], [L.notion, 'Notion', 'operación'], [L.drive, 'Drive', 'material']].filter(x => x[0]).map(x => '<a class="lk" href="' + esc(x[0]) + '" target="_blank" rel="noopener"><span>' + x[1] + ' ↗</span><small>' + x[2] + '</small></a>').join('') +
      '</div></div>';
  }

  /* ---------------- fechas útiles por rubro (aunque no estén en el calendario anual de Trello) ----------------
     r: rubros a los que les sirve ('todos' = cualquier marca). f: fecha fija 'MM-DD' o función (año) → Date. */
  const nDom = (y, m, n) => { const d = new Date(y, m, 1); d.setDate(1 + ((7 - d.getDay()) % 7) + (n - 1) * 7); return d; }; // n-ésimo domingo
  const FECHAS = [
    { n: 'San Valentín', f: '02-14', r: ['todos'], tip: 'Combos para regalar o compartir de a dos.' },
    { n: 'Día Internacional de la Pizza', f: '02-09', r: ['gastronomia'] },
    { n: 'Día de la Mujer', f: '03-08', r: ['todos'], tip: 'Mejor contenido de reconocimiento que de promo.' },
    { n: 'Vuelta a clases', f: '03-01', r: ['reposteria', 'gastronomia'], tip: 'Viandas, meriendas y tortas de cumple escolares.' },
    { n: 'Día Mundial del Té', f: '05-21', r: ['reposteria', 'gastronomia'] },
    { n: 'Día Mundial de la Hamburguesa', f: '05-28', r: ['gastronomia'] },
    { n: 'Día del Padre', f: y => nDom(y, 5, 3), r: ['todos'], tip: 'Regalos, combos y recetas para papá.' },
    { n: 'Día del Arquitecto', f: '07-01', r: ['inmobiliaria'] },
    { n: 'Día Mundial del Chocolate', f: '07-07', r: ['reposteria', 'gastronomia'] },
    { n: 'Vacaciones de invierno', f: '07-13', r: ['viajes', 'reposteria'], tip: 'Planes y actividades para chicos.' },
    { n: 'Día del Amigo', f: '07-20', r: ['todos'], tip: 'Sorteo de a dos o "etiquetá a tu amigo".' },
    { n: 'Día del Niño', f: y => nDom(y, 7, 3), r: ['todos'] },
    { n: 'Día Internacional del Chocolate', f: '09-13', r: ['reposteria'] },
    { n: 'Primavera y Día del Estudiante', f: '09-21', r: ['todos'] },
    { n: 'Día Mundial del Turismo', f: '09-27', r: ['viajes'] },
    { n: 'Día Internacional del Café', f: '10-01', r: ['reposteria', 'gastronomia'] },
    { n: 'Día Nacional del Dulce de Leche', f: '10-11', r: ['reposteria', 'gastronomia'], tip: 'Receta o producto con dulce de leche: rinde muchísimo en AR.' },
    { n: 'Día Mundial de la Alimentación', f: '10-16', r: ['gastronomia', 'reposteria'] },
    { n: 'Día Mundial del Pan', f: '10-16', r: ['gastronomia', 'reposteria'] },
    { n: 'Día de la Madre', f: y => nDom(y, 9, 3), r: ['todos'], tip: 'La fecha comercial más fuerte de octubre: arrancá 10 días antes.' },
    { n: 'Día Internacional del Chef', f: '10-20', r: ['gastronomia'] },
    { n: 'Halloween', f: '10-31', r: ['reposteria', 'gastronomia', 'todos'], tip: 'Recetas tenebrosas, decoración y promos temáticas.' },
    { n: 'Día Mundial del Veganismo', f: '11-01', r: ['gastronomia', 'reposteria'] },
    { n: 'CyberMonday (a confirmar fecha)', f: '11-02', r: ['todos'], tip: 'Pedí las promos con al menos 2 semanas de anticipación.' },
    { n: 'Día Mundial del Sándwich', f: '11-03', r: ['gastronomia'] },
    { n: 'Día de la Tradición', f: '11-10', r: ['todos'], tip: 'Contenido criollo: mate, asado, campo.' },
    { n: 'Black Friday', f: y => { const d = new Date(y, 10, 1); d.setDate(1 + ((4 - d.getDay() + 7) % 7) + 21 + 1); return d; }, r: ['todos'] },
    { n: 'Día de la Galletita (Cookie Day)', f: '12-04', r: ['reposteria'] },
    { n: 'Día del Brownie', f: '12-08', r: ['reposteria'] },
    { n: 'Día del Cupcake', f: '12-15', r: ['reposteria'] },
    { n: 'Nochebuena y Navidad', f: '12-24', r: ['todos'], tip: 'Arrancá a fines de noviembre: regalos, mesa navideña, horarios.' },
    { n: 'Año Nuevo', f: '12-31', r: ['todos'], tip: 'Cierre de año, agradecimiento y horarios de fiestas.' },
    { n: 'Temporada de verano', f: '12-15', r: ['viajes', 'inmobiliaria'], tip: 'Alquileres temporarios y escapadas.' },
    { n: 'Reyes', f: '01-06', r: ['reposteria'], tip: 'Rosca de Reyes.' }
  ];
  // Rubro de cada marca: sale de la columna "rubro / contexto" de la pestaña Marcas; si está vacía se deduce del nombre.
  const RUBRO_DEF = { 'isco': 'reposteria', 'quality-tienda': 'reposteria gastronomia', 'quality-mayorista': 'reposteria gastronomia', 'tritato': 'gastronomia', 'vice-burger': 'gastronomia', '1talquecocina': 'gastronomia', 'dyb': 'inmobiliaria', 'upper-trip': 'viajes' };
  function rubros(m) {
    const t = norm(m.rubro || '') + ' ' + (RUBRO_DEF[m.slug] || '');
    const out = [];
    if (/repost|pastel|insumo|torta|dulce/.test(t)) out.push('reposteria');
    if (/gastron|burger|hambur|sandw|cocina|resto|comida|pizza/.test(t)) out.push('gastronomia');
    if (/inmob|propiedad|alquiler/.test(t)) out.push('inmobiliaria');
    if (/viaj|turis/.test(t)) out.push('viajes');
    return out;
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function proxFecha(f) {
    for (const y of [NOW.getFullYear(), NOW.getFullYear() + 1]) {
      const d = typeof f.f === 'function' ? f.f(y) : new Date(y, Number(f.f.slice(0, 2)) - 1, Number(f.f.slice(3)));
      if (diasA(d) >= 0) return d;
    }
    return null;
  }
  /* Todas las fechas que se vienen para mis marcas: las del calendario anual de Trello, las sugeridas por rubro y los feriados. */
  function proximasFechas(dias) {
    const D = S.data, out = [];
    D.cards.filter(c => c.cat === 'efem' && c.due).forEach(c => { const d = new Date(c.due); if (diasA(d) >= 0 && diasA(d) <= dias) out.push({ d, n: c.n, tipo: 'trello', marcas: c.m, card: c, enCalendario: c.enCalendario }); });
    FECHAS.forEach(f => {
      const d = proxFecha(f); if (!d || diasA(d) > dias) return;
      const marcas = D.marcas.filter(m => f.r.indexOf('todos') >= 0 || rubros(m).some(r => f.r.indexOf(r) >= 0)).map(m => m.slug)
        .filter(s => !out.some(o => o.tipo === 'trello' && o.marcas[0] === s && norm(o.n).indexOf(norm(f.n).split(' ').slice(-1)[0]) >= 0)); // si ya está en Trello no la repito
      if (marcas.length) out.push({ d, n: f.n, tipo: 'sugerida', marcas, tip: f.tip || '' });
    });
    (D.feriados || []).forEach(h => { const d = ymdD(h.d); if (diasA(d) >= 0 && diasA(d) <= dias) out.push({ d, n: h.n, tipo: 'feriado', marcas: [], tip: 'Feriado: revisá horarios de los locales y lo programado.' }); });
    return out.filter(o => o.tipo === 'feriado' || pasa(o.marcas)).sort((a, b) => a.d - b.d);
  }
  function promptFecha(f) {
    const ms = f.marcas.map(s => (marca(s) || {}).nombre).filter(Boolean);
    return 'Sos especialista senior en redes sociales de un estudio creativo argentino. Se viene ' + f.n + ' (' + f.d.toLocaleDateString('es-AR') + ').' +
      (ms.length ? ' Manejo estas marcas: ' + ms.map(n => { const m = S.data.marcas.find(x => x.nombre === n); return n + (m && m.rubro ? ' (' + m.rubro + ')' : ''); }).join(', ') + '.' : '') +
      (f.tip ? ' Pista: ' + f.tip : '') + '\n\nPara cada marca decime en voseo y concreto: qué pieza haría (carrusel, reel, historias, canal social, promo o sorteo), con qué enfoque, un copy corto y qué le pido al cliente. Hoy es ' + NOW.toLocaleDateString('es-AR') + '.';
  }

  /* ---------------- todo lo que pasa en un día (agenda, tira semanal y panel de detalle) ---------------- */
  function itemsAgenda(dias) {
    const D = S.data, items = [];
    D.eventos.forEach(e => { if (pasa(e.marcas.length ? e.marcas : [S.marca])) items.push({ d: new Date(e.s), h: e.dia ? '—' : hm(new Date(e.s)), x: esc(e.t), k: e.marcas.length ? tagM(e.marcas[0]) : '<span class="k">calendario</span>', cl: hecho(e) ? 'done' : '', tipo: 'evento' }); });
    D.cards.forEach(c => {
      if (!c.due || !pasa(c.m) || c.cat === 'efem') return;
      if (['corr', 'trabajo', 'urgente', 'espera'].includes(c.cat) || c.tipo === 'project') items.push({ d: new Date(c.due), h: 'vence', x: '<button class="lnk" data-card-det="' + esc(c.id) + '">' + esc(c.n) + '</button> <span class="k">· ' + esc(c.cat === 'corr' ? 'corrección' : c.lista) + '</span>', k: tagM(c.m[0]), cl: 'card', tipo: 'card' });
    });
    proximasFechas(dias || 14).forEach(f => items.push({ d: f.d, h: f.tipo === 'feriado' ? '★' : '✦', x: '<button class="lnk" data-fecha="' + esc(fkey(f)) + '">' + esc(f.n) + '</button>' + (f.tipo === 'sugerida' ? ' <span class="pill">sugerida</span>' : f.tipo === 'trello' && !f.enCalendario ? ' <span class="pill warn">no está en el calendario</span>' : ''), k: f.marcas.length ? (f.marcas.length > 2 ? '<span class="k">' + f.marcas.length + ' marcas</span>' : f.marcas.map(tagM).join(' ')) : '<span class="k">feriado</span>', cl: f.tipo === 'feriado' ? 'fer' : f.tipo === 'sugerida' ? 'sugr' : 'efem', tipo: 'fecha' }));
    D.reuniones.forEach(r => { if (hecho(r) && r.estado.detalle && pasa(r.marca || S.marca)) { const det = r.estado.detalle; items.push({ d: ymdD(det.slice(0, 10)), h: det.slice(11, 16) || '—', x: esc(r.nombre), k: tagM(r.marca) || '<span class="k">reunión</span>', cl: '', tipo: 'reunion' }); } });
    return items;
  }
  // Discord: menciones de los últimos 3 días, contados desde ahora (cada una sale sola al cumplir 72 h, aunque la página quede abierta). Lo ya abierto se recuerda en este navegador.
  const DC_HORAS = 72;
  const dcVistos = () => LS.get('dcvistos', {});
  const menciones = () => { const desde = (DEMO ? NOW.getTime() : Date.now()) - DC_HORAS * 3600e3; return ((S.data.discord || {}).menciones || []).filter(m => new Date(m.fecha).getTime() > desde); };
  const dcSinVer = () => { const v = dcVistos(); return menciones().filter(m => !v[m.id]); };
  const dcVer = ids => { const v = dcVistos(); ids.forEach(id => v[id] = 1); const vivos = {}; menciones().forEach(m => { if (v[m.id]) vivos[m.id] = 1; }); LS.set('dcvistos', vivos); };
  function filaDiscord(m) {
    const nuevo = !dcVistos()[m.id];
    return '<div class="dcm' + (nuevo ? ' nuevo' : '') + '"><span class="dca">' + esc((m.autor || '?').slice(0, 1).toUpperCase()) + '</span><a class="dcb" href="' + esc(m.url) + '" target="_blank" rel="noopener" data-dc="' + esc(m.id) + '"><span class="dch"><b>' + esc(m.autor) + '</b> en <b>#' + esc(m.canal) + '</b>' + (m.todos ? ' <span class="pill">@everyone</span>' : '') + '<em>' + hace(m.fecha) + '</em></span><span class="dct">' + esc(m.texto || '') + '</span></a>' +
      (nuevo ? '<button class="dcok" data-dc-ok="' + esc(m.id) + '" title="Sacarlo de la lista">✓ Ya lo leí</button>' : '<a class="dcir" href="' + esc(m.url) + '" target="_blank" rel="noopener">↗</a>') + '</div>';
  }
  // en Hoy: solo lo nuevo (máximo 3) y un link a todo
  function bloqueDiscord() {
    const N = S.data.discord ? dcSinVer() : [];
    if (!N.length) return '';
    return '<div class="dcbox"><div class="dcbox-h"><span>' + I.msg + ' Discord · <b>' + N.length + (N.length === 1 ? ' mención nueva' : ' menciones nuevas') + '</b></span><button class="lnk" data-tab="discord">Ver todas →</button></div>' + N.slice(0, 3).map(filaDiscord).join('') + '</div>';
  }
  function vDiscord() {
    const D = S.data.discord;
    if (!D) return '<div class="empty">Discord todavía no está conectado. Cuando el project cargue el bot, acá aparecen las veces que te mencionan, con un link directo a cada mensaje.</div>';
    if (!D.conUsuario) return '<div class="empty">Falta tu usuario de Discord en la pestaña Equipo del Sheet (columna "usuario de Discord"). Pedíselo al project.</div>';
    // respeta el filtro de marca de arriba (lo que no es de ninguna marca se ve solo con "Todas")
    const v = dcVistos(), verLeidas = !!S.abiertos.dcleidas;
    const Lt = menciones().filter(m => S.marca === 'todas' || m.marca === S.marca), nuevos = Lt.filter(m => !v[m.id]), leidas = Lt.length - nuevos.length;
    // lo que ya marcaste como leído sale de la lista (queda detrás de "ver leídas")
    const L = verLeidas ? Lt : nuevos;
    const modo = LS.get('dcmodo', 'dia');
    // carpeta plegable (Hoy/Ayer o la marca) con cuántas hay y cuántas sin ver
    const carpeta = (id, nombre, lista, abiertaDef, punto) => {
      const nn = lista.filter(m => !v[m.id]).length, abierta = S.abiertos[id] != null ? S.abiertos[id] : abiertaDef;
      return '<div class="dcdia' + (abierta ? ' on' : '') + '"><button class="dcdia-h" data-dcdia="' + id + '" data-abierta="' + (abierta ? 1 : 0) + '">' + (punto ? '<span class="dotm" style="background:' + punto + '"></span>' : '<span class="dcf">' + (abierta ? '📂' : '📁') + '</span>') + '<b>' + nombre + '</b><small>' + lista.length + (lista.length === 1 ? ' mención' : ' menciones') + '</small>' + (nn ? '<em>' + nn + ' nuevas</em>' : '') + '<i>' + (abierta ? '−' : '+') + '</i></button>' +
        (abierta ? '<div class="dclist">' + lista.map(filaDiscord).join('') + '</div>' : '') + '</div>';
    };
    let cuerpo = '';
    if (modo === 'marca') {
      const grupos = {};
      L.forEach(m => (grupos[m.marca || ''] = grupos[m.marca || ''] || []).push(m));
      // primero las marcas con más menciones sin ver; "General" al final
      cuerpo = Object.keys(grupos).sort((a, b) => (!a) - (!b) || grupos[b].filter(m => !v[m.id]).length - grupos[a].filter(m => !v[m.id]).length).map(s =>
        carpeta('dcm-' + (s || 'general'), s ? esc((marca(s) || {}).nombre || s) : 'General · otros canales', grupos[s], grupos[s].some(m => !v[m.id]), s ? color(s) : 'var(--dim)')).join('');
    } else {
      const dias = {};
      L.forEach(m => { const n = diasA(new Date(m.fecha)); (dias[n] = dias[n] || []).push(m); });
      cuerpo = Object.keys(dias).map(Number).sort((a, b) => b - a).map(n => {
        const lista = dias[n], nombre = n === 0 ? 'Hoy' : n === -1 ? 'Ayer' : (() => { const d = new Date(lista[0].fecha); return DIAS_L[d.getDay()] + ' ' + d.getDate(); })();
        return carpeta('dc' + n, nombre, lista, n >= -1);
      }).join('');
    }
    return '<div class="sec"><div class="sec-h"><h2>Te mencionaron<small>' + nuevos.length + ' sin ver</small></h2>' + (nuevos.length ? '<button class="act lnk" data-dc-todo>Marcar todo como visto</button>' : '') + '</div>' +
      '<div class="seg dcseg"><button class="' + (modo === 'dia' ? 'on' : '') + '" data-dcmodo="dia">Por día</button><button class="' + (modo === 'marca' ? 'on' : '') + '" data-dcmodo="marca">Por marca</button></div>' +
      (L.length ? cuerpo : '<div class="empty">' + (leidas ? 'Todo leído. ' : S.marca === 'todas' ? 'Nadie te mencionó en los últimos 3 días.' : 'No hay menciones de esta marca en los últimos 3 días.') + '</div>') +
      (leidas ? '<p class="vercl"><button class="lnk" data-dc-leidas>' + (verLeidas ? 'Ocultar las leídas' : 'Ver las ' + leidas + ' leídas') + '</button></p>' : '') +
      '<p class="ayuda">Se ven las menciones de los últimos 3 días y se actualiza cada 10 minutos. Tocá un mensaje y se abre Discord justo ahí. Los mensajes directos no aparecen.</p></div>';
  }
  // guiones (tableros GUIONES de cada marca, los maneja Fede)
  const guiones = () => (S.data.cards || []).filter(c => c.cat === 'guion' && pasa(c.m));
  const proxLunes = () => { const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d; };
  const guionAtencion = () => guiones().filter(g => !g.salio).filter(g => (g.gest === 'pendiente' && (!g.entrega || diasA(new Date(g.entrega)) <= 1)) || g.gest === 'revisar').length;
  // reels, carruseles y piezas del calendario que salen en los próximos días (para chequear que estén ok)
  const porSalir = () => S.data.cards.filter(c => c.due && !c.dc && (!c.tipo || c.tipo === 'scl') && pasa(c.m) && ['input', 'recursos', 'fichas', 'efem', 'brainstorming', 'guion'].indexOf(c.cat) < 0 && diasA(new Date(c.due)) >= 0 && diasA(new Date(c.due)) <= S.data.ajustes.porVencer).sort((a, b) => new Date(a.due) - new Date(b.due));
  const formato = c => { const t = (c.n + ' ' + (c.lab || []).join(' ')).toLowerCase(); return /reel|video/.test(t) ? 'Reel' : /carrus|carousel/.test(t) ? 'Carrusel' : /histori|story/.test(t) ? 'Historia' : 'Pieza'; };
  const vencidas = () => S.data.cards.filter(c => c.due && !c.dc && diasA(new Date(c.due)) < 0 && pasa(c.m) && (['corr', 'trabajo', 'urgente', 'espera'].includes(c.cat) || c.tipo === 'project'));
  const fkey = f => norm(f.n) + '|' + f.d.toDateString() + '|' + f.tipo;
  function panelLateral(titulo, html) {
    cerrarPanel();
    const p = document.createElement('div'); p.className = 'drawer'; p.id = 'drawer';
    p.innerHTML = '<div class="dw-bg"></div><aside class="dw"><div class="dw-h"><h3>' + titulo + '</h3><button class="dw-x" aria-label="Cerrar">✕</button></div><div class="dw-b">' + html + '</div></aside>';
    document.body.appendChild(p);
    requestAnimationFrame(() => p.classList.add('on'));
    $('.dw-bg', p).onclick = cerrarPanel; $('.dw-x', p).onclick = cerrarPanel;
    bind(p);
  }
  function cerrarPanel() { const p = $('#drawer'); if (p) p.remove(); }

  /* ---------------- Ivo: abrir una pieza, verla y aprobarla o mandarla a corregir ---------------- */
  async function abrirPieza(id) {
    const c = S.data.cards.find(x => x.id === id); if (!c) return;
    panelLateral(esc(c.n), '<div class="pz-cargando">Trayendo la tarjeta de Trello…</div>');
    let v = null;
    try { v = DEMO ? { pieza: { d: 'Diseño entregado. Va el carrusel en 4 placas.', att: [{ id: 'a1', card: 'p1', n: 'placa-1.png', u: '#', ver: true, subido: true, src: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="100%" height="100%" fill="#FFF200"/><text x="50%" y="45%" font-size="90" text-anchor="middle" font-family="Impact" fill="#0A0A0A">PROMO</text><text x="50%" y="58%" font-size="60" text-anchor="middle" font-family="Arial" fill="#0A0A0A">10% OFF</text></svg>') }, { n: 'reel-promo.mp4', u: '#', video: true, subido: true, src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' }, { n: 'Canva · carrusel', u: '#' }], com: [{ q: 'Diseñadora', t: 'Listo, lo subí', f: '2026-10-07T13:00:00Z' }] }, original: { d: 'COPY: Promo del miércoles: llevando $80.000, 10% off en dulce de leche.\nPlacas: precio final grande.', att: [], com: [], chk: [{ n: 'Entrega', items: [{ n: 'Placa 1 · portada', ok: true }, { n: 'Placa 2 · precio', ok: true }, { n: 'Placa 3 · cierre', ok: false }] }] } } : await post({ action: 'verTarjeta', cardId: c.id, origUrl: c.ourl || '' }); }
    catch (e) { const b = $('#drawer .dw-b'); if (b) b.innerHTML = '<div class="empty">No pude traer la tarjeta: ' + esc(e.message) + '</div>'; return; }
    const p = v.pieza || {}, o = v.original || {};
    const adj = (p.att || []).concat(o.att || []);
    const coms = (p.com || []).concat(o.com || []).sort((a, b) => b.f.localeCompare(a.f)).slice(0, 6);
    const dw0 = $('#drawer'); if (dw0) dw0.classList.add('pz-wide');
    const chks = (o.chk || []).concat(p.chk || []).filter(k => k.items && k.items.length);
    const html = '<div class="pz-2"><div class="pz-info">' +
      '<div class="mt" style="margin-bottom:12px">' + tagM(c.m[0]) + '<span class="pill">' + esc(c.tablero || '') + '</span>' + (c.salida ? '<span>sale ' + cuando(new Date(c.salida)) + '</span>' : '') + '</div>' +
      (o.d ? '<div class="dw-l">Brief / copy (tarjeta de SCL)</div><div class="pz-desc">' + escL(o.d) + '</div>' : '') +
      (p.d ? '<div class="dw-l">Nota de la entrega</div><div class="pz-desc">' + escL(p.d) + '</div>' : '') +
      chks.map(k => '<div class="dw-l">Checklist · ' + esc(k.n) + ' <b>' + k.items.filter(x => x.ok).length + '/' + k.items.length + '</b></div><div class="pz-chk">' + k.items.map(x => '<div class="' + (x.ok ? 'ok' : '') + '"><i>' + (x.ok ? '✓' : '') + '</i><span>' + esc(x.n) + '</span></div>').join('') + '</div>').join('') +
      PZ_PIE_() + '</div><div class="pz-gal">' +
      '<div class="pz-sub"><button class="btn ghost" id="pzsubir">＋ Subir imagen</button><input type="file" id="pzfile" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden><span id="pzsubq">Se sube a la tarjeta de Trello. PNG, JPG, GIF o WEBP, hasta 9 MB.</span></div>' +
      (adj.length ? '<div class="dw-l">Lo que cargaron</div><div class="pz-adj">' + adj.map((a, i) => {
        const pie = '<div class="pz-pie"><span>' + (a.video ? I.reel + ' ' : '') + esc(a.n) + '</span>' + (a.video ? '' : '<button class="pz-ver" data-pz-ver>Ver completa</button>') + '<a href="' + esc(a.src || a.u) + '" target="_blank" rel="noopener" title="Abrir el archivo original en otra pestaña">original ↗</a>' + (a.subido && a.id && a.card ? '<button class="pz-borrar" data-pz-borrar="' + esc(a.id) + '" data-card="' + esc(a.card) + '" data-nombre="' + esc(a.n) + '" title="Borrar este archivo de la tarjeta de Trello">Borrar</button>' : '') + '</div>';
        // con el puente de Cloudflare el archivo llega directo (sin login en Trello): video que se reproduce acá, imagen que se agranda al tocar
        if (a.src && a.video) return '<div class="pz-prev grande vid"><video controls playsinline preload="metadata" src="' + esc(a.src) + '"></video>' + pie + '</div>';
        if (a.src && (a.ver || /^image\//.test(a.mime))) return '<div class="pz-prev' + (i === 0 ? ' grande' : '') + ' directa"><img src="' + esc(a.src) + '" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'sin\')">' + pie + '</div>';
        // sin puente: la imagen la trae el servidor del panel; lo demás queda como link
        if (a.ver) return '<div class="pz-prev' + (i === 0 ? ' grande' : '') + '" data-att="' + esc(a.id) + '" data-card="' + esc(a.card) + '"><div class="pz-ph">Cargando vista previa…</div>' + pie + '</div>';
        return '<a href="' + esc(a.src || a.u) + '" target="_blank" rel="noopener" class="pz-arch">' + (a.video ? I.reel : I.clip) + '<span>' + esc(a.n) + '</span><em>' + (a.src ? 'ver' : a.subido ? 'abrir en Trello' : 'abrir link') + ' ↗</em></a>';
      }).join('') + '</div>' : '<div class="empty" style="padding:12px 0">La tarjeta no tiene archivos adjuntos.</div>') + '</div></div>';
    function PZ_PIE_() { return (
      '<div id="pzcoms">' + (coms.length ? '<div class="dw-l">Comentarios</div>' + coms.map(x => '<div class="pz-com"><b>' + esc(x.q) + '</b> <small>' + hace(x.f) + '</small><div>' + esc(x.t) + '</div></div>').join('') : '') + '</div>' +
      '<div class="pz-acc"><textarea id="pzcom" rows="3" placeholder="Escribí un comentario o qué hay que corregir…"></textarea>' +
      '<div class="pz-btns"><button class="btn ghost" id="pzcomb">' + I.msg + ' Comentar</button><button class="btn ghost" id="pzcor">' + I.pen + ' A corregir</button><button class="btn y" id="pzok">✓ Aprobar</button></div>' +
      '<div class="err" id="pzerr"></div><a class="ayuda" href="' + esc(c.url) + '" target="_blank" rel="noopener">Abrir en Trello ↗</a></div>'); }
    const b = $('#drawer .dw-b'); if (!b) return;
    b.innerHTML = html;
    // resultado de cada acción, paso por paso: lo que se hizo (✓) y lo que no (✗), para que nunca quede la duda
    const resultado = (pasos, mal) => (pasos || []).map(p => '✓ ' + esc(p)).join('<br>') + (mal ? ((pasos || []).length ? '<br>' : '') + '✗ ' + esc(mal) : '');
    const agregarComentario = txt => {
      const cont = $('#pzcoms'); if (!cont) return;
      if (!cont.querySelector('.dw-l')) cont.innerHTML = '<div class="dw-l">Comentarios</div>';
      cont.querySelector('.dw-l').insertAdjacentHTML('afterend', '<div class="pz-com nuevo"><b>Vos</b> <small>recién · ya está en Trello</small><div>' + esc(txt) + '</div></div>');
    };
    const botones = on => { ['#pzok', '#pzcor', '#pzcomb'].forEach(s => { const x = $(s); if (x) x.disabled = !on; }); if (on) { $('#pzok').textContent = '✓ Aprobar'; $('#pzcor').textContent = '✏️ A corregir'; $('#pzcomb').textContent = '💬 Comentar'; } };
    const enviar = async accion => {
      const txt = $('#pzcom').value.trim();
      if (accion === 'corregir' && !txt) { $('#pzerr').textContent = 'Escribí qué hay que corregir.'; $('#pzcom').focus(); return; }
      botones(false); $('#pzerr').innerHTML = ''; (accion === 'aprobar' ? $('#pzok') : $('#pzcor')).textContent = 'Enviando…';
      try {
        const r = await post({ action: 'revisarPieza', accion, cardId: c.id, comentario: txt, marca: c.m[0], nombre: c.n, tablero: c.tablero });
        S.data.cards = S.data.cards.filter(x => x.id !== c.id);
        cerrarPanel(); if (accion === 'aprobar') confeti();
        render(); toast(resultado(r.pasos && r.pasos.length ? r.pasos : [accion === 'aprobar' ? 'Aprobado' : 'Mandado a corregir']));
      } catch (e) {
        botones(true);
        // si el comentario ya quedó en Trello, se saca del cuadro para no mandarlo dos veces
        if (e.pasos && e.pasos.length) { if (txt) agregarComentario(txt); $('#pzcom').value = ''; }
        $('#pzerr').innerHTML = resultado(e.pasos, e.message);
      }
    };
    $('#pzok').onclick = () => enviar('aprobar');
    $('#pzcor').onclick = () => enviar('corregir');
    // comentario suelto: queda en la tarjeta de Diseño/Producción sin moverla
    $('#pzcomb').onclick = async () => {
      const txt = $('#pzcom').value.trim();
      if (!txt) { $('#pzerr').textContent = 'Escribí el comentario.'; $('#pzcom').focus(); return; }
      botones(false); $('#pzcomb').textContent = 'Enviando…'; $('#pzerr').innerHTML = '';
      try {
        const r = await post({ action: 'comentarTarjeta', cardId: c.id, texto: txt, marca: c.m[0], nombre: c.n, tablero: c.tablero });
        agregarComentario(txt); $('#pzcom').value = '';
        toast(resultado(r.pasos && r.pasos.length ? r.pasos : ['Comentario enviado']));
      } catch (e) { $('#pzerr').innerHTML = resultado(e.pasos, 'No se puso el comentario: ' + e.message); }
      botones(true);
    };
    // vistas previas: el servidor baja cada archivo de Trello y lo devuelve como imagen; tocándola se ve en grande
    // borrar un archivo de la tarjeta (pide confirmación: en Trello no se puede deshacer) y subir imágenes nuevas
    b.querySelectorAll('[data-pz-borrar]').forEach(x => x.onclick = () => {
      modal('<h3>¿Borrar "' + esc(x.dataset.nombre) + '"?</h3><p>Se borra de la tarjeta de Trello y <b>no se puede deshacer</b>. Si lo que querés es reemplazarla, subí primero la nueva.</p><div class="err"></div><div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Borrar de la tarjeta</button></div>', async () => {
        if (!DEMO) await post({ action: 'borrarAdjunto', cardId: x.dataset.card, attId: x.dataset.pzBorrar, marca: c.m[0], nombre: c.n });
        toast('✓ Archivo borrado de la tarjeta de Trello.');
        if (DEMO) { const p = x.closest('.pz-prev'); if (p) p.remove(); } else abrirPieza(id);
      });
    });
    const subir = $('#pzsubir'), archivo = $('#pzfile');
    if (subir && archivo) {
      subir.onclick = () => archivo.click();
      const subirLista = async files => {
        files = [...files]; if (!files.length || subir.disabled) return;
        const q = $('#pzsubq'); subir.disabled = true; let ok = 0; const mal = [];
        for (const f of files) {
          if (!/^image\/(png|jpe?g|gif|webp)$/i.test(f.type)) { mal.push(f.name + ': solo imágenes PNG, JPG, GIF o WEBP'); continue; }
          if (f.size > 9 * 1024 * 1024) { mal.push(f.name + ': pesa más de 9 MB, subila desde Trello'); continue; }
          if (q) q.textContent = 'Subiendo ' + f.name + '… no cierres esta ventana.';
          try {
            const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(new Error('no pude leer el archivo')); fr.readAsDataURL(f); });
            if (!DEMO) await post({ action: 'subirAdjunto', cardId: c.id, archivo: f.name, mime: f.type, data: data, marca: c.m[0], nombre: c.n });
            ok++;
          } catch (e) { mal.push(f.name + ': ' + e.message); }
        }
        subir.disabled = false; archivo.value = '';
        toast((ok ? '✓ ' + ok + (ok === 1 ? ' imagen subida' : ' imágenes subidas') + ' a la tarjeta de Trello.' : '') + mal.map((m, i) => (ok || i ? '<br>' : '') + '✗ ' + esc(m)).join(''));
        if (ok && !DEMO) abrirPieza(id); else if (q) q.textContent = DEMO && ok ? 'Modo demo: no se subió nada de verdad.' : 'Se sube a la tarjeta de Trello. PNG, JPG, GIF o WEBP, hasta 9 MB.';
      };
      archivo.onchange = () => subirLista(archivo.files);
      // también se puede arrastrar o pegar (Ctrl+V) una imagen en la pieza abierta
      b.ondragover = e => e.preventDefault();
      b.ondrop = (e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); subirLista(e.dataTransfer.files); } });
      const pegar = e => { if (!document.body.contains(b)) { document.removeEventListener('paste', pegar); return; } const fs = [...((e.clipboardData || {}).items || [])].filter(it => it.kind === 'file').map(it => it.getAsFile()).filter(Boolean); if (fs.length) { e.preventDefault(); subirLista(fs.map(f => f.name && !/^image.w+$/.test(f.name) ? f : new File([f], 'captura-' + Date.now() + '.png', { type: f.type || 'image/png' }))); } };
      if (window.__pzPegar) document.removeEventListener('paste', window.__pzPegar);
      window.__pzPegar = pegar; document.addEventListener('paste', pegar);
    }
    // tocar una imagen (o "Ver completa") la abre acá mismo, entera; adentro se pasa a la siguiente y se puede ver a tamaño real
    b.addEventListener('click', e => {
      const im = e.target.closest('.pz-prev img'), bt = e.target.closest('[data-pz-ver]');
      const el = im || (bt && bt.closest('.pz-prev').querySelector('img')); if (!el) return;
      const L = [...b.querySelectorAll('.pz-prev img')].filter(x => x.getAttribute('src'));
      visorImagenes(L.map(x => x.src), Math.max(0, L.indexOf(el)));
    });
    b.querySelectorAll('.pz-prev:not(.directa):not(.vid)').forEach(async el => {
      const ph = el.querySelector('.pz-ph');
      try {
        const r = DEMO ? { ok: true, data: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="100%" height="100%" fill="#FFF200"/><text x="50%" y="45%" font-size="90" text-anchor="middle" font-family="Impact" fill="#0A0A0A">PROMO</text><text x="50%" y="58%" font-size="60" text-anchor="middle" font-family="Arial" fill="#0A0A0A">10% OFF</text></svg>') } : await post({ action: 'adjunto', cardId: el.dataset.card, attId: el.dataset.att });
        if (!r.ok || !r.data) { ph.textContent = 'Sin vista previa · tocá "abrir"'; ph.classList.add('sin'); return; }
        ph.outerHTML = '<img src="' + r.data + '" alt="">';
      } catch (e) { ph.textContent = 'Sin vista previa · tocá "abrir"'; ph.classList.add('sin'); }
    });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('.pz-zoom')) cerrarPanel(); });
  /* Visor de imágenes dentro del panel (sin abrir otra pestaña): la imagen entra entera en la pantalla; tocándola pasa a tamaño real
     y se recorre con scroll. Flechas (o ← →) para pasar a la siguiente; ✕, Esc o tocar afuera para cerrar. */
  function visorImagenes(srcs, i) {
    if (!srcs.length) return;
    const viejo = $('.pz-zoom'); if (viejo) viejo.remove();
    const z = document.createElement('div'); z.className = 'pz-zoom';
    const varias = srcs.length > 1;
    z.innerHTML = '<div class="pz-zt"><span class="pz-zn"></span><button class="pz-zb" data-z="real">Tamaño real</button><button class="pz-zb" data-z="x" aria-label="Cerrar">✕</button></div>' +
      '<div class="pz-zs"><img alt=""></div>' + (varias ? '<button class="pz-za izq" data-z="-1" aria-label="Anterior">‹</button><button class="pz-za der" data-z="1" aria-label="Siguiente">›</button>' : '');
    const img = z.querySelector('img'), sc = z.querySelector('.pz-zs'), n = z.querySelector('.pz-zn'), bReal = z.querySelector('[data-z="real"]');
    const real = on => { z.classList.toggle('real', on); bReal.textContent = on ? 'Ajustar a la pantalla' : 'Tamaño real'; sc.scrollTop = 0; sc.scrollLeft = 0; };
    const ir = k => { i = (k + srcs.length) % srcs.length; img.src = srcs[i]; n.textContent = varias ? (i + 1) + ' de ' + srcs.length : ''; real(false); };
    const cerrar = () => { z.remove(); document.removeEventListener('keydown', tecla, true); };
    function tecla(e) {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(); }
      else if (varias && e.key === 'ArrowRight') ir(i + 1);
      else if (varias && e.key === 'ArrowLeft') ir(i - 1);
    }
    z.onclick = e => {
      const t = e.target.closest('[data-z]');
      if (t) { const v = t.dataset.z; if (v === 'x') cerrar(); else if (v === 'real') real(!z.classList.contains('real')); else ir(i + Number(v)); return; }
      if (e.target === img) real(!z.classList.contains('real')); else if (e.target === sc || e.target === z) cerrar();
    };
    document.addEventListener('keydown', tecla, true);
    document.body.appendChild(z); ir(i);
  }

  function detalleDia(d) {
    const its = itemsAgenda(14).filter(it => diasA(it.d) === diasA(d)).sort((a, b) => a.h.localeCompare(b.h));
    panelLateral(DIAS_L[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()],
      its.length ? its.map(it => '<div class="ag ' + it.cl + '"><span class="h">' + it.h + '</span><span class="x">' + it.x + '</span>' + it.k + '</div>').join('') : '<div class="empty">Nada cargado para este día.</div>');
  }
  function detalleFecha(f) {
    const tipo = { trello: 'Está en el calendario anual de Trello', sugerida: 'Sugerida según el rubro de la marca (no está en Trello)', feriado: 'Feriado nacional' }[f.tipo];
    panelLateral(esc(f.n),
      '<div class="dw-big">' + f.d.getDate() + ' <small>' + MESES[f.d.getMonth()] + ' · ' + cuando(f.d) + '</small></div>' +
      '<p class="dw-p">' + tipo + '.' + (f.tipo === 'trello' && !f.enCalendario ? ' <b>Todavía no la veo en el calendario editorial.</b>' : '') + '</p>' +
      (f.marcas.length ? '<div class="dw-l">Le sirve a</div><div class="mks">' + f.marcas.map(s => '<span class="mk"><i style="background:' + color(s) + '"></i>' + esc((marca(s) || {}).nombre || s) + '</span>').join('') + '</div>' : '') +
      (f.tip ? '<div class="dw-l">Idea</div><p class="dw-p">' + esc(f.tip) + '</p>' : '') +
      '<div class="dw-acts"><button class="btn y" data-claude-fecha="1">✦ Ideas con Claude</button><button class="btn ghost" data-copiar-fecha="1">Copiar</button>' + (f.card ? '<a class="btn" href="' + esc(f.card.url) + '" target="_blank" rel="noopener">Abrir en Trello ↗</a>' : '') + '</div>');
    const p = $('#drawer');
    $('[data-claude-fecha]', p).onclick = () => abrirClaude(promptFecha(f));
    $('[data-copiar-fecha]', p).onclick = () => copiar(promptFecha(f));
  }
  function detalleCard(c) {
    const lec = c.ia || ideaRapida(c);
    panelLateral(esc(c.n),
      '<div class="mt" style="display:flex;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--muted)">' + tagM(c.m[0]) + '<span>' + esc(c.tablero) + ' · ' + esc(c.lista) + '</span>' + (c.due ? '<span>' + (diasA(new Date(c.due)) < 0 ? '<span class="pill bad">' + cuando(new Date(c.due)) + '</span>' : 'vence ' + cuando(new Date(c.due))) + '</span>' : '') + '</div>' +
      (c.d ? '<p class="dw-p" style="white-space:pre-line">' + escL(c.d) + '</p>' : '') +
      (c.att && c.att.length ? '<div class="att" style="padding:0;margin:10px 0">' + c.att.map(a => '<a href="' + esc(a.u) + '" target="_blank" rel="noopener">' + I.clip + esc(a.n) + '</a>').join('') + '</div>' : '') +
      (['input', 'brainstorming', 'efem', 'corr'].includes(c.cat) || c.tipo === 'project' ? '<div class="ia' + (lec.auto ? ' auto' : '') + '" style="margin:14px 0 0"><div class="t" data-k="' + (lec.auto ? 'Idea rápida' : 'IA') + '">' + esc(lec.titular) + '</div><ol>' + lec.acciones.map(a => '<li><span>' + esc(a.que) + '<span class="f">' + esc(a.formato) + '</span></span></li>').join('') + '</ol></div>' : '') +
      '<div class="dw-acts"><a class="btn" href="' + esc(c.url) + '" target="_blank" rel="noopener">Abrir en Trello ↗</a>' + (/foto/i.test(c.n + ' ' + (c.d || '')) && (marca(c.m[0]) || {}).driveFotos ? '<a class="btn" href="' + esc(marca(c.m[0]).driveFotos) + '" target="_blank" rel="noopener">' + I.folder + ' Drive de fotos</a>' : '') + '<button class="btn" data-mover="' + esc(c.id) + '">Mover</button>' + (c.cat === 'input' || c.tipo === 'project' || c.cat === 'efem' || c.cat === 'brainstorming' ? '<button class="btn y" data-crear="' + esc(c.id) + '">＋ Crear tarjeta</button>' : '') + btnClaude(c.id) + '</div>');
  }

  /* ---------------- "Idea rápida": sugerencia automática y gratis según lo que dice la tarjeta (sin IA) ---------------- */
  const REGLAS_IDEA = [
    [/receta|recetario|cocin|prepar/, [['Carrusel paso a paso con la receta y los productos de la marca', 'carrusel'], ['Reel corto de la preparación', 'reel'], ['Tanda de historias con la receta y encuesta', 'historias']], ['Fotos o video del resultado final', 'Productos usados y precios']],
    [/video|videos|grab|filmac|clip/, [['Reel con cortes rápidos y audio en tendencia', 'reel'], ['Historias con los clips sueltos y sticker de pregunta', 'historias']], ['Confirmar qué se quiere comunicar con los videos']],
    [/promo|oferta|descuento|%|off|2x1|cuotas|precio/, [['Historias con sticker de link y cuenta regresiva', 'historias'], ['Aviso en el canal social', 'canal social'], ['Post o carrusel con la promo', 'post']], ['Condiciones, vigencia y medios de pago']],
    [/lanzamiento|nuevo|nueva|llego|ingreso|novedad/, [['Reel de presentación del producto', 'reel'], ['Carrusel con detalles y usos', 'carrusel'], ['Historias "llegó" con link', 'historias']], ['Fotos en buena calidad', 'Precio y presentación']],
    [/foto|fotos|sesion|imagen/, [['Carrusel con las mejores fotos', 'carrusel'], ['Post destacado', 'post']], ['Fotos en alta']],
    [/sorteo|concurso|giveaway/, [['Post del sorteo con bases claras', 'post'], ['Historias para empujar participación', 'historias']], ['Premio, fecha de cierre y condiciones']],
    [/horario|feriado|cerrado|vacacion/, [['Placa de horarios en historias destacadas', 'historias'], ['Post de aviso', 'post']], ['Confirmar horarios exactos']],
    [/evento|feria|demo|capacitacion|taller/, [['Previa en historias para generar expectativa', 'historias'], ['Reel del evento', 'reel']], ['Fecha, lugar y quiénes participan']]
  ];
  function ideaRapida(c) {
    const t = norm(c.n + ' ' + (c.d || ''));
    const r = REGLAS_IDEA.find(x => x[0].test(t));
    if (!r) return { titular: 'No queda claro qué hay que hacer con esto: primero confirmalo con el project.', acciones: [{ que: 'Preguntale al project qué necesita y para cuándo', formato: 'consulta' }, { que: 'Mientras tanto, pensá si sirve para historias de esta semana', formato: 'historias' }], pedir: [], auto: true };
    return { titular: 'Idea rápida según lo que dice la tarjeta:', acciones: r[1].map(a => ({ que: a[0], formato: a[1] })), pedir: r[2], auto: true };
  }

  /* ---------------- "Preguntale a Claude": abre el Claude del equipo con la consulta ya escrita (no gasta créditos del panel) ---------------- */
  function abrirClaude(txt) {
    try { navigator.clipboard.writeText(txt).catch(() => {}); } catch (e) {}
    window.open('https://claude.ai/new?q=' + encodeURIComponent(txt.slice(0, 6000)), '_blank', 'noopener');
    toast('Abrí tu Claude con la consulta escrita. Si no aparece, pegala con Ctrl+V.');
  }
  function promptTarjeta(c) {
    const m = marca(c.m[0]) || { nombre: 'la marca' };
    const efs = S.data.cards.filter(x => x.cat === 'efem' && x.m[0] === c.m[0] && x.due && diasA(new Date(x.due)) >= 0).sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 6);
    const tipo = c.cat === 'efem' ? 'una efeméride del calendario anual' : c.cat === 'brainstorming' ? 'una idea de campaña / brainstorming' : 'un input que me dejó el project';
    return 'Sos especialista senior en redes sociales de un estudio creativo argentino. Trabajo como social media de la marca ' + m.nombre + '.\n\n' +
      'En Trello tengo ' + tipo + ':\n- Título: ' + c.n + (c.d ? '\n- Descripción: ' + c.d : '') + (c.due ? '\n- Fecha: ' + new Date(c.due).toLocaleDateString('es-AR') : '') +
      (c.lab && c.lab.length ? '\n- Etiquetas: ' + c.lab.join(', ') : '') + (c.att && c.att.length ? '\n- Adjuntos: ' + c.att.map(a => a.n).join(', ') : '') + '\n- Lista: ' + c.lista +
      (efs.length ? '\n\nPróximas efemérides de la marca: ' + efs.map(x => x.n + ' (' + new Date(x.due).toLocaleDateString('es-AR') + ')').join(', ') : '') +
      '\n\nHoy es ' + NOW.toLocaleDateString('es-AR') + '. Decime en voseo y concreto:\n1. Qué piezas haría (carrusel, reel, historias, canal social, oferta, sorteo) y con qué enfoque.\n2. Un copy sugerido para la pieza principal.\n3. Qué le pido al cliente o al project (promos, productos, fotos, precios).\n4. Para cuándo lo programaría.';
  }
  /* Lo que se le pasa a Claude para ordenar el día: lo de hoy, lo que queda de la semana y del mes, reportes, inputs, atrasos y fechas que se vienen.
     Le pide que lo ordene como un compañero ("yo empezaría por acá, después…, acordate de…"). */
  function promptPlan() {
    const D = S.data, nm = s => (marca(s) || {}).nombre || '', limpio = s => String(s || '').replace(/<[^>]+>/g, '');
    const hoyL = agrupado().filter(x => !hecho(x.obj)).map(x => '- ' + x.t + (x.marca ? ' [' + nm(x.marca) + ']' : '') + (x.items ? ' [' + x.items.filter(i => !hecho(i.obj)).map(i => nm(i.marca)).join(', ') + ']' : '') + (x.meta && x.meta.length ? ' · ' + limpio(x.meta.join(' · ')) : ''));
    const si = D.semanaInfo || {}, er = D.estRut || {}, falta = (r, per) => (r.marcas.length ? r.marcas.filter(s => pasa([s])) : ['-']).filter(s => !(er['rut:' + r.id + ':' + s + ':' + per] || {}).estado);
    const rutP = (re, per) => (D.rutinasDef || []).filter(r => re.test(r.cuando)).map(r => ({ r, f: falta(r, per) })).filter(o => o.f.length).map(o => '- ' + o.r.tarea + (o.f[0] !== '-' ? ' [' + o.f.map(nm).join(', ') + ']' : ''));
    const sem = rutP(/^semana:/, si.semana), mes = rutP(/^(mes|meses):/, si.mes);
    const reps = (D.reportes || []).filter(r => pasa(r.marca)).map(r => '- ' + r.label + ' [' + nm(r.marca) + '] · vence ' + dm(new Date(r.vence)));
    const inps = inputs().filter(c => inputPide(c) && pasa(c.m)).map(c => '- ' + c.n + ' [' + nm(c.m[0]) + ']');
    const venc = vencidas().map(c => '- ' + c.n + ' [' + nm(c.m[0]) + '] · venció el ' + dm(new Date(c.due)));
    const fechas = proximasFechas(30).filter(f => f.tipo !== 'feriado').slice(0, 10).map(f => '- ' + f.n + ' · ' + dm(f.d) + (f.marcas && f.marcas.length ? ' [' + f.marcas.map(nm).join(', ') + ']' : ''));
    const bloque = (t, L) => L.length ? '\n\n' + t + ':\n' + L.join('\n') : '';
    return 'Sos mi compañero de trabajo con experiencia en redes sociales en un estudio creativo argentino. Soy ' + D.yo.nombre + ' (' + D.yo.rol + ') y hoy es ' + DIAS_L[NOW.getDay()].toLowerCase() + ' ' + NOW.getDate() + ' de ' + MESES[NOW.getMonth()] + '.\n' +
      'Te paso todo lo que tengo pendiente. Ordenámelo como me lo diría alguien que conoce el trabajo, en voseo y corto: "yo empezaría por esto porque…, después seguiría con…, y acordate de…". ' +
      'Primero lo que vence o ya venció, después lo de hoy, y al final lo que conviene adelantar de la semana y del mes. Si algo se puede hacer junto, decímelo. Nada de listas larguísimas: máximo 8 puntos.' +
      bloque('Para hoy', hoyL) + bloque('Atrasado', venc) + bloque('Reportes por cargar', reps) + bloque('Inputs sin procesar', inps) + bloque('Lo que queda de la semana', sem) + bloque('Lo que queda del mes', mes) + bloque('Fechas que se vienen (30 días)', fechas) +
      bloque('Alertas del panel', sugerencias().map(s => '- ' + limpio(s.h)));
  }
  // al entrar, una vez por día: "¿Querés que Claude te ayude a ordenar tu día?" (pedido de Joaquín, 20/10/2026)
  function popDia() {
    const hoyK = NOW.getFullYear() + '-' + (NOW.getMonth() + 1) + '-' + NOW.getDate();
    if (LS.get('popdia', '') === hoyK || $('.modal')) return;
    LS.set('popdia', hoyK);
    const m = modal('<h3>¿Querés que Claude te ayude a ordenar tu día?</h3><p>Le paso todo lo que tenés pendiente hoy, en la semana y en el mes, y te dice por dónde arrancar, qué sigue y de qué no olvidarte. Se abre en tu Claude.</p><div class="err"></div>' +
      '<div class="acts"><button class="btn ghost" data-x>Ahora no</button><button class="btn y" data-ok>Sí, ordenámelo</button></div>', async () => { abrirClaude(promptPlan()); });
  }
  // Abre claude.ai en el navegador de quien usa el panel (su propia cuenta). "Copiar" sirve para pegarlo en un chat o en la app que ya tenga abierta.
  const btnClaude = id => '<button class="btn" data-claude="' + esc(id) + '" title="Abre tu Claude con la consulta escrita"><span style="color:var(--y)">✦</span> Preguntale a Claude</button><button class="btn ghost" data-copiar="' + esc(id) + '" title="Copia la consulta para pegarla en tu Claude">Copiar</button>';
  function copiar(txt, msg) {
    const ok = () => toast(msg || 'Consulta copiada. Pegala en tu Claude con Ctrl+V.');
    try { navigator.clipboard.writeText(txt).then(ok, () => { fallbackCopiar(txt); ok(); }); } catch (e) { fallbackCopiar(txt); ok(); }
  }
  function fallbackCopiar(txt) { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); }

  /* ---------------- vista INPUTS ---------------- */
  function cardInput(c) {
    const p = inputPide(c), m = marca(c.m[0]);
    const lec = c.ia || ideaRapida(c);
    const ia = '<div class="ia' + (lec.auto ? ' auto' : '') + '"><div class="t" data-k="' + (lec.auto ? 'Idea rápida' : 'IA') + '">' + esc(lec.titular) + '</div><ol>' + (lec.acciones || []).map(a => '<li><span>' + esc(a.que) + '<span class="f">' + esc(a.formato) + '</span></span></li>').join('') + '</ol>' + ((lec.pedir || []).length ? '<div class="pd"><b>Pedile al cliente o al project:</b> ' + lec.pedir.map(esc).join(' · ') + '</div>' : '') + (lec.auto ? '<div class="pd" style="margin-top:8px">Para una idea a medida, tocá <b>Preguntale a Claude</b>.</div>' : '') + '</div>';
    const st = c.estado ? '<span class="state">' + (c.estado.estado === 'recordar' ? 'Pospuesto hasta el ' + corto(new Date(c.estado.detalle)) + ' ' + hm(new Date(c.estado.detalle)) : ({ procesado: 'Lo procesaste', project: 'Hablaste con el project', hecho: 'Hecho' }[c.estado.estado] || c.estado.estado) + ' ' + hace(c.estado.fecha)) + (/tarjeta creada: (\S+)/.test(c.estado.detalle || '') ? ' · <a href="' + esc(/tarjeta creada: (\S+)/.exec(c.estado.detalle)[1]) + '" target="_blank" rel="noopener" style="color:var(--y)">ver tarjeta ↗</a>' : '') + '</span>' : '<span class="state">Sin tocar · cargado ' + hace(c.act) + '</span>';
    return '<article class="cardx" id="in-' + esc(c.id) + '"><div class="hd"><div><div class="mt" style="font-size:12.5px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap">' + tagM(c.m[0]) + '<span>' + esc(c.lista) + '</span>' + (c.due ? '<span>para ' + cuando(new Date(c.due)) + '</span>' : '') + (c.ia ? '<span class="pill ' + (c.ia.prioridad === 'alta' ? 'bad' : c.ia.prioridad === 'media' ? 'warn' : '') + '">prioridad ' + esc(c.ia.prioridad) + '</span>' : '') + '</div><h4>' + esc(c.n) + '</h4></div><a class="go" href="' + esc(c.url) + '" target="_blank" rel="noopener" title="Abrir en Trello">' + I.out + '</a></div>' +
      (c.d ? '<div class="ds">' + escL(c.d) + '</div>' : '') +
      (c.att.length ? '<div class="att">' + c.att.map(a => '<a href="' + esc(a.u) + '" target="_blank" rel="noopener">' + I.clip + esc(a.n) + '</a>').join('') + '</div>' : '') + ia +
      (p ? '<div class="nudge"><div class="nq"><b>' + (p === 'nuevo' ? 'Input nuevo.' : p === 'pospuesto' ? 'Te pediste acordarte de esto.' : 'Hace unos días que no lo tocás.') + '</b> ¿Ya lo procesaste?</div>' +
        '<div class="nb"><button class="btn' + (S.todavia === c.id ? '' : ' y') + '" data-inp="procesado" data-id="' + esc(c.id) + '">' + I.check + 'Sí, ya está</button><button class="btn' + (S.todavia === c.id ? ' y' : '') + '" data-todavia="' + esc(c.id) + '">Todavía no</button></div>' +
        (S.todavia === c.id ? '<div class="nb no"><span>Dejalo listo ahora o te lo recuerdo:</span><button class="btn y" data-crear="' + esc(c.id) + '">＋ Crear la tarjeta</button><button class="btn" data-recordar="2h" data-id="' + esc(c.id) + '">⏰ En 2 h</button><button class="btn" data-recordar="manana" data-id="' + esc(c.id) + '">Mañana 9 h</button><button class="btn" data-recordar="lunes" data-id="' + esc(c.id) + '">El lunes</button></div>' : '') + '</div>' : '') +
      '<div class="ft">' + (/foto/i.test(c.n + ' ' + (c.d || '')) && (marca(c.m[0]) || {}).driveFotos ? '<a class="btn" href="' + esc(marca(c.m[0]).driveFotos) + '" target="_blank" rel="noopener">' + I.folder + ' Drive de fotos</a>' : '') + '<button class="btn" data-crear="' + esc(c.id) + '">＋ Crear tarjeta</button><button class="btn" data-mover="' + esc(c.id) + '">Mover</button><button class="btn" data-inp="project" data-id="' + esc(c.id) + '">' + I.msg + 'Hablé con el project</button><button class="btn danger" data-archivar="' + esc(c.id) + '">' + I.archive + 'Ya no lo necesito</button>' + btnClaude(c.id) + '<span class="sp"></span>' + st + '</div></article>';
  }
  /* Inputs en formato compacto: una línea cada uno, 3 acciones rápidas y el detalle completo al tocar el título. */
  function filaInput(c) {
    const p = inputPide(c), m = marca(c.m[0]) || { nombre: '' };
    const pri = c.ia && c.ia.prioridad === 'alta' ? '<span class="pill bad">urgente</span>' : '';
    const etiqueta = p === 'nuevo' ? '<span class="pill y">nuevo</span>' : p === 'pospuesto' ? '<span class="pill warn">te pediste acordarte</span>' : p === 'recordar' ? '<span class="pill">¿lo seguís necesitando?</span>' : '';
    const est = c.estado && !p ? (c.estado.estado === 'recordar' ? 'vuelve ' + cuando(new Date(c.estado.detalle)) + ' ' + hm(new Date(c.estado.detalle)) : ({ procesado: 'procesado', project: 'hablado con el project', hecho: 'hecho' }[c.estado.estado] || c.estado.estado) + ' ' + hace(c.estado.fecha)) : 'llegó ' + hace(c.act);
    const acciones = S.reloj === c.id
      ? '<div class="ia-acts"><span class="k">Recordame:</span><button class="btn" data-recordar="2h" data-id="' + esc(c.id) + '">en 2 h</button><button class="btn" data-recordar="manana" data-id="' + esc(c.id) + '">mañana 9 h</button><button class="btn" data-recordar="lunes" data-id="' + esc(c.id) + '">el lunes</button><button class="btn ghost" data-reloj="">✕</button></div>'
      : '<div class="ia-acts">' + (p ? '<button class="btn y" data-inp="procesado" data-id="' + esc(c.id) + '" title="Ya lo procesé">✓ Listo</button><button class="btn" data-reloj="' + esc(c.id) + '" title="Recordámelo más tarde">⏰</button>' : '') +
        '<button class="btn" data-crear="' + esc(c.id) + '" title="Crear la tarjeta en Trello">＋ Tarjeta</button></div>';
    return '<div class="irow' + (p ? '' : ' visto') + '" id="in-' + esc(c.id) + '"><i class="ibar" style="background:' + color(c.m[0]) + '"></i>' +
      '<div class="ibody"><button class="lnk it" data-det-input="' + esc(c.id) + '">' + esc(c.n) + '</button>' +
      '<div class="mt"><span class="tag">' + esc(m.nombre) + '</span>' + etiqueta + pri + '<span>' + est + '</span>' + (c.att && c.att.length ? '<span>' + I.clip + ' ' + c.att.length + '</span>' : '') + (c.d ? '<span class="desc">' + esc(resumenTxt(c.d, 160)) + '</span>' : '') + '</div></div>' + acciones + '</div>';
  }
  function detalleInput(c) {
    panelLateral(esc(c.n), cardInput(c).replace('<article class="cardx"', '<article class="cardx en-panel"'));
    const p = $('#drawer');
    // al resolverlo desde el panel lateral, se cierra solo
    p.addEventListener('click', e => { if (e.target.closest('[data-inp],[data-recordar],[data-archivar],[data-crear],[data-mover]')) setTimeout(cerrarPanel, 30); });
  }
  // card plegable: título, cuántas cosas tiene, alerta (urgentes/nuevos) y el contenido solo si está abierta
  function tarjeta(id, titulo, n, alerta, abiertaDef, cuerpoFn, ico, punto) {
    const abierta = S.abiertos[id] != null ? S.abiertos[id] : abiertaDef;
    return '<div class="mcar' + (abierta ? ' on' : '') + '"><button class="mcar-h" data-mcar="' + esc(id) + '" data-abierta="' + (abierta ? 1 : 0) + '">' +
      (punto ? '<span class="dotm" style="background:' + punto + '"></span>' : ico ? '<span class="mcar-ic">' + ico + '</span>' : '') +
      '<b>' + titulo + '</b><small>' + n + '</small>' + (alerta ? '<em>' + alerta + '</em>' : '') + '<i>' + (abierta ? '−' : '+') + '</i></button>' +
      (abierta ? '<div class="list">' + cuerpoFn() + '</div>' : '') + '</div>';
  }
  // agrupa por marca en cards; abre sola la primera que tenga algo para mirar (o si hay una sola marca)
  function cardsPorMarca(id, L, filaFn, alertaFn) {
    const g = {}; L.forEach(c => { const s = (c.m ? c.m[0] : c.marca) || ''; (g[s] = g[s] || []).push(c); });
    const ks = Object.keys(g).sort((a, b) => (alertaFn ? g[b].filter(alertaFn).length - g[a].filter(alertaFn).length : 0) || g[b].length - g[a].length);
    let abrio = false;
    return ks.map(s => {
      const n = alertaFn ? g[s].filter(alertaFn).length : 0, def = ks.length === 1 || (!abrio && n > 0); if (def) abrio = true;
      return tarjeta(id + ':' + (s || 'general'), s ? esc((marca(s) || {}).nombre || s) : 'General', g[s].length, n ? n + (n === 1 ? ' nuevo' : ' nuevos') : '', def, () => g[s].map(filaFn).join(''), null, s ? color(s) : 'var(--dim)');
    }).join('');
  }
  function vInputs() {
    const pri = c => ({ alta: 3, media: 2, baja: 1 })[c.ia && c.ia.prioridad] || 2;
    const L = inputs().filter(c => pasa(c.m)).sort((a, b) => (!!inputPide(b) - !!inputPide(a)) || (pri(b) - pri(a)) || (new Date(b.act) - new Date(a.act)));
    const pend = L.filter(c => inputPide(c)), posp = L.filter(c => !inputPide(c) && c.estado && c.estado.estado === 'recordar'), resto = L.filter(c => !inputPide(c) && !(c.estado && c.estado.estado === 'recordar'));
    const brains = S.data.cards.filter(c => c.cat === 'brainstorming' && pasa(c.m));
    const mover = S.data.cards.filter(c => c.cat === 'mover' && pasa(c.m));
    const nNuevos = pend.filter(c => inputPide(c) === 'nuevo').length;
    const plegable = (id, titulo, n, cuerpo) => '<div class="sec"><button class="pliegue' + (S.abiertos[id] ? ' on' : '') + '" data-pliegue="' + id + '"><span>' + titulo + '<small>' + n + '</small></span><i>' + (S.abiertos[id] ? '−' : '+') + '</i></button>' + (S.abiertos[id] ? '<div class="ilist">' + cuerpo + '</div>' : '') + '</div>';
    return '<div class="iresumen"><div><b>' + pend.length + '</b><span>para revisar' + (nNuevos ? ' · ' + nNuevos + (nNuevos === 1 ? ' nuevo' : ' nuevos') : '') + '</span></div><div><b>' + posp.length + '</b><span>pospuestos</span></div><div><b>' + resto.length + '</b><span>ya revisados</span></div><button class="btn" data-crear-nueva>＋ Nueva tarjeta</button></div>' +
      '<div class="sec">' + (pend.length ? cardsPorMarca('in', pend, filaInput, c => inputPide(c) === 'nuevo') + '<p class="ayuda">Tocá el título para ver todo el input, la idea y más opciones (mover, hablar con el project, archivar, Claude).</p>' : '<div class="empty">Nada para revisar. Cuando el project cargue un input en Trello aparece acá.</div>') + '</div>' +
      (posp.length ? plegable('posp', 'Pospuestos', posp.length, posp.sort((a, b) => a.estado.detalle.localeCompare(b.estado.detalle)).map(filaInput).join('')) : '') +
      (mover.length ? plegable('mover', 'Para mover en el mes', mover.length, '<p class="ayuda" style="margin:0 0 8px">Lo que sacaste de Inputs porque lo seguís usando durante el mes. No pide revisión; cuando ya no sirva, archivalo en Trello.</p>' + mover.map(c => '<div class="irow visto"><i class="ibar" style="background:' + color(c.m[0]) + '"></i><div class="ibody"><button class="lnk it" data-card-det="' + esc(c.id) + '">' + esc(c.n) + '</button><div class="mt"><span class="tag">' + esc((marca(c.m[0]) || {}).nombre || '') + '</span><a class="lnk" href="' + esc(c.url) + '" target="_blank" rel="noopener">Trello ↗</a></div></div></div>').join('')) : '') +
      (resto.length ? plegable('rev', 'Ya revisados', resto.length, resto.map(filaInput).join('')) : '') +
      (brains.length ? plegable('brain', 'Brainstorming y campañas', brains.length, brains.map(c => '<div class="irow visto"><i class="ibar" style="background:' + color(c.m[0]) + '"></i><div class="ibody"><button class="lnk it" data-card-det="' + esc(c.id) + '">' + esc(c.n) + '</button><div class="mt"><span class="tag">' + esc((marca(c.m[0]) || {}).nombre || '') + '</span><span>' + esc(c.lista) + '</span></div></div><div class="ia-acts">' + btnClaude(c.id).split('</button>')[0] + '</button></div></div>').join('') + '<p class="ayuda"><a href="' + esc(S.data.links.brainstorming) + '" target="_blank" rel="noopener">Abrir la web de brainstorming ↗</a></p>') : '');
  }

  /* ---------------- vista REUNIONES ---------------- */
  function vReuniones() {
    const D = S.data, L = D.reuniones.filter(r => pasa(r.marca || S.marca));
    const pend = L.filter(r => !hecho(r)).sort((a, b) => (b.vencida - a.vencida) || (a.hasta - b.hasta));
    const ok = L.filter(hecho).sort((a, b) => String(a.estado.detalle || '').localeCompare(String(b.estado.detalle || '')));
    const row = r => {
      const ag = hecho(r), det = r.estado && r.estado.detalle ? r.estado.detalle : '';
      const d = det ? ymdD(det.slice(0, 10)) : null;
      return '<div class="row reu"><span class="ico">' + I.users + '</span><div><div class="tt">' + esc(r.nombre) + '</div><div class="mt">' + tagM(r.marca) + '<span>con ' + esc(r.con) + '</span><span>' + (ag ? 'agendada ' + hace(r.estado.fecha || '') : r.vencida ? '<span class="pill bad">se pasó: tenía que ser hasta el ' + r.hasta + '</span>' : 'hasta el ' + r.hasta) + '</span></div></div>' +
        '<div>' + (ag ? '<div class="when">' + (d ? corto(d) : '') + '<small>' + esc(det.slice(11, 16)) + (/evento creado/.test(det) ? ' · en calendario' : '') + '</small></div>' : '<button class="btn y" data-agendar="' + esc(r.clave) + '">' + I.cal + 'Ponerle fecha</button>') + '</div></div>';
    };
    // v6 (22/10/2026): Reuniones es una pestaña con lo que viene (calendario y brainstormings), lo que falta agendar y lo agendado
    const prox = (D.eventos || []).filter(e => { const n = diasA(new Date(e.s)); return n >= 0 && n <= 14 && pasa(e.marcas && e.marcas.length ? e.marcas : [S.marca]); })
      .map(e => ({ d: new Date(e.s), dia: e.dia, t: e.t, m: (e.marcas || [])[0] || '', tipo: /brainstorm/i.test(e.t) ? 'Brainstorming' : 'Calendario' }))
      .concat((D.cards || []).filter(c => c.cat === 'brainstorming' && c.due && diasA(new Date(c.due)) >= 0 && pasa(c.m)).map(c => ({ d: new Date(c.due), dia: true, t: c.n, m: c.m[0], tipo: 'Brainstorming', url: c.url })))
      .sort((a, b) => a.d - b.d);
    const filaP = x => '<div class="row"><div class="when wl"><b>' + (diasA(x.d) === 0 ? 'Hoy' : diasA(x.d) === 1 ? 'Mañana' : DIAS[x.d.getDay()] + ' ' + x.d.getDate()) + '</b><small>' + (x.dia ? 'todo el día' : hm(x.d)) + '</small></div><div><div class="tt">' + (x.url ? '<a class="lnk" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.t) + '</a>' : esc(x.t)) + '</div><div class="mt">' + (x.m ? tagM(x.m) : '') + '<span class="pill' + (x.tipo === 'Brainstorming' ? ' y' : '') + '">' + x.tipo + '</span></div></div></div>';
    const todas = S.abiertos['reu:todas'], verP = todas ? prox : prox.slice(0, 5);
    return '<div class="sec"><div class="sec-h"><h2>Próximas<small>' + prox.length + '</small></h2></div>' + (prox.length ? '<div class="list">' + verP.map(filaP).join('') + '</div>' + (prox.length > 5 ? '<button class="mas-btn" data-mcar="reu:todas" data-abierta="' + (todas ? 1 : 0) + '">' + (todas ? 'Ver menos' : 'Ver las ' + prox.length) + '</button>' : '') : '<div class="empty">Nada en el calendario en las próximas dos semanas.</div>') + '</div>' +
      '<div class="sec"><div class="sec-h"><h2>Por agendar<small>' + pend.length + '</small></h2></div>' + (pend.length ? '<div class="list">' + pend.map(row).join('') + '</div>' : '<div class="empty">Todas las reuniones del mes tienen fecha.</div>') + '</div>' +
      '<div class="sec"><div class="sec-h"><h2>Agendadas<small>' + ok.length + '</small></h2></div>' + (ok.length ? '<div class="list">' + ok.map(row).join('') + '</div>' : '<div class="empty">Todavía no agendaste ninguna este mes.</div>') + '</div>' +
      '<p class="ayuda">Ads: última semana del mes · mensual con el cliente y entrega de reportes: primeros 10 días. Al ponerle fecha, el project la ve y se crea el evento en el calendario del equipo.</p>';
  }

  /* ---------------- EQUIPO (social media y CM, 22/10/2026) ----------------
     Qué tiene el resto del equipo con mis marcas: cuándo y con quién graba Bauti, y qué entregan Diseño y Producción y para cuándo.
     Sirve para pedirles algo a tiempo o tener en cuenta sus tiempos. */
  const ETAPA_TXT = { pendiente: ['por entregar', ''], revision: ['en revisión', 'y'], corr: ['a corregir', 'warn'] };
  /* ---------------- CM · Programar (26/10/2026) ----------------
     Lo que sale hoy y mañana en las marcas de Ale, por hora, separado en programable y a mano (no programable).
     "Ya lo programé" pasa la tarjeta del CM a Programado; "Ya lo publiqué", a Publicado. Las dos se pueden deshacer. */
  const CM_EST = { filtro: ['en Filtro', 'warn'], listo: ['para programar', 'y'], mano: ['a mano', ''], dia: ['para hoy, a mano', ''], programado: ['programado', 'ok'], publicado: ['publicado', 'ok'] };
  const CM_FMT = { historia: ['Historia', 'story'], carrusel: ['Carrusel', 'grid'], reel: ['Reel', 'reel'], 'publicación': ['Publicación', 'cam'] };
  const esCMyo = () => !!(S.data && S.data.cmDia);
  function datosCM() {
    const L = (S.data.cmDia || []).filter(c => pasa(c.m)), hoyS = ymdL(NOW), manS = ymdL(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1));
    const dia = c => ymdL(new Date(c.due)), hecho = c => c.estado === 'programado' || c.estado === 'publicado';
    return { L, hecho, atras: L.filter(c => dia(c) < hoyS && !hecho(c)), hoy: L.filter(c => dia(c) === hoyS), man: L.filter(c => dia(c) === manS) };
  }
  function vCmDia() {
    const Dc = datosCM(), cual = S.cmDia || (Dc.atras.length ? 'atras' : 'hoy');
    const L = cual === 'atras' ? Dc.atras : cual === 'man' ? Dc.man : Dc.hoy;
    const nFalta = l => l.filter(c => !Dc.hecho(c)).length;
    const seg = '<div class="seg cm-seg" role="tablist">' + (Dc.atras.length ? '<button class="' + (cual === 'atras' ? 'on' : '') + '" data-cmdia="atras">Atrasadas<em class="rojo">' + Dc.atras.length + '</em></button>' : '') +
      '<button class="' + (cual === 'hoy' ? 'on' : '') + '" data-cmdia="hoy">Hoy<em>' + nFalta(Dc.hoy) + '</em></button><button class="' + (cual === 'man' ? 'on' : '') + '" data-cmdia="man">Mañana<em>' + nFalta(Dc.man) + '</em></button></div>';
    const fila = c => {
      const d = new Date(c.due), f = CM_FMT[c.formato] || CM_FMT['publicación'], e = CM_EST[c.estado] || [c.lista, ''], ok = Dc.hecho(c), pasada = !ok && d < NOW;
      const accion = ok ? '<button class="btn ghost cm-b" data-cmvolver="' + esc(c.id) + '" title="Deshacer">✓ ' + e[0] + '</button>'
        : c.prog ? (c.auto ? '<button class="btn ghost cm-b cm-au" data-cmauto="' + esc(c.id) + '">⚡ Que salga sola</button>' : '') + '<button class="btn y cm-b" data-cmop="programado" data-cm="' + esc(c.id) + '">Ya lo programé</button>'
        : '<button class="btn y cm-b" data-cmop="publicado" data-cm="' + esc(c.id) + '">Ya lo publiqué</button>';
      return '<div class="row cm-r' + (ok ? ' cm-ok' : '') + (pasada ? ' cm-tarde' : '') + '"><div class="when wl"><b>' + hm(d) + '</b><small>' + (cual === 'atras' ? corto(d) : pasada ? 'ya pasó' : f[0]) + '</small></div>' +
        '<div><div class="tt">' + (c.ourl ? '<a class="lnk" href="' + esc(c.ourl) + '" target="_blank" rel="noopener">' + esc(c.n) + '</a>' : esc(c.n)) + '</div>' +
        '<div class="mt">' + tagM(c.m) + '<span class="pill">' + (I[f[1]] || '') + ' ' + f[0] + '</span>' + (ok ? '' : '<span class="pill ' + e[1] + '">' + e[0] + '</span>') +
        '<a class="cm-tr" href="' + esc(c.url) + '" target="_blank" rel="noopener">tarjeta del CM ↗</a></div></div><div>' + accion + '</div></div>';
    };
    const sec = (t, l, vacio, nota) => '<div class="sec"><div class="sec-h"><h2>' + t + '<small>' + nFalta(l) + (l.length !== nFalta(l) ? ' de ' + l.length : '') + '</small></h2></div>' +
      (nota ? '<p class="ayuda cm-nota">' + nota + '</p>' : '') + (l.length ? '<div class="list">' + l.map(fila).join('') + '</div>' : '<div class="empty">' + vacio + '</div>') + '</div>';
    const prog = L.filter(c => c.prog), mano = L.filter(c => !c.prog);
    const cuando = cual === 'atras' ? 'tenían que salir y no están programadas ni publicadas' : cual === 'man' ? 'para mañana' : 'para hoy';
    return seg + '<div class="cm-cols">' +
      sec('Programables', prog, 'Nada programable ' + cuando + '.', 'Se programan en Meta. Cuando lo hagas, tocá <b>Ya lo programé</b> y la tarjeta pasa a Programado.') +
      sec('A mano', mano, 'Nada para publicar a mano ' + cuando + '.', 'No se pueden programar (historias con stickers, encuestas, colabs…): se publican en el momento. Después tocá <b>Ya lo publiqué</b>.') +
      '</div>';
  }
  // publicación automática (prueba con Skilful Black): muestra qué se publicaría, cuándo y qué falta; si está todo, queda en cola y sale sola
  async function cmAutoVer(id) {
    const c = (S.data.cmDia || []).find(x => x.id === id); if (!c) return;
    const m = hoja('Publicar sola · ' + ((marca(c.m) || {}).nombre || c.m), '<div class="au"><p class="ay-t">Leyendo la tarjeta del SCL…</p></div>');
    let p;
    try {
      p = DEMO ? { ok: true, tipo: 'historias', titulo: c.n, items: [{ n: 'Historia 1', cuando: c.due, archivos: [{ n: 'H1.jpg', tipo: 'imagen' }], copy: '' }, { n: 'Historia 2', cuando: new Date(new Date(c.due).getTime() + 6 * 36e5).toISOString(), archivos: [], copy: '' }], faltas: ['falta el archivo de la historia 2 (adjuntalo como H2)'], listo: false, conMeta: false }
        : await get({ action: 'cmAuto', card: id, p: S.persona, k: S.key || S.pkey });
      if (p.error) throw new Error(p.mensaje || p.error);
    } catch (e) { $('.au', m).innerHTML = '<p class="ay-t">✗ ' + esc(e.message || 'No pude leer la tarjeta') + '</p>'; return; }
    const hora = s => { if (!s) return 'sin hora'; const d = new Date(s); return (ymdL(d) === ymdL(NOW) ? 'hoy' : corto(d)) + ' ' + hm(d); };
    const items = p.items.map(i => '<div class="au-i"><div class="au-h"><b>' + esc(i.n) + '</b><span>' + hora(i.cuando) + '</span></div>' +
      '<div class="au-f">' + (i.archivos.length ? i.archivos.map(a => '<span class="pill">' + (a.tipo === 'video' ? I.reel : I.cam) + ' ' + esc(a.n) + '</span>').join('') : '<span class="pill bad">sin archivo</span>') + '</div>' +
      (i.copy ? '<p class="au-c">' + escL(i.copy.slice(0, 600)) + (i.copy.length > 600 ? ' (sigue)' : '') + '</p>' : '') + '</div>').join('');
    const ensayo = p.modo !== 'real';
    const modo = ensayo ? '<div class="au-ens"><b>🧪 Modo ensayo:</b> no se publica nada. A la hora indicada te llega un Discord con lo que <i>hubiera</i> publicado (cuenta, archivo y copy). <b>Programala en Meta como siempre</b>: el ensayo es para comprobar que acierta.</div>' : '';
    const estado = p.enCola ? '<div class="au-ok">✓ Está en la cola. ' + (ensayo ? 'A la hora te aviso qué hubiera publicado.' : 'Se publica sola a la hora en @' + esc(p.cuenta || '') + '.') + ' Si cambia algo de la tarjeta no se publica y te aviso.</div>'
      : p.faltas.length ? '<div class="au-falta"><b>Para que salga sola falta:</b><ul>' + p.faltas.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul></div>'
      : !ensayo && !p.conMeta ? '<div class="au-falta"><b>Está todo listo</b>, pero todavía no está conectado Instagram (lo hace Joaquín). Mientras tanto, programala en Meta como siempre.</div>'
      : '<div class="au-ok">✓ Está todo. ' + (ensayo ? 'Dejala en ensayo y a la hora te aviso qué hubiera publicado.' : 'Se publica sola en @' + esc(p.cuenta || '') + ' a la hora indicada y te aviso por Discord.') + '</div>';
    $('.au', m).innerHTML = modo + '<p class="ay-t">Lo que se publicaría' + (p.cuenta ? ' en <b>@' + esc(p.cuenta) + '</b>' : '') + ', sacado de la tarjeta del SCL (<b>' + esc(p.tipo) + '</b>):</p>' + items + estado +
      '<div class="err"></div><div class="acts">' + (p.enCola ? '<button class="btn ghost" data-auq="cancelar">Sacar de la cola</button>' : '<button class="btn y" data-auq="programar"' + (p.listo && (ensayo || p.conMeta) ? '' : ' disabled') + '>' + (ensayo ? 'Ensayar (no publica nada)' : 'Que salga sola') + '</button>') + '</div>';
    m.querySelectorAll('[data-auq]').forEach(b => b.onclick = async () => {
      b.disabled = true; $('.err', m).textContent = '';
      try { const r = await post({ action: 'cmAuto', op: b.dataset.auq, cardId: id }); m.remove(); toast(b.dataset.auq === 'cancelar' ? '✓ Salió de la cola' : ensayo ? '✓ En ensayo: a la hora te aviso por Discord qué hubiera publicado' : '✓ Queda en cola: se publica sola (' + (r.items || 1) + ')'); }
      catch (e) { $('.err', m).textContent = e.message; b.disabled = false; }
    });
  }

  async function cmHacer(id, op, listaId) {
    const c = (S.data.cmDia || []).find(x => x.id === id); if (!c) return;
    const antes = { lista: c.lista, estado: c.estado };
    if (op !== 'volver') { c.estado = op; c.lista = op === 'programado' ? 'Programado' : 'Publicado'; }
    render();
    try {
      const r = await post({ action: 'cmAccion', cardId: id, op: op, listaId: listaId || '', a: c.prog ? 'listo' : 'mano' });
      if (r.lista) { c.lista = r.lista; c.estado = r.estado; } else if (op === 'volver') { c.estado = c.prog ? 'listo' : 'mano'; c.lista = c.prog ? 'Listo para programar' : 'Contenido no programable'; }
      if (op !== 'volver') { c.previaId = r.previaId; toast('✓ "' + esc(c.n.slice(0, 40)) + '" pasó a ' + esc(c.lista), r.previaId ? () => cmHacer(id, 'volver', r.previaId) : null); }
      try { localStorage.setItem('pi:cache:' + S.persona, JSON.stringify(S.data)); } catch (e) {}
      render();
    } catch (e) { Object.assign(c, antes); render(); toast('✗ ' + esc(e.message || 'No se pudo')); }
  }

  function vEquipoSM() {
    const D = S.data, P = ((D.prodsEq || {}).items || []).filter(x => pasa(x.marca)), E = (D.entregas || []).filter(c => pasa(c.m));
    const TIPO = { reel: 'Reel', historias: 'Historias', presencial: 'Presencial', otro: 'Otro' };
    const dia = f => { const d = ymdD(f); return diasA(d) === 0 ? 'Hoy' : diasA(d) === 1 ? 'Mañana' : DIAS[d.getDay()] + ' ' + d.getDate(); };
    const filaProd = x => '<div class="row"><div class="when wl"><b>' + dia(x.fecha) + '</b><small>' + esc(x.hora) + '</small></div><div><div class="tt">' + esc(x.que) + '</div><div class="mt">' + tagM(x.marca) + '<span class="pill">' + (TIPO[x.tipo] || 'Otro') + '</span><span>' + esc(x.nombre || '') + (x.conQuien ? ' con ' + esc(x.conQuien) : '') + '</span>' + (x.estado === 'hecho' ? '<span class="pill ok">hecha</span>' : '') + '</div></div></div>';
    const filaE = c => { const r = c.due ? new Date(c.due) : null, s = c.salida ? new Date(c.salida) : null, et = ETAPA_TXT[c.etapa] || [c.etapa || '', ''], tarde = r && diasA(r) < 0 && c.etapa === 'pendiente';
      return '<div class="row"><div class="when wl"><b>' + (r ? (diasA(r) === 0 ? 'Hoy' : diasA(r) === 1 ? 'Mañana' : DIAS[r.getDay()] + ' ' + r.getDate()) : '—') + '</b><small>' + (r ? 'entrega' : 'sin fecha') + '</small></div><div><div class="tt"><a class="lnk" href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.n) + '</a></div><div class="mt">' + tagM(c.m) + '<span class="pill ' + (tarde ? 'bad' : et[1]) + '">' + (tarde ? 'atrasada' : et[0]) + '</span>' + (s ? '<span>sale ' + dm(s) + '</span>' : '') + '</div></div></div>'; };
    const dis = E.filter(c => c.tipo === 'diseno'), vid = E.filter(c => c.tipo !== 'diseno');
    const sec = (t, L, f, vacio) => '<div class="sec"><div class="sec-h"><h2>' + t + '<small>' + L.length + '</small></h2></div>' + (L.length ? '<div class="list">' + L.map(f).join('') + '</div>' : '<div class="empty">' + vacio + '</div>') + '</div>';
    return sec('Grabaciones', P, filaProd, 'Bauti todavía no anotó grabaciones de tus marcas.') +
      sec('Diseño', dis, filaE, 'Nada pendiente de diseño en tus marcas.') +
      sec('Video', vid, filaE, 'Nada pendiente de edición en tus marcas.') +
      '<p class="ayuda">Si necesitás algo para una grabación (un producto, un guion, alguien que actúe), avisale con tiempo. Las fechas de entrega salen de Trello.</p>';
  }

  /* ---------------- vista SEMANA: checklist de la semana ---------------- */
  function vSemana() {
    const D = S.data, si = D.semanaInfo, er = D.estRut || (D.estRut = {});
    if (!si) return '<div class="empty">Tocá ↻ Actualizar para ver el checklist de la semana.</div>';
    const hoyY = D.hoy || '';
    const marcasV = D.marcas.filter(m => pasa(m.slug));
    const ok = k => !!(er[k] && er[k].estado === 'hecho');
    let total = 0, hechos = 0;
    const celda = (k, futuro) => { if (!futuro) { total++; if (ok(k)) hechos++; } return '<button class="cel' + (ok(k) ? ' on' : '') + (futuro ? ' fut' : '') + '" ' + (futuro ? 'disabled' : 'data-celda="' + esc(k) + '"') + '>' + (ok(k) ? '✓' : '') + '</button>'; };
    const mesActual = NOW.getMonth() + 1;
    const aplicaMes = c => { const mm = /^meses:([\d,]+)\//.exec(c); return !mm || mm[1].split(',').map(Number).indexOf(mesActual) >= 0; };
    const diarias = (D.rutinasDef || []).filter(r => r.cuando === 'diaria' || /^dias:/.test(r.cuando));
    const DSEM = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
    const diasRegla = r => r.cuando === 'diaria' ? [1, 2, 3, 4, 5] : r.cuando.slice(5).split(',').map(x => DSEM[x.trim().slice(0, 3)]);
    const conSab = diarias.some(r => diasRegla(r).indexOf(6) >= 0);
    const cols = si.dias.slice(0, conSab ? 6 : 5);
    const semanales = (D.rutinasDef || []).filter(r => /^semana:/.test(r.cuando));
    const mensuales = (D.rutinasDef || []).filter(r => /^(mes|meses):/.test(r.cuando) && aplicaMes(r.cuando));
    const DN = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const tablaDias = diarias.length ? '<div class="tw"><table class="chk-t"><thead><tr><th></th>' + cols.map((d, i) => '<th' + (d === hoyY ? ' class="hoy"' : '') + '>' + DN[i] + ' ' + Number(d.slice(8)) + '</th>').join('') + '</tr></thead><tbody>' +
      diarias.map(r => (r.marcas.length ? r.marcas.filter(s => pasa(s)) : ['-']).map(s => '<tr><td>' + esc(r.tarea) + (s !== '-' ? ' ' + tagM(s) : '') + (r.cuando !== 'diaria' ? '<small>' + esc(r.cuando.slice(5).replace(/,/g, ' y ')) + '</small>' : '') + '</td>' + cols.map((d, i) => '<td>' + (diasRegla(r).indexOf(i + 1) >= 0 ? celda('rut:' + r.id + ':' + s + ':' + d, d > hoyY) : '<span class="na">·</span>') + '</td>').join('') + '</tr>').join('')).join('') + '</tbody></table></div>' : '';
    // cuándo toca cada rutina, en castellano (antes salía "del mes: ultima-semana", "desde el vie")
    const DIAN = { lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves', vie: 'viernes', sab: 'sábado', dom: 'domingo' };
    const cuandoTxt = c => {
      c = String(c || ''); let m;
      if ((m = /^semana:(\w+)/.exec(c))) return 'desde el ' + (DIAN[m[1]] || m[1]);
      if ((m = /^(?:mes|meses:[\d,]+\/?):?(.*)$/.exec(c))) {
        const v = m[1].replace(/^:/, ''), r2 = /^(\d+)-(\d+)$/.exec(v);
        if (/ultima/.test(v)) return 'la última semana del mes';
        if (v === '1-31') return 'en cualquier momento del mes';
        return r2 ? 'del ' + r2[1] + ' al ' + r2[2] + ' del mes' : v;
      }
      return c;
    };
    // fila: título, cuándo y (si hay) una línea de acciones debajo; los casilleros siempre centrados en su columna
    const tablaMarcas = (defs, per) => defs.length ? '<div class="tw"><table class="chk-t"><thead><tr><th></th>' + marcasV.map(m => '<th><i class="dotm" style="background:' + color(m.slug) + '"></i>' + esc(m.nombre) + '</th>').join('') + '</tr></thead><tbody>' +
      defs.map(r => {
        const acc = (/^anotar:/.test(enlaceDe(r)) ? botonEnlace(enlaceDe(r), r.marcas) : '') + (r.id === 'trimestral-check' && entregaTrim() ? '<span class="pill warn">entrega ' + dm(new Date(entregaTrim().vence)) + '</span>' : '');
        return '<tr><td><span class="rt-t">' + esc(r.tarea) + '</span><small>' + esc(cuandoTxt(r.cuando)) + '</small>' + (acc ? '<div class="rt-acc">' + acc + '</div>' : '') + '</td>' +
          (r.marcas.length ? marcasV.map(m => '<td>' + (r.marcas.indexOf(m.slug) >= 0 ? celda('rut:' + r.id + ':' + m.slug + ':' + per, false) : '<span class="na">·</span>') + '</td>').join('')
            : '<td colspan="' + marcasV.length + '" class="gen">' + celda('rut:' + r.id + ':-:' + per, false) + '<span>general</span></td>') + '</tr>';
      }).join('') + '</tbody></table></div>' : '';
    const reps = (D.reportes || []).filter(r => pasa(r.marca));
    // reuniones del mes (brainstorming, cliente, entrega de reportes, Ads): con fecha ✓ o "organizar"
    const grupos = {};
    (D.reuniones || []).filter(r => pasa(r.marca || S.marca)).forEach(r => (grupos[r.id] = grupos[r.id] || []).push(r));
    const reus = Object.keys(grupos).map(id => { const rs = grupos[id]; return '<div class="row"><span class="ico">' + I.users + '</span><div><div class="tt">' + esc(rs[0].nombre) + '</div><div class="mt"><span>tiene que ser del ' + rs[0].desde + ' al ' + rs[0].hasta + '</span></div><div class="mks">' +
      rs.map(r => { const ok = hecho(r), nom = r.marca ? (marca(r.marca) || {}).nombre : 'general'; return ok ? '<span class="mk on"><i style="background:' + color(r.marca) + '"></i>' + esc(nom) + (r.estado.detalle ? ' · ' + corto(ymdD(r.estado.detalle.slice(0, 10))) : '') + '</span>' : '<button class="mk' + (r.vencida ? ' late' : '') + '" data-agendar="' + esc(r.clave) + '"><i style="background:' + color(r.marca) + '"></i>' + esc(nom) + ' · organizar</button>'; }).join('') + '</div></div><div></div></div>'; }).join('');
    const cuerpo =
      '<div class="sec"><div class="sec-h"><h2>Reportes<small>' + reps.length + ' por cargar</small></h2><a class="act" href="' + esc(D.linkReportes || D.links.reportes) + '" target="_blank" rel="noopener">Abrir la web de reportes ↗</a></div>' +
      (reps.length ? '<div class="list">' + reps.map(r => { const v = new Date(r.vence), h = (v - new Date()) / 36e5; return '<div class="row"><span class="ico">' + I.flag + '</span><div><div class="tt">' + esc(r.label) + '</div><div class="mt">' + tagM(r.marca) + '<span>' + (h < 0 ? '<span class="pill bad">vencido hace ' + plazo(-h) + '</span>' : h < 24 ? '<span class="pill warn">vence en ' + plazo(h) + '</span>' : 'vence ' + cuando(v) + ' ' + hm(v)) + '</span></div></div><div><a class="btn y" href="' + esc(D.linkReportes) + '" target="_blank" rel="noopener">Cargar ↗</a></div></div>'; }).join('') + '</div>' : '<div class="empty">Todos los reportes al día ✓. Cuando cargás uno en la web de reportes, desaparece de acá solo.</div>') + '</div>' +
      (tablaDias ? '<div class="sec"><div class="sec-h"><h2>Todos los días</h2><span class="act">Podés tildar días anteriores si te olvidaste</span></div>' + tablaDias + '</div>' : '') +
      (semanales.length ? '<div class="sec"><div class="sec-h"><h2>Una vez por semana</h2></div>' + tablaMarcas(semanales, si.semana) + '</div>' : '') +
      (mensuales.length || reus ? '<div class="sec"><div class="sec-h"><h2>Este mes</h2></div>' + tablaMarcas(mensuales, si.mes) + (reus ? '<div class="dw-l" style="margin-top:18px">Reuniones del mes</div><div class="list">' + reus + '</div>' : '') + '</div>' : '');
    const pct = total ? Math.round(hechos / total * 100) : 0;
    if (S.movil) {
      // celular: una sección a la vez, filas con botones por marca en vez de tablas anchas
      const chipK = (k, s, nom) => '<button class="mk mkc' + (ok(k) ? ' on' : '') + '" data-celda="' + esc(k) + '" aria-pressed="' + ok(k) + '"><b class="mk-c">' + (ok(k) ? '✓' : '') + '</b><i style="background:' + color(s) + '"></i>' + esc(nom) + '</button>';
      const filaR = (r, chips, n, de, cuando) => '<div class="row' + (n === de ? ' done' : '') + '"><span class="prog' + (n === de ? ' full' : '') + '">' + n + '/' + de + '</span><div><div class="tt">' + esc(r.tarea) + '</div>' + (cuando ? '<div class="mt"><span>' + esc(cuando) + '</span></div>' : '') + '<div class="mks">' + chips + '</div></div><div>' + botonEnlace(enlaceDe(r), r.marcas) + '</div></div>';
      const listaM = (defs, per) => defs.map(r => {
        const ms = r.marcas.length ? marcasV.filter(m => r.marcas.indexOf(m.slug) >= 0) : null;
        if (ms && !ms.length) return '';
        const ks = ms ? ms.map(m => ['rut:' + r.id + ':' + m.slug + ':' + per, m.slug, m.nombre]) : [['rut:' + r.id + ':-:' + per, '', 'general']];
        return filaR(r, ks.map(x => chipK(x[0], x[1], x[2])).join(''), ks.filter(x => ok(x[0])).length, ks.length, cuandoTxt(r.cuando));
      }).join('');
      const iHoy = Math.max(0, cols.indexOf(hoyY)), di = S.diaSem == null ? iHoy : Math.min(S.diaSem, cols.length - 1), dsel = cols[di];
      const delDia = diarias.filter(r => diasRegla(r).indexOf(di + 1) >= 0).map(r => {
        const ks = (r.marcas.length ? r.marcas.filter(s => pasa(s)) : ['-']).map(s => ['rut:' + r.id + ':' + s + ':' + dsel, s === '-' ? '' : s, s === '-' ? 'hecho' : (marca(s) || {}).nombre]);
        if (!ks.length) return '';
        return dsel > hoyY ? filaR(r, '<span class="na">todavía no</span>', 0, ks.length) : filaR(r, ks.map(x => chipK(x[0], x[1], x[2])).join(''), ks.filter(x => ok(x[0])).length, ks.length);
      }).join('');
      const segs = [['rep', 'Reportes', reps.length], ['dia', 'Días'], ['sem', 'Semana'], ['mes', 'Mes']];
      const seg = S.segSem || (reps.length ? 'rep' : 'dia');
      const repsM = reps.length ? '<div class="list">' + reps.map(r => { const v = new Date(r.vence), h = (v - new Date()) / 36e5; return '<div class="row"><span class="ico">' + I.flag + '</span><div><div class="tt">' + esc(r.label) + '</div><div class="mt">' + tagM(r.marca) + '<span>' + (h < 0 ? '<span class="pill bad">vencido hace ' + plazo(-h) + '</span>' : h < 24 ? '<span class="pill warn">vence en ' + plazo(h) + '</span>' : 'vence ' + cuando(v)) + '</span></div></div><div><a class="btn y" href="' + esc(D.linkReportes) + '" target="_blank" rel="noopener">Cargar</a></div></div>'; }).join('') + '</div>' : '<div class="empty">Todos los reportes al día ✓</div>';
      const body = {
        rep: repsM,
        dia: '<div class="dsel">' + cols.map((d, i) => '<button class="' + (i === di ? 'on' : '') + (d === hoyY ? ' hoy' : '') + '" data-diasem="' + i + '"><small>' + DN[i] + '</small><b>' + Number(d.slice(8)) + '</b></button>').join('') + '</div>' + (delDia ? '<div class="list">' + delDia + '</div>' : '<div class="empty">Nada fijo para este día.</div>'),
        sem: semanales.length ? '<div class="list">' + listaM(semanales, si.semana) + '</div>' : '<div class="empty">No hay tareas semanales.</div>',
        mes: (mensuales.length ? '<div class="list">' + listaM(mensuales, si.mes) + '</div>' : '') + (reus ? '<div class="dw-l" style="margin-top:18px">Reuniones del mes</div><div class="list">' + reus + '</div>' : '')
      }[seg];
      return '<div class="tip-chk"><span class="cel"></span><span>Es tu <b>checklist</b>: tocá el cuadrito cuando hagas cada tarea y queda registrado.</span></div>' + '<div class="semana-h m"><b>' + hechos + '<small>/' + total + '</small></b><span>tildados esta semana</span><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="seg">' + segs.map(x => '<button class="' + (seg === x[0] ? 'on' : '') + '" data-seg="' + x[0] + '">' + x[1] + (x[2] ? '<em>' + x[2] + '</em>' : '') + '</button>').join('') + '</div>' + body;
    }
    return '<div class="tip-chk"><span class="cel"></span><span>Es tu <b>checklist</b>: tocá el cuadrito cuando hagas cada tarea y queda registrado.</span></div>' + '<div class="semana-h"><div><div class="kick">/ Semana del ' + Number(si.dias[0].slice(8)) + ' al ' + Number(si.dias[4].slice(8)) + ' de ' + MESES[ymdD(si.dias[4]).getMonth()] + '</div><b>' + hechos + '<small>/' + total + '</small></b><span>tildados hasta hoy</span></div><div class="bar" style="flex:1;max-width:360px"><i style="width:' + pct + '%"></i></div></div>' + cuerpo;
  }
  /* Rutinas que no se tildan sin más (pedido de Joaquín, 20/10/2026):
     · activaciones-externas: se responde Sí o No; con Sí se abre directo la carga del input en el SCL de la marca.
     · trimestral-check: muestra la fecha de entrega del trimestral y ofrece "Llego", "Recordarme 72 h antes" o "Pedirle al project reprogramar". */
  const entregaTrim = slug => (S.data.reportes || []).filter(r => r.tipo === 'periodico' && (!slug || slug === '-' || r.marca === slug) && pasa(r.marca)).sort((a, b) => new Date(a.vence) - new Date(b.vence))[0] || null;
  function rutinaEspecial(rid, slug, hacer) {
    const nomM = slug && slug !== '-' ? ((marca(slug) || {}).nombre || slug) : '';
    if (rid === 'activaciones-externas') {
      const m = modal('<h3>¿Este mes hay alguna activación externa o comunicación interna' + (nomM ? ' en ' + esc(nomM) : '') + '?</h3><p>Canal social, material para el área comercial, promos para vendedores, eventos o activaciones.</p><div class="err"></div>' +
        '<div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn" data-no>No hay</button><button class="btn y" data-ok>Sí, cargarla</button></div>', async () => {
        await hacer(); crearTarjeta(null, nomM ? slug : null, 'scl', 'input');
      });
      $('[data-no]', m).onclick = async () => { m.remove(); await hacer(); toast('Anotado: este mes no hay' + (nomM ? ' en ' + esc(nomM) : '') + '.'); };
      return true;
    }
    if (rid === 'trimestral-check') {
      const e = entregaTrim(slug), v = e ? new Date(e.vence) : null;
      const m = modal('<h3>Reporte trimestral</h3><p>' + (v ? 'Se entrega el <b>' + DIAS_L[v.getDay()].toLowerCase() + ' ' + dm(v) + '</b> (' + esc(e.label) + ').' : 'Este mes no encontré un trimestral por entregar en tus marcas.') + ' ¿Cómo venís?</p><div class="err"></div>' +
        '<div class="acts" style="flex-wrap:wrap"><button class="btn ghost" data-x>Cancelar</button><button class="btn" data-rep>Pedirle al project reprogramar</button>' + (v ? '<button class="btn" data-rec>Recordarme 72 h antes</button>' : '') + '<button class="btn y" data-ok>Llego</button></div>', async () => { await hacer(); });
      const rep = $('[data-rep]', m), rec = $('[data-rec]', m);
      rep.onclick = async () => {
        const motivo = prompt('¿Para qué fecha lo necesitás y por qué? (le llega al project)'); if (!motivo) return;
        rep.disabled = true; try { await post({ action: 'pendientesProject', items: ['Pedido de reprogramar la entrega del reporte trimestral' + (e ? ' (' + e.label + ', vence ' + dm(v) + ')' : '') + ': ' + motivo] }); m.remove(); await hacer(); toast('✓ Se lo pedí al project: le llegó a su Bandeja y por privado.'); } catch (er) { rep.disabled = false; $('.err', m).textContent = er.message; }
      };
      if (rec) rec.onclick = async () => {
        rec.disabled = true; try { await post({ action: 'recCrear', texto: 'Entregar el reporte trimestral (' + e.label + ')', tipo: 'antes', due: v.toISOString(), dias: 3, canal: 'ambos', hora: '9:00' }); m.remove(); await hacer(); toast('✓ Te lo recuerdo 3 días antes (' + dm(new Date(v.getTime() - 3 * 864e5)) + ').'); } catch (er) { rec.disabled = false; $('.err', m).textContent = er.message; }
      };
      return true;
    }
    return false;
  }
  async function marcarCelda(k, forzar) {
    { const p = k.split(':'), D0 = S.data, er0 = D0.estRut || {}; if (!forzar && !(er0[k] && er0[k].estado === 'hecho') && rutinaEspecial(p[1], p[2], () => marcarCelda(k, true))) return; }
    const D = S.data, er = D.estRut || (D.estRut = {}), antes = er[k] || null, ya = !!(antes && antes.estado === 'hecho');
    if (ya) delete er[k]; else { er[k] = { estado: 'hecho', fecha: ahoraTxt() }; confeti(); }
    const r = D.rutinas.find(x => x.clave === k); if (r) r.estado = ya ? null : er[k];
    render();
    try { await post({ action: 'marcar', tipo: 'rutina', clave: k, marca: k.split(':')[2] === '-' ? '' : k.split(':')[2], estado: ya ? 'deshacer' : 'hecho', periodo: k.split(':').pop() }); }
    catch (e) { if (antes) er[k] = antes; else delete er[k]; if (r) r.estado = antes; render(); toast('No se guardó: ' + esc(e.message)); }
  }

  /* ---------------- vista REVISIÓN (Ivo): diseños y videos en revisión, entregas que faltan, guiones de la semana ---------------- */
  const esRevisa = () => /project|direcc|creativ/i.test((S.data.yo || {}).rol || '');
  const esVideo = c => c.formato ? ['reel', 'historia', 'video'].indexOf(c.formato) >= 0 : /reel|video|histori/i.test(c.n + ' ' + (c.lab || []).join(' '));
  // Plazos de entrega: diseño → los lunes entregan lo que sale lun/mar/mié de la semana siguiente y los jueves lo de jue/vie/sáb/dom.
  // Video → reel 48 h antes de publicar; historia 1 día antes (o el mismo día avisando).
  function plazoEntrega(p) {
    const s = p.salida ? new Date(p.salida) : null; if (!s) return null;
    if (p.formato === 'reel' || p.formato === 'video') return new Date(s.getTime() - 48 * 36e5);
    if (p.formato === 'historia') return new Date(s.getTime() - 24 * 36e5);
    const dow = s.getDay(), lunes = new Date(s.getFullYear(), s.getMonth(), s.getDate() - ((dow + 6) % 7) - 7);
    return new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + (dow >= 1 && dow <= 3 ? 0 : 3), 18, 0);
  }
  // lo que dejan en revisión en los tableros de Diseño (diseños) y Producción (videos), las próximas entregas y los guiones de la semana
  function datosRevision() {
    const rev = S.data.cards.filter(c => pasa(c.m) && c.cat === 'pieza' && c.etapa === 'revision').sort((a, b) => new Date(a.salida || 9e15) - new Date(b.salida || 9e15));
    // próximas entregas: lo pendiente en Diseño y Producción que se entrega en los próximos 7 días o que ya se tendría que haber entregado
    const limite = new Date(NOW.getTime() + 7 * 864e5);
    const prox = S.data.cards.filter(c => pasa(c.m) && c.cat === 'pieza' && c.etapa === 'pendiente').map(c => Object.assign({}, c, { plazo: plazoEntrega(c) })).filter(c => c.plazo && c.plazo < limite).sort((a, b) => a.plazo - b.plazo);
    const lun = proxLunes(), finSem = new Date(lun.getTime() + 7 * 864e5);
    const gui = guiones().filter(g => !g.salio && (g.gest === 'revisar' || (g.gest === 'pendiente' && g.entrega && new Date(g.entrega) < finSem)));
    // urgentes (pedido de Joaquín, 20/10/2026): lo pendiente en Diseño y Producción con la etiqueta Urgente, que sale en 3 días o menos,
    // o que se cargó en las últimas 48 h (aunque no tenga fecha: así Ivo ve lo nuevo y puede pedir la fecha)
    const cargada = c => new Date(parseInt(String(c.id).slice(0, 8), 16) * 1000), en3 = new Date(NOW.getTime() + 3 * 864e5), en7 = new Date(NOW.getTime() + 7 * 864e5), hace48 = new Date(NOW.getTime() - 48 * 36e5);
    const fsal = c => (c.salida || c.due) ? new Date(c.salida || c.due) : null;   // recién cargadas: solo si salen en 7 días o no tienen fecha (no los calendarios enteros del mes que viene)
    const urg = S.data.cards.filter(c => pasa(c.m) && c.cat === 'pieza' && (c.etapa === 'pendiente' || c.etapa === 'correccion') &&
      ((c.lab || []).some(l => /urgente/i.test(l)) || (fsal(c) && fsal(c) <= en3) || (cargada(c) >= hace48 && (!fsal(c) || fsal(c) <= en7))))
      .map(c => Object.assign({}, c, { cargada: cargada(c), urgente: (c.lab || []).some(l => /urgente/i.test(l)) }))
      .sort((a, b) => (b.urgente - a.urgente) || ((fsal(a) || 9e15) - (fsal(b) || 9e15)) || (b.cargada - a.cargada));
    // pedidos extra (lista "Pedidos" de Diseño o Producción): se pagan aparte y tienen su propia fecha de entrega (la de la tarjeta), sin fecha de salida del SCL
    const ext = S.data.cards.filter(c => pasa(c.m) && c.cat === 'pieza' && /pedido|extra/i.test(c.lista || '') && c.etapa !== 'revision').sort((a, b) => new Date(a.due || 9e15) - new Date(b.due || 9e15));
    return { rev, revDis: rev.filter(c => c.tipo !== 'produccion'), revVid: rev.filter(c => c.tipo === 'produccion'), prox, atras: prox.filter(c => c.plazo < new Date()), gui, lun, urg, ext };
  }
  /* ---------------- revisión en vivo ----------------
     Para quien revisa: se pide a Trello lo que está AHORA en "En revisión" y se combina con lo ya cargado,
     así una pieza recién movida aparece al abrir (sin esperar la lectura general de cada 10 minutos). */
  async function revisionViva(silencioso) {
    if (DEMO || !S.data || !esRevisa() || S.vivaPidiendo) return;
    S.vivaPidiendo = true;
    try {
      const j = await get({ action: 'revision', k: S.key || S.pkey });
      if (!j || j.error) throw new Error((j && (j.mensaje || j.error)) || 'sin respuesta');
      const viejas = {}; S.data.cards.forEach(c => { if (c.cat === 'pieza' && c.etapa === 'revision') viejas[c.id] = c; });
      const fallo = {}; (j.fallas || []).forEach(n => fallo[n] = 1);
      // lo de Trello manda (nombre, lista, fecha); de lo ya cargado se conserva el historial de la pieza
      const vivas = j.cards.map(c => viejas[c.id] ? Object.assign({}, c, { hist: viejas[c.id].hist }) : c), ids = {};
      vivas.forEach(v => ids[v.id] = 1);
      // si un tablero no respondió, sus piezas quedan como estaban (y se avisa)
      const conservadas = Object.keys(viejas).map(k => viejas[k]).filter(c => fallo[c.tablero] && !ids[c.id]);
      const nuevas = vivas.filter(v => !viejas[v.id]).length, salieron = Object.keys(viejas).filter(k => !ids[k] && !fallo[viejas[k].tablero]).length;
      S.data.cards = S.data.cards.filter(c => !(c.cat === 'pieza' && (c.etapa === 'revision' || ids[c.id]))).concat(vivas, conservadas);
      S.viva = { leido: j.leido, fallas: j.fallas || [], error: null };
      if (!silencioso || nuevas) toast(nuevas ? '✓ ' + nuevas + (nuevas === 1 ? ' pieza nueva' : ' piezas nuevas') + ' en revisión' + (salieron ? ' · ' + salieron + ' ya no están' : '') : '✓ Revisión al día con Trello.');
    } catch (e) { S.viva = { leido: (S.viva || {}).leido || null, fallas: [], error: e.message || 'sin conexión' }; }
    S.vivaPidiendo = false;
    if (!$('.modal') && !$('#drawer')) render();
  }
  // cartel arriba de la vista de revisión: en vivo, o por qué no
  function estadoViva() {
    if (DEMO) return '';
    const V = S.viva;
    if (!V) return '<div class="viva"><span class="spin">↻</span> Leyendo Trello en vivo…</div>';
    if (V.error) return '<div class="estado-av"><span class="ei">!</span><div><b>No pude leer Trello en vivo</b> (' + esc(V.error) + '). Estás viendo la lectura general, que puede tener hasta 10 minutos de atraso.</div><button class="btn ghost" data-viva>Reintentar</button></div>';
    const seg = Math.max(0, Math.round((Date.now() - new Date(V.leido).getTime()) / 1000));
    return (V.fallas.length ? '<div class="estado-av"><span class="ei">!</span><div><b>No respondieron ' + V.fallas.length + (V.fallas.length === 1 ? ' tablero' : ' tableros') + ':</b> ' + V.fallas.map(esc).join(', ') + '. De esos se muestra lo último que se sabía.</div><button class="btn ghost" data-viva>Reintentar</button></div>' : '') +
      '<div class="viva ok"><i></i>En vivo · leído de Trello ' + (seg < 60 ? 'recién' : 'hace ' + Math.round(seg / 60) + ' min') + '<button class="lnk" data-viva>volver a leer</button></div>';
  }

  function vRevision() {
    const R = datosRevision();
    const FMT = { reel: 'Reel', historia: 'Historia', video: 'Video', carrusel: 'Carrusel', diseno: 'Diseño', guion: 'Guion' };
    const fila = (c, extra) => '<div class="row"><span class="ico">' + (esVideo(c) ? I.flag : I.pen) + '</span><div><div class="tt">' + (c.cat === 'pieza' && c.etapa === 'revision' ? '<button class="lnk" data-pieza="' + esc(c.id) + '">' + esc(c.n) + '</button>' : '<a class="lnk" href="' + esc(c.ourl || c.url) + '" target="_blank" rel="noopener">' + esc(c.n) + '</a>') + '</div><div class="mt"><span class="pill">' + (FMT[c.formato] || (esVideo(c) ? 'Video' : 'Diseño')) + '</span>' + extra + (c.salida || c.due ? (new Date(c.salida || c.due) < NOW && c.etapa === 'revision' ? '<span class="pill bad">ya debía salir ' + cuando(new Date(c.salida || c.due)) + '</span>' : '<span>sale ' + cuando(new Date(c.salida || c.due)) + '</span>') : '') + '</div></div><div>' + (c.cat === 'pieza' && c.etapa === 'revision' ? '<button class="btn y" data-pieza="' + esc(c.id) + '">Revisar</button>' : '<a class="go" href="' + esc(c.url) + '" target="_blank" rel="noopener" title="Abrir en ' + esc(c.tablero || 'Trello') + '">' + I.out + '</a>') + '</div></div>';
    // carpetas por marca: se abren solas si tienen algo urgente/atrasado; si hay una sola marca, abierta
    const porMarca = (id, L, filaFn, urgente) => {
      const g = {}; L.forEach(c => (g[c.m[0]] = g[c.m[0]] || []).push(c));
      const ks = Object.keys(g).sort((a, b) => (urgente ? g[b].filter(urgente).length - g[a].filter(urgente).length : 0) || g[b].length - g[a].length);
      return ks.map((s, idx) => {
        const k = id + ':' + s, nU = urgente ? g[s].filter(urgente).length : 0;
        const abierta = S.abiertos[k] != null ? S.abiertos[k] : S.movil ? idx === 0 : (ks.length === 1 || nU > 0);   // en el celu, solo la primera abierta
        return '<div class="mcar' + (abierta ? ' on' : '') + '"><button class="mcar-h" data-mcar="' + esc(k) + '" data-abierta="' + (abierta ? 1 : 0) + '"><span class="dotm" style="background:' + color(s) + '"></span><b>' + esc((marca(s) || {}).nombre || s) + '</b><small>' + g[s].length + '</small>' + (nU ? '<em>' + nU + ' atrasad' + (nU === 1 ? 'a' : 'as') + '</em>' : '') + '<i>' + (abierta ? '−' : '+') + '</i></button>' +
          (abierta ? '<div class="list">' + g[s].map(filaFn).join('') + '</div>' : '') + '</div>';
      }).join('');
    };
    const vacio = t => '<div class="empty">' + t + '</div>';
    // los contadores son las pestañas: se ve una sección a la vez
    const segs = [['urg', 'urgentes', 'nuevo y para ya', R.urg.length, 'bad'], ['ext', 'extras', 'pedidos aparte', R.ext.length, R.ext.some(c => c.due && new Date(c.due) < new Date()) ? 'bad' : 'y'], ['dis', 'diseños', 'en revisión', R.revDis.length, 'y'], ['vid', 'videos', 'en revisión', R.revVid.length, 'y'], ['ent', 'entregas', R.atras.length ? 'faltó entregar' : 'próximas', R.atras.length || R.prox.length, R.atras.length ? 'bad' : ''], ['gui', 'guiones', 'lunes ' + dm(R.lun), R.gui.length, '']];
    let seg = LS.get('revseg', null);
    if (!segs.some(s => s[0] === seg)) seg = R.urg.length ? 'urg' : R.atras.length ? 'ent' : R.revDis.length ? 'dis' : R.revVid.length ? 'vid' : 'ent';
    const tabs = '<div class="rapidos revtabs">' + segs.map(s => '<button class="rp' + (s[3] ? ' ' + s[4] : '') + (seg === s[0] ? ' sel' : '') + '" data-revseg="' + s[0] + '"><b>' + s[3] + '</b><span>' + s[1] + '<br><small>' + s[2] + '</small></span></button>').join('') + '</div>';
    let cuerpo = '';
    if (seg === 'urg') {
      const dato = c => (c.urgente ? '<span class="pill bad">Urgente</span>' : '') + ((c.salida || c.due) ? '' : '<span class="pill warn">sin fecha de salida</span>') + (c.cargada >= new Date(NOW.getTime() - 48 * 36e5) ? '<span>cargada ' + (diasA(c.cargada) === 0 ? 'hoy' : 'ayer') + '</span>' : '') + '<span>' + esc(c.tablero || '') + ' · ' + esc(c.lista || '') + '</span>';
      cuerpo = R.urg.length ? '<p class="sub" style="margin:0 0 10px">Lo pendiente de diseño y producción con la etiqueta Urgente o que sale en 3 días o menos, y lo cargado en las últimas 48 h que sale esta semana o no tiene fecha (pedísela a quien lo cargó).</p>' + porMarca('ru', R.urg, c => fila(c, dato(c)), c => c.urgente || ((c.salida || c.due) && diasA(new Date(c.salida || c.due)) <= 1)) : vacio('No hay nada urgente ni cargado en las últimas 48 h.');
    } else
    if (seg === 'ext') cuerpo = R.ext.length ? '<p class="sub" style="margin:0 0 10px">Pedidos extra de Diseño y Producción: se pagan aparte y se entregan en la fecha de la tarjeta.</p>' + porMarca('rx', R.ext, c => fila(c, (c.due ? (new Date(c.due) < new Date() ? '<span class="pill bad">venció el ' + dm(new Date(c.due)) + '</span>' : '<span' + (diasA(new Date(c.due)) <= 1 ? ' class="pill warn"' : '') + '>se entrega ' + cuando(new Date(c.due)) + '</span>') : '<span class="pill warn">sin fecha de entrega</span>') + '<span>' + esc(c.lista) + '</span>'), c => c.due && new Date(c.due) < new Date()) : vacio('No hay pedidos extra pendientes.');
    else
    if (seg === 'dis') cuerpo = R.revDis.length ? porMarca('rd', R.revDis, c => fila(c, '')) : vacio('No hay diseños esperando revisión.');
    else if (seg === 'vid') cuerpo = R.revVid.length ? porMarca('rv', R.revVid, c => fila(c, '')) : vacio('No hay videos esperando revisión.');
    else if (seg === 'gui') cuerpo = R.gui.length ? porMarca('rg', R.gui, g => fila(Object.assign({ formato: 'guion' }, g), g.gest === 'revisar' ? '<span class="pill y">entregado · a revisar</span>' : (diasA(new Date(g.entrega)) < 0 ? '<span class="pill bad">Fede debía entregar el ' + dm(new Date(g.entrega)) + '</span>' : '<span>Fede entrega ' + cuando(new Date(g.entrega)) + '</span>')), g => g.gest === 'pendiente' && diasA(new Date(g.entrega)) < 0) : vacio('No hay guiones para ver esta semana.');
    else {
      // Entregas: los dos lotes de las diseñadoras (lunes: lun a mié · jueves: jue a dom) y después reels e historias
      const lun = R.lun, finSem = new Date(lun.getTime() + 7 * 864e5);
      const piezas = S.data.cards.filter(c => pasa(c.m) && c.cat === 'pieza' && c.tipo === 'diseno' && (c.etapa === 'pendiente' || c.etapa === 'revision') && c.salida && new Date(c.salida) >= lun && new Date(c.salida) < finSem);
      const lote = (temprano, nombre) => {
        const L = piezas.filter(c => { const d = new Date(c.salida).getDay(); return temprano ? d >= 1 && d <= 3 : !(d >= 1 && d <= 3); });
        const ent = new Date(lun.getFullYear(), lun.getMonth(), lun.getDate() - 7 + (temprano ? 0 : 3), 18, 0);
        const faltan = L.filter(c => c.etapa === 'pendiente'), listas = L.length - faltan.length, paso = new Date() > ent;
        const estado = !L.length ? '<span class="lt-e">sin piezas</span>' : !faltan.length ? '<span class="lt-e ok">✓ todo entregado</span>' : paso ? '<span class="lt-e bad">faltó ' + faltan.length + '</span>' : '<span class="lt-e">faltan ' + faltan.length + '</span>';
        return '<div class="lote' + (paso && faltan.length ? ' tarde' : '') + '"><div class="lt-h"><div><b>' + nombre + ' ' + dm(ent) + '</b><small>lo que sale ' + (temprano ? 'lun a mié' : 'jue a sáb') + ' (semana del ' + dm(lun) + ')</small></div>' + estado + '</div>' +
          (L.length ? '<div class="lt-bar"><i style="width:' + Math.round(listas / L.length * 100) + '%"></i></div><div class="lt-n">' + listas + ' de ' + L.length + ' en revisión</div>' : '') +
          (faltan.length ? porMarca('lt' + (temprano ? 1 : 2), faltan, c => fila(c, datoPieza(c, plazoEntrega(c))), () => paso) : '') + '</div>';
      };
      const videos = R.prox.filter(c => c.tipo === 'produccion');
      const plazo = c => c.plazo < new Date() ? '<span class="pill bad">faltó · era el ' + dm(c.plazo) + '</span>' : '<span' + (diasA(c.plazo) <= 1 ? ' class="pill warn"' : '') + '>entrega ' + cuando(c.plazo) + '</span>';
      cuerpo = '<div class="sec"><div class="sec-h"><h2>Diseño · semana que viene</h2></div><div class="lotes">' + lote(true, 'Lunes') + lote(false, 'Jueves') + '</div></div>' +
        '<div class="sec"><div class="sec-h"><h2>Videos<small>' + videos.length + '</small></h2><span class="act">reel 48 h antes · historia 1 día antes</span></div>' +
        (videos.length ? porMarca('pv', videos, c => fila(c, plazo(c) + datoPieza(c, c.plazo)), c => c.plazo < new Date()) : vacio('Los filmmakers están al día.')) + '</div>';
    }
    return estadoViva() + tabs + '<div class="revc">' + cuerpo + '</div>';
  }
  // en Hoy (para Ivo): resumen de lo que tiene para revisar
  function bloqueRevision() {
    if (!esRevisa()) return '';
    const R = datosRevision(), n = R.rev.length + R.gui.length;
    if (!n) return '';
    return '<button class="revbox" data-tab="revision"><b>Para revisar</b><span>' + [R.revDis.length ? R.revDis.length + ' diseños' : '', R.revVid.length ? R.revVid.length + ' videos' : '', R.gui.length ? R.gui.length + ' guiones para el lunes' : ''].filter(Boolean).join(' · ') + '</span><i>→</i></button>';
  }

  /* ---------------- vista GUIONES: qué tiene que entregar Fede, qué ver en la reunión del lunes ---------------- */
  function vGuiones() {
    const todos = guiones(), lun = proxLunes();
    // ya salió (se publicó directo sin mover la tarjeta de guiones): va aparte para ordenar
    const yaSalio = todos.filter(g => g.salio && g.gest !== 'aprobado'), G = todos.filter(g => !g.salio || g.gest === 'aprobado');
    const sinFecha = G.filter(g => g.gest === 'pendiente' && !g.entrega);
    const pend = G.filter(g => g.gest === 'pendiente' && g.entrega).sort((a, b) => new Date(a.entrega) - new Date(b.entrega));
    const rev = G.filter(g => g.gest === 'revisar'), corr = G.filter(g => g.gest === 'correccion'), apr = G.filter(g => g.gest === 'aprobado');
    const fila = (g, extra) => '<div class="row"><span class="ico">' + I.pen + '</span><div><div class="tt"><a class="lnk" href="' + esc(g.ourl || g.url) + '" target="_blank" rel="noopener">' + esc(g.n) + '</a></div><div class="mt">' + tagM(g.m[0]) + extra + (g.salida ? '<span>' + (diasA(new Date(g.salida)) < 0 ? 'salió ' : 'sale ') + dm(new Date(g.salida)) + '</span>' : '') + '</div></div><div><a class="go" href="' + esc(g.url) + '" target="_blank" rel="noopener" title="Abrir en el tablero de guiones">' + I.out + '</a></div></div>';
    // cada card dice en qué está el guion y qué hay que hacer: "👉 Vos" = te toca a vos · "⏳" = esperás a Fede
    const sec = (t, quien, que, L, f, vacio, def) => L.length || vacio ? tarjeta('gu:' + t, t, L.length, quien === 'vos' && L.length ? 'te toca' : '', def != null ? def : L.length > 0, () => '<p class="que' + (quien === 'vos' ? ' vos' : '') + '">' + (quien === 'vos' ? '👉 <b>Vos:</b> ' : '⏳ ') + que + '</p>' + (L.length ? L.map(f).join('') : '<div class="empty">' + vacio + '</div>'), I.pen) : '';
    return '<div class="gpasos"><span><b>1</b>Presentan la idea<small>reunión del lunes</small></span><i>→</i><span><b>2</b>La aprueban en SCL<small>con fecha de inicio</small></span><i>→</i><span><b>3</b>Fede escribe<small>7 días</small></span><i>→</i><span><b>4</b>La ven juntos<small>' + cuando(lun) + '</small></span></div>' +
      sec('Sin fecha de entrega', 'vos', 'abrí la tarjeta en SCL y ponele <b>fecha de inicio</b> (el lunes que viene). Sin eso Fede no sabe cuándo tiene que entregar.', sinFecha, g => fila(g, '<span class="pill bad">sin fecha · ponésela vos</span>'), '') +
      sec('Fede tiene que entregar', 'fede', 'no hacés nada por ahora. Si figura <b>atrasado</b>, recordáselo por Discord.', pend, g => { const n = diasA(new Date(g.entrega)); return fila(g, n < 0 ? '<span class="pill bad">Fede atrasado · era el ' + dm(new Date(g.entrega)) + '</span>' : '<span' + (n <= 1 ? ' class="pill warn"' : '') + '>Fede entrega ' + cuando(new Date(g.entrega)) + '</span>'); }, 'Fede no tiene guiones pendientes.', pend.some(g => diasA(new Date(g.entrega)) < 0)) +
      sec('Listos para ver en la reunión', 'vos', 'leelos antes del <b>' + cuando(lun) + '</b> y anotá qué cambiarías. En la reunión se aprueban o van a corrección.', rev, g => fila(g, '<span class="pill y">listo · leelo antes del lunes</span>'), 'Todavía no hay guiones entregados para esta semana.') +
      sec('En corrección', 'fede', 'Fede los está ajustando con lo que le marcaron. Cuando los vuelva a entregar aparecen en "Listos para ver".', corr, g => fila(g, '<span>Fede corrigiendo</span>'), '') +
      sec('Ya salió · ordenar en Trello', 'vos', 'se publicó pero la tarjeta sigue en el tablero de guiones: pasala a <b>Aprobado</b> o archivala, así Fede no la ve como pendiente.', yaSalio, g => fila(g, '<span class="pill ok">ya salió</span><span>sigue en ' + esc(g.lista) + '</span>'), '') +
      sec('Aprobados esta semana', 'fede', 'listos para grabar: ya pasaron a Producción.', apr, g => fila(g, '<span class="pill ok">aprobado</span>'), '', false);
  }

  /* ---------------- vista MÁS (celular): lo que en la compu va al costado ---------------- */
  /* ---------------- Plan y Objetivos adentro del panel (22/10/2026) ----------------
     Son las mismas páginas de antes, embebidas en una capa fija debajo de las pestañas: la capa vive fuera del render,
     así el iframe no se recarga cada vez que el panel se redibuja, y conserva lo que estabas haciendo al cambiar de pestaña. */
  function vEmb() { return '<div class="emb-ph" aria-hidden="true"></div>'; }
  // arma (una sola vez) el iframe de Plan u Objetivos; también se usa para precargarlos escondidos
  function embFrame(t) {
    let capa = document.getElementById('embCapa');
    if (!capa) { capa = document.createElement('div'); capa.id = 'embCapa'; document.body.appendChild(capa); window.addEventListener('resize', () => { if (tabEmb() === 'plan' || tabEmb() === 'okr') embSync(); }); }
    // privacidad (22/10/2026): cada ventana se abre SIEMPRE con la persona actual; si quedó una de otra persona, se tira
    const yoC = S.data ? ((S.data.yo || {}).clave || '') : (S.persona || 'project');
    capa.querySelectorAll('iframe').forEach(x => { if (x.dataset.p !== yoC) x.remove(); });
    let f = capa.querySelector('iframe[data-t="' + t + '"]');
    if (!f) {
      f = document.createElement('iframe'); f.dataset.t = t; f.dataset.p = yoC; f.title = t === 'plan' ? 'Plan' : 'Objetivos';
      f.src = (t === 'plan' ? 'plan/' : 'objetivos/') + '?embed=1&p=' + encodeURIComponent(yoC) + (DEMO ? '&demo=1' : '') + ((S.embExtra || {})[t] || '');
      f.onload = () => embFondo(f);   // el mismo color de fondo que eligió la persona
      capa.appendChild(f);
    }
    return f;
  }
  function embFondo(f) { try { const r = f.contentDocument.documentElement.style, de = document.documentElement.style; ['--bg', '--s1', '--s2', '--s3', '--bg-rgb'].forEach(v => { const x = de.getPropertyValue(v); if (x) r.setProperty(v, x); else r.removeProperty(v); }); f.contentDocument.body.style.background = 'var(--bg)'; } catch (e) {} }
  const conPlanYo = () => S.data && !esRevisa() && !esFilm() && (['orne', 'rama', 'joaco'].indexOf((S.data.yo || {}).clave) >= 0 || /project/i.test((S.data.yo || {}).rol || ''));
  // 22/10/2026: lo que más tarda se pide de fondo apenas el panel terminó de cargar, así al tocar la pestaña ya está
  function precargar() {
    if (S._precargo) return; S._precargo = 1;
    const ocioso = g => (window.requestIdleCallback || (h => setTimeout(h, 1500)))(g, { timeout: 4000 });
    ocioso(() => {
      if (S.pkey && ((S.proj && !S.data) || (S.data && esRevisa()))) agpCargar(false, true);   // agenda privada: project y dirección
      if (conPlanYo()) setTimeout(() => { if (S.data) { embFrame('plan'); embFrame('okr'); } }, 2500);   // Plan y Objetivos, escondidos
    });
  }
  const tabEmb = () => S.proj && !S.data ? S.projTab : S.tab;
  function embSync() {
    const t = tabEmb(), on = t === 'plan' || t === 'okr';
    let capa = document.getElementById('embCapa');
    if (!on) { if (capa) capa.classList.remove('on'); document.body.classList.remove('con-emb'); return; }
    const f = embFrame(t); capa = document.getElementById('embCapa');
    capa.querySelectorAll('iframe').forEach(x => x.classList.toggle('on', x === f));
    window.scrollTo(0, 0);
    document.body.classList.add('con-emb'); capa.classList.add('on');
    const ref = $(S.movil ? '.mtit' : '.ctrl'), bn = $('.bnav');
    capa.style.top = (ref ? Math.max(0, ref.getBoundingClientRect().bottom) : 0) + 'px';
    capa.style.bottom = (bn && S.movil ? bn.getBoundingClientRect().height : 0) + 'px';
  }
  // v5 (22/10/2026): bloques que iban uno abajo del otro (Se vienen, Sugerencias, Accesos) pasan a pestañas: se ve uno por vez
  function cajasEnPestanas(root, key) {
    if (!root) return;
    const cajas = [...root.querySelectorAll(':scope > .box')]; if (cajas.length < 2) return;
    const nombre = (c, i) => { const h = c.querySelector('h3'); const t = h ? [...h.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : ''; return t || '0' + (i + 1); };
    const nav = document.createElement('div'); nav.className = 'cj-tabs'; nav.setAttribute('role', 'tablist');
    nav.innerHTML = cajas.map((c, i) => '<button role="tab" data-cj="' + i + '">' + esc(nombre(c, i)) + '</button>').join('');
    cajas[0].before(nav);
    const mostrar = i => { cajas.forEach((c, j) => { c.classList.toggle('hidden', j !== i); c.classList.toggle('cj-on', j === i); }); nav.querySelectorAll('button').forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-selected', j === i); }); LS.set('cajas:' + key, i); };
    nav.querySelectorAll('button').forEach(b => b.onclick = () => mostrar(+b.dataset.cj));
    mostrar(Math.min(LS.get('cajas:' + key, 0), cajas.length - 1));
  }
  // lo mismo con carpetas que se muestran todas abiertas (Guiones, Anual): cada carpeta es una pestaña con su número
  function carpetasEnPestanas(root, key) {
    if (!root) return;
    const cs = [...root.querySelectorAll(':scope > .mcar, :scope > .sec > .mcar')]; if (cs.length < 3 || cs.some(c => !c.classList.contains('on'))) return;
    const dato = c => { const h = c.querySelector('.mcar-h'); return { t: ((h && h.querySelector('b')) || {}).textContent || '', n: ((h && h.querySelector('small')) || {}).textContent || '', alerta: !!(h && h.querySelector('em:not(.suave)')) }; };
    const nav = document.createElement('div'); nav.className = 'gtabs cp-tabs'; nav.setAttribute('role', 'tablist');
    nav.innerHTML = cs.map((c, i) => { const d = dato(c); return '<button role="tab" class="gtab' + (d.alerta ? ' t-bad' : '') + '" data-cp="' + i + '"><i class="gtab-n">' + String(i + 1).padStart(2, '0') + '</i><span class="gtab-t">' + esc(d.t) + '</span><b>' + esc(d.n) + '</b></button>'; }).join('');
    cs[0].before(nav);
    const mostrar = i => { cs.forEach((c, j) => { c.classList.toggle('hidden', j !== i); c.classList.toggle('cp-on', j === i); }); nav.querySelectorAll('button').forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-selected', j === i); }); LS.set('carp:' + key, i); };
    nav.querySelectorAll('button').forEach(b => b.onclick = () => mostrar(+b.dataset.cp));
    mostrar(Math.min(LS.get('carp:' + key, 0), cs.length - 1));
  }
  // y con secciones con título (Semana en la compu: Reportes, Todos los días, Una vez por semana, Este mes)
  function seccionesEnPestanas(root, key, minimo) {
    if (!root) return;
    const ss = [...root.querySelectorAll(':scope > .sec')].filter(x => x.querySelector(':scope > .sec-h h2')); if (ss.length < (minimo || 3)) return;
    const dato = x => { const h = x.querySelector(':scope > .sec-h h2'); return { t: [...h.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(), n: ((h.querySelector('small') || {}).textContent || '').replace(/[^\d].*$/, '') }; };
    const nav = document.createElement('div'); nav.className = 'gtabs sp-tabs'; nav.setAttribute('role', 'tablist');
    nav.innerHTML = ss.map((x, i) => { const d = dato(x); return '<button role="tab" class="gtab" data-sp="' + i + '"><i class="gtab-n">' + String(i + 1).padStart(2, '0') + '</i><span class="gtab-t">' + esc(d.t) + '</span><b>' + esc(d.n) + '</b></button>'; }).join('');
    ss[0].before(nav);
    const mostrar = i => { ss.forEach((x, j) => { x.classList.toggle('hidden', j !== i); x.classList.toggle('sp-on', j === i); }); nav.querySelectorAll('button').forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-selected', j === i); }); LS.set('secs:' + key, i); };
    nav.querySelectorAll('button').forEach(b => b.onclick = () => mostrar(+b.dataset.sp));
    mostrar(Math.min(LS.get('secs:' + key, 0), ss.length - 1));
  }
  /* ---------------- ayuda (23/10/2026): un "?" en cada pestaña, un recorrido corto por rol y un botón para preguntarle a Joaquín ----------------
     Cada texto dice para qué sirve la pantalla, qué se toca y qué pasa en Trello al tocarlo. Lo que no se entienda se pregunta desde acá. */
  const AYUDA = {
    cmdia: ['Programar', 'Todo lo que sale hoy y mañana en tus marcas, por hora. <b>Programables</b>: se programan en Meta; cuando lo hagas tocá <b>Ya lo programé</b> y la tarjeta pasa a Programado en Trello. <b>A mano</b>: lo que no se puede programar (lleva la etiqueta (i) en el SCL); se publica en el momento y después tocás <b>Ya lo publiqué</b>. Si te equivocás, tocá el botón verde y vuelve. El nombre abre la tarjeta original del SCL, con el copy y los archivos. Lo que guardás para más adelante (portadas, recetas) va a la lista <b>Para más adelante (no se publica)</b> y no aparece acá.'],
    hoy: ['Hoy', 'Lo que te toca en el día. Arriba, los números (vencidas, inputs, por salir…): tocá uno para ir directo. Abajo, cada pestaña de color es un tipo de tarea; tocá el <b>círculo</b> de un renglón cuando la hiciste y queda registrado (Joaquín lo ve). El botón <b>Semana</b> de arriba abre el checklist de la semana.'],
    semana: ['Semana', 'Tu checklist: cada tarea tiene un cuadrito por día o por marca. Tocalo cuando la hacés. <b>Reportes</b> te lleva a cargar los que faltan. Nada de esto mueve tarjetas en Trello: queda anotado en el panel.'],
    inputs: ['Inputs', 'Lo que te cargaron en la lista INPUTS del SCL de tus marcas. Tocá <b>Revisar</b> para leerlo y decidir: usarlo, guardarlo para más adelante o archivarlo (archivar lo archiva en Trello). Hay que verlos dentro de las 24 h.'],
    reuniones: ['Reuniones', '<b>Próximas</b>: lo que viene en el calendario y los brainstormings. <b>Por agendar</b>: las reuniones del mes que todavía no tienen fecha; con <b>Ponerle fecha</b> se crea el evento en el calendario del equipo.'],
    equipo: ['Equipo', 'Qué está haciendo el resto con tus marcas: cuándo y con quién graba Bauti, y qué tienen Diseño y Producción por entregar (y para cuándo). Sirve para pedir algo a tiempo. Es solo para mirar.'],
    plan: ['Plan', 'Cómo se arma tu mes, en pasos: <b>1 Anual</b> (qué fechas se atacan), <b>2 Mes</b> (ficha y tópicos), <b>3 Entregas</b>, <b>4 Reels</b> (y su plan B), <b>Ads</b> y <b>Cumplimiento</b>. Arriba, <b>Para hacer</b> junta lo pendiente de todas tus marcas con un botón <b>Ir</b>. "Cómo se arma un mes" lo explica animado.'],
    okr: ['Objetivos', 'Los OKR de cada marca: cuánto llevás de cada objetivo en el período y cuánto falta. Tocá un objetivo para ver el detalle; si pide un número, lo cargás ahí.'],
    anual: ['Anual', 'El calendario anual de cada marca. Elegí la marca arriba y el mes en los botones: ves las fechas de ese mes y qué tipo de campaña son. Sale del documento "Calendario anual" de Recursos Corporativos del SCL.'],
    discord: ['Discord', 'Las menciones que te hicieron en los canales de tus marcas. Marcalas como leídas acá para no perderte ninguna.'],
    mas: ['Más', 'Todo lo demás, ordenado por secciones. <b>Para tener en cuenta</b> abre fechas que se vienen, sugerencias y accesos (Reportes, Trello, Notion). En <b>Vos</b> cambiás tu apodo, foto y color.'],
    agenda: ['Agenda', 'Los próximos 14 días: entregas, reuniones y fechas del calendario de tus marcas, día por día.'],
    recursos: ['Recursos', 'Logos, fichas y archivos de cada marca, sacados de la lista Recursos Corporativos del SCL.'],
    marcas: ['Marcas', 'Cada marca con sus tableros de Trello, hasta dónde está cargado el calendario y las fechas que le sirven.'],
    colabs: ['Colaboradores', 'Influencers y cuentas afines por marca, con su estado (por contactar, contactado, aceptó, publicado).'],
    guiones: ['Guiones', 'Los guiones de Fede: qué tiene que entregar, qué está listo para ver en la reunión y qué está en corrección. Tocá cada pestaña para ver un grupo.'],
    revision: ['Revisión', 'Lo que espera tu ok: diseños y videos en revisión, urgentes, extras y entregas. Tocá una pieza para ver los archivos y aprobarla o mandarla a corregir (la tarjeta se mueve en Trello). Podés arrastrar una imagen sobre una tarjeta para subirla.'],
    fotos: ['Fotos', 'Cuándo fue la última producción de fotos de cada marca y cuándo toca la próxima. Tocá <b>Anotar</b> cuando se hace una.'],
    agp: ['Agenda privada', 'El calendario de ideamia.contacto. <b>Agendar reunión</b> crea el evento en Google Calendar y les manda la invitación a quienes elijas.'],
    film: ['Reels', 'Lo que tenés que filmar y editar, por marca y por semana. <b>Listo</b> pasa la tarjeta a "En revisión" en Trello y le avisa a Ivo.'],
    fhist: ['Historias', 'Las historias que tenés que editar, por marca. <b>Listo</b> las pasa a "En revisión" en Trello.'],
    fgui: ['Guiones', 'Las reuniones de guiones (si vas o no) y los guiones de tus marcas.'],
    fpres: ['Agenda', 'Tus producciones de la semana: anotá día, hora, marca, qué vas a hacer y con quién. Las social media lo ven en su pestaña Equipo.'],
    prods: ['Producciones', 'Lo que anotó Bauti para grabar, por día.'],
    // vista Project
    p_mio: ['Mi día', 'Tu tablero Project de Trello. Los números de arriba son pestañas (Bandeja, Para hoy, Minuta…). El <b>círculo</b> pasa la tarjeta a Listo; tocando la tarjeta abrís su ficha para cambiar la etapa, la fecha, las etiquetas, comentar o <b>enviarla</b> a Diseño, Social media, Fotografía, Reel o Historia.'],
    p_agenda: ['Agenda', 'El calendario de ideamia.contacto. <b>Agendar reunión</b> crea el evento y manda las invitaciones.'],
    p_equipo: ['Equipo', 'Qué tiene pendiente cada persona del equipo: rutinas, inputs sin tocar y reuniones sin fecha. Tocá a alguien para ver el detalle o abrir su panel.'],
    p_registro: ['Registro', 'Lo último que tildó o cargó cada uno. Filtrá por persona arriba.'],
    p_fotos: ['Fotos', 'Última producción de fotos de cada marca y cuándo toca la próxima.'],
    p_anual: ['Anual', 'El calendario anual de cada marca, mes por mes.'],
    p_plan: ['Plan', 'El plan de todas las marcas. Acá aprobás o rechazás lo que te proponen las social media (fechas que no se atacan, fichas) y ves el cumplimiento.'],
    p_okr: ['Objetivos', 'Los OKR de todas las marcas.'],
    p_pmas: ['Más', 'Fotos, Anual, Registro y tu perfil.']
  };
  // recorrido corto por rol (5 o 6 pasos): qué mirás primero, qué tocás y qué pasa
  const TOURS = {
    sm: [['Empezá por Hoy', 'Cada mañana entrá a <b>Hoy</b>: arriba ves los números (vencidas, inputs, por salir) y abajo lo que te toca, agrupado por tipo.'],
      ['Tildá lo que hacés', 'El <b>círculo</b> de cada renglón (o el cuadrito de cada marca) lo marca como hecho. Queda registrado: no hace falta avisar por otro lado.'],
      ['Inputs en 24 h', 'En <b>Inputs</b> está lo que te cargaron. Revisalos dentro de las 24 h: usar, guardar para después o archivar.'],
      ['El mes, en Plan', 'En <b>Plan</b> armás el mes en pasos (anual, ficha, entregas, reels y plan B). <b>Para hacer</b> te dice qué falta y te lleva directo.'],
      ['Tu equipo', 'En <b>Equipo</b> (en Más, en el celu) ves cuándo graba Bauti y qué entrega Diseño de tus marcas, para pedir a tiempo.'],
      ['¿Dudas?', 'Cada pantalla tiene un <b>?</b> arriba que explica cómo se usa. Si algo no se entiende o no anda, desde ahí le escribís a Joaquín.']],
    cm: [['Empezá por Programar', 'En <b>Programar</b> ves todo lo que sale hoy y mañana, por hora, separado en <b>Programables</b> y <b>A mano</b>. Si algo quedó atrasado, aparece primero.'],
      ['Marcá lo que hacés', 'Cuando programás algo en Meta tocá <b>Ya lo programé</b>; cuando publicás algo a mano, <b>Ya lo publiqué</b>. La tarjeta se mueve sola en Trello.'],
      ['Tus rutinas', 'En <b>Hoy</b> están tus rutinas y reportes: tocá el círculo de cada una cuando la hacés.'],
      ['Avisos por Discord', 'A la mañana te llega por Discord qué publicás a mano hoy, y en el momento te avisa si entra algo para salir ya.'],
      ['Lo que guardás', 'Portadas de destacadas, recetas o lo que dejás para usar después: pasalo a la lista <b>Para más adelante (no se publica)</b> de tu tablero de CM. Ahí no te avisa nunca.'],
      ['¿Dudas?', 'Cada pantalla tiene un <b>?</b> arriba. Si algo no se entiende o no anda, desde ahí le escribís a Joaquín.']],
    revisa: [['Revisión', 'Entrás directo a <b>Revisión</b>: los números de arriba son pestañas (urgentes, extras, diseños, videos, entregas).'],
      ['Aprobar o corregir', 'Tocá una pieza: ves los archivos y la aprobás o la mandás a corregir con un comentario. La tarjeta se mueve sola en Trello.'],
      ['Subir archivos', 'Arrastrá una imagen sobre una tarjeta (o adentro de la pieza abierta) y se sube a Trello.'],
      ['¿Dudas?', 'Cada pantalla tiene un <b>?</b> arriba. Si algo no anda, desde ahí le escribís a Joaquín.']],
    film: [['Tu semana', 'En <b>Reels</b> e <b>Historias</b> ves qué filmar y editar, por marca y por semana.'],
      ['Entregar', '<b>Listo</b> pasa la tarjeta a "En revisión" en Trello y le avisa a Ivo.'],
      ['Agenda', 'En <b>Agenda</b> anotá cada producción: día, hora, marca, qué y con quién. Los viernes te recuerda si falta cargar la semana que viene.'],
      ['¿Dudas?', 'Cada pantalla tiene un <b>?</b> arriba. Si algo no anda, desde ahí le escribís a Joaquín.']],
    project: [['Mi día', 'Tu tablero Project: los números son pestañas y ves una lista por vez.'],
      ['Tarjetas que se tocan', 'El círculo la pasa a Listo. Tocándola abrís su ficha: etapa, fecha, etiquetas, comentario y <b>Enviar a</b> (Diseño, Social media, Fotografía, Reel, Historia).'],
      ['Plan y aprobaciones', 'En <b>Plan</b> aprobás lo que proponen las social media. Los avisos de Discord te llevan directo.'],
      ['Equipo', 'En <b>Equipo</b> ves qué tiene pendiente cada uno; en <b>Registro</b>, lo último que hicieron.']]
  };
  const rolTour = () => !S.data ? 'project' : esRevisa() ? 'revisa' : esFilm() ? 'film' : /cm/i.test((S.data.yo || {}).rol || '') ? 'cm' : 'sm';
  const tabActualAyuda = () => S.proj && !S.data ? 'p_' + (S.projTab || 'mio') : S.tab;
  function ayudaVer(k) {
    const a = AYUDA[k] || AYUDA[k && k.replace(/^p_/, '')] || ['Cómo se usa', 'Esta pantalla todavía no tiene explicación. Si algo no se entiende, escribile a Joaquín acá abajo.'];
    const m = hoja('Cómo se usa · ' + a[0], '<p class="ay-t">' + a[1] + '</p>' +
      '<div class="ay-bts"><button class="btn ghost" data-tour>▶ Recorrido de 1 minuto</button></div>' +
      '<span class="lbl">¿Algo no se entiende o no anda?</span><div class="fi-c"><textarea id="ayQ" rows="3" maxlength="1500" placeholder="Contá qué querías hacer y qué pasó. Le llega a Joaquín por Discord."></textarea></div>' +
      '<div class="err"></div><div class="acts"><button class="btn y" data-consulta="' + esc(k) + '">Mandar a Joaquín</button></div>'); m.classList.add('centro');
    $('[data-tour]', m).onclick = () => { m.remove(); tourVer(); };
    $('[data-consulta]', m).onclick = async e => {
      const t = $('#ayQ', m).value.trim(); if (t.length < 5) return $('#ayQ', m).focus();
      const b = e.target; b.disabled = true; b.textContent = 'Enviando…';
      try { await post({ action: 'consulta', texto: t, pestana: a[0], k: S.key || S.pkey }); m.remove(); toast('✓ Le llegó a Joaquín. Te responde por Discord.'); }
      catch (x) { $('.err', m).textContent = x.message; b.disabled = false; b.textContent = 'Mandar a Joaquín'; }
    };
  }
  function tourVer() {
    const pasos = TOURS[rolTour()] || TOURS.sm; let i = 0;
    const m = hoja('Cómo se usa tu panel', '<div class="tour"></div>'); m.classList.add('centro');
    const pintar = () => {
      const p = pasos[i];
      $('.tour', m).innerHTML = '<div class="tour-n">' + String(i + 1).padStart(2, '0') + ' / ' + String(pasos.length).padStart(2, '0') + '</div><h3>' + p[0] + '</h3><p>' + p[1] + '</p>' +
        '<div class="tour-dots">' + pasos.map((_, j) => '<i class="' + (j === i ? 'on' : j < i ? 'ya' : '') + '"></i>').join('') + '</div>' +
        '<div class="acts"><button class="btn ghost" data-tp' + (i ? '' : ' disabled') + '>Anterior</button><button class="btn y" data-tn>' + (i === pasos.length - 1 ? 'Listo' : 'Siguiente') + '</button></div>';
      $('[data-tp]', m).onclick = () => { if (i) { i--; pintar(); } };
      $('[data-tn]', m).onclick = () => { if (i < pasos.length - 1) { i++; pintar(); } else { m.remove(); LS.set('tour:' + (claveYo() || ''), 1); } };
    };
    pintar();
  }
  // primera línea de un texto, cortada en una palabra entera y avisando que sigue (sin "…")
  const resumenTxt = (t, n) => { const l = String(t || '').split('\n').map(x => x.trim()).filter(Boolean), p = l[0] || ''; if (p.length <= n) return p + (l.length > 1 ? ' (sigue)' : ''); const c = p.slice(0, n).replace(/\s+\S*$/, ''); return c + ' (sigue)'; };
  const btnAyuda = () => '<button class="ayuda-q" data-ayuda aria-label="Cómo se usa esta pantalla" title="Cómo se usa">?</button>';

  function hoja(titulo, html) {
    const m = document.createElement('div'); m.className = 'modal lado ficha hoja';
    m.innerHTML = '<div class="mb"><div class="pf-h"><div class="kick">/ ' + esc(titulo) + '</div><button class="pf-x" data-cerrar aria-label="Cerrar">×</button></div>' + html + '</div>';
    const cerrar = () => { if (m.classList.contains('sale')) return; m.classList.add('sale'); setTimeout(() => m.remove(), 220); document.removeEventListener('keydown', tecla); };
    const tecla = e => { if (e.key === 'Escape') cerrar(); };
    m.onclick = e => { if (e.target === m) cerrar(); }; $('[data-cerrar]', m).onclick = cerrar; document.addEventListener('keydown', tecla);
    document.body.appendChild(m); bind(m); return m;
  }
  // v9 (22/10/2026): Más ordenado en secciones con filas compactas (se ve todo de un vistazo, también en el celu)
  function vMas() {
    const nVen = vencidas().length, nF = proximasFechas(30).length, nReu = reuPend().filter(r => pasa(r.marca || S.marca)).length, nDc = dcSinVer().length;
    const f = (go, ico, n, l, alerta) => '<button class="ml-r' + (alerta ? ' alerta' : '') + '" ' + go + '><span class="ic">' + ico + '</span><span class="ml-t"><b>' + n + '</b><small>' + l + '</small></span><i class="ml-go">›</i></button>';
    const sec = (t, filas) => { const h = filas.filter(Boolean).join(''); return h ? '<div class="ml-s"><div class="ml-h">' + t + '</div><div class="ml-g">' + h + '</div></div>' : ''; };
    const anualEnNav = S.movil && S.data.anual;
    return '<div class="mas-l">' +
      sec('Tu trabajo', [
        f('data-tab="reuniones"', I.users, 'Reuniones', nReu ? nReu + ' sin fecha' : 'todas con fecha', nReu),
        esCMyo() ? '' : f('data-tab="guiones"', I.pen, 'Guiones', guionAtencion() ? guionAtencion() + ' para mirar' : 'al día', guionAtencion()),
        f('data-vencidas', I.flag, 'Vencidas', nVen ? nVen + ' pasadas de fecha' : 'nada vencido', nVen),
        esCMyo() ? '' : f('data-fechas', I.star, 'Fechas', nF + ' en 30 días'),
        linL().length ? f('data-lin', I.pin, 'Mantener', linL().length + ' pedidos fijos') : '']) +
      sec('Equipo y marcas', [
        esCMyo() ? '' : f('data-tab="equipo"', I.users, 'Equipo', 'grabaciones y entregas'),
        f('data-tab="agenda"', I.cal, 'Agenda', 'próximos 14 días'),
        f('data-tab="marcas"', I.grid, 'Marcas', 'tableros y calendario'),
        f('data-tab="recursos"', I.clip, 'Recursos', 'logos y fichas'),
        f('data-tab="colabs"', I.users, 'Colaboradores', (S.data.colabs || []).length ? (S.data.colabs || []).length + ' cargados' : 'influencers'),
        S.data.prods ? f('data-tab="prods"', I.flag, 'Producciones', (() => { const l0 = ymdL(lunesDe(NOW, 0)), l1 = ymdL(lunesDe(NOW, 1)); return S.data.prods.items.filter(x => x.fecha >= l0 && x.fecha < l1).length + ' esta semana'; })()) : '',
        S.data.anual && !anualEnNav ? f('data-tab="anual"', I.cal, 'Anual', 'calendario del año') : '']) +
      (S.movil ? sec('Para tener en cuenta', esCMyo() ? [f('data-mas-caja="0"', I.link, 'Accesos', 'Reportes, Trello, Notion')] : [
        f('data-mas-caja="0"', I.star, 'Se vienen', 'fechas próximas'),
        f('data-mas-caja="1"', I.flag, 'Sugerencias', 'qué conviene hacer'),
        f('data-mas-caja="2"', I.link, 'Accesos', 'Reportes, Trello, Notion')]) : '') +
      sec('Vos', [
        f('data-tourbtn', I.star, 'Cómo se usa', 'recorrido de 1 minuto'),
        f('data-pregunta', I.msg, 'Preguntar o avisar', 'le llega a Joaquín'),
        f('data-perfil', I.users, 'Mi perfil', 'apodo, foto y fondo'),
        S.movil ? f('data-tab="discord"', I.msg, 'Discord', nDc ? nDc + ' sin leer' : 'al día', nDc) : '']) +
      '</div>' + (S.movil ? '' : costado(true));
  }

  /* ---------------- vista AGENDA ---------------- */
  function vAgenda() {
    const dias = [];
    for (let i = 0; i < 14; i++) dias.push(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + i));
    const items = itemsAgenda(14);
    const atras = items.filter(it => diasA(it.d) < 0 && it.cl === 'card');
    return '<p class="leyenda"><span class="lg efem">✦ Fecha del calendario anual</span><span class="lg sugr">✦ Fecha sugerida por rubro</span><span class="lg fer">★ Feriado</span><span class="lg">Tocá cualquier fecha o tarjeta para ver el detalle</span></p>' +
      (atras.length ? '<div class="day today"><div class="dd">!<small>vencidas</small></div><div>' + atras.map(it => '<div class="ag card"><span class="h">' + cuando(it.d) + '</span><span class="x">' + it.x + '</span>' + it.k + '</div>').join('') + '</div></div>' : '') +
      // hoy y mañana a la vista; el resto de la semana y lo de más adelante, en carpetas (para no tener que bajar tanto)
      (() => {
        const cuenta = L => L.reduce((s, d) => s + items.filter(it => diasA(it.d) === diasA(d)).length, 0);
        const cerca = dias.filter(d => diasA(d) <= 1), resto = dias.filter(d => diasA(d) > 1 && d < lunesDe(NOW, 1)), despues = dias.filter(d => diasA(d) > 1 && d >= lunesDe(NOW, 1));
        const carpeta = (id, tit, L) => { const h = L.map(diaAg).join(''); return h ? tarjeta(id, tit, cuenta(L), '', false, () => '<div class="ag-carp">' + h + '</div>', I.cal) : ''; };
        return cerca.map(diaAg).join('') + carpeta('ag-resto', 'Resto de esta semana', resto) + carpeta('ag-desp', 'La semana que viene y después', despues);
      })();
    function diaAg(d) {
        const de = items.filter(it => diasA(it.d) === diasA(d)).sort((a, b) => a.h.localeCompare(b.h));
        const wk = d.getDay() === 0 || d.getDay() === 6;
        if (wk && !de.length) return '';
        return'<div class="day' + (diasA(d) === 0 ? ' today' : '') + (wk ? ' weekend' : '') + '"><div class="dd">' + d.getDate() + '<small>' + (diasA(d) === 0 ? 'hoy' : diasA(d) === 1 ? 'mañana' : DIAS[d.getDay()]) + '</small></div><div>' + (de.length ? de.map(it => '<div class="ag ' + it.cl + '"><span class="h">' + it.h + '</span><span class="x">' + it.x + '</span>' + it.k + '</div>').join('') : '<div class="ag"><span class="h"></span><span class="x" style="color:var(--dim)">Sin entregas</span></div>') + '</div></div>';
    }
  }

  /* ---------------- vista RECURSOS ---------------- */
  /* ---------------- COLABORADORES por marca (influencers, cuentas afines) (pedido de Joaquín, 20/10/2026) ---------------- */
  const COLAB_EST = { contactar: ['#8C8C8C', 'Por contactar'], contactado: ['#FFB454', 'Contactado'], acepto: ['#5CE38A', 'Aceptó'], rechazo: ['#FF6B6B', 'No aceptó'], publicado: ['#6FC3FF', 'Publicado'] };
  function vColabs() {
    const L = (S.data.colabs || []).filter(c => pasa([c.marca])), g = {};
    L.forEach(c => (g[c.marca] = g[c.marca] || []).push(c));
    const fila = c => { const e = COLAB_EST[c.estado] || COLAB_EST.contactar, ig = String(c.usuario || '').replace(/^@/, '');
      return '<div class="row"><span class="ico">' + I.users + '</span><div><div class="tt"><b>' + esc(c.nombre || c.usuario) + '</b>' + (c.usuario ? ' <a class="lnk" href="https://instagram.com/' + esc(ig) + '" target="_blank" rel="noopener" style="color:var(--muted)">@' + esc(ig) + '</a>' : '') + ' <span class="pill" style="background:' + e[0] + '22;color:' + e[0] + '">' + e[1] + '</span></div>' +
        '<div class="mt">' + [c.rubro, c.seguidores ? c.seguidores + ' seguidores' : '', c.campana, c.fecha ? 'para el ' + dm(new Date(c.fecha + 'T12:00:00')) : '', c.contacto].filter(Boolean).map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' +
        (c.propuesta ? '<div class="hint">' + esc(c.propuesta) + '</div>' : '') + '</div><div><button class="btn" data-colab-ed="' + esc(c.marca + '|' + c.id) + '">Editar</button></div></div>'; };
    return '<div class="sec"><div class="sec-h"><h2>Cargados<small>' + L.length + '</small></h2><button class="btn y" data-colab-ed="">＋ Sumar colaborador</button></div>' +
      '<p class="sub" style="margin:0 0 12px;color:var(--muted)">Influencers, emprendedores o cuentas afines para colaborar en campañas: quiénes son, qué se les propone y en qué quedó.</p>' +
      (L.length ? Object.keys(g).map(s => '<div class="sec"><div class="sec-h"><h2 style="font-size:16px"><span class="dotm" style="background:' + color(s) + '"></span> ' + esc((marca(s) || {}).nombre || s) + '<small>' + g[s].length + '</small></h2></div><div class="list">' + g[s].map(fila).join('') + '</div></div>').join('')
        : '<div class="empty">Todavía no cargaste colaboradores. Tocá "＋ Sumar colaborador".</div>') + '</div>';
  }
  function editarColab(clave) {
    const [slug0, id] = String(clave || '').split('|'), c = (S.data.colabs || []).find(x => x.marca === slug0 && x.id === id) || { estado: 'contactar' };
    const marcas = S.data.marcas.filter(m => pasa([m.slug])), f = (i, l, ph, v, t) => '<label class="field"><span>' + l + '</span><input id="' + i + '"' + (t ? ' type="' + t + '"' : '') + ' placeholder="' + esc(ph) + '" value="' + esc(v || '') + '"></label>';
    const m = modal('<h3>' + (c.id ? 'Editar colaborador' : 'Sumar colaborador') + '</h3>' +
      '<label class="field"><span>Marca</span><select id="kM"' + (c.id ? ' disabled' : '') + '>' + marcas.map(x => '<option value="' + esc(x.slug) + '"' + (x.slug === (c.marca || (S.marca !== 'todas' ? S.marca : '')) ? ' selected' : '') + '>' + esc(x.nombre) + '</option>').join('') + '</select></label>' +
      '<div class="two">' + f('kN', 'Nombre', 'Ej.: Sofi Gastro', c.nombre) + f('kU', 'Usuario de Instagram', '@usuario', c.usuario) + '</div>' +
      '<div class="two">' + f('kR', 'Rubro', 'Ej.: gastronomía local', c.rubro) + f('kS', 'Seguidores', 'Ej.: 25.000', c.seguidores) + '</div>' +
      f('kC', 'Contacto', 'Mail, WhatsApp o "por MD"', c.contacto) +
      '<div class="two">' + f('kP', 'Campaña', 'Ej.: Día del Sándwich', c.campana) + f('kF', 'Para cuándo', '', c.fecha, 'date') + '</div>' +
      '<label class="field"><span>Qué se le propone</span><textarea id="kX" rows="3" placeholder="Ej.: le mandamos una caja para que la pruebe y suba un reel en colaboración">' + esc(c.propuesta || '') + '</textarea></label>' +
      '<label class="field"><span>Estado</span><select id="kE">' + Object.keys(COLAB_EST).map(k => '<option value="' + k + '"' + (c.estado === k ? ' selected' : '') + '>' + COLAB_EST[k][1] + '</option>').join('') + '</select></label><div class="err"></div>' +
      '<div class="acts">' + (c.id ? '<button class="btn ghost" data-borrar style="margin-right:auto;color:var(--bad)">Borrar</button>' : '') + '<button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Guardar</button></div>', async mm => {
      const v = s => $(s, mm).value;
      const r = await post({ action: 'colab', accion: 'guardar', marca: c.marca || v('#kM'), colab: { id: c.id, nombre: v('#kN'), usuario: v('#kU'), rubro: v('#kR'), seguidores: v('#kS'), contacto: v('#kC'), campana: v('#kP'), fecha: v('#kF'), propuesta: v('#kX'), estado: v('#kE') } });
      S.data.colabs = r.colabs || S.data.colabs; render(); toast('✓ Guardado');
    });
    const bb = $('[data-borrar]', m);
    if (bb) bb.onclick = async () => { if (!confirm('¿Borrar a ' + (c.nombre || c.usuario) + '?')) return; try { const r = await post({ action: 'colab', accion: 'borrar', marca: c.marca, id: c.id }); S.data.colabs = r.colabs || S.data.colabs; m.remove(); render(); toast('Borrado'); } catch (e) { $('.err', m).textContent = e.message; } };
  }

  function vRecursos() {
    const f = S.filtroRes.toLowerCase();
    const L = S.data.cards.filter(c => ['recursos', 'fichas', 'datos', 'standby'].indexOf(c.cat) >= 0 && pasa(c.m) && (!f || (c.n + ' ' + c.d + ' ' + c.att.map(a => a.n).join(' ')).toLowerCase().includes(f)));
    const porMarca = {}; L.forEach(c => (porMarca[c.m[0]] = porMarca[c.m[0]] || []).push(c));
    // dentro de cada marca, agrupado por tipo de material
    const TIPOS_RES = [['logos', 'Logos e identidad', /logo|isotipo|imagotipo|identidad|manual|tipograf|paleta|brand/], ['menus', 'Menús, precios y catálogos', /men[uú]|carta|precio|catalog|lista de|tarifa/], ['fotos', 'Fotos y videos', /foto|video|imagen|banco|render|sesion|sesión/], ['otros', 'Otros', /./]];
    const tipoRes = c => c.cat === 'fichas' ? ['fichas', 'Fichas técnicas'] : c.cat === 'datos' ? ['datos', 'Datos de la marca'] : c.cat === 'standby' ? ['standby', 'Para más adelante'] : TIPOS_RES.find(t => t[2].test((c.n + ' ' + c.d + ' ' + c.att.map(a => a.n).join(' ')).toLowerCase())).slice(0, 2);
    const fila = c => '<div class="rrow"><div><a class="n" href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.n) + ' <span>↗</span></a>' + (c.att.length ? '<div class="att">' + c.att.map(a => '<a href="' + esc(a.u) + '" target="_blank" rel="noopener">' + I.clip + esc(a.n) + '</a>').join('') + '</div>' : '') + '</div></div>';
    const marcas = Object.keys(porMarca), todoAbierto = !!f || marcas.length === 1;
    S.resAb = S.resAb || {};
    const bloque = s => {
      const ab = todoAbierto || S.resAb[s], grupos = {};
      porMarca[s].forEach(c => { const t = tipoRes(c); (grupos[t[1]] = grupos[t[1]] || []).push(c); });
      const orden = ['Datos de la marca', 'Para más adelante', 'Logos e identidad', 'Fichas técnicas', 'Menús, precios y catálogos', 'Fotos y videos', 'Otros'].filter(t => grupos[t]);
      return '<div class="rbox' + (ab ? ' on' : '') + '"><button class="rhead" data-res-m="' + esc(s) + '"><span class="dotm" style="background:' + color(s) + '"></span><b>' + esc((marca(s) || {}).nombre || s) + '</b><span class="rchips">' + orden.map(t => '<em>' + t.split(/[ ,]/)[0] + ' ' + grupos[t].length + '</em>').join('') + '</span><i>' + (ab ? '−' : '+') + '</i></button>' +
        (ab ? '<div class="rbody">' + orden.map(t => '<div class="dw-l">' + t + '</div>' + grupos[t].map(fila).join('')).join('') + '</div>' : '') + '</div>';
    };
    return '<div style="display:flex;gap:8px;align-items:center"><input class="search" id="qres" style="flex:1" placeholder="Buscar logo, manual, ficha, menú…" value="' + esc(S.filtroRes) + '"><button class="btn y" data-subir-rec style="white-space:nowrap">＋ Subir recurso</button></div>' +
      (marcas.length ? marcas.map(bloque).join('') : '<div class="empty">' + (f ? 'No encontré nada con "' + esc(S.filtroRes) + '".' : 'Todavía no hay recursos corporativos ni fichas técnicas en los tableros SCL.') + '</div>');
  }

  /* ---------------- CALENDARIO ANUAL por marca ----------------
     El calendario anual de cada marca (el documento que está en Recursos Corporativos del SCL), mes por mes desde hoy. */
  function vAnual() {
    const SD = S.data || S.proj || {}, A = (SD.anual || {}).marcas || {};
    const NIV = { 0: ['Reunión de equipo', ''], 1: ['Campaña mayor', 'bad'], 2: ['Campaña especial', 'warn'], 3: ['Publicación o historias', 'ok'], 4: ['Mención', ''], 5: ['🎂 Cumpleaños', 'y'] };
    const slugs = S.data ? S.data.marcas.map(m => m.slug).filter(s => pasa([s])) : (SD.marcas || []).map(m => m.slug);
    const mesHoy = NOW.getMonth(), dd = n => ('0' + n).slice(-2), MES = MESES.map(m => m.charAt(0).toUpperCase() + m.slice(1));
    const primera = slugs.filter(x => A[x] && A[x].items && A[x].items.length)[0];
    // v5 (22/10/2026): una pestaña por marca y, adentro, los 12 meses como botones: se ve un mes por vez (antes, todo abierto en cascada)
    if (!slugs.length) return '<div class="empty">No tenés marcas asignadas.</div>';
    let sel = LS.get('anmarca', ''); if (slugs.indexOf(sel) < 0) sel = primera || slugs[0];
    const o = A[sel], n = o && o.items ? o.items.length : 0;
    const mesSel = S.anMes != null ? S.anMes : mesHoy;
    const tabs = '<div class="gtabs an-tabs" role="tablist">' + slugs.map((s, i) => { const x = A[s], c = x && x.items ? x.items.length : 0, cm = c ? x.items.filter(y => y.mes === mesHoy).length : 0;
      return '<button role="tab" aria-selected="' + (s === sel) + '" class="gtab' + (s === sel ? ' on' : '') + '" data-anm="' + esc(s) + '"><i class="gtab-n"><span class="an-dot" style="background:' + color(s) + '"></span>' + (cm ? cm + ' este mes' : c ? '' : 'sin cargar') + '</i><span class="gtab-t">' + esc((marca(s) || {}).nombre || s) + '</span><b>' + c + '</b></button>'; }).join('') + '</div>';
    if (!n) return tabs + '<div class="gpanel"><div class="empty">Esta marca todavía no tiene calendario anual leído' + (o && o.nota ? ' (' + esc(o.nota) + ')' : '') + '. Tiene que haber una tarjeta "Calendario anual" en Recursos Corporativos del tablero SCL, con el link al documento de Google.</div></div>';
    const meses = [...Array(12)].map((_, i) => (mesHoy + i) % 12);
    const L = o.items.filter(x => x.mes === mesSel).sort((a, b) => a.dia - b.dia);
    return tabs + '<div class="gpanel an-panel"><div class="an-meses">' + meses.map(mm => { const c = o.items.filter(x => x.mes === mm).length;
        return '<button class="' + (mm === mesSel ? 'on' : '') + (c ? '' : ' vacio') + '" data-anmes="' + mm + '"><span>' + MES[mm].slice(0, 3) + '</span><b>' + (c || '·') + '</b></button>'; }).join('') + '</div>' +
      '<div class="an-tit"><b>' + MES[mesSel] + '</b>' + (mesSel === mesHoy ? '<small>este mes</small>' : mesSel === (mesHoy + 1) % 12 ? '<small>el mes que viene</small>' : '') + '</div>' +
      (L.length ? '<div class="fl-list">' + L.map(x => '<div class="fl-r an-r"><b class="an-d">' + dd(x.dia) + '/' + dd(mesSel + 1) + '</b><div class="fl-t"><b class="an-n">' + esc(x.nombre) + '</b><div class="fl-m"><span class="pill ' + NIV[x.nivel][1] + '">' + NIV[x.nivel][0] + '</span>' + (x.accion ? '<span>' + esc(x.accion) + '</span>' : '') + '</div></div></div>').join('') + '</div>' : '<div class="empty">Sin fechas en ' + MES[mesSel].toLowerCase() + '.</div>') +
      '<p class="ayuda">' + (o.metas && o.metas.length ? '<b>Metas del semestre:</b> ' + o.metas.map(esc).join(' · ') + '<br>' : '') + (o.url ? '<a class="lnk" href="' + esc(o.url) + '" target="_blank" rel="noopener">Abrir el calendario anual ↗</a>' : '') + (o.okr ? ' · <a class="lnk" href="' + esc(o.okr) + '" target="_blank" rel="noopener">Abrir los OKR ↗</a>' : '') + ' · Las campañas mayores se planifican 30 días hábiles antes y las especiales 20.</p></div>';
  }

  /* ---------------- vista MARCAS ---------------- */
  function vMarcas() {
    const D = S.data, nom = { scl: 'SCL', cm: 'CM', diseno: 'Diseño', produccion: 'Producción', guiones: 'Guiones' };
    const L = D.marcas.filter(m => pasa(m.slug));
    // una card cerrada por marca: en el título va la barra del calendario cargado; adentro, tableros, contadores y fechas
    return '<p class="ayuda" style="margin:0 0 12px">Tocá una marca para ver sus tableros, hasta dónde está cargado el calendario y las fechas que le sirven.</p><div class="mlist">' + L.map(m => {
      const cv = (D.cobertura || {})[m.slug] || {}, cs = D.cards.filter(c => c.m[0] === m.slug);
      const nInp = cs.filter(c => c.cat === 'input' && (!c.tipo || c.tipo === 'scl') && inputPide(c)).length, nCorr = cs.filter(c => c.cat === 'corr').length, nVen = cs.filter(c => ['trabajo', 'urgente', 'espera'].includes(c.cat)).length;
      let pct = 4, cl = 'bad', txt = 'Sin fechas cargadas en el calendario editorial.', falta = 99;
      if (cv.hasta) {
        const total = Math.max(1, Math.round((ymdD(cv.objetivo) - sod(NOW)) / 864e5)), lleno = Math.round((ymdD(cv.hasta) - sod(NOW)) / 864e5);
        pct = Math.max(3, Math.min(100, Math.round(lleno / total * 100))); falta = total - lleno; cl = falta > 7 ? 'bad' : falta > 0 ? 'warn' : 'ok';
        txt = 'Calendario cargado hasta el <b>' + dm(ymdD(cv.hasta)) + '</b>' + (cv.entrega ? ' · en la entrega del ' + dm(ymdD(cv.entrega)) + ' tiene que llegar al <b>' + dm(ymdD(cv.objetivo)) + '</b>' : ' · objetivo <b>' + dm(ymdD(cv.objetivo)) + '</b>') + (falta > 0 ? ' · <span class="rojo">faltan ' + falta + ' días</span>' : ' · ✓ cubierto');
      }
      const k = 'mk:' + m.slug, abierta = S.abiertos[k] != null ? S.abiertos[k] : L.length === 1;
      const fm = proximasFechas(60).filter(f => f.marcas.indexOf(m.slug) >= 0).slice(0, 4);
      return '<div class="mcar mk' + (abierta ? ' on' : '') + '"><button class="mcar-h" data-mcar="' + k + '" data-abierta="' + (abierta ? 1 : 0) + '"><span class="dotm" style="background:' + color(m.slug) + '"></span><b>' + esc(m.nombre) + '</b>' +
        '<span class="mk-bar ' + cl + '"><i style="width:' + pct + '%"></i></span><small>' + (cv.hasta ? 'hasta ' + dm(ymdD(cv.hasta)) : 'sin calendario') + '</small>' + (nInp + nCorr ? '<em>' + (nInp ? nInp + ' input' + (nInp > 1 ? 's' : '') : '') + (nInp && nCorr ? ' · ' : '') + (nCorr ? nCorr + ' correc.' : '') + '</em>' : '') + '<i>' + (abierta ? '−' : '+') + '</i></button>' +
        (abierta ? '<div class="mk-b"><p class="mk-cov">' + txt + '</p>' +
          '<div class="stats"><div><b>' + nInp + '</b><small>inputs</small></div><div><b>' + nCorr + '</b><small>correcciones</small></div><div><b>' + nVen + '</b><small>por vencer</small></div></div>' +
          '<div class="boards">' + m.tableros.map(b => '<a href="' + esc(b.url) + '" target="_blank" rel="noopener">' + (nom[b.tipo] || b.tipo) + ' ↗</a>').join('') + '</div>' +
          (fm.length ? '<div class="dw-l" style="margin-top:14px">Fechas que le sirven · 60 días</div>' + fm.map(f => '<button class="fecha mini" data-fecha="' + esc(fkey(f)) + '"><span class="fd"><b>' + f.d.getDate() + '</b><small>' + MESES[f.d.getMonth()].slice(0, 3) + '</small></span><span class="fn">' + esc(f.n) + '<small>' + (f.tipo === 'sugerida' ? 'sugerida por rubro' : f.enCalendario ? 'en el calendario' : 'en Trello · falta en el calendario') + '</small></span></button>').join('') : '') +
          '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }

  /* ---------------- vista PROJECT ---------------- */
  /* ---------------- MI DÍA (project): su tablero Project de Trello ----------------
     Complemento del tablero, no lo reemplaza: acá se ve qué procesar y se carga rápido; todo vive en Trello. */
  const colorEt = c => COLOR_TRELLO[String(c || '').replace(/_(dark|light)$/, '')] || '#8590A2';
  function datosMio() {
    const M = S.proj.mio || {}, f = S.projMarca || '';
    const vivas = (M.cards || []).filter(c => c.k !== 'listo' && (!f || c.lab.indexOf(f) >= 0));
    const conFecha = vivas.filter(c => c.due && !c.dc), dd = c => diasA(new Date(c.due));
    const porFecha = (a, b) => new Date(a.due) - new Date(b.due);
    const diasQuieta = c => Math.floor(((DEMO ? NOW.getTime() : Date.now()) - new Date(c.act).getTime()) / 864e5);
    return {
      M, vivas, diasQuieta,
      bandeja: vivas.filter(c => c.k === 'bandeja'),
      hoy: conFecha.filter(c => dd(c) <= 0).sort(porFecha),
      semana: conFecha.filter(c => dd(c) >= 1 && dd(c) <= 7).sort(porFecha),
      seguimiento: vivas.filter(c => c.k === 'seguimiento' && diasQuieta(c) >= (M.dias || 3)).sort((a, b) => new Date(a.act) - new Date(b.act)),
      sinFecha: vivas.filter(c => !c.due && c.k !== 'bandeja' && c.k !== 'despues'),
      // lista "Para más adelante": cosas para preguntar o ver en otro momento; con fecha, ese día aparecen en "Para hoy"
      despues: vivas.filter(c => c.k === 'despues').sort((a, b) => new Date(a.due || 9e15) - new Date(b.due || 9e15)),
      // temas para llevar a la minuta con los social media: cualquier tarjeta con la etiqueta "Ver en minuta", esté en la lista que esté
      minuta: vivas.filter(c => c.lab.some(x => /minuta/i.test(x)))
    };
  }
  function vistaMio() {
    const P = S.proj, M = P.mio;
    if (!M) return '<div class="empty">Todavía no llegó tu tablero. Tocá ↻ arriba.</div>';
    if (M.error) return '<div class="estado-av bad"><span class="ei">!</span><div><b>No pude leer tu tablero Project de Trello:</b> ' + esc(M.error) + '. La vista del equipo sigue funcionando.</div><button class="btn ghost" data-mio-rf>Reintentar</button></div>';
    const D = datosMio(), marcas = (M.etiquetas || []).filter(e => e.marca);
    const et = n => { const e = (M.etiquetas || []).find(x => x.n === n); return '<span class="mio-et' + (/^urgente$/i.test(n) ? ' urg' : '') + '"><i style="background:' + colorEt(e && e.c) + '"></i>' + esc(n) + '</span>'; };
    // cada tarjeta: el círculo la pasa a Listo, tocarla abre su ficha (etapa, fecha, etiquetas, comentar) y ↗ la abre en Trello
    const fila = (c, extra) => '<div class="mio-r" data-mio-card="' + esc(c.id) + '" role="button" tabindex="0"><button class="mio-ok" data-mio-listo="' + esc(c.id) + '" title="Pasar a Listo" aria-label="Pasar a Listo">' + I.check + '</button><div class="mio-t"><b>' + esc(c.n) + '</b><div class="mio-m">' + c.lab.map(et).join('') + '<span class="mio-l">' + esc(c.lista) + '</span>' + (extra || '') + '</div></div><a class="mio-go" href="' + esc(c.url) + '" target="_blank" rel="noopener" title="Abrir en Trello" aria-label="Abrir en Trello">↗</a></div>';
    const vence = c => { const n = diasA(new Date(c.due)); return '<span class="pill ' + (n < 0 ? 'bad' : n === 0 ? 'warn' : '') + '">' + (n < 0 ? '' : 'vence ') + cuando(new Date(c.due)) + '</span>'; };
    const dq = M.dias || 3;
    // v4 (22/10/2026): los números de arriba SON las pestañas: se ve una lista por vez (antes eran 7 carpetas una abajo de la otra)
    // [id, nombre, lista, cómo se dibuja cada fila, qué hacer (una línea), si está vacía, color del número]
    const G = [
      ['bandeja', 'Bandeja', D.bandeja, c => fila(c, c.due ? vence(c) : ''), 'Lo recién cargado. Pasalo a "Por hacer" en Trello.', 'Bandeja vacía. Todo procesado.', 'y'],
      ['hoy', 'Para hoy', D.hoy, c => fila(c, vence(c)), 'Con fecha de hoy o ya vencida, de cualquier lista.', 'Nada vence hoy.', 'bad'],
      ['minuta', 'Minuta', D.minuta, c => fila(c, c.due ? vence(c) : ''), 'Etiqueta "Ver en minuta". Cuando lo vean, sacale la etiqueta.', 'Nada para la minuta. Ponele la etiqueta "Ver en minuta" en Trello a lo que quieras tratar.', 'y'],
      ['semana', '7 días', D.semana, c => fila(c, vence(c)), 'Lo que vence esta semana.', 'Nada vence en los próximos 7 días.', ''],
      ['seguimiento', 'Seguimiento', D.seguimiento, c => fila(c, '<span class="pill warn">' + D.diasQuieta(c) + ' días quieta</span>'), 'Enviadas que nadie movió hace ' + dq + ' días o más: reclamalas.', 'Nada frenado hace ' + dq + ' días o más.', 'warn'],
      ['sinfecha', 'Sin fecha', D.sinFecha, c => fila(c), 'En "Por hacer" o "En proceso" sin fecha: ponésela en Trello.', 'Todas tienen fecha.', 'warn'],
      ['despues', 'Más adelante', D.despues, c => fila(c), 'Guardado para después. Con fecha, ese día aparece en "Para hoy".', 'No guardaste nada para más adelante.', '']
    ];
    let sel = LS.get('miosel', '');
    if (!G.some(g => g[0] === sel)) sel = (G.find(g => g[2].length && ['bandeja', 'hoy', 'minuta'].indexOf(g[0]) >= 0) || G[1])[0];
    const g0 = G.find(g => g[0] === sel);
    const leido = minutosDesde(M.leido);
    return (!DEMO && leido != null && leido > 30 ? '<div class="aviso-linea"><span>Tu tablero se leyó hace ' + (leido < 120 ? leido + ' min' : Math.round(leido / 60) + ' h') + '.</span><button data-mio-rf>Leer ahora</button></div>' : '') +
      '<div class="mio-top"><div class="chips mio-chips"><button class="chip' + (!S.projMarca ? ' on' : '') + '" data-mio-marca="">Todas</button>' + marcas.map(e => '<button class="chip' + (S.projMarca === e.n ? ' on' : '') + '" data-mio-marca="' + esc(e.n) + '"><span class="dot" style="background:' + colorEt(e.c) + '"></span>' + esc(e.n) + '</button>').join('') + '</div>' +
      '<button class="btn y mio-add" data-mio-nuevo>+ Pedido</button></div>' +
      '<div class="gtabs mio-tabs" role="tablist">' + G.map((g, i) => '<button role="tab" aria-selected="' + (g[0] === sel) + '" class="gtab' + (g[0] === sel ? ' on' : '') + (g[2].length && g[6] ? ' t-' + g[6] : '') + '" data-mio-ir="' + g[0] + '"><i class="gtab-n">' + String(i + 1).padStart(2, '0') + '</i><span class="gtab-t">' + g[1] + '</span><b>' + g[2].length + '</b></button>').join('') + '</div>' +
      '<div class="gpanel mio-panel" role="tabpanel"><p class="mio-hint">' + g0[4] + '</p>' + (g0[2].length ? '<div class="mio-list">' + g0[2].map(g0[3]).join('') + '</div>' : '<div class="empty">' + g0[5] + '</div>') + '</div>' +
      '<p class="ayuda">Tocá una tarjeta para cambiarle la etapa, la fecha o las etiquetas, o comentarla; el círculo la pasa a Listo. Todo queda en tu tablero <a class="lnk" href="' + esc(M.url || '#') + '" target="_blank" rel="noopener">Project de Trello ↗</a>.</p>';
  }
  /* ---------------- tarjetas de Project que se pueden tocar (22/10/2026) ----------------
     El círculo de la izquierda la pasa a Listo (con "Deshacer"); tocar la tarjeta abre su ficha, desde donde se cambia
     la etapa, la fecha, las etiquetas "Ver en minuta" y "Urgente", y se comenta. Todo va directo al tablero Project de Trello. */
  const ETAPAS = [['bandeja', 'Bandeja'], ['hacer', 'Por hacer'], ['proceso', 'En proceso'], ['seguimiento', 'Enviado'], ['despues', 'Más adelante'], ['listo', 'Listo']];
  function mioLocal(c, b) {
    const M = S.proj.mio || {};
    if (b.op === 'mover') { c.k = b.etapa; c.lista = ((M.listas || []).find(l => l.k === b.etapa) || {}).n || (ETAPAS.find(e => e[0] === b.etapa) || [])[1] || c.lista; c.act = new Date().toISOString(); }
    if (b.op === 'fecha') c.due = b.due || null;
    if (b.op === 'enviar') { const a = { diseno: 'A diseño', sm: 'A social media', foto: 'A producción' }[b.destino]; if (a) { c.lista = a; c.k = 'otra'; } else { c.k = 'seguimiento'; c.lista = ((M.listas || []).find(l => l.k === 'seguimiento') || {}).n || 'Enviado'; } }
    if (b.op === 'etiqueta') { const re = b.cual === 'urgente' ? /^urgente$/i : /minuta/i, ya = c.lab.find(x => re.test(x)); c.lab = ya ? c.lab.filter(x => x !== ya) : c.lab.concat(b.cual === 'urgente' ? 'Urgente' : 'Ver en minuta'); }
  }
  async function mioHacer(id, b) {
    const L = (S.proj.mio || {}).cards || [], c = L.find(x => x.id === id); if (!c) return null;
    const antes = JSON.parse(JSON.stringify(c));
    mioLocal(c, b); render();   // se ve al instante; si Trello falla, vuelve como estaba
    try {
      const r = await post(Object.assign({ action: 'mioAccion', k: S.pkey || S.key, cardId: id }, b));
      if (r && r.card) Object.assign(c, r.card);
      try { localStorage.setItem('pi:cache:__project', JSON.stringify(S.proj)); } catch (e) {}
      render(); return { antes, r };
    } catch (e) { Object.assign(c, antes); render(); toast('✗ ' + esc(e.message || 'No se pudo')); throw e; }
  }
  async function mioListo(id) {
    const c = ((S.proj.mio || {}).cards || []).find(x => x.id === id); if (!c) return;
    const previa = c.k;
    try { await mioHacer(id, { op: 'mover', etapa: 'listo' }); toast('✓ "' + esc(c.n.slice(0, 50)) + '" pasó a Listo', () => mioHacer(id, { op: 'mover', etapa: previa }).catch(() => {})); } catch (e) {}
  }
  // ventana lateral (en el celu ocupa toda la pantalla y entra desde la derecha) con la ficha de la tarjeta
  function mioFicha(id) {
    const M = S.proj.mio || {}, c = (M.cards || []).find(x => x.id === id); if (!c) return;
    const et = ETAPAS.filter(e => !M.listas || M.listas.some(l => l.k === e[0]));
    const dia = n => ymdL(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n)), hasta5 = (5 - NOW.getDay() + 7) % 7 || 7;
    const etq = n => { const e = (M.etiquetas || []).find(x => x.n === n); return '<span class="mio-et' + (/^urgente$/i.test(n) ? ' urg' : '') + '"><i style="background:' + colorEt(e && e.c) + '"></i>' + esc(n) + '</span>'; };
    const m = document.createElement('div'); m.className = 'modal lado ficha';
    const pintar = () => {
      const f = c.due ? ymdL(new Date(c.due)) : '', tMin = c.lab.some(x => /minuta/i.test(x)), tUrg = c.lab.some(x => /^urgente$/i.test(x));
      m.innerHTML = '<div class="mb"><div class="pf-h"><div class="kick">/ Tarjeta · ' + esc(c.lista) + '</div><button class="pf-x" data-cerrar aria-label="Cerrar">×</button></div>' +
        '<h3 class="fi-t">' + esc(c.n) + '</h3>' + (c.lab.length ? '<div class="mio-m">' + c.lab.map(etq).join('') + '</div>' : '') + (c.d ? '<p class="fi-d">' + escL(c.d) + '</p>' : '') +
        '<span class="lbl">Etapa</span><div class="fi-bt">' + et.map(e => '<button class="' + (c.k === e[0] ? 'on' : '') + (e[0] === 'listo' ? ' ok' : '') + '" data-fi-et="' + e[0] + '">' + e[1] + '</button>').join('') + '</div>' +
        '<span class="lbl">Fecha' + (c.due ? ' · ' + cuando(new Date(c.due)) : '') + '</span><div class="fi-bt"><button class="' + (f === dia(0) ? 'on' : '') + '" data-fi-f="' + dia(0) + '">Hoy</button><button class="' + (f === dia(1) ? 'on' : '') + '" data-fi-f="' + dia(1) + '">Mañana</button><button class="' + (f === dia(hasta5) ? 'on' : '') + '" data-fi-f="' + dia(hasta5) + '">Viernes</button><label class="fi-cal"><input type="date" value="' + f + '" data-fi-fd></label><button class="' + (!f ? 'on' : '') + '" data-fi-f="">Sin fecha</button></div>' +
        '<span class="lbl">Etiquetas</span><div class="fi-bt"><button class="' + (tMin ? 'on' : '') + '" data-fi-lb="minuta">Ver en minuta</button><button class="' + (tUrg ? 'on bad' : '') + '" data-fi-lb="urgente">Urgente</button></div>' +
        '<span class="lbl">Enviar a</span><div class="fi-bt fi-env">' + [['diseno', 'Diseño'], ['sm', 'Social media'], ['foto', 'Fotografía'], ['reel', 'Reel'], ['historia', 'Historia']].map(x => '<button data-fi-env="' + x[0] + '">' + x[1] + '</button>').join('') + '</div><small class="fi-ayu">Reel e historia se copian a Producción de la marca; lo demás pasa a su lista del Project y sigue la automatización de siempre.</small>' +
        '<span class="lbl">Comentar</span><div class="fi-c"><textarea id="fiC" rows="2" maxlength="2000" placeholder="Queda como comentario en la tarjeta de Trello"></textarea><button class="btn y" data-fi-com>Comentar</button></div>' +
        '<div class="err"></div><div class="acts"><a class="btn ghost" href="' + esc(c.url) + '" target="_blank" rel="noopener">Abrir en Trello ↗</a></div></div>';
      const hacer = async b => { m.querySelectorAll('button,input,textarea').forEach(x => x.disabled = true); $('.err', m).textContent = ''; try { const r = await mioHacer(c.id, b); if (r && r.r && r.r.pasos) toast('✓ ' + r.r.pasos.map(esc).join(' · ')); } catch (e) { } pintar(); };
      $('[data-cerrar]', m).onclick = cerrar;
      m.querySelectorAll('[data-fi-et]').forEach(b => b.onclick = () => { if (b.dataset.fiEt !== c.k) hacer({ op: 'mover', etapa: b.dataset.fiEt }); });
      m.querySelectorAll('[data-fi-f]').forEach(b => b.onclick = () => hacer({ op: 'fecha', due: b.dataset.fiF ? b.dataset.fiF + 'T18:00:00-03:00' : '' }));
      $('[data-fi-fd]', m).onchange = e => { if (e.target.value) hacer({ op: 'fecha', due: e.target.value + 'T18:00:00-03:00' }); };
      m.querySelectorAll('[data-fi-lb]').forEach(b => b.onclick = () => hacer({ op: 'etiqueta', cual: b.dataset.fiLb }));
      m.querySelectorAll('[data-fi-env]').forEach(b => b.onclick = () => hacer({ op: 'enviar', destino: b.dataset.fiEnv }));
      $('[data-fi-com]', m).onclick = async () => { const t = $('#fiC', m).value.trim(); if (!t) return $('#fiC', m).focus(); await hacer({ op: 'comentar', texto: t }); };
    };
    const cerrar = () => { if (m.classList.contains('sale')) return; m.classList.add('sale'); setTimeout(() => m.remove(), 220); document.removeEventListener('keydown', tecla); };
    const tecla = e => { if (e.key === 'Escape') cerrar(); };
    m.onclick = e => { if (e.target === m) cerrar(); };
    document.addEventListener('keydown', tecla);
    pintar(); document.body.appendChild(m);
  }
  async function refrescarMio(silencioso) {
    if (DEMO || S.sync) return;
    S.sync = true; renderTop();
    try {
      const j = await get({ action: 'mio', k: S.pkey || S.key });
      if (j.error) throw new Error(j.mensaje || j.error);
      S.proj.mio = j.mio; try { localStorage.setItem('pi:cache:__project', JSON.stringify(S.proj)); } catch (e) {}
      if (!silencioso) toast('✓ Tablero Project leído recién.');
    } catch (e) { toast('✗ No pude leer tu tablero: ' + esc(e.message || 'sin conexión') + '. Estás viendo lo anterior.'); }
    S.sync = false; render();
  }
  // Carga rápida: marca, qué es, para cuándo, urgente. Entra siempre a Bandeja (lo decide el servidor).
  function nuevoPedido() {
    const M = S.proj.mio || {}, marcas = (M.etiquetas || []).filter(e => e.marca);
    const iso = n => { const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
    const m = modal('<h3>Nuevo pedido</h3><p>Entra a <b>Bandeja</b> de tu tablero Project (o a <b>Para más adelante</b> si tildás esa casilla: ponele fecha y ese día te aparece). Después lo procesás desde Trello.</p>' +
      '<label class="field"><span>Qué es</span><input id="npT" maxlength="300" placeholder="Ej.: Pasar fotos nuevas del local a diseño"></label>' +
      '<div class="field"><span>Marca</span><div class="np-ms" id="npM"><button type="button" class="chip on" data-np-m="">Sin marca</button>' + marcas.map(e => '<button type="button" class="chip" data-np-m="' + esc(e.id) + '"><span class="dot" style="background:' + colorEt(e.c) + '"></span>' + esc(e.n) + '</button>').join('') + '</div></div>' +
      '<div class="field"><span>Para cuándo</span><div class="np-f"><input type="date" id="npF"><button type="button" class="chip" data-np-f="' + iso(0) + '">Hoy</button><button type="button" class="chip" data-np-f="' + iso(1) + '">Mañana</button><button type="button" class="chip" data-np-f="">Sin fecha</button></div></div>' +
      '<div class="np-us"><label class="np-u"><input type="checkbox" id="npU"><span>Urgente</span></label><label class="np-u"><input type="checkbox" id="npMi"><span>Ver en minuta</span></label><label class="np-u"><input type="checkbox" id="npDe"><span>Para más adelante</span></label></div>' +
      '<label class="field"><span>Nota (opcional)</span><textarea id="npN" rows="2" maxlength="1500" placeholder="Detalle, link, quién lo pidió…"></textarea></label>' +
      '<div class="err"></div><div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Cargar en Bandeja</button></div>', async mm => {
      const texto = $('#npT', mm).value.trim(); if (!texto) { $('#npT', mm).focus(); throw new Error('Escribí qué es el pedido.'); }
      const sel = $('#npM .chip.on', mm), labelId = sel ? sel.dataset.npM : '', f = $('#npF', mm).value, urgente = $('#npU', mm).checked, minuta = $('#npMi', mm).checked, despues = $('#npDe', mm).checked, nota = $('#npN', mm).value.trim();
      // la fecha se guarda a las 18:00 de Argentina (fin del día de trabajo)
      const r = await post({ action: 'pedidoRapido', k: S.pkey || S.key, texto, labelId, urgente, minuta, despues, nota, due: f ? f + 'T18:00:00-03:00' : '' });
      const et = marcas.find(e => e.id === labelId);
      const card = r.card || { id: 'demo-' + Date.now(), n: texto, d: nota, due: f ? f + 'T18:00:00-03:00' : null, dc: false, lista: despues ? 'Para más adelante' : 'Bandeja', k: despues ? 'despues' : 'bandeja', act: new Date().toISOString(), url: '#', lab: (et ? [et.n] : []).concat(urgente ? ['Urgente'] : [], minuta ? ['Ver en minuta'] : []) };
      if (S.proj.mio && S.proj.mio.cards) S.proj.mio.cards.unshift(card);
      render();
      toast((r.pasos || ['Tarjeta creada en "' + (despues ? 'Para más adelante' : 'Bandeja') + '" de Project']).map(p => '✓ ' + esc(p)).join('<br>') + (r.avisos || []).map(a => '<br>✗ ' + esc(a)).join(''));
    });
    m.querySelectorAll('[data-np-m]').forEach(b => b.onclick = () => { m.querySelectorAll('[data-np-m]').forEach(x => x.classList.toggle('on', x === b)); });
    m.querySelectorAll('[data-np-f]').forEach(b => b.onclick = () => { $('#npF', m).value = b.dataset.npF; });
    $('#npT', m).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-ok]', m).click(); } });
  }

  /* ---------------- FOTOGRAFÍA: última producción de fotos de cada marca y cuándo toca la próxima ----------------
     Cada marca tiene producción de fotos cada N meses (2 si no se cambia en Config · FOTO_MESES). Se anota cuándo fue la última
     y acá se ve cuál está vencida, cuál toca pronto y cuál está al día. Lo ven solo el project y dirección. */
  const fotosData = () => (S.data ? S.data.fotos : S.proj ? S.proj.fotos : null) || (DEMO ? fotosDemo() : null);
  function fotosDemo() {
    if (S._fotosDemo) return S._fotosDemo;
    const ms = (S.data ? S.data.marcas : S.proj ? S.proj.marcas : []).slice(0, 6), d = n => ymdL(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));
    const dias = [75, 52, 20, null, 64, 8];
    return S._fotosDemo = { meses: 2, marcas: ms.map((m, i) => ({ slug: m.slug, nombre: m.nombre, no: false, ultima: dias[i] == null ? '' : d(dias[i]), por: dias[i] == null ? '' : 'Bauti', nota: i === 0 ? 'Producto nuevo y local' : '', hist: dias[i] == null ? [] : [{ f: d(dias[i]), por: 'Bauti', nota: '' }] })) };
  }
  // estado de una marca: 0 vencida · 1 sin registrar · 2 toca pronto (15 días) · 3 al día · 4 no lleva fotografía
  function fotoEstado(m, meses) {
    if (m.no) return { o: 4, pill: '', txt: 'No lleva fotografía' };
    if (!m.ultima) return { o: 1, pill: 'warn', txt: 'Sin registrar' };
    const u = ymdD(m.ultima), p = new Date(u.getFullYear(), u.getMonth() + meses, u.getDate()), n = diasA(p);
    return n < 0 ? { o: 0, pill: 'bad', txt: 'Vencida hace ' + (-n) + (n === -1 ? ' día' : ' días'), prox: p, u: u }
      : n <= 15 ? { o: 2, pill: 'warn', txt: n === 0 ? 'Toca hoy' : 'Toca en ' + n + (n === 1 ? ' día' : ' días'), prox: p, u: u }
      : { o: 3, pill: 'ok', txt: 'Al día', prox: p, u: u };
  }
  const fotosPend = () => { const F = fotosData(); return F ? F.marcas.filter(m => { const e = fotoEstado(m, F.meses); return e.o === 0 || e.o === 2; }).length : 0; };
  function vFotos() {
    const F = fotosData();
    if (!F) return '<div class="empty">Todavía no llegaron los datos de fotografía. Tocá ↻ arriba para volver a leer.</div>';
    const L = F.marcas.map(m => Object.assign({ e: fotoEstado(m, F.meses) }, m)).sort((a, b) => a.e.o - b.e.o || (a.e.prox ? a.e.prox.getTime() : 0) - (b.e.prox ? b.e.prox.getTime() : 0));
    const n = o => L.filter(m => m.e.o === o).length, cada = F.meses === 1 ? 'todos los meses' : 'cada ' + F.meses + ' meses';
    const tile = (num, t, cl) => '<div class="mio-st ' + (num ? cl : '') + '"><b>' + num + '</b><span>' + t + '</span></div>';
    const fila = m => {
      const e = m.e, ant = (m.hist || []).slice(1, 4).map(h => dm(ymdD(h.f))).join(' · ');
      return '<div class="ft-r' + (e.o === 0 ? ' venc' : '') + '"><span class="dotm" style="background:' + color(m.slug) + '"></span><div class="ft-t"><b>' + esc(m.nombre) + '</b>' +
        '<div class="ft-m">' + (e.pill || e.o === 4 ? '<span class="pill ' + e.pill + '">' + e.txt + '</span>' : '') +
        (m.ultima ? '<span>Última: <b>' + dm(e.u) + '/' + e.u.getFullYear() + '</b> (' + (diasA(e.u) === 0 ? 'hoy' : 'hace ' + (-diasA(e.u)) + ' días') + (m.por ? ', la anotó ' + esc(m.por) : '') + ')</span>' : m.no ? '' : '<span>Anotá cuándo fue la última para que empiece a avisar.</span>') +
        (e.prox ? '<span>Próxima: <b>antes del ' + dm(e.prox) + '</b></span>' : '') + '</div>' +
        (m.nota ? '<div class="ft-n">' + esc(m.nota) + '</div>' : '') + (ant ? '<div class="ft-n">Anteriores: ' + ant + '</div>' : '') +
        '</div><button class="btn ' + (e.o <= 2 ? 'y' : 'ghost') + '" data-foto="' + esc(m.slug) + '">' + (m.no ? 'Cambiar' : 'Anotar') + '</button></div>';
    };
    const activas = L.filter(m => m.e.o < 4), sin = L.filter(m => m.e.o === 4);
    return '<p class="mio-que">Cada marca tiene producción de fotos <b>' + cada + '</b>. Anotá cuándo fue la última y el panel te avisa cuándo toca la próxima: 15 días antes aparece como "toca pronto" y, si se pasa, como vencida.</p>' +
      '<div class="mio-sts ft-sts">' + tile(n(0), 'Vencidas', 'bad') + tile(n(2), 'Tocan pronto', 'warn') + tile(n(1), 'Sin registrar', 'warn') + tile(n(3), 'Al día', 'ok') + '</div>' +
      '<div class="ft-l">' + activas.map(fila).join('') + '</div>' +
      (sin.length ? tarjeta('ft-no', 'No llevan fotografía', sin.length, '', false, () => '<div class="ft-l">' + sin.map(fila).join('') + '</div>') : '');
  }
  function fotoAnotar(slug) {
    const F = fotosData(), m = F && F.marcas.find(x => x.slug === slug); if (!m) return;
    const hoy = ymdL(NOW);
    const hist = (m.hist || []).slice(0, 6);
    const mm = modal('<h3>Fotografía · ' + esc(m.nombre) + '</h3><p>Anotá cuándo se hizo la última producción de fotos. La próxima se calcula sola (' + (F.meses === 1 ? '1 mes' : F.meses + ' meses') + ' después).</p>' +
      '<label class="field"><span>¿Cuándo fue?</span><input type="date" id="ftF" value="' + hoy + '" max="' + hoy + '"></label>' +
      '<label class="field"><span>Nota (opcional)</span><input id="ftN" maxlength="300" placeholder="Qué se fotografió, quién fue…"></label>' +
      '<label class="check"><input type="checkbox" id="ftNo"' + (m.no ? ' checked' : '') + '> Esta marca no lleva fotografía (no avisar)</label>' +
      (hist.length ? '<div class="field"><span>Ya anotadas</span><div class="ft-h">' + hist.map(h => '<div><b>' + dm(ymdD(h.f)) + '/' + h.f.slice(0, 4) + '</b><small>' + esc(h.por || '') + (h.nota ? ' · ' + esc(h.nota) : '') + '</small><button type="button" data-ft-b="' + esc(h.f) + '" title="Borrar esta fecha (si se anotó mal)">borrar</button></div>').join('') + '</div></div>' : '') +
      '<div class="err"></div><div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Guardar</button></div>', async x => {
      const no = $('#ftNo', x).checked, fecha = $('#ftF', x).value, nota = $('#ftN', x).value.trim();
      if (!no && !fecha) throw new Error('Poné la fecha de la producción.');
      if (!no && fecha > hoy) throw new Error('Esa fecha todavía no pasó: anotala cuando la producción ya esté hecha.');
      await fotoGuardar(m, no ? { accion: 'noAplica', no: true } : { fecha, nota });
      toast(no ? '✓ ' + esc(m.nombre) + ': marcada como "no lleva fotografía".' : '✓ ' + esc(m.nombre) + ': producción del ' + dm(ymdD(fecha)) + ' anotada. La próxima toca antes del ' + dm(fotoEstado({ ultima: fecha }, F.meses).prox) + '.');
    });
    mm.querySelectorAll('[data-ft-b]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'borrando…';
      try { await fotoGuardar(m, { accion: 'borrar', fecha: b.dataset.ftB }); b.parentNode.remove(); toast('✓ Fecha borrada.'); } catch (e) { $('.err', mm).textContent = e.message; b.disabled = false; b.textContent = 'borrar'; }
    });
  }
  async function fotoGuardar(m, cuerpo) {
    const F = fotosData();
    if (DEMO) {
      if (cuerpo.accion === 'noAplica') m.no = cuerpo.no;
      else if (cuerpo.accion === 'borrar') m.hist = (m.hist || []).filter(h => h.f !== cuerpo.fecha);
      else { m.no = false; m.hist = (m.hist || []).filter(h => h.f !== cuerpo.fecha).concat([{ f: cuerpo.fecha, por: 'Vos', nota: cuerpo.nota }]); }
      m.hist = (m.hist || []).sort((a, b) => b.f.localeCompare(a.f)); m.ultima = m.hist.length ? m.hist[0].f : ''; m.por = m.hist.length ? m.hist[0].por : ''; m.nota = m.hist.length ? m.hist[0].nota : '';
    } else {
      const r = await post(Object.assign({ action: 'fotoMarca', marca: m.slug, persona: S.data ? S.data.yo.clave : 'project' }, cuerpo));
      if (r.error) throw new Error(r.mensaje || r.error);
      if (r.fotos) { if (S.data) S.data.fotos = r.fotos; else if (S.proj) S.proj.fotos = r.fotos; }
    }
    render();
  }

  /* ---------------- AGENDA PRIVADA (project y dirección) ----------------
     El calendario de ideamia.contacto, que solo ven Joaquín e Ivo. Pide la clave del project (no la del equipo).
     Muestra las reuniones de los próximos 45 días y deja agendar una nueva, que se crea sola en ese calendario. */
  const AGP = { data: null, cargando: false, error: '' };
  // 22/10/2026: la agenda queda guardada en este navegador (solo en los del project y dirección) y se muestra al instante;
  // de fondo se pide la nueva. "Volver a leer" la lee del calendario sí o sí (fresco).
  const agpCache = { get() { try { const j = JSON.parse(localStorage.getItem('pi:agp') || 'null'); return j && j.persona === S.persona ? j.data : null; } catch (e) { return null; } }, set(d) { try { localStorage.setItem('pi:agp', JSON.stringify({ persona: S.persona, data: d })); } catch (e) {} } };
  function agpDemo() {
    const d = (n, h, m) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n, h, m || 0).toISOString();
    return { ok: true, leido: new Date().toISOString(), calendario: 'ideamia.contacto@gmail.com', equipoOk: true,
      invitables: [{ clave: 'ivo', nombre: 'Ivo', rol: 'Dirección', email: 'ivo@ejemplo.com' }, { clave: 'orne', nombre: 'Orne', rol: 'SM', email: 'orne@ejemplo.com' }, { clave: 'rama', nombre: 'Rama', rol: 'SM', email: 'rama@ejemplo.com' }],
      eventos: [
        { id: 'a1', uid: 'a1', mio: true, t: 'Reunión con cliente nuevo · propuesta', s: d(0, 16), f: d(0, 17), cal: 'privado', inv: [{ mail: 'ivo@ejemplo.com', n: 'Ivo', est: 'YES' }, { mail: 'cliente@ejemplo.com', n: '', est: 'INVITED' }], lugar: 'Meet', desc: '', panel: true, link: '#' },
        { id: 'a2', t: 'Minuta semanal', s: d(1, 10), f: d(1, 11), cal: 'equipo', inv: [{ mail: 'orne@ejemplo.com', n: 'Orne', est: 'YES' }, { mail: 'rama@ejemplo.com', n: 'Rama', est: 'YES' }], lugar: '', desc: '', link: '#' },
        { id: 'a3', uid: 'a3', mio: true, t: 'Revisión de números con el contador', s: d(3, 9, 30), f: d(3, 10, 30), cal: 'privado', inv: [], lugar: '', desc: '', link: '#' }] };
  }
  async function agpCargar(fresco, callado) {
    if (AGP.cargando) return;
    if (!AGP.data && !DEMO) AGP.data = agpCache.get();
    AGP.cargando = true; AGP.error = '';
    try {
      if (DEMO) AGP.data = agpDemo();
      else {
        const j = await get(Object.assign({ action: 'agenda', k: S.pkey, p: S.data ? S.data.yo.clave : 'project' }, fresco ? { fresco: 1 } : {}));
        if (j.error === 'clave') { S.pkey = ''; LS.set('pkey', ''); AGP.data = null; AGP.error = 'Esa no es la clave del project. Probá de nuevo.'; }
        else if (j.error) AGP.error = j.mensaje || j.error;
        else { AGP.data = j; agpCache.set(j); }
      }
    } catch (e) { if (!AGP.data) AGP.error = 'No se pudo leer el calendario. Revisá la conexión y tocá "Volver a leer".'; }
    AGP.cargando = false;
    if (!callado || S.tab === 'agp' || (S.proj && !S.data && S.projTab === 'agenda')) render();
  }
  function vAgendaPriv() {
    if (!DEMO && S.data && !esRevisa()) { AGP.data = null; return '<div class="empty">Esta pantalla es solo para el project y dirección.</div>'; }
    const que = '<p class="mio-que">Calendario <b>ideamia.contacto</b>: solo lo ven Joaquín e Ivo (pide la clave del project). Lo que agendes acá se crea en Google Calendar y les llega la invitación a quienes elijas.</p>';
    if (!DEMO && !S.pkey) return que + '<div class="agp-key"><label class="field"><span>Clave del project</span><input type="password" id="agpK" autocomplete="off" placeholder="La misma con la que se entra a la vista Project"></label><button class="btn y" data-agp-key>Entrar a la agenda</button>' + (AGP.error ? '<div class="err">' + esc(AGP.error) + '</div>' : '') + '<p class="ayuda">Se pide una sola vez en este dispositivo.</p></div>';
    if (!AGP.data && !AGP.error && !DEMO) AGP.data = agpCache.get();
    if (AGP.data && !AGP.cargando && !DEMO && Date.now() - new Date(AGP.data.leido) > 3 * 60e3) setTimeout(() => agpCargar(false, true), 0);   // lo guardado se ve ya; de fondo, lo nuevo
    if (!AGP.data && !AGP.error) { if (!AGP.cargando) setTimeout(agpCargar, 0); return que + '<div class="loading"><b>Cargando</b>Leyendo el calendario…</div>'; }
    const barra = '<div class="agp-bar"><button class="btn y" data-agp-nueva>' + I.cal + 'Agendar reunión</button><button class="btn ghost" data-agp-leer>' + (AGP.cargando ? 'Leyendo…' : 'Volver a leer') + '</button>' + (AGP.data ? '<span class="agp-leido">leído ' + hm(new Date(AGP.data.leido)) + '</span>' : '') + '</div>';
    if (!AGP.data) return que + barra + '<div class="empty">' + esc(AGP.error) + '</div>';
    const E = AGP.data.eventos || [], dias = {}, orden = [];
    E.forEach(e => { const k = ymdL(new Date(e.s)); if (!dias[k]) { dias[k] = []; orden.push(k); } dias[k].push(e); });
    const EST = { YES: 'va', NO: 'no va', MAYBE: 'quizás' };
    const fila = e => {
      const s = new Date(e.s), f = new Date(e.f), ya = f < new Date();
      const inv = (e.inv || []).filter(g => g.mail !== AGP.data.calendario).map(g => esc(g.n || g.mail) + (EST[g.est] ? ' <i>(' + EST[g.est] + ')</i>' : ''));
      return '<div class="agp-ev' + (e.cal === 'privado' ? ' priv' : '') + (ya ? ' ya' : '') + '"><div class="agp-h">' + (e.dia ? '<b>Todo</b><small>el día</small>' : '<b>' + hm(s) + '</b><small>' + hm(f) + '</small>') + '</div><div class="agp-b"><div class="tt">' + esc(e.t) + '</div><div class="mt">' +
        (e.cal !== 'privado' ? '<span class="pill">También lo ve el equipo</span>' : inv.length ? '<span class="pill y">Privado · lo ven los invitados</span>' : '<span class="pill y">Privado · solo Joaquín e Ivo</span>') +
        (inv.length ? '<span>con ' + inv.join(', ') + '</span>' : e.cal === 'privado' ? '<span>sin invitados</span>' : '') + (e.lugar ? (/^https?:\/\//.test(e.lugar) ? '<a class="lnk" href="' + esc(e.lugar) + '" target="_blank" rel="noopener">Abrir el link ↗</a>' : '<span>' + esc(e.lugar) + '</span>') : '') +
        (e.mio && e.uid ? '<button class="lnk agp-edit" data-agp-inv="' + esc(e.id) + '">Invitados: agregar o sacar</button>' : '') + (e.meet ? '<a class="lnk agp-meet" href="' + esc(e.meet) + '" target="_blank" rel="noopener">Entrar al Meet ↗</a>' : '') + (e.link && e.link !== '#' ? '<a class="lnk" href="' + esc(e.link) + '" target="_blank" rel="noopener">Abrir en Calendar ↗</a>' : '') + '</div></div></div>';
    };
    // hoy y mañana a la vista; el resto, en carpetas por semana (con muchas reuniones la lista era interminable)
    const tramo = k => { const d = ymdD(k), n = diasA(d); return n <= 0 ? 'hoy' : n === 1 ? 'man' : d < lunesDe(NOW, 1) ? 's0' : d < lunesDe(NOW, 2) ? 's1' : 'mas'; };
    const TRAMOS = [['s0', 'Resto de esta semana'], ['s1', 'La semana que viene'], ['mas', 'Más adelante']];
    const cuerpo = (orden.some(k => tramo(k) === 'hoy') ? '' : '<p class="agp-nada">Hoy no tenés reuniones.</p>') + orden.filter(k => tramo(k) === 'hoy' || tramo(k) === 'man').map(diaP).join('') +
      TRAMOS.map(t => { const ks = orden.filter(k => tramo(k) === t[0]), n = ks.reduce((s, k) => s + dias[k].length, 0); return ks.length ? tarjeta('agp-' + t[0], t[1], n, '', false, () => '<div class="ag-carp">' + ks.map(diaP).join('') + '</div>', I.cal) : ''; }).join('');
    function diaP(k) { const d = ymdD(k), n = diasA(d); return '<h3 class="agp-d' + (n === 0 ? ' hoy' : '') + '">' + (n === 0 ? 'Hoy · ' : n === 1 ? 'Mañana · ' : '') + DIAS_L[d.getDay()].toLowerCase() + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + '<small>' + dias[k].length + '</small></h3>' + dias[k].map(fila).join(''); }
    return que + barra + (AGP.error ? '<div class="empty">' + esc(AGP.error) + '</div>' : '') + (AGP.data.equipoOk ? '' : '<p class="ayuda">No pude leer el calendario del equipo: acá abajo solo figuran las reuniones privadas.</p>') +
      (E.length ? cuerpo : '<div class="empty">No hay reuniones en los próximos 45 días. Tocá "Agendar reunión" para crear la primera.</div>');
  }
  function agpNueva() {
    const inv = (AGP.data && AGP.data.invitables) || [], antes = LS.get('agpmails', []).filter(x => !inv.some(p => p.email === x)), iso = ymdL(NOW), h = String(Math.min(NOW.getHours() + 1, 20)).padStart(2, '0') + ':00';
    modal('<h3>Agendar reunión</h3><p>Se crea en el calendario <b>ideamia.contacto</b> (el privado). Los invitados reciben el mail de Google Calendar y la ven en su calendario.</p>' +
      '<label class="field"><span>Título</span><input id="aT" placeholder="Ej.: Reunión con el cliente · propuesta"></label>' +
      '<div class="two"><label class="field"><span>Día</span><input type="date" id="aF" value="' + iso + '" min="' + iso + '"></label><label class="field"><span>Hora</span><input type="time" id="aH" value="' + h + '" step="300"></label></div>' +
      '<label class="field"><span>Duración</span><select id="aD"><option value="30">30 minutos</option><option value="45" selected>45 minutos</option><option value="60">1 hora</option><option value="90">1 hora y media</option><option value="120">2 horas</option></select></label>' +
      '<div class="field"><span>Invitados</span><div class="agp-inv">' + (inv.length ? inv.map(p => '<label><input type="checkbox" value="' + esc(p.email) + '"><b>' + esc(p.nombre) + '</b><small>' + esc(p.rol) + '</small></label>').join('') : '<small>No hay mails cargados en la hoja Equipo.</small>') + antes.map(x => '<label><input type="checkbox" value="' + esc(x) + '"><b>' + esc(x) + '</b></label>').join('') + '</div><small class="agp-nota">Aparecen los del equipo que tienen mail en la hoja Equipo y los mails que ya invitaste desde acá.</small></div>' +
      '<label class="field"><span>Otros invitados (mails separados por coma)</span><input id="aO" inputmode="email" placeholder="cliente@empresa.com, otro@mail.com"></label>' +
      '<label class="field"><span>Lugar o link (opcional)</span><input id="aL" placeholder="Oficina, link de Meet o Zoom…"></label>' +
      '<label class="field"><span>Nota (opcional)</span><input id="aN" placeholder="De qué se trata, qué hay que llevar…"></label>' +
      '<label class="check"><input type="checkbox" id="aM"' + (AGP.data && AGP.data.meet === false ? ' disabled' : ' checked') + '> Crear el link de Google Meet' + (AGP.data && AGP.data.meet === false ? ' (no disponible)' : '') + '</label>' +
      '<label class="check"><input type="checkbox" id="aA" checked> Mandar la invitación por mail a los invitados</label><div class="err"></div>' +
      '<div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Agendar</button></div>', async m => {
      const titulo = $('#aT', m).value.trim(), fecha = $('#aF', m).value, hora = $('#aH', m).value;
      if (!titulo) throw new Error('Ponele un título a la reunión.');
      if (!fecha || !hora) throw new Error('Poné el día y la hora.');
      const invitados = [...m.querySelectorAll('.agp-inv input:checked')].map(x => x.value).concat($('#aO', m).value.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean));
      const malo = invitados.find(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
      if (malo) throw new Error('Este mail no parece válido: ' + malo);
      const cuerpo = { action: 'agendarPrivada', k: S.pkey, titulo, fecha, hora, duracion: Number($('#aD', m).value), invitados, lugar: $('#aL', m).value.trim(), nota: $('#aN', m).value.trim(), avisar: $('#aA', m).checked, meet: $('#aM', m).checked };
      const ini = new Date(fecha + 'T' + hora);
      const r = DEMO ? { ok: true, evento: { id: 'n' + Date.now(), uid: 'n' + Date.now(), mio: true, t: titulo, s: ini.toISOString(), f: new Date(ini.getTime() + cuerpo.duracion * 6e4).toISOString(), cal: 'privado', inv: invitados.map(x => ({ mail: x, n: '', est: 'INVITED' })), lugar: cuerpo.lugar, panel: true, link: '#' } } : await post(cuerpo);
      if (r.error) throw new Error(r.mensaje || r.error);
      LS.set('agpmails', invitados.filter(x => !inv.some(p => p.email === x)).concat(antes).filter((x, i, a) => a.indexOf(x) === i).slice(0, 12));
      if (AGP.data && r.evento) { (r.evento.inv || []).forEach(g => { g.n = g.n || (inv.find(p => p.email === g.mail) || {}).nombre || ''; }); AGP.data.eventos.push(r.evento); AGP.data.eventos.sort((a, b) => new Date(a.s) - new Date(b.s)); }
      render(); toast('✓ Agendada en el calendario privado: ' + esc(titulo) + ' · ' + corto(ymdD(fecha)) + ' ' + hora + (r.evento && r.evento.meet ? '<br>Con link de Meet.' : cuerpo.meet && !DEMO ? '<br>✗ No se pudo crear el link de Meet' + (r.meetFallo ? ' (' + esc(r.meetFallo) + ')' : '') + '. La reunión quedó agendada sin link.' : '') + (invitados.length && cuerpo.avisar ? '<br>Invitación enviada a ' + invitados.length + (invitados.length === 1 ? ' persona.' : ' personas.') : ''));
    });
  }
  // Agregar o sacar invitados de una reunión que ya existe (solo las que creó ideamia.contacto).
  function agpInvitados(id) {
    const e = ((AGP.data || {}).eventos || []).find(x => x.id === id); if (!e) return;
    const inv = AGP.data.invitables || [], cal = AGP.data.calendario;
    const ya = (e.inv || []).filter(g => g.mail !== cal).map(g => g.mail);
    const antes = LS.get('agpmails', []).filter(x => !inv.some(p => p.email === x) && ya.indexOf(x) < 0);
    const chip = (mail, nombre, rol, on) => '<label><input type="checkbox" value="' + esc(mail) + '"' + (on ? ' checked' : '') + '><b>' + esc(nombre) + '</b>' + (rol ? '<small>' + esc(rol) + '</small>' : '') + '</label>';
    const nombreDe = m => (inv.find(p => p.email === m) || {}).nombre || ((e.inv || []).find(g => g.mail === m) || {}).n || m;
    modal('<h3>Invitados</h3><p><b>' + esc(e.t) + '</b> · ' + corto(new Date(e.s)) + ' ' + hm(new Date(e.s)) + '. Tildá a quién querés sumar y destildá a quién querés sacar.' + (e.rec ? ' Esta reunión se repite: el cambio vale para todas las fechas.' : '') + '</p>' +
      '<div class="field"><span>Invitados</span><div class="agp-inv">' + ya.map(m => chip(m, nombreDe(m), '', true)).join('') + inv.filter(p => ya.indexOf(p.email) < 0).map(p => chip(p.email, p.nombre, p.rol, false)).join('') + antes.map(x => chip(x, x, '', false)).join('') + '</div></div>' +
      '<label class="field"><span>Agregar otros (mails separados por coma)</span><input id="iO" inputmode="email" placeholder="cliente@empresa.com, otro@mail.com"></label>' +
      '<label class="check"><input type="checkbox" id="iA" checked> Avisar por mail a los que sumo o saco</label><div class="err"></div>' +
      '<div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Guardar invitados</button></div>', async m => {
      const lista = [...m.querySelectorAll('.agp-inv input:checked')].map(x => x.value).concat($('#iO', m).value.split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean)).filter((x, i, a) => a.indexOf(x) === i);
      const malo = lista.find(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
      if (malo) throw new Error('Este mail no parece válido: ' + malo);
      const r = DEMO ? { ok: true, inv: lista.map(x => ({ mail: x, n: '', est: 'INVITED' })) } : await post({ action: 'invitadosPrivada', k: S.pkey, uid: e.uid, invitados: lista, avisar: $('#iA', m).checked });
      if (r.error) throw new Error(r.mensaje || r.error);
      const viejos = e.inv || [];
      e.inv = (r.inv || []).map(g => Object.assign(g, { n: g.n || (inv.find(p => p.email === g.mail) || {}).nombre || (viejos.find(v => v.mail === g.mail) || {}).n || '' }));
      // si la reunión se repite, las otras fechas de la misma serie quedan con los mismos invitados
      AGP.data.eventos.forEach(x => { if (x !== e && x.uid && x.uid === e.uid) x.inv = e.inv.map(g => Object.assign({}, g)); });
      LS.set('agpmails', lista.filter(x => !inv.some(p => p.email === x)).concat(LS.get('agpmails', [])).filter((x, i, a) => a.indexOf(x) === i).slice(0, 12));
      const mas = lista.filter(x => ya.indexOf(x) < 0).length, menos = ya.filter(x => lista.indexOf(x) < 0).length;
      render(); toast('✓ Invitados guardados' + (mas || menos ? ': ' + [mas ? mas + (mas === 1 ? ' sumado' : ' sumados') : '', menos ? menos + (menos === 1 ? ' sacado' : ' sacados') : ''].filter(Boolean).join(', ') : ' (sin cambios)') + '.' + (r.sinAviso ? '<br>Google no les mandó mail: avisales vos.' : ''));
    });
  }
  function agpBind(root) {
    root.querySelectorAll('[data-agp-nueva]').forEach(b => b.onclick = agpNueva);
    root.querySelectorAll('[data-agp-inv]').forEach(b => b.onclick = () => agpInvitados(b.dataset.agpInv));
    root.querySelectorAll('[data-agp-leer]').forEach(b => b.onclick = () => { agpCargar(true); render(); });
    root.querySelectorAll('[data-agp-key]').forEach(b => b.onclick = () => { const v = ($('#agpK', root) || {}).value || ''; if (!v.trim()) return; S.pkey = v.trim(); LS.set('pkey', S.pkey); AGP.error = ''; AGP.data = null; render(); });
    const k = $('#agpK', root); if (k) k.onkeydown = e => { if (e.key === 'Enter') { const b = $('[data-agp-key]', root); if (b) b.click(); } };
  }

  // Vista del project: "Mi día" (su tablero Project) y "Equipo" (lo que tildó cada uno)
  function vistaProject() {
    if (!S._qtab) { S._qtab = 1; const q = new URLSearchParams(location.search).get('tab'); if (q === 'plan' || q === 'okr') S.projTab = q; }   // el aviso de Discord de una campaña abre Plan
    if (S.projTab === 'pmas' && !S.movil) S.projTab = 'mio';
    const tab = S.projTab || 'mio', M = S.proj.mio;
    const D = M && !M.error ? datosMio() : null, n = D ? D.bandeja.length + D.hoy.length : 0;
    // v4 (22/10/2026): la misma estructura que el panel de cada persona: pestañas con barra arriba en la compu, barra abajo en el celu,
    // saludo grande solo en "Mi día" y en las demás un título corto (sin párrafos que empujen todo para abajo)
    const sinTocar = (S.proj.personas || []).reduce((s, p) => s + ((p.inputs || {}).sinTocar || 0), 0);
    const nAgp = AGP.data ? AGP.data.eventos.filter(e => diasA(new Date(e.s)) === 0 && new Date(e.f) > new Date()).length : 0;
    const NAV = S.movil
      ? [['mio', 'Mi día', I.check, n, true], ['agenda', 'Agenda', I.cal, nAgp], ['plan', 'Plan', I.flag, 0], ['okr', 'Objetivos', I.star, 0], ['equipo', 'Equipo', I.users, sinTocar, true], ['pmas', 'Más', I.grid, fotosPend(), true]]
      : [['mio', 'Mi día', I.check, n, true], ['agenda', 'Agenda', I.cal, nAgp], ['plan', 'Plan', I.flag, 0], ['okr', 'Objetivos', I.star, 0], ['fotos', 'Fotos', I.cam, fotosPend(), true], ['anual', 'Anual', I.star, 0], ['equipo', 'Equipo', I.users, sinTocar, true], ['registro', 'Registro', I.inbox, 0]];
    const fecha = DIAS_L[NOW.getDay()] + ' ' + NOW.getDate() + ' de ' + MESES[NOW.getMonth()];
    const saludo = NOW.getHours() < 13 ? 'buen día' : NOW.getHours() < 20 ? 'buenas tardes' : 'buenas noches';
    const ctrl = S.movil ? '' : '<div class="ctrl"><div class="ctrl-in"><nav class="tabs">' + NAV.map(x => '<button class="tab' + (tab === x[0] ? ' on' : '') + '" data-projtab="' + x[0] + '">' + x[1] + (x[3] ? '<span class="badge' + (x[4] ? ' hot' : '') + '">' + x[3] + '</span>' : '') + '</button>').join('') + '</nav></div></div>';
    const bnav = S.movil ? '<nav class="bnav proj-bnav">' + NAV.map(x => '<button class="' + (tab === x[0] ? 'on' : '') + '" data-projtab="' + x[0] + '">' + x[2] + '<span>' + x[1] + '</span>' + (x[3] ? '<em class="hot">' + x[3] + '</em>' : '') + '</button>').join('') + '</nav>' : '';
    const tit = (t, sub) => '<div class="mtit"><h1>' + t + '</h1>' + btnAyuda() + '<span>' + fecha + '</span></div>' + (sub ? '<p class="psub">' + sub + '</p>' : '');
    const pagina = (head, cuerpo) => (S.movil ? head : ctrl + head) + '<div class="view" id="view">' + cuerpo + '</div>' + bnav;
    if (tab === 'plan' || tab === 'okr') return pagina(tit(tab === 'plan' ? 'Plan' : 'Objetivos'), '<div class="emb-ph" aria-hidden="true"></div>');
    if (tab === 'pmas') { const f = (go, ico, t, l) => '<button class="ml-r" ' + go + '><span class="ic">' + ico + '</span><span class="ml-t"><b>' + t + '</b><small>' + l + '</small></span><i class="ml-go">›</i></button>';
      return pagina(tit('Más'), '<div class="mas-l"><div class="ml-s"><div class="ml-g">' + f('data-projtab="fotos"', I.cam, 'Fotos', fotosPend() ? fotosPend() + ' para atender' : 'al día') + f('data-projtab="anual"', I.cal, 'Anual', 'calendario de cada marca') + f('data-projtab="registro"', I.inbox, 'Registro', 'lo último del equipo') + f('data-tourbtn', I.star, 'Cómo se usa', 'recorrido de 1 minuto') + f('data-perfil', I.users, 'Mi perfil', 'apodo, foto y fondo') + '</div></div></div>'); }
    if (tab === 'anual') return pagina(tit('Anual', 'Fechas del calendario anual de cada marca, mes por mes.'), vAnual());
    if (tab === 'fotos') return pagina(tit('Fotos', 'Última producción de cada marca y cuándo toca la próxima.'), vFotos());
    if (tab === 'agenda') return pagina(tit('Agenda'), vAgendaPriv());
    if (tab === 'equipo') return pagina(tit('Equipo', 'Qué tiene pendiente cada uno. Tocá a una persona.'), vistaEquipo(false));
    if (tab === 'registro') return pagina(tit('Registro', 'Lo último que tildó o cargó cada uno.'), vistaEquipo(true));
    const pf = perfilDe(S.persona), nom = apodo();
    const resumen = !D ? 'Tu tablero Project de Trello' : n ? '<b>' + D.bandeja.length + '</b> en bandeja · <b>' + D.hoy.length + '</b> para hoy' : '<b>Bandeja vacía</b> y nada vence hoy';
    const head = '<section class="mhead"><div>' + (pf.foto ? ava(pf, nom) : '') + '<div class="kick">/ ' + fecha + ' <span class="sal">· ' + saludo + '</span></div><h1>Hola, <span class="nom">' + esc(nom) + '</span></h1><p>' + resumen + btnAyuda() + '</p></div></section>';
    return pagina(head, vistaMio());
  }
  /* ---------------- MI SEMANA (filmmaker) ----------------
     Qué tiene que filmar y editar por marca (esta semana y la que viene), a qué marcas le toca ir,
     y las reuniones de guiones y presentación de ideas. "Listo" pasa la tarjeta a En revisión en Trello. */
  const esFilm = () => /film|audiovis/i.test(((S.data || {}).yo || {}).rol || '');
  const finDeSemana = n => { const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - ((NOW.getDay() + 6) % 7) + 6 + 7 * n, 23, 59, 59); return d; };
  function datosFilm() {
    const F = S.data.film || { visitas: [], reuniones: [], est: {} };
    const P = S.data.cards.filter(c => c.cat === 'pieza' && pasa(c.m)).map(c => Object.assign({}, c, { plazo: plazoEntrega(c) }));
    // en qué semana cae la entrega: 0 = esta (o atrasada o sin fecha), 1 = la que viene, 2 = más adelante
    const sem = c => !c.plazo || c.plazo <= finDeSemana(0) ? 0 : c.plazo <= finDeSemana(1) ? 1 : 2;
    const porHacer = P.filter(c => c.etapa !== 'revision'), enRev = P.filter(c => c.etapa === 'revision');
    const est = k => (F.est || {})[k] || null;
    // visita cumplida: marcó algún día de esta semana (hasta hoy) para esa marca, o el "Fui" de antes
    const lun0 = ymdL(lunesDe(NOW, 0)), hoy0 = ymdL(NOW), preA = 'film:' + S.data.yo.clave + ':asis:';
    const fue = s => Object.keys(F.est || {}).some(k => { if (k.indexOf(preA) !== 0) return false; const p = k.slice(preA.length).split(':'); return p[1] === s && p[0] >= lun0 && p[0] <= hoy0; });
    const visPend = F.visitas.filter(v => pasa([v.marca]) && v.cuando === 'esta semana' && !(est(v.clave) && est(v.clave).estado === 'hecho') && !fue(v.marca));
    return { F, P, sem, porHacer, enRev, est, visPend, corr: porHacer.filter(c => c.etapa === 'correccion'), atras: porHacer.filter(c => c.plazo && c.plazo < NOW),
      guiones: S.data.cards.filter(c => c.cat === 'guion' && pasa(c.m)) };
  }
  function resumenFilm() {
    const D = datosFilm(), n0 = D.porHacer.filter(c => D.sem(c) === 0).length, n1 = D.porHacer.filter(c => D.sem(c) === 1).length;
    return (D.atras.length ? '<b class="rojo">' + D.atras.length + (D.atras.length === 1 ? ' atrasada' : ' atrasadas') + '</b> · ' : '') + '<b>' + n0 + '</b> para entregar esta semana · <b>' + n1 + '</b> la que viene' + (D.visPend.length ? ' · te ' + (D.visPend.length === 1 ? 'falta 1 visita' : 'faltan ' + D.visPend.length + ' visitas') : '');
  }
  /* ---------------- Producciones del filmmaker (pedido de Joaquín, 21/10/2026) ----------------
     Qué va a grabar, cuándo, en qué marca y con quién. En los reels, un checklist (actores, guion, qué llevar) y en las marcas con
     recetas, avisarle a la encargada una semana antes qué insumos preparar. Joaquín lo ve en Más → Producciones. */
  const PROD_ICO = { reel: I.reel, historias: I.story, fotos: I.cam, presencial: I.pin, otro: '' };
  const DSEM_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const fProd = s => DSEM_C[new Date(s + 'T12:00:00').getDay()] + ' ' + (+s.slice(8)) + '/' + (+s.slice(5, 7));
  function prodFalta(x, P) {
    const L = [];
    if (x.tipo === 'reel') ['actores', 'guion', 'llevar'].forEach(k => { if (!(x.chk || {})[k]) L.push(k); });
    if (x.receta && (P.recetas || []).indexOf(x.marca) >= 0 && !(x.chk || {}).encargada) L.push('encargada');
    return L;
  }
  const FALTA_C = { actores: 'coordinar con quienes actúan', guion: 'mandar el guion', llevar: 'avisar qué llevar', encargada: 'avisarle a la encargada' };
  function filaProd(x, P, conNombre) {
    const hoy = ymdL(NOW), falta = x.falta || prodFalta(x, P), paso = x.fecha < hoy, esHoy = x.fecha === hoy;
    const est = x.estado === 'hecho' ? '<span class="pill ok">Se hizo</span>' : x.estado === 'nohecho' ? '<span class="pill bad">No se hizo</span>' : '';
    return '<div class="fl-r pr-r' + (falta.length && !paso ? ' pr-falta' : '') + '"' + (conNombre ? '' : ' data-prod="' + esc(x.id) + '" role="button" tabindex="0"') + '><div class="pr-h"><b>' + fProd(x.fecha) + '</b><span>' + esc(x.hora) + ' h</span></div>' +
      '<div class="fl-t"><div class="pr-q">' + tagM(x.marca) + '<span class="pill">' + (PROD_ICO[x.tipo] || '') + ' ' + esc((P.tipos || {})[x.tipo] || x.tipo) + '</span>' + (conNombre ? '<span class="fl-dim">' + esc(x.nombre) + '</span>' : '') + (esHoy ? '<span class="pill y">hoy</span>' : '') + est + '</div>' +
      '<div class="pr-d">' + esc(x.que) + (x.conQuien ? ' <span class="fl-dim">· con ' + esc(x.conQuien) + '</span>' : '') + '</div>' +
      (falta.length && !x.estado ? '<div class="pr-f">' + falta.map(k => '<span class="pill warn">Falta ' + FALTA_C[k] + '</span>').join('') + '</div>' : (x.tipo === 'reel' && !x.estado ? '<div class="pr-f"><span class="pill ok">✓ Coordinado</span></div>' : '')) +
      (x.nota ? '<div class="pr-d fl-dim">' + esc(x.nota) + '</div>' : '') + '</div>' +
      (!conNombre && paso && !x.estado ? '<div class="fl-bs"><button class="fl-b" data-prod-est="' + esc(x.id) + '" data-v="hecho">Se hizo</button><button class="fl-b" data-prod-est="' + esc(x.id) + '" data-v="nohecho">No se hizo</button></div>' : '') + '</div>';
  }
  function secProducciones() {
    const P = (S.data.film || {}).prod; if (!P) return '';
    const l0 = ymdL(lunesDe(NOW, 0)), l1 = ymdL(lunesDe(NOW, 1)), l2 = ymdL(lunesDe(NOW, 2)), hoy = ymdL(NOW);
    const esta = P.items.filter(x => x.fecha >= l0 && x.fecha < l1), sig = P.items.filter(x => x.fecha >= l1 && x.fecha < l2), mas = P.items.filter(x => x.fecha >= l2);
    const sigFalta = sig.filter(x => prodFalta(x, P).length).length;
    const bloque = (tit, L, vacio, alerta) => '<div class="fl-vg"><h3>' + tit + (alerta ? ' <span class="pill ' + alerta[0] + '">' + alerta[1] + '</span>' : '') + '</h3>' + (L.length ? L.map(x => filaProd(x, P)).join('') : '<div class="empty">' + vacio + '</div>') + '</div>';
    const dow = NOW.getDay(), avisoSig = !sig.length && (dow >= 4 || dow === 0) ? ['bad', 'cargala antes del viernes'] : sigFalta ? ['warn', sigFalta + ' sin coordinar'] : null;
    return '<div class="sec"><div class="sec-h"><h2>Producciones<small>qué grabás, cuándo y con quién</small></h2><button class="btn y fl-mas" data-prod-nueva>+ Producción</button></div>' +
      '<div class="fl-vs">' + bloque('Esta semana', esta, 'No anotaste producciones esta semana.') + bloque('La semana que viene', sig, 'Todavía no anotaste nada de la semana que viene.', avisoSig) + (mas.length ? bloque('Más adelante', mas, '') : '') + '</div>' +
      '<p class="ayuda">Anotá cada grabación con <b>día, hora, marca, qué vas a hacer y con quién</b>. En los reels marcá si coordinaste con quienes actúan, si les mandaste el guion y si les avisaste qué llevar. Si es una receta o preparación en Isco, Quality, Quality Mayorista o Gabriel Varisco, avisale a la encargada <b>una semana antes</b> qué insumos tiene que tener listos. Los viernes te llega un recordatorio si falta algo.</p></div>';
  }
  function prodEditar(x0) {
    const F = S.data.film || {}, P = F.prod || {}, x = Object.assign({ tipo: 'reel', chk: {}, fecha: ymdL(lunesDe(NOW, 1)), hora: '10:00', marca: (F.reels || [])[0] || '' }, x0 || {});
    const todas = (F.todas && F.todas.length ? F.todas : S.data.marcas).slice().sort((a, b) => a.nombre < b.nombre ? -1 : 1);
    const reels = S.data.cards.filter(c => c.cat === 'pieza' && c.formato !== 'historia' && c.etapa !== 'revision');
    const ck = (k, t) => '<label class="pr-ck" data-ck="' + k + '"><input type="checkbox" id="pc-' + k + '"' + ((x.chk || {})[k] ? ' checked' : '') + '><span>' + t + '</span></label>';
    const m = modal('<h3>' + (x0 ? 'Editar producción' : 'Nueva producción') + '</h3>' +
      '<div class="two"><label class="field"><span>Día</span><input type="date" id="pdF" value="' + esc(x.fecha) + '"></label><label class="field"><span>Hora</span><input type="time" id="pdH" value="' + esc(x.hora) + '"></label></div>' +
      '<label class="field"><span>Marca</span><select id="pdM">' + todas.map(t => '<option value="' + esc(t.slug) + '"' + (t.slug === x.marca ? ' selected' : '') + '>' + esc(t.nombre) + '</option>').join('') + '</select></label>' +
      '<div class="fl-tipo pr-tipos">' + Object.keys(P.tipos || {}).filter(k => k !== 'otro' || x.tipo === 'otro').map(k => '<label><input type="radio" name="pdT" value="' + k + '"' + (x.tipo === k ? ' checked' : '') + '><span><i>' + (PROD_ICO[k] || '') + '</i>' + esc(P.tipos[k]) + '</span></label>').join('') + '</div>' +
      '<label class="field"><span>¿Qué vas a hacer?</span><input id="pdQ" list="pdL" maxlength="300" value="' + esc(x.que || '') + '" placeholder="Ej.: reel de la receta de lemon pie, historias del local"><datalist id="pdL">' + reels.map(c => '<option value="' + esc(c.n) + '">').join('') + '</datalist></label>' +
      '<label class="field"><span>¿Con quién?</span><input id="pdC" maxlength="160" value="' + esc(x.conQuien || '') + '" placeholder="Quiénes actúan o con quién coordinás (ej.: Verona y Juli)"></label>' +
      '<label class="pr-ck" id="pdRw"><input type="checkbox" id="pdR"' + (x.receta ? ' checked' : '') + '><span>Es una receta o preparación (hay que avisar qué insumos preparar)</span></label>' +
      '<div class="pr-cks" id="pdK"><b>Antes de grabar</b>' + ck('actores', 'Coordiné con las personas que actúan') + ck('guion', 'Les mandé el guion') + ck('llevar', 'Les avisé si tienen que llevar algo') + ck('encargada', 'Le avisé a la encargada qué insumos preparar (una semana antes)') + '</div>' +
      '<label class="field"><span>Nota (opcional)</span><input id="pdN" maxlength="300" value="' + esc(x.nota || '') + '"></label>' +
      '<div class="err"></div><div class="acts">' + (x0 ? '<button class="btn ghost" data-prod-borrar>Borrar</button>' : '') + '<button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Guardar</button></div>', async mm => {
      const g = id => $(id, mm).value.trim(), tipo = (mm.querySelector('input[name=pdT]:checked') || {}).value || 'otro';
      const body = { action: 'produccion', accion: 'guardar', id: x.id || '', fecha: g('#pdF'), hora: g('#pdH'), marca: g('#pdM'), tipo, que: g('#pdQ'), conQuien: g('#pdC'), receta: $('#pdR', mm).checked, nota: g('#pdN'), chk: {} };
      ['actores', 'guion', 'llevar', 'encargada'].forEach(k => body.chk[k] = $('#pc-' + k, mm).checked);
      if (!body.fecha) throw new Error('Elegí el día.'); if (!body.hora) throw new Error('Poné la hora.'); if (body.que.length < 3) throw new Error('Contá qué vas a hacer.');
      const r = await post(body); if (r.prod) S.data.film.prod = r.prod; else if (DEMO) { const L = P.items; const i = L.findIndex(z => z.id === body.id); const n = Object.assign({}, body, { id: body.id || 'd' + Date.now() }); if (i >= 0) L[i] = n; else L.push(n); }
      render(); toast('✓ Producción guardada');
    });
    // el checklist se adapta: actores/guion/llevar solo en reels; la encargada, si es receta en una marca con recetas
    const ajustar = () => {
      const tipo = (m.querySelector('input[name=pdT]:checked') || {}).value, mk = $('#pdM', m).value, rec = (P.recetas || []).indexOf(mk) >= 0;
      $('#pdRw', m).style.display = rec ? '' : 'none';
      ['actores', 'guion', 'llevar'].forEach(k => m.querySelector('[data-ck=' + k + ']').style.display = tipo === 'reel' ? '' : 'none');
      m.querySelector('[data-ck=encargada]').style.display = rec && $('#pdR', m).checked ? '' : 'none';
      $('#pdK', m).style.display = tipo === 'reel' || (rec && $('#pdR', m).checked) ? '' : 'none';
    };
    m.querySelectorAll('input[name=pdT], #pdM, #pdR').forEach(i => i.onchange = ajustar); ajustar();
    const bb = m.querySelector('[data-prod-borrar]'); if (bb) bb.onclick = async () => { if (!confirm('¿Borrar esta producción?')) return; try { const r = await post({ action: 'produccion', accion: 'borrar', id: x.id }); if (r.prod) S.data.film.prod = r.prod; m.remove(); render(); toast('Borrada'); } catch (e) { $('.err', m).textContent = e.message; } };
  }
  async function prodEstado(id, v) {
    const P = S.data.film.prod, x = P.items.find(z => z.id === id); if (!x) return;
    const nota = v === 'nohecho' ? (prompt('¿Por qué no se hizo? (opcional)') || '') : '';
    const antes = x.estado; x.estado = v; render();
    try { const r = await post({ action: 'produccion', accion: 'estado', id, estado: v, nota }); if (r.prod) S.data.film.prod = r.prod; render(); }
    catch (e) { x.estado = antes; render(); toast('✗ No se guardó: ' + esc(e.message)); }
  }
  /* reel de sus marcas que el CM pasó a Publicado: ¿lo anotás en tu lista? (una vez por reel) */
  function prodPublicados() {
    const P = (S.data.film || {}).prod; if (!P || !P.publicados || !P.publicados.length || $('.modal')) return;
    const r = P.publicados[0];
    const m = modal('<h3>Se publicó un reel tuyo</h3><p><b>' + esc(r.n) + '</b><br>' + tagM(r.marca) + ' <span class="fl-dim">publicado el ' + fProd(r.fecha) + '</span></p><p>¿Querés anotarlo en tu lista de reels?' + (P.lista ? ' Al abrirla te copio el renglón (fecha, marca, nombre y link) para que lo pegues.' : ' (Pedile a Joaquín que cargue el link de tu lista en el panel.)') + '</p>' +
      '<div class="err"></div><div class="acts"><button class="btn ghost" data-prno>No es mío</button><button class="btn ghost" data-x>Después</button>' + (P.lista ? '<button class="btn" data-pabrir>Abrir mi lista</button>' : '') + '<button class="btn y" data-ok>Ya lo anoté</button></div>', async () => {
      const j = await post({ action: 'produccion', accion: 'reel', card: r.id, v: 'anotado' }); if (j.prod) S.data.film.prod = j.prod; else P.publicados.shift(); toast('✓ Anotado'); setTimeout(prodPublicados, 600);
    });
    const ab = m.querySelector('[data-pabrir]'); if (ab) ab.onclick = () => { const fila = [r.fecha.split('-').reverse().join('/'), nomMarcaF(r.marca), r.n, r.url].join('\t'); try { navigator.clipboard.writeText(fila); toast('Renglón copiado: pegalo en tu lista'); } catch (e) {} window.open(P.lista, '_blank', 'noopener'); };
    m.querySelector('[data-prno]').onclick = async () => { try { const j = await post({ action: 'produccion', accion: 'reel', card: r.id, v: 'no' }); if (j.prod) S.data.film.prod = j.prod; else P.publicados.shift(); m.remove(); setTimeout(prodPublicados, 400); } catch (e) { $('.err', m).textContent = e.message; } };
  }
  /* ---------------- Más → Producciones (project y dirección): lo que anotaron los filmmakers ---------------- */
  function vProds() {
    const P = S.data.prods; if (!P) return '<div class="empty">No hay datos de producciones.</div>';
    const hoy = ymdL(NOW), l0 = ymdL(lunesDe(NOW, 0)), l1 = ymdL(lunesDe(NOW, 1)), l2 = ymdL(lunesDe(NOW, 2));
    const L = P.items.filter(x => pasa([x.marca]));
    const grupo = (tit, A, vacio) => '<div class="sec"><div class="sec-h"><h2>' + tit + '<small>' + A.length + '</small></h2></div>' + (A.length ? '<div class="fl-list suelta">' + A.map(x => filaProd(x, P, true)).join('') + '</div>' : '<div class="empty">' + vacio + '</div>') + '</div>';
    return '<p class="sub">Lo que anotan los filmmakers: día, hora, marca, qué graban y con quién. Sirve para chequear con el cliente si llegaron a horario y si coordinaron antes (actores, guion, insumos).</p>' +
      grupo('Esta semana', L.filter(x => x.fecha >= l0 && x.fecha < l1), 'No anotaron producciones esta semana.') +
      grupo('La semana que viene', L.filter(x => x.fecha >= l1 && x.fecha < l2), 'Todavía no anotaron nada de la semana que viene.') +
      grupo('Anteriores', L.filter(x => x.fecha < l0).reverse(), 'Sin producciones anteriores.');
  }
  // insignia de la pestaña Agenda: la semana que viene sin cargar (de jueves en adelante) o producciones de los próximos 7 días sin coordinar
  function prodPend() {
    const P = (S.data.film || {}).prod; if (!P) return 0;
    const hoy = ymdL(NOW), en7 = ymdL(new Date(NOW.getTime() + 7 * 864e5)), l1 = ymdL(lunesDe(NOW, 1)), l2 = ymdL(lunesDe(NOW, 2)), dow = NOW.getDay();
    return P.items.filter(x => x.fecha >= hoy && x.fecha <= en7 && !x.estado && prodFalta(x, P).length).length + ((dow >= 4 || dow === 0) && !P.items.some(x => x.fecha >= l1 && x.fecha < l2) ? 1 : 0);
  }
  // Presencialidades: cada día que fue (o piensa ir) queda como un renglón propio: puede haber más de un día por semana,
  // coberturas extra y marcas que no son las suyas de siempre. Clave: film:<persona>:asis:<fecha>:<marca>[:x…]
  const ymdL = d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  const lunesDe = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + 7 * (n || 0));
  const nomMarcaF = s => { const t = ((S.data.film || {}).todas || []).find(m => m.slug === s); return (marca(s) || t || { nombre: s }).nombre; };
  function asistencias() {
    const F = S.data.film || { est: {} }, pre = 'film:' + S.data.yo.clave + ':asis:';
    return Object.keys(F.est || {}).filter(k => k.indexOf(pre) === 0).map(k => {
      const p = k.slice(pre.length).split(':'), d = String(F.est[k].detalle || '').split('|');
      return { clave: k, fecha: p[0], marca: p[1], extra: d[0] === 'extra', que: d.slice(1).join('|') };
    }).sort((a, b) => a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0);
  }
  function vFilm() {
    const D = datosFilm(), F = D.F, FMT = { reel: 'Reel', historia: 'Historia', video: 'Video' };
    const dm = d => DIAS_L[d.getDay()].slice(0, 3) + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
    const hoyId_ = ymdL(NOW);
    const tile = (num, t, s, cl, attr) => '<button class="mio-st' + (num ? ' ' + cl : '') + '" ' + attr + '><b>' + num + '</b><span>' + t + '</span><small>' + s + '</small></button>';
    // ================= Reels / Historias: piezas en carpetas por marca =================
    if (S.tab === 'film' || S.tab === 'fhist') {
      const hist = S.tab === 'fhist', es = c => hist ? c.formato === 'historia' : c.formato !== 'historia';
      const P = D.P.filter(es), porHacer = D.porHacer.filter(es), enRev = D.enRev.filter(es);
      const seg = LS.get('filmseg', 'sem0');
      const lista = seg === 'sem0' ? porHacer.filter(c => D.sem(c) === 0) : seg === 'sem1' ? porHacer.filter(c => D.sem(c) === 1) : seg === 'rev' ? enRev : P;
      const fila = c => {
        const atras = c.etapa !== 'revision' && c.plazo && c.plazo < NOW;
        const cuando_ = c.plazo ? '<span class="' + (atras ? 'fl-rojo' : '') + '">' + (atras ? 'había que entregar ' : 'entregar ') + dm(c.plazo) + '</span><span class="fl-dim">sale ' + dm(new Date(c.salida)) + '</span>' : '<span class="fl-dim">sin fecha de salida</span>';
        const estado = c.etapa === 'revision' ? '<span class="pill ok">Ya está en revisión</span>' : '<button class="btn y fl-ok" data-film-listo="' + esc(c.id) + '">Listo</button>';
        return '<div class="fl-r' + (atras ? ' tarde' : '') + '"><div class="fl-t"><a class="lnk" href="' + esc(c.ourl || c.url) + '" target="_blank" rel="noopener">' + esc(c.n) + '</a><div class="fl-m"><span class="pill">' + (FMT[c.formato] || 'Video') + '</span>' + (c.etapa === 'correccion' ? '<span class="pill bad">A corregir</span>' : c.etapa === 'espera' ? '<span class="pill">En espera</span>' : '') + cuando_ + '</div></div>' + estado + '</div>';
      };
      const g = {}; lista.forEach(c => (g[c.m[0]] = g[c.m[0]] || []).push(c));
      const ks = Object.keys(g).sort((a, b) => g[b].filter(c => c.plazo && c.plazo < NOW).length - g[a].filter(c => c.plazo && c.plazo < NOW).length || g[b].length - g[a].length);
      const carpetas = ks.map(s => {
        const L = g[s].sort((a, b) => (a.plazo || 9e15) - (b.plazo || 9e15)), nA = L.filter(c => c.etapa !== 'revision' && c.plazo && c.plazo < NOW).length, nC = L.filter(c => c.etapa === 'correccion').length;
        const k = 'film:' + S.tab + ':' + seg + ':' + s, abierta = S.abiertos[k] != null ? S.abiertos[k] : (ks.length <= 2 || nA > 0 || nC > 0);
        return '<div class="mcar' + (abierta ? ' on' : '') + '"><button class="mcar-h" data-mcar="' + esc(k) + '" data-abierta="' + (abierta ? 1 : 0) + '"><span class="dotm" style="background:' + color(s) + '"></span><b>' + esc((marca(s) || {}).nombre || s) + '</b><small>' + L.length + '</small>' + (nA ? '<em>' + nA + (nA === 1 ? ' atrasada' : ' atrasadas') + '</em>' : '') + (nC ? '<em>' + nC + ' a corregir</em>' : '') + '<i>' + (abierta ? '−' : '+') + '</i></button>' +
          (abierta ? '<div class="fl-list">' + L.map(fila).join('') + '</div>' : '') + '</div>';
      }).join('');
      const n = k => k === 'sem0' ? porHacer.filter(c => D.sem(c) === 0).length : k === 'sem1' ? porHacer.filter(c => D.sem(c) === 1).length : k === 'rev' ? enRev.length : P.length;
      const tabs = '<div class="seg fl-seg">' + [['sem0', 'Esta semana'], ['sem1', 'La que viene'], ['rev', 'En revisión'], ['todo', 'Todo']].map(x => '<button class="' + (seg === x[0] ? 'on' : '') + '" data-filmseg="' + x[0] + '">' + x[1] + (n(x[0]) ? '<em>' + n(x[0]) + '</em>' : '') + '</button>').join('') + '</div>';
      const que = hist ? 'historias' : 'reels';
      const vacio = { sem0: 'Nada para entregar esta semana.', sem1: 'Todavía no hay ' + que + ' para la semana que viene.', rev: 'No tenés ' + que + ' esperando revisión.', todo: 'No hay ' + que + ' en los últimos 15 días ni en las próximas dos semanas.' }[seg];
      const atras = porHacer.filter(c => c.plazo && c.plazo < NOW).length, corr = porHacer.filter(c => c.etapa === 'correccion').length;
      return '<div class="mio-sts fl-sts">' + tile(n('sem0'), 'Esta semana', 'para entregar', 'y', 'data-filmseg="sem0"') + tile(atras, 'Atrasadas', 'ya había que entregar', 'bad', 'data-filmseg="sem0"') + tile(corr, 'A corregir', 'te las devolvieron', 'warn', 'data-filmseg="todo"') + tile(enRev.length, 'En revisión', 'esperando el visto', 'ok', 'data-filmseg="rev"') + '</div>' +
        '<div class="sec"><div class="sec-h"><h2>' + (hist ? 'Historias' : 'Reels') + '<small>por marca</small></h2></div>' + tabs + (lista.length ? carpetas : '<div class="empty">' + vacio + '</div>') +
        '<p class="ayuda">"Listo" pasa la tarjeta a <b>En revisión</b> en Trello y le llega a quien revisa. ' + (hist ? 'Historias: se entregan el día anterior.' : 'Reels: se entregan 48 h antes de que salgan.') + '</p></div>';
    }
    // ================= Guiones: reuniones y qué se presenta de sus marcas =================
    if (S.tab === 'fgui') {
      const fechaR = r => { const e = D.est(r.clave); return e && e.estado === 'movida' && e.detalle ? new Date(e.detalle.replace(' ', 'T')) : new Date(r.fecha + 'T' + (r.hora || '16:00')); };
      const nomMarcas = [...new Set(D.guiones.filter(x => !x.salio && x.gest !== 'aprobado').map(x => (marca(x.m[0]) || { nombre: x.m[0] }).nombre))].join(', ');
      const reunion = r => {
        const e = D.est(r.clave), st = e ? e.estado : '', f = fechaR(r), paso = f < NOW;
        if (paso && st !== 'novoy') return '';
        if (paso && st === 'novoy') return '<div class="fl-re falto"><div><b>No estuviste en la reunión del ' + dm(f) + '</b><p>Preguntá qué ideas se presentaron y de qué se tratan' + (nomMarcas ? ' (tus marcas con guiones en curso: ' + esc(nomMarcas) + ')' : '') + '.</p></div><button class="btn y" data-film-est="' + esc(r.clave) + '" data-estado="preguntado">Ya pregunté</button></div>';
        const b = (estado, txt) => '<button class="fl-b' + (st === estado ? ' on' : '') + '" data-film-est="' + esc(r.clave) + '" data-estado="' + (st === estado ? 'deshacer' : estado) + '">' + txt + '</button>';
        return '<div class="fl-re"><div><b>' + dm(f) + ' · ' + ('0' + f.getHours()).slice(-2) + ':' + ('0' + f.getMinutes()).slice(-2) + ' h</b><p>Guiones y presentación de ideas' + (st === 'movida' ? ' · <span class="fl-dim">se movió de fecha</span>' : '') + (st === 'novoy' ? ' · <span class="fl-rojo">después te recuerdo preguntar qué se presentó</span>' : '') + '</p></div>' +
          '<div class="fl-bs">' + b('voy', 'Voy') + b('novoy', 'No voy') + '<button class="fl-b' + (st === 'movida' ? ' on' : '') + '" data-film-mover="' + esc(r.clave) + '" data-ffecha="' + esc(r.fecha) + '" data-fhora="' + esc(r.hora || '16:00') + '">Cambió</button></div></div>';
      };
      const reus = F.reuniones.filter(r => r.fecha >= hoyId_ || (D.est(r.clave) || {}).estado === 'novoy').map(reunion).filter(Boolean);
      const gEst = { revisar: ['Se presenta', 'ok'], pendiente: ['Fede lo está escribiendo', ''], correccion: ['En corrección', 'warn'], aprobado: ['Aprobado', 'ok'] };
      const gs = D.guiones.filter(x => x.gest !== 'aprobado').sort((a, b) => (a.gest === 'revisar' ? 0 : 1) - (b.gest === 'revisar' ? 0 : 1));
      const guion = x => '<div class="fl-r"><div class="fl-t"><a class="lnk" href="' + esc(x.ourl || x.url) + '" target="_blank" rel="noopener">' + esc(x.n) + '</a><div class="fl-m"><span class="pill ' + (gEst[x.gest] || ['', ''])[1] + '">' + (gEst[x.gest] || [x.gest])[0] + '</span>' + (x.salida ? '<span class="fl-dim">sale ' + dm(new Date(x.salida)) + '</span>' : '') + '</div></div></div>';
      const gg = {}; gs.forEach(x => (gg[x.m[0]] = gg[x.m[0]] || []).push(x));
      const carp = Object.keys(gg).map(s => {
        const L = gg[s], nP = L.filter(x => x.gest === 'revisar').length, k = 'film:gui:' + s, abierta = S.abiertos[k] != null ? S.abiertos[k] : (nP > 0 || Object.keys(gg).length <= 2);
        return '<div class="mcar' + (abierta ? ' on' : '') + '"><button class="mcar-h" data-mcar="' + esc(k) + '" data-abierta="' + (abierta ? 1 : 0) + '"><span class="dotm" style="background:' + color(s) + '"></span><b>' + esc(nomMarcaF(s)) + '</b><small>' + L.length + '</small>' + (nP ? '<em>' + nP + (nP === 1 ? ' se presenta' : ' se presentan') + '</em>' : '') + '<i>' + (abierta ? '−' : '+') + '</i></button>' + (abierta ? '<div class="fl-list">' + L.map(guion).join('') + '</div>' : '') + '</div>';
      }).join('');
      return '<div class="sec"><div class="sec-h"><h2>Reuniones<small>lunes y viernes · guiones y presentación de ideas</small></h2></div>' + (reus.length ? reus.join('') : '<div class="empty">No hay reuniones en los próximos días.</div>') + '</div>' +
        '<div class="sec"><div class="sec-h"><h2>Guiones de tus marcas<small>' + gs.length + ' en curso</small></h2></div>' + (gs.length ? carp : '<div class="empty">No hay guiones en curso de tus marcas.</div>') + '</div>';
    }
    // ================= Presencialidad: visitas de la semana + registro de asistencias =================
    const A = asistencias(), pre = 'film:' + S.data.yo.clave + ':asis:';
    const DIAS_C = ['L', 'M', 'X', 'J', 'V', 'S'], NOM_D = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const visita = (v, n) => {
      const lun = lunesDe(NOW, n), viejo = D.est(v.clave), fuiViejo = viejo && viejo.estado === 'hecho';
      const dias = DIAS_C.map((l, i) => { const f = ymdL(new Date(lun.getFullYear(), lun.getMonth(), lun.getDate() + i)); return { l: l, f: f, k: pre + f + ':' + v.marca, on: !!D.est(pre + f + ':' + v.marca), nom: NOM_D[i] }; });
      const fui = dias.filter(d => d.on && d.f <= hoyId_), voy = dias.filter(d => d.on && d.f > hoyId_);
      const txt = (fui.length ? 'Fuiste ' + fui.map(d => d.nom).join(' y ') : '') + (fui.length && voy.length ? ' · ' : '') + (voy.length ? 'Vas ' + voy.map(d => d.nom).join(' y ') : '') || (fuiViejo ? 'Fuiste' : v.ideal ? 'Ideal ' + v.ideal : 'Todavía sin día');
      return '<div class="fl-v' + (fui.length || fuiViejo ? ' ok' : '') + '"><div class="fl-vn">' + tagM(v.marca) + '<small>' + esc(txt) + '</small></div>' +
        '<div class="fl-vd">' + dias.map(d => '<button class="fl-d' + (d.on ? (d.f <= hoyId_ ? ' on' : ' plan') : '') + (d.f === hoyId_ ? ' hoy' : '') + '" data-film-est="' + esc(d.k) + '" data-estado="' + (d.on ? 'deshacer' : 'hecho') + '" data-detalle="semanal" data-fmarca="' + esc(v.marca) + '" title="' + d.nom + ' ' + (+d.f.slice(8)) + '" aria-pressed="' + (d.on ? 'true' : 'false') + '">' + d.l + '<small>' + (+d.f.slice(8)) + '</small></button>').join('') + '</div></div>';
    };
    const vis = (cu, n) => { const L = F.visitas.filter(v => v.cuando === cu && pasa([v.marca])); return L.length ? '<div class="fl-vg"><h3>' + (n ? 'La semana que viene' : 'Esta semana') + '</h3>' + L.map(v => visita(v, n)).join('') + '</div>' : ''; };
    // registro: carpetas por mes y, adentro, por semana
    const MES = MESES.map(m => m.charAt(0).toUpperCase() + m.slice(1));
    const fd = f => new Date(f + 'T12:00:00');
    const filaA = a => '<div class="fl-r"><div class="fl-t"><b class="fl-af">' + dm(fd(a.fecha)) + '</b>' + (a.fecha > hoyId_ ? ' <span class="fl-dim">(planeado)</span>' : '') + '<div class="fl-m"><span class="tag"><i style="background:' + color(a.marca) + '"></i>' + esc(nomMarcaF(a.marca)) + '</span><span class="pill ' + (a.extra ? 'warn' : 'ok') + '">' + (a.extra ? 'Extra' : 'Cobertura semanal') + '</span>' + (a.que ? '<span>' + esc(a.que) + '</span>' : '') + '</div></div><button class="lnk fl-q" data-film-est="' + esc(a.clave) + '" data-estado="deshacer" data-fmarca="' + esc(a.marca) + '">quitar</button></div>';
    const meses = {}; A.forEach(a => (meses[a.fecha.slice(0, 7)] = meses[a.fecha.slice(0, 7)] || []).push(a));
    const mesHoy = hoyId_.slice(0, 7), semHoy = ymdL(lunesDe(NOW, 0));
    const registro = Object.keys(meses).sort().reverse().map(mk => {
      const L = meses[mk], nS = L.filter(a => !a.extra).length, nX = L.length - nS, k = 'film:asis:' + mk, abierta = S.abiertos[k] != null ? S.abiertos[k] : mk === mesHoy;
      const sems = {}; L.forEach(a => { const s = ymdL(lunesDe(fd(a.fecha), 0)); (sems[s] = sems[s] || []).push(a); });
      const cuerpo = Object.keys(sems).sort().reverse().map(sk => {
        const k2 = 'film:asis:s:' + sk, ab2 = S.abiertos[k2] != null ? S.abiertos[k2] : sk >= semHoy || Object.keys(sems).length === 1, l = fd(sk);
        return '<div class="fl-sem' + (ab2 ? ' on' : '') + '"><button class="fl-sem-h" data-mcar="' + esc(k2) + '" data-abierta="' + (ab2 ? 1 : 0) + '"><b>Semana del ' + l.getDate() + '/' + (l.getMonth() + 1) + '</b><small>' + sems[sk].length + (sems[sk].length === 1 ? ' día' : ' días') + '</small><i>' + (ab2 ? '−' : '+') + '</i></button>' + (ab2 ? '<div class="fl-list">' + sems[sk].map(filaA).join('') + '</div>' : '') + '</div>';
      }).join('');
      return '<div class="mcar' + (abierta ? ' on' : '') + '"><button class="mcar-h" data-mcar="' + esc(k) + '" data-abierta="' + (abierta ? 1 : 0) + '"><span class="dotm" style="background:var(--y)"></span><b>' + MES[+mk.slice(5) - 1] + ' ' + mk.slice(0, 4) + '</b><small>' + L.length + '</small><em class="suave">' + nS + ' semanal' + (nS === 1 ? '' : 'es') + (nX ? ' · ' + nX + ' extra' : '') + '</em><i>' + (abierta ? '−' : '+') + '</i></button>' + (abierta ? '<div class="fl-sems">' + cuerpo + '</div>' : '') + '</div>';
    }).join('');
    const esteMes = (meses[mesHoy] || []).filter(a => a.fecha <= hoyId_), estaSem = A.filter(a => a.fecha >= semHoy && a.fecha <= hoyId_);
    return secProducciones() + '<div class="mio-sts fl-sts">' + tile(D.visPend.length, 'Visitas', 'te faltan esta semana', 'warn', 'data-nada') + tile(estaSem.length, 'Esta semana', 'días que fuiste', 'ok', 'data-nada') + tile(esteMes.length, 'Este mes', 'presencialidades', 'ok', 'data-nada') + tile(esteMes.filter(a => a.extra).length, 'Extras', 'este mes', 'y', 'data-nada') + '</div>' +
      '<div class="sec"><div class="sec-h"><h2>Visitas<small>por semana</small></h2><button class="btn y fl-mas" data-film-anotar>+ Anotar</button></div><div class="fl-vs">' + vis('esta semana', 0) + vis('la semana que viene', 1) + '</div>' +
      '<p class="ayuda">Tocá cada día que fuiste o que pensás ir: podés marcar más de uno por semana. Con <b>+ Anotar</b> cargás una cobertura extra o una marca que no es de las tuyas de siempre.</p></div>' +
      '<div class="sec"><div class="sec-h"><h2>Asistencias<small>' + A.length + ' anotadas</small></h2></div>' + (A.length ? registro : '<div class="empty">Todavía no hay presencialidades anotadas.</div>') + '</div>';
  }
  // anotar una presencialidad a mano: cualquier marca, semanal o extra (con qué fue a hacer)
  function filmAnotar() {
    const F = S.data.film || {}, todas = (F.todas && F.todas.length ? F.todas : S.data.marcas).slice().sort((a, b) => a.nombre < b.nombre ? -1 : 1);
    modal('<h3>Anotar presencialidad</h3><div class="two"><label class="field"><span>Día</span><input type="date" id="faF" value="' + ymdL(NOW) + '"></label><label class="field"><span>Marca</span><select id="faM">' + todas.map(m => '<option value="' + esc(m.slug) + '">' + esc(m.nombre) + '</option>').join('') + '</select></label></div>' +
      '<div class="fl-tipo"><label><input type="radio" name="faT" value="semanal" checked><span>Cobertura semanal</span></label><label><input type="radio" name="faT" value="extra"><span>Algo extra</span></label></div>' +
      '<label class="field"><span>¿Qué fuiste a hacer? (si es extra)</span><textarea id="faQ" rows="2" maxlength="200" placeholder="Evento, lanzamiento, fotos de producto…"></textarea></label>' +
      '<div class="err"></div><div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Guardar</button></div>', async m => {
      const f = $('#faF', m).value, s = $('#faM', m).value, t = (m.querySelector('input[name=faT]:checked') || {}).value || 'semanal', q = $('#faQ', m).value.trim().replace(/\|/g, '/');
      if (!f) throw new Error('Elegí el día.');
      if (t === 'extra' && !q) throw new Error('Contá qué fuiste a hacer.');
      const base = 'film:' + S.data.yo.clave + ':asis:' + f + ':' + s;
      await filmEstado(t === 'extra' || F.est[base] ? base + ':x' + Date.now().toString(36) : base, 'hecho', t === 'extra' ? 'extra|' + q : 'semanal' + (q ? '|' + q : ''), s);
    });
  }
  // guardar lo que marca (visitas y reuniones): queda en el Registro del Sheet, como el resto del panel
  async function filmEstado(clave, estado, detalle, marca_) {
    const F = S.data.film; if (!F) return;
    const antes = F.est[clave] || null;
    if (estado === 'deshacer') delete F.est[clave]; else F.est[clave] = { estado, detalle: detalle || '', fecha: ahoraTxt(), persona: S.data.yo.clave };
    render();
    try { await post({ action: 'marcar', tipo: 'film', clave, marca: marca_ || '', estado, detalle: detalle || '', periodo: '' }); }
    catch (e) { if (antes) F.est[clave] = antes; else delete F.est[clave]; render(); toast('✗ No se guardó: ' + esc(e.message)); }
  }
  function filmMover(clave, fecha, hora) {
    modal('<h3>¿A cuándo se movió la reunión?</h3><p>Queda anotado solo para vos.</p><div class="two"><label class="field"><span>Día</span><input type="date" id="fmF" value="' + esc(fecha) + '"></label><label class="field"><span>Hora</span><input type="time" id="fmH" value="' + esc(hora) + '"></label></div>' +
      '<div class="err"></div><div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Guardar</button></div>', async m => {
      const f = $('#fmF', m).value, h = $('#fmH', m).value || '16:00'; if (!f) throw new Error('Elegí el día.');
      await filmEstado(clave, 'movida', f + ' ' + h);
    });
  }
  function filmListo(id) {
    const c = S.data.cards.find(x => x.id === id); if (!c) return;
    const hist = c.formato === 'historia' || /histori/i.test(c.lista || '');   // las historias van directo a aprobado, sin revisión
    modal('<h3>¿Listo "' + esc(c.n.slice(0, 60)) + '"?</h3><p>' + (hist ? 'Es una historia: pasa directo a <b>Material listo para entregar</b> en ' + esc(c.tablero) + ', sin revisión.' : 'La tarjeta pasa a <b>En revisión</b> en ' + esc(c.tablero) + ' y le llega a quien revisa.') + '</p><label class="field"><span>Nota (opcional)</span><textarea id="flN" rows="2" maxlength="1000" placeholder="Link al video, aclaraciones…"></textarea></label>' +
      '<div class="err"></div><div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>' + (hist ? 'Sí, pasar a listo' : 'Sí, pasar a revisión') + '</button></div>', async m => {
      const r = await post({ action: 'entregarPieza', cardId: c.id, nota: $('#flN', m).value.trim(), marca: c.m[0], nombre: c.n, tablero: c.tablero, formato: hist ? 'historia' : (c.formato || '') });
      if (r.historia) S.data.cards = S.data.cards.filter(x => x.id !== c.id); else { c.etapa = 'revision'; if (r.lista) c.lista = r.lista; }
      render(); if (!r.ya) confeti();
      toast((r.pasos || ['Pasada a En revisión']).map(p => '✓ ' + esc(p)).join('<br>'));
    });
  }

  // v4 (22/10/2026): devuelve solo el cuerpo (el título lo pone vistaProject). Equipo: una pestaña por persona y el detalle de una sola.
  // Registro: las personas como filtros arriba (en vez de un desplegable).
  function vistaEquipo(soloRegistro) {
    const P = S.proj, f = S.filtroReg;
    const nm = c => { const p = P.personas.find(x => x.clave === c); return p ? p.nombre : c; };
    const ms = s => { const m = P.marcas.find(x => x.slug === s); return m ? m.nombre : s; };
    if (soloRegistro) return '<div class="chips reg-chips"><button class="chip' + (!f ? ' on' : '') + '" data-freg="">Todos</button>' + P.personas.map(p => '<button class="chip' + (f === p.clave ? ' on' : '') + '" data-freg="' + esc(p.clave) + '">' + esc(p.nombre) + '</button>').join('') + '</div>' +
      '<table class="tbl"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th class="hm">Marca</th><th>Estado</th></tr></thead><tbody>' +
      P.registro.filter(r => !f || r.persona === f).map(r => '<tr><td class="m">' + esc(r.fecha.slice(5)) + '</td><td>' + esc(nm(r.persona)) + '</td><td>' + esc(({ reunion: 'Reunión', rutina: 'Rutina', input: 'Input', evento: 'Calendario', card: 'Tarjeta', plan: 'Arrancó el día' })[r.tipo] || r.tipo) + ' · <span style="color:var(--muted)">' + esc((r.clave.split(':')[1] || '').replace(/-/g, ' ')) + '</span>' + (r.detalle ? '<div style="color:var(--muted);font-size:12px">' + esc(r.detalle) + '</div>' : '') + '</td><td class="hm m">' + esc(r.marca ? ms(r.marca) : '—') + '</td><td><span class="pill ' + ({ hecho: 'ok', agendada: 'ok', archivado: '', procesado: 'y', project: 'y' }[r.estado] || '') + '">' + esc(r.estado) + '</span></td></tr>').join('') +
      '</tbody></table>';
    const L = P.personas, alerta = p => p.inputs.sinTocar > 0 || p.reuniones.some(r => !r.estado && r.vencida);
    let sel = S.eqSel; if (!L.some(p => p.clave === sel)) sel = ((L.find(alerta) || L[0]) || {}).clave;
    const p = L.find(x => x.clave === sel);
    if (!p) return '<div class="empty">Todavía no hay datos del equipo.</div>';
    const pct = p.rutinas.total ? Math.round(p.rutinas.hechas / p.rutinas.total * 100) : 0;
    const ag = p.reuniones.filter(r => r.estado), sin = p.reuniones.filter(r => !r.estado);
    return '<div class="gtabs eq-tabs" role="tablist">' + L.map((x, i) => { const pend = x.rutinas.total - x.rutinas.hechas;
        return '<button role="tab" aria-selected="' + (x.clave === sel) + '" class="gtab' + (x.clave === sel ? ' on' : '') + '" data-eqsel="' + esc(x.clave) + '"><i class="gtab-n">' + String(i + 1).padStart(2, '0') + ' · ' + esc(x.rol) + '</i><span class="gtab-t">' + esc(x.nombre) + '</span><b>' + pend + '</b>' + (x.inputs.sinTocar ? '<em>' + x.inputs.sinTocar + ' inp.</em>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="gpanel eq-panel" role="tabpanel"><div class="person">' +
        '<div class="pr"><span>Rutinas de hoy y la semana</span><b>' + p.rutinas.hechas + '/' + p.rutinas.total + '</b></div><div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="pr"><span>Inputs sin tocar</span><b' + (p.inputs.sinTocar ? ' style="color:var(--warn)"' : '') + '>' + p.inputs.sinTocar + ' de ' + p.inputs.total + '</b></div>' +
        (p.rutinas.pendientes && p.rutinas.pendientes.length ? '<div class="lst">' + p.rutinas.pendientes.slice(0, 8).map(r => '<div class="it"><span>' + esc(r.tarea) + (r.marca ? ' · ' + esc(ms(r.marca)) : '') + '</span>' + (r.vencida ? '<span class="pill bad">vencida</span>' : '') + '</div>').join('') + '</div>' : '') +
        (p.reuniones.length ? '<div class="lst">' + sin.concat(ag).map(r => '<div class="it"><span>' + esc(r.nombre) + (r.marca ? ' · ' + esc(ms(r.marca)) : '') + '</span><span>' + (r.estado ? '<span class="pill ok">' + (/^\d{4}-\d\d-\d\d/.test(r.estado.detalle) ? corto(ymdD(r.estado.detalle)) + ' · ' + esc(r.estado.detalle.slice(11, 16)) : esc(r.estado.detalle.slice(0, 16))) + '</span>' : '<span class="pill ' + (r.vencida ? 'bad' : 'warn') + '">sin fecha · hasta el ' + r.hasta + '</span>') + '</span></div>').join('') + '</div>' : '') +
        '<div style="margin-top:14px"><a class="btn" href="?p=' + encodeURIComponent(p.clave) + '">Ver su panel →</a></div></div></div>';
  }

  /* ---------------- interacción ---------------- */
  function bind(root) {
    agpBind(root);
    root.querySelectorAll('[data-foto]').forEach(b => b.onclick = () => fotoAnotar(b.dataset.foto));
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
      const ir = () => { S.tab = b.dataset.tab; LS.set('tab', S.tab); render(); window.scrollTo({ top: 0 }); };
      // si el navegador demora la transición (pestaña en segundo plano), a los 300 ms se cambia igual
      let listo = false; const una = () => { if (!listo) { listo = true; ir(); } };
      if (document.startViewTransition && document.visibilityState === 'visible' && S.tab !== b.dataset.tab && !matchMedia('(prefers-reduced-motion: reduce)').matches) { try { const vt = document.startViewTransition(una); ['ready', 'finished', 'updateCallbackDone'].forEach(k => vt[k] && vt[k].catch(() => {})); } catch (e) { una(); } setTimeout(una, 300); } else una();   // si se cambia rápido, la transición anterior se salta: sin error
    });
    root.querySelectorAll('[data-marca]').forEach(b => b.onclick = () => { S.marca = b.dataset.marca; render(); });
    // lista de marcas: se abre con el botón y se cierra al elegir o al tocar afuera
    const mp = $('[data-mpop]', root); if (mp) mp.onclick = e => { e.stopPropagation(); const l = $('.mpop-l', root); l.classList.toggle('hidden'); if (!l.classList.contains('hidden')) document.addEventListener('click', function f() { l.classList.add('hidden'); document.removeEventListener('click', f); }, { once: true }); };
    // estrella: marcar o sacar una prioridad del día (la primera del día suma racha)
    root.querySelectorAll('[data-star]').forEach(b => b.onclick = e => { e.stopPropagation(); togglePrio(b.dataset.star); });
    root.querySelectorAll('[data-check]').forEach(b => b.onclick = () => marcar(b.dataset.check));
    root.querySelectorAll('[data-agendar]').forEach(b => b.onclick = () => agendar(b.dataset.agendar));
    root.querySelectorAll('[data-ver-input]').forEach(b => b.onclick = () => { S.tab = 'inputs'; LS.set('tab', 'inputs'); render(); const el = document.getElementById('in-' + b.dataset.verInput); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    root.querySelectorAll('[data-inp]').forEach(b => b.onclick = () => inputAccion(b.dataset.id, b.dataset.inp));
    root.querySelectorAll('[data-archivar]').forEach(b => b.onclick = () => archivar(b.dataset.archivar));
    const q = $('#qres', root); if (q) q.oninput = () => { S.filtroRes = q.value; const pos = q.selectionStart; render(); const n = $('#qres'); n.focus(); n.setSelectionRange(pos, pos); };
    const fr = $('#freg', root); if (fr) fr.onchange = () => { S.filtroReg = fr.value; render(); };
    root.querySelectorAll('[data-claude]').forEach(b => b.onclick = () => { const c = S.data.cards.find(x => x.id === b.dataset.claude); if (c) abrirClaude(promptTarjeta(c)); });
    root.querySelectorAll('[data-claude-plan]').forEach(b => b.onclick = () => abrirClaude(promptPlan()));
    root.querySelectorAll('[data-copiar]').forEach(b => b.onclick = () => { const c = S.data.cards.find(x => x.id === b.dataset.copiar); if (c) copiar(promptTarjeta(c)); });
    root.querySelectorAll('[data-copiar-clave]').forEach(b => b.onclick = () => copiar(S.data.links.claveBrain, 'Contraseña copiada: pegala con Ctrl+V.'));
    root.querySelectorAll('[data-copiar-plan]').forEach(b => b.onclick = () => copiar(promptPlan()));
    const ms = $('#mas', root); if (ms) ms.onclick = () => { S.todasSug = true; render(); };
    root.querySelectorAll('[data-todavia]').forEach(b => b.onclick = () => { S.todavia = S.todavia === b.dataset.todavia ? null : b.dataset.todavia; render(); if ($('#drawer')) { const c = S.data.cards.find(x => x.id === S.todavia); if (c) detalleInput(c); } });
    root.querySelectorAll('[data-reloj]').forEach(b => b.onclick = () => { S.reloj = b.dataset.reloj || null; render(); });
    root.querySelectorAll('[data-pliegue]').forEach(b => b.onclick = () => { S.abiertos[b.dataset.pliegue] = !S.abiertos[b.dataset.pliegue]; render(); });
    root.querySelectorAll('[data-det-input]').forEach(b => b.onclick = () => { const c = S.data.cards.find(x => x.id === b.dataset.detInput); if (c) detalleInput(c); });
    root.querySelectorAll('[data-recordar]').forEach(b => b.onclick = () => recordar(b.dataset.id, b.dataset.recordar));
    // campanita de cada tarjeta: recordatorio personal (recordatorios.js), por Discord y/o en el panel
    root.querySelectorAll('[data-rec]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const c = ((S.data && S.data.cards) || []).find(x => x.id === b.dataset.rec) || {};
      if (window.Recordatorios) window.Recordatorios.abrir({ id: b.dataset.rec, n: c.n || 'Tarjeta', url: c.url || '', due: c.due || '', marca: (c.m || [])[0] || '' });
    });
    root.querySelectorAll('[data-crear]').forEach(b => b.onclick = () => crearTarjeta(b.dataset.crear || null));
    root.querySelectorAll('[data-crear-nueva]').forEach(b => b.onclick = () => crearTarjeta(null));
    root.querySelectorAll('[data-pend]').forEach(b => b.onclick = () => anotarPendientes());
    root.querySelectorAll('[data-subir-rec]').forEach(b => b.onclick = () => subirRecurso());
    root.querySelectorAll('[data-colab-ed]').forEach(b => b.onclick = () => editarColab(b.dataset.colabEd));
    root.querySelectorAll('[data-ver-corr]').forEach(b => b.onclick = () => {
      S.tab = 'hoy'; LS.set('hoymodo', 'tipo'); S.abiertos['h-corr'] = true; S.abiertos['h-card'] = true; render();
      const el = document.querySelector('[data-mcar="h-corr"]') || document.querySelector('[data-mcar="h-card"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); else toast('Hoy no tenés correcciones ni tarjetas por vencer.');
    });
    root.querySelectorAll('[data-crear-en]').forEach(b => b.onclick = () => crearTarjeta(null, (b.dataset.marcas || '').split(',').filter(Boolean)[0] || null, b.dataset.crearEn === 'input' ? 'scl' : b.dataset.crearEn, b.dataset.crearEn === 'input' ? 'input' : ''));
    root.querySelectorAll('[data-mover]').forEach(b => b.onclick = () => moverTarjeta(b.dataset.mover));
    root.querySelectorAll('[data-dc]').forEach(a => a.addEventListener('click', () => { dcVer([a.dataset.dc]); setTimeout(render, 300); }));
    // cualquier título de sección (— FEDE TIENE QUE ENTREGAR, — EN EL DÍA…) se pliega al tocarlo; queda recordado
    if (root.id === 'app') {
      const pleg = LS.get('plegadas', {});
      root.querySelectorAll('#view .sec > .sec-h').forEach(h => {
        const t = h.querySelector('h2'); if (!t) return;
        const k = S.tab + ':' + t.childNodes[0].textContent.trim().toLowerCase();
        if (pleg[k]) h.parentNode.classList.add('plegada');
        h.classList.add('plegable');
        h.onclick = e => { if (e.target.closest('button,a,select')) return; const p = LS.get('plegadas', {}); p[k] = !p[k]; LS.set('plegadas', p); h.parentNode.classList.toggle('plegada', !!p[k]); };
      });
    }
    root.querySelectorAll('[data-pieza]').forEach(b => b.onclick = () => abrirPieza(b.dataset.pieza));
    root.querySelectorAll('[data-revseg]').forEach(b => b.onclick = () => { LS.set('revseg', b.dataset.revseg); render(); });
    root.querySelectorAll('[data-mcar]').forEach(b => b.onclick = () => { S.abiertos[b.dataset.mcar] = b.dataset.abierta !== '1'; render(); });
    root.querySelectorAll('[data-dcmodo]').forEach(b => b.onclick = () => { LS.set('dcmodo', b.dataset.dcmodo); render(); });
    root.querySelectorAll('[data-dcdia]').forEach(b => b.onclick = () => { S.abiertos[b.dataset.dcdia] = b.dataset.abierta !== '1'; render(); });
    root.querySelectorAll('[data-dc-todo]').forEach(b => b.onclick = () => { dcVer(menciones().map(m => m.id)); render(); });
    root.querySelectorAll('[data-projtab]').forEach(x => x.onclick = () => { S.projTab = x.dataset.projtab; LS.set('projtab', S.projTab); render(); window.scrollTo({ top: 0 }); });
    root.querySelectorAll('[data-mio-marca]').forEach(x => x.onclick = () => { S.projMarca = x.dataset.mioMarca; render(); });
    root.querySelectorAll('[data-mio-nuevo]').forEach(x => x.onclick = nuevoPedido);
    root.querySelectorAll('[data-mio-rf]').forEach(x => x.onclick = () => refrescarMio());
    root.querySelectorAll('[data-mio-ir]').forEach(x => x.onclick = () => { LS.set('miosel', x.dataset.mioIr); render(); const g = $('.gpanel'); if (g) g.classList.add('entra'); });
    root.querySelectorAll('[data-anm]').forEach(x => x.onclick = () => { LS.set('anmarca', x.dataset.anm); render(); const g = $('.gpanel'); if (g) g.classList.add('entra'); });
    root.querySelectorAll('[data-anmes]').forEach(x => x.onclick = () => { S.anMes = +x.dataset.anmes; render(); });
    root.querySelectorAll('[data-mio-listo]').forEach(x => x.onclick = e => { e.stopPropagation(); x.classList.add('va'); setTimeout(() => mioListo(x.dataset.mioListo), 260); });
    root.querySelectorAll('[data-mio-card]').forEach(x => { const abrir = e => { if (e.target.closest('a,button')) return; mioFicha(x.dataset.mioCard); }; x.onclick = abrir; x.onkeydown = e => { if (e.key === 'Enter') abrir(e); }; });
    root.querySelectorAll('[data-eqsel]').forEach(x => x.onclick = () => { S.eqSel = x.dataset.eqsel; render(); const g = $('.gpanel'); if (g) g.classList.add('entra'); });
    root.querySelectorAll('[data-freg]').forEach(x => x.onclick = () => { S.filtroReg = x.dataset.freg; render(); });
    root.querySelectorAll('[data-viva]').forEach(x => x.onclick = () => { S.viva = null; render(); revisionViva(); });
    root.querySelectorAll('[data-filmseg]').forEach(x => x.onclick = () => { LS.set('filmseg', x.dataset.filmseg); render(); });
    root.querySelectorAll('[data-film-listo]').forEach(x => x.onclick = () => filmListo(x.dataset.filmListo));
    root.querySelectorAll('[data-film-est]').forEach(x => x.onclick = () => filmEstado(x.dataset.filmEst, x.dataset.estado, x.dataset.detalle || '', x.dataset.fmarca || ''));
    root.querySelectorAll('[data-film-mover]').forEach(x => x.onclick = () => filmMover(x.dataset.filmMover, x.dataset.ffecha, x.dataset.fhora));
    root.querySelectorAll('[data-film-anotar]').forEach(x => x.onclick = () => filmAnotar());
    root.querySelectorAll('[data-hoyg]').forEach(x => x.onclick = () => { LS.set('hoygrupo', x.dataset.hoyg); render(); const p = $('.gpanel'); if (p) { p.classList.add('entra'); } });
    root.querySelectorAll('[data-prod-nueva]').forEach(x => x.onclick = () => prodEditar());
    root.querySelectorAll('[data-perfil]').forEach(x => x.onclick = () => perfilEditar(false));
    root.querySelectorAll('[data-lin]').forEach(x => x.onclick = () => linVer());
    root.querySelectorAll('[data-cmdia]').forEach(x => x.onclick = () => { S.cmDia = x.dataset.cmdia; render(); });
    root.querySelectorAll('[data-cmop]').forEach(x => x.onclick = () => cmHacer(x.dataset.cm, x.dataset.cmop));
    root.querySelectorAll('[data-cmauto]').forEach(x => x.onclick = () => cmAutoVer(x.dataset.cmauto));
    root.querySelectorAll('[data-cmvolver]').forEach(x => x.onclick = () => { const c = (S.data.cmDia || []).find(y => y.id === x.dataset.cmvolver); if (c) cmHacer(c.id, 'volver', c.previaId || ''); });
    root.querySelectorAll('[data-ayuda]').forEach(x => x.onclick = e => { e.stopPropagation(); ayudaVer(tabActualAyuda()); });
    root.querySelectorAll('[data-tourbtn]').forEach(x => x.onclick = () => tourVer());
    root.querySelectorAll('[data-pregunta]').forEach(x => x.onclick = () => ayudaVer(tabActualAyuda()));
    root.querySelectorAll('[data-mas-caja]').forEach(x => x.onclick = () => { const d = document.createElement('div'); d.innerHTML = costado(true); const b = d.querySelectorAll('.box')[+x.dataset.masCaja]; if (b) hoja(x.querySelector('b').textContent, b.outerHTML); });
    root.querySelectorAll('[data-prod]').forEach(x => { const abrir = e => { if (e.target.closest('button')) return; const it = ((S.data.film || {}).prod || { items: [] }).items.find(z => z.id === x.dataset.prod); if (it) prodEditar(it); }; x.onclick = abrir; x.onkeydown = e => { if (e.key === 'Enter') abrir(e); }; });
    root.querySelectorAll('[data-prod-est]').forEach(x => x.onclick = () => prodEstado(x.dataset.prodEst, x.dataset.v));
    if (esFilm() && !S._pubVisto) { S._pubVisto = 1; setTimeout(prodPublicados, 1500); }
    root.querySelectorAll('[data-hoymodo]').forEach(x => x.onclick = () => { LS.set('hoymodo', x.dataset.hoymodo); render(); });
    root.querySelectorAll('[data-rf]').forEach(b => b.onclick = actualizar);
    root.querySelectorAll('[data-reconectar]').forEach(b => b.onclick = reconectar);
    root.querySelectorAll('[data-dc-ok]').forEach(b => b.onclick = () => { dcVer([b.dataset.dcOk]); render(); });
    root.querySelectorAll('[data-dc-leidas]').forEach(b => b.onclick = () => { S.abiertos.dcleidas = !S.abiertos.dcleidas; render(); });
    // "Arrancá el día": elegir prioridades
    root.querySelectorAll('[data-prio-skip]').forEach(b => b.onclick = () => { LS.set('plan', { dia: hoyId(), ids: [], skip: true }); render(); });
    root.querySelectorAll('[data-prio-reset]').forEach(b => b.onclick = () => { LS.set('plan', { dia: hoyId(), ids: [], skip: true }); render(); });
    root.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { S.segSem = b.dataset.seg; render(); });
    root.querySelectorAll('[data-diasem]').forEach(b => b.onclick = () => { S.diaSem = Number(b.dataset.diasem); render(); });
    root.querySelectorAll('[data-celda]').forEach(b => b.onclick = () => marcarCelda(b.dataset.celda));
    root.querySelectorAll('[data-fecha]').forEach(b => b.onclick = () => { const f = proximasFechas(120).find(x => fkey(x) === b.dataset.fecha); if (f) detalleFecha(f); });
    root.querySelectorAll('[data-card-det]').forEach(b => b.onclick = () => { const c = S.data.cards.find(x => x.id === b.dataset.cardDet); if (c) detalleCard(c); });
    root.querySelectorAll('[data-dia]').forEach(b => b.onclick = () => detalleDia(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + Number(b.dataset.dia))));
    root.querySelectorAll('[data-por-salir]').forEach(b => b.onclick = () => {
      const L = porSalir(), dias = {};
      L.forEach(c => { const k = diasA(new Date(c.due)); (dias[k] = dias[k] || []).push(c); });
      panelLateral('Por salir · próximos ' + S.data.ajustes.porVencer + ' días', L.length
        ? '<p class="dw-p">Reels, carruseles y piezas que salen pronto. Abrí cada una y chequeá <b>copy, diseño, fecha y hashtags</b>: si algo cambió (precio, promo, stock), corregilo antes de que salga.</p>' +
          Object.keys(dias).sort((a, b) => a - b).map(k => '<div class="dw-l">' + (k == 0 ? 'Hoy' : k == 1 ? 'Mañana' : cuando(new Date(dias[k][0].due))) + '</div>' +
            dias[k].map(c => '<div class="ag card"><span class="h">' + hm(new Date(c.due)) + '</span><span class="x"><span class="pill">' + formato(c) + '</span> <button class="lnk" data-card-det="' + esc(c.id) + '">' + esc(c.n) + '</button> <span class="k">· ' + esc(c.lista) + '</span></span>' + tagM(c.m[0]) + '</div>').join('')).join('')
        : '<div class="empty">No sale nada en los próximos días.</div>');
    });
    root.querySelectorAll('[data-res-m]').forEach(b => b.onclick = () => { S.resAb = S.resAb || {}; S.resAb[b.dataset.resM] = !S.resAb[b.dataset.resM]; render(); });
    root.querySelectorAll('[data-vencidas]').forEach(b => b.onclick = () => {
      const v = vencidas();
      panelLateral('Vencidas · últimos 15 días', v.length ? v.sort((a, b) => new Date(a.due) - new Date(b.due)).map(c => '<div class="ag card"><span class="h">' + cuando(new Date(c.due)).replace('venció ', '') + '</span><span class="x"><button class="lnk" data-card-det="' + esc(c.id) + '">' + esc(c.n) + '</button> <span class="k">· ' + esc(c.lista) + '</span></span>' + tagM(c.m[0]) + '</div>').join('') : '<div class="empty">No hay nada vencido. Bien ahí.</div>');
    });
    root.querySelectorAll('[data-fechas]').forEach(b => b.onclick = () => {
      const fs = proximasFechas(45);
      panelLateral('Fechas que se vienen · 45 días', fs.length ? fs.map(f => '<div class="ag ' + (f.tipo === 'feriado' ? 'fer' : f.tipo === 'sugerida' ? 'sugr' : 'efem') + '"><span class="h">' + corto(f.d) + '</span><span class="x"><button class="lnk" data-fecha="' + esc(fkey(f)) + '">' + esc(f.n) + '</button>' + (f.tipo === 'sugerida' ? ' <span class="pill">sugerida</span>' : '') + '</span>' + (f.marcas.length > 2 ? '<span class="k">' + f.marcas.length + ' marcas</span>' : f.marcas.map(tagM).join(' ')) + '</div>').join('') : '<div class="empty">No hay fechas en los próximos 45 días.</div>');
    });
  }

  async function marcar(k, forzar) {
    const x = tareasHoy().find(t => t.k === k); if (!x) return;
    const o = x.obj, antes = o.estado || null, ya = hecho(o);
    if (!forzar && !ya && x.tipo === 'rutina' && rutinaEspecial(o.id, x.marca || '-', () => marcar(k, true))) return;
    o.estado = ya ? null : { estado: 'hecho', fecha: ahoraTxt(), persona: S.data.yo.clave };
    if (!ya) confeti();
    render();
    const periodo = x.tipo === 'rutina' ? k.split(':').pop() : '';
    try {
      await post({ action: 'marcar', tipo: x.tipo, clave: k, marca: x.marca, estado: ya ? 'deshacer' : 'hecho', periodo, detalle: x.tipo === 'evento' ? x.t : (x.tipo === 'card' ? x.t : '') });
      if (!ya) toast('Hecho: ' + esc(x.t.slice(0, 48)), () => marcar(k));
    } catch (e) { o.estado = antes; render(); toast('No se guardó: ' + esc(e.message)); }
  }

  async function inputAccion(id, estado) {
    const c = S.data.cards.find(x => x.id === id); if (!c) return;
    const antes = c.estado || null;
    c.estado = { estado, fecha: ahoraTxt(), persona: S.data.yo.clave };
    confeti();
    render();
    try {
      await post({ action: 'marcar', tipo: 'input', clave: 'inp:' + id, marca: c.m[0], estado, detalle: c.n });
      toast(estado === 'procesado' ? 'Listo. Te vuelvo a preguntar en ' + S.data.ajustes.inputDias + ' días.' : 'Anotado que lo hablaste con el project.', async () => { c.estado = antes; render(); try { await post({ action: 'marcar', tipo: 'input', clave: 'inp:' + id, marca: c.m[0], estado: 'deshacer' }); } catch (e) {} });
    } catch (e) { c.estado = antes; render(); toast('No se guardó: ' + esc(e.message)); }
  }

  /* ---------- editor de descripción como el de Trello (pedido de Joaquín, 20/10/2026) ----------
     Trello guarda la descripción en markdown: lo que se escribe acá con la barra (negrita, itálica, `Historia 1`, listas…) se ve igual allá. */
  const MD_BOTONES = [
    ['h', 'Título', '<b>T</b>'], ['b', 'Negrita (Ctrl+B)', '<b>B</b>'], ['i', 'Itálica (Ctrl+I)', '<i>I</i>'], ['s', 'Tachado', '<s>S</s>'],
    ['c', 'Código, como `Historia 1`', '&lt;/&gt;'], ['hist', 'Siguiente historia (`Historia N`)', 'Historia'], ['ul', 'Lista', '•'], ['ol', 'Lista numerada', '1.'],
    ['q', 'Cita', '❝'], ['hr', 'Separador', '—'], ['a', 'Link', I.link]
  ];
  const mdEditor = (id, valor, filas) => '<div class="mde" data-mde="' + id + '"><div class="mde-bar">' + MD_BOTONES.map(([k, t, i]) => '<button type="button" data-md="' + k + '" title="' + esc(t) + '">' + i + '</button>').join('') +
    '<span class="mde-esp"></span><button type="button" data-md="ver" class="mde-ver">Vista previa</button></div><textarea id="' + id + '" rows="' + (filas || 5) + '">' + esc(valor || '') + '</textarea><div class="mde-prev" hidden></div></div>';
  function mdRender(txt) {
    const inl = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^\w])_([^_]+)_(?!\w)/g, '$1<i>$2</i>').replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<i>$2</i>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const out = []; let lista = null;
    const cerrar = () => { if (lista) { out.push('</' + lista + '>'); lista = null; } };
    String(txt || '').split('\n').forEach(l => {
      let m;
      if ((m = /^\s*[-*+]\s+(.*)/.exec(l))) { if (lista !== 'ul') { cerrar(); out.push('<ul>'); lista = 'ul'; } out.push('<li>' + inl(m[1]) + '</li>'); return; }
      if ((m = /^\s*\d+[.)]\s+(.*)/.exec(l))) { if (lista !== 'ol') { cerrar(); out.push('<ol>'); lista = 'ol'; } out.push('<li>' + inl(m[1]) + '</li>'); return; }
      cerrar();
      if ((m = /^(#{1,6})\s+(.*)/.exec(l))) out.push('<h' + Math.min(6, m[1].length + 2) + '>' + inl(m[2]) + '</h' + Math.min(6, m[1].length + 2) + '>');
      else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) out.push('<hr>');
      else if ((m = /^>\s?(.*)/.exec(l))) out.push('<blockquote>' + inl(m[1]) + '</blockquote>');
      else if (!l.trim()) out.push('<div class="mde-sp"></div>');
      else out.push('<p>' + inl(l) + '</p>');
    });
    cerrar();
    return out.join('');
  }
  function mdBind(root) {
    root.querySelectorAll('.mde').forEach(box => {
      const ta = box.querySelector('textarea'), prev = box.querySelector('.mde-prev');
      const envolver = (a, b, ph) => {
        const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e);
        // sin selección: quedan las marcas con el cursor en el medio (como en Trello); con selección, se envuelve y queda seleccionado
        ta.setRangeText(a + sel + b, s, e, 'end'); ta.setSelectionRange(s + a.length, s + a.length + sel.length); ta.focus();
      };
      const linea = pre => {   // agrega el prefijo al principio de cada línea seleccionada
        const v = ta.value, s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1, e0 = v.indexOf('\n', ta.selectionEnd), e = e0 < 0 ? v.length : e0;
        let n = 0; const nuevo = v.slice(s, e).split('\n').map(l => (typeof pre === 'function' ? pre(++n) : pre) + l).join('\n');
        ta.setRangeText(nuevo, s, e, 'end'); ta.focus();
      };
      const acc = {
        h: () => linea('### '), b: () => envolver('**', '**', 'texto'), i: () => envolver('_', '_', 'texto'), s: () => envolver('~~', '~~', 'texto'), c: () => envolver('`', '`', 'Historia 1'),
        hist: () => { const n = (ta.value.match(/`\s*historia\s*\d+\s*:?\s*`/gi) || []).length + 1, s = ta.selectionStart, antes = ta.value.slice(0, s); ta.setRangeText((antes && !/\n\n$/.test(antes) ? (/\n$/.test(antes) ? '\n' : '\n\n') : '') + '`Historia ' + n + '`\n\n', s, ta.selectionEnd, 'end'); ta.focus(); },
        ul: () => linea('- '), ol: () => linea(n => n + '. '), q: () => linea('> '),
        hr: () => { const s = ta.selectionStart; ta.setRangeText((s && ta.value[s - 1] !== '\n' ? '\n' : '') + '\n---\n\n', s, ta.selectionEnd, 'end'); ta.focus(); },
        a: () => { const u = prompt('Pegá el link'); if (u) envolver('[', '](' + u.trim() + ')', 'texto del link'); },
        ver: b => { const ver = prev.hidden; prev.hidden = !ver; ta.hidden = ver; if (ver) prev.innerHTML = mdRender(ta.value) || '<p class="mde-vacio">Sin descripción</p>'; b.textContent = ver ? 'Escribir' : 'Vista previa'; box.classList.toggle('viendo', ver); }
      };
      box.querySelectorAll('[data-md]').forEach(b => b.onclick = () => { if (b.dataset.md !== 'ver' && ta.hidden) acc.ver(box.querySelector('.mde-ver')); acc[b.dataset.md](b); });
      ta.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && /^[bi]$/i.test(e.key)) { e.preventDefault(); acc[e.key.toLowerCase()](); } });
    });
  }

  /* ---------- adjuntos: elegir, arrastrar o pegar (Ctrl+V de una captura o de una imagen copiada) (pedido de Joaquín, 20/10/2026) ----------
     adjZona(id) arma la caja; adjBind(root) la activa y devuelve la lista; adjSubir(lista, cardId) los sube a la tarjeta de Trello. */
  const ADJ_OK = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i;
  const adjZona = id => '<div class="adjz" data-adj="' + id + '"><div class="adjz-lst"></div><div class="adjz-drop">Arrastrá acá, pegá con Ctrl+V una captura o una imagen copiada, o <button type="button" class="lnk" data-adj-pick>elegí archivos</button><small>Imágenes (PNG, JPG, GIF, WEBP) o PDF, hasta 9 MB cada uno</small></div><input type="file" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"></div>';
  function adjBind(root) {
    const box = root.querySelector('.adjz'); if (!box) return null;
    const lista = [], inp = box.querySelector('input[type=file]'), lst = box.querySelector('.adjz-lst');
    const pintarL = () => { lst.innerHTML = lista.map((f, i) => '<div class="adjz-it">' + (/^image\//.test(f.type) ? '<img src="' + f._url + '" alt="">' : '<span class="adjz-pdf">PDF</span>') + '<span>' + esc(f.name) + '</span><button type="button" data-adj-x="' + i + '" title="Sacar">✕</button></div>').join(''); lst.querySelectorAll('[data-adj-x]').forEach(b => b.onclick = () => { lista.splice(Number(b.dataset.adjX), 1); pintarL(); }); };
    const sumar = files => { let mal = 0; [...files].forEach(f => { if (!ADJ_OK.test(f.type) || f.size > 9 * 1024 * 1024) { mal++; return; } if (!f.name || /^image\.\w+$/.test(f.name)) { try { f = new File([f], 'captura-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg'), { type: f.type }); } catch (e) {} } f._url = URL.createObjectURL(f); lista.push(f); }); pintarL(); if (mal) toast(mal + (mal === 1 ? ' archivo no se sumó' : ' archivos no se sumaron') + ': solo imágenes o PDF de hasta 9 MB.'); };
    box.querySelector('[data-adj-pick]').onclick = () => inp.click();
    inp.onchange = () => { sumar(inp.files); inp.value = ''; };
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('sobre'); });
    box.addEventListener('dragleave', () => box.classList.remove('sobre'));
    box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('sobre'); if (e.dataTransfer && e.dataTransfer.files.length) sumar(e.dataTransfer.files); });
    // pegar: en cualquier parte del formulario (si lo pegado es texto, se pega normal)
    root.addEventListener('paste', e => { const fs = [...((e.clipboardData || {}).items || [])].filter(it => it.kind === 'file').map(it => it.getAsFile()).filter(Boolean); if (fs.length) { e.preventDefault(); sumar(fs); } });
    return lista;
  }
  async function adjSubir(lista, cardId, marca, nombre) {
    let ok = 0; const mal = [];
    for (const f of lista || []) {
      try {
        const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(new Error('no pude leer el archivo')); fr.readAsDataURL(f); });
        if (!DEMO) await post({ action: 'subirAdjunto', cardId, archivo: f.name, mime: f.type, data, marca: marca || '', nombre: nombre || '' });
        ok++;
      } catch (e) { mal.push(f.name + ': ' + e.message); }
    }
    return { ok, mal };
  }
  /* Recursos: subir un recurso nuevo (logo, menú, fotos, manual…) a la lista de recursos del SCL de la marca. */
  function subirRecurso() {
    const marcas = S.data.marcas.filter(m => pasa([m.slug]));
    const m = modal('<h3>Subir un recurso</h3><p>Queda como tarjeta en la lista de recursos del SCL de la marca, con los archivos adjuntos. Así lo encuentra todo el equipo.</p>' +
      '<label class="field"><span>Marca</span><select id="rM">' + marcas.map(x => '<option value="' + esc(x.slug) + '"' + (x.slug === S.marca ? ' selected' : '') + '>' + esc(x.nombre) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Qué es</span><input id="rN" placeholder="Ej: Logo nuevo en PNG · Menú de octubre · Fotos del local"></label>' +
      '<div class="field"><span>Descripción (opcional)</span>' + mdEditor('rD', '', 3) + '</div>' +
      '<div class="field"><span>Archivos</span>' + adjZona('rA') + '</div><div class="err"></div>' +
      '<div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Subir recurso</button></div>', async mm => {
      const nombre = $('#rN', mm).value.trim(); if (!nombre) throw new Error('Poné qué es.');
      const slug = $('#rM', mm).value, scl = tablerosDe(slug).find(t => t.tipo === 'scl'), l = scl && scl.listas.find(x => x.cat === 'recursos');
      if (!l) throw new Error('El SCL de esa marca no tiene una lista de recursos. Avisale a Joaquín.');
      if (!lista.length && !$('#rD', mm).value.trim()) throw new Error('Sumá al menos un archivo o una descripción.');
      const r = await post({ action: 'crearTarjeta', listId: l.id, nombre, desc: $('#rD', mm).value, marca: slug });
      const s = lista.length ? await adjSubir(lista, r.id, slug, nombre) : { ok: 0, mal: [] };
      toast('✓ Recurso subido' + (s.ok ? ' con ' + s.ok + (s.ok === 1 ? ' archivo' : ' archivos') : '') + '. <a href="' + esc(r.url) + '" target="_blank" rel="noopener" style="text-decoration:underline">Abrirlo en Trello</a>' + s.mal.map(x => '<br>✗ ' + esc(x)).join(''));
    });
    m.querySelector('.mb').classList.add('ancho'); mdBind(m); const lista = adjBind(m);
  }

  /* ---------------- soltar imágenes sobre una tarjeta (22/10/2026, como en Trello) ----------------
     Arrastrás una o varias imágenes (o un PDF) sobre cualquier tarjeta de una lista y se suben a esa tarjeta de Trello, sin abrirla.
     La ficha de una pieza abierta tiene su propia zona para soltar (la de revisión), así que con esa ventana abierta no se mete. */
  const ATR_CARD = ['data-mio-card', 'data-pieza', 'data-card-det', 'data-det-input', 'data-film-listo', 'data-archivar', 'data-id'];
  const tarjetaBajo = el => {
    const fila = el && el.closest && el.closest('.row, .mio-r, .fl-r'); if (!fila) return null;
    for (const a of ATR_CARD) { const x = fila.matches('[' + a + ']') ? fila : fila.querySelector('[' + a + ']'); const v = x && x.getAttribute(a); if (v && (DEMO ? /^[\w-]+$/ : /^[0-9a-f]{24}$/).test(v)) return { fila, id: v }; }   // en demo los ids son inventados
    return null;
  };
  async function subirATarjeta(id, files, fila) {
    const c = ((S.data || {}).cards || []).concat(((S.proj || {}).mio || {}).cards || []).find(x => x.id === id) || {};
    files = files.filter(f => /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i.test(f.type));
    if (!files.length) return toast('Solo imágenes (PNG, JPG, GIF, WEBP) o PDF.');
    if (fila) fila.classList.add('drop-sube');
    let ok = 0; const mal = [];
    for (const f of files) {
      if (f.size > 9 * 1024 * 1024) { mal.push(f.name + ': pesa más de 9 MB'); continue; }
      try {
        const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(new Error('no pude leer el archivo')); fr.readAsDataURL(f); });
        if (!DEMO) await post({ action: 'subirAdjunto', cardId: id, archivo: f.name, mime: f.type, data, marca: (c.m || [])[0] || '', nombre: c.n || '' });
        ok++;
      } catch (e) { mal.push(f.name + ': ' + e.message); }
    }
    if (fila) fila.classList.remove('drop-sube');
    toast((ok ? '✓ ' + ok + (ok === 1 ? ' archivo subido' : ' archivos subidos') + ' a "' + esc((c.n || 'la tarjeta').slice(0, 50)) + '"' + (DEMO ? ' (demo: no se subió de verdad)' : '') : '') + mal.map((m, i) => (ok || i ? '<br>' : '') + '✗ ' + esc(m)).join(''));
  }
  (function () {
    let marcada = null;
    const conArchivos = e => [...((e.dataTransfer || {}).types || [])].indexOf('Files') >= 0;
    const soltar = () => { if (marcada) { marcada.classList.remove('drop-on'); marcada = null; } };
    document.addEventListener('dragover', e => {
      if (!conArchivos(e) || $('#drawer')) return;
      e.preventDefault();   // si no, el navegador abre la imagen y se sale del panel
      const t = tarjetaBajo(e.target);
      if (marcada && (!t || t.fila !== marcada)) soltar();
      if (t) { e.dataTransfer.dropEffect = 'copy'; t.fila.classList.add('drop-on'); marcada = t.fila; } else e.dataTransfer.dropEffect = 'none';
    });
    document.addEventListener('dragleave', e => { if (marcada && !marcada.contains(e.relatedTarget)) soltar(); });
    document.addEventListener('drop', e => {
      if (!conArchivos(e) || $('#drawer')) return;
      e.preventDefault(); soltar();
      const t = tarjetaBajo(e.target);
      if (t) subirATarjeta(t.id, [...e.dataTransfer.files], t.fila); else toast('Soltá la imagen encima de una tarjeta.');
    });
  })();

  // con una ventana abierta el fondo queda quieto (se scrollea solo la ventana); vale para todas, se cierren como se cierren
  new MutationObserver(() => document.documentElement.classList.toggle('con-modal', !!document.querySelector('body > .modal'))).observe(document.body, { childList: true });
  function modal(html, onOk) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div class="mb">' + html + '</div>';
    document.body.appendChild(m);
    const cerrar = () => { if (m.classList.contains('sale')) return; m.classList.add('sale'); setTimeout(() => m.remove(), 170); };
    m.onclick = e => { if (e.target === m) cerrar(); };
    $('[data-x]', m).onclick = cerrar;
    $('[data-ok]', m).onclick = async () => { const b = $('[data-ok]', m); b.disabled = true; b.textContent = 'Guardando…'; try { await onOk(m); cerrar(); } catch (e) { $('.err', m).textContent = e.message; b.disabled = false; b.textContent = 'Reintentar'; } };
    document.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', esc_); } });
    const f = m.querySelector('input'); if (f) f.focus();
    return m;
  }

  function archivar(id) {
    const c = S.data.cards.find(x => x.id === id); if (!c) return;
    modal('<h3>¿Archivar "' + esc(c.n) + '"?</h3><p>Se archiva en Trello (' + esc(c.tablero) + '). Si te equivocás, se recupera desde "Elementos archivados" del tablero. Queda registrado para el project.</p><div class="err"></div><div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Archivar en Trello</button></div>', async () => {
      await post({ action: 'archivar', cardId: id, marca: c.m[0], nombre: c.n });
      c.estado = { estado: 'archivado', fecha: ahoraTxt() };
      render(); toast('Archivada en Trello: ' + esc(c.n));
    });
  }

  /* ---------------- "Recordame después" ---------------- */
  async function recordar(id, cuandoTxt) {
    const c = S.data.cards.find(x => x.id === id); if (!c) return;
    const d = new Date();
    if (cuandoTxt === '2h') d.setHours(d.getHours() + 2);
    else if (cuandoTxt === 'manana') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    else { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(9, 0, 0, 0); } // el próximo lunes
    const antes = c.estado || null;
    c.estado = { estado: 'recordar', detalle: d.toISOString(), fecha: ahoraTxt() };
    S.todavia = null; S.reloj = null; render();
    try {
      await post({ action: 'marcar', tipo: 'input', clave: 'inp:' + id, marca: c.m[0], estado: 'recordar', detalle: d.toISOString() });
      toast('Te lo recuerdo ' + cuando(d) + ' a las ' + hm(d) + '.', async () => { c.estado = antes; render(); try { await post({ action: 'marcar', tipo: 'input', clave: 'inp:' + id, marca: c.m[0], estado: 'deshacer' }); } catch (e) {} });
    } catch (e) { c.estado = antes; render(); toast('No se guardó: ' + esc(e.message)); }
  }

  /* ---------------- crear y mover tarjetas de Trello ---------------- */
  const COLOR_TRELLO = { green: '#4bce97', yellow: '#e2b203', orange: '#fea362', red: '#f87168', purple: '#9f8fef', blue: '#579dff', sky: '#6cc3e0', lime: '#94c748', pink: '#e774bb', black: '#8590a2' };
  function tablerosDe(slug) {
    const m = marca(slug); const ts = (m ? m.tableros : []).slice();
    if (S.data.projectTablero) ts.push(S.data.projectTablero);
    const orden = { scl: 0, cm: 1, diseno: 2, produccion: 3, guiones: 4, project: 5 };
    return ts.filter(t => t.listas && t.listas.length).sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9));
  }
  const NOM_T = { scl: 'SCL', cm: 'CM', diseno: 'Diseño', produccion: 'Producción', guiones: 'Guiones', project: 'Project' };
  function opcionesListas(t, sel) { return t.listas.map(l => '<option value="' + esc(l.id) + '"' + (l.id === sel ? ' selected' : '') + '>' + esc(l.n) + '</option>').join(''); }

  function crearTarjeta(inputId, slugForzado, tipoPref, listaPref) {
    const c = inputId ? S.data.cards.find(x => x.id === inputId) : null;
    const slug = slugForzado || (c && c.m[0]) || (S.marca !== 'todas' ? S.marca : S.data.marcas[0].slug);
    const ts = tablerosDe(slug);
    if (!ts.length) { toast('Todavía no tengo las listas de los tableros. Tocá ↻ Actualizar y probá de nuevo.'); return; }
    let t = (tipoPref && ts.find(x => x.tipo === tipoPref)) || ts.find(x => x.tipo === 'scl') || ts[0];
    const listaDef = tb => ((listaPref && tb.listas.find(l => l.cat === listaPref)) || tb.listas.find(l => /calendario editorial/i.test(l.n)) || tb.listas.find(l => /calendario/i.test(l.n) && l.cat !== 'efem') || tb.listas.find(l => l.cat === 'trabajo') || tb.listas[0]).id;
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const lunesProx = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + ((8 - NOW.getDay()) % 7 || 7));
    const esProd = !c && tipoPref === 'produccion';
    const desc = c ? (c.d ? c.d + '\n\n' : '') + 'Input: ' + c.url
      : esProd ? 'Temas / ideas para grabar esta semana:\n1. \n2. \n3. \n4. \n\nDescargas de mercadería: \nQué quiere mover el dueño: \nPromos o productos para mostrar: ' : '';
    const titulo = c ? c.n : esProd ? 'Producción semana del ' + dm(lunesProx) + ' · temas para Bauti' : '';
    const fechaDef = esProd ? lunesProx : new Date(Date.now() + 3 * 864e5);
    const m = modal('<h3>Crear tarjeta en Trello</h3><p>' + (c ? 'A partir del input <b>' + esc(c.n) + '</b>.' : 'Nueva tarjeta.') + ' Si la mandás a otra lista al crearla, arrancan las automatizaciones (por ejemplo, Aprobado → Diseño).</p>' +
      '<div class="two"><label class="field"><span>Marca</span><select id="cM">' + S.data.marcas.map(x => '<option value="' + esc(x.slug) + '"' + (x.slug === slug ? ' selected' : '') + '>' + esc(x.nombre) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Tablero</span><select id="cT"></select></label></div>' +
      '<label class="field"><span>Lista donde se crea</span><select id="cL"></select></label>' +
      '<label class="field"><span>Título</span><input id="cN" value="' + esc(titulo) + '" placeholder="Ej: Carrusel receta Halloween"></label>' +
      '<div class="field"><span>Descripción</span>' + mdEditor('cD', desc, esProd ? 9 : 6) + '</div>' +
      '<div class="field"><span>Adjuntos</span>' + adjZona('cX') + '</div>' +
      '<div class="two"><label class="field"><span>' + (esProd ? 'Fecha de la producción' : 'Fecha de salida') + '</span><input type="date" id="cF" value="' + iso(fechaDef) + '"></label><label class="field"><span>Hora</span><input type="time" id="cH" value="10:00"></label></div>' +
      '<div class="field"><span>Etiquetas</span><div class="labs" id="cE"></div></div>' +
      '<label class="field"><span>Después de crearla, mandarla a</span><select id="cA"></select></label><div class="err"></div>' +
      '<div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Crear tarjeta</button></div>', async mm => {
      const nombre = $('#cN', mm).value.trim(); if (!nombre) throw new Error('Poné un título.');
      const f = $('#cF', mm).value, h = $('#cH', mm).value || '10:00';
      const labels = Array.from(mm.querySelectorAll('.lab.on')).map(x => x.dataset.l);
      const moverA = $('#cA', mm).value;
      const r = await post({ action: 'crearTarjeta', listId: $('#cL', mm).value, nombre, desc: $('#cD', mm).value, due: f ? new Date(f + 'T' + h + ':00').toISOString() : '', labels, moverA, marca: $('#cM', mm).value, inputId: c ? c.id : '' });
      const sa = adjL && adjL.length ? await adjSubir(adjL, r.id, $('#cM', mm).value, nombre) : { ok: 0, mal: [] };
      if (c) c.estado = { estado: 'procesado', fecha: ahoraTxt(), detalle: 'tarjeta creada: ' + (r.url || '') };
      S.todavia = null; render();
      toast('Tarjeta creada' + (moverA ? ' y enviada' : '') + (sa.ok ? ' con ' + sa.ok + (sa.ok === 1 ? ' adjunto' : ' adjuntos') : '') + '. ' + sa.mal.map(x => '✗ ' + esc(x) + '<br>').join('') + (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener" style="text-decoration:underline">Abrirla en Trello</a>' : ''));
    });
    m.querySelector('.mb').classList.add('ancho');
    mdBind(m);
    const adjL = adjBind(m);
    const pintar = () => {
      $('#cT', m).innerHTML = ts.map(x => '<option value="' + esc(x.id) + '"' + (x.id === t.id ? ' selected' : '') + '>' + esc(NOM_T[x.tipo] || x.tipo) + ' · ' + esc(x.nombre) + '</option>').join('');
      $('#cL', m).innerHTML = opcionesListas(t, listaDef(t));
      const ap = t.listas.find(l => /aprobad/i.test(l.n));
      $('#cA', m).innerHTML = '<option value="">No moverla (queda en la lista de arriba)</option>' + t.listas.map(l => '<option value="' + esc(l.id) + '">' + esc(l.n) + (ap && l.id === ap.id ? ' (dispara Diseño si tiene la etiqueta)' : '') + '</option>').join('');
      $('#cE', m).innerHTML = (t.etiquetas || []).length ? t.etiquetas.map(e => '<button type="button" class="lab" data-l="' + esc(e.id) + '"><i style="background:' + (COLOR_TRELLO[(e.c || '').split('_')[0]] || '#666') + '"></i>' + esc(e.n || e.c || 'sin nombre') + '</button>').join('') : '<span style="color:var(--dim);font-size:13px">Este tablero no tiene etiquetas.</span>';
      m.querySelectorAll('.lab').forEach(b => b.onclick = () => b.classList.toggle('on'));
    };
    pintar();
    $('#cT', m).onchange = () => { t = ts.find(x => x.id === $('#cT', m).value); pintar(); };
    $('#cM', m).onchange = () => { const nts = tablerosDe($('#cM', m).value); if (!nts.length) return; ts.length = 0; nts.forEach(x => ts.push(x)); t = (tipoPref && ts.find(x => x.tipo === tipoPref)) || ts.find(x => x.tipo === 'scl') || ts[0]; pintar(); };
  }

  /* Rutina "Coordinar con el project los pendientes de la semana próxima": se anotan los temas (y si hace falta, una reunión) y le
     llegan al project solos: tarjeta en Bandeja de Project con la etiqueta "Ver en minuta" (y la fecha de la reunión) y privado de Discord. */
  function anotarPendientes() {
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const vie = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + (((5 - NOW.getDay()) + 7) % 7 || 7));
    const m = modal('<h3>Pendientes para el project</h3><p>Anotá lo que tenés pendiente o querés ver con el project. Le llega solo: queda en su Bandeja de Project para la minuta y le avisa por privado.</p>' +
      '<label class="field"><span>Pendientes · uno por línea</span><textarea id="pP" rows="6" placeholder="Ej: falta el precio del combo de Halloween de Quality&#10;Confirmar si Isco abre el feriado&#10;Definir el plan B del reel de Vice"></textarea></label>' +
      '<label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pR" style="width:auto" checked> <span style="margin:0">Propongo reunirnos para verlos</span></label>' +
      '<div class="two" id="pRF"><label class="field"><span>Día</span><input type="date" id="pD" value="' + iso(vie) + '"></label><label class="field"><span>Hora</span><input type="time" id="pH" value="10:00"></label></div>' +
      '<label class="field"><span>Algo más (opcional)</span><input id="pN" placeholder="Ej: si se puede antes de las 12"></label><div class="err"></div>' +
      '<div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Enviar al project</button></div>', async mm => {
      const items = $('#pP', mm).value.split('\n').map(s => s.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean);
      if (!items.length) throw new Error('Anotá al menos un pendiente.');
      const reunion = $('#pR', mm).checked && $('#pD', mm).value ? new Date($('#pD', mm).value + 'T' + ($('#pH', mm).value || '10:00') + ':00').toISOString() : '';
      const r = await post({ action: 'pendientesProject', items, reunion, nota: $('#pN', mm).value.trim() });
      const rut = (S.data.rutinas || []).find(x => x.id === 'coordinar' && !(x.estado && x.estado.estado === 'hecho'));
      if (rut) { try { await marcarCelda(rut.clave); } catch (e) {} }
      toast((r.pasos || ['Enviado al project']).map(p => '✓ ' + esc(p)).join('<br>'));
    });
    const sync = () => { $('#pRF', m).style.display = $('#pR', m).checked ? '' : 'none'; };
    $('#pR', m).onchange = sync; sync(); $('#pP', m).focus();
  }

  function moverTarjeta(id) {
    const c = S.data.cards.find(x => x.id === id); if (!c) return;
    const ts = tablerosDe(c.m[0]);
    if (!ts.length) { toast('Todavía no tengo las listas de los tableros. Tocá ↻ Actualizar y probá de nuevo.'); return; }
    let t = ts.find(x => x.nombre === c.tablero) || ts[0];
    const m = modal('<h3>Mover "' + esc(c.n) + '"</h3><p>Ahora está en ' + esc(c.tablero) + ' · ' + esc(c.lista) + '. Moverla de lista dispara las automatizaciones de Trello.</p>' +
      '<label class="field"><span>Tablero</span><select id="mT"></select></label><label class="field"><span>Lista</span><select id="mL"></select></label><div class="err"></div>' +
      '<div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Mover</button></div>', async mm => {
      const lid = $('#mL', mm).value, l = t.listas.find(x => x.id === lid);
      await post({ action: 'moverTarjeta', cardId: c.id, listId: lid, boardId: t.nombre !== c.tablero ? t.id : '', marca: c.m[0], nombre: c.n, destino: t.nombre + ' · ' + (l ? l.n : '') });
      c.tablero = t.nombre; c.lista = l ? l.n : c.lista; c.cat = l ? l.cat : c.cat;
      cerrarPanel(); render(); toast('Movida a ' + esc(t.nombre) + ' · ' + esc(c.lista) + '.');
    });
    const pintar = () => { $('#mT', m).innerHTML = ts.map(x => '<option value="' + esc(x.id) + '"' + (x.id === t.id ? ' selected' : '') + '>' + esc(NOM_T[x.tipo] || x.tipo) + ' · ' + esc(x.nombre) + '</option>').join(''); $('#mL', m).innerHTML = opcionesListas(t, (t.listas.find(l => l.n === c.lista) || {}).id); };
    pintar();
    $('#mT', m).onchange = () => { t = ts.find(x => x.id === $('#mT', m).value); pintar(); };
  }

  function agendar(k) {
    const r = S.data.reuniones.find(x => x.clave === k); if (!r) return;
    const y = NOW.getFullYear(), mo = NOW.getMonth();
    const dia = Math.max(NOW.getDate(), r.desde || NOW.getDate());
    const def = new Date(y, mo, Math.min(dia, r.hasta || dia));
    while ((def.getDay() === 0 || def.getDay() === 6) && def.getDate() < (r.hasta || 31)) def.setDate(def.getDate() + 1);
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const titulo = r.nombre + (r.marca ? ' · ' + (marca(r.marca) || {}).nombre : '');
    modal('<h3>' + esc(titulo) + '</h3><p>Tiene que ser del ' + r.desde + ' al ' + r.hasta + ' de ' + MESES[mo] + ', con ' + esc(r.con) + '.</p>' +
      '<div class="two"><label class="field"><span>Fecha</span><input type="date" id="fF" value="' + iso(def) + '"></label><label class="field"><span>Hora</span><input type="time" id="fH" value="11:00"></label></div>' +
      '<label class="field"><span>Nota (opcional)</span><input id="fN" placeholder="Link de Meet, quiénes van…"></label>' +
      '<label class="check"><input type="checkbox" id="fC" checked> Crear el evento en el calendario de Ideamia</label><div class="err"></div>' +
      '<div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Agendar</button></div>', async m => {
      const fecha = $('#fF', m).value, hora = $('#fH', m).value, nota = $('#fN', m).value.trim(), crear = $('#fC', m).checked;
      if (!fecha || !hora) throw new Error('Poné fecha y hora.');
      await post({ action: 'agendar', clave: r.clave, marca: r.marca, periodo: r.periodo, fecha, hora, nota, crearEvento: crear, titulo: titulo, duracion: r.duracion });
      r.estado = { estado: 'agendada', fecha: ahoraTxt(), detalle: fecha + ' ' + hora + (nota ? ' · ' + nota : '') + (crear ? ' · evento creado' : '') };
      render(); toast('Agendada: ' + esc(titulo) + ' · ' + corto(ymdD(fecha)) + ' ' + hora);
    });
  }


  async function actualizar() {
    if (S.sync) return;
    S.sync = true; renderTop();
    try {
      const r = DEMO ? {} : await post({ action: 'actualizar' });
      await cargar(true); render(); // sin esto se traían los datos nuevos pero la pantalla seguía mostrando los viejos
      const inc = r.incompletos || [];
      toast((r.reciente ? '✓ Trello ya estaba al día (leído hace menos de un minuto).' : '✓ Actualizado con lo último de Trello.') + (inc.length ? '<br>✗ No respondieron: ' + inc.map(esc).join(', ') + '. Sus tarjetas quedan de la lectura anterior.' : ''));
    } catch (e) {
      toast(/actualizando/.test(e.message) ? 'Se está actualizando en este momento. Esperá un minuto y volvé a tocar ↻.' : '✗ ' + esc(e.message));
      try { await cargar(true); } catch (x) {} render(); // así el recuadro de arriba muestra el estado real
    }
    S.sync = false; renderTop();
  }

  /* ---------------- perfil (22/10/2026): apodo, foto y color de fondo de cada uno ----------------
     Se guarda en el Apps Script (viaja solo con los datos de esa persona) y una copia en este navegador,
     así el color y el apodo aparecen al instante, incluso en la pantalla de ingreso. */
  // [nombre, color de fondo, color de muestra (más vivo, solo para elegirlo)]
  const FONDOS = { negro: ['Negro', '#0A0A0A', '#2A2A2A'], grafito: ['Grafito', '#17181C', '#5B606B'], noche: ['Azul noche', '#0A1224', '#2F5FC4'], bosque: ['Bosque', '#0B1A13', '#2E8B5A'], vino: ['Vino', '#200C13', '#A8324F'], violeta: ['Violeta', '#160E28', '#7048CC'], tierra: ['Tierra', '#1E160C', '#A8743A'] };
  const APODOS = ['Burbuja', 'Ramón', 'Irvon', 'Turbo', 'La Máquina', 'Capi', 'Chispa', 'Pixel', 'Nube', 'Rayo', 'Maestre', 'Tornado', 'Crack', 'Fénix', 'Coco', 'Jefazo', 'Galleta', 'Neón'];
  const claveYo = () => S.data ? S.data.yo.clave : S.persona;
  // en la vista Project no hay datos de persona: el nombre sale de la lista del equipo guardada al entrar
  const yoNombre = () => S.data ? S.data.yo.nombre : ((LS.get('equipo', []) || []).find(x => x.clave === S.persona) || {}).nombre || 'Project';
  const perfilDe = c => LS.get('perfil:' + c, null) || {};
  const apodo = () => perfilDe(claveYo()).apodo || yoNombre();
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('') || '?';
  const ava = (p, nombre) => '<span class="ava">' + (p && p.foto ? '<img src="' + esc(p.foto) + '" alt="">' : esc(iniciales(nombre))) + '</span>';
  // mezcla un color con blanco (para las superficies sobre el fondo elegido)
  const mezcla = (hex, t) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * t)); return 'rgb(' + c.join(',') + ')'; };
  function perfilAplicar(p) {
    const k = (p && FONDOS[p.fondo]) ? p.fondo : 'negro', hex = FONDOS[k][1], r = document.documentElement.style, n = parseInt(hex.slice(1), 16);
    if (k === 'negro') ['--bg', '--s1', '--s2', '--s3', '--bg-rgb'].forEach(v => r.removeProperty(v));
    else { r.setProperty('--bg', hex); r.setProperty('--s1', mezcla(hex, .035)); r.setProperty('--s2', mezcla(hex, .06)); r.setProperty('--s3', mezcla(hex, .09)); r.setProperty('--bg-rgb', [n >> 16, (n >> 8) & 255, n & 255].join(',')); }
    document.body.dataset.fondo = k;
    document.querySelectorAll('#embCapa iframe').forEach(embFondo);
  }
  // lo que vino del servidor manda; se guarda acá para la próxima vez
  function perfilRecibido(c, p) { if (!c) return; if (p) LS.set('perfil:' + c, p); perfilAplicar(p || perfilDe(c)); }
  // la foto se achica acá (cuadrada, 200 px) antes de mandarla: pesa ~10 KB
  function achicarFoto(file) {
    return new Promise((ok, mal) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const L = 200, cv = document.createElement('canvas'), m = Math.min(img.width, img.height); cv.width = cv.height = L;
        cv.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, L, L); URL.revokeObjectURL(u);
        let q = .8, d = cv.toDataURL('image/jpeg', q); while (d.length > 30000 && q > .35) { q -= .1; d = cv.toDataURL('image/jpeg', q); }
        ok(d);
      };
      img.onerror = () => mal(new Error('No pude leer esa imagen. Probá con una foto JPG o PNG.'));
      img.src = u;
    });
  }
  function perfilEditar(bienvenida) {
    const c = claveYo(), antes = perfilDe(c), yo = S.data ? S.data.yo : { nombre: yoNombre(), rol: 'Project' };
    const nuevo = { apodo: antes.apodo || '', fondo: antes.fondo || 'negro', foto: antes.foto || '' };
    const sorteo = () => APODOS.slice().sort(() => Math.random() - .5).slice(0, 5);
    const ivo = S.data && esRevisa(), film = S.data && esFilm(), proj = !S.data;
    const que = proj ? [['Mi día', 'tu tablero Project de Trello ordenado: bandeja, hoy, lo que viene y lo que espera respuesta'], ['Agenda', 'tu calendario privado, para agendar sin salir del panel'], ['Equipo', 'qué hizo y qué tiene pendiente cada uno']]
      : ivo ? [['Revisión', 'las piezas que esperan tu ok, con los archivos a la vista'], ['Guiones', 'lo que mandó Fede para mirar'], ['Discord', 'las menciones que te hicieron']]
      : film ? [['Reels e historias', 'lo que tenés que filmar y editar esta semana, por marca'], ['Agenda', 'tus producciones y visitas, con quién y a qué hora'], ['Discord', 'las menciones que te hicieron']]
      : [['Hoy', 'lo que te toca en el día, ordenado por urgencia'], ['Semana e Inputs', 'lo que viene y lo que te cargaron para revisar'], ['Plan y Objetivos', 'cómo vienen tus marcas en el mes']];
    const chips = () => '<button data-ap="">' + esc(yo.nombre) + ' (tu nombre)</button>' + sorteo().map(a => '<button data-ap="' + esc(a) + '"' + (a === nuevo.apodo ? ' class="on"' : '') + '>' + esc(a) + '</button>').join('') + '<button class="dado" data-dado>Otros ↻</button>';
    // v4: compacto, en pestañas (Apodo · Foto · Fondo): se ve una cosa por vez y no hay que bajar
    const html = '<div class="pf-h"><div class="kick">/ ' + (bienvenida ? 'Bienvenida' : 'Tu perfil') + '</div><button class="pf-x" data-cerrar aria-label="Cerrar">×</button></div>' +
      (bienvenida
        ? '<h3>Este es tu panel, <em>' + esc(yo.nombre) + '</em></h3><p class="intro">Lo tuyo en un solo lugar, sacado de Trello. Lo que marcás acá queda registrado.</p><ul class="que">' + que.map((x, i) => '<li><i>0' + (i + 1) + '</i><span><b>' + x[0] + '</b> ' + x[1] + '</span></li>').join('') + '</ul>'
        : '<h3>Personalizá tu <em>panel</em></h3>') +
      '<div class="pf-tabs" role="tablist"><button class="on" data-pft="apodo">Apodo</button><button data-pft="foto">Foto</button><button data-pft="fondo">Fondo</button></div>' +
      '<div class="pf-pane" data-pfp="apodo"><label class="field"><span>¿Cómo querés que te diga el panel?</span><input id="pfA" maxlength="24" placeholder="' + esc(yo.nombre) + '" value="' + esc(nuevo.apodo) + '"></label><div class="apodos" id="pfS">' + chips() + '</div></div>' +
      '<div class="pf-pane hidden" data-pfp="foto"><div class="fotofila"><span id="pfAva">' + ava(nuevo, nuevo.apodo || yo.nombre) + '</span><label class="btn ghost">Elegir foto<input type="file" accept="image/*" id="pfF" hidden></label>' + (nuevo.foto ? '<button class="btn ghost" data-sinfoto>Sacar</button>' : '') + '</div></div>' +
      '<div class="pf-pane hidden" data-pfp="fondo"><div class="fondos">' + Object.keys(FONDOS).map(k => '<button data-fondo="' + k + '" title="' + FONDOS[k][0] + '" aria-label="' + FONDOS[k][0] + '" style="--c:linear-gradient(135deg,' + FONDOS[k][2] + ' 0%,' + FONDOS[k][1] + ' 100%)"' + (k === nuevo.fondo ? ' class="on"' : '') + '></button>').join('') + '</div><small class="pf-nota">Se ve en todo tu panel y en tus otros dispositivos.</small></div>' +
      '<div class="err"></div><div class="acts">' + (bienvenida ? '' : '<button class="btn ghost pf-salir" data-cambiar>Cambiar de persona</button>') + '<button class="btn ghost" data-x>' + (bienvenida ? 'Ahora no' : 'Cancelar') + '</button><button class="btn y" data-ok>' + (bienvenida ? 'Listo' : 'Guardar') + '</button></div>';
    let guardado = false;
    const m = modal(html, async () => {
      nuevo.apodo = $('#pfA', m).value.trim();
      const r = await post({ action: 'perfil', apodo: nuevo.apodo, fondo: nuevo.fondo, foto: nuevo.foto });
      guardado = true; perfilRecibido(c, (r && r.perfil) || Object.assign({ visto: true }, nuevo));
      LS.set('bienv:' + c, 1); render();
      toast(nuevo.apodo ? '¡Listo, ' + esc(nuevo.apodo) + '!' : 'Listo, guardado.');
    });
    m.classList.add('perf', 'lado');
    $('[data-cerrar]', m).onclick = () => $('[data-x]', m).click();
    m.querySelectorAll('[data-pft]').forEach(b => b.onclick = () => { m.querySelectorAll('[data-pft]').forEach(x => x.classList.toggle('on', x === b)); m.querySelectorAll('[data-pfp]').forEach(x => x.classList.toggle('hidden', x.dataset.pfp !== b.dataset.pft)); });
    // si se cierra sin guardar, vuelve el color de antes (y la bienvenida no se repite en este navegador)
    new MutationObserver((x, o) => { if (!document.body.contains(m)) { o.disconnect(); if (!guardado) perfilAplicar(antes); if (bienvenida) { LS.set('bienv:' + c, 1); if (!LS.get('tour:' + c, 0) && !document.querySelector('.tour')) setTimeout(tourVer, 400); } } }).observe(document.body, { childList: true });
    const pintarAva = () => { $('#pfAva', m).innerHTML = ava(nuevo, $('#pfA', m).value.trim() || yo.nombre); };
    const enlazar = () => {
      m.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => { $('#pfA', m).value = b.dataset.ap; m.querySelectorAll('[data-ap]').forEach(x => x.classList.toggle('on', x === b)); pintarAva(); });
      const d = $('[data-dado]', m); if (d) d.onclick = () => { $('#pfS', m).innerHTML = chips(); enlazar(); };
    };
    enlazar();
    $('#pfA', m).oninput = pintarAva;
    $('#pfF', m).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { nuevo.foto = await achicarFoto(f); pintarAva(); } catch (x) { $('.err', m).textContent = x.message; } };
    const sf = $('[data-sinfoto]', m); if (sf) sf.onclick = () => { nuevo.foto = ''; pintarAva(); sf.remove(); };
    m.querySelectorAll('[data-fondo]').forEach(b => b.onclick = () => { nuevo.fondo = b.dataset.fondo; m.querySelectorAll('[data-fondo]').forEach(x => x.classList.toggle('on', x === b)); perfilAplicar(nuevo); });
    const cb = $('[data-cambiar]', m); if (cb) cb.onclick = () => { m.remove(); salirPersona(); };
    if (bienvenida) setTimeout(() => { const a = $('#pfA', m); if (a) a.blur(); }, 0);   // en el celu, que no salte el teclado antes de leer
  }
  // la primera vez que entra (en este navegador y sin perfil guardado): la bienvenida con el apodo
  function quizasBienvenida() {
    const c = claveYo(); if (!c || LS.get('bienv:' + c, 0) || perfilDe(c).visto || $('.modal')) return;
    S._popDia = 1; setTimeout(() => { if (!$('.modal')) perfilEditar(true); }, 500);
  }
  function salirPersona() {
    LS.set('persona', null); S.persona = null; S.data = null; S.proj = null; AGP.data = null; AGP.error = '';
    try { localStorage.removeItem('ideamia:persona'); } catch (e) {}
    const capa = document.getElementById('embCapa'); if (capa) capa.remove();   // Plan y Objetivos de la persona anterior no quedan abiertos
    S._precargo = 0; document.body.classList.remove('con-emb');
    perfilAplicar(null); history.replaceState(null, '', location.pathname); gate();
  }

  /* ---------------- ingreso ----------------
     22/10/2026: en dos pasos. 1) "¿Quién sos?" con todo el equipo (la lista queda guardada en el navegador: aparece al instante)
     2) una pantalla solo para esa persona: "Hola, X", su contraseña y entrar. */
  async function gate(msg) {
    const app = $('#app');
    let equipo = DEMO ? window.PANEL_DEMO.equipo : LS.get('equipo', null);
    let elegido = msg ? S.persona : null;
    const esProj = c => /project/i.test(((equipo || []).find(x => x.clave === c) || {}).rol || '');
    $('#who').classList.add('hidden'); $('#sync').innerHTML = '';
    const paso1 = () => {
      perfilAplicar(null);
      app.innerHTML = '<div class="gate g1"><div class="kick">/ Panel diario · Ideamia</div><h1>¿Quién<br>sos?</h1><p class="gsub">Tocá tu nombre para entrar</p>' +
        '<div class="ppl2">' + equipo.map((p, i) => { const pf = perfilDe(p.clave); return '<button data-p="' + esc(p.clave) + '"><i>' + String(i + 1).padStart(2, '0') + '</i>' + ava(pf, p.nombre) + '<span>' + esc(p.nombre) + '</span><small>' + esc(p.rol) + '</small></button>'; }).join('') + '</div></div>';
      app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { elegido = b.dataset.p; paso2(''); });
    };
    const paso2 = err => {
      const p = equipo.find(x => x.clave === elegido) || { nombre: elegido }, pf = perfilDe(elegido), pj = esProj(elegido);
      perfilAplicar(pf);
      app.innerHTML = '<div class="gate g2"><button class="gvolver" data-volver>‹ No soy ' + esc(p.nombre) + '</button><div>' + ava(pf, pf.apodo || p.nombre) + '</div>' +
        '<div class="kick">/ Tu panel · ' + esc(p.rol || '') + '</div><h1>Hola,<span class="nom">' + esc(pf.apodo || p.nombre) + '</span></h1>' +
        '<p class="gsub">' + (pj ? 'Poné la clave del project y entrá' : 'Poné tu contraseña y entrá a tu panel') + '</p>' +
        '<form id="gf">' + (DEMO ? '' : '<label class="field"><span>' + (pj ? 'Clave del project' : 'Contraseña del equipo') + '</span><input type="password" id="gk" autocomplete="current-password" placeholder="' + (pj ? 'La clave del project' : 'La que te pasó el project') + '"></label>' +
        '<label class="check vercl"><input type="checkbox" id="gver"> Mostrar contraseña</label>') + '<button class="btn y" style="width:100%;justify-content:center;padding:14px">Entrar →</button></form>' +
        '<div class="err">' + esc(err || '') + '</div>' + (DEMO ? '' : '<p class="gtip">Se pide una sola vez en este dispositivo.</p>') + '</div>';
      const k = $('#gk');
      if (k) { k.value = pj ? (S.pkey || '') : (S.key || ''); setTimeout(() => k.focus(), 60); $('#gver').onchange = e => { k.type = e.target.checked ? 'text' : 'password'; k.focus(); }; }
      $('[data-volver]').onclick = () => { elegido = null; paso1(); };
      $('#gf').onsubmit = e => { e.preventDefault(); entrar(); };
    };
    const entrar = () => {
      S.persona = elegido; LS.set('persona', S.persona);
      if (!DEMO) {
        const v = $('#gk').value.trim(); if (!v) { $('.err').textContent = 'Escribí la contraseña.'; return; }
        if (esProj(elegido)) { S.pkey = v; LS.set('pkey', v); } else { S.key = v; LS.set('key', v); }
        try { localStorage.setItem('ideamia:clave', v); } catch (e) {}  // Brainstormings la prueba al abrir (equipo o Joaquín)
      }
      // para que Reportes y Brainstormings ya sepan quién es
      try { const p = equipo.find(x => x.clave === elegido); localStorage.setItem('ideamia:persona', elegido); if (p) localStorage.setItem('ideamia:nombre', p.nombre); } catch (e) {}
      inicio();
    };
    const pintar = () => { if (elegido && equipo.some(x => x.clave === elegido)) paso2(msg); else paso1(); };
    if (equipo) pintar(); else app.innerHTML = '<div class="loading"><b>Hola</b>Trayendo al equipo…</div>';
    if (!DEMO) {
      // la lista se refresca de fondo; si cambió y seguís en el primer paso, se redibuja
      try {
        const j = await get({ action: 'equipo' }), nuevo = j.equipo || [];
        const cambio = JSON.stringify(nuevo) !== JSON.stringify(equipo), habia = !!equipo;
        LS.set('equipo', nuevo); equipo = nuevo;
        if (!habia || (cambio && !elegido && $('.gate.g1'))) pintar();
      } catch (e) { if (!equipo) app.innerHTML = '<div class="loading"><b>Ups</b>No pude traer al equipo. Revisá la conexión.<br><br><button class="btn" onclick="location.reload()">Reintentar</button></div>'; }
    }
  }

  async function cargar(silencioso) {
    if (DEMO) {
      S.data = JSON.parse(JSON.stringify(Object.assign({}, window.PANEL_DEMO)));
      const p = S.data.equipo.find(x => x.clave === S.persona) || S.data.equipo[0];
      S.data.yo = p;
      if (!/cm/i.test(p.rol || '')) S.data.cmDia = null;   // la pestaña Programar es solo del CM
      else S.data.cards = S.data.cards.filter(c => c.cat !== 'guion');
      return;
    }
    const j = await get({ p: S.persona, k: S.key || S.pkey });
    if (j.error === 'clave') throw Object.assign(new Error(j.mensaje), { gate: true });
    if (j.error) throw new Error(j.mensaje || j.error);
    if (!silencioso) S.marca = 'todas';
    if (j.cmDia) j.cards = (j.cards || []).filter(c => c.cat !== 'guion');   // el CM no ve guiones
    S.data = j;
    S.falloCarga = null;
    perfilRecibido(j.yo.clave, j.yo.perfil);
    // quien revisa: enseguida se pide lo que está en revisión ahora mismo
    if (esRevisa()) setTimeout(() => revisionViva(true), 50);
    try { localStorage.setItem('pi:cache:' + S.persona, JSON.stringify(j)); } catch (e) {}
  }
  // la primera vez (sin nada guardado) se ve la forma del panel con un brillo que pasa, en vez de un texto de "cargando"
  const esqueleto = () => '<div class="sk" aria-label="Cargando tu panel"><i class="sk-k"></i><i class="sk-h"></i><i class="sk-p"></i><div class="sk-g">' + '<i></i>'.repeat(4) + '</div>' + '<i class="sk-r"></i>'.repeat(4) + '</div>';
  // Lo último que se cargó en este navegador: se muestra al instante mientras llega lo nuevo.
  function cacheLocal(clave) { try { return JSON.parse(localStorage.getItem('pi:cache:' + clave) || 'null'); } catch (e) { return null; } }

  async function inicio() {
    $('#demoBar').classList.toggle('hidden', !DEMO);
    if (!S.persona) return gate();
    const equipoDemo = DEMO ? window.PANEL_DEMO.equipo : null;
    const esProject = qs.get('vista') === 'project' || S.persona === 'project' || (equipoDemo && (equipoDemo.find(p => p.clave === S.persona) || {}).rol === 'Project');
    const ck = esProject && !qs.get('p') ? '__project' : S.persona;
    const previo = DEMO ? null : cacheLocal(ck);
    perfilAplicar(perfilDe(S.persona));
    if (previo) {
      // se ve al instante lo último guardado; arriba avisa que está trayendo lo nuevo
      if (ck === '__project') S.proj = previo; else S.data = previo;
      render(); S.sync = true; renderTop();
    } else $('#app').innerHTML = esqueleto();
    try {
      if (ck === '__project') {
        if (DEMO) S.proj = JSON.parse(JSON.stringify(window.PANEL_DEMO_PROJECT));
        else {
          const j = await get({ action: 'project', k: S.pkey || S.key });
          if (j.error) throw Object.assign(new Error(j.mensaje || j.error), { gate: j.error === 'clave' });
          S.proj = j; perfilRecibido(S.persona, j.perfil);
          try { localStorage.setItem('pi:cache:__project', JSON.stringify(j)); } catch (e) {}
        }
        S.sync = false; render(); renderTop(); quizasBienvenida(); precargar(); return;
      }
      await cargar();
      S.sync = false; render(); quizasBienvenida(); precargar();
    } catch (e) {
      S.sync = false;
      if (e.gate) { if (ck === '__project') { LS.set('pkey', ''); S.pkey = ''; } else { LS.set('key', ''); S.key = ''; } try { localStorage.removeItem('pi:cache:' + ck); } catch (x) {} S.data = null; S.proj = null; return gate(e.message); }
      if (previo) { S.falloCarga = { msg: e.message || 'sin conexión', cuando: new Date().toISOString() }; render(); return; }
      $('#app').innerHTML = '<div class="loading"><b>Ups</b>' + esc(e.message || 'No pude conectar con el Apps Script') + '<br><br><button class="btn" id="re">Reintentar</button> <button class="btn ghost" id="ch">Cambiar de persona</button></div>';
      $('#re').onclick = inicio; $('#ch').onclick = () => { S.persona = null; LS.set('persona', null); AGP.data = null; AGP.error = ''; gate(); };
    }
  }

  // Se mantiene al día sola: cada 5 minutos si la pestaña está abierta, y al volver a la pestaña si pasaron más de 2 minutos.
  let ultimaCarga = Date.now();
  // en la vista del project se relee solo su tablero (si no hay un formulario abierto)
  const refrescarProj = () => { if (!DEMO && S.proj && !S.data && !S.sync && !$('.modal') && (S.projTab || 'mio') === 'mio') { ultimaCarga = Date.now(); refrescarMio(true); } };
  const refrescar = () => { if (S.proj && !S.data) return refrescarProj(); if (DEMO || !S.data || S.sync || $('.modal') || $('#drawer')) return; ultimaCarga = Date.now(); S.sync = true; renderTop(); cargar(true).then(() => { S.sync = false; render(); }).catch(e => { S.sync = false; S.falloCarga = { msg: e.message || 'sin conexión', cuando: new Date().toISOString() }; render(); }); };
  setInterval(() => { if (document.visibilityState === 'visible') refrescar(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - ultimaCarga > 2 * 60 * 1000) refrescar(); });
  window.matchMedia('(max-width:700px)').addEventListener('change', e => { S.movil = e.matches; if (S.data) render(); });
  inicio();
})();
