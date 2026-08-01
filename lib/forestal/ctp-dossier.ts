"use client";

/**
 * ctp-dossier — la carpeta que se le entrega a una fiscalización, en un solo
 * documento.
 *
 * Todo lo que pide OSINFOR/SERFOR ya existía en el módulo, pero **suelto**: el
 * libro por un lado, las existencias por otro, las guías, los anexos 04, el
 * cumplimiento. Cuando cae una inspección hay que juntarlo a mano, y lo que
 * falta se nota. Esto lo arma ordenado, numerado y con índice.
 *
 * La parte de armado es PURA (datos → HTML) para poder testear qué entra en cada
 * sección sin abrir una ventana.
 */

import {
  esc,
  ctpIdentityBlock,
  type CtpReportFicha,
} from "./ctp-print-shared";
import type { FilaConsumo } from "./loctp-consumos";
import type { FilaRetrozado } from "./loctp-apartados";

export interface LineaLibro {
  section: string;
  entryDate: string | Date;
  gtfNumber?: string | null;
  speciesCommon?: string | null;
  productType?: string | null;
  quantity?: number | null;
  unit?: string | null;
  volumeM3?: number | null;
}

export interface SaldoEspecie {
  label: string;
  ingresoM3: number;
  consumidoM3: number;
  saldoM3: number;
}

export interface GuiaEmitida {
  gtfNumber: string;
  gtfDate?: string | Date | null;
  destino?: string | null;
  volumenTotalM3?: number | null;
}

export interface AnexoEmitido {
  numero: string;
  gtf?: string | null;
  totalPiezas?: number | null;
  volumenTotal?: number | null;
}

export interface DatosDossier {
  ficha: CtpReportFicha | null;
  periodoLabel: string;
  /** Score de cumplimiento del período (0-100), si está disponible. */
  score?: number | null;
  ingresos: LineaLibro[];
  produccion: LineaLibro[];
  despachos: LineaLibro[];
  saldos: SaldoEspecie[];
  guias: GuiaEmitida[];
  anexos: AnexoEmitido[];
  /**
   * Sección 2 del formato. `undefined` = no se consultó (la sección no sale);
   * `[]` = se consultó y no hubo. La diferencia importa: una carpeta que dice
   * "sin consumos" cuando en realidad nadie preguntó es una afirmación falsa.
   */
  consumos?: FilaConsumo[];
  /** Apartado 2 del formato (ADR-313). Misma regla que `consumos`. */
  retrozos?: FilaRetrozado[];
  /** Pendientes que quedaron abiertos: se declaran, no se esconden. */
  pendientes: { titulo: string; cantidad: number }[];
  /** Momento de emisión, inyectado para que el armado sea puro y testeable. */
  emitidoEn: Date;
}

/** Una sección del dossier, con su número de orden para el índice. */
export interface SeccionDossier {
  n: number;
  titulo: string;
  /** Cuántos registros contiene: un 0 se declara, no se omite. */ registros: number;
  html: string;
}

