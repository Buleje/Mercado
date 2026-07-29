/**
 * ctp-secciones-csv — Producción y Despacho, tal como se están viendo, en CSV.
 *
 * Hermano de `ctp-ingresos-csv`: mismas reglas (separador `;`, coma decimal,
 * fechas date-only en UTC) porque el operador abre los tres archivos en el
 * mismo Excel y no puede tener tres formatos distintos.
 *
 * PURO: arma el string; bajarlo es del componente.
 */
import { celdaCsv } from "./ctp-ingresos-csv";
import type { LineaCtp } from "./ctp-secciones-filtro";

export type SeccionCsv = "produccion" | "despacho";

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

const COLUMNAS: Record<SeccionCsv, string[]> = {
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
  seccion: SeccionCsv,
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
