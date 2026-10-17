/**
 * Adónde lleva un id de pestaña del panel (plan «panel unificado», 2026-10-09; ADR-490).
 *
 * Brandon aprobó juntar pestañas (18 → 13 renglones, 34 → 23 pestañas) sin
 * borrar nada: cada id viejo sigue funcionando y lleva a su casa nueva
 * `{ tab, vista, sub }` (regla R3 del plan: hay 271 avisos con `tab=` en un
 * enlace `/admin?…` guardados en la base, enlaces de WhatsApp y favoritos).
 *
 * Una sola receta para todo el que lee un id guardado o escrito a mano: la URL
 * (`?tab=` y `#`), `admin_active_tab`, `navigateTab` y los atajos de la barra.
 * En carriles hermanos también el filtro por rol (`lib/module-permissions.ts`)
 * y, en `lib/admin/permiso-vista.ts`, los rótulos de la plantilla y favoritos y
 * recientes (`normalizarGuardadas`: se normalizan al leerlos, sin reescribir el
 * navegador, y sólo un id que ya no es pestaña sigue el alias). Los ocultos NO
 * siguen alias a propósito (`normalizarOcultas`): ocultar un pedazo viejo
 * escondería la pestaña entera que lo absorbió.
 *
 * Orden (el mismo en todos lados; antes la URL migraba primero y `navigateTab`
 * validaba primero):
 *  1. el par `(tab, vista)` en `VISTA_MIGRATION` (una vista que se mudó);
 *  2. el id en `TAB_MIGRATION`. Si el alias trae vista, la suya gana (la del
 *     link era del módulo viejo); si es un nombre nuevo del mismo módulo, la
 *     vista del link viaja;
 *  3. se repite hasta que nada cambie (`demand-prediction` → `forecasting` sigue
 *     solo si mañana `forecasting` pasa a ser una vista de Inicio);
 *  4. lo que queda tiene que ser una pestaña que el panel sabe abrir; si no,
 *     `null`: quien llama avisa con `logger.warn` y cae en Inicio.
 */
import { TAB_MIGRATION, VISTA_MIGRATION } from "@/app/admin/_lib/tab-migration";
import { VALID_TABS, type Tab } from "@/app/admin/_lib/tabs.types";

export interface DestinoTab {
  tab: Tab;
  vista?: string;
  sub?: string;
}

export type ResolverDestino = (id: string, vista?: string | null) => DestinoTab | null;

export interface MapasDeDestino {
  alias: Readonly<Record<string, Tab | DestinoTab>>;
  vistas: Readonly<Record<string, DestinoTab>>;
  validas: readonly Tab[];
}

/** Clave de `VISTA_MIGRATION`: `"<tab>:<vista>"`, la notación `vieneDe` del plan (§2.2). */
export function claveDeVista(tab: string, vista: string): string {
  return `${tab}:${vista}`;
}

/** `Object.hasOwn`: con `mapa[clave]` a secas, `?tab=constructor` devolvía la función `Object` y el panel quedaba en blanco. */
function propio<T>(mapa: Readonly<Record<string, T>>, clave: string): T | undefined {
  return Object.hasOwn(mapa, clave) ? mapa[clave] : undefined;
}

/**
 * Lo que el panel sabe abrir: la barra (`VALID_TABS`) más los destinos de los
 * alias (`auditoria`, `rendimiento`, `devoluciones-proveedor` tienen rama en
 * TabRouter pero sólo se llega por su alias).
 */
function tabsConocidas({ alias, vistas, validas }: MapasDeDestino): ReadonlySet<string> {
  return new Set<string>([
    ...validas,
    ...Object.values(alias).map((d) => (typeof d === "string" ? d : d.tab)),
    ...Object.values(vistas).map((d) => d.tab),
  ]);
}

