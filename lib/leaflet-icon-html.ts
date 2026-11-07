/**
 * leafletIconSvg — convierte un ícono del DS (`@buleje/design-system/icons`)
 * en el string SVG que necesitan los `L.divIcon({ html })` / popups de
 * Leaflet (LiveMap, CtpEudrMap): esos markers son HTML crudo, no JSX, así
 * que no se puede poner un componente React directo ahí.
 *
 * Usa `react-dom/server` (condición "browser" → server.browser.js, sin
 * dependencias de Node) para que el mismo ícono Lucide que usa el resto del
 * panel también aparezca en el mapa — antes esos markers usaban emoji
 * (🏍️🚗🏠📞⏱📏), que se dibuja distinto por SO/navegador.
 *
 * `color` acepta cualquier valor CSS válido en un `stroke` de SVG
 * (`currentColor`, `#fff`, etc.) — NO variables `var(--token)`: el SVG se
 * serializa a texto antes de insertarse en el DOM, así que no hay cascada
 * CSS que resuelva la variable en ese momento.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LucideIcon } from "@buleje/design-system/icons";

export function leafletIconSvg(
  Icon: LucideIcon,
  opts: { size?: number; color?: string; strokeWidth?: number } = {},
): string {
  return renderToStaticMarkup(
    createElement(Icon, {
      size: opts.size ?? 18,
      color: opts.color ?? "currentColor",
      strokeWidth: opts.strokeWidth ?? 2.25,
    }),
  );
}
