"use client";

/**
 * ctp-legajo.ts — varias guías en un solo documento, con su índice.
 *
 * Cuando llega una fiscalización no se pide "la guía": se pide el legajo del
 * mes. Imprimir de a una y abrocharlas a mano es donde se pierde una, y una
 * guía que falta en la carpeta es la que se va a mirar. Esto arma un documento
 * con TODAS las seleccionadas —cada una en su hoja— encabezado por un índice
 * que dice qué tiene que haber adentro: quien recibe la carpeta puede contar.
 *
 * El índice se arma con los datos del LIBRO (folio, volumen, estado), no con lo
 * que dice cada guía: es el libro el que responde por lo que se declaró.
 */

import {
  cabeceraDoc,
  esc,
  notaDoc,
  resumenDoc,
  seccionDoc,
  tituloDoc,
} from "./ctp-documento-print";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export interface RenglonLegajo {
  libroNro: number | null;
  gtfNumber: string;
  entryDate: string;
  providerName: string;
  especie: string;
  volumenM3: string | number;
  piezas: number | null;
  estado: string;
  /** Si el ingreso no trae la ficha de SERFOR, la guía no se puede reproducir. */
  conGuia: boolean;
}

const fecha = (iso: string): string => {
  const s = (iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [a, m, d] = s.split("-");
  return `${d}.${m}.${a}`;
};

const m3 = (v: string | number): number => Number(v) || 0;

/** La portada: qué guías van adentro y cuánto suman. */
export function portadaLegajo(i: {
  titular: string;
  subtitulo?: string;
  renglones: ReadonlyArray<RenglonLegajo>;
  periodo?: string;
  emitidoEl?: string;
}): string {
  const total = i.renglones.reduce((a, r) => a + m3(r.volumenM3), 0);
  const piezas = i.renglones.reduce((a, r) => a + (Number(r.piezas) || 0), 0);
  const guias = new Set(i.renglones.map((r) => r.gtfNumber)).size;
  const sinGuia = i.renglones.filter((r) => !r.conGuia).length;

  const filas = i.renglones
    .map(
      (r, n) => `<tr>
      <td class="c">${n + 1}</td>
      <td class="c">${r.libroNro ?? ""}</td>
      <td class="cod">${esc(r.gtfNumber)}</td>
      <td class="c">${fecha(r.entryDate)}</td>
      <td>${esc(r.providerName)}</td>
      <td>${esc(r.especie)}</td>
      <td class="c">${r.piezas ?? ""}</td>
      <td class="r vol">${fmtM3(m3(r.volumenM3))}</td>
      <td class="c est">${esc(r.estado)}</td>
      <td class="c">${r.conGuia ? "Sí" : "—"}</td>
    </tr>`,
    )
    .join("");

  return `
  ${cabeceraDoc({
    emisor: i.titular,
    meta: [i.subtitulo, i.periodo ? `Período: ${i.periodo}` : "", i.emitidoEl ? `Armado el ${i.emitidoEl}` : ""],
    tipo: "Legajo de guías",
    numero: String(i.renglones.length),
    numeroNota: "Documentos adjuntos",
  })}

  ${tituloDoc("Legajo de guías de ingreso", "Libro de Operaciones del CTP · Índice y documentos adjuntos")}

  ${resumenDoc([
    { k: "Ingresos", v: String(i.renglones.length) },
    { k: "Guías distintas", v: String(guias) },
    { k: "Piezas", v: piezas ? String(piezas) : "" },
    { k: "Volumen total", v: fmtM3(total), u: "m³", tono: "ok" },
    { k: "Sin ficha SERFOR", v: sinGuia ? String(sinGuia) : "", tono: "aviso" },
  ])}

  ${seccionDoc("Índice del legajo", "orden de las hojas que siguen")}
  <table class="lg">
    <thead><tr>
      <th class="w-n">N°</th><th class="w-n">Folio</th><th>N° de guía</th><th class="w-f">Ingreso</th>
      <th>Proveedor / origen</th><th>Especie</th><th class="w-c">Pzas</th>
      <th class="w-v">Volumen m³</th><th class="w-e">Estado</th><th class="w-c">Adjunta</th>
    </tr></thead>
    <tbody>${filas || `<tr><td colspan="10" class="vacio">Sin ingresos seleccionados</td></tr>`}</tbody>
    <tfoot><tr>
      <td colspan="6" class="lbl">Total del legajo</td>
      <td class="c">${piezas || ""}</td>
      <td class="r vol">${fmtM3(total)}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>

  ${notaDoc(
    `<b>Cómo se usa.</b> Las hojas que siguen son las guías del índice, en el mismo orden, cada una con su lista de
     trozas cuando la tiene. La columna «Adjunta» dice si el ingreso trae la ficha de SERFOR: los que dicen «—» están
     en el libro pero su guía no se pudo reproducir, y hay que adjuntar el papel original.` +
      (sinGuia
        ? ` <b>En este legajo hay ${sinGuia} en esa situación.</b>`
        : ""),
  )}

  <div class="doc-pie">
    <span>Legajo de ${i.renglones.length} ingreso(s)</span>
    <span>${fmtM3(total)} m³ · Libro de Operaciones del CTP</span>
  </div>`;
}

export const CSS_LEGAJO = `
  .lg { width:100%; border-collapse:collapse; }
  .lg th, .lg td { border:.6pt solid #9aa5a0; padding:1.2mm 1.5mm; font-size:7.4pt; }
  .lg thead th { background:var(--tinta); color:#fff; border-color:#0d3b20; font-weight:bold;
                 font-size:6.8pt; letter-spacing:.3pt; text-transform:uppercase; text-align:center; }
  .lg tbody tr:nth-child(even) td { background:#f4f8f6; }
  .lg td.c { text-align:center; }
  .lg td.r { text-align:right; }
  .lg td.cod { font-family:"Courier New",Courier,monospace; font-weight:bold; }
  .lg td.vol { font-variant-numeric:tabular-nums; font-weight:bold; }
  .lg td.est { text-transform:capitalize; }
  .lg .w-n { width:10mm; } .lg .w-c { width:11mm; } .lg .w-v { width:20mm; }
  .lg .w-f { width:18mm; } .lg .w-e { width:18mm; }
  .lg .vacio { text-align:center; padding:8mm; color:var(--gris-suave); font-style:italic; }
  .lg tfoot td { background:#e7efea; font-weight:bold; border-color:#7f8f87; }
  .lg tfoot .lbl { text-align:right; text-transform:uppercase; letter-spacing:.4pt; font-size:6.8pt; }
`;
