"use client";

/**
 * Lo que se mueve en el encabezado de la tienda (como `pagina-musa/EncabezadoVivo.tsx`):
 *
 * · `EncabezadoVivo` — la barra pegajosa: pasados 8 px de scroll se vuelve
 *   92 % opaca con desenfoque y filete (`.ti-barra`); en el celular el
 *   buscador va en su propia fila pegajosa debajo, que se esconde al bajar y
 *   vuelve al subir. Son dos hermanos porque `sticky` sólo pega dentro de su
 *   padre (la página entera).
 * · `CampoBuscar` — muestra lo que se está buscando (`?q=`).
 * · `BolsaEncabezado` — la bolsa con su contador: sube con cada cambio, un aro
 *   hace un pulso y la bolsa late; desde 768 px, un globo «Agregaste…» bajo la
 *   bolsa (2,5 s). Sólo celebra lo que agrega la persona (un toque o tecla
 *   reciente), no la bolsa guardada que se carga sola. El cajón es del carril
 *   de la bolsa (`estado-bolsa.ts`): acá sólo se abre.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Check, ShoppingBag } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { abrirBolsa, useBolsaAbierta } from "./estado-bolsa";
import { SelloContador } from "./Sello";
import { BOTON, ICONO, unidades } from "./ui";

const reducir = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function EncabezadoVivo({ barra, buscador }: { barra: ReactNode; buscador?: ReactNode }) {
  const [desplazado, setDesplazado] = useState(false);
  const [oculto, setOculto] = useState(false);
  const fila = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ultimo = window.scrollY;
    let pendiente = false;
    const medir = () => {
      pendiente = false;
      const y = window.scrollY;
      setDesplazado(y > 8);
      const d = y - ultimo;
      if (Math.abs(d) < 6) return;
      // Escribiendo en el buscador (teclado abierto) no se esconde.
      const escribiendo = fila.current?.contains(document.activeElement) ?? false;
      setOculto(d > 0 && y > 140 && !escribiendo);
      ultimo = y;
    };
    const alMover = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", alMover, { passive: true });
    return () => window.removeEventListener("scroll", alMover);
  }, []);

  return (
    <>
      <div data-desplazado={desplazado ? "si" : "no"} className="ti-barra sticky top-0 z-40">
        {barra}
      </div>
      {buscador && (
        <div ref={fila} data-oculto={oculto ? "si" : "no"} className="ti-buscador-movil sticky top-14 z-30 bg-[var(--ti-fondo)] md:hidden">
          {buscador}
        </div>
      )}
    </>
  );
}

/** Si el catálogo quita la búsqueda (sin recargar), la URL cambia y el campo se vacía solo (`key`). */
export function CampoBuscar({ id, className }: { id: string; className: string }) {
  const q = useSearchParams()?.get("q") ?? "";
  return <input key={q} id={id} name="q" type="search" enterKeyHint="search" defaultValue={q} placeholder="¿Qué buscas hoy?" className={`${className} text-ellipsis`} />;
}

type Aviso = { nombre: string; imagen: string; n: number; top: number; derecha: number };

