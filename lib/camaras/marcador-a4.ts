/**
 * La hoja A4 del marcador de troza y la hoja de PRUEBA de distancia
 * (ADR-480, 2026-10-08). PURO: arma HTML + CSS para `openCtpReport`.
 *
 * Medidas (contrato K3 §1): un 4×4 tiene 6 celdas por lado y se lee con ≥3 px
 * por celda (≥4 con el desenfoque del H.265). El cuadrado negro va de 180 mm
 * (celda de 30 mm) con 15 mm de blanco alrededor: es lo más grande que entra
 * en un A4 dejando el blanco que el lector necesita para encontrar el borde.
 * En HD eso da ~3,2 px por celda a 5 m (justo) y ~5,4 a 3 m; a 8 m no alcanza
 * y hace falta A3 o la cámara más cerca: lo dice la prueba de Brandon.
 *
 * Todo en negro puro sobre blanco: la láser y la térmica no imprimen gris y el
 * lector no lo tolera.
 */
import { esc } from "@/lib/forestal/ctp-print-shared";
import { RANGO_PRUEBA, svgMarcador } from "./marcadores";

/** Lado del cuadrado negro de la hoja de troza (mm). */
export const LADO_MARCADOR_A4_MM = 180;

export interface MarcadorParaHoja {
  marcador: number;
  codigo: string;
  especie: string | null;
  /** «0,532 m³» ya formateado (o `null`). */
  volumen: string | null;
  /** El QR chico (SVG) con el enlace a la ficha de la troza. */
  qrSvg: string;
}

export function cssMarcadorA4(): string {
  return `
    @page { size: A4; margin: 0; }
    body { max-width: none; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; color: #000; background: #fff; }
    @media screen { body { background: #e7e9e8; padding: 12px; } .print-bar { background: #e7e9e8; } }
    .hoja { width: 210mm; height: 297mm; box-sizing: border-box; padding: 15mm; background: #fff; color: #000;
            display: flex; flex-direction: column; align-items: center; font-family: Arial, "Segoe UI", sans-serif;
            page-break-after: always; break-after: page; overflow: hidden; }
    .hoja:last-child { page-break-after: auto; break-after: auto; }
    @media screen { .hoja { margin: 0 auto 12px; outline: 1px dashed #9aa5a0; } }
    .mk svg { display: block; width: 100%; height: 100%; }
    .pie { width: 100%; display: flex; align-items: center; gap: 8mm; margin-top: 9mm; }
    .txt { flex: 1; min-width: 0; }
    .cod { font-weight: 800; line-height: 1; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; }
    .det { font-size: 16pt; font-weight: 700; margin-top: 3mm; }
    .num { font: 700 12pt "Courier New", monospace; margin-top: 2mm; }
    .qr { width: 26mm; height: 26mm; flex-shrink: 0; }
    .qr svg { display: block; width: 100%; height: 100%; }
    .pasos { width: 100%; margin-top: 6mm; font-size: 11pt; line-height: 1.35; }
    .pasos ol { margin: 0; padding-left: 6mm; }
  `;
}

/** El código grande: «12A-0001» entra en una línea de 120 mm (0,64 em por carácter). */
function tamanoCodigo(codigo: string): number {
  const largo = Math.max(1, [...codigo].length);
  return Math.max(28, Math.min(96, Math.floor(120 / (largo * 0.64 * 0.3528))));
}

export function htmlHojaMarcador(m: MarcadorParaHoja): string {
  const detalle = [m.especie, m.volumen].filter(Boolean).join(" · ");
  return `<section class="hoja">
    <div class="mk" style="width:${LADO_MARCADOR_A4_MM}mm;height:${LADO_MARCADOR_A4_MM}mm">${svgMarcador(m.marcador)}</div>
    <div class="pie">
      <div class="txt">
        <div class="cod" style="font-size:${tamanoCodigo(m.codigo)}pt">${esc(m.codigo)}</div>
        ${detalle ? `<div class="det">${esc(detalle)}</div>` : ""}
        <div class="num">Marcador ${m.marcador} · pégalo en la testa, mirando a la cámara</div>
      </div>
      <div class="qr">${m.qrSvg}</div>
    </div>
  </section>`;
}

/** Las tres hojas de prueba: el mismo marcador de troza (180 mm) y dos más chicos, para ver dónde deja de leer. */
export const HOJAS_PRUEBA = [
  { marcador: RANGO_PRUEBA.desde, ladoMm: 180 },
  { marcador: RANGO_PRUEBA.desde + 1, ladoMm: 120 },
  { marcador: RANGO_PRUEBA.desde + 2, ladoMm: 80 },
] as const;

/**
 * La hoja de prueba de distancia: Brandon la pega a 3, 5 y 8 m de la cámara
 * del patio y toca «Contar ahora». Los ids 245-247 nunca son de una troza.
 */
export function htmlHojasDePrueba(): string {
  return HOJAS_PRUEBA.map(
    (h, i) => `<section class="hoja">
    <div class="mk" style="width:${h.ladoMm}mm;height:${h.ladoMm}mm">${svgMarcador(h.marcador)}</div>
    <div class="pie">
      <div class="txt">
        <div class="cod" style="font-size:44pt">PRUEBA ${h.marcador}</div>
        <div class="det">Cuadrado de ${h.ladoMm / 10} cm${h.ladoMm === 180 ? " (el de las trozas)" : ""}</div>
      </div>
    </div>
    ${
      i === 0
        ? `<div class="pasos"><ol>
      <li>Imprime en A4 al 100 % (sin «ajustar a la página») y mide el cuadrado negro: tiene que dar 18 cm.</li>
      <li>Pega las tres hojas en una troza o una tabla, de frente a la cámara «Patio de trozas», a 3 m.</li>
      <li>En el panel: Cámaras › Hoy en el patio › Trozas a la vista › «Contar ahora». Anota qué números leyó y sus px por celda.</li>
      <li>Repite a 5 m y a 8 m. Si a 8 m no lee la de 18 cm, hace falta A3 o poner la cámara más cerca de la pila.</li>
    </ol></div>`
        : ""
    }
  </section>`,
  ).join("");
}
