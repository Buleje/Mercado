/**
 * «A quién fiarle» (Mi Plata › Por cobrar y pagar › Fiarle) — la respuesta por
 * cliente: Sí, Con cuidado o No, con el motivo en una línea.
 *
 * ## Por qué existe (medido 11-10 en `main`)
 *
 * La vista armaba un puntaje 0-100 EN EL NAVEGADOR con `/api/customers` +
 * `/api/fiados` y no acertaba ni un dato: unía el fiado al cliente por `id`
 * (el fiado guarda el TELÉFONO), leía `amount`/`paidAmount` (la API manda
 * `total`/`saldo`) y buscaba `status === "pagado"` (el enum es `PAGADO`). Los
 * 15 clientes salían «Bueno · Sin historial · fiado —», incluido Cliente 4455,
 * que debe S/ 150 vencidos hace 71 días. Y el «Límite recomendado» (500/200/
 * 80/20) no era el que aplica la caja: la caja usa `Customer.creditLimit`.
 *
 * ## La regla es la de la caja, no una nueva
 *
 * «No» = lo que la caja ya rechaza al fiar (`FiadosDB.validateForNewFiado`):
 * 3 o más fiados vencidos, un fiado vencido hace más de 60 días, o la deuda ya
 * llegó a su límite. Desde el 11-10 la caja también cuenta ACTIVO y VENCIDO
 * (el cron pasa a VENCIDO lo que vence) y el corte de los 60 días es el mismo:
 * desde el día 60 después del vencimiento.
 *
 * «Con cuidado» = debe algo vencido (sin llegar a bloquearse) o ya usó el 80 %
 * de su límite. El resto, «Sí».
 *
 * PURO: sin Prisma ni React; `hoy` llega por parámetro (`YYYY-MM-DD`).
 */

export type Veredicto = "si" | "cuidado" | "no";

/** Lo que dice la caja: los números con los que decide si fía. */
export const REGLA_CAJA = {
  /** Con esta cantidad de fiados vencidos la caja no fía más. */
  vencidosParaBloquear: 3,
  /** Un fiado abierto vencido hace más de estos días bloquea al cliente. */
  diasDeAtrasoParaBloquear: 60,
  /** Desde esta parte del límite usado, «con cuidado». */
  usoDelLimiteParaCuidado: 0.8,
} as const;

/** Lo que el servidor junta de cada cliente (todo en soles). */
export interface ClienteParaFiar {
  telefono: string;
  nombre: string;
  /** 0 = sin tope (así lo lee la caja). */
  limite: number;
  /** Saldo de sus fiados ACTIVO + VENCIDO. */
  deuda: number;
  /** La parte de `deuda` ya vencida (VENCIDO o ACTIVO con la fecha pasada). */
  vencido: number;
  /** Fiados que tuvo, sin contar los cancelados. */
  fiados: number;
  pagados: number;
  /** Fiados con estado VENCIDO (los que cuenta la caja para bloquear). */
  vencidosEstado: number;
  /** `YYYY-MM-DD` del vencimiento más viejo entre sus fiados abiertos con saldo, o null. */
  venceMasViejo: string | null;
  compras: number;
  ultimaCompra: string | null;
}

export interface FilaFiarle extends ClienteParaFiar {
  veredicto: Veredicto;
  /** Una línea, en tuteo: por qué. */
  motivo: string;
  /** Lo que le queda de su límite; null = sin tope. */
  disponible: number | null;
  /** Días del atraso más viejo (0 = nada vencido). */
  diasAtraso: number;
}

export interface ResumenFiarle {
  clientes: number;
  si: number;
  cuidado: number;
  no: number;
  /** Σ deuda (céntimos al sumar). */
  deuda: number;
  vencido: number;
  /** Clientes que nunca llevaron fiado. */
  sinHistorial: number;
}

