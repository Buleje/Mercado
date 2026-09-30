/**
 * ¿Qué plata que diste está suelta?
 *
 * EL CASO QUE LO PIDIÓ (Blas, 2026-09-30). De 6 adelantos abiertos, 5 no tenían
 * fecha de vencimiento, y el más grande —S/ 17 000 del 03/08— llevaba casi dos
 * meses sin una sola entrega y con el saldo intacto. Ninguna pantalla lo
 * señalaba: Cobranza lo ordenaba por antigüedad, igual que a cualquier otro, y
 * «Vence esta semana» no puede avisar de algo que no tiene fecha.
 *
 * LA REGLA. Un adelanto DADO y ABIERTO, con saldo, está «sin control» si pasa
 * al menos una de estas cosas:
 *   (a) lleva ≥ 30 días sin ninguna entrega (no anulada). Se cuenta desde la
 *       última entrega o, si no hubo ninguna, desde que se dio el adelanto;
 *   (b) no tiene fecha para devolverlo: ni `fechaVencimiento` ni una cuota
 *       pactada pendiente con fecha (un plan con fechas SÍ es una fecha);
 *   (c) está vencido: la fecha de devolución, o una cuota pactada pendiente,
 *       ya pasó.
 *
 * Los días son días de Lima (`limaDateKey`), no de UTC: a las 20:00 en Pucallpa
 * el UTC ya es mañana, y un «vence hoy» saldría vencido.
 *
 * Lo RECIBIDO queda afuera (ADR-448): esa plata la debe el negocio, no la
 * persona; no es plata que se escape.
 *
 * Vive fuera del componente y de la DB class porque decide qué se le reclama a
 * quién: se prueba sin base y sin renderizar.
 */

import { limaDateKey } from "@/lib/utils";
import { esRecibido } from "@/lib/adelantos/direccion";

/** Días sin entregas a partir de los cuales un adelanto se da por quieto. */
export const DIAS_SIN_ENTREGA = 30;

export type MotivoSinControl = "sin-entregas" | "sin-vencimiento" | "vencido";

export interface MotivoConTexto {
  codigo: MotivoSinControl;
  /** Una línea en español, lista para mostrar. */
  texto: string;
}

type Fecha = string | Date;

/** Lo mínimo que la regla necesita de un adelanto (sirve la fila de la base o `DbAdelanto`). */
export interface AdelantoParaControl {
  id: string;
  codigoOperacion?: string | null;
  beneficiarioId: string;
  nombre?: string | null;
  status: string;
  /** Sin dirección = DADO (filas de antes de ADR-448). */
  direccion?: string | null;
  saldoPendiente: number;
  moneda?: string | null;
  fechaAdelanto: Fecha;
  fechaVencimiento?: Fecha | null;
  /** El permiso al que está atado (no decide la regla: la pantalla lo ofrece atar). */
  contratoId?: string | null;
  /** Las entregas; las que traen `anuladaAt` no cuentan (ADR-413 §7). */
  entregas?: readonly { fecha: Fecha; anuladaAt?: Fecha | null }[] | null;
  entregasPactadas?: readonly { numero?: number | null; fechaEsperada?: Fecha | null; cumplidaEn?: Fecha | null }[] | null;
}

export interface AdelantoSinControl {
  id: string;
  codigoOperacion: string | null;
  beneficiarioId: string;
  nombre: string;
  saldoPendiente: number;
  moneda: string;
  /** ISO de cuando se dio. */
  fechaAdelanto: string;
  /** ISO de la fecha de devolución, si tiene: la fila la ofrece cambiar. */
  fechaVencimiento?: string | null;
  /** El permiso al que está atado, si tiene. */
  contratoId?: string | null;
  motivos: MotivoConTexto[];
}

export interface ResumenSinControl {
  cantidad: number;
  /** Saldo por cobrar de estos adelantos, por moneda — nunca sumado cruzado (ADR-118). */
  porMoneda: Record<string, number>;
  /** El de más saldo primero. */
  adelantos: AdelantoSinControl[];
}

const DIA = 86_400_000;

