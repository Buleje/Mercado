/**
 * Metadata extendida de gastos recurrentes, serializada en el campo `description`.
 *
 * Estrategia: el schema Prisma de `Expense` no tiene columnas para frecuencia/método/proveedor.
 * En vez de migrar (riesgo + ADR), serializamos un sufijo JSON al final de la descripción
 * separado por un marcador único `\n---META---\n`. Esto preserva compatibilidad:
 *  - Expenses viejos (sin meta) → parsean OK, meta vacío.
 *  - Backend nunca lee el sufijo, solo el frontend.
 *
 * Si en el futuro Brandon necesita filtrar por frecuencia desde la DB, mover esto
 * a columnas reales via migración (ADR + expand→migrate→contract).
 */

export type ExpenseFrequency = "mensual" | "quincenal" | "semanal" | "anual" | "unico";
export type ExpensePaymentMethod = "efectivo" | "yape" | "plin" | "transferencia" | "tarjeta" | "credito";

export type ExpenseMeta = {
  frequency?: ExpenseFrequency;
  paymentDay?: number;       // 1-31 si frequency=mensual/anual; 0-6 si semanal (0=domingo)
  paymentMethod?: ExpensePaymentMethod;
  supplierName?: string;      // proveedor / quien recibe el pago (free text)
  notes?: string;             // notas internas
  startDate?: string;         // ISO yyyy-mm-dd
  endDate?: string;           // ISO yyyy-mm-dd
  reminderEnabled?: boolean;  // notificar día antes del vencimiento
  iconKey?: string;           // ícono Lucide elegido en creación
  colorKey?: string;          // color elegido en creación
};

const SEP = "\n---META---\n";

export function encodeExpenseDescription(description: string, meta: ExpenseMeta): string {
  const clean: ExpenseMeta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null || v === "") continue;
    (clean as Record<string, unknown>)[k] = v;
  }
  if (Object.keys(clean).length === 0) return description;
  return `${description}${SEP}${JSON.stringify(clean)}`;
}

export function decodeExpenseDescription(raw: string): { description: string; meta: ExpenseMeta } {
  if (!raw) return { description: "", meta: {} };
  const idx = raw.indexOf(SEP);
  if (idx === -1) return { description: raw, meta: {} };
  const description = raw.slice(0, idx);
  try {
    const meta = JSON.parse(raw.slice(idx + SEP.length)) as ExpenseMeta;
    return { description, meta: meta && typeof meta === "object" ? meta : {} };
  } catch {
    return { description, meta: {} };
  }
}

export const FREQUENCY_LABELS: Record<ExpenseFrequency, string> = {
  mensual: "Cada mes",
  quincenal: "Cada 15 días",
  semanal: "Cada semana",
  anual: "Cada año",
  unico: "Pago único",
};

export const FREQUENCY_LABELS_SHORT: Record<ExpenseFrequency, string> = {
  mensual: "Mensual",
  quincenal: "Quincenal",
  semanal: "Semanal",
  anual: "Anual",
  unico: "Único",
};

export const PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  credito: "A crédito",
};

export const DAYS_OF_WEEK = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function formatPaymentDay(meta: ExpenseMeta): string | null {
  if (meta.paymentDay == null) return null;
  if (meta.frequency === "semanal") return DAYS_OF_WEEK[meta.paymentDay] ?? null;
  if (meta.frequency === "mensual" || meta.frequency === "quincenal") return `Día ${meta.paymentDay}`;
  if (meta.frequency === "anual") return `Día ${meta.paymentDay}`;
  return null;
}

export function summarizeMeta(meta: ExpenseMeta): string {
  const bits: string[] = [];
  if (meta.frequency) bits.push(FREQUENCY_LABELS_SHORT[meta.frequency]);
  const day = formatPaymentDay(meta);
  if (day) bits.push(day);
  if (meta.paymentMethod) bits.push(PAYMENT_METHOD_LABELS[meta.paymentMethod]);
  return bits.join(" · ");
}
