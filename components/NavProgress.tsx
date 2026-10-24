"use client";

/**
 * NavProgress — cargador de navegación de toda la app.
 *
 * En el App Router, al hacer clic en un enlace la página se queda quieta
 * mientras Next trae la ruta nueva. Esto da señal AL INSTANTE:
 *   - Barra fina arriba desde el clic.
 *   - Si tarda más de 400 ms: el número 1→100 (`CargaPagina` del DS) en el
 *     centro, sobre la página atenuada. Sin textos ni botones (Brandon
 *     2026-10-17: «quita mucho texto y esas opciones que son de otras
 *     páginas; una carga del 1 al 100 minimalista»).
 *   - Al llegar: 100 y se va. Si tarda muchísimo (dev compilando), el número
 *     se queda en ~95 hasta que llegue; el velo no bloquea clics.
 *
 * Si la ruta nueva tiene `loading.tsx`, ese cargador sigue el MISMO reloj
 * (`carga-pagina-reloj`): el número continúa, nunca vuelve atrás, y esto
 * espera a que se vaya para cerrar.
 *
 * Respeta clics modificados, target=_blank, externos, hash, mailto/tel y
 * misma URL (no dispara en esos casos).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CargaPagina } from "@buleje/design-system/carga-pagina";
import {
  hayCargadorDePagina,
  iniciarCargaPagina,
  msDeCarga,
  suscribirCargaPagina,
  terminarCargaPagina,
} from "@buleje/design-system/carga-pagina-reloj";
import { cn } from "@/lib/utils";

/** Desde cuándo se muestra el número en el centro. */
const CENTRO_DESDE_MS = 400;
/** Cuánto queda a la vista el 100 antes de irse. */
const SALIDA_MS = 380;
/** El 100 se ve un momento y después se desvanece (keyframes en globals.css). */
const SALE = "carga-sale .2s ease .15s forwards";

type Fase = "quieta" | "cargando" | "terminando";

const sinCargador = () => false;

/** Barra fina de arriba: sigue el reloj compartido desde el clic. */
function BarraSuperior({ terminando }: { terminando: boolean }) {
  const [retraso] = useState(() => -Math.round(msDeCarga()));
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px]"
      style={terminando ? { animation: SALE } : undefined}
    >
      <div
        className={cn("carga-progreso h-full", terminando && "carga-completa")}
        style={{ animationDelay: `${retraso}ms` }}
      >
        <div className="carga-barra h-full rounded-r-full bg-[var(--accent)]" />
      </div>
    </div>
  );
}

export default function NavProgress() {
  const pathname = usePathname();
  // Un enlace que sólo cambia `?tab=` deja el pathname igual: hay que mirar la búsqueda.
  const search = useSearchParams()?.toString() ?? "";
  const [fase, setFase] = useState<Fase>("quieta");
  const [centro, setCentro] = useState(false);
  // Un loading.tsx en pantalla ya muestra el número: acá no se repite.
  const hayCargador = useSyncExternalStore(suscribirCargaPagina, hayCargadorDePagina, sinCargador);
  const activoRef = useRef(false);
  // La URL ya cambió pero el loading.tsx de la ruta nueva sigue a la vista.
  const esperandoRef = useRef(false);
  const centroTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salidaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpiarTimers = () => {
    if (centroTimer.current) clearTimeout(centroTimer.current);
    if (salidaTimer.current) clearTimeout(salidaTimer.current);
    centroTimer.current = null;
    salidaTimer.current = null;
  };

  const empezar = () => {
    limpiarTimers();
    activoRef.current = true;
    esperandoRef.current = false;
    iniciarCargaPagina();
    setCentro(false);
    setFase("cargando");
    centroTimer.current = setTimeout(() => setCentro(true), CENTRO_DESDE_MS);
  };

  // conCentro=false: el número del centro no vuelve a aparecer encima de la
  // página que acaba de llegar (cerró el loading.tsx); se completa la barra.
  const terminar = (conCentro: boolean) => {
    if (!activoRef.current) return;
    activoRef.current = false;
    esperandoRef.current = false;
    limpiarTimers();
    terminarCargaPagina();
    if (!conCentro) setCentro(false);
    setFase("terminando");
    salidaTimer.current = setTimeout(() => {
      setFase("quieta");
      setCentro(false);
    }, SALIDA_MS);
  };

  // Next confirmó la navegación (URL nueva o la misma tras una redirección).
  const confirmar = () => {
    if (!activoRef.current) return;
    if (hayCargadorDePagina()) {
      esperandoRef.current = true;
      return;
    }
    terminar(true);
  };

  // Completar en cada cambio de ruta (pathname o búsqueda).
  useEffect(() => {
    confirmar();
  }, [pathname, search]);

  // Se fue el loading.tsx que estábamos esperando → la página llegó.
  useEffect(
    () =>
      suscribirCargaPagina(() => {
        if (activoRef.current && esperandoRef.current && !hayCargadorDePagina()) terminar(false);
      }),
    [],
  );

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      if (a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname && a.search === window.location.search) return;
      empezar();
    };
    document.addEventListener("click", onClick, { capture: true });

    // Next confirma cada navegación con pushState (URL nueva) o replaceState
    // (la MISMA URL: p. ej. una redirección que vuelve a donde estabas). Medido
    // 2026-10-08: ninguna se llama antes de que la página nueva esté lista.
    // setTimeout: Next las llama dentro de un useInsertionEffect, donde React
    // no admite actualizar estado (y así el loading.tsx ya se registró).
    const originales = { push: history.pushState, replace: history.replaceState };
    const alConfirmar = () => {
      if (activoRef.current) setTimeout(confirmar, 0);
    };
    const push: History["pushState"] = function (this: History, ...args) {
      originales.push.apply(this, args);
      alConfirmar();
    };
    const replace: History["replaceState"] = function (this: History, ...args) {
      originales.replace.apply(this, args);
      alConfirmar();
    };
    history.pushState = push;
    history.replaceState = replace;

    // Volver con «atrás» a una página guardada por el navegador: no hay carga.
    const alMostrar = (e: PageTransitionEvent) => {
      if (e.persisted) terminar(false);
    };
    window.addEventListener("pageshow", alMostrar);

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("pageshow", alMostrar);
      if (history.pushState === push) history.pushState = originales.push;
      if (history.replaceState === replace) history.replaceState = originales.replace;
      limpiarTimers();
    };
  }, []);

  if (fase === "quieta") return null;

  const terminando = fase === "terminando";
  const verCentro = centro && !hayCargador;

  return (
    <>
      {!verCentro && !hayCargador && <BarraSuperior terminando={terminando} />}
      {verCentro && (
        // El velo no bloquea: si algo nunca llega, se puede seguir usando la página.
        <div
          data-nav-progress
          className="pointer-events-none fixed inset-0 z-[9998] flex items-center justify-center backdrop-blur-[2px]"
          style={{
            background: "color-mix(in oklab, var(--surface-canvas) 72%, transparent)",
            animation: terminando ? SALE : "carga-aparece .2s ease",
          }}
        >
          <CargaPagina modo="flotante" completo={terminando} etiqueta="Cargando la página" />
        </div>
      )}
    </>
  );
}
