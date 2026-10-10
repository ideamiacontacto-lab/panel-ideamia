/* ============================================================
   PANEL DIARIO · Estudio Ideamia
   Apps Script pegado dentro del Google Sheet "Panel Social Media Ideamia".

   Qué hace:
   - Lee los tableros de Trello de cada marca (SCL, CM, Diseño, Producción, Guiones) y el tablero Project.
   - Lee el Google Calendar de Ideamia (entregas, reuniones, reportes).
   - Pide a Claude recomendaciones para cada input / efeméride / brainstorming nuevo.
   - Guarda lo que cada persona va tildando en la pestaña "Registro" (la planilla que mira el project).
   - Sirve todo como JSON a la página web (GitHub Pages).

   Configuración: menú "Panel Ideamia" del Sheet → "1 · Crear pestañas" y "2 · Cargar claves".
   ============================================================ */

const TZ = 'America/Argentina/Cordoba';
const P = PropertiesService.getScriptProperties();

/* ---------------- menú del Sheet ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Panel Ideamia')
    .addItem('1 · Crear pestañas', 'setup')
    .addItem('2 · Cargar claves', 'cargarClaves')
    .addItem('3 · Actualizar Trello e IA ahora', 'actualizar')
    .addSeparator()
    .addItem('Cambiar clave del project', 'cambiarClaveProject')
    .addItem('Cambiar clave del equipo', 'cambiarClaveEquipo')
    .addSeparator()
    .addItem('Cargar el token del bot de Discord', 'cargarClaveDiscord')
    .addItem('Cargar la clave del puente de Discord', 'cargarClavePuente')
    .addToUi();
}

/* ---------------- Discord: menciones de cada persona en los canales del servidor ----------------
   Un bot del estudio lee los últimos 50 mensajes de cada canal (y de los hilos activos) en cada actualización.
   Toma las menciones de los últimos 3 días (la web además las va sacando a medida que cumplen 3 días): @persona y @everyone/@here. No puede leer mensajes directos. */
