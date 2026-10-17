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
    .addSeparator()
    .addItem('Cargar la clave de Gemini (reuniones)', 'cargarClaveGemini')
    .addItem('Cargar el webhook de reuniones', 'cargarWebhookReuniones')
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
  // canales donde el bot no tiene permiso: no se vuelven a pedir hasta mañana (eran 43 pedidos perdidos en cada lectura)
  let sinP = {}; try { const g = JSON.parse(P.getProperty('DISCORD_SIN_PERMISO') || '{}'); if (g.t && Date.now() - g.t < 24 * 36e5) sinP = g; } catch (e) {}
  const vedados = {}; (sinP.ids || []).forEach(id => vedados[id] = 1); const nuevosVedados = [];
  const nombres = {}; canales.concat(hilos).forEach(c => nombres[c.id] = c.name);
  const todos = canales.concat(hilos).filter(c => !vedados[c.id]);
  PEDIDOS_ += 2 + todos.length;
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
      const ch = lote[j];
      if (r.getResponseCode() === 403) nuevosVedados.push(ch.id);
      if (r.getResponseCode() !== 200) return; // canal sin permiso para el bot
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
  if (nuevosVedados.length || !sinP.t) P.setProperty('DISCORD_SIN_PERMISO', JSON.stringify({ t: sinP.t || Date.now(), ids: (sinP.ids || []).concat(nuevosVedados) }).slice(0, 8900));
  return { generado: new Date().toISOString(), canales: todos.length, sinPermiso: (sinP.ids || []).length + nuevosVedados.length, stats: st, porPersona: out };
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
    ['DISENO_FUERA', 'upper', 'Marcas cuyo diseño no lo revisa el estudio: su tablero de Diseño no aparece en el panel (separadas por coma)'],
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
  PEDIDOS_++;
  const r = UrlFetchApp.fetch(url, op);
  if (r.getResponseCode() >= 300) throw new Error('Trello ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
  return JSON.parse(r.getContentText());
}
/* Dónde se escribe un comentario para que se VEA. En Diseño y Producción muchas tarjetas son "espejo": su nombre es el link a la tarjeta
   original de SCL, y Trello al abrirlas muestra la original. Un comentario puesto en el espejo queda guardado pero nadie lo ve,
   así que se pone en la original. Si la tarjeta no es espejo (o no se puede leer), se usa la misma. */
function tarjetaQueSeVe_(cardId, nombre) {
  try {
    if (nombre == null) nombre = (trello_('/cards/' + cardId, { fields: 'name' }) || {}).name;
    const m = /^\s*https?:\/\/trello\.com\/c\/([A-Za-z0-9]+)/.exec(String(nombre || ''));
    return m ? m[1] : cardId;
  } catch (e) { return cardId; }
}
/* Listas a donde va una pieza al revisarla. Cada tablero las llama distinto:
   Diseño → "Aprobado" / "Rediseñar"; Producción → "Material Listo para Entregar" / "Correccion". */
