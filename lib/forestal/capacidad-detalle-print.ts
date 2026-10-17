/**
 * El detalle de UNA fuente de capacidad, imprimible (PDF).
 *
 * Es el papel que se lleva a una fiscalización o se manda a un comprador: la
 * lista de piezas —o de lotes, o de productos— que respalda el número de la
 * tarjeta.
 *
 * Dos cosas que el formato NO deja que se pierdan:
 *
 *  1. **El filtro va en el encabezado.** Un PDF de 12 trozas sin decir «sólo el
 *     permiso X» se archiva como si fuera todo el patio, y ahí el papel miente
 *     sin que nadie lo haya escrito mal.
 *  2. **El total dice que es un techo.** La rolliza va convertida al 56 %, que
 *     es el máximo del rendimiento (ADR-358), no lo que la sierra saca. Sin esa
 *     línea el número se lee como stock comprometido.
 */

import { ctpReportFooter, esc, openCtpReport } from "@/lib/forestal/ctp-print-shared";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";

export interface CapacidadDetallePrint {
  /** Nombre de la fuente: «Trozas en el patio», «Productos terminados»… */
  titulo: string;
  /** Cómo se lee el recorte: «Sólo permiso X · especie TORNILLO». */
  filtro: string;
  periodoLabel: string;
  columnas: string[];
  filas: Record<string, string | number>[];
  /** m³ tal como están hoy (rolliza o producto, según la fuente). */
  totalM3: number;
  /** m³ de producto que representan. */
  enProductoM3: number;
  /** `true` si pasó por la conversión al 56 %. */
  convertido: boolean;
}

const n = (v: number, d = 4) =>
  v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Las columnas de número van a la derecha; el resto, alineadas a la izquierda. */
const esNumerica = (col: string) =>
  /m³|pt|Piezas|Producido|Despachado|Disponible|Consumido|Resta|56/.test(col);

export function printCapacidadDetalle(d: CapacidadDetallePrint): void {
  const filas = d.filas
    .map(
      (f) =>
        `<tr>${d.columnas
          .map((c) => {
            const v = f[c];
            const num = typeof v === "number";
            return `<td${num ? ' class="num"' : ""}>${esc(
              num
                ? /m³|Resta|Consumido|56/.test(c)
                  ? n(v)
                  : v.toLocaleString("es-PE")
                : (v ?? "—"),
            )}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");

  const body = `
    <h1>Capacidad de la planta · ${esc(d.titulo)}</h1>
    <p class="sub">${esc(d.filtro)} — ${d.filas.length} ${d.filas.length === 1 ? "fila" : "filas"} · período ${esc(d.periodoLabel)}</p>

    <div class="id">
      <div><span class="k">Volumen hoy</span> ${n(d.totalM3)} m³</div>
      <div><span class="k">En producto</span> ${n(d.enProductoM3)} m³ · ${pieTablarDe(d.enProductoM3).toLocaleString("es-PE")} pt</div>
      <div><span class="k">Conversión</span> ${d.convertido ? `al ${Math.round(RENDIMIENTO_META * 100)} % (techo de rendimiento)` : "no aplica — ya es producto"}</div>
      <div><span class="k">Emitido</span> ${esc(new Date().toLocaleString("es-PE"))}</div>
    </div>

    <h2>Detalle</h2>
    <table>
      <thead><tr>${d.columnas.map((c) => `<th${esNumerica(c) ? ' class="num"' : ""}>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${filas}</tbody>
    </table>

    ${ctpReportFooter(
      d.convertido
        ? `El volumen en producto es una COTA MÁXIMA: la rolliza se convierte al ${Math.round(RENDIMIENTO_META * 100)} %, que es el techo del rendimiento (ADR-358), no lo que la sierra saca de verdad. Reporte derivado del Libro de Operaciones del CTP.`
        : "Reporte derivado del Libro de Operaciones del CTP. Las cantidades son las declaradas en el libro para el período indicado.",
    )}
  `;

  // `openCtpReport` ya inyecta `CTP_REPORT_BASE_CSS`: pasarlo de nuevo duplica
  // 30 reglas en cada impresión sin cambiar nada.
  openCtpReport({ title: `Capacidad · ${d.titulo}`, body });
}
