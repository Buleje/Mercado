/**
 * Libros para el contador — piezas comunes (puras: sin base, sin red, sin React).
 *
 * Qué es y qué NO es: cada libro sigue las columnas de la «información mínima»
 * de los formatos 14.1, 8.1 y 13.1 (RS 234-2006/SUNAT, art. 13; formatos
 * impresos 234_formato141/81/131.xls de sunat.gob.pe). NO es el TXT del PLE ni
 * el del SIRE: esas estructuras tienen reglas por campo que este carril no
 * confirmó, así que el archivo se llama «de trabajo» y lo dice adentro.
 *
 * Regla de la casa: lo que el sistema no guarda va VACÍO (null) y la razón va
 * en `notas`; nunca se rellena con un supuesto.
 */
import { celdaSegura } from "@/extensiones/cierre-para-contador/filas";
import { diaDelGasto } from "@/lib/gastos/lista-gastos";
import { limaDateKey } from "@/lib/utils";

export type LibroId = "ventas" | "compras" | "kardex";
export type ValorCelda = string | number | null;
export type FilaLibro = Record<string, ValorCelda>;

export interface ColumnaLibro {
  clave: string;
  rotulo: string;
  /** N° de columna del formato impreso de SUNAT; sin número = dato del sistema (va al final). */
  numero?: number;
  /** Monto en soles (2 decimales); `false` = texto o cantidad. */
  soles?: boolean;
}

export interface LibroContador {
  libro: LibroId;
  formato: "14.1" | "8.1" | "13.1";
  titulo: string;
  periodo: string;
  columnas: ColumnaLibro[];
  filas: FilaLibro[];
  /** Sumas por clave de columna (en soles), calculadas en el servidor. */
  totales: Record<string, number>;
  notas: string[];
}

export const TITULO_FORMATO: Record<LibroId, { formato: LibroContador["formato"]; titulo: string }> = {
  ventas: { formato: "14.1", titulo: "Registro de Ventas e Ingresos" },
  compras: { formato: "8.1", titulo: "Registro de Compras" },
  kardex: { formato: "13.1", titulo: "Registro de Inventario Permanente Valorizado" },
};

export const AVISO_DE_TRABAJO =
  "Documento de trabajo con las columnas del formato SUNAT. No es el archivo TXT del PLE ni del SIRE: " +
  "sirve para que tu contador lo cruce con la propuesta del SIRE o lo pase a su sistema.";

// ── Período ────────────────────────────────────────────────────────────────

export interface RangoPeriodo {
  periodo: string;
  /** 00:00 de Lima del día 1 (inclusive). Para ventas, pedidos y movimientos. */
  desde: Date;
  /** 00:00 de Lima del día 1 del mes siguiente (exclusivo). */
  hasta: Date;
  /**
   * 00:00 UTC del día 1 y del día 1 siguiente: el gasto sin hora se guarda como medianoche
   * UTC. Con `desde`/`hasta` arman el filtro de gastos por día de Lima (ver `LibrosContadorDB`).
   */
  desdeDia: Date;
  hastaDia: Date;
}

