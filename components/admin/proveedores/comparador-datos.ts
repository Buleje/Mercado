/**
 * El puntaje de cada proveedor (Compras › Proveedores › Comparar), sin pantalla:
 * trae proveedores y evaluaciones, saca el puntaje y arma los indicadores.
 * Calidad 40 % · precio 30 % · tiempo 20 % · condición de pago 10 %.
 */

// ── Types ─────────────────────────────────────────────────────────────────────


// ── Types ─────────────────────────────────────────────────────────────────────

export interface SupplierEvalAverages {
  punctuality: number; // 1-5
  quality: number;     // 1-5
  price: number;       // 1-5 (5 = precio bajo = bueno)
}

export interface Supplier {
  id: string;
  name: string;
  categoria?: string | null;
  condicionPago?: string | null;
  diasCredito?: number | null;
  totalPurchases?: number;
  avgDeliveryDays?: number | null;
  /** Días que dice la ficha que tarda en entregar (ADR-376). */
  leadTimeDias?: number | null;
  productCount?: number;
  averagePurchasePrice?: number;
  evaluations?: SupplierEvalAverages | null;
}

export interface SupplierWithScore extends Supplier {
  score: number;
  scoreCalidad: number;
  scorePrecio: number;
  scoreTiempo: number;
  scoreCondicion: number;
  scoreVariedad: number;
  // FIX 2026-07-08 (reporte QA Compras): sin evaluaciones el score se fabricaba
  // con defaults (50/50) → un proveedor sin historial salía ~50/100 y se
  // coronaba "Top Proveedor", contradiciendo la pestaña Proveedores ("sin
  // historial suficiente para evaluar"). `hasData` marca si hay datos reales.
  hasData: boolean;
}

// ── Score ─────────────────────────────────────────────────────────────────────

export function calcScore(s: Supplier): SupplierWithScore {
  const ev = s.evaluations;
  // Sin evaluaciones = sin datos reales para puntuar (calidad/precio son la base
  // del score, 70% del peso). El score numérico se sigue calculando para no
  // romper el radar, pero la UI muestra "Sin datos" y no lo rankea como Top.
  const hasData = !!ev;
  // Calidad 40%
  const scoreCalidad = ev ? (ev.quality / 5) * 100 : 50;
  // Precio 30% — ev.price 5=bueno
  const scorePrecio = ev ? (ev.price / 5) * 100 : 50;
  // Tiempo de entrega 20% — más rápido es mejor; sin dato medido cuenta lo que dice la ficha
  const delivDays = s.avgDeliveryDays ?? s.leadTimeDias ?? 3;
  const scoreTiempo = delivDays <= 0 ? 80 : Math.max(10, 100 - (delivDays - 1) * 15);
  // Condición de pago 10% — crédito > contado (mayor días = mejor para comprador)
  const dias = s.diasCredito ?? 0;
  const scoreCondicion = Math.min(100, dias * 3 + (s.condicionPago === "credito" ? 30 : 10));
  // Variedad (para radar) — basado en productCount
  const scoreVariedad = Math.min(100, (s.productCount ?? 1) * 5);

  const score =
    scoreCalidad * 0.4 +
    scorePrecio  * 0.3 +
    scoreTiempo  * 0.2 +
    scoreCondicion * 0.1;

  return { ...s, score, scoreCalidad, scorePrecio, scoreTiempo, scoreCondicion, scoreVariedad, hasData };
}

// ── Datos ─────────────────────────────────────────────────────────────────────

/** Proveedores con su puntaje (`/api/suppliers` + `/api/supplier-evaluations`). */
export async function cargarProveedoresConPuntaje(): Promise<SupplierWithScore[]> {
  const [suppRes, evalRes] = await Promise.all([fetch("/api/suppliers"), fetch("/api/supplier-evaluations")]);
  const suppJson = suppRes.ok ? await suppRes.json() : [];
  const evalJson = evalRes.ok ? await evalRes.json() : [];

  const rawSuppliers: Supplier[] = suppJson.suppliers ?? suppJson.data ?? suppJson ?? [];
  const rawEvals: Array<{ supplierId: string; quality: number; price: number; punctuality: number }> =
    evalJson.evaluations ?? evalJson ?? [];

  const evalMap: Record<string, { quality: number[]; price: number[]; punctuality: number[] }> = {};
  rawEvals.forEach((e) => {
    if (!evalMap[e.supplierId]) evalMap[e.supplierId] = { quality: [], price: [], punctuality: [] };
    evalMap[e.supplierId].quality.push(e.quality);
    evalMap[e.supplierId].price.push(e.price);
    evalMap[e.supplierId].punctuality.push(e.punctuality);
  });
  const avg = (arr: number[]) => (arr.length === 0 ? 3 : arr.reduce((s, v) => s + v, 0) / arr.length);

  return rawSuppliers.map((s) => {
    const ev = evalMap[s.id];
    return calcScore({ ...s, evaluations: ev ? { quality: avg(ev.quality), price: avg(ev.price), punctuality: avg(ev.punctuality) } : null });
  });
}

/** Lo medido gana; sin medida, lo que dice la ficha. */
export const diasDeEntrega = (s: Pick<Supplier, "avgDeliveryDays" | "leadTimeDias">) => s.avgDeliveryDays ?? s.leadTimeDias ?? null;

export type OrdenComparador = "score" | "name" | "precio";

export function ordenarProveedores(lista: readonly SupplierWithScore[], por: OrdenComparador, texto: string): SupplierWithScore[] {
  const q = texto.trim().toLowerCase();
  const filtrados = q ? lista.filter((s) => s.name.toLowerCase().includes(q)) : [...lista];
  return filtrados.sort((a, b) => {
    if (por === "score") {
      // Sin datos van al final: su score es un default, no un ranking real.
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
      return b.score - a.score;
    }
    if (por === "name") return a.name.localeCompare(b.name);
    return (a.averagePurchasePrice ?? 0) - (b.averagePurchasePrice ?? 0);
  });
}

/** Indicadores globales. Sólo los que tienen datos reales compiten por «Top» y entran al promedio (reporte QA 07-08). */
export function indicadoresDelComparador(suppliers: readonly SupplierWithScore[]) {
  const conDatos = suppliers.filter((s) => s.hasData);
  const top = [...conDatos].sort((a, b) => b.score - a.score)[0];
  const barato = suppliers.filter((s) => (s.averagePurchasePrice ?? 0) > 0).sort((a, b) => (a.averagePurchasePrice ?? 0) - (b.averagePurchasePrice ?? 0))[0];
  return {
    total: suppliers.length,
    evaluados: conDatos.length,
    topName: top?.name ?? "—",
    topScore: top ? Math.round(top.score) : 0,
    avgScore: conDatos.length > 0 ? Math.round(conDatos.reduce((s, x) => s + x.score, 0) / conDatos.length) : 0,
    lowestPrice: barato?.averagePurchasePrice ?? null,
    lowestPriceName: barato?.name ?? "—",
  };
}
