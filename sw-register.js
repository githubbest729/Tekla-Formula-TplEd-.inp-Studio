/* Registers the service worker and tells the app when a new version is waiting.
 * app.js listens for the "sw-update-available" window event (detail = ServiceWorkerRegistration)
 * and posts {type: 'SKIP_WAITING'} to registration.waiting; this script then reloads the page once. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]';
  if (!secure) return;

  var hadController = !!navigator.serviceWorker.controller;
  var reloading = false;
  var announced = false;

  /* Wait for window load so app.js (a deferred module) has attached its listener. */
  function whenLoaded(fn) {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn, { once: true });
  }

  function announce(reg) {
    if (announced) return;
    announced = true;
    whenLoaded(function () {
      window.dispatchEvent(new CustomEvent('sw-update-available', { detail: reg }));
    });
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js', { scope: './' }).then(function (reg) {
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg);

      reg.addEventListener('updatefound', function () {
        var worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) announce(reg);
        });
      });

      var check = function () { reg.update().catch(function () {}); };
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
    }).catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
  });
})();
