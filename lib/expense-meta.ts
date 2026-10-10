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

// ─── Duplicados del catálogo ────────────────────────────────────────────────

/**
 * Dos gastos fijos que son el mismo.
 *
 * En el tenant real el catálogo trae seis tarjetas para tres gastos: el alquiler
 * de S/850 aparece dos veces, cada una con su botón «Pagar» al lado. La pantalla
 * los muestra fielmente porque son dos filas distintas en la base — y nadie
 * avisa. El riesgo no es visual: es pagar dos veces.
 *
 * Se consideran el mismo gasto si coinciden nombre (sin la meta, normalizado),
 * monto y frecuencia.
 */
export function claveDeGasto(descripcionCruda: string, amount: number): string {
  const { meta } = decodeExpenseDescription(descripcionCruda);
  return `${claveDePago(descripcionCruda, amount)}|${meta.frequency ?? ""}`;
}

/**
 * Clave sin la frecuencia: nombre + monto.
 *
 * Un gasto YA EJECUTADO no arrastra la metadata del template (el endpoint copia
 * sólo la descripción), así que exigirle la frecuencia haría que ningún pago
 * cruzara jamás con su gasto fijo. La frecuencia la aporta el template; el pago
 * sólo tiene que decir qué se pagó y cuánto.
 */
