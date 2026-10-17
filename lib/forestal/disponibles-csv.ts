/**
 * disponibles-csv — el stock de «Productos disponibles», tal como se está
 * viendo, en CSV.
 *
 * Despacho y Saldos exportan desde hace meses; esta pestaña —la que el patio
 * mira todos los días para saber qué hay— no exportaba nada (verificado en el
 * navegador, 2026-09-15). El operador terminaba sacando captura de pantalla.
 *
 * Mismas reglas que el resto del libro (`ctp-ingresos-csv`, `ctp-saldos-csv`):
 * separador `;`, coma decimal, `celdaCsv` compartido, sin entrecomillar el
 * decimal. El operador abre los cuatro archivos en el mismo Excel y no puede
 * tener cuatro formatos.
 *
 * PURO: arma el string; bajarlo es del componente.
 */
import { celdaCsv } from "./ctp-ingresos-csv";

export interface FilaDisponibleCsv {
  codigo: string;
  producto: string;
  especie: string;
  presentacion: string;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  piezas: number | null;
  volumenM3: number;
  pieTablar: number | null;
  corrida: string;
  lote: string;
  permiso: string;
  gtf: string;
  saldoCorridaM3: number;
  diasParado: number | null;
  valorSoles: number | null;
  apartadoPara: string | null;
  estado: string;
}

type ClaveDisponible = keyof FilaDisponibleCsv;

/** Separador `;`: con `,` Excel es-PE mete todo en la columna A. */
const fila = (celdas: unknown[]) => celdas.map(celdaCsv).join(";");

/** Coma decimal: con punto, Excel es-PE lo lee como texto y no suma. */
const num = (v: number, decimales: number) => v.toFixed(decimales).replace(".", ",");

interface ColumnaCsv {
  clave: ClaveDisponible;
  /** Con la unidad puesta: una columna «Volumen» sin unidad se suma con pies. */
  titulo: string;
  /** Decimales si la celda es numérica; `undefined` = texto tal cual. */
  decimales?: number;
}

/**
 * El orden por defecto = el orden de la tabla: primero qué es (código,
 * producto, especie), después cuánto mide, después cuánto hay, después de
 * dónde vino (corrida, lote, permiso, GTF) y al final su estado en el patio.
 * Quien abre el CSV tiene que reconocer la pantalla de la que salió.
 */
const COLUMNAS: readonly ColumnaCsv[] = [
  { clave: "codigo", titulo: "Código" },
  { clave: "producto", titulo: "Producto" },
  { clave: "especie", titulo: "Especie" },
  { clave: "presentacion", titulo: "Presentación" },
  { clave: "espesorCm", titulo: "Espesor (cm)", decimales: 2 },
  { clave: "anchoCm", titulo: "Ancho (cm)", decimales: 2 },
  { clave: "largoM", titulo: "Largo (m)", decimales: 2 },
  { clave: "piezas", titulo: "Piezas", decimales: 0 },
  { clave: "volumenM3", titulo: "Volumen (m³)", decimales: 4 },
  { clave: "pieTablar", titulo: "Pie tablar", decimales: 2 },
  { clave: "corrida", titulo: "Corrida" },
  { clave: "lote", titulo: "Lote" },
  { clave: "permiso", titulo: "Permiso" },
  { clave: "gtf", titulo: "GTF" },
  { clave: "saldoCorridaM3", titulo: "Saldo corrida (m³)", decimales: 4 },
  { clave: "diasParado", titulo: "Parado (días)", decimales: 0 },
  { clave: "valorSoles", titulo: "Valor (S/)", decimales: 2 },
  { clave: "apartadoPara", titulo: "Apartado para" },
  { clave: "estado", titulo: "Estado" },
];

/**
 * Qué se totaliza al pie.
 *
 * `saldoCorridaM3` NO se totaliza aunque sea un número: es el saldo de la
 * corrida repetido en cada una de sus filas, y sumarlo cuenta la misma madera
 * tantas veces como productos salieron de esa corrida. Un total con aspecto de
 * verdad es peor que ninguno.
 */
const TOTALIZABLES: readonly ClaveDisponible[] = ["volumenM3", "pieTablar", "valorSoles"];

const esTotalizable = (c: ClaveDisponible) => TOTALIZABLES.includes(c);

