/**
 * ctp-ingresos-csv — la vista de Ingresos, tal como se está viendo, en un CSV.
 *
 * El Excel oficial del libro (ctp-export) es OTRA cosa: sale con el formato de
 * SERFOR y siempre el período completo. Esto es la herramienta del día a día —
 * "mandame lo de Maderera X de mayo" — y por eso respeta el filtro y el orden
 * que el operador ya eligió en pantalla.
 *
 * PURO: arma el string. Bajarlo es del componente, así el contenido (que es lo
 * que alguien va a leer en Excel) se puede testear sin navegador.
 */
import type { WoodEntry } from "@/components/admin/forestal/ctp-shared";

/**
 * Una celda CSV segura. La COMA no entrecomilla a propósito: el separador es
 * `;`, y como los decimales van con coma (13,6500 en es-PE) escaparlos los
 * dejaba entre comillas — Excel los leía como texto y no se podían sumar.
 */
export function celdaCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Separador `;`: es el que espera Excel con configuración regional es-PE —
 *  con `,` las columnas caen todas en la A y el operador ve una sola tira. */
const fila = (celdas: unknown[]) => celdas.map(celdaCsv).join(";");

const COLUMNAS = [
  "Fecha operación",
  "GTF",
  "Fecha GTF",
  "Serie GTF",
  "Proveedor",
  "Documento",
  "Origen",
  "Código origen",
  "Región",
  "Distrito",
  "Especie",
  "Nombre científico",
  "CITES",
  "Producto",
  "Volumen (m3)",
  "Piezas",
  "Largo prom. (m)",
  "Diámetro prom. (cm)",
  "Humedad (%)",
  "Estado",
  "Validado por",
  "Registrado por",
  "Registrado el",
  "Motivo rechazo/anulación",
  "Observaciones",
] as const;

/** Fecha date-only (entryDate/gtfDate) en UTC: en hora Lima se corrían un día. */
const fechaSolo = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
};

/** `createdAt` sí es un instante real: va en hora local de la planta. */
const fechaHora = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
};

/** Decimal como lo lee Excel es-PE: coma decimal, sin separador de miles. */
const numero = (v: string | number | null, decimales: number): string =>
  v == null || v === "" ? "" : Number(v).toFixed(decimales).replace(".", ",");

export interface IngresosCsvOpts {
  /** Etiquetas legibles (Concesión forestal, Rolliza…) — las trae la vista. */
  origenLabel?: (v: string) => string;
  productoLabel?: (v: string) => string;
  estadoLabel?: (v: string) => string;
}

export function ingresosACsv(entries: WoodEntry[], opts: IngresosCsvOpts = {}): string {
  const org = opts.origenLabel ?? ((v: string) => v);
  const prod = opts.productoLabel ?? ((v: string) => v);
  const est = opts.estadoLabel ?? ((v: string) => v);

  const filas = entries.map((e) =>
    fila([
      fechaSolo(e.entryDate),
      e.gtfNumber,
      fechaSolo(e.gtfDate),
      e.gtfSeries ?? "",
      e.providerName,
      [e.providerDocumentType, e.providerDocument].filter(Boolean).join(" "),
      org(e.originType),
      e.originCode ?? "",
      e.originRegion ?? "",
      e.originDistrict ?? "",
      e.speciesCommonName,
      e.speciesScientificName ?? "",
      e.speciesCites ? "SÍ" : "No",
      prod(e.productType),
      numero(e.volumeM3, 4),
      e.pieces,
      numero(e.avgLengthM, 2),
      numero(e.avgDiameterCm, 1),
      numero(e.humidityPct, 1),
      est(e.status),
      e.validatedBy ?? "",
      e.createdBy,
      fechaHora(e.createdAt),
      e.rejectionReason ?? "",
      e.notes ?? "",
    ]),
  );

  // Total al pie: quien abre el CSV para conciliar volúmenes lo primero que
  // hace es sumar la columna — mejor que el archivo ya lo diga.
  const totalVol = entries.reduce((s, e) => s + Number(e.volumeM3 || 0), 0);
  const totalPz = entries.reduce((s, e) => s + (e.pieces || 0), 0);
  const pie = fila([
    `TOTAL (${entries.length} ingresos)`,
    ...Array(13).fill(""),
    numero(totalVol, 4),
    totalPz,
    ...Array(9).fill(""),
  ]);

  return [fila([...COLUMNAS]), ...filas, pie].join("\r\n");
}

/** Nombre de archivo con el período y el filtro adentro: en la carpeta de
 *  Descargas, tres CSV "ingresos.csv" no se distinguen. */
export function nombreArchivoIngresos(periodoLabel: string, sufijo?: string): string {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  return ["ingresos-ctp", slug(periodoLabel), sufijo ? slug(sufijo) : ""]
    .filter(Boolean)
    .join("-")
    .slice(0, 90)
    .concat(".csv");
}
