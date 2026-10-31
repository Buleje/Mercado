/**
 * Las cuentas de Vencimientos, sin React (las prueba
 * `__tests__/inventario-movimientos-cuentas.test.ts`).
 *
 * El vencimiento es una FECHA, no un instante: el lote se guarda a la
 * medianoche UTC del día elegido (`new Date("2026-10-15")`). Antes se contaba
 * `ceil((vence − ahora) / 1 día)`, y a las 20:00 de Pucallpa —ya mañana en
 * UTC— un lote que vence en 5 días decía «4». Ahora se restan días del
 * calendario: la fecha del lote contra el «hoy» de Pucallpa (`limaDateKey`).
 */
import { diasEntre } from "./tipos";

export type Urgencia = "vencido" | "critico" | "pronto" | "bien" | "agotado";

export type Lote = {
  id: string;
  lote: string;
  productName: string;
  productId?: number;
  productCategory?: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  supplierName?: string;
  entryDate?: string;
  costUnit: number;
};

export type LoteConDias = Lote & { dias: number; urgencia: Urgencia };

/**
 * Un lote sin unidades ya no pone nada en riesgo: «Agotado». Antes un lote
 * vaciado (por una pérdida descontada de él) seguía contando como «Vencido» y
 * ofrecía «Dar de baja» de 0 unidades, que el servidor rechaza.
 */
export function urgenciaDe(dias: number, cantidad: number): Urgencia {
  if (!(cantidad > 0)) return "agotado";
  if (dias < 0) return "vencido";
  if (dias <= 7) return "critico";
  if (dias <= 30) return "pronto";
  return "bien";
}

export function conDias(lotes: readonly Lote[], hoy: string): LoteConDias[] {
  return lotes
    .map((l) => {
      const dias = diasEntre(hoy, l.expiryDate);
      return { ...l, dias, urgencia: urgenciaDe(dias, l.quantity) };
    })
    // Los agotados al final: ya no hay nada que atender en ellos.
    .sort((a, b) => Number(a.urgencia === "agotado") - Number(b.urgencia === "agotado") || a.dias - b.dias);
}

export interface CuentasLotes {
  vencido: number;
  critico: number;
  pronto: number;
  bien: number;
  agotado: number;
  /** Σ cantidad × costo unitario de los vencidos y los de esta semana. */
  valorEnRiesgo: number;
  unidadesEnRiesgo: number;
}

export function contarLotes(lotes: readonly LoteConDias[]): CuentasLotes {
  const c: CuentasLotes = { vencido: 0, critico: 0, pronto: 0, bien: 0, agotado: 0, valorEnRiesgo: 0, unidadesEnRiesgo: 0 };
  for (const l of lotes) {
    c[l.urgencia]++;
    if (l.urgencia === "vencido" || l.urgencia === "critico") {
      c.valorEnRiesgo += l.quantity * (l.costUnit || 0);
      c.unidadesEnRiesgo += l.quantity;
    }
  }
  c.valorEnRiesgo = Math.round(c.valorEnRiesgo * 100) / 100;
  return c;
}

/** «Venció hace 3 días», «Vence hoy», «Vence mañana», «Vence en 12 días». */
export function fraseDeDias(dias: number): string {
  if (dias < -1) return `Venció hace ${-dias} días`;
  if (dias === -1) return "Venció ayer";
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  return `Vence en ${dias} días`;
}
