/* Instalación en el celular: registra el service worker y, si el panel se está viendo desde el navegador del celu,
   ofrece instalarlo (una sola vez; si lo cierran no vuelve a aparecer). */
(function () {
  if ('serviceWorker' in navigator && location.protocol === 'https:') window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  var instalada = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  var visto = false; try { visto = localStorage.getItem('pi:instalar') === 'no'; } catch (e) {}
  if (instalada || visto || !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
  var ios = /iPhone|iPad|iPod/i.test(navigator.userAgent), evento = null;
  function cerrar(b) { try { localStorage.setItem('pi:instalar', 'no'); } catch (e) {} b.remove(); }
  function mostrar() {
    if (document.getElementById('pwaBar')) return;
    var b = document.createElement('div'); b.id = 'pwaBar'; b.className = 'pwa-bar';
    b.innerHTML = '<div><b>Instalá el panel en tu celu</b><span>' + (ios
      ? 'En Safari tocá Compartir y después "Agregar a inicio". Queda como una app, con su ícono.'
      : 'Queda como una app, con su ícono, y abre más rápido.') + '</span></div>' +
      (ios ? '' : '<button class="btn y" id="pwaSi">Instalar</button>') + '<button class="pwa-x" id="pwaNo" aria-label="Cerrar este aviso">×</button>';
    document.body.appendChild(b);
    document.getElementById('pwaNo').onclick = function () { cerrar(b); };
    var si = document.getElementById('pwaSi');
    if (si) si.onclick = function () { if (!evento) return; evento.prompt(); evento.userChoice.then(function () { cerrar(b); }); };
  }
  if (ios) setTimeout(mostrar, 4000);
  else window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); evento = e; mostrar(); });
  window.addEventListener('appinstalled', function () { var b = document.getElementById('pwaBar'); if (b) cerrar(b); });
})();
