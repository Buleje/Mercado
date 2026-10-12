"use client";

import { csrfHeaders } from "@/lib/csrf-client";
import { MARCA_SUPLANTACION } from "@/lib/auth/suplantacion-vista";

/**
 * Tras una suplantación aceptada por el servidor (la cookie de sesión de la
 * tienda ya quedó puesta), abre el panel de esa tienda en otra pestaña.
 * Compartido por «Impersonar» de la lista y «Entrar como esta tienda» de la
 * pestaña Credenciales.
 */
export async function abrirPanelDeTienda(slug: string): Promise<void> {
  // [SEGURIDAD MULTI-TENANT] Limpiar TODO cache cliente antes de abrir el
  // panel del tenant target. Sin esto, el localStorage/sessionStorage/SW
  // compartido entre pestañas filtraría datos del tenant anterior.
  try {
    const { clearAllTenantCache } = await import("@/lib/tenant-cache");
    clearAllTenantCache();
    // Notificar a pestañas abiertas del mismo origen para que también
    // limpien su estado en memoria si están en otro tenant.
    try {
      const bc = new BroadcastChannel("tenant-switch");
      bc.postMessage({ type: "tenant-switched", slug, ts: Date.now() });
      bc.close();
    } catch { /* BroadcastChannel no disponible */ }
  } catch { /* fallback: assertTenantOwnership en /admin lo cubrirá */ }
  // El panel saca el negocio activo de localStorage (nombre y logo del menú,
  // onboarding, vistas forestales) y lo escribía `app/t/[slug]/admin/page.tsx`,
  // que nunca se dibuja (el proxy reescribe /t/<slug>/admin a /admin): entrando
  // como Musa el menú decía «Mi Bodega» y saltaba el asistente de primeros pasos
  // de la dueña. Se marca acá, en la pestaña del superadmin (localStorage es del
  // origen: la pestaña nueva lo ve). El login normal borra la marca de suplantación.
  try {
    localStorage.setItem("active-tenant-slug", slug);
    localStorage.setItem(MARCA_SUPLANTACION, slug);
  } catch { /* modo privado: el panel cae a sus valores por defecto */ }
  // Cache-busting query (_fresh) garantiza que Next no sirva HTML cacheado
  // de un tenant previo y que assertTenantOwnership detecte el switch.
  // /t/{slug}/admin fuerza al proxy a setear x-tenant-id por URL.
  window.open(`/t/${encodeURIComponent(slug)}/admin?_fresh=${Date.now()}`, "_blank");
}

/** La ficha de la tienda abierta en la pestaña Credenciales (donde se abre el candado). */
export function urlCredenciales(slug: string): string {
  return `/superadmin/tenants?ficha=${encodeURIComponent(slug)}&pestana=credenciales`;
}

export type ResultadoSuplantar = "ok" | "candado" | "error";

/**
 * «Impersonar» / «Entrar como esta tienda» desde cualquier pantalla del superadmin.
 * Con el candado configurado y cerrado el servidor responde 423: en vez de fallar
 * callado, lleva a la ficha de la tienda en Credenciales para abrirlo (o hace lo
 * que diga `alCandado`, p. ej. abrir la ficha ahí mismo). Con 200 abre su panel.
 */
export async function suplantarTienda(slug: string, alCandado?: (slug: string) => void): Promise<ResultadoSuplantar> {
  let res: Response;
  try {
    res = await fetch("/api/superadmin/impersonate", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ slug }),
    });
  } catch {
    return "error";
  }
  if (res.status === 423) {
    if (alCandado) alCandado(slug);
    else window.location.assign(urlCredenciales(slug));
    return "candado";
  }
  if (!res.ok) return "error";
  await abrirPanelDeTienda(slug);
  return "ok";
}
