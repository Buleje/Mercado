/**
 * lib/superadmin/nivel-aviso.ts — el NIVEL de cada aviso del centro de
 * notificaciones del superadmin (Brandon 2026-10-18: «cada uno con su categoría
 * clasificado de urgente, leve y demás etiquetas»).
 *
 * Single source: el servidor (`/api/superadmin/notifications/inbox`) lo calcula
 * con estas reglas y el cliente sólo lo pinta y lo filtra. Puro (sin Prisma ni
 * `server-only`): el modal importa de acá los tipos y el orden.
 *
 * Los cuatro niveles dicen CUÁNDO hay que actuar:
 *   · urgente      — hoy: algo roto que sigue pasando, plata o un cliente esperando
 *   · importante   — esta semana
 *   · leve         — cuando haya tiempo: viejo o quieto
 *   · informativo  — para que lo sepas, no pide nada tuyo
 *
 * Reglas medidas con los datos reales del 18-10 (106 avisos): «riesgo crítico =
 * urgente» marcaba las 12 tiendas de la cola de rescate, incluidas Blas, Musa y
 * Buleje, que venden todos los días (el puntaje bajo les viene de otra señal) y
 * dos tiendas apagadas. Doce rojos falsos enseñan a ignorar el rojo: por eso
 * cada regla mira cuánto hace, no sólo la etiqueta de origen.
 */

export type Nivel = "urgente" | "importante" | "leve" | "informativo";

/** Orden de lectura: lo que se atiende primero va primero. */
export const NIVELES: readonly Nivel[] = ["urgente", "importante", "leve", "informativo"];

export const NIVEL_ETIQUETA: Record<Nivel, string> = {
  urgente: "Urgente",
  importante: "Importante",
  leve: "Leve",
  informativo: "Informativo",
};

/** Las categorías = los grupos de la bandeja (la clave del bucket). */
export type CategoriaAviso =
  | "atRisk"
  | "panelErrors"
  | "paymentProofs"
  | "paymentApprovals"
  | "vendorApplications"
  | "pendingOrders";

export const CATEGORIAS: readonly CategoriaAviso[] = [
  "atRisk",
  "panelErrors",
  "paymentProofs",
  "paymentApprovals",
  "vendorApplications",
  "pendingOrders",
];

export interface NivelConMotivo {
  nivel: Nivel;
  /** Por qué ese nivel, en una frase corta («Sigue pasando: visto hace 18 h»). */
  motivo: string;
}

export type ConteoNiveles = Record<Nivel, number>;

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Umbrales con nombre: el route los usa para contar los pedidos sin bajarlos todos. */
export const UMBRALES = {
  /** Error de panel: visto en estas horas y con estas repeticiones = sigue pasando. */
  errorSiguePasandoHoras: 24,
  errorSiguePasandoVeces: 5,
  /** Error con cientos de repeticiones visto en estos días = urgente igual. */
  errorMuchasVeces: 100,
  errorMuchasVecesDias: 3,
  /** Pedido: hasta estas horas está en curso; pasados estos días, olvidado. */
  pedidoEnCursoHoras: 2,
  pedidoOlvidadoDias: 3,
  /** Yape detectado: el cliente espera desde estos minutos. */
  yapeEsperaMinutos: 30,
  /** Comprobante de apertura: pagó y no tiene tienda desde estas horas. */
  aperturaEsperaHoras: 12,
  /** Solicitud de tienda: urgente desde estos días, vieja pasados estos otros. */
  solicitudUrgenteDias: 2,
  solicitudViejaDias: 14,
} as const;

export function nivelesVacios(): ConteoNiveles {
  return { urgente: 0, importante: 0, leve: 0, informativo: 0 };
}

