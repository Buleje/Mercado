"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { shouldIgnoreShortcut } from "@/lib/keyboard-guards";
import { cachedJson } from "@/lib/client-cache-fetch";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { useNotificationCenter } from "./useNotificationCenter";
import NotificationHub from "./NotificationHub";
import { EVENTO_RELEER_CAMPANA, useAvisosFlotantes } from "./use-avisos-flotantes";
import { useConfigAviso } from "@/hooks/use-aviso-agenda";
import { tocarSonido } from "@/lib/agenda/sonidos";
import type { SonidoAviso } from "@/lib/agenda/aviso-pantalla";
import { abrirCentro } from "./centro-unificado";
import { AvisosDeLaFranja, useAvisosEscondidos } from "@/components/admin/avisos-de-la-franja";

// ── Fetch critical alert count silently ──────────────────────────────────────

function useCriticalAlertCount() {
  const [count, setCount] = useState(0);
  // /api/admin/stats sólo deja pasar a admin: el almacenero recibía 403 en cada
  // carga del panel. Con el rol sin resolver (null) tampoco se pide.
  const rol = useMiRol();
  const puedeStats = puedePedir("/api/admin/stats", rol);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        // cachedJson: comparte stats/batches con NotificationHub + widgets del
        // dashboard (antes cada uno disparaba su request). TTL 30s = el intervalo
        // de 2min re-chequea fresco. Perf 2026-05-29.
        const [stats, batches] = await Promise.all([
          puedeStats
            ? cachedJson<{ lowStockProducts?: number; pendingOrders?: number }>("/api/admin/stats", 30_000)
            : Promise.resolve(null),
          cachedJson<{ items?: unknown[] } | unknown[]>("/api/batches/expiring", 30_000),
        ]);

        if (cancelled) return;
        let critical = 0;

        if (stats) {
          if ((stats.lowStockProducts ?? 0) > 10) critical++;
          if ((stats.pendingOrders ?? 0) > 5) critical++;
        }

        if (batches) {
          const items = (Array.isArray(batches) ? batches : batches.items ?? []) as Array<{ expiryDate?: string; fechaVencimiento?: string }>;
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          for (const b of items) {
            const exp = new Date(b.expiryDate || b.fechaVencimiento || 0);
            const days = Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (days <= 3) { critical++; break; }
          }
        }

        setCount(critical);
      } catch { /* silent */ }
    }

    check();
    const interval = setInterval(check, 120_000); // Re-check every 2 min
    return () => { cancelled = true; clearInterval(interval); };
  }, [puedeStats]);

  return count;
}

// Track whether the user has interacted with the page (required for vibrate)
let _userHasInteracted = false;
if (typeof window !== "undefined") {
  const markInteracted = () => { _userHasInteracted = true; };
  window.addEventListener("pointerdown", markInteracted, { once: true, capture: true });
  window.addEventListener("keydown", markInteracted, { once: true, capture: true });
}

// ── Sound & vibration helper ─────────────────────────────────────────────────

function alertFeedback(sonido: SonidoAviso, volumen: number) {
  // Short vibration (mobile) — only after real user interaction to avoid [Intervention] warning
  try {
    if (
      _userHasInteracted &&
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function" &&
      document.hasFocus()
    ) {
      navigator.vibrate([100, 50, 100]);
    }
  } catch { /* ignore — blocked by permissions policy */ }

  // El sonido que eligió la persona (`lib/agenda/sonidos.ts`, 20-10): respeta
  // «Sin sonido», reusa un solo AudioContext y no suena dos veces si coincide
  // con un aviso flotante (anti-ráfaga).
  tocarSonido(sonido, volumen);
}

interface NotificationBellProps {
  /** El header renderiza sobre un fondo oscuro propio (temas Buleje/Ejecutivo
   *  del sidebar) INDEPENDIENTE del modo claro/oscuro del sitio — `dark:`
   *  no alcanza porque `.dark` puede no estar en el `<html>`. Sin esto el
   *  ícono quedaba gris-400 sobre navy: invisible (Brandon 2026-08-28). */
  onDarkHeader?: boolean;
}

