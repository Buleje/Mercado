"use client";

/**
 * «Agregar» y el CONTADOR de la bolsa (contrato visual §f): al tocar «Agregar»
 * el botón se rellena y se convierte en `[− n +]`, que dice cuántos llevas de
 * ESE producto. El número sale del carrito de la tienda (`useCart`, guardado
 * por negocio): la tarjeta, la ficha rápida y la barra de la ficha muestran
 * siempre lo mismo que la bolsa, y llegar a 0 lo quita.
 *
 * · Al agregar: suena el «pop» (`addItem`) y el envase vuela a la bolsa
 *   (`volarABolsa`); el «+» no vuela (cansa). El latido de la bolsa, el globo
 *   «Agregaste…» (escritorio), la píldora «Ver bolsa» (celular) y el anuncio
 *   para el lector los pone el encabezado (`EncabezadoVivo.tsx`) al ver crecer
 *   el carrito: acá no se repiten. Un aviso flotante junto al botón tapaba el
 *   «Cód.» de la tarjeta y repetía el globo (10-10): lo que queda a la vista es
 *   el contador y el chip «✓ En tu bolsa» de la tarjeta. Este botón sólo le
 *   cuenta al lector lo que el encabezado no dice (quitar).
 * · Grande (ficha rápida, promos): con algo en la bolsa, el contador va junto a
 *   «Ver bolsa» (la acción que sigue), y debajo «✓ Ya llevas N en tu bolsa».
 * · Foco: el botón tocado desaparece al cambiar de forma, así que el foco pasa
 *   al «+» (al agregar) o a «Agregar» (al quitar el último): nunca al `<body>`.
 * · Tope: lo que hay en existencia y nunca más de 20 (el del carrito). El «+»
 *   lleno no se apaga con `disabled` (soltaría el foco): `aria-disabled`.
 * · Los totales son vista previa: el precio final lo arma Drucila con el pedido.
 *
 * `BarraCompra`: la barra fija de la ficha en el celular (precio + contador).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check, Minus, Plus, ShoppingBag, Trash2 } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import type { Product } from "@/data/products";
import { reducirMovimiento, sonarAgregado, volarABolsa } from "./efecto-agregar";
import { abrirBolsa } from "./estado-bolsa";
import { solesCortos as precio } from "./destinos";

/** El tope por producto del carrito de la tienda (`MAX_QTY` de `cart-context`). */
const TOPE_CARRITO = 20;

/** Cuántas unidades de este producto hay en la bolsa (0 si ninguna). */
export function useEnBolsa(id: number): number {
  const { items } = useCart();
  return items.find((i) => i.id === id)?.quantity ?? 0;
}

type Variante = "tarjeta" | "grande" | "barra";

/** Forma de cada variante: botón «Agregar», contador, sus pasos y el lado del sello con el número. */
const ESTILO: Record<Variante, { agregar: string; contador: string; paso: string; numero: string }> = {
  tarjeta: {
    agregar:
      "h-11 w-full border-[1.5px] border-[var(--mu-boton-fondo)] text-[var(--text-primary)] hover:bg-[var(--mu-boton-fondo)] hover:text-[var(--mu-boton-texto)] @min-[15.5rem]:h-10 @min-[15.5rem]:w-auto @min-[15.5rem]:px-4",
    contador: "h-11 w-full @min-[15.5rem]:h-10 @min-[15.5rem]:w-[7rem] bg-[var(--mu-contador-fondo)] text-[var(--mu-contador-texto)]",
    paso: "h-11 w-11 @min-[15.5rem]:h-10",
    numero: "28px",
  },
  grande: {
    agregar: "h-12 w-full bg-[var(--mu-boton-fondo)] text-[var(--mu-boton-texto)] hover:bg-[var(--mu-boton-fondo-hover)]",
    contador: "h-12 w-[9.5rem] shrink-0 bg-[var(--mu-contador-fondo)] text-[var(--mu-contador-texto)]",
    paso: "h-12 w-12",
    numero: "34px",
  },
  barra: {
    // Sobre la barra cacao: el nude del sello con la tinta negra (igual en los dos temas, 9,39:1).
    agregar: "h-11 px-5 bg-[var(--mu-sello-nude)] text-[var(--mu-sello-m)] hover:opacity-90",
    contador: "h-11 w-[8.5rem] bg-[var(--mu-sello-nude)] text-[var(--mu-sello-m)]",
    paso: "h-11 w-11",
    numero: "30px",
  },
};

