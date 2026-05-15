// Back-nav refresh — recarga la página en cualquier back/forward del browser.
// Se carga ANTES que React/Next, registra listeners en parse-time, y sobrevive
// a tipos especiales de navegación (bfcache, back_forward) sin depender de
// useEffect (que tiene timing issues post-reload).
//
// Cubre 3 escenarios:
//   1) popstate          — back/forward estándar (solo bfcache hit)
//   2) pageshow persisted — bfcache restoration (Safari, iOS, Firefox)
//   3) navType=back_forward al cargar — el documento mismo vino de back-nav
//
// Brandon mayo 15 v2: deshabilitado el reload en `popstate` puro (mismo doc)
// porque en Next 16 dev (Turbopack) dispara ERR_INCOMPLETE_CHUNKED_ENCODING
// y ERR_EMPTY_RESPONSE al cargar chunks invalidados por HMR mientras se
// recarga. Mantengo solo:
//   - pageshow + persisted=true  (bfcache real — siempre necesita reload)
//   - navType=back_forward       (visit que vino de back-nav del browser)
// El popstate normal lo maneja Next.js con router cache (no necesita reload).
(function () {
  if (typeof window === "undefined") return;
  var isDev =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname.endsWith(".local");
  var reload = function () {
    try {
      window.location.reload();
    } catch (_) {}
  };
  // bfcache: SIEMPRE recarga (en dev y prod) — el bfcache hit deja JS frozen
  // y el state del cliente queda desincronizado de la cookie/cart.
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) reload();
  });
  // navType back_forward al cargar: en prod sí recarga; en dev evita los
  // chunks errors de Turbopack.
  if (!isDev) {
    try {
      var nav = performance.getEntriesByType("navigation")[0];
      if (nav && nav.type === "back_forward") reload();
    } catch (_) {}
  }
})();
