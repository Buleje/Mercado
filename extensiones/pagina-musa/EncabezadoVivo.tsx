"use client";

/**
 * Lo que se mueve en el encabezado de Musa (contrato §e y §f):
 *
 * · `EncabezadoVivo` — la barra pegajosa: pasados 8 px de scroll se vuelve
 *   92 % opaca con desenfoque y filete (`.mu-barra`); en el celular el
 *   buscador va en su propia fila pegajosa debajo, que se esconde al bajar y
 *   vuelve al subir (sólo `transform`/`opacity`: se mete detrás de la barra).
 *   Son dos hermanos (no un padre bajito) porque `sticky` sólo pega dentro de
 *   su padre: el padre es la página entera.
 * · `BolsaEncabezado` — la bolsa con el SELLO CONTADOR: el total de unidades
 *   sube con cada cambio, un aro fino hace un pulso y la bolsa late (si viene
 *   un vuelo de `volarABolsa`, el latido lo da su aterrizaje). Al agregar, un
 *   globo «Agregaste… · Llevas 3 · Ver bolsa» bajo la bolsa (2,5 s, desde
 *   768 px: en el celular taparía el contador de la tarjeta y el aviso de abajo
 *   ya lo da la píldora «Ver bolsa» de `Bolsa.tsx`) y el anuncio para el lector.
 *   El globo sólo sale si lo agregó la persona (un toque o tecla reciente):
 *   ni la carga de la bolsa guardada ni otra pestaña lo disparan. El globo
 *   lleva la mini ilustración del envase en su arco, sobre el tinte de su
 *   categoría (sin imagen, el sello). Si la tienda rechaza un producto que ya
 *   no está, `AvisoNoAgregado` lo dice en todos los anchos (antes, botón mudo).
 * El menú del celular vive en `MenuMovil.tsx`.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ShoppingBag } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { unidades } from "./destinos";
import { AvisoNoAgregado } from "./AvisoNoAgregado";
import { abrirBolsa, useBolsaAbierta } from "./estado-bolsa";
import { tinteDe } from "./imagenes";
import { Sello, SelloContador } from "./Sello";

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
      <div data-desplazado={desplazado ? "si" : "no"} className="mu-barra sticky top-0 z-40">
        {barra}
      </div>
      {buscador && (
        <div ref={fila} data-oculto={oculto ? "si" : "no"} className="mu-buscador-movil sticky top-14 z-30 bg-[var(--surface-canvas)] md:hidden">
          {buscador}
        </div>
      )}
    </>
  );
}

type Aviso = { nombre: string; imagen: string; categoria: string; n: number; top: number; derecha: number };

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
    // Sólo lo que agrega la persona celebra: la bolsa guardada que se carga sola, no.
    if (count < ultimo.count || Date.now() - tocado.current > 2000) return;
    setPulso((p) => p + 1);
    const nuevo = items.find((i) => i.quantity > (ultimo.mapa.get(String(i.id)) ?? 0));
    const nombre = nuevo?.name ?? "un producto";
    setAnuncio(`Agregaste ${nombre}. Llevas ${unidades(count)}.`);
    const b = boton.current;
    // Con vuelo en camino, el latido lo da el aterrizaje (`saltarBolsa`): uno solo.
    if (b && !reducir() && !document.querySelector("[data-bb-vuelo]")) {
      b.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(.34,1.56,.64,1)" });
    }
    if (abierta || !b) return;
    const r = b.getBoundingClientRect();
    setAviso({
      nombre,
      imagen: nuevo?.image ?? "",
      categoria: nuevo?.category ?? "",
      n: count,
      top: Math.round(r.bottom + 10),
      derecha: Math.max(16, Math.round(window.innerWidth - r.right)),
    });
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
      <button
        ref={boton}
        type="button"
        onClick={abrirBolsa}
        data-mu-bolsa
        aria-label={`Abrir tu bolsa: ${unidades(count)}`}
        className="mu-foco relative inline-flex h-12 w-12 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--mu-nude-claro)]"
      >
        <ShoppingBag className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5">
            {pulso > 0 && <span key={pulso} aria-hidden="true" className="mu-aro-pulso absolute -inset-[3.5px] rounded-full border-[1.5px] border-[var(--mu-contador-aro)]" />}
            <SelloContador n={count} previo={previo ? previo : null} tamano={22} />
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {anuncio}
      </span>
      <AvisoNoAgregado raiz={raiz} />
      {aviso &&
        raiz &&
        createPortal(
          <div
            onPointerEnter={() => (quieto.current = true)}
            onPointerLeave={() => (quieto.current = false)}
            onFocus={() => (quieto.current = true)}
            onBlur={() => (quieto.current = false)}
            style={{ "--mu-globo-top": `${aviso.top}px`, "--mu-globo-derecha": `${aviso.derecha}px` } as CSSProperties}
            className="mu-entrar mu-sombra-flotante fixed right-[var(--mu-globo-derecha)] top-[var(--mu-globo-top)] z-50 hidden w-80 rounded-[var(--mu-radio-tarjeta)] border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 md:block"
          >
            <div className="flex items-start gap-3.5">
              <span className={`mu-arco relative flex h-20 w-16 shrink-0 items-end justify-center overflow-hidden ${tinteDe(aviso.categoria)}`}>
                {aviso.imagen ? (
                  // El lienzo de la ilustración es cuadrado y con aire alrededor: al 150 % el envase llena el arco.
                  // eslint-disable-next-line @next/next/no-img-element -- ilustración local de 64 px: sin el paso de /_next/image
                  <img src={aviso.imagen} alt="" width={96} height={96} className="absolute -bottom-2 left-1/2 w-[150%] max-w-none -translate-x-1/2" />
                ) : (
                  <Sello id="globo" simple className="mb-3 h-9 w-9" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[length:var(--mu-t-chico)] font-semibold text-[var(--mu-exito)]">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--mu-exito-fondo)]">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  Agregaste a tu bolsa
                </p>
                <p className="mt-1.5 line-clamp-2 text-[length:var(--mu-t-nombre)] font-medium leading-snug text-[var(--text-primary)]">{aviso.nombre}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--rule-soft)] pt-3">
              <span className="text-[length:var(--mu-t-chico)] text-[var(--text-tertiary)]">Llevas {unidades(aviso.n)}</span>
              <button
                type="button"
                onClick={() => {
                  setAviso(null);
                  abrirBolsa();
                }}
                className="mu-foco inline-flex h-12 items-center rounded-full bg-[var(--mu-boton-fondo)] px-5 text-sm font-semibold text-[var(--mu-boton-texto)] transition-colors hover:bg-[var(--mu-boton-fondo-hover)]"
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
