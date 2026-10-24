/**
 * ctp-secciones-csv — Producción, Despacho y Consumos, tal como se están
 * viendo, en CSV.
 *
 * Hermano de `ctp-ingresos-csv`: mismas reglas (separador `;`, coma decimal,
 * fechas date-only en UTC) porque el operador abre los tres archivos en el
 * mismo Excel y no puede tener tres formatos distintos.
 *
 * PURO: arma el string; bajarlo es del componente.
 */
import { celdaCsv } from "./ctp-ingresos-csv";
import type { LineaCtp } from "./ctp-secciones-filtro";
import { unidadOficial } from "./loctp-campos";
import type { FilaConsumo } from "./loctp-consumos";

export type SeccionCsv = "produccion" | "despacho" | "consumos";

/** Lo que la tabla de cada sección muestra, más lo que no entra en pantalla. */
export interface LineaCsv extends LineaCtp {
  lineNo: number;
  speciesScientific: string | null;
  unit: string | null;
  gtfIngreso: string | null;
  gtfNumber: string | null;
  observations: string | null;
  annulledReason: string | null;
}

const fila = (celdas: unknown[]) => celdas.map(celdaCsv).join(";");

const fechaSolo = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
};

const numero = (v: string | number | null, decimales: number): string =>
  v == null || v === "" ? "" : Number(v).toFixed(decimales).replace(".", ",");

/** Sólo las dos secciones que arma `seccionACsv`: Consumos tiene la suya. */
const COLUMNAS: Record<"produccion" | "despacho", string[]> = {
  produccion: [
    "N° línea", "Fecha", "Especie", "Nombre científico", "CITES", "Producto",
    "Consumido (m3)", "Producido", "Unidad", "Rendimiento (%)", "GTF de ingreso",
    "Estado", "Motivo anulación", "Observaciones",
  ],
  despacho: [
    "N° línea", "Fecha", "Especie", "Nombre científico", "CITES", "Producto",
    "Cantidad", "Unidad", "Piezas", "GTF de salida", "Destino",
    "Estado", "Motivo anulación", "Observaciones",
  ],
};

export function seccionACsv(
  seccion: "produccion" | "despacho",
  lineas: LineaCsv[],
  opts: { productoLabel?: (v: string) => string } = {},
): string {
  const prod = (v: string | null) => (v ? (opts.productoLabel?.(v) ?? v) : "");
  const estado = (s: string) => (s === "anulado" ? "Anulado" : "Registrado");

  const filas = lineas.map((l) =>
    seccion === "produccion"
      ? fila([
          l.lineNo,
          fechaSolo(l.entryDate),
          l.speciesCommon ?? "",
          l.speciesScientific ?? "",
          l.cites ? "SÍ" : "No",
          prod(l.productType),
          numero(l.volumeInputM3, 4),
          numero(l.quantity, 4),
          l.unit ?? "",
          numero(l.rendimientoPct, 1),
          l.gtfIngreso ?? "",
          estado(l.status),
          l.annulledReason ?? "",
          l.observations ?? "",
        ])
      : fila([
          l.lineNo,
          fechaSolo(l.entryDate),
          l.speciesCommon ?? "",
          l.speciesScientific ?? "",
          l.cites ? "SÍ" : "No",
          prod(l.productType),
          numero(l.quantity, 4),
          l.unit ?? "",
          l.pieces ?? "",
          l.gtfNumber ?? "",
          l.destino ?? "",
          estado(l.status),
          l.annulledReason ?? "",
          l.observations ?? "",
        ]),
  );

  // El total ignora las anuladas: en el libro no cuentan, y un pie que las
  // sumara no cuadraría con los KPIs de la pantalla de donde salió el archivo.
  const vivas = lineas.filter((l) => l.status === "registrado");
  const totalCant = vivas.reduce((a, l) => a + Number(l.quantity ?? 0), 0);
  const totalCons = vivas.reduce((a, l) => a + Number(l.volumeInputM3 ?? 0), 0);
  const totalPz = vivas.reduce((a, l) => a + (l.pieces ?? 0), 0);

  const pie =
    seccion === "produccion"
      ? fila([
          `TOTAL (${vivas.length} líneas vigentes)`, "", "", "", "", "",
          numero(totalCons, 4), numero(totalCant, 4), "", "", "", "", "", "",
        ])
      : fila([
          `TOTAL (${vivas.length} líneas vigentes)`, "", "", "", "", "",
          numero(totalCant, 4), "", totalPz, "", "", "", "", "",
        ]);

  return [fila(COLUMNAS[seccion]), ...filas, pie].join("\r\n");
}

/**
 * La Sección 2 en CSV, con la numeración del formato oficial en la cabecera.
 *
 * Va acá y no en su propio archivo porque comparte las reglas de las otras dos
 * —separador `;`, coma decimal, fechas UTC— y el operador abre los tres en el
 * mismo Excel. El casillero (10) sale vacío por lo mismo que en pantalla: las
 * trozas no tienen lote, los lotes se arman en producción.
 */
export function consumosACsv(filas: readonly FilaConsumo[]): string {
  const cabecera = [
    "(1) N°", "(2) Fecha de consumo", "(3) Tipo de producto",
    "(4) Nombre común", "(5) Nombre científico", "(6) Código origen/CTP",
    "(7) N° fuente de origen", "(8) Unidad", "(9) Cantidad consumida",
    "(10) N° de lote consumido", "(11) Observaciones", "GTF de ingreso",
  ];
  const cuerpo = filas.map((c) =>
    fila([
      c.nro,
      fechaSolo(c.fecha),
      c.tipoProducto,
      c.especieComun,
      c.especieCientifica,
      c.codigoOrigen,
      c.fuenteOrigen,
      unidadOficial(c.unidad),
      numero(c.cantidad, 4),
      c.lote,
      c.observaciones,
      c.gtf,
    ]),
  );
  const total = filas.reduce((a, c) => a + Number(c.cantidad ?? 0), 0);
  const pie = fila([
    `TOTAL (${filas.length} ${filas.length === 1 ? "consumo" : "consumos"})`,
    "", "", "", "", "", "", "", numero(total, 4), "", "", "",
  ]);
  return [fila(cabecera), ...cuerpo, pie].join("\r\n");
}

/** `produccion-ctp-mayo-2026.csv` — el período va en el nombre. */
export function nombreArchivoSeccion(seccion: SeccionCsv, periodoLabel: string): string {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  return `${seccion}-ctp-${slug(periodoLabel)}`.slice(0, 90).concat(".csv");
}