/** «2026-08-03» → ms UTC de ese día. Aritmética de días sobre claves, sin husos. */
function msDeClave(clave: string): number {
  const [y, m, d] = clave.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Días entre dos claves de día (b − a). `null` si alguna está vacía. */
function diasEntreClaves(ka: string, kb: string): number | null {
  if (!ka || !kb) return null;
  return Math.round((msDeClave(kb) - msDeClave(ka)) / DIA);
}

/**
 * Días de Lima entre dos instantes (b − a). Recibe INSTANTES, nunca claves:
 * `limaDateKey("2026-08-03")` lee medianoche UTC y devuelve el día 2.
 */
function diasLima(a: Fecha, b: Fecha): number | null {
  return diasEntreClaves(limaDateKey(a), limaDateKey(b));
}

/** «2026-08-03» → «03/08/2026». A mano: `Intl` cambia de formato según la versión de ICU. */
function claveCorta(clave: string): string {
  if (!clave) return "—";
  const [y, m, d] = clave.split("-");
  return `${d}/${m}/${y}`;
}

const diaCorto = (v: Fecha): string => claveCorta(limaDateKey(v));

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * Los motivos por los que un adelanto está sin control. Vacío = está bajo
 * control, o no le aplica (no está abierto, es recibido o no tiene saldo).
 *
 * @param ahora inyectable para probar sin depender del día.
 */
export function motivosSinControl(a: AdelantoParaControl, ahora: Date = new Date()): MotivoConTexto[] {
  if (a.status !== "ABIERTO" || !(a.saldoPendiente > 0) || esRecibido(a)) return [];

  const motivos: MotivoConTexto[] = [];

  /* (a) Quieto: días desde la última entrega viva, o desde que se dio. */
  const ultima = (a.entregas ?? [])
    .filter((e) => !e.anuladaAt && limaDateKey(e.fecha))
    .map((e) => limaDateKey(e.fecha))
    .sort()
    .at(-1);
  const quieto = diasEntreClaves(ultima ?? limaDateKey(a.fechaAdelanto), limaDateKey(ahora));
  if (quieto != null && quieto >= DIAS_SIN_ENTREGA) {
    motivos.push({
      codigo: "sin-entregas",
      texto: ultima
        ? `Sin entregas hace ${quieto} días (la última el ${claveCorta(ultima)})`
        : `Ninguna entrega en ${quieto} días desde que se dio`,
    });
  }

  /* (b) y (c) Las fechas comprometidas: la de devolución y las cuotas pendientes. */
  const cuotas = (a.entregasPactadas ?? []).filter((p) => !p.cumplidaEn && p.fechaEsperada && limaDateKey(p.fechaEsperada));
  const vence = a.fechaVencimiento && limaDateKey(a.fechaVencimiento) ? a.fechaVencimiento : null;

  if (!vence && cuotas.length === 0) {
    motivos.push({ codigo: "sin-vencimiento", texto: "Sin fecha de vencimiento" });
    return motivos;
  }

  /* Vencido: el compromiso pasado más viejo. Vence HOY todavía no es vencido. */
  const pasados: { dias: number; texto: (d: number) => string }[] = [];
  if (vence) {
    const d = diasLima(vence, ahora);
    if (d != null && d > 0) {
      pasados.push({ dias: d, texto: (n) => `Vencido hace ${n} ${plural(n, "día", "días")} (el ${diaCorto(vence)})` });
    }
  }
  for (const p of cuotas) {
    const d = diasLima(p.fechaEsperada as Fecha, ahora);
    if (d != null && d > 0) {
      const cual = p.numero != null ? `La cuota ${p.numero}` : "Una cuota";
      pasados.push({ dias: d, texto: (n) => `${cual} venció hace ${n} ${plural(n, "día", "días")} sin cumplirse` });
    }
  }
  const peor = pasados.sort((x, y) => y.dias - x.dias)[0];
  if (peor) motivos.push({ codigo: "vencido", texto: peor.texto(peor.dias) });

  return motivos;
}

/**
 * La cuenta del aviso: cuántos, cuánta plata (por moneda) y cuáles, del de más
 * saldo al de menos — el que más plata tiene suelta es el primero que hay que
 * mirar.
 */
export function resumirSinControl(adelantos: readonly AdelantoParaControl[], ahora: Date = new Date()): ResumenSinControl {
  const filas: AdelantoSinControl[] = [];
  const porMoneda: Record<string, number> = {};

  for (const a of adelantos) {
    const motivos = motivosSinControl(a, ahora);
    if (motivos.length === 0) continue;
    const moneda = a.moneda || "PEN";
    porMoneda[moneda] = Math.round(((porMoneda[moneda] ?? 0) + a.saldoPendiente) * 100) / 100;
    filas.push({
      id: a.id,
      codigoOperacion: a.codigoOperacion ?? null,
      beneficiarioId: a.beneficiarioId,
      nombre: a.nombre?.trim() || "—",
      saldoPendiente: Math.round(a.saldoPendiente * 100) / 100,
      moneda,
      fechaAdelanto: a.fechaAdelanto instanceof Date ? a.fechaAdelanto.toISOString() : a.fechaAdelanto,
      fechaVencimiento: a.fechaVencimiento instanceof Date ? a.fechaVencimiento.toISOString() : (a.fechaVencimiento ?? null),
      contratoId: a.contratoId ?? null,
      motivos,
    });
  }

  filas.sort((x, y) => y.saldoPendiente - x.saldoPendiente);
  return { cantidad: filas.length, porMoneda, adelantos: filas };
}
