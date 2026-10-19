// Movimiento medido: las tarjetas y secciones aparecen suavemente al entrar en pantalla.
// El formulario se vuelve a dibujar seguido (cada clic, cada captura): una sección que ya apareció no vuelve a animarse.
(function(){
  // barra amarilla de progreso bajo el encabezado (como en ideamia.es)
  const prog = () => { const b=document.getElementById("progress"); if(!b) return; const h=document.documentElement; const max=h.scrollHeight-h.clientHeight; b.style.width = (max>0 ? Math.min(100, h.scrollTop/max*100) : 0) + "%"; };
  addEventListener("scroll", prog, {passive:true}); addEventListener("resize", prog);
  document.addEventListener("DOMContentLoaded", prog);
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduce || !("IntersectionObserver" in window)) return;
  const vistos = new Set();
  const clave = el => el.dataset.sec ? "sec-"+el.dataset.sec+"-"+(document.getElementById("tipoSeg")?.querySelector("input:checked")?.value||"") : (el.id ? "id-"+el.id : null);
  const io = new IntersectionObserver(entries=>{
    for(const e of entries){ if(!e.isIntersecting) continue; e.target.classList.add("in"); io.unobserve(e.target); const k=clave(e.target); if(k) vistos.add(k); }
  }, {rootMargin:"0px 0px -6% 0px", threshold:0.04});
  function preparar(el){
    if(el.classList.contains("fx")) return;
    const k = clave(el);
    el.classList.add("fx");
    if(k && vistos.has(k)){ el.classList.add("now","in"); requestAnimationFrame(()=>el.classList.remove("now")); return; }
    io.observe(el);
  }
  function barrer(root){ (root||document).querySelectorAll(".card, section.section").forEach(preparar); }
  // Rompecabezas de la portada: se mueve apenas con el mouse y con el scroll (profundidad, estilo Locomotive)
  let mx=0, my=0, raf=0;
  const mover = () => { raf=0; const svg=document.querySelector(".puzzle svg"); if(!svg) return; const sy=Math.min(scrollY,600); svg.style.transform=`translate(${mx*14}px, ${my*10 - sy*0.12}px) rotate(${mx*2}deg)`; };
  const pedir = () => { if(!raf) raf=requestAnimationFrame(mover); };
  if(matchMedia("(pointer:fine)").matches) addEventListener("mousemove", e=>{ mx=e.clientX/innerWidth-.5; my=e.clientY/innerHeight-.5; pedir(); }, {passive:true});
  addEventListener("scroll", pedir, {passive:true});

  // Números del panel: cuentan desde 0 cuando aparecen (solo números simples, "85 %", "12")
  function contar(el){
    if(el.dataset.ct) return; const t=el.textContent.trim(); const m=/^(\d{1,3}(?:\.\d{3})*|\d+)(\s?%)?$/.exec(t); if(!m) return;
    el.dataset.ct="1"; const fin=Number(m[1].replace(/\./g,"")), suf=m[2]||""; if(!fin) return;
    const t0=performance.now(), dur=900; const fmt=n=>new Intl.NumberFormat("es-AR").format(n);
    const paso=now=>{ const k=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-k,3); el.textContent=fmt(Math.round(fin*e))+suf; if(k<1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    barrer();
    document.querySelectorAll(".kpi .v").forEach(contar);
    new MutationObserver(muts=>{ for(const m of muts) for(const n of m.addedNodes){ if(n.nodeType===1) n.querySelectorAll?.(".kpi .v").forEach(contar); } }).observe(document.body,{childList:true,subtree:true});
    new MutationObserver(muts=>{ for(const m of muts) for(const n of m.addedNodes){ if(n.nodeType!==1) continue; if(n.matches(".card, section.section")) preparar(n); barrer(n); } })
      .observe(document.body, {childList:true, subtree:true});
  });
})();
