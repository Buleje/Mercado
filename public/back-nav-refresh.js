// Back-nav refresh — recarga la página en cualquier back/forward del browser.
// Se carga ANTES que React/Next, registra listeners en parse-time, y sobrevive
// a tipos especiales de navegación (bfcache, back_forward) sin depender de
// useEffect (que tiene timing issues post-reload).
//
// Cubre 3 escenarios:
//   1) popstate          — back/forward estándar
//   2) pageshow persisted — bfcache restoration (Safari, iOS, Firefox)
//   3) navType=back_forward al cargar — el documento mismo vino de back-nav
(function () {
  if (typeof window === "undefined") return;
  var reload = function () {
    try {
      window.location.reload();
    } catch (_) {}
  };
  window.addEventListener("popstate", reload);
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) reload();
  });
  try {
    var nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "back_forward") reload();
  } catch (_) {}
})();
