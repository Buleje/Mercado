import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";

export interface LoteRow { id: string; loteCode: string | null; fecha: string; kg: number; total: number; abonado: number; saldo: number; estadoPago: string }
export interface Grupo {
  producerId: string; nombre: string; codigo: string | null; sector: string | null; telefono: string | null;
  lotes: LoteRow[]; nLotes: number; totalSaldo: number; totalDebido: number; totalAbonado: number; oldest: string | null;
}

export const kgDe = (g: Grupo) => g.lotes.reduce((a, l) => a + l.kg, 0);
const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

/** Filtros de columna: las liquidaciones llegan enteras del servidor (una fila por productor). */
export const COLUMNAS_LIQUIDACIONES: readonly ColumnaFiltro<Grupo>[] = [
  { id: "productor", label: "Productor", tipo: "texto", valor: (g) => [g.nombre, g.codigo ?? "", g.sector ?? ""] },
  { id: "lotes", label: "Lotes", tipo: "rango", numero: (g) => g.nLotes, paso: 1 },
  { id: "kg", label: "Kg", tipo: "rango", numero: kgDe, unidad: "kg", paso: 0.01 },
  { id: "debido", label: "A pagar", tipo: "rango", numero: (g) => g.totalDebido, unidad: "S/", paso: 0.01 },
  { id: "abonado", label: "Pagado", tipo: "rango", numero: (g) => g.totalAbonado, unidad: "S/", paso: 0.01 },
  { id: "saldo", label: "Saldo", tipo: "rango", numero: (g) => g.totalSaldo, unidad: "S/", paso: 0.01 },
  { id: "desde", label: "Desde", tipo: "fecha", numero: (g) => dia(g.oldest) },
];

export const ORDEN_LIQUIDACIONES: Record<string, AccesorOrden<Grupo>> = {
  productor: { valor: (g) => g.nombre, texto: true },
  lotes: { valor: (g) => g.nLotes },
  kg: { valor: kgDe },
  debido: { valor: (g) => g.totalDebido },
  abonado: { valor: (g) => g.totalAbonado },
  saldo: { valor: (g) => g.totalSaldo },
  // «Desde» antiguo primero: el que lleva más esperando. fecha: mayor→menor primero, así que
  // se invierte el signo con el timestamp negativo.
  desde: { valor: (g) => (g.oldest ? -new Date(g.oldest).getTime() : null) },
};
