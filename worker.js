// Puente entre el Panel Ideamia (Apps Script) y servicios que no dejan entrar a los servidores de Google.
// 1) Discord: lee canales y mensajes con el token del bot (secreto DISCORD_TOKEN). El panel se identifica con CLAVE.
// 2) Trello: sirve imágenes y videos adjuntos a tarjetas con un link firmado por el panel (HMAC con CLAVE, vence a las 6 h),
//    usando las claves de Trello guardadas acá (secretos TRELLO_KEY y TRELLO_TOKEN). Así Ivo ve los archivos sin abrir Trello.
// Solo lectura. Secretos: CLAVE, DISCORD_TOKEN, TRELLO_KEY, TRELLO_TOKEN.
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export default {
  async fetch(req, env) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('solo lectura', { status: 405 });
    const u = new URL(req.url);

    // --- adjuntos de Trello: /trello/att/<tarjeta>/<adjunto>/<vence>/<firma>?n=<nombre del archivo> ---
    const m = /^\/trello\/att\/([a-f0-9]{24})\/([a-f0-9]{24})\/(\d+)\/([A-Za-z0-9_-]+)$/.exec(u.pathname);
    if (m) {
      const [, card, att, exp, sig] = m;
      if (!env.CLAVE || !env.TRELLO_KEY || !env.TRELLO_TOKEN) return new Response('faltan secretos en el Worker', { status: 500 });
      if (Number(exp) < Date.now() / 1000) return new Response('link vencido: volvé a abrir la pieza en el panel', { status: 403 });
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.CLAVE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const esperada = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(card + '|' + att + '|' + exp)));
      if (esperada !== sig) return new Response('firma incorrecta', { status: 403 });
      const nombre = (u.searchParams.get('n') || 'archivo').replace(/[\/\\?#]/g, '');
      const h = { Authorization: 'OAuth oauth_consumer_key="' + env.TRELLO_KEY + '", oauth_token="' + env.TRELLO_TOKEN + '"' };
      const range = req.headers.get('range'); if (range) h.Range = range; // para que el video se pueda adelantar
      const r = await fetch('https://api.trello.com/1/cards/' + card + '/attachments/' + att + '/download/' + encodeURIComponent(nombre), { headers: h });
      const out = new Headers();
      ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'].forEach(k => { const v = r.headers.get(k); if (v) out.set(k, v); });
      out.set('cache-control', 'private, max-age=3600');
      out.set('access-control-allow-origin', '*');
      return new Response(r.body, { status: r.status, headers: out });
    }

    // --- Discord (solo rutas de lectura de la API) ---
    if (!env.CLAVE || req.headers.get('x-clave') !== env.CLAVE) return new Response('clave incorrecta', { status: 403 });
    if (!/^\/api\/v10\/(guilds|channels)\//.test(u.pathname)) return new Response('ruta no permitida', { status: 400 });
    const r = await fetch('https://discord.com' + u.pathname + u.search, {
      headers: { Authorization: 'Bot ' + env.DISCORD_TOKEN, 'User-Agent': 'DiscordBot (https://ideamiacontacto-lab.github.io/panel-ideamia, 1.0)' }
    });
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } });
  }
};
