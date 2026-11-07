/**
 * ¿A qué cliente hay que cobrarle primero?
 *
 * Port de `lib/adelantos/urgencia-cobranza.ts`, adaptado a un modelo más
 * simple: un Fiado no tiene cuotas con fecha PACTADA (`FiadoCuota` sólo
 * registra CUÁNDO se pagó, no cuándo se esperaba) — así que acá sólo hay
 * dos bases posibles: `vencimiento` (el propio `Fiado.fechaVence`) o
 * `antiguedad` (si nunca se le puso fecha, se cae al tiempo desde que se
 * abrió — el mismo proxy que usa Adelantos para su modalidad sin cuotas).
 *
 * Tampoco hay multi-moneda: `Fiado.saldo` es siempre soles, así que a
 * diferencia de Adelantos acá NUNCA hace falta partir la fila por moneda.
 *
 * OJO — a diferencia del original: acá `fechaVence` casi siempre existe
 * (el alta de fiado la pide), así que un fiado con vencimiento futuro NO
 * puede caer en el proxy de antigüedad —eso lo mostraría "atrasado" sin
 * estarlo—. Se distingue: vencido → `dias` positivo; con fecha pero
 * todavía no vencido → `dias` ≤0 (tramo "al día"); sin fecha ninguna →
 * antigüedad desde que se abrió.
 */

export interface FiadoParaCobranza {
  id: string;
  customerId: string;
  customerName?: string | null;
  saldo: number;
  status: string;
  fechaVence?: string | null;
  createdAt: string;
}

export type BaseDeAtraso = "vencimiento" | "antiguedad";

export interface DeudorCobranza {
  /** customerId — no hay id de "persona" separado en Fiados. */
  id: string;
  nombre: string;
  /** == customerId: en Fiados el teléfono siempre está (es la clave del cliente). */
  telefono: string;
  saldo: number;
  /** Días de atraso. Positivo = ya se pasó; ≤0 = al día o sin fecha aún vencida. */
  dias: number;
  base: BaseDeAtraso;
  /** Cuántos fiados de esta persona ya pasaron su fecha de vencimiento. */
  fiadosVencidos: number;
  /** La fecha que se está usando como referencia, para poder mostrarla. */
  referencia: Date | null;
}

const DIA = 86_400_000;
const fecha = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Agrupa los fiados activos/vencidos por cliente y calcula su atraso real.
 *
 * @param ahora inyectable para poder probarlo sin depender de la fecha del día.
 */
export function deudoresDeCobranza(
  fiados: readonly FiadoParaCobranza[],
  ahora: number = Date.now(),
): DeudorCobranza[] {
  const porCliente = new Map<
    string,
    {
      customerId: string;
      nombre: string;
      saldo: number;
      /** Vencimiento YA pasado más viejo, de todos sus fiados. */
      vencidoMasViejo: Date | null;
      /** El próximo vencimiento (todavía no llega), el más cercano. */
      proximoVencimiento: Date | null;
      fiadosVencidos: number;
      /** El fiado más viejo, de respaldo cuando NADIE de sus fiados tiene fecha. */
      fiadoMasViejo: number;
    }
  >();

  for (const f of fiados) {
    if (f.status !== "ACTIVO" && f.status !== "VENCIDO") continue;
    if (!(f.saldo > 0)) continue;

    const acc =
      porCliente.get(f.customerId) ??
      {
        customerId: f.customerId,
        nombre: f.customerName?.trim() || f.customerId,
        saldo: 0,
        vencidoMasViejo: null,
        proximoVencimiento: null,
        fiadosVencidos: 0,
        fiadoMasViejo: Number.POSITIVE_INFINITY,
      };

    acc.saldo += f.saldo;
    const abierto = fecha(f.createdAt)?.getTime() ?? ahora;
    if (abierto < acc.fiadoMasViejo) acc.fiadoMasViejo = abierto;

    const vence = fecha(f.fechaVence);
    if (vence) {
      if (vence.getTime() <= ahora) {
        acc.fiadosVencidos += 1;
        if (!acc.vencidoMasViejo || vence < acc.vencidoMasViejo) acc.vencidoMasViejo = vence;
      } else if (!acc.proximoVencimiento || vence < acc.proximoVencimiento) {
        acc.proximoVencimiento = vence;
      }
    }

    porCliente.set(f.customerId, acc);
  }

  return [...porCliente.values()].map((d) => {
    let referencia: Date | null;
    let base: BaseDeAtraso;
    let dias: number;

    if (d.vencidoMasViejo) {
      referencia = d.vencidoMasViejo;
      base = "vencimiento";
      dias = Math.floor((ahora - referencia.getTime()) / DIA);
    } else if (d.proximoVencimiento) {
      // Tiene fecha pero todavía no llegó: nunca "atrasado" por antigüedad.
      referencia = d.proximoVencimiento;
      base = "vencimiento";
      dias = Math.min(0, Math.floor((ahora - referencia.getTime()) / DIA));
    } else {
      referencia = Number.isFinite(d.fiadoMasViejo) ? new Date(d.fiadoMasViejo) : null;
      base = "antiguedad";
      dias = referencia ? Math.floor((ahora - referencia.getTime()) / DIA) : 0;
    }

    return {
      id: d.customerId,
      nombre: d.nombre,
      telefono: d.customerId,
      saldo: d.saldo,
      dias,
      base,
      fiadosVencidos: d.fiadosVencidos,
      referencia,
    };
  });
}

/**
 * El orden de la lista de cobranza: primero quien tiene una fecha rota
 * (vencimiento), y dentro de cada grupo, el más atrasado.
 */
export function ordenarPorUrgencia(deudores: readonly DeudorCobranza[]): DeudorCobranza[] {
  const peso: Record<BaseDeAtraso, number> = { vencimiento: 0, antiguedad: 1 };
  return [...deudores].sort((a, b) => {
    if (a.base !== b.base) return peso[a.base] - peso[b.base];
    if (a.dias !== b.dias) return b.dias - a.dias;
    return b.saldo - a.saldo;
  });
}

/** Cómo se explica el número de días, sin prometer lo que no se sabe. */
export function explicarAtraso(d: DeudorCobranza): string {
  if (d.base === "vencimiento") {
    return d.fiadosVencidos === 1
      ? `Se tenía que pagar hace ${d.dias} día${d.dias === 1 ? "" : "s"}`
      : `${d.fiadosVencidos} fiados vencidos; el más viejo hace ${d.dias} días`;
  }
  return `Sin fecha de vencimiento: ${d.dias} día${d.dias === 1 ? "" : "s"} desde que se abrió`;
}