/** El resolvedor con mapas propios: el del panel es `resolverDestino`; los tests arman el suyo. */
export function crearResolverDestino(mapas: MapasDeDestino): ResolverDestino {
  const conocidas = tabsConocidas(mapas);
  return (id, vistaPedida) => {
    let tab = id.trim().toLowerCase();
    if (!tab) return null;
    let vista = vistaPedida?.trim() || undefined;
    let sub: string | undefined;
    const vistos = new Set<string>();
    for (;;) {
      const estado = `${tab}|${vista ?? ""}|${sub ?? ""}`;
      // Un alias que vuelve sobre sí mismo: lo frena el test; acá, a Inicio.
      if (vistos.has(estado)) return null;
      vistos.add(estado);
      const par = vista === undefined ? undefined : propio(mapas.vistas, claveDeVista(tab, vista));
      if (par) {
        tab = par.tab;
        vista = par.vista;
        sub = par.sub;
        continue;
      }
      const alias = propio(mapas.alias, tab);
      if (alias === undefined) break;
      const a: DestinoTab = typeof alias === "string" ? { tab: alias } : alias;
      const siguienteVista = a.vista ?? vista;
      // El `sub` es de la vista: si el alias trae la suya, el del link ya no aplica.
      const siguienteSub = a.vista !== undefined ? a.sub : (a.sub ?? sub);
      // `inventario: "inventario"`: el id ya es el de hoy.
      if (a.tab === tab && siguienteVista === vista && siguienteSub === sub) break;
      tab = a.tab;
      vista = siguienteVista;
      sub = siguienteSub;
    }
    if (!conocidas.has(tab)) return null;
    const destino: DestinoTab = { tab: tab as Tab };
    if (vista) destino.vista = vista;
    if (sub) destino.sub = sub;
    return destino;
  };
}

export const resolverDestino: ResolverDestino = crearResolverDestino({
  alias: TAB_MIGRATION,
  vistas: VISTA_MIGRATION,
  validas: VALID_TABS,
});

/**
 * La URL con el destino escrito, o `null` si ya lo decía.
 *
 * Sólo cambian `tab`, `vista` y `sub`: `?lote=`, `?cliente=` y el resto se
 * conservan, porque mudar una pestaña es montar el MISMO componente en su casa
 * nueva (R5) y sus parámetros siguen siendo suyos. El `sub` viejo se va sólo
 * si la vista cambió. El hash, si repetía el id viejo, pasa al nuevo.
 *
 * @param crudo el id como vino (`?tab=`, `#` o `admin_active_tab`).
 */
export function urlConDestino(href: string, destino: DestinoTab, crudo: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const tabAntes = url.searchParams.get("tab");
  const vistaAntes = url.searchParams.get("vista");
  const subAntes = url.searchParams.get("sub");
  const vista = destino.vista ?? null;
  const sub = destino.sub ?? (vista === vistaAntes ? subAntes : null);
  if (destino.tab === crudo && destino.tab === (tabAntes ?? crudo) && vista === vistaAntes && sub === subAntes) {
    return null;
  }
  url.searchParams.set("tab", destino.tab);
  if (vista) url.searchParams.set("vista", vista);
  else url.searchParams.delete("vista");
  if (sub) url.searchParams.set("sub", sub);
  else url.searchParams.delete("sub");
  const hash = url.hash.slice(1);
  if (hash && (hash === crudo || hash === tabAntes)) url.hash = destino.tab;
  return url.toString();
}

/** Lo que dice una URL del panel sobre la pestaña. */
export interface DestinoDeUrl {
  /** El id tal cual vino. */
  crudo: string;
  fuente: "query" | "hash";
  /** `null` = el id no existe: quien llama avisa y cae en Inicio. */
  destino: DestinoTab | null;
  /** La URL corregida si traía un alias (para `replaceState`), o `null`. */
  url: string | null;
}

/**
 * La pestaña que pide una URL (`?tab=` primero, `#` después), o `null` si la
 * URL no dice nada (ahí manda `admin_active_tab`).
 */
export function destinoDeUrl(href: string, resolver: ResolverDestino = resolverDestino): DestinoDeUrl | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const deQuery = url.searchParams.get("tab");
  const crudo = deQuery || url.hash.slice(1);
  if (!crudo) return null;
  const fuente = deQuery ? "query" : "hash";
  const destino = resolver(crudo, url.searchParams.get("vista"));
  return { crudo, fuente, destino, url: destino ? urlConDestino(href, destino, crudo) : null };
}