export default function NotificationBell({ onDarkHeader = false }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    cargaFallida,
    filter,
    setFilter,
    markAsRead,
    markAllRead,
    refetch,
  } = useNotificationCenter(open);

  useAvisosFlotantes(unreadCount, isLoading);
  const { config: aviso } = useConfigAviso();
  const avisoRef = useRef(aviso);
  avisoRef.current = aviso;
  /* Un aviso flotante marcado leído: el total baja ya, no en el próximo sondeo. */
  useEffect(() => {
    window.addEventListener(EVENTO_RELEER_CAMPANA, refetch);
    return () => window.removeEventListener(EVENTO_RELEER_CAMPANA, refetch);
  }, [refetch]);
  const criticalCount = useCriticalAlertCount();
  const totalBadge = unreadCount + criticalCount;

  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(unreadCount);
  const prevCritical = useRef(criticalCount);

  // Pulse animation + sound when count increases
  useEffect(() => {
    if (unreadCount > prevCount.current || criticalCount > prevCritical.current) {
      setPulse(true);
      // Sound/vibration only for new critical alerts
      if (criticalCount > prevCritical.current) {
        alertFeedback(avisoRef.current.sonido, avisoRef.current.volumen);
      }
      const timeout = setTimeout(() => setPulse(false), 2000);
      prevCount.current = unreadCount;
      prevCritical.current = criticalCount;
      return () => clearTimeout(timeout);
    }
    prevCount.current = unreadCount;
    prevCritical.current = criticalCount;
  }, [unreadCount, criticalCount]);

  // Keyboard shortcut: "N" abre el panel — SOLO como tecla simple deliberada.
  // FIX 2026-07-08 (reporte QA Compras): antes se disparaba con cualquier "n"
  // aunque hubiera un modal abierto o el usuario tuviera Ctrl/Cmd/Alt pulsado
  // (ej. Cmd+N del navegador) → abría el Centro de Notificaciones sin pedirlo.
  // `shouldIgnoreShortcut` centraliza el guard (campo editable + modal abierto +
  // modificadores).
  // La `N` de la vista manda (17-10): «Nuevo ingreso» en el Libro CTP y la
  // primera letra que el POS lleva a su buscador también son `N`. Se decide
  // DESPUÉS de que corrieron todos los oyentes: si alguno la tomó
  // (`preventDefault`), la campana no se abre encima. Antes no chocaban porque
  // el cajón del celular, siempre montado con role="dialog", apagaba este atajo.
  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if (e.key !== "n" && e.key !== "N") return;
    if (shouldIgnoreShortcut(e)) return;
    window.setTimeout(() => {
      if (!e.defaultPrevented && !abrirCentro("todas")) setOpen((prev) => !prev);
    }, 0);
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [handleKeydown]);

  /* Con el centro único de «lo que falta hacer» + avisos (20-10) la campana abre
     ése; sin él (negocio sin Administración, rol sin agenda) abre el de siempre. */
  const toggle = () => {
    if (!abrirCentro("todas")) setOpen((prev) => !prev);
  };
  /* Avisos ámbar de la franja que fuera de Inicio no se dibujan arriba: un punto acá. */
  const avisos = useAvisosEscondidos().length;
  const textoAvisos = avisos > 0 ? ` · ${avisos} aviso${avisos === 1 ? "" : "s"}` : "";

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        // 48 px como el resto de la cabecera (eran 32): el centro ahora es un
        // modal (`aria-haspopup="dialog"`) y el nombre accesible dice cuántos hay.
        aria-label={`Notificaciones${totalBadge > 0 ? `, ${totalBadge} pendientes` : ""}${textoAvisos}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Notificaciones${totalBadge > 0 ? ` (${totalBadge} pendientes)` : ""}${textoAvisos} — tecla N`}
        className={cn(
          "relative flex items-center justify-center h-12 w-12 shrink-0 rounded-xl transition-colors",
          open && "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
          !open && !onDarkHeader && "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]",
          // onDarkHeader usa el token en vez de la clase literal `text-gray-400`
          // a propósito: `globals.css` tiene `.dark .text-gray-400 { ...
          // !important }` (parche WCAG P1 2026-05-08) que le gana a CUALQUIER
          // `sm:text-*` que se agregue — medido acá mismo, quedaba gris oscuro
          // pese al override. El token esquiva esa regla por completo.
          !open && onDarkHeader && "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)] sm:text-white/60 sm:hover:bg-white/10 sm:hover:text-white"
        )}
      >
        <Bell className={cn("h-5 w-5", pulse && "animate-bounce")} aria-hidden />
        {/* Badge */}
        {totalBadge > 0 && (
          <span
            className={cn(
              "absolute top-1 right-1 min-w-4.5 h-4.5 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-white rounded-full px-1 shadow-sm",
              criticalCount > 0 ? "bg-[var(--data-error-600)] animate-pulse" : "bg-[var(--data-error-500)]",
              pulse && "animate-pulse"
            )}
          >
            {totalBadge > 9 ? "9+" : totalBadge}
          </span>
        )}
        {avisos > 0 && (
          <span
            aria-hidden
            className="absolute right-1.5 bottom-1.5 h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)] ring-2 ring-[var(--surface-raised)]"
          />
        )}
      </button>

      <NotificationHub
        open={open}
        onClose={() => setOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        isLoading={isLoading}
        cargaFallida={cargaFallida}
        filter={filter}
        setFilter={setFilter}
        markAsRead={markAsRead}
        markAllRead={markAllRead}
        refetch={refetch}
        avisosArriba={<AvisosDeLaFranja alIr={() => setOpen(false)} />}
      />
    </>
  );
}
