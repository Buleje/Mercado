/**
 * PDF vectorial de prueba desde la v9 (QA de contornos, ADR-465): la imagen de
 * fondo + los rectángulos de ZONAS_V9 dibujados de verdad (borde, sin relleno)
 * + el círculo de cada número (curvas) + el borde del terreno y la caja de la
 * leyenda + los textos de la lámina como texto invisible. Para el QA de la
 * importación (qa-capturas, paso «subir»); el test usa el mismo fixture.
 *   npx tsx scripts/qa-croquis-pdf-v9.ts <salida.pdf>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { MARCAS_V9, V9, ZONAS_V9, textosV9 } from "../__tests__/fixtures/croquis-v9-pdf";

async function main() {
  const salida = process.argv[2] ?? "croquis-v9-vectorial.pdf";
  const doc = await PDFDocument.create();
  const page = doc.addPage([V9.ancho, V9.alto]);
  const Y = (py: number) => V9.alto - py;
  const png = await doc.embedPng(readFileSync("docs/forestal/croquis-blas-v9.png"));
  page.drawImage(png, { x: 0, y: 0, width: V9.ancho, height: V9.alto });
  const azul = rgb(0.05, 0.3, 0.6);
  const caja = (x0: number, y0: number, x1: number, y1: number, ancho = 1.2, dash?: number[]) =>
    page.drawRectangle({ x: x0, y: Y(y1), width: x1 - x0, height: y1 - y0, borderColor: azul, borderWidth: ancho, borderDashArray: dash });
  caja(139, 110, 910, 795, 1, [6, 3]);
  caja(1000, 55, 1275, 550, 0.8);
  for (const [, , x0, y0, x1, y1] of ZONAS_V9) caja(x0, y0, x1, y1);
  for (const [, px, py] of MARCAS_V9) page.drawCircle({ x: px, y: Y(py), size: 9, borderColor: azul, borderWidth: 0.6 });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of textosV9()) {
    // Helvetica estándar solo trae Latin-1: «→» y «–» van como guion.
    const str = t.str.replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "-");
    const w = font.widthOfTextAtSize(str, t.h);
    if (t.angulo) {
      page.drawText(str, { x: t.px + 0.36 * t.h, y: Y(t.py) - w / 2, size: t.h, font, opacity: 0, rotate: degrees(90) });
      continue;
    }
    const x = t.alinea === "izq" ? t.px : t.alinea === "centro" ? t.px - w / 2 : t.px - w;
    page.drawText(str, { x, y: Y(t.py + 0.36 * t.h), size: t.h, font, opacity: 0 });
  }
  writeFileSync(salida, await doc.save());
  console.log("ok", salida, ZONAS_V9.length, "rectángulos", MARCAS_V9.length, "círculos");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