function cargarClaveDiscord() { cambiarClave_('DISCORD_TOKEN', 'Discord · token del bot (Developer Portal → Bot → Reset Token)'); }
function cargarClavePuente() { cambiarClave_('DISCORD_PUENTE_CLAVE', 'Discord · clave del puente (la misma que pusiste como CLAVE en Cloudflare)'); }
function leerDiscord_(cfg, cat) {
  // Discord bloquea a los servidores de Google: si hay puente (Worker de Cloudflare, ver discord-puente/worker.js) se pide por ahí,
  // y el token del bot vive en el Worker; el panel solo manda la clave del puente.
  const puente = String(cfg.DISCORD_PUENTE || '').trim().replace(/\/+$/, ''), clavePuente = P.getProperty('DISCORD_PUENTE_CLAVE');
  const token = P.getProperty('DISCORD_TOKEN'), guild = String(cfg.DISCORD_SERVIDOR || '').trim();
  if (!guild || (puente ? !clavePuente : !token)) return null;
  if (!/^\d{15,22}$/.test(guild)) throw new Error('DISCORD_SERVIDOR tiene que ser el ID del servidor (solo números), no el token');
  const API = (puente || 'https://discord.com') + '/api/v10', H = puente ? { 'x-clave': clavePuente } : { Authorization: 'Bot ' + token };
  const codigo = r => { try { return (JSON.parse(r.getContentText() || '{}') || {}).code || '-'; } catch (e) { return String(r.getContentText()).slice(0, 40); } };
  const get = ruta => {
    const r = UrlFetchApp.fetch(API + ruta, { headers: H, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error((puente ? 'El puente' : 'Discord') + ' respondió ' + r.getResponseCode() + (ruta.indexOf('/channels') > 0 ? ' al leer los canales' : '') + ' (' + codigo(r) + ')');
    return JSON.parse(r.getContentText());
  };
  const todosLosCanales = get('/guilds/' + guild + '/channels'), categorias = {};
  todosLosCanales.forEach(c => { if (c.type === 4) categorias[c.id] = c.name; });
  const canales = todosLosCanales.filter(c => c.type === 0 || c.type === 5 || c.type === 2);
  let hilos = []; try { hilos = (get('/guilds/' + guild + '/threads/active').threads || []); } catch (e) {}
  const todos = canales.concat(hilos), nombres = {};
  todos.forEach(c => nombres[c.id] = c.name);
  // marca de cada canal: por el nombre del canal, de su canal padre (hilos) o de su categoría
  const porId = {}; todosLosCanales.concat(hilos).forEach(c => porId[c.id] = c);
  const marcaCanal = ch => { let s = ch.name || ''; const p = porId[ch.parent_id]; if (p) { s += ' ' + p.name; const g = porId[p.parent_id]; if (g) s += ' ' + g.name; } return marcasEn_(s, cat.marcas)[0] || ''; };
  const gente = cat.equipo.filter(p => p.discord.length), out = {};
  gente.forEach(p => out[p.clave] = []);
  const limite = Date.now() - 3 * 864e5, st = { codigos: {}, mensajes: 0, recientes: 0, menciones: 0, vacios: 0 };
  const esDe = (p, u) => !!u && (p.discord.indexOf(u.id) >= 0 || p.discord.indexOf(norm_(u.username)) >= 0 || (u.global_name && p.discord.indexOf(norm_(u.global_name)) >= 0));
  for (let i = 0; i < todos.length; i += 10) {
    const lote = todos.slice(i, i + 10);
    const rs = UrlFetchApp.fetchAll(lote.map(c => ({ url: API + '/channels/' + c.id + '/messages?limit=50', headers: H, muteHttpExceptions: true })));
    rs.forEach((r, j) => {
      st.codigos[r.getResponseCode()] = (st.codigos[r.getResponseCode()] || 0) + 1;
      if (r.getResponseCode() !== 200) return; // canal sin permiso para el bot
      const ch = lote[j];
      JSON.parse(r.getContentText()).forEach(m => {
        st.mensajes++; if (new Date(m.timestamp).getTime() >= limite) { st.recientes++; st.menciones += (m.mentions || []).length; if (!m.content && !(m.attachments || []).length && !(m.embeds || []).length) st.vacios++; }
        if (new Date(m.timestamp).getTime() < limite) return;
        const ments = m.mentions || [];
        const texto = String(m.content || '')
          .replace(/<@!?(\d+)>/g, (x, id) => '@' + ((ments.find(u => u.id === id) || {}).global_name || (ments.find(u => u.id === id) || {}).username || 'alguien'))
          .replace(/<#(\d+)>/g, (x, id) => '#' + (nombres[id] || 'canal')).replace(/<@&\d+>/g, '@rol').replace(/<a?:(\w+):\d+>/g, ':$1:');
        gente.forEach(p => {
          if (esDe(p, m.author)) return; // lo que escribió uno mismo no cuenta
          const directa = ments.some(u => esDe(p, u));
          if (!directa && !m.mention_everyone) return;
          out[p.clave].push({ id: m.id, canal: nombres[ch.id] || '', marca: marcaCanal(ch), autor: m.author.global_name || m.author.username, texto: texto.slice(0, 240) || (m.attachments && m.attachments.length ? '(adjunto)' : ''), fecha: m.timestamp, url: 'https://discord.com/channels/' + guild + '/' + ch.id + '/' + m.id, todos: !directa });
        });
      });
    });
    if (i + 10 < todos.length) Utilities.sleep(1100);
  }
  Object.keys(out).forEach(k => { out[k].sort((a, b) => b.fecha.localeCompare(a.fecha)); out[k] = out[k].slice(0, 40); });
  return { generado: new Date().toISOString(), canales: todos.length, stats: st, porPersona: out };
}

function cambiarClave_(prop, titulo) {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt(titulo, 'Escribila y tocá Aceptar. Es la que se va a pedir al entrar a la web.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return ui.alert('No se cambió nada.');
  P.setProperty(prop, r.getResponseText().trim());
  ui.alert('Listo. La clave nueva ya funciona.');
}
function cambiarClaveProject() { cambiarClave_('PROJECT_KEY', 'Nueva clave del project'); }
function cambiarClaveEquipo() { cambiarClave_('TEAM_KEY', 'Nueva clave del equipo'); }

function cargarClaves() {
  const ui = SpreadsheetApp.getUi();
  const pedir = (clave, texto) => {
    const r = ui.prompt(texto, 'Dejalo vacío para no cambiarlo.' + (P.getProperty(clave) ? ' (ya hay una cargada)' : ''), ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() === ui.Button.OK && r.getResponseText().trim()) P.setProperty(clave, r.getResponseText().trim());
  };
  pedir('TRELLO_KEY', 'Trello · API key');
  pedir('TRELLO_TOKEN', 'Trello · Token (con permiso de escritura, para poder archivar)');
  pedir('ANTHROPIC_KEY', 'Claude · API key (la misma que usa Make)');
  pedir('TEAM_KEY', 'Clave del equipo (la piden al abrir la web)');
  pedir('PROJECT_KEY', 'Clave del project (solo para la vista Project)');
  ui.alert('Listo. Ahora corré "3 · Actualizar Trello e IA ahora".');
}

/* ---------------- pestañas y valores por defecto ---------------- */
const TABS = {
  Config: [['clave', 'valor', 'para qué'],
    ['CALENDAR_ID', 'estudioideamia@gmail.com', 'Calendario del equipo: de acá salen entregas y reuniones, y acá se crean las que agendan'],
    ['INPUT_RECORDATORIO_DIAS', '3', 'Cada cuántos días vuelve a preguntar por un input ya procesado'],
    ['POR_VENCER_DIAS', '3', 'Días hacia adelante para "tarjetas próximas a vencer"'],
    ['EFEMERIDES_DIAS', '45', 'Días hacia adelante para mostrar efemérides'],
    ['IA_AUTOMATICA', 'no', 'sí = la IA lee sola los inputs nuevos con la API de Claude (gasta créditos). no = solo el botón "Preguntale a Claude"'],
    ['IA_MAX_POR_CORRIDA', '6', 'Cuántas tarjetas nuevas lee la IA por actualización (cada lectura ~US$ 0,003)'],
    ['IA_MAX_POR_MES', '150', 'Tope de lecturas automáticas por mes (150 ≈ US$ 0,50)'],
    ['CAL_EXCLUIR', 'finanzas,cobro,factura,ipc,ajuste,propiedad', 'Eventos del calendario que no ve el equipo'],
    ['CAL_EQUIPO', 'reporte,entrega quincenal,reels,guion,guiones,revision,reunion ideamia,brainstorming', 'Eventos generales que ve todo el equipo (lo que no nombra persona ni marca y no está acá, solo lo ve el project)'],
    ['CAL_OTROS_NOMBRES', 'zaira,fede,lu,bauti,luisi,juan', 'Otros colaboradores: los eventos que los nombran (y no a vos) no aparecen'],
    ['LINK_REPORTES', 'https://ideamiacontacto-lab.github.io/reportes-ideamia/', ''],
    ['LINK_BRAINSTORMING', 'https://ideamiacontacto-lab.github.io/brainstormings-ideamia/', ''],
    ['LINK_NOTION', 'https://app.notion.com/p/3d1bab9b1a168166b3cfe5a8818a9265', 'Operación Ideamia'],
    ['LINK_DRIVE', '', '']],
  Equipo: [['nombre', 'clave', 'rol', 'nombres en el calendario'],
    ['Orne', 'orne', 'SM', 'orne,ornella'],
    ['Rama', 'rama', 'SM', 'rama,ramiro'],
    ['Ale', 'ale', 'CM', 'ale,alejandra'],
    ['Joaquín', 'project', 'Project', 'joaquin']],
  Marcas: [['marca', 'alias (Trello y calendario)', 'sm', 'cm', 'canal social', 'rubro / contexto para la IA'],
    ['Isco', 'isco', 'orne', 'ale', 'sí', ''],
    ['Gabriel Varisco', 'gv,varisco', 'orne', 'ale', 'no', ''],
    ['SkilfulBlack', 'skilful,skilfulblack', 'orne', 'ale', 'no', ''],
    ['Tritato', 'tritato', 'orne', 'ale', 'sí', ''],
    ['Vice Burger', 'vice', 'orne', 'ale', 'sí', ''],
    ['Quality Tienda', 'quality,quality tienda', 'rama', 'ale', 'sí', ''],
    ['Quality Mayorista', 'quality mayorista,quality m', 'rama', 'ale', 'sí', ''],
    ['Upper Trip', 'upper', 'rama', '', 'no', ''],
    ['1talquecocina', '1tal,1talquecocina', 'rama', 'ale', 'sí', ''],
    ['DyB', 'dyb,demichelis', 'rama', 'ale', 'no', ''],
    ['SFB', 'sfb', 'orne', 'ale', 'no', '']],
  // cuando: diaria · semana:lun · mes:1-5 · mes:ultima-semana · meses:1,4,7,10/1-10
  // por marca: sí / no / canal (solo marcas con canal social)
  Rutinas: [['id', 'tarea', 'cuando', 'por marca', 'rol', 'ayuda', 'enlace'],
    ['correcciones', 'Revisar Correcciones y tarjetas por vencer', 'diaria', 'no', 'SM', 'Abrí cada SCL y mirá la lista Correcciones.', ''],
    ['inputs', 'Revisar inputs nuevos del project', 'diaria', 'no', 'SM', 'Si falta info, avisale al project hoy.', ''],
    ['promos', '¿Las promos siguen siendo las mismas?', 'semana:lun', 'sí', 'SM', 'Confirmalo con la marca antes de programar.', ''],
    ['ofertas', '¿Ofertas y diseños de la semana entregados?', 'semana:lun', 'sí', 'SM', 'Chequeá Diseño y el calendario editorial.', ''],
    ['salida', '¿Reels y carruseles listos para salir?', 'semana:mie', 'sí', 'SM', 'Aprobados y en "Listo para programar".', ''],
    ['canal', '¿Se movió el canal social?', 'semana:vie', 'canal', 'SM', 'Si no se movió, proponé una difusión.', ''],
    ['coordinar', 'Coordinar con el project los pendientes de la semana próxima', 'semana:vie', 'no', 'SM', '', ''],
    ['rep-mensual', 'Cargar los reportes mensuales (vencen el 5)', 'mes:1-5', 'no', 'SM', '', 'LINK_REPORTES'],
    ['rep-trim', 'Cargar los reportes trimestrales', 'meses:1,4,7,10/1-10', 'no', 'SM', '', 'LINK_REPORTES'],
    ['rep-sem', 'Cargar los reportes semestrales', 'meses:1,7/1-10', 'no', 'SM', '', 'LINK_REPORTES'],
    ['rep-anual', 'Cargar el reporte anual', 'meses:1/1-15', 'no', 'SM', '', 'LINK_REPORTES'],
    ['programar', 'Programar lo que está en "Listo para programar"', 'diaria', 'no', 'CM', '', ''],
    ['mensajes', 'Responder mensajes y comentarios de todas las marcas', 'diaria', 'no', 'CM', '', '']],
  // cuando = ventana en la que tiene que ocurrir la reunión. avisar antes = días de anticipación para empezar a recordar.
  Reuniones: [['id', 'reunión', 'con', 'cuando', 'por marca', 'rol', 'avisar antes (días)', 'duración (min)'],
    ['ads', 'Reunión con Ads', 'Juan · Paid Media', 'mes:ultima-semana', 'no', 'SM', '10', '45'],
    ['cliente', 'Reunión mensual con el cliente', 'cliente', 'mes:1-10', 'sí', 'SM', '5', '45'],
    ['brainstorming', 'Brainstorming del mes siguiente', 'equipo', 'mes:10-20', 'sí', 'SM', '5', '60'],
    ['entrega-reportes', 'Reunión de entrega de reportes', 'cliente', 'mes:1-10', 'sí', 'SM', '3', '30']],
  Registro: [['fecha', 'persona', 'tipo', 'clave', 'marca', 'estado', 'detalle', 'periodo']]
};

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(TABS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      const rows = TABS[name];
      sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  const def = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  ScriptApp.getProjectTriggers().filter(t => ['actualizar', 'actualizarProgramado'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  instalarDisparador_();
  try { SpreadsheetApp.getUi().alert('Pestañas listas. Trello se actualiza solo cada 10 minutos de 8 a 21 h, y una vez por hora de noche.'); } catch (e) {}
}

/* Disparador automático: cada 10 min en horario de trabajo; de noche solo una vez por hora. Más seguido no entra en la cuota gratis de Google
   (90 min de disparadores por día: cada lectura de Trello tarda ~1 min). Para lo urgente está el botón ↻ de la web, que lee Trello al momento. */
function instalarDisparador_() {
  ScriptApp.getProjectTriggers().filter(t => ['actualizar', 'actualizarProgramado'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('actualizarProgramado').timeBased().everyMinutes(10).create();
}
function reinstalarDisparador() { instalarDisparador_(); }
function actualizarProgramado() {
  const h = Number(Utilities.formatDate(new Date(), TZ, 'H')), m = Number(Utilities.formatDate(new Date(), TZ, 'm'));
  if ((h < 8 || h >= 21) && m >= 10) return;
  actualizar();
}

/* ---------------- lectura de pestañas ---------------- */
function rows_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getDisplayValues();
  return v.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
}
function config_() {
  const c = {};
  rows_('Config').forEach(r => { if (r[0]) c[r[0].trim()] = String(r[1]).trim(); });
  return c;
}
const norm_ = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const lista_ = s => String(s || '').split(',').map(x => norm_(x)).filter(Boolean);
const si_ = s => /^(si|sí|s|x|true|1)$/i.test(String(s).trim());

function catalogo_() {
  // Mails de cada uno (para saber a quién invitaron a cada evento del calendario del equipo). Columna E de Equipo; si está vacía, estos.
  const MAILS = { orne: 'ornebrasca@gmail.com', rama: 'ramiro.ideamia@gmail.com' };
  const equipo = rows_('Equipo').map(r => ({ nombre: r[0], clave: norm_(r[1]), rol: String(r[2]).trim(), alias: lista_(r[3]).concat([norm_(r[0])]), email: String(r[4] || MAILS[norm_(r[1])] || '').trim().toLowerCase(), discord: lista_(r[5]).map(x => x.replace(/^@/, '')) }));
  const marcas = rows_('Marcas').map(r => ({
    nombre: r[0], slug: norm_(r[0]).replace(/[^a-z0-9]+/g, '-'), alias: lista_(r[1]).concat([norm_(r[0])]),
    sm: norm_(r[2]), cm: norm_(r[3]), canal: si_(r[4]), contexto: r[5] || ''
  }));
  const rutinas = rows_('Rutinas').map(r => ({ id: r[0], tarea: r[1], cuando: norm_(r[2]), porMarca: norm_(r[3]), rol: String(r[4]).trim(), ayuda: r[5], enlace: r[6] }));
  const reuniones = rows_('Reuniones').map(r => ({ id: r[0], nombre: r[1], con: r[2], cuando: norm_(r[3]), porMarca: si_(r[4]), rol: String(r[5]).trim(), avisar: Number(r[6]) || 5, duracion: Number(r[7]) || 45 }));
  return { equipo, marcas, rutinas, reuniones };
}

/* Detecta marcas mencionadas en un texto. El alias más largo gana ("quality mayorista" antes que "quality"). */
function marcasEn_(texto, marcas) {
  let t = ' ' + norm_(texto).replace(/[^a-z0-9ñ]+/g, ' ') + ' ';
  const pares = [];
  marcas.forEach(m => m.alias.forEach(a => pares.push([a.replace(/[^a-z0-9ñ]+/g, ' ').trim(), m.slug])));
  pares.sort((a, b) => b[0].length - a[0].length);
  const out = [];
  pares.forEach(([a, slug]) => {
    if (!a) return;
    const k = ' ' + a + ' ';
    if (t.indexOf(k) >= 0) { if (out.indexOf(slug) < 0) out.push(slug); t = t.split(k).join(' · '); }
  });
  return out;
}

/* ---------------- fechas y reglas de "cuándo" ---------------- */
const ymd_ = d => Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
const ym_ = d => Utilities.formatDate(d, TZ, 'yyyy-MM');
function semana_(d) { // clave ISO de semana: 2026-W41
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0');
}
const DIAS = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
function hoyAR_() { return new Date(Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss")); }
function finDeMes_(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

/* Devuelve {activa, periodo, desde, hasta, vencida} para hoy, o null si hoy no corresponde. */
function evaluarCuando_(cuando, hoy, anticipacion) {
  anticipacion = anticipacion || 0;
  const dia = hoy.getDate(), mes = hoy.getMonth() + 1, ultimo = finDeMes_(hoy), dow = hoy.getDay();
  if (cuando === 'diaria') return (dow === 0 || dow === 6) ? null : { periodo: ymd_(hoy), etiqueta: 'hoy' };
  let d = /^dias:([a-z,\s]+)$/.exec(cuando); // solo ciertos días de la semana: "dias:mie,sab"
  if (d) return d[1].split(',').map(x => DIAS[x.trim().slice(0, 3)]).indexOf(dow) >= 0 ? { periodo: ymd_(hoy), etiqueta: 'hoy' } : null;
  let m = /^semana:(\w+)$/.exec(cuando);
  if (m) {
    const desde = DIAS[m[1].slice(0, 3)]; if (desde == null) return null;
    const lunesBase = dow === 0 ? 7 : dow;
    if (lunesBase < (desde || 7)) return null;
    return { periodo: semana_(hoy), etiqueta: 'esta semana', vencida: lunesBase > (desde || 7) };
  }
  m = /^(?:meses:([\d,]+)\/)?(?:mes:)?(ultima-semana|\d+-\d+)$/.exec(cuando);
  if (m) {
    if (m[1] && m[1].split(',').map(Number).indexOf(mes) < 0) return null;
    let a, b;
    if (m[2] === 'ultima-semana') { a = ultimo - 6; b = ultimo; } else { [a, b] = m[2].split('-').map(Number); b = Math.min(b, ultimo); }
    if (dia < a - anticipacion) return null;
    return { periodo: ym_(hoy), desde: a, hasta: b, vencida: dia > b, etiqueta: 'del ' + a + ' al ' + b };
  }
  return null;
}

/* ---------------- Trello ---------------- */
function trello_(path, params, method) {
  const k = P.getProperty('TRELLO_KEY'), tk = P.getProperty('TRELLO_TOKEN');
  if (!k || !tk) throw new Error('Faltan las claves de Trello (menú Panel Ideamia → Cargar claves)');
  method = method || 'get';
  // al leer, todo va en la URL; al escribir, los datos van en el cuerpo: Google corta las URLs de más de 2 KB y un comentario largo con tildes no entraba
  const q = method === 'get' ? Object.assign({ key: k, token: tk }, params || {}) : { key: k, token: tk };
  const url = 'https://api.trello.com/1' + path + '?' + Object.keys(q).map(x => x + '=' + encodeURIComponent(q[x])).join('&');
  const op = { method: method, muteHttpExceptions: true };
  if (method !== 'get' && params && Object.keys(params).length) { const f = {}; Object.keys(params).forEach(x => { if (params[x] != null) f[x] = String(params[x]); }); op.payload = f; } // como formulario: Trello lo lee igual que en la URL
  const r = UrlFetchApp.fetch(url, op);
  if (r.getResponseCode() >= 300) throw new Error('Trello ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
  return JSON.parse(r.getContentText());
}
/* Listas a donde va una pieza al revisarla. Cada tablero las llama distinto:
   Diseño → "Aprobado" / "Rediseñar"; Producción → "Material Listo para Entregar" / "Correccion". */
const LISTA_REVISION = { aprobar: [/aprobad/, /listo para entregar/, /material listo/, /^listo/], corregir: [/correc/, /redise/, /rehacer/, /cambios/] };
function listaRevision_(listas, accion) {
  const pats = LISTA_REVISION[accion] || [];
  for (let i = 0; i < pats.length; i++) { const l = (listas || []).filter(x => pats[i].test(norm_(x.name || x.n || '')))[0]; if (l) return l; }
  return null;
}
/* Trello permite ~100 pedidos cada 10 s por token: se leen en tandas de 25 con una pausa entre tandas. */
function trelloVarios_(rutas) {
  const k = P.getProperty('TRELLO_KEY'), tk = P.getProperty('TRELLO_TOKEN');
  const out = rutas.map(() => null), codigo = {};
  const pedir = idx => {
    for (let i = 0; i < idx.length; i += 25) {
      if (i) Utilities.sleep(3000);
      const tanda = idx.slice(i, i + 25);
      const reqs = tanda.map(j => ({ url: 'https://api.trello.com/1' + rutas[j] + (rutas[j].indexOf('?') >= 0 ? '&' : '?') + 'key=' + k + '&token=' + tk, muteHttpExceptions: true }));
      UrlFetchApp.fetchAll(reqs).forEach((res, n) => { const j = tanda[n]; codigo[j] = res.getResponseCode(); try { if (codigo[j] < 300) out[j] = JSON.parse(res.getContentText()); } catch (e) {} });
    }
  };
  pedir(rutas.map((r, j) => j));
  // lo que falló (casi siempre el límite de pedidos de Trello) se pide una vez más, después de una pausa
  const mal = rutas.map((r, j) => j).filter(j => out[j] == null);
  if (mal.length) { Utilities.sleep(5000); pedir(mal); }
  out.codigos = codigo;
  return out;
}

const TIPOS = [['scl', 'scl'], ['cm', 'cm'], ['diseno', 'diseno'], ['produccion', 'produccion'], ['prod', 'produccion'], ['guiones', 'guiones']];
function tipoTablero_(nombre) {
  const n = norm_(nombre).replace(/[^a-z ]/g, ' ').trim().split(' ')[0];
  const t = TIPOS.filter(x => x[0] === n)[0];
  return t ? t[1] : null;
}
function catLista_(nombre) {
  const n = norm_(nombre);
  if (/anterior|publicad|terminad/.test(n)) return 'hecho';
  if (n.indexOf('efemer') >= 0) return 'efem';
  if (n.indexOf('input') >= 0 || n.indexOf('pedidos') >= 0) return 'input';
  if (n.indexOf('correcc') >= 0) return 'corr';
  if (n.indexOf('recurso') >= 0) return 'recursos';
  if (n.indexOf('ficha') >= 0) return 'fichas';
  if (n.indexOf('brainstorm') >= 0 || n.indexOf('campan') >= 0) return 'brainstorming';
  if (/publicad|aprobad|terminad|programado|anterior/.test(n)) return 'hecho';
  if (n.indexOf('urgente') >= 0) return 'urgente';
  if (n.indexOf('espera') >= 0) return 'espera';
  return 'trabajo';
}

function leerTrello_(cat) {
  const boards = trello_('/members/me/boards', { filter: 'open', fields: 'name,shortUrl' });
  const elegidos = [];
  boards.forEach(b => {
    const tipo = tipoTablero_(b.name);
    const esProject = norm_(b.name) === 'project';
    if (!tipo && !esProject) return;
    const marcas = esProject ? [] : marcasEn_(b.name.replace(/^\S+\s*/, ''), cat.marcas);
    if (!esProject && !marcas.length) return;
    elegidos.push({ id: b.id, nombre: b.name, url: b.shortUrl, tipo: esProject ? 'project' : tipo, marca: marcas[0] || '' });
  });
  const rutas = [];
  elegidos.forEach(b => {
    rutas.push('/boards/' + b.id + '?fields=name&lists=open&list_fields=name,pos&labels=all&label_fields=name,color&labels_limit=100');
    rutas.push('/boards/' + b.id + '/cards?filter=open&fields=name,desc,due,dueComplete,start,idList,shortUrl,dateLastActivity,labels&attachments=true&attachment_fields=name,url,mimeType');
  });
  const res = trelloVarios_(rutas);
  const cards = [], haceUnaSemana = Date.now() - 7 * 864e5, indice = {}, fallas = [];
  elegidos.forEach((b, i) => {
    // si Trello no devolvió este tablero (ni al reintentar), se avisa y después se conservan sus tarjetas de la lectura anterior
    if (res[i * 2] == null || res[i * 2 + 1] == null) { fallas.push(b.nombre + ' (Trello ' + ((res[i * 2] == null ? res.codigos[i * 2] : res.codigos[i * 2 + 1]) || 'sin respuesta') + ')'); b.fallo = true; return; }
    const info = res[i * 2] || {}, listas = {};
    (info.lists || []).forEach(l => listas[l.id] = l);
    // listas y etiquetas del tablero: para crear y mover tarjetas desde el panel
    b.listas = (info.lists || []).map(l => ({ id: l.id, n: l.name, cat: catLista_(l.name) }));
    b.etiquetas = (info.labels || []).map(x => ({ id: x.id, n: x.name || '', c: x.color || '' }));
    (res[i * 2 + 1] || []).forEach(c => {
      const l = listas[c.idList]; if (!l) return;
      const catL = catLista_(l.name);
      if (b.tipo !== 'project') indice[String(c.shortUrl).split('/c/')[1]] = { id: c.id, n: c.name, m: b.marca, lista: l.name, tablero: b.nombre, ini: c.start, due: c.due, dc: !!c.dueComplete, url: c.shortUrl, lab: (c.labels || []).map(x => x.name).filter(Boolean) };
      // Tableros de guiones (los maneja Fede): cada tarjeta es un enlace a la idea aprobada en SCL.
      // Ideas recibidas = Fede tiene que entregar · listos para revisión = verlo en la reunión · Correcciones · Aprobado.
      // Tableros de Diseño y Producción (para la vista de revisión de Ivo): piezas pendientes de entrega y en revisión.
      if (b.tipo === 'diseno' || b.tipo === 'produccion') {
        const n = norm_(l.name);
        const etapa = /revisi/.test(n) ? 'revision' : /correc|redise/.test(n) ? 'correccion' : /espera/.test(n) ? 'espera' : /pendiente|pedido/.test(n) ? 'pendiente' : '';
        if (etapa) {
          const fmt = /histori/.test(n) ? 'historia' : /reel|video/.test(n) ? 'reel' : b.tipo === 'produccion' ? 'video' : 'diseno';
          cards.push({ id: c.id, n: c.name, d: '', due: c.due, dc: !!c.dueComplete, ini: c.start, lista: l.name, cat: 'pieza', etapa: etapa, formato: fmt, tipo: b.tipo, tablero: b.nombre, turl: b.url, url: c.shortUrl, act: c.dateLastActivity, lab: (c.labels || []).map(x => x.name).filter(Boolean), att: [], m: [b.marca] });
          return;
        }
      }
      if (b.tipo === 'guiones') {
        const n = norm_(l.name);
        const gest = /aprobad|terminad|publicad/.test(n) ? 'aprobado' : /correc/.test(n) ? 'correccion' : /revisi|listo/.test(n) ? 'revisar' : 'pendiente';
        if (gest === 'aprobado' && new Date(c.dateLastActivity).getTime() < haceUnaSemana) return;
        cards.push({ id: c.id, n: c.name, d: '', due: c.due, dc: !!c.dueComplete, ini: c.start, lista: l.name, cat: 'guion', gest: gest, tipo: b.tipo, tablero: b.nombre, turl: b.url, url: c.shortUrl, act: c.dateLastActivity, lab: [], att: [], m: [b.marca] });
        return;
      }
      // Lo ya publicado/terminado solo sirve para medir hasta dónde está cargado el calendario: se guarda lo reciente y sin descripción.
      if (catL === 'hecho' && (!c.due || new Date(c.due).getTime() < haceUnaSemana)) return;
      const conAdjuntos = catL === 'recursos' || catL === 'fichas' || catL === 'input';
      const conDesc = ['input', 'brainstorming', 'efem', 'corr', 'urgente'].indexOf(catL) >= 0 || b.tipo === 'project';
      cards.push({
        id: c.id, n: c.name, d: conDesc ? String(c.desc || '').slice(0, 700) : (catL === 'recursos' || catL === 'fichas' ? String(c.desc || '').slice(0, 200) : ''), due: c.due, dc: !!c.dueComplete, ini: c.start,
        lista: l.name, cat: catL, tipo: b.tipo, tablero: b.nombre, turl: b.url, url: c.shortUrl, act: c.dateLastActivity,
        lab: (c.labels || []).map(x => x.name).filter(Boolean),
        att: conAdjuntos ? (c.attachments || []).slice(0, 8).map(a => ({ n: a.name, u: a.url })) : [],
        m: b.tipo === 'project' ? marcasEn_(c.name + ' ' + (c.labels || []).map(x => x.name).join(' '), cat.marcas) : [b.marca]
      });
    });
  });
  // Historial de las piezas (para Ivo): cuándo se cargó la tarjeta en Diseño/Producción, cuándo le pusieron fecha de salida
  // a la tarjeta de SCL (y para qué día) y cuándo la movieron por última vez. Últimos 21 días de actividad de esos tableros.
  const hist = {};
  try {
    const desde = new Date(Date.now() - 21 * 864e5).toISOString();
    const conHist = elegidos.filter(b => ['scl', 'diseno', 'produccion'].indexOf(b.tipo) >= 0);
    const acts = trelloVarios_(conHist.map(b => '/boards/' + b.id + '/actions?filter=createCard,copyCard,updateCard:due,updateCard:idList&since=' + desde + '&limit=1000&fields=type,date,data'));
    acts.forEach(lista => (lista || []).forEach(a => {
      const d = a.data || {}, id = d.card && d.card.id; if (!id) return;
      const h = hist[id] = hist[id] || {};
      if (a.type === 'createCard' || a.type === 'copyCard') h.creada = h.creada && h.creada < a.date ? h.creada : a.date;
      else if (d.old && 'due' in d.old) { if (!h.fecha || a.date > h.fecha) { h.fecha = a.date; h.para = d.card.due || null; h.antes = d.old.due || null; } }
      else if (d.listAfter) { if (!h.movida || a.date > h.movida) { h.movida = a.date; h.a = d.listAfter.name; } }
    }));
  } catch (e) {}
  // Las tarjetas del Project suelen ser enlaces a una tarjeta de otro tablero (el título es la URL): se toma marca y título de la original.
  const vivas = {}; cards.forEach(c => vivas[c.id] = 1);
  // Guiones: título, fecha de entrega (= fecha de inicio de la tarjeta de SCL) y fecha de salida, de la tarjeta original.
  cards.forEach(c => {
    if (c.cat !== 'guion' && c.cat !== 'pieza') return;
    const m = /trello\.com\/c\/([A-Za-z0-9]+)/.exec(c.n), orig = m && indice[m[1]];
    // sin tarjeta original (archivada o de un tablero que no se lee): se muestra igual, con un título claro en vez del link
    if (!orig) { if (m && c.cat === 'pieza') { c.sinOrig = true; c.n = 'Pieza sin título (no encuentro la tarjeta original de SCL)'; } return; }
    c.n = orig.n; c.ourl = orig.url; c.olista = orig.tablero + ' · ' + orig.lista; c.entrega = orig.ini || null; c.salida = orig.due || null; c.lab = (c.lab || []).concat((orig.lab || []).filter(x => (c.lab || []).indexOf(x) < 0));
    // a veces se publica directo sin pasar la tarjeta de guiones: si la original ya salió, se marca para ordenar
    // "ya salió" solo si la tarjeta de SCL está en una lista de publicado o la marcaron completa: que haya pasado la fecha no alcanza (si sigue en revisión, está atrasada y hay que verla igual)
    c.salio = /publicad|programad|anterior|terminad/.test(norm_(orig.lista)) || orig.dc;
    if (c.cat === 'pieza') {
      const hp = hist[c.id] || {}, ho = hist[orig.id] || {};
      c.hist = { cargada: hp.creada || null, fecha: ho.fecha || null, para: ho.para || null, antes: ho.antes || null, movida: hp.movida || null, a: hp.a || null };
    }
    if (c.cat === 'pieza') { const t = norm_(c.n + ' ' + c.lab.join(' ')); if (c.formato === 'video') c.formato = /histori/.test(t) ? 'historia' : 'reel'; else if (c.formato === 'diseno' && /carrus/.test(t)) c.formato = 'carrusel'; }
  });
  cards.forEach(c => {
    if (c.tipo !== 'project') return;
    const m = /trello\.com\/c\/([A-Za-z0-9]+)/.exec(c.n);
    const orig = m && indice[m[1]];
    if (!orig) return;
    c.n = orig.n; c.m = orig.m ? [orig.m] : c.m; c.origen = orig.tablero + ' · ' + orig.lista;
    if (vivas[orig.id]) c.dup = true; // la original ya aparece en el panel
  });
  return { tableros: elegidos, cards, fallas };
}

/* ---------------- archivos en Drive (foto de Trello + memoria de la IA) ---------------- */
function archivo_(prop, nombre) {
  let id = P.getProperty(prop), f = null;
  if (id) { try { f = DriveApp.getFileById(id); } catch (e) { f = null; } }
  if (!f) { f = DriveApp.createFile(nombre, '{}', 'application/json'); P.setProperty(prop, f.getId()); }
  return f;
}
const leerJson_ = (prop, nombre) => { try { return JSON.parse(archivo_(prop, nombre).getBlob().getDataAsString() || '{}'); } catch (e) { return {}; } };
const guardarJson_ = (prop, nombre, obj) => archivo_(prop, nombre).setContent(JSON.stringify(obj));

/* ---------------- IA (Claude) ---------------- */
const IA_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['titular', 'acciones', 'pedir', 'prioridad'],
  properties: {
    titular: { type: 'string' },
    acciones: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['que', 'formato'], properties: { que: { type: 'string' }, formato: { type: 'string' } } } },
    pedir: { type: 'array', items: { type: 'string' } },
    prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] }
  }
};
const IA_SISTEMA = 'Sos especialista senior en redes sociales de Ideamia, un estudio creativo argentino que maneja las cuentas de varias marcas. ' +
  'Le hablás a la persona de social media del equipo como un compañero con experiencia: directo, en voseo rioplatense, concreto y accionable. ' +
  'Te pasan una tarjeta de Trello (un input del project, una efeméride o una idea de campaña) con el contexto de la marca. ' +
  'Devolvé: "titular" (una frase que arranque contando qué llegó y qué harías, por ejemplo "Te cargaron un recetario de Halloween: yo lo bajaría a un carrusel de receta y una tanda de historias"), ' +
  '"acciones" (2 a 4 acciones concretas, cada una con el formato: carrusel, reel, historias, canal social, post, sorteo, oferta, etc.), ' +
  '"pedir" (0 a 3 cosas para pedir al cliente o al project, como promos, productos, fotos o precios) y "prioridad" según la urgencia por fecha. ' +
  'No inventes datos de la marca que no estén en el contexto. Si la tarjeta es poco clara, una de las acciones es preguntarle al project qué necesita.';

function claude_(sistema, usuario, schema, maxTokens) {
  const key = P.getProperty('ANTHROPIC_KEY'); if (!key) return null;
  // Claude Haiku 4.5: el modelo más económico (US$ 1 / 5 por millón de tokens). Cada lectura cuesta ~US$ 0,003.
  const body = {
    model: 'claude-haiku-4-5', max_tokens: maxTokens || 1200,
    system: sistema, messages: [{ role: 'user', content: usuario }]
  };
  if (schema) body.output_config = { format: { type: 'json_schema', schema: schema } };
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
  });
  if (r.getResponseCode() >= 300) { console.warn('Claude ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 300)); return null; }
  const j = JSON.parse(r.getContentText());
  if (j.stop_reason === 'refusal') return null;
  const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!schema) return txt;
  try { return JSON.parse(txt); } catch (e) { return null; }
}

function hash_(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s)).slice(0, 12); }

function recomendarTarjetas_(snap, cat, cfg) {
  const ia = leerJson_('IA_FILE_ID', 'panel-ideamia-ia.json');
  const hoy = new Date(), lim = Number(cfg.IA_MAX_POR_CORRIDA || 6);
  // Tope mensual de lecturas automáticas (para no pasarse del presupuesto). Lo demás se consulta con el botón "Preguntale a Claude".
  const mes = ym_(hoy), topeMes = Number(cfg.IA_MAX_POR_MES || 150);
  let usadas = P.getProperty('IA_MES') === mes ? Number(P.getProperty('IA_USADAS') || 0) : 0;
  const hace14 = new Date(hoy.getTime() - 14 * 864e5);
  const candidatas = snap.cards.filter(c => {
    if (new Date(c.act) < hace14) return false; // solo lo nuevo: el historial no se lee
    if (c.tipo === 'project') return c.cat !== 'hecho' && !c.dup && c.m.length > 0;
    if (c.cat === 'input') return c.tipo !== 'cm';
    return false;
  }).sort((a, b) => new Date(b.act) - new Date(a.act));
  let hechas = 0;
  candidatas.forEach(c => {
    const h = hash_(c.n + '|' + c.d); // mover la tarjeta de lista o cambiarle la fecha no genera otra lectura
    if (ia[c.id] && ia[c.id].h === h) return;
    if (hechas >= lim || usadas >= topeMes) return;
    usadas++;
    const marca = cat.marcas.filter(m => m.slug === c.m[0])[0];
    const recientes = snap.cards.filter(x => x.m[0] === c.m[0] && x.tipo === 'scl' && (x.cat === 'trabajo' || x.cat === 'hecho')).slice(0, 15).map(x => '- ' + x.n).join('\n');
    const efem = snap.cards.filter(x => x.m[0] === c.m[0] && x.cat === 'efem' && x.due && new Date(x.due) >= hoy).sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 6).map(x => '- ' + x.n + ' (' + x.due.slice(0, 10) + ')').join('\n');
    const prompt = 'Hoy es ' + ymd_(hoy) + '.\nMarca: ' + (marca ? marca.nombre : 'sin marca') + (marca && marca.contexto ? ' · ' + marca.contexto : '') +
      '\n\nTarjeta (' + c.lista + ' · tablero ' + c.tablero + '):\nTítulo: ' + c.n + (c.d ? '\nDescripción: ' + c.d : '') + (c.due ? '\nFecha: ' + c.due.slice(0, 10) : '') +
      (c.lab.length ? '\nEtiquetas: ' + c.lab.join(', ') : '') + (c.att.length ? '\nAdjuntos: ' + c.att.map(a => a.n).join(', ') : '') +
      (recientes ? '\n\nÚltimas piezas de la marca:\n' + recientes : '') + (efem ? '\n\nPróximas efemérides de la marca:\n' + efem : '');
    const reco = claude_(IA_SISTEMA, prompt, IA_SCHEMA);
    hechas++;
    if (reco) ia[c.id] = { h: h, r: reco, t: new Date().toISOString() };
  });
  P.setProperty('IA_MES', mes); P.setProperty('IA_USADAS', String(usadas));
  const vivas = {}; snap.cards.forEach(c => vivas[c.id] = 1);
  Object.keys(ia).forEach(id => { if (!vivas[id]) delete ia[id]; });
  guardarJson_('IA_FILE_ID', 'panel-ideamia-ia.json', ia);
  return ia;
}

/* ---------------- actualización (cada hora + botón) ---------------- */
/* Rutinas nuevas que se suman a la pestaña Rutinas una sola vez (si después las borrás, no vuelven). */
const RUTINAS_NUEVAS = [
  ['dyb-propiedades', '¿Las propiedades siguen siendo las mismas? ¿Ninguna se dio de baja?', 'semana:lun', 'dyb', 'SM', 'Confirmá con la inmobiliaria qué se vendió, alquiló o bajó, y sacalo de lo programado.', ''],
  ['isco-maquinarias', 'Mover el área de maquinarias', 'semana:mar', 'isco', 'SM', 'Algo del área de maquinarias toda la semana: historia, post o canal social.', ''],
  ['promo-isco', 'Mover los productos con descuento de la promo del día', 'dias:mie,sab', 'isco', 'SM', 'Mostrá el precio final con el descuento. Ej.: si comprás $80.000, el dulce de leche de $50.000 con 10% off te queda en $45.000.', ''],
  ['promo-quality', 'Mover los productos con descuento de la promo del día', 'dias:mie,vie', 'quality tienda', 'SM', 'Mostrá el precio final con el descuento. Ej.: si comprás $80.000, el dulce de leche de $50.000 con 10% off te queda en $45.000.', ''],
  ['produccion-bauti', 'Organizar la producción de Bauti de la semana que viene', 'semana:mie', 'isco, quality tienda, gabriel varisco, vice burger', 'SM', 'Hablá con el dueño: ¿hay descargas?, ¿quieren mover algo puntual la semana que viene?, ¿promos o productos para mostrar? Dejale a Bauti 3 o 4 temas o ideas generales en una tarjeta de Producción.', 'crear:produccion'],
  ['colaboraciones', 'Buscar colaboradores para campañas o hacer colaboraciones en redes', 'mes:1-31', 'sí', 'SM', 'Cuentas afines, emprendedores o influencers locales: una colaboración por mes por marca.', ''],
  ['trimestral-check', '¿Este mes toca reporte trimestral? Organizalo con tiempo', 'mes:1-7', 'no', 'SM', 'Los trimestrales se entregan en enero, abril, julio y octubre.', 'LINK_REPORTES'],
  ['reunion-guiones', 'Reunión de guiones: presentar ideas nuevas y ver los que entregó Fede', 'semana:lun', 'isco, quality tienda, quality mayorista, gabriel varisco, tritato, dyb, 1talquecocina, vice burger', 'SM', 'Cada idea que aprueben va a Aprobado en SCL CON fecha de inicio = entrega del guion (7 días después, el lunes siguiente). Sin esa fecha Fede no sabe cuándo entregar.', '']
];
function asegurarRutinas_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Rutinas'); if (!sh) return;
  const ya = (P.getProperty('RUTINAS_AGREGADAS') || '').split(',').filter(Boolean);
  const ids = rows_('Rutinas').map(r => r[0]);
  let cambio = false;
  RUTINAS_NUEVAS.forEach(r => { if (ya.indexOf(r[0]) >= 0) return; if (ids.indexOf(r[0]) < 0) sh.appendRow(r); ya.push(r[0]); cambio = true; });
  if (cambio) P.setProperty('RUTINAS_AGREGADAS', ya.join(','));
  // fila de Config para la contraseña de brainstormings (la completa el project en el Sheet)
  const cf = SpreadsheetApp.getActive().getSheetByName('Config');
  if (cf && rows_('Config').map(r => r[0]).indexOf('CLAVE_BRAINSTORMING') < 0) cf.appendRow(['CLAVE_BRAINSTORMING', '', 'Contraseña del equipo para la web de brainstormings: el panel se la muestra a quien entró con la clave del equipo']);
  if (cf && rows_('Config').map(r => r[0]).indexOf('DISCORD_PUENTE') < 0) cf.appendRow(['DISCORD_PUENTE', '', 'Dirección del Worker de Cloudflare que hace de puente con Discord (ej. https://panel-discord.tu-usuario.workers.dev)']);
  if (cf && rows_('Config').map(r => r[0]).indexOf('DISCORD_SERVIDOR') < 0) cf.appendRow(['DISCORD_SERVIDOR', '', 'ID del servidor de Discord del equipo (Discord con modo desarrollador → clic derecho en el servidor → Copiar ID del servidor)']);
  // columna F de Equipo: usuario de Discord de cada uno (para sus menciones)
  const eqs = SpreadsheetApp.getActive().getSheetByName('Equipo');
  // Ivo: dirección creativa, con su propia vista de revisión
  if (eqs && rows_('Equipo').map(r => norm_(r[1])).indexOf('ivo') < 0) eqs.appendRow(['Ivo', 'ivo', 'Dirección', 'ivo']);
  if (eqs && !String(eqs.getRange(1, 6).getValue()).trim()) eqs.getRange(1, 6).setValue('usuario de Discord');
}

/* Cuándo se leyó Trello y qué tableros fallaron: va en cada respuesta para que la web avise si los datos están viejos o incompletos. */
function leerSnapLiviano_() {
  const c = CacheService.getScriptCache(), h = c.get('snapinfo');
  if (h) { try { return JSON.parse(h); } catch (e) {} }
  const s = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json'), r = { generado: s.generado || null, fallas: s.fallas || [] };
  c.put('snapinfo', JSON.stringify(r), 21600);
  return r;
}
function actualizar(desdeWeb) {
  const lock = LockService.getScriptLock();
  // si justo está corriendo el disparador, el botón de la web espera a que termine en vez de fallar
  if (!lock.tryLock(desdeWeb ? 110000 : 5000)) return { ok: false, error: 'Ya se está actualizando' };
  try {
    // recién actualizado (por el disparador o por otra persona): no se vuelve a leer todo
    if (desdeWeb) { try { const s = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json'), g = new Date(s.generado || 0).getTime(); if (Date.now() - g < 60000) return { ok: true, reciente: true, generado: new Date(g).toISOString(), incompletos: s.fallas || [] }; } catch (e) {} }
    try { asegurarRutinas_(); } catch (e) {}
    const cat = catalogo_(), cfg = config_();
    const snap = leerTrello_(cat);
    // tableros que Trello no devolvió: se mantienen sus tarjetas de la lectura anterior (mejor algo un poco viejo que verlas desaparecer)
    if (snap.fallas.length) {
      const ant = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json');
      snap.tableros.filter(b => b.fallo).forEach(b => {
        (ant.cards || []).filter(c => c.tablero === b.nombre).forEach(c => snap.cards.push(c));
        const bt = (ant.tableros || []).filter(x => x.nombre === b.nombre)[0];
        if (bt) { b.listas = bt.listas; b.etiquetas = bt.etiquetas; }
      });
    }
    snap.generado = new Date().toISOString();
    guardarJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json', snap);
    P.deleteProperty('ULTIMA_FALLA');
    CacheService.getScriptCache().put('snapinfo', JSON.stringify({ generado: snap.generado, fallas: snap.fallas }), 21600);
    // Lectura automática con la API de Claude: apagada salvo que Config → IA_AUTOMATICA diga "sí" (gasta créditos).
    if (si_(cfg.IA_AUTOMATICA)) recomendarTarjetas_(snap, cat, cfg);
    // Discord: menciones de cada uno (solo si hay bot y servidor cargados)
    try { const dc = leerDiscord_(cfg, cat); if (dc) { guardarJson_('DISCORD_FILE_ID', 'panel-ideamia-discord.json', dc); P.deleteProperty('DISCORD_ERROR'); } }
    catch (e) { P.setProperty('DISCORD_ERROR', String(e.message).slice(0, 300)); }
    CacheService.getScriptCache().removeAll(['snap', 'estados']); // 'estados' se rearma desde la planilla (por si alguien la editó a mano)
    construirBases_();
    return { ok: true, tarjetas: snap.cards.length, generado: snap.generado, incompletos: snap.fallas };
  } catch (e) {
    // queda anotado para que la web lo muestre (antes solo se veía en el registro de ejecuciones de Google)
    P.setProperty('ULTIMA_FALLA', JSON.stringify({ cuando: new Date().toISOString(), mensaje: String(e.message || e).replace(/key=[^&\s]+|token=[^&\s]+/g, '…').slice(0, 250) }));
    throw e;
  } finally { lock.releaseLock(); }
}

/* Para revisar desde el editor: cuántas tarjetas trajo por marca y tipo de lista. */
function resumen() {
  const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json'), ia = leerJson_('IA_FILE_ID', 'panel-ideamia-ia.json');
  const t = {};
  (snap.cards || []).forEach(c => { const k = (c.m[0] || 'sin marca') + ' · ' + c.cat; t[k] = (t[k] || 0) + 1; });
  console.log('Generado: ' + snap.generado + ' · tableros: ' + (snap.tableros || []).length + ' · tarjetas: ' + (snap.cards || []).length + ' · lecturas IA: ' + Object.keys(ia).length);
  console.log((snap.tableros || []).map(b => b.tipo + ':' + b.nombre + '→' + (b.marca || '-')).join(' | '));
  console.log(Object.keys(t).sort().map(k => k + ' = ' + t[k]).join('\n'));
}

/* ---------------- calendario ---------------- */
function eventos_(cfg, cat, desde, hasta) {
  const cal = CalendarApp.getCalendarById(cfg.CALENDAR_ID || 'estudioideamia@gmail.com');
  if (!cal) return [];
  const excluir = lista_(cfg.CAL_EXCLUIR);
  const otros = lista_(cfg.CAL_OTROS_NOMBRES == null ? 'zaira,fede,lu,bauti,luisi,juan' : cfg.CAL_OTROS_NOMBRES);
  const palabras_ = t => ' ' + norm_(t).replace(/[^a-z0-9ñ]+/g, ' ') + ' ';
  return cal.getEvents(desde, hasta).filter(e => {
    const t = norm_(e.getTitle());
    return !excluir.some(x => t.indexOf(x) >= 0);
  }).map(e => {
    const titulo = e.getTitle();
    const w = palabras_(titulo);
    let invitados = [];
    try { invitados = e.getGuestList().map(g => String(g.getEmail()).toLowerCase()); } catch (x) {}
    // a quién le toca: lo nombran en el título o está invitado
    const personas = cat.equipo.filter(p => p.alias.some(a => w.indexOf(' ' + a + ' ') >= 0) || (p.email && invitados.indexOf(p.email) >= 0)).map(p => p.clave);
    return {
      otros: otros.some(a => w.indexOf(' ' + a + ' ') >= 0),
      id: e.getId() + '@' + ymd_(e.getStartTime()), t: titulo, s: e.getStartTime().toISOString(), f: e.getEndTime().toISOString(),
      dia: e.isAllDayEvent(), marcas: marcasEn_(titulo, cat.marcas), personas: personas, desc: String(e.getDescription() || '').replace(/<[^>]+>/g, ' ').slice(0, 300)
    };
  });
}

/* ---------------- registro (lo que van tildando) ---------------- */
function registrar_(persona, tipo, clave, marca, estado, detalle, periodo) {
  const sh = SpreadsheetApp.getActive().getSheetByName('Registro');
  const fila = [Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), persona, tipo, clave, marca || '', estado, detalle || '', periodo || ''];
  sh.appendRow(fila);
  // se actualiza también la copia en memoria, así abrir el panel no relee toda la planilla
  const lock = LockService.getUserLock(); // distinto del de la actualización de Trello, para no esperarla
  try {
    lock.waitLock(5000);
    const est = cacheGet_('estados');
    if (est) { aplicarFila_(est, fila); cachePut_('estados', est); }
  } catch (e) { CacheService.getScriptCache().remove('estados'); } finally { try { lock.releaseLock(); } catch (e) {} }
}
function aplicarFila_(out, r) {
  const k = r[3]; if (!k) return;
  if (r[5] === 'deshacer') { delete out[k]; return; }
  out[k] = { fecha: r[0], persona: r[1], tipo: r[2], marca: r[4], estado: r[5], detalle: r[6], periodo: r[7] };
}
/* Último estado por clave (el último renglón gana; "deshacer" lo borra). */
function estados_() {
  const hit = cacheGet_('estados');
  if (hit) return hit;
  const out = {};
  rows_('Registro').forEach(r => aplicarFila_(out, r));
  cachePut_('estados', out);
  return out;
}

/* ---------------- armado del panel para una persona ---------------- */
function snapshot_() {
  const c = CacheService.getScriptCache(), s = c.get('snap');
  if (s) return JSON.parse(s);
  const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json');
  const txt = JSON.stringify(snap);
  if (txt.length < 95000) c.put('snap', txt, 600);
  return snap;
}

/* Todo lo pesado (Trello, calendario, planillas) se lee una sola vez y se comparte entre las personas. */
function contexto_() {
  const cfg = config_(), cat = catalogo_(), hoy = hoyAR_();
  return {
    cfg, cat, hoy, snap: snapshot_(), ia: leerJson_('IA_FILE_ID', 'panel-ideamia-ia.json'), discord: leerJson_('DISCORD_FILE_ID', 'panel-ideamia-discord.json'),
    eventos: eventos_(cfg, cat, new Date(hoy.getTime() - 2 * 864e5), new Date(hoy.getTime() + 21 * 864e5)),
    feriados: feriados_(hoy)
  };
}

/* Feriados de Argentina (calendario público de Google), próximos 60 días. */
function feriados_(hoy) {
  try {
    const cal = CalendarApp.getCalendarById('es.ar#holiday@group.v.calendar.google.com');
    if (!cal) return [];
    return cal.getEvents(hoy, new Date(hoy.getTime() + 60 * 864e5)).map(e => ({ n: e.getTitle(), d: ymd_(e.getStartTime()) }));
  } catch (e) { return []; }
}

/* Panel "base" de una persona: sin lo que tildó (eso se suma al momento con aplicarEstados_). */
function panel_(personaClave, ctx) {
  ctx = ctx || contexto_();
  const cfg = ctx.cfg, cat = ctx.cat;
  const yo = cat.equipo.filter(p => p.clave === norm_(personaClave))[0];
  if (!yo) return { error: 'No encuentro a "' + personaClave + '" en la pestaña Equipo', equipo: cat.equipo.map(p => ({ clave: p.clave, nombre: p.nombre, rol: p.rol })) };
  const esCM = /cm/i.test(yo.rol), esProject = /project/i.test(yo.rol);
  // Ivo (rol "Dirección" o "Creativo"): ve todas las marcas y la vista de revisión (diseños, videos y guiones de la semana)
  const esRevisa = esProject || /direcc|creativ/i.test(yo.rol);
  const misMarcas = cat.marcas.filter(m => esRevisa || m.sm === yo.clave || m.cm === yo.clave);
  const slugs = misMarcas.map(m => m.slug);
  const hoy = ctx.hoy;
  const snap = ctx.snap;
  const ia = ctx.ia;
  const est = {};

  const ajustes = { inputDias: Number(cfg.INPUT_RECORDATORIO_DIAS || 3), porVencer: Number(cfg.POR_VENCER_DIAS || 3), efemDias: Number(cfg.EFEMERIDES_DIAS || 45) };
  const todas = (snap.cards || []).filter(c => c.m.some(s => slugs.indexOf(s) >= 0) && (esProject || !esCM || c.tipo === 'cm' || c.tipo === 'project'));

  // Cobertura del calendario: fecha más lejana con contenido cargado (SCL + CM) contra el objetivo:
  // en cada entrega de calendario (evento "Entrega … calendario" del calendario del equipo) tiene que quedar cubierto un mes después de esa entrega.
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const proxEntrega = (ctx.eventos || []).filter(e => /entrega/.test(norm_(e.t)) && /calendario/.test(norm_(e.t)) && new Date(e.s) >= hoy0).sort((a, b) => new Date(a.s) - new Date(b.s))[0];
  const baseEntrega = proxEntrega ? new Date(proxEntrega.s) : hoy0;
  const objetivo = new Date(baseEntrega.getFullYear(), baseEntrega.getMonth() + 1, baseEntrega.getDate());
  const cobertura = {};
  misMarcas.forEach(m => {
    let max = null;
    todas.forEach(c => {
      if (c.m[0] !== m.slug || !c.due || (c.tipo !== 'scl' && c.tipo !== 'cm')) return;
      if (['trabajo', 'hecho', 'corr', 'urgente', 'espera'].indexOf(c.cat) < 0) return;
      const d = new Date(c.due); if (!max || d > max) max = d;
    });
    cobertura[m.slug] = { hasta: max ? ymd_(max) : null, objetivo: ymd_(objetivo), entrega: proxEntrega ? ymd_(baseEntrega) : null };
  });

  // Efemérides: ¿ya aparece algo con ese nombre en el calendario editorial?
  const piezas = todas.filter(c => c.tipo === 'scl' && ['trabajo', 'hecho', 'corr', 'urgente', 'espera'].indexOf(c.cat) >= 0).map(c => ({ m: c.m[0], n: norm_(c.n) }));
  const clave_ = s => norm_(s).replace(/^(dia (del|de la|de los|de las|de) )/, '').replace(/[^a-z0-9ñ ]/g, '').trim();

  // Vencidas: solo las de los últimos 15 días (lo más viejo ya no suma).
  const hace15 = new Date(hoy.getTime() - 15 * 864e5);
  const reciente = c => !c.due || new Date(c.due) >= hace15;
  const enVentana = (c, dias) => c.due && !c.dc && new Date(c.due) >= hace15 && new Date(c.due) <= new Date(hoy.getTime() + dias * 864e5);
  const limiteEfem = new Date(hoy.getTime() + ajustes.efemDias * 864e5), ayer = new Date(hoy.getTime() - 864e5);
  const cards = todas.filter(c => {
    // los inputs salen solo de los tableros SCL (en el Project y en los otros tableros quedan pedidos viejos)
    if (c.cat === 'input' && c.tipo !== 'scl') return false;
    if (c.cat === 'guion') return true;
    // Ivo: solo lo que le dejan en revisión en Diseño y Producción (más los guiones, arriba)
    // lo que está en revisión se muestra SIEMPRE (aunque la de SCL figure programada o no se encuentre la original): esconderlo era perder piezas.
    // Lo pendiente (próximas entregas) sí se filtra: si ya salió o no tiene original, no hay nada que entregar.
    if (c.cat === 'pieza') return esRevisa && (c.etapa === 'revision' || (c.etapa === 'pendiente' && !c.salio && !c.sinOrig));
    if (esRevisa && !esProject) return false;
    if (c.tipo === 'project') return c.cat !== 'hecho' && !c.dup && reciente(c);
    if (c.cat === 'brainstorming' && c.tipo === 'cm' && !esCM && !esProject) return false;
    if (c.cat === 'efem') return c.due && new Date(c.due) >= ayer && new Date(c.due) <= limiteEfem;
    if (c.cat === 'corr') return reciente(c);
    if (['input', 'recursos', 'fichas', 'brainstorming'].indexOf(c.cat) >= 0) return true;
    // aprobado / programado que sale en los próximos días: para el chequeo "por salir" (reels y carruseles)
    if (c.cat === 'hecho') return c.tipo === 'scl' && c.due && !c.dc && new Date(c.due) >= ayer && new Date(c.due) <= new Date(hoy.getTime() + ajustes.porVencer * 864e5);
    return enVentana(c, ajustes.porVencer);
  }).map(c => {
    const o = Object.assign({}, c);
    if (ia[c.id]) o.ia = ia[c.id].r;
    const e = est['inp:' + c.id] || est['card:' + c.id]; if (e) o.estado = e;
    if (c.cat === 'efem') { const k = clave_(c.n); o.enCalendario = k.length > 2 && piezas.some(p => p.m === c.m[0] && p.n.indexOf(k) >= 0); }
    if (c.cat === 'recursos' || c.cat === 'fichas') o.d = o.d.slice(0, 200);
    return o;
  });

  // Los reportes semanales, mensuales y trimestrales se siguen solos con la web de reportes: no van como rutina manual.
  // "por marca": sí (todas mis marcas) · canal (las que tienen canal social) · no (una sola, general) · o una lista de marcas ("isco, quality tienda").
  const marcasDeRutina = r => {
    if (r.porMarca === 'si' || r.porMarca === 'sí') return misMarcas;
    if (r.porMarca === 'canal') return misMarcas.filter(m => m.canal);
    if (!r.porMarca || r.porMarca === 'no') return null;
    const l = lista_(r.porMarca);
    return misMarcas.filter(m => l.some(a => m.alias.indexOf(a) >= 0 || m.slug === a.replace(/[^a-z0-9]+/g, '-')));
  };
  const soloRevisa = esRevisa && !esProject; // Ivo no tiene rutinas ni reuniones de social media
  const misRutinas = cat.rutinas.filter(r => !soloRevisa && (esProject || r.rol.toLowerCase() === (esCM ? 'cm' : 'sm')) && ['rep-mensual', 'rep-trim'].indexOf(r.id) < 0)
    .filter(r => { const ms = marcasDeRutina(r); return ms === null || ms.length > 0; }); // si es de marcas que no son mías, no la veo
  // Para el checklist semanal: qué rutinas hay, para qué marcas y qué días/períodos tiene esta semana.
  const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7));
  const semanaInfo = { dias: [0, 1, 2, 3, 4, 5].map(i => ymd_(new Date(lunes.getTime() + i * 864e5))), semana: semana_(hoy), mes: ym_(hoy) };
  const rutinasDef = misRutinas.map(r => ({
    id: r.id, tarea: r.tarea, cuando: r.cuando, ayuda: r.ayuda, enlace: cfg[r.enlace] || r.enlace || '',
    marcas: (marcasDeRutina(r) || []).map(m => m.slug)
  }));

  // rutinas activas hoy
  const rutinas = [];
  misRutinas.forEach(r => {
    const ev = evaluarCuando_(r.cuando, hoy); if (!ev) return;
    const marcasR = marcasDeRutina(r) || [null];
    marcasR.forEach(m => {
      const clave = 'rut:' + r.id + ':' + (m ? m.slug : '-') + ':' + ev.periodo;
      rutinas.push({ clave, id: r.id, tarea: r.tarea, ayuda: r.ayuda, enlace: cfg[r.enlace] || r.enlace || '', marca: m ? m.slug : '', etiqueta: ev.etiqueta, vencida: !!ev.vencida, estado: est[clave] || null });
    });
  });

  // reuniones a organizar este mes
  const reuniones = [];
  cat.reuniones.filter(r => !soloRevisa && (esProject || r.rol.toLowerCase() === (esCM ? 'cm' : 'sm'))).forEach(r => {
    const ev = evaluarCuando_(r.cuando, hoy, r.avisar); if (!ev) return;
    (r.porMarca ? misMarcas : [null]).forEach(m => {
      const clave = 'reu:' + r.id + ':' + (m ? m.slug : yo.clave) + ':' + ev.periodo;
      reuniones.push({ clave, id: r.id, nombre: r.nombre, con: r.con, marca: m ? m.slug : '', desde: ev.desde, hasta: ev.hasta, periodo: ev.periodo, vencida: !!ev.vencida, duracion: r.duracion, estado: est[clave] || null });
    });
  });

  // calendario: 2 días atrás a 21 adelante
  // Calendario personal: cada uno ve lo suyo.
  const equipoKw = lista_(cfg.CAL_EQUIPO == null ? 'reporte,entrega quincenal,reels,guion,guiones,revision,reunion ideamia,brainstorming' : cfg.CAL_EQUIPO);
  const evs = ctx.eventos.map(e => Object.assign({}, e)).filter(e => {
    if (esRevisa) return true;
    if (e.personas.indexOf(yo.clave) >= 0) return true;                         // me nombra o me invitaron
    if (e.marcas.some(s => slugs.indexOf(s) >= 0)) return true;                  // es de una de mis marcas
    if (e.personas.length || e.otros || e.marcas.length) return false;          // es de otra persona o de otra marca
    const w = ' ' + norm_(e.t).replace(/[^a-z0-9ñ]+/g, ' ') + ' ';
    if (w.indexOf(' cm ') >= 0) return esCM;                                    // "Reporte Semanal CM" → Ale
    if (w.indexOf(' scl ') >= 0) return !esCM;                                  // "Reporte Semanal SCL" → social media
    return equipoKw.some(k => w.indexOf(' ' + k) >= 0);                         // general del equipo; lo demás queda para el project
  });
  evs.forEach(e => { if (est['cal:' + e.id]) e.estado = est['cal:' + e.id]; });

  return {
    ok: true, generado: snap.generado || null, hoy: ymd_(hoy),
    yo: { clave: yo.clave, nombre: yo.nombre, rol: yo.rol },
    equipo: cat.equipo.map(p => ({ clave: p.clave, nombre: p.nombre, rol: p.rol })),
    feriados: ctx.feriados || [],
    marcas: misMarcas.map(m => ({ slug: m.slug, nombre: m.nombre, canal: m.canal, rubro: m.contexto || '', tableros: (snap.tableros || []).filter(b => b.marca === m.slug).map(b => ({ id: b.id, tipo: b.tipo, url: b.url, nombre: b.nombre, listas: b.listas || [], etiquetas: b.etiquetas || [] })) })),
    rutinasDef: rutinasDef, semanaInfo: semanaInfo,
    project: (snap.tableros || []).filter(b => b.tipo === 'project').map(b => b.url)[0] || '',
    projectTablero: (snap.tableros || []).filter(b => b.tipo === 'project').map(b => ({ id: b.id, tipo: 'project', url: b.url, nombre: b.nombre, listas: b.listas || [], etiquetas: b.etiquetas || [] }))[0] || null,
    cards, cobertura, rutinas, reuniones, eventos: evs,
    discord: ctx.discord && ctx.discord.generado ? { generado: ctx.discord.generado, menciones: ((ctx.discord.porPersona || {})[yo.clave] || []).filter(m => (!m.marca || misMarcas.some(x => x.slug === m.marca)) && new Date(m.fecha).getTime() > Date.now() - 3 * 864e5) /* solo sus marcas y los canales generales, de los últimos 3 días */, conUsuario: !!((cat.equipo.find(p => p.clave === yo.clave) || {}).discord || []).length } : null,
    links: { reportes: cfg.LINK_REPORTES, brainstorming: cfg.LINK_BRAINSTORMING, notion: cfg.LINK_NOTION, drive: cfg.LINK_DRIVE, claveBrain: cfg.CLAVE_BRAINSTORMING || '' },
    ajustes
  };
}

