/**
 * Cómo se gestiona una deuda: en qué tramo cae y qué se hizo con ella.
 *
 * La pantalla tenía tres cajones (al día / ≤60 / >60) y un booleano de
 * «recordado». Con eso no se puede trabajar: a los 90 días una deuda se
 * considera incobrable y eso cambia qué se hace con ella, y «prometió pagar el
 * viernes» no es lo mismo que «no contesta hace tres llamadas» aunque las dos
 * cuenten como «ya se le escribió».
 */

const DIA = 86_400_000;

// ── Tramos de antigüedad (los que usa un contador) ───────────────────────────

export const TRAMOS = [
  { id: "corriente", label: "Al día", detalle: "sin nada vencido", tono: "var(--data-success)", desde: -Infinity, hasta: 0 },
  { id: "t30", label: "1 a 30 días", detalle: "atraso reciente", tono: "var(--data-info)", desde: 1, hasta: 30 },
  { id: "t60", label: "31 a 60 días", detalle: "hay que insistir", tono: "var(--data-warning)", desde: 31, hasta: 60 },
  { id: "t90", label: "61 a 90 días", detalle: "última ventana", tono: "var(--data-warning)", desde: 61, hasta: 90 },
  { id: "t90mas", label: "Más de 90", detalle: "se da por incobrable", tono: "var(--data-error)", desde: 91, hasta: Infinity },
] as const;

export type TramoId = (typeof TRAMOS)[number]["id"];

/**
 * En qué tramo cae un atraso.
 *
 * Los cortes son 30/60/90 porque es como lo mira un contador y como se provisiona
 * una incobrable. Los tres cajones de antes mezclaban «se atrasó una semana» con
 * «hace dos meses que no aparece», que son gestiones distintas.
 */
export function tramoDe(dias: number): TramoId {
  if (dias <= 0) return "corriente";
  if (dias <= 30) return "t30";
  if (dias <= 60) return "t60";
  if (dias <= 90) return "t90";
  return "t90mas";
}

export function etiquetaTramo(id: TramoId): string {
  return TRAMOS.find((t) => t.id === id)?.label ?? id;
}

// ── Gestiones ────────────────────────────────────────────────────────────────

export const TIPOS_GESTION = [
  { id: "RECORDATORIO", label: "Le escribí", ayuda: "Se le mandó el recordatorio" },
  { id: "PROMESA", label: "Prometió pagar", ayuda: "Se comprometió a una fecha" },
  { id: "NO_CONTESTA", label: "No contesta", ayuda: "No respondió el mensaje ni la llamada" },
  { id: "REFINANCIAR", label: "Pidió más plazo", ayuda: "Quiere reprogramar la deuda" },
  { id: "VISITA", label: "Fui a verlo", ayuda: "Gestión presencial" },
  { id: "PAGO", label: "Pagó / entregó", ayuda: "Cumplió, total o en parte" },
  { id: "OTRO", label: "Otra cosa", ayuda: "" },
] as const;

export type TipoGestion = (typeof TIPOS_GESTION)[number]["id"];

export type Gestion = {
  id: string;
  beneficiarioId: string;
  fecha: string;
  tipo: string;
  nota?: string | null;
  fechaPrometida?: string | null;
  montoPrometido?: number | null;
  usuario?: string | null;
};

export function etiquetaGestion(tipo: string): string {
  return TIPOS_GESTION.find((t) => t.id === tipo)?.label ?? tipo;
}

/** La última gestión de cada persona, indexada para pintar la fila. */
export function ultimaGestionPorPersona(gestiones: readonly Gestion[]): Map<string, Gestion> {
  const out = new Map<string, Gestion>();
  for (const g of gestiones) {
    const previa = out.get(g.beneficiarioId);
    if (!previa || g.fecha > previa.fecha) out.set(g.beneficiarioId, g);
  }
  return out;
}

export type EstadoPromesa = "sin-promesa" | "prometio" | "vence-hoy" | "incumplio";

export type PromesaVigente = {
  gestion: Gestion;
  estado: Exclude<EstadoPromesa, "sin-promesa">;
  /** Días hasta la fecha prometida. Negativo = ya pasó. */
  faltan: number;
};

/**
 * La promesa que todavía cuenta, por persona.
 *
 * Sólo la MÁS RECIENTE: si alguien prometió el martes y volvió a prometer el
 * jueves, la del martes ya no se le reclama — se estaría discutiendo un
 * compromiso que la propia persona reemplazó.
 *
 * Una promesa incumplida NO se descarta: es justamente la que hay que reclamar,
 * y es el reclamo más fácil de sostener porque la fecha la puso el deudor.
 */
export function promesasVigentes(gestiones: readonly Gestion[], ahora: number = Date.now()): Map<string, PromesaVigente> {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);

  const ultimaPorPersona = new Map<string, Gestion>();
  for (const g of gestiones) {
    if (g.tipo !== "PROMESA" || !g.fechaPrometida) continue;
    const previa = ultimaPorPersona.get(g.beneficiarioId);
    if (!previa || g.fecha > previa.fecha) ultimaPorPersona.set(g.beneficiarioId, g);
  }

  const out = new Map<string, PromesaVigente>();
  for (const [id, g] of ultimaPorPersona) {
    const dia = new Date(g.fechaPrometida!);
    dia.setHours(0, 0, 0, 0);
    const faltan = Math.round((dia.getTime() - hoy.getTime()) / DIA);
    out.set(id, {
      gestion: g,
      faltan,
      estado: faltan > 0 ? "prometio" : faltan === 0 ? "vence-hoy" : "incumplio",
    });
  }
  return out;
}

/**
 * Cuánto hace que no se toca a alguien.
 *
 * `null` = nunca se lo gestionó. Es distinto de «hace mucho»: a quien nunca se
 * le escribió no se le puede reprochar que no haya pagado.
 */
export function diasSinGestion(ultima: Gestion | undefined, ahora: number = Date.now()): number | null {
  if (!ultima) return null;
  return Math.floor((ahora - new Date(ultima.fecha).getTime()) / DIA);
}

// ── Meta de recuperación ─────────────────────────────────────────────────────

export type AvanceMeta = {
  meta: number;
  recuperado: number;
  /** 0-100. Sin meta cargada es null: no hay contra qué medir. */
  porcentaje: number | null;
  falta: number;
};

/**
 * Cuánto se recuperó del mes contra lo que se quería recuperar.
 *
 * `recuperado` son las ENTREGAS del período, no los adelantos liquidados: una
 * entrega parcial también es plata que volvió, y esperar a que el adelanto
 * cierre entero hace que el tablero no se mueva en semanas.
 */
export function avanceDeMeta(meta: number, recuperado: number): AvanceMeta {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    meta: r2(meta),
    recuperado: r2(recuperado),
    porcentaje: meta > 0 ? Math.min(100, Math.max(0, Math.round((recuperado / meta) * 100))) : null,
    falta: r2(Math.max(0, meta - recuperado)),
  };
}

/** Lo entregado dentro del mes en curso, mirando las entregas una por una. */
export function recuperadoDelMes(
  adelantos: readonly { entregas: readonly { fecha: string; valor: number }[] }[],
  ahora: number = Date.now(),
): number {
  const hoy = new Date(ahora);
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
  let total = 0;
  for (const a of adelantos) {
    for (const e of a.entregas) {
      const t = new Date(e.fecha).getTime();
      if (t >= desde && t <= ahora) total += e.valor;
    }
  }
  return Math.round(total * 100) / 100;
}
