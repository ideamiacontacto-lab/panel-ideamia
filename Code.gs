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
    .addToUi();
}

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
    ['CALENDAR_ID', 'ideamia.contacto@gmail.com', 'Calendario de donde salen entregas y reuniones'],
    ['INPUT_RECORDATORIO_DIAS', '3', 'Cada cuántos días vuelve a preguntar por un input ya procesado'],
    ['POR_VENCER_DIAS', '3', 'Días hacia adelante para "tarjetas próximas a vencer"'],
    ['EFEMERIDES_DIAS', '45', 'Días hacia adelante para mostrar efemérides'],
    ['IA_MAX_POR_CORRIDA', '12', 'Cuántas tarjetas nuevas analiza la IA por actualización (cada una cuesta centavos)'],
    ['CAL_EXCLUIR', 'finanzas,cobro,factura,ipc,ajuste,propiedad', 'Eventos del calendario que no ve el equipo'],
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
    ['SFB', 'sfb', '', 'ale', 'no', '']],
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
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'actualizar').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('actualizar').timeBased().everyHours(1).create();
  try { SpreadsheetApp.getUi().alert('Pestañas listas y actualización automática cada hora. Seguí con "2 · Cargar claves".'); } catch (e) {}
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
  const equipo = rows_('Equipo').map(r => ({ nombre: r[0], clave: norm_(r[1]), rol: String(r[2]).trim(), alias: lista_(r[3]).concat([norm_(r[0])]) }));
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
  const q = Object.assign({ key: k, token: tk }, params || {});
  const url = 'https://api.trello.com/1' + path + '?' + Object.keys(q).map(x => x + '=' + encodeURIComponent(q[x])).join('&');
  const r = UrlFetchApp.fetch(url, { method: method || 'get', muteHttpExceptions: true });
  if (r.getResponseCode() >= 300) throw new Error('Trello ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
  return JSON.parse(r.getContentText());
}
/* Trello permite ~100 pedidos cada 10 s por token: se leen en tandas de 25 con una pausa entre tandas. */
function trelloVarios_(rutas) {
  const k = P.getProperty('TRELLO_KEY'), tk = P.getProperty('TRELLO_TOKEN');
  const out = [];
  for (let i = 0; i < rutas.length; i += 25) {
    if (i) Utilities.sleep(3000);
    const reqs = rutas.slice(i, i + 25).map(r => ({ url: 'https://api.trello.com/1' + r + (r.indexOf('?') >= 0 ? '&' : '?') + 'key=' + k + '&token=' + tk, muteHttpExceptions: true }));
    UrlFetchApp.fetchAll(reqs).forEach(res => { try { out.push(res.getResponseCode() < 300 ? JSON.parse(res.getContentText()) : null); } catch (e) { out.push(null); } });
  }
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
    rutas.push('/boards/' + b.id + '/lists?filter=open&fields=name,pos');
    rutas.push('/boards/' + b.id + '/cards?filter=open&fields=name,desc,due,dueComplete,start,idList,shortUrl,dateLastActivity,labels&attachments=true&attachment_fields=name,url,mimeType');
  });
  const res = trelloVarios_(rutas);
  const cards = [], haceUnaSemana = Date.now() - 7 * 864e5, indice = {};
  elegidos.forEach((b, i) => {
    const listas = {}; (res[i * 2] || []).forEach(l => listas[l.id] = l);
    (res[i * 2 + 1] || []).forEach(c => {
      const l = listas[c.idList]; if (!l) return;
      const catL = catLista_(l.name);
      if (b.tipo !== 'project') indice[String(c.shortUrl).split('/c/')[1]] = { id: c.id, n: c.name, m: b.marca, lista: l.name, tablero: b.nombre };
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
  // Las tarjetas del Project suelen ser enlaces a una tarjeta de otro tablero (el título es la URL): se toma marca y título de la original.
  const vivas = {}; cards.forEach(c => vivas[c.id] = 1);
  cards.forEach(c => {
    if (c.tipo !== 'project') return;
    const m = /trello\.com\/c\/([A-Za-z0-9]+)/.exec(c.n);
    const orig = m && indice[m[1]];
    if (!orig) return;
    c.n = orig.n; c.m = orig.m ? [orig.m] : c.m; c.origen = orig.tablero + ' · ' + orig.lista;
    if (vivas[orig.id]) c.dup = true; // la original ya aparece en el panel
  });
  return { tableros: elegidos, cards };
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
  const body = {
    model: 'claude-opus-5-5', max_tokens: maxTokens || 4000, fallbacks: 'default',
    system: sistema, messages: [{ role: 'user', content: usuario }],
    output_config: Object.assign({ effort: 'low' }, schema ? { format: { type: 'json_schema', schema: schema } } : {})
  };
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' }
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
  const hoy = new Date(), lim = Number(cfg.IA_MAX_POR_CORRIDA || 12);
  const en30 = new Date(hoy.getTime() + 30 * 864e5);
  const hace30 = new Date(hoy.getTime() - 30 * 864e5);
  const candidatas = snap.cards.filter(c => {
    if (c.tipo === 'project') return c.cat !== 'hecho' && !c.dup && c.m.length > 0;
    if (c.cat === 'input') return c.tipo !== 'cm';
    if (c.cat === 'brainstorming') return c.tipo === 'scl' && new Date(c.act) >= hace30;
    if (c.cat === 'efem') return c.due && new Date(c.due) >= hoy && new Date(c.due) <= en30;
    return false;
  }).sort((a, b) => new Date(b.act) - new Date(a.act));
  let hechas = 0;
  candidatas.forEach(c => {
    const h = hash_(c.n + '|' + c.d + '|' + c.due + '|' + c.lista);
    if (ia[c.id] && ia[c.id].h === h) return;
    if (hechas >= lim) return;
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
  const vivas = {}; snap.cards.forEach(c => vivas[c.id] = 1);
  Object.keys(ia).forEach(id => { if (!vivas[id]) delete ia[id]; });
  guardarJson_('IA_FILE_ID', 'panel-ideamia-ia.json', ia);
  return ia;
}

/* ---------------- actualización (cada hora + botón) ---------------- */
function actualizar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: false, error: 'Ya se está actualizando' };
  try {
    const cat = catalogo_(), cfg = config_();
    const snap = leerTrello_(cat);
    snap.generado = new Date().toISOString();
    guardarJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json', snap);
    recomendarTarjetas_(snap, cat, cfg);
    CacheService.getScriptCache().remove('snap');
    return { ok: true, tarjetas: snap.cards.length, generado: snap.generado };
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
  const cal = CalendarApp.getCalendarById(cfg.CALENDAR_ID || 'ideamia.contacto@gmail.com');
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
    const personas = cat.equipo.filter(p => p.alias.some(a => w.indexOf(' ' + a + ' ') >= 0)).map(p => p.clave);
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
  sh.appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), persona, tipo, clave, marca || '', estado, detalle || '', periodo || '']);
}
/* Último estado por clave (el último renglón gana; "deshacer" lo borra). */
function estados_() {
  const out = {};
  rows_('Registro').forEach(r => {
    const k = r[3]; if (!k) return;
    if (r[5] === 'deshacer') { delete out[k]; return; }
    out[k] = { fecha: r[0], persona: r[1], tipo: r[2], marca: r[4], estado: r[5], detalle: r[6], periodo: r[7] };
  });
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

function panel_(personaClave) {
  const cfg = config_(), cat = catalogo_();
  const yo = cat.equipo.filter(p => p.clave === norm_(personaClave))[0];
  if (!yo) return { error: 'No encuentro a "' + personaClave + '" en la pestaña Equipo', equipo: cat.equipo.map(p => ({ clave: p.clave, nombre: p.nombre, rol: p.rol })) };
  const esCM = /cm/i.test(yo.rol), esProject = /project/i.test(yo.rol);
  const misMarcas = cat.marcas.filter(m => esProject || m.sm === yo.clave || m.cm === yo.clave);
  const slugs = misMarcas.map(m => m.slug);
  const hoy = hoyAR_();
  const snap = snapshot_();
  const ia = leerJson_('IA_FILE_ID', 'panel-ideamia-ia.json');
  const est = estados_();

  const ajustes = { inputDias: Number(cfg.INPUT_RECORDATORIO_DIAS || 3), porVencer: Number(cfg.POR_VENCER_DIAS || 3), efemDias: Number(cfg.EFEMERIDES_DIAS || 45) };
  const todas = (snap.cards || []).filter(c => c.m.some(s => slugs.indexOf(s) >= 0) && (esProject || !esCM || c.tipo === 'cm' || c.tipo === 'project'));

  // Cobertura del calendario: fecha más lejana con contenido cargado (SCL + CM) contra el objetivo "un mes adelante".
  const objetivo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());
  const cobertura = {};
  misMarcas.forEach(m => {
    let max = null;
    todas.forEach(c => {
      if (c.m[0] !== m.slug || !c.due || (c.tipo !== 'scl' && c.tipo !== 'cm')) return;
      if (['trabajo', 'hecho', 'corr', 'urgente', 'espera'].indexOf(c.cat) < 0) return;
      const d = new Date(c.due); if (!max || d > max) max = d;
    });
    cobertura[m.slug] = { hasta: max ? ymd_(max) : null, objetivo: ymd_(objetivo) };
  });

  // Efemérides: ¿ya aparece algo con ese nombre en el calendario editorial?
  const piezas = todas.filter(c => c.tipo === 'scl' && ['trabajo', 'hecho', 'corr', 'urgente', 'espera'].indexOf(c.cat) >= 0).map(c => ({ m: c.m[0], n: norm_(c.n) }));
  const clave_ = s => norm_(s).replace(/^(dia (del|de la|de los|de las|de) )/, '').replace(/[^a-z0-9ñ ]/g, '').trim();

  const enVentana = (c, dias) => c.due && !c.dc && new Date(c.due) <= new Date(hoy.getTime() + dias * 864e5);
  const limiteEfem = new Date(hoy.getTime() + ajustes.efemDias * 864e5), ayer = new Date(hoy.getTime() - 864e5);
  const cards = todas.filter(c => {
    if (c.tipo === 'project') return c.cat !== 'hecho' && !c.dup;
    if (c.cat === 'brainstorming' && c.tipo === 'cm' && !esCM && !esProject) return false;
    if (c.cat === 'efem') return c.due && new Date(c.due) >= ayer && new Date(c.due) <= limiteEfem;
    if (['input', 'corr', 'recursos', 'fichas', 'brainstorming'].indexOf(c.cat) >= 0) return true;
    if (c.cat === 'hecho') return false;
    return enVentana(c, ajustes.porVencer);
  }).map(c => {
    const o = Object.assign({}, c);
    if (ia[c.id]) o.ia = ia[c.id].r;
    const e = est['inp:' + c.id] || est['card:' + c.id]; if (e) o.estado = e;
    if (c.cat === 'efem') { const k = clave_(c.n); o.enCalendario = k.length > 2 && piezas.some(p => p.m === c.m[0] && p.n.indexOf(k) >= 0); }
    if (c.cat === 'recursos' || c.cat === 'fichas') o.d = o.d.slice(0, 200);
    return o;
  });

  // rutinas activas hoy
  const rutinas = [];
  cat.rutinas.filter(r => esProject || r.rol.toLowerCase() === (esCM ? 'cm' : 'sm')).forEach(r => {
    const ev = evaluarCuando_(r.cuando, hoy); if (!ev) return;
    const marcasR = r.porMarca === 'si' || r.porMarca === 'sí' ? misMarcas : r.porMarca === 'canal' ? misMarcas.filter(m => m.canal) : [null];
    marcasR.forEach(m => {
      const clave = 'rut:' + r.id + ':' + (m ? m.slug : '-') + ':' + ev.periodo;
      rutinas.push({ clave, id: r.id, tarea: r.tarea, ayuda: r.ayuda, enlace: cfg[r.enlace] || r.enlace || '', marca: m ? m.slug : '', etiqueta: ev.etiqueta, vencida: !!ev.vencida, estado: est[clave] || null });
    });
  });

  // reuniones a organizar este mes
  const reuniones = [];
  cat.reuniones.filter(r => esProject || r.rol.toLowerCase() === (esCM ? 'cm' : 'sm')).forEach(r => {
    const ev = evaluarCuando_(r.cuando, hoy, r.avisar); if (!ev) return;
    (r.porMarca ? misMarcas : [null]).forEach(m => {
      const clave = 'reu:' + r.id + ':' + (m ? m.slug : yo.clave) + ':' + ev.periodo;
      reuniones.push({ clave, id: r.id, nombre: r.nombre, con: r.con, marca: m ? m.slug : '', desde: ev.desde, hasta: ev.hasta, periodo: ev.periodo, vencida: !!ev.vencida, duracion: r.duracion, estado: est[clave] || null });
    });
  });

  // calendario: 2 días atrás a 21 adelante
  const evs = eventos_(cfg, cat, new Date(hoy.getTime() - 2 * 864e5), new Date(hoy.getTime() + 21 * 864e5)).filter(e => {
    if (esProject) return true;
    if (e.personas.length) return e.personas.indexOf(yo.clave) >= 0;
    if (e.otros) return false;
    if (e.marcas.length) return e.marcas.some(s => slugs.indexOf(s) >= 0);
    return true;
  });
  evs.forEach(e => { if (est['cal:' + e.id]) e.estado = est['cal:' + e.id]; });

  return {
    ok: true, generado: snap.generado || null, hoy: ymd_(hoy),
    yo: { clave: yo.clave, nombre: yo.nombre, rol: yo.rol },
    equipo: cat.equipo.map(p => ({ clave: p.clave, nombre: p.nombre, rol: p.rol })),
    marcas: misMarcas.map(m => ({ slug: m.slug, nombre: m.nombre, canal: m.canal, tableros: (snap.tableros || []).filter(b => b.marca === m.slug).map(b => ({ tipo: b.tipo, url: b.url, nombre: b.nombre })) })),
    project: (snap.tableros || []).filter(b => b.tipo === 'project').map(b => b.url)[0] || '',
    cards, cobertura, rutinas, reuniones, eventos: evs,
    links: { reportes: cfg.LINK_REPORTES, brainstorming: cfg.LINK_BRAINSTORMING, notion: cfg.LINK_NOTION, drive: cfg.LINK_DRIVE },
    ajustes
  };
}

/* Vista del project: qué hizo y qué coordinó cada persona. */
function vistaProject_() {
  const cat = catalogo_(), hoy = hoyAR_();
  const personas = cat.equipo.filter(p => !/project/i.test(p.rol)).map(p => {
    const pn = panel_(p.clave);
    const r = pn.rutinas || [], re = pn.reuniones || [];
    const inputs = (pn.cards || []).filter(c => c.cat === 'input');
    return {
      clave: p.clave, nombre: p.nombre, rol: p.rol,
      rutinas: { total: r.length, hechas: r.filter(x => x.estado && x.estado.estado === 'hecho').length, pendientes: r.filter(x => !x.estado).map(x => ({ tarea: x.tarea, marca: x.marca, vencida: x.vencida })) },
      reuniones: re.map(x => ({ nombre: x.nombre, marca: x.marca, vencida: x.vencida, hasta: x.hasta, estado: x.estado })),
      inputs: { total: inputs.length, sinTocar: inputs.filter(c => !c.estado).length }
    };
  });
  const reg = rows_('Registro').slice(-60).reverse().map(r => ({ fecha: r[0], persona: r[1], tipo: r[2], clave: r[3], marca: r[4], estado: r[5], detalle: r[6] }));
  return { ok: true, hoy: ymd_(hoy), personas, registro: reg, marcas: cat.marcas.map(m => ({ slug: m.slug, nombre: m.nombre })) };
}

/* ---------------- web app ---------------- */
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
        claves: { trello: !!P.getProperty('TRELLO_TOKEN'), claude: !!P.getProperty('ANTHROPIC_KEY'), equipo: !!P.getProperty('TEAM_KEY'), project: !!P.getProperty('PROJECT_KEY') } }, q.cb);
    }
    if (q.action === 'equipo') return json_({ ok: true, equipo: catalogo_().equipo.map(p => ({ clave: p.clave, nombre: p.nombre, rol: p.rol })) }, q.cb);
    if (q.action === 'project') {
      if (!claveOk_(q.k, true)) return json_({ error: 'clave', mensaje: 'Clave del project incorrecta' }, q.cb);
      return json_(vistaProject_(), q.cb);
    }
    if (!claveOk_(q.k)) return json_({ error: 'clave', mensaje: 'Clave del equipo incorrecta' }, q.cb);
    return json_(panel_(q.p), q.cb);
  } catch (err) { return json_({ error: 'servidor', mensaje: String(err.message || err) }, q.cb); }
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (x) { return json_({ error: 'json' }); }
  try {
    if (!claveOk_(b.k)) return json_({ error: 'clave', mensaje: 'Clave incorrecta' });
    const quien = String(b.persona || '');
    switch (b.action) {
      case 'marcar': // rutina / evento / input / corrección
        registrar_(quien, b.tipo, b.clave, b.marca, b.estado, b.detalle, b.periodo);
        return json_({ ok: true });
      case 'agendar': { // reunión con fecha y hora; opcionalmente crea el evento en el calendario de Ideamia
        let detalle = b.fecha + ' ' + (b.hora || '') + (b.nota ? ' · ' + b.nota : '');
        if (b.crearEvento) {
          const cfg = config_(), cal = CalendarApp.getCalendarById(cfg.CALENDAR_ID || 'ideamia.contacto@gmail.com');
          const ini = new Date(b.fecha + 'T' + (b.hora || '10:00') + ':00-03:00');
          const ev = cal.createEvent(b.titulo, ini, new Date(ini.getTime() + (Number(b.duracion) || 45) * 6e4), { description: 'Agendada desde el Panel Ideamia por ' + quien + (b.nota ? '\n' + b.nota : '') });
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
        return json_(actualizar());
      case 'consejo': { // plan del día armado por la IA, a pedido
        const c = CacheService.getScriptCache(), k = 'consejo:' + quien + ':' + ymd_(new Date());
        const hit = c.get(k); if (hit && !b.forzar) return json_({ ok: true, texto: hit });
        const txt = claude_('Sos especialista senior en redes sociales de Ideamia. Armás el plan del día de una persona del equipo: en voseo, breve, en 4 a 6 viñetas ordenadas por prioridad, cada una con una acción concreta. Usá solo lo que está en el resumen. Sin títulos ni introducción.', String(b.resumen || '').slice(0, 12000), null, 3000);
        if (!txt) return json_({ error: 'ia', mensaje: 'La IA no respondió. ¿Está cargada la clave de Claude?' });
        c.put(k, txt, 21600);
        return json_({ ok: true, texto: txt });
      }
    }
    return json_({ error: 'accion' });
  } catch (err) { return json_({ error: 'servidor', mensaje: String(err.message || err) }); }
}

function quitarDeSnapshot_(cardId) {
  const snap = leerJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json');
  if (snap.cards) { snap.cards = snap.cards.filter(c => c.id !== cardId); guardarJson_('SNAP_FILE_ID', 'panel-ideamia-trello.json', snap); }
}
