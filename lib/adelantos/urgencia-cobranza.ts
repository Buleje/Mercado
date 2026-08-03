/**
 * ¿A quién hay que cobrarle primero?
 *
 * EL BUG QUE CORRIGE. La pantalla etiquetaba «Al día / Vencido / Crítico»
 * mirando los días transcurridos desde que se dio el adelanto. Eso no es
 * vencimiento: es antigüedad. Un adelanto de 45 días cuya entrega está pactada
 * para el mes que viene salía «Vencido», y uno de 20 días con una entrega que se
 * incumplió hace cinco salía «Al día». La cobranza terminaba apuntando a la
 * persona equivocada.
 *
 * LA REGLA. Si el adelanto tiene entregas pactadas con fecha, el atraso se mide
 * contra **la pactada incumplida más vieja**: eso es lo que se rompió. Si no hay
 * fecha pactada —la modalidad de cuenta corriente no la tiene— se cae a la
 * antigüedad, que es el único proxy disponible, y se dice que es un proxy.
 *
 * Vive fuera del componente porque decide plata: se prueba sin renderizar nada.
 */

/** Una entrega que se pactó para una fecha. `cumplidaEn` la saca de la cuenta. */
export interface PactadaParaCobranza {
  fechaEsperada?: string | Date | null;
  cumplidaEn?: string | Date | null;
  valorEsperado?: number | null;
}

export interface AdelantoParaCobranza {
  beneficiarioId: string;
  saldoPendiente: number;
  fechaAdelanto: string | Date;
  status?: string;
  beneficiario?: { nombre?: string | null; telefono?: string | null } | null;
  entregasPactadas?: PactadaParaCobranza[] | null;
}

/** Cómo se llegó al número de días: cambia lo que la pantalla puede afirmar. */
export type BaseDeAtraso = "pactada" | "antiguedad";

export interface DeudorCobranza {
  id: string;
  nombre: string;
  telefono: string | null;
  saldo: number;
  /** Días de atraso. Positivo = ya se pasó; negativo = todavía falta. */
  dias: number;
  base: BaseDeAtraso;
  /** Cuántas entregas pactadas se pasaron de fecha sin cumplirse. */
  pactadasVencidas: number;
  /** La fecha que se está usando como referencia, para poder mostrarla. */
  referencia: Date | null;
}

export type BucketCobranza = "d0" | "d30" | "d60";

const DIA = 86_400_000;
const fecha = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * El bucket por días de atraso. Se mantienen los tres de siempre para no
 * reeducar a nadie, pero ahora los días significan lo que dicen.
 */
export function bucketDe(dias: number): BucketCobranza {
  return dias > 60 ? "d60" : dias > 30 ? "d30" : "d0";
}

/**
 * Agrupa los adelantos abiertos por persona y calcula su atraso real.
 *
 * @param ahora inyectable para poder probarlo sin depender de la fecha del día.
 */
export function deudoresDeCobranza(
  adelantos: readonly AdelantoParaCobranza[],
  ahora: number = Date.now(),
): DeudorCobranza[] {
  const porPersona = new Map<
    string,
    {
      nombre: string;
      telefono: string | null;
      saldo: number;
      /** La pactada incumplida más vieja de TODOS sus adelantos. */
      pactadaMasVieja: Date | null;
      pactadasVencidas: number;
      /** El adelanto más viejo, de respaldo. */
      adelantoMasViejo: number;
    }
  >();

  for (const a of adelantos) {
    if (a.status && a.status !== "ABIERTO") continue;
    if (!(a.saldoPendiente > 0)) continue;

    const k = a.beneficiarioId;
    const acc =
      porPersona.get(k) ??
      {
        nombre: a.beneficiario?.nombre ?? "—",
        telefono: a.beneficiario?.telefono ?? null,
        saldo: 0,
        pactadaMasVieja: null,
        pactadasVencidas: 0,
        adelantoMasViejo: Number.POSITIVE_INFINITY,
      };

    acc.saldo += a.saldoPendiente;
    const dado = fecha(a.fechaAdelanto)?.getTime() ?? ahora;
    if (dado < acc.adelantoMasViejo) acc.adelantoMasViejo = dado;

    for (const p of a.entregasPactadas ?? []) {
      // Una entrega ya cumplida no debe nada, por tarde que se haya cumplido.
      if (p.cumplidaEn) continue;
      const esperada = fecha(p.fechaEsperada);
      if (!esperada || esperada.getTime() > ahora) continue; // todavía no vence
      acc.pactadasVencidas += 1;
      if (!acc.pactadaMasVieja || esperada < acc.pactadaMasVieja) acc.pactadaMasVieja = esperada;
    }

    porPersona.set(k, acc);
  }

  return [...porPersona.entries()].map(([id, d]) => {
    // La pactada incumplida manda: es un compromiso roto con fecha y nombre.
    const referencia = d.pactadaMasVieja ?? (Number.isFinite(d.adelantoMasViejo) ? new Date(d.adelantoMasViejo) : null);
    const base: BaseDeAtraso = d.pactadaMasVieja ? "pactada" : "antiguedad";
    const dias = referencia ? Math.floor((ahora - referencia.getTime()) / DIA) : 0;
    return {
      id,
      nombre: d.nombre,
      telefono: d.telefono,
      saldo: d.saldo,
      dias,
      base,
      pactadasVencidas: d.pactadasVencidas,
      referencia,
    };
  });
}

/**
 * El orden de la lista de cobranza.
 *
 * Primero quien rompió un compromiso —tiene fecha y nombre, es el reclamo más
 * fácil de sostener— y dentro de cada grupo, el más atrasado. Ordenar sólo por
 * días mezclaría "te debe hace 90 días sin fecha pactada" con "te falló la
 * entrega que prometió para el martes", y no son lo mismo.
 */
export function ordenarPorUrgencia(deudores: readonly DeudorCobranza[]): DeudorCobranza[] {
  return [...deudores].sort((a, b) => {
    if (a.base !== b.base) return a.base === "pactada" ? -1 : 1;
    if (a.dias !== b.dias) return b.dias - a.dias;
    return b.saldo - a.saldo;
  });
}

/** Cómo se explica el número de días, sin prometer lo que no se sabe. */
export function explicarAtraso(d: DeudorCobranza): string {
  if (d.base === "pactada") {
    return d.pactadasVencidas === 1
      ? `1 entrega pactada sin cumplir, vencida hace ${d.dias} día${d.dias === 1 ? "" : "s"}`
      : `${d.pactadasVencidas} entregas pactadas sin cumplir; la más vieja hace ${d.dias} días`;
  }
  return `Sin fecha pactada: ${d.dias} día${d.dias === 1 ? "" : "s"} desde que se dio el adelanto`;
}
