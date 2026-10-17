/**
 * Tests — `marcoDeFixed` de ActionMenu: contra qué caja se resuelve un
 * `position: fixed` portaleado dentro de un diálogo.
 *
 * Medido en el navegador (2026-09-14): el `AdminModal` centra con
 * `sm:-translate-x-1/2 sm:-translate-y-1/2`. Tailwind **v4** compila esas
 * clases a la propiedad `translate` (no a `transform`) — mirar sólo
 * `transform` decía "sin marco" para el propio diálogo, y el menú de fila se
 * ubicaba con el alto del VIEWPORT en vez del diálogo, empujándolo fuera por
 * abajo (panel `top 587 → bottom 888` contra un diálogo que terminaba en 759).
 */

import { describe, expect, it } from "vitest";
import { marcoDeFixed } from "@/components/admin/shared/action-menu";

describe("marcoDeFixed", () => {
  it("sin ninguna propiedad de transformación, no hay marco (viewport)", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(marcoDeFixed(el)).toBeNull();
  });

  it("con `transform` (legacy), el elemento SÍ es el marco", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.style.transform = "translate(-50%, -50%)";
    expect(marcoDeFixed(el)).not.toBeNull();
  });

  it("con `translate` (Tailwind v4 — el caso real de AdminModal), el elemento SÍ es el marco", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.style.translate = "-50% -50%";
    expect(marcoDeFixed(el)).not.toBeNull();
  });

  it("`null` (sin ancestro) sigue devolviendo null", () => {
    expect(marcoDeFixed(null)).toBeNull();
  });
});
