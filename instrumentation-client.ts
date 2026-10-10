/**
 * instrumentation-client — RUM de PostHog por el camino oficial de Next 15.3+.
 *
 * Historia: el provider casero (`components/providers/PostHogProvider.tsx`,
 * mayo-2026) nunca se montó — knip lo destapó el 2026-08-03 — y al montarlo su
 * lazy-load con requestIdleCallback + capture manual no entregaba eventos
 * (verificado contra la API de PostHog: cero $pageview en el proyecto). Este
 * archivo es el patrón que documenta PostHog para App Router: Next lo carga
 * como entry propio antes de la hidratación, y `history_change` captura los
 * pageviews de la SPA sin componente ni hook.
 *
 * Sin NEXT_PUBLIC_POSTHOG_KEY es no-op (dev sin key, previews). La key phc_*
 * es publicable por diseño: viaja al navegador igual que la de GA.
 */
import posthog from "posthog-js";

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    defaults: "2025-05-24",
    // Pageviews automáticos en cada navegación del router (patrón SPA oficial).
    capture_pageview: "history_change",
    capture_pageleave: true,
    // El autocapture de clicks genera volumen que nadie mira todavía; los
    // eventos de negocio ya viajan por la analítica propia del admin.
    autocapture: false,
    /**
     * En dev el "bot" somos nosotros: posthog-js descarta TODO evento si
     * `navigator.webdriver` es true o el UA parece automatizado (HeadlessChrome),
     * así que la verificación con Playwright era imposible por diseño — el init
     * corría, los scripts bajaban y jamás salía un capture (costó 4 rondas de
     * diagnóstico encontrarlo: está en el gate del pageview, `_is_bot()`).
     * En producción el filtro queda ACTIVO, que es para lo que existe.
     */
    opt_out_useragent_filter: process.env.NODE_ENV !== "production",
  });
  // Para poder excluir el tráfico de desarrollo en los insights sin proyectos
  // separados: toda captura de dev viaja etiquetada.
  if (process.env.NODE_ENV !== "production") {
    posthog.register({ environment: "development" });
  }
}