export function claveDePago(descripcionCruda: string, amount: number): string {
  const { description } = decodeExpenseDescription(descripcionCruda);
  const nombre = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${nombre}|${Number(amount).toFixed(2)}`;
}

export interface GrupoDuplicado<T> {
  clave: string;
  items: T[];
}

/**
 * Agrupa los repetidos. Devuelve SÓLO los grupos con más de uno: la UI muestra
 * el primero y avisa de los otros, en vez de repetir la tarjeta.
 */
export function agruparDuplicados<T>(
  gastos: T[],
  leer: (g: T) => { description: string; amount: number },
): { unicos: T[]; duplicados: GrupoDuplicado<T>[] } {
  const porClave = new Map<string, T[]>();
  for (const g of gastos) {
    const { description, amount } = leer(g);
    const k = claveDeGasto(description, amount);
    porClave.set(k, [...(porClave.get(k) ?? []), g]);
  }
  const unicos: T[] = [];
  const duplicados: GrupoDuplicado<T>[] = [];
  for (const [clave, items] of porClave) {
    unicos.push(items[0]);
    if (items.length > 1) duplicados.push({ clave, items });
  }
  return { unicos, duplicados };
}

// ─── Cuándo vence el gasto fijo ─────────────────────────────────────────────

export type EstadoVencimiento = "vencido" | "hoy" | "pronto" | "lejos" | "sin_fecha";

export interface Vencimiento {
  estado: EstadoVencimiento;
  /** Días hasta el vencimiento; negativo si ya pasó. `null` si no se puede saber. */
  dias: number | null;
  /** Frase corta para la tarjeta. */
  texto: string;
}

/**
 * Próximo vencimiento a partir de la frecuencia y el día de pago.
 *
 * La tarjeta decía «Mensual · Día 5 · Yape» y dejaba la cuenta al lector: para
 * saber si el alquiler vence mañana había que mirar el calendario. Acá se dice
 * en días, que es como se decide si hay que pagarlo ahora.
 *
 * `hoy` entra por parámetro: si dependiera del reloj, el resultado cambiaría
 * entre renders y los tests no serían deterministas.
 */
export function proximoVencimiento(meta: ExpenseMeta, hoy: Date): Vencimiento {
  const { frequency, paymentDay } = meta;
  if (!frequency || paymentDay == null || frequency === "unico") {
    return { estado: "sin_fecha", dias: null, texto: "" };
  }

  const diaUtc = (d: Date) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
  const hoyDia = diaUtc(hoy);
  let objetivo: number;

  if (frequency === "semanal" || frequency === "quincenal") {
    // paymentDay es el día de la semana (0 = domingo).
    const dowHoy = hoy.getUTCDay();
    const delta = (paymentDay - dowHoy + 7) % 7;
    objetivo = hoyDia + delta;
  } else {
    // mensual / anual: día del mes. Si ya pasó, cae en el mes siguiente.
    const y = hoy.getUTCFullYear();
    const m = hoy.getUTCMonth();
    const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const diaEsteMes = Math.min(paymentDay, ultimoDia); // «día 31» en febrero es el 28
    const esteMes = Math.floor(Date.UTC(y, m, diaEsteMes) / 86_400_000);
    if (esteMes >= hoyDia) objetivo = esteMes;
    else {
      const ultimoDiaProx = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
      objetivo = Math.floor(Date.UTC(y, m + 1, Math.min(paymentDay, ultimoDiaProx)) / 86_400_000);
    }
  }

  const dias = objetivo - hoyDia;
  if (dias < 0) return { estado: "vencido", dias, texto: `venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}` };
  if (dias === 0) return { estado: "hoy", dias, texto: "vence hoy" };
  if (dias <= 3) return { estado: "pronto", dias, texto: `vence en ${dias} día${dias === 1 ? "" : "s"}` };
  return { estado: "lejos", dias, texto: `vence en ${dias} días` };
}

// ─── ¿Ya se pagó este período? ──────────────────────────────────────────────

/**
 * Período al que pertenece una fecha, según la frecuencia del gasto.
 *
 * Es la clave que permite responder «¿el alquiler de agosto ya está pagado?».
 * Sin esto la tarjeta ofrecía «Pagar» siempre igual, hubieras pagado o no —
 * la misma trampa que los duplicados, por otro camino.
 */
export function periodoDe(fecha: Date, frequency: ExpenseFrequency | undefined): string {
  const y = fecha.getUTCFullYear();
  const m = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  if (frequency === "anual") return `${y}`;
  if (frequency === "semanal" || frequency === "quincenal") {
    // Semana ISO simplificada: lunes como primer día.
    const d = new Date(Date.UTC(y, fecha.getUTCMonth(), fecha.getUTCDate()));
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    return `${d.getUTCFullYear()}-W${String(Math.ceil(((+d - +new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86_400_000 + 1) / 7)).padStart(2, "0")}`;
  }
  return `${y}-${m}`; // mensual y cualquier otro caso
}

export interface PagoRegistrado {
  /** Descripción cruda del gasto ejecutado (puede traer la meta serializada). */
  description: string;
  amount: number;
  /** Fecha en que se registró el pago. */
  date: string;
  /**
   * De qué plantilla salió este pago (ADR-374). Lo escribe `addFromTemplate`.
   * Los pagos anteriores a esa columna —y los del seed— vienen en `null`.
   */
  templateId?: string | null;
}

/**
 * ¿Este gasto fijo ya se pagó en el período en curso?
 *
 * Primero por `templateId`: el pago dice de qué plantilla salió, y eso no
 * cambia aunque el recibo venga por otro importe. Es lo que hace que corregir
 * el monto de un pago —o que la luz salga más cara este mes— no reviva la
 * tarjeta como «pendiente» cuando la plata ya salió.
 *
 * Si el pago no tiene `templateId` (los viejos, los del seed), se cae al cruce
 * por nombre + monto + frecuencia, que es lo único que hay para reconocerlos.
 * Ahí sí un importe distinto cuenta como otro pago: sin vínculo, un monto que
 * no coincide es indistinguible de un gasto suelto con el mismo nombre.
 */
export function yaPagadoEnPeriodo(
  gasto: { id?: string; description: string; amount: number },
  pagos: PagoRegistrado[],
  hoy: Date,
): { pagado: boolean; fecha: string | null } {
  const { meta } = decodeExpenseDescription(gasto.description);
  const clave = claveDePago(gasto.description, gasto.amount);
  const periodoActual = periodoDe(hoy, meta.frequency);

  let porNombreYMonto: string | null = null;
  for (const p of pagos) {
    const fecha = new Date(p.date);
    if (Number.isNaN(fecha.getTime())) continue;
    if (periodoDe(fecha, meta.frequency) !== periodoActual) continue;
    // El vínculo explícito gana y corta acá: es el único que sobrevive a que
    // el monto cambie.
    if (gasto.id && p.templateId && p.templateId === gasto.id) {
      return { pagado: true, fecha: p.date };
    }
    if (porNombreYMonto === null && claveDePago(p.description, p.amount) === clave) {
      porNombreYMonto = p.date;
    }
  }
  return porNombreYMonto !== null
    ? { pagado: true, fecha: porNombreYMonto }
    : { pagado: false, fecha: null };
}
