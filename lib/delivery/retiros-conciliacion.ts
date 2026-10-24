/**
 * Retiros del reparto que se pueden conciliar (17-10, P35/P36).
 *
 * Funciones puras (sin base, sin servidor): las usa `PartnerPayoutsDB` para
 * calcular las alertas y la pantalla para leer cada fila y bajar el CSV.
 *
 * - `leerNotaRetiro`: el retiro no tiene columnas para el medio de pago, el
 *   N.° de operación ni el motivo; todo vive en `note` (`notaDePago` escribe
 *   «Yape (de la caja) · 123456»; rechazar guarda el motivo; deshacer,
 *   «Pago deshecho: …»). Acá se separa para mostrarlo en columnas.
 * - `alertasDeRetiros`: coincidencias que un supervisor revisa. NUNCA bloquean
 *   ni borran un pago (ficha P36: «mismo monto por sí solo no elimina ni
 *   bloquea»): sólo avisan, y se pueden justificar.
 * - `csvDeRetiros`: lo filtrado, tal como se abre en Excel (`;` porque en es-PE
 *   la coma es el decimal, igual que `lib/adelantos/exportar-csv.ts`).
 */
import { z } from "zod";
import { FILTROS_HISTORIAL } from "@/lib/delivery/payout-transiciones";
import { celdaCsv } from "@/lib/csv/celda";

export const PATRON_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Más filas no viajan nunca: el CSV del mes de un negocio grande entra holgado. */
export const MAXIMO_EXPORTAR = 2000;

/** Un retiro esperando más que esto ya es una «rendición pendiente». */
export const DIAS_ESPERA_ALERTA = 3;

/** Pagos al mismo repartidor por el mismo monto dentro de esta ventana: revisar. */
export const HORAS_MISMO_MONTO = 24;

/**
 * Filtros del historial (`GET /api/admin/delivery/payouts`). Días en hora de
 * Lima (YYYY-MM-DD), los dos incluidos.
 */
export const filtrosRetirosSchema = z
  .object({
    historial: z.enum(FILTROS_HISTORIAL).optional(),
    desde: z.string().regex(PATRON_DIA).optional(),
    hasta: z.string().regex(PATRON_DIA).optional(),
    partnerId: z.string().trim().min(1).max(64).optional(),
    exportar: z.enum(["1"]).optional(),
  })
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, { message: "«Desde» no puede ir después de «hasta»." });

export type FiltrosRetiros = z.infer<typeof filtrosRetirosSchema>;

/** Días de Lima (UTC−5 todo el año) → instantes `[gte, lt)` para el WHERE. */
export function rangoLima(desde?: string | null, hasta?: string | null): { gte?: Date; lt?: Date } {
  const r: { gte?: Date; lt?: Date } = {};
  if (desde && PATRON_DIA.test(desde)) r.gte = new Date(`${desde}T05:00:00.000Z`);
  if (hasta && PATRON_DIA.test(hasta)) {
    const fin = new Date(`${hasta}T05:00:00.000Z`);
    fin.setUTCDate(fin.getUTCDate() + 1);
    r.lt = fin;
  }
  return r;
}

// ─── La nota del retiro, separada ───────────────────────────────────────────

export interface NotaRetiro {
  /** «Yape», «Efectivo» o «Transferencia» (sólo pagados con la nota de `notaDePago`). */
  metodo: string | null;
  deCaja: boolean;
  /** El N.° de operación que anotó quien pagó. */
  referencia: string | null;
  /** Por qué se rechazó o por qué se deshizo el pago. */
  motivo: string | null;
  /** Lo que no encaja en ningún formato conocido (notas viejas), tal cual. */
  libre: string | null;
}

const NOTA_PAGO = /^(Yape|Efectivo|Transferencia)( \(de la caja\))?(?: · ([\s\S]+))?$/;
const NOTA_DESHECHO = /^Pago deshecho:\s*([\s\S]*)$/;

export function leerNotaRetiro(status: string, note: string | null | undefined): NotaRetiro {
  const vacia: NotaRetiro = { metodo: null, deCaja: false, referencia: null, motivo: null, libre: null };
  const texto = String(note ?? "").trim();
  if (!texto) return vacia;
  if (status === "paid") {
    const m = NOTA_PAGO.exec(texto);
    if (m) return { ...vacia, metodo: m[1], deCaja: Boolean(m[2]), referencia: m[3]?.trim() || null };
    return { ...vacia, libre: texto };
  }
  if (status === "rejected") return { ...vacia, motivo: texto };
  const d = NOTA_DESHECHO.exec(texto);
  if (d) return { ...vacia, motivo: d[1].trim() || null };
  return { ...vacia, libre: texto };
}

