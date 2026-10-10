"use client";

/**
 * use-vistas-permitidas — el permiso por vista dentro de un hub (plan «panel
 * unificado», regla R2; la regla vive en `lib/admin/permiso-vista.ts`).
 *
 * Cuando una pestaña absorbe a otra, la vista que llega trae su `origen` y sólo
 * la ve quien antes veía ese origen: el plan, la plantilla, el rubro y el rol
 * se miran como en la barra. Uso, en el hub:
 *
 *   const tabs = useVistasPermitidas("plata", TABS);
 *   <AdminTabBar tabs={tabs} … />
 *
 * Las capas salen de las MISMAS fuentes que la barra (usePlanTier, la plantilla,
 * el rubro del negocio, las especializaciones y el rol de `/api/auth/me` con los
 * permisos guardados en Ajustes), así que un hub nunca ofrece algo que la barra
 * le negaría.
 *
 * Mientras el rol no se confirma —o si no hay sesión— no pasa nada que dependa
 * de él: `<PermisoDe>` no dibuja y el hub ofrece sólo sus vistas propias. Antes
 * se tomaba «admin» y el primer render (todos, si fallaba la lectura) dejaba
 * pasar lo que llegó de otra pestaña (revisión de la ola 1).
 */

import { useEffect, useMemo, useState } from "react";
import { useAdminTemplateOverlay } from "@/app/admin/_hooks/useAdminTemplateOverlay";
import { useTenant } from "@/contexts/tenant-context";
import { useEnabledSpecs } from "@/hooks/use-enabled-specs";
import { usePlanTier } from "@/hooks/use-plan-tier";
import type { AdminTemplateOverrides } from "@/lib/admin-template";
import {
  etiquetaDeVista,
  idsDelPlan,
  idsDelRol,
  origenesDeVista,
  rubroDelPanel,
  vistaPermitida,
  vistasConLaPedida,
  vistasPropias,
  vistasVisibles,
  type ContextoPermiso,
} from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import { cachedJson, cachedJsonVigente } from "@/lib/client-cache-fetch";
import { useVistaEmbebida } from "@/hooks/use-vista-modulo";
import { logger } from "@/lib/logger";

interface RespuestaAuthMe {
  role?: string | null;
}

interface RespuestaAjustes {
  rolePermissions?: Record<string, string[]>;
}

interface SesionDelPanel {
  rol: string;
  guardados: Record<string, string[]> | null;
}

const TTL_AUTH_ME = 60_000;
const TTL_AJUSTES = 30_000;

/** La sesión que ya leyó otra parte del panel y sigue vigente, o `null`. */
function sesionEnCache(): SesionDelPanel | null {
  if (typeof window === "undefined") return null;
  const yo = cachedJsonVigente<RespuestaAuthMe | null>("/api/auth/me", TTL_AUTH_ME);
  const ajustes = cachedJsonVigente<RespuestaAjustes | null>("/api/settings", TTL_AJUSTES);
  if (!yo?.role || ajustes === undefined) return null;
  return { rol: yo.role, guardados: ajustes?.rolePermissions ?? null };
}

/**
 * Rol y permisos guardados, de las mismas URLs y TTL que useAdminAuth (comparten
 * la respuesta). `null` hasta tener los dos, y si `/api/auth/me` no trae rol.
 */
function useSesionDelPanel(): SesionDelPanel | null {
  /* Del cache si ya está: un hub que espera al rol (Equipo, Tienda online)
     monta a su hijo recién con el rol confirmado, y el hijo tiene su propia
     instancia de este hook. Si arrancaba en `null`, su `useVistaModulo`
     validaba la URL sin las vistas que llegaron de otra pestaña y
     `?tab=tareas` caía en Asistencia (ola 2, medido 10-10). */
  const [sesion, setSesion] = useState<SesionDelPanel | null>(sesionEnCache);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      cachedJson<RespuestaAuthMe>("/api/auth/me", TTL_AUTH_ME),
      cachedJson<RespuestaAjustes>("/api/settings", TTL_AJUSTES),
    ])
      .then(([yo, ajustes]) => {
        if (!vivo) return;
        if (!yo?.role) {
          logger.warn("[vistas-permitidas] sin rol: no pasa lo que depende de él");
          return;
        }
        // Sin Ajustes la barra tampoco tiene permisos guardados (useAdminAuth): mismo criterio.
        setSesion({ rol: yo.role, guardados: ajustes?.rolePermissions ?? null });
      })
      .catch((err) => logger.warn("[vistas-permitidas] rol sin leer", { error: String(err) }));
    return () => {
      vivo = false;
    };
  }, []);

  return sesion;
}

