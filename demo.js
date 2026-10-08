// Datos de ejemplo para ver el panel sin conectar el Apps Script (se usan cuando API_URL está vacío).
// Armados con tarjetas y eventos reales del 7 de octubre de 2026.
window.PANEL_DEMO = (function () {
  const T = s => "https://trello.com/b/" + s;
  const marcas = [
    { slug: "isco", nombre: "Isco", canal: true, tableros: [{ tipo: "scl", url: T("3edgu7Qr"), nombre: "SCL ISCO" }, { tipo: "cm", url: T("vRSs2fsU"), nombre: "CM ISCO" }, { tipo: "diseno", url: T("KjVwAluL"), nombre: "Diseño ISCO" }, { tipo: "produccion", url: T("Mk2S1uQK"), nombre: "Produccion ISCO" }, { tipo: "guiones", url: T("jQNQjJct"), nombre: "GUIONES ISCO" }] },
    { slug: "gabriel-varisco", nombre: "Gabriel Varisco", canal: false, tableros: [{ tipo: "scl", url: T("O4clu0an"), nombre: "SCL GV" }, { tipo: "cm", url: T("3qag6F89"), nombre: "CM GV" }, { tipo: "guiones", url: T("tk4Tgmtx"), nombre: "GUIONES GV" }] },
    { slug: "skilfulblack", nombre: "SkilfulBlack", canal: false, tableros: [{ tipo: "scl", url: T("3Zz1eV1r"), nombre: "SCL Skilful" }] },
    { slug: "tritato", nombre: "Tritato", canal: true, tableros: [{ tipo: "scl", url: T("8r1C9pFC"), nombre: "SCL Tritato" }, { tipo: "cm", url: T("8v9SQQsp"), nombre: "CM Tritato" }, { tipo: "guiones", url: T("n3dJ9pCN"), nombre: "GUIONES TRITATO" }] },
    { slug: "vice-burger", nombre: "Vice Burger", canal: true, tableros: [{ tipo: "scl", url: T("eXwN58j7"), nombre: "SCL Vice" }, { tipo: "cm", url: T("WqXOtCbn"), nombre: "CM VICE" }, { tipo: "guiones", url: T("FQuf6QZx"), nombre: "GUIONES VICE" }] }
  ];
  // listas y etiquetas como las de los tableros reales (para probar "Crear tarjeta" y "Mover")
  const LISTAS = {
    scl: ["Efemerides / Calendario Anual", "INPUTS / PEDIDOS DEL CLIENTE", "Calendario Editorial (para revision PM)", "Correcciones", "En revision", "Aprobado", "Brainstorming / Campañas", "Recursos Corporativos", "Fichas tecnicas"],
    cm: ["Listo para programar", "Filtro", "Contenido no programables", "Programado", "Publicado"],
    diseno: ["Pedidos", "En proceso", "Para revisar", "Entregado"], produccion: ["Temas de la semana", "Grabado", "En edición", "Entregado"], guiones: ["Ideas", "Guion listo", "Grabado"]
  };
  const ETQ = [{ n: "Diseño", c: "purple" }, { n: "Carrusel", c: "orange" }, { n: "Reel", c: "red" }, { n: "Historia", c: "blue" }, { n: "Post", c: "green" }, { n: "Urgente", c: "yellow" }];
  marcas.forEach(m => m.tableros.forEach((t, i) => { t.id = m.slug + "-" + t.tipo; t.listas = (LISTAS[t.tipo] || LISTAS.scl).map((n, j) => ({ id: t.id + "-l" + j, n, cat: /aprobad|publicad|programado/i.test(n) ? "hecho" : /input/i.test(n) ? "input" : /correcc/i.test(n) ? "corr" : "trabajo" })); t.etiquetas = ETQ.map((e, j) => ({ id: t.id + "-e" + j, n: e.n, c: e.c })); }));
  const c = (o) => Object.assign({ d: "", lab: [], att: [], dc: false, url: "https://trello.com", act: "2026-10-07T12:00:00Z" }, o);
  const cards = [
    // guiones (tableros GUIONES de cada marca: enlaces a la tarjeta de SCL)
    c({ id: "g1", n: "HALLOWEEN · la Muerte hace las compras", cat: "guion", gest: "pendiente", lista: "Ideas Recibidas (BRIEF SMM)", tipo: "guiones", tablero: "GUIONES ISCO", m: ["isco"], entrega: null, salida: "2026-10-31T20:00:00Z", ourl: "https://trello.com/c/MXfGNNQB" }),
    c({ id: "g2", n: "Reel detrás de escena del local", cat: "guion", gest: "pendiente", lista: "Ideas Recibidas (BRIEF SMM)", tipo: "guiones", tablero: "GUIONES GV", m: ["gabriel-varisco"], entrega: "2026-10-06T12:00:00Z", salida: "2026-10-20T20:00:00Z" }),
    c({ id: "g3", n: "Combo doble explicado en 15 segundos", cat: "guion", gest: "pendiente", lista: "Ideas Recibidas (BRIEF SMM)", tipo: "guiones", tablero: "GUIONES VICE", m: ["vice-burger"], entrega: "2026-10-13T12:00:00Z", salida: "2026-10-24T20:00:00Z" }),
    c({ id: "g4", n: "Tritato: 3 errores al hacer tortas", cat: "guion", gest: "revisar", lista: "Guiones listos para revisión", tipo: "guiones", tablero: "GUIONES TRITATO", m: ["tritato"], entrega: "2026-10-06T12:00:00Z", salida: "2026-10-18T20:00:00Z" }),
    // piezas de Diseño y Producción (vista de revisión de Ivo)
    c({ id: "p1", url: "https://trello.com/c/demo-p1", n: "Carrusel promo miércoles Isco", cat: "pieza", etapa: "revision", formato: "carrusel", lista: "En revision", tipo: "diseno", tablero: "Diseño ISCO", m: ["isco"], salida: "2026-10-14T20:00:00Z" }),
    c({ id: "p2", url: "https://trello.com/c/demo-p2", n: "Reel combo doble", cat: "pieza", etapa: "revision", formato: "reel", lista: "En revision", tipo: "produccion", tablero: "Produccion Vice", m: ["vice-burger"], salida: "2026-10-10T20:00:00Z" }),
    c({ id: "p3", url: "https://trello.com/c/demo-p3", n: "Post Día de la Madre GV", cat: "pieza", etapa: "pendiente", formato: "diseno", lista: "Pendiente de diseño", tipo: "diseno", tablero: "Diseño GV", m: ["gabriel-varisco"], salida: "2026-10-13T20:00:00Z" }),
    c({ id: "p4", url: "https://trello.com/c/demo-p4", n: "Placas promo viernes Tritato", cat: "pieza", etapa: "pendiente", formato: "diseno", lista: "Pendiente de diseño", tipo: "diseno", tablero: "Diseño Tritato", m: ["tritato"], salida: "2026-10-16T20:00:00Z" }),
    c({ id: "p5", url: "https://trello.com/c/demo-p5", n: "Reel receta cookies", cat: "pieza", etapa: "pendiente", formato: "reel", lista: "Reels pendientes", tipo: "produccion", tablero: "Produccion ISCO", m: ["isco"], salida: "2026-10-08T20:00:00Z" }),
    c({ id: "p6", url: "https://trello.com/c/demo-p6", n: "Historia horarios feriado", cat: "pieza", etapa: "pendiente", formato: "historia", lista: "Historias pendientes", tipo: "produccion", tablero: "Produccion ISCO", m: ["isco"], salida: "2026-10-09T13:00:00Z" }),
    c({ id: "g6", n: "Reel Día del Padre Isco", cat: "guion", gest: "pendiente", salio: true, lista: "Ideas Recibidas (BRIEF SMM)", tipo: "guiones", tablero: "GUIONES ISCO", m: ["isco"], entrega: null, salida: "2026-10-03T20:00:00Z" }),
    c({ id: "g5", n: "Receta cookies con premezcla", cat: "guion", gest: "correccion", lista: "Correcciones", tipo: "guiones", tablero: "GUIONES ISCO", m: ["isco"], entrega: "2026-09-29T12:00:00Z", salida: "2026-10-15T20:00:00Z" }),
    c({ id: "i1", n: "Recetario de Halloween", d: "Recetas tenebrosas para la semana de Halloween: cupcakes calabaza, galletas araña, brownies cementerio.", cat: "input", lista: "INPUTS / PEDIDOS DEL CLIENTE", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], act: "2026-10-07T13:10:00Z", att: [{ n: "Recetario Halloween.pdf", u: "#" }],
      ia: { titular: "Te cargaron un recetario de Halloween: yo bajaría una receta a carrusel y movería recetas tenebrosas por historias toda la semana.", prioridad: "alta",
        acciones: [{ que: "Carrusel paso a paso con la receta más vistosa (cupcakes calabaza) y los productos de Isco etiquetados.", formato: "carrusel" }, { que: "Tanda de historias 'receta tenebrosa del día' del 27 al 31 con sticker de pregunta.", formato: "historias" }, { que: "Reel corto armando las galletas araña, 15 s, con audio en tendencia.", formato: "reel" }, { que: "Difundir el recetario completo en el canal social el 29.", formato: "canal social" }],
        pedir: ["Promos de Halloween en moldes, colorantes y decoración", "Stock de moldes temáticos para mostrar", "Fotos de producto de la línea Halloween"] } }),
    c({ id: "i2", n: "Videos de descarga · Guido", d: "Videos de cuando llegan los productos al local. Usar para mostrar novedades.", cat: "input", lista: "INPUTS / PEDIDOS DEL CLIENTE", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], act: "2026-10-07T14:40:00Z", att: [{ n: "Drive · descargas octubre", u: "#" }],
      ia: { titular: "Llegaron videos de descarga de mercadería: son oro para reels de 'llegó lo nuevo' y para el canal social.", prioridad: "media",
        acciones: [{ que: "Reel 'Llegó la mercadería' con cortes rápidos de las cajas y los productos nuevos con precio.", formato: "reel" }, { que: "Historias en vivo-diferido del día de descarga con encuesta '¿qué querés que traigamos?'.", formato: "historias" }, { que: "Aviso en el canal social: 'Entró stock de…' con las 3 novedades.", formato: "canal social" }],
        pedir: ["Lista de productos nuevos con precio", "Si hay oferta de lanzamiento"] } }),
    c({ id: "i3", n: "Cambio de horario fin de semana largo", cat: "input", lista: "INPUTS / PEDIDOS DEL CLIENTE", tipo: "scl", tablero: "SCL Tritato", m: ["tritato"], act: "2026-10-02T10:00:00Z", estado: { estado: "procesado", fecha: "2026-10-03 11:20", persona: "orne" },
      ia: { titular: "Hay cambio de horario por el fin de semana largo: una historia fija y un post de aviso alcanzan.", prioridad: "media", acciones: [{ que: "Placa de horarios en historias destacadas hasta el lunes.", formato: "historias" }], pedir: ["Confirmar horario exacto de cada día"] } }),
    c({ id: "c1", n: "CHANTILLY TIPS", cat: "corr", lista: "Correcciones", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], due: "2026-10-06T21:00:00Z", lab: ["Carrusel"] }),
    c({ id: "c2", n: "Receta cookies", cat: "corr", lista: "Correcciones", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], due: "2026-10-09T21:00:00Z", lab: ["Reel"] }),
    c({ id: "c3", n: "Promo combo doble", cat: "corr", lista: "Correcciones", tipo: "scl", tablero: "SCL Vice", m: ["vice-burger"], due: "2026-10-08T15:00:00Z" }),
    c({ id: "v1", n: "Carrusel beneficios Mayorista Black", cat: "trabajo", lista: "En revision", tipo: "scl", tablero: "SCL Skilful", m: ["skilfulblack"], due: "2026-10-08T13:00:00Z" }),
    c({ id: "v2", n: "Reel nuevo local", cat: "trabajo", lista: "Calendario Editorial (para revision PM)", tipo: "scl", tablero: "SCL GV", m: ["gabriel-varisco"], due: "2026-10-09T13:00:00Z" }),
    c({ id: "e1", n: "Patrona de Paraná", d: "¿Día no laborable?", cat: "efem", lista: "Efemerides / Calendario Anual", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], due: "2026-10-07T13:00:00Z", enCalendario: false }),
    c({ id: "e2", n: "Halloween", cat: "efem", lista: "Efemerides / Calendario Anual", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], due: "2026-10-31T13:00:00Z", enCalendario: false,
      ia: { titular: "Halloween cae sábado: arrancá la previa el lunes 26 con recetas y cerrá el viernes con la promo de moldes.", prioridad: "alta", acciones: [{ que: "Calendario de 5 días de contenido temático del 26 al 31.", formato: "carrusel + historias" }, { que: "Sorteo de kit de decoración de Halloween.", formato: "sorteo" }], pedir: ["Promo de Halloween para anunciar el 26"] } }),
    c({ id: "e3", n: "Día del veganismo", cat: "efem", lista: "Efemerides / Calendario Anual", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], due: "2026-11-01T13:00:00Z", enCalendario: false }),
    c({ id: "e4", n: "Halloween", cat: "efem", lista: "Efemerides / Calendario Anual", tipo: "scl", tablero: "SCL Vice", m: ["vice-burger"], due: "2026-10-31T13:00:00Z", enCalendario: true }),
    c({ id: "e5", n: "Día de la madre", cat: "efem", lista: "Efemerides / Calendario Anual", tipo: "scl", tablero: "SCL Tritato", m: ["tritato"], due: "2026-10-18T13:00:00Z", enCalendario: true }),
    c({ id: "e6", n: "Cyber monday", cat: "efem", lista: "Efemerides / Calendario Anual", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], due: "2026-11-04T13:00:00Z", enCalendario: false }),
    c({ id: "b1", n: "Navidad 2026 · ideas", d: "Brainstorming de campaña navideña.", cat: "brainstorming", lista: "Brainstorming / Campañas", tipo: "scl", tablero: "SCL ISCO", m: ["isco"] }),
    c({ id: "r1", n: "Manual de marca Isco", cat: "recursos", lista: "Recursos Corporativos", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], att: [{ n: "Manual de marca.pdf", u: "#" }, { n: "Logos (Drive)", u: "#" }] }),
    c({ id: "r2", n: "Paleta y tipografías", cat: "recursos", lista: "Recursos Corporativos", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], att: [{ n: "Figma", u: "#" }] }),
    c({ id: "r3", n: "Fotos local y equipo", cat: "recursos", lista: "Recursos Corporativos", tipo: "scl", tablero: "SCL Vice", m: ["vice-burger"], att: [{ n: "Drive · fotos", u: "#" }] }),
    c({ id: "r4", n: "Logos y menú", cat: "recursos", lista: "Recursos Corporativos", tipo: "scl", tablero: "SCL Tritato", m: ["tritato"], att: [{ n: "Menú vigente.pdf", u: "#" }] }),
    c({ id: "f1", n: "Ficha · Crema chantilly 1L", cat: "fichas", lista: "Fichas tecnicas", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], att: [{ n: "Ficha técnica.pdf", u: "#" }] }),
    c({ id: "f2", n: "Ficha · Premezcla sin TACC", cat: "fichas", lista: "Fichas tecnicas", tipo: "scl", tablero: "SCL ISCO", m: ["isco"], att: [{ n: "Ficha técnica.pdf", u: "#" }] }),
    c({ id: "p1", url: "https://trello.com/c/demo-p1", n: "ISCO · Pedido de flyer para mostrador", cat: "trabajo", lista: "Pedidos del cliente", tipo: "project", tablero: "Project", m: ["isco"], due: "2026-10-09T15:00:00Z" })
  ];
  const r = (id, tarea, marca, etiqueta, extra) => Object.assign({ clave: "rut:" + id + ":" + (marca || "-") + ":demo", id, tarea, marca: marca || "", etiqueta, vencida: false, estado: null, ayuda: "", enlace: "" }, extra || {});
  const rutinas = [
    r("correcciones", "Revisar Correcciones y tarjetas por vencer", "", "hoy", { ayuda: "Abrí cada SCL y mirá la lista Correcciones." }),
    r("inputs", "Revisar inputs nuevos del project", "", "hoy", { estado: { estado: "hecho", fecha: "2026-10-07 09:12" } }),
    r("promos", "¿Las promos siguen siendo las mismas?", "isco", "esta semana", { vencida: true }),
    r("promos", "¿Las promos siguen siendo las mismas?", "vice-burger", "esta semana", { vencida: true, estado: { estado: "hecho", fecha: "2026-10-05 16:02" } }),
    r("promos", "¿Las promos siguen siendo las mismas?", "tritato", "esta semana", { vencida: true }),
    r("ofertas", "¿Ofertas y diseños de la semana entregados?", "isco", "esta semana", { vencida: true }),
    r("ofertas", "¿Ofertas y diseños de la semana entregados?", "gabriel-varisco", "esta semana", { vencida: true, estado: { estado: "hecho", fecha: "2026-10-06 10:40" } }),
    r("salida", "¿Reels y carruseles listos para salir?", "isco", "esta semana"),
    r("salida", "¿Reels y carruseles listos para salir?", "vice-burger", "esta semana"),
    r("salida", "¿Reels y carruseles listos para salir?", "tritato", "esta semana"),
    r("salida", "¿Reels y carruseles listos para salir?", "skilfulblack", "esta semana"),
    r("salida", "¿Reels y carruseles listos para salir?", "gabriel-varisco", "esta semana"),
    r("promo-isco", "Mover los productos con descuento de la promo del día", "isco", "hoy", { ayuda: "Mostrá el precio final con el descuento. Ej.: si comprás $80.000, el dulce de leche de $50.000 con 10% off te queda en $45.000." }),
    r("produccion-bauti", "Organizar la producción de Bauti de la semana que viene", "isco", "esta semana", { enlace: "crear:produccion", ayuda: "Hablá con el dueño: ¿hay descargas?, ¿quieren mover algo puntual?, ¿promos o productos para mostrar? Dejale a Bauti 3 o 4 temas." }),
    r("produccion-bauti", "Organizar la producción de Bauti de la semana que viene", "vice-burger", "esta semana", { enlace: "crear:produccion" }),
    r("isco-maquinarias", "Mover el área de maquinarias", "isco", "esta semana", { vencida: true })
  ];
  const re = (id, nombre, con, marca, desde, hasta, extra) => Object.assign({ clave: "reu:" + id + ":" + (marca || "orne") + ":2026-10", id, nombre, con, marca: marca || "", desde, hasta, periodo: "2026-10", vencida: false, duracion: 45, estado: null }, extra || {});
  const reuniones = [
    re("ads", "Reunión con Ads", "Juan · Paid Media", "", 25, 31),
    re("cliente", "Reunión mensual con el cliente", "cliente", "isco", 1, 10, { estado: { estado: "agendada", detalle: "2026-10-09 11:00 · evento creado" } }),
    re("cliente", "Reunión mensual con el cliente", "cliente", "tritato", 1, 10),
    re("cliente", "Reunión mensual con el cliente", "cliente", "vice-burger", 1, 10, { estado: { estado: "agendada", detalle: "2026-10-08 17:00" } }),
    re("cliente", "Reunión mensual con el cliente", "cliente", "gabriel-varisco", 1, 10),
    re("entrega-reportes", "Reunión de entrega de reportes", "cliente", "isco", 1, 10),
    re("brainstorming", "Brainstorming del mes siguiente", "equipo", "isco", 10, 20, { estado: { estado: "agendada", detalle: "2026-10-16 10:00 · evento creado" } }),
    re("brainstorming", "Brainstorming del mes siguiente", "equipo", "gabriel-varisco", 10, 20, { estado: { estado: "agendada", detalle: "2026-10-20 10:00" } }),
    re("brainstorming", "Brainstorming del mes siguiente", "equipo", "tritato", 10, 20)
  ];
  const ev = (id, t, s, dia, marcas, extra) => Object.assign({ id, t, s, f: s, dia, marcas: marcas || [], personas: [] }, extra || {});
  const eventos = [
    ev("x1", "Reporte trimestral: Isco, GV, Quality, Quality M, DYB", "2026-10-07T03:00:00Z", true, ["isco", "gabriel-varisco"]),
    ev("x2", "Meet Orne SM/Lu FM", "2026-10-07T19:00:00Z", false, [], { personas: ["orne"] }),
    ev("x3", "Presentacion de Estrategia. ETAPA INICIAL, VICE BURGER", "2026-10-09T03:00:00Z", true, ["vice-burger"]),
    ev("x4", "Reunion Revision Guiones", "2026-10-09T19:00:00Z", false, []),
    ev("x5", "Reunion ideamia", "2026-10-10T03:00:00Z", true, []),
    ev("x6", "Reporte Semanal SCL", "2026-10-12T03:00:00Z", true, []),
    ev("x7", "Entrega quincenal de ideas de REELS (4 ideas · mes siguiente)", "2026-10-12T03:00:00Z", true, []),
    ev("x8", "Presentación de ideas de REELS al guionista", "2026-10-12T19:00:00Z", false, []),
    ev("x9", "isco - Brainstorming Navidad", "2026-10-16T03:00:00Z", true, ["isco"]),
    ev("x10", "Entrega quincenal de calendario · FEED + STORIES (15 días siguientes)", "2026-10-16T03:00:00Z", true, []),
    ev("x11", "GV - Brainstorming Navidad", "2026-10-20T03:00:00Z", true, ["gabriel-varisco"])
  ];
  return {
    ok: true, demo: true, generado: "2026-10-07T15:00:00Z", hoy: "2026-10-07",
    yo: new URLSearchParams(location.search).get("p") === "ivo" ? { clave: "ivo", nombre: "Ivo", rol: "Dirección" } : { clave: "orne", nombre: "Orne", rol: "SM" },
    equipo: [{ clave: "orne", nombre: "Orne", rol: "SM" }, { clave: "ivo", nombre: "Ivo", rol: "Dirección" }, { clave: "rama", nombre: "Rama", rol: "SM" }, { clave: "ale", nombre: "Ale", rol: "CM" }, { clave: "project", nombre: "Joaquín", rol: "Project" }],
    marcas, project: T("30dl2puJ"), cards, rutinas, reuniones, eventos,
    discord: { generado: "2026-10-07T15:00:00Z", conUsuario: true, menciones: [
      { id: "d1", canal: "isco", autor: "Joaquín", texto: "@Orne ¿me pasás cómo quedó el carrusel de la promo del miércoles? Lo quiere ver el cliente hoy", fecha: "2026-10-07T14:20:00Z", url: "https://discord.com/channels/1/2/3", todos: false },
      { id: "d2", canal: "guiones", autor: "Fede", texto: "@Orne subí el guion de Tritato a revisión, lo vemos el lunes", fecha: "2026-10-07T11:05:00Z", url: "https://discord.com/channels/1/2/4", todos: false },
      { id: "d3", canal: "general", autor: "Ivo", texto: "@everyone mañana arrancamos 9:30 por la reunión con Quality", fecha: "2026-10-06T21:40:00Z", url: "https://discord.com/channels/1/2/5", todos: true }
    ] },
    cobertura: { "isco": { hasta: "2026-10-30", objetivo: "2026-11-07" }, "gabriel-varisco": { hasta: "2026-11-08", objetivo: "2026-11-07" }, "skilfulblack": { hasta: "2026-10-24", objetivo: "2026-11-07" }, "tritato": { hasta: "2026-11-02", objetivo: "2026-11-07" }, "vice-burger": { hasta: "2026-11-07", objetivo: "2026-11-07" } },
    links: { reportes: "https://ideamiacontacto-lab.github.io/reportes-ideamia/", brainstorming: "https://ideamiacontacto-lab.github.io/brainstormings-ideamia/", notion: "https://app.notion.com/p/3d1bab9b1a168166b3cfe5a8818a9265", drive: "" },
    ajustes: { inputDias: 3, porVencer: 3, efemDias: 45 },
    feriados: [{ n: 'Día del Respeto a la Diversidad Cultural', d: '2026-10-12' }, { n: 'Día de la Soberanía Nacional', d: '2026-11-23' }],
    linkReportes: "https://ideamiacontacto-lab.github.io/reportes-ideamia/?resp=orne",
    reportes: [
      { k: "rep:sm:vice-burger:2026-09-28", tipo: "sm", marca: "vice-burger", periodo: "2026-09-28", label: "Reporte semanal Social Media · semana 28/09 al 04/10", vence: "2026-10-06T15:00:00Z" },
      { k: "rep:mensual:tritato:2026-09", tipo: "mensual", marca: "tritato", periodo: "2026-09", label: "Reporte mensual · septiembre", vence: "2026-10-05T15:00:00Z" }
    ],
    semanaInfo: { dias: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"], semana: "2026-W41", mes: "2026-10" },
    rutinasDef: [
      { id: "correcciones", tarea: "Revisar Correcciones y tarjetas por vencer", cuando: "diaria", marcas: [] },
      { id: "inputs", tarea: "Revisar inputs nuevos del project", cuando: "diaria", marcas: [] },
      { id: "promos", tarea: "¿Las promos siguen siendo las mismas?", cuando: "semana:lun", marcas: ["isco", "gabriel-varisco", "skilfulblack", "tritato", "vice-burger"] },
      { id: "ofertas", tarea: "¿Ofertas y diseños de la semana entregados?", cuando: "semana:lun", marcas: ["isco", "gabriel-varisco", "skilfulblack", "tritato", "vice-burger"] },
      { id: "salida", tarea: "¿Reels y carruseles listos para salir?", cuando: "semana:mie", marcas: ["isco", "gabriel-varisco", "skilfulblack", "tritato", "vice-burger"] },
      { id: "canal", tarea: "¿Se movió el canal social?", cuando: "semana:vie", marcas: ["isco", "tritato", "vice-burger"] },
      { id: "coordinar", tarea: "Coordinar con el project los pendientes de la semana próxima", cuando: "semana:vie", marcas: [] },
      { id: "promo-isco", tarea: "Mover los productos con descuento de la promo del día", cuando: "dias:mie,sab", marcas: ["isco"] },
      { id: "isco-maquinarias", tarea: "Mover el área de maquinarias", cuando: "semana:mar", marcas: ["isco"] },
      { id: "produccion-bauti", tarea: "Organizar la producción de Bauti de la semana que viene", cuando: "semana:mie", marcas: ["isco", "gabriel-varisco", "vice-burger"], enlace: "crear:produccion" },
      { id: "colaboraciones", tarea: "Buscar colaboradores para campañas o hacer colaboraciones en redes", cuando: "mes:1-31", marcas: ["isco", "gabriel-varisco", "skilfulblack", "tritato", "vice-burger"] },
      { id: "trimestral-check", tarea: "¿Este mes toca reporte trimestral? Organizalo con tiempo", cuando: "mes:1-7", marcas: [] }
    ],
    estRut: { "rut:correcciones:-:2026-10-05": { estado: "hecho" }, "rut:correcciones:-:2026-10-06": { estado: "hecho" }, "rut:inputs:-:2026-10-05": { estado: "hecho" }, "rut:inputs:-:2026-10-07": { estado: "hecho" }, "rut:promos:vice-burger:2026-W41": { estado: "hecho" }, "rut:ofertas:gabriel-varisco:2026-W41": { estado: "hecho" } }
  };
})();

