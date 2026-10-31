/**
 * Las sub-vistas de Configuración › Sistema (`?tab=config&vista=sistema&sub=<id>`).
 *
 * Plan «panel unificado», ola 2 (2026-10-10): Sistema eran 6 destinos en 2
 * menús —la sección «Sistema» de Ajustes (lenguaje, tutorial, respaldo) y el
 * hub técnico (Rendimiento con su propia barra de 4, Auditoría y Colas)—, con
 * dos lugares llamados igual. Quedan en una sola barra de segundo nivel.
 *
 * `origen` = la pestaña donde cada cosa se veía ANTES (regla R2 del plan): el
 * plan, la plantilla, el rubro y el rol se evalúan sobre ella. Rendimiento,
 * Auditoría y Colas son del plan Max; Preferencias, de Configuración.
 * El registro (`ANIDADAS_POR_MODULO.config` en lib/admin/subvistas-modulos.ts,
 * lo da de alta el integrador de la ola) repite estas claves, rótulos y
 * orígenes para el buscador y la medición.
 */
import type { Tab } from "@/app/admin/_lib/tabs.types";
import { vistaPermitida, vistasConLaPedida, type ContextoPermiso } from "@/lib/admin/permiso-vista";

export type SubvistaSistema =
  | "preferencias" | "velocidad" | "historial" | "salud" | "soporte" | "actividad" | "colas";

/** Las cuatro que eran la barra propia de Rendimiento (hoy, contenido de `RendimientoModule`). */
export type VistaRendimiento = Extract<SubvistaSistema, "velocidad" | "historial" | "salud" | "soporte">;

export interface SubvistaSistemaMeta {
  id: SubvistaSistema;
  label: string;
  /** Qué hay adentro, en una línea (va al `title` de la pestaña y al buscador). */
  hint: string;
  origen: readonly Tab[];
}

/** Rótulos de una palabra: las siete entran en una fila a 1280 px sin deslizar. */
export const SUBVISTAS_SISTEMA: readonly SubvistaSistemaMeta[] = [
  { id: "preferencias", label: "Preferencias", hint: "Lenguaje sencillo o profesional, tutorial de bienvenida y respaldo de tus datos", origen: ["config"] },
  { id: "velocidad", label: "Velocidad", hint: "Qué tan rápida se siente tu tienda: puntaje y qué mejorar", origen: ["rendimiento"] },
  { id: "historial", label: "Historial", hint: "La velocidad que midieron tus clientes, día por día", origen: ["rendimiento"] },
  { id: "salud", label: "Salud", hint: "Base de datos, servicios y errores recientes", origen: ["rendimiento"] },
  { id: "soporte", label: "Soporte", hint: "Ficha de tu dispositivo y del almacenamiento, para pedir ayuda", origen: ["rendimiento"] },
  { id: "actividad", label: "Actividad", hint: "Quién hizo qué y cuándo en tu negocio", origen: ["auditoria"] },
  { id: "colas", label: "Colas", hint: "Trabajos en segundo plano y crons que fallaron", origen: ["colas"] },
];

export const IDS_SUBVISTAS_SISTEMA: readonly SubvistaSistema[] = SUBVISTAS_SISTEMA.map((s) => s.id);

/**
 * El id con que se llegaba antes → el de hoy. `?tab=rendimiento`, `auditoria`
 * y `colas` abrían el hub con `initialTab` = su propio id.
 */
const SUBVISTA_DE_ID_VIEJO: Readonly<Record<string, SubvistaSistema>> = {
  rendimiento: "velocidad",
  auditoria: "actividad",
  colas: "colas",
};

export function subvistaDeIdViejo(id: string | undefined): SubvistaSistema | undefined {
  if (!id) return undefined;
  if (Object.hasOwn(SUBVISTA_DE_ID_VIEJO, id)) return SUBVISTA_DE_ID_VIEJO[id];
  return (IDS_SUBVISTAS_SISTEMA as readonly string[]).includes(id) ? (id as SubvistaSistema) : undefined;
}

/**
 * Las sub-vistas que esta persona ve, en orden.
 *
 * - `conPreferencias`: Preferencias necesita el estado de Ajustes, así que sólo
 *   existe dentro de Configuración (el hub suelto de `?tab=rendimiento` no la tiene).
 * - `ctx` en `null` = rol sin confirmar: sólo lo que ya era de Configuración;
 *   nada que haya llegado de otra pestaña.
 * - Si no pasa ninguna (se llegó por URL al hub suelto, que la barra no
 *   ofrece), van todas: es lo que se veía antes y el candado de verdad está en
 *   la API (la misma regla que `vistasVisibles` de lib/admin/permiso-vista.ts).
 * - `pedida` = el `?sub=` con el que se abrió (un enlace viejo `?tab=colas`):
 *   entra si la dejan el plan y el rol aunque la plantilla la esconda
 *   (`vistasConLaPedida`). En `main` (Max, plantilla global) `?tab=colas`
 *   abría Preferencias (ola 2, medido 10-10).
 */
export function subvistasVisibles(
  ctx: ContextoPermiso | null,
  conPreferencias: boolean,
  pedida: string | null = null,
): SubvistaSistemaMeta[] {
  const candidatas = SUBVISTAS_SISTEMA.filter((s) => conPreferencias || s.id !== "preferencias");
  const pasan = candidatas.filter((s) => (ctx ? vistaPermitida(ctx, s.origen) : s.origen.includes("config")));
  if (pasan.length === 0) return ctx ? candidatas : [];
  if (!ctx) return pasan;
  const conClave = candidatas.map((s) => ({ key: s.id, origen: s.origen, s }));
  const visibles = conClave.filter((c) => pasan.includes(c.s));
  return vistasConLaPedida(ctx, "config", conClave, visibles, pedida).map((c) => c.s);
}
