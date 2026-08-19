/**
 * ctp-saldos-csv — las existencias, tal como se están viendo, en CSV.
 *
 * El reporte imprimible (`ctp-existencias-print`) es para firmar y archivar; el
 * Excel oficial va con el formato de SERFOR. Esto es lo tercero, que faltaba: el
 * archivo que el contador abre para cruzar contra su propia planilla.
 *
 * Mismas reglas que el resto del libro (`ctp-ingresos-csv`): separador `;`,
 * coma decimal, sin entrecomillar el decimal — el operador abre los cuatro
 * archivos en el mismo Excel y no puede tener cuatro formatos.
 *
 * PURO: arma el string; bajarlo es del componente.
 */
import { celdaCsv } from "./ctp-ingresos-csv";

export interface EspecieCsv {
  especie: string;
  scientific?: string | null;
  cites?: boolean;
  ingresoM3: number;
  pendienteM3?: number;
  consumidoM3: number;
  saldoM3: number;
  ingresosCount?: number;
}

export interface ProductoCsv {
  producto: string;
  producido: number;
  despachado: number;
  stock: number;
}

const fila = (celdas: unknown[]) => celdas.map(celdaCsv).join(";");
/** Coma decimal: con punto, Excel es-PE lo lee como texto y no suma. */
const num = (v: number, decimales = 4) => v.toFixed(decimales).replace(".", ",");

/**
 * Un solo archivo con las dos mitades del aserradero, separadas por un bloque.
 *
 * Dos archivos obligaban a cruzarlos a mano; una sola tabla mezclaba m³ de
 * troza con unidades de producto en la misma columna, que es el error que este
 * módulo evita en todos lados.
 */
export function saldosACsv(
  especies: readonly EspecieCsv[],
  productos: readonly ProductoCsv[],
  periodoLabel: string,
): string {
  const lineas: string[] = [
    fila(["Existencias del Libro CTP", periodoLabel]),
    "",
    fila(["MATERIA PRIMA (m3)"]),
    fila([
      "Especie", "Nombre cientifico", "CITES", "Guias",
      "Ingresado (m3)", "Sin validar (m3)", "Consumido (m3)", "Saldo (m3)", "Usado (%)",
    ]),
    ...especies.map((e) =>
      fila([
        e.especie,
        e.scientific ?? "",
        e.cites ? "SI" : "NO",
        e.ingresosCount ?? "",
        num(e.ingresoM3),
        num(e.pendienteM3 ?? 0),
        num(e.consumidoM3),
        num(e.saldoM3),
        e.ingresoM3 > 0 ? num(Math.min(100, (e.consumidoM3 / e.ingresoM3) * 100), 1) : "",
      ]),
    ),
    fila([
      "TOTAL", "", "",
      especies.reduce((a, e) => a + (e.ingresosCount ?? 0), 0),
      num(especies.reduce((a, e) => a + e.ingresoM3, 0)),
      num(especies.reduce((a, e) => a + (e.pendienteM3 ?? 0), 0)),
      num(especies.reduce((a, e) => a + e.consumidoM3, 0)),
      num(especies.reduce((a, e) => a + e.saldoM3, 0)),
      "",
    ]),
    "",
    fila(["PRODUCTO TRANSFORMADO (unidades declaradas por corrida)"]),
    fila(["Producto . Especie", "Producido", "Despachado", "Stock"]),
    ...productos.map((p) => fila([p.producto, num(p.producido), num(p.despachado), num(p.stock)])),
    fila([
      "TOTAL",
      num(productos.reduce((a, p) => a + p.producido, 0)),
      num(productos.reduce((a, p) => a + p.despachado, 0)),
      num(productos.reduce((a, p) => a + p.stock, 0)),
    ]),
  ];
  return lineas.join("\r\n");
}

/** `existencias-ctp-mayo-2026.csv` — sin tildes ni espacios, que rompen descargas. */
export function nombreArchivoSaldos(periodoLabel: string): string {
  const slug = periodoLabel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `existencias-ctp-${slug || "periodo"}.csv`;
}