export function BolsaEncabezado() {
  const { count, items } = useCart();
  const abierta = useBolsaAbierta();
  const [previo, setPrevio] = useState<number | null>(null);
  const [pulso, setPulso] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [raiz, setRaiz] = useState<Element | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const antes = useRef<{ count: number; mapa: Map<string, number> } | null>(null);
  const tocado = useRef(0);
  const quieto = useRef(false);

  // `?carrito=abrir` (desde otra página): se borra ANTES de abrir, así ni el doble montaje ni una recarga la reabren.
  useEffect(() => {
    setRaiz(boton.current?.closest("[data-pagina]") ?? document.body);
    const params = new URLSearchParams(window.location.search);
    if (params.get("carrito") !== "abrir") return;
    params.delete("carrito");
    const resto = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${resto ? `?${resto}` : ""}${window.location.hash}`);
    abrirBolsa();
  }, []);

  useEffect(() => {
    const marcar = () => {
      tocado.current = Date.now();
    };
    window.addEventListener("pointerdown", marcar, { capture: true, passive: true });
    window.addEventListener("keydown", marcar, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", marcar, { capture: true });
      window.removeEventListener("keydown", marcar, { capture: true });
    };
  }, []);

  useEffect(() => {
    const mapa = new Map(items.map((i) => [String(i.id), i.quantity]));
    const ultimo = antes.current;
    antes.current = { count, mapa };
    if (!ultimo || ultimo.count === count) return;
    setPrevio(ultimo.count);
    if (count < ultimo.count || Date.now() - tocado.current > 2000) return;
    setPulso((p) => p + 1);
    const nuevo = items.find((i) => i.quantity > (ultimo.mapa.get(String(i.id)) ?? 0));
    const nombre = nuevo?.name ?? "un producto";
    setAnuncio(`Agregaste ${nombre}. Llevas ${unidades(count)}.`);
    const b = boton.current;
    if (b && !reducir()) {
      b.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(.34,1.56,.64,1)" });
    }
    if (abierta || !b) return;
    const r = b.getBoundingClientRect();
    setAviso({ nombre, imagen: nuevo?.image ?? "", n: count, top: Math.round(r.bottom + 10), derecha: Math.max(16, Math.round(window.innerWidth - r.right)) });
  }, [count, items, abierta]);

  // El globo se va a los 2,5 s (o al abrir la bolsa); con el puntero o el foco encima, espera.
  useEffect(() => {
    if (!aviso) return;
    if (abierta) {
      setAviso(null);
      return;
    }
    const t = setInterval(() => {
      if (!quieto.current) setAviso(null);
    }, 2500);
    return () => clearInterval(t);
  }, [aviso, abierta]);

  return (
    <>
      <button ref={boton} type="button" onClick={abrirBolsa} data-ti-bolsa aria-label={`Abrir tu bolsa: ${unidades(count)}`} className={`${ICONO} relative inline-flex`}>
        <ShoppingBag className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5">
            {pulso > 0 && <span key={pulso} aria-hidden="true" className="ti-aro-pulso absolute -inset-[3.5px] rounded-full border-[1.5px] border-[var(--ti-acento)]" />}
            <SelloContador n={count} previo={previo ? previo : null} tamano={22} />
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {anuncio}
      </span>
      {aviso &&
        raiz &&
        createPortal(
          <div
            onPointerEnter={() => (quieto.current = true)}
            onPointerLeave={() => (quieto.current = false)}
            onFocus={() => (quieto.current = true)}
            onBlur={() => (quieto.current = false)}
            style={{ "--ti-globo-top": `${aviso.top}px`, "--ti-globo-derecha": `${aviso.derecha}px` } as CSSProperties}
            className="ti-entrar ti-sombra-flotante fixed right-[var(--ti-globo-derecha)] top-[var(--ti-globo-top)] z-50 hidden w-80 rounded-[var(--ti-radio-tarjeta)] border border-[var(--ti-linea-suave)] bg-[var(--ti-fondo)] p-4 md:block"
          >
            <div className="flex items-start gap-3.5">
              <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--ti-radio-control)] bg-[var(--ti-suave)]">
                {aviso.imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura de 64 px: sin el paso de /_next/image
                  <img src={aviso.imagen} alt="" width={64} height={64} className="h-full w-full object-cover" />
                ) : (
                  <ShoppingBag className="h-6 w-6 text-[var(--ti-texto-3)]" strokeWidth={1.6} aria-hidden="true" />
                )}
              </span>
              <div className="flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ti-texto)]">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ti-acento)] text-[var(--ti-sobre-acento)]">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  Agregaste a tu bolsa
                </p>
                <p className="mt-1.5 line-clamp-2 text-base font-medium leading-snug text-[var(--ti-texto)]">{aviso.nombre}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--ti-linea-suave)] pt-3">
              <span className="text-sm text-[var(--ti-texto-3)]">Llevas {unidades(aviso.n)}</span>
              <button
                type="button"
                onClick={() => {
                  setAviso(null);
                  abrirBolsa();
                }}
                className={BOTON}
              >
                Ver bolsa
              </button>
            </div>
          </div>,
          raiz,
        )}
    </>
  );
}
