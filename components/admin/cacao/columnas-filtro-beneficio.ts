import { cacaoRendimiento } from "@/lib/cacao/cacao-quality";
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";

export interface Beneficio {
  id: string;
  loteId: string | null;
  loteCode: string | null;
  estado: string;
  fermDias: number | null;
  fermVolteos: number | null;
  tipoFermentador: string | null;
  secDias: number | null;
  metodoSecado: string | null;
  humedadFinal: string | null;
  pesoHumedoKg: string | null;
  pesoSecoKg: string | null;
  mermaPct: string | null;
  fermInicio: string | null;
  secInicio: string | null;
  createdAt: string;
}

const num = (v: string | null) => (v == null || v === "" ? null : Number(v));
const rend = (b: Beneficio) => cacaoRendimiento(num(b.pesoHumedoKg), num(b.pesoSecoKg));

/** Filtros de columna (como Adelantos › Lista). El estado queda en los botones de arriba
 *  (incluye «Atención», que no es una columna): no se repite en el encabezado. */
export const COLUMNAS_BENEFICIO: readonly ColumnaFiltro<Beneficio>[] = [
  { id: "lote", label: "Lote", tipo: "texto", valor: (b) => b.loteCode },
  { id: "ferm", label: "Fermentación", tipo: "rango", numero: (b) => b.fermDias, unidad: "días", paso: 1 },
  { id: "sec", label: "Secado", tipo: "rango", numero: (b) => b.secDias, unidad: "días", paso: 1 },
  { id: "hum", label: "Hum. final", tipo: "rango", numero: (b) => num(b.humedadFinal), unidad: "%", paso: 0.1 },
  { id: "seco", label: "Húmedo→Seco", tipo: "rango", numero: (b) => num(b.pesoSecoKg), unidad: "kg seco", paso: 0.01 },
  { id: "merma", label: "Merma", tipo: "rango", numero: (b) => num(b.mermaPct), unidad: "%", paso: 0.1 },
  { id: "rend", label: "Rend.", tipo: "rango", numero: rend, unidad: "%", paso: 0.1 },
];

export const ORDEN_BENEFICIO: Record<string, AccesorOrden<Beneficio>> = {
  lote: { valor: (b) => b.loteCode, texto: true },
  estado: { valor: (b) => b.estado, texto: true },
  ferm: { valor: (b) => b.fermDias },
  sec: { valor: (b) => b.secDias },
  hum: { valor: (b) => num(b.humedadFinal) },
  seco: { valor: (b) => num(b.pesoSecoKg) },
  merma: { valor: (b) => num(b.mermaPct) },
  rend: { valor: rend },
};