/** «18 h», «45 min», «3 d» — cuánto pasó, para el motivo. */
export function duracionCorta(ms: number): string {
  const m = Math.max(0, Math.floor(ms / MIN));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

function msDesde(fecha: Date | string, ahora: Date): number {
  return ahora.getTime() - new Date(fecha).getTime();
}

/** Negocio en la cola de rescate (TenantHealthScore + Tenant). */
export function nivelNegocioEnRiesgo(r: {
  riskLevel: string;
  active: boolean;
  daysSinceLastOrder: number;
  trialDaysLeft: number | null;
}): NivelConMotivo {
  const dias = r.daysSinceLastOrder;
  const prueba = r.trialDaysLeft;
  if (!r.active) return { nivel: "informativo", motivo: "Tienda apagada" };
  if (prueba != null && prueba >= 0 && prueba <= 3) {
    return { nivel: "urgente", motivo: prueba === 0 ? "La prueba vence hoy" : `La prueba vence en ${prueba} d` };
  }
  const enRiesgo = r.riskLevel === "critical" || r.riskLevel === "high";
  if (r.riskLevel === "critical" && dias >= 7 && dias <= 30) {
    return { nivel: "urgente", motivo: `Dejó de vender hace ${dias} d` };
  }
  if (prueba != null && prueba < 0) return { nivel: "importante", motivo: "La prueba ya venció" };
  if (enRiesgo && dias >= 7 && dias <= 90) return { nivel: "importante", motivo: `${dias} d sin vender` };
  if (dias > 90) return { nivel: "leve", motivo: `${dias} d sin vender: rescate largo` };
  return { nivel: "leve", motivo: "Puntaje bajo, pero vende" };
}

/** Error del panel admin de un negocio (ClientErrorLog sin resolver). */
export function nivelErrorDePanel(e: { count: number; lastSeenAt: Date | string }, ahora: Date): NivelConMotivo {
  const ms = msDesde(e.lastSeenAt, ahora);
  const veces = `${e.count} ${e.count === 1 ? "vez" : "veces"}`;
  const hace = duracionCorta(ms);
  const u = UMBRALES;
  if (ms <= u.errorSiguePasandoHoras * HORA && e.count >= u.errorSiguePasandoVeces) {
    return { nivel: "urgente", motivo: `Sigue pasando: visto hace ${hace}, ${veces}` };
  }
  if (e.count >= u.errorMuchasVeces && ms <= u.errorMuchasVecesDias * DIA) {
    return { nivel: "urgente", motivo: `${veces}, visto hace ${hace}` };
  }
  if (ms <= 7 * DIA) return { nivel: "importante", motivo: `Visto esta semana, ${veces}` };
  if (e.count >= u.errorMuchasVeces && ms <= 30 * DIA) {
    return { nivel: "importante", motivo: `${veces} este mes` };
  }
  return { nivel: "leve", motivo: `Quieto hace ${hace}, ${veces}` };
}

/** Solicitud para sumarse al marketplace. */
export function nivelSolicitudTienda(v: { status: string; submittedAt: Date | string }, ahora: Date): NivelConMotivo {
  if (v.status === "info_requested") return { nivel: "informativo", motivo: "Esperando datos del solicitante" };
  const ms = msDesde(v.submittedAt, ahora);
  const hace = duracionCorta(ms);
  if (ms > UMBRALES.solicitudViejaDias * DIA) return { nivel: "leve", motivo: `Solicitud vieja: lleva ${hace}` };
  if (ms >= UMBRALES.solicitudUrgenteDias * DIA) return { nivel: "urgente", motivo: `Lleva ${hace} sin respuesta` };
  return { nivel: "importante", motivo: "Nueva: contéstala hoy" };
}

/** Yape detectado por Yape Vision que espera revisión. La plata nunca es «leve». */
export function nivelAprobacionYape(p: { status: string; createdAt: Date | string }, ahora: Date): NivelConMotivo {
  const ms = msDesde(p.createdAt, ahora);
  const hace = duracionCorta(ms);
  if (ms > 7 * DIA) return { nivel: "importante", motivo: `Espera hace ${hace}` };
  if (p.status === "review_required") return { nivel: "urgente", motivo: "Hay que revisarlo a mano" };
  if (ms >= UMBRALES.yapeEsperaMinutos * MIN) return { nivel: "urgente", motivo: `El cliente espera hace ${hace}` };
  return { nivel: "importante", motivo: "Recién llegó" };
}

/** Comprobante de pago para abrir una tienda. */
export function nivelComprobanteApertura(p: { createdAt: Date | string }, ahora: Date): NivelConMotivo {
  const ms = msDesde(p.createdAt, ahora);
  const hace = duracionCorta(ms);
  if (ms > 7 * DIA) return { nivel: "importante", motivo: `Espera hace ${hace}` };
  if (ms >= UMBRALES.aperturaEsperaHoras * HORA) {
    return { nivel: "urgente", motivo: `Pagó hace ${hace} y no tiene tienda` };
  }
  return { nivel: "importante", motivo: "Pagó para abrir su tienda" };
}

/** Pedido de cualquier tienda en estado pendiente o confirmado. */
export function nivelPedidoSinAtender(o: { createdAt: Date | string }, ahora: Date): NivelConMotivo {
  const ms = msDesde(o.createdAt, ahora);
  const hace = duracionCorta(ms);
  if (ms <= UMBRALES.pedidoEnCursoHoras * HORA) return { nivel: "informativo", motivo: "En curso" };
  if (ms > UMBRALES.pedidoOlvidadoDias * DIA) return { nivel: "leve", motivo: `Olvidado hace ${hace}` };
  return { nivel: "importante", motivo: `Sin atender hace ${hace}` };
}

/**
 * Los cortes de fecha de `nivelPedidoSinAtender`, para contar los pedidos por
 * nivel con dos `count` en vez de bajarlos todos. Mismos bordes que la regla:
 * en curso = creado desde `enCursoDesde`; olvidado = creado antes de `olvidadoAntesDe`.
 */
export function cortesPedido(ahora: Date): { enCursoDesde: Date; olvidadoAntesDe: Date } {
  return {
    enCursoDesde: new Date(ahora.getTime() - UMBRALES.pedidoEnCursoHoras * HORA),
    olvidadoAntesDe: new Date(ahora.getTime() - UMBRALES.pedidoOlvidadoDias * DIA),
  };
}

/** Conteo por nivel de los pedidos a partir de los tres `count`. */
export function nivelesDePedidos(total: number, enCurso: number, olvidados: number): ConteoNiveles {
  return {
    urgente: 0,
    importante: Math.max(0, total - enCurso - olvidados),
    leve: olvidados,
    informativo: enCurso,
  };
}

export function contarNiveles(items: ReadonlyArray<{ nivel: Nivel }>): ConteoNiveles {
  const c = nivelesVacios();
  for (const it of items) c[it.nivel] += 1;
  return c;
}

export function sumarNiveles(conteos: ReadonlyArray<ConteoNiveles>): ConteoNiveles {
  const c = nivelesVacios();
  for (const x of conteos) for (const n of NIVELES) c[n] += x[n];
  return c;
}

/**
 * Orden de la lista: urgente → informativo y, dentro del nivel, lo más
 * reciente primero. Sin fecha (los negocios en riesgo) se respeta el orden en
 * que llegaron — la cola de rescate ya viene por prioridad — porque `sort` es estable.
 */
export function compararAvisos(
  a: { nivel: Nivel; createdAt: string | null },
  b: { nivel: Nivel; createdAt: string | null },
): number {
  const porNivel = NIVELES.indexOf(a.nivel) - NIVELES.indexOf(b.nivel);
  if (porNivel !== 0) return porNivel;
  if (!a.createdAt || !b.createdAt) return 0;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

// ─── Contrato de la respuesta (route ↔ modal) ──────────────────────────────

export interface AvisoPedidoArticulo {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  image: string | null;
}

/** Detalle desplegable de un pedido sin atender (sólo `pendingOrders`). */
export interface AvisoPedidoDetalle {
  customerName: string;
  tenantName: string;
  tenantSlug: string | null;
  total: number;
  paymentMethod: string | null;
  itemsCount: number;
  items: AvisoPedidoArticulo[];
}

export interface AvisoBandeja {
  id: string;
  categoria: CategoriaAviso;
  nivel: Nivel;
  motivo: string;
  title: string;
  subtitle: string;
  /** Nombre de la tienda a la que se refiere, si no es el título mismo. */
  tienda: string | null;
  /** Id de la tienda (pedidos sin atender): con él la lista agrupa una fila por tienda. */
  tiendaId?: string;
  status: string;
  /** null = sin fecha propia (negocios en riesgo: la señal es de hoy). */
  createdAt: string | null;
  href: string;
  order?: AvisoPedidoDetalle;
}

export interface GrupoBandeja {
  /** Cuántos hay en total (puede ser más que `items`). */
  count: number;
  /** Cuántos de ese total hay por nivel. */
  niveles: ConteoNiveles;
  /** Su pantalla («Ver todos»). */
  href: string;
  /** Los primeros, ya ordenados por nivel. */
  items: AvisoBandeja[];
}

export interface BandejaAvisos {
  total: number;
  niveles: ConteoNiveles;
  buckets: Record<CategoriaAviso, GrupoBandeja>;
}