/* ---------------- paneles listos (se arman al actualizar; abrir la web solo suma lo tildado) ---------------- */
function cachePut_(k, obj) {
  const s = JSON.stringify(obj), c = CacheService.getScriptCache(), tam = 45000, m = {};
  const n = Math.ceil(s.length / tam);
  for (let i = 0; i < n; i++) m[k + ':' + i] = s.substr(i * tam, tam);
  m[k] = String(n);
  c.putAll(m, 21600);
}
function cacheGet_(k) {
  const c = CacheService.getScriptCache(), n = Number(c.get(k) || 0);
  if (!n) return null;
  const keys = []; for (let i = 0; i < n; i++) keys.push(k + ':' + i);
  const m = c.getAll(keys); let s = '';
  for (let i = 0; i < keys.length; i++) { if (m[keys[i]] == null) return null; s += m[keys[i]]; }
  try { return JSON.parse(s); } catch (e) { return null; }
}

function construirBases_() {
  const ctx = contexto_(), bases = {};
  ctx.cat.equipo.forEach(p => { bases[p.clave] = panel_(p.clave, ctx); cachePut_('base:' + p.clave, bases[p.clave]); });
  cachePut_('equipo', ctx.cat.equipo.map(p => ({ clave: p.clave, nombre: p.nombre, rol: p.rol })));
  cachePut_('marcasLista', ctx.cat.marcas.map(m => ({ slug: m.slug, nombre: m.nombre })));
  guardarJson_('BASES_FILE_ID', 'panel-ideamia-bases.json', bases);
  return bases;
}