export function BotonAgregar({ producto, variante = "tarjeta", alVerBolsa }: { producto: Product; variante?: Variante; alVerBolsa?: () => void }) {
  const { addItem, updateQty } = useCart();
  const n = useEnBolsa(producto.id);
  const [lector, setLector] = useState("");
  const enfocar = useRef<"mas" | "agregar" | null>(null);
  const previo = useRef(n);
  const mas = useRef<HTMLButtonElement>(null);
  const agregarBtn = useRef<HTMLButtonElement>(null);
  const grupo = useRef<HTMLDivElement>(null);

  // Después del cambio de forma: el foco al botón que quedó y el «relleno» (botón → contador, 320 ms).
  useEffect(() => {
    if (enfocar.current === "mas" && n > 0) {
      mas.current?.focus({ preventScroll: true });
      if (previo.current === 0 && !reducirMovimiento()) {
        grupo.current?.animate([{ transform: "scaleX(0.82)", opacity: 0.6 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
    }
    if (enfocar.current === "agregar" && n === 0) agregarBtn.current?.focus({ preventScroll: true });
    enfocar.current = null;
    previo.current = n;
  }, [n]);

  const agotado = typeof producto.stock === "number" && producto.stock <= 0;
  const tope = Math.min(typeof producto.stock === "number" ? producto.stock : TOPE_CARRITO, TOPE_CARRITO);
  const lleno = n >= tope;
  const e = ESTILO[variante];


  const agregar = (el: HTMLElement) => {
    if (agotado) return;
    addItem(producto);
    const origen = variante === "barra" ? el : el.closest("[data-mu-producto]")?.querySelector("[data-mu-foto]");
    volarABolsa(origen ?? el, producto.image);
    enfocar.current = "mas";
    setLector("");
  };

  const sumar = () => {
    if (lleno) return;
    updateQty(producto.id, n + 1);
    sonarAgregado();
    setLector("");
  };

  const restar = () => {
    updateQty(producto.id, n - 1);
    if (n - 1 === 0) {
      enfocar.current = "agregar";
      setLector(`Quitaste ${producto.name} de tu bolsa.`);
    } else {
      setLector(`Llevas ${n - 1} de ${producto.name} en tu bolsa.`);
    }
  };

  const base = "mu-foco inline-flex items-center justify-center gap-2 rounded-full text-[length:var(--mu-t-boton,15px)] font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.97]";
  const paso =
    "relative inline-flex shrink-0 items-center justify-center rounded-full transition-transform duration-100 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-[-5px] focus-visible:outline-current aria-disabled:cursor-not-allowed aria-disabled:opacity-40";

  return (
    // `@min-[15.5rem]`: el ancho de la TARJETA (container query), no el de la pantalla: la misma tarjeta va en la grilla y en carriles.
    <div className={`relative ${variante === "tarjeta" ? "w-full @min-[15.5rem]:w-auto" : ""}`}>
      {n === 0 ? (
        <button
          ref={agregarBtn}
          type="button"
          disabled={agotado}
          onClick={(ev) => agregar(ev.currentTarget)}
          aria-label={agotado ? `${producto.name}: agotado` : `Agregar ${producto.name} a tu bolsa`}
          className={`${base} ${e.agregar} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {agotado ? (
            "Agotado"
          ) : (
            <>
              <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              {variante === "tarjeta" ? "Agregar" : variante === "barra" ? "Agregar" : `Agregar a tu bolsa · ${precio(producto.price)}`}
            </>
          )}
        </button>
      ) : (
        <div className={variante === "grande" ? "flex items-center gap-3" : "contents"}>
          <div
            ref={grupo}
            role="group"
            aria-label={`Cantidad de ${producto.name} en tu bolsa`}
            className={`inline-flex items-center justify-between rounded-full ${e.contador}`}
          >
            <button type="button" onClick={restar} aria-label={n === 1 ? `Quitar ${producto.name} de tu bolsa` : `Quitar uno de ${producto.name}`} className={`${paso} ${e.paso}`}>
              {n === 1 ? <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" /> : <Minus className="h-5 w-5" aria-hidden="true" />}
            </button>
            {/* El número en el «sello contador» (círculo con el aro oro del logo, `tema.ts`); entra desde abajo en cada cambio. */}
            <output className="mu-sello-contador" style={{ "--mu-lado": e.numero } as CSSProperties} aria-label={`${n} en tu bolsa`}>
              <span key={n} className="mu-contador-num">
                {n}
              </span>
            </output>
            <button ref={mas} type="button" onClick={sumar} aria-disabled={lleno} aria-label={lleno ? `Ya llevas todo lo disponible de ${producto.name}` : `Agregar uno más de ${producto.name}`} className={`${paso} ${e.paso}`}>
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {variante === "grande" && (
            <button type="button" onClick={alVerBolsa ?? abrirBolsa} className={`${base} h-12 min-w-0 flex-1 bg-[var(--mu-boton-fondo)] px-4 text-[var(--mu-boton-texto)] hover:bg-[var(--mu-boton-fondo-hover)]`}>
              Ver bolsa <ArrowRight className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {variante === "grande" && n > 0 && <EnTuBolsa n={n} />}
      <span className="sr-only" aria-live="polite">
        {lector}
      </span>
    </div>
  );
}

/** «✓ Ya llevas 2 en tu bolsa» (selva), debajo del contador grande y su «Ver bolsa». */
export function EnTuBolsa({ n }: { n: number }) {
  return (
    <p className="mt-3 flex items-center gap-2 text-[length:var(--mu-t-chico)] font-medium text-[var(--mu-exito)]">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--mu-exito-fondo)]" aria-hidden="true">
        <Check className="h-3 w-3" strokeWidth={2.6} />
      </span>
      Ya llevas {n} en tu bolsa
    </p>
  );
}

/**
 * La ficha en el celular (Rhode): cuando el botón principal (`ancla`) sale de la
 * vista por arriba, sube una barra cacao fija abajo con el precio y el contador.
 * Mientras se ve, marca `<html data-mu-barra-compra>` (el aviso «Ver bolsa» de la
 * bolsa puede correrse). Escondida = `inert`: no se enfoca ni la lee el lector.
 */
export function BarraCompra({ producto, ancla }: { producto: Product; ancla: string }) {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    const el = document.getElementById(ancla);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([x]) => setVer(Boolean(x) && !x.isIntersecting && x.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [ancla]);
  useEffect(() => {
    const html = document.documentElement;
    if (ver) html.dataset.muBarraCompra = "";
    else delete html.dataset.muBarraCompra;
    return () => {
      delete html.dataset.muBarraCompra;
    };
  }, [ver]);

  return (
    <div
      inert={!ver}
      aria-hidden={!ver}
      className={`mu-sombra-flotante fixed inset-x-0 bottom-0 z-50 bg-[var(--mu-cacao)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-[var(--mu-sobre-cacao)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden ${
        ver ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[length:var(--mu-t-chico)] text-[var(--mu-sobre-cacao-2)]">{producto.name}</p>
          <p className="mu-precio mt-0.5 text-[1.625rem]">{precio(producto.price)}</p>
        </div>
        <BotonAgregar producto={producto} variante="barra" />
      </div>
    </div>
  );
}