window.PANEL_DEMO_PROJECT = {
  ok: true, demo: true, hoy: "2026-10-07",
  personas: [
    { clave: "orne", nombre: "Orne", rol: "SM", rutinas: { total: 12, hechas: 3, pendientes: [] }, inputs: { total: 3, sinTocar: 2 },
      reuniones: [{ nombre: "Reunión con Ads", marca: "", hasta: 31, estado: null }, { nombre: "Reunión mensual con el cliente", marca: "isco", hasta: 10, estado: { estado: "agendada", detalle: "2026-10-09 11:00 · evento creado", fecha: "2026-10-06 18:20" } }, { nombre: "Reunión mensual con el cliente", marca: "tritato", hasta: 10, estado: null }, { nombre: "Reunión mensual con el cliente", marca: "vice-burger", hasta: 10, estado: { estado: "agendada", detalle: "2026-10-08 17:00", fecha: "2026-10-05 12:02" } }, { nombre: "Brainstorming del mes siguiente", marca: "isco", hasta: 20, estado: { estado: "agendada", detalle: "2026-10-16 10:00", fecha: "2026-10-07 09:30" } }] },
    { clave: "rama", nombre: "Rama", rol: "SM", rutinas: { total: 12, hechas: 7, pendientes: [] }, inputs: { total: 2, sinTocar: 0 },
      reuniones: [{ nombre: "Reunión con Ads", marca: "", hasta: 31, estado: { estado: "agendada", detalle: "2026-10-28 18:00 · evento creado", fecha: "2026-10-07 10:15" } }, { nombre: "Reunión mensual con el cliente", marca: "quality-tienda", hasta: 10, estado: { estado: "agendada", detalle: "2026-10-08 10:00", fecha: "2026-10-04 15:00" } }, { nombre: "Reunión mensual con el cliente", marca: "dyb", hasta: 10, estado: null }] },
    { clave: "ale", nombre: "Ale", rol: "CM", rutinas: { total: 2, hechas: 2, pendientes: [] }, inputs: { total: 0, sinTocar: 0 }, reuniones: [] }
  ],
  registro: [
    { fecha: "2026-10-07 10:15", persona: "rama", tipo: "reunion", clave: "reu:ads:rama:2026-10", marca: "", estado: "agendada", detalle: "2026-10-28 18:00 · evento creado" },
    { fecha: "2026-10-07 09:30", persona: "orne", tipo: "reunion", clave: "reu:brainstorming:isco:2026-10", marca: "isco", estado: "agendada", detalle: "2026-10-16 10:00" },
    { fecha: "2026-10-07 09:12", persona: "orne", tipo: "rutina", clave: "rut:inputs:-:2026-10-07", marca: "", estado: "hecho", detalle: "" },
    { fecha: "2026-10-06 17:48", persona: "orne", tipo: "input", clave: "inp:x", marca: "tritato", estado: "archivado", detalle: "Foto vieja de menú" },
    { fecha: "2026-10-06 10:40", persona: "orne", tipo: "rutina", clave: "rut:ofertas:gabriel-varisco:2026-W41", marca: "gabriel-varisco", estado: "hecho", detalle: "" }
  ],
  marcas: [{ slug: "isco", nombre: "Isco" }, { slug: "gabriel-varisco", nombre: "Gabriel Varisco" }, { slug: "tritato", nombre: "Tritato" }, { slug: "vice-burger", nombre: "Vice Burger" }, { slug: "quality-tienda", nombre: "Quality Tienda" }, { slug: "dyb", nombre: "DyB" }]
};