function base_(clave) {
  clave = norm_(clave);
  const hoy = ymd_(hoyAR_());
  let b = cacheGet_('base:' + clave);
  if (!b) { const todas = leerJson_('BASES_FILE_ID', 'panel-ideamia-bases.json'); b = todas[clave] || null; if (b) cachePut_('base:' + clave, b); }
  if (!b || b.hoy !== hoy) { b = panel_(clave); if (b && b.ok) cachePut_('base:' + clave, b); }
  return b;
}

/* ---------------- reportes: qué falta entregar en la web de reportes ----------------
   Lee la configuración publicada de esa web (marcas, responsables, vencimientos) y su Sheet de reportes.
   Cuando alguien carga un reporte, desaparece de acá en unos minutos (el Sheet se relee cada 3 min). */
const REP_SHEET = '1lAcIG6J-8rheWwSHiNnZZ6K14BDi5pKnk8LW3P-X0Fk';
const REP_WEB = 'https://ideamiacontacto-lab.github.io/reportes-ideamia/';

function reportesConfig_() {
  const c = CacheService.getScriptCache(), hit = c.get('repcfg');
  if (hit) return JSON.parse(hit);
  const cfg = { marcas: [], deadline: { cm: { dia: 1, hora: 12 }, sm: { dia: 2, hora: 12 } }, mesDia: 5, hora: 12, semanalDesde: '2026-09-28', mensualDesde: '2026-09', periodicoDesde: '2026-07' };
  try {
    const t = UrlFetchApp.fetch(REP_WEB + 'config.js?x=' + Date.now(), { muteHttpExceptions: true }).getContentText();
    const re = /slug:\s*"([^"]+)"[^}\n]*?sm:\s*"([^"]*)"[^}\n]*?cm:\s*"([^"]*)"/g; let m;
    while ((m = re.exec(t))) cfg.marcas.push({ slug: m[1], sm: norm_(m[2]), cm: norm_(m[3]) });
    const g = k => { const x = new RegExp(k + ':\\s*"([^"]+)"').exec(t); return x ? x[1] : null; };
    cfg.semanalDesde = g('SEMANAL_DESDE') || cfg.semanalDesde; cfg.mensualDesde = g('MENSUAL_DESDE') || cfg.mensualDesde; cfg.periodicoDesde = g('PERIODICO_DESDE') || cfg.periodicoDesde;
    const dl = /DEADLINE:\s*\{\s*cm:\s*\{\s*dia:\s*(\d+),\s*hora:\s*(\d+)\s*\},\s*sm:\s*\{\s*dia:\s*(\d+),\s*hora:\s*(\d+)/.exec(t);
    if (dl) cfg.deadline = { cm: { dia: +dl[1], hora: +dl[2] }, sm: { dia: +dl[3], hora: +dl[4] } };
    const md = /MONTHLY_DEADLINE_DAY:\s*(\d+)/.exec(t); if (md) cfg.mesDia = +md[1];
    const hh = /DEADLINE_HOUR:\s*(\d+)/.exec(t); if (hh) cfg.hora = +hh[1];
  } catch (e) {}
  if (cfg.marcas.length) c.put('repcfg', JSON.stringify(cfg), 21600);
  return cfg;
}

