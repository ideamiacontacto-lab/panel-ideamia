// Diagnóstico automático de reels y de la semana, con los números que da Instagram.
// Sin IA: reglas de lectura de métricas + comparación con la media histórica de la marca en el sistema.
(function(){
  const U = window.IDX;
  const num = U.num;
  const pct = (a,b) => (a==null||!b) ? null : a/b*100;
  const f1 = v => v==null ? "–" : (Math.round(v*10)/10).toString().replace(".",",");
  const f0 = v => v==null ? "–" : U.fmt(Math.round(v));

  // Media histórica de reels de la marca (reportes SM anteriores)
  function baselineReels(reports, marcaSlug, excludePeriodo){
    const views=[], mg=[], ret=[], eng=[];
    for(const r of reports){
      if(r.tipo!=="sm" || r.marca_slug!==marcaSlug || r.periodo_id===excludePeriodo) continue;
      const d=r.datos||{};
      for(let i=1;i<=Number(d.reels_n||0);i++){
        const v=num(d[`reel${i}_res_views`]); if(v==null||v<=0) continue;
        views.push(v);
        const m=num(d[`reel${i}_res_mg`]); if(m!=null) mg.push(m);
        const dur=num(d[`reel${i}_duracion`]), tp=num(d[`reel${i}_tiempo_prom`]); if(dur&&tp!=null) ret.push(tp/dur*100);
        const inter=(num(d[`reel${i}_res_mg`])||0)+(num(d[`reel${i}_res_com`])||0)+(num(d[`reel${i}_res_comp`])||0)+(num(d[`reel${i}_res_guard`])||0);
        eng.push(inter/v*100);
      }
    }
    const med = a => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; };
    return { n: views.length, views: med(views), mg: med(mg), ret: med(ret), eng: med(eng) };
  }

  // Diagnóstico de un reel. d = datos del reporte, i = índice del reel, base = baselineReels(...)
  function diagReel(d, i, base){
    const g = k => num(d[`reel${i}_${k}`]);
    const views=g("res_views"), mg=g("res_mg"), com=g("res_com"), comp=g("res_comp"), guard=g("res_guard");
    const dur=g("duracion"), tp=g("tiempo_prom"), omis=g("omisiones"), nuevos=g("nuevos_seg"), clics=g("clics"), reposts=g("reposts");
    const oFeed=g("org_feed"), oHist=g("org_historias"), oReels=g("org_reels"), oPerfil=g("org_perfil"), oExpl=g("org_explorar");
    const objV=g("obj_views"), objMG=g("obj_mg");
    const items=[]; // {k, lvl: ok|warn|bad|info, txt}
    if(views==null) return { items:[{k:"Datos",lvl:"info",txt:"Cargá las visualizaciones para ver el diagnóstico."}], score:null };
    const tipo = String(d[`reel${i}_tipo`]||""), sinStats = d[`reel${i}_stats_ok`]==="No";
    if(tipo==="Colaboración") items.push({k:"Colaboración",lvl:"info",txt:"Reel en colaboración: las views y las interacciones se reparten entre las cuentas, y Instagram suele no mostrar retención ni origen. Comparalo con otras colaboraciones, no con los reels propios."});
    if(tipo==="Pautado") items.push({k:"Pautado",lvl:"info",txt:"Reel pautado: parte de las views son pagas. Mirá sobre todo guardados, compartidos y seguidores nuevos, que la pauta no infla."});
    if(sinStats) items.push({k:"Sin retención",lvl:"info",txt:"Instagram no muestra retención ni origen para este reel: el diagnóstico se apoya en interacción y conversión."});

    // 1. Retención
    let ret=null;
    if(dur && tp!=null){
      ret = tp/dur*100;
      const lvl = ret>=50?"ok":ret>=30?"ok":ret>=20?"warn":"bad";
      const txt = ret>=50 ? `Retención ${f1(ret)} % (${f1(tp)} s de ${f0(dur)} s): excelente, la gente lo mira casi entero.`
        : ret>=30 ? `Retención ${f1(ret)} % (${f1(tp)} s de ${f0(dur)} s): buena para Instagram.`
        : ret>=20 ? `Retención ${f1(ret)} % (${f1(tp)} s de ${f0(dur)} s): en la media. Hay margen acortando o metiendo un giro antes del segundo ${Math.max(3,Math.round(tp))}.`
        : `Retención ${f1(ret)} % (${f1(tp)} s de ${f0(dur)} s): baja. El video pierde a la mayoría muy temprano: revisar el gancho y la duración.`;
      items.push({k:"Retención",lvl,txt});
      if(dur>45 && ret<25) items.push({k:"Duración",lvl:"warn",txt:`Con ${f0(dur)} s y esa retención, probá una versión de 20 a 30 s del mismo contenido.`});
    } else if(!sinStats) items.push({k:"Retención",lvl:"info",txt:"Cargá duración y tiempo promedio de reproducción (pestaña Resumen del reel) para medir retención."});

    // 1b. Lectura de las curvas (opcional)
    const r3=g("ret_3s"), rf=g("ret_fin");
    if(r3!=null){
      items.push({k:"Primeros 3 s",lvl: r3>=60?"ok":r3>=40?"warn":"bad", txt: r3>=60 ? `${f1(r3)} % seguía viendo a los 3 segundos: el gancho retiene.` : r3>=40 ? `${f1(r3)} % seguía viendo a los 3 segundos: se pierde más de la mitad en el arranque. Probar otro primer plano o texto inicial.` : `Solo ${f1(r3)} % pasó los 3 segundos: el problema está en el gancho, no en el desarrollo.`});
    }
    if(rf!=null && dur){
      items.push({k:"Final",lvl: rf>=25?"ok":rf>=10?"info":"warn", txt: rf>=25 ? `${f1(rf)} % llegó al final: el desarrollo sostiene y el reel puede loopear.` : rf>=10 ? `${f1(rf)} % llegó al final: normal para ${f0(dur)} s.` : `${f1(rf)} % llegó al final: el desarrollo no sostiene; acortar o poner el remate antes.`});
      if(r3!=null && r3>=50 && rf<10) items.push({k:"Curva",lvl:"warn",txt:"El gancho funciona pero se vacía en el medio: el problema es el desarrollo, no el inicio."});
    }
    const picos = String(d[`reel${i}_picos_mg`]||"").match(/\d{1,2}:\d{2}|\d+\s*s/g);
    if(picos && picos.length && dur){
      const secs = picos.map(p=>{ const m=/^(\d{1,2}):(\d{2})$/.exec(p.trim()); return m ? Number(m[1])*60+Number(m[2]) : parseInt(p); }).filter(x=>!isNaN(x));
      const early = secs.filter(x=>x<=dur*0.15).length, late = secs.filter(x=>x>=dur*0.8).length;
      if(early && late) items.push({k:"Picos de MG",lvl:"ok",txt:`Pico de me gusta al inicio y al final: el gancho promete y el remate cumple. Estructura para repetir.`});
      else if(late) items.push({k:"Picos de MG",lvl:"ok",txt:`El pico de me gusta está al final (${picos[picos.length-1]}): el remate paga; el desafío es que más gente llegue hasta ahí.`});
      else if(early) items.push({k:"Picos de MG",lvl:"info",txt:`El pico de me gusta está al inicio (${picos[0]}): lo que más gusta es el arranque. Ver si el resto del video sostiene esa promesa.`});
      else items.push({k:"Picos de MG",lvl:"info",txt:`Pico de me gusta en ${picos.join(", ")}: ese momento es el que conecta. Probar adelantarlo o construir el gancho sobre él.`});
    }

    // 2. Gancho (omisiones)
    if(omis!=null){
      const lvl = omis<=50?"ok":omis<=70?"warn":"bad";
      items.push({k:"Gancho",lvl,txt: omis<=50 ? `Omisiones ${f1(omis)} %: el arranque frena el scroll.` : omis<=70 ? `Omisiones ${f1(omis)} %: gancho normal. Probá texto en pantalla o una promesa clara en los primeros 2 segundos.` : `Omisiones ${f1(omis)} %: 7 de cada 10 lo pasan sin mirarlo. Cambiar el primer plano, el primer texto o arrancar por el resultado.`});
    }

    // 3. Interacción
    const inter=(mg||0)+(com||0)+(comp||0)+(guard||0);
    const eng = pct(inter, views);
    if(eng!=null){
      const lvl = eng>=6?"ok":eng>=3?"ok":eng>=1.5?"warn":"bad";
      let txt = `Engagement ${f1(eng)} % (${f0(inter)} interacciones sobre ${f0(views)} views)`;
      txt += eng>=6?": muy alto." : eng>=3?": bueno." : eng>=1.5?": normal." : ": bajo; el contenido se ve pero no mueve a actuar.";
      items.push({k:"Interacción",lvl,txt});
      const g100 = pct(guard,views), c100=pct(comp,views), com100=pct(com,views);
      if(guard===0) items.push({k:"Guardados",lvl:"warn",txt:"0 guardados: no es contenido de referencia. Si el objetivo es valor, sumar un dato, receta o lista que valga guardar."});
      else if(g100!=null && g100>=1) items.push({k:"Guardados",lvl:"ok",txt:`Guardados ${f1(g100)} % de las views: contenido de referencia, funciona como formato para repetir.`});
      if(c100!=null && c100>=0.8) items.push({k:"Compartidos",lvl:"ok",txt:`Compartidos ${f1(c100)} % de las views: tiene potencial de circular; la gente lo manda a otros.`});
      if(com100!=null && com100>=0.6) items.push({k:"Comentarios",lvl:"ok",txt:`Comentarios ${f1(com100)} % de las views: genera conversación. Responder todos suma alcance.`});
      if(reposts!=null && reposts>0) items.push({k:"Reposts",lvl:"ok",txt:`${f0(reposts)} reposts: otras cuentas lo tomaron como propio, señal fuerte de afinidad.`});
    }

    // 4. Origen de las vistas
    const orig = [["Feed",oFeed],["Historias",oHist],["Reels",oReels],["Perfil",oPerfil],["Explorar",oExpl]].filter(x=>x[1]!=null);
    if(orig.length){
      const desc = (oReels||0)+(oExpl||0);
      const top = orig.slice().sort((a,b)=>b[1]-a[1])[0];
      if(desc>=40) items.push({k:"Alcance",lvl:"ok",txt:`${f1(desc)} % de las vistas vinieron de Reels y Explorar: el algoritmo lo empujó a gente que no sigue la cuenta.`});
      else if(desc>=15) items.push({k:"Alcance",lvl:"warn",txt:`${f1(desc)} % desde Reels y Explorar: llegó algo a no seguidores, pero la mayoría fue a la comunidad propia (${top[0]} ${f1(top[1])} %).`});
      else items.push({k:"Alcance",lvl:"bad",txt:`Solo ${f1(desc)} % desde Reels y Explorar: casi no salió de los seguidores (${top[0]} ${f1(top[1])} %). Para descubrimiento hace falta más retención en los primeros segundos y un tema más amplio.`});
      if(oHist!=null && oHist>=20) items.push({k:"Historias",lvl:"info",txt:`${f1(oHist)} % llegó desde historias: compartirlo en historias funcionó, seguir haciéndolo.`});
      if(oPerfil!=null && oPerfil>=5) items.push({k:"Perfil",lvl:"info",txt:`${f1(oPerfil)} % desde el perfil: la gente entra a la cuenta y lo busca. Vale destacarlo o fijarlo.`});
    }

    // 5. Conversión
    if(nuevos!=null){
      const conv = pct(nuevos, views);
      const lvl = conv>=0.5?"ok":conv>=0.15?"warn":"bad";
      items.push({k:"Conversión",lvl,txt: conv>=0.5 ? `${f0(nuevos)} seguidores nuevos (${f1(conv)} % de las views): convierte muy bien.` : conv>=0.15 ? `${f0(nuevos)} seguidores nuevos (${f1(conv)} % de las views): conversión normal.` : `${f0(nuevos)} seguidores nuevos (${f1(conv)} % de las views): casi no convierte. Falta un motivo para seguir la cuenta (CTA, serie, promesa de más contenido).`});
    }
    if(clics!=null && clics>0) items.push({k:"Enlace",lvl:"info",txt:`${f0(clics)} clic${clics===1?"":"s"} en el enlace de la presentación.`});

    // 6. Objetivo
    if(objV){ const p=views/objV*100; items.push({k:"Objetivo",lvl:p>=100?"ok":p>=70?"warn":"bad",txt:`Views: ${f0(views)} de ${f0(objV)} planteadas (${f0(p)} %).${objMG&&mg!=null?` MG: ${f0(mg)} de ${f0(objMG)} (${f0(mg/objMG*100)} %).`:""}`}); }

    // 7. Contra la media de la marca
    if(base && base.n>=2 && base.views){
      const dv = (views-base.views)/base.views*100;
      items.push({k:"Vs. la cuenta",lvl: dv>=25?"ok":dv>=-25?"info":"warn", txt:`${dv>=0?"+":""}${f0(dv)} % de views contra la mediana de la marca (${f0(base.views)} views en ${base.n} reels anteriores)${base.ret!=null&&ret!=null?`; retención ${ret>=base.ret?"por encima":"por debajo"} de la habitual (${f1(base.ret)} %)`:""}.`});
    }

    // Puntaje simple 0-100 para el semáforo
    const lv = items.filter(x=>x.lvl!=="info"); const score = lv.length ? Math.round(lv.reduce((a,x)=>a+(x.lvl==="ok"?100:x.lvl==="warn"?55:15),0)/lv.length) : null;
    // Veredicto
    let veredicto = "";
    if(score!=null){
      const bad = items.filter(x=>x.lvl==="bad").map(x=>x.k);
      const ok = items.filter(x=>x.lvl==="ok").map(x=>x.k);
      if(score>=75) veredicto = `Reel sólido${ok.length?`: fuerte en ${ok.slice(0,3).join(", ").toLowerCase()}`:""}. Repetir el formato.`;
      else if(score>=45) veredicto = `Rendimiento medio${bad.length?`; lo que más frena: ${bad.join(", ").toLowerCase()}`:""}.`;
      else veredicto = `Rendimiento flojo${bad.length?`: falla en ${bad.join(", ").toLowerCase()}`:""}. Cambiar enfoque antes de repetirlo.`;
    }
    return { items, score, veredicto, ret, eng };
  }

  // Diagnóstico general de la semana (sección 3)
  function diagSemana(d, prev){
    const items=[];
    const alc=num(d.alcance_total), seg=num(d.alcance_seg), noseg=num(d.alcance_noseg), inter=num(d.interacciones), sum=num(d.seg_sumados), per=num(d.seg_perdidos);
    if(alc==null) return items;
    if(seg!=null && noseg!=null && (seg+noseg)>0){ const p=noseg/(seg+noseg)*100; items.push({k:"Descubrimiento",lvl:p>=60?"ok":p>=35?"info":"warn",txt:`${f1(p)} % del alcance fue a no seguidores${p>=60?": semana de descubrimiento.":p>=35?": equilibrio entre comunidad y gente nueva.":": el contenido circuló sobre todo entre quienes ya siguen la cuenta."}`}); }
    if(sum!=null){ const netos=sum-(per||0); const conv=netos/alc*100; items.push({k:"Conversión",lvl:conv>=1.5?"ok":conv>=0.7?"info":"warn",txt:`${netos>=0?"+":""}${f0(netos)} seguidores netos sobre ${f0(alc)} de alcance (${f1(conv)} %)${conv>=1.5?": muy buena conversión.":conv>=0.7?": conversión normal.":": alcance que no se convierte en seguidores."}`}); if(per!=null && sum>0 && per/sum>0.5) items.push({k:"Pérdidas",lvl:"warn",txt:`Se perdieron ${f0(per)} seguidores contra ${f0(sum)} ganados: revisar frecuencia y tipo de historias.`}); }
    if(inter!=null){ const e=inter/alc*100; items.push({k:"Interacción",lvl:e>=5?"ok":e>=2?"info":"warn",txt:`${f0(inter)} interacciones sobre el alcance (${f1(e)} %)${e>=5?": comunidad activa.":e>=2?": nivel normal.":": poca respuesta al contenido."}`}); }
    if(prev){ const pa=num(prev.alcance_total); if(pa){ const dv=(alc-pa)/pa*100; items.push({k:"Tendencia",lvl:dv>=15?"ok":dv<=-25?"warn":"info",txt:`Alcance ${dv>=0?"+":""}${f0(dv)} % contra la semana anterior (${f0(pa)}).`}); } }
    return items;
  }

  // Media histórica de publicaciones de feed de la marca
  function baselinePubs(reports, marcaSlug, excludePeriodo){
    const views=[], eng=[];
    for(const r of reports){
      if(r.tipo!=="sm" || r.marca_slug!==marcaSlug || r.periodo_id===excludePeriodo) continue;
      const d=r.datos||{};
      for(let i=1;i<=Number(d.feed_n||0);i++){
        const v=num(d[`pub${i}_alcance`])||num(d[`pub${i}_res_views`]); if(v==null||v<=0) continue;
        views.push(v);
        eng.push(((num(d[`pub${i}_res_mg`])||0)+(num(d[`pub${i}_res_com`])||0)+(num(d[`pub${i}_res_comp`])||0)+(num(d[`pub${i}_res_guard`])||0))/v*100);
      }
    }
    const med = a => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; };
    return { n: views.length, views: med(views), eng: med(eng) };
  }

  // Diagnóstico de una publicación de feed (carrusel, foto, diseño)
  function diagPub(d, i, base){
    const g = k => num(d[`pub${i}_${k}`]);
    const views=g("res_views"), alc=g("alcance"), mg=g("res_mg"), com=g("res_com"), comp=g("res_comp"), guard=g("res_guard"), nuevos=g("nuevos_seg"), visitas=g("visitas");
    const objV=g("obj_views"), objMG=g("obj_mg");
    const den = alc || views;
    const items=[];
    if(den==null) return { items:[{k:"Datos",lvl:"info",txt:"Cargá las visualizaciones (o las cuentas alcanzadas) para ver el diagnóstico."}], score:null };
    const sobre = alc ? "cuentas alcanzadas" : "views";
    const formato = String(d[`pub${i}_formato`]||""), pautada = d[`pub${i}_pauta`]==="Pautada";
    if(pautada) items.push({k:"Pautada",lvl:"info",txt:"Publicación pautada: el alcance está inflado por la pauta. Mirá guardados, compartidos y seguidores nuevos."});
    const inter=(mg||0)+(com||0)+(comp||0)+(guard||0);
    const eng=pct(inter,den);
    if(eng!=null){
      const lvl = eng>=5?"ok":eng>=2?"ok":eng>=1?"warn":"bad";
      items.push({k:"Interacción",lvl,txt:`Engagement ${f1(eng)} % (${f0(inter)} interacciones sobre ${f0(den)} ${sobre})${eng>=5?": muy alto.":eng>=2?": bueno.":eng>=1?": normal.":": bajo; se vio pero no movió a actuar."}`});
    }
    const gr=pct(guard,den), cr=pct(comp,den);
    if(guard===0 && /carrusel/i.test(formato)) items.push({k:"Guardados",lvl:"warn",txt:"Carrusel con 0 guardados: el contenido no se percibe como útil para volver a ver. Sumar datos, pasos o una lista."});
    else if(gr!=null && gr>=1.5) items.push({k:"Guardados",lvl:"ok",txt:`Guardados ${f1(gr)} %: contenido de referencia, formato para repetir.`});
    if(cr!=null && cr>=1) items.push({k:"Compartidos",lvl:"ok",txt:`Compartidos ${f1(cr)} %: la gente lo manda a otros, tiene potencial de circular.`});
    if(nuevos!=null){ const conv=pct(nuevos,den); items.push({k:"Conversión",lvl:conv>=0.4?"ok":conv>=0.1?"warn":"bad",txt:`${f0(nuevos)} seguidores nuevos (${f1(conv)} % de las ${sobre})${conv>=0.4?": convierte bien.":conv>=0.1?": conversión normal.":": casi no convierte."}`}); }
    if(visitas!=null && nuevos!=null && visitas>0){ const v2s=nuevos/visitas*100; items.push({k:"Perfil",lvl:v2s>=10?"ok":v2s>=4?"info":"warn",txt:`${f0(visitas)} visitas al perfil y ${f0(nuevos)} seguidores (${f1(v2s)} %)${v2s>=10?": el perfil convence a quien entra.":v2s>=4?".":": entran pero no siguen; revisar bio, destacadas y últimas publicaciones."}`}); }
    if(objV){ const v=views??den; const p=v/objV*100; items.push({k:"Objetivo",lvl:p>=100?"ok":p>=70?"warn":"bad",txt:`Views: ${f0(v)} de ${f0(objV)} planteadas (${f0(p)} %).${objMG&&mg!=null?` MG: ${f0(mg)} de ${f0(objMG)} (${f0(mg/objMG*100)} %).`:""}`}); }
    if(base && base.n>=2 && base.views){ const dv=(den-base.views)/base.views*100; items.push({k:"Vs. la cuenta",lvl:dv>=25?"ok":dv>=-25?"info":"warn",txt:`${dv>=0?"+":""}${f0(dv)} % contra la mediana de la marca (${f0(base.views)} en ${base.n} publicaciones anteriores)${base.eng!=null&&eng!=null?`; engagement ${eng>=base.eng?"por encima":"por debajo"} del habitual (${f1(base.eng)} %)`:""}.`}); }
    const lv = items.filter(x=>x.lvl!=="info"); const score = lv.length ? Math.round(lv.reduce((a,x)=>a+(x.lvl==="ok"?100:x.lvl==="warn"?55:15),0)/lv.length) : null;
    let veredicto="";
    if(score!=null){ const bad=items.filter(x=>x.lvl==="bad").map(x=>x.k), ok=items.filter(x=>x.lvl==="ok").map(x=>x.k);
      veredicto = score>=75 ? `Publicación sólida${ok.length?`: fuerte en ${ok.slice(0,3).join(", ").toLowerCase()}`:""}. Repetir el formato.` : score>=45 ? `Rendimiento medio${bad.length?`; lo que más frena: ${bad.join(", ").toLowerCase()}`:""}.` : `Rendimiento flojo${bad.length?`: falla en ${bad.join(", ").toLowerCase()}`:""}.`; }
    return { items, score, veredicto, eng };
  }

  // "Qué funcionó": agrupa reels y publicaciones de los semanales por tipo de contenido, día y franja horaria.
  // reports = lista de reportes; marca; weekIds = semanas a considerar
  const franja = h => { const m=/^(\d{1,2})/.exec(String(h||"").trim()); if(!m) return null; const x=Number(m[1]); return x<6?"Madrugada (0-6 h)":x<12?"Mañana (6-12 h)":x<15?"Mediodía (12-15 h)":x<19?"Tarde (15-19 h)":"Noche (19-24 h)"; };
  function piezas(reports, marca, weekIds){
    const set=new Set(weekIds), out=[];
    for(const r of reports){ if(r.tipo!=="sm"||r.marca_slug!==marca||!set.has(r.periodo_id)) continue; const d=r.datos||{};
      for(let i=1;i<=Number(d.reels_n||0);i++){ const v=num(d[`reel${i}_res_views`]); if(v==null) continue; const it=(num(d[`reel${i}_res_mg`])||0)+(num(d[`reel${i}_res_com`])||0)+(num(d[`reel${i}_res_comp`])||0)+(num(d[`reel${i}_res_guard`])||0);
        out.push({clase:"Reel", pilar:d[`reel${i}_pilar`]||"", dia:d[`reel${i}_dia`]||"", franja:franja(d[`reel${i}_hora`]), views:v, eng:v?it/v*100:null, seg:num(d[`reel${i}_nuevos_seg`]), nombre:d[`reel${i}_nombre`]}); }
      for(let i=1;i<=Number(d.feed_n||0);i++){ const v=num(d[`pub${i}_alcance`])||num(d[`pub${i}_res_views`]); if(v==null) continue; const it=(num(d[`pub${i}_res_mg`])||0)+(num(d[`pub${i}_res_com`])||0)+(num(d[`pub${i}_res_comp`])||0)+(num(d[`pub${i}_res_guard`])||0);
        out.push({clase:d[`pub${i}_formato`]||"Publicación", pilar:d[`pub${i}_pilar`]||"", dia:d[`pub${i}_dia`]||"", franja:franja(d[`pub${i}_hora`]), views:v, eng:v?it/v*100:null, seg:num(d[`pub${i}_nuevos_seg`]), nombre:d[`pub${i}_nombre`]}); }
    }
    return out;
  }
  function agrupar(list, key){
    const g={}; for(const p of list){ const k=p[key]; if(!k) continue; const o=g[k]??={k, n:0, views:0, eng:[], seg:0, segN:0}; o.n++; o.views+=p.views; if(p.eng!=null) o.eng.push(p.eng); if(p.seg!=null){ o.seg+=p.seg; o.segN++; } }
    return Object.values(g).map(o=>({k:o.k, n:o.n, views:o.views/o.n, eng:o.eng.length?o.eng.reduce((a,b)=>a+b,0)/o.eng.length:null, seg:o.segN?o.seg:null})).sort((a,b)=>(b.eng??-1)-(a.eng??-1) || b.views-a.views);
  }
  function queFunciono(reports, marca, weekIds){
    const ps = piezas(reports, marca, weekIds);
    return { n: ps.length, pilar: agrupar(ps,"pilar"), formato: agrupar(ps,"clase"), dia: agrupar(ps,"dia"), franja: agrupar(ps,"franja"),
      top: [...ps].sort((a,b)=>(b.eng??0)-(a.eng??0)).slice(0,3), conPilar: ps.filter(p=>p.pilar).length };
  }

  window.ANALISIS = { baselineReels, diagReel, diagSemana, baselinePubs, diagPub, queFunciono };
})();