const fmtFecha = (d: string | Date | null | undefined): string => {
  if (!d) return "—";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "—";
  // Las fechas del libro son date-only (medianoche UTC): sin timeZone se corren un día.
  return x.toLocaleDateString("es-PE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
};

const num = (n: number | null | undefined, dec = 3): string =>
  n == null ? "—" : Number(n).toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Tabla con encabezados; si no hay filas lo dice en vez de dibujar una tabla vacía. */
function tabla(headers: string[], filas: string[][], vacio: string): string {
  if (filas.length === 0) {
    return `<p class="vacio">${esc(vacio)}</p>`;
  }
  return `<table>
<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
</table>`;
}

function filasLibro(lineas: LineaLibro[]): string[][] {
  return lineas.map((l) => [
    esc(fmtFecha(l.entryDate)),
    esc(l.gtfNumber ?? "—"),
    esc(l.speciesCommon ?? "—"),
    esc(l.productType ?? "—"),
    l.quantity == null ? "—" : `${num(l.quantity, 2)} ${esc(l.unit ?? "")}`,
    num(l.volumeM3),
  ]);
}

const HEAD_LIBRO = ["Fecha", "GTF", "Especie", "Producto", "Cantidad", "Volumen (m³)"];

/**
 * Arma las secciones del dossier en el orden en que se revisan: primero quién es
 * el CTP, después lo que entró, lo que se transformó, lo que salió, y al final
 * los papeles que amparan cada salida.
 */
export function seccionesDossier(d: DatosDossier): SeccionDossier[] {
  const secciones: Omit<SeccionDossier, "n">[] = [
    {
      titulo: "Ingresos de materia prima",
      registros: d.ingresos.length,
      html: tabla(HEAD_LIBRO, filasLibro(d.ingresos), "Sin ingresos registrados en el período."),
    },
    ...(d.retrozos
      ? [
          {
            titulo: "Retrozado en planta (Apartado 2)",
            registros: d.retrozos.length,
            html: tabla(
              ["Fecha", "Troza de origen", "Vol. inicial (m³)", "Pedazo", "Especie", "Ø mayor/menor (cm)", "Largo (m)", "Vol. final (m³)", "Obs."],
              d.retrozos.map((r) => [
                esc(r.fecha ? fmtFecha(r.fecha) : "—"),
                esc(r.codigoOrigen),
                num(r.volumenInicial),
                esc(r.codigoRetrozado),
                esc(r.nombreComun),
                `${r.diametroMayorCm ?? "—"} / ${r.diametroMenorCm ?? "—"}`,
                num(r.longitudM, 2),
                num(r.volumenFinal),
                // El descarte se marca: es volumen de la madre que no es producto,
                // y un volumen que se esfuma sin explicación es lo que se observa.
                r.descarte ? `<strong class="neg">DESCARTE</strong> ${esc(r.observaciones)}` : esc(r.observaciones || "—"),
              ]),
              "Sin retrozado registrado en el período.",
            ),
          },
        ]
      : []),
    ...(d.consumos
      ? [
          {
            titulo: "Consumos (Sección 2)",
            registros: d.consumos.length,
            html: tabla(
              ["Fecha", "GTF de origen", "Especie", "Producto", "Código origen/CTP", "Cantidad", "Consumido en"],
              d.consumos.map((c) => [
                esc(c.fecha ? fmtFecha(c.fecha) : "—"),
                esc(c.gtf),
                esc(c.especieComun),
                esc(c.tipoProducto),
                esc(c.codigoOrigen),
                `${num(c.cantidad)} ${esc(c.unidad === "m3" ? "m³" : c.unidad)}`,
                esc(c.observaciones),
              ]),
              "Sin consumos atribuidos en el período.",
            ),
          },
        ]
      : []),
    {
      titulo: "Producción (transformación)",
      registros: d.produccion.length,
      html: tabla(HEAD_LIBRO, filasLibro(d.produccion), "Sin corridas de producción en el período."),
    },
    {
      titulo: "Despachos (salidas)",
      registros: d.despachos.length,
      html: tabla(HEAD_LIBRO, filasLibro(d.despachos), "Sin despachos en el período."),
    },
    {
      titulo: "Existencias por especie",
      registros: d.saldos.length,
      html: tabla(
        ["Especie", "Ingresó (m³)", "Consumido (m³)", "Saldo (m³)"],
        d.saldos.map((s) => [
          esc(s.label),
          num(s.ingresoM3),
          num(s.consumidoM3),
          // Un saldo negativo es EL hallazgo de una fiscalización: se marca.
          s.saldoM3 < 0 ? `<strong class="neg">${num(s.saldoM3)}</strong>` : num(s.saldoM3),
        ]),
        "Sin movimientos que arrojen saldo.",
      ),
    },
    {
      titulo: "Guías de transporte forestal emitidas",
      registros: d.guias.length,
      html: tabla(
        ["N° GTF", "Fecha", "Destino", "Volumen (m³)"],
        d.guias.map((g) => [esc(g.gtfNumber), esc(fmtFecha(g.gtfDate)), esc(g.destino ?? "—"), num(g.volumenTotalM3)]),
        "Sin guías emitidas en el período.",
      ),
    },
    {
      titulo: "Anexos N° 04 emitidos",
      registros: d.anexos.length,
      html: tabla(
        ["N° Anexo", "GTF que ampara", "Piezas", "Volumen"],
        d.anexos.map((a) => [
          esc(a.numero),
          esc(a.gtf ?? "—"),
          a.totalPiezas == null ? "—" : String(a.totalPiezas),
          num(a.volumenTotal),
        ]),
        "Sin anexos emitidos en el período.",
      ),
    },
  ];

  return secciones.map((s, i) => ({ ...s, n: i + 1 }));
}

/** Portada: quién es el CTP, qué período cubre y cuándo se armó la carpeta. */
export function portadaDossier(d: DatosDossier, secciones: SeccionDossier[]): string {
  const indice = secciones
    .map((s) => `<li><span class="sec-n">${s.n}.</span> ${esc(s.titulo)} <span class="cnt">${s.registros} ${s.registros === 1 ? "registro" : "registros"}</span></li>`)
    .join("");

  const pend =
    d.pendientes.length === 0
      ? `<p class="ok">Sin pendientes abiertos al momento de emitir esta carpeta.</p>`
      : `<ul class="pend">${d.pendientes
          .map((p) => `<li>${esc(p.titulo)}: <strong>${p.cantidad}</strong></li>`)
          .join("")}</ul>`;

  return `
<section class="portada">
  <div class="marca">LO-CTP · SERFOR</div>
  <h1>Carpeta de fiscalización</h1>
  <p class="periodo">${esc(d.periodoLabel)}</p>
  ${ctpIdentityBlock(d.ficha, [
    `<div><span class="k">Emitida</span> ${esc(d.emitidoEn.toLocaleString("es-PE"))}</div>`,
    d.score != null ? `<div><span class="k">Cumplimiento</span> ${d.score}/100</div>` : "",
  ].filter(Boolean))}

  <h2>Contenido</h2>
  <ol class="indice">${indice}</ol>

  <h2>Pendientes declarados</h2>
  ${pend}
  <p class="nota">Esta carpeta se generó desde el Libro de Operaciones del CTP. Los pendientes
  se listan a propósito: declararlos es parte del control, ocultarlos es lo que se sanciona.</p>
</section>`;
}

export const DOSSIER_CSS = `
  .portada{page-break-after:always}
  .marca{font:700 11px system-ui;letter-spacing:.12em;color:#0f5132;text-transform:uppercase}
  .portada h1{font:800 26px system-ui;margin:2px 0 2px}
  .periodo{font:600 14px system-ui;color:#444;margin:0 0 14px}
  h2{font:700 14px system-ui;margin:18px 0 6px;color:#0f5132}
  ol.indice{margin:0;padding-left:18px}
  ol.indice li{font:13px system-ui;margin:3px 0;list-style:none}
  .sec-n{display:inline-block;min-width:20px;font-weight:800;color:#0f5132}
  .cnt{color:#666;font-size:12px}
  ul.pend{margin:0;padding-left:18px;font:13px system-ui}
  .ok{font:600 13px system-ui;color:#0f5132}
  .nota{font:11px system-ui;color:#666;margin-top:12px}
  .seccion{page-break-before:always}
  .seccion h2{border-bottom:2px solid #0f5132;padding-bottom:4px}
  .vacio{font:italic 12px system-ui;color:#666;padding:8px 0}
  .neg{color:#b42318}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th{background:#eef4f0;text-align:left;font:700 11px system-ui;padding:5px 6px;border:1px solid #cfd8d2}
  td{font:12px system-ui;padding:4px 6px;border:1px solid #e2e8e4}
`;

/** Documento completo: portada + índice + una sección por bloque. */
export function armarDossier(d: DatosDossier): string {
  const secciones = seccionesDossier(d);
  const cuerpo = secciones
    .map(
      (s) => `<section class="seccion">
  <h2>${s.n}. ${esc(s.titulo)} <span class="cnt">(${s.registros})</span></h2>
  ${s.html}
</section>`,
    )
    .join("");
  return portadaDossier(d, secciones) + cuerpo;
}