/** Una celda: `null` sale VACÍA. Nunca «0» (sería un dato) ni «null» (sería un bug). */
function celda(f: FilaDisponibleCsv, col: ColumnaCsv): string {
  const v = f[col.clave];
  if (v == null || v === "") return "";
  if (col.decimales != null) return typeof v === "number" ? num(v, col.decimales) : String(v);
  return String(v);
}

export function disponiblesACsv(
  filas: readonly FilaDisponibleCsv[],
  opts?: { columnas?: readonly ClaveDisponible[] },
): string {
  /* La tabla tiene columnas que el usuario prende y apaga; el CSV exporta lo
     que está viendo, en el orden en que lo está viendo. Una lista vacía cae a
     todas: un archivo sin columnas no es un archivo, es un bug silencioso. */
  const pedidas = opts?.columnas;
  const cols: ColumnaCsv[] =
    pedidas && pedidas.length > 0
      ? pedidas.flatMap((k) => {
          const c = COLUMNAS.find((x) => x.clave === k);
          return c ? [c] : [];
        })
      : [...COLUMNAS];

  const lineas: string[] = [
    fila(cols.map((c) => c.titulo)),
    ...filas.map((f) => fila(cols.map((c) => celda(f, c)))),
  ];

  /* Si hay una sola fila sin costo, el total en soles se OMITE. Un total
     parcial de plata se lee como el total del patio y se copia a una planilla
     de gestión; el m³ y el pie tablar sí se suman porque lo que falta ahí es
     «no aplica» (una rolliza no se mide en pie tablar), mientras que un valor
     faltante es «no se sabe todavía»: hay una guía sin costear. */
  const sinValorizar = filas.filter((f) => f.valorSoles == null).length;
  const exportaValor = cols.some((c) => c.clave === "valorSoles");

  const totalDe = (c: ColumnaCsv): string => {
    if (c.clave === "volumenM3") {
      return num(
        filas.reduce((a, f) => a + (Number.isFinite(f.volumenM3) ? f.volumenM3 : 0), 0),
        4,
      );
    }
    if (c.clave === "pieTablar") {
      const con = filas.filter((f) => f.pieTablar != null);
      return con.length === 0 ? "" : num(con.reduce((a, f) => a + (f.pieTablar ?? 0), 0), 2);
    }
    if (c.clave === "valorSoles") {
      if (sinValorizar > 0 || filas.length === 0) return "";
      return num(filas.reduce((a, f) => a + (f.valorSoles ?? 0), 0), 2);
    }
    return "";
  };

  const celdasTotal = cols.map((c) => (esTotalizable(c.clave) ? totalDe(c) : ""));
  /* La etiqueta va en la primera columna que NO se totaliza, para no pisar un
     número con la palabra «TOTAL» cuando el usuario apaga las columnas de texto. */
  const iEtiqueta = cols.findIndex((c) => !esTotalizable(c.clave));
  if (iEtiqueta >= 0) {
    celdasTotal[iEtiqueta] = `TOTAL (${filas.length} fila${filas.length === 1 ? "" : "s"})`;
  }
  lineas.push(fila(celdasTotal));

  if (exportaValor && sinValorizar > 0) {
    lineas.push(
      fila([
        `${sinValorizar} de ${filas.length} filas sin costo cargado: el total en soles se deja vacío a propósito. Carga el costo de esas guías para que el patio se pueda valorizar.`,
      ]),
    );
  }

  return lineas.join("\r\n");
}

/** `productos-disponibles-2026-09.csv` — sin tildes ni espacios, que rompen descargas. */
/**
 * El nombre lleva el DÍA, no el período.
 *
 * «Productos disponibles» no tiene período (el endpoint ignora las fechas a
 * propósito: un depósito es lo que hay HOY, no un flujo entre dos fechas), así
 * que un archivo llamado `…-julio-de-2026-setiembre-de-2026.csv` prometería un
 * recorte que el contenido no tiene. Con la fecha de descarga, dos archivos del
 * mismo patio en días distintos se ordenan solos en la carpeta.
 */
export function nombreArchivoDisponibles(dia: Date): string {
  const d = dia instanceof Date && !Number.isNaN(dia.getTime()) ? dia : new Date();
  /* Calendario de Lima: bajar el stock a las 20:00 de Pucallpa no puede
     nombrar el archivo con el día siguiente. */
  const [{ value: dd }, , { value: mm }, , { value: aaaa }] = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  return `productos-disponibles-${aaaa}-${mm}-${dd}.csv`;
}
