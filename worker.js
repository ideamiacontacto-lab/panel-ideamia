// Puente entre el Panel Ideamia (Apps Script) y Discord.
// Discord bloquea los pedidos que salen de los servidores de Google; este Worker de Cloudflare los hace en su lugar.
// Solo lee (GET) y solo rutas de la API de Discord. El token del bot vive acá como secreto (DISCORD_TOKEN),
// y el panel se identifica con una clave compartida (CLAVE) que también se carga en el Sheet.
export default {
  async fetch(req, env) {
    if (req.method !== 'GET') return new Response('solo lectura', { status: 405 });
    if (!env.CLAVE || req.headers.get('x-clave') !== env.CLAVE) return new Response('clave incorrecta', { status: 403 });
    const u = new URL(req.url);
    if (!/^\/api\/v10\/(guilds|channels)\//.test(u.pathname)) return new Response('ruta no permitida', { status: 400 });
    const r = await fetch('https://discord.com' + u.pathname + u.search, {
      headers: { Authorization: 'Bot ' + env.DISCORD_TOKEN, 'User-Agent': 'DiscordBot (https://ideamiacontacto-lab.github.io/panel-ideamia, 1.0)' }
    });
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } });
  }
};