/** Las capas del permiso (`null` = rol sin confirmar) y los overrides de la plantilla, de una sola lectura. */
function useCapasDelPanel(): { ctx: ContextoPermiso | null; overrides: AdminTemplateOverrides } {
  const sesion = useSesionDelPanel();
  const { plan } = usePlanTier();
  const { isHiddenByTemplate, template } = useAdminTemplateOverlay();
  const { industry } = useTenant();
  const { enabledModuleIds } = useEnabledSpecs();
  // Mismo atajo de desarrollo que la barra (`admin_mode_dev_unlock`): sin candado de plan.
  const [sinCandado] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("admin_mode_dev_unlock") === "1";
    } catch {
      return false;
    }
  });

  const ctx = useMemo<ContextoPermiso | null>(
    () =>
      sesion && {
        rol: idsDelRol(sesion.rol, sesion.guardados),
        plan: idsDelPlan(plan, sinCandado),
        plantilla: isHiddenByTemplate,
        rubro: rubroDelPanel(industry),
        especialidades: enabledModuleIds,
        // Modo Fácil: apagado, como en la barra (ver lib/admin/permiso-vista.ts).
        modoFacil: null,
      },
    [sesion, plan, sinCandado, isHiddenByTemplate, industry, enabledModuleIds],
  );
  return { ctx, overrides: template.overrides };
}

/**
 * Las capas del permiso tal como las ve la barra de escritorio de este negocio.
 * `null` mientras el rol no se confirma: quien lo use no deja pasar nada.
 */
export function useContextoPermiso(): ContextoPermiso | null {
  return useCapasDelPanel().ctx;
}

/**
 * Las pestañas de un hub que esta persona puede ver, con el rótulo que le puso
 * la plantilla si la vista vino de un id renombrado. Si no pasa ninguna (llegó
 * por URL a un hub que su barra no ofrece), van todas, como antes. Sin rol
 * confirmado, sólo las propias del hub.
 */
export function useVistasPermitidas<T extends { id: string; label: string }>(
  modulo: string,
  items: readonly T[],
): T[] {
  const { ctx, overrides } = useCapasDelPanel();
  /* La `?vista=` que pidió el enlace: una vista que la plantilla esconde se
     abre igual si el plan y el rol la dejan (`vistasConLaPedida`). Se relee
     en cada navegación del panel con el hub montado (ver `useParamPedido`). */
  const pedida = useParamPedido("vista");

  return useMemo(() => {
    const registro = new Map(vistasDelModulo(modulo).map((v) => [v.key, v] as const));
    const conOrigen = items.map((item) => ({
      key: item.id,
      origen: origenesDeVista(modulo, registro.get(item.id) ?? {}),
      item,
    }));
    const pasan = ctx
      ? vistasConLaPedida(ctx, modulo, conOrigen, vistasVisibles(ctx, modulo, conOrigen), pedida)
      : vistasPropias(modulo, conOrigen);
    return pasan.map(({ item }) => {
      const label = etiquetaDeVista(modulo, item.id, item.label, overrides);
      return label === item.label ? item : { ...item, label };
    });
  }, [ctx, modulo, items, overrides, pedida]);
}

function paramDeUrl(param: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(param);
}

/**
 * `?<param>=` tal como lo pidió la navegación: al montar y en cada `popstate`
 * (atrás/adelante, y `irAEnlace`, que lo dispara al final para que el módulo
 * montado siga a la URL). Antes se leía sólo al montar: estando en Sistema ›
 * Actividad, un enlace a `?tab=rendimiento` cambiaba la URL a `sub=velocidad`
 * y la pantalla seguía en Preferencias (ola 2, medido 10-10).
 *
 * Lo que se elige adentro (`irA` = `pushState`, sin `popstate`) no cuenta: la
 * vista escondida que abrió el enlace no se va de la barra al pasar a otra.
 * Sólo amplía lo que la plantilla esconde: el plan y el rol se siguen mirando.
 */
export function useParamPedido(param: string): string | null {
  /* En un modal (accesos de la cabecera) la URL es de la pantalla de atrás:
     lo «pedido» es la vista con la que se abrió el modal. */
  const embebida = useVistaEmbebida();
  const [pedido, setPedido] = useState<string | null>(() => (embebida ? null : paramDeUrl(param)));
  useEffect(() => {
    if (embebida) return;
    const releer = () => setPedido(paramDeUrl(param));
    window.addEventListener("popstate", releer);
    return () => window.removeEventListener("popstate", releer);
  }, [param, embebida]);
  if (embebida) return (param === "vista" ? embebida.vista : param === "sub" ? embebida.sub : undefined) ?? null;
  return pedido;
}

/** ¿Se ve un bloque que vino de `origen`? Para `<PermisoDe>`; `false` mientras el rol no se confirma. */
export function usePermisoDe(origen: readonly string[]): boolean {
  const ctx = useContextoPermiso();
  // El que llama suele pasar un array literal nuevo en cada render: la clave
  // en texto evita recalcular por eso.
  const clave = origen.join("|");
  return useMemo(() => ctx !== null && vistaPermitida(ctx, clave ? clave.split("|") : []), [ctx, clave]);
}
