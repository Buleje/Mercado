"use client";

/**
 * Lo que la ficha de una troza (`CtpTrozaFichaModal`) necesita fuera del
 * dibujo: leer la pieza con su historia fechada, las flechas ←/→ para
 * pasar a la vecina y el salto al croquis de planta.
 */

import { useEffect, useRef, useState } from "react";
import { PARAM_TROZA, TAB_LIBRO_CTP } from "@/lib/forestal/ctp-troza-url";
import type { EventoTroza } from "@/lib/forestal/planta-zona-types";
import type { FichaTroza } from "@/lib/forestal/troza-ficha-recorrido";

export interface EstadoFicha {
  /** La última ficha leída. Al pasar a otra troza se queda hasta que llega la nueva. */
  ficha: FichaTroza | null;
  error: string | null;
  /** Leyendo otra pieza (la de `ficha` es la anterior). */
  cargando: boolean;
  /** Las fechas del lote y del producto (ADR-465). Vacío si falló: la ficha sirve igual. */
  eventos: EventoTroza[];
}

/**
 * La ficha y su historia, en paralelo. La historia es secundaria: si falla,
 * el recorrido se arma sin la fecha del lote, no se rompe la ficha.
 */
export function useFichaDeTroza(trozaId: string): EstadoFicha {
  const [ficha, setFicha] = useState<FichaTroza | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  /* Con el id de la pieza: al pasar a la vecina, la historia vieja no se
     mezcla con la ficha nueva mientras llega la suya. */
  const [historia, setHistoria] = useState<{ id: string; eventos: EventoTroza[] }>({ id: "", eventos: [] });

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    const id = encodeURIComponent(trozaId);
    fetch(`/api/admin/forestal/trozas/ficha?id=${id}`, { credentials: "include" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error === "not_found" ? "Esa pieza ya no está en el libro" : (j.error ?? `HTTP ${r.status}`));
        return j as FichaTroza;
      })
      .then((j) => { if (vivo) setFicha(j); })
      .catch((e) => { if (vivo) { setFicha(null); setError(e instanceof Error ? e.message : String(e)); } })
      .finally(() => { if (vivo) setCargando(false); });
    fetch(`/api/admin/forestal/ctp/planta/troza/${id}/historia`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { eventos: [] }))
      .then((j: { eventos?: EventoTroza[] }) => {
        if (vivo) setHistoria({ id: trozaId, eventos: Array.isArray(j.eventos) ? j.eventos : [] });
      })
      .catch((err) => {
        // Señal secundaria: sin historia el recorrido sale sin la fecha del lote.
        console.warn("[troza-ficha] historia no disponible", err);
        if (vivo) setHistoria({ id: trozaId, eventos: [] });
      });
    return () => { vivo = false; };
  }, [trozaId]);

  return { ficha, error, cargando, eventos: ficha && historia.id === ficha.troza.id ? historia.eventos : [] };
}

/** Teclas que no son de navegación: se está escribiendo en algo. */
function escribiendo(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * ← / → pasan a la troza anterior / siguiente de la lista.
 *
 * Sólo cuando la tecla nace dentro de ESTA ficha (o sin foco en ningún
 * diálogo): con la etiqueta QR abierta encima, las flechas son de ella. El
 * oyente se ata una vez y lee lo último por ref — prenderlo y apagarlo con el
 * estado lo desmonta en medio de un evento (memoria `guarda-de-teclas`).
 */
export function useFlechasDeFicha(
  activo: boolean,
  anterior: string | null | undefined,
  siguiente: string | null | undefined,
  onNavegar: ((id: string) => void) | undefined,
): void {
  const ref = useRef({ activo, anterior, siguiente, onNavegar });
  ref.current = { activo, anterior, siguiente, onNavegar };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { activo: on, anterior: a, siguiente: s, onNavegar: ir } = ref.current;
      if (!on || !ir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (escribiendo(e.target)) return;
      const dialogo = e.target instanceof Element ? e.target.closest('[role="dialog"]') : null;
      if (dialogo && !dialogo.querySelector("[data-troza-ficha]")) return;
      const destino = e.key === "ArrowLeft" ? a : s;
      if (!destino) return;
      e.preventDefault();
      ir(destino);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * Ir a la vista «Planta» del Libro CTP (el croquis), donde está su carga.
 * Dentro del Libro, sin recargar (`pushState` + `popstate`, la receta de
 * `useVistaModulo`); desde otra pestaña del panel, por `admin:navigate`; fuera
 * del panel (el patio), navegando de verdad. Se va el `?troza=`: la ficha
 * queda atrás.
 */
export function irAlCroquis(): void {
  const url = new URL(window.location.href);
  const enElPanel = /\/admin\/?$/.test(url.pathname);
  const destino = new URL("/admin", url.origin);
  destino.searchParams.set("tab", TAB_LIBRO_CTP);
  destino.searchParams.set("vista", "planta");
  if (!enElPanel) {
    window.location.assign(destino.toString());
    return;
  }
  url.searchParams.set("vista", "planta");
  url.searchParams.delete(PARAM_TROZA);
  if (url.searchParams.get("tab") === TAB_LIBRO_CTP) {
    window.history.pushState(null, "", url.toString());
  } else {
    window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: TAB_LIBRO_CTP, vista: "planta" } }));
    window.history.replaceState(null, "", destino.toString());
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}
