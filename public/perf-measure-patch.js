/**
 * perf-measure-patch.js
 *
 * Workaround para el bug del runtime turbopack RSC (Next 16 dev mode):
 *   "Failed to execute 'measure' on 'Performance':
 *    'StoreDetailPage [Prerender]' cannot have a negative time stamp."
 *
 * Causa raíz (framework, no nuestra app): `flushComponentPerformance` en
 * `react-server-dom-turbopack-client.browser.development.js` calcula
 * timestamps relativos a markers de RSC. Cuando un componente con
 * `"use cache"` resuelve antes que su parent marker, el offset queda
 * negativo y `performance.measure()` lanza una TypeError no atrapada,
 * ensuciando la consola y rompiendo el fallthrough del render.
 *
 * Mitigación: parchear `performance.measure` para clamp `start` y `duration`
 * a 0 cuando vengan negativos. Solo aplica en dev (NO afecta producción —
 * en prod no se cargan los markers RSC del runtime turbopack).
 *
 * Aplicado parse-time, antes de cualquier import de React, vía <script src>.
 */
(function () {
  if (typeof performance === "undefined" || !performance.measure) return;
  var origMeasure = performance.measure.bind(performance);

  performance.measure = function (name, startOrOptions, endMark) {
    try {
      // API moderno: measure(name, { start, duration, end, detail })
      if (typeof startOrOptions === "object" && startOrOptions !== null) {
        var opts = Object.assign({}, startOrOptions);
        if (typeof opts.start === "number" && opts.start < 0) opts.start = 0;
        if (typeof opts.duration === "number" && opts.duration < 0) opts.duration = 0;
        if (typeof opts.end === "number" && opts.end < 0) opts.end = 0;
        return origMeasure(name, opts);
      }
      // API legacy: measure(name, startMark, endMark)
      // No se puede inspeccionar fácilmente — delegamos.
      return origMeasure(name, startOrOptions, endMark);
    } catch (err) {
      // Silenciar el "negative time stamp" — bug de framework, no romper
      // el render del cliente.
      if (
        err &&
        typeof err.message === "string" &&
        err.message.indexOf("negative time stamp") !== -1
      ) {
        return undefined;
      }
      throw err;
    }
  };
})();