const soles = (n: number) =>
  `S/ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El veredicto de un cliente y su motivo. */
export function decidirFiado(c: ClienteParaFiar, hoy: string): Pick<FilaFiarle, "veredicto" | "motivo" | "disponible" | "diasAtraso"> {
  const diasAtraso = c.deuda > 0 && c.venceMasViejo ? Math.max(0, diasEntre(c.venceMasViejo, hoy)) : 0;
  const disponible = c.limite > 0 ? Math.max(0, Math.round((c.limite - c.deuda) * 100) / 100) : null;
  const con = (veredicto: Veredicto, motivo: string) => ({ veredicto, motivo, disponible, diasAtraso });

  if (c.vencidosEstado >= REGLA_CAJA.vencidosParaBloquear) {
    return con("no", `Tiene ${c.vencidosEstado} fiados vencidos: la caja ya no le fía`);
  }
  /* `>=`, no `>`: la caja bloquea con `fechaVence < ahora − 60 d`, o sea desde el día 60 mismo
     (la fecha de vencimiento es medianoche). Con `>` quien venció el 12-08 salía «Con cuidado ·
     60 días» el 11-10 mientras la caja ya lo rechazaba (reviewer 11-10). */
  if (diasAtraso >= REGLA_CAJA.diasDeAtrasoParaBloquear) {
    return con("no", `Debe ${soles(c.vencido)} vencido hace ${diasAtraso} días`);
  }
  if (c.limite > 0 && c.deuda >= c.limite) {
    return con("no", `Ya usó su límite de ${soles(c.limite)}`);
  }
  if (c.vencido > 0) {
    return con("cuidado", `Debe ${soles(c.vencido)} vencido${diasAtraso > 0 ? ` hace ${plural(diasAtraso, "día", "días")}` : ""}`);
  }
  if (c.limite > 0 && c.deuda >= c.limite * REGLA_CAJA.usoDelLimiteParaCuidado) {
    return con("cuidado", `Le quedan ${soles(disponible ?? 0)} de su límite`);
  }
  if (c.fiados === 0) {
    return con("si", c.compras > 0 ? `Nunca le fiaste; compró ${plural(c.compras, "vez", "veces")}` : "Nunca le fiaste ni compró: empieza con poco");
  }
  if (c.deuda > 0) return con("si", `Debe ${soles(c.deuda)}, al día`);
  return con("si", c.pagados === c.fiados ? `Pagó ${c.fiados === 1 ? "su fiado" : `sus ${c.fiados} fiados`}` : `Pagó ${c.pagados} de ${c.fiados} fiados`);
}

const ORDEN: Record<Veredicto, number> = { no: 0, cuidado: 1, si: 2 };

/**
 * Las filas con su veredicto, ordenadas para decidir rápido: primero a quién
 * NO fiarle, después «con cuidado», dentro de cada grupo el que más debe; los
 * que nunca llevaron fiado van al final (por nombre).
 */
export function armarAQuienFiarle(clientes: readonly ClienteParaFiar[], hoy: string): { filas: FilaFiarle[]; resumen: ResumenFiarle } {
  const filas = clientes.map((c) => ({ ...c, ...decidirFiado(c, hoy) }));
  filas.sort(
    (a, b) =>
      ORDEN[a.veredicto] - ORDEN[b.veredicto] ||
      Number(b.fiados > 0) - Number(a.fiados > 0) ||
      b.deuda - a.deuda ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
  const cent = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100;
  return {
    filas,
    resumen: {
      clientes: filas.length,
      si: filas.filter((f) => f.veredicto === "si").length,
      cuidado: filas.filter((f) => f.veredicto === "cuidado").length,
      no: filas.filter((f) => f.veredicto === "no").length,
      deuda: cent(filas.map((f) => f.deuda)),
      vencido: cent(filas.map((f) => f.vencido)),
      sinHistorial: filas.filter((f) => f.fiados === 0).length,
    },
  };
}
