"use client";

/**
 * «Agregar» y el CONTADOR de la bolsa (ADR-511; como el de Musa): al tocar
 * «Agregar» el botón se vuelve `[− n +]`, que dice cuántos llevas de ESE
 * producto. El número sale del carrito de la tienda (`useCart`, guardado por
 * negocio): la tarjeta, la ficha y la bolsa muestran siempre lo mismo, y
 * llegar a 0 lo quita.
 *
 * · Al agregar suena el «pop» (`addItem`); el latido de la bolsa y el globo
 *   «Agregaste…» los pone el encabezado (`EncabezadoVivo`) al ver crecer el
 *   carrito. Este botón sólo le cuenta al lector lo que el encabezado no dice
 *   (cuántos quedan, quitar).
 * · Foco: el botón tocado desaparece al cambiar de forma, así que el foco pasa
 *   al «+» (al agregar) o a «Agregar» (al quitar el último): nunca al `<body>`.
 * · Tope: lo que hay en existencia (si el negocio la carga) y nunca más de 20
 *   (el del carrito). El «+» lleno no se apaga con `disabled` (soltaría el
 *   foco): `aria-disabled`. Sin existencias cargadas nunca dice «Agotado».
 * · Grande (la ficha): con algo en la bolsa, el contador va junto a «Ver
 *   bolsa» y debajo «✓ Ya llevas N en tu bolsa».
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check, Minus, Plus, ShoppingBag, Trash2 } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import type { Product } from "@/data/products";
import { abrirBolsa } from "./estado-bolsa";
import { solesCortos } from "./ui";

/** El tope por producto del carrito de la tienda (`MAX_QTY` de `cart-context`). */
export const TOPE_CARRITO = 20;

/** Cuántas unidades de este producto hay en la bolsa (0 si ninguna). */
export function useEnBolsa(id: number): number {
  const { items } = useCart();
  return items.find((i) => i.id === id)?.quantity ?? 0;
}

type Variante = "tarjeta" | "grande" | "barra";

const LLENO = "bg-[var(--ti-acento)] text-[var(--ti-sobre-acento)]";

/** Forma de cada variante: botón «Agregar», contador y el lado del sello con el número. */
const ESTILO: Record<Variante, { agregar: string; contador: string; numero: string }> = {
  tarjeta: {
    agregar:
      "w-full border-[1.5px] border-[var(--ti-texto)] text-[var(--ti-texto)] hover:bg-[var(--ti-texto)] hover:text-[var(--ti-fondo)] @min-[15.5rem]:w-auto @min-[15.5rem]:px-4",
    contador: "w-full @min-[15.5rem]:w-[7rem] bg-[var(--ti-suave)] text-[var(--ti-texto)]",
    numero: "28px",
  },
  grande: {
    agregar: `w-full px-6 ${LLENO} hover:bg-[color-mix(in_srgb,var(--ti-acento)_72%,var(--ti-texto-2))]`,
    contador: "w-[9.5rem] shrink-0 bg-[var(--ti-suave)] text-[var(--ti-texto)]",
    numero: "32px",
  },
  barra: {
    agregar: `px-5 ${LLENO}`,
    contador: "w-[8.5rem] bg-[var(--ti-suave)] text-[var(--ti-texto)]",
    numero: "30px",
  },
};

const BASE =
  "ti-foco inline-flex h-12 items-center justify-center gap-2 rounded-[var(--ti-radio-control)] text-[length:var(--ti-t-boton)] font-semibold transition-[background-color,color,transform] duration-[var(--ti-dur-corto)] active:scale-[0.97]";
const PASO =
  "relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform duration-100 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-[-5px] focus-visible:outline-current aria-disabled:cursor-not-allowed aria-disabled:opacity-40";

