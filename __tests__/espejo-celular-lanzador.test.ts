import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANZADOR_ESPEJO_CMD, nombreFotoEspejo, TITULO_VENTANA_ESPEJO } from "@/lib/camaras/espejo-celular";

/**
 * El lanzador del Espejo del celular vive dos veces: en el repo
 * (`scripts/espejo-celular.cmd`) y en el botón «Bajar el lanzador» del panel.
 * Si se separan, el que baja Brandon abre scrcpy con otro título y el panel
 * le pide elegir una ventana que no existe.
 */
describe("lanzador del espejo del celular", () => {
  const enDisco = readFileSync(join(__dirname, "..", "scripts", "espejo-celular.cmd"), "utf8");

  it("el del repo y el que baja el panel dicen lo mismo", () => {
    const sinCr = (t: string) => t.replace(/\r\n/g, "\n");
    expect(sinCr(enDisco)).toBe(sinCr(LANZADOR_ESPEJO_CMD));
  });

  it("baja con CRLF y abre scrcpy con el título fijo", () => {
    expect(LANZADOR_ESPEJO_CMD.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r"))).toBe(true);
    expect(LANZADOR_ESPEJO_CMD).toContain(`--window-title "${TITULO_VENTANA_ESPEJO}"`);
  });

  it("sin acentos: cmd.exe lee el archivo en la página de códigos de la consola", () => {
    expect(/[^\x00-\x7f]/.test(LANZADOR_ESPEJO_CMD)).toBe(false);
  });

  it("nombre de la foto ordenable", () => {
    expect(nombreFotoEspejo(new Date(2026, 9, 24, 9, 5, 7))).toBe("celular-2026-10-24-09-05-07.png");
  });
});
