// Esquemas de los tres reportes. Los usan el formulario (para renderizar inputs)
// y el panel (para mostrar lo cargado). Un solo lugar para cambiar preguntas.
(function(){
  const SN = ["Sí","No"];
  const seg = (id,label,opts,extra={}) => Object.assign({id,label,type:"seg",opts,req:true},extra);
  const txt = (id,label,extra={}) => Object.assign({id,label,type:"text"},extra);
  const ta  = (id,label,extra={}) => Object.assign({id,label,type:"textarea"},extra);
  const n   = (id,label,extra={}) => Object.assign({id,label,type:"number"},extra);
  const url = (id,label,extra={}) => Object.assign({id,label,type:"url",ph:"https://www.instagram.com/reel/…"},extra);
  // portada + enlace de una publicación: se muestran como tarjeta (miniatura + "Ver en Instagram") en el historial, el panel y la presentación
  const post = (pre) => [ row("g2",[ { type:"fotos", id:`${pre}_portada`, label:"Portada o captura del video", max:1, cover:true, help:"Una sola imagen: la miniatura del reel o la foto de la publicación." }, url(`${pre}_link`,"Enlace directo a la publicación",{req:true,help:"Instagram → ⋯ → Copiar enlace."}) ]) ];
  const chk = (id,label,opts,extra={}) => Object.assign({id,label,type:"check",opts},extra);
  const row = (cls,fields) => ({type:"row",cls,fields});
  const is = (id,val) => v => v[id]===val;
  // Tipo de contenido (pilar) y momento de publicación: alimentan la tabla automática "Qué funcionó" del mensual y del trimestral
  const PILARES = ["Producto","Educativo / tip","Detrás de escena","Tendencia / humor","Testimonio / UGC","Promo / oferta","Institucional / marca","Receta / uso"];
  const DIAS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const cuando = pre => row("g2",[ seg(`${pre}_dia`,"Día de publicación",DIAS,{req:false}), txt(`${pre}_hora`,"Hora de publicación",{ph:"19:30",help:"Sirve para ver qué horario rinde más."}) ]);

  // ---------- SOCIAL MEDIA · SEMANAL ----------
  // Versión compacta (pedido de Joaquín, 20/10/2026): solo lo que se usa. ¿Se publicó todo?, qué dejó el CM y qué se aplica,
  // los números de la semana (desde la captura) y los cambios para la semana siguiente. El análisis de cada reel, feed e
  // historias pasó al mensual, cuando los reels ya terminaron de juntar visualizaciones.
  const SM = {
    tipo:"sm", titulo:"Reporte Social Media", periodo:"semana",
    secciones:[
      { num:1, titulo:"¿Se publicó todo?", fields:[
        seg("pub_todo","¿Se publicó todo el contenido planificado de la semana? (reels, feed e historias)",["Sí, todo","No, hubo faltantes"]),
        ta("pub_faltantes","¿Qué no se publicó y por qué?",{req:true,showIf:is("pub_todo","No, hubo faltantes")}),
        seg("canal_movido","¿Se movió el canal social esta semana?",["Sí","No"],{showIf:v=>!!v._canal}),
        txt("canal_que","¿Qué se publicó en el canal?",{req:true,showIf:v=>!!v._canal&&v.canal_movido==="Sí"}),
        txt("canal_por_que","¿Por qué no se movió?",{req:true,showIf:v=>!!v._canal&&v.canal_movido==="No"})
      ]},
      { num:2, titulo:"Lo que dejó el CM", ref:"cm", fields:[
        { id:"leyo_cm_ok", label:"Leí el reporte del CM completo", type:"confirm", req:true, gate:true },
        ta("aplicar_cm","¿Qué preguntó o pidió la gente y qué vas a aplicar en el contenido?",{req:true,help:"Ej: preguntaron mucho por precios → una historia con precios el martes. Si no hay nada aplicable, escribí por qué."})
      ]},
      { num:3, titulo:"Números de la semana", hint:"Subí la captura y se completan solos. La comparativa con la semana anterior se calcula sola", ref:"semana",
        compare:[
          {k:"Espectadores", id:"alcance_total"}, {k:"Visualizaciones", id:"views"}, {k:"Visualizaciones de pago", id:"views_pauta"},
          {k:"Visualizaciones orgánicas", calc:d=>{const t=d.views; return (t===""||t==null)?null:Number(t)-Number(d.views_pauta||0);}},
          {k:"Visualizaciones de seguidores", id:"views_seg"}, {k:"Visualizaciones de no seguidores", id:"views_noseg"},
          {k:"Interacciones", id:"interacciones"}, {k:"Seguidores sumados", id:"seg_sumados"}, {k:"Seguidores perdidos", id:"seg_perdidos", inverse:true},
          {k:"Seguidores netos", calc:d=>{const a=d.seg_sumados,b=d.seg_perdidos; return (a===""||a==null||b===""||b==null)?null:Number(a)-Number(b);}}
        ], fields:[
        { type:"fotos", id:"fotos_resultados", label:"Captura de Estadísticas de la cuenta, últimos 7 días · subila primero y los números se completan solos", help:"Instagram → Panel profesional → Estadísticas, filtro 'Últimos 7 días'. Revisá lo que completa la IA." },
        row("g2",[ n("alcance_total","Espectadores totales",{req:true}), n("interacciones","Interacciones totales",{req:true}) ]),
        row("g2",[ n("views","Visualizaciones totales",{req:true}), n("views_pauta","Visualizaciones de pago (pauta)",{help:"Vacío si esa semana no hubo pauta"}) ]),
        row("g2",[ n("views_seg","Visualizaciones de seguidores"), n("views_noseg","Visualizaciones de no seguidores") ]),
        row("g2",[ n("seg_sumados","Seguidores sumados",{req:true}), n("seg_perdidos","Seguidores perdidos",{req:true}) ]),
        { type:"diag", target:"semana" }
      ]},
      { num:4, titulo:"Para la semana que viene", hint:"Lo que vas a cambiar: el panel te lo recuerda", fields:[
        txt("cambio1","Cambio 1",{req:true}), txt("cambio2","Cambio 2 (opcional)")
      ]}
    ]
  };

  // ---------- COMMUNITY MANAGER · SEMANAL ----------
  const CM = {
    tipo:"cm", titulo:"Reporte Community Manager", periodo:"semana",
    secciones:[
      { num:1, titulo:"Ejecución del calendario", fields:[
        seg("cal_todo","¿Se publicó todo el contenido planificado?",["Sí, todo","No, hubo faltantes"]),
        ta("cal_faltantes","¿Qué no se publicó y por qué?",{req:true,showIf:is("cal_todo","No, hubo faltantes")}),
        txt("cal_reprog","¿Cuándo se publica? (fecha estimada, solo si se reprogramó)",{showIf:is("cal_todo","No, hubo faltantes")})
      ]},
      { num:2, titulo:"Inconvenientes operativos", hint:"Solo si hubo algo que dificultó la ejecución", fields:[
        ta("inconv","Inconveniente detectado",{help:"Ej: links faltantes, tarjeta incompleta, horarios imposibles, CTA faltante, demasiadas historias seguidas"}),
        ta("descargo","Descargo breve (si aplica)")
      ]},
      { num:3, titulo:"Mensajes de la semana", fields:[
        row("g2",[ n("msg_total","Total de mensajes recibidos",{req:true}), n("msg_comentarios","Total de comentarios",{req:true}) ]),
        txt("msg_tema","¿Sobre qué preguntaron más?",{req:true,help:"El tema principal que generó más consultas"}),
        ta("msg_destacados","Comentarios destacados",{help:"Positivos, negativos, de marcas grandes o cualquier comentario relevante para el equipo"}),
        { type:"fotos", id:"msg_fotos", label:"Capturas de mensajes o comentarios relevantes (opcional)" },
        seg("msg_sin_resp","¿Hubo mensajes o comentarios sin responder?",SN),
        ta("msg_sin_resp_det","¿Cuáles y por qué?",{req:true,showIf:is("msg_sin_resp","Sí")})
      ]},
      { num:4, titulo:"Interacciones con el nicho", hint:"Mínimo 1 por semana", fields:[
        chk("nicho","¿Qué tipo de interacción hiciste esta semana?",["Comenté en publicaciones de otras cuentas","Respondí historias de otras cuentas","Reposteé una publicación relevante","Usé una publicación de otra marca para interactuar con su comunidad","Ninguna esta semana"],{req:true}),
        ta("nicho_cuentas","¿Con qué cuentas interactuaste y qué hiciste?",{req:true,showIf:v=>Array.isArray(v.nicho)&&v.nicho.length&&!v.nicho.includes("Ninguna esta semana")}),
        ta("nicho_just","Justificación de por qué no hubo interacciones",{req:true,showIf:v=>Array.isArray(v.nicho)&&v.nicho.includes("Ninguna esta semana")}),
        { type:"sublabel", text:"Canal social", showIf:v=>!!v._canal },
        seg("canal_movido","¿Moviste el canal social esta semana?",["Sí","No"],{showIf:v=>!!v._canal}),
        txt("canal_que","¿Qué se publicó o cómo se activó?",{req:true,showIf:v=>!!v._canal&&v.canal_movido==="Sí"}),
        txt("canal_por_que","¿Por qué no se movió?",{req:true,showIf:v=>!!v._canal&&v.canal_movido==="No"})
      ]}
    ]
  };

  // ---------- MENSUAL ----------
  const rank = (id,label,cols,rows,item) => ({type:"list",id,label,cols,rows,item:item||"Ítem"});
  const MES = {
    tipo:"mensual", titulo:"Reporte mensual", periodo:"mes",
    secciones:[
      { num:1, titulo:"Lectura del mes y OKR", fields:[
        ta("okr_lectura","¿Estamos en ritmo para cumplir el OKR trimestral / semestral? ¿Hay algún desvío que requiera ajuste?",{req:true}),
        { type:"sublabel", text:"Tracker de OKR · acumulado al cierre del mes" },
        row("g3",[ n("okr_seg_acum","Seguidores netos acumulados",{req:true}), n("okr_alc_acum","Espectadores acumulados",{req:true}), n("okr_cont_acum","Contactos nuevos acumulados",{req:true}) ]),
        row("g3",[ n("okr_cont_prom","Contactos promedio este mes",{req:true}), n("okr_n1","Campañas Nivel 1 ejecutadas (acum.)"), n("okr_n2","Campañas Nivel 2 ejecutadas (acum.)") ])
      ]},
      { num:2, titulo:"Resultados del mes", hint:"La comparativa con el mes anterior se calcula sola", ref:"mes",
        compare:[
          {k:"Espectadores", id:"m_alc_total"},           {k:"Visualizaciones", id:"m_views"}, {k:"Visualizaciones de pago", id:"m_views_pauta"},
          {k:"Visualizaciones orgánicas", calc:d=>{const t=d.m_views; return (t===""||t==null)?null:Number(t)-Number(d.m_views_pauta||0);}},
          {k:"Visualizaciones de seguidores", id:"m_views_seg"}, {k:"Visualizaciones de no seguidores", id:"m_views_noseg"},
          {k:"Interacciones", id:"m_inter"}, {k:"Contactos nuevos", id:"m_contactos"},
          {k:"Seguidores sumados", id:"seg_sumados"}, {k:"Seguidores perdidos", id:"seg_perdidos", inverse:true},
          {k:"Seguidores netos", calc:d=>{const a=d.seg_sumados,b=d.seg_perdidos; return (a===""||a==null||b===""||b==null)?null:Number(a)-Number(b);}},
          {k:"Total al cierre", id:"seg_cierre"},
          {k:"Conversión espectadores → seguidores", pct:true, calc:d=>{const a=Number(d.m_alc_total),n=(d.seg_sumados===""||d.seg_sumados==null)?null:Number(d.seg_sumados)-Number(d.seg_perdidos||0); return (a&&n!=null)?n/a*100:null;}}
        ], fields:[
        { type:"sublabel", text:"Espectadores (cuentas únicas; en Meta, antes alcance) y visualizaciones · la visualización orgánica se calcula sola: total menos pago" },
        row("g2",[ n("m_alc_total","Espectadores totales",{req:true}) ]),
        row("g2",[ n("m_views","Visualizaciones totales",{req:true}), n("m_views_pauta","Visualizaciones de pago (pauta)",{help:"Vacío si ese mes no hubo pauta"}) ]),
        row("g2",[ n("m_views_seg","Visualizaciones de seguidores",{req:true}), n("m_views_noseg","Visualizaciones de no seguidores",{req:true}) ]),
        row("g2",[ n("m_inter","Interacciones totales",{req:true}), n("m_contactos","Contactos nuevos del mes",{req:true,help:"Mensajes directos y leads. Solo contactos nuevos."}) ]),
        txt("m_contactos_origen","Origen principal de los contactos"),
        { type:"sublabel", text:"Seguidores" },
        row("g4",[ n("seg_inicio","Al inicio del mes",{req:true}), n("seg_sumados","Sumados",{req:true}), n("seg_perdidos","Perdidos",{req:true}), n("seg_cierre","Total al cierre",{req:true}) ]),
        ta("conv_lectura","Lectura de la tasa de conversión espectadores → seguidores",{req:true,help:"La tasa se calcula sola: seguidores netos / espectadores totales"}),
        { type:"fotos", id:"m_fotos", label:"Capturas de Estadísticas del mes (espectadores, visualizaciones, seguidores, contactos)", help:"Instagram → Estadísticas, filtro 'Últimos 30 días' o rango del mes." }
      ]},
      { num:3, titulo:"Campañas del mes", fields:[
        { type:"sublabel", text:"Campaña Nivel 1 · 1 por semestre" },
        seg("camp1_ejec","¿Se ejecutó una campaña Nivel 1 este mes?",SN),
        txt("camp1_nombre","Nombre / descripción de la campaña",{req:true,showIf:is("camp1_ejec","Sí")}),
        row("g2",[ txt("camp1_reel","Reel que mejor performó",{showIf:is("camp1_ejec","Sí")}), txt("camp1_pub","Publicación / carrusel que mejor performó",{showIf:is("camp1_ejec","Sí")}) ]),
        seg("camp1_min","¿Se cumplieron los mínimos del nivel?",["Sí","No","Parcialmente"],{showIf:is("camp1_ejec","Sí")}),
        ta("camp1_concl","Conclusión de la campaña",{req:true,showIf:is("camp1_ejec","Sí")}),
        { type:"sublabel", text:"Campaña Nivel 2 · 2 por semestre" },
        seg("camp2_ejec","¿Se ejecutó una campaña Nivel 2 este mes?",SN),
        txt("camp2_nombre","Nombre / descripción de la campaña",{req:true,showIf:is("camp2_ejec","Sí")}),
        row("g2",[ txt("camp2_reel","Reel que mejor performó",{showIf:is("camp2_ejec","Sí")}), txt("camp2_pub","Publicación / carrusel que mejor performó",{showIf:is("camp2_ejec","Sí")}) ]),
        seg("camp2_min","¿Se cumplieron los mínimos del nivel?",["Sí","No","Parcialmente"],{showIf:is("camp2_ejec","Sí")}),
        ta("camp2_concl","Conclusión de la campaña",{req:true,showIf:is("camp2_ejec","Sí")})
      ]},
      { num:4, titulo:"Reels del mes", hint:"Se precarga con los reels de los reportes semanales", ref:"contenido", fields:[
        rank("rk_reel","Ranking de reels, de mejor a peor",[{id:"desc",l:"Descripción del reel",w:3},{id:"fecha",l:"Fecha"},{id:"views",l:"Views orgánicas",t:"number"},{id:"views_pauta",l:"Views por pauta",t:"number"},{id:"mg",l:"Me gusta",t:"number"},{id:"guard",l:"Guardados",t:"number"},{id:"comp",l:"Compartidos",t:"number"},{id:"com",l:"Comentarios",t:"number"},{id:"seg",l:"Seguidores generados",t:"number"},{id:"link",l:"Enlace",t:"url",w:2}],5,"Reel"),
        ta("reel_mes","Reel del mes: el que más impacto generó y por qué",{req:true}),
        seg("reel_tipo","¿Qué tipo de reel funcionó mejor este mes?",["Colaboración","Detrás de escena / proceso","Educativo / tutorial","Meme / tendencia","Testimonio / UGC","No hubo reels"])
      ]},
      { num:5, titulo:"Feed del mes", hint:"Se precarga con las publicaciones de los reportes semanales", fields:[
        rank("rk_feed","Ranking de publicaciones, de mejor a peor",[{id:"desc",l:"Descripción de la publicación",w:3},{id:"fecha",l:"Fecha"},{id:"alc",l:"Alcance",t:"number"},{id:"mg",l:"Me gusta",t:"number"},{id:"guard",l:"Guardados",t:"number"},{id:"comp",l:"Compartidos",t:"number"},{id:"com",l:"Comentarios",t:"number"},{id:"seg",l:"Seguidores generados",t:"number"},{id:"link",l:"Enlace",t:"url",w:2}],4,"Publicación"),
        ta("pub_mes","Publicación del mes: mayor impacto y por qué",{req:true}),
        seg("pub_tipo","¿Qué tipo de publicación funcionó mejor?",["Carrusel educativo","Foto de producto","Promo / oferta","Foto con persona","Diseño gráfico","No hubo publicaciones"])
      ]},
      { num:6, titulo:"Historias · conclusión del mes", fields:[
        chk("hist_tipo","Tipo de historia que mejor funcionó",["Video a cámara (hablando)","Video del local o producto","Diseño gráfico","Interactiva (encuesta / caja)","UGC / repost"],{req:true}),
        ta("hist_concl","Conclusión general de historias",{req:true})
      ]},
      { num:7, titulo:"Conclusiones y plan del mes siguiente", fields:[
        ta("resumen_mes","Resumen del mes: ¿fue positivo o negativo? ¿Cuál fue el hito más importante?",{req:true}),
        { type:"sublabel", text:"Aprendizajes clave · máx. 3, sobre la audiencia, el algoritmo o los formatos" },
        txt("aprend1","Aprendizaje 1",{req:true}), txt("aprend2","Aprendizaje 2"), txt("aprend3","Aprendizaje 3"),
        { type:"sublabel", text:"Plan · acciones concretas con justificación" },
        ta("plan_escalar","Qué escalar / aumentar (y por qué)",{req:true}),
        ta("plan_ajustar","Qué ajustar (y por qué)",{req:true}),
        ta("plan_discontinuar","Qué discontinuar (y por qué)",{req:true}),
        ta("plan_testear","Qué testear (y por qué)"),
        ta("camp_prox","Campañas / fechas clave del mes siguiente",{help:"Nivel de la campaña (1 o 2), fecha estimada y objetivos mínimos"})
      ]}
    ]
  };

  window.FORMS = { sm:SM, cm:CM, mensual:MES };

  // Recorre todos los campos "hoja" de un esquema para un set de valores dado
  window.walkFields = function(schema, vals, fn){
    const visit = (f, ctx) => {
      if(f.type==="row"){ f.fields.forEach(x=>visit(x,ctx)); return; }
      if(f.type==="sublabel"||f.type==="diag"){ return; }
      if(f.type==="repeat"){
        const cnt = Number(vals[f.countField]||0);
        for(let i=1;i<=cnt;i++){ f.item(i).forEach(x=>visit(x,{repeat:f,i})); }
        return;
      }
      fn(f, ctx);
    };
    schema.secciones.forEach(s=>s.fields.forEach(f=>visit(f,{sec:s})));
  };
})();