// Desde qué semana (lunes) se le piden reportes a cada marca que arranca después del resto.
const REP_DESDE_MARCA = { 'vice-burger': '2026-10-12' };
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const lunes_ = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

/* Qué reportes ya están cargados: "tipo|marca|período" (descontando los dados de baja). */
function reportesEnviados_() {
  const c = CacheService.getScriptCache(), hit = c.get('repenv');
  if (hit) return JSON.parse(hit);
  const url = 'https://docs.google.com/spreadsheets/d/' + REP_SHEET + '/export?format=csv';
  let txt = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
  if (!/^enviado_en/.test(txt)) txt = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getContentText();
  if (!/^enviado_en/.test(txt)) return null;
  const rows = Utilities.parseCsv(txt), h = rows[0], ix = k => h.indexOf(k);
  const iT = ix('tipo'), iM = ix('marca_slug'), iP = ix('periodo_id'), iE = ix('enviado_en'), iD = ix('datos_json');
  const vivos = [], bajas = {};
  rows.slice(1).forEach(r => {
    const tipo = r[iT]; if (!tipo) return;
    if (tipo === 'baja') { try { const d = JSON.parse(r[iD] || '{}'); bajas[d.ref_tipo + '|' + r[iM] + '|' + d.ref_enviado_en] = 1; } catch (e) {} return; }
    let p = String(r[iP] || '').trim();
    const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(p);
    if (dm) p = dm[3] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[1]).slice(-2);
    if (tipo === 'mensual' && /^\d{4}-\d{2}-\d{2}$/.test(p)) p = p.slice(0, 7);
    if ((tipo === 'sm' || tipo === 'cm') && /^\d{4}-\d{2}-\d{2}$/.test(p)) { const [y, mo, d] = p.split('-').map(Number); p = ymd_(lunes_(new Date(y, mo - 1, d))); }
    vivos.push([tipo, r[iM], p, r[iE]]);
  });
  const env = {};
  vivos.forEach(v => { if (!bajas[v[0] + '|' + v[1] + '|' + v[3]]) env[v[0] + '|' + v[1] + '|' + v[2]] = v[3]; });
  c.put('repenv', JSON.stringify(env), 180);
  return env;
}

/* Reportes que le faltan a una persona (o que vencen pronto). */
function tareasReportes_(clave, rol) {
  const cfg = reportesConfig_(), env = reportesEnviados_();
  if (!env) return [];
  const ahora = new Date(), out = [], esCM = /cm/i.test(rol), esProj = /project/i.test(rol);
  const marcas = cfg.marcas.filter(m => esProj || (esCM ? m.cm === clave : m.sm === clave));
  const dd = d => ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
  marcas.forEach(m => {
    // marcas que arrancan más tarde (ej. Vice publica desde el 12/10): no se piden reportes de antes
    const desde = REP_DESDE_MARCA[m.slug] || '';
    // semanal (SM y CM): las últimas 3 semanas ya terminadas
    const tipos = esProj ? ['sm', 'cm'] : [esCM ? 'cm' : 'sm'];
    tipos.forEach(tipo => {
      const dl = cfg.deadline[tipo] || { dia: 1, hora: 12 };
      let w = lunes_(new Date(ahora.getTime() - 7 * 864e5));
      for (let i = 0; i < 3; i++, w = new Date(w.getTime() - 7 * 864e5)) {
        const id = ymd_(w); if (id < cfg.semanalDesde || id < desde) break;
        if (env[tipo + '|' + m.slug + '|' + id]) continue;
        const vence = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7 + (dl.dia - 1), dl.hora);
        const fin = new Date(w.getTime() + 6 * 864e5);
        out.push({ k: 'rep:' + tipo + ':' + m.slug + ':' + id, tipo: tipo, marca: m.slug, periodo: id, label: 'Reporte semanal ' + (tipo === 'cm' ? 'CM' : 'Social Media') + ' · semana ' + dd(w) + ' al ' + dd(fin), vence: vence.toISOString(), resp: tipo === 'cm' ? m.cm : m.sm });
      }
    });
    // mensual y trimestral: los carga el social media
    if (esCM && !esProj) return;
    const mesAnt = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1), idM = ym_(mesAnt);
    if (idM >= cfg.mensualDesde && idM >= desde.slice(0, 7) && !env['mensual|' + m.slug + '|' + idM]) {
      out.push({ k: 'rep:mensual:' + m.slug + ':' + idM, tipo: 'mensual', marca: m.slug, periodo: idM, label: 'Reporte mensual · ' + MESES_ES[mesAnt.getMonth()], vence: new Date(ahora.getFullYear(), ahora.getMonth(), cfg.mesDia, cfg.hora).toISOString(), resp: m.sm });
    }
    if ([0, 3, 6, 9].indexOf(ahora.getMonth()) >= 0) {
      const ini = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1), idT = ym_(ini) + '+3';
      if (ym_(ini) >= cfg.periodicoDesde && ym_(ini) >= desde.slice(0, 7) && !env['periodico|' + m.slug + '|' + idT]) {
        out.push({ k: 'rep:periodico:' + m.slug + ':' + idT, tipo: 'periodico', marca: m.slug, periodo: idT, label: 'Reporte trimestral · ' + MESES_ES[ini.getMonth()].slice(0, 3) + ' a ' + MESES_ES[(ahora.getMonth() + 11) % 12].slice(0, 3), vence: new Date(ahora.getFullYear(), ahora.getMonth(), 10, cfg.hora).toISOString(), resp: m.sm });
      }
    }
  });
  return out.sort((a, b) => a.vence.localeCompare(b.vence));
}

/* Suma al panel base lo que la persona fue tildando (pestaña Registro), los reportes que faltan y el checklist de la semana. */
function aplicarEstados_(b, est) {
  if (!b || !b.ok) return b;
  try { b.reportes = tareasReportes_(b.yo.clave, b.yo.rol); b.linkReportes = REP_WEB + '?resp=' + encodeURIComponent(b.yo.clave); } catch (e) { b.reportes = []; }
  if (b.semanaInfo) {
    const per = b.semanaInfo.dias.concat([b.semanaInfo.semana, b.semanaInfo.mes]);
    b.estRut = {};
    Object.keys(est).forEach(k => { if (k.indexOf('rut:') === 0 && per.indexOf(k.split(':').pop()) >= 0) b.estRut[k] = est[k]; });
  }
  (b.cards || []).forEach(c => { const e = est['inp:' + c.id] || est['card:' + c.id]; c.estado = e || undefined; });
  (b.rutinas || []).forEach(r => r.estado = est[r.clave] || null);
  (b.reuniones || []).forEach(r => r.estado = est[r.clave] || null);
  (b.eventos || []).forEach(e => e.estado = est['cal:' + e.id] || undefined);
  return b;
}

/* "ivo" → "Ivo": para firmar en Trello con el nombre de la pestaña Equipo */
function nombreDe_(clave) { const p = equipo_().filter(x => x.clave === norm_(clave))[0]; return p ? p.nombre : String(clave || 'el panel'); }
function equipo_() {
  let eq = cacheGet_('equipo');
  if (!eq) { eq = catalogo_().equipo.map(p => ({ clave: p.clave, nombre: p.nombre, rol: p.rol })); cachePut_('equipo', eq); }
  return eq;
}

/* Vista del project: qué hizo y qué coordinó cada persona. */
function vistaProject_() {
  const eq = equipo_(), hoy = hoyAR_(), est = estados_();
  const personas = eq.filter(p => !/project/i.test(p.rol)).map(p => {
    const pn = aplicarEstados_(base_(p.clave), est) || {};
    const r = pn.rutinas || [], re = pn.reuniones || [];
    const inputs = (pn.cards || []).filter(c => c.cat === 'input');
    return {
      clave: p.clave, nombre: p.nombre, rol: p.rol,
      rutinas: { total: r.length, hechas: r.filter(x => x.estado && x.estado.estado === 'hecho').length, pendientes: r.filter(x => !x.estado).map(x => ({ tarea: x.tarea, marca: x.marca, vencida: x.vencida })) },
      reuniones: re.map(x => ({ nombre: x.nombre, marca: x.marca, vencida: x.vencida, hasta: x.hasta, estado: x.estado })),
      inputs: { total: inputs.length, sinTocar: inputs.filter(c => !c.estado).length },
      reportes: (pn.reportes || []).map(r => ({ label: r.label, marca: r.marca, vence: r.vence }))
    };
  });
  const reg = rows_('Registro').slice(-60).reverse().map(r => ({ fecha: r[0], persona: r[1], tipo: r[2], clave: r[3], marca: r[4], estado: r[5], detalle: r[6] }));
  const marcas = cacheGet_('marcasLista') || catalogo_().marcas.map(m => ({ slug: m.slug, nombre: m.nombre }));
  // su propio tablero: si Trello falla, la vista del equipo se sigue viendo y "Mi día" muestra el motivo
  let mio; try { mio = miTablero_(); } catch (e) { mio = { error: String(e.message || e).slice(0, 200) }; }
  return { ok: true, hoy: ymd_(hoy), personas, registro: reg, marcas, mio };
}

/* ---------------- "Mi día" del project: su tablero Project de Trello, leído en vivo ----------------
   El panel es una ventana y una forma rápida de cargar: todo vive en Trello y el tablero manda.
   Listas: Bandeja > Por hacer > En proceso > Enviado / en seguimiento > Listo. */
