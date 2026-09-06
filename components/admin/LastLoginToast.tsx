"use client";

/**
 * LastLoginToast — aviso "Último acceso" al entrar al panel (B3, 2026-07-19).
 *
 * El login guarda en sessionStorage `bsm-last-login` = { at, ip } con el ingreso
 * ANTERIOR (lo calcula el backend antes de registrar el actual). Acá lo leemos
 * una sola vez, lo mostramos como toast y limpiamos la key — así el dueño nota
 * accesos raros ("¿no fuiste vos?") sin tener que abrir Configuración.
 *
 * Client-only (todo en useEffect): Date.now()/new Date() corren en el browser,
 * no en el server (evita el gotcha de Cache Components).
 */

import { useEffect } from "react";
import { toast } from "sonner";

const KEY = "bsm-last-login";
// Guard a nivel módulo: evita doble-toast si el componente se remonta (HMR en
// dev, React StrictMode que invoca el effect dos veces). Una vez mostrado, no
// vuelve a aparecer en esta carga de página.
let shownThisLoad = false;

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const min = Math.floor((Date.now() - then) / 60000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} día${d === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
}

export function LastLoginToast() {
  useEffect(() => {
    if (shownThisLoad) return;

    let raw: string | null = null;
    try {
      // NO consumimos la key acá: solo leemos. Se remueve cuando el toast
      // realmente aparece (dentro del setTimeout) — así un remount previo al
      // disparo reintenta en vez de perder el aviso.
      raw = sessionStorage.getItem(KEY);
    } catch {
      return; // sessionStorage no disponible (modo privado): sin aviso, sin bug.
    }
    if (!raw) return;

    let data: { at?: string; ip?: string | null };
    try {
      data = JSON.parse(raw) as { at?: string; ip?: string | null };
    } catch {
      try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
      return;
    }
    if (!data?.at) return;

    const rel = formatRelative(data.at);
    if (!rel) return;
    const ipTxt = data.ip ? ` · IP ${data.ip}` : "";

    // Pequeño delay: dejamos que el panel monte antes de avisar.
    const t = setTimeout(() => {
      shownThisLoad = true;
      try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
      toast(`Último acceso ${rel}${ipTxt}`, {
        description: "Si no reconocés este acceso, revisá tus dispositivos en Configuración → Seguridad.",
        duration: 8000,
      });
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  return null;
}
