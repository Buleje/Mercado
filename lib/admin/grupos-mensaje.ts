/**
 * «Para quién» de Crecimiento › Mandar mensaje (19-10): UN selector para los
 * dos modos. Antes eran dos listas con reglas distintas — Clientes › Mensajes
 * masivos (9 segmentos de Mis clientes, armados en el navegador) y Campañas
 * (5 audiencias que arma el servidor al mandar) — y se juntan sin perder
 * ninguno:
 *
 *  · `uno`: cómo lo arma «Uno por uno» (`perteneceAlSegmento`, reglas de Mis
 *    clientes). Lo arma el navegador, así que sabe armarlos todos.
 *  · `auto`: cómo lo arma el servidor (`CampaignsDB.resolveAudience`). `null` =
 *    el servidor no sabe armarlo: en «Automático» se ve apagado.
 *
 * `id` es lo que queda en `Campaign.segment`: el de la audiencia del servidor
 * cuando la hay (las campañas viejas ya lo usan) y, si no, el del segmento.
 * Sin dependencias de React ni del servidor: lo leen la pantalla y la ruta.
 */

/** Cómo lo arma «Uno por uno» (`components/admin/mensajes-masivos/shared.ts`). */
export type GrupoUnoPorUno =
  | "todos"
  | "activos-30"
  | "inactivos-30"
  | "deuda"
  | "alto-valor"
  | "vip"
  | "cumpleanos"
  | "frecuente"
  | "ocasional"
  | "nuevo"
  | "perdido";

/** Cómo lo arma el servidor al mandar (`CampaignsDB.resolveAudience`). */
export type AudienciaServidor = "todos" | "vip" | "inactivos" | "cumpleanos" | "deudores";

export interface GrupoMensaje {
  id: string;
  rotulo: string;
  uno: GrupoUnoPorUno;
  auto: AudienciaServidor | null;
  /** Cómo se arma, dicho en castellano (va al ⓘ de «Para quién»). */
  regla: string;
  /** Si el servidor lo arma distinto que «Uno por uno», cómo. */
  reglaAuto?: string;
  /** Lo que ya les llega solo, sin que mandes nada (antes en Campañas › Para quién). */
  yaRecibe?: string;
}

/** En el orden del selector: primero los que sirven en los dos modos. */
export const GRUPOS_MENSAJE: readonly GrupoMensaje[] = [
  { id: "todos", rotulo: "Todos los clientes", uno: "todos", auto: "todos", regla: "Toda tu base registrada." },
  {
    id: "inactivos",
    rotulo: "No compran hace más de 30 días",
    uno: "inactivos-30",
    auto: "inactivos",
    regla: "Su última compra (pedido o mostrador) fue hace más de 30 días.",
    reglaAuto: "En automático cuenta sólo el mostrador.",
    yaRecibe: "Ya reciben un recordatorio de recompra automático a los ~15 días.",
  },
  {
    id: "deudores",
    rotulo: "Con fiado pendiente",
    uno: "deuda",
    auto: "deudores",
    regla: "Tienen saldo de fiado pendiente.",
    yaRecibe: "Ya reciben un recordatorio de pago automático.",
  },
  {
    id: "cumpleanos",
    rotulo: "Cumplen años este mes",
    uno: "cumpleanos",
    auto: "cumpleanos",
    regla: "Su cumpleaños cae en este mes.",
    yaRecibe: "Ya reciben saludo y cupón automático el día de su cumpleaños.",
  },
  { id: "vip", rotulo: "VIP (oro y diamante)", uno: "vip", auto: "vip", regla: "Su nivel de puntos es oro o diamante." },
  { id: "activos-30", rotulo: "Compraron en los últimos 30 días", uno: "activos-30", auto: null, regla: "Compraron hace 30 días o menos." },
  { id: "alto-valor", rotulo: "Alto valor (S/ 200 o más)", uno: "alto-valor", auto: null, regla: "Te compraron S/ 200 o más en total." },
  { id: "frecuente", rotulo: "Frecuentes (5 compras o más)", uno: "frecuente", auto: null, regla: "5 compras o más y la última hace 90 días o menos." },
  { id: "ocasional", rotulo: "Ocasionales (2 a 4 compras)", uno: "ocasional", auto: null, regla: "De 2 a 4 compras y la última hace 90 días o menos." },
  { id: "nuevo", rotulo: "Nuevos (0 o 1 compra)", uno: "nuevo", auto: null, regla: "Ninguna compra o una sola." },
  { id: "perdido", rotulo: "Perdidos (más de 90 días)", uno: "perdido", auto: null, regla: "Su última compra fue hace más de 90 días." },
];

/**
 * Los que sólo arma «Uno por uno». La ruta los acepta únicamente en un envío
 * de canal `manual` (lo que la persona abrió en su WhatsApp), que el cron de
 * campañas no despacha.
 */
export const GRUPOS_SOLO_UNO_POR_UNO = GRUPOS_MENSAJE.filter((g) => g.auto === null).map((g) => g.id);

export function grupoMensaje(id: string | null | undefined): GrupoMensaje | undefined {
  return GRUPOS_MENSAJE.find((g) => g.id === id);
}

/** El rótulo de un `Campaign.segment` (los de antes del 19-10 incluidos). */
export function rotuloDeGrupo(id: string): string {
  return grupoMensaje(id)?.rotulo ?? id;
}

/**
 * Un link de Mis clientes trae el segmento con su nombre de ahí (`frecuente`,
 * `deuda`, `inactivos-30`…): se acepta el id del grupo o el de su regla.
 */
export function grupoDesdeParam(valor: string | null | undefined): GrupoMensaje | undefined {
  return grupoMensaje(valor) ?? GRUPOS_MENSAJE.find((g) => g.uno === valor);
}

/** Variables del mensaje. El servidor sólo cambia {nombre} (lo escribe `{{nombre}}`). */
export const VARIABLES_UNO_POR_UNO = ["{nombre}", "{ultimaCompra}", "{deuda}"] as const;
export const VARIABLES_AUTOMATICO = ["{nombre}"] as const;

/** `{nombre}` → `{{nombre}}`, la forma que reemplaza el cron (`campaigns-dispatch`). */
export function aTextoDelServidor(texto: string): string {
  return texto.replace(/\{\{?\s*nombre\s*\}?\}/gi, "{{nombre}}");
}

/** `{{nombre}}` → `{nombre}`, la forma del editor. */
export function deTextoDelServidor(texto: string): string {
  return texto.replace(/\{\{\s*nombre\s*\}\}/gi, "{nombre}");
}

/** Las variables que «Automático» mandaría tal cual (el servidor no las cambia). */
export function variablesSinCambiarEnAutomatico(texto: string): string[] {
  return VARIABLES_UNO_POR_UNO.filter((v) => v !== "{nombre}" && texto.includes(v));
}
