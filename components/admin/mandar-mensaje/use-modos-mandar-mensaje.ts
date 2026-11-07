"use client";

/**
 * Qué modos de Crecimiento › Mandar mensaje ve esta persona. Cada modo trae el
 * permiso de la pantalla de la que vino (`ANIDADAS_POR_MODULO.campanas`):
 * «Uno por uno» el de Clientes (era Clientes › Mensajes masivos) y
 * «Automático» el de Campañas.
 *
 * Un enlace que pide un modo (`?sub=uno-por-uno`, el de Clientes › Mensajes
 * masivos de antes) lo abre aunque la plantilla esconda su pestaña de origen,
 * como `vistasConLaPedida`: plan, rol y especialidad se siguen mirando. Un
 * enlace a la vista sin modo (`?vista=campanas`) era Crecimiento › Campañas:
 * abre «Automático» igual que lo abría (en una bodega el rubro esconde
 * `campanas`, y antes la vista pedida lo destrababa). Eso sí: «Automático»
 * exige además que el ROL pueda crear campañas en la API (`tienda_owner` no:
 * recibía 403 al tocar «Abrir»), y un enlace a él cae en «Uno por uno».
 *
 * La vista pedida la lee el HUB al montar y llega por prop: el hub escribe
 * `?vista=campanas` en la URL al abrir su vista por defecto y esta pantalla
 * (`next/dynamic`) carga después; leerla acá tomaba esa escritura por un
 * enlace y le abría «Automático» a toda bodega (revisión 19-10).
 */
import { useMemo } from "react";
import { useContextoPermiso, useParamPedido } from "@/hooks/use-vistas-permitidas";
import { vistaPermitida, type ContextoPermiso } from "@/lib/admin/permiso-vista";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import type { AdminRole } from "@/lib/session";
import { origenDeSeccion } from "@/lib/admin/subvistas-modulos";

export const MODOS_MANDAR_MENSAJE = ["uno-por-uno", "automatico"] as const;
export type ModoMandarMensaje = (typeof MODOS_MANDAR_MENSAJE)[number];

/** Sin ninguno que pase (llegó por URL a una vista que su barra no ofrece), van los dos, como `useVistasPermitidas`. */
export function modosPermitidos(ctx: ContextoPermiso, sub: string | null, vista: string | null = null): ModoMandarMensaje[] {
  const pedido = sub ?? (vista === "campanas" ? "automatico" : null);
  const candados: ContextoPermiso = { ...ctx, plantilla: null, rubro: null, modoFacil: null };
  // «Automático» crea campañas por la API, que sólo deja pasar a quien `requireAdmin` deja: sin eso el botón da 403.
  const puedeCampanas = ctx.rolNombre == null || puedePedir("/api/campaigns", ctx.rolNombre as AdminRole);
  const posibles = MODOS_MANDAR_MENSAJE.filter((modo) => modo !== "automatico" || puedeCampanas);
  const pasan = posibles.filter((modo) => {
    const origen = origenDeSeccion("campanas", "campanas", modo);
    return vistaPermitida(ctx, origen) || (pedido === modo && vistaPermitida(candados, origen));
  });
  return pasan.length > 0 ? pasan : [...posibles];
}

/** `null` mientras el rol no se confirma (la pantalla espera: no muestra un modo que después se va). */
export function useModosMandarMensaje(vistaPedida: string | null): ModoMandarMensaje[] | null {
  const ctx = useContextoPermiso();
  const sub = useParamPedido("sub");
  return useMemo(() => (ctx ? modosPermitidos(ctx, sub, vistaPedida) : null), [ctx, sub, vistaPedida]);
}
