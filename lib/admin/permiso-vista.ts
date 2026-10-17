/**
 * permiso-vista — quién ve cada vista del panel (plan «panel unificado», regla R2).
 *
 * Hasta la ola 1 el panel decidía por PESTAÑA: una pestaña, un permiso. Juntar
 * pestañas así le quitaba o le regalaba pantallas a un plan (Básico desbloquea
 * `activos` y `adelantos`, pero `plata` es Pro). Ahora cada vista declara su
 * `origen` —las pestañas donde se veía antes, en `lib/admin/subvistas-modulos.ts`—
 * y el permiso se evalúa sobre él:
 *
 *   una vista se ve   ⇔ ALGUNO de sus orígenes pasa las capas;
 *   una pestaña se ve ⇔ ALGUNA de sus vistas se ve (sin vistas: su propio id).
 *
 * Las capas, en el orden en que la barra las aplicaba al 2026-10-09
 * (useAdminTabsDerived + AdminSidebar):
 *   1. rol        — `tabsDelRol` (lib/module-permissions.ts);
 *   2. plan       — `PLANS[tier].unlockedTabs` (lib/billing/plan-tiers.ts);
 *   3. plantilla  — el superadmin la oculta (overlay de useAdminTemplateOverlay);
 *   4. rubro      — `VERTICAL_REGISTRY`: habilitados, ocultos y «Pronto»;
 *   5. Modo Fácil — `EASY_MODE_TABS` (app/admin/_lib/tab-categories.ts).
 * Las especializaciones (`SPEC_GATED_MODULE_IDS`, ADR-124) sólo miran el rol y
 * su bandera: se saltan plan, plantilla, rubro y Modo Fácil, como siempre.
 *
 * Una capa en `null` no se aplica. Así cada superficie queda igual que antes:
 *   · barra de escritorio: todas menos Modo Fácil;
 *   · menú del celular:    sin rubro (AdminMobileDrawer nunca lo aplicó);
 *   · favoritos/recientes: rol, plan y plantilla.
 * Modo Fácil está escrito pero HOY ninguna superficie lo aplica: la barra recibe
 * `isEasyMode` y no lo usa, y el modo está forzado en «fácil» para todos.
 * Encenderlo escondería Mi Plata, Documentos y Comprobantes a todo negocio: es
 * una decisión de Brandon, no un arreglo.
 *
 * Funciones puras: las usan la barra, el hook de los hubs
 * (`hooks/use-vistas-permitidas.ts`), `scripts/matriz-pestanas.mjs` y
 * `__tests__/panel-sin-perdida.test.ts`, que exige que nadie pierda una vista.
 */
import { SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
import { ADMIN_MODULE_CATALOG, type AdminTemplateOverrides } from "@/lib/admin-template";
import { resolverDestino, type ResolverDestino } from "@/lib/admin/destino-tab";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import { PLANS, type PlanTier } from "@/lib/billing/plan-tiers";
import { tabsDelRol } from "@/lib/module-permissions";
import { getVerticalConfig, type Industry } from "@/lib/verticals/registry";

export type EstadoEnLaBarra = "visible" | "pronto" | "oculto";

/** El rubro ya en conjuntos (el registro trae arrays). */
export interface RubroDelPanel {
  /** Vacío = todo habilitado (el respaldo seguro de `filterTabsForVertical`). */
  habilitados: ReadonlySet<string>;
  ocultos: ReadonlySet<string>;
  /** «Pronto»: se dibuja apagado en la barra, no se abre. */
  pronto: ReadonlySet<string>;
}

/** Las capas del permiso. `null` = esa capa no se aplica. */
export interface ContextoPermiso {
  /** Ids que el rol deja ver (`null` = sin filtro: admin). */
  rol: ReadonlySet<string> | null;
  /** Ids que desbloquea el plan (`null` = sin candado: modo dev, o ya va dentro de `rol`). */
  plan: ReadonlySet<string> | null;
  /** `true` si la plantilla del superadmin oculta ese id. */
  plantilla: ((id: string) => boolean) | null;
  rubro: RubroDelPanel | null;
  /** Especializaciones encendidas (`null` = no se miran, como `allowedTabs`). */
  especialidades: ReadonlySet<string> | null;
  /** Ids de Modo Fácil (`null` = apagado; hoy siempre). */
  modoFacil: ReadonlySet<string> | null;
}

export const SIN_FILTRO: ContextoPermiso = {
  rol: null,
  plan: null,
  plantilla: null,
  rubro: null,
  especialidades: null,
  modoFacil: null,
};

// ── Armar las capas ──────────────────────────────────────────────────────────

/**
 * Capa de rol: `null` = ve todo. Decide SÓLO `tabsDelRol` (lib/module-permissions.ts):
 * qué roles tienen lista propia, la guardada en Ajustes y la bandera de ids
 * reales viven allá. Una copia de esa lista acá hacía que la barra ignorara, sin
 * avisar, a un rol que el carril de roles (O1-K2) sumara (revisión de la ola 1).
 */
export function idsDelRol(
  rol: string,
  guardados?: Record<string, string[]> | null,
): ReadonlySet<string> | null {
  const ids = tabsDelRol(rol, guardados);
  return ids === null ? null : new Set(ids);
}

/** Capa de plan: `null` = sin candado (`admin_mode_dev_unlock`). */
export function idsDelPlan(tier: PlanTier, sinCandado = false): ReadonlySet<string> | null {
  return sinCandado ? null : PLANS[tier].unlockedTabs;
}

/**
 * Capa de plantilla desde los overrides ya mergeados (global + los del negocio).
 * Es la misma regla de `isHiddenByTemplate` (useAdminTemplateOverlay): en el
 * navegador se usa esa; ésta es para la matriz y los tests, que no montan hooks.
 */
export function ocultaPorPlantilla(overrides: AdminTemplateOverrides): (id: string) => boolean {
  const porDefecto = new Map<string, boolean>();
  // El primero gana, como el `.find()` del overlay.
  for (const m of ADMIN_MODULE_CATALOG) if (!porDefecto.has(m.id)) porDefecto.set(m.id, m.defaultVisible);
  return (id) => {
    if (SPEC_GATED_MODULE_IDS.has(id)) return false;
    const visibleDeCatalogo = porDefecto.get(id);
    // Lo que no está en el catálogo nunca lo oculta la plantilla.
    if (visibleDeCatalogo === undefined) return false;
    const ov = Object.hasOwn(overrides, id) ? overrides[id] : undefined;
    return !(ov?.visible ?? visibleDeCatalogo);
  };
}

/** Capa de rubro (`industry` del negocio; sin dato = «otro», como la barra). */
export function rubroDelPanel(industry: string | null | undefined): RubroDelPanel {
  const { modules } = getVerticalConfig((industry || undefined) as Industry | undefined);
  return {
    habilitados: new Set(modules.enabled.map(String)),
    ocultos: new Set(modules.hidden.map(String)),
    pronto: new Set(modules.comingSoon.map(String)),
  };
}

// ── Decidir ──────────────────────────────────────────────────────────────────

/** Las capas sobre UN id de pestaña (el origen de una vista). */
export function estadoDelOrigen(ctx: ContextoPermiso, id: string): EstadoEnLaBarra {
  if (ctx.rol && !ctx.rol.has(id)) return "oculto";
  if (SPEC_GATED_MODULE_IDS.has(id)) {
    return !ctx.especialidades || ctx.especialidades.has(id) ? "visible" : "oculto";
  }
  if (ctx.plan && !ctx.plan.has(id)) return "oculto";
  if (ctx.plantilla?.(id)) return "oculto";
  if (ctx.rubro) {
    if (ctx.rubro.ocultos.has(id)) return "oculto";
    if (ctx.rubro.pronto.has(id)) return "pronto";
    if (ctx.rubro.habilitados.size > 0 && !ctx.rubro.habilitados.has(id)) return "oculto";
  }
  if (ctx.modoFacil && !ctx.modoFacil.has(id)) return "oculto";
  return "visible";
}

/** El origen efectivo de una vista: el declarado o, si no hay, su propio módulo. */
export function origenesDeVista(tab: string, vista: { origen?: readonly string[] }): readonly string[] {
  return vista.origen && vista.origen.length > 0 ? vista.origen : [tab];
}

/**
 * Hubs de una especialización que reparten sus vistas por especialización: con
 * OTRA bandera encendida muestran sólo lo de ésa (Herramientas y trámites:
 * `usePermisoDe` por fase). Un hub que no está acá muestra todas sus vistas a
 * quien entra, así que sólo lo abre su propia bandera. El Libro CTP recibió el
 * Rendimiento de Herramientas y los lotes con QR de `forestal-lotes`, y con
 * sólo Herramientas encendida se abría el libro entero (revisión de la ola 2,
 * 10-10; en la base, 0 negocios con Herramientas o Lotes sin CTP). Cuando
 * `CTPLibroOperaciones` filtre sus vistas con `useVistasPermitidas`, sumarlo.
 */
const HUBS_QUE_REPARTEN_ESPECIALIDADES: ReadonlySet<string> = new Set(["forestal-herramientas"]);

/**
 * Los orígenes que ABREN una pestaña (barra, celular y el guardián de
 * especialización de TabRouter): los de sus vistas, menos las especializaciones
 * ajenas si la pestaña es de otra especialización y no las reparte.
 */
export function origenesQueAbren(tab: string): readonly string[] {
  const vistas = vistasDelModulo(tab);
  const todos = vistas.length === 0 ? [tab] : [...new Set(vistas.flatMap((v) => origenesDeVista(tab, v)))];
  if (!SPEC_GATED_MODULE_IDS.has(tab) || HUBS_QUE_REPARTEN_ESPECIALIDADES.has(tab)) return todos;
  return todos.filter((o) => o === tab || !SPEC_GATED_MODULE_IDS.has(o));
}

/** Una vista se ve si ALGUNO de sus orígenes pasa. */
export function vistaPermitida(ctx: ContextoPermiso, origen: readonly string[]): boolean {
  return origen.some((o) => estadoDelOrigen(ctx, o) === "visible");
}

/** Estado de una pestaña: el mejor de sus vistas (visible > «Pronto» > oculto). */
export function estadoDePestana(ctx: ContextoPermiso, tab: string): EstadoEnLaBarra {
  let pronto = false;
  for (const o of origenesQueAbren(tab)) {
    const estado = estadoDelOrigen(ctx, o);
    if (estado === "visible") return "visible";
    if (estado === "pronto") pronto = true;
  }
  return pronto ? "pronto" : "oculto";
}

export function pestanaPermitida(ctx: ContextoPermiso, tab: string): boolean {
  return estadoDePestana(ctx, tab) === "visible";
}

/**
 * Las ids que pasan cada una por su cuenta, SIN unir vistas: es `allowedTabs`
 * (rol + plan por id). La barra lo usa después como capa de rol de cada origen,
 * así que unir acá mezclaría el permiso de una vista con el de su pestaña.
 */
export function idsPermitidos(ctx: ContextoPermiso, ids: readonly string[]): string[] {
  return ids.filter((id) => estadoDelOrigen(ctx, id) === "visible");
}

/**
 * Las vistas de un hub que se ven. Si no pasa ninguna (se llegó por URL a un hub
 * que la barra no ofrece), van todas: es lo que se veía antes, y el candado de
 * verdad está en la API, no en la pestaña. Cuando el panel controle la entrada
 * por URL, esto tiene que pasar a no mostrar ninguna.
 *
 * Antes de soltar todas se mira sin el RUBRO: el menú del celular no aplica el
 * filtro vertical, así que puede ofrecer un hub que con el rubro no tiene
 * ninguna vista. Ahí van las que el celular prometió, no todas (ola 2: un
 * restaurante en Pro con la plantilla que oculta Mi Tienda veía «Canales» en el
 * celular; fundido en Tienda online, sin esto se le abría la tienda entera).
 */
export function vistasVisibles<T extends { key: string; origen?: readonly string[] }>(
  ctx: ContextoPermiso,
  tab: string,
  vistas: readonly T[],
): readonly T[] {
  const pasan = vistas.filter((v) => vistaPermitida(ctx, origenesDeVista(tab, v)));
  if (pasan.length > 0) return pasan;
  if (ctx.rubro) {
    const sinRubro: ContextoPermiso = { ...ctx, rubro: null };
    const delCelular = vistas.filter((v) => vistaPermitida(sinRubro, origenesDeVista(tab, v)));
    if (delCelular.length > 0) return delCelular;
  }
  return vistas;
}

/**
 * Las vistas que se ven más la que pidió un ENLACE (`?vista=` al abrir: un
 * aviso, el buscador, la tarjeta de Inicio), si la dejan los candados.
 *
 * Plan, rol y especialidad son candados; la plantilla del superadmin y el
 * rubro ordenan qué se OFRECE en la barra y en las pestañas. Antes de fundir
 * pestañas, un enlace a una que la plantilla escondía la abría igual (el hub
 * caía en «todas»): «Revisar» de una solicitud de repartidor o «Personaliza tu
 * tienda» en `main`, que oculta Delivery y Mi Tienda. Fundida en otra pestaña
 * que sí se ve, sin esto el enlace caía en otra vista (ola 2, medido 10-10).
 */
export function vistasConLaPedida<T extends { key: string; origen?: readonly string[] }>(
  ctx: ContextoPermiso,
  tab: string,
  vistas: readonly T[],
  visibles: readonly T[],
  pedida: string | null,
): readonly T[] {
  if (!pedida || visibles.some((v) => v.key === pedida)) return visibles;
  const llave = vistas.find((v) => v.key === pedida);
  const candados: ContextoPermiso = { ...ctx, plantilla: null, rubro: null, modoFacil: null };
  if (!llave || !vistaPermitida(candados, origenesDeVista(tab, llave))) return visibles;
  return vistas.filter((v) => v === llave || visibles.includes(v));
}

/**
 * Las vistas que son contenido del propio hub (su origen lo incluye): lo que el
 * hub mostraba antes de recibir nada de otra pestaña. Es lo que se ofrece
 * mientras el rol no se conoce, sin dejar pasar lo que llegó de otro lado.
 */
export function vistasPropias<T extends { key: string; origen?: readonly string[] }>(
  tab: string,
  vistas: readonly T[],
): readonly T[] {
  return vistas.filter((v) => origenesDeVista(tab, v).includes(tab));
}

/**
 * El rótulo de una vista cuando la plantilla nombraba al id que se mudó ahí: si
 * `fiados` pasa a ser «Me deben» de Ventas y caja y la plantilla lo llamaba
 * «Cuentas pendientes», la vista se sigue llamando así para ese negocio.
 */
export function etiquetaDeVista(
  tab: string,
  vista: string,
  base: string,
  overrides: AdminTemplateOverrides,
  resolver: ResolverDestino = resolverDestino,
): string {
  for (const [id, ov] of Object.entries(overrides)) {
    const label = ov?.label?.trim();
    if (!label || id === tab) continue;
    const destino = resolver(id);
    if (destino && destino.tab === tab && destino.vista === vista) return label;
  }
  return base;
}

// ── Preferencias guardadas en el navegador ───────────────────────────────────

/**
 * Favoritos y recientes: un id que ya no es pestaña (renombrado o absorbido)
 * lleva a la que lo abre hoy. Antes se perdía en silencio. Los ids que siguen
 * siendo pestaña quedan tal cual: navegar a un alias ya lo resuelve
 * `useAdminTabs`, y así llega a la vista exacta y no a la puerta del hub.
 */
export function normalizarGuardadas(
  ids: Iterable<string>,
  conocidas: ReadonlySet<string>,
  resolver: ResolverDestino = resolverDestino,
): string[] {
  const salida: string[] = [];
  for (const id of ids) {
    const tab = conocidas.has(id) ? id : resolver(id)?.tab;
    if (tab && conocidas.has(tab) && !salida.includes(tab)) salida.push(tab);
  }
  return salida;
}

/**
 * Ocultos: pasan sólo los ids que siguen siendo pestaña, SIN seguir alias. A
 * propósito: `TAB_MIGRATION` junta varios ids viejos en uno (`pos`, `caja`,
 * `arqueo-caja` → `ventas-caja`); seguirlo haría que ocultar un pedazo viejo
 * escondiera la pestaña entera que lo absorbió. Hoy esos ids no hacen nada.
 */
export function normalizarOcultas<T extends string>(ids: Iterable<T>, conocidas: ReadonlySet<string>): Set<T> {
  const salida = new Set<T>();
  for (const id of ids) if (conocidas.has(id)) salida.add(id);
  return salida;
}