const NO_ES_MARCA = /^(urgente|extra|ver en minuta|ads|guion|guiones)$/;
function etapaProject_(nombre) {
  const n = norm_(nombre);
  return /bandeja/.test(n) ? 'bandeja' : /por hacer/.test(n) ? 'hacer' : /proceso/.test(n) ? 'proceso' : /enviado|seguimiento/.test(n) ? 'seguimiento' : /listo|hecho|terminad/.test(n) ? 'listo' : 'otra';
}
function tableroProject_() {
  const c = CacheService.getScriptCache(); let id = c.get('projId');
  if (!id) {
    const b = trello_('/members/me/boards', { filter: 'open', fields: 'name' }).filter(x => norm_(x.name) === 'project')[0];
    if (!b) throw new Error('No encuentro el tablero "Project" en Trello');
    id = b.id; c.put('projId', id, 21600);
  }
  return id;
}
function miTablero_() {
  const id = tableroProject_();
  const r = trelloVarios_([
    '/boards/' + id + '/lists?filter=open&fields=name&cards=open&card_fields=name,desc,due,dueComplete,idList,shortUrl,dateLastActivity,labels',
    '/boards/' + id + '/labels?fields=name,color&limit=100',
    '/boards/' + id + '?fields=shortUrl'
  ]);
  if (!r[0]) throw new Error('Trello no devolvió el tablero Project (código ' + ((r.codigos || {})[0] || 'sin respuesta') + ')');
  const cards = [];
  r[0].forEach(l => (l.cards || []).forEach(c => cards.push({
    id: c.id, n: c.name, d: String(c.desc || '').slice(0, 300), due: c.due || null, dc: !!c.dueComplete, lista: l.name, k: etapaProject_(l.name),
    act: c.dateLastActivity, url: c.shortUrl, lab: (c.labels || []).map(x => x.name).filter(Boolean)
  })));
  return {
    url: (r[2] || {}).shortUrl || '', leido: new Date().toISOString(),
    listas: r[0].map(l => ({ id: l.id, n: l.name, k: etapaProject_(l.name) })),
    etiquetas: (r[1] || []).filter(x => x.name).map(x => ({ id: x.id, n: x.name, c: x.color || '', marca: !NO_ES_MARCA.test(norm_(x.name)) })),
    sinEtiquetas: !r[1], cards: cards, dias: Number(config_().SEGUIMIENTO_DIAS) || 3
  };
}
/* Carga rápida: la tarjeta entra SIEMPRE a "Bandeja". La lista la busca el servidor en el tablero; la web no puede mandar otra. */
function pedidoRapido_(b) {
  const texto = String(b.texto || '').trim();
  if (!texto) return { error: 'datos', mensaje: 'Escribí qué es el pedido' };
  const t = miTablero_(), bandeja = t.listas.filter(l => l.k === 'bandeja')[0], pasos = [], avisos = [];
  if (!bandeja) return { error: 'lista', mensaje: 'No encuentro la lista "Bandeja" en Project, así que no creé nada. Listas que tiene: ' + t.listas.map(l => l.n).join(', ') };
  const ids = [], nombres = [];
  if (b.labelId) {
    const e = t.etiquetas.filter(x => x.id === b.labelId && x.marca)[0];
    if (!e) return { error: 'etiqueta', mensaje: 'Esa etiqueta de marca ya no existe en el tablero Project. Recargá la página y probá de nuevo: no creé nada.' };
    ids.push(e.id); nombres.push(e.n);
  }
  if (b.urgente) { const u = t.etiquetas.filter(x => norm_(x.n) === 'urgente')[0]; if (u) { ids.push(u.id); nombres.push(u.n); } else avisos.push('No existe la etiqueta "Urgente" en el tablero: la tarjeta se creó sin ella'); }
  const q = { idList: bandeja.id, name: texto.slice(0, 300), desc: String(b.nota || '').slice(0, 1500), pos: 'top' };
  if (b.due) q.due = b.due;
  if (ids.length) q.idLabels = ids.join(',');
  const card = trello_('/cards', q, 'post');
  if (!card || !card.id) return { error: 'trello', mensaje: 'Trello no confirmó la tarjeta. Fijate en Bandeja antes de cargarla otra vez.' };
  pasos.push('Tarjeta creada en "' + bandeja.n + '" de Project');
  if (nombres.length) pasos.push('Etiquetas: ' + nombres.join(', '));
  if (b.due) pasos.push('Fecha: ' + Utilities.formatDate(new Date(b.due), TZ, 'dd/MM'));
  return { ok: true, pasos: pasos, avisos: avisos, card: { id: card.id, n: card.name, d: q.desc, due: card.due || null, dc: false, lista: bandeja.n, k: 'bandeja', act: card.dateLastActivity || new Date().toISOString(), url: card.shortUrl, lab: nombres } };
}

/* Para revisar desde el editor: lee el tablero Project y muestra qué encontró. No crea ni cambia nada. */
function probarMiTablero() {
  const t = miTablero_(), n = {};
  t.cards.forEach(c => n[c.lista] = (n[c.lista] || 0) + 1);
  console.log('Listas: ' + t.listas.map(l => l.n + ' [' + l.k + '] ' + (n[l.n] || 0)).join(' · '));
  console.log('Etiquetas de marca: ' + t.etiquetas.filter(e => e.marca).map(e => e.n).join(', '));
  console.log('Otras etiquetas: ' + t.etiquetas.filter(e => !e.marca).map(e => e.n).join(', '));
  console.log('Bandeja encontrada: ' + (t.listas.some(l => l.k === 'bandeja') ? 'sí' : 'NO') + ' · Urgente encontrada: ' + (t.etiquetas.some(e => norm_(e.n) === 'urgente') ? 'sí' : 'NO') + ' · días de seguimiento: ' + t.dias);
  console.log('Sin fecha (fuera de Bandeja y Listo): ' + t.cards.filter(c => !c.due && c.k !== 'bandeja' && c.k !== 'listo').length + ' · en seguimiento: ' + t.cards.filter(c => c.k === 'seguimiento').length);
}

/* AUDITORÍA (solo lectura): compara lo que hay AHORA en "En revisión" de cada tablero de Diseño y Producción
   contra lo que el panel le muestra a quien revisa. Dice qué falta y por qué. No cambia nada. */
function auditarRevision() {
  const cat = catalogo_();
  const boards = trello_('/members/me/boards', { filter: 'open', fields: 'name' })
    .map(b => ({ id: b.id, nombre: b.name, tipo: tipoTablero_(b.name), marca: marcasEn_(b.name.replace(/^\S+\s*/, ''), cat.marcas)[0] || '' }))
    .filter(b => b.tipo === 'diseno' || b.tipo === 'produccion');
  const sinMarca = boards.filter(b => !b.marca).map(b => b.nombre);
  const res = trelloVarios_(boards.map(b => '/boards/' + b.id + '/lists?filter=open&fields=name&cards=open&card_fields=name,shortUrl,dateLastActivity'));
  const enTrello = [];
  boards.forEach((b, i) => (res[i] || []).forEach(l => { if (/revisi/.test(norm_(l.name))) (l.cards || []).forEach(c => enTrello.push({ id: c.id, n: c.name, tablero: b.nombre, url: c.shortUrl, act: c.dateLastActivity, sinMarca: !b.marca })); }));
  const revisor = cat.equipo.filter(p => /direcc|creativ/i.test(p.rol))[0];
  if (!revisor) { console.log('No hay nadie con rol Dirección/Creativo en la pestaña Equipo'); return; }
  const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json');
  const enSnap = {}; (snap.cards || []).forEach(c => { if (c.cat === 'pieza') enSnap[c.id] = c; });
  const pn = panel_(revisor.clave), visto = {};
  (pn.cards || []).forEach(c => { if (c.cat === 'pieza' && c.etapa === 'revision') visto[c.id] = 1; });
  const faltan = enTrello.filter(c => !visto[c.id]);
  console.log('Revisa: ' + revisor.nombre + ' · lectura de Trello del panel: ' + snap.generado);
  console.log('En revisión en Trello AHORA: ' + enTrello.length + ' · el panel le muestra: ' + Object.keys(visto).length + ' · FALTAN: ' + faltan.length);
  if (sinMarca.length) console.log('Tableros que el panel NO lee porque no reconoce la marca: ' + sinMarca.join(', '));
  const motivos = {};
  faltan.forEach(c => {
    const s = enSnap[c.id];
    const m = c.sinMarca ? 'el tablero no tiene marca reconocida' : !s ? (new Date(c.act) > new Date(snap.generado) ? 'se movió después de la última lectura (aparece en la próxima)' : 'no está en la lectura guardada') :
      s.etapa !== 'revision' ? 'en la lectura figuraba en "' + s.lista + '"' : s.salio ? 'la tarjeta de SCL ya figura como publicada/programada (regla "ya salió")' :
      /^https?:\/\/trello\.com\/c\//.test(s.n) ? 'no se encontró la tarjeta original de SCL (el título quedó como link)' : 'otro motivo';
    (motivos[m] = motivos[m] || []).push(c.tablero + ' · ' + (s && s.n ? s.n : c.n).slice(0, 60) + ' · ' + c.url);
  });
  Object.keys(motivos).forEach(m => { console.log('MOTIVO: ' + m + ' (' + motivos[m].length + ')'); motivos[m].slice(0, 12).forEach(x => console.log('   ' + x)); });
  // al revés: lo que el panel muestra y ya no está en revisión
  const ids = {}; enTrello.forEach(c => ids[c.id] = 1);
  const sobran = (pn.cards || []).filter(c => c.cat === 'pieza' && c.etapa === 'revision' && !ids[c.id]);
  console.log('El panel muestra y ya NO están en revisión: ' + sobran.length + (sobran.length ? ' → ' + sobran.slice(0, 8).map(c => c.tablero + ' · ' + c.n.slice(0, 40)).join(' | ') : ''));
}

/* ---------------- revisión EN VIVO ----------------
   Lo que está AHORA en "En revisión" de cada tablero de Diseño y Producción, leído directo de Trello.
   La web lo pide al abrir la vista de quien revisa, así una pieza recién movida aparece al momento
   (sin esperar la lectura general de cada 10 minutos). Si un tablero no responde, se informa cuál. */
function revisionViva_() {
  const c = CacheService.getScriptCache();
  let tabs = null; try { tabs = JSON.parse(c.get('tabsRev') || 'null'); } catch (e) {}
  if (!tabs) {
    const cat = catalogo_();
    tabs = trello_('/members/me/boards', { filter: 'open', fields: 'name,shortUrl' })
      .map(b => ({ id: b.id, nombre: b.name, url: b.shortUrl, tipo: tipoTablero_(b.name), marca: marcasEn_(b.name.replace(/^\S+\s*/, ''), cat.marcas)[0] || '' }))
      .filter(b => (b.tipo === 'diseno' || b.tipo === 'produccion') && b.marca);
    c.put('tabsRev', JSON.stringify(tabs), 3600);
  }
  const res = trelloVarios_(tabs.map(b => '/boards/' + b.id + '/lists?filter=open&fields=name&cards=open&card_fields=name,due,dueComplete,start,shortUrl,dateLastActivity,labels'));
  const cards = [], fallas = [];
  tabs.forEach((b, i) => {
    if (res[i] == null) { fallas.push(b.nombre); return; }
    res[i].forEach(l => {
      const n = norm_(l.name); if (!/revisi/.test(n)) return;
      (l.cards || []).forEach(k => cards.push({
        id: k.id, n: k.name, d: '', due: k.due, dc: !!k.dueComplete, ini: k.start, lista: l.name, cat: 'pieza', etapa: 'revision',
        formato: /histori/.test(n) ? 'historia' : /reel|video/.test(n) ? 'reel' : b.tipo === 'produccion' ? 'video' : 'diseno',
        tipo: b.tipo, tablero: b.nombre, turl: b.url, url: k.shortUrl, act: k.dateLastActivity, lab: (k.labels || []).map(x => x.name).filter(Boolean), att: [], m: [b.marca]
      }));
    });
  });
  // el título de estas tarjetas es un link a la original de SCL: se trae la original para mostrar nombre, fecha de salida y etiquetas
  const conLink = cards.map(x => ({ x: x, s: (/trello\.com\/c\/([A-Za-z0-9]+)/.exec(x.n) || [])[1] })).filter(o => o.s);
  if (conLink.length) {
    const or = trelloVarios_(conLink.map(o => '/cards/' + o.s + '?fields=name,due,start,dueComplete,shortUrl,labels,closed&list=true&list_fields=name&board=true&board_fields=name'));
    conLink.forEach((o, i) => {
      const g = or[i], x = o.x;
      if (!g) { x.sinOrig = true; x.n = 'Pieza sin título (no encuentro la tarjeta original de SCL)'; return; }
      x.n = g.name; x.ourl = g.shortUrl; x.olista = ((g.board || {}).name || '') + ' · ' + ((g.list || {}).name || '') + (g.closed ? ' (archivada)' : '');
      x.entrega = g.start || null; x.salida = g.due || null;
      x.lab = x.lab.concat((g.labels || []).map(y => y.name).filter(y => y && x.lab.indexOf(y) < 0));
      const t = norm_(x.n + ' ' + x.lab.join(' '));
      if (x.formato === 'video') x.formato = /histori/.test(t) ? 'historia' : 'reel'; else if (x.formato === 'diseno' && /carrus/.test(t)) x.formato = 'carrusel';
    });
  }
  return { ok: true, leido: new Date().toISOString(), cards: cards, fallas: fallas, tableros: tabs.length };
}

/* Prueba de solo lectura de la revisión en vivo: cuántas piezas hay ahora en revisión y con qué título quedan. */
function probarRevisionViva() {
  const t0 = Date.now(), r = revisionViva_();
  console.log('Tableros leídos: ' + r.tableros + ' · sin respuesta: ' + (r.fallas.join(', ') || 'ninguno') + ' · piezas en revisión: ' + r.cards.length + ' · tardó ' + (Date.now() - t0) + ' ms');
  r.cards.forEach(c => console.log('   ' + c.tablero + ' · ' + c.formato + ' · ' + c.n.slice(0, 50) + (c.salida ? ' · sale ' + c.salida.slice(0, 10) : '') + (c.sinOrig ? ' · SIN ORIGINAL' : '')));
}

/* ---------------- web app ---------------- */
/* ---------------- calendario provisorio para el cliente (página de links de la marca) ----------------
   Lo que sale en los próximos días según el tablero SCL de la marca, con el estado de cada parte: copy, diseño, guion y video.
   No pide clave: solo devuelve tarjetas con fecha de publicación de esa marca (título, copy, adjuntos y estado), nunca comentarios
   ni otras marcas. Se guarda 10 minutos en caché para no pegarle a Trello en cada visita. */
