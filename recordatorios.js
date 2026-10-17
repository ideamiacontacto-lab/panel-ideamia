/* Recordatorios personales del panel (Panel diario y Plan).
   · Campanita flotante: "Mis recordatorios" + "Nuevo recordatorio".
   · Window.Recordatorios.abrir({ id, n, url, due, marca }): recordatorio de una tarjeta (lo llama la campanita de cada fila del panel).
   · Las alertas que "sonaron" en el panel aparecen arriba hasta que se marcan como vistas.
   Usa la misma persona y clave del panel (localStorage). Los datos viven en el Apps Script (panel-ideamia-recordatorios.json). */
(function () {
  const C = window.PANEL_CONFIG || {}; if (!C.API_URL) return;
  const ls = k => { try { const v = localStorage.getItem(k); if (v == null) return ''; try { return JSON.parse(v); } catch (e) { return v; } } catch (e) { return ''; } };
  const persona = () => ls('pi:persona') || ls('ideamia:persona') || '', clave = () => (persona() === 'project' ? ls('pi:pkey') : '') || ls('pi:key') || ls('ideamia:clave') || ls('pi:pkey') || '';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const hoyS = (n) => { const d = new Date(); d.setDate(d.getDate() + (n || 0)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const css = '.rc-fab{position:fixed;right:16px;bottom:22px;z-index:55;width:48px;height:48px;border-radius:50%;border:1px solid #333;background:#1C1C1C;color:#FFF200;font-size:20px;box-shadow:0 6px 20px rgba(0,0,0,.45);cursor:pointer;display:grid;place-items:center}' +
    'body.movil .rc-fab{bottom:86px}.rc-fab em{position:absolute;top:-4px;right:-4px;background:#FF6B6B;color:#fff;font:700 11px Outfit,sans-serif;border-radius:999px;padding:2px 6px;font-style:normal}' +
    '.rc-ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:70;display:grid;place-items:end center;animation:rcf .2s}@media(min-width:700px){.rc-ov{place-items:center}}' +
    '.rc-box{background:#141414;color:#F5F5F5;border:1px solid #262626;border-radius:20px 20px 0 0;width:100%;max-width:520px;max-height:88vh;overflow:auto;padding:18px;font:400 14.5px/1.45 Outfit,system-ui,sans-serif;animation:rcu .25s ease}@media(min-width:700px){.rc-box{border-radius:20px}}' +
    '.rc-box h3{margin:0 0 4px;font-size:18px}.rc-box p.s{color:#8C8C8C;margin:0 0 12px;font-size:13px}.rc-box label.l{display:block;font-size:12px;color:#8C8C8C;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin:12px 0 6px}' +
    '.rc-box input[type=text],.rc-box input[type=date],.rc-box input[type=time],.rc-box input[type=number]{width:100%;background:#1C1C1C;border:1px solid #262626;border-radius:12px;padding:10px 12px;color:#F5F5F5;font:inherit}' +
    '.rc-seg{display:flex;gap:6px;flex-wrap:wrap}.rc-seg button{border:1px solid #262626;background:#1C1C1C;color:#cfcfcf;border-radius:999px;padding:7px 12px;font:600 13px Outfit,sans-serif;cursor:pointer}.rc-seg button.on{background:#FFF200;color:#0A0A0A;border-color:#FFF200}' +
    '.rc-row{display:flex;gap:8px;align-items:center}.rc-row>*{flex:1}.rc-acc{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}' +
    '.rc-btn{background:#FFF200;color:#0A0A0A;border:0;border-radius:12px;padding:10px 16px;font:700 14px Outfit,sans-serif;cursor:pointer}.rc-btn.g{background:#242424;color:#F5F5F5}.rc-btn:disabled{opacity:.5}' +
    '.rc-it{border-top:1px solid #262626;padding:10px 0;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.rc-it:first-child{border-top:0}.rc-it .m{color:#8C8C8C;font-size:12.5px}.rc-it a{color:#FFF200}' +
    '.rc-x{background:none;border:1px solid #333;color:#8C8C8C;border-radius:10px;padding:6px 10px;cursor:pointer;font:600 12px Outfit,sans-serif}' +
    '.rc-al{position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:60;width:min(520px,calc(100% - 24px));display:flex;flex-direction:column;gap:8px}' +
    '.rc-al div{background:#1C1C1C;border:1px solid rgba(255,242,0,.45);border-radius:14px;padding:10px 12px;color:#F5F5F5;font:400 14px/1.4 Outfit,sans-serif;display:flex;gap:10px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.5);animation:rcu .25s}' +
    '.rc-al b{color:#FFF200}.rc-al span{flex:1}.rc-al a{color:#FFF200}.rc-bell{background:none;border:0;color:#8C8C8C;cursor:pointer;font-size:15px;padding:2px 6px;border-radius:8px}.rc-bell:hover{color:#FFF200;background:#1C1C1C}' +
    '.rc-t{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#242424;border:1px solid #333;color:#F5F5F5;border-radius:12px;padding:10px 16px;z-index:80;font:400 14px Outfit,sans-serif}' +
    '@keyframes rcf{from{opacity:0}}@keyframes rcu{from{transform:translateY(20px);opacity:0}}';
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const toast = t => { const d = document.createElement('div'); d.className = 'rc-t'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3000); };
  let lista = [];
  async function api(body) {
    const r = await fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ k: clave(), persona: persona() }, body)) }).then(r => r.json());
    if (r.error) throw new Error(r.mensaje || r.error); return r;
  }
  async function cargar() {
    if (!persona() || !clave()) return;
    try { const r = await fetch(C.API_URL + '?' + new URLSearchParams({ action: 'recordatorios', k: clave(), p: persona() }), { cache: 'no-store' }).then(r => r.json()); if (r.ok) { lista = r.lista || []; pintarAlertas(); } } catch (e) {}
    pintarFab();
  }
  let fab;
  function pintarFab() {
    if (!fab) { fab = document.createElement('button'); fab.className = 'rc-fab'; fab.title = 'Mis recordatorios'; fab.setAttribute('aria-label', 'Mis recordatorios'); fab.onclick = verLista; document.body.appendChild(fab); }
    const n = lista.filter(r => r.activo).length; fab.innerHTML = '🔔' + (n ? '<em>' + n + '</em>' : '');
  }
  function pintarAlertas() {
    let box = document.querySelector('.rc-al'); const pend = lista.filter(r => r.pend);
    if (!pend.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'rc-al'; document.body.appendChild(box); }
    box.innerHTML = pend.map(r => '<div><b>🔔</b><span>' + esc(r.texto) + (r.card && r.card.url ? ' · <a href="' + esc(r.card.url) + '" target="_blank" rel="noopener">abrir tarjeta</a>' : '') + '</span><button class="rc-btn" data-visto="' + esc(r.id) + '">Listo</button></div>').join('');
    box.querySelectorAll('[data-visto]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api({ action: 'recVisto', id: b.dataset.visto }); lista.forEach(r => { if (r.id === b.dataset.visto) r.pend = false; }); pintarAlertas(); } catch (e) { toast(e.message); b.disabled = false; } });
  }
  const modal = html => { const o = document.createElement('div'); o.className = 'rc-ov'; o.innerHTML = '<div class="rc-box">' + html + '</div>'; o.onclick = e => { if (e.target === o) o.remove(); }; document.body.appendChild(o); return o; };
  function verLista() {
    if (!persona() || !clave()) return toast('Entrá al panel con tu nombre y la clave');
    const act = lista.filter(r => r.activo);
    const o = modal('<h3>Mis recordatorios</h3><p class="s">Te llegan por Discord, en el panel o en los dos, como elegiste.</p>' +
      (act.length ? act.map(r => '<div class="rc-it"><div>' + esc(r.texto) + '<div class="m">' + esc(r.cuando) + ' · ' + ({ discord: 'por Discord', panel: 'en el panel', ambos: 'Discord y panel' }[r.canal]) + (r.card && r.card.url ? ' · <a href="' + esc(r.card.url) + '" target="_blank" rel="noopener">tarjeta</a>' : '') + '</div></div><button class="rc-x" data-borrar="' + esc(r.id) + '">Borrar</button></div>').join('') : '<p class="s">Todavía no tenés recordatorios.</p>') +
      '<div class="rc-acc"><button class="rc-btn g" data-cerrar>Cerrar</button><button class="rc-btn" data-nuevo>＋ Nuevo recordatorio</button></div>');
    o.querySelector('[data-cerrar]').onclick = () => o.remove();
    o.querySelector('[data-nuevo]').onclick = () => { o.remove(); abrir(null); };
    o.querySelectorAll('[data-borrar]').forEach(b => b.onclick = async () => { if (!confirm('¿Borrar este recordatorio?')) return; b.disabled = true; try { await api({ action: 'recBorrar', id: b.dataset.borrar }); lista = lista.filter(r => r.id !== b.dataset.borrar); pintarFab(); o.remove(); verLista(); } catch (e) { toast(e.message); b.disabled = false; } });
  }
  function abrir(card) {
    if (!persona() || !clave()) return toast('Entrá al panel con tu nombre y la clave');
    const tieneDue = card && card.due;
    const F = { tipo: tieneDue ? 'antes' : 'fecha', canal: 'ambos', dias: [] };
    const o = modal('<h3>' + (card ? 'Recordame esta tarjeta' : 'Nuevo recordatorio') + '</h3>' + (card ? '<p class="s">' + esc(card.n) + (tieneDue ? ' · vence el ' + new Date(card.due).toLocaleDateString('es-AR') : '') + '</p>' : '<p class="s">Algo que no tenés que olvidarte (pedir la carta, llevar el pan a la activación…).</p>') +
      '<label class="l">Qué te recuerdo</label><input type="text" id="rcTxt" maxlength="300" value="' + esc(card ? card.n : '') + '" placeholder="Ej.: pedirle la carta a Maxi">' +
      '<label class="l">Cuándo</label><div class="rc-seg" id="rcTipo">' + (tieneDue ? '<button data-t="antes">Antes del vencimiento</button>' : '') + '<button data-t="fecha">Un día puntual</button><button data-t="semana">Cada semana</button><button data-t="dias">Cada tantos días</button><button data-t="mes">Una vez por mes</button></div>' +
      '<div id="rcOpts"></div>' +
      '<label class="l">Cómo</label><div class="rc-seg" id="rcCanal"><button data-c="ambos">Discord y panel</button><button data-c="discord">Solo Discord</button><button data-c="panel">Solo en el panel</button></div>' +
      '<div class="rc-acc"><button class="rc-btn g" data-cerrar>Cancelar</button><button class="rc-btn" data-ok>Guardar</button></div>');
    const opts = o.querySelector('#rcOpts');
    const hora = '<label class="l">Hora</label><input type="time" id="rcHora" value="09:00">';
    const pintar = () => {
      o.querySelectorAll('#rcTipo button').forEach(b => b.classList.toggle('on', b.dataset.t === F.tipo));
      o.querySelectorAll('#rcCanal button').forEach(b => b.classList.toggle('on', b.dataset.c === F.canal));
      opts.innerHTML = F.tipo === 'antes' ? '<div class="rc-row"><div><label class="l">Cuántos días antes</label><input type="number" id="rcDias" min="0" max="30" value="1"></div><div>' + hora + '</div></div>'
        : F.tipo === 'fecha' ? '<div class="rc-row"><div><label class="l">Día</label><input type="date" id="rcFecha" min="' + hoyS() + '" value="' + hoyS(1) + '"></div><div>' + hora + '</div></div>'
        : F.tipo === 'semana' ? '<label class="l">Qué días</label><div class="rc-seg" id="rcSem">' + [1, 2, 3, 4, 5, 6, 0].map(d => '<button data-d="' + d + '" class="' + (F.dias.indexOf(d) >= 0 ? 'on' : '') + '">' + DIAS[d] + '</button>').join('') + '</div>' + hora
        : F.tipo === 'dias' ? '<div class="rc-row"><div><label class="l">Cada cuántos días</label><input type="number" id="rcN" min="1" max="90" value="7"></div><div><label class="l">Desde</label><input type="date" id="rcFecha" min="' + hoyS() + '" value="' + hoyS(1) + '"></div></div>' + hora
        : '<div class="rc-row"><div><label class="l">Día del mes</label><input type="number" id="rcDia" min="1" max="28" value="1"></div><div>' + hora + '</div></div>';
      o.querySelectorAll('#rcSem button').forEach(b => b.onclick = () => { const d = Number(b.dataset.d), i = F.dias.indexOf(d); i >= 0 ? F.dias.splice(i, 1) : F.dias.push(d); b.classList.toggle('on'); });
    };
    o.querySelectorAll('#rcTipo button').forEach(b => b.onclick = () => { F.tipo = b.dataset.t; pintar(); });
    o.querySelectorAll('#rcCanal button').forEach(b => b.onclick = () => { F.canal = b.dataset.c; pintar(); });
    pintar();
    o.querySelector('[data-cerrar]').onclick = () => o.remove();
    o.querySelector('[data-ok]').onclick = async e => {
      const v = id => (o.querySelector(id) || {}).value;
      const body = { action: 'recCrear', texto: v('#rcTxt'), tipo: F.tipo, canal: F.canal, hora: (v('#rcHora') || '09:00').replace(/^0(\d):/, '$1:'), fecha: v('#rcFecha'), dias: F.tipo === 'semana' ? F.dias : Number(v('#rcDias')), n: Number(v('#rcN')), dia: Number(v('#rcDia')) };
      if (card) Object.assign(body, { cardId: card.id, cardNombre: card.n, cardUrl: card.url, due: card.due || '', marca: card.marca || '' });
      const b = e.target; b.disabled = true; b.textContent = 'Guardando…';
      try { const r = await api(body); lista.push(r.rec); pintarFab(); o.remove(); toast('Listo: te lo recuerdo ' + r.rec.cuando); }
      catch (x) { toast(x.message); b.disabled = false; b.textContent = 'Guardar'; }
    };
  }
  window.Recordatorios = { abrir: abrir, lista: verLista, recargar: cargar };
  const ini = () => { cargar(); setInterval(cargar, 5 * 60 * 1000); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ini) : ini();
})();
