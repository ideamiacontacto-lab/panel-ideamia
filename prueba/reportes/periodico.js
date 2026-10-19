// Reporte periódico (trimestral / semestral / anual) · solo Social Media.
// Define el esquema, la agregación automática desde los mensuales y las opciones de estética.
(function(){
  const U = window.IDX;
  const txt = (id,label,extra={}) => Object.assign({id,label,type:"text"},extra);
  const ta  = (id,label,extra={}) => Object.assign({id,label,type:"textarea"},extra);
  const n   = (id,label,extra={}) => Object.assign({id,label,type:"number"},extra);
  const seg = (id,label,opts,extra={}) => Object.assign({id,label,type:"seg",opts,req:true},extra);
  const row = (cls,fields) => ({type:"row",cls,fields});
  const rank = (id,label,cols,rows,item) => ({type:"list",id,label,cols,rows,item:item||"Ítem"});

  const FUENTES = {
    "anton":      { nombre:"Anton + Barlow (Ideamia)",     head:"'Anton', Impact, sans-serif",           body:"'Barlow', sans-serif",       css:"family=Anton&family=Barlow:wght@400;500;600", upper:true },
    "bebas":      { nombre:"Bebas Neue + Inter",           head:"'Bebas Neue', sans-serif",              body:"'Inter', sans-serif",        css:"family=Bebas+Neue&family=Inter:wght@400;500;600", upper:true },
    "montserrat": { nombre:"Montserrat",                   head:"'Montserrat', sans-serif",              body:"'Montserrat', sans-serif",   css:"family=Montserrat:wght@400;500;700;800", upper:false },
    "playfair":   { nombre:"Playfair Display + Source Sans", head:"'Playfair Display', serif",           body:"'Source Sans 3', sans-serif", css:"family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;600", upper:false },
    "poppins":    { nombre:"Poppins",                      head:"'Poppins', sans-serif",                 body:"'Poppins', sans-serif",      css:"family=Poppins:wght@400;500;700", upper:false },
    "oswald":     { nombre:"Oswald + Lato",                head:"'Oswald', sans-serif",                  body:"'Lato', sans-serif",         css:"family=Oswald:wght@500;700&family=Lato:wght@400;700", upper:true }
  };
  const FUENTE_OPTS = Object.entries(FUENTES).map(([k,v])=>v.nombre);
  const fuenteKey = nombre => Object.keys(FUENTES).find(k=>FUENTES[k].nombre===nombre) || "anton";

  const TIPOS = { trimestral:{n:3,nombre:"Trimestral",periodoNombre:"trimestre"}, semestral:{n:6,nombre:"Semestral",periodoNombre:"semestre"}, anual:{n:12,nombre:"Anual",periodoNombre:"año"} };

  // periodo_id = "2026-06+3"  → meses 2026-06 .. 2026-08
  function parsePeriod(id){
    const [ini,nn] = id.split("+"); const n=Number(nn)||3;
    const [y,m] = ini.split("-").map(Number);
    const meses=[]; for(let i=0;i<n;i++){ const d=new Date(y,m-1+i,1); meses.push(`${d.getFullYear()}-${U.pad(d.getMonth()+1)}`); }
    const fin = meses[meses.length-1];
    const tipo = Object.keys(TIPOS).find(k=>TIPOS[k].n===n) || "trimestral";
    const mesN = id2 => U.MESES_C[Number(id2.split("-")[1])-1];
    const yi=ini.split("-")[0], yf=fin.split("-")[0];
    const label = n===12 && m===1 ? `Año ${yi}` : (yi===yf ? `${mesN(ini)} – ${mesN(fin)} ${yf}` : `${mesN(ini)} ${yi} – ${mesN(fin)} ${yf}`);
    const short = yi===yf ? `${mesN(ini).slice(0,3)}–${mesN(fin).slice(0,3)} ${yf}` : `${mesN(ini).slice(0,3)} ${yi}–${mesN(fin).slice(0,3)} ${yf}`;
    return { id, ini, fin, n, meses, tipo, label, short, tipoNombre:TIPOS[tipo].nombre, periodoNombre:TIPOS[tipo].periodoNombre };
  }
  function prevPeriodId(id){ const p=parsePeriod(id); const [y,m]=p.ini.split("-").map(Number); const d=new Date(y,m-1-p.n,1); return `${d.getFullYear()}-${U.pad(d.getMonth()+1)}+${p.n}`; }
  function nextMonths(id, k=4){ const p=parsePeriod(id); const [y,m]=p.fin.split("-").map(Number); const out=[]; for(let i=1;i<=k;i++){ const d=new Date(y,m-1+i,1); out.push({id:`${d.getFullYear()}-${U.pad(d.getMonth()+1)}`, nombre:U.MESES_C[d.getMonth()]}); } return out; }
  // Períodos calendario cerrados (trimestres desde ene/abr/jul/oct, semestres desde ene/jul, años desde ene), más reciente primero
  function closedPeriods(n, today=new Date(), todos=false){
    const C = window.IDEAMIA_CONFIG; const desde = todos ? "2000-01" : (C.PERIODICO_DESDE || "2000-01"); // todos: también los anteriores al sistema (para importar)
    const out=[]; const y0=today.getFullYear();
    for(let y=y0; y>=y0-3; y--){ for(let m=12; m>=1; m-=n){ // m = último mes del período
        const ini = m-n+1; if(ini<1) continue; if(n===12 && ini!==1) continue;
        const fin = new Date(y, m, 0); // último día del período
        if(fin >= today) continue; // todavía no cerró
        const id = `${y}-${U.pad(ini)}+${n}`; if(`${y}-${U.pad(ini)}` < desde) continue;
        out.push(parsePeriod(id));
    } }
    return out;
  }
  // Meses de inicio posibles: últimos 24 meses cerrados
  function startMonths(today=new Date()){ const out=[]; for(let i=1;i<=24;i++){ const d=new Date(today.getFullYear(),today.getMonth()-i,1); out.push(U.monthFromId(`${d.getFullYear()}-${U.pad(d.getMonth()+1)}`)); } return out; }

  // Agregación desde los mensuales cargados
  function aggregate(idx, marca, id){
    const p = parsePeriod(id);
    const meses = p.meses.map(mid=>({ mid, r: idx[`mensual|${marca}|${mid}`] }));
    const num = v => U.num(v);
    const sum = f => { let s=0, any=false; meses.forEach(({r})=>{ if(!r) return; const v=num(f(r.datos||{})); if(v!=null){ s+=v; any=true; } }); return any?s:null; };
    const out = {
      meses, cargados: meses.filter(x=>x.r).length,
      seg_sumados: sum(d=>d.seg_sumados), seg_perdidos: sum(d=>d.seg_perdidos),
      contactos: sum(d=>d.m_contactos), inter: sum(d=>d.m_inter), views: sum(d=>d.m_views),
      alc_suma: sum(d=>d.m_alc_total), alc_pauta: sum(d=>d.m_alc_pauta),
      seg_inicio: null, seg_cierre: null, campanias:[], reels:[], feed:[]
    };
    const first = meses.find(x=>x.r), last = [...meses].reverse().find(x=>x.r);
    if(first) out.seg_inicio = num(first.r.datos.seg_inicio);
    if(last) out.seg_cierre = num(last.r.datos.seg_cierre);
    for(const {mid,r} of meses){ if(!r) continue; const d=r.datos||{}; const mesN=U.MESES_C[Number(mid.split("-")[1])-1];
      for(const k of ["camp1","camp2"]){ if(d[`${k}_ejec`]==="Sí") out.campanias.push({ nivel:k==="camp1"?"1":"2", nombre:d[`${k}_nombre`], cumple:d[`${k}_min`], texto:d[`${k}_concl`], pieza:d[`${k}_reel`]||d[`${k}_pub`], mes:mesN }); }
      for(let i=1;i<=5;i++){ if(d[`rk_reel_${i}_desc`]) out.reels.push({ desc:d[`rk_reel_${i}_desc`], fecha:d[`rk_reel_${i}_fecha`]||mesN, views:d[`rk_reel_${i}_views`], views_pauta:d[`rk_reel_${i}_views_pauta`], mg:d[`rk_reel_${i}_mg`], guard:d[`rk_reel_${i}_guard`], com:d[`rk_reel_${i}_com`], comp:d[`rk_reel_${i}_comp`], seg:d[`rk_reel_${i}_seg`], link:d[`rk_reel_${i}_link`] }); }
      for(let i=1;i<=4;i++){ if(d[`rk_feed_${i}_desc`]) out.feed.push({ desc:d[`rk_feed_${i}_desc`], fecha:d[`rk_feed_${i}_fecha`]||mesN, alc:d[`rk_feed_${i}_alc`], mg:d[`rk_feed_${i}_mg`], com:d[`rk_feed_${i}_com`], comp:d[`rk_feed_${i}_comp`], seg:d[`rk_feed_${i}_seg`], link:d[`rk_feed_${i}_link`] }); }
    }
    out.reels.sort((a,b)=>(num(b.views)||0)-(num(a.views)||0));
    out.feed.sort((a,b)=>(num(b.mg)||0)-(num(a.mg)||0));
    return out;
  }

  // Valor logrado de un objetivo del OKR a partir de lo cargado en el reporte.
  // Reconoce el objetivo por palabras clave (antes solo funcionaba con el nombre exacto: "Alcance acumulado" quedaba en blanco).
  // Si en la fila se cargó "Logrado" a mano, manda ese valor.
  function okrReal(obj, d, n, manual){
    const sin = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
    const o = sin(obj); const num = v => U.num(v);
    const netos = (num(d.p_seg_sumados)!=null) ? num(d.p_seg_sumados)-(num(d.p_seg_perdidos)||0) : null;
    const alc = num(d.p_alc_total);
    const m = num(manual);
    if(m!=null) return { v:m, fuente:"cargado a mano" };
    if(!o) return { v:null, fuente:null };
    const porMes = /por mes|mensual|prom/.test(o);
    if(/conversi/.test(o)) return { v: (alc&&netos!=null)? netos/alc*100 : null, fuente:"Seguidores netos / alcance total", pct:true };
    if(/alcance/.test(o)){
      if(/no seg/.test(o)) return { v:num(d.p_alc_noseg), fuente:"Alcance no seguidores" };
      if(/seguidor/.test(o)) return { v:num(d.p_alc_seg), fuente:"Alcance seguidores" };
      if(/pauta|pago/.test(o)) return { v:num(d.p_alc_pauta), fuente:"Alcance por pauta" };
      if(/organic/.test(o)) return { v:num(d.p_alc_org), fuente:"Alcance orgánico" };
      return { v: porMes&&alc!=null ? Math.round(alc/n) : alc, fuente: porMes?"Alcance total / meses":"Alcance total del período" };
    }
    if(/visualiz|views|reproduc/.test(o)){ const v=num(d.p_views); return { v: porMes&&v!=null?Math.round(v/n):v, fuente:"Visualizaciones" }; }
    if(/interacc|engagement/.test(o)){ const v=num(d.p_inter); return { v: porMes&&v!=null?Math.round(v/n):v, fuente:"Interacciones" }; }
    if(/contacto|lead|consulta|mensaje/.test(o)){ const v=num(d.p_contactos); return { v: porMes&&v!=null?Math.round(v/n):v, fuente: porMes?"Contactos / meses":"Contactos nuevos" }; }
    if(/seguidor|comunidad|netos|crecim/.test(o)){
      if(/cierre|total|estimad|final|alcanzar/.test(o)) return { v:num(d.p_seg_cierre), fuente:"Seguidores al cierre" };
      if(/perdid/.test(o)) return { v:num(d.p_seg_perdidos), fuente:"Seguidores perdidos" };
      return { v: porMes&&netos!=null ? Math.round(netos/n) : netos, fuente: porMes?"Seguidores netos / meses":"Seguidores netos (sumados − perdidos)" };
    }
    return { v:null, fuente:null };
  }
  function okrEstado(rv, mn, mx){ if(rv==null || (mn==null&&mx==null)) return null; const target = mn ?? mx; return rv>=target ? "ok" : (mx!=null && rv>=target*.85 ? "warn" : "bad"); }

  const PER = {
    tipo:"periodico", titulo:"Reporte periódico", periodo:"periodico",
    secciones:[
      { num:1, titulo:"Estética de la presentación", hint:"Se guarda por marca; se puede ajustar en cada reporte", fields:[
        row("g2",[ { id:"est_logo", label:"Logo de la marca", type:"logo", help:"PNG o JPG. Se reduce solo. Ideal con fondo transparente." }, { id:"est_color", label:"Color principal", type:"color", req:true } ]),
        row("g2",[ seg("est_fondo","Fondo",["Oscuro","Claro"]), txt("est_ig","Usuario de Instagram",{ph:"@marca"}) ]),
        seg("est_fuente","Tipografía",FUENTE_OPTS),
        txt("est_autor","Elaborado por",{ph:"Nombre de quien presenta"})
      ]},
      { num:2, titulo:"Síntesis del período", fields:[
        txt("s_titulo","Título de la síntesis",{req:true,ph:"Ej: El primer trimestre gestionando la cuenta"}),
        ta("s_texto","Resumen ejecutivo",{req:true,help:"3 a 5 líneas: cómo fue el período, qué lo explicó, cuántos objetivos se cumplieron."})
      ]},
      { num:3, titulo:"Resultados del período", hint:"Lo que viene de los mensuales ya está precargado; revisá y completá", ref:"periodo",
        compare:[
          {k:"Alcance total (cuentas únicas)", id:"p_alc_total"}, {k:"Visualizaciones", id:"p_views"}, {k:"Interacciones", id:"p_inter"},
          {k:"Seguidores sumados", id:"p_seg_sumados"}, {k:"Seguidores perdidos", id:"p_seg_perdidos", inverse:true},
          {k:"Seguidores netos", calc:d=>{const a=d.p_seg_sumados,b=d.p_seg_perdidos; return (a===""||a==null||b===""||b==null)?null:Number(a)-Number(b);}},
          {k:"Contactos nuevos", id:"p_contactos"},
          {k:"Conversión alcance → seguidores", pct:true, calc:d=>{const a=Number(d.p_alc_total),n=(d.p_seg_sumados===""||d.p_seg_sumados==null)?null:Number(d.p_seg_sumados)-Number(d.p_seg_perdidos||0); return (a&&n!=null)?n/a*100:null;}}
        ], fields:[
        { type:"sublabel", text:"Mes a mes · se precarga desde los mensuales; si faltan, completalo a mano (va a la presentación)" },
        { type:"list", id:"mm", label:"Resultados por mes", item:"Mes", rows:12, fixed:true, cols:[{id:"mes",l:"Mes"},{id:"alc",l:"Alcance",t:"number"},{id:"views",l:"Visualizaciones",t:"number"},{id:"netos",l:"Seguidores netos",t:"number"},{id:"inter",l:"Interacciones",t:"number"},{id:"cont",l:"Contactos",t:"number"}] },
        { type:"sublabel", text:"Alcance y visualizaciones · desde Meta, para el período completo (cuentas únicas, no suma de meses)" },
        row("g3",[ n("p_alc_total","Alcance total",{req:true}), n("p_alc_seg","Alcance seguidores"), n("p_alc_noseg","Alcance no seguidores") ]),
        row("g3",[ n("p_alc_org","Alcance orgánico"), n("p_alc_pauta","Alcance por pauta"), n("p_views","Visualizaciones",{req:true}) ]),
        { type:"sublabel", text:"Comunidad y contactos" },
        row("g4",[ n("p_seg_inicio","Seguidores al inicio",{req:true}), n("p_seg_sumados","Sumados",{req:true}), n("p_seg_perdidos","Perdidos",{req:true}), n("p_seg_cierre","Total al cierre",{req:true}) ]),
        row("g3",[ n("p_contactos","Contactos nuevos",{req:true}), n("p_inter","Interacciones",{req:true}), n("p_seg_propios","Seguidores atribuibles a gestión propia",{help:"Opcional, si hubo virales o colaboraciones externas"}) ]),
        { type:"fotos", id:"p_fotos", label:"Capturas de Estadísticas del período (alcance, visualizaciones, seguidores)", help:"Instagram → Estadísticas, rango personalizado con las fechas del período." },
        ta("p_lectura_alcance","Lectura de alcance y visibilidad",{req:true,help:"Ej: 86% del alcance provino de no seguidores → fuerte descubrimiento de marca."}),
        ta("p_lectura_seg","Lectura del crecimiento de la comunidad",{req:true})
      ]},
      { num:4, titulo:"Tracker de OKR", hint:"Metas prorrateadas al período. El estado se calcula solo", fields:[
        rank("okr","Metas del período",[{id:"obj",l:"Objetivo",w:2},{id:"min",l:"Meta mínima",t:"number"},{id:"max",l:"Meta máxima (opcional)",t:"number"},{id:"real",l:"Logrado (solo si no se calcula solo)",t:"number"},{id:"nota",l:"Nota (opcional)",w:2}],6,"Objetivo"),
        { type:"okrprev" },
        ta("okr_nota","Lectura del tracker",{req:true,help:"Ej: 5 de 6 objetivos cumplidos. Solo el alcance total quedó por debajo."})
      ]},
      { num:5, titulo:"Campañas del período", hint:"Precargadas desde los mensuales; podés editar", fields:[
        rank("camp","Campañas",[{id:"nivel",l:"Nivel (1 o 2)"},{id:"nombre",l:"Nombre de la campaña",w:2},{id:"cumple",l:"¿Cumplió los mínimos? (Sí / No / Parcialmente)"},{id:"pieza",l:"Pieza destacada",w:2},{id:"metrica",l:"Métrica clave de la pieza",w:2},{id:"texto",l:"Lectura de la campaña",w:3}],4,"Campaña")
      ]},
      { num:6, titulo:"Análisis de contenido", ref:"contenido", fields:[
        rank("rk","Ranking de reels, de mejor a peor",[{id:"desc",l:"Reel",w:2},{id:"fecha",l:"Fecha"},{id:"views",l:"Views totales",t:"number"},{id:"views_org",l:"Views orgánicas",t:"number"},{id:"mg",l:"Me gusta",t:"number"},{id:"com",l:"Comentarios",t:"number"},{id:"comp",l:"Compartidos",t:"number"},{id:"guard",l:"Guardados",t:"number"},{id:"seg",l:"Seguidores generados",t:"number"},{id:"link",l:"Enlace",t:"url",w:2}],6,"Reel"),
        ta("rk_lectura","Qué funcionó en reels",{req:true}),
        rank("fd","Mejores publicaciones de feed",[{id:"desc",l:"Publicación",w:2},{id:"tipo",l:"Tipo (carrusel, foto, diseño...)"},{id:"views",l:"Views o alcance",t:"number"},{id:"mg",l:"Me gusta",t:"number"},{id:"com",l:"Comentarios",t:"number"},{id:"comp",l:"Compartidos",t:"number"},{id:"seg",l:"Seguidores generados",t:"number"},{id:"link",l:"Enlace",t:"url",w:2}],3,"Publicación"),
        ta("fd_lectura","Lectura del feed",{req:true}),
        rank("hs","Mejores historias",[{id:"desc",l:"Historia",w:2},{id:"views",l:"Views",t:"number"},{id:"clics",l:"Clics o respuestas",t:"number"}],3,"Historia"),
        ta("hs_lectura","Lectura de historias")
      ]},
      { num:7, titulo:"Audiencia", hint:"Desde Meta · Audiencia", fields:[
        row("g3",[ n("a_mujeres","% mujeres",{req:true}), txt("a_franja","Franja etaria dominante",{req:true,ph:"25–44"}), n("a_pais","% del país principal") ]),
        row("g3",[ txt("a_c1","Ciudad 1",{ph:"Paraná"}), n("a_c1p","% ciudad 1"), txt("a_pais_nombre","País principal",{ph:"Argentina"}) ]),
        row("g4",[ txt("a_c2","Ciudad 2"), n("a_c2p","% ciudad 2"), txt("a_c3","Ciudad 3"), n("a_c3p","% ciudad 3") ]),
        { type:"fotos", id:"a_fotos", label:"Capturas de Audiencia (género, edad, ciudades)" },
        ta("a_lectura","Lectura estratégica de la audiencia",{req:true})
      ]},
      { num:8, titulo:"Conclusiones", fields:[
        { type:"sublabel", text:"Qué funcionó bien" },
        txt("bien1","Punto 1",{req:true}), txt("bien2","Punto 2",{req:true}), txt("bien3","Punto 3"),
        { type:"sublabel", text:"Qué ajustar" },
        txt("ajustar1","Punto 1",{req:true}), txt("ajustar2","Punto 2"),
        { type:"sublabel", text:"Foco del próximo período" },
        txt("foco1","Punto 1",{req:true}), txt("foco2","Punto 2"), txt("foco3","Punto 3")
      ]},
      { num:9, titulo:"Metas y calendario del próximo período", fields:[
        rank("meta","Objetivos del próximo período",[{id:"obj",l:"Objetivo",w:2},{id:"meta",l:"Meta",w:2}],6,"Objetivo"),
        row("g2",[ ta("meta_n1","Campañas Nivel 1 · mínimos",{ph:"1 en el trimestre · reel orgánico ≥ 30.000 views · carrusel ≥ 250 MG"}), ta("meta_n2","Campañas Nivel 2 · mínimos") ]),
        ta("acciones","Acciones para alcanzarlos",{req:true}),
        { type:"sublabel", text:"Calendario de fechas clave (un mes por campo, una fecha por línea)" },
        ta("cal_m1","Mes 1"), ta("cal_m2","Mes 2"), ta("cal_m3","Mes 3"), ta("cal_m4","Mes 4"),
        txt("cierre","Frase de cierre",{ph:"Crecimiento sólido · Contactos en recuperación · Campañas por estructurar"})
      ]}
    ]
  };
  window.FORMS.periodico = PER;
  window.PERIODICO = { FUENTES, fuenteKey, TIPOS, parsePeriod, prevPeriodId, nextMonths, startMonths, closedPeriods, aggregate, okrReal, okrEstado,
    OKR_DEFAULT:["Seguidores netos","Seguidores por mes","Alcance total","Contactos","Contactos prom. mensual","Conversión a seguidores (%)"] };
})();