function entregaDiseno_(salida) {
  // Las diseñadoras entregan en tandas: martes (lo que sale lun–mié de la semana siguiente) y jueves (lo que sale jue–dom).
  const d = new Date(Utilities.formatDate(new Date(salida), TZ, "yyyy-MM-dd'T'12:00:00"));
  const dia = d.getDay() || 7, lunes = new Date(d.getTime() - (dia - 1) * 864e5);
  return new Date(lunes.getTime() - 7 * 864e5 + (dia <= 3 ? 1 : 3) * 864e5);
}
function vistaCliente_(marca, dias) {
  marca = norm_(marca).replace(/[^a-z0-9]+/g, '-'); dias = Math.min(Math.max(Number(dias) || 15, 1), 31);
  const ck = 'cli:' + marca + ':' + dias, c0 = cacheGet_(ck);
  if (c0 && Date.now() - c0.t < 10 * 6e4) return c0.v;
  // Solo las marcas habilitadas (Config CLIENTE_MARCAS, separadas por coma; por defecto vice-burger): el resto no se muestra afuera.
  const habilitadas = String(config_().CLIENTE_MARCAS || 'vice-burger').split(',').map(x => norm_(x).replace(/[^a-z0-9]+/g, '-')).filter(Boolean);
  if (habilitadas.indexOf(marca) < 0) return { error: 'marca', mensaje: 'Marca no habilitada' };
  const cat = catalogo_();
  if (!cat.marcas.some(m => m.slug === marca)) return { error: 'marca', mensaje: 'Marca desconocida' };
  const boards = trello_('/members/me/boards', { filter: 'open', fields: 'name' })
    .map(b => ({ id: b.id, tipo: tipoTablero_(b.name), m: marcasEn_(b.name.replace(/^\S+\s*/, ''), cat.marcas)[0] }))
    .filter(b => b.m === marca && ['scl', 'diseno', 'produccion', 'guiones'].indexOf(b.tipo) >= 0);
  const rutas = [];
  boards.forEach(b => {
    rutas.push('/boards/' + b.id + '/lists?filter=open&fields=name');
    rutas.push('/boards/' + b.id + '/cards?filter=open&fields=name,desc,due,dueComplete,start,idList,shortUrl,labels&attachments=true&attachment_fields=id,name,url,mimeType,isUpload');
  });
  const sclIds = boards.filter(b => b.tipo === 'scl').map(b => b.id);
  sclIds.forEach(id => rutas.push('/boards/' + id + '/actions?filter=commentCard&limit=500&fields=data,date'));
  const res = trelloVarios_(rutas), porLink = {}, scl = [];
  const hoy = ymd_(new Date()), hasta = ymd_(new Date(Date.now() + dias * 864e5));
  // Conversación visible para el cliente: lo que mandó desde la página (💬 Cliente …) y lo que el equipo le responde empezando con "Para el cliente:".
  const coments = {};
  res.slice(boards.length * 2).forEach(acts => (acts || []).forEach(a => {
    const d = a.data || {}, t = String(d.text || ''), id = d.card && d.card.id; if (!id) return;
    const cli = /^💬 Cliente(?: \(([^)]*)\))?: ([\s\S]*)$/.exec(t), resp = /^para el cliente\s*:\s*([\s\S]*)$/i.exec(t);
    if (cli) (coments[id] = coments[id] || []).push({ de: 'cliente', q: cli[1] || 'Cliente', t: cli[2].slice(0, 1500), f: a.date, id: a.id });
    else if (resp) (coments[id] = coments[id] || []).push({ de: 'equipo', q: 'Ideamia', t: resp[1].slice(0, 1500), f: a.date, id: a.id });
  }));
  boards.forEach((b, i) => {
    const listas = {}; (res[i * 2] || []).forEach(l => listas[l.id] = l.name);
    (res[i * 2 + 1] || []).forEach(c => {
      const lista = listas[c.idList] || '';
      if (b.tipo === 'scl') { if (c.due) scl.push({ c: c, lista: lista }); return; }
      const m = /trello\.com\/c\/([A-Za-z0-9]+)/.exec(c.name); if (!m) return;
      (porLink[m[1]] = porLink[m[1]] || []).push({ tipo: b.tipo, lista: norm_(lista), due: c.due, att: c.attachments || [], id: c.id });
    });
  });
  const adj = (cardId, a) => ({ n: a.name, u: a.url, src: a.isUpload ? linkAdjunto_(cardId, a) : null,
    img: /^image\//.test(a.mimeType || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || ''), video: /^video\//.test(a.mimeType || '') || /\.(mp4|mov|webm)$/i.test(a.name || '') });
  const items = scl.filter(x => { const f = ymd_(new Date(x.c.due)); return f >= hoy && f <= hasta; }).map(x => {
    const c = x.c, l = norm_(x.lista), lab = (c.labels || []).map(y => y.name).filter(Boolean), labN = norm_(lab.join(' ')), link = String(c.shortUrl).split('/c/')[1];
    const rel = porLink[link] || [];
    const formato = /reel/.test(labN) ? 'Reel' : /carrus/.test(labN) ? 'Carrusel' : /histori/.test(labN) ? 'Historias' : /post|feed/.test(labN) ? 'Post' : 'Publicación';
    const publicado = /publicad|anterior/.test(l) || c.dueComplete, programado = /programad/.test(l);
    const copy = String(c.desc || '').trim();
    const partes = [];
    partes.push({ k: 'copy', estado: !copy ? 'falta' : /aprobad|programad|publicad/.test(l) ? 'listo' : /correc/.test(l) ? 'ajuste' : 'revision' });
    const dis = rel.filter(r => r.tipo === 'diseno')[0];
    if (dis || /diseno/.test(labN)) {
      const e = !dis ? 'pendiente' : /aprobad|termin|listo/.test(dis.lista) ? 'listo' : /revisi/.test(dis.lista) ? 'revision' : /redise|correc/.test(dis.lista) ? 'ajuste' : 'pendiente';
      partes.push({ k: 'diseno', estado: e, entrega: e === 'listo' || e === 'revision' ? null : (dis && dis.due) || entregaDiseno_(c.due).toISOString() });
    }
    const gui = rel.filter(r => r.tipo === 'guiones')[0];
    if (gui || /guion/.test(labN)) {
      const e = !gui ? 'pendiente' : /aprobad|termin/.test(gui.lista) ? 'listo' : /correc/.test(gui.lista) ? 'ajuste' : /revisi|listo/.test(gui.lista) ? 'revision' : 'pendiente';
      partes.push({ k: 'guion', estado: e, entrega: e === 'pendiente' ? c.start || null : null });
    }
    const vid = rel.filter(r => r.tipo === 'produccion')[0];
    if (vid || formato === 'Reel') {
      const e = !vid ? 'pendiente' : /listo|entreg|aprobad/.test(vid.lista) ? 'listo' : /revisi/.test(vid.lista) ? 'revision' : /correc/.test(vid.lista) ? 'ajuste' : 'produccion';
      partes.push({ k: 'video', estado: e, entrega: e === 'listo' || e === 'revision' ? null : (vid && vid.due) || null });
    }
    const archivos = (c.attachments || []).map(a => adj(c.id, a));
    rel.filter(r => r.tipo !== 'guiones' && !/pendiente|pedido/.test(r.lista)).forEach(r => r.att.forEach(a => archivos.push(Object.assign(adj(r.id, a), { de: r.tipo }))));
    return { n: c.name, salida: c.due, formato: formato, etiquetas: lab.filter(x => !/^\(i\)$|^diseno$|^guiones?$/i.test(norm_(x))),
      estado: publicado ? 'publicado' : programado ? 'programado' : partes.every(p => p.estado === 'listo') ? 'listo' : 'proceso',
      copy: copy.slice(0, 4000), partes: partes, archivos: archivos.slice(0, 12), url: c.shortUrl, id: c.id,
      comentarios: (coments[c.id] || []).sort((p, q) => p.f < q.f ? -1 : 1).slice(-20) };
  }).sort((a, b) => new Date(a.salida) - new Date(b.salida));
  const out = { ok: true, marca: marca, generado: new Date().toISOString(), dias: dias, items: items };
  cachePut_(ck, { t: Date.now(), v: out });
  return out;
}

/* Comentario del cliente desde la página de links: queda como comentario en la tarjeta de SCL ("💬 Cliente (nombre): …")
   y en la pestaña Registro. Solo se aceptan tarjetas que la página está mostrando, de marcas habilitadas, con un tope por hora. */
function comentarCliente_(b) {
  const marca = norm_(b.marca).replace(/[^a-z0-9]+/g, '-');
  const texto = String(b.texto || '').trim().slice(0, 1500), nombre = String(b.nombre || '').replace(/[()]/g, '').trim().slice(0, 40) || 'Cliente';
  if (!texto) return { error: 'datos', mensaje: 'Escribí el comentario' };
  // primero la vista que ya está en caché (la misma que vio la página): rearmarla lee todos los tableros y tarda más de 10 s
  const enCache = d => { const x = cacheGet_('cli:' + marca + ':' + d); return x && Date.now() - x.t < 60 * 6e4 ? (x.v.items || []).filter(i => i.id === b.cardId)[0] : null; };
  let it = enCache(15) || enCache(31);
  if (!it) {
    const vista = vistaCliente_(marca, 31);
    if (vista.error) return vista;
    it = (vista.items || []).filter(x => x.id === b.cardId)[0];
  }
  if (!it) return { error: 'tarjeta', mensaje: 'Esa publicación ya no está en el calendario' };
  const c = CacheService.getScriptCache(), tk = 'cli-tope:' + marca, n = Number(c.get(tk) || 0);
  if (n >= 30) return { error: 'tope', mensaje: 'Recibimos muchos comentarios seguidos. Probá de nuevo en un rato.' };
  c.put(tk, String(n + 1), 3600);
  const act = trello_('/cards/' + it.id + '/actions/comments', { text: '💬 Cliente (' + nombre + '): ' + texto }, 'post');
  // clave para poder editarlo o borrarlo después desde el mismo celular (acá se guarda solo su huella)
  const tok = Utilities.getUuid(); P.setProperty('cc:' + act.id, hash_(tok));
  try { registrar_('cliente', 'comentario', 'card:' + it.id, marca, 'comentó', (it.n + ' · ' + nombre + ': ' + texto).slice(0, 300), ''); } catch (e) {}
  // que la página lo muestre enseguida: se suma a la vista en caché en vez de borrarla (rearmarla tarda)
  tocarComentsCache_(marca, b.cardId, l => l.push({ de: 'cliente', q: nombre, t: texto, f: new Date().toISOString(), id: act.id }));
  return { ok: true, id: act.id, tok: tok };
}
/* Editar o borrar un comentario propio: solo con la clave que recibió el celular al mandarlo. */
function cambiarComentarioCliente_(b) {
  const id = String(b.id || ''), guardada = id && P.getProperty('cc:' + id);
  if (!guardada || hash_(String(b.tok || '')) !== guardada) return { error: 'permiso', mensaje: 'Solo se puede cambiar desde el celular que lo mandó' };
  const marca = norm_(b.marca).replace(/[^a-z0-9]+/g, '-');
  if (b.borrar) {
    trello_('/actions/' + id, {}, 'delete');
    P.deleteProperty('cc:' + id);
  } else {
    const texto = String(b.texto || '').trim().slice(0, 1500), nombre = String(b.nombre || '').replace(/[()]/g, '').trim().slice(0, 40) || 'Cliente';
    if (!texto) return { error: 'datos', mensaje: 'Escribí el comentario' };
    trello_('/actions/' + id, { text: '💬 Cliente (' + nombre + '): ' + texto }, 'put');
  }
  try { registrar_('cliente', 'comentario', 'accion:' + id, marca, b.borrar ? 'borró' : 'editó', String(b.texto || '').slice(0, 300), ''); } catch (e) {}
  tocarComentsCache_(marca, null, l => {
    const i = l.findIndex(m => m.id === id); if (i < 0) return;
    if (b.borrar) l.splice(i, 1); else { l[i].t = String(b.texto || '').trim().slice(0, 1500); l[i].ed = true; }
  });
  return { ok: true };
}
/* Cambia los comentarios de una tarjeta dentro de las vistas del cliente en caché (15 y 31 días), sin rearmarlas. */
function tocarComentsCache_(marca, cardId, fn) {
  ['cli:' + marca + ':15', 'cli:' + marca + ':31'].forEach(k => {
    const x = cacheGet_(k); if (!x || !x.v || !x.v.items) return;
    x.v.items.forEach(it => { if (!cardId || it.id === cardId) fn(it.comentarios = it.comentarios || []); });
    cachePut_(k, x);
  });
}

/* Burger del mes, cargada por el cliente desde la página (pestaña Anual). Cada mes es una tarjeta del tablero SCL de la marca,
   en la lista de Brainstorming / Campañas, llamada "Burger del mes · <Mes> <año>": la fecha de vencimiento es el día de lanzamiento
   y la descripción guarda nombre, ingredientes y notas. Así el equipo lo ve en Trello sin pasos extra. */
const MESES_ = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function tableroSclDe_(marca) {
  const cat = catalogo_();
  const b = trello_('/members/me/boards', { filter: 'open', fields: 'name' })
    .filter(x => tipoTablero_(x.name) === 'scl' && marcasEn_(x.name.replace(/^\S+\s*/, ''), cat.marcas)[0] === marca)[0];
  return b || null;
}
function burgersMes_(marca) {
  marca = norm_(marca).replace(/[^a-z0-9]+/g, '-');
  const habilitadas = String(config_().CLIENTE_MARCAS || 'vice-burger').split(',').map(x => norm_(x).replace(/[^a-z0-9]+/g, '-'));
  if (habilitadas.indexOf(marca) < 0) return { error: 'marca', mensaje: 'Marca no habilitada' };
  const ck = 'bm:' + marca, c0 = cacheGet_(ck); if (c0 && Date.now() - c0.t < 5 * 6e4) return c0.v;
  const b = tableroSclDe_(marca); if (!b) return { ok: true, meses: {} };
  const cards = trello_('/boards/' + b.id + '/cards', { filter: 'open', fields: 'name,desc,due,shortUrl' });
  const meses = {};
  cards.forEach(c => {
    const m = /^burger del mes · (\S+) (\d{4})$/i.exec(norm_(c.name)); if (!m) return;
    const mi = MESES_.indexOf(m[1]); if (mi < 0) return;
    const campo = k => { const r = new RegExp('^' + k + ':\\s*(.*)$', 'im').exec(c.desc || ''); return r ? r[1].trim() : ''; };
    meses[m[2] + '-' + String(mi + 1).padStart(2, '0')] = { hay: /^no$/i.test(campo('Hay')) ? 'no' : 'si', nombre: campo('Nombre'), ingredientes: campo('Ingredientes'), notas: campo('Notas'), fecha: c.due ? ymd_(new Date(c.due)) : '', url: c.shortUrl };
  });
  const out = { ok: true, meses: meses };
  cachePut_(ck, { t: Date.now(), v: out });
  return out;
}
function guardarBurgerMes_(b) {
  const marca = norm_(b.marca).replace(/[^a-z0-9]+/g, '-');
  const habilitadas = String(config_().CLIENTE_MARCAS || 'vice-burger').split(',').map(x => norm_(x).replace(/[^a-z0-9]+/g, '-'));
  if (habilitadas.indexOf(marca) < 0) return { error: 'marca', mensaje: 'Marca no habilitada' };
  const mm = /^(\d{4})-(\d{2})$/.exec(String(b.mes || '')); if (!mm) return { error: 'datos', mensaje: 'Mes inválido' };
  const nombre = String(b.nombre || '').trim().slice(0, 80), ingredientes = String(b.ingredientes || '').replace(/\s*\n\s*/g, ', ').trim().slice(0, 400), notas = String(b.notas || '').replace(/\s*\n\s*/g, ' ').trim().slice(0, 400);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha || '')) ? b.fecha : '';
  const hay = b.hay === 'no' ? 'no' : 'si'; // el cliente puede marcar que ese mes no hay burger del mes
  if (hay === 'si' && !nombre && !fecha) return { error: 'datos', mensaje: 'Poné al menos el nombre o la fecha' };
  if (fecha && fecha.slice(0, 7) !== b.mes) return { error: 'datos', mensaje: 'La fecha tiene que ser de ese mes' };
  const c = CacheService.getScriptCache(), tk = 'bm-tope:' + marca, n = Number(c.get(tk) || 0);
  if (n >= 40) return { error: 'tope', mensaje: 'Muchos cambios seguidos. Probá de nuevo en un rato.' };
  c.put(tk, String(n + 1), 3600);
  const tab = tableroSclDe_(marca); if (!tab) return { error: 'tablero', mensaje: 'No encuentro el tablero de la marca' };
  const listas = trello_('/boards/' + tab.id + '/lists', { filter: 'open', fields: 'name' });
  const lista = listas.filter(l => /brainstorm|campan/.test(norm_(l.name)))[0] || listas[0];
  const titulo = 'Burger del mes · ' + MESES_[+mm[2] - 1].charAt(0).toUpperCase() + MESES_[+mm[2] - 1].slice(1) + ' ' + mm[1];
  const desc = hay === 'no' ? 'Hay: no\n\nEste mes no hay burger del mes. (Cargado por el cliente desde la página de la marca.)'
    : 'Hay: si\nNombre: ' + nombre + '\nIngredientes: ' + ingredientes + '\nNotas: ' + notas + '\n\n(Cargado por el cliente desde la página de la marca.)';
  const due = hay === 'si' && fecha ?new Date(fecha + 'T20:00:00-03:00').toISOString() : '';
  const existe = trello_('/boards/' + tab.id + '/cards', { filter: 'open', fields: 'name' }).filter(x => norm_(x.name) === norm_(titulo))[0];
  let card;
  if (existe) card = trello_('/cards/' + existe.id, { desc: desc, due: due }, 'put');
  else card = trello_('/cards', { idList: lista.id, name: titulo, desc: desc, due: due, pos: 'top' }, 'post');
  try { registrar_('cliente', 'burger-del-mes', 'card:' + card.id, marca, existe ? 'editó' : 'cargó', (titulo + ' · ' + (hay === 'no' ? 'no hay' : nombre + (fecha ? ' · ' + fecha : ''))).slice(0, 300), ''); } catch (e) {}
  ['bm:' + marca].forEach(k => c.remove(k));
  return { ok: true, url: card.shortUrl };
}

