// Importar reportes hechos antes del sistema (Word, PowerPoint, PDF o capturas).
// 1) Lee el archivo en el navegador (texto + una imagen de la primera página).
// 2) Arma el pedido para la IA con las claves del formulario de destino.
// 3) Traduce la respuesta a los campos del formulario.
(function(){
  const LIBS = {
    jszip: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
    pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
  };
  const cargado = {};
  function cargarScript(url){
    return cargado[url] ??= new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=url; s.onload=res; s.onerror=()=>rej(new Error("No se pudo cargar el lector de archivos (revisá la conexión)")); document.head.appendChild(s); });
  }
  const leerBuffer = f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(new Error("No se pudo leer el archivo")); r.readAsArrayBuffer(f); });
  const ext = f => (String(f.name||"").split(".").pop()||"").toLowerCase();

  // Word: párrafos y tablas en orden
  async function textoDocx(buf){
    await cargarScript(LIBS.jszip);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")?.async("string");
    if(!xml) throw new Error("El Word no tiene contenido legible");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const txt = el => Array.from(el.getElementsByTagNameNS(W,"t")).map(t=>t.textContent).join("");
    const body = doc.getElementsByTagNameNS(W,"body")[0]; const out=[];
    for(const n of Array.from(body?.children||[])){
      if(n.localName==="p"){ const t=txt(n).trim(); if(t) out.push(t); }
      else if(n.localName==="tbl"){ for(const tr of Array.from(n.getElementsByTagNameNS(W,"tr"))){ const celdas=Array.from(tr.getElementsByTagNameNS(W,"tc")).map(tc=>txt(tc).trim()); if(celdas.some(Boolean)) out.push(celdas.join(" | ")); } }
    }
    return out.join("\n");
  }
  // PowerPoint: texto de cada diapositiva
  async function textoPptx(buf){
    await cargarScript(LIBS.jszip);
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files).filter(k=>/^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
    const out=[];
    for(const [i,k] of slides.entries()){
      const doc = new DOMParser().parseFromString(await zip.file(k).async("string"), "application/xml");
      const parr = Array.from(doc.getElementsByTagNameNS("*","p")).map(p=>Array.from(p.getElementsByTagNameNS("*","t")).map(t=>t.textContent).join("").trim()).filter(Boolean);
      if(parr.length) out.push(`--- Diapositiva ${i+1} ---\n${parr.join("\n")}`);
    }
    return out.join("\n");
  }
  // PDF: texto de todas las páginas + imágenes de las primeras (sirven si el PDF es escaneado o son diapositivas)
  async function leerPdf(buf, maxImgs){
    await cargarScript(LIBS.pdf);
    pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    const pdf = await pdfjsLib.getDocument({data:buf}).promise;
    const out=[], imgs=[], porPagina=[];
    for(let p=1; p<=Math.min(pdf.numPages, 40); p++){
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      let linea=""; const lineas=[];
      for(const it of tc.items){ linea += it.str; if(it.hasEOL){ lineas.push(linea.trim()); linea=""; } else linea += " "; }
      if(linea.trim()) lineas.push(linea.trim());
      const t = lineas.filter(Boolean).join("\n"); porPagina.push(t); if(t) out.push(`--- Página ${p} ---\n${t}`);
      if(p<=maxImgs){ const vp=page.getViewport({scale: 1.6}); const c=document.createElement("canvas"); c.width=vp.width; c.height=vp.height; await page.render({canvasContext:c.getContext("2d"), viewport:vp, intent:"print"}).promise; imgs.push(c); } // "print": dibuja aunque la pestaña esté en segundo plano
    }
    return { texto: out.join("\n"), imgs, paginas: pdf.numPages, porPagina };
  }
  // Imagen con el comienzo del texto (para Word y PowerPoint, que no tienen "foto" de la página)
  function lienzoTexto(texto, titulo){
    const c=document.createElement("canvas"); c.width=1100; c.height=1500; const x=c.getContext("2d");
    x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height); x.fillStyle="#111"; x.font="bold 34px Arial"; x.fillText(String(titulo||"Reporte").slice(0,60), 50, 70);
    x.font="21px Arial"; let y=120;
    for(const par of String(texto).split("\n")){
      let l=""; for(const w of par.split(/\s+/)){ const p=(l?l+" ":"")+w; if(x.measureText(p).width>1000){ x.fillText(l,50,y); y+=29; l=w; if(y>1460) return c; } else l=p; }
      x.fillText(l,50,y); y+=33; if(y>1460) return c;
    }
    return c;
  }
  const aArchivo = (canvas, nombre) => new Promise(res=>canvas.toBlob(b=>res(new File([b], nombre, {type:"image/jpeg"})), "image/jpeg", .85));

  // Devuelve { texto, imagenes:[File], tipo:"texto"|"imagenes" }
  async function leerArchivos(files, titulo){
    files = Array.from(files||[]); if(!files.length) throw new Error("Elegí un archivo");
    const f = files[0], e = ext(f);
    if(files.every(x=>/^image\//.test(x.type))) return { texto:"", imagenes: files.slice(0,8), tipo:"imagenes" };
    if(e==="doc"||e==="ppt") throw new Error("Ese formato es viejo (.doc / .ppt): abrilo y guardalo como .docx, .pptx o PDF");
    const buf = await leerBuffer(f);
    if(e==="docx"){ const t=await textoDocx(buf); return { texto:t, imagenes:[await aArchivo(lienzoTexto(t,titulo),"pagina1.jpg")], tipo:"texto" }; }
    if(e==="pptx"){ const t=await textoPptx(buf); return { texto:t, imagenes:[await aArchivo(lienzoTexto(t,titulo),"pagina1.jpg")], tipo:"texto" }; }
    if(e==="pdf"){
      const r = await leerPdf(buf, 12);
      const chars = r.texto.replace(/---[^\n]*---/g,"").trim().length;
      // PDF escaneado o tipo diapositivas (poco texto por página: los títulos y gráficos son imágenes):
      // se manda cada página como imagen, con el texto que tenga esa página como ayuda
      if(chars < 200 || chars/Math.max(1,Math.min(r.paginas,40)) < 350){
        return { texto:"", imagenes: await Promise.all(r.imgs.map((c,i)=>aArchivo(c,`pagina${i+1}.jpg`))), textosPagina: r.porPagina.slice(0, r.imgs.length), tipo:"imagenes", paginas:r.paginas };
      }
      return { texto:r.texto, imagenes:[await aArchivo(r.imgs[0]||lienzoTexto(r.texto,titulo),"pagina1.jpg")], tipo:"texto", paginas:r.paginas };
    }
    throw new Error("Formato no soportado: subí Word (.docx), PowerPoint (.pptx), PDF o imágenes");
  }

  // Claves que la IA puede completar para un tipo de reporte.
  // grupo: "num" (números y listas de números), "listas" (rankings, OKR, campañas) o "textos". Sin grupo: todas.
  // Se piden por grupos para que cada respuesta de la IA entre en el límite de largo del escenario de Make.
  const NO = /^(est_|fotos|logo)/;
  function catalogo(tipo, grupo){
    const S = window.FORMS[tipo]; const lineas=[]; const listas={};
    const visit = f => {
      if(f.type==="row"){ f.fields.forEach(visit); return; }
      if(["sublabel","diag","okrprev","fotos","logo","color","confirm","repeat"].includes(f.type) || !f.id) return;
      if(f.type==="list"||f.type==="table"){
        listas[f.id]=f;
        const esNum = f.id==="mm"; // el mes a mes es casi todo números
        if(!grupo || (grupo==="num" && esNum) || (grupo==="listas" && !esNum)) lineas.push(`${f.id}_{n}_<campo> (lista "${f.label}", n de 1 a ${f.rows}; campos: ${f.cols.map(c=>`${c.id}=${c.l}`).join(", ")})`);
        return;
      }
      if(NO.test(f.id)) return;
      const esTexto = f.type==="textarea" || f.type==="text";
      if(grupo==="num" && esTexto) return; if(grupo==="textos" && !esTexto) return; if(grupo==="listas") return;
      lineas.push(`${f.id}: ${f.label}${f.type==="number"?" (número)":f.opts?` (una de: ${f.opts.join(" / ")})`:""}`);
    };
    S.secciones.forEach(s=>s.fields.forEach(visit));
    return { texto: lineas.join("\n"), listas };
  }
  const GRUPOS = { periodico:["num","listas","textos"], mensual:["num","listas","textos"] };
  function prompt(tipo, ctx, texto, parte, grupo){
    const cat = catalogo(tipo, grupo);
    const nombreTipo = ctx.tipoNombre || (tipo==="mensual"?"Mensual":"Periódico");
    return `Sos analista de redes sociales de un estudio de marketing argentino. Te paso un reporte ${nombreTipo} de Instagram de la marca ${ctx.marca}, período ${ctx.periodo}, hecho antes de que existiera nuestro sistema. Pasalo al formato del sistema.
Respondé SOLO con un objeto JSON plano, sin texto antes ni después y sin \`\`\`. Usá únicamente claves de la lista y solo las que el reporte permita completar: no inventes datos. Números sin separador de miles ni símbolos (12.500 → 12500; 2,5 % → 2.5). Textos: copiá o resumí con fidelidad lo que dice el reporte, en español rioplatense. Para listas usá clave_{n}_campo con n desde 1 (ej: rk_1_desc).
${grupo==="textos" ? `Los textos van resumidos: máximo 3 oraciones cada uno.\n` : ""}${(grupo && grupo!=="num") || parte ? `No incluyas "devolucion".` : `Incluí además "devolucion": 2 o 3 oraciones para quien sube el reporte, diciendo qué pudiste leer y qué datos importantes no estaban.`}
${parte?`Esta es la parte ${parte} del reporte (cada imagen es una página): completá lo que se vea en esta parte.\n`:""}
CLAVES:
${cat.texto}
${texto?`\nREPORTE (texto extraído${ctx.archivo?` de ${ctx.archivo}`:""}):\n${String(texto).slice(0,18000)}`:"\nEl reporte está en la imagen."}`;
  }
  // Solo se aceptan claves que existen en el formulario de destino
  function mapear(tipo, datos){
    const cat = catalogo(tipo); const out={};
    const simples = new Set(); window.walkFields(window.FORMS[tipo], {reels_n:"3",feed_n:"4"}, f=>{ if(f.id) simples.add(f.id); });
    for(const [k,v] of Object.entries(datos||{})){
      if(k==="devolucion" || v==null || v==="" || typeof v==="object") continue;
      let ok = simples.has(k) && !NO.test(k);
      if(!ok){ const m=/^([a-z_]+?)_(\d+)_([a-z_]+)$/.exec(k); if(m && cat.listas[m[1]] && Number(m[2])<=cat.listas[m[1]].rows && cat.listas[m[1]].cols.some(c=>c.id===m[3])) ok=true; }
      if(ok) out[k] = String(v);
    }
    return out;
  }
  // Archivo original como respaldo en Drive (mismo webhook de capturas, sin IA)
  async function subirOriginal(file, meta){
    const C = window.IDEAMIA_CONFIG; if(!C.UPLOAD_URL || file.size > 4*1024*1024) return null;
    const b64 = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(",")[1]); r.onerror=rej; r.readAsDataURL(file); });
    const nombre = `${meta.marca}_${meta.periodo}_original_${Date.now()}_${file.name}`.replace(/[^\w.\-]+/g,"_");
    const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(), 90000);
    try{
      const r = await fetch(C.UPLOAD_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nombre, mime:file.type||"application/octet-stream", data:b64, marca:meta.marca, periodo:meta.periodo, campo:"original", tipo:"importar", leer:0, prompt:""}),signal:ctrl.signal});
      const txt = await r.text(); const id = (txt.match(/"id"\s*:\s*"([-\w]{20,})"/)||[])[1];
      return id ? { id, nombre:file.name, url:`https://drive.google.com/file/d/${id}/view` } : null;
    }catch(e){ return null; } finally { clearTimeout(t); }
  }

  window.IMPORTAR = { leerArchivos, catalogo, prompt, mapear, subirOriginal, GRUPOS };
})();
