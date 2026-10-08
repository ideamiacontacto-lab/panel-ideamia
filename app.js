/* Panel diario · Ideamia
   Lee todo del Apps Script (Trello + Calendar + IA + Registro) y lo ordena en "qué hago hoy".
   Sin API_URL en config.js funciona en modo demo. */
(function () {
  const C = window.PANEL_CONFIG || {};
  const qs = new URLSearchParams(location.search);
  const DEMO = !C.API_URL || qs.get('demo') === '1';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('pi:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pi:' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const NOW = DEMO ? new Date(2026, 9, 7, 12, 30) : new Date();
  const S = {
    data: null, proj: null, abiertos: {}, reloj: null, tab: LS.get('tab', 'hoy'), marca: 'todas', plan: null, planCargando: false, filtroRes: '', filtroReg: '',
    persona: qs.get('p') || LS.get('persona', null), key: LS.get('key', ''), pkey: LS.get('pkey', ''), sync: false,
    movil: window.matchMedia('(max-width:700px)').matches, segSem: null, diaSem: null
  };

  /* ---------------- iconos ---------------- */
  const I = {
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
    const r = await fetch(u, { cache: 'no-store' });
    return r.json();
  }
  async function post(body) {
    if (DEMO) { await new Promise(r => setTimeout(r, 350)); return { ok: true, demo: true }; }
    const r = await fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ k: S.key || S.pkey, persona: S.data ? S.data.yo.clave : S.persona }, body)) });
    const j = await r.json();
    if (j.error) throw new Error(j.mensaje || j.error);
    return j;
  }

  let toastT;
  function toast(msg, deshacer) {
    const t = $('#toast');
    t.innerHTML = '<span>' + msg + '</span>' + (deshacer ? '<button>Deshacer</button>' : '');
    if (deshacer) $('button', t).onclick = () => { t.classList.remove('on'); deshacer(); };
    t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 4200);
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
  const inputs = () => S.data.cards.filter(c => c.cat === 'input' && !(c.estado && c.estado.estado === 'archivado'));
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
    if (S.proj) { app.innerHTML = vistaProject(); bind(app); return; }
    const D = S.data; if (!D) return;
    const t = agrupado(), tot = t.length, ok = t.filter(x => hecho(x.obj)).length;
    const hoyD = NOW, nombre = D.yo.nombre;
    const nInp = inputs().filter(c => inputPide(c) && pasa(c.m)).length, nReu = reuPend().filter(r => pasa(r.marca || S.marca)).length;
    const nRep = (D.reportes || []).filter(r => pasa(r.marca)).length;
    const fecha = DIAS_L[hoyD.getDay()] + ' ' + hoyD.getDate() + ' de ' + MESES[hoyD.getMonth()];
    const saludo = hoyD.getHours() < 13 ? 'buen día' : hoyD.getHours() < 20 ? 'buenas tardes' : 'buenas noches';
    const chips = '<div class="chips">' + ['todas'].concat(D.marcas.map(m => m.slug)).map(s => '<button class="chip' + (S.marca === s ? ' on' : '') + '" data-marca="' + s + '">' + (s === 'todas' ? (S.movil ? 'Todas' : 'Todas las marcas') : '<span class="dot" style="background:' + color(s) + '"></span>' + esc(marca(s).nombre)) + '</button>').join('') + '</div>';
    if (!S.movil && S.tab === 'mas') S.tab = 'hoy';
    const vista = ({ hoy: vHoy, semana: vSemana, inputs: vInputs, reuniones: vReuniones, agenda: vAgenda, recursos: vRecursos, marcas: vMarcas, mas: vMas }[S.tab] || vHoy)(t);
    if (S.movil) {
      // celular: estilo app. Portada corta solo en Hoy, título chico en el resto y pestañas fijas abajo.
      const nav = [['hoy', 'Hoy', I.check, tot - ok], ['semana', 'Semana', I.cal, nRep, nRep > 0], ['inputs', 'Inputs', I.inbox, nInp, true], ['reuniones', 'Reuniones', I.users, nReu, true], ['mas', 'Más', I.grid]];
      const enMas = ['agenda', 'recursos', 'marcas', 'mas'].indexOf(S.tab) >= 0;
      const TIT = { semana: 'Semana', inputs: 'Inputs', reuniones: 'Reuniones', agenda: 'Agenda', recursos: 'Recursos', marcas: 'Marcas', mas: 'Más' };
      app.innerHTML = (S.tab === 'hoy'
        ? cinta() + '<section class="mhead"><div><div class="kick">— ' + fecha + '</div><h1>Hola, <span class="nom">' + esc(nombre) + '</span></h1><p>' + saludo + (tot - ok ? ' · te quedan <b>' + (tot - ok) + '</b>' : ' · <b>todo listo</b>') + '</p></div>' + anillo(ok, tot) + '</section>'
        : '<div class="mtit">' + (['agenda', 'recursos', 'marcas'].indexOf(S.tab) >= 0 ? '<button class="volver" data-tab="mas" aria-label="Volver">‹</button>' : '') + '<h1>' + TIT[S.tab] + '</h1><span>' + fecha + '</span></div>') +
        (S.tab === 'mas' ? '' : '<div class="ctrl">' + chips + '</div>') +
        '<div class="view" id="view">' + vista + '</div>' +
        '<nav class="bnav">' + nav.map(x => '<button class="' + ((S.tab === x[0] || (x[0] === 'mas' && enMas)) ? 'on' : '') + '" data-tab="' + x[0] + '">' + x[2] + '<span>' + x[1] + '</span>' + (x[3] ? '<em class="' + (x[4] ? 'hot' : '') + '">' + x[3] + '</em>' : '') + '</button>').join('') + '</nav>';
    } else {
      const tabs = [['hoy', 'Hoy', tot - ok], ['semana', 'Semana', nRep, nRep > 0], ['inputs', 'Inputs', nInp, true], ['reuniones', 'Reuniones', nReu, true], ['agenda', 'Agenda'], ['recursos', 'Recursos'], ['marcas', 'Marcas']];
      app.innerHTML = cinta() +
        '<section class="hero"><div><div class="kick">— ' + fecha + ' · ' + saludo + '</div>' +
        '<h1>Hola, <span class="nom">' + esc(nombre) + '</span></h1>' +
        '<p>' + (tot - ok ? 'Tenés <b>' + (tot - ok) + (tot - ok === 1 ? ' cosa' : ' cosas') + '</b> para hoy' + (nInp ? ', <b>' + nInp + ' input' + (nInp > 1 ? 's' : '') + '</b> para revisar' : '') + (nReu ? ' y <b>' + nReu + (nReu > 1 ? ' reuniones' : ' reunión') + '</b> por organizar.' : '.') : 'Terminaste lo de hoy. Mirá las sugerencias para adelantar.') + '</p></div>' +
        PIEZAS + anillo(ok, tot) + '</section>' +
        '<div class="ctrl">' + chips +
        '<nav class="tabs">' + tabs.map(x => '<button class="tab' + (S.tab === x[0] ? ' on' : '') + '" data-tab="' + x[0] + '">' + x[1] + (x[2] ? '<span class="badge' + (x[3] ? ' hot' : '') + '">' + x[2] + '</span>' : '') + '</button>').join('') + '</nav></div>' +
        '<div class="view" id="view">' + vista + '</div>';
    }
    document.body.classList.toggle('movil', S.movil);
    bind(app);
    renderTop();
  }
  function anillo(ok, tot) {
    const p = tot ? Math.round(ok / tot * 100) : 0;
    return '<div class="anillo' + (tot && ok === tot ? ' full' : '') + '" style="--p:' + p + '"><div><b>' + ok + '<small>/' + tot + '</small></b><span>hecho hoy</span></div></div>';
  }
  const PZ = 'M20 20 H42 C40 12 44 6 50 6 C56 6 60 12 58 20 H80 V42 C88 40 94 44 94 50 C94 56 88 60 80 58 V80 H58 C60 88 56 94 50 94 C44 94 40 88 42 80 H20 V58 C12 60 6 56 6 50 C6 44 12 40 20 42 Z';
  const PIEZAS = '<div class="piezas" aria-hidden="true"><svg viewBox="0 0 300 260"><g class="p p1" style="--r:-8deg"><path transform="translate(150 20) scale(1.25)" d="' + PZ + '" fill="#E9E9E9"/></g><g class="p p2" style="--r:6deg"><path transform="translate(40 110) scale(1.05)" d="' + PZ + '" fill="#FFF200"/></g><g class="p p3" style="--r:12deg"><path transform="translate(175 150) scale(.9)" d="' + PZ + '" fill="#4A4A4A"/></g></svg></div>';
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

  function renderTop() {
    const D = S.data, w = $('#who');
    if (D || S.proj) {
      const yo = D ? D.yo : { nombre: 'Project', rol: 'Project' };
      w.innerHTML = '<b>' + esc(yo.nombre) + '</b><span class="r">' + esc(yo.rol) + ' · cambiar</span>'; w.classList.remove('hidden');
      w.onclick = () => { LS.set('persona', null); S.persona = null; S.data = null; S.proj = null; history.replaceState(null, '', location.pathname); gate(); };
    }
    const gen = (D && D.generado) || null;
    $('#sync').innerHTML = (gen ? '<span class="txt">Trello ' + hace(gen) + '</span>' : '') + '<button id="rf" title="Traer lo último de Trello y la IA">' + (S.sync ? '<span class="spin">↻</span><span class="t"> Actualizando</span>' : '↻<span class="t"> Actualizar</span>') + '</button>';
    $('#rf').onclick = actualizar;
  }

  /* ---------------- vista HOY ---------------- */
  function filaGrupo(x) {
    const done = hecho(x.obj), n = x.items.filter(i => hecho(i.obj)).length;
    const chips = x.items.map(i => {
      const ok = hecho(i.obj), m = marca(i.marca) || { nombre: i.marca };
      if (x.sub === 'reunion') return '<button class="mk' + (ok ? ' on' : '') + (i.u >= 3 && !ok ? ' late' : '') + '" ' + (ok ? 'disabled' : 'data-agendar="' + esc(i.k) + '"') + '><i style="background:' + color(i.marca) + '"></i>' + esc(m.nombre) + (ok && i.obj.estado.detalle ? ' · ' + corto(ymdD(i.obj.estado.detalle.slice(0, 10))) : '') + '</button>';
      return '<button class="mk' + (ok ? ' on' : '') + '" data-check="' + esc(i.k) + '"><i style="background:' + color(i.marca) + '"></i>' + esc(m.nombre) + '</button>';
    }).join('');
    const ico = x.sub === 'reunion' ? '<span class="ico">' + I.users + '</span>' : '<span class="prog' + (done ? ' full' : '') + '">' + n + '/' + x.items.length + '</span>';
    return '<div class="row' + (done ? ' done' : '') + '">' + ico + '<div><div class="tt">' + esc(x.t) + '</div><div class="mt">' + x.meta.filter(Boolean).map(m => '<span>' + m + '</span>').join('') + '</div><div class="mks">' + chips + '</div>' + (x.hint && !done ? '<div class="hint">' + esc(x.hint) + '</div>' : '') + '</div><div>' + botonEnlace(x.enlace, x.items.filter(i => !hecho(i.obj)).map(i => i.marca)) + '</div></div>';
  }
  // "crear:produccion" en la columna enlace de Rutinas = botón para crear la tarjeta en ese tablero de la marca
  function botonEnlace(enlace, marcas) {
    if (!enlace) return '';
    const m = /^crear:(\w+)/.exec(enlace);
    if (m) return '<button class="btn" data-crear-en="' + esc(m[1]) + '" data-marcas="' + esc((marcas || []).filter(Boolean).join(',')) + '">＋ Tarjeta en ' + esc(NOM_T[m[1]] || m[1]) + '</button>';
    return '<a class="go" href="' + esc(enlace) + '" target="_blank" rel="noopener">' + I.out + '</a>';
  }
  function fila(x) {
    if (x.tipo === 'grupo') return filaGrupo(x);
    const done = hecho(x.obj);
    let accion = '';
    if (x.tipo === 'reporte') accion = '<a class="btn y" href="' + esc(x.url) + '" target="_blank" rel="noopener">Cargar ↗</a>';
    else if (x.tipo === 'reunion') accion = '<button class="btn y" data-agendar="' + esc(x.k) + '">' + I.cal + 'Agendar</button>';
    else if (x.tipo === 'input') accion = '<button class="btn" data-det-input="' + esc(x.obj.id) + '">Revisar</button>';
    else if (x.url) accion = '<a class="go" href="' + esc(x.url) + '" target="_blank" rel="noopener" title="Abrir en Trello">' + I.out + '</a>';
    else if (x.enlace) accion = botonEnlace(x.enlace, [x.marca]);
    const chk = (x.tipo === 'reunion' || x.tipo === 'input' || x.tipo === 'reporte')
      ? '<span class="ico">' + (x.tipo === 'reunion' ? I.users : x.tipo === 'reporte' ? I.flag : I.inbox) + '</span>'
      : '<button class="chk" data-check="' + esc(x.k) + '" aria-label="Marcar como hecho">' + I.check + '</button>';
    return '<div class="row' + (done ? ' done' : '') + '">' + chk + '<div><div class="tt">' + ((x.tipo === 'card' || x.tipo === 'input') && x.obj.id ? '<button class="lnk" ' + (x.tipo === 'input' ? 'data-det-input' : 'data-card-det') + '="' + esc(x.obj.id) + '">' + esc(x.t) + '</button>' : esc(x.t)) + '</div><div class="mt">' + tagM(x.marca) + x.meta.filter(Boolean).map(m => '<span>' + m + '</span>').join('') + (done && x.obj.estado && x.obj.estado.fecha ? '<span>hecho ' + hace(x.obj.estado.fecha) + '</span>' : '') + '</div>' + (x.hint && !done ? '<div class="hint">' + esc(x.hint) + '</div>' : '') + '</div><div>' + accion + '</div></div>';
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
      '<button class="rp' + (nVen ? ' bad' : '') + '" data-vencidas><b>' + nVen + '</b><span>vencidas<br><small>últimos 15 días</small></span></button>' +
      '<button class="rp' + (nInp ? ' y' : '') + '" data-tab="inputs"><b>' + nInp + '</b><span>inputs<br><small>para revisar</small></span></button>' +
      '<button class="rp' + (nReu ? ' warn' : '') + '" data-tab="reuniones"><b>' + nReu + '</b><span>reuniones<br><small>sin fecha</small></span></button>' +
      '<button class="rp" data-fechas><b>' + fs.length + '</b><span>fechas<br><small>próximos 30 días</small></span></button></div>';
    const festejo = t.length && !pend.length ? '<div class="festejo"><b>¡Día<br>completo!</b><span>Terminaste todo lo de hoy. ' + (S.movil ? 'En <b>Más</b> tenés' : 'Al costado tenés') + ' fechas y sugerencias para adelantar.</span></div>' : '';
    // en el celular cada sección muestra 5 y el resto se abre con "Ver todas"
    const corta = (id, L) => !S.movil || S.abiertos[id] || L.length <= 6 ? L.map(fila).join('') : L.slice(0, 5).map(fila).join('') + '<button class="vermas" data-pliegue="' + id + '">Ver ' + (L.length - 5) + ' más</button>';
    if (S.movil) return festejo + atajos() + rapidos + '<div class="tira">' + tira + '</div>' +
      (urg.length ? '<div class="sec"><div class="sec-h"><h2>Primero esto<small>' + urg.length + '</small></h2></div><div class="list">' + corta('urg', urg) + '</div></div>' : '') +
      (resto.length || !urg.length ? '<div class="sec"><div class="sec-h"><h2>' + (urg.length ? 'Después' : 'Para hoy') + '<small>' + resto.length + '</small></h2></div>' + (resto.length ? '<div class="list">' + corta('resto', resto) + '</div>' : '<div class="empty">Nada más por hoy.</div>') + '</div>' : '') +
      (done.length ? '<div class="sec"><button class="pliegue' + (S.abiertos.hecho ? ' on' : '') + '" data-pliegue="hecho"><span>Hecho<small>' + done.length + '</small></span><i>' + (S.abiertos.hecho ? '−' : '+') + '</i></button>' + (S.abiertos.hecho ? '<div class="list">' + done.map(fila).join('') + '</div>' : '') + '</div>' : '');
    return festejo + atajos() + rapidos + '<div class="tira">' + tira + '</div>' +
      '<div class="cols"><div>' +
      (urg.length ? '<div class="sec"><div class="sec-h"><h2>Primero esto<small>' + urg.length + '</small></h2></div><div class="list">' + urg.map(fila).join('') + '</div></div>' : '') +
      '<div class="sec"><div class="sec-h"><h2>' + (urg.length ? 'Después' : 'Para hoy') + '<small>' + resto.length + '</small></h2></div>' + (resto.length ? '<div class="list">' + resto.map(fila).join('') + '</div>' : '<div class="empty">Nada más por hoy.</div>') + '</div>' +
      (done.length ? '<div class="sec"><div class="sec-h"><h2>Hecho<small>' + done.length + '</small></h2></div><div class="list">' + done.map(fila).join('') + '</div></div>' : '') +
      '</div><aside class="side">' + costado() + '</aside></div>';
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
    return (seVienen.length ? '<div class="box"><h3><span class="spark">✦</span>Se vienen</h3>' + seVienen.map(f => '<button class="fecha" data-fecha="' + esc(fkey(f)) + '"><span class="fd"><b>' + f.d.getDate() + '</b><small>' + MESES[f.d.getMonth()].slice(0, 3) + '</small></span><span class="fn">' + esc(f.n) + '<small>' + (f.tipo === 'feriado' ? 'feriado' : f.tipo === 'sugerida' ? 'sugerida para ' + (f.marcas.length > 2 ? f.marcas.length + ' marcas' : f.marcas.map(s => (marca(s) || {}).nombre).join(', ')) : (marca(f.marcas[0]) || {}).nombre + (f.enCalendario ? '' : ' · no está en el calendario')) + '</small></span><span class="fq">' + cuando(f.d) + '</span></button>').join('') + '<div style="padding:8px 0 12px"><button class="btn ghost" data-fechas>Ver todas</button></div></div>' : '') +
      (() => { const sg = sugerencias(), max = S.todasSug ? 99 : chico ? 3 : 6; return '<div class="box"><h3><span class="spark">✦</span>Sugerencias <small style="color:var(--dim);font-weight:500;letter-spacing:0;text-transform:none">· se calculan solas con Trello y el calendario</small></h3>' + sg.slice(0, max).map(s => '<div class="sug"><i class="' + s.c + '"></i><div>' + s.h + (s.go && s.a ? '<br><button class="a" data-tab="' + s.go + '">' + s.a + ' →</button>' : '') + '</div></div>').join('') + (sg.length > max ? '<div style="padding:6px 0 12px"><button class="btn ghost" id="mas">Ver ' + (sg.length - max) + ' más</button></div>' : '') + '</div>'; })() +
      (chico ? '' : '<div class="box"><h3><span class="spark">✦</span>Plan del día con Claude</h3><div class="plan">' +
      '<p style="color:var(--muted);font-size:13.5px;margin:0 0 12px">Le paso a Claude todo lo que tenés pendiente y las alertas, y te dice por dónde arrancar.</p><div style="padding-bottom:14px"><button class="btn y" data-claude-plan>Armame el plan en Claude</button> <button class="btn ghost" data-copiar-plan>Copiar</button></div>' +
      '</div></div>') +
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
    proximasFechas(dias || 14).forEach(f => items.push({ d: f.d, h: f.tipo === 'feriado' ? '★' : '✦', x: '<button class="lnk" data-fecha="' + esc(fkey(f)) + '">' + esc(f.n) + '</button>' + (f.tipo === 'sugerida' ? ' <span class="pill">sugerida</span>' : f.tipo === 'trello' && !f.enCalendario ? ' <span class="pill warn">no está en el calendario</span>' : ''), k: f.marcas.length ? (f.marcas.length > 2 ? '<span class="k">' + f.marcas.length + ' marcas</span>' : f.marcas.map(tagM).join(' ')) : '<span class="k">feriado</span>', cl: f.tipo === 'feriado' ? 'fer' : f.tipo === 'sugerida' ? 'sug' : 'efem', tipo: 'fecha' }));
    D.reuniones.forEach(r => { if (hecho(r) && r.estado.detalle && pasa(r.marca || S.marca)) { const det = r.estado.detalle; items.push({ d: ymdD(det.slice(0, 10)), h: det.slice(11, 16) || '—', x: esc(r.nombre), k: tagM(r.marca) || '<span class="k">reunión</span>', cl: '', tipo: 'reunion' }); } });
    return items;
  }
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
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarPanel(); });

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
      (c.d ? '<p class="dw-p" style="white-space:pre-line">' + esc(c.d) + '</p>' : '') +
      (c.att && c.att.length ? '<div class="att" style="padding:0;margin:10px 0">' + c.att.map(a => '<a href="' + esc(a.u) + '" target="_blank" rel="noopener">' + I.clip + esc(a.n) + '</a>').join('') + '</div>' : '') +
      (['input', 'brainstorming', 'efem', 'corr'].includes(c.cat) || c.tipo === 'project' ? '<div class="ia' + (lec.auto ? ' auto' : '') + '" style="margin:14px 0 0"><div class="t" data-k="' + (lec.auto ? 'Idea rápida' : 'IA') + '">' + esc(lec.titular) + '</div><ol>' + lec.acciones.map(a => '<li><span>' + esc(a.que) + '<span class="f">' + esc(a.formato) + '</span></span></li>').join('') + '</ol></div>' : '') +
      '<div class="dw-acts"><a class="btn" href="' + esc(c.url) + '" target="_blank" rel="noopener">Abrir en Trello ↗</a><button class="btn" data-mover="' + esc(c.id) + '">Mover</button>' + (c.cat === 'input' || c.tipo === 'project' || c.cat === 'efem' || c.cat === 'brainstorming' ? '<button class="btn y" data-crear="' + esc(c.id) + '">＋ Crear tarjeta</button>' : '') + btnClaude(c.id) + '</div>');
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
  function promptPlan() {
    const pend = agrupado().filter(x => !hecho(x.obj));
    return 'Sos especialista senior en redes sociales de un estudio creativo argentino. Armame el plan del día en 5 viñetas ordenadas por prioridad, en voseo, cada una con una acción concreta. Soy ' + S.data.yo.nombre + ' (' + S.data.yo.rol + ') y hoy es ' + DIAS_L[NOW.getDay()] + ' ' + NOW.getDate() + ' de ' + MESES[NOW.getMonth()] + '.\n\nPendientes:\n' +
      pend.map(x => '- ' + x.t + (x.marca ? ' [' + ((marca(x.marca) || {}).nombre || '') + ']' : '') + (x.items ? ' [' + x.items.filter(i => !hecho(i.obj)).map(i => (marca(i.marca) || {}).nombre).join(', ') + ']' : '') + ' · ' + x.meta.join(' · ').replace(/<[^>]+>/g, '')).join('\n') +
      '\n\nAlertas:\n' + sugerencias().map(s => '- ' + s.h.replace(/<[^>]+>/g, '')).join('\n');
  }
  // Abre claude.ai en el navegador de quien usa el panel (su propia cuenta). "Copiar" sirve para pegarlo en un chat o en la app que ya tenga abierta.
  const btnClaude = id => '<button class="btn" data-claude="' + esc(id) + '" title="Abre tu Claude con la consulta escrita"><span style="color:var(--y)">✦</span> Preguntale a Claude</button><button class="btn ghost" data-copiar="' + esc(id) + '" title="Copia la consulta para pegarla en tu Claude">Copiar</button>';
  function copiar(txt) {
    const ok = () => toast('Consulta copiada. Pegala en tu Claude con Ctrl+V.');
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
      (c.d ? '<div class="ds">' + esc(c.d) + '</div>' : '') +
      (c.att.length ? '<div class="att">' + c.att.map(a => '<a href="' + esc(a.u) + '" target="_blank" rel="noopener">' + I.clip + esc(a.n) + '</a>').join('') + '</div>' : '') + ia +
      (p ? '<div class="nudge"><div class="nq"><b>' + (p === 'nuevo' ? 'Input nuevo.' : p === 'pospuesto' ? 'Te pediste acordarte de esto.' : 'Hace unos días que no lo tocás.') + '</b> ¿Ya lo procesaste?</div>' +
        '<div class="nb"><button class="btn y" data-inp="procesado" data-id="' + esc(c.id) + '">' + I.check + 'Sí, ya está</button><button class="btn" data-todavia="' + esc(c.id) + '">Todavía no</button></div>' +
        (S.todavia === c.id ? '<div class="nb no"><span>Dejalo listo ahora o te lo recuerdo:</span><button class="btn y" data-crear="' + esc(c.id) + '">＋ Crear la tarjeta</button><button class="btn" data-recordar="2h" data-id="' + esc(c.id) + '">⏰ En 2 h</button><button class="btn" data-recordar="manana" data-id="' + esc(c.id) + '">Mañana 9 h</button><button class="btn" data-recordar="lunes" data-id="' + esc(c.id) + '">El lunes</button></div>' : '') + '</div>' : '') +
      '<div class="ft"><button class="btn" data-crear="' + esc(c.id) + '">＋ Crear tarjeta</button><button class="btn" data-mover="' + esc(c.id) + '">Mover</button><button class="btn" data-inp="project" data-id="' + esc(c.id) + '">' + I.msg + 'Hablé con el project</button><button class="btn danger" data-archivar="' + esc(c.id) + '">' + I.archive + 'Ya no lo necesito</button>' + btnClaude(c.id) + '<span class="sp"></span>' + st + '</div></article>';
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
      '<div class="mt"><span class="tag">' + esc(m.nombre) + '</span>' + etiqueta + pri + '<span>' + est + '</span>' + (c.att && c.att.length ? '<span>📎 ' + c.att.length + '</span>' : '') + (c.d ? '<span class="desc">' + esc(c.d.slice(0, 90)) + (c.d.length > 90 ? '…' : '') + '</span>' : '') + '</div></div>' + acciones + '</div>';
  }
  function detalleInput(c) {
    panelLateral(esc(c.n), cardInput(c).replace('<article class="cardx"', '<article class="cardx en-panel"'));
    const p = $('#drawer');
    // al resolverlo desde el panel lateral, se cierra solo
    p.addEventListener('click', e => { if (e.target.closest('[data-inp],[data-recordar],[data-archivar],[data-crear],[data-mover]')) setTimeout(cerrarPanel, 30); });
  }
  function vInputs() {
    const pri = c => ({ alta: 3, media: 2, baja: 1 })[c.ia && c.ia.prioridad] || 2;
    const L = inputs().filter(c => pasa(c.m)).sort((a, b) => (!!inputPide(b) - !!inputPide(a)) || (pri(b) - pri(a)) || (new Date(b.act) - new Date(a.act)));
    const pend = L.filter(c => inputPide(c)), posp = L.filter(c => !inputPide(c) && c.estado && c.estado.estado === 'recordar'), resto = L.filter(c => !inputPide(c) && !(c.estado && c.estado.estado === 'recordar'));
    const brains = S.data.cards.filter(c => c.cat === 'brainstorming' && pasa(c.m));
    const nNuevos = pend.filter(c => inputPide(c) === 'nuevo').length;
    const plegable = (id, titulo, n, cuerpo) => '<div class="sec"><button class="pliegue' + (S.abiertos[id] ? ' on' : '') + '" data-pliegue="' + id + '"><span>' + titulo + '<small>' + n + '</small></span><i>' + (S.abiertos[id] ? '−' : '+') + '</i></button>' + (S.abiertos[id] ? '<div class="ilist">' + cuerpo + '</div>' : '') + '</div>';
    return '<div class="iresumen"><div><b>' + pend.length + '</b><span>para revisar' + (nNuevos ? ' · ' + nNuevos + (nNuevos === 1 ? ' nuevo' : ' nuevos') : '') + '</span></div><div><b>' + posp.length + '</b><span>pospuestos</span></div><div><b>' + resto.length + '</b><span>ya revisados</span></div><button class="btn" data-crear-nueva>＋ Nueva tarjeta</button></div>' +
      '<div class="sec">' + (pend.length ? '<div class="ilist">' + pend.map(filaInput).join('') + '</div><p class="ayuda">Tocá el título para ver todo el input, la idea y más opciones (mover, hablar con el project, archivar, Claude).</p>' : '<div class="empty">Nada para revisar. Cuando el project cargue un input en Trello aparece acá.</div>') + '</div>' +
      (posp.length ? plegable('posp', 'Pospuestos', posp.length, posp.sort((a, b) => a.estado.detalle.localeCompare(b.estado.detalle)).map(filaInput).join('')) : '') +
      (resto.length ? plegable('rev', 'Ya revisados', resto.length, resto.map(filaInput).join('')) : '') +
      (brains.length ? plegable('brain', 'Brainstorming y campañas', brains.length, brains.map(c => '<div class="irow visto"><i class="ibar" style="background:' + color(c.m[0]) + '"></i><div class="ibody"><button class="lnk it" data-card-det="' + esc(c.id) + '">' + esc(c.n) + '</button><div class="mt"><span class="tag">' + esc((marca(c.m[0]) || {}).nombre || '') + '</span><span>' + esc(c.lista) + '</span></div></div><div class="ia-acts">' + btnClaude(c.id).split('</button>')[0] + '</button></div></div>').join('') + '<p class="ayuda"><a href="' + esc(S.data.links.brainstorming) + '" target="_blank" rel="noopener">Abrir la web de brainstorming ↗</a></p>') : '');
  }

  /* ---------------- vista REUNIONES ---------------- */
  function vReuniones() {
    const L = S.data.reuniones.filter(r => pasa(r.marca || S.marca));
    const pend = L.filter(r => !hecho(r)).sort((a, b) => (b.vencida - a.vencida) || (a.hasta - b.hasta));
    const ok = L.filter(hecho).sort((a, b) => String(a.estado.detalle || '').localeCompare(String(b.estado.detalle || '')));
    const row = r => {
      const ag = hecho(r), det = r.estado && r.estado.detalle ? r.estado.detalle : '';
      const d = det ? ymdD(det.slice(0, 10)) : null;
      return '<div class="row reu' + (ag ? '' : '') + '"><span class="ico">' + I.users + '</span><div><div class="tt">' + esc(r.nombre) + '</div><div class="mt">' + tagM(r.marca) + '<span>con ' + esc(r.con) + '</span><span>' + (ag ? 'agendada ' + hace(r.estado.fecha || '') : r.vencida ? '<span class="pill bad">se pasó: tenía que ser del ' + r.desde + ' al ' + r.hasta + '</span>' : 'tiene que ser del ' + r.desde + ' al ' + r.hasta + ' de ' + MESES[NOW.getMonth()]) + '</span></div></div>' +
        '<div>' + (ag ? '<div class="when">' + (d ? corto(d) : '') + '<small>' + esc(det.slice(11, 16)) + (/evento creado/.test(det) ? ' · en calendario' : '') + '</small></div>' : '<button class="btn y" data-agendar="' + esc(r.clave) + '">' + I.cal + 'Ponerle fecha</button>') + '</div></div>';
    };
    return '<div class="cols"><div><div class="sec"><div class="sec-h"><h2>Por organizar<small>' + pend.length + '</small></h2><span class="act">Te lo recuerdo hasta que le pongas fecha y hora</span></div>' + (pend.length ? '<div class="list">' + pend.map(row).join('') + '</div>' : '<div class="empty">Todas las reuniones del mes tienen fecha.</div>') + '</div>' +
      '<div class="sec"><div class="sec-h"><h2>Agendadas<small>' + ok.length + '</small></h2></div>' + (ok.length ? '<div class="list">' + ok.map(row).join('') + '</div>' : '<div class="empty">Ninguna todavía.</div>') + '</div></div>' +
      '<aside class="side"><div class="box"><h3>Cómo funciona</h3><div class="sug"><i class="y"></i><div>Cada reunión tiene su ventana: la de <b>Ads</b> es la última semana del mes, la <b>mensual con el cliente</b> y la de <b>entrega de reportes</b>, los primeros 10 días.</div></div><div class="sug"><i></i><div>Cuando le ponés fecha y hora, el project la ve en su panel y se crea el evento en el calendario de Ideamia.</div></div><div class="sug"><i></i><div>Las reglas se cambian en la pestaña <b>Reuniones</b> del Sheet.</div></div></div></aside></div>';
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
    const tablaMarcas = (defs, per) => defs.length ? '<div class="tw"><table class="chk-t"><thead><tr><th></th>' + marcasV.map(m => '<th><i class="dotm" style="background:' + color(m.slug) + '"></i>' + esc(m.nombre) + '</th>').join('') + '</tr></thead><tbody>' +
      defs.map(r => '<tr><td>' + esc(r.tarea) + '<small>' + esc(r.cuando.replace('semana:', 'desde el ').replace(/^mes:/, 'del mes: ').replace(/^meses:[\d,]+\//, 'días ')) + '</small></td>' +
        (r.marcas.length ? marcasV.map(m => '<td>' + (r.marcas.indexOf(m.slug) >= 0 ? celda('rut:' + r.id + ':' + m.slug + ':' + per, false) : '<span class="na">·</span>') + '</td>').join('')
          : '<td colspan="' + marcasV.length + '" class="gen">' + celda('rut:' + r.id + ':-:' + per, false) + ' <span>general</span></td>') + '</tr>').join('') + '</tbody></table></div>' : '';
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
      const chipK = (k, s, nom) => '<button class="mk' + (ok(k) ? ' on' : '') + '" data-celda="' + esc(k) + '"><i style="background:' + color(s) + '"></i>' + esc(nom) + '</button>';
      const filaR = (r, chips, n, de, cuando) => '<div class="row' + (n === de ? ' done' : '') + '"><span class="prog' + (n === de ? ' full' : '') + '">' + n + '/' + de + '</span><div><div class="tt">' + esc(r.tarea) + '</div>' + (cuando ? '<div class="mt"><span>' + esc(cuando) + '</span></div>' : '') + '<div class="mks">' + chips + '</div></div><div>' + botonEnlace(r.enlace, r.marcas) + '</div></div>';
      const listaM = (defs, per) => defs.map(r => {
        const ms = r.marcas.length ? marcasV.filter(m => r.marcas.indexOf(m.slug) >= 0) : null;
        if (ms && !ms.length) return '';
        const ks = ms ? ms.map(m => ['rut:' + r.id + ':' + m.slug + ':' + per, m.slug, m.nombre]) : [['rut:' + r.id + ':-:' + per, '', 'general']];
        return filaR(r, ks.map(x => chipK(x[0], x[1], x[2])).join(''), ks.filter(x => ok(x[0])).length, ks.length, r.cuando.replace('semana:', 'desde el ').replace(/^mes:/, 'del mes: ').replace(/^meses:[\d,]+\//, 'días '));
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
      return '<div class="semana-h m"><b>' + hechos + '<small>/' + total + '</small></b><span>tildados esta semana</span><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="seg">' + segs.map(x => '<button class="' + (seg === x[0] ? 'on' : '') + '" data-seg="' + x[0] + '">' + x[1] + (x[2] ? '<em>' + x[2] + '</em>' : '') + '</button>').join('') + '</div>' + body;
    }
    return '<div class="semana-h"><div><div class="kick">— Semana del ' + Number(si.dias[0].slice(8)) + ' al ' + Number(si.dias[4].slice(8)) + ' de ' + MESES[ymdD(si.dias[4]).getMonth()] + '</div><b>' + hechos + '<small>/' + total + '</small></b><span>tildados hasta hoy</span></div><div class="bar" style="flex:1;max-width:360px"><i style="width:' + pct + '%"></i></div></div>' + cuerpo;
  }
  async function marcarCelda(k) {
    const D = S.data, er = D.estRut || (D.estRut = {}), antes = er[k] || null, ya = !!(antes && antes.estado === 'hecho');
    if (ya) delete er[k]; else { er[k] = { estado: 'hecho', fecha: ahoraTxt() }; confeti(); }
    const r = D.rutinas.find(x => x.clave === k); if (r) r.estado = ya ? null : er[k];
    render();
    try { await post({ action: 'marcar', tipo: 'rutina', clave: k, marca: k.split(':')[2] === '-' ? '' : k.split(':')[2], estado: ya ? 'deshacer' : 'hecho', periodo: k.split(':').pop() }); }
    catch (e) { if (antes) er[k] = antes; else delete er[k]; if (r) r.estado = antes; render(); toast('No se guardó: ' + esc(e.message)); }
  }

  /* ---------------- vista MÁS (celular): lo que en la compu va al costado ---------------- */
  function vMas() {
    const nVen = vencidas().length, nF = proximasFechas(30).length;
    const t = (go, ico, n, l) => '<button class="mt-t" ' + go + '><span class="ic">' + ico + '</span><b>' + n + '</b><small>' + l + '</small></button>';
    return '<div class="mas-g">' +
      t('data-tab="agenda"', I.cal, 'Agenda', '14 días') + t('data-vencidas', I.flag, nVen ? nVen + ' vencidas' : 'Vencidas', 'últimos 15 días') +
      t('data-fechas', I.star, nF + ' fechas', 'próximos 30 días') + t('data-tab="recursos"', I.clip, 'Recursos', 'logos y fichas') +
      t('data-tab="marcas"', I.grid, 'Marcas', 'tableros y calendario') + t('data-claude-plan', I.msg, 'Plan del día', 'con Claude') +
      '</div>' + costado(true);
  }

  /* ---------------- vista AGENDA ---------------- */
  function vAgenda() {
    const dias = [];
    for (let i = 0; i < 14; i++) dias.push(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + i));
    const items = itemsAgenda(14);
    const atras = items.filter(it => diasA(it.d) < 0 && it.cl === 'card');
    return '<p class="leyenda"><span class="lg efem">✦ Fecha del calendario anual</span><span class="lg sug">✦ Fecha sugerida por rubro</span><span class="lg fer">★ Feriado</span><span class="lg">Tocá cualquier fecha o tarjeta para ver el detalle</span></p>' +
      (atras.length ? '<div class="day today"><div class="dd">!<small>vencidas</small></div><div>' + atras.map(it => '<div class="ag card"><span class="h">' + cuando(it.d) + '</span><span class="x">' + it.x + '</span>' + it.k + '</div>').join('') + '</div></div>' : '') +
      dias.map(d => {
        const de = items.filter(it => diasA(it.d) === diasA(d)).sort((a, b) => a.h.localeCompare(b.h));
        const wk = d.getDay() === 0 || d.getDay() === 6;
        if (wk && !de.length) return '';
        return '<div class="day' + (diasA(d) === 0 ? ' today' : '') + (wk ? ' weekend' : '') + '"><div class="dd">' + d.getDate() + '<small>' + (diasA(d) === 0 ? 'hoy' : diasA(d) === 1 ? 'mañana' : DIAS[d.getDay()]) + '</small></div><div>' + (de.length ? de.map(it => '<div class="ag ' + it.cl + '"><span class="h">' + it.h + '</span><span class="x">' + it.x + '</span>' + it.k + '</div>').join('') : '<div class="ag"><span class="h"></span><span class="x" style="color:var(--dim)">Sin entregas</span></div>') + '</div></div>';
      }).join('');
  }

  /* ---------------- vista RECURSOS ---------------- */
  function vRecursos() {
    const f = S.filtroRes.toLowerCase();
    const L = S.data.cards.filter(c => (c.cat === 'recursos' || c.cat === 'fichas') && pasa(c.m) && (!f || (c.n + ' ' + c.d + ' ' + c.att.map(a => a.n).join(' ')).toLowerCase().includes(f)));
    const porMarca = {}; L.forEach(c => (porMarca[c.m[0]] = porMarca[c.m[0]] || []).push(c));
    const tile = c => '<div class="res"><div class="k">' + (c.cat === 'fichas' ? 'Ficha técnica' : 'Recurso corporativo') + '</div><div class="n">' + esc(c.n) + '</div>' + (c.att.length ? '<div class="att">' + c.att.map(a => '<a href="' + esc(a.u) + '" target="_blank" rel="noopener">' + I.clip + esc(a.n) + '</a>').join('') + '</div>' : '') + '<a class="op" href="' + esc(c.url) + '" target="_blank" rel="noopener">Abrir tarjeta ↗</a></div>';
    return '<input class="search" id="qres" placeholder="Buscar logo, manual, ficha, menú…" value="' + esc(S.filtroRes) + '">' +
      (Object.keys(porMarca).length ? Object.keys(porMarca).map(s => '<div class="sec"><div class="sec-h"><h2>' + tagM(s) + '<small>' + porMarca[s].length + '</small></h2></div><div class="grid">' + porMarca[s].sort((a, b) => a.cat.localeCompare(b.cat)).map(tile).join('') + '</div></div>').join('') : '<div class="empty">' + (f ? 'No encontré nada con "' + esc(S.filtroRes) + '".' : 'Todavía no hay recursos corporativos ni fichas técnicas en los tableros SCL.') + '</div>');
  }

  /* ---------------- vista MARCAS ---------------- */
  function vMarcas() {
    const D = S.data;
    return '<div class="brands">' + D.marcas.filter(m => pasa(m.slug)).map(m => {
      const cv = (D.cobertura || {})[m.slug] || {};
      const cs = D.cards.filter(c => c.m[0] === m.slug);
      const nInp = cs.filter(c => c.cat === 'input' && inputPide(c)).length, nCorr = cs.filter(c => c.cat === 'corr').length;
      const efs = cs.filter(c => c.cat === 'efem' && diasA(new Date(c.due)) >= 0).sort((a, b) => new Date(a.due) - new Date(b.due));
      const nVen = cs.filter(c => ['trabajo', 'urgente', 'espera'].includes(c.cat)).length;
      let cov = '<div class="cov"><div class="l"><span>Calendario cargado</span><b>sin fechas</b></div><div class="bar"><i class="bad" style="width:4%"></i></div></div>';
      if (cv.hasta) {
        const total = Math.max(1, Math.round((ymdD(cv.objetivo) - sod(NOW)) / 864e5)), lleno = Math.round((ymdD(cv.hasta) - sod(NOW)) / 864e5);
        const pct = Math.max(3, Math.min(100, Math.round(lleno / total * 100))), falta = total - lleno;
        cov = '<div class="cov"><div class="l"><span>Calendario hasta el <b>' + dm(ymdD(cv.hasta)) + '</b></span><span>objetivo ' + dm(ymdD(cv.objetivo)) + '</span></div><div class="bar"><i class="' + (falta > 7 ? 'bad' : falta > 0 ? 'warn' : '') + '" style="width:' + pct + '%"></i><u></u></div></div>';
      }
      const nom = { scl: 'SCL', cm: 'CM', diseno: 'Diseño', produccion: 'Producción', guiones: 'Guiones' };
      return '<div class="brand"><h4><i style="background:' + color(m.slug) + '"></i>' + esc(m.nombre) + '</h4>' + cov +
        '<div class="stats"><div><b>' + nInp + '</b><small>inputs</small></div><div><b>' + nCorr + '</b><small>correcciones</small></div><div><b>' + nVen + '</b><small>por vencer</small></div><div><b>' + efs.length + '</b><small>efemérides</small></div></div>' +
        '<div class="boards">' + m.tableros.map(b => '<a href="' + esc(b.url) + '" target="_blank" rel="noopener">' + (nom[b.tipo] || b.tipo) + ' ↗</a>').join('') + '</div>' +
        (() => { const fm = proximasFechas(60).filter(f => f.marcas.indexOf(m.slug) >= 0).slice(0, 5); return fm.length ? '<div class="dw-l" style="margin-top:16px">Fechas que le sirven · 60 días</div>' + fm.map(f => '<button class="fecha mini" data-fecha="' + esc(fkey(f)) + '"><span class="fd"><b>' + f.d.getDate() + '</b><small>' + MESES[f.d.getMonth()].slice(0, 3) + '</small></span><span class="fn">' + esc(f.n) + '<small>' + (f.tipo === 'sugerida' ? 'sugerida por rubro' : f.enCalendario ? 'en el calendario' : 'en Trello · falta en el calendario') + '</small></span></button>').join('') : ''; })() + '</div>';
    }).join('') + '</div>';
  }

  /* ---------------- vista PROJECT ---------------- */
  function vistaProject() {
    const P = S.proj, f = S.filtroReg;
    const nm = c => { const p = P.personas.find(x => x.clave === c); return p ? p.nombre : c; };
    const ms = s => { const m = P.marcas.find(x => x.slug === s); return m ? m.nombre : s; };
    return '<section class="hero"><div><div class="kick">— Vista Project · ' + DIAS_L[NOW.getDay()] + ' ' + NOW.getDate() + ' de ' + MESES[NOW.getMonth()] + '</div><h1>Equipo <em>· al día</em></h1><p>Qué tildó cada uno, qué reuniones coordinó y qué inputs siguen sin tocar. Todo queda también en la pestaña <b>Registro</b> del Sheet.</p></div></section>' +
      '<div class="view"><div class="ppl">' + P.personas.map(p => {
        const pct = p.rutinas.total ? Math.round(p.rutinas.hechas / p.rutinas.total * 100) : 0;
        const ag = p.reuniones.filter(r => r.estado), sin = p.reuniones.filter(r => !r.estado);
        return '<div class="person"><div class="rl">' + esc(p.rol) + '</div><h4>' + esc(p.nombre) + '</h4>' +
          '<div class="pr"><span>Rutinas de hoy y la semana</span><b>' + p.rutinas.hechas + '/' + p.rutinas.total + '</b></div><div class="bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="pr"><span>Inputs sin tocar</span><b' + (p.inputs.sinTocar ? ' style="color:var(--warn)"' : '') + '>' + p.inputs.sinTocar + ' de ' + p.inputs.total + '</b></div>' +
          (p.reuniones.length ? '<div class="lst">' + sin.concat(ag).map(r => '<div class="it"><span>' + esc(r.nombre) + (r.marca ? ' · ' + esc(ms(r.marca)) : '') + '</span><span>' + (r.estado ? '<span class="pill ok">' + (/^\d{4}-\d\d-\d\d/.test(r.estado.detalle) ? corto(ymdD(r.estado.detalle)) + ' · ' + esc(r.estado.detalle.slice(11, 16)) : esc(r.estado.detalle.slice(0, 16))) + '</span>' : '<span class="pill ' + (r.vencida ? 'bad' : 'warn') + '">sin fecha · hasta el ' + r.hasta + '</span>') + '</span></div>').join('') + '</div>' : '') +
          '<div style="margin-top:14px"><a class="btn" href="?p=' + encodeURIComponent(p.clave) + '">Ver su panel →</a></div></div>';
      }).join('') + '</div>' +
      '<div class="sec"><div class="sec-h"><h2>Registro<small>últimos movimientos</small></h2><select class="search" id="freg" style="width:auto;margin:0;padding:6px 10px"><option value="">Todos</option>' + P.personas.map(p => '<option value="' + esc(p.clave) + '"' + (f === p.clave ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></div>' +
      '<table class="tbl"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th class="hm">Marca</th><th>Estado</th></tr></thead><tbody>' +
      P.registro.filter(r => !f || r.persona === f).map(r => '<tr><td class="m">' + esc(r.fecha.slice(5)) + '</td><td>' + esc(nm(r.persona)) + '</td><td>' + esc(({ reunion: 'Reunión', rutina: 'Rutina', input: 'Input', evento: 'Calendario', card: 'Tarjeta' })[r.tipo] || r.tipo) + ' · <span style="color:var(--muted)">' + esc((r.clave.split(':')[1] || '').replace(/-/g, ' ')) + '</span>' + (r.detalle ? '<div style="color:var(--muted);font-size:12px">' + esc(r.detalle) + '</div>' : '') + '</td><td class="hm m">' + esc(r.marca ? ms(r.marca) : '—') + '</td><td><span class="pill ' + ({ hecho: 'ok', agendada: 'ok', archivado: '', procesado: 'y', project: 'y' }[r.estado] || '') + '">' + esc(r.estado) + '</span></td></tr>').join('') +
      '</tbody></table></div></div>';
  }

  /* ---------------- interacción ---------------- */
  function bind(root) {
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; LS.set('tab', S.tab); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    root.querySelectorAll('[data-marca]').forEach(b => b.onclick = () => { S.marca = b.dataset.marca; render(); });
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
    root.querySelectorAll('[data-copiar-clave]').forEach(b => b.onclick = () => copiar(S.data.links.claveBrain));
    root.querySelectorAll('[data-copiar-plan]').forEach(b => b.onclick = () => copiar(promptPlan()));
    const ms = $('#mas', root); if (ms) ms.onclick = () => { S.todasSug = true; render(); };
    root.querySelectorAll('[data-todavia]').forEach(b => b.onclick = () => { S.todavia = b.dataset.todavia; render(); if ($('#drawer')) { const c = S.data.cards.find(x => x.id === S.todavia); if (c) detalleInput(c); } });
    root.querySelectorAll('[data-reloj]').forEach(b => b.onclick = () => { S.reloj = b.dataset.reloj || null; render(); });
    root.querySelectorAll('[data-pliegue]').forEach(b => b.onclick = () => { S.abiertos[b.dataset.pliegue] = !S.abiertos[b.dataset.pliegue]; render(); });
    root.querySelectorAll('[data-det-input]').forEach(b => b.onclick = () => { const c = S.data.cards.find(x => x.id === b.dataset.detInput); if (c) detalleInput(c); });
    root.querySelectorAll('[data-recordar]').forEach(b => b.onclick = () => recordar(b.dataset.id, b.dataset.recordar));
    root.querySelectorAll('[data-crear]').forEach(b => b.onclick = () => crearTarjeta(b.dataset.crear || null));
    root.querySelectorAll('[data-crear-nueva]').forEach(b => b.onclick = () => crearTarjeta(null));
    root.querySelectorAll('[data-crear-en]').forEach(b => b.onclick = () => crearTarjeta(null, (b.dataset.marcas || '').split(',').filter(Boolean)[0] || null, b.dataset.crearEn));
    root.querySelectorAll('[data-mover]').forEach(b => b.onclick = () => moverTarjeta(b.dataset.mover));
    root.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { S.segSem = b.dataset.seg; render(); });
    root.querySelectorAll('[data-diasem]').forEach(b => b.onclick = () => { S.diaSem = Number(b.dataset.diasem); render(); });
    root.querySelectorAll('[data-celda]').forEach(b => b.onclick = () => marcarCelda(b.dataset.celda));
    root.querySelectorAll('[data-fecha]').forEach(b => b.onclick = () => { const f = proximasFechas(120).find(x => fkey(x) === b.dataset.fecha); if (f) detalleFecha(f); });
    root.querySelectorAll('[data-card-det]').forEach(b => b.onclick = () => { const c = S.data.cards.find(x => x.id === b.dataset.cardDet); if (c) detalleCard(c); });
    root.querySelectorAll('[data-dia]').forEach(b => b.onclick = () => detalleDia(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + Number(b.dataset.dia))));
    root.querySelectorAll('[data-vencidas]').forEach(b => b.onclick = () => {
      const v = vencidas();
      panelLateral('Vencidas · últimos 15 días', v.length ? v.sort((a, b) => new Date(a.due) - new Date(b.due)).map(c => '<div class="ag card"><span class="h">' + cuando(new Date(c.due)).replace('venció ', '') + '</span><span class="x"><button class="lnk" data-card-det="' + esc(c.id) + '">' + esc(c.n) + '</button> <span class="k">· ' + esc(c.lista) + '</span></span>' + tagM(c.m[0]) + '</div>').join('') : '<div class="empty">No hay nada vencido. Bien ahí.</div>');
    });
    root.querySelectorAll('[data-fechas]').forEach(b => b.onclick = () => {
      const fs = proximasFechas(45);
      panelLateral('Fechas que se vienen · 45 días', fs.length ? fs.map(f => '<div class="ag ' + (f.tipo === 'feriado' ? 'fer' : f.tipo === 'sugerida' ? 'sug' : 'efem') + '"><span class="h">' + corto(f.d) + '</span><span class="x"><button class="lnk" data-fecha="' + esc(fkey(f)) + '">' + esc(f.n) + '</button>' + (f.tipo === 'sugerida' ? ' <span class="pill">sugerida</span>' : '') + '</span>' + (f.marcas.length > 2 ? '<span class="k">' + f.marcas.length + ' marcas</span>' : f.marcas.map(tagM).join(' ')) + '</div>').join('') : '<div class="empty">No hay fechas en los próximos 45 días.</div>');
    });
  }

  async function marcar(k) {
    const x = tareasHoy().find(t => t.k === k); if (!x) return;
    const o = x.obj, antes = o.estado || null, ya = hecho(o);
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

  function modal(html, onOk) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div class="mb">' + html + '</div>';
    document.body.appendChild(m);
    const cerrar = () => m.remove();
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

  function crearTarjeta(inputId, slugForzado, tipoPref) {
    const c = inputId ? S.data.cards.find(x => x.id === inputId) : null;
    const slug = slugForzado || (c && c.m[0]) || (S.marca !== 'todas' ? S.marca : S.data.marcas[0].slug);
    const ts = tablerosDe(slug);
    if (!ts.length) { toast('Todavía no tengo las listas de los tableros. Tocá ↻ Actualizar y probá de nuevo.'); return; }
    let t = (tipoPref && ts.find(x => x.tipo === tipoPref)) || ts.find(x => x.tipo === 'scl') || ts[0];
    const listaDef = tb => (tb.listas.find(l => /calendario editorial/i.test(l.n)) || tb.listas.find(l => /calendario/i.test(l.n) && l.cat !== 'efem') || tb.listas.find(l => l.cat === 'trabajo') || tb.listas[0]).id;
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
      '<label class="field"><span>Descripción</span><textarea id="cD" rows="' + (esProd ? 9 : 4) + '">' + esc(desc) + '</textarea></label>' +
      '<div class="two"><label class="field"><span>' + (esProd ? 'Fecha de la producción' : 'Fecha de salida') + '</span><input type="date" id="cF" value="' + iso(fechaDef) + '"></label><label class="field"><span>Hora</span><input type="time" id="cH" value="10:00"></label></div>' +
      '<div class="field"><span>Etiquetas</span><div class="labs" id="cE"></div></div>' +
      '<label class="field"><span>Después de crearla, mandarla a</span><select id="cA"></select></label><div class="err"></div>' +
      '<div class="acts"><button class="btn ghost" data-x>Cancelar</button><button class="btn y" data-ok>Crear tarjeta</button></div>', async mm => {
      const nombre = $('#cN', mm).value.trim(); if (!nombre) throw new Error('Poné un título.');
      const f = $('#cF', mm).value, h = $('#cH', mm).value || '10:00';
      const labels = Array.from(mm.querySelectorAll('.lab.on')).map(x => x.dataset.l);
      const moverA = $('#cA', mm).value;
      const r = await post({ action: 'crearTarjeta', listId: $('#cL', mm).value, nombre, desc: $('#cD', mm).value, due: f ? new Date(f + 'T' + h + ':00').toISOString() : '', labels, moverA, marca: $('#cM', mm).value, inputId: c ? c.id : '' });
      if (c) c.estado = { estado: 'procesado', fecha: ahoraTxt(), detalle: 'tarjeta creada: ' + (r.url || '') };
      S.todavia = null; render();
      toast('Tarjeta creada' + (moverA ? ' y enviada' : '') + '. ' + (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener" style="text-decoration:underline">Abrirla en Trello</a>' : ''));
    });
    m.querySelector('.mb').classList.add('ancho');
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
      if (!DEMO) await post({ action: 'actualizar' });
      await cargar(true);
      toast('Actualizado con lo último de Trello.');
    } catch (e) { toast('No se pudo actualizar: ' + esc(e.message)); }
    S.sync = false; renderTop();
  }

  /* ---------------- ingreso ---------------- */
  async function gate(msg) {
    const app = $('#app');
    let equipo = DEMO ? window.PANEL_DEMO.equipo : null;
    if (!equipo) { try { const j = await get({ action: 'equipo' }); equipo = j.equipo || []; } catch (e) { equipo = []; } }
    let elegido = S.persona;
    const esProj = c => /project/i.test((equipo.find(x => x.clave === c) || {}).rol || '');
    app.innerHTML = '<div class="gate"><div class="kick">— Panel diario · Ideamia</div><h1>¿Quién<br>sos?</h1>' +
      '<div class="ppl2">' + equipo.map(p => '<button data-p="' + esc(p.clave) + '" class="' + (p.clave === elegido ? 'on' : '') + '"><span>' + esc(p.nombre) + '</span><small>' + esc(p.rol) + '</small></button>').join('') + '</div>' +
      (DEMO ? '' : '<form id="gf" class="' + (elegido ? '' : 'hidden') + '"><label class="field"><span id="gl"></span><input type="password" id="gk" autocomplete="current-password"></label><button class="btn y" style="width:100%;justify-content:center;padding:12px">Entrar</button></form>') +
      '<div class="err">' + esc(msg || '') + '</div></div>';
    $('#who').classList.add('hidden'); $('#sync').innerHTML = '';
    const pintarClave = () => {
      const l = $('#gl'), k = $('#gk'); if (!l) return;
      const pj = esProj(elegido);
      l.textContent = pj ? 'Clave del project' : 'Clave del equipo';
      k.placeholder = pj ? 'La clave del project' : 'La que te pasó el project';
      k.value = pj ? (S.pkey || '') : (S.key || '');
      setTimeout(() => k.focus(), 30);
    };
    const entrar = () => {
      S.persona = elegido; LS.set('persona', S.persona);
      if (!DEMO) {
        const v = $('#gk').value.trim(); if (!v) { $('.err').textContent = 'Escribí la clave.'; return; }
        if (esProj(elegido)) { S.pkey = v; LS.set('pkey', v); } else { S.key = v; LS.set('key', v); }
      }
      inicio();
    };
    app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      elegido = b.dataset.p;
      app.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b));
      if (DEMO) return entrar();
      $('#gf').classList.remove('hidden'); pintarClave();
    });
    const f = $('#gf'); if (f) { f.onsubmit = e => { e.preventDefault(); entrar(); }; if (elegido) pintarClave(); }
  }

  async function cargar(silencioso) {
    if (DEMO) {
      S.data = JSON.parse(JSON.stringify(Object.assign({}, window.PANEL_DEMO)));
      const p = S.data.equipo.find(x => x.clave === S.persona) || S.data.equipo[0];
      S.data.yo = p;
      return;
    }
    const j = await get({ p: S.persona, k: S.key || S.pkey });
    if (j.error === 'clave') throw Object.assign(new Error(j.mensaje), { gate: true });
    if (j.error) throw new Error(j.mensaje || j.error);
    if (!silencioso) S.marca = 'todas';
    S.data = j;
    try { localStorage.setItem('pi:cache:' + S.persona, JSON.stringify(j)); } catch (e) {}
  }
  // Lo último que se cargó en este navegador: se muestra al instante mientras llega lo nuevo.
  function cacheLocal(clave) { try { return JSON.parse(localStorage.getItem('pi:cache:' + clave) || 'null'); } catch (e) { return null; } }

  async function inicio() {
    $('#demoBar').classList.toggle('hidden', !DEMO);
    if (!S.persona) return gate();
    const equipoDemo = DEMO ? window.PANEL_DEMO.equipo : null;
    const esProject = qs.get('vista') === 'project' || S.persona === 'project' || (equipoDemo && (equipoDemo.find(p => p.clave === S.persona) || {}).rol === 'Project');
    const ck = esProject && !qs.get('p') ? '__project' : S.persona;
    const previo = DEMO ? null : cacheLocal(ck);
    if (previo) {
      // se ve al instante lo último guardado; arriba avisa que está trayendo lo nuevo
      if (ck === '__project') S.proj = previo; else S.data = previo;
      render(); S.sync = true; renderTop();
    } else $('#app').innerHTML = '<div class="loading"><b>Cargando</b>Trayendo tus tarjetas, reuniones y calendario…</div>';
    try {
      if (ck === '__project') {
        if (DEMO) S.proj = JSON.parse(JSON.stringify(window.PANEL_DEMO_PROJECT));
        else {
          const j = await get({ action: 'project', k: S.pkey || S.key });
          if (j.error) throw Object.assign(new Error(j.mensaje || j.error), { gate: j.error === 'clave' });
          S.proj = j;
          try { localStorage.setItem('pi:cache:__project', JSON.stringify(j)); } catch (e) {}
        }
        S.sync = false; render(); renderTop(); return;
      }
      await cargar();
      S.sync = false; render();
    } catch (e) {
      S.sync = false;
      if (e.gate) { if (ck === '__project') { LS.set('pkey', ''); S.pkey = ''; } else { LS.set('key', ''); S.key = ''; } try { localStorage.removeItem('pi:cache:' + ck); } catch (x) {} S.data = null; S.proj = null; return gate(e.message); }
      if (previo) { renderTop(); toast('No pude traer lo último: ' + esc(e.message || 'sin conexión') + '. Te muestro lo de la última vez.'); return; }
      $('#app').innerHTML = '<div class="loading"><b>Ups</b>' + esc(e.message || 'No pude conectar con el Apps Script') + '<br><br><button class="btn" id="re">Reintentar</button> <button class="btn ghost" id="ch">Cambiar de persona</button></div>';
      $('#re').onclick = inicio; $('#ch').onclick = () => { S.persona = null; LS.set('persona', null); gate(); };
    }
  }

  // Se mantiene al día sola: cada 5 minutos si la pestaña está abierta, y al volver a la pestaña si pasaron más de 2 minutos.
  let ultimaCarga = Date.now();
  const refrescar = () => { if (DEMO || !S.data || S.sync || $('.modal') || $('#drawer')) return; ultimaCarga = Date.now(); S.sync = true; renderTop(); cargar(true).then(() => { S.sync = false; render(); }).catch(() => { S.sync = false; renderTop(); }); };
  setInterval(() => { if (document.visibilityState === 'visible') refrescar(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - ultimaCarga > 2 * 60 * 1000) refrescar(); });
  window.matchMedia('(max-width:700px)').addEventListener('change', e => { S.movil = e.matches; if (S.data) render(); });
  inicio();
})();