const LISTA_REVISION = { aprobar: [/aprobad/, /listo para entregar/, /material listo/, /^listo/], corregir: [/correc/, /redise/, /rehacer/, /cambios/] };
function listaRevision_(listas, accion) {
  const pats = LISTA_REVISION[accion] || [];
  for (let i = 0; i < pats.length; i++) { const l = (listas || []).filter(x => pats[i].test(norm_(x.name || x.n || '')))[0]; if (l) return l; }
  return null;
}
/* Google permite 20.000 pedidos a otros servicios por día: se cuentan para poder verlo en ?action=estado. */
let PEDIDOS_ = 0;
function anotarUso_(seg, etapas) {
  try {
    const hoy = ymd_(new Date()); let u = {}; try { u = JSON.parse(P.getProperty('USO_DIA') || '{}'); } catch (e) {}
    if (u.dia !== hoy) u = { dia: hoy, pedidos: 0, lecturas: 0, seg: 0, ayer: u.dia ? { dia: u.dia, pedidos: u.pedidos, lecturas: u.lecturas, seg: u.seg } : null };
    u.pedidos += PEDIDOS_; u.lecturas++; u.seg += Math.round(seg); u.ultima = { pedidos: PEDIDOS_, seg: Math.round(seg), etapas: (etapas || []).join(" · ") };
    P.setProperty('USO_DIA', JSON.stringify(u)); PEDIDOS_ = 0;
  } catch (e) {}
}
/* Trello permite ~100 pedidos cada 10 s por token: se leen en tandas de 25 con una pausa entre tandas. */
function trelloVarios_(rutas) {
  const k = P.getProperty('TRELLO_KEY'), tk = P.getProperty('TRELLO_TOKEN');
  const out = rutas.map(() => null), codigo = {};
  const pedir = idx => {
    for (let i = 0; i < idx.length; i += 25) {
      if (i) Utilities.sleep(3000);
      const tanda = idx.slice(i, i + 25);
      PEDIDOS_ += tanda.length;
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
  // "Para más adelante": cosas guardadas para después (no cuentan como pendientes ni le aparecen a quien produce).
  // "Datos de la marca": cumpleaños, horarios, contactos (información, no archivos).
  if (/mas adelante|stand ?by/.test(n)) return 'standby';
  // "Para mover en el mes": inputs que no se archivan porque se siguen usando durante el mes (salen de Inputs y dejan de pedir revisión).
  if (/mover en el mes/.test(n)) return 'mover';
  if (/^datos\b/.test(n)) return 'datos';
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
  // marcas cuyo diseño no lo hace ni lo revisa el estudio: su tablero de Diseño existe en Trello pero el panel no lo mira
  // (no aparece en la revisión de dirección ni en los avisos). Config DISENO_FUERA, separadas por coma; por defecto Upper.
  const cfgT = config_(), fuera = marcasEn_(String(cfgT.DISENO_FUERA == null || cfgT.DISENO_FUERA === '' ? 'upper' : cfgT.DISENO_FUERA).replace(/,/g, ' '), cat.marcas);
  boards.forEach(b => {
    const tipo = tipoTablero_(b.name);
    const esProject = norm_(b.name) === 'project';
    if (!tipo && !esProject) return;
    const marcas = esProject ? [] : marcasEn_(b.name.replace(/^\S+\s*/, ''), cat.marcas);
    if (!esProject && !marcas.length) return;
    if (tipo === 'diseno' && fuera.indexOf(marcas[0]) >= 0) return;
    elegidos.push({ id: b.id, nombre: b.name, url: b.shortUrl, tipo: esProject ? 'project' : tipo, marca: marcas[0] || '' });
  });
  // Lectura unida: un solo pedido por tablero (listas, etiquetas y tarjetas juntas) en vez de dos. Se enciende sola cuando
  // probarLecturaUnida() comprueba que trae exactamente lo mismo (propiedad LECTURA_UNIDA).
  const unida = P.getProperty('LECTURA_UNIDA') === 'si', rutas = [];
  elegidos.forEach(b => {
    if (unida) { rutas.push(RUTA_TABLERO_(b.id)); return; }
    rutas.push('/boards/' + b.id + '?fields=name&lists=open&list_fields=name,pos&labels=all&label_fields=name,color&labels_limit=100');
    rutas.push('/boards/' + b.id + '/cards?filter=open&fields=name,desc,due,dueComplete,start,idList,shortUrl,dateLastActivity,labels&attachments=true&attachment_fields=name,url,mimeType');
  });
  const res = trelloVarios_(rutas);
  const cards = [], haceUnaSemana = Date.now() - 7 * 864e5, indice = {}, fallas = [];
  elegidos.forEach((b, i) => {
    const iA = unida ? i : i * 2, iB = unida ? i : i * 2 + 1, tarjetas = res[iB] == null ? null : unida ? (Array.isArray(res[iB].cards) ? res[iB].cards : null) : res[iB];
    // si Trello no devolvió este tablero (ni al reintentar), se avisa y después se conservan sus tarjetas de la lectura anterior
    if (res[iA] == null || tarjetas == null) { fallas.push(b.nombre + ' (Trello ' + ((res[iA] == null ? res.codigos[iA] : res.codigos[iB]) || 'sin respuesta') + ')'); b.fallo = true; return; }
    const info = res[iA] || {}, listas = {};
    (info.lists || []).forEach(l => listas[l.id] = l);
    // listas y etiquetas del tablero: para crear y mover tarjetas desde el panel
    b.listas = (info.lists || []).map(l => ({ id: l.id, n: l.name, cat: catLista_(l.name) }));
    b.etiquetas = (info.labels || []).map(x => ({ id: x.id, n: x.name || '', c: x.color || '' }));
    tarjetas.forEach(c => {
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
      const conAdjuntos = catL === 'recursos' || catL === 'fichas' || catL === 'input' || catL === 'datos';
      const conDesc = ['input', 'brainstorming', 'efem', 'corr', 'urgente', 'datos', 'standby', 'mover'].indexOf(catL) >= 0 || b.tipo === 'project';
      cards.push({
        id: c.id, n: c.name, d: conDesc ? String(c.desc || '').slice(0, catL === 'datos' ? 4000 : 700) : (catL === 'recursos' || catL === 'fichas' ? String(c.desc || '').slice(0, 200) : ''), due: c.due, dc: !!c.dueComplete, ini: c.start,
        lista: l.name, cat: catL, tipo: b.tipo, tablero: b.nombre, turl: b.url, url: c.shortUrl, act: c.dateLastActivity,
        lab: (c.labels || []).map(x => x.name).filter(Boolean),
        att: conAdjuntos ? (c.attachments || []).slice(0, 8).map(a => ({ n: a.name, u: a.url })) : [],
        m: b.tipo === 'project' ? marcasEn_(c.name + ' ' + (c.labels || []).map(x => x.name).join(' '), cat.marcas) : [b.marca]
      });
    });
  });
  // Historial de las piezas (para Ivo): cuándo se cargó la tarjeta en Diseño/Producción, cuándo le pusieron fecha de salida
  // a la tarjeta de SCL (y para qué día) y cuándo la movieron por última vez. Últimos 21 días de actividad de esos tableros.
  // Se vuelve a pedir cada media hora (son 27 pedidos): entre medio se usa lo guardado.
  let hist = {}, histGuardado = null;
  try { histGuardado = leerJson_('HIST_FILE_ID', 'panel-ideamia-historial.json'); } catch (e) {}
  if (histGuardado && histGuardado.t && Date.now() - histGuardado.t < 28 * 6e4 && histGuardado.h) hist = histGuardado.h;
  else try {
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
    // solo se guarda si respondieron todos los tableros; si no, se reintenta en la próxima lectura
    if (acts.every(x => x != null)) guardarJson_('HIST_FILE_ID', 'panel-ideamia-historial.json', { t: Date.now(), h: hist });
    else if (histGuardado && histGuardado.h) Object.keys(histGuardado.h).forEach(k => { if (!hist[k]) hist[k] = histGuardado.h[k]; });
  } catch (e) { if (histGuardado && histGuardado.h) hist = histGuardado.h; }
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
    // si en SCL la guardaron en "Para más adelante", no es un pendiente: no le aparece a quien produce ni a quien revisa, ni se avisa
    c.standby = /mas adelante|stand ?by/.test(norm_(orig.lista));
    if (c.standby) c.salio = true;
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
  ['pautables', 'Definir con Ads qué contenidos se pautan el mes que viene', 'mes:ultima-semana', 'no', 'SM', 'Llevalo a la reunión con Ads: qué piezas se pautan y con qué objetivo cada una.', ''],
  ['produccion-trimestre', '¿Ya fuiste a una producción este trimestre?', 'meses:3,6,9,12/1-20', 'no', 'SM', 'Es obligatoria una por trimestre, para conocer el espacio y acompañar la producción. Coordinala con Bauti.', ''],
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
  // privados de Discord: un interruptor general y el ID de cada persona (los mismos que usan las menciones de Make)
  [['PRIVADOS_DISCORD', 'si', 'Avisos por privado de Discord (inputs, CM, entregas atrasadas). Poné no para apagarlos todos.'],
    ['DISCORD_ID_ORNE', '752895683899686914', 'ID de Discord de Orne: privado cuando le cargan un input con Pedido del cliente o Urgente.'],
    ['DISCORD_ID_RAMA', '292495762225364993', 'ID de Discord de Rama: privado cuando le cargan un input con Pedido del cliente o Urgente.'],
    ['DISCORD_ID_ALE', '1503387898643484714', 'ID de Discord de Ale: privado con cada pieza que entra a sus tableros de CM (qué es, cuándo sale, si es programable).']
  ].forEach(fila => { if (cf && rows_('Config').map(r => r[0]).indexOf(fila[0]) < 0) cf.appendRow(fila); });
  if (cf && rows_('Config').map(r => r[0]).indexOf('DISCORD_ID_BAUTI') < 0) cf.appendRow(['DISCORD_ID_BAUTI', '1390450103059349526', 'ID de Discord de Bauti: para el recordatorio por privado cuando no va a la reunión de guiones. Vacío = no se le escribe.']);
  // resumen de guiones en el canal del departamento
  [['GUIONES_CANAL', '', 'ID del canal de Discord donde sale el resumen de la reunión de guiones (clic derecho en el canal → Copiar ID del canal). Vacío = depto-guiones.'],
    ['GUIONES_RESUMEN_DIAS', 'lunes,viernes', 'Días en que sale a la mañana el resumen de guiones (qué hay para ver, qué debe entregar Fede y quién presenta ideas).'],
    ['DISCORD_ID_FEDE', '466080124303835147', 'ID de Discord de Fede (guiones): se lo arroba en el resumen de guiones.']
  ].forEach(fila => { if (cf && rows_('Config').map(r => r[0]).indexOf(fila[0]) < 0) cf.appendRow(fila); });
  if (eqs && rows_('Equipo').map(r => norm_(r[1])).indexOf('bauti') < 0) eqs.appendRow(['Bauti', 'bauti', 'Filmmaker', 'bauti, bautista']);
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
  const T0_ = Date.now(), etapas_ = [], tk_ = n => etapas_.push(n + " " + Math.round((Date.now() - T0_) / 1000) + "s/" + PEDIDOS_); PEDIDOS_ = 0;
  try {
    // recién actualizado (por el disparador o por otra persona): no se vuelve a leer todo
    if (desdeWeb) { try { const s = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json'), g = new Date(s.generado || 0).getTime(); if (Date.now() - g < 60000) return { ok: true, reciente: true, generado: new Date(g).toISOString(), incompletos: s.fallas || [] }; } catch (e) {} }
    try { asegurarRutinas_(); } catch (e) {}
    const cat = catalogo_(), cfg = config_();
    tk_("inicio"); const snap = leerTrello_(cat); tk_("trello");
    // tableros que Trello no devolvió: se mantienen sus tarjetas de la lectura anterior (mejor algo un poco viejo que verlas desaparecer)
    if (snap.fallas.length) {
      const ant = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json');
      snap.tableros.filter(b => b.fallo).forEach(b => {
        (ant.cards || []).filter(c => c.tablero === b.nombre).forEach(c => snap.cards.push(c));
        const bt = (ant.tableros || []).filter(x => x.nombre === b.nombre)[0];
        if (bt) { b.listas = bt.listas; b.etiquetas = bt.etiquetas; }
      });
    }
    // filtro de CM y privados de Discord (antes de guardar: así la foto ya refleja a qué lista fue cada pieza). Si falla, no corta la actualización.
    try { privadosEnviar_(snap, cat, cfg); } catch (e) { P.setProperty('PRIVADOS_NOTAS', (new Date().toISOString() + ' · ERROR: ' + String(e.message || e)).slice(0, 900)); }
    try { adsPedidosAvisar_(cfg); } catch (e) { P.setProperty('ADS_NOTA', new Date().toISOString() + ' · ERROR: ' + String(e.message || e).slice(0, 200)); }
    // lista de tareas del mes para cada social media (una vez por mes, el primer día hábil)
    try { tareasDelMesEnviar_(cat, cfg, snap); } catch (e) {}
    // segundo aviso de inputs urgentes, aviso al project y resumen de los lunes
    try { seguimientoEnviar_(snap, cat, cfg); } catch (e) {}
    // calendario anual y OKR de cada marca: se releen solos una vez por semana (lo usa la pestaña Anual y el mensaje del mes)
    try { anualDatos_(snap, cat); } catch (e) {}
    tk_("privados"); snap.generado = new Date().toISOString();
    guardarJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json', snap);
    P.deleteProperty('ULTIMA_FALLA');
    CacheService.getScriptCache().put('snapinfo', JSON.stringify({ generado: snap.generado, fallas: snap.fallas }), 21600);
    // Lectura automática con la API de Claude: apagada salvo que Config → IA_AUTOMATICA diga "sí" (gasta créditos).
    if (si_(cfg.IA_AUTOMATICA)) recomendarTarjetas_(snap, cat, cfg);
    // Discord: menciones de cada uno (solo si hay bot y servidor cargados)
    // Se lee cada 20 minutos (desde el botón de la web, si pasaron 3) y nunca si la lectura de Trello ya vino lenta:
    // así una demora de Discord no corta la actualización por tiempo.
    const dcHace = Date.now() - Number(P.getProperty('DISCORD_T') || 0), vaLento = Date.now() - T0_ > 200000;
    if (!vaLento && dcHace > (desdeWeb ? 3 : 18) * 6e4) {
      try { const dc = leerDiscord_(cfg, cat); if (dc) { guardarJson_('DISCORD_FILE_ID', 'panel-ideamia-discord.json', dc); P.deleteProperty('DISCORD_ERROR'); } P.setProperty('DISCORD_T', String(Date.now())); }
      catch (e) { P.setProperty('DISCORD_ERROR', String(e.message).slice(0, 300)); }
    }
    tk_("discord"); try { recordatoriosFilm_(); } catch (e) {}
    CacheService.getScriptCache().removeAll(['snap', 'estados']); // 'estados' se rearma desde la planilla (por si alguien la editó a mano)
    tk_("film"); construirBases_(); tk_("bases");
    return { ok: true, tarjetas: snap.cards.length, generado: snap.generado, incompletos: snap.fallas };
  } catch (e) {
    // queda anotado para que la web lo muestre (antes solo se veía en el registro de ejecuciones de Google)
    P.setProperty('ULTIMA_FALLA', JSON.stringify({ cuando: new Date().toISOString(), mensaje: String(e.message || e).replace(/key=[^&\s]+|token=[^&\s]+/g, '…').slice(0, 250) }));
    throw e;
  } finally { anotarUso_((Date.now() - T0_) / 1000, etapas_); lock.releaseLock(); }
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
    anual: (() => { try { return leerJson_('ANUAL_FILE_ID', 'panel-ideamia-anual.json'); } catch (e) { return {}; } })(),
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
  // Filmmaker: ve solo sus piezas de Producción, los guiones de sus marcas, sus visitas y las reuniones de guiones
  const esFilm = /film|audiovis/i.test(yo.rol), film = esFilm ? filmConfig_(cfg, cat) : null;
  const misMarcas = cat.marcas.filter(m => esFilm ? film.todas.indexOf(m.slug) >= 0 : (esRevisa || m.sm === yo.clave || m.cm === yo.clave));
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
    if (esFilm) {
      if (film.todas.indexOf(c.m[0]) < 0) return false;
      if (c.cat === 'guion') return film.reels.indexOf(c.m[0]) >= 0 && !c.salio;
      if (c.cat !== 'pieza' || c.tipo !== 'produccion' || c.standby) return false;
      if (film.reels.indexOf(c.m[0]) < 0 && c.formato !== 'historia') return false; // marcas donde hace solo historias
      if (c.salio && c.etapa === 'pendiente') return false;
      // nada de más de 15 días para atrás ni de más de dos semanas para adelante: si no, la lista se vuelve eterna
      const ref = c.salida || c.due;
      return ref ? new Date(ref) >= hace15 && new Date(ref) <= new Date(hoy.getTime() + 16 * 864e5) : new Date(c.act) >= hace15;
    }
    // los inputs salen solo de los tableros SCL (en el Project y en los otros tableros quedan pedidos viejos)
    if (c.cat === 'input' && c.tipo !== 'scl') return false;
    if (c.cat === 'guion') return true;
    // Ivo: solo lo que le dejan en revisión en Diseño y Producción (más los guiones, arriba)
    // lo que está en revisión se muestra SIEMPRE (aunque la de SCL figure programada o no se encuentre la original): esconderlo era perder piezas.
    // Lo pendiente (próximas entregas) sí se filtra: si ya salió o no tiene original, no hay nada que entregar.
    if (c.cat === 'pieza') {
      if (c.standby) return false;
      if (esRevisa) return c.etapa === 'revision' || (c.etapa === 'pendiente' && !c.salio && !c.sinOrig);
      // social media: las piezas que están pendientes en Diseño o Producción y NO tienen fecha de salida en SCL. Nadie decidió cuándo salen:
      // se le avisa para que les ponga fecha, las guarde en "Para más adelante" o las archive.
      return !esCM && c.etapa === 'pendiente' && !c.salida && !c.salio && !c.sinOrig;
    }
    if (esRevisa && !esProject) return false;
    if (c.tipo === 'project') return c.cat !== 'hecho' && !c.dup && reciente(c);
    if (c.cat === 'brainstorming' && c.tipo === 'cm' && !esCM && !esProject) return false;
    if (c.cat === 'efem') return c.due && new Date(c.due) >= ayer && new Date(c.due) <= limiteEfem;
    if (c.cat === 'corr') return reciente(c);
    if (['input', 'recursos', 'fichas', 'brainstorming', 'datos', 'standby', 'mover'].indexOf(c.cat) >= 0) return true;
    // aprobado / programado que sale en los próximos días: para el chequeo "por salir" (reels y carruseles)
    if (c.cat === 'hecho') return c.tipo === 'scl' && c.due && !c.dc && new Date(c.due) >= ayer && new Date(c.due) <= new Date(hoy.getTime() + ajustes.porVencer * 864e5);
    return enVentana(c, ajustes.porVencer);
  }).map(c => {
    const o = Object.assign({}, c);
    if (ia[c.id]) o.ia = ia[c.id].r;
    const e = est['inp:' + c.id] || est['card:' + c.id]; if (e) o.estado = e;
    if (c.cat === 'efem') { const k = clave_(c.n); o.enCalendario = k.length > 2 && piezas.some(p => p.m === c.m[0] && p.n.indexOf(k) >= 0); }
    if (c.cat === 'recursos' || c.cat === 'fichas') o.d = o.d.slice(0, 200);
    if (c.cat === 'pieza' && !esRevisa && !esFilm) o.cat = 'sinfecha'; // para el social media no es una pieza a revisar: es algo a decidir
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
  const soloRevisa = (esRevisa && !esProject) || esFilm; // ni quien revisa ni el filmmaker tienen rutinas o reuniones de social media
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
    anual: esFilm || (esCM && !esProject) ? null : anualSalida_(ctx.anual, misMarcas, hoy, snap), // calendario anual: solo social media, dirección y project (no filmmaker ni CM)
    film: esFilm ? Object.assign(filmSalida_(film, yo, hoy), { todas: cat.marcas.map(m => ({ slug: m.slug, nombre: m.nombre })) }) : null,
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
  // producciones de fotografía: se leen en cada pedido (no van en la foto guardada) para que lo recién anotado se vea al recargar
  if (/project|direcc|creativ/i.test((b.yo || {}).rol || '')) { try { b.fotos = fotosSalida_(); } catch (e) { b.fotos = null; } }
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
  // filmmaker: lo que marcó de sus visitas y reuniones
  if (b.film) { b.film.est = {}; const pre = 'film:' + b.yo.clave + ':'; Object.keys(est).forEach(k => { if (k.indexOf(pre) === 0) b.film.est[k] = est[k]; }); }
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
  let fotos = null; try { fotos = fotosSalida_(marcas); } catch (e) {}
  let anual = null; try { anual = anualSalida_(leerJson_('ANUAL_FILE_ID', 'panel-ideamia-anual.json'), marcas, hoy, leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json')); } catch (e) {}
  return { ok: true, hoy: ymd_(hoy), personas, registro: reg, marcas, mio, fotos, anual };
}

/* ---------------- "Mi día" del project: su tablero Project de Trello, leído en vivo ----------------
   El panel es una ventana y una forma rápida de cargar: todo vive en Trello y el tablero manda.
   Listas: Bandeja > Por hacer > En proceso > Enviado / en seguimiento > Listo. */
const NO_ES_MARCA = /^(urgente|extra|ver en minuta|ads|guion|guiones)$/;
function etapaProject_(nombre) {
  const n = norm_(nombre);
  return /bandeja/.test(n) ? 'bandeja' : /mas adelante/.test(n) ? 'despues' : /por hacer/.test(n) ? 'hacer' : /proceso/.test(n) ? 'proceso' : /enviado|seguimiento/.test(n) ? 'seguimiento' : /listo|hecho|terminad/.test(n) ? 'listo' : 'otra';
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
  const t = miTablero_(), pasos = [], avisos = [];
  // con b.despues va a "Para más adelante" (cosas para preguntar o ver en otro momento); si no, a Bandeja
  const bandeja = b.despues ? t.listas.filter(l => l.k === 'despues')[0] : t.listas.filter(l => l.k === 'bandeja')[0];
  if (!bandeja) return { error: 'lista', mensaje: 'No encuentro la lista "' + (b.despues ? 'Para más adelante' : 'Bandeja') + '" en Project, así que no creé nada. Listas que tiene: ' + t.listas.map(l => l.n).join(', ') };
  const ids = [], nombres = [];
  if (b.labelId) {
    const e = t.etiquetas.filter(x => x.id === b.labelId && x.marca)[0];
    if (!e) return { error: 'etiqueta', mensaje: 'Esa etiqueta de marca ya no existe en el tablero Project. Recargá la página y probá de nuevo: no creé nada.' };
    ids.push(e.id); nombres.push(e.n);
  }
  if (b.urgente) { const u = t.etiquetas.filter(x => norm_(x.n) === 'urgente')[0]; if (u) { ids.push(u.id); nombres.push(u.n); } else avisos.push('No existe la etiqueta "Urgente" en el tablero: la tarjeta se creó sin ella'); }
  if (b.minuta) { const u = t.etiquetas.filter(x => /minuta/.test(norm_(x.n)))[0]; if (u) { ids.push(u.id); nombres.push(u.n); } else avisos.push('No existe la etiqueta "Ver en minuta" en el tablero: la tarjeta se creó sin ella'); }
  const q = { idList: bandeja.id, name: texto.slice(0, 300), desc: String(b.nota || '').slice(0, 1500), pos: 'top' };
  if (b.due) q.due = b.due;
  if (ids.length) q.idLabels = ids.join(',');
  const card = trello_('/cards', q, 'post');
  if (!card || !card.id) return { error: 'trello', mensaje: 'Trello no confirmó la tarjeta. Fijate en Bandeja antes de cargarla otra vez.' };
  pasos.push('Tarjeta creada en "' + bandeja.n + '" de Project');
  if (nombres.length) pasos.push('Etiquetas: ' + nombres.join(', '));
  if (b.due) pasos.push('Fecha: ' + Utilities.formatDate(new Date(b.due), TZ, 'dd/MM'));
  return { ok: true, pasos: pasos, avisos: avisos, card: { id: card.id, n: card.name, d: q.desc, due: card.due || null, dc: false, lista: bandeja.n, k: bandeja.k, act: card.dateLastActivity || new Date().toISOString(), url: card.shortUrl, lab: nombres } };
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

/* ---------------- filmmaker (Bauti) ----------------
   Qué marcas filma y edita, en cuáles hace solo historias, y a cuáles va una vez por semana.
   Se puede cambiar desde la pestaña Config del Sheet con FILM_REELS, FILM_HISTORIAS, FILM_VISITAS y FILM_REUNION_HORA
   (nombres de marca separados por coma; en visitas, "marca=día ideal" separadas por punto y coma). */
const FILM_DEF = { reels: 'isco, quality mayorista, quality, sfb, gabriel varisco', historias: 'vice', visitas: 'gabriel varisco=lunes o viernes; isco; quality; vice', hora: '16:00' };
function filmConfig_(cfg, cat) {
  const slug = n => marcasEn_(String(n || ''), cat.marcas)[0] || '';
  const varios = txt => String(txt || '').split(',').map(slug).filter((s, i, a) => s && a.indexOf(s) === i);
  const reels = varios(cfg.FILM_REELS || FILM_DEF.reels), historias = varios(cfg.FILM_HISTORIAS || FILM_DEF.historias);
  const visitas = String(cfg.FILM_VISITAS || FILM_DEF.visitas).split(';').map(x => { const p = x.split('='); return { marca: slug(p[0]), ideal: String(p[1] || '').trim() }; }).filter(v => v.marca);
  return { reels: reels, historias: historias, visitas: visitas, hora: String(cfg.FILM_REUNION_HORA || FILM_DEF.hora).trim(), todas: reels.concat(historias.filter(s => reels.indexOf(s) < 0)) };
}
/* Lo que ve el filmmaker además de sus tarjetas: visitas de esta semana y la que viene, y reuniones de guiones (lunes y viernes). */
function filmSalida_(film, yo, hoy) {
  const pre = 'film:' + yo.clave + ':', visitas = [], reuniones = [];
  [[semana_(hoy), 'esta semana'], [semana_(new Date(hoy.getTime() + 7 * 864e5)), 'la semana que viene']].forEach(p =>
    film.visitas.forEach(v => visitas.push({ clave: pre + 'vis:' + v.marca + ':' + p[0], marca: v.marca, ideal: v.ideal, periodo: p[0], cuando: p[1] })));
  for (let i = -3; i <= 10; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
    if (d.getDay() === 1 || d.getDay() === 5) reuniones.push({ clave: pre + 'reu:' + ymd_(d), fecha: ymd_(d), hora: film.hora });
  }
  return { reels: film.reels, historias: film.historias, visitas: visitas, reuniones: reuniones, est: {} };
}
/* Una tarjeta cambió de lista desde el panel: se refleja en la lectura guardada y en los paneles ya armados (sin esperar la próxima lectura). */
function moverEnSnapshot_(cardId, etapa, lista) {
  try {
    const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json'); let toco = false;
    (snap.cards || []).forEach(c => { if (c.id === cardId) { c.etapa = etapa; c.lista = lista; toco = true; } });
    if (toco) guardarJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json', snap);
    const bases = leerJson_('BASES_FILE_ID', 'panel-ideamia-bases.json'); let cambio = false;
    Object.keys(bases).forEach(k => {
      const b = bases[k]; if (!b || !b.cards) return; let t = false;
      b.cards.forEach(c => { if (c.id === cardId) { c.etapa = etapa; c.lista = lista; t = true; } });
      if (t) { cambio = true; cachePut_('base:' + k, b); }
    });
    if (cambio) guardarJson_('BASES_FILE_ID', 'panel-ideamia-bases.json', bases);
    CacheService.getScriptCache().remove('snap');
  } catch (e) {}
}
/* "Listo" del filmmaker: la tarjeta pasa a "En revisión" de su tablero de Producción (así le llega a quien revisa). */
function entregarPieza_(b, quien) {
  const card = trello_('/cards/' + b.cardId, { fields: 'idBoard,idList,name' });
  const listas = trello_('/boards/' + card.idBoard + '/lists', { fields: 'name' });
  const actual = listas.filter(l => l.id === card.idList)[0], dest = listas.filter(l => /revisi/.test(norm_(l.name)))[0];
  if (actual && /revisi/.test(norm_(actual.name))) { moverEnSnapshot_(b.cardId, 'revision', actual.name); return { ok: true, ya: true, lista: actual.name, pasos: ['Ya estaba en "' + actual.name + '": no hizo falta moverla'] }; }
  if (!dest) return { error: 'lista', mensaje: 'No encontré la lista "En revisión" en ese tablero, así que no moví nada. Listas que tiene: ' + listas.map(l => l.name).join(', ') };
  const pasos = [], nota = String(b.nota || '').trim();
  if (nota) {
    try { trello_('/cards/' + b.cardId + '/actions/comments', { text: ('🎬 Entregado por ' + nombreDe_(quien) + ': ' + nota).slice(0, 16000) }, 'post'); pasos.push('Nota puesta en la tarjeta de Trello'); }
    catch (e) { return { error: 'comentario', mensaje: 'No se pudo poner la nota en Trello y no se movió la tarjeta: ' + String(e.message).slice(0, 150) }; }
  }
  let movida = null;
  try { movida = trello_('/cards/' + b.cardId, { idList: dest.id }, 'put'); } catch (e) { return { error: 'mover', pasos: pasos, mensaje: (pasos.length ? 'La nota SÍ quedó en Trello, pero ' : '') + 'no se pudo mover la tarjeta a "' + dest.name + '": ' + String(e.message).slice(0, 150) }; }
  if (!movida || movida.idList !== dest.id) return { error: 'mover', pasos: pasos, mensaje: 'Trello no confirmó el cambio de lista. Revisala en Trello.' };
  pasos.push('Tarjeta movida a "' + dest.name + '"' + (b.tablero ? ' de ' + b.tablero : ''));
  registrar_(quien, 'entrega', 'card:' + b.cardId, b.marca, 'entregado', String(b.nombre || '').slice(0, 100) + (nota ? ' · ' + nota.slice(0, 150) : ''), '');
  moverEnSnapshot_(b.cardId, 'revision', dest.name);
  return { ok: true, lista: dest.name, pasos: pasos };
}
/* Prueba de solo lectura: qué marcas quedaron configuradas y qué vería el filmmaker hoy. */
function probarFilm() {
  const cat = catalogo_(), cfg = config_(), f = filmConfig_(cfg, cat);
  console.log('Reels e historias: ' + f.reels.join(', ') + ' · solo historias: ' + f.historias.join(', '));
  console.log('Visitas semanales: ' + f.visitas.map(v => v.marca + (v.ideal ? ' (' + v.ideal + ')' : '')).join(', ') + ' · reuniones lunes y viernes ' + f.hora);
  const p = cat.equipo.filter(x => /film|audiovis/i.test(x.rol))[0];
  if (!p) { console.log('No hay nadie con rol Filmmaker en la pestaña Equipo (se agrega solo en la próxima actualización).'); return; }
  const pn = panel_(p.clave), n = {};
  (pn.cards || []).forEach(c => { const k = c.cat + ' · ' + (c.etapa || c.gest || ''); n[k] = (n[k] || 0) + 1; });
  console.log(p.nombre + ' ve: ' + (pn.cards || []).length + ' tarjetas → ' + Object.keys(n).map(k => k + ': ' + n[k]).join(' | '));
  (pn.cards || []).filter(c => c.cat === 'pieza').slice(0, 25).forEach(c => console.log('   ' + c.tablero + ' · ' + c.formato + ' · ' + c.etapa + ' · ' + String(c.n).slice(0, 40) + (c.salida ? ' · sale ' + c.salida.slice(0, 10) : ' · sin fecha')));
  console.log('Visitas: ' + pn.film.visitas.length + ' · reuniones: ' + pn.film.reuniones.map(r => r.fecha).join(', ') + ' · marcas: ' + pn.marcas.map(m => m.slug).join(', '));
}

/* AUDITORÍA de social media (solo lectura): marcas y tableros, y por cada persona compara los inputs y las correcciones
   que hay AHORA en los tableros SCL de sus marcas contra lo que le muestra el panel. No cambia nada. */
function auditarSocial() {
  const cat = catalogo_();
  console.log('MARCAS (' + cat.marcas.length + '): ' + cat.marcas.map(m => m.slug + ' [sm:' + (m.sm || '—') + ' cm:' + (m.cm || '—') + ']').join(' · '));
  const boards = trello_('/members/me/boards', { filter: 'open', fields: 'name' }).map(b => ({ id: b.id, nombre: b.name, tipo: tipoTablero_(b.name), marca: marcasEn_(b.name.replace(/^\S+\s*/, ''), cat.marcas)[0] || '' }));
  const sinMarca = boards.filter(b => b.tipo && !b.marca).map(b => b.nombre);
  console.log('Tableros con tipo reconocido pero SIN marca (el panel no los lee): ' + (sinMarca.join(', ') || 'ninguno'));
  const porMarca = {}; boards.filter(b => b.tipo && b.marca).forEach(b => (porMarca[b.marca] = porMarca[b.marca] || []).push(b.tipo));
  cat.marcas.forEach(m => { const t = porMarca[m.slug] || []; const falta = ['scl', 'cm', 'diseno', 'produccion', 'guiones'].filter(x => t.indexOf(x) < 0); if (falta.length) console.log('   ' + m.slug + ' no tiene tablero de: ' + falta.join(', ') + (m.sm ? '' : ' · SIN social media asignado')); });
  const scl = boards.filter(b => b.tipo === 'scl' && b.marca);
  const res = trelloVarios_(scl.map(b => '/boards/' + b.id + '/lists?filter=open&fields=name&cards=open&card_fields=name,shortUrl,dateLastActivity,due'));
  const vivo = { input: [], corr: [] };
  scl.forEach((b, i) => (res[i] || []).forEach(l => { const k = catLista_(l.name); if (vivo[k]) (l.cards || []).forEach(c => vivo[k].push({ id: c.id, n: c.name, marca: b.marca, tablero: b.nombre, lista: l.name, act: c.dateLastActivity, due: c.due, url: c.shortUrl })); }));
  const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json'), enSnap = {};
  (snap.cards || []).forEach(c => enSnap[c.id] = c);
  console.log('Lectura de Trello del panel: ' + snap.generado + ' · inputs en Trello ahora: ' + vivo.input.length + ' · correcciones: ' + vivo.corr.length);
  const sinDueno = {}; vivo.input.forEach(c => { const m = cat.marcas.filter(x => x.slug === c.marca)[0]; if (!m || !m.sm) sinDueno[c.marca] = (sinDueno[c.marca] || 0) + 1; });
  if (Object.keys(sinDueno).length) console.log('INPUTS DE MARCAS SIN SOCIAL MEDIA ASIGNADO (nadie los ve): ' + Object.keys(sinDueno).map(k => k + ': ' + sinDueno[k]).join(', '));
  cat.equipo.filter(p => /^sm$/i.test(p.rol)).forEach(p => {
    const mias = cat.marcas.filter(m => m.sm === p.clave).map(m => m.slug), pn = panel_(p.clave), visto = {};
    (pn.cards || []).forEach(c => visto[c.id] = c.cat);
    console.log('— ' + p.nombre + ' · marcas: ' + (mias.join(', ') || 'NINGUNA'));
    ['input', 'corr'].forEach(k => {
      const L = vivo[k].filter(c => mias.indexOf(c.marca) >= 0), faltan = L.filter(c => !visto[c.id]);
      console.log('   ' + (k === 'input' ? 'Inputs' : 'Correcciones') + ' en Trello: ' + L.length + ' · el panel muestra: ' + (L.length - faltan.length) + ' · FALTAN: ' + faltan.length);
      const mot = {};
      faltan.forEach(c => {
        const s = enSnap[c.id];
        const m = !s ? (new Date(c.act) > new Date(snap.generado) ? 'se movió después de la última lectura' : 'no está en la lectura guardada') : s.cat !== k ? 'en la lectura figura como "' + s.cat + '" (lista ' + s.lista + ')' :
          k === 'corr' && s.due && new Date(s.due) < new Date(Date.now() - 15 * 864e5) ? 'corrección con fecha de hace más de 15 días (regla "reciente")' : 'filtrada por otra regla';
        (mot[m] = mot[m] || []).push(c.tablero + ' · ' + c.n.slice(0, 45));
      });
      Object.keys(mot).forEach(m => console.log('      ' + m + ' (' + mot[m].length + '): ' + mot[m].slice(0, 5).join(' | ')));
    });
  });
}

/* ---------------- recordatorio por privado de Discord ----------------
   Si el filmmaker avisó que no iba a una reunión de guiones, una hora después el bot le escribe por privado
   para que pregunte qué se presentó. Sale por el puente de Cloudflare (ruta /dm). Se manda una sola vez por reunión.
   Necesita el ID de Discord de la persona en Config: DISCORD_ID_<CLAVE> (ej. DISCORD_ID_BAUTI). */
function discordPrivado_(userId, texto) {
  const cfg = config_(), puente = String(cfg.DISCORD_PUENTE || '').trim().replace(/\/+$/, ''), clave = P.getProperty('DISCORD_PUENTE_CLAVE');
  if (!puente || !clave) throw new Error('falta el puente de Discord');
  const r = UrlFetchApp.fetch(puente + '/dm', { method: 'post', contentType: 'application/json', headers: { 'x-clave': clave }, payload: JSON.stringify({ usuario: String(userId), texto: String(texto).slice(0, 1800) }), muteHttpExceptions: true });
  if (r.getResponseCode() >= 300) throw new Error('el puente respondió ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 120));
}
function recordatoriosFilm_() {
  const cat = catalogo_(), cfg = config_(), est = estados_(), ahora = hoyAR_().getTime(), hora = filmConfig_(cfg, cat).hora || '16:00';
  cat.equipo.filter(p => /film|audiovis/i.test(p.rol)).forEach(p => {
    const id = String(cfg['DISCORD_ID_' + p.clave.toUpperCase()] || '').trim();
    if (!/^\d{15,22}$/.test(id)) return;
    const pre = 'film:' + p.clave + ':reu:';
    Object.keys(est).filter(k => k.indexOf(pre) === 0 && est[k].estado === 'novoy').forEach(k => {
      const horas = (ahora - new Date(k.slice(pre.length) + 'T' + hora + ':00').getTime()) / 36e5;
      if (!(horas >= 1 && horas <= 48) || P.getProperty('AVISADO_' + k)) return; // desde 1 h después de la reunión; pasado 2 días ya no tiene sentido
      try {
        discordPrivado_(id, 'Hola ' + p.nombre + '. No estuviste en la reunión de guiones y presentación de ideas del ' + k.slice(pre.length).split('-').reverse().slice(0, 2).join('/') +
          '. Acordate de preguntar qué ideas se presentaron de tus marcas y de qué se tratan. Cuando lo tengas, marcá "Ya pregunté" en el panel: https://ideamiacontacto-lab.github.io/panel-ideamia/');
        P.setProperty('AVISADO_' + k, new Date().toISOString()); P.deleteProperty('DISCORD_DM_ERROR');
      } catch (e) { P.setProperty('DISCORD_DM_ERROR', new Date().toISOString() + ' · ' + String(e.message).replace(/[A-Za-z0-9_.-]{24,}/g, '…').slice(0, 200)); }
    });
  });
}

/* PRUEBAS REALES del circuito de revisión, pedidas por Joaquín. Usan el mismo camino que los botones del panel (doPost),
   sobre la tarjeta "PRUEBA PANEL DISEÑO (borrar)" que tiene que estar en "En revision" de un tablero de Diseño.
   Mueven esa tarjeta y dejan un comentario en ella; no tocan ninguna otra. */
function pruebaPanel_(accion, comentario) {
  const t0 = Date.now(), viva = revisionViva_(), c = viva.cards.filter(x => /PRUEBA PANEL/.test(x.n))[0];
  console.log('Lectura en vivo: ' + viva.cards.length + ' piezas en ' + (Date.now() - t0) + ' ms · sin respuesta: ' + (viva.fallas.join(', ') || 'ninguno') + ' · la de prueba ' + (c ? 'SÍ aparece (' + c.tablero + ' · ' + c.formato + ' · ' + c.lista + ')' : 'NO aparece'));
  if (!c) return;
  const r = doPost({ postData: { contents: JSON.stringify({ action: 'revisarPieza', k: P.getProperty('TEAM_KEY'), persona: 'ivo', cardId: c.id, accion: accion, comentario: comentario, marca: c.m[0], nombre: c.n, tablero: c.tablero }) } });
  console.log('Respuesta del panel al ' + accion + ': ' + r.getContent());
  const ahora = trello_('/cards/' + c.id, { fields: 'name,closed', list: 'true', list_fields: 'name', actions: 'commentCard', actions_limit: '3' });
  console.log('En Trello ahora: lista "' + ahora.list.name + '" · últimos comentarios: ' + (ahora.actions || []).map(a => '«' + a.data.text + '»').join(' | '));
  const despues = revisionViva_().cards.some(x => x.id === c.id);
  console.log('¿Sigue apareciendo en la revisión en vivo? ' + (despues ? 'SÍ (mal)' : 'no (correcto: ya no está en revisión)'));
}
function pruebaCorregir() { pruebaPanel_('corregir', 'PRUEBA: cambiar el color del fondo y agrandar el logo. Comentario largo con tildes y eñes para verificar que llega entero: diseño, corrección, año, ¿se ve bien?'); }
function pruebaAprobar() { pruebaPanel_('aprobar', 'PRUEBA: aprobado desde el panel'); }

/* PRUEBA REAL del "Listo" del filmmaker: usa el mismo camino que el botón (doPost → entregarPieza) sobre la tarjeta
   "PRUEBA PANEL…" que esté en un tablero de Producción. Solo mueve esa tarjeta. */
function pruebaEntregar() {
  revisionViva_(); // deja en caché la lista de tableros
  const prod = JSON.parse(CacheService.getScriptCache().get('tabsRev') || '[]').filter(b => b.tipo === 'produccion');
  const res = trelloVarios_(prod.map(b => '/boards/' + b.id + '/lists?filter=open&fields=name&cards=open&card_fields=name'));
  let c = null;
  prod.forEach((b, i) => (res[i] || []).forEach(l => (l.cards || []).forEach(k => { if (/PRUEBA PANEL/.test(k.name)) c = { id: k.id, n: k.name, lista: l.name, tablero: b.nombre, marca: b.marca }; })));
  console.log('Tableros de Producción leídos: ' + prod.length + ' · tarjeta de prueba: ' + (c ? c.tablero + ' · lista "' + c.lista + '"' : 'NO la encuentro'));
  if (!c) return;
  const pedir = () => doPost({ postData: { contents: JSON.stringify({ action: 'entregarPieza', k: P.getProperty('TEAM_KEY'), persona: 'bauti', cardId: c.id, nota: 'PRUEBA: link al video y aclaración con tildes (edición, música)', marca: c.marca, nombre: c.n, tablero: c.tablero }) } }).getContent();
  console.log('Respuesta del panel al "Listo": ' + pedir());
  const ahora = trello_('/cards/' + c.id, { fields: 'name', list: 'true', list_fields: 'name', actions: 'commentCard', actions_limit: '2' });
  console.log('En Trello ahora: lista "' + ahora.list.name + '" · comentarios: ' + (ahora.actions || []).map(a => '«' + a.data.text + '»').join(' | '));
  console.log('Segundo "Listo" sobre la misma tarjeta (tiene que decir que ya estaba): ' + pedir());
  console.log('¿Le aparece a quien revisa en la lectura en vivo? ' + (revisionViva_().cards.some(x => x.id === c.id) ? 'SÍ (correcto)' : 'NO (mal)'));
}
/* PRUEBA REAL del privado de Discord: se lo manda a JOAQUÍN (lo busca por nombre en el servidor), no al filmmaker. */
function pruebaPrivado() {
  const cfg = config_(), puente = String(cfg.DISCORD_PUENTE || '').trim().replace(/\/+$/, ''), clave = P.getProperty('DISCORD_PUENTE_CLAVE'), guild = String(cfg.DISCORD_SERVIDOR || '').trim();
  const r = UrlFetchApp.fetch(puente + '/api/v10/guilds/' + guild + '/members/search?query=joaquin&limit=10', { headers: { 'x-clave': clave }, muteHttpExceptions: true });
  console.log('Búsqueda en el servidor de Discord: código ' + r.getResponseCode());
  if (r.getResponseCode() >= 300) { console.log(r.getContentText().slice(0, 200)); return; }
  const L = JSON.parse(r.getContentText()).map(m => m.user).filter(u => u && !u.bot);
  console.log('Encontrados: ' + L.map(u => u.username).join(', '));
  const yo = L.filter(u => /joaquinyarce/i.test(u.username))[0] || L[0];
  if (!yo) { console.log('No encontré a Joaquín'); return; }
  try {
    discordPrivado_(yo.id, 'PRUEBA del Panel Ideamia. Así le va a llegar a Bauti el recordatorio cuando marque "No voy" en una reunión de guiones: una hora después, un privado para que pregunte qué ideas se presentaron. Podés borrar este mensaje.');
    console.log('Privado enviado a ' + yo.username + ' sin errores.');
  } catch (e) { console.log('FALLÓ el privado: ' + e.message); }
  const b = String(cfg.DISCORD_ID_BAUTI || '').trim();
  console.log('ID de Bauti en Config: ' + (/^\d{15,22}$/.test(b) ? 'cargado y con formato válido' : 'FALTA o está mal'));
}

/* ---------------- avisos por privado de Discord y filtro de CM ----------------
   Los manda el bot por el puente de Cloudflare (ruta /dm): no pasan por Make, así que no gastan operaciones.
   Se apagan todos juntos con PRIVADOS_DISCORD = no en la pestaña Config. Cada persona necesita DISCORD_ID_<CLAVE> en Config.
   1) Filtro de CM: lo que entra a "Filtro" de un tablero CM se reparte mirando la tarjeta ORIGINAL del SCL (las que llegan al CM
      son espejos sin etiquetas, por eso Butler no podía): con etiqueta (i) → "Contenido no programable"; sin (i) → "Listo para programar".
      Al CM no se le manda privado: los avisos de canal de Make salen como siempre.
   2) Inputs: cuando aparece un input con etiqueta "Urgente", privado al social media de esa marca (una sola vez por input).
   3) Una vez por día (después de las 9): a las diseñadoras lo que quedó pendiente (lo mismo que sale en el canal, de Avisos.gs)
      y al filmmaker las piezas que ya tendría que haber entregado. */
const fechaAR_ = iso => Utilities.formatDate(new Date(iso), TZ, 'dd/MM HH:mm');
function idDiscord_(cfg, clave) { const v = String(cfg['DISCORD_ID_' + String(clave || '').toUpperCase()] || '').trim(); return /^\d{15,22}$/.test(v) ? v : ''; }
function nombreMarca_(cat, slug) { const m = cat.marcas.filter(x => x.slug === slug)[0]; return m ? m.nombre : (slug || 'General'); }
/* parte un texto largo en mensajes de hasta ~1800 caracteres cortando por línea */
function trozos_(encabezado, lineas) {
  const out = []; let t = encabezado;
  lineas.forEach(l => { if ((t + '\n' + l).length > 1750) { out.push(t); t = '(sigue)\n' + l; } else t += '\n' + l; });
  out.push(t); return out;
}

/* Butler manda todo lo que llega al CM a "Listo para programar" (no puede ver la etiqueta porque llega un espejo sin etiquetas).
   Acá se revisa cada pieza nueva de "Filtro" y "Listo para programar": se lee la tarjeta ORIGINAL del SCL y, si tiene (i),
   se pasa a "Contenido no programable". Lo que quedó trabado en "Filtro" sin (i) va a "Listo para programar".
   Cada tarjeta se revisa una sola vez (propiedad CM_REVISADAS). Si esto falla, todo queda como lo dejó Butler. */
function filtroCM_(snap, dry) {
  const out = { movidas: [], avisar: [], problemas: [], revisadas: [], primera: false };
  const prop = P.getProperty('CM_REVISADAS'), ya = {}; (prop || '').split(',').forEach(x => { if (x) ya[x] = 1; });
  out.primera = prop == null;
  const enFiltro = c => /^filtro$/.test(norm_(c.lista));
  const cand = (snap.cards || []).filter(c => c.tipo === 'cm' && (enFiltro(c) || /listo para programar/.test(norm_(c.lista))));
  cand.forEach(c => { if (ya[c.id] && !enFiltro(c)) out.revisadas.push(c.id); });
  const pend = cand.filter(c => !ya[c.id] || enFiltro(c)).slice(0, 150);
  if (!pend.length) return out;
  const cortos = pend.map(c => (/trello\.com\/c\/([A-Za-z0-9]+)/.exec(c.n) || [])[1] || '');
  const idx = cortos.map((s, i) => s ? i : -1).filter(i => i >= 0), orig = {};
  if (idx.length) { const r = trelloVarios_(idx.map(i => '/cards/' + cortos[i] + '?fields=name,due,labels,shortUrl')); idx.forEach((i, k) => orig[i] = r[k]); }
  pend.forEach((c, i) => {
    const b = (snap.tableros || []).filter(t => t.nombre === c.tablero)[0]; if (!b) return;
    const o = orig[i] || null;
    // si no se puede leer la original, no se decide a ciegas: queda donde está y se reintenta en la próxima lectura
    if (cortos[i] && !o) { out.problemas.push(c.tablero + ': no pude leer la tarjeta original de ' + c.url); return; }
    const labs = o ? (o.labels || []).map(x => x.name || '') : (c.lab || []), esI = labs.some(x => /^\(i\)$/.test(String(x).trim()));
    const quiere = esI ? /no programable/ : /listo para programar/, yaEsta = quiere.test(norm_(c.lista));
    let lista = c.lista, movida = false;
    if (!yaEsta) {
      const dest = (b.listas || []).filter(l => quiere.test(norm_(l.n)))[0];
      if (!dest) { out.problemas.push(c.tablero + ': no existe la lista "' + (esI ? 'Contenido no programable' : 'Listo para programar') + '"'); return; }
      if (!dry) {
        try { const m = trello_('/cards/' + c.id, { idList: dest.id, pos: 'top' }, 'put'); if (!m || m.idList !== dest.id) throw new Error('Trello no confirmó el movimiento'); }
        catch (e) { out.problemas.push(c.tablero + ': no pude mover ' + c.url + ' (' + String(e.message).slice(0, 80) + ')'); return; }
        c.lista = dest.n;
      }
      lista = dest.n; movida = true;
    }
    const item = { marca: c.m[0], tablero: c.tablero, titulo: o ? o.name : c.n, sale: (o && o.due) || c.due || null, programable: !esI, lista: lista, url: c.url, movida: movida,
      tipo: labs.filter(x => /histori|reel|carrus|post|video|placa/i.test(x)).join(', ') };
    if (movida) out.movidas.push(item);
    // la primera vez no se avisa todo lo que ya estaba: solo lo que hubo que corregir de lugar
    if (movida || !out.primera) out.avisar.push(item);
    if (!esI || movida || dry) out.revisadas.push(c.id);
  });
  return out;
}
/* Inputs con etiqueta "Urgente" que todavía no se avisaron. La primera vez solo toma nota de los que ya había. */
function inputsParaAvisar_(snap, cat) {
  const marcados = (snap.cards || []).filter(c => c.cat === 'input' && c.tipo === 'scl' && (c.lab || []).some(x => /urgente/.test(norm_(x))));
  const prop = P.getProperty('INPUTS_AVISADOS'), ya = {}; (prop || '').split(',').forEach(x => { if (x) ya[x] = 1; });
  return { marcados: marcados, primera: prop == null, nuevos: prop == null ? [] : marcados.filter(c => !ya[c.id]), ya: ya };
}
const FILM_MOTIVOS = ['hoy', 'manana', 'vencida', 'cerca', 'urgente']; // por cada motivo se guarda a qué tarjetas ya se les avisó (FILM_HOY, FILM_MANANA…)
/* Todo lo que el filmmaker tiene pendiente o para corregir en Producción, con fecha de salida (de sus marcas). */
function pendientesFilm_(snap, film) {
  const hace15 = Date.now() - 15 * 864e5;
  return (snap.cards || []).filter(c => c.cat === 'pieza' && c.tipo === 'produccion' && !c.salio && c.salida && film.todas.indexOf(c.m[0]) >= 0 && (c.etapa === 'pendiente' || c.etapa === 'correccion') &&
    (film.reels.indexOf(c.m[0]) >= 0 || c.formato === 'historia') && new Date(c.salida).getTime() >= hace15).sort((a, b) => new Date(a.salida) - new Date(b.salida));
}
/* Lo que ya tendría que haber entregado el filmmaker: reels 48 h antes de salir, historias el día anterior. */
function atrasadasFilm_(snap, film) {
  const ahora = Date.now(), hace15 = ahora - 15 * 864e5;
  return (snap.cards || []).filter(c => {
    if (c.cat !== 'pieza' || c.tipo !== 'produccion' || c.salio || !c.salida || film.todas.indexOf(c.m[0]) < 0) return false;
    if (c.etapa !== 'pendiente' && c.etapa !== 'correccion') return false;
    if (film.reels.indexOf(c.m[0]) < 0 && c.formato !== 'historia') return false;
    const s = new Date(c.salida).getTime(); if (s < hace15) return false;
    return s - (c.formato === 'historia' ? 24 : 48) * 36e5 < ahora;
  }).sort((a, b) => new Date(a.salida) - new Date(b.salida));
}
/* Arma todos los privados que corresponden ahora. Con dry = true no mueve tarjetas ni envía: solo devuelve qué haría. */
function privadosArmar_(snap, cat, cfg, opciones) {
  const o = opciones || {}, dry = !!o.dry, msgs = [], notas = [];
  const para = (clave, id, textos) => (Array.isArray(textos) ? textos : [textos]).forEach(t => msgs.push({ para: clave, id: id, texto: t }));
  // 1) filtro de CM + aviso a quien lleva el CM de cada marca
  const f = filtroCM_(snap, dry);
  f.problemas.forEach(p => notas.push('Filtro CM · ' + p));
  // (al CM no se le manda privado: el panel solo acomoda las tarjetas y los avisos de canal de Make salen como siempre)
  // 2) inputs marcados como pedido del cliente o urgente
  const inp = inputsParaAvisar_(snap, cat), porSM = {};
  inp.nuevos.forEach(c => { const mm = cat.marcas.filter(x => x.slug === c.m[0])[0], k = (mm && mm.sm) || ''; (porSM[k] = porSM[k] || []).push(c); });
  const sinAvisar = {};
  Object.keys(porSM).forEach(k => {
    const id = idDiscord_(cfg, k), L = porSM[k];
    if (!k || !id) { notas.push('Inputs · ' + L.length + ' sin avisar: ' + (k ? 'falta DISCORD_ID_' + k.toUpperCase() + ' en Config' : 'la marca no tiene social media')); return; }
    const lineas = L.map(c => '• **' + nombreMarca_(cat, c.m[0]) + '** · ' + String(c.n).slice(0, 90) + ' · ' + (c.lab || []).filter(x => /urgente/.test(norm_(x))).join(', ') + (c.due ? ' · vence ' + fechaAR_(c.due) : '') + ' · ' + c.url);
    para(k, id, trozos_('Hola ' + nombreDe_(k) + '. Por favor mirá ' + (L.length === 1 ? 'este input que te cargaron' : 'estos ' + L.length + ' inputs que te cargaron') + ':', lineas).map((t, i, a) => i === a.length - 1 ? t + '\nCuando lo veas, marcalo en el panel: https://ideamiacontacto-lab.github.io/panel-ideamia/' : t));
    L.forEach(c => sinAvisar[c.id] = k);
  });
  // 3) diarios: diseñadoras (lo mismo que arma Avisos.gs para el canal) y filmmaker
  const filmInfo = { pendientes: [], ya: {}, nuevos: {} }; FILM_MOTIVOS.forEach(k => { filmInfo.ya[k] = {}; filmInfo.nuevos[k] = {}; });
  if (o.diarios) {
    // diseñadoras: SOLO lo que no entregaron en la entrega de ayer. Sale el día siguiente a cada entrega (los días los define Avisos.gs,
    // que arma el aviso del canal): así el canal y el privado dicen lo mismo. Nada de pedidos extra, urgentes ni correcciones.
    if (typeof avisosDisenoArmar_ === 'function' && typeof AV_MARCAS !== 'undefined') {
      const hoyD = o.ahora || hoyAR_(), partesDe = {}, sumar = (id, bloque) => (partesDe[id] = partesDe[id] || []).push(bloque);
      // a) el día después de cada entrega (martes y viernes, lo define Avisos.gs): RESUMEN por marca de lo que faltó, sin listar cada tarjeta
      //    ("TRITATO: 2 · 1 historia y 1 carrusel"). El detalle, tarjeta por tarjeta, ya sale en el canal de la marca.
      const tipoD = t => { const n = norm_(t); return /histori/.test(n) ? 'historia' : /carrusel/.test(n) ? 'carrusel' : /reel|video/.test(n) ? 'reel' : 'placa'; };
      const plD = { historia: 'historias', carrusel: 'carruseles', reel: 'reels', placa: 'placas' }, resumen = {};
      avisosDisenoArmar_(hoyD, snap.cards).forEach(m => {
        const k = Object.keys(AV_MARCAS).filter(x => AV_MARCAS[x].marca === m.marca)[0]; if (!k) return;
        const falt = String(m.texto).split('\n\n').filter(b => /^📦/.test(b))[0]; if (!falt) return;
        const L = falt.split('\n').slice(1).filter(x => /^•/.test(x)); if (!L.length) return;
        const n = {}; L.forEach(x => n[tipoD(x)] = (n[tipoD(x)] || 0) + 1);
        const det = ['placa', 'carrusel', 'historia', 'reel'].filter(t => n[t]).map(t => n[t] + ' ' + (n[t] === 1 ? t : plD[t]));
        (resumen[AV_MARCAS[k].quien] = resumen[AV_MARCAS[k].quien] || []).push('• **' + m.marca + '**: ' + (det.length > 1 ? L.length + ' · ' + det.slice(0, -1).join(', ') + ' y ' + det.slice(-1) : det[0]));
      });
      Object.keys(resumen).forEach(id => sumar(id, ['**Esto quedó sin entregar de la entrega de ayer** (el detalle está en el canal de cada marca):'].concat(resumen[id])));
      // b) todos los días: lo que sale mañana y sigue pendiente (lo cargaron tarde o es urgente), tarjeta por tarjeta, para que avise si no llega
      const porSalir = disenoPorSalir_(snap, hoyD), salen = {};
      Object.keys(porSalir).forEach(k => porSalir[k].forEach(c => (salen[AV_MARCAS[k].quien] = salen[AV_MARCAS[k].quien] || []).push('• **' + AV_MARCAS[k].marca + '** · ' + String(c.n).slice(0, 70) + ((c.lab || []).some(x => /urgente/.test(norm_(x))) ? ' · URGENTE' : '') + ' · sale ' + fechaAR_(c.salida) + ' · ' + c.url)));
      Object.keys(salen).forEach(id => sumar(id, ['**' + (salen[id].length === 1 ? 'Esta pieza sale' : 'Estas piezas salen') + (hoyD.getDay() === 6 ? ' entre mañana y el lunes' : ' mañana') + ' y ' + (salen[id].length === 1 ? 'sigue pendiente' : 'siguen pendientes') + ':**'].concat(salen[id], ['Si no llegás, avisá así vemos cómo resolverlo.'])));
      Object.keys(partesDe).forEach(id => para(id === AV_LUISI ? 'luisi' : id === AV_ZAIRA ? 'zaira' : 'diseño', id,
        trozos_('Hola.', partesDe[id].reduce((a, b) => a.concat(a.length ? [''] : [], b), []))));
    } else notas.push('Diseñadoras · no está cargado Avisos.gs, no se arma su privado');
    // guiones: el día de la reunión (Config GUIONES_RESUMEN_DIAS, por defecto lunes y viernes) se le recuerda por privado a Fede qué guiones
    // tiene que presentar, y a cada social media que presenta las ideas de reels de sus marcas
    if (guionesDiaDeResumen_(cfg, o.ahora || hoyAR_())) {
      const hoyG = o.ahora || hoyAR_(), hoyGms = Date.parse(ymd_(hoyG) + 'T00:00:00Z'), hora = String(cfg.GUIONES_HORA || '16:00');
      const diaG = f => Math.round((Date.parse(Utilities.formatDate(new Date(f), TZ, 'yyyy-MM-dd') + 'T00:00:00Z') - hoyGms) / 864e5);
      const tit = c => /^https?:\/\//.test(String(c.n)) ? 'Guion sin título' : String(c.n).slice(0, 80);
      const conGuiones = {}; (snap.tableros || []).filter(b => b.tipo === 'guiones' && b.marca).forEach(b => conGuiones[b.marca] = 1);
      const G = (snap.cards || []).filter(c => c.cat === 'guion' && !c.salio && conGuiones[c.m[0]]);
      const presenta = G.filter(c => c.gest === 'revisar'), entrega = G.filter(c => c.gest === 'pendiente' && c.entrega && diaG(c.entrega) <= 0);
      const idFede = idDiscord_(cfg, 'fede') || (typeof GU_FEDE !== 'undefined' ? GU_FEDE : '');
      // guiones con fecha de salida pero sin fecha de entrega (la fecha de inicio de la tarjeta de SCL): Fede no sabe para cuándo los tiene que tener
      const sinEntrega = G.filter(c => c.gest === 'pendiente' && !c.entrega && c.salida);
      if (idFede && (presenta.length || entrega.length || sinEntrega.length)) {
        const l = [];
        if (presenta.length) { l.push('**Recordá que hoy tenés que presentar ' + (presenta.length === 1 ? 'este guion' : 'estos ' + presenta.length + ' guiones') + ' de reel** (reunión de las ' + hora + ' h):'); presenta.forEach(c => l.push('• **' + nombreMarca_(cat, c.m[0]) + '** · ' + tit(c) + ' · ' + c.url)); }
        if (entrega.length) { l.push((l.length ? '\n' : '') + '**' + (entrega.length === 1 ? 'Este guion tenía' : 'Estos ' + entrega.length + ' guiones tenían') + ' que estar entregado' + (entrega.length === 1 ? '' : 's') + ' para hoy:**'); entrega.forEach(c => l.push('• **' + nombreMarca_(cat, c.m[0]) + '** · ' + tit(c) + (diaG(c.entrega) < 0 ? ' · era para el ' + Utilities.formatDate(new Date(c.entrega), TZ, 'dd/MM') : '') + ' · ' + c.url)); }
        if (sinEntrega.length) { l.push((l.length ? '\n' : '') + '**Recordá pedir que te digan cuándo tenés que entregar ' + (sinEntrega.length === 1 ? 'este guion' : 'estos ' + sinEntrega.length + ' guiones') + '** (' + (sinEntrega.length === 1 ? 'tiene' : 'tienen') + ' fecha de salida pero no de entrega):'); sinEntrega.forEach(c => l.push('• **' + nombreMarca_(cat, c.m[0]) + '** · ' + tit(c) + ' · sale el ' + Utilities.formatDate(new Date(c.salida), TZ, 'dd/MM') + ' · ' + c.url)); }
        para('fede', idFede, trozos_('Hola Fede.', l));
      }
      cat.equipo.filter(p => /^sm$/i.test(String(p.rol).trim())).forEach(p => {
        const mias = cat.marcas.filter(m => m.sm === p.clave && conGuiones[m.slug]); if (!mias.length) return;
        const id = idDiscord_(cfg, p.clave); if (!id) { notas.push('Guiones · falta DISCORD_ID_' + p.clave.toUpperCase() + ' en Config'); return; }
        const ver = presenta.filter(c => mias.some(m => m.slug === c.m[0])).length;
        para(p.clave, id, 'Hola ' + p.nombre + '. Recordá que hoy, en la reunión de guiones de las ' + hora + ' h, tenés que presentar las ideas de reels de ' + (mias.length === 1 ? 'tu marca' : 'tus marcas') + ': **' + mias.map(m => m.nombre).join(', ') + '**.' +
          (ver ? '\nAdemás se ' + (ver === 1 ? 've 1 guion' : 'ven ' + ver + ' guiones') + ' de tus marcas que Fede ya entregó.' : ''));
      });
    }
    // filmmaker: un solo privado por día, corto. Cada tarjeta se nombra UNA sola vez por motivo (no se repite todos los días):
    //  · hoy tiene que entregar (reel: 48 h antes de salir; historia: el día anterior) → "si no vas a llegar, avisale al director creativo"
    //  · mañana vence (el sábado también lo del lunes) y lo que tiene etiqueta Urgente
    //  · se le venció (ya pasó el día de entrega y sigue pendiente)
    //  · sale hoy o mañana y sigue pendiente
    //  · viernes: RESUMEN de la semana que viene por marca y por tipo ("Tritato: 1 historia y 1 carrusel") y cuántas le quedaron pendientes
    const hoyF = o.ahora || hoyAR_(), dow = hoyF.getDay(), hoyMs = Date.parse(ymd_(hoyF) + 'T00:00:00Z');
    const diasA_ = f => Math.round((Date.parse(Utilities.formatDate(new Date(f), TZ, 'yyyy-MM-dd') + 'T00:00:00Z') - hoyMs) / 864e5);
    FILM_MOTIVOS.forEach(k => (P.getProperty('FILM_' + k.toUpperCase()) || '').split(',').forEach(x => { if (x) filmInfo.ya[k][x] = 1; }));
    const ya = filmInfo.ya;
    const tipoF = c => /carrusel/.test(norm_(c.n + ' ' + (c.lab || []).join(' '))) ? 'carrusel' : c.formato === 'historia' ? 'historia' : 'reel';
    const plural = { carrusel: 'carruseles', historia: 'historias', reel: 'reels' }, Tipo = { carrusel: 'Carrusel', historia: 'Historia', reel: 'Reel' };
    const urgente = c => (c.lab || []).some(x => /urgente/.test(norm_(x)));
    const lineaF = c => '• **' + nombreMarca_(cat, c.m[0]) + '** · ' + Tipo[tipoF(c)] + ' · ' + String(c.n).slice(0, 70) + (c.etapa === 'correccion' ? ' · a corregir' : '') + (urgente(c) ? ' · URGENTE' : '') + ' · sale ' + fechaAR_(c.salida) + ' · ' + c.url;
    const cuenta = L => { const n = {}; L.forEach(c => n[tipoF(c)] = (n[tipoF(c)] || 0) + 1); const det = ['reel', 'historia', 'carrusel'].filter(t => n[t]).map(t => n[t] + ' ' + (n[t] === 1 ? t : plural[t])); return det.length > 1 ? det.slice(0, -1).join(', ') + ' y ' + det.slice(-1) : det[0] || ''; };
    cat.equipo.filter(p => /film|audiovis/i.test(p.rol)).forEach(p => {
      const pend = pendientesFilm_(snap, filmConfig_(cfg, cat)).map(c => Object.assign({}, c, { dp: diasA_(new Date(c.salida).getTime() - (c.formato === 'historia' ? 24 : 48) * 36e5), ds: diasA_(c.salida) }));
      pend.forEach(c => filmInfo.pendientes.push(c.id));
      const atras = pend.filter(c => c.dp < 0), lim = dow === 6 ? 2 : 1; // el sábado también entra lo que vence el lunes (el domingo no se manda nada)
      const G = {
        hoy: pend.filter(c => !ya.hoy[c.id] && c.dp === 0),
        manana: pend.filter(c => !ya.manana[c.id] && c.dp >= 1 && c.dp <= lim),
        cerca: atras.filter(c => !ya.cerca[c.id] && c.ds >= 0 && c.ds <= 1)
      };
      G.vencida = atras.filter(c => !ya.vencida[c.id] && G.cerca.indexOf(c) < 0);
      G.urgente = pend.filter(c => !ya.urgente[c.id] && urgente(c) && c.dp > lim);
      const partes = [], bloque = (titulo, L, cierre) => { if (!L.length) return; partes.push((partes.length ? '\n' : '') + '**' + titulo + '**'); L.forEach(c => partes.push(lineaF(c))); if (cierre) partes.push(cierre); };
      if (dow === 5) {
        const ini = ((8 - dow) % 7) || 7, prox = pend.filter(c => c.ds >= ini && c.ds <= ini + 6);
        if (prox.length) {
          const porMarca = {}; prox.forEach(c => (porMarca[c.m[0]] = porMarca[c.m[0]] || []).push(c));
          partes.push('**Para la semana que viene tenés ' + (prox.length === 1 ? '1 pieza' : prox.length + ' piezas') + ':**');
          Object.keys(porMarca).sort((a, b) => porMarca[b].length - porMarca[a].length).forEach(s => partes.push('• **' + nombreMarca_(cat, s) + '**: ' + cuenta(porMarca[s])));
        }
        if (atras.length) {
          const marcasA = atras.map(c => nombreMarca_(cat, c.m[0])).filter((x, i, a) => a.indexOf(x) === i);
          partes.push((partes.length ? '\n' : '') + '**Te ' + (atras.length === 1 ? 'quedó pendiente' : 'quedaron pendientes') + ' de antes:** ' + cuenta(atras) + ' (' + marcasA.join(', ') + ')');
        }
      }
      bloque('Acordate que hoy tenés que entregar:', G.hoy, 'Si no vas a llegar, avisale al director creativo.');
      bloque('Acordate que ' + (dow === 6 && G.manana.some(c => c.dp === 2) ? 'entre mañana y el lunes' : 'mañana') + ' ' + (G.manana.length === 1 ? 'vence esta tarjeta' : 'vencen estas tarjetas') + ':', G.manana, 'Por favor avisame si no podés tener' + (G.manana.length === 1 ? 'la' : 'las') + ' a tiempo.');
      bloque('Ojo: ' + (G.cerca.length === 1 ? 'esta sale' : 'estas salen') + ' entre hoy y mañana y ' + (G.cerca.length === 1 ? 'sigue pendiente' : 'siguen pendientes') + ':', G.cerca);
      bloque((G.vencida.length === 1 ? 'Se te venció esta tarjeta' : 'Se te vencieron estas tarjetas') + ' (ya pasó el día de entrega):', G.vencida);
      bloque((G.urgente.length === 1 ? 'Esta tiene' : 'Estas tienen') + ' etiqueta Urgente:', G.urgente);
      if (!partes.length) return;
      const id = idDiscord_(cfg, p.clave);
      if (!id) { notas.push('Filmmaker · falta DISCORD_ID_' + p.clave.toUpperCase() + ' en Config'); return; }
      para(p.clave, id, trozos_('Hola ' + p.nombre + '.', partes).map((t, i, a) => i === a.length - 1 ? t + '\nEl detalle de todo está en el panel: https://ideamiacontacto-lab.github.io/panel-ideamia/' : t));
      FILM_MOTIVOS.forEach(k => G[k].forEach(c => filmInfo.nuevos[k][c.id] = p.clave));
    });
  }
  return { msgs: msgs, notas: notas, filtro: f, inputs: inp, inputsPorAvisar: sinAvisar, film: filmInfo };
}
/* Lo llama cada actualización. Mueve lo del filtro de CM y manda los privados; si un envío falla, queda anotado y se reintenta en la próxima. */
function privadosEnviar_(snap, cat, cfg) {
  const ahora = hoyAR_(), hoyId = ymd_(ahora), activos = !/^no$/i.test(String(cfg.PRIVADOS_DISCORD || 'si').trim());
  // diarios: de lunes a sábado, en la primera lectura entre las 9 y las 12 (si a esa hora el panel no corrió, ese día no salen: mejor que mandarlos tarde)
  const diarios = activos && ahora.getDay() !== 0 && ahora.getHours() >= 9 && ahora.getHours() < 12 && P.getProperty('PRIVADOS_DIA') !== hoyId;
  const r = privadosArmar_(snap, cat, cfg, { dry: false, diarios: diarios, ahora: ahora });
  const fallaron = {}; let error = '';
  if (activos) r.msgs.forEach(m => { try { discordPrivado_(m.id, m.texto); } catch (e) { fallaron[m.para] = 1; error = m.para + ': ' + String(e.message).replace(/[A-Za-z0-9_.-]{24,}/g, '…').slice(0, 160); } });
  // inputs: se dan por avisados los que salieron bien (o si los privados están apagados, para no acumular); los que fallaron se reintentan
  const avisados = r.inputs.marcados.filter(c => r.inputs.ya[c.id] || !activos || (r.inputsPorAvisar[c.id] && !fallaron[r.inputsPorAvisar[c.id]]) || r.inputs.primera).map(c => c.id);
  P.setProperty('INPUTS_AVISADOS', avisados.join(',').slice(0, 8800));
  P.setProperty('CM_REVISADAS', r.filtro.revisadas.join(',').slice(0, 8800));
  // filmmaker: queda anotado lo que ya se le avisó (mientras la pieza siga pendiente), para no repetirlo; lo que falló se reintenta mañana
  if (diarios) {
    const sigue = {}; r.film.pendientes.forEach(id => sigue[id] = 1);
    FILM_MOTIVOS.forEach(k => { const ya = r.film.ya[k], nuevos = r.film.nuevos[k]; P.setProperty('FILM_' + k.toUpperCase(), Object.keys(sigue).filter(id => ya[id] || (nuevos[id] && (!activos || !fallaron[nuevos[id]]))).join(',').slice(0, 8800)); });
  }
  if (diarios) P.setProperty('PRIVADOS_DIA', hoyId);
  if (error) P.setProperty('DISCORD_DM_ERROR', new Date().toISOString() + ' · ' + error); else if (r.msgs.length) P.deleteProperty('DISCORD_DM_ERROR');
  if (r.notas.length) P.setProperty('PRIVADOS_NOTAS', (new Date().toISOString() + ' · ' + r.notas.join(' | ')).slice(0, 900)); else P.deleteProperty('PRIVADOS_NOTAS');
  return r;
}
/* PRUEBA sin efectos: qué privado le llegaría al filmmaker hoy y cada uno de los próximos 7 días, con lo que hay ahora en Trello.
   No manda nada ni anota nada (por eso lo de "mañana vence" puede repetirse de un día al otro: en la realidad sale una sola vez). */
function probarAvisosFilm() {
  const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json'), cat = catalogo_(), cfg = config_(), hoy = hoyAR_();
  const film = cat.equipo.filter(p => /film|audiovis/i.test(p.rol)).map(p => p.clave), solo = { cards: (snap.cards || []).filter(c => c.cat === 'pieza'), tableros: snap.tableros };
  const pend = pendientesFilm_(snap, filmConfig_(cfg, cat));
  console.log('Foto de Trello: ' + snap.generado + ' · filmmaker: ' + film.join(', ') + ' · ID de Discord: ' + film.map(k => idDiscord_(cfg, k) ? 'cargado' : 'FALTA').join(', ') + ' · piezas pendientes con fecha: ' + pend.length);
  pend.slice(0, 25).forEach(c => console.log('   ' + nombreMarca_(cat, c.m[0]) + ' · ' + c.formato + ' · ' + c.etapa + ' · sale ' + fechaAR_(c.salida) + ' · ' + String(c.n).slice(0, 50) + ((c.lab || []).some(x => /urgente/.test(norm_(x))) ? ' · URGENTE' : '')));
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  for (let i = 0; i < 8; i++) {
    const d = new Date(hoy); d.setDate(d.getDate() + i);
    if (d.getDay() === 0) { console.log('— ' + DIAS[0] + ' ' + ymd_(d) + ': los domingos no se manda nada'); continue; }
    const m = privadosArmar_(solo, cat, cfg, { dry: true, diarios: true, ahora: d }).msgs.filter(x => film.indexOf(x.para) >= 0);
    console.log('— ' + DIAS[d.getDay()] + ' ' + ymd_(d) + ': ' + (m.length ? '\n' + m.map(x => x.texto).join('\n') : 'no le llega nada'));
  }
}
/* PRUEBA sin efectos: muestra qué movería el filtro de CM y qué privados saldrían (ahora, y los diarios de hoy, un martes y un viernes).
   No mueve tarjetas, no manda nada y no anota nada. */
function probarPrivados() {
  try { asegurarRutinas_(); } catch (e) {} // solo para que existan las filas de Config con los ID
  const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json'), cat = catalogo_(), cfg = config_(), hoy = hoyAR_();
  console.log('Foto de Trello: ' + snap.generado + ' · privados ' + (/^no$/i.test(String(cfg.PRIVADOS_DISCORD || 'si').trim()) ? 'APAGADOS' : 'encendidos'));
  console.log('IDs de Discord cargados: ' + cat.equipo.map(p => p.clave + (idDiscord_(cfg, p.clave) ? ' ✓' : ' ✗')).join(' · '));
  const dia = n => { const d = new Date(hoy); d.setDate(d.getDate() + ((n - d.getDay() + 7) % 7)); return d; };
  const r = privadosArmar_(snap, cat, cfg, { dry: true, diarios: true, ahora: hoy });
  console.log('FILTRO CM' + (r.filtro.primera ? ' (primera vez: revisa todo lo que ya hay)' : '') + ': movería ' + r.filtro.movidas.length + ' · avisaría al CM de ' + r.filtro.avisar.length + ' · problemas: ' + (r.filtro.problemas.join(' | ') || 'ninguno'));
  r.filtro.movidas.forEach(m => console.log('   ' + m.tablero + ' → ' + m.lista + ' · ' + String(m.titulo).slice(0, 60) + (m.sale ? ' · sale ' + fechaAR_(m.sale) : '')));
  console.log('INPUTS con etiqueta Urgente: ' + r.inputs.marcados.length + ' · ' + (r.inputs.primera ? 'es la PRIMERA vez: se toma nota de estos y se avisa solo de los que entren después' : 'nuevos sin avisar: ' + r.inputs.nuevos.length));
  r.inputs.marcados.slice(0, 12).forEach(c => console.log('   ' + c.tablero + ' · ' + String(c.n).slice(0, 60) + ' · ' + (c.lab || []).join(', ')));
  console.log('NOTAS: ' + (r.notas.join(' | ') || 'ninguna'));
  console.log('PRIVADOS QUE SALDRÍAN HOY (' + r.msgs.length + '):');
  r.msgs.forEach(m => console.log('→ ' + m.para + ' (' + m.texto.length + ' caracteres)\n' + m.texto));
  [['martes', dia(2)], ['viernes', dia(5)]].forEach(p => {
    const d = privadosArmar_({ cards: snap.cards.filter(c => c.tipo !== 'cm' && c.cat !== 'input'), tableros: snap.tableros }, cat, cfg, { dry: true, diarios: true, ahora: p[1] });
    console.log('DIARIOS de un ' + p[0] + ' (' + ymd_(p[1]) + '): ' + d.msgs.map(m => m.para + ' ' + m.texto.length + ' car.').join(' · '));
  });
}

/* ---------------- resumen de guiones para el canal del departamento (Discord) ----------------
   Los días de reunión de guiones (Config GUIONES_RESUMEN_DIAS, por defecto lunes y viernes) deja escrito a la mañana un resumen
   por marca: qué guiones hay para ver hoy, cuáles debe entregar Fede, cuáles siguen en corrección y qué social media presenta ideas.
   Igual que los avisos de diseño: se guarda en un JSON de Drive y un escenario de Make lo publica en el canal (Config GUIONES_CANAL).
   Cada persona va arrobada: Fede en lo que debe entregar, el social media en su marca, el filmmaker arriba. */
const GU_FEDE = '466080124303835147', GU_CANAL = '1522286878466900128'; // canal depto-guiones (Zona interna)
function guionesResumenArmar_(snap, cat, cfg, ahora) {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const dm = iso => Utilities.formatDate(new Date(iso), TZ, 'dd/MM');
  const diaDe = iso => Math.round((new Date(Utilities.formatDate(new Date(iso), TZ, "yyyy-MM-dd'T'00:00:00")).getTime() - hoy.getTime()) / 864e5);
  const arroba = clave => { const id = clave === 'fede' ? (idDiscord_(cfg, 'fede') || GU_FEDE) : idDiscord_(cfg, clave); return id ? '<@' + id + '>' : ''; };
  const titulo = c => /^https?:\/\//.test(String(c.n)) ? 'Guion sin título (no encuentro la idea original)' : String(c.n).slice(0, 90);
  const marcas = {}; (snap.tableros || []).filter(b => b.tipo === 'guiones' && b.marca).forEach(b => marcas[b.marca] = { ver: [], fede: [], corr: [] });
  (snap.cards || []).forEach(c => {
    if (c.cat !== 'guion' || c.salio || !marcas[c.m[0]]) return;
    const g = marcas[c.m[0]], sale = c.salida ? ' · sale el ' + dm(c.salida) : '', link = ' · ' + c.url;
    if (c.gest === 'revisar') g.ver.push('• **' + titulo(c) + '**' + sale + link);
    else if (c.gest === 'correccion') g.corr.push('• **' + titulo(c) + '**' + sale + link);
    else if (c.gest === 'pendiente') {
      const d = c.entrega ? diaDe(c.entrega) : null;
      if (d !== null && d > 7) return; // lo que se entrega más adelante no hace ruido hoy
      g.fede.push({ d: d === null ? 99 : d, t: '• **' + titulo(c) + '** · ' + (d === null ? 'sin fecha de entrega' : d < 0 ? 'debía entregarse el ' + dm(c.entrega) : d === 0 ? 'se entrega hoy' : 'se entrega el ' + dm(c.entrega)) + sale + link });
    }
  });
  let nVer = 0, nFede = 0, nCorr = 0; const lineas = [], personas = {};
  Object.keys(marcas).sort().forEach(slug => {
    const g = marcas[slug], m = cat.marcas.filter(x => x.slug === slug)[0] || {}, sm = arroba(m.sm);
    nVer += g.ver.length; nFede += g.fede.length; nCorr += g.corr.length; if (sm) personas[sm] = 1;
    lineas.push('', '**' + nombreMarca_(cat, slug).toUpperCase() + '**' + (sm ? ' · ' + sm + ' presenta las ideas nuevas' : ' · se presentan las ideas nuevas'));
    if (g.ver.length) { lineas.push('Para ver hoy (' + g.ver.length + '):'); g.ver.forEach(x => lineas.push(x)); }
    if (g.corr.length) { lineas.push(arroba('fede') + ' en corrección (' + g.corr.length + '):'); g.corr.forEach(x => lineas.push(x)); }
    if (g.fede.length) { lineas.push(arroba('fede') + ' por entregar (' + g.fede.length + '):'); g.fede.sort((a, b) => a.d - b.d).forEach(x => lineas.push(x.t)); }
    if (!g.ver.length && !g.corr.length && !g.fede.length) lineas.push('Sin guiones pendientes.');
  });
  const film = cat.equipo.filter(p => /film|audiovis/i.test(p.rol)).map(p => arroba(p.clave)).filter(Boolean);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const cabeza = '📋 **Reunión de guiones · ' + dias[hoy.getDay()] + ' ' + Utilities.formatDate(hoy, TZ, 'dd/MM') + ' · ' + String(cfg.GUIONES_HORA || '16:00') + ' h**\n' +
    (nVer ? 'Hoy tenemos que ver **' + nVer + (nVer === 1 ? ' guion' : ' guiones') + '**' : 'Hoy no hay guiones entregados para ver') +
    (nCorr ? ', hay ' + nCorr + ' en corrección' : '') + (nFede ? ' y ' + nFede + ' por entregar' : '') + '. Además cada social media presenta sus ideas nuevas.\n' +
    [arroba('fede')].concat(Object.keys(personas), film).filter(Boolean).join(' ');
  return { textos: trozos_(cabeza, lineas), ver: nVer, fede: nFede, corr: nCorr };
}
function guionesDiaDeResumen_(cfg, ahora) {
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return lista_(cfg.GUIONES_RESUMEN_DIAS == null || cfg.GUIONES_RESUMEN_DIAS === '' ? 'lunes,viernes' : cfg.GUIONES_RESUMEN_DIAS).some(x => dias[ahora.getDay()].indexOf(norm_(x).slice(0, 3)) === 0);
}
/* Lo corre el disparador de cada mañana (8:45). Los días que no hay reunión deja el archivo sin mensajes. */
/* ---------------- avisos en el canal de cada marca (filmmaker y diseñadoras) ----------------
   Además del privado, algunas cosas se dicen en el canal de la marca para que dirección esté al tanto. El panel no escribe en canales:
   deja los mensajes en el mismo archivo que arma guionesResumen() y el escenario de Make que lo lee a las 9:05 los publica en el canal
   que diga cada uno. Son avisos del día (no hace falta acordarse de cuáles ya se mandaron):
    · filmmaker, canal de producción de la marca: lo que HOY tiene que entregar (reel: 48 h antes de salir; historia: el día anterior)
      y, los viernes, cuántos reels e historias tiene que entregar la semana que viene de esa marca;
    · diseñadoras, canal de diseño de la marca: lo que sale mañana y sigue pendiente (lo cargaron tarde o es urgente). */
// Canal de producción de cada marca: se busca en Discord por el nombre del canal (producción, video, audiovisual, reels) y la marca
// (por su nombre, el del canal padre o el de la categoría). Se guarda una semana. Se puede forzar en Config: CANAL_PRODUCCION_<MARCA>.
function canalesProduccion_(cat, cfg, forzar) {
  let g = null; try { g = JSON.parse(P.getProperty('CANALES_PRODUCCION') || 'null'); } catch (e) {}
  if (!forzar && g && g.t && Date.now() - g.t < 7 * 864e5) return g.canales || {};
  const puente = String(cfg.DISCORD_PUENTE || '').trim().replace(/\/+$/, ''), clave = P.getProperty('DISCORD_PUENTE_CLAVE'), guild = String(cfg.DISCORD_SERVIDOR || '').trim();
  if (!puente || !clave || !/^\d{15,22}$/.test(guild)) return (g && g.canales) || {};
  PEDIDOS_++;
  const r = UrlFetchApp.fetch(puente + '/api/v10/guilds/' + guild + '/channels', { headers: { 'x-clave': clave }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return (g && g.canales) || {};
  const todos = JSON.parse(r.getContentText()), porId = {}, canales = {}, vistos = [];
  todos.forEach(c => porId[c.id] = c);
  todos.filter(c => c.type === 0 || c.type === 5).forEach(c => {
    const padre = porId[c.parent_id], nombre = norm_(c.name), entero = c.name + ' ' + (padre ? padre.name : '');
    if (!/producci|video|audiov|film|reel/.test(nombre)) return;
    const slug = marcasEn_(entero, cat.marcas)[0]; vistos.push(c.name + ' (' + (padre ? padre.name : '-') + ') → ' + (slug || 'sin marca'));
    if (slug && (!canales[slug] || /producci/.test(nombre))) canales[slug] = c.id;
  });
  P.setProperty('CANALES_PRODUCCION', JSON.stringify({ t: Date.now(), canales: canales, vistos: vistos.slice(0, 60) }).slice(0, 8800));
  return canales;
}
function canalProduccion_(cat, cfg, slug) {
  const m = cat.marcas.filter(x => x.slug === slug)[0], forzado = String(cfg['CANAL_PRODUCCION_' + String(slug).toUpperCase().replace(/[^A-Z0-9]+/g, '_')] || '').trim();
  return /^\d{15,22}$/.test(forzado) ? forzado : (canalesProduccion_(cat, cfg)[slug] || '');
}
function avisosCanalArmar_(snap, cat, cfg, ahora) {
  const out = [], notas = [], dow = ahora.getDay(), hoyMs = Date.parse(ymd_(ahora) + 'T00:00:00Z');
  if (dow === 0) return { mensajes: out, notas: notas };
  const diasA_ = f => Math.round((Date.parse(Utilities.formatDate(new Date(f), TZ, 'yyyy-MM-dd') + 'T00:00:00Z') - hoyMs) / 864e5);
  const dm = f => Utilities.formatDate(new Date(f), TZ, 'dd/MM');
  const urgente = c => (c.lab || []).some(x => /urgente/.test(norm_(x)));
  // filmmaker
  const tipoF = c => /carrusel/.test(norm_(c.n + ' ' + (c.lab || []).join(' '))) ? 'carrusel' : c.formato === 'historia' ? 'historia' : 'reel';
  const plural = { carrusel: 'carruseles', historia: 'historias', reel: 'reels' }, Tipo = { carrusel: 'Carrusel', historia: 'Historia', reel: 'Reel' };
  const cuenta = L => { const n = {}; L.forEach(c => n[tipoF(c)] = (n[tipoF(c)] || 0) + 1); const det = ['reel', 'historia', 'carrusel'].filter(t => n[t]).map(t => n[t] + ' ' + (n[t] === 1 ? t : plural[t])); return det.length > 1 ? det.slice(0, -1).join(', ') + ' y ' + det.slice(-1) : det[0] || ''; };
  cat.equipo.filter(p => /film|audiovis/i.test(p.rol)).forEach(p => {
    const id = idDiscord_(cfg, p.clave), arroba = id ? '<@' + id + '>' : p.nombre;
    const pend = pendientesFilm_(snap, filmConfig_(cfg, cat)).map(c => Object.assign({}, c, { dp: diasA_(new Date(c.salida).getTime() - (c.formato === 'historia' ? 24 : 48) * 36e5), ds: diasA_(c.salida) }));
    const porMarca = {}; pend.forEach(c => { const g = porMarca[c.m[0]] = porMarca[c.m[0]] || { hoy: [], prox: [] }; if (c.dp === 0) g.hoy.push(c); if (dow === 5 && c.ds >= 3 && c.ds <= 9) g.prox.push(c); });
    Object.keys(porMarca).forEach(slug => {
      const g = porMarca[slug], lineas = [];
      if (g.hoy.length) {
        lineas.push('**Hoy ' + (g.hoy.length === 1 ? 'tiene que quedar entregada esta pieza' : 'tienen que quedar entregadas estas piezas') + ':**');
        g.hoy.forEach(c => lineas.push('• ' + Tipo[tipoF(c)] + ' · **' + String(c.n).slice(0, 80) + '**' + (c.etapa === 'correccion' ? ' · a corregir' : '') + (urgente(c) ? ' · URGENTE' : '') + ' · sale el ' + dm(c.salida) + ' · ' + c.url));
        lineas.push('Si no vas a llegar, avisale al director creativo.');
      }
      if (g.prox.length) lineas.push((lineas.length ? '\n' : '') + '**La semana que viene tenés que entregar:** ' + cuenta(g.prox) + '.');
      if (!lineas.length) return;
      const canal = canalProduccion_(cat, cfg, slug);
      if (!canal) { notas.push('Filmmaker · ' + nombreMarca_(cat, slug) + ' no tiene canal de producción reconocido (se puede cargar CANAL_PRODUCCION_' + slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + ' en Config)'); return; }
      trozos_('🎬 ' + arroba + ' · **' + nombreMarca_(cat, slug).toUpperCase() + '**', lineas).forEach(t => out.push({ canal: canal, texto: t.slice(0, 1950) }));
    });
  });
  // diseñadoras: lo que sale mañana (el sábado también lo del lunes) y sigue en "Pendiente de diseño"
  if (typeof AV_MARCAS !== 'undefined') {
    const porTablero = {};
    (snap.cards || []).forEach(c => {
      if (c.cat !== 'pieza' || c.tipo !== 'diseno' || c.salio || c.etapa !== 'pendiente' || !c.salida || /pedido/.test(norm_(c.lista))) return;
      const k = norm_(c.tablero), ds = diasA_(c.salida); if (!AV_MARCAS[k] || !(ds >= 1 && ds <= (dow === 6 ? 2 : 1))) return;
      (porTablero[k] = porTablero[k] || []).push(c);
    });
    Object.keys(porTablero).forEach(k => {
      const L = porTablero[k], a = AV_MARCAS[k];
      const lineas = L.map(c => '• **' + String(c.n).slice(0, 80) + '**' + (urgente(c) ? ' · URGENTE' : '') + ' · sale el ' + dm(c.salida) + ' · ' + c.url);
      lineas.push('Si no llegás, avisá así vemos cómo resolverlo.');
      trozos_('⏰ <@' + a.quien + '> · **' + a.marca + '** · ' + (L.length === 1 ? 'esta pieza sale' : 'estas piezas salen') + (dow === 6 ? ' entre mañana y el lunes' : ' mañana') + ' y ' + (L.length === 1 ? 'sigue pendiente' : 'siguen pendientes') + ':', lineas).forEach(t => out.push({ canal: a.canal, texto: t.slice(0, 1950) }));
    });
  }
  return { mensajes: out, notas: notas };
}
/* PRUEBA sin efectos: qué canales de producción reconoce por marca y qué mensajes de canal saldrían hoy y los próximos 7 días. No publica nada. */
function probarAvisosCanal() {
  const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json'), cat = catalogo_(), cfg = config_(), hoy = hoyAR_();
  const canales = canalesProduccion_(cat, cfg, true);
  console.log('Canales de producción reconocidos: ' + (Object.keys(canales).map(s => nombreMarca_(cat, s) + ' → ' + canales[s]).join(' · ') || 'NINGUNO'));
  try { console.log('Canales que miré: ' + (JSON.parse(P.getProperty('CANALES_PRODUCCION') || '{}').vistos || []).join(' | ')); } catch (e) {}
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  for (let i = 0; i < 8; i++) {
    const d = new Date(hoy); d.setDate(d.getDate() + i);
    const r = avisosCanalArmar_(snap, cat, cfg, d);
    console.log('— ' + DIAS[d.getDay()] + ' ' + ymd_(d) + ': ' + (r.mensajes.length ? r.mensajes.length + ' mensajes\n' + r.mensajes.map(m => '[canal ' + m.canal + ']\n' + m.texto).join('\n') : 'nada') + (r.notas.length ? '\nNOTAS: ' + r.notas.join(' | ') : ''));
  }
}

/* Piezas de diseño que salen mañana (el sábado también las del lunes) y siguen en "Pendiente de diseño", por tablero. No cuenta los pedidos extra. */
function disenoPorSalir_(snap, ahora) {
  const out = {}; if (typeof AV_MARCAS === 'undefined') return out;
  const dow = ahora.getDay(), hoyMs = Date.parse(ymd_(ahora) + 'T00:00:00Z');
  (snap.cards || []).forEach(c => {
    if (c.cat !== 'pieza' || c.tipo !== 'diseno' || c.salio || c.etapa !== 'pendiente' || !c.salida || /pedido/.test(norm_(c.lista))) return;
    const k = norm_(c.tablero), ds = Math.round((Date.parse(Utilities.formatDate(new Date(c.salida), TZ, 'yyyy-MM-dd') + 'T00:00:00Z') - hoyMs) / 864e5);
    if (AV_MARCAS[k] && ds >= 1 && ds <= (dow === 6 ? 2 : 1)) (out[k] = out[k] || []).push(c);
  });
  return out;
}
function guionesResumen() {
  const ahora = hoyAR_(), cfg = config_(), snap = snapshot_(), canal = String(cfg.GUIONES_CANAL || GU_CANAL).trim();
  const viejo = !snap.generado || (Date.now() - new Date(snap.generado).getTime()) > 3 * 36e5; // con la foto de Trello vieja, mejor no avisar
  let mensajes = [];
  if (guionesDiaDeResumen_(cfg, ahora) && !viejo && /^\d{15,22}$/.test(canal)) mensajes = guionesResumenArmar_(snap, catalogo_(), cfg, ahora).textos.map(t => ({ canal: canal, texto: t.slice(0, 1950) }));
  // avisos del día para el canal de cada marca (filmmaker y diseñadoras): van en el mismo archivo, cada uno con su canal
  let deCanal = 0; if (!viejo) { try { const av = avisosCanalArmar_(snap, catalogo_(), cfg, ahora); deCanal = av.mensajes.length; mensajes = mensajes.concat(av.mensajes); if (av.notas.length) P.setProperty('CANAL_NOTAS', (new Date().toISOString() + ' · ' + av.notas.join(' | ')).slice(0, 900)); else P.deleteProperty('CANAL_NOTAS'); } catch (e) { P.setProperty('CANAL_NOTAS', new Date().toISOString() + ' · error: ' + String(e.message).slice(0, 300)); } }
  const f = archivo_('GUIONES_FILE_ID', 'panel-ideamia-resumen-guiones.json');
  f.setContent(JSON.stringify({ fecha: ymd_(new Date()), generado: new Date().toISOString(), fotoTrello: snap.generado || null, mensajes: mensajes }));
  return { archivo: f.getId(), mensajes: mensajes.length, deCanal: deCanal, viejo: viejo, canal: canal };
}
/* Correr una vez desde el editor: deja el archivo visible para quien tenga el link (así lo lee Make) y programa el armado diario. */
function instalarResumenGuiones() {
  try { asegurarRutinas_(); } catch (e) {}
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'guionesResumen').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('guionesResumen').timeBased().everyDays(1).atHour(8).nearMinute(45).create();
  const r = guionesResumen();
  DriveApp.getFileById(r.archivo).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  console.log('ARCHIVO_GUIONES=' + r.archivo + ' mensajes=' + r.mensajes + ' viejo=' + r.viejo + ' canal=' + (r.canal || 'FALTA GUIONES_CANAL en Config'));
  return r;
}
/* PRUEBA sin efectos: muestra el resumen que saldría un lunes y los canales de Discord que nombran "guion" (para elegir GUIONES_CANAL). */
function probarResumenGuiones() {
  try { asegurarRutinas_(); } catch (e) {}
  const cfg = config_(), cat = catalogo_(), snap = snapshot_(), hoy = hoyAR_();
  const lunes = new Date(hoy); lunes.setDate(lunes.getDate() + ((1 - lunes.getDay() + 7) % 7));
  const r = guionesResumenArmar_(snap, cat, cfg, lunes);
  console.log('Canal configurado: ' + (cfg.GUIONES_CANAL || GU_CANAL + ' (depto-guiones, por defecto)') + ' · días: ' + (cfg.GUIONES_RESUMEN_DIAS || 'lunes,viernes') + ' · hoy toca: ' + guionesDiaDeResumen_(cfg, hoy));
  console.log('RESUMEN de un lunes (' + ymd_(lunes) + '): ' + r.textos.length + ' mensaje(s) · ver ' + r.ver + ' · corrección ' + r.corr + ' · por entregar ' + r.fede);
  r.textos.forEach(t => console.log('(' + t.length + ' caracteres)\n' + t));
  try {
    const puente = String(cfg.DISCORD_PUENTE || '').trim().replace(/\/+$/, ''), clave = P.getProperty('DISCORD_PUENTE_CLAVE'), guild = String(cfg.DISCORD_SERVIDOR || '').trim();
    const ch = JSON.parse(UrlFetchApp.fetch(puente + '/api/v10/guilds/' + guild + '/channels', { headers: { 'x-clave': clave }, muteHttpExceptions: true }).getContentText()), nom = {};
    ch.forEach(c => nom[c.id] = c.name);
    console.log('CANALES con "guion":\n' + ch.filter(c => c.type !== 4 && /guion/i.test(c.name + ' ' + (nom[c.parent_id] || ''))).map(c => c.id + ' · ' + (nom[c.parent_id] || 'sin categoría') + ' / ' + c.name).join('\n'));
  } catch (e) { console.log('No pude leer los canales: ' + e.message); }
}

/* MUESTRAS: le manda a JOAQUÍN por privado un ejemplo de cada aviso, armado con los datos reales de hoy y con el mismo código
   que arma los de verdad. No le escribe a nadie más, no mueve tarjetas y no anota nada como avisado.
   (Las menciones dentro de un privado no le suenan a nadie: solo se ven.) */
function pruebaMuestras() {
  const cfg = config_(), cat = catalogo_(), snap = snapshot_(), hoy = hoyAR_();
  const puente = String(cfg.DISCORD_PUENTE || '').trim().replace(/\/+$/, ''), clave = P.getProperty('DISCORD_PUENTE_CLAVE'), guild = String(cfg.DISCORD_SERVIDOR || '').trim();
  const r = UrlFetchApp.fetch(puente + '/api/v10/guilds/' + guild + '/members/search?query=joaquin&limit=10', { headers: { 'x-clave': clave }, muteHttpExceptions: true });
  const yo = (r.getResponseCode() < 300 ? JSON.parse(r.getContentText()).map(m => m.user).filter(u => u && !u.bot) : []).filter(u => /joaquinyarce/i.test(u.username))[0];
  if (!yo) { console.log('No encontré a Joaquín en el servidor (código ' + r.getResponseCode() + ')'); return; }
  const dia = n => { const d = new Date(hoy); d.setDate(d.getDate() + ((n - d.getDay() + 7) % 7)); return d; };
  const corta = (t, n) => { const L = String(t).split('\n'); return L.length > n ? L.slice(0, n).join('\n') + '\n… (y ' + (L.length - n) + ' líneas más)' : t; };
  const M = [], suma = (quien, cuando, texto) => M.push('**MUESTRA ' + (M.length + 1) + ' · ' + quien + '**\n*' + cuando + '*\n▔▔▔▔▔▔▔▔▔▔\n' + corta(texto, 14));
  const panel = 'https://ideamiacontacto-lab.github.io/panel-ideamia/';
  // 1 y 2) social media: input con etiqueta Urgente
  const urg = inputsParaAvisar_(snap, cat).marcados;
  ['orne', 'rama'].forEach(k => {
    const L = urg.filter(c => ((cat.marcas.filter(x => x.slug === c.m[0])[0] || {}).sm) === k).slice(0, 2);
    const lineas = L.length ? L.map(c => '• **' + nombreMarca_(cat, c.m[0]) + '** · ' + String(c.n).slice(0, 90) + ' · ' + (c.lab || []).filter(x => /urgente/.test(norm_(x))).join(', ') + (c.due ? ' · vence ' + fechaAR_(c.due) : '') + ' · ' + c.url)
      : ['• **(marca)** · (nombre del input) · Urgente · vence dd/mm · (link)'];
    suma('privado a ' + nombreDe_(k), 'En el momento en que le cargan un input con etiqueta Urgente. Una sola vez por input.' + (L.length ? '' : ' Hoy no tiene ninguno: va con datos de ejemplo.'),
      'Hola ' + nombreDe_(k) + '. Por favor mirá ' + (lineas.length === 1 ? 'este input que te cargaron' : 'estos ' + lineas.length + ' inputs que te cargaron') + ':\n' + lineas.join('\n') + '\nCuando lo veas, marcalo en el panel: ' + panel);
  });
  // 3 y 4) diseñadoras: lo que faltó de la entrega de ayer (martes y viernes)
  const sinCM = { cards: snap.cards.filter(c => c.tipo !== 'cm' && c.cat !== 'input'), tableros: snap.tableros };
  [['martes', dia(2)], ['viernes', dia(5)]].forEach(p => {
    const d = privadosArmar_(sinCM, cat, cfg, { dry: true, diarios: true, ahora: p[1] }).msgs.filter(m => m.para === 'luisi' || m.para === 'zaira');
    ['luisi', 'zaira'].forEach(k => {
      if (M.some(x => x.indexOf('privado a ' + nombreDe_(k)) > 0)) return;
      const m = d.filter(x => x.para === k)[0];
      if (m) suma('privado a ' + nombreDe_(k), 'Martes y viernes a la mañana (el día después de cada entrega), solo si le faltó entregar algo. Datos de un ' + p[0] + '.', m.texto);
    });
  });
  ['luisi', 'zaira'].forEach(k => { if (!M.some(x => x.indexOf('privado a ' + nombreDe_(k)) > 0)) suma('privado a ' + nombreDe_(k), 'Martes y viernes a la mañana, solo si le faltó entregar algo. Hoy no le falta nada: va con datos de ejemplo.',
    'Hola. Esto quedó sin entregar de la entrega de ayer (también está en el canal de cada marca):\n**(MARCA)**\n• **(nombre del diseño)** · sale el dd/mm · (link)'); });
  // 5 y 6) filmmaker: piezas atrasadas y recordatorio de la reunión a la que no fue
  const atr = atrasadasFilm_(snap, filmConfig_(cfg, cat)).slice(0, 4);
  const lf = atr.length ? atr.map(c => '• **' + nombreMarca_(cat, c.m[0]) + '** · ' + (c.formato === 'historia' ? 'Historia' : 'Reel') + ' · ' + String(c.n).slice(0, 80) + (c.etapa === 'correccion' ? ' · A CORREGIR' : '') + ' · ' + (new Date(c.salida) < new Date() ? 'salía ' : 'sale ') + fechaAR_(c.salida) + ' · ' + c.url)
    : ['• **(marca)** · Reel · (nombre) · sale dd/mm hh:mm · (link)'];
  suma('privado a Bauti', 'A la mañana, una sola vez por pieza, cuando ya tendría que estar entregada.' + (atr.length ? '' : ' Hoy no tiene atrasadas: va con datos de ejemplo.'),
    'Hola Bauti. ' + (lf.length === 1 ? 'Esta pieza ya tendría que estar entregada' : 'Estas ' + lf.length + ' piezas ya tendrían que estar entregadas') + ' (reels: 48 h antes de salir; historias: el día anterior):\n' + lf.join('\n') + '\nCuando las tengas, marcá "Listo" en el panel: ' + panel);
  suma('privado a Bauti', 'Una hora después de una reunión de guiones en la que marcó "No voy". Una sola vez por reunión.',
    'Hola Bauti. No estuviste en la reunión de guiones y presentación de ideas del ' + Utilities.formatDate(dia(1), TZ, 'dd/MM') + '. Preguntá qué ideas se presentaron y de qué se tratan, así sabés qué vas a filmar. Cuando lo tengas, marcá "Ya pregunté" en el panel: ' + panel);
  // 7) canal depto-guiones: resumen de la reunión
  suma('canal depto-guiones', 'Lunes y viernes 9:05. Datos reales, como saldría este lunes.', guionesResumenArmar_(snap, cat, cfg, dia(1)).textos[0]);
  // 8) canal de diseño de cada marca: avisos de la mañana
  if (typeof avisosDisenoArmar_ === 'function') {
    const av = avisosDisenoArmar_(dia(2), snap.cards)[0] || avisosDisenoArmar_(hoy, snap.cards)[0];
    if (av) suma('canal de diseño de ' + av.marca, 'Lunes a sábado 9:05, solo si hay algo que avisar (urgentes, faltantes, extras, correcciones).', av.texto);
  }
  // 9 a 12) avisos de canal que manda Make en el momento, con una tarjeta real
  const fmt = (iso, f) => iso ? Utilities.formatDate(new Date(iso), TZ, f) : 'sin fecha';
  const cm = snap.cards.filter(c => c.tipo === 'cm' && /listo para programar/.test(norm_(c.lista)))[0], oc = c => { const s = (/trello\.com\/c\/([A-Za-z0-9]+)/.exec(c.n) || [])[1]; let o = null; try { o = s && trello_('/cards/' + s, { fields: 'name,due,labels,shortUrl,desc' }); } catch (e) {} return o; };
  const o1 = cm && oc(cm);
  const datosCM = o1 ? '**Qué es:** ' + o1.name + '\n**Sale:** ' + fmt(o1.due, 'dd/MM HH:mm') + '\n**Etiquetas:** ' + ((o1.labels || []).map(x => x.name).filter(Boolean).join(', ') || 'sin etiquetas') + '\n' + o1.shortUrl : '**Qué es:** (título)\n**Sale:** dd/mm hh:mm\n**Etiquetas:** …\n(link)';
  const mc = cm ? nombreMarca_(cat, cm.m[0]).toUpperCase() : 'MARCA';
  suma('canal de CM de ' + mc + ' (arroba a Ale)', 'En el momento en que una pieza entra a "Listo para programar".', '<@' + (idDiscord_(cfg, 'ale') || '') + '> · ' + mc + ' · PARA PROGRAMAR\n' + datosCM);
  suma('canal de CM de ' + mc + ' (arroba a Ale)', 'En el momento en que una pieza entra a "Contenido no programable".', '<@' + (idDiscord_(cfg, 'ale') || '') + '> · ' + mc + ' · NO PROGRAMABLE (lleva interacción, se publica a mano)\n' + datosCM);
  const gu = snap.cards.filter(c => c.cat === 'guion' && !/^https?:/.test(c.n))[0], mg = gu ? nombreMarca_(cat, gu.m[0]).toUpperCase() : 'MARCA';
  suma('canal de guiones de ' + mg + ' (arroba a Fede)', 'En el momento en que entra una idea a "Ideas Recibidas".',
    '<@' + GU_FEDE + '> · ' + mg + ' · UNA NUEVA IDEA SE CARGÓ\n**Idea:** ' + (gu ? gu.n : '(nombre de la idea)') + '\n**Entregar el guion antes del:** ' + Utilities.formatDate(new Date(Date.now() + 7 * 864e5), TZ, 'dd/MM') + ' (7 días)\n**Sale:** ' + fmt(gu && gu.salida, 'dd/MM') + '\n' + (gu ? gu.ourl || gu.url : '(link)') + '\n\n(acá va la descripción de la idea)');
  suma('canal de guiones de ' + mg + ' (arroba a todos)', 'En el momento en que Fede pasa un guion a "Guiones listos para revisión".',
    '@everyone · ' + mg + ' · GUION LISTO PARA REVISAR\n**Guion:** ' + (gu ? gu.n : '(nombre)') + '\n**Sale:** ' + fmt(gu && gu.salida, 'dd/MM') + '\n**Tarjeta del guion:** ' + (gu ? gu.url : '(link)') + '\n**Idea original:** ' + (gu ? gu.ourl || gu.url : '(link)') + '\nFede ya lo dejó para ver. ¿Coordinamos la reunión para revisarlo?');
  let ok = 0; const fallas = [];
  try { discordPrivado_(yo.id, '**Panel Ideamia · muestras de los avisos**\nVan ' + M.length + ' mensajes: uno por cada aviso que recibe el equipo, con datos reales de hoy. Arriba de cada uno dice a quién le llega y cuándo. Nadie más recibe esto.'); } catch (e) { fallas.push('intro: ' + e.message); }
  M.forEach((t, i) => { try { Utilities.sleep(700); discordPrivado_(yo.id, t); ok++; } catch (e) { fallas.push((i + 1) + ': ' + e.message); } });
  console.log('Muestras enviadas a ' + yo.username + ': ' + ok + ' de ' + M.length + (fallas.length ? ' · FALLAS: ' + fallas.join(' | ') : ''));
  M.forEach(t => console.log(t.split('\n').slice(0, 2).join(' · ') + ' (' + t.length + ' caracteres)'));
}

/* PRUEBA sin efectos: compara la lectura de siempre (2 pedidos por tablero) con la lectura unida (1 pedido por tablero).
   Tienen que dar las mismas tarjetas, con las mismas etiquetas y adjuntos, en todos los tableros. */
const RUTA_TABLERO_ = id => '/boards/' + id + '?fields=name&lists=open&list_fields=name,pos&labels=all&label_fields=name,color&labels_limit=100' +
  '&cards=open&card_fields=name,desc,due,dueComplete,start,idList,shortUrl,dateLastActivity,labels&card_attachments=true&card_attachment_fields=name,url,mimeType';
function probarLecturaUnida() {
  const cat = catalogo_(), boards = trello_('/members/me/boards', { filter: 'open', fields: 'name,shortUrl' });
  const el = boards.filter(b => tipoTablero_(b.name) || norm_(b.name) === 'project');
  const t0 = Date.now(), A = trelloVarios_(el.map(b => '/boards/' + b.id + '/cards?filter=open&fields=name,desc,due,dueComplete,start,idList,shortUrl,dateLastActivity,labels&attachments=true&attachment_fields=name,url,mimeType'));
  const t1 = Date.now(), B = trelloVarios_(el.map(b => RUTA_TABLERO_(b.id))), t2 = Date.now();
  const firma = L => (L || []).map(c => [c.id, c.name, c.due, c.dueComplete, c.start, c.idList, c.shortUrl, String(c.desc || '').length, (c.labels || []).map(x => x.name).join(','), (c.attachments || []).map(a => a.url).join(',')].join('|')).sort().join('\n');
  let iguales = 0; const dif = [];
  el.forEach((b, i) => {
    if (!A[i] || !B[i]) { dif.push(b.name + ': sin respuesta (' + A.codigos[i] + '/' + B.codigos[i] + ')'); return; }
    if (firma(A[i]) === firma(B[i].cards)) iguales++; else dif.push(b.name + ': ' + A[i].length + ' tarjetas contra ' + (B[i].cards || []).length);
  });
  console.log('Tableros: ' + el.length + ' · iguales: ' + iguales + ' · distintos: ' + dif.length + ' · tarjetas: ' + A.reduce((s, x) => s + (x ? x.length : 0), 0));
  console.log('Tiempo lectura de siempre (solo tarjetas): ' + (t1 - t0) + ' ms · lectura unida (todo): ' + (t2 - t1) + ' ms · la más grande: ' + Math.max.apply(null, A.map(x => x ? x.length : 0)) + ' tarjetas');
  if (dif.length) console.log('DISTINTOS:\n' + dif.join('\n'));
  // si coincide todo, la lectura unida queda encendida; si algo difiere, se vuelve a la de siempre
  if (!dif.length && iguales === el.length) { P.setProperty('LECTURA_UNIDA', 'si'); console.log('LECTURA UNIDA ENCENDIDA'); } else { P.deleteProperty('LECTURA_UNIDA'); console.log('Se sigue con la lectura de siempre'); }
}
/* Para ver el gasto del día: pedidos a otros servicios (tope de Google: 20.000) y segundos de lectura (tope: 90 minutos = 5.400). */
function verUso() { console.log(P.getProperty('USO_DIA') + ' · lectura unida: ' + P.getProperty('LECTURA_UNIDA') + ' · canales de Discord sin permiso: ' + ((JSON.parse(P.getProperty('DISCORD_SIN_PERMISO') || '{}').ids || []).length)); }

/* ---------------- tareas del mes por privado (social media) ----------------
   El primer día hábil de cada mes, a la mañana, cada social media recibe por privado de Discord su lista del mes:
   lo que se hace una vez en el mes (con su ventana de días), las reuniones, lo de todas las semanas y lo de todos los días.
   Sale de las pestañas Rutinas y Reuniones del Sheet: si se cambia algo ahí, el mes siguiente ya llega cambiado.
   Se apaga con Config TAREAS_MES_DISCORD = no (o con PRIVADOS_DISCORD = no, que apaga todos los privados). */
function tareasDelMesArmar_(p, cat, fecha, snap) {
  const NOM_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const NOM_DIA = { dom: 'Domingo', lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado' };
  const mes = fecha.getMonth() + 1, ultimo = finDeMes_(fecha), esCM = /cm/i.test(p.rol);
  const mias = cat.marcas.filter(m => m.sm === p.clave || m.cm === p.clave);
  if (!mias.length) return null;
  // a qué marcas aplica cada tarea: todas las mías, solo las que tienen canal, ninguna en particular, o una lista
  const marcasDe = porMarca => {
    const v = norm_(String(porMarca === true ? 'si' : porMarca === false ? 'no' : porMarca || 'no'));
    if (v === 'si' || v === 'sí') return { txt: mias.length > 1 ? 'todas tus marcas' : mias[0].nombre };
    if (v === 'canal') { const L = mias.filter(m => m.canal); return L.length ? { txt: L.map(m => m.nombre).join(', ') } : null; }
    if (v === 'no') return { txt: '' };
    const l = lista_(v), L = mias.filter(m => l.some(x => m.slug === x.replace(/[^a-z0-9]+/g, '-') || (m.alias || []).indexOf(x) >= 0 || norm_(m.nombre) === x));
    return L.length ? { txt: L.map(m => m.nombre).join(', ') } : null;
  };
  const ventana = cuando => {
    const m = /^(?:meses:([\d,]+)\/)?(?:mes:)?(ultima-semana|\d+-\d+)$/.exec(cuando); if (!m) return null;
    if (m[1] && m[1].split(',').map(Number).indexOf(mes) < 0) return { fuera: true };
    let a, b; if (m[2] === 'ultima-semana') { a = ultimo - 6; b = ultimo; } else { a = Number(m[2].split('-')[0]); b = Math.min(Number(m[2].split('-')[1]), ultimo); }
    return { a: a, b: b, txt: a === 1 && b >= ultimo ? 'En el mes' : 'Del ' + a + ' al ' + b };
  };
  const mensual = [], semanal = [], diaria = [];
  cat.rutinas.filter(r => r.rol.toLowerCase() === (esCM ? 'cm' : 'sm')).forEach(r => {
    const mm = marcasDe(r.porMarca); if (!mm) return;
    const cola = mm.txt ? ' · ' + mm.txt : '';
    if (r.cuando === 'diaria') { diaria.push('• ' + r.tarea + cola); return; }
    const s = /^semana:(\w+)$/.exec(r.cuando), d = /^dias:([a-z,\s]+)$/.exec(r.cuando);
    if (s || d) {
      const dias = (s ? [s[1]] : d[1].split(',')).map(x => x.trim().slice(0, 3)).filter(x => DIAS[x] != null);
      if (dias.length) semanal.push({ o: DIAS[dias[0]] || 7, t: '• ' + dias.map(x => NOM_DIA[x]).join(' y ') + ' · ' + r.tarea + cola });
      return;
    }
    const v = ventana(r.cuando); if (v && !v.fuera) mensual.push({ o: v.a, t: '• ' + v.txt + ' · ' + r.tarea + cola });
  });
  cat.reuniones.filter(r => r.rol.toLowerCase() === (esCM ? 'cm' : 'sm')).forEach(r => {
    const mm = marcasDe(r.porMarca), v = ventana(r.cuando); if (!mm || !v || v.fuera) return;
    mensual.push({ o: v.a, t: '• ' + v.txt + ' · ' + r.nombre + (r.con ? ' (con ' + r.con + ')' : '') + (mm.txt ? ' · ' + mm.txt : '') + ' · hay que ponerle fecha' });
  });
  const lineas = ['Tus marcas: ' + mias.map(m => m.nombre).join(', ') + '.'];
  if (mensual.length) { lineas.push('', '**Una vez en el mes**'); mensual.sort((a, b) => a.o - b.o).forEach(x => lineas.push(x.t)); }
  if (semanal.length) { lineas.push('', '**Todas las semanas**'); semanal.sort((a, b) => a.o - b.o).forEach(x => lineas.push(x.t)); }
  if (diaria.length) { lineas.push('', '**Todos los días**'); diaria.forEach(x => lineas.push(x)); }
  // lo que dejaron guardado en "Para más adelante": una vez por mes se les recuerda, para que no quede olvidado
  const guardado = ((snap || {}).cards || []).filter(c => c.cat === 'standby' && c.tipo === 'scl' && mias.some(m => m.slug === c.m[0]));
  if (guardado.length) { lineas.push('', '**Guardado en "Para más adelante" (' + guardado.length + ')**: ¿algo de esto ya se puede hacer?'); guardado.slice(0, 12).forEach(c => lineas.push('• ' + nombreMarca_(cat, c.m[0]) + ' · ' + String(c.n).slice(0, 70))); if (guardado.length > 12) lineas.push('… y ' + (guardado.length - 12) + ' más'); }
  lineas.push('', 'No hace falta que lo guardes: cada cosa te aparece en el panel el día que toca y ahí la vas tildando. https://ideamiacontacto-lab.github.io/panel-ideamia/');
  return trozos_('📅 **' + p.nombre + ', estas son tus tareas de ' + NOM_MES[mes - 1] + '**', lineas);
}
/* Lo llama cada actualización: manda la lista una sola vez por mes, el primer día hábil (hasta el 7), entre las 9 y las 12. */
function tareasDelMesEnviar_(cat, cfg, snap) {
  if (/^no$/i.test(String(cfg.PRIVADOS_DISCORD || 'si').trim()) || /^no$/i.test(String(cfg.TAREAS_MES_DISCORD || 'si').trim())) return;
  const hoy = hoyAR_(), mes = ym_(hoy), dow = hoy.getDay(), h = hoy.getHours();
  if (dow === 0 || dow === 6 || hoy.getDate() > 7 || h < 9 || h >= 12) return;
  let hecho = {}; try { hecho = JSON.parse(P.getProperty('TAREAS_MES') || '{}'); } catch (e) {}
  if (hecho.mes !== mes) hecho = { mes: mes, a: [] };
  cat.equipo.filter(p => /^sm$/i.test(String(p.rol).trim()) && hecho.a.indexOf(p.clave) < 0).forEach(p => {
    const id = idDiscord_(cfg, p.clave), textos = id && tareasDelMesArmar_(p, cat, hoy, snap || snapshot_());
    if (!textos) return;
    try { textos.forEach(t => { discordPrivado_(id, t); Utilities.sleep(600); }); hecho.a.push(p.clave); } catch (e) { P.setProperty('DISCORD_DM_ERROR', (new Date().toISOString() + ' · tareas del mes de ' + p.clave + ': ' + e.message).slice(0, 300)); }
    // y, por cada marca suya, lo que marca el calendario anual para este mes (si falla, las tareas igual salieron)
    try { const datos = anualDatos_(snap || snapshot_(), cat); cat.marcas.filter(m => m.sm === p.clave).forEach(m => (recomendacionesMarca_(m, snap || snapshot_(), datos, hoy) || []).forEach(t => { discordPrivado_(id, t); Utilities.sleep(600); })); } catch (e) {}
  });
  P.setProperty('TAREAS_MES', JSON.stringify(hecho));
}
/* MUESTRA: le manda a JOAQUÍN cómo le llegaría a cada social media la lista del mes que viene. No le escribe a nadie más ni anota nada. */
function pruebaTareasMes() {
  const cfg = config_(), cat = catalogo_(), hoy = hoyAR_(), prox = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const puente = String(cfg.DISCORD_PUENTE || '').trim().replace(/\/+$/, ''), clave = P.getProperty('DISCORD_PUENTE_CLAVE'), guild = String(cfg.DISCORD_SERVIDOR || '').trim();
  const r = UrlFetchApp.fetch(puente + '/api/v10/guilds/' + guild + '/members/search?query=joaquin&limit=10', { headers: { 'x-clave': clave }, muteHttpExceptions: true });
  const yo = (r.getResponseCode() < 300 ? JSON.parse(r.getContentText()).map(m => m.user).filter(u => u && !u.bot) : []).filter(u => /joaquinyarce/i.test(u.username))[0];
  if (!yo) { console.log('No encontré a Joaquín en el servidor'); return; }
  const gente = cat.equipo.filter(p => /^sm$/i.test(String(p.rol).trim()));
  console.log('Social media: ' + gente.map(p => p.clave + (idDiscord_(cfg, p.clave) ? ' ✓' : ' ✗ sin ID de Discord')).join(' · '));
  gente.forEach(p => {
    const textos = tareasDelMesArmar_(p, cat, prox, snapshot_());
    if (!textos) { console.log(p.clave + ': sin marcas, no se le manda'); return; }
    discordPrivado_(yo.id, '**MUESTRA · privado a ' + p.nombre + '** · *el primer día hábil del mes, a la mañana*');
    textos.forEach(t => { Utilities.sleep(600); discordPrivado_(yo.id, t); console.log('(' + t.length + ' caracteres)\n' + t); });
    const snapP = snapshot_(), datosP = anualDatos_(snapP, cat);
    cat.marcas.filter(m => m.sm === p.clave).forEach(m => (recomendacionesMarca_(m, snapP, datosP, prox) || []).forEach(t => { Utilities.sleep(600); discordPrivado_(yo.id, t); console.log('(' + t.length + ' caracteres)\n' + t); }));
  });
}

/* ---------------- seguimiento: segundo aviso, aviso al project y resumen de los lunes ----------------
   A) Input con etiqueta Urgente ya avisado por privado: si a las 24 h sigue sin marcar en el panel, un único recordatorio
      al social media; si a las 48 h sigue igual, le llega al project. Solo en horario de trabajo (lun a vie, 9 a 18).
   B) Los lunes a la mañana el project recibe un privado con lo que quedó sin atender, por persona.
   Se apaga con Config SEGUIMIENTO_DISCORD = no (o con PRIVADOS_DISCORD = no). */
function idJoaquin_(cfg) {
  const c = String(cfg.DISCORD_ID_JOAQUIN || P.getProperty('JOAQUIN_ID') || '').trim();
  if (/^\d{15,22}$/.test(c)) return c;
  const puente = String(cfg.DISCORD_PUENTE || '').trim().replace(/\/+$/, ''), clave = P.getProperty('DISCORD_PUENTE_CLAVE'), guild = String(cfg.DISCORD_SERVIDOR || '').trim();
  if (!puente || !clave || !guild) return '';
  PEDIDOS_++;
  const r = UrlFetchApp.fetch(puente + '/api/v10/guilds/' + guild + '/members/search?query=joaquin&limit=10', { headers: { 'x-clave': clave }, muteHttpExceptions: true });
  const yo = (r.getResponseCode() < 300 ? JSON.parse(r.getContentText()).map(m => m.user).filter(u => u && !u.bot) : []).filter(u => /joaquinyarce/i.test(u.username))[0];
  if (yo) P.setProperty('JOAQUIN_ID', yo.id);
  return yo ? yo.id : '';
}
/* Qué inputs urgentes toca recordar y cuáles toca pasarle al project. No envía nada: solo calcula. */
function seguimientoInputs_(snap, cat) {
  const prop = P.getProperty('INPUTS_SEG'), primera = prop == null; let T = {}; try { T = JSON.parse(prop || '{}'); } catch (e) {}
  const avisados = {}; (P.getProperty('INPUTS_AVISADOS') || '').split(',').forEach(x => { if (x) avisados[x] = 1; });
  const est = estados_(), ahora = Date.now(), out = { recordar: [], escalar: [], T: {} };
  inputsParaAvisar_(snap, cat).marcados.forEach(c => {
    if (!avisados[c.id]) return; // todavía no salió el primer aviso
    // la primera vez, lo que ya estaba de antes no se recuerda ni se pasa al project: el reloj corre para lo nuevo
    const t = T[c.id] || (primera ? { t: ahora, r: 1, e: 1 } : { t: ahora });
    if (!(est['inp:' + c.id] || est['card:' + c.id])) {
      const h = (ahora - t.t) / 36e5;
      if (!t.r && h >= 24) out.recordar.push(c); else if (t.r && !t.e && h >= 48) out.escalar.push(c);
    }
    out.T[c.id] = t; // lo que ya no es input urgente (lo movieron o archivaron) deja de seguirse solo
  });
  return out;
}
function smDe_(cat, c) { return (cat.marcas.filter(x => x.slug === c.m[0])[0] || {}).sm || ''; }
function lineaInput_(cat, c) { return '• **' + nombreMarca_(cat, c.m[0]) + '** · ' + String(c.n).slice(0, 90) + (c.due ? ' · vence ' + fechaAR_(c.due) : '') + ' · ' + c.url; }
/* Resumen de lo que quedó sin atender, por persona (lo mismo que muestra la pestaña Equipo, más filmmaker y guiones). */
function resumenSemanalArmar_(snap, cat, cfg) {
  const est = estados_(), hoy = hoyAR_(), lineas = [];
  cat.equipo.filter(p => !/project/i.test(p.rol)).forEach(p => {
    const L = [];
    if (/film|audiovis/i.test(p.rol)) {
      const a = atrasadasFilm_(snap, filmConfig_(cfg, cat));
      if (a.length) L.push('• ' + a.length + (a.length === 1 ? ' pieza atrasada' : ' piezas atrasadas') + ': ' + a.slice(0, 4).map(c => nombreMarca_(cat, c.m[0]) + ' · ' + String(c.n).slice(0, 40)).join('; ') + (a.length > 4 ? '…' : ''));
    } else {
      let pn = null; try { pn = aplicarEstados_(base_(p.clave), est); } catch (e) {}
      if (!pn || pn.error) return;
      const inp = (pn.cards || []).filter(c => c.cat === 'input'), sinT = inp.filter(c => !c.estado), urg = sinT.filter(c => (c.lab || []).some(x => /urgente/.test(norm_(x))));
      const viejos = sinT.filter(c => c.act && Date.now() - new Date(c.act).getTime() > 30 * 864e5).length;
      if (sinT.length) L.push('• Inputs sin tocar: ' + sinT.length + ' de ' + inp.length + (urg.length ? ' (' + urg.length + (urg.length === 1 ? ' urgente' : ' urgentes') + ')' : '') + (viejos ? ' · ' + viejos + ' llevan más de 30 días en la lista de inputs de Trello' : ''));
      const reu = (pn.reuniones || []).filter(x => !x.estado), reuV = reu.filter(x => x.vencida);
      if (reu.length) L.push('• Reuniones sin fecha: ' + reu.length + (reuV.length ? ' (' + reuV.length + (reuV.length === 1 ? ' vencida' : ' vencidas') + ')' : '') + ': ' + reu.map(x => x.nombre).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4).join('; '));
      const rep = pn.reportes || [], repV = rep.filter(x => x.vence && new Date(x.vence) < new Date());
      if (rep.length) L.push('• Reportes sin cargar: ' + rep.length + (repV.length ? ' (' + repV.length + (repV.length === 1 ? ' vencido' : ' vencidos') + ')' : ''));
      const rut = (pn.rutinas || []).filter(x => x.vencida && !x.estado);
      if (rut.length) L.push('• Rutinas vencidas sin tildar: ' + rut.length + ': ' + rut.map(x => String(x.tarea).slice(0, 45)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 3).join('; ') + '…');
      const corr = (pn.cards || []).filter(c => c.cat === 'corr' && c.due && new Date(c.due) < new Date() && !c.dc);
      if (corr.length) L.push('• Correcciones vencidas: ' + corr.length);
      const sf = (pn.cards || []).filter(c => c.cat === 'sinfecha');
      if (sf.length) L.push('• Piezas en Diseño o Producción sin fecha de salida: ' + sf.length + ': ' + sf.slice(0, 3).map(c => nombreMarca_(cat, c.m[0]) + ' · ' + String(c.n).slice(0, 40)).join('; ') + (sf.length > 3 ? '…' : ''));
    }
    if (L.length) { lineas.push('', '**' + p.nombre + '** · ' + p.rol); L.forEach(x => lineas.push(x)); }
  });
  // guiones que Fede ya tendría que haber entregado
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const gui = (snap.cards || []).filter(c => c.cat === 'guion' && c.gest === 'pendiente' && !c.salio && c.entrega && new Date(c.entrega).getTime() < hoy0);
  if (gui.length) { lineas.push('', '**Fede** · guiones'); lineas.push('• ' + gui.length + (gui.length === 1 ? ' guion atrasado' : ' guiones atrasados') + ': ' + gui.slice(0, 4).map(c => nombreMarca_(cat, c.m[0]) + ' · ' + String(c.n).slice(0, 40)).join('; ') + (gui.length > 4 ? '…' : '')); }
  if (!lineas.length) lineas.push('', 'Nada pendiente: todo el equipo está al día.');
  lineas.push('', 'Detalle por persona en la pestaña Equipo: https://ideamiacontacto-lab.github.io/panel-ideamia/');
  return trozos_('🗂️ **Resumen del lunes ' + Utilities.formatDate(hoy, TZ, 'dd/MM') + ' · lo que quedó sin atender**', lineas);
}
/* Lo llama cada actualización, después de los privados. Si un envío falla, no se anota y se reintenta en la próxima lectura. */
function seguimientoEnviar_(snap, cat, cfg) {
  if (/^no$/i.test(String(cfg.PRIVADOS_DISCORD || 'si').trim()) || /^no$/i.test(String(cfg.SEGUIMIENTO_DISCORD || 'si').trim())) return;
  const hoy = hoyAR_(), dow = hoy.getDay(), h = hoy.getHours(), habil = dow >= 1 && dow <= 5 && h >= 9 && h < 18;
  const s = seguimientoInputs_(snap, cat), panel = 'https://ideamiacontacto-lab.github.io/panel-ideamia/';
  if (habil && (s.recordar.length || s.escalar.length)) {
    // A1) recordatorio único al social media
    const porSM = {}; s.recordar.forEach(c => { const k = smDe_(cat, c); (porSM[k] = porSM[k] || []).push(c); });
    Object.keys(porSM).forEach(k => {
      const id = idDiscord_(cfg, k), L = porSM[k]; if (!k || !id) return;
      try {
        trozos_('Hola ' + nombreDe_(k) + '. Ayer te avisé de ' + (L.length === 1 ? 'este input urgente y sigue' : 'estos inputs urgentes y siguen') + ' sin marcar en el panel:', L.map(c => lineaInput_(cat, c)))
          .forEach((t, i, a) => discordPrivado_(id, i === a.length - 1 ? t + '\nSi ya lo viste, marcalo en el panel y no te lo recuerdo más: ' + panel : t));
        L.forEach(c => { s.T[c.id].r = 1; s.T[c.id].tr = Date.now(); });
      } catch (e) {}
    });
    // A2) pasó otro día sin marcar: le llega al project
    if (s.escalar.length) {
      const yo = idJoaquin_(cfg);
      if (yo) try {
        trozos_('⏰ **Inputs urgentes sin ver hace 2 días o más** (ya se les recordó una vez):', s.escalar.map(c => lineaInput_(cat, c) + ' · a cargo de ' + nombreDe_(smDe_(cat, c)))).forEach(t => discordPrivado_(yo, t));
        s.escalar.forEach(c => { s.T[c.id].e = 1; });
      } catch (e) {}
    }
  }
  P.setProperty('INPUTS_SEG', JSON.stringify(s.T).slice(0, 8900));
  // B) resumen de los lunes (una vez por semana, entre las 9 y las 12)
  if (dow === 1 && h >= 9 && h < 12 && P.getProperty('RESUMEN_SEM') !== semana_(hoy)) {
    const yo = idJoaquin_(cfg);
    if (yo) try { resumenSemanalArmar_(snap, cat, cfg).forEach(t => { discordPrivado_(yo, t); Utilities.sleep(500); }); P.setProperty('RESUMEN_SEM', semana_(hoy)); } catch (e) {}
  }
}
/* MUESTRA: le manda a JOAQUÍN cómo llegan los tres mensajes (recordatorio al social media, aviso al project y resumen del lunes con
   los datos reales de hoy). No le escribe a nadie más y no anota nada. */
function pruebaSeguimiento() {
  const cfg = config_(), cat = catalogo_(), snap = snapshot_(), yo = idJoaquin_(cfg);
  if (!yo) { console.log('No encontré a Joaquín en el servidor de Discord'); return; }
  const s = seguimientoInputs_(snap, cat), urg = inputsParaAvisar_(snap, cat).marcados, ej = urg[0];
  console.log('Inputs urgentes hoy: ' + urg.length + ' · tocaría recordar ahora: ' + s.recordar.length + ' · tocaría pasarte ahora: ' + s.escalar.length);
  const linea = ej ? lineaInput_(cat, ej) : '• **(marca)** · (nombre del input) · vence dd/mm · (link)', quien = ej ? nombreDe_(smDe_(cat, ej)) : 'Orne';
  discordPrivado_(yo, '**MUESTRA A1 · privado a ' + quien + '** · *24 h después del primer aviso, si no lo marcó en el panel. Una sola vez.*\n▔▔▔▔▔▔▔▔▔▔\nHola ' + quien + '. Ayer te avisé de este input urgente y sigue sin marcar en el panel:\n' + linea + '\nSi ya lo viste, marcalo en el panel y no te lo recuerdo más: https://ideamiacontacto-lab.github.io/panel-ideamia/');
  Utilities.sleep(600);
  discordPrivado_(yo, '**MUESTRA A2 · privado a vos** · *48 h después, si sigue sin marcar.*\n▔▔▔▔▔▔▔▔▔▔\n⏰ **Inputs urgentes sin ver hace 2 días o más** (ya se les recordó una vez):\n' + linea + ' · a cargo de ' + quien);
  Utilities.sleep(600);
  discordPrivado_(yo, '**MUESTRA B · privado a vos** · *todos los lunes entre las 9 y las 12, con datos reales de hoy.*');
  resumenSemanalArmar_(snap, cat, cfg).forEach(t => { Utilities.sleep(600); discordPrivado_(yo, t); console.log('(' + t.length + ' caracteres)\n' + t); });
}
/* Una sola vez: en la pestaña Marcas, "SkilfulBlack" y "SFB" eran la misma marca cargada dos veces. Deja solo SFB (con los nombres viejos
   como alias, así cualquier tarjeta que diga Skilful sigue cayendo en SFB) y borra la fila vieja. */
function unificarSFB() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Marcas'), v = sh.getDataRange().getValues();
  const fila = n => v.map((r, i) => norm_(r[0]) === n ? i : -1).filter(i => i >= 0)[0];
  const iV = fila('skilfulblack'), iN = fila('sfb');
  console.log('Antes: ' + v.slice(1).map(r => r[0] + ' [' + r[1] + '] sm:' + r[2] + ' cm:' + r[3]).join(' | '));
  if (iV == null) { console.log('No hay fila SkilfulBlack: no hay nada que unificar.'); return; }
  if (iN == null) { sh.getRange(iV + 1, 1).setValue('SFB'); sh.getRange(iV + 1, 2).setValue('sfb,skilful,skilfulblack'); console.log('No había fila SFB: renombré SkilfulBlack a SFB.'); }
  else {
    const alias = lista_(String(v[iN][1]) + ',' + String(v[iV][1]) + ',skilful,skilfulblack,sfb').filter((x, i, a) => a.indexOf(x) === i).join(',');
    sh.getRange(iN + 1, 2).setValue(alias);
    [3, 4, 5, 6].forEach(c => { if (!String(v[iN][c - 1] || '').trim() && String(v[iV][c - 1] || '').trim()) sh.getRange(iN + 1, c).setValue(v[iV][c - 1]); }); // lo que SFB tuviera vacío se completa con lo de la fila vieja
    sh.deleteRow(iV + 1);
    console.log('Fila SkilfulBlack borrada. Alias de SFB: ' + alias);
  }
  CacheService.getScriptCache().removeAll(['equipo', 'marcasLista', 'snap']);
  console.log('Después: ' + sh.getDataRange().getValues().slice(1).map(r => r[0] + ' [' + r[1] + ']').join(' | '));
}

/* Para revisar desde el editor: los inputs de cada social media, comparando Trello EN VIVO con lo que muestra el panel.
   Dice cuántos hay por marca, hace cuánto que nadie los toca en Trello y cuántos están marcados en el panel. No cambia nada. */
function auditarInputs() {
  const cat = catalogo_(), est = estados_(), ahora = Date.now();
  const boards = trello_('/members/me/boards', { filter: 'open', fields: 'name' }).map(b => ({ id: b.id, nombre: b.name, tipo: tipoTablero_(b.name), marca: marcasEn_(b.name.replace(/^\S+\s*/, ''), cat.marcas)[0] || '' })).filter(b => b.tipo === 'scl' && b.marca);
  const res = trelloVarios_(boards.map(b => '/boards/' + b.id + '/lists?filter=open&fields=name&cards=open&card_fields=name,shortUrl,dateLastActivity,labels'));
  const vivo = [];
  boards.forEach((b, i) => (res[i] || []).forEach(l => { if (catLista_(l.name) === 'input') (l.cards || []).forEach(c => vivo.push({ id: c.id, n: c.name, marca: b.marca, lista: l.name, dias: Math.floor((ahora - new Date(c.dateLastActivity).getTime()) / 864e5), urg: (c.labels || []).some(x => /urgente/i.test(x.name || '')) })); }));
  const snap = snapshot_(), enPanel = {}; (snap.cards || []).forEach(c => { if (c.cat === 'input' && c.tipo === 'scl') enPanel[c.id] = 1; });
  console.log('Lectura del panel: ' + snap.generado + ' · inputs en Trello ahora: ' + vivo.length + ' · en el panel: ' + Object.keys(enPanel).length + ' · en Trello y no en el panel: ' + vivo.filter(c => !enPanel[c.id]).length + ' · en el panel y ya no en Trello: ' + Object.keys(enPanel).filter(id => !vivo.some(c => c.id === id)).length);
  cat.equipo.filter(p => /^sm$/i.test(String(p.rol).trim())).forEach(p => {
    const mias = cat.marcas.filter(m => m.sm === p.clave).map(m => m.slug), L = vivo.filter(c => mias.indexOf(c.marca) >= 0);
    const marc = L.filter(c => est['inp:' + c.id] || est['card:' + c.id]);
    const tramo = (a, b) => L.filter(c => c.dias >= a && c.dias < b).length;
    console.log('— ' + p.nombre + ': ' + L.length + ' inputs en Trello · marcados en el panel: ' + marc.length + ' · urgentes: ' + L.filter(c => c.urg).length +
      '\n   Última vez que alguien los tocó en Trello → hoy o ayer: ' + tramo(0, 2) + ' · 2 a 7 días: ' + tramo(2, 8) + ' · 8 a 30 días: ' + tramo(8, 31) + ' · más de 30 días: ' + tramo(31, 99999) +
      '\n   Por marca: ' + mias.map(s => s + ' ' + L.filter(c => c.marca === s).length).join(' · ') +
      '\n   Los 6 más viejos: ' + L.slice().sort((a, b) => b.dias - a.dias).slice(0, 6).map(c => c.marca + ' · ' + String(c.n).slice(0, 40) + ' (' + c.dias + ' días)').join(' | '));
  });
}

/* ---------------- calendario anual y OKR de cada marca (recomendaciones del mes) ----------------
   En "Recursos Corporativos" de cada tablero SCL hay una tarjeta "Calendario anual" y otra "OKRS ANUALES" con el link al documento.
   Una vez por mes se leen esos documentos (sin IA: el calendario tiene formato fijo "fecha → nombre: acción") y a cada social media
   le llega, junto con sus tareas del mes y por marca: las fechas del mes con la acción prevista, cuáles no están cargadas en la lista
   de Efemérides de Trello, qué campañas de los meses siguientes hay que empezar a planificar ya, y las metas del período.
   Anticipación (la define el propio calendario): campañas mayores 30 días hábiles antes, campañas especiales 20. */
function docTexto_(id) {
  PEDIDOS_++;
  const r = UrlFetchApp.fetch('https://docs.google.com/document/d/' + id + '/export?format=txt', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('no pude abrir el documento (código ' + r.getResponseCode() + ')');
  return r.getContentText();
}
function recursoDoc_(snap, slug, patron) {
  const L = (snap.cards || []).filter(c => c.cat === 'recursos' && c.m[0] === slug && patron.test(norm_(c.n))).sort((a, b) => (a.tipo === 'scl' ? 0 : 1) - (b.tipo === 'scl' ? 0 : 1));
  for (let i = 0; i < L.length; i++) {
    const m = /docs\.google\.com\/document\/d\/([\w-]+)/.exec((L[i].d || '') + ' ' + (L[i].att || []).map(a => a.u).join(' '));
    if (m) return { id: m[1], url: 'https://docs.google.com/document/d/' + m[1], tarjeta: L[i].url };
  }
  return L.length ? { tarjeta: L[0].url } : null;
}
const nivelAccion_ = a => { const n = norm_(a); return /campana integral|influencer|pauta/.test(n) ? 1 : /accion previa|colab|sorteo|campana|activacion|promocion|reel/.test(n) ? 2 : (!n || /aislada|quizas|\?\s*$/.test(n)) ? 4 : 3; };
/* Acepta los formatos que usan los calendarios:
   - "6 de Enero → Reyes Magos: acción" y "6 de enero - Día de Reyes: acción", con el mes como título ("ENERO" o "ENERO:");
   - "11 de junio al 19 de julio: Mundial";
   - el de varias líneas: "1 de enero – Año Nuevo", abajo "Nivel 3" y abajo la descripción (sin título de mes: el mes sale de la fecha). */
function calendarioAnualParse_(txt) {
  const out = []; let mes = -1, pendiente = null, ultimo = null;
  String(txt).split(/\r?\n/).forEach(l0 => {
    const l = l0.replace(/\*/g, '').replace(/^[^0-9A-Za-zÁÉÍÓÚÑáéíóúñ¿¡"“(]+/, '').trim(); if (!l) return;
    const h = MESES_.indexOf(norm_(l.replace(/\s*:\s*$/, ''))); if (h >= 0) { mes = h; pendiente = null; ultimo = null; return; }
    let m = /^(\d{1,2}[^→:]{0,45}?)\s*(?:→|->|=>|\s[-–—]\s)\s*(.*)$/.exec(l);
    if (!m) { const c = /^(\d{1,2}\s[^:]{3,45}?)\s*:\s*(.+)$/.exec(l); if (c && MESES_.some(x => norm_(c[1]).indexOf(x.slice(0, 3)) >= 0)) m = c; } // sin flecha ni guion: "fecha: nombre"
    let fechaTxt, resto;
    if (m) { fechaTxt = m[1].trim(); resto = m[2].trim(); if (!resto) { pendiente = fechaTxt; return; } }
    else if (pendiente && /:/.test(l) && l.length < 260) { fechaTxt = pendiente; resto = l; } // sub-ítems de una fecha ("25 de Mayo →" y abajo varias)
    else {
      // líneas que completan la fecha anterior (formato de varias líneas): "Nivel 2" y después la descripción
      if (ultimo) {
        const nv = /^nivel\s*([1-4])\b/i.exec(l);
        if (nv) { if (ultimo.nivel !== 0) ultimo.nivel = Number(nv[1]); ultimo.fijo = true; }
        else if (!ultimo.accion && l.length < 200 && l.replace(/[^a-záéíóúñ]/gi, '').length >= 12 && !/inicio de planificaci|brainstorming/i.test(l)) { ultimo.accion = l.slice(0, 200); if (!ultimo.fijo && ultimo.nivel !== 0) ultimo.nivel = nivelAccion_(l); }
      }
      return;
    }
    // si la fecha trae el mes escrito ("12 de octubre"), manda eso; si no, el título de mes bajo el que está
    const enFecha = /^\d{1,2}(?:\s*(?:y|al|,)\s*\d{1,2})*\s+de\s+([a-záéíóúñ]+)/i.exec(fechaTxt), mesF = enFecha ? MESES_.indexOf(norm_(enFecha[1])) : -1;
    const mesItem = mesF >= 0 ? mesF : mes; if (mesItem < 0) return;
    const dia = Number((/\d{1,2}/.exec(fechaTxt) || [0])[0]); if (!dia || dia > 31) return;
    const i = resto.indexOf(':'), nombre = (i > 0 ? resto.slice(0, i) : resto).trim(), accion = (i > 0 ? resto.slice(i + 1) : '').replace(/→.*$/, '').trim();
    if (!nombre || nombre.length > 90) return;
    const brain = /brainstorming/i.test(nombre), nx = /\(N([1-4])\)/i.exec(resto); // "(N2)": nivel escrito en el propio calendario
    ultimo = { mes: mesItem, dia: dia, fecha: fechaTxt, nombre: (brain ? nombre.replace(/brainstorming/i, 'Brainstorming') : nombre).replace(/\s*\(N[1-4]\)/i, ''), accion: accion.replace(/\s*\(N[1-4]\)\.?/i, '').trim().slice(0, 200), nivel: brain ? 0 : nx ? Number(nx[1]) : nivelAccion_(accion), fijo: !!nx };
    out.push(ultimo);
  });
  out.forEach(x => delete x.fijo);
  // una misma campaña puede figurar en dos meses (ej. Black Friday): se deja una por mes y nombre
  return out.filter((x, i, a) => a.findIndex(y => y.mes === x.mes && y.dia === x.dia && norm_(y.nombre) === norm_(x.nombre)) === i);
}
/* Metas del semestre en curso, si el documento de OKR tiene el formato "S1 — Enero a Junio" / "S2 — Julio a Diciembre". */
function okrParse_(txt, mes) {
  const lineas = String(txt).split(/\r?\n/).map(l => l.replace(/[*#]/g, '').trim()), sem = mes < 6 ? 1 : 2, out = [];
  const ini = lineas.findIndex(l => new RegExp('^S' + sem + '\\b').test(l) || (sem === 1 ? /^enero a junio/i : /^julio a diciembre/i).test(l));
  if (ini < 0) return out;
  for (let i = ini + 1; i < Math.min(lineas.length, ini + 14) && out.length < 4; i++) {
    if (/^S[12]\b/.test(lineas[i])) break;
    if (/seguidores|alcance|contactos|consultas|ventas/i.test(lineas[i]) && /\d/.test(lineas[i]) && lineas[i].length < 90) out.push(lineas[i].replace(/^[\s\-•·●○]+/, ''));
  }
  return out;
}
/* Lee (una vez por mes) el calendario anual y los OKR de todas las marcas y los deja guardados. forzar = true los vuelve a leer. */
function anualDatos_(snap, cat, forzar) {
  const mes = ym_(hoyAR_());
  let g = {}; try { g = leerJson_('ANUAL_FILE_ID', 'panel-ideamia-anual.json'); } catch (e) {}
  // se vuelven a leer al cambiar de mes o una vez por semana (por si alguien corrigió el documento)
  if (!forzar && g.mes === mes && g.marcas && g.leido && Date.now() - new Date(g.leido).getTime() < 7 * 864e5) return g;
  const marcas = {};
  cat.marcas.forEach(m => {
    const cal = recursoDoc_(snap, m.slug, /calendario anual/), okr = recursoDoc_(snap, m.slug, /okr/), o = { cal: cal, okr: okr, items: [], metas: [], nota: '' };
    if (!cal) o.nota = 'no hay tarjeta "Calendario anual" en Recursos Corporativos';
    else if (!cal.id) o.nota = 'la tarjeta "Calendario anual" no tiene el link a un documento de Google';
    else try { o.items = calendarioAnualParse_(docTexto_(cal.id)); if (!o.items.length) o.nota = 'no pude leer fechas del calendario (formato distinto al de "fecha → nombre: acción")'; } catch (e) { o.nota = 'calendario: ' + e.message; }
    if (okr && okr.id) try { o.txtOkr = docTexto_(okr.id).slice(0, 12000); } catch (e) {}
    marcas[m.slug] = o;
  });
  g = { mes: mes, leido: new Date().toISOString(), marcas: marcas };
  guardarJson_('ANUAL_FILE_ID', 'panel-ideamia-anual.json', g);
  return g;
}
/* primera línea de una descripción de Trello, sin links (para que el mensaje no se llene de direcciones) */
function limpio_(d) { return String(d || '').replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/https?:\/\/\S+/g, '').split('\n').map(x => x.trim()).filter(x => x.replace(/[^a-záéíóúñ0-9]/gi, '').length > 3)[0] || ''; }
/* Lo que la web muestra en la pestaña "Anual" del social media: el calendario de cada marca suya, ya leído (sin el texto del OKR). */
function anualSalida_(datos, misMarcas, hoy, snap) {
  const out = {};
  misMarcas.forEach(m => {
    const o = ((datos || {}).marcas || {})[m.slug] || {}, cu = cumplesMarca_(snap, m.slug);
    if (!o.items && !cu.items.length) return;
    out[m.slug] = { items: (o.items || []).concat(cu.items), nota: o.nota || '', url: (o.cal && o.cal.url) || '', okr: (o.okr && o.okr.url) || '', cumples: cu.url, metas: o.txtOkr ? okrParse_(o.txtOkr, hoy.getMonth()) : [] };
  });
  return { leido: (datos || {}).leido || null, marcas: out };
}
/* Cumpleaños de una marca: la tarjeta que se llama "Cumpleaños…" en la lista "Datos de la marca" (o en Recursos Corporativos) del SCL.
   Una línea por persona: "28/1 Guido" o "05/01 Villamonte Gustavo". Van al calendario anual como un tipo aparte (nivel 5). */
function cumplesMarca_(snap, slug) {
  const L = ((snap || {}).cards || []).filter(c => (c.cat === 'datos' || c.cat === 'recursos') && c.m[0] === slug && /cumple/.test(norm_(c.n))).sort((a, b) => (a.cat === 'datos' ? 0 : 1) - (b.cat === 'datos' ? 0 : 1));
  const items = [];
  if (L.length) String(L[0].d || '').split(/\r?\n/).forEach(l => {
    const m = /^\s*[-•*]?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s+(.{2,60})$/.exec(l); if (!m) return;
    const dia = Number(m[1]), mes = Number(m[2]) - 1; if (dia < 1 || dia > 31 || mes < 0 || mes > 11) return;
    items.push({ mes: mes, dia: dia, fecha: m[1] + '/' + m[2], nombre: 'Cumpleaños de ' + m[3].trim().replace(/^./, x => x.toUpperCase()), accion: '', nivel: 5 });
  });
  return { items: items, url: L.length ? L[0].url : '' };
}
function restarHabiles_(d, n) { const x = new Date(d); while (n > 0) { x.setDate(x.getDate() - 1); if (x.getDay() !== 0 && x.getDay() !== 6) n--; } return x; }
/* Mensaje del mes para una marca. fecha = cualquier día del mes del que se habla. Devuelve null si la marca no tiene calendario leído. */
function recomendacionesMarca_(m, snap, datos, fecha) {
  const o = (datos.marcas || {})[m.slug];
  // cumpleaños del mes (tarjeta "Cumpleaños" de Datos de la marca)
  const cumMes = cumplesMarca_(snap, m.slug).items.filter(x => x.mes === fecha.getMonth()).sort((p, q) => p.dia - q.dia).map(x => '• ' + ('0' + x.dia).slice(-2) + '/' + ('0' + (x.mes + 1)).slice(-2) + ' · ' + x.nombre.replace(/^Cumpleaños de /, ''));
  const bloqueCum = cumMes.length ? ['', '**Cumpleaños del mes** 🎂'].concat(cumMes) : [];
  if (!o || !o.items || !o.items.length) {
    // sin documento de calendario anual: se usan las fechas cargadas en la lista Efemérides de Trello de esa marca
    const delMesT = k => { const ym = Utilities.formatDate(new Date(fecha.getFullYear(), fecha.getMonth() + k, 15), TZ, 'yyyy-MM'); return (snap.cards || []).filter(c => c.cat === 'efem' && c.m[0] === m.slug && c.due && Utilities.formatDate(new Date(c.due), TZ, 'yyyy-MM') === ym).sort((a, b) => new Date(a.due) - new Date(b.due)).map(c => '• ' + Utilities.formatDate(new Date(c.due), TZ, 'dd/MM') + ' · **' + String(c.n).slice(0, 70) + '**' + (limpio_(c.d) ? ' · ' + limpio_(c.d) : '')); };
    const a0 = delMesT(0), a1 = delMesT(1); if (!a0.length && !a1.length && !cumMes.length) return null;
    return trozos_('📌 **' + m.nombre + ' · ' + MESES_[fecha.getMonth()] + ' según Efemérides de Trello**', (a0.length ? ['**Este mes**'].concat(a0) : ['Este mes no hay fechas cargadas en Efemérides.']).concat(a1.length ? ['', '**El mes que viene (para ir planificando)**'].concat(a1) : [], bloqueCum, ['', 'Esta marca no tiene documento de "Calendario anual" en Recursos Corporativos: por eso no hay niveles de campaña ni fechas de planificación.']));
  }
  const mes = fecha.getMonth(), anio = fecha.getFullYear(), ini = new Date(anio, mes, 1), hoy = hoyAR_();
  const dd = n => ('0' + n).slice(-2), NIV = { 0: 'reunión de equipo', 1: 'campaña mayor', 2: 'campaña especial', 3: 'publicación o historias', 4: 'mención eventual' };
  // tarjetas de Efemérides de la marca en Trello, por fecha: para avisar cuál falta cargar
  const efem = (snap.cards || []).filter(c => c.cat === 'efem' && c.m[0] === m.slug && c.due).map(c => new Date(c.due).getTime());
  const cargada = d => efem.some(t => Math.abs(t - d.getTime()) <= 2.5 * 864e5);
  const lineas = [], delMes = o.items.filter(x => x.mes === mes).sort((a, b) => a.dia - b.dia);
  if (delMes.length) {
    lineas.push('**Este mes**');
    delMes.forEach(x => { const d = new Date(anio, mes, x.dia, 12); lineas.push('• ' + dd(x.dia) + '/' + dd(mes + 1) + ' · **' + x.nombre + '** · ' + NIV[x.nivel] + (x.accion ? ': ' + x.accion.charAt(0).toLowerCase() + x.accion.slice(1) : '') + (x.nivel >= 1 && x.nivel <= 3 && !cargada(d) ? ' · ⚠️ no está en Efemérides de Trello' : '')); });
  } else lineas.push('Este mes el calendario anual no marca ninguna fecha.');
  // lo que viene y necesita anticipación: mayores (30 días hábiles) y especiales (20) de los dos meses siguientes
  const prox = [];
  [1, 2].forEach(k => { const mm = (mes + k) % 12, aa = anio + (mes + k > 11 ? 1 : 0); o.items.filter(x => x.mes === mm && x.nivel >= 1 && x.nivel <= 2).forEach(x => {
    const d = new Date(aa, mm, x.dia, 12), arranque = restarHabiles_(d, x.nivel === 1 ? 30 : 20);
    if (arranque.getTime() > new Date(anio, mes + 1, 7).getTime()) return; // todavía falta: se avisa el mes que viene
    prox.push({ t: d.getTime(), l: '• ' + dd(x.dia) + '/' + dd(mm + 1) + ' · **' + x.nombre + '** · ' + NIV[x.nivel] + ' · ' + (arranque.getTime() < Math.max(hoy.getTime(), ini.getTime()) ? 'ya tendría que estar en marcha (se planifica desde el ' + dd(arranque.getDate()) + '/' + dd(arranque.getMonth() + 1) + ')' : 'empezar a planificar antes del ' + dd(arranque.getDate()) + '/' + dd(arranque.getMonth() + 1)) });
  }); });
  if (prox.length) { lineas.push('', '**Para empezar a planificar ya**'); prox.sort((a, b) => a.t - b.t).forEach(x => lineas.push(x.l)); }
  bloqueCum.forEach(x => lineas.push(x));
  const metas = o.txtOkr ? okrParse_(o.txtOkr, mes) : [];
  if (metas.length) { lineas.push('', '**Metas del ' + (mes < 6 ? 'primer' : 'segundo') + ' semestre (OKR)**'); metas.forEach(x => lineas.push('• ' + x)); }
  lineas.push('', 'Calendario anual: ' + o.cal.url + (o.okr && o.okr.url ? ' · OKR: ' + o.okr.url : ''));
  return trozos_('📌 **' + m.nombre + ' · ' + MESES_[mes] + ' según el calendario anual**', lineas);
}
/* PRUEBA sin efectos: qué encontró de cada marca (vuelve a leer los documentos) y cómo quedaría el mensaje del mes que viene de una. */
function probarCalendarioAnual() {
  const cat = catalogo_(), snap = snapshot_(), d = anualDatos_(snap, cat, true), hoy = hoyAR_(), prox = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  cat.marcas.forEach(m => { const o = d.marcas[m.slug]; console.log(m.nombre + ' · calendario: ' + (o.items.length ? o.items.length + ' fechas (' + MESES_.map((n, i) => n.slice(0, 3) + ' ' + o.items.filter(x => x.mes === i).length).join(', ') + ')' : 'NO · ' + o.nota) + ' · OKR: ' + (o.txtOkr ? 'leído' + (okrParse_(o.txtOkr, prox.getMonth()).length ? ' con metas del semestre' : ' (sin metas en formato S1/S2)') : o.okr ? 'tarjeta sin documento legible' : 'sin tarjeta')); });
  // un ejemplo de cada caso: con flecha (ISCO), con guion (GV) y sin documento (usa Efemérides)
  ['isco', 'gabriel-varisco', 'tritato'].forEach(s => { const m = cat.marcas.filter(x => x.slug === s)[0]; if (m) (recomendacionesMarca_(m, snap, d, prox) || ['(' + s + ': sin nada para mandar)']).forEach(t => console.log('(' + t.length + ' caracteres)\n' + t)); });
}

/* ---------------- web app ---------------- */
/* ---------------- calendario provisorio para el cliente (página de links de la marca) ----------------
   Lo que sale en los próximos días según el tablero SCL de la marca, con el estado de cada parte: copy, diseño, guion y video.
   No pide clave: solo devuelve tarjetas con fecha de publicación de esa marca (título, copy, adjuntos y estado), nunca comentarios
   ni otras marcas. Se guarda 10 minutos en caché para no pegarle a Trello en cada visita. */
function entregaDiseno_(salida) {
  // Las diseñadoras entregan en tandas: lunes (lo que sale lun–mié de la semana siguiente) y jueves (lo que sale jue–dom de la semana siguiente).
  const d = new Date(Utilities.formatDate(new Date(salida), TZ, "yyyy-MM-dd'T'12:00:00"));
  const dia = d.getDay() || 7, lunes = new Date(d.getTime() - (dia - 1) * 864e5);
  return new Date(lunes.getTime() - 7 * 864e5 + (dia <= 3 ? 0 : 3) * 864e5);
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
  const ok = project ? (!proj || k === proj) : (!team || k === team || !!(proj && k === proj));
  // Clave equivocada: la respuesta se demora (más si vienen muchas seguidas) para que no se pueda adivinar probando miles,
  // y queda anotado cuándo pasó (se ve en ?action=estado como "intentosFallidos").
  if (!ok && k) {
    try {
      const c = CacheService.getScriptCache(), n = Number(c.get('clavesMalas') || 0) + 1; c.put('clavesMalas', String(n), 900);
      if (n === 15) P.setProperty('ALERTA_CLAVES', new Date().toISOString() + ' · 15 claves equivocadas en 15 minutos');
      Utilities.sleep(n > 15 ? 5000 : 1200);
    } catch (e) {}
  }
  return ok;
}

/* ---------------- agenda privada (project y dirección) ----------------
   El calendario de ideamia.contacto es privado: solo lo ven Joaquín e Ivo. Por eso todo esto pide la clave del project,
   no la del equipo. Se leen las reuniones de los próximos 45 días (las privadas y, marcadas aparte, las del calendario del equipo)
   y se pueden crear reuniones nuevas, que SIEMPRE van al calendario privado, con los invitados que se elijan. */
const CAL_PRIVADO_ = 'ideamia.contacto@gmail.com';
function calPrivado_() {
  const id = String(config_().CAL_PRIVADO || CAL_PRIVADO_).trim(), cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('no encuentro el calendario ' + id + ' (el panel tiene que estar publicado con esa cuenta)');
  return { id: id, cal: cal };
}
function agendaEvento_(e, calId, tipo, nombres) {
  let inv = [];
  try { inv = e.getGuestList().map(g => { const m = String(g.getEmail()).toLowerCase(); return { mail: m, n: nombres[m] || '', est: String(g.getGuestStatus()) }; }); } catch (x) {}
  const id = e.getId(), desc = String(e.getDescription() || '').replace(/<[^>]+>/g, ' ').trim();
  return {
    id: id + '@' + e.getStartTime().getTime(), t: e.getTitle() || '(sin título)', s: e.getStartTime().toISOString(), f: e.getEndTime().toISOString(), dia: e.isAllDayEvent(),
    cal: tipo, uid: id, mio: (() => { try { return e.isOwnedByMe(); } catch (x) { return false; } })(), rec: (() => { try { return e.isRecurringEvent(); } catch (x) { return false; } })(), inv: inv, lugar: String(e.getLocation() || '').slice(0, 200), desc: desc.slice(0, 300), panel: desc.indexOf('Agendada desde el Panel Ideamia') >= 0,
    link: 'https://www.google.com/calendar/event?eid=' + Utilities.base64EncodeWebSafe(id.split('@')[0] + ' ' + calId).replace(/=+$/, '')
  };
}
function agendaPrivada_() {
  const cfg = config_(), cat = catalogo_(), P0 = calPrivado_();
  const desde = new Date(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + 'T00:00:00-03:00'), hasta = new Date(desde.getTime() + 45 * 864e5);
  const nombres = {}; cat.equipo.forEach(p => { if (p.email) nombres[p.email] = p.nombre; });
  const vistos = {}, out = [];
  P0.cal.getEvents(desde, hasta).forEach(e => { const o = agendaEvento_(e, P0.id, 'privado', nombres); vistos[o.id] = o; out.push(o); });
  // las del calendario del equipo: las que también están en el privado se marcan como del equipo (el equipo las ve); las demás se suman
  const idEq = cfg.CALENDAR_ID || 'estudioideamia@gmail.com';
  let equipoOk = true;
  try { const ce = idEq !== P0.id ? CalendarApp.getCalendarById(idEq) : null; if (ce) ce.getEvents(desde, hasta).forEach(e => { const o = agendaEvento_(e, idEq, 'equipo', nombres); if (vistos[o.id]) vistos[o.id].cal = 'equipo'; else out.push(o); }); else if (idEq !== P0.id) equipoOk = false; } catch (x) { equipoOk = false; }
  out.sort((a, b) => new Date(a.s) - new Date(b.s));
  // link de Meet de cada reunión (solo si está activado el servicio avanzado de Calendar; si no, la agenda funciona igual sin el link)
  try {
    if (typeof Calendar !== 'undefined') {
      const meets = {};
      ((Calendar.Events.list(P0.id, { timeMin: desde.toISOString(), timeMax: hasta.toISOString(), singleEvents: true, maxResults: 500, fields: 'items(iCalUID,hangoutLink,start)' }) || {}).items || [])
        .forEach(x => { if (x.hangoutLink && x.start && x.start.dateTime) meets[x.iCalUID + '@' + new Date(x.start.dateTime).getTime()] = x.hangoutLink; });
      out.forEach(o => { if (meets[o.id]) o.meet = meets[o.id]; });
    }
  } catch (x) {}
  // a quién se puede invitar con un toque: el equipo con mail (hoja Equipo, columna E) y los de Config · AGENDA_INVITADOS ("Nombre mail, Nombre mail")
  const inv = cat.equipo.filter(p => p.email && p.email !== P0.id).map(p => ({ clave: p.clave, nombre: p.nombre, rol: p.rol, email: p.email }));
  String(cfg.AGENDA_INVITADOS || '').split(/[,;\n]+/).forEach(t => {
    const m = /([^\s<>]+@[^\s<>]+\.[^\s<>]+)/.exec(t); if (!m) return;
    const mail = m[1].toLowerCase(), nombre = t.replace(m[1], '').replace(/[<>]/g, '').trim() || mail;
    if (mail !== P0.id && !inv.some(p => p.email === mail)) { inv.push({ clave: '', nombre: nombre, rol: '', email: mail }); nombres[mail] = nombre; }
  });
  out.forEach(o => o.inv.forEach(g => { if (!g.n && nombres[g.mail]) g.n = nombres[g.mail]; }));
  return { ok: true, leido: new Date().toISOString(), calendario: P0.id, equipoOk: equipoOk, eventos: out, meet: typeof Calendar !== 'undefined', invitables: inv };
}
function agendarPrivada_(b) {
  const titulo = String(b.titulo || '').trim().slice(0, 200);
  if (!titulo) return { error: 'datos', mensaje: 'Falta el título de la reunión' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') || !/^\d{2}:\d{2}$/.test(b.hora || '')) return { error: 'datos', mensaje: 'Falta la fecha o la hora' };
  const mails = (Array.isArray(b.invitados) ? b.invitados : []).map(x => String(x).trim().toLowerCase()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  const malos = mails.filter(x => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(x));
  if (malos.length) return { error: 'datos', mensaje: 'Este mail no parece válido: ' + malos.join(', ') };
  if (mails.length > 30) return { error: 'datos', mensaje: 'Son demasiados invitados (máximo 30)' };
  const P0 = calPrivado_(), ini = new Date(b.fecha + 'T' + b.hora + ':00-03:00'), dur = Math.min(Math.max(Number(b.duracion) || 45, 10), 480), fin = new Date(ini.getTime() + dur * 6e4);
  const desc = 'Agendada desde el Panel Ideamia' + (b.persona ? ' por ' + String(b.persona).slice(0, 40) : '') + (b.nota ? '\n' + String(b.nota).slice(0, 1500) : '');
  const lugar = b.lugar ? String(b.lugar).slice(0, 300) : '', avisar = b.avisar !== false;
  let meetFallo = '';
  // con link de Meet: se crea por el servicio avanzado de Calendar, así la invitación ya sale con el link
  if (b.meet) {
    try {
      const r = Calendar.Events.insert({ summary: titulo, description: desc, location: lugar, start: { dateTime: ini.toISOString() }, end: { dateTime: fin.toISOString() }, attendees: mails.map(x => ({ email: x })),
        conferenceData: { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } }, P0.id, { conferenceDataVersion: 1, sendUpdates: mails.length && avisar ? 'all' : 'none' });
      return { ok: true, evento: { id: r.iCalUID + '@' + ini.getTime(), t: titulo, s: ini.toISOString(), f: fin.toISOString(), dia: false, cal: 'privado', uid: r.iCalUID, mio: true, rec: false, inv: mails.map(x => ({ mail: x, n: '', est: 'INVITED' })), lugar: lugar, desc: desc.slice(0, 300), panel: true, link: r.htmlLink || '', meet: r.hangoutLink || '' } };
    } catch (e) { meetFallo = String(e.message || e).slice(0, 160); }
  }
  const op = { description: desc };
  if (lugar) op.location = lugar;
  if (mails.length) { op.guests = mails.join(','); op.sendInvites = avisar; }
  const ev = P0.cal.createEvent(titulo, ini, fin, op);
  return { ok: true, evento: agendaEvento_(ev, P0.id, 'privado', {}), meetFallo: meetFallo };
}
/* Cambiar los invitados de una reunión que ya existe en el calendario privado (agregar o sacar). b.invitados = la lista completa que tiene que quedar.
   Solo en reuniones creadas por ideamia.contacto (en las que lo invitó otro, Google no deja tocar los invitados). Si la reunión se repite, vale para todas las fechas. */
function invitadosPrivada_(b) {
  const uid = String(b.uid || '');
  if (!uid) return { error: 'datos', mensaje: 'Falta la reunión' };
  const mails = (Array.isArray(b.invitados) ? b.invitados : []).map(x => String(x).trim().toLowerCase()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  const malos = mails.filter(x => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(x));
  if (malos.length) return { error: 'datos', mensaje: 'Este mail no parece válido: ' + malos.join(', ') };
  if (mails.length > 30) return { error: 'datos', mensaje: 'Son demasiados invitados (máximo 30)' };
  const P0 = calPrivado_(), avisar = b.avisar !== false;
  const EST = { accepted: 'YES', declined: 'NO', tentative: 'MAYBE', needsAction: 'INVITED' };
  // con el servicio avanzado de Calendar: a los que se agregan les llega la invitación y a los que se sacan, el aviso
  if (typeof Calendar !== 'undefined') {
    const it = ((Calendar.Events.list(P0.id, { iCalUID: uid, maxResults: 1 }) || {}).items || [])[0];
    if (!it) return { error: 'datos', mensaje: 'No encontré esa reunión en el calendario (¿la borraron?)' };
    const actuales = it.attendees || [];
    const quedan = actuales.filter(a => a.self || a.organizer || mails.indexOf(String(a.email).toLowerCase()) >= 0);
    mails.forEach(m => { if (!quedan.some(a => String(a.email).toLowerCase() === m)) quedan.push({ email: m }); });
    const r = Calendar.Events.patch({ attendees: quedan }, P0.id, it.id, { sendUpdates: avisar ? 'all' : 'none' });
    return { ok: true, inv: (r.attendees || []).filter(a => !a.self).map(a => ({ mail: String(a.email).toLowerCase(), n: '', est: EST[a.responseStatus] || 'INVITED' })) };
  }
  // sin ese servicio: se cambian igual, pero Google no manda el mail de invitación
  const ev = P0.cal.getEventById(uid);
  if (!ev) return { error: 'datos', mensaje: 'No encontré esa reunión en el calendario (¿la borraron?)' };
  const ya = ev.getGuestList().map(g => String(g.getEmail()).toLowerCase());
  ya.filter(m => mails.indexOf(m) < 0 && m !== P0.id).forEach(m => ev.removeGuest(m));
  mails.filter(m => ya.indexOf(m) < 0).forEach(m => ev.addGuest(m));
  return { ok: true, sinAviso: true, inv: ev.getGuestList().map(g => ({ mail: String(g.getEmail()).toLowerCase(), n: '', est: String(g.getGuestStatus()) })) };
}
/* PRUEBA sin efectos: qué se lee del calendario privado (no crea nada). */
function probarAgendaPrivada() {
  const a = agendaPrivada_();
  console.log('Calendario privado: ' + a.calendario + ' · calendario del equipo: ' + (a.equipoOk ? 'leído' : 'NO se pudo leer') + ' · reuniones en 45 días: ' + a.eventos.length + ' (privadas ' + a.eventos.filter(e => e.cal === 'privado').length + ', del equipo ' + a.eventos.filter(e => e.cal === 'equipo').length + ')');
  console.log('Servicio de Calendar (para el link de Meet): ' + (a.meet ? 'activado' : 'NO activado') + ' · reuniones con Meet: ' + a.eventos.filter(e => e.meet).length);
  console.log('Se puede invitar a: ' + a.invitables.map(p => p.nombre + ' <' + p.email + '>').join(', '));
  a.eventos.slice(0, 12).forEach(e => console.log('   ' + Utilities.formatDate(new Date(e.s), TZ, 'dd/MM HH:mm') + ' · ' + e.cal + ' · ' + e.t.slice(0, 60) + (e.inv.length ? ' · ' + e.inv.length + ' invitados' : '')));
}

/* ---------------- producciones de fotografía ----------------
   Cada marca tiene una producción de fotos cada FOTO_MESES meses (Config; si no está, 2). Acá se anota cuándo fue la última
   y la web calcula cuándo toca la próxima y avisa. Lo ven y lo anotan solo el project y dirección.
   Se guarda en un archivo de Drive (panel-ideamia-fotos.json): { marcas: { <slug>: { no, hist: [{ f, por, nota }] } } }. */
function fotosSalida_(marcas) {
  marcas = marcas || cacheGet_('marcasLista') || catalogo_().marcas.map(m => ({ slug: m.slug, nombre: m.nombre }));
  const g = leerJson_('FOTOS_FILE_ID', 'panel-ideamia-fotos.json'), meses = Math.min(Math.max(Number(config_().FOTO_MESES) || 2, 1), 24);
  return { meses: meses, marcas: marcas.map(m => {
    const o = (g.marcas || {})[m.slug] || {}, h = (o.hist || []).slice().sort((a, b) => String(b.f).localeCompare(String(a.f)));
    return { slug: m.slug, nombre: m.nombre, no: !!o.no, ultima: h.length ? h[0].f : '', por: h.length ? h[0].por || '' : '', nota: h.length ? h[0].nota || '' : '', hist: h.slice(0, 8) };
  }) };
}
function fotoMarca_(b, quien) {
  const cat = catalogo_(), slug = String(b.marca || ''), yo = cat.equipo.filter(p => p.clave === norm_(quien))[0];
  if (!yo || !/project|direcc|creativ/i.test(yo.rol)) return { error: 'permiso', mensaje: 'Las producciones de fotografía las anotan solo el project y dirección' };
  if (!cat.marcas.some(m => m.slug === slug)) return { error: 'datos', mensaje: 'No conozco esa marca' };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const g = leerJson_('FOTOS_FILE_ID', 'panel-ideamia-fotos.json'); g.marcas = g.marcas || {};
    const o = g.marcas[slug] = g.marcas[slug] || { hist: [] }; o.hist = o.hist || [];
    if (b.accion === 'noAplica') o.no = !!b.no;
    else if (b.accion === 'borrar') o.hist = o.hist.filter(x => x.f !== String(b.fecha || ''));
    else {
      const f = String(b.fecha || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return { error: 'datos', mensaje: 'Falta la fecha de la producción' };
      if (f > Utilities.formatDate(new Date(Date.now() + 864e5), TZ, 'yyyy-MM-dd')) return { error: 'datos', mensaje: 'Esa fecha todavía no pasó: anotá la producción cuando ya esté hecha' };
      o.hist = o.hist.filter(x => x.f !== f);
      o.hist.push({ f: f, por: yo.nombre, nota: String(b.nota || '').trim().slice(0, 300) });
      o.no = false;
      registrar_(quien, 'foto', 'foto:' + slug + ':' + f, slug, 'hecho', 'Producción de fotografía del ' + f + (b.nota ? ' · ' + String(b.nota).slice(0, 150) : ''), '');
    }
    o.hist.sort((x, y) => String(y.f).localeCompare(String(x.f))); o.hist = o.hist.slice(0, 40);
    guardarJson_('FOTOS_FILE_ID', 'panel-ideamia-fotos.json', g);
  } finally { lock.releaseLock(); }
  return { ok: true, fotos: fotosSalida_(cat.marcas.map(m => ({ slug: m.slug, nombre: m.nombre }))) };
}

/* ---------------- pedidos nuevos en el tablero ADS → privado a Juan Escalante (paid media) ----------------
   En cada actualización (cada 10 min) se mira la lista "Pedidos / Solicitudes" del tablero ADS. Cada tarjeta que aparece ahí
   (cargada, copiada o movida desde otro tablero) se le avisa a Juan por privado UNA sola vez. La primera vez solo toma nota de
   lo que ya había. Fuera de horario (antes de las 8 o después de las 21) espera y lo manda a la mañana.
   Config: ADS_LISTA (id de la lista, por defecto la de "Pedidos / Solicitudes") y DISCORD_ID_JUAN (si no está, lo busca en Discord). */
const ADS_LISTA_ = '6a5163d017b9a3aed8e61fe7';
function idJuanAds_(cfg) {
  const c = String(cfg.DISCORD_ID_JUAN || P.getProperty('JUAN_ID') || '').trim();
  if (/^\d{15,22}$/.test(c)) return c;
  const puente = String(cfg.DISCORD_PUENTE || '').trim().replace(/\/+$/, ''), clave = P.getProperty('DISCORD_PUENTE_CLAVE'), guild = String(cfg.DISCORD_SERVIDOR || '').trim();
  if (!puente || !clave || !guild) return '';
  const vistos = [];
  ['escalante', 'juan'].some(q => {
    PEDIDOS_++;
    const r = UrlFetchApp.fetch(puente + '/api/v10/guilds/' + guild + '/members/search?query=' + q + '&limit=25', { headers: { 'x-clave': clave }, muteHttpExceptions: true });
    (r.getResponseCode() < 300 ? JSON.parse(r.getContentText()) : []).forEach(m => { if (m.user && !m.user.bot) vistos.push({ id: m.user.id, txt: [m.user.username, m.user.global_name, m.nick].join(' ').toLowerCase() }); });
    return vistos.some(v => /escalante/.test(v.txt));
  });
  const juan = vistos.filter(v => /escalante/.test(v.txt))[0];
  if (juan) P.setProperty('JUAN_ID', juan.id);
  return juan ? juan.id : '';
}
function adsPedidosArmar_(cfg) {
  const lista = String(cfg.ADS_LISTA || ADS_LISTA_).trim();
  const cards = trello_('/lists/' + lista + '/cards', { fields: 'name,shortUrl,due,labels,desc' });
  const prop = P.getProperty('ADS_AVISADOS'), ya = {}; (prop || '').split(',').forEach(x => { if (x) ya[x] = 1; });
  const nuevos = prop == null ? [] : cards.filter(c => !ya[c.id]);
  const lineas = nuevos.map(c => '• **' + String(c.name).slice(0, 100) + '**' + ((c.labels || []).filter(l => l.name).length ? ' · ' + c.labels.filter(l => l.name).map(l => l.name).join(', ') : '') + (c.due ? ' · para el ' + Utilities.formatDate(new Date(c.due), TZ, 'dd/MM') : '') + ' · ' + c.shortUrl);
  const textos = nuevos.length ? trozos_('Hola Juan. ' + (nuevos.length === 1 ? 'Te cargaron un pedido nuevo' : 'Te cargaron ' + nuevos.length + ' pedidos nuevos') + ' en el tablero de ADS:', lineas) : [];
  return { cards: cards, nuevos: nuevos, primera: prop == null, textos: textos };
}
function adsPedidosAvisar_(cfg) {
  const h = hoyAR_().getHours();
  if (/^no$/i.test(String(cfg.PRIVADOS_DISCORD || 'si').trim())) return;
  const r = adsPedidosArmar_(cfg);
  const guardar = ids => P.setProperty('ADS_AVISADOS', ids.join(',').slice(0, 8800));
  if (r.primera) { guardar(r.cards.map(c => c.id)); return; }
  if (!r.nuevos.length || h < 8 || h >= 21) return;
  const id = idJuanAds_(cfg);
  if (!id) { P.setProperty('ADS_NOTA', new Date().toISOString() + ' · no encuentro a Juan Escalante en Discord: cargá DISCORD_ID_JUAN en Config'); return; }
  try { r.textos.forEach(t => discordPrivado_(id, t)); guardar(r.cards.map(c => c.id)); P.deleteProperty('ADS_NOTA'); }
  catch (e) { P.setProperty('ADS_NOTA', new Date().toISOString() + ' · ' + String(e.message).replace(/[A-Za-z0-9_.-]{24,}/g, '…').slice(0, 200)); }
}
/* PRUEBA sin efectos: qué hay en la lista de pedidos de ADS, cuáles serían nuevos y si encuentra a Juan en Discord. No manda nada. */
function probarAvisoAds() {
  const cfg = config_(), r = adsPedidosArmar_(cfg);
  console.log('Pedidos en la lista: ' + r.cards.length + (r.primera ? ' · es la PRIMERA vez: se toma nota de estos y se avisa solo de los que entren después' : ' · nuevos sin avisar: ' + r.nuevos.length));
  r.cards.slice(0, 15).forEach(c => console.log('   ' + c.name + ' · ' + c.shortUrl));
  console.log('Juan en Discord: ' + (idJuanAds_(cfg) ? 'encontrado' : 'NO encontrado (cargar DISCORD_ID_JUAN en Config)') + ' · nota: ' + (P.getProperty('ADS_NOTA') || 'ninguna'));
  r.textos.forEach(t => console.log('→ ' + t));
}

/* Avisa a Juan TODOS los pedidos que están hoy en la lista de ADS (los marca como no avisados y manda). Manda de verdad. */
function avisarAdsTodos() {
  P.setProperty('ADS_AVISADOS', 'x');
  adsPedidosAvisar_(config_());
  console.log('Nota: ' + (P.getProperty('ADS_NOTA') || 'ninguna') + ' · avisados: ' + (P.getProperty('ADS_AVISADOS') || '').split(',').length);
}
/* ---------------- resúmenes de reuniones (Discord "sala de reuniones" → Craig → Drive → Gemini → canal) ----------------
   1. Se graba la reunión con el bot Craig (/join y /stop) y se baja el audio mezclado en un solo archivo (mp3, ogg, flac o m4a).
   2. Se sube ese audio a la carpeta de Drive "Reuniones · audios" (la crea instalarReuniones; el link queda en el registro).
   3. Cada 10 minutos reunionesProcesar() toma los audios nuevos, Gemini transcribe y resume, y el resumen se publica en el
      canal de Discord del webhook. El resumen y la transcripción completa quedan como .txt en "Reuniones · resúmenes".
   Claves (NUNCA en el código): menú del Sheet "Cargar la clave de Gemini" y "Cargar el webhook de reuniones".
   Config opcional: GEMINI_MODELO (por defecto gemini-3.8-flash) y REUNIONES_CRAIG (carpeta de Craig si no es la "Craig" de esta cuenta). Cada audio se procesa una sola vez (propiedad REUNIONES_HECHOS);
   si falla, se reintenta hasta 3 veces y el motivo queda en REUNIONES_NOTA. */
function cargarClaveGemini() { cambiarClave_('GEMINI_KEY', 'Gemini · clave de la API (la de aistudio.google.com)'); }
function cargarWebhookReuniones() { cambiarClave_('REUNIONES_WEBHOOK', 'Discord · URL del webhook del canal de resúmenes de reuniones'); }
function carpetaReuniones_(prop, nombre) {
  let f = null; const id = P.getProperty(prop);
  if (id) { try { f = DriveApp.getFolderById(id); if (f.isTrashed()) f = null; } catch (e) { f = null; } }
  if (!f) { f = DriveApp.createFolder(nombre); P.setProperty(prop, f.getId()); }
  return f;
}
/* Instala el disparador cada 10 minutos y crea las carpetas. Se corre UNA vez desde el editor. */
function instalarReuniones() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'reunionesProcesar').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('reunionesProcesar').timeBased().everyMinutes(10).create();
  const a = carpetaReuniones_('REUNIONES_AUDIOS', 'Reuniones · audios'), r = carpetaReuniones_('REUNIONES_RESUMENES', 'Reuniones · resúmenes');
  console.log('Listo. Subí los audios acá: ' + a.getUrl() + '\nLos resúmenes quedan acá: ' + r.getUrl() +
    '\nClave de Gemini: ' + (P.getProperty('GEMINI_KEY') ? 'cargada' : 'FALTA') + ' · webhook: ' + (P.getProperty('REUNIONES_WEBHOOK') ? 'cargado' : 'FALTA'));
}
/* Carpetas de donde se toman audios: la propia ("Reuniones · audios") y la que crea Craig al subir solo al Drive
   (carpeta "Craig" de esta cuenta; Config REUNIONES_CRAIG con el ID si hubiera otra). */
function carpetasEntradaReuniones_() {
  const out = [carpetaReuniones_('REUNIONES_AUDIOS', 'Reuniones · audios')], id = String(config_().REUNIONES_CRAIG || '').trim();
  if (id) { try { out.push(DriveApp.getFolderById(id)); } catch (e) {} }
  else { const it = DriveApp.getFoldersByName('Craig'); while (it.hasNext()) { const c = it.next(); if (!c.isTrashed()) out.push(c); } }
  return out;
}
const REUNION_MIME_ = { mp3: 'audio/mp3', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav', m4a: 'audio/aac', aac: 'audio/aac', aiff: 'audio/aiff', mp4: 'video/mp4' };
/* Pistas de una reunión: un audio suelto, o el .zip de Craig con una pista por persona (el nombre del archivo trae el usuario de Discord). */
function pistasReunion_(f) {
  const ext = n => ((String(n).match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  const una = (blob, nombre) => {
    const mime = REUNION_MIME_[ext(nombre)] || blob.getContentType() || '';
    if (!/^(audio|video)\//.test(mime)) return null;
    if (blob.getBytes().length > 45 * 1024 * 1024) throw new Error('"' + nombre + '" pesa más de 45 MB: en el panel de Craig elegí un formato más liviano (mp3, ogg o aac)');
    return { blob: blob, mime: mime, nombre: nombre, quien: String(nombre).replace(/\.[^.]+$/, '').replace(/^\d+[-_ ]*/, '') };
  };
  if (ext(f.getName()) === 'zip' || /zip/.test(f.getMimeType())) {
    if (f.getSize() > 45 * 1024 * 1024) throw new Error('"' + f.getName() + '" pesa más de 45 MB: en el panel de Craig elegí un formato más liviano (mp3, ogg o aac)');
    const b = f.getBlob(); b.setContentType('application/zip');
    return Utilities.unzip(b).map(x => una(x, x.getName().split('/').pop())).filter(Boolean);
  }
  const p = una(f.getBlob(), f.getName()); return p ? [p] : [];
}
function geminiAudio_(pistas) {
  const key = P.getProperty('GEMINI_KEY'), modelo = String(config_().GEMINI_MODELO || 'gemini-3.8-flash').trim();
  const base = 'https://generativelanguage.googleapis.com';
  const subir = p => {
    const bytes = p.blob.getBytes();
    // subida resumible del audio a la Files API de Gemini
    const ini = UrlFetchApp.fetch(base + '/upload/v1beta/files', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': key, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(bytes.length), 'X-Goog-Upload-Header-Content-Type': p.mime },
      payload: JSON.stringify({ file: { display_name: p.nombre.slice(0, 100) } }) });
    const h = ini.getAllHeaders(), url = h['x-goog-upload-url'] || h['X-Goog-Upload-URL'];
    if (!url) throw new Error('Gemini no aceptó la subida (' + ini.getResponseCode() + '): ' + ini.getContentText().slice(0, 150));
    const sub = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true, contentType: p.mime,
      headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, payload: bytes });
    const file = (JSON.parse(sub.getContentText() || '{}') || {}).file;
    if (!file) throw new Error('Gemini no guardó el audio (' + sub.getResponseCode() + ')');
    return file;
  };
  const files = [];
  const gen = (texto, json, maxTok) => {
    const cfgGen = { temperature: 0.2, maxOutputTokens: maxTok };
    if (json) cfgGen.responseMimeType = 'application/json';
    if (/2\.5/.test(modelo)) cfgGen.thinkingConfig = { thinkingBudget: json ? 1024 : 0 };
    const r = UrlFetchApp.fetch(base + '/v1beta/models/' + modelo + ':generateContent', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify({ contents: [{ parts: files.map(f => ({ file_data: { mime_type: f.mimeType, file_uri: f.uri } })).concat([{ text: texto }]) }], generationConfig: cfgGen }) });
    if (r.getResponseCode() !== 200) throw new Error('Gemini respondió ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
    return ((((JSON.parse(r.getContentText()).candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
  };
  try {
    pistas.forEach(p => { const f = subir(p); f.mimeType = f.mimeType || p.mime; files.push(f); });
    // esperar a que Gemini termine de procesar cada audio
    for (let i = 0; i < files.length; i++) {
      for (let k = 0; k < 30 && files[i].state === 'PROCESSING'; k++) {
        Utilities.sleep(4000);
        const mt = files[i].mimeType;
        files[i] = JSON.parse(UrlFetchApp.fetch(base + '/v1beta/' + files[i].name, { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true }).getContentText());
        files[i].mimeType = files[i].mimeType || mt;
      }
      if (files[i].state !== 'ACTIVE') throw new Error('Gemini no terminó de procesar el audio (estado ' + files[i].state + ')');
    }
    const equipo = 'Joaquín (director), Ivo (director creativo), Orne y Rama (social media), Fede (guiones), Bauti (filmmaker), Ale (community manager), Zaira y Luisi (diseño), Juan (ads)';
    const intro = 'Es la grabación de una reunión del Estudio Ideamia, una agencia de redes sociales de Argentina. Integrantes posibles: ' + equipo + '. ' +
      (pistas.length > 1 ? 'Hay ' + pistas.length + ' audios, uno por persona y en el mismo tiempo (empiezan juntos): ' + pistas.map((p, i) => 'audio ' + (i + 1) + ' = usuario de Discord "' + p.quien + '"').join(', ') +
        '. Usá eso para saber quién dice cada cosa (asociá cada usuario con el integrante que corresponda). ' : '');
    const reglas = ' Español rioplatense con voseo. No uses el guion largo; usá punto, coma o dos puntos. No inventes nada que no se haya dicho.';
    // 1) resumen (respuesta corta: llega rápido aunque la reunión sea larga)
    const txt = gen(intro + 'Respondé SOLO un JSON con estas claves: "titulo" (corto, de qué se habló), "resumen" (4 a 8 líneas), "decisiones" (lista de textos), ' +
      '"tareas" (lista de objetos {"quien","que","cuando"}; cuando vacío si no se dijo), "marcas" (lista de marcas o clientes mencionados).' + reglas, true, 8000);
    let res;
    try { res = JSON.parse(txt.replace(/^```(json)?|```$/g, '').trim()); }
    catch (e) { res = { titulo: 'Reunión', resumen: txt.slice(0, 1500), decisiones: [], tareas: [], marcas: [] }; }
    // 2) transcripción aparte: si falla o tarda demasiado, el resumen se publica igual
    try { res.transcripcion = gen(intro + 'Transcribí todo lo que se dice, en orden, con el nombre de quien habla cuando se pueda deducir (si no, "Persona 1", "Persona 2"). Solo la transcripción, sin comentarios.' + reglas, false, 60000); }
    catch (e) { res.transcripcion = '(no se pudo transcribir: ' + String(e.message || e).slice(0, 150) + ')'; }
    return res;
  } finally {
    files.forEach(f => { try { UrlFetchApp.fetch(base + '/v1beta/' + f.name, { method: 'delete', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true }); } catch (e) {} });
  }
}
function reunionTexto_(res, fecha) {
  const lista = (a, f) => (Array.isArray(a) ? a : []).filter(Boolean).map(f);
  const lineas = [];
  String(res.resumen || '').split(/\n+/).filter(Boolean).forEach(l => lineas.push(l));
  const dec = lista(res.decisiones, d => '• ' + d);
  if (dec.length) { lineas.push('', '**Decisiones**'); dec.forEach(l => lineas.push(l)); }
  const tar = lista(res.tareas, t => '• ' + (t.quien ? '**' + t.quien + '**: ' : '') + (t.que || '') + (t.cuando ? ' (' + t.cuando + ')' : ''));
  if (tar.length) { lineas.push('', '**Tareas**'); tar.forEach(l => lineas.push(l)); }
  const mar = lista(res.marcas, m => m);
  if (mar.length) lineas.push('', 'Marcas: ' + mar.join(', '));
  return { encabezado: '📋 **' + String(res.titulo || 'Reunión').slice(0, 120) + '** · ' + fecha, lineas: lineas };
}
function reunionesProcesar() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(1000)) return;
  try {
    if (!P.getProperty('GEMINI_KEY') || !P.getProperty('REUNIONES_WEBHOOK')) return;
    const audios = carpetaReuniones_('REUNIONES_AUDIOS', 'Reuniones · audios'), salida = carpetaReuniones_('REUNIONES_RESUMENES', 'Reuniones · resúmenes');
    const hechos = JSON.parse(P.getProperty('REUNIONES_HECHOS') || '{}'), pend = [];
    carpetasEntradaReuniones_().forEach(c => { const it = c.getFiles(); while (it.hasNext()) { const f = it.next(); const v = hechos[f.getId()]; if (v === 'ok' || v === 'no' || Number(v) >= 3) continue; pend.push(f); } });
    pend.sort((a, b) => a.getDateCreated() - b.getDateCreated());
    const f = pend[0]; if (!f) return;   // uno por vez: cada audio puede llevar varios minutos
    try {
      const pistas = pistasReunion_(f);
      if (!pistas.length) { hechos[f.getId()] = 'no'; P.setProperty('REUNIONES_HECHOS', JSON.stringify(hechos)); return; }   // no es audio (p. ej. un .txt de Craig)
      const res = geminiAudio_(pistas);
      const fecha = Utilities.formatDate(f.getDateCreated(), TZ, 'dd/MM/yyyy HH:mm');
      const t = reunionTexto_(res, fecha);
      const doc = salida.createFile(fecha.replace(/[\/: ]/g, '-') + ' · ' + String(res.titulo || 'Reunión').replace(/[\\\/:*?"<>|]/g, '').slice(0, 80) + '.txt',
        t.encabezado.replace(/\*\*/g, '') + '\n\n' + t.lineas.join('\n').replace(/\*\*/g, '') + '\n\n──── Transcripción ────\n\n' + String(res.transcripcion || ''), 'text/plain');
      t.lineas.push('', 'Transcripción completa: ' + doc.getUrl());
      trozos_(t.encabezado, t.lineas).forEach((m, i) => {
        const r = UrlFetchApp.fetch(P.getProperty('REUNIONES_WEBHOOK'), { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          payload: JSON.stringify({ content: m, allowed_mentions: { parse: [] } }) });
        if (r.getResponseCode() >= 300) throw new Error('Discord no aceptó el mensaje ' + (i + 1) + ' (' + r.getResponseCode() + ')');
        Utilities.sleep(800);
      });
      hechos[f.getId()] = 'ok'; P.deleteProperty('REUNIONES_NOTA');
    } catch (e) {
      hechos[f.getId()] = (Number(hechos[f.getId()]) || 0) + 1;
      P.setProperty('REUNIONES_NOTA', new Date().toISOString() + ' · ' + String(e.message || e).replace(/key=[\w-]+/g, 'key=…').slice(0, 300));
    }
    P.setProperty('REUNIONES_HECHOS', JSON.stringify(hechos));
  } finally { lock.releaseLock(); }
}
/* PRUEBA sin efectos: qué audios están esperando, si están las claves y el último error. No llama a Gemini ni publica. */
function probarReuniones() {
  const hechos = JSON.parse(P.getProperty('REUNIONES_HECHOS') || '{}');
  console.log('Clave de Gemini: ' + (P.getProperty('GEMINI_KEY') ? 'cargada' : 'FALTA') + ' · webhook: ' + (P.getProperty('REUNIONES_WEBHOOK') ? 'cargado' : 'FALTA') +
    ' · disparador: ' + (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'reunionesProcesar') ? 'instalado' : 'FALTA (correr instalarReuniones)'));
  carpetasEntradaReuniones_().forEach(c => {
    console.log('Carpeta: ' + c.getName() + ' · ' + c.getUrl());
    const it = c.getFiles();
    while (it.hasNext()) { const f = it.next(), v = hechos[f.getId()]; console.log('   ' + f.getName() + ' · ' + Math.round(f.getSize() / 1048576) + ' MB · ' + (v === 'ok' ? 'resumido' : v === 'no' ? 'no es audio' : v ? 'falló ' + v + ' vez/veces' : 'pendiente')); }
  });
  console.log('Último error: ' + (P.getProperty('REUNIONES_NOTA') || 'ninguno'));
}

/* ---------------- OKR por marca (página "Objetivos": solo social media de cada marca y el project) ----------------
   Las metas viven en la pestaña "OKR" del Sheet (una fila por objetivo; Joaquín la edita). Lo logrado sale solo de los reportes
   (Sheet de Reportes: mensual y semanal) y lo que no se puede calcular lo anota la social media en la página (archivo de Drive).
   Métricas: seg_netos (sumados − perdidos), contactos, alcance_suma (suma de alcance de cada mes), alcance_esp (espectadores del
   período en Meta: se anota a mano), reels (cantidad de reels con "umbral" views o más, orgánico + pauta), conversion (% seguidores
   netos / alcance), manual (sí/no, p. ej. campañas). "base" = lo acumulado hasta "base_hasta" (antes de que existieran los reportes).
   Bono: Config OKR_BONO_TRIMESTRAL / SEMESTRAL / ANUAL (20 / 40 / 70 % del salario de la marca) repartido parejo entre los objetivos
   del período (o según "peso"). Se cobra la parte de cada objetivo cumplido. */
const OKR_COLS = ['id', 'marca', 'periodo', 'tipo', 'desde', 'hasta', 'objetivo', 'metrica', 'meta', 'minimo_mes', 'umbral', 'base', 'base_hasta', 'peso', 'cerrado', 'nota'];
function okrCrearPestana() {
  const ss = SpreadsheetApp.getActive(); let h = ss.getSheetByName('OKR');
  if (h) return console.log('La pestaña OKR ya existe: no se toca. Filas: ' + (h.getLastRow() - 1));
  h = ss.insertSheet('OKR');
  const T = ['tritato', 'Trimestral octubre a diciembre 2026', 'trimestral', '2026-10-01', '2026-12-31'];
  const S = ['tritato', 'Semestral junio a diciembre 2026', 'semestral', '2026-07-01', '2026-12-31'];
  const filas = [
    ['trit-t4-seg'].concat(T, ['Seguidores netos: 3.300 en el trimestre y mínimo 900 cada mes', 'seg_netos', 3300, 900, '', '', '', '', '', 'Colaboraciones cuentan. Vale pauta.']),
    ['trit-t4-cont'].concat(T, ['Contactos nuevos: 360 en el trimestre y mínimo 100 cada mes', 'contactos', 360, 100, '', '', '', '', '', 'Si se cumple, también cierra el de contactos del semestral.']),
    ['trit-t4-alc'].concat(T, ['Alcance: 150.000 espectadores del trimestre', 'alcance_esp', 150000, '', '', '', '', '', '', 'Meta Business Suite > Estadísticas > Resultados > Instagram, del 1/10 a hoy: número de Espectadores. No se suman meses.']),
    ['trit-t4-reels'].concat(T, ['5 reels con 70.000 views o más', 'reels', 5, '', 70000, '', '', '', '', 'Se cuentan views totales (orgánico + pauta) de los reels cargados en los reportes.']),
    ['trit-t4-camp'].concat(T, ['Campaña Nivel 1 de Navidad / Fin de año', 'manual', 1, '', '', '', '', '', '', 'Reel de 100.000 views o más, carrusel de 300 me gusta o más y 40 contactos nuevos en la semana de la campaña.']),
    ['trit-s2-seg'].concat(S, ['Seguidores netos (jul a dic): 4.000', 'seg_netos', 4000, '', '', '', '', '', 'si', 'Cumplido en agosto (colaboración con Agus Bulacios).']),
    ['trit-s2-cont'].concat(S, ['Contactos nuevos (jul a dic): 800', 'contactos', 800, '', '', 628, '2026-09-30', '', '', '628 acumulados a septiembre.']),
    ['trit-s2-alc'].concat(S, ['Alcance acumulado (jul a dic, sumando meses): 450.000', 'alcance_suma', 450000, '', '', 292200, '2026-09-30', '', '', 'Este semestral se mide sumando el alcance de cada mes (excepción de 2026).']),
    ['trit-s2-conv'].concat(S, ['Conversión alcance → seguidores: 1,3 % o más', 'conversion', 1.3, '', '', '', '', '', 'si', 'Cumplido.']),
    ['trit-s2-n1'].concat(S, ['Campaña Nivel 1 (mínimo 1, obligatoria)', 'manual', 1, '', '', '', '', '', '', 'Desde octubre: reel 100.000 views, carrusel 300 me gusta y 40 contactos en la semana. La de Navidad del trimestral la cierra.']),
    ['trit-s2-n2'].concat(S, ['Campañas Nivel 2 (al menos 2)', 'manual', 2, '', '', '', '', '', 'si', 'Cumplidas: Mundial y Día del Niño.'])
  ];
  h.getRange(1, 1, 1, OKR_COLS.length).setValues([OKR_COLS]).setFontWeight('bold');
  h.getRange(2, 1, filas.length, OKR_COLS.length).setValues(filas);
  h.getRange(2, 5, filas.length, 2).setNumberFormat('@'); h.getRange(2, 13, filas.length, 1).setNumberFormat('@');
  h.setFrozenRows(1); h.autoResizeColumns(1, 6);
  console.log('Pestaña OKR creada con ' + filas.length + ' objetivos de Tritato.');
}
const okrNum_ = v => {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   // 116.299 · 1.234,5
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');                                   // 1,4
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');                          // 116,299
  const n = Number(s); return isFinite(n) ? n : null;
};
const okrFecha_ = v => v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '').trim();
function okrDefs_() {
  const h = SpreadsheetApp.getActive().getSheetByName('OKR'); if (!h || h.getLastRow() < 2) return [];
  const v = h.getRange(1, 1, h.getLastRow(), h.getLastColumn()).getValues(), cab = v[0].map(x => norm_(String(x)).replace(/ /g, '_'));
  return v.slice(1).map(r => { const o = {}; cab.forEach((c, i) => o[c] = r[i]); return o; }).filter(o => o.id && o.marca && o.metrica)
    .map(o => ({ id: String(o.id).trim(), marca: String(o.marca).trim(), periodo: String(o.periodo || '').trim(), tipo: norm_(String(o.tipo || 'trimestral')),
      desde: okrFecha_(o.desde), hasta: okrFecha_(o.hasta), objetivo: String(o.objetivo || ''), metrica: norm_(String(o.metrica)).replace(/ /g, '_'),
      meta: okrNum_(o.meta), minMes: okrNum_(o.minimo_mes), umbral: okrNum_(o.umbral), base: okrNum_(o.base) || 0, baseHasta: okrFecha_(o.base_hasta),
      peso: okrNum_(o.peso), cerrado: /^(si|sí|x|ok|cumplido)$/i.test(String(o.cerrado || '').trim()), nota: String(o.nota || '') }));
}
/* Reportes vivos (sin los dados de baja; si se corrigió, queda el último): [{tipo, marca, periodo, enviado, d}] */
function okrReportes_() {
  const c = CacheService.getScriptCache(), hit = c.get('okrrep'); if (hit) return JSON.parse(hit);
  const url = 'https://docs.google.com/spreadsheets/d/' + REP_SHEET + '/export?format=csv';
  let txt = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
  if (!/^enviado_en/.test(txt)) txt = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getContentText();
  if (!/^enviado_en/.test(txt)) return [];
  const rows = Utilities.parseCsv(txt), h = rows[0], ix = k => h.indexOf(k);
  const iT = ix('tipo'), iM = ix('marca_slug'), iP = ix('periodo_id'), iE = ix('enviado_en'), iD = ix('datos_json'), bajas = {}, ult = {};
  rows.slice(1).forEach(r => { if (r[iT] === 'baja') { try { const d = JSON.parse(r[iD] || '{}'); bajas[d.ref_tipo + '|' + r[iM] + '|' + d.ref_enviado_en] = 1; } catch (e) {} } });
  rows.slice(1).forEach(r => {
    const tipo = r[iT]; if (['mensual', 'sm'].indexOf(tipo) < 0 || bajas[tipo + '|' + r[iM] + '|' + r[iE]]) return;
    let p = String(r[iP] || '').trim(); const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(p);
    if (dm) p = dm[3] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[1]).slice(-2);
    if (tipo === 'mensual') p = p.slice(0, 7);
    let d = {}; try { d = JSON.parse(r[iD] || '{}'); } catch (e) {}
    // solo lo que se usa (el caché tiene un límite de 100 KB)
    const k = {}; Object.keys(d).forEach(x => { if (/^(seg_sumados|seg_perdidos|m_contactos|m_alc_total|alcance_total)$/.test(x) || /^rk_reel_\d+_(views|views_pauta|link|desc|fecha)$/.test(x) || /^reel\d+_(res_views|link|nombre|dia)$/.test(x)) k[x] = d[x]; });
    const key = tipo + '|' + r[iM] + '|' + p;
    if (!ult[key] || String(r[iE]) > ult[key].enviado) ult[key] = { tipo: tipo, marca: r[iM], periodo: p, enviado: String(r[iE]), d: k };
  });
  const out = Object.keys(ult).map(x => ult[x]);
  try { c.put('okrrep', JSON.stringify(out), 600); } catch (e) {}
  return out;
}
/* Reels cargados en reportes (mensual y semanal), sin repetir: el mismo reel se reconoce por el link (o la descripción). */
function okrReels_(reps, marca, desde, hasta) {
  const vistos = {};
  reps.filter(r => r.marca === marca).forEach(r => {
    if (r.tipo === 'mensual' && (r.periodo < desde.slice(0, 7) || r.periodo > hasta.slice(0, 7))) return;
    // semanal: el período es el lunes; entra si algún día de esa semana cae dentro del período del objetivo
    if (r.tipo === 'sm' && (Utilities.formatDate(new Date(new Date(r.periodo + 'T12:00:00').getTime() + 6 * 864e5), TZ, 'yyyy-MM-dd') < desde || r.periodo > hasta)) return;
    const idx = {}, ren = { res_views: 'views', nombre: 'desc', dia: 'fecha' };
    Object.keys(r.d).forEach(k => { const m = /^rk_reel_(\d+)_(\w+)$/.exec(k) || /^reel(\d+)_(\w+)$/.exec(k); if (m) (idx[m[1]] = idx[m[1]] || {})[ren[m[2]] || m[2]] = r.d[k]; });
    Object.keys(idx).forEach(i => {
      const x = idx[i], v = (okrNum_(x.views) || 0) + (okrNum_(x.views_pauta) || 0); if (!v) return;
      const id = String(x.link || '').replace(/[?#].*$/, '').replace(/\/$/, '') || norm_(String(x.desc || '')).slice(0, 40) || (r.periodo + i);
      if (!vistos[id] || vistos[id].v < v) vistos[id] = { v: v, desc: String(x.desc || '').slice(0, 80), link: x.link || '', fecha: x.fecha || '' };
    });
  });
  return Object.keys(vistos).map(k => vistos[k]);
}
/* Valor por mes (yyyy-MM) de una métrica: el mensual si existe; si no, la suma de los semanales de ese mes (solo seguidores). */
function okrPorMes_(reps, marca, metrica, desde, hasta) {
  const meses = []; let d = new Date(desde.slice(0, 7) + '-01T12:00:00');
  while (Utilities.formatDate(d, TZ, 'yyyy-MM') <= hasta.slice(0, 7)) { meses.push(Utilities.formatDate(d, TZ, 'yyyy-MM')); d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12); }
  const mias = reps.filter(r => r.marca === marca);
  return meses.map(mes => {
    const men = mias.filter(r => r.tipo === 'mensual' && r.periodo === mes)[0];
    const val = r => metrica === 'seg_netos' ? (okrNum_(r.d.seg_sumados) || 0) - (okrNum_(r.d.seg_perdidos) || 0)
      : metrica === 'contactos' ? okrNum_(r.d.m_contactos) : /^alcance/.test(metrica) ? okrNum_(r.d.m_alc_total) : null;
    if (men) return { mes: mes, v: val(men), fuente: 'mensual' };
    if (metrica === 'seg_netos') {
      const sem = mias.filter(r => r.tipo === 'sm' && r.periodo.slice(0, 7) === mes);
      if (sem.length) return { mes: mes, v: sem.reduce((a, r) => a + val(r), 0), fuente: sem.length + ' semanal' + (sem.length > 1 ? 'es' : ''), parcial: true };
    }
    return { mes: mes, v: null, fuente: 'falta' };
  });
}
function okrCalcular_(o, reps, man, hoyS) {
  const r = { id: o.id, objetivo: o.objetivo, metrica: o.metrica, meta: o.meta, minMes: o.minMes, umbral: o.umbral, nota: o.nota, manual: false };
  const anot = man[o.id] || null;
  const desdeAuto = o.baseHasta && o.baseHasta >= o.desde ? Utilities.formatDate(new Date(new Date(o.baseHasta + 'T12:00:00').getTime() + 864e5), TZ, 'yyyy-MM-dd') : o.desde;
  if (o.cerrado) { r.logrado = o.meta; r.cumplido = true; r.cerrado = true; }
  else if (o.metrica === 'seg_netos' || o.metrica === 'contactos' || o.metrica === 'alcance_suma') {
    const meses = okrPorMes_(reps, o.marca, o.metrica, desdeAuto, o.hasta).filter(m => m.mes <= hoyS.slice(0, 7));
    r.meses = meses; r.logrado = o.base + meses.reduce((a, m) => a + (m.v || 0), 0); r.base = o.base || 0;
    r.faltanDatos = meses.filter(m => m.v == null).map(m => m.mes);
    if (o.minMes) r.mesesBajos = meses.filter(m => m.v != null && !m.parcial && m.v < o.minMes).map(m => m.mes);
    // con mínimo mensual: se da por cumplido recién cuando terminó el período, con todos los meses reportados y ninguno abajo del mínimo
    const llego = r.logrado >= o.meta && !(r.mesesBajos || []).length;
    r.cumplido = o.minMes ? llego && o.hasta < hoyS && !r.faltanDatos.length && !meses.some(m => m.parcial) : llego;
    r.enCamino = llego && !r.cumplido;
  } else if (o.metrica === 'reels') {
    const lista = okrReels_(reps, o.marca, o.desde, o.hasta).filter(x => x.v >= (o.umbral || 0)).sort((a, b) => b.v - a.v);
    r.reels = lista.slice(0, 12); r.logrado = lista.length; r.cumplido = r.logrado >= o.meta;
  } else if (o.metrica === 'conversion') {
    const s = okrPorMes_(reps, o.marca, 'seg_netos', o.desde, o.hasta), a = okrPorMes_(reps, o.marca, 'alcance_suma', o.desde, o.hasta);
    const ss = s.reduce((x, m) => x + (m.v || 0), 0), aa = a.reduce((x, m) => x + (m.v || 0), 0);
    r.logrado = aa ? Math.round(ss / aa * 1000) / 10 : null; r.cumplido = r.logrado != null && r.logrado >= o.meta;
  } else {   // alcance_esp y manual: lo anota la social media
    r.manual = true;
    if (anot) { r.logrado = anot.v; r.anotado = { quien: anot.quien, cuando: anot.cuando, nota: anot.nota || '' }; }
    r.cumplido = r.logrado != null && r.logrado >= o.meta;
  }
  // ritmo: cuánto debería llevar hoy si avanzara parejo
  const t0 = new Date(o.desde + 'T00:00:00').getTime(), t1 = new Date(o.hasta + 'T23:59:59').getTime(), ahora = new Date(hoyS + 'T12:00:00').getTime();
  r.avanceTiempo = Math.max(0, Math.min(1, (ahora - t0) / (t1 - t0)));
  if (!r.cumplido && o.meta && r.logrado != null && ['seg_netos', 'contactos', 'alcance_suma', 'reels', 'alcance_esp'].indexOf(o.metrica) >= 0) {
    const mesesRest = Math.max(0, (new Date(t1).getFullYear() - new Date(ahora).getFullYear()) * 12 + new Date(t1).getMonth() - new Date(ahora).getMonth()) + 1;
    r.falta = Math.max(0, o.meta - r.logrado); r.porMes = mesesRest ? Math.ceil(r.falta / mesesRest) : r.falta;
    r.atrasado = r.logrado < o.meta * r.avanceTiempo * 0.9;
  }
  return r;
}
function okrVista_(quien, esProject) {
  const cfgR = reportesConfig_(), cfg = config_(), defs = okrDefs_(), reps = okrReportes_(), man = leerJson_('OKR_FILE_ID', 'panel-ideamia-okr.json').v || {};
  const hoyS = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const bono = { trimestral: okrNum_(cfg.OKR_BONO_TRIMESTRAL) || 20, semestral: okrNum_(cfg.OKR_BONO_SEMESTRAL) || 40, anual: okrNum_(cfg.OKR_BONO_ANUAL) || 70 };
  const marcas = (cfgR.marcas || []).filter(m => esProject || m.sm === norm_(quien));
  const nombres = {}; (cfgR.marcas || []).forEach(m => nombres[m.slug] = m.nombre || m.slug);
  const out = marcas.map(m => {
    const mias = defs.filter(o => o.marca === m.slug), pers = {};
    mias.forEach(o => { const k = o.periodo + '|' + o.desde; (pers[k] = pers[k] || { titulo: o.periodo, tipo: o.tipo, desde: o.desde, hasta: o.hasta, objs: [] }).objs.push(o); });
    const periodos = Object.keys(pers).map(k => {
      const p = pers[k], total = bono[p.tipo] || bono.trimestral, pesos = p.objs.map(o => o.peso), conPeso = pesos.every(x => x != null);
      const objetivos = p.objs.map((o, i) => Object.assign(okrCalcular_(o, reps, man, hoyS), { vale: Math.round((conPeso ? pesos[i] : total / p.objs.length) * 100) / 100 }));
      const cumplidos = objetivos.filter(o => o.cumplido);
      return { titulo: p.titulo, tipo: p.tipo, desde: p.desde, hasta: p.hasta, terminado: p.hasta < hoyS, abierto: p.desde <= hoyS && p.hasta >= hoyS, bono: total,
        cumplidos: cumplidos.length, total: objetivos.length, logradoPct: Math.round(cumplidos.reduce((a, o) => a + o.vale, 0) * 100) / 100, objetivos: objetivos };
    }).sort((a, b) => (a.terminado - b.terminado) || a.hasta.localeCompare(b.hasta));
    return { slug: m.slug, nombre: m.nombre || m.slug, sm: m.sm, periodos: periodos };
  });
  return { ok: true, hoy: hoyS, quien: quien, project: !!esProject, marcas: out, reportesHasta: reps.reduce((a, r) => r.tipo === 'mensual' && r.periodo > a ? r.periodo : a, '') };
}
/* La social media de la marca (o el project) anota un valor que no sale de los reportes: espectadores del período, campaña cumplida, etc. */
function okrAnotar_(b, quien, esProject) {
  const defs = okrDefs_(), o = defs.filter(x => x.id === String(b.id || ''))[0];
  if (!o) return { error: 'datos', mensaje: 'No encuentro ese objetivo' };
  const m = (reportesConfig_().marcas || []).filter(x => x.slug === o.marca)[0];
  if (!esProject && (!m || m.sm !== norm_(quien))) return { error: 'permiso', mensaje: 'Solo la social media de la marca puede anotar sus objetivos' };
  if (['alcance_esp', 'manual'].indexOf(o.metrica) < 0) return { error: 'datos', mensaje: 'Este objetivo se calcula solo con los reportes' };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const g = leerJson_('OKR_FILE_ID', 'panel-ideamia-okr.json'); g.v = g.v || {}; g.hist = g.hist || [];
    const v = b.borrar ? null : okrNum_(b.valor);
    if (!b.borrar && v == null) return { error: 'datos', mensaje: 'Falta el número' };
    if (b.borrar) delete g.v[o.id]; else g.v[o.id] = { v: v, quien: norm_(quien), cuando: new Date().toISOString(), nota: String(b.nota || '').slice(0, 300) };
    g.hist.push({ id: o.id, v: v, quien: norm_(quien), cuando: new Date().toISOString() }); g.hist = g.hist.slice(-500);
    guardarJson_('OKR_FILE_ID', 'panel-ideamia-okr.json', g);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
/* PRUEBA sin efectos: cómo viene cada marca con objetivos cargados. */
function probarOKR() {
  const v = okrVista_('project', true);
  v.marcas.filter(m => m.periodos.length).forEach(m => m.periodos.forEach(p => {
    console.log(m.nombre + ' · ' + p.titulo + ' · ' + p.cumplidos + ' de ' + p.total + ' → ' + p.logradoPct + ' % de ' + p.bono + ' %');
    p.objetivos.forEach(o => console.log('   ' + (o.cumplido ? '✔' : '·') + ' ' + o.objetivo + ' · logrado ' + o.logrado + ' de ' + o.meta + (o.faltanDatos && o.faltanDatos.length ? ' · faltan reportes de ' + o.faltanDatos.join(', ') : '') + (o.mesesBajos && o.mesesBajos.length ? ' · meses bajo el mínimo: ' + o.mesesBajos.join(', ') : '')));
  }));
  console.log('Marcas sin objetivos cargados: ' + v.marcas.filter(m => !m.periodos.length).map(m => m.nombre).join(', ') + ' · último mensual: ' + v.reportesHasta);
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
        claves: { trello: !!P.getProperty('TRELLO_TOKEN'), claude: !!P.getProperty('ANTHROPIC_KEY'), equipo: !!P.getProperty('TEAM_KEY'), project: !!P.getProperty('PROJECT_KEY'), projectIgualEquipo: !!P.getProperty('PROJECT_KEY') && P.getProperty('PROJECT_KEY') === P.getProperty('TEAM_KEY'), discord: !!P.getProperty('DISCORD_TOKEN') },
        uso: (() => { try { return JSON.parse(P.getProperty('USO_DIA') || 'null'); } catch (e) { return null; } })(), lecturaUnida: P.getProperty('LECTURA_UNIDA') === 'si', intentosFallidos: P.getProperty('ALERTA_CLAVES') || null,
        discord: (() => { const d = leerJson_('DISCORD_FILE_ID', 'panel-ideamia-discord.json'); return { generado: d.generado || null, canales: d.canales || 0, stats: d.stats || null, menciones: Object.keys(d.porPersona || {}).map(k => k + ':' + d.porPersona[k].length), privado: P.getProperty('DISCORD_DM_ERROR') || null, error: (P.getProperty('DISCORD_ERROR') || '').replace(/[A-Za-z0-9_.-]{24,}/g, '…') || null }; })() }, q.cb);
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
    if (q.action === 'agenda') { // calendario privado de ideamia.contacto: solo con la clave del project
      if (!claveOk_(q.k, true)) return json_({ error: 'clave', mensaje: 'Clave del project incorrecta' }, q.cb);
      if (!/project|direcc|creativ/i.test(((catalogo_().equipo.filter(x => x.clave === norm_(q.p || ''))[0]) || {}).rol || '')) return json_({ error: 'permiso', mensaje: 'La agenda privada es solo para el project y dirección' }, q.cb);
      try { return json_(agendaPrivada_(), q.cb); } catch (e) { return json_({ error: 'calendario', mensaje: 'No se pudo leer el calendario: ' + String(e.message || e).slice(0, 200) }, q.cb); }
    }
    if (q.action === 'okr') { // objetivos por marca: solo la social media de cada marca (sus marcas) y el project (todas, con su clave)
      const yo = catalogo_().equipo.filter(x => x.clave === norm_(q.p || ''))[0], esProj = !!yo && /project/i.test(yo.rol);
      if (!claveOk_(q.k, esProj)) return json_({ error: 'clave', mensaje: esProj ? 'Clave del project incorrecta' : 'Clave del equipo incorrecta' }, q.cb);
      if (!yo || (!esProj && !(reportesConfig_().marcas || []).some(m => m.sm === yo.clave))) return json_({ error: 'permiso', mensaje: 'Los objetivos son solo para las social media y el project' }, q.cb);
      return json_(okrVista_(yo.clave, esProj), q.cb);
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
      case 'okrAnotar': { // la social media anota un valor de sus objetivos (espectadores del período, campaña cumplida)
        const yo = catalogo_().equipo.filter(x => x.clave === norm_(quien))[0], esProj = !!yo && /project/i.test(yo.rol);
        if (!yo || (esProj && !claveOk_(b.k, true))) return json_({ error: 'permiso', mensaje: 'Sin permiso' });
        return json_(okrAnotar_(b, yo.clave, esProj));
      }
      case 'entregarPieza': // el filmmaker marca "Listo": la tarjeta pasa a En revisión
        return json_(entregarPieza_(b, quien));
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
      case 'fotoMarca': // anotar la última producción de fotografía de una marca (project, dirección o filmmaker)
        try { return json_(fotoMarca_(b, quien)); } catch (e) { return json_({ error: 'servidor', mensaje: 'No se pudo guardar: ' + String(e.message || e).slice(0, 200) }); }
      case 'agendarPrivada': // reunión en el calendario privado (ideamia.contacto): solo con la clave del project
        if (!claveOk_(b.k, true)) return json_({ error: 'clave', mensaje: 'Esto es solo para el project y dirección' });
        if (!/project|direcc|creativ/i.test(((catalogo_().equipo.filter(x => x.clave === norm_(quien))[0]) || {}).rol || '')) return json_({ error: 'permiso', mensaje: 'La agenda privada es solo para el project y dirección' });
        try { return json_(agendarPrivada_(b)); } catch (e) { return json_({ error: 'calendario', mensaje: 'No se pudo crear la reunión: ' + String(e.message || e).slice(0, 200) }); }
      case 'invitadosPrivada': // agregar o sacar invitados de una reunión del calendario privado: solo con la clave del project
        if (!claveOk_(b.k, true)) return json_({ error: 'clave', mensaje: 'Esto es solo para el project y dirección' });
        if (!/project|direcc|creativ/i.test(((catalogo_().equipo.filter(x => x.clave === norm_(quien))[0]) || {}).rol || '')) return json_({ error: 'permiso', mensaje: 'La agenda privada es solo para el project y dirección' });
        try { return json_(invitadosPrivada_(b)); } catch (e) { return json_({ error: 'calendario', mensaje: 'No se pudieron cambiar los invitados: ' + String(e.message || e).slice(0, 200) }); }
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
          const c = trello_('/cards/' + id, { fields: 'name,desc,due,shortUrl', attachments: 'true', attachment_fields: 'id,name,url,mimeType,isUpload,bytes,previews', checklists: 'all', checklist_fields: 'name,pos', actions: 'commentCard', actions_limit: 6, action_fields: 'data,date', action_memberCreator_fields: 'fullName' });
          return { id: c.id, n: c.name, d: String(c.desc || '').slice(0, 2500), due: c.due, url: c.shortUrl,
            att: (c.attachments || []).slice(0, 12).map(a => ({ id: a.id, card: c.id, n: a.name, u: a.url, mime: a.mimeType || '', subido: !!a.isUpload, src: linkAdjunto_(c.id, a),
              ver: !!a.isUpload && (/^image\//.test(a.mimeType || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || '') || (a.previews || []).length > 0),
              video: /^video\//.test(a.mimeType || '') || /\.(mp4|mov|webm)$/i.test(a.name || '') })),
            chk: (c.checklists || []).sort((x, y) => x.pos - y.pos).slice(0, 6).map(k => ({ n: k.name, items: (k.checkItems || []).sort((x, y) => x.pos - y.pos).slice(0, 40).map(i => ({ n: String(i.name || '').slice(0, 200), ok: i.state === 'complete' })) })),
            com: (c.actions || []).map(a => ({ t: (a.data || {}).text || '', f: a.date, q: (a.memberCreator || {}).fullName || '' })) };
        } catch (e) { return null; } };
        const orig = /trello\.com\/c\/([A-Za-z0-9]+)/.exec(String(b.origUrl || ''));
        return json_({ ok: true, pieza: ver(b.cardId), original: orig ? ver(orig[1]) : null });
      }
      case 'borrarAdjunto': { // quien revisa borra un archivo de la tarjeta (en Trello no se puede deshacer)
        const yoA = catalogo_().equipo.filter(p => p.clave === norm_(quien))[0];
        if (!yoA || !/project|direcc|creativ/i.test(yoA.rol)) return json_({ error: 'permiso', mensaje: 'Solo dirección y el project pueden borrar archivos de una tarjeta' });
        if (!b.cardId || !b.attId) return json_({ error: 'datos', mensaje: 'Falta la tarjeta o el archivo' });
        // se comprueba que el archivo sea de esa tarjeta antes de borrarlo
        const a = trello_('/cards/' + b.cardId + '/attachments/' + b.attId, { fields: 'name,isUpload' });
        if (!a || !a.id) return json_({ error: 'datos', mensaje: 'Ese archivo ya no está en la tarjeta' });
        trello_('/cards/' + b.cardId + '/attachments/' + b.attId, null, 'delete');
        registrar_(quien, 'revision', 'card:' + b.cardId, b.marca, 'borró archivo', String(b.nombre || '').slice(0, 80) + ' · ' + String(a.name || '').slice(0, 120), '');
        return json_({ ok: true, pasos: ['Archivo "' + String(a.name || '').slice(0, 60) + '" borrado de la tarjeta de Trello'] });
      }
      case 'subirAdjunto': { // quien revisa sube una imagen a la tarjeta (a la original si la de Diseño/Producción es un espejo, que es la que se ve en Trello)
        const yoS = catalogo_().equipo.filter(p => p.clave === norm_(quien))[0];
        if (!yoS || !/project|direcc|creativ/i.test(yoS.rol)) return json_({ error: 'permiso', mensaje: 'Solo dirección y el project pueden subir archivos a una tarjeta' });
        const mime = String(b.mime || ''), nombreA = String(b.archivo || 'imagen').replace(/[\/:*?"<>|]+/g, ' ').slice(0, 120);
        if (!b.cardId || !b.data) return json_({ error: 'datos', mensaje: 'Falta la tarjeta o el archivo' });
        if (!/^image\/(png|jpe?g|gif|webp)$/i.test(mime)) return json_({ error: 'datos', mensaje: 'Solo se pueden subir imágenes (PNG, JPG, GIF o WEBP)' });
        const bytes = Utilities.base64Decode(String(b.data));
        if (bytes.length > 9.5 * 1024 * 1024) return json_({ error: 'datos', mensaje: 'La imagen pesa más de 9 MB: subila desde Trello' });
        const destino = tarjetaQueSeVe_(b.cardId), kT = P.getProperty('TRELLO_KEY'), tkT = P.getProperty('TRELLO_TOKEN');
        PEDIDOS_++;
        const r = UrlFetchApp.fetch('https://api.trello.com/1/cards/' + destino + '/attachments?key=' + encodeURIComponent(kT) + '&token=' + encodeURIComponent(tkT), { method: 'post', payload: { name: nombreA, file: Utilities.newBlob(bytes, mime, nombreA) }, muteHttpExceptions: true });
        if (r.getResponseCode() >= 300) return json_({ error: 'trello', mensaje: 'Trello no aceptó la imagen (' + r.getResponseCode() + '): ' + r.getContentText().replace(/[A-Za-z0-9]{28,}/g, '…').slice(0, 150) });
        registrar_(quien, 'revision', 'card:' + b.cardId, b.marca, 'subió archivo', String(b.nombre || '').slice(0, 80) + ' · ' + nombreA, '');
        return json_({ ok: true, pasos: ['Imagen "' + nombreA.slice(0, 60) + '" subida a la tarjeta de Trello'] });
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
        const hecho = trello_('/cards/' + tarjetaQueSeVe_(b.cardId) + '/actions/comments', { text: ('💬 ' + nombreDe_(quien) + ': ' + String(b.texto).trim()).slice(0, 16000) }, 'post');
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
          try { trello_('/cards/' + tarjetaQueSeVe_(b.cardId, card.name) + '/actions/comments', { text: ((b.accion === 'aprobar' ? '✅ Aprobado por ' + firma + (coment ? ': ' : '') : '✏️ Para corregir (' + firma + '): ') + coment).slice(0, 16000) }, 'post'); }
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
