"use client";

/**
 * Índice pegajoso del cubicador de madera (Brandon 23-10: «ordenado y habiendo
 * bloques para que se vea más navegable y usable»).
 *
 * La vista son tres bloques —Dictar y cargar · Lote cubicado · Grabaciones de
 * voz— y se dicta MIRANDO la tabla crecer: por eso no son pestañas que se
 * excluyen, sino bloques apilados con esta barra que viaja pegada arriba y
 * lleva a cada uno. Un bloque plegado se despliega al tocar su chip (plegar no
 * es esconder: la barra sigue diciendo que está ahí).
 *
 * Los chips son enlaces (`<a href="#…">`): llevan a un lugar de la misma
 * página, no ejecutan nada. El scroll lo hace `scrollIntoView` (con Lenis, el
 * salto nativo del ancla no siempre respeta el `scroll-margin`).
 */
import { useEffect, useState, type ReactNode } from "react";

export interface BloqueDelIndice {
  /** id del contenedor ESTABLE del bloque (no el de algo que se monta y desmonta). */
  id: string;
  numero: number;
  etiqueta: string;
  /** Rótulo corto para 400 px; sin él va la etiqueta entera. */
  corta?: string;
  /** Cifra chica al lado del rótulo (p. ej. las piezas del lote). */
  cifra?: string;
  plegado?: boolean;
  /** Despliega el bloque antes de llevar a él. */
  onMostrar?: () => void;
}

/** El número redondo que repite el título de cada bloque, para que chip y bloque se reconozcan. */
export function NumeroDeBloque({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]"
    >
      {n}
    </span>
  );
}

/** Margen que deja un bloque al llegar a él: la cabecera del panel (65 px) + esta barra. */
export const SCROLL_MT_BLOQUE = "scroll-mt-32";

/** Hasta dónde baja la línea que decide el bloque activo: cabecera + barra + un respiro. */
const LINEA_ACTIVO_PX = 160;

/**
 * Qué bloque se está mirando: el último cuya parte de arriba ya pasó bajo la
 * barra. Al fondo de la página manda el último que se ve: el bloque final es
 * corto y su borde de arriba nunca llega a la barra (con un observador de
 * intersección el chip 3 no se encendía nunca: medido 23-10).
 */
function useBloqueActivo(ids: readonly string[]): string {
  const clave = ids.join("|");
  const [activo, setActivo] = useState(ids[0] ?? "");
  useEffect(() => {
    const lista = clave.split("|");
    let cuadro = 0;
    const calcular = () => {
      cuadro = 0;
      const tops = lista
        .map((id) => ({ id, el: document.getElementById(id) }))
        .filter((x): x is { id: string; el: HTMLElement } => x.el !== null)
        .map((x) => ({ id: x.id, top: x.el.getBoundingClientRect().top }));
      if (tops.length === 0) return;
      const alFondo = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const pasados = tops.filter((t) => t.top <= (alFondo ? window.innerHeight - 40 : LINEA_ACTIVO_PX));
      setActivo((pasados.at(-1) ?? tops[0]).id);
    };
    const onScroll = () => {
      if (!cuadro) cuadro = requestAnimationFrame(calcular);
    };
    calcular();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (cuadro) cancelAnimationFrame(cuadro);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [clave]);
  return activo;
}

/**
 * Lleva al bloque y corrige hasta que quede bajo la barra. En el celular las
 * tarjetas de la tabla miden lo que estima `content-visibility` (220 px,
 * globals.css) hasta que pasan por la pantalla: el destino se corre mientras se
 * baja (medido 23-10 a 400 px: el chip 3 dejaba 6.000 px antes del bloque).
 * Si la persona toca o mueve la rueda, se deja de corregir.
 */
function llevarA(id: string) {
  let correcciones = 0;
  let quieto = 0;
  let ultimoY = -1;
  let reloj = 0;
  const soltar = () => {
    window.clearInterval(reloj);
    window.removeEventListener("wheel", soltar);
    window.removeEventListener("touchstart", soltar);
  };
  const el = document.getElementById(id);
  if (!el) return;
  /* Suave si es cerca; de lejos, directo: deslizarse 20 pantallas tardaba ~5 s. */
  const lejos = Math.abs(el.getBoundingClientRect().top) > window.innerHeight * 3;
  el.scrollIntoView({ block: "start", behavior: lejos ? "auto" : "smooth" });
  window.addEventListener("wheel", soltar, { passive: true });
  window.addEventListener("touchstart", soltar, { passive: true });
  reloj = window.setInterval(() => {
    quieto = window.scrollY === ultimoY ? quieto + 1 : 0;
    ultimoY = window.scrollY;
    if (quieto < 2) return;
    const margen = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const alFondo = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (alFondo || Math.abs(el.getBoundingClientRect().top - margen) <= 8 || correcciones >= 6) {
      soltar();
      return;
    }
    correcciones += 1;
    quieto = 0;
    el.scrollIntoView({ block: "start", behavior: "auto" });
  }, 120);
}

export function IndiceDelCubicador({ bloques, resumen }: { bloques: readonly BloqueDelIndice[]; resumen?: ReactNode }) {
  const activo = useBloqueActivo(bloques.map((b) => b.id));

  const ir = (b: BloqueDelIndice) => {
    if (b.plegado) b.onMostrar?.();
    /* Un cuadro después: si estaba plegado, el bloque recién toma su alto. */
    requestAnimationFrame(() => llevarA(b.id));
  };

  return (
    <nav
      aria-label="Bloques del cubicador"
      className="sticky top-16 z-20 flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1.5 shadow-[var(--shadow-sm)]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {bloques.map((b) => {
          const esActivo = activo === b.id;
          return (
            <a
              key={b.id}
              href={`#${b.id}`}
              onClick={(e) => {
                e.preventDefault();
                ir(b);
              }}
              aria-current={esActivo ? "location" : undefined}
              title={b.plegado ? `${b.etiqueta} (oculto): tócalo para mostrarlo` : `Ir a ${b.etiqueta}`}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-sm sm:gap-2 font-bold transition-colors ${
                esActivo
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-transparent text-[var(--text-secondary)] hover:border-[var(--rule-base)] hover:text-[var(--text-primary)]"
              }`}
            >
              {/* A 400 px el número y la cifra se van: con ellos el chip 3 quedaba
                  fuera de la barra (medido 23-10). El rótulo corto basta. */}
              <span className="hidden sm:inline-flex"><NumeroDeBloque n={b.numero} /></span>
              {b.corta ? (
                <>
                  <span className="sm:hidden">{b.corta}</span>
                  <span className="hidden sm:inline">{b.etiqueta}</span>
                </>
              ) : (
                <span>{b.etiqueta}</span>
              )}
              {b.cifra && (
                <span className="hidden rounded-md bg-[var(--surface-sunken)] px-1.5 font-mono text-xs tabular-nums text-[var(--text-secondary)] sm:inline">
                  {b.cifra}
                </span>
              )}
              {b.plegado && <span className="hidden text-xs font-semibold text-[var(--text-tertiary)] sm:inline">oculto</span>}
            </a>
          );
        })}
      </div>
      {resumen && (
        <span className="shrink-0 pr-1.5 font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
          {resumen}
        </span>
      )}
    </nav>
  );
}
