// Utilidades compartidas entre el formulario y el panel.
(function(){
  const C = window.IDEAMIA_CONFIG;
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const MESES_C = MESES.map(m => m[0].toUpperCase()+m.slice(1));

  const pad = n => String(n).padStart(2,"0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const dmy = d => `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
  const parseISO = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
  const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

  // Lunes de la semana que contiene d
  function mondayOf(d){
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (x.getDay()+6)%7; // lunes = 0
    return addDays(x, -dow);
  }
  // Semana = { id: ISO del lunes, ini, fin, label }
  function weekFromMonday(mon){
    const fin = addDays(mon,6);
    return { id: iso(mon), ini: mon, fin, label: `${dmy(mon)} al ${dmy(fin)}`, tipo:"semana" };
  }
  function weekFromId(id){ return weekFromMonday(parseISO(id)); }
  // Última semana completa (lunes a domingo) respecto de "hoy"
  function lastCompleteWeek(today=new Date()){
    const thisMon = mondayOf(today);
    return weekFromMonday(addDays(thisMon,-7));
  }
  // Todas las semanas cerradas desde el arranque del sistema (SEMANAL_DESDE) hasta la última completa, más reciente primero
  function recentWeeks(n=null, today=new Date()){
    const last = lastCompleteWeek(today);
    const desde = C.SEMANAL_DESDE ? parseISO(C.SEMANAL_DESDE) : addDays(last.ini,-7*8);
    const out=[]; let mon = last.ini; let i=0;
    while(mon >= desde && (n==null || i<n)){ out.push(weekFromMonday(mon)); mon=addDays(mon,-7); i++; }
    if(!out.length) out.push(last);
    return out;
  }
  const weekLabelYear = w => `${w.label} · ${w.fin.getFullYear()}`;
  function prevWeekId(id){ return iso(addDays(parseISO(id),-7)); }

  // Mes = { id: "2026-08", label: "Agosto 2026" }
  function monthFromId(id){ const [y,m]=id.split("-").map(Number); return { id, y, m, label:`${MESES_C[m-1]} ${y}`, tipo:"mes" }; }
  function lastCompleteMonth(today=new Date()){
    const d = new Date(today.getFullYear(), today.getMonth()-1, 1);
    return monthFromId(`${d.getFullYear()}-${pad(d.getMonth()+1)}`);
  }
  // Todos los meses cerrados desde MENSUAL_DESDE hasta el mes pasado, más reciente primero
  function recentMonths(n=null, today=new Date()){
    const out=[]; const desde = C.MENSUAL_DESDE || "0000-00";
    for(let i=0;;i++){ const d=new Date(today.getFullYear(), today.getMonth()-1-i, 1); const id=`${d.getFullYear()}-${pad(d.getMonth()+1)}`; if(id<desde || (n!=null&&i>=n) || i>240) break; out.push(monthFromId(id)); }
    if(!out.length) out.push(lastCompleteMonth(today));
    return out;
  }
  function prevMonthId(id){ const [y,m]=id.split("-").map(Number); const d=new Date(y,m-2,1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
  // Semanas cuyo lunes cae dentro del mes
  function weeksInMonth(monthId){
    const [y,m]=monthId.split("-").map(Number);
    const out=[]; let mon = mondayOf(new Date(y,m-1,1));
    if(mon.getMonth()!==m-1) mon = addDays(mon,7);
    while(mon.getMonth()===m-1){ out.push(weekFromMonday(mon)); mon=addDays(mon,7); }
    return out;
  }
  // Vencimientos
  function weekDeadline(weekId, tipo="sm"){ const dl = (C.DEADLINE||{})[tipo] || { dia:1, hora:C.DEADLINE_HOUR||12 }; const d = addDays(parseISO(weekId), 7 + (Number(dl.dia||1)-1)); d.setHours(Number(dl.hora||12),0,0,0); return d; }
  function monthDeadline(monthId){ const [y,m]=monthId.split("-").map(Number); const d=new Date(y,m,C.MONTHLY_DEADLINE_DAY); d.setHours(C.DEADLINE_HOUR,0,0,0); return d; }

  // Números
  // Lectura tolerante de números tal como se escriben en Argentina:
  // "1.500" → 1500 · "2,2 mil" → 2200 · "1,8 mil" → 1800 · "6,32" → 6.32 · "1.5" → 1.5 · "10s" → 10 · "12 %" → 12 · "2.128.714" → 2128714
  const num = v => {
    if(v==null) return null; if(typeof v==="number") return isNaN(v)?null:v;
    let s=String(v).trim().toLowerCase(); if(!s) return null;
    let mult=1;
    if(/\d\s*(mil|k)\b/.test(s)){ mult=1000; s=s.replace(/(mil|k)\b/,""); }
    else if(/\d\s*(m|millones?|mm)\b/.test(s)){ mult=1000000; s=s.replace(/(m|millones?|mm)\b/,""); }
    s=s.replace(/[^\d.,\-]/g,"");
    if(!s || s==="-" ) return null;
    if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s=s.replace(/\./g,"").replace(",",".");      // 1.500 / 2.128.714 / 1.500,5
    else if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s=s.replace(/,/g,"");                    // 1,500 (estilo inglés)
    else if(/^-?\d+,\d+$/.test(s)) s=s.replace(",",".");                                      // 6,32
    else if(/^-?\d+\.\d{3}$/.test(s)) s=s.replace(".","");                                    // 1.500 sin más contexto: miles
    else if(/^-?\d+\.\d+$/.test(s)) { /* 1.5 → decimal */ }
    else s=s.replace(/[.,]/g,"");
    const n=Number(s)*mult; return isNaN(n)?null:Math.round(n*100)/100;
  };
  const fmt = n => (n==null||isNaN(n)) ? "–" : new Intl.NumberFormat("es-AR").format(n);
  const pct = (cur,prev) => (prev==null||cur==null||prev===0) ? null : (cur-prev)/prev*100;
  const fmtPct = p => p==null ? "" : `${p>0?"+":""}${p.toFixed(1).replace(".",",")} %`;

  // CSV del Sheet
  // Se usa el export directo (valores tal cual se ven en la planilla). El endpoint "gviz" adivina el tipo de cada columna
  // y borra lo que no coincide: como periodo_id tiene mayoría de fechas, los trimestrales ("2026-07+3") llegaban vacíos.
  // gviz queda solo como respaldo si el export falla.
  // PRUEBA: los reportes de prueba se leen del panel (pestaña "Reportes prueba"), no de la planilla real
  function sheetCsvUrl(){
    return `${C.PRUEBA_API}?prueba=csv&_=${Date.now()}`;
  }
  function sheetGvizUrl(){
    return sheetCsvUrl();
  }
  // fetch con límite de tiempo: si Google no responde, la página no queda "cargando" para siempre
  async function fetchT(url, opts={}, ms=20000){
    const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),ms);
    try{ return await fetch(url, Object.assign({}, opts, {signal:ctrl.signal})); }
    catch(e){ throw new Error(e.name==="AbortError" ? "Google tardó demasiado en responder" : e.message); }
    finally{ clearTimeout(t); }
  }
  async function fetchSheetText(){
    try{
      const r = await fetchT(sheetCsvUrl(), {cache:"no-store"});
      // el export toma la primera pestaña: se confirma que sea la de reportes (por si alguien reordena las pestañas)
      if(r.ok){ const t = await r.text(); const head = t.slice(0, 400); if(t && !t.trim().startsWith("<") && /\btipo\b/.test(head) && /datos_json/.test(head)) return t; }
    }catch(e){}
    const r = await fetchT(sheetGvizUrl(), {cache:"no-store"});
    if(!r.ok) throw new Error("No se pudo leer el Sheet ("+r.status+")");
    return r.text();
  }
  const ts = s => { const t = Date.parse(s||""); return isNaN(t) ? 0 : t; };
  // Normaliza el período: la planilla convierte "2026-09-28" o "2026-09" en fechas y a veces las muestra como 28/9/2026.
  function normPeriodo(o){
    let p = String(o.periodo_id||"").trim();
    const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(p);
    if(dm) p = `${dm[3]}-${pad(dm[2])}-${pad(dm[1])}`;
    if(o.tipo==="mensual" && /^\d{4}-\d{2}-\d{2}$/.test(p)) p = p.slice(0,7);
    if((o.tipo==="sm"||o.tipo==="cm") && /^\d{4}-\d{2}-\d{2}$/.test(p)) p = iso(mondayOf(parseISO(p)));
    o.periodo_id = p;
    if(o.tipo==="mensual" && /^\d{4}-\d{2}$/.test(p)) o.periodo_label = monthFromId(p).label;
    if((o.tipo==="sm"||o.tipo==="cm") && /^\d{4}-\d{2}-\d{2}$/.test(p)) o.periodo_label = weekFromId(p).label;
  }
  function parseCSV(text){
    const rows=[]; let row=[], cur="", q=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(q){ if(ch==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=ch; }
      else if(ch==='"') q=true;
      else if(ch===','){ row.push(cur); cur=""; }
      else if(ch==='\n'){ row.push(cur); rows.push(row); row=[]; cur=""; }
      else if(ch==='\r'){}
      else cur+=ch;
    }
    if(cur!==""||row.length){ row.push(cur); rows.push(row); }
    return rows;
  }
  async function loadRaw(){
    if(!C.SHEET_ID) return [];
    const rows = parseCSV(await fetchSheetText());
    if(!rows.length) return [];
    const head = rows[0].map(h=>h.trim());
    const out=[];
    for(const r of rows.slice(1)){
      if(!r.some(x=>x&&x.trim())) continue;
      const o={}; head.forEach((h,i)=>o[h]=r[i]??"");
      if(!o.tipo) continue;
      try{ o.datos = o.datos_json ? JSON.parse(o.datos_json) : {}; }catch(e){ o.datos={}; o.datos_error=true; }
      normPeriodo(o);
      out.push(o);
    }
    // orden cronológico real (en la planilla conviven "…-03:00" y "…Z")
    out.sort((a,b)=> ts(a.enviado_en)-ts(b.enviado_en));
    return out;
  }
  async function loadReports(){
    const out = await loadRaw();
    // Bajas: una fila "baja" apunta a un reporte por tipo + marca + fecha de envío (el período no se usa porque las bajas viejas lo tienen vacío)
    const bajas = new Set(out.filter(r=>r.tipo==="baja").map(r=>`${r.datos.ref_tipo}|${r.marca_slug}|${r.datos.ref_enviado_en}`));
    const vivos = out.filter(r=> r.tipo!=="baja" && r.tipo!=="prueba" && !bajas.has(`${r.tipo}|${r.marca_slug}|${r.enviado_en}`));
    // Versiones: la última de cada tipo+marca+período es la vigente; las anteriores quedan en r.versiones
    const byKey = {};
    for(const r of vivos){ const k=`${r.tipo}|${r.marca_slug}|${r.periodo_id}`; (byKey[k] ??= []).push(r); }
    const result = [];
    for(const k in byKey){
      // reenvíos idénticos (doble clic o reintento) no cuentan como corrección
      const arr=[];
      for(const r of byKey[k]){ const prev=arr[arr.length-1]; if(prev && prev.datos_json===r.datos_json){ (prev.copias ??= []).push(r); continue; } arr.push(r); }
      const last=arr[arr.length-1]; last.versiones = arr.slice(0,-1); last.version = arr.length; result.push(last);
    }
    result.sort((a,b)=> ts(a.enviado_en)-ts(b.enviado_en));
    return result;
  }
  // ¿Llegó a la planilla un envío? Se usa cuando Make tarda o se corta la conexión: muchas veces el reporte sí se guardó.
  async function verificarEnvio(p, intentos=6, espera=5000){
    for(let i=0;i<intentos;i++){
      try{ const raw = await loadRaw(); if(raw.some(r=>r.tipo===p.tipo && r.marca_slug===p.marca_slug && r.enviado_en===p.enviado_en)) return true; }catch(e){}
      await new Promise(res=>setTimeout(res, espera));
    }
    return false;
  }
  // Envío al webhook de Make con verificación: si no responde a tiempo, se revisa la planilla antes de dar el error,
  // así nadie reenvía un reporte que ya llegó (eso generaba duplicados).
  async function enviarWebhook(payload, onEstado){
    if(!C.WEBHOOK_URL) throw new Error("Falta configurar el webhook");
    let err=null;
    try{
      const r = await fetchT(C.WEBHOOK_URL, {method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)}, 45000);
      if(r.ok) return {ok:true};
      err = new Error("Make respondió con error "+r.status);
    }catch(e){ err=e; }
    onEstado && onEstado("Comprobando si el reporte llegó a la planilla…");
    if(await verificarEnvio(payload)) return {ok:true, verificado:true};
    throw err;
  }
  // Baja lógica de un reporte: manda un evento al mismo webhook; Make lo guarda como fila tipo "baja".
  function nowStamp(){
    const now=new Date(); const off=-now.getTimezoneOffset(); const sg=off>=0?"+":"-"; const oh=pad(Math.floor(Math.abs(off)/60)), om=pad(Math.abs(off)%60);
    return `${iso(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sg}${oh}:${om}`;
  }
  async function eliminarReporte(r, quien){
    // se da de baja la versión vigente y sus copias idénticas (reenvíos por doble clic)
    for(const x of [r, ...(r.copias||[])]){
      const payload = { enviado_en:nowStamp(), tipo:"baja", marca:x.marca, marca_slug:x.marca_slug, periodo_id:x.periodo_id, periodo_label:x.periodo_label, responsable:quien||"",
        resumen:`Se eliminó el reporte ${x.tipo} enviado el ${x.enviado_en}`, alcance:"", seguidores_netos:"", interacciones:"", reels_publicados:"",
        datos_json: JSON.stringify({ref_tipo:x.tipo, ref_enviado_en:x.enviado_en}) };
      await enviarWebhook(payload);
      if(r.copias && r.copias.length) await new Promise(res=>setTimeout(res,1100)); // enviado_en distinto para cada baja
    }
    return true;
  }
  // Subida de capturas: comprime en el navegador y la manda al webhook de Make "Subir captura", que la guarda en Drive y responde {id,url}.
  async function subirFoto(file, meta={}){
    if(!C.UPLOAD_URL) throw new Error("La subida de capturas no está configurada (UPLOAD_URL en config.js)");
    const dataUrl = await new Promise((res,rej)=>{
      const img=new Image(); const url=URL.createObjectURL(file);
      img.onload=()=>{ const max=1400; const sc=Math.min(1,max/Math.max(img.width,img.height)); const c=document.createElement("canvas"); c.width=Math.round(img.width*sc); c.height=Math.round(img.height*sc); c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg",0.82)); };
      img.onerror=()=>rej(new Error("No se pudo leer la imagen")); img.src=url;
    });
    const b64 = dataUrl.split(",")[1];
    const nombre = `${meta.marca||"captura"}_${meta.periodo||""}_${meta.campo||""}_${Date.now()}`.replace(/[^\w.\-]+/g,"_");
    // El pedido para la IA viaja ya "escapado" para JSON: Make lo pega tal cual dentro del cuerpo de la llamada a Claude.
    const prompt = meta.leer && meta.prompt ? JSON.stringify(String(meta.prompt)).slice(1,-1) : "";
    const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(), meta.timeout || (meta.leer ? 90000 : 60000));
    let res, iaFallo=false;
    const enviar = (leer, signal) => fetch(C.UPLOAD_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nombre, mime:"image/jpeg", data:b64, marca:meta.marca||"", periodo:meta.periodo||"", campo:meta.campo||"", tipo:meta.tipo||"", leer:leer?1:0, prompt: leer?prompt:""}),signal});
    try{ res = await enviar(meta.leer, ctrl.signal); }
    catch(e){ if(!meta.leer) throw new Error(e.name==="AbortError"?"La subida tardó demasiado":e.message); res=null; }
    finally{ clearTimeout(t); }
    // Si falla la lectura con IA (la cuenta de la IA sin crédito, Make caído a mitad de camino, etc.),
    // la captura se guarda igual sin lectura: nadie queda trabado por la IA.
    if(meta.leer && (!res || !res.ok)){
      iaFallo=true;
      const c2=new AbortController(); const t2=setTimeout(()=>c2.abort(), 60000);
      try{ res = await enviar(false, c2.signal); }
      catch(e){ throw new Error(e.name==="AbortError"?"La subida tardó demasiado":e.message); }
      finally{ clearTimeout(t2); }
    }
    if(!res.ok) throw new Error("HTTP "+res.status);
    const txt = await res.text(); let j=null; try{ j=JSON.parse(txt); }catch(e){}
    const id = j?.id || (txt.match(/"id"\s*:\s*"([-\w]{20,})"/)||[])[1] || (txt.match(/[-\w]{25,}/)||[])[0];
    if(!id) throw new Error("Make no devolvió el ID del archivo");
    let datos = j?.datos; if(typeof datos==="string"){ try{ datos=JSON.parse(datos.replace(/^```(json)?|```$/g,"").trim()); }catch(e){ datos=null; } }
    // Si la respuesta de Make vino rota (comillas sin escapar, texto cortado), se rescata al menos la devolución
    if(!j && meta.leer){
      // respuesta cortada (la IA llegó al límite de largo): se rescatan todas las claves completas que alcanzaron a llegar
      const i = txt.indexOf('"datos"'); const s = i>=0 ? txt.slice(txt.indexOf("{", i)) : "";
      if(s){ for(let p=s.length, intentos=0; p>1 && intentos<400; intentos++){ p = s.lastIndexOf(",", p-1); if(p<1) break; try{ const o=JSON.parse(s.slice(0,p)+"}"); if(o && typeof o==="object"){ datos=o; break; } }catch(e){} } }
      if(!datos){ const m=/"devolucion"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(txt); if(m){ try{ datos={devolucion:JSON.parse(`"${m[1]}"`)}; }catch(e){ datos={devolucion:m[1].replace(/\\n/g,"\n")}; } } }
    }
    return { id, url: j?.url || `https://drive.google.com/thumbnail?id=${id}&sz=w1600`, nombre, datos: (datos && typeof datos==="object") ? datos : null, iaFallo };
  }
  // Mes "carpeta" de un reporte: mes del lunes de la semana, el mes en sí, o el mes de inicio del período
  function mesDe(r){
    const p = r.periodo_id||"";
    if(r.tipo==="mensual") return p;
    if(r.tipo==="periodico" && window.PERIODICO && p.includes("+")) return window.PERIODICO.parsePeriod(p).fin; // el trimestre va en la carpeta del mes en que termina
    return p.slice(0,7);
  }
  // Marcas y responsables desde pestañas del Sheet ("Marcas": slug,nombre,sm,activa · "Responsables": slug,nombre,rol).
  // Si las pestañas no existen o están vacías, quedan las de config.js.
  async function loadCatalog(){
    if(!C.SHEET_ID) return false;
    const get = async tab => {
      const url = `${C.PRUEBA_API}?prueba=tab&tab=${encodeURIComponent(tab)}&_=${Date.now()}`;   // PRUEBA
      const r = await fetchT(url,{cache:"no-store"},12000); if(!r.ok) return null;
      const txt = await r.text(); if(!txt || txt.trim().startsWith("<")) return null;
      const rows = parseCSV(txt); if(rows.length<2) return null;
      const head = rows[0].map(h=>h.trim().toLowerCase());
      return rows.slice(1).filter(r=>r.some(x=>x&&x.trim())).map(r=>{ const o={}; head.forEach((h,i)=>o[h]=(r[i]??"").trim()); return o; });
    };
    let changed=false;
    try{
      // Pestaña "Config" (clave, valor): permite cambiar ajustes sin tocar config.js ni republicar. Hoy: UPLOAD_URL.
      const [cfg, resp, marcas] = await Promise.all([get("Config"), get("Responsables"), get("Marcas")].map(p=>p.catch(()=>null)));
      if(cfg && cfg.length){ for(const row of cfg){ const k=(row.clave||row.key||"").trim().toUpperCase(), v=(row.valor||row.value||"").trim(); if(k==="UPLOAD_URL" && /^https?:\/\//.test(v)) { C.UPLOAD_URL=v; changed=true; } if(k==="DRAFTS_URL" && /^https:\/\//.test(v)) { C.DRAFTS_URL=v; changed=true; } } }
      if(resp && resp.length && resp.every(x=>x.slug&&x.nombre)){
        const R={}; resp.forEach(x=>{ R[x.slug.toLowerCase()]={nombre:x.nombre, rol:x.rol||"Social Media"}; });
        if(!Object.values(R).some(x=>/community/i.test(x.rol))) R.cm = C.RESPONSABLES.cm || {nombre:"CM",rol:"Community Manager"};
        C.RESPONSABLES=R; changed=true;
      }
      if(marcas && marcas.length && marcas.every(x=>x.slug&&x.nombre&&x.sm)){
        const cfg = Object.fromEntries((C.MARCAS||[]).map(m=>[m.slug,m]));
        C.MARCAS = marcas.filter(x=>!/^(no|0|false)$/i.test(x.activa||"")).map(x=>{ const slug=x.slug.toLowerCase(); const canal = ("canal" in x && x.canal!=="") ? /^(si|sí|s|1|true|x)$/i.test(x.canal) : !!cfg[slug]?.canal; return {slug, nombre:x.nombre, sm:x.sm.toLowerCase(), cm:(x.cm||"cm").toLowerCase(), canal, color:x.color||"", fuente:x.fuente||"", fondo:x.fondo||"", logo:x.logo||"", ig:x.ig||""}; }).filter(x=>C.RESPONSABLES[x.sm]);
        changed=true;
      }
    }catch(e){}
    return changed;
  }
  function indexReports(list){
    const idx = {};
    for(const r of list) idx[`${r.tipo}|${r.marca_slug}|${r.periodo_id}`] = r;
    return idx;
  }

  // ---------- Borradores en la nube (Apps Script de la planilla, pestaña "Borradores") ----------
  // Copia de seguridad de lo que se está escribiendo: si se cierra la página o se cambia de dispositivo, se recupera.
  const nubeOn = () => /^https:\/\/script\.google(usercontent)?\.com\//.test(C.DRAFTS_URL||"");
  async function nubeGuardar(clave, vals, quien, keepalive=false){
    if(!nubeOn()) return {ok:false, off:true};
    const body = JSON.stringify({clave, ts: vals._ts||Date.now(), quien: quien||"", datos: JSON.stringify(vals)});
    if(keepalive){ // al cerrar la pestaña: se manda sin esperar respuesta
      try{ fetch(C.DRAFTS_URL, {method:"POST", mode:"no-cors", keepalive: body.length<60000, headers:{"Content-Type":"text/plain;charset=utf-8"}, body}); }catch(e){}
      return {ok:true};
    }
    const r = await fetchT(C.DRAFTS_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body}, 25000);
    if(!r.ok) throw new Error("HTTP "+r.status);
    const j = await r.json().catch(()=>null); if(!j || !j.ok) throw new Error((j&&j.error)||"respuesta inválida");
    return j;
  }
  async function nubeLeer(clave){
    if(!nubeOn()) return null;
    const r = await fetchT(`${C.DRAFTS_URL}?clave=${encodeURIComponent(clave)}&_=${Date.now()}`, {cache:"no-store"}, 15000);
    const j = await r.json(); if(!j || !j.ok || !j.borrador) return null;
    try{ return { vals: JSON.parse(j.borrador), actualizado: j.actualizado, quien: j.quien }; }catch(e){ return null; }
  }
  async function nubeLista(){
    if(!nubeOn()) return [];
    const r = await fetchT(`${C.DRAFTS_URL}?lista=1&_=${Date.now()}`, {cache:"no-store"}, 15000);
    const j = await r.json(); return (j && j.ok && Array.isArray(j.lista)) ? j.lista : [];
  }
  async function nubeBorrar(clave){
    if(!nubeOn()) return;
    try{ await fetchT(C.DRAFTS_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body: JSON.stringify({clave, borrar:true})}, 20000); }catch(e){}
  }

  // ---------- IA: qué se le pide según la captura ----------
  // Devuelve el texto que se manda a Claude junto con la imagen. Siempre pide JSON plano con "devolucion" (texto para quien carga)
  // y, según el caso, los números que se pueden leer de la captura.
  const BASE_IA = "Sos analista de redes sociales de un estudio de marketing argentino. Respondé SOLO con un objeto JSON plano, sin texto antes ni después y sin ```. Números con punto decimal y sin símbolos (71,5 % → 71.5; 2,2 mil → 2200). Incluí solo las claves que puedas leer con razonable certeza.";
  const DEV_IA = "La clave \"devolucion\" es obligatoria: un texto en español rioplatense (voseo), claro y concreto, de 3 a 5 oraciones, para la persona que arma el reporte: qué muestra la imagen, qué significan los números o qué transmite la pieza, si es bueno o flojo y por qué, y una recomendación accionable. No inventes datos que no se ven.";
  function promptIA(campo, ctx={}){
    const marca = ctx.marca ? ` de la marca ${ctx.marca}` : "";
    const nombre = ctx.nombre ? ` La pieza se llama o trata sobre: "${ctx.nombre}".` : "";
    const obj = ctx.objetivo ? ` Objetivo planteado: ${ctx.objetivo}.` : "";
    if(/^reel\d+_fotos$/.test(campo)) return `${BASE_IA} Es una captura de las Estadísticas de un reel de Instagram${marca}.${nombre}${obj} Claves posibles: ret_3s (% que seguía viendo a los 3 segundos según la curva 'Durante cuánto tiempo las personas vieron tu reel', 0-100), ret_fin (% que llegó al final, 0-100), picos_mg (momentos con pico en el gráfico de me gusta, texto 'm:ss' separados por coma), duracion (segundos), tiempo_prom (tiempo promedio de reproducción en segundos), omisiones (%), views (visualizaciones), mg (me gusta), comentarios, compartidos, guardados, nuevos_seg (seguidores que generó), reposts, org_feed, org_historias, org_reels, org_perfil, org_explorar (% de origen de las visualizaciones). ${DEV_IA} En la devolución interpretá la retención (gancho de los primeros 3 segundos, caída, final) y qué cambiarías en el próximo reel.`;
    if(/^pub\d+_fotos$/.test(campo)) return `${BASE_IA} Es una captura de las Estadísticas de una publicación de feed de Instagram${marca}.${nombre}${obj} Claves posibles: views (visualizaciones), alcance, mg (me gusta), comentarios, compartidos, guardados, nuevos_seg (seguidores que generó). ${DEV_IA}`;
    if(/_portada$/.test(campo)) return `${BASE_IA} Es la portada o miniatura de una pieza de Instagram${marca}.${nombre} No hay números que leer: devolvé solo la clave "devolucion". ${DEV_IA} Evaluá si frena el scroll, si el texto se lee en el celular, si se entiende de qué trata y si respeta la identidad de la marca.`;
    if(/^(fotos_resultados|m_fotos|p_fotos)$/.test(campo)) return `${BASE_IA} Es una captura de las Estadísticas de la cuenta de Instagram${marca} (${campo==="fotos_resultados"?"últimos 7 días":campo==="m_fotos"?"el mes":"el período"}). Claves posibles: alcance_total (Espectadores: cuentas únicas que vieron el contenido), alc_pauta (espectadores de anuncios), visualizaciones (total de visualizaciones), views_pauta (visualizaciones de anuncios), views_seg (visualizaciones de seguidores), views_noseg (visualizaciones de no seguidores), interacciones, seg_sumados (seguidores nuevos), seg_perdidos (dejaron de seguir), contactos. ${DEV_IA} Interpretá la proporción seguidores / no seguidores de las visualizaciones, lo orgánico contra lo pago y el crecimiento.`;
    if(campo==="a_fotos") return `${BASE_IA} Es una captura de la Audiencia de una cuenta de Instagram${marca} (género, edad, ciudades). Claves posibles: a_mujeres (% mujeres), a_franja (franja etaria dominante, texto como '25-34'), a_c1, a_c2, a_c3 (ciudades principales, texto), a_c1p, a_c2p, a_c3p (% de cada ciudad). ${DEV_IA}`;
    return `${BASE_IA} Es una captura subida a un reporte de redes sociales${marca} (${campo}). ${DEV_IA}`;
  }

  const isCM = slug =>!!(C.RESPONSABLES[slug] && /community/i.test(C.RESPONSABLES[slug].rol));
  const cmDe = m => (m && m.cm && C.RESPONSABLES[m.cm]) ? m.cm : (Object.keys(C.RESPONSABLES).find(k=>isCM(k)) || "cm");
  window.IDX = { isCM, cmDe, MESES_C, pad, iso, dmy, parseISO, addDays, mondayOf, weekFromMonday, weekFromId, lastCompleteWeek, recentWeeks, prevWeekId,
    monthFromId, lastCompleteMonth, recentMonths, prevMonthId, weeksInMonth, weekDeadline, monthDeadline,
    weekLabelYear, num, fmt, pct, fmtPct, loadReports, loadCatalog, indexReports, parseCSV, eliminarReporte, mesDe, subirFoto,
    enviarWebhook, verificarEnvio, nowStamp, promptIA, ts, nubeOn, nubeGuardar, nubeLeer, nubeLista, nubeBorrar };
})();