function json_(o, cb) {
  const s = JSON.stringify(o);
  return cb ? ContentService.createTextOutput(cb + '(' + s + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
            : ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
function claveOk_(k, project) {
  const team = P.getProperty('TEAM_KEY'), proj = P.getProperty('PROJECT_KEY');
  if (project) return !proj || k === proj;
  return !team || k === team || (proj && k === proj);
}

function doGet(e) {
  const q = e.parameter || {};
  try {
    if (q.action === 'estado') { // diagnóstico: solo cantidades, nada de contenido ni claves
      const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json'), ia = leerJson_('IA_FILE_ID', 'panel-ideamia-ia.json'), t = {};
      (snap.cards || []).forEach(c => { const k = (c.m[0] || 'sin-marca') + ':' + c.cat; t[k] = (t[k] || 0) + 1; });
      return json_({ ok: true, generado: snap.generado || null, tableros: (snap.tableros || []).map(b => b.tipo + ' ' + b.nombre + ' → ' + (b.marca || '-')), tarjetas: (snap.cards || []).length, lecturasIA: Object.keys(ia).length, porMarca: t,
        reportesPendientes: (() => { try { return tareasReportes_('project', 'Project').map(r => r.k + ' · vence ' + r.vence); } catch (e) { return 'error: ' + e.message; } })(),
        conListas: (snap.tableros || []).filter(b => b.listas && b.listas.length).length,
        // a qué lista va una pieza al aprobarla o mandarla a corregir, por tablero (si dice FALTA, ese botón no anda en ese tablero)
        revision: (snap.tableros || []).filter(b => b.tipo === 'diseno' || b.tipo === 'produccion').map(b => { const ok = listaRevision_(b.listas, 'aprobar'), co = listaRevision_(b.listas, 'corregir'); return b.nombre + ' · aprobar → ' + (ok ? ok.n : 'FALTA') + ' · corregir → ' + (co ? co.n : 'FALTA'); }),
        claves: { trello: !!P.getProperty('TRELLO_TOKEN'), claude: !!P.getProperty('ANTHROPIC_KEY'), equipo: !!P.getProperty('TEAM_KEY'), project: !!P.getProperty('PROJECT_KEY'), discord: !!P.getProperty('DISCORD_TOKEN') },
        discord: (() => { const d = leerJson_('DISCORD_FILE_ID', 'panel-ideamia-discord.json'); return { generado: d.generado || null, canales: d.canales || 0, stats: d.stats || null, menciones: Object.keys(d.porPersona || {}).map(k => k + ':' + d.porPersona[k].length), error: (P.getProperty('DISCORD_ERROR') || '').replace(/[A-Za-z0-9_.-]{24,}/g, '…') || null }; })() }, q.cb);
    }
    if (q.action === 'equipo') return json_({ ok: true, equipo: equipo_() }, q.cb);
    if (q.action === 'cliente') return json_(vistaCliente_(q.marca, q.dias), q.cb); // calendario provisorio de una marca (página de links del cliente)
    if (q.action === 'burgersMes') return json_(burgersMes_(q.marca), q.cb); // burger del mes cargada por el cliente (pestaña Anual)
    if (q.action === 'revision') { // lo que está en revisión AHORA (para quien revisa): lectura directa de Trello
      if (!claveOk_(q.k)) return json_({ error: 'clave', mensaje: 'Clave del equipo incorrecta' }, q.cb);
      try { return json_(revisionViva_(), q.cb); } catch (e) { return json_({ error: 'trello', mensaje: 'No se pudo leer Trello en vivo: ' + String(e.message || e).slice(0, 200) }, q.cb); }
    }
    if (q.action === 'mio') { // solo el tablero Project del project (para refrescar "Mi día" sin recargar todo)
      if (!claveOk_(q.k, true)) return json_({ error: 'clave', mensaje: 'Clave del project incorrecta' }, q.cb);
      try { return json_({ ok: true, mio: miTablero_() }, q.cb); } catch (e) { return json_({ error: 'trello', mensaje: 'No se pudo leer el tablero Project: ' + String(e.message || e).slice(0, 200) }, q.cb); }
    }
    if (q.action === 'project') {
      if (!claveOk_(q.k, true)) return json_({ error: 'clave', mensaje: 'Clave del project incorrecta' }, q.cb);
      return json_(vistaProject_(), q.cb);
    }
    if (!claveOk_(q.k)) return json_({ error: 'clave', mensaje: 'Clave del equipo incorrecta' }, q.cb);
    const pn = aplicarEstados_(base_(q.p), estados_());
    if (pn && pn.ok) { const sn = leerSnapLiviano_(); pn.estadoDatos = { generado: sn.generado, incompletos: sn.fallas, falla: JSON.parse(P.getProperty('ULTIMA_FALLA') || 'null') }; }
    return json_(pn, q.cb);
  } catch (err) { return json_({ error: 'servidor', mensaje: String(err.message || err) }, q.cb); }
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (x) { return json_({ error: 'json' }); }
  try {
    if (b.action === 'comentarCliente') return json_(comentarCliente_(b)); // página de links del cliente: no lleva clave
    if (b.action === 'cambiarComentarioCliente') return json_(cambiarComentarioCliente_(b)); // editar/borrar: pide la clave de ese comentario
    if (b.action === 'guardarBurgerMes') return json_(guardarBurgerMes_(b)); // el cliente define la burger del mes desde la página
    if (!claveOk_(b.k)) return json_({ error: 'clave', mensaje: 'Clave incorrecta' });
    const quien = String(b.persona || '');
    switch (b.action) {
      case 'marcar': // rutina / evento / input / corrección
        registrar_(quien, b.tipo, b.clave, b.marca, b.estado, b.detalle, b.periodo);
        return json_({ ok: true });
      case 'agendar': { // reunión con fecha y hora; opcionalmente crea el evento en el calendario de Ideamia
        let detalle = b.fecha + ' ' + (b.hora || '') + (b.nota ? ' · ' + b.nota : '');
        if (b.crearEvento) {
          const cfg = config_(), cal = CalendarApp.getCalendarById(cfg.CALENDAR_ID || 'estudioideamia@gmail.com');
          const ini = new Date(b.fecha + 'T' + (b.hora || '10:00') + ':00-03:00');
          const yoMail = (catalogo_().equipo.filter(p => p.clave === norm_(quien))[0] || {}).email;
          const ev = cal.createEvent(b.titulo, ini, new Date(ini.getTime() + (Number(b.duracion) || 45) * 6e4), Object.assign({ description: 'Agendada desde el Panel Ideamia por ' + quien + (b.nota ? '\n' + b.nota : '') }, yoMail ? { guests: yoMail, sendInvites: true } : {}));
          detalle += ' · evento creado';
          registrar_(quien, 'reunion', b.clave, b.marca, 'agendada', detalle, b.periodo);
          return json_({ ok: true, evento: ev.getId() });
        }
        registrar_(quien, 'reunion', b.clave, b.marca, 'agendada', detalle, b.periodo);
        return json_({ ok: true });
      }
      case 'archivar': // input que ya no se necesita → se archiva en Trello (se puede recuperar desde "Elementos archivados")
        trello_('/cards/' + b.cardId, { closed: 'true' }, 'put');
        registrar_(quien, 'input', 'inp:' + b.cardId, b.marca, 'archivado', b.nombre || '', '');
        CacheService.getScriptCache().remove('snap');
        quitarDeSnapshot_(b.cardId);
        return json_({ ok: true });
      case 'actualizar':
        try { return json_(actualizar(true)); } catch (e) { return json_({ error: 'trello', mensaje: 'No se pudo leer Trello: ' + String(e.message || e).slice(0, 200) }); }
      case 'pedidoRapido': // carga rápida del project: solo con su clave
        if (!claveOk_(b.k, true)) return json_({ error: 'clave', mensaje: 'Esto es solo para el project' });
        return json_(pedidoRapido_(b));
      case 'crearTarjeta': { // crea la tarjeta en Trello (y opcionalmente la manda a otra lista, que es lo que dispara las automatizaciones)
        if (!b.listId || !b.nombre) return json_({ error: 'datos', mensaje: 'Falta el nombre o la lista' });
        const q = { idList: b.listId, name: String(b.nombre).slice(0, 300), desc: String(b.desc || '').slice(0, 1500), pos: 'top' };
        if (b.due) q.due = b.due;
        if (b.labels && b.labels.length) q.idLabels = b.labels.join(',');
        const card = trello_('/cards', q, 'post');
        if (b.moverA) trello_('/cards/' + card.id, Object.assign({ idList: b.moverA }, b.moverBoard ? { idBoard: b.moverBoard } : {}), 'put');
        if (b.inputId) registrar_(quien, 'input', 'inp:' + b.inputId, b.marca, 'procesado', 'tarjeta creada: ' + card.shortUrl, '');
        registrar_(quien, 'tarjeta', 'card:' + card.id, b.marca, 'creada', String(b.nombre).slice(0, 120) + ' · ' + card.shortUrl, '');
        return json_({ ok: true, url: card.shortUrl, id: card.id });
      }
      case 'verTarjeta': { // contenido de una pieza para revisarla: la tarjeta de Diseño/Producción y la original de SCL
        const ver = id => { if (!id) return null; try {
          const c = trello_('/cards/' + id, { fields: 'name,desc,due,shortUrl', attachments: 'true', attachment_fields: 'id,name,url,mimeType,isUpload,bytes,previews', actions: 'commentCard', actions_limit: 6, action_fields: 'data,date', action_memberCreator_fields: 'fullName' });
          return { id: c.id, n: c.name, d: String(c.desc || '').slice(0, 2500), due: c.due, url: c.shortUrl,
            att: (c.attachments || []).slice(0, 12).map(a => ({ id: a.id, card: c.id, n: a.name, u: a.url, mime: a.mimeType || '', subido: !!a.isUpload, src: linkAdjunto_(c.id, a),
              ver: !!a.isUpload && (/^image\//.test(a.mimeType || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || '') || (a.previews || []).length > 0),
              video: /^video\//.test(a.mimeType || '') || /\.(mp4|mov|webm)$/i.test(a.name || '') })),
            com: (c.actions || []).map(a => ({ t: (a.data || {}).text || '', f: a.date, q: (a.memberCreator || {}).fullName || '' })) };
        } catch (e) { return null; } };
        const orig = /trello\.com\/c\/([A-Za-z0-9]+)/.exec(String(b.origUrl || ''));
        return json_({ ok: true, pieza: ver(b.cardId), original: orig ? ver(orig[1]) : null });
      }
      case 'adjunto': { // previsualización de un archivo subido a Trello (Trello no lo muestra sin estar logueado): se baja con la clave y va como imagen
        const k = P.getProperty('TRELLO_KEY'), tk = P.getProperty('TRELLO_TOKEN');
        const a = trello_('/cards/' + b.cardId + '/attachments/' + b.attId, { fields: 'name,url,mimeType,isUpload,bytes,previews' });
        if (!a || !a.isUpload) return json_({ ok: false });
        const esImg = /^image\//.test(a.mimeType || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || '');
        // la vista previa más grande que no pase de ~1000 px; si es una imagen liviana, el archivo original
        const prev = (a.previews || []).filter(p => p.width <= 1100).sort((x, y) => y.width - x.width)[0];
        const url = prev ? prev.url : (esImg && (a.bytes || 0) < 4e6 ? a.url : null);
        if (!url) return json_({ ok: false });
        const r = UrlFetchApp.fetch(url, { headers: { Authorization: 'OAuth oauth_consumer_key="' + k + '", oauth_token="' + tk + '"' }, muteHttpExceptions: true });
        if (r.getResponseCode() !== 200) return json_({ ok: false });
        const blob = r.getBlob(), tipo = blob.getContentType() || (prev ? 'image/png' : a.mimeType);
        return json_({ ok: true, data: 'data:' + tipo + ';base64,' + Utilities.base64Encode(blob.getBytes()) });
      }
      case 'comentarTarjeta': { // comentario suelto en la tarjeta (sin moverla)
        if (!String(b.texto || '').trim()) return json_({ error: 'datos', mensaje: 'Escribí el comentario' });
        const hecho = trello_('/cards/' + b.cardId + '/actions/comments', { text: ('💬 ' + nombreDe_(quien) + ': ' + String(b.texto).trim()).slice(0, 16000) }, 'post');
        registrar_(quien, 'revision', 'card:' + b.cardId, b.marca, 'comentó', String(b.nombre || '').slice(0, 80) + ' · ' + String(b.texto).slice(0, 150), '');
        return json_({ ok: true, pasos: [hecho && hecho.id ? 'Comentario puesto en la tarjeta de Trello' + (b.tablero ? ' de ' + b.tablero : '') : 'Trello no confirmó el comentario: revisalo en la tarjeta'] });
      }
      case 'revisarPieza': { // Ivo aprueba o manda a corregir: se mueve dentro del tablero de Diseño/Producción (y el comentario queda en la tarjeta)
        // el tablero se toma de la tarjeta misma (no de lo que mande la web)
        const card = trello_('/cards/' + b.cardId, { fields: 'idBoard,idList,name' });
        const listas = trello_('/boards/' + card.idBoard + '/lists', { fields: 'name' });
        const dest = listaRevision_(listas, b.accion === 'aprobar' ? 'aprobar' : 'corregir');
        const firma = nombreDe_(quien), coment = String(b.comentario || '').trim(), pasos = [], donde = b.tablero ? ' de ' + b.tablero : '';
        // primero el comentario: aunque después falle el movimiento, lo que escribió Ivo queda en Trello
        if (coment || b.accion === 'aprobar') {
          try { trello_('/cards/' + b.cardId + '/actions/comments', { text: ((b.accion === 'aprobar' ? '✅ Aprobado por ' + firma + (coment ? ': ' : '') : '✏️ Para corregir (' + firma + '): ') + coment).slice(0, 16000) }, 'post'); }
          catch (e) { return json_({ error: 'comentario', mensaje: 'No se pudo poner el comentario en Trello y no se tocó nada de la tarjeta: ' + String(e.message).slice(0, 150) }); }
          pasos.push('Comentario puesto en la tarjeta de Trello' + donde);
        }
        if (!dest) return json_({ error: 'lista', pasos: pasos, mensaje: (pasos.length ? 'El comentario SÍ quedó en Trello, pero la tarjeta no se movió: ' : 'La tarjeta no se movió: ') + 'no encontré la lista ' + (b.accion === 'aprobar' ? 'de aprobados' : 'de correcciones') + ' en ese tablero (tiene: ' + listas.map(l => l.name).join(', ') + ').' });
        if (dest.id !== card.idList) {
          let movida = null;
          try { movida = trello_('/cards/' + b.cardId, { idList: dest.id }, 'put'); } catch (e) { return json_({ error: 'mover', pasos: pasos, mensaje: (pasos.length ? 'El comentario SÍ quedó en Trello, pero ' : '') + 'no se pudo mover la tarjeta a "' + dest.name + '": ' + String(e.message).slice(0, 150) }); }
          if (!movida || movida.idList !== dest.id) return json_({ error: 'mover', pasos: pasos, mensaje: (pasos.length ? 'El comentario SÍ quedó en Trello, pero ' : '') + 'Trello no confirmó el cambio de lista. Revisala en Trello.' });
        }
        pasos.push('Tarjeta movida a "' + dest.name + '"' + donde);
        registrar_(quien, 'revision', 'card:' + b.cardId, b.marca, b.accion === 'aprobar' ? 'aprobado' : 'a corregir', String(b.nombre || '').slice(0, 100) + (coment ? ' · ' + coment.slice(0, 150) : ''), '');
        quitarDeSnapshot_(b.cardId);
        return json_({ ok: true, lista: dest.name, pasos: pasos });
      }
      case 'moverTarjeta': // mueve una tarjeta a otra lista o a otro tablero
        trello_('/cards/' + b.cardId, Object.assign({ idList: b.listId }, b.boardId ? { idBoard: b.boardId } : {}), 'put');
        registrar_(quien, 'tarjeta', 'card:' + b.cardId, b.marca, 'movida', String(b.nombre || '').slice(0, 100) + ' → ' + (b.destino || ''), '');
        quitarDeSnapshot_(b.cardId);
        return json_({ ok: true });
    }
    return json_({ error: 'accion' });
  } catch (err) { return json_({ error: 'servidor', mensaje: String(err.message || err) }); }
}

function quitarDeSnapshot_(cardId) {
  const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json');
  if (snap.cards) { snap.cards = snap.cards.filter(c => c.id !== cardId); guardarJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json', snap); }
  // también de los paneles ya armados de cada persona: si no, la tarjeta vuelve a aparecer hasta la próxima actualización
  try {
    const bases = leerJson_('BASES_FILE_ID', 'panel-ideamia-bases.json'); let cambio = false;
    Object.keys(bases).forEach(k => {
      const b = bases[k]; if (!b || !b.cards) return;
      const n = b.cards.length; b.cards = b.cards.filter(c => c.id !== cardId);
      if (b.cards.length !== n) { cambio = true; cachePut_('base:' + k, b); }
    });
    if (cambio) guardarJson_('BASES_FILE_ID', 'panel-ideamia-bases.json', bases);
  } catch (e) {}
}

/* Link firmado para ver un adjunto de Trello (imagen o video) a través del puente de Cloudflare, sin estar logueado en Trello.
   El puente verifica la firma con la misma CLAVE y baja el archivo con las claves de Trello que tiene guardadas. Vence a las 6 horas. */
function linkAdjunto_(cardId, a) {
  const cfg = config_(), puente = String(cfg.DISCORD_PUENTE || '').trim().replace(/\/+$/, ''), clave = P.getProperty('DISCORD_PUENTE_CLAVE');
  if (!puente || !clave || !a.isUpload) return null;
  const exp = Math.floor(Date.now() / 1000) + 6 * 3600;
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(cardId + '|' + a.id + '|' + exp, clave)).replace(/=+$/, '');
  const nombre = String(a.url || '').split('/').pop() || encodeURIComponent(a.name || 'archivo');
  return puente + '/trello/att/' + cardId + '/' + a.id + '/' + exp + '/' + sig + '?n=' + nombre;
}
