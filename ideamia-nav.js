/* Barra común de las webs de Ideamia (Panel diario · Reportes · Brainstormings).
   Las tres viven en ideamiacontacto-lab.github.io, así que comparten localStorage: cada una guarda ahí
   la persona (ideamia:persona / ideamia:nombre) y la clave del equipo (ideamia:clave), y las otras las toman al abrir.
   Este archivo se sirve desde panel-ideamia y lo cargan los tres sitios con <script src=… defer>. */
(function () {
  // adentro del panel (Plan y Objetivos van embebidos como pestañas) la barra no se muestra: ya está la del panel
  if (window.self !== window.top) return;
  const SITIOS = [
    { id: 'panel', n: 'Panel diario', c: 'Panel', u: 'https://ideamiacontacto-lab.github.io/panel-ideamia/' },
    { id: 'reportes', n: 'Reportes', u: 'https://ideamiacontacto-lab.github.io/reportes-ideamia/' },
    { id: 'brain', n: 'Brainstormings', c: 'Ideas', u: 'https://ideamiacontacto-lab.github.io/brainstormings-ideamia/' },
    // Plan y Objetivos (OKR) ahora son pestañas del panel (22/10/2026): arriba quedan solo Reportes y Brainstormings
  ];
  // plataforma de prueba de Joaquín (?p=joaco o /prueba/): todos los links quedan dentro de la prueba
  // también si en el panel se eligió "Joaquín (prueba)" (persona guardada joaco), aunque la dirección no diga ?p=joaco
  const guardada = (() => { try { const v = localStorage.getItem('pi:persona'); return (v ? JSON.parse(v) : '') || localStorage.getItem('ideamia:persona') || ''; } catch (e) { return ''; } })();
  const qp = new URLSearchParams(location.search).get('p');
  const PRUEBA = qp === 'joaco' || /\/prueba\//.test(location.pathname) || (!qp && guardada === 'joaco' && /panel-ideamia/.test(location.pathname));
  if (PRUEBA) {
    const B = 'https://ideamiacontacto-lab.github.io/panel-ideamia/';
    SITIOS.splice(0, SITIOS.length,
      { id: 'inicio', n: 'Prueba · Inicio', c: 'Inicio', u: B + 'prueba/' },
      { id: 'panel', n: 'Panel diario', c: 'Panel', u: B + '?p=joaco' },
      { id: 'reportes', n: 'Reportes', u: B + 'prueba/reportes/?resp=joaco' });
  }
  const p = location.pathname + ' ' + location.host;
  const actual = /\/prueba\/reportes/.test(location.pathname) ? 'reportes' : /\/prueba\/?$/.test(location.pathname) ? 'inicio' : /objetivos/.test(location.pathname) ? 'okr' : /\/plan\//.test(location.pathname) ? 'plan' : /panel-ideamia|localhost:5190/.test(p) ? 'panel' : /reportes-ideamia/.test(p) ? 'reportes' : /brainstormings-ideamia/.test(p) ? 'brain' : '';
  const ls = { get: k => { try { return localStorage.getItem('ideamia:' + k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem('ideamia:' + k, v) : localStorage.removeItem('ideamia:' + k); } catch (e) {} } };
  window.IdeamiaSesion = { clave: () => ls.get('clave'), persona: () => ls.get('persona'), nombre: () => ls.get('nombre'), guardar: o => Object.keys(o).forEach(k => ls.set(k, o[k])) };

  const quien = PRUEBA ? 'joaco' : (() => { try { const v = localStorage.getItem('pi:persona'); return (v ? JSON.parse(v) : '') || ls.get('persona'); } catch (e) { return ls.get('persona'); } })();

  /* Identidad (8/11/2026): el panel de identidad corporativa es otro servicio, aparte del panel diario. Solo lo ven
     Joaquín e Ivo: el botón aparece solo en un navegador donde ya se cargó la clave del project (Agenda), y el link
     secreto no está en este archivo (es público): lo da el servidor del panel, que vuelve a revisar clave y rol. */
  const pkey = (() => { try { const v = localStorage.getItem('pi:pkey'); return v ? JSON.parse(v) : ''; } catch (e) { return ''; } })();
  if (!PRUEBA && pkey) SITIOS.push({ id: 'identidad', n: 'Identidad', u: '#identidad' });
  async function irIdentidad(a) {
    let link = ls.get('idn');
    if (!link) {
      const api = (window.PANEL_CONFIG || {}).API_URL || 'https://script.google.com/macros/s/AKfycbwCxld4KNBsNMSGGluIA138f1vaKBo2TnqMIXsO2Y8iV87k4d7NUic47-MpvEgYehZJ/exec';
      const yo = quien && quien !== 'project' && quien !== '__project' ? quien : 'project';
      a.style.opacity = '.5';
      try {
        const j = await fetch(api + '?action=identidad&k=' + encodeURIComponent(pkey) + '&p=' + encodeURIComponent(yo)).then(r => r.json());
        if (!j.link) { a.style.opacity = ''; alert(j.mensaje || 'Todavía no está cargado el link del panel de identidad.'); return; }
        link = j.link; ls.set('idn', link);
      } catch (e) { a.style.opacity = ''; alert('No se pudo abrir el panel de identidad. Revisá la conexión.'); return; }
    }
    location.href = link;
  }
  const css = '#ideamia-nav .ct{display:none}#ideamia-nav{font:600 12.5px/1 Outfit,system-ui,sans-serif;background:#0A0A0A;color:#8C8C8C;border-bottom:1px solid #222;display:flex;align-items:center;gap:10px;padding:0 16px;height:40px;position:relative;z-index:60;-webkit-font-smoothing:antialiased}' +
    '#ideamia-nav .w{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#F5F5F5;text-decoration:none;flex:none}#ideamia-nav .w b{color:#FFF200;font-weight:700}' +
    '#ideamia-nav .l{display:flex;gap:4px;margin-left:auto;overflow-x:auto;scrollbar-width:none}#ideamia-nav .l::-webkit-scrollbar{display:none}' +
    '#ideamia-nav a.s{color:#8C8C8C;text-decoration:none;padding:7px 12px;border-radius:999px;border:1px solid transparent;white-space:nowrap;transition:all .15s}' +
    '#ideamia-nav a.s:hover{color:#F5F5F5;border-color:#2E2E2E}#ideamia-nav a.s.on{background:#FFF200;color:#0A0A0A;font-weight:700}' +
    '@media(max-width:700px){#ideamia-nav{padding:0 12px;gap:8px}#ideamia-nav .w{display:none}#ideamia-nav .l{margin-left:0;width:100%}#ideamia-nav a.s{flex:1;text-align:center;padding:7px 4px;font-size:12px}#ideamia-nav .lg{display:none}#ideamia-nav .ct{display:inline}}';
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const bar = document.createElement('nav'); bar.id = 'ideamia-nav'; bar.setAttribute('aria-label', 'Webs de Ideamia');
  bar.innerHTML = '<a class="w" href="' + SITIOS[0].u + '">Idea<b>mia</b>' + (PRUEBA ? ' <span style="color:#FF8AD8">· prueba</span>' : '') + '</a><div class="l">' + SITIOS.filter(s => !s.solo || s.solo.indexOf(quien) >= 0 || s.id === actual).map(s => '<a class="s' + (s.id === actual ? ' on' : '') + '" href="' + s.u + '"><span class="lg">' + s.n + '</span><span class="ct">' + (s.c || s.n) + '</span></a>').join('') + '</div>';
  const bi = bar.querySelector('a[href="#identidad"]'); if (bi) bi.onclick = e => { e.preventDefault(); irIdentidad(bi); };
  const poner = () => document.body.prepend(bar);
  document.body ? poner() : document.addEventListener('DOMContentLoaded', poner);
})();
