/**
 * La lista de gastos de Plata › Gastos: en qué DÍA cae cada gasto, qué rango
 * pedir a la base, cómo se busca y filtra, qué sale en el CSV y qué se le
 * cuenta a la persona antes de borrar.
 *
 * Por qué hace falta «el día del gasto»: la columna `Expense.date` guarda dos
 * cosas distintas. El formulario manda un día sin hora («2026-10-01») y queda
 * como MEDIANOCHE UTC — que en Pucallpa es el 30/09 a las 19:00. Lo que se anota
 * sin fecha (un pago a repartidor, un POST sin `date`) queda con el instante
 * real. Leer las dos con la misma regla corre un día a una de ellas: el gasto
 * del 1 aparecía en setiembre, o desaparecía de octubre a partir de las 19:00.
 * La regla es la misma que usa la caja (`esDeHoyEnLima`): medianoche UTC exacta
 * = el día escrito; cualquier otra hora = el día de Lima de ese instante.
 */
import { limaDateKey } from "@/lib/utils";

const MEDIANOCHE_UTC = /^(\d{4}-\d{2}-\d{2})(T00:00(:00(\.0+)?)?(Z|\+00:00)?)?$/;

/** «2026-10-01» — el día en que la persona anotó el gasto. "" si no hay fecha. */
export function diaDelGasto(fecha: string | Date | null | undefined): string {
  if (fecha == null || fecha === "") return "";
  const texto = fecha instanceof Date ? fecha.toISOString() : String(fecha).trim();
  const soloDia = MEDIANOCHE_UTC.exec(texto);
  return soloDia ? soloDia[1] : limaDateKey(texto);
}

/** Suma días a un «YYYY-MM-DD» con aritmética UTC (sin zona que lo corra). */
export function sumarDias(dia: string, n: number): string {
  const t = Date.parse(`${dia}T00:00:00Z`);
  if (!Number.isFinite(t)) return dia;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** «2026-10-01» — el 1 del mes del día dado, `mesesAtras` meses antes. */
export function primeroDelMes(dia: string, mesesAtras = 0): string {
  const [y, m] = dia.split("-").map(Number);
  if (!y || !m) return dia;
  const d = new Date(Date.UTC(y, m - 1 - mesesAtras, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Lo que se le pide a la base para cubrir los días `desde`…`hasta` de Lima con
 * las dos formas de guardar: desde la medianoche UTC de `desde` (el gasto sin
 * hora de ese día) hasta las 23:59:59 de Lima de `hasta` (= 04:59:59 UTC del
 * día siguiente). Lo que sobra en los bordes lo saca `diaDelGasto`.
 */
export function rangoDeConsulta(desde: string, hasta: string): { desde: Date; hasta: Date } {
  return {
    desde: new Date(`${desde}T00:00:00.000Z`),
    hasta: new Date(`${sumarDias(hasta, 1)}T04:59:59.999Z`),
  };
}

/** ¿El gasto cae entre `desde` y `hasta` (días de Lima, inclusive)? */
export function gastoEnRango(fecha: string | Date, desde: string, hasta: string): boolean {
  const dia = diaDelGasto(fecha);
  return dia !== "" && dia >= desde && dia <= hasta;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «jueves 01/10» — la fecha que se lee en la lista. */
export function diaConNombre(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  if (!y || !m || !d) return "—";
  const nombre = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${nombre} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** El retiro de caja de un gasto, como lo trae la lista (`null` = no salió del cajón). */
export interface RetiroDelGasto {
  monto: number;
  /** La caja de ese retiro sigue abierta. */
  abierta: boolean;
  /** «jueves 09/10» — el día en que se abrió esa caja. */
  dia: string;
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/**
 * La línea de la confirmación: qué le pasa a la caja si borras el gasto. Es la
 * misma regla que aplica el servidor (`GastoConCajaDB.borrarGasto`): con la caja
 * abierta la plata vuelve con un «Gasto borrado»; con la caja cerrada no se toca.
 */
export function lineaDeCajaAlBorrar(caja: RetiroDelGasto | null | undefined): string {
  if (!caja) return "No salió de la caja: la caja no cambia.";
  if (caja.abierta) return `Salió de la caja abierta: los ${soles(caja.monto)} vuelven al cajón.`;
  return `Salió de la caja del ${caja.dia}, que ya se cerró: esa caja no cambia.`;
}

/** Lo mínimo de un gasto para buscar, filtrar y exportar. */
export interface GastoDeLista {
  category: string;
  description: string;
  amount: number;
  date: string;
  supplierName?: string | null;
  documentNumber?: string | null;
}

/** Sin tildes ni mayúsculas: «Energía» la encuentra «energia». */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Busca en lo que la persona recuerda del gasto (qué, categoría, proveedor,
 * N° del papel) y filtra por categoría. `descripcion` = el texto ya decodificado.
 */
export function filtrarGastos<T extends GastoDeLista>(
  gastos: readonly T[],
  opciones: { buscar: string; categoria: string | null; descripcion: (g: T) => string },
): T[] {
  const q = normalizar(opciones.buscar);
  const cat = opciones.categoria ? normalizar(opciones.categoria) : null;
  return gastos.filter((g) => {
    if (cat && normalizar(g.category) !== cat) return false;
    if (!q) return true;
    const texto = normalizar(
      [opciones.descripcion(g), g.category, g.supplierName ?? "", g.documentNumber ?? ""].join(" "),
    );
    return texto.includes(q);
  });
}

/**
 * Las categorías que hay en la lista, con cuántos gastos tiene cada una.
 * «Alquiler» y «alquiler» son la misma (hay datos con las dos): una opción, con
 * el nombre que apareció primero — el filtro ya compara sin mayúsculas.
 */
export function categoriasDeLista(gastos: readonly GastoDeLista[]): { categoria: string; cuantos: number }[] {
  const cuenta = new Map<string, { categoria: string; cuantos: number }>();
  for (const g of gastos) {
    const clave = normalizar(g.category);
    const fila = cuenta.get(clave);
    if (fila) fila.cuantos += 1;
    else cuenta.set(clave, { categoria: g.category, cuantos: 1 });
  }
  return [...cuenta.values()].sort((a, b) => b.cuantos - a.cuantos || a.categoria.localeCompare(b.categoria));
}