const PERIODO = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function rangoDelPeriodo(periodo: string): RangoPeriodo | null {
  const m = PERIODO.exec(periodo);
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const sig = mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, "0")}`;
  return {
    periodo,
    desde: new Date(`${periodo}-01T05:00:00.000Z`),
    hasta: new Date(`${sig}-01T05:00:00.000Z`),
    desdeDia: new Date(`${periodo}-01T00:00:00.000Z`),
    hastaDia: new Date(`${sig}-01T00:00:00.000Z`),
  };
}

// ── Montos ─────────────────────────────────────────────────────────────────

export const aCentimos = (soles: number): number => Math.round(soles * 100);
export const aSoles = (centimos: number): number => centimos / 100;

/** «1,048.00» — el monto en el texto de las notas (es-PE, 2 decimales). */
export const formatoSoles = (n: number): string => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Suma en céntimos las columnas en soles: 0,1 + 0,2 da 0,3 y no 0,30000000000000004. */
export function sumarColumnas(filas: readonly FilaLibro[], claves: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const clave of claves) {
    let c = 0;
    for (const f of filas) {
      const v = f[clave];
      if (typeof v === "number" && Number.isFinite(v)) c += aCentimos(v);
    }
    out[clave] = aSoles(c);
  }
  return out;
}

/**
 * Ordena por fecha, numera el correlativo (col. 1) y deja TODAS las claves de las
 * columnas en cada fila (lo que falta = null): el TXT y el Excel no tienen huecos.
 */
export function numerarYCompletar(
  filas: ReadonlyArray<{ orden: number; fila: FilaLibro }>,
  columnas: readonly ColumnaLibro[],
): FilaLibro[] {
  return [...filas]
    .sort((a, b) => a.orden - b.orden)
    .map((f, i): FilaLibro => {
      const fila: FilaLibro = { ...f.fila, correlativo: String(i + 1) };
      return Object.fromEntries(columnas.map((c) => [c.clave, fila[c.clave] ?? null]));
    });
}

// ── Fechas y documentos ────────────────────────────────────────────────────

/** `DD/MM/AAAA` del día de Lima (ventas, pedidos, movimientos: tienen hora real). */
export function fechaLima(d: Date | null | undefined): string | null {
  if (!d) return null;
  const k = limaDateKey(d);
  return k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : null;
}

/**
 * `DD/MM/AAAA` del día de un GASTO, con la misma regla que la lista de gastos y el
 * «IGV del mes» (`diaDelGasto`): sin hora (medianoche UTC) = el día elegido; con hora
 * = el día de Lima. Así una factura del 30-sep a las 21:00 cae en setiembre en los dos.
 */
export function fechaDia(d: Date | null | undefined): string | null {
  if (!d || !Number.isFinite(d.getTime())) return null;
  const k = diaDelGasto(d);
  return k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : null;
}

/**
 * Tabla 2 de SUNAT a partir de lo que el sistema sabe. Con el tipo anotado
 * (DNI, RUC, CE, PASAPORTE) se usa ese; sin tipo, un número de 11 dígitos es
 * RUC y uno de 8 es DNI. Lo demás queda vacío: no se adivina.
 */
export function tipoDocIdentidad(numero: string | null | undefined, tipoAnotado?: string | null): string | null {
  const t = (tipoAnotado ?? "").trim().toUpperCase();
  if (t === "RUC") return "6";
  if (t === "DNI") return "1";
  if (t === "CE" || t.startsWith("CARNET")) return "4";
  if (t.startsWith("PASAPORTE")) return "7";
  const n = (numero ?? "").replace(/\D/g, "");
  if (n.length === 11) return "6";
  if (n.length === 8) return "1";
  return null;
}

/** Tabla 10 para lo que el sistema llama factura/boleta/nota. Lo demás (recibo, ticket…) no se adivina. */
export function tipoComprobanteTabla10(tipo: string | null | undefined): string | null {
  const t = (tipo ?? "").trim().toLowerCase();
  if (t === "factura") return "01";
  if (t === "boleta") return "03";
  if (t === "nota_credito" || t === "nota de crédito" || t === "nota de credito") return "07";
  if (t === "nota_debito" || t === "nota de débito" || t === "nota de debito") return "08";
  return null;
}

const SERIE_NUMERO = /^\s*([A-Za-z0-9]{1,4})\s*-\s*(\d{1,10})\s*$/;

/** «F001-123» → serie F001, número 123. Sin ese patrón, todo va como número y la serie queda vacía. */
export function partirSerieNumero(texto: string | null | undefined): { serie: string | null; numero: string | null } {
  const t = (texto ?? "").trim();
  if (!t) return { serie: null, numero: null };
  const m = SERIE_NUMERO.exec(t);
  if (!m) return { serie: null, numero: t };
  return { serie: m[1].toUpperCase(), numero: String(Number(m[2])) };
}

/** Texto que escribe la gente: sin fórmulas de Excel. */
export function textoSeguro(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? celdaSegura(t) : null;
}

// ── TXT de trabajo ─────────────────────────────────────────────────────────

function celdaTxt(v: ValorCelda, col: ColumnaLibro): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return col.soles ? v.toFixed(2) : String(v);
  return v.replace(/[|\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/**
 * El TXT «de trabajo»: una línea de encabezados y una por fila, separadas por
 * `|`, montos con punto y 2 decimales. Lleva el aviso en la primera línea
 * para que nadie lo suba al PLE/SIRE creyendo que es el oficial.
 */
export function libroATxt(libro: LibroContador): string {
  const lineas = [
    `# ${libro.formato} ${libro.titulo} — período ${libro.periodo} — ${AVISO_DE_TRABAJO}`,
    libro.columnas.map((c) => (c.numero ? `${c.numero}. ${c.rotulo}` : c.rotulo)).join("|"),
    ...libro.filas.map((f) => libro.columnas.map((c) => celdaTxt(f[c.clave] ?? null, c)).join("|")),
  ];
  return lineas.join("\r\n") + "\r\n";
}

export function nombreArchivoLibro(libro: LibroId, periodo: string, ext: "xlsx" | "txt"): string {
  const base = libro === "ventas" ? "registro-ventas" : libro === "compras" ? "registro-compras" : "kardex-valorizado";
  return `${base}-de-trabajo-${periodo}.${ext}`;
}
