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
/** Un lote con lo que le resta y su plazo, para el reporte. */
export interface LoteCsv {
  code: string;
  permisos: string[];
  especie: string;
  status: string;
  consumidoM3: number;
  esperado56M3: number;
  /** `null` = no se puede sumar sin inventar (otra unidad o sin corridas vivas). */
  producidoM3: number | null;
  /** Al 56 % − producido: lo que el lote todavía admite. `null` sin producción sumable. */
  restaM3: number | null;
  /** m³ de madera que siguen sin aserrar — distinto de `restaM3`. */
  apartadoM3: number;
  piezas: number;
  diasParado: number | null;
  finProceso: string | null;
  diasParaVencer: number | null;
  vencido: boolean;
}

export function saldosACsv(
  especies: readonly EspecieCsv[],
  productos: readonly ProductoCsv[],
  periodoLabel: string,
  /* Los lotes van al final y son opcionales: el reporte se pudo descargar
     siempre sin ellos, y un tenant sin lotes no tiene por qué ver una tabla
     vacía. */
  lotes: readonly LoteCsv[] = [],
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

  /* Lo que queda apartado en cada lote, con su plazo. El «Plazo» va en texto y
     no en número: «3 dias vencido» y «quedan 3 dias» son lo contrario y un -3
     en una planilla se lee mal a la primera. El número queda igual en su
     columna para poder ordenar. */
  if (lotes.length > 0) {
    lineas.push(
      "",
      fila(["LOTES DE ASERRIO"]),
      fila([
        "Lote", "N de permiso", "Especie", "Estado",
        "Consumido (m3)", "Al 56% (m3)", "Producido (m3)", "Resta al 56% (m3)", "Apartado sin aserrar (m3)", "Piezas libres",
        "Dias parado", "Fin de proceso", "Dias para vencer", "Plazo",
      ]),
      ...lotes.map((l) =>
        fila([
          l.code,
          /* Los permisos separados por «+»: en una planilla, dos títulos
             habilitantes en una celda tienen que verse como lo que son —madera
             mezclada— y no como un código raro. */
          l.permisos.join(" + "),
          l.especie,
          l.status,
          num(l.consumidoM3),
          num(l.esperado56M3),
          l.producidoM3 == null ? "" : num(l.producidoM3),
          l.restaM3 == null ? "" : num(l.restaM3),
          num(l.apartadoM3),
          String(l.piezas),
          l.diasParado == null ? "" : String(l.diasParado),
          l.finProceso ?? "",
          l.diasParaVencer == null ? "" : String(l.diasParaVencer),
          l.vencido
            ? `${Math.abs(l.diasParaVencer ?? 0)} dias vencido`
            : l.diasParaVencer == null
              ? "sin fecha"
              : l.diasParaVencer === 0
                ? "vence hoy"
                : `quedan ${l.diasParaVencer} dias`,
        ]),
      ),
      fila([
        "TOTALES",
        "",
        "",
        "",
        num(lotes.reduce((a, l) => a + l.consumidoM3, 0)),
        num(lotes.reduce((a, l) => a + l.esperado56M3, 0)),
        num(lotes.reduce((a, l) => a + (l.producidoM3 ?? 0), 0)),
        num(lotes.reduce((a, l) => a + (l.restaM3 ?? 0), 0)),
        num(lotes.reduce((a, l) => a + l.apartadoM3, 0)),
      ]),
    );
  }

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
