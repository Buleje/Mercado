/**
 * lib/auth/roles-rutas-panel.ts
 *
 * Única fuente de verdad de qué roles puede llamar las rutas del panel admin
 * que el CLIENTE pide en cada carga (banners, KPIs, SSE, mensajes, asistente
 * IA) — no las 900+ rutas del API. Cada entrada es un espejo EXACTO del
 * `allowedRoles` que esa route.ts le pasa a `requireAdmin` (lib/require-admin.ts):
 * las route.ts importan estos mismos arrays en vez de repetir el literal, así
 * que si cambia uno, cambia el otro (mismo array, no una copia que se puede
 * desincronizar).
 *
 * `puedePedir` replica TAMBIÉN el bypass de management-tier de `requireAdmin`
 * (admin/owner/manager siempre pasan, sin importar qué diga `allowedRoles`).
 * Si este archivo no lo replicara, un owner/manager dejaría de pedir datos
 * que el servidor sí le da — un hueco en pantalla, no un 403 evitado.
 *
 * No importa "server-only": lo usan tanto los route.ts (server) como los
 * hooks/componentes del panel (client) para decidir si hacen el fetch.
 */

import type { AdminRole } from "@/lib/session";

/** Espejo de `managementTier` en lib/require-admin.ts — no reordenar sin mirar ahí. */
const MANAGEMENT_TIER: readonly AdminRole[] = ["admin", "owner", "manager"];

export const RUTAS_PANEL = {
  "/api/customers": ["admin"],
  "/api/sales": ["admin", "cajero", "owner", "manager", "tienda_owner"],
  "/api/admin/alerts-summary": ["admin", "manager", "cajero"],
  "/api/admin/stats": ["admin"],
  "/api/admin/sse": ["admin", "cajero"],
  "/api/admin/platform-chat": ["admin", "owner", "manager"],
  "/api/ai-assistant/health": ["admin", "owner"],
  /* Anular lo declarado un día de producción (2026-09-23): los mismos roles que
     anular una fila del Libro. La tira sólo muestra la papelera a quien pasa. */
  "/api/admin/forestal/ctp/anular-dia": ["admin", "owner"],
  /* Las escrituras por PATCH del Libro CTP —entre ellas apartar, cambiar y
     liberar una reserva— (2026-09-23). El GET de la misma ruta deja pasar al
     almacenero; el PATCH no: la campana y el modal esconden Liberar/Extender
     a quien recibiría un 403 «Requires: admin, owner». */
  "PATCH /api/admin/forestal/ctp": ["admin", "owner"],
  /* Resultado y caja del aserradero (ADR-451, 2026-09-29): lo ganado, lo que
     entró y salió y lo que te deben. Plata del negocio entero: SÓLO admin y
     dueño. Cajero y almacenero reciben 403 por este array; el encargado, por el
     `soloAdminODueno` de la ruta (el management-tier de `requireAdmin` lo dejaría
     pasar, y `puedePedir` también: la pantalla lo decide con el rol a mano).
     Las tres rutas comparten este array; el detalle es la misma plata. */
  "/api/finanzas/resultado": ["admin", "owner"],
  "/api/finanzas/caja-del-negocio": ["admin", "owner"],
  /* Proyección de 13 semanas (ADR-451, 29-09): ESPEJO de la matriz
     (`lib/auth/role-permissions.ts`) — los roles que leen `expenses` Y
     `payables`, porque la proyección son esos gastos y esas cuentas por pagar.
     El cajero no tiene ninguno de los dos → 403. La ruta vuelve a mirar la
     matriz; `__tests__/finanzas-cashflow-rolling-adr451.test.ts` fija que el
     espejo no se despegue. */
  "/api/finance/cashflow-rolling": ["admin", "owner", "manager", "analista"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type RutaPanel = keyof typeof RUTAS_PANEL;

/**
 * ¿El rol puede pedir esta ruta? Replica EXACTO lo que responde `requireAdmin`
 * (allowedRoles + bypass de management-tier) para que el cliente nunca sea
 * más estricto ni más laxo que el servidor.
 *
 * `rol === null` (todavía no se resolvió — auth en curso) devuelve `false`:
 * el llamador debe esperar a que el rol esté listo (`authReady`), no
 * interpretar "no sé" como "no tiene permiso" y menos como "tiene permiso".
 */
export function puedePedir(ruta: RutaPanel, rol: AdminRole | null | undefined): boolean {
  if (!rol) return false;
  if (MANAGEMENT_TIER.includes(rol)) return true;
  return (RUTAS_PANEL[ruta] as readonly AdminRole[]).includes(rol);
}