export function BotonAgregar({ producto, variante = "tarjeta" }: { producto: Product; variante?: Variante }) {
  const { addItem, updateQty } = useCart();
  const n = useEnBolsa(producto.id);
  const [lector, setLector] = useState("");
  const enfocar = useRef<"mas" | "agregar" | null>(null);
  const mas = useRef<HTMLButtonElement>(null);
  const agregarBtn = useRef<HTMLButtonElement>(null);

  // Después del cambio de forma: el foco al botón que quedó.
  useEffect(() => {
    if (enfocar.current === "mas" && n > 0) mas.current?.focus({ preventScroll: true });
    if (enfocar.current === "agregar" && n === 0) agregarBtn.current?.focus({ preventScroll: true });
    enfocar.current = null;
  }, [n]);

  const conStock = typeof producto.stock === "number";
  const agotado = conStock && (producto.stock ?? 0) <= 0;
  const tope = Math.min(conStock ? (producto.stock ?? 0) : TOPE_CARRITO, TOPE_CARRITO);
  const lleno = n >= tope;
  const e = ESTILO[variante];

  const agregar = () => {
    if (agotado) return;
    addItem(producto);
    enfocar.current = "mas";
    setLector("");
  };

  const sumar = () => {
    if (lleno) {
      setLector(conStock && tope === producto.stock ? `Ya llevas todo lo que hay de ${producto.name}.` : `Hasta ${TOPE_CARRITO} por producto.`);
      return;
    }
    updateQty(producto.id, n + 1);
    setLector(`Llevas ${n + 1} de ${producto.name} en tu bolsa.`);
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

  return (
    // `@min-[15.5rem]`: el ancho de la TARJETA (container query), no el de la pantalla.
    <div className={`relative ${variante === "tarjeta" ? "w-full @min-[15.5rem]:w-auto" : ""}`}>
      {n === 0 ? (
        <button
          ref={agregarBtn}
          type="button"
          disabled={agotado}
          onClick={agregar}
          aria-label={agotado ? `${producto.name}: agotado por ahora` : `Agregar ${producto.name} a tu bolsa`}
          className={`${BASE} ${e.agregar} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {agotado ? (
            "Agotado"
          ) : (
            <>
              <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              {variante === "grande" ? `Agregar a tu bolsa · ${solesCortos(producto.price)}` : "Agregar"}
            </>
          )}
        </button>
      ) : (
        <div className={variante === "grande" ? "flex items-center gap-3" : "contents"}>
          <div role="group" aria-label={`Cantidad de ${producto.name} en tu bolsa`} className={`inline-flex h-12 items-center justify-between rounded-[var(--ti-radio-control)] ${e.contador}`}>
            <button type="button" onClick={restar} aria-label={n === 1 ? `Quitar ${producto.name} de tu bolsa` : `Quitar uno de ${producto.name}`} className={PASO}>
              {n === 1 ? <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" /> : <Minus className="h-5 w-5" aria-hidden="true" />}
            </button>
            <output className="ti-sello-contador" style={{ "--ti-lado": e.numero } as CSSProperties} aria-label={`${n} en tu bolsa`}>
              <span key={n} className="ti-contador-num">
                {n}
              </span>
            </output>
            <button
              ref={mas}
              type="button"
              onClick={sumar}
              aria-disabled={lleno}
              aria-label={lleno ? `Ya llevas el máximo de ${producto.name}` : `Agregar uno más de ${producto.name}`}
              className={PASO}
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {variante === "grande" && (
            <button type="button" onClick={abrirBolsa} className={`${BASE} ${LLENO} min-w-0 flex-1 px-4`}>
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

/** «✓ Ya llevas 2 en tu bolsa», debajo del contador grande. */
export function EnTuBolsa({ n }: { n: number }) {
  return (
    <p className="mt-3 flex items-center gap-2 text-[length:var(--ti-t-chico)] font-medium text-[var(--ti-texto)]">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ti-acento)] text-[var(--ti-sobre-acento)]" aria-hidden="true">
        <Check className="h-3 w-3" strokeWidth={2.6} />
      </span>
      Ya llevas {n} en tu bolsa
    </p>
  );
}