/** «op 123 456» y «OP123456» son la misma operación. */
export function normalizarReferencia(ref: string | null | undefined): string {
  return String(ref ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Un N.° de operación ya usado en un pago (para avisar ANTES de pagar con el mismo; P34). */
export interface ReferenciaUsada {
  /** Normalizada (`normalizarReferencia`): la pantalla compara con lo que escribe la persona normalizado igual. */
  referencia: string;
  partnerName: string;
  amount: number;
  resolvedAt: string | null;
}

/** Los N.° de operación de los pagados (de 3 caracteres o más, como las alertas). */
export function referenciasUsadas(filas: readonly RetiroParaAlertas[]): ReferenciaUsada[] {
  const out: ReferenciaUsada[] = [];
  for (const f of filas) {
    if (f.status !== "paid") continue;
    const ref = normalizarReferencia(leerNotaRetiro(f.status, f.note).referencia);
    if (ref.length < 3) continue;
    out.push({
      referencia: ref,
      partnerName: f.partnerName,
      amount: f.amount,
      resolvedAt: f.resolvedAt ? new Date(f.resolvedAt).toISOString() : null,
    });
  }
  return out;
}

// ─── Alertas ────────────────────────────────────────────────────────────────

export type TipoAlertaRetiro = "referencia-repetida" | "mismo-monto" | "espera-larga" | "sin-referencia";

export interface RetiroParaAlertas {
  id: string;
  partnerId: string;
  partnerName: string;
  amount: number;
  status: string;
  note: string | null;
  createdAt: Date | string;
  resolvedAt: Date | string | null;
}

export interface AlertaRetiro {
  /** Estable mientras las filas sean las mismas: con ella se guarda la justificación. */
  clave: string;
  tipo: TipoAlertaRetiro;
  titulo: string;
  detalle: string;
  /** Los retiros que la explican (para resaltarlos o filtrarlos). */
  ids: string[];
  partnerId: string | null;
  /** Si un supervisor ya la revisó: quién, cuándo y por qué. */
  revisada?: JustificacionAlerta | null;
}

export interface JustificacionAlerta {
  motivo: string;
  por: string;
  en: string;
}

const ms = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : Number.NaN);
const centimos = (n: number) => Math.round(n * 100);
const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Coincidencias para revisar. Entran los pagados recientes y los que esperan
 * pago; no decide nada: el supervisor mira las filas y, si son pagos
 * distintos, lo justifica.
 */
export function alertasDeRetiros(filas: readonly RetiroParaAlertas[], ahora: Date = new Date()): AlertaRetiro[] {
  const alertas: AlertaRetiro[] = [];
  const pagados = filas.filter((f) => f.status === "paid");

  // 1. El mismo N.° de operación en dos pagos o más: un Yape no se usa dos veces.
  const porReferencia = new Map<string, RetiroParaAlertas[]>();
  for (const f of pagados) {
    const ref = normalizarReferencia(leerNotaRetiro(f.status, f.note).referencia);
    if (ref.length < 3) continue;
    porReferencia.set(ref, [...(porReferencia.get(ref) ?? []), f]);
  }
  for (const [ref, grupo] of porReferencia) {
    if (grupo.length < 2) continue;
    const nombres = [...new Set(grupo.map((g) => g.partnerName))].join(", ");
    const original = leerNotaRetiro("paid", grupo[0].note).referencia ?? ref;
    alertas.push({
      clave: `ref:${ref}`,
      tipo: "referencia-repetida",
      titulo: `El N.° de operación ${original} está en ${grupo.length} pagos`,
      detalle: `${nombres}. Una misma operación de Yape o del banco no paga dos retiros: revisa si se anotó mal o si se pagó dos veces.`,
      ids: grupo.map((g) => g.id).sort(),
      partnerId: new Set(grupo.map((g) => g.partnerId)).size === 1 ? grupo[0].partnerId : null,
    });
  }

  // 2. Mismo repartidor, mismo monto, pagados con menos de 24 h entre uno y otro.
  const porRepartidorMonto = new Map<string, RetiroParaAlertas[]>();
  for (const f of pagados) {
    if (!Number.isFinite(ms(f.resolvedAt))) continue;
    const k = `${f.partnerId}:${centimos(f.amount)}`;
    porRepartidorMonto.set(k, [...(porRepartidorMonto.get(k) ?? []), f]);
  }
  const ventana = HORAS_MISMO_MONTO * 3600_000;
  for (const grupo of porRepartidorMonto.values()) {
    if (grupo.length < 2) continue;
    const orden = [...grupo].sort((a, b) => ms(a.resolvedAt) - ms(b.resolvedAt));
    let racha: RetiroParaAlertas[] = [orden[0]];
    const cerrar = () => {
      if (racha.length < 2) return;
      const ids = racha.map((r) => r.id).sort();
      alertas.push({
        clave: `monto:${ids.join(",")}`,
        tipo: "mismo-monto",
        titulo: `${racha[0].partnerName}: ${racha.length} pagos de ${soles(racha[0].amount)} en menos de ${HORAS_MISMO_MONTO} h`,
        detalle: "Puede estar bien (pidió dos veces lo mismo). Si son retiros distintos, justifícalo; nada se bloquea ni se borra.",
        ids,
        partnerId: racha[0].partnerId,
      });
    };
    for (const f of orden.slice(1)) {
      if (ms(f.resolvedAt) - ms(racha[racha.length - 1].resolvedAt) <= ventana) racha.push(f);
      else {
        cerrar();
        racha = [f];
      }
    }
    cerrar();
  }

  // 3. Retiros que esperan pago hace más de 3 días.
  const limite = ahora.getTime() - DIAS_ESPERA_ALERTA * 86_400_000;
  const esperando = filas
    .filter((f) => (f.status === "pending" || f.status === "approved") && ms(f.createdAt) < limite)
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  if (esperando.length > 0) {
    const ids = esperando.map((f) => f.id).sort();
    const total = esperando.reduce((s, f) => s + f.amount, 0);
    alertas.push({
      clave: `espera:${ids.join(",")}`,
      tipo: "espera-larga",
      titulo: `${plural(esperando.length, "retiro espera", "retiros esperan")} pago hace más de ${DIAS_ESPERA_ALERTA} días`,
      detalle: `${soles(total)} en total; el más antiguo es de ${esperando[0].partnerName}. Págalo o recházalo con su motivo para que el repartidor sepa qué pasa.`,
      ids,
      partnerId: new Set(esperando.map((f) => f.partnerId)).size === 1 ? esperando[0].partnerId : null,
    });
  }

  // 4. Pagos por Yape o transferencia sin N.° de operación: no hay cómo cruzarlos con el banco.
  const sinRef = pagados.filter((f) => {
    const n = leerNotaRetiro(f.status, f.note);
    return (n.metodo === "Yape" || n.metodo === "Transferencia") && !n.referencia;
  });
  if (sinRef.length > 0) {
    const ids = sinRef.map((f) => f.id).sort();
    alertas.push({
      clave: `sinref:${ids.join(",")}`,
      tipo: "sin-referencia",
      titulo: `${plural(sinRef.length, "pago", "pagos")} por Yape o transferencia sin N.° de operación`,
      detalle: "Sin ese número no se pueden cruzar con tu estado de cuenta. La próxima vez, cópialo de la constancia al pagar.",
      ids,
      partnerId: new Set(sinRef.map((f) => f.partnerId)).size === 1 ? sinRef[0].partnerId : null,
    });
  }

  return alertas;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export interface RetiroParaCsv extends RetiroParaAlertas {
  partnerPhone: string;
  yapeNumber: string;
}

const ESTADO_CSV: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  paid: "Pagado",
  rejected: "Rechazado",
};

/** `lib/csv/celda.ts`: también frena el texto que Excel abriría como fórmula (una nota «=…»). */
const celda = celdaCsv;

/** «2026-10-17 14:05» en hora de Lima: Excel lo ordena como texto sin perder el día. */
function fechaHoraLima(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(new Date(v).getTime() - 5 * 3600_000);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export const COLUMNAS_CSV_RETIROS = [
  "Pidió",
  "Resuelto",
  "Repartidor",
  "Celular",
  "Yape",
  "Estado",
  "Monto",
  "Medio",
  "De la caja",
  "N.° de operación",
  "Motivo",
  "Nota",
] as const;

export function csvDeRetiros(filas: readonly RetiroParaCsv[]): string {
  const lineas = filas.map((f) => {
    const n = leerNotaRetiro(f.status, f.note);
    return [
      fechaHoraLima(f.createdAt),
      fechaHoraLima(f.resolvedAt),
      f.partnerName,
      f.partnerPhone,
      f.yapeNumber,
      ESTADO_CSV[f.status] ?? f.status,
      f.amount.toFixed(2),
      n.metodo ?? "",
      n.deCaja ? "Sí" : "",
      n.referencia ?? "",
      n.motivo ?? "",
      n.libre ?? "",
    ]
      .map(celda)
      .join(";");
  });
  return [COLUMNAS_CSV_RETIROS.join(";"), ...lineas].join("\r\n");
}
