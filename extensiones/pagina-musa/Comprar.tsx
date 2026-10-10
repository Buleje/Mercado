"use client";

/**
 * Lo que se toca en la ficha de un producto del salón (ADR-460): cuántos,
 * «Agregar a la bolsa» y «Pregunta por WhatsApp».
 *
 * La bolsa es el CARRITO DE LA TIENDA (`useCart` del layout — nunca otro
 * `CartProvider`): lo que se agrega acá es lo mismo que se paga en el checkout
 * de siempre. Al agregar suena el «pop» (`addMultiple` no lo toca: lo pide
 * `sonarAgregado`) y se abre la bolsa del salón (`abrirBolsa`), que al
 * cerrarse devuelve el foco a este botón. En la ficha rápida (`FichaRapida`),
 * `alAgregar` reemplaza a la bolsa: el modal se cierra y la foto vuela a ella.
 * Sin `consulta` (el modal no sabe el WhatsApp) no sale «Pregunta por WhatsApp».
 *
 * Tope: lo que queda en existencia menos lo que ya está en tu bolsa (y nunca
 * más de 20, el tope del carrito). Los botones no se apagan con `disabled`
 * (con el foco encima, el foco caería al `<body>`): llevan `aria-disabled`.
 */
import { useEffect, useRef, useState } from "react";
import { Check, MessageCircle, Minus, Plus, ShoppingBag } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import type { Product } from "@/data/products";
import { sonarAgregado } from "./efecto-agregar";
import { abrirBolsa } from "./estado-bolsa";
import { BOTON, BOTON_BORDE } from "./ui";

/** El tope por producto del carrito de la tienda (`MAX_QTY` de `cart-context`). */
const TOPE_CARRITO = 20;

const PASO =
  "inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-primary)] transition hover:bg-[var(--mu-nude-claro)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";

function Cantidad({ valor, max, cambiar }: { valor: number; max: number; cambiar: (n: number) => void }) {
  const menos = valor <= 1;
  const mas = valor >= max;
  return (
    <div role="group" aria-label="Cantidad" className="inline-flex h-12 shrink-0 items-center rounded-full border-2 border-[var(--rule-base)] px-0.5">
      <button type="button" aria-label="Quitar una unidad" aria-disabled={menos} onClick={() => !menos && cambiar(valor - 1)} className={PASO}>
        <Minus className="h-5 w-5" aria-hidden="true" />
      </button>
      <output aria-live="polite" aria-label={`Cantidad: ${valor}`} className="w-9 text-center text-lg font-semibold tabular-nums text-[var(--text-primary)]">
        {valor}
      </output>
      <button type="button" aria-label="Sumar una unidad" aria-disabled={mas} onClick={() => !mas && cambiar(valor + 1)} className={PASO}>
        <Plus className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function Comprar({ producto, consulta, alAgregar }: { producto: Product; consulta?: string; alAgregar?: (cantidad: number) => void }) {
  const { addMultiple, items } = useCart();
  const [cantidad, setCantidad] = useState(1);
  const [aviso, setAviso] = useState("");
  const [hecho, setHecho] = useState(false);
  const reloj = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(reloj.current), []);

  const enBolsa = items.find((i) => i.id === producto.id)?.quantity ?? 0;
  const existencia = typeof producto.stock === "number" ? producto.stock : TOPE_CARRITO;
  const agotado = typeof producto.stock === "number" && producto.stock <= 0;
  const quedan = Math.max(0, Math.min(existencia, TOPE_CARRITO) - enBolsa);
  const n = Math.max(1, Math.min(cantidad, quedan));
  const sinLugar = agotado || quedan === 0;

  const agregar = () => {
    if (sinLugar) return;
    addMultiple([{ product: producto, quantity: n }]);
    sonarAgregado();
    setAviso(`Agregaste ${n} × ${producto.name}. Tienes ${enBolsa + n} en tu bolsa.`);
    setCantidad(1);
    setHecho(true);
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setHecho(false), 1800);
    if (alAgregar) alAgregar(n);
    else abrirBolsa();
  };

  return (
    <div className="mt-7 flex flex-col gap-3">
      <div className="flex gap-3">
        {!agotado && <Cantidad valor={n} max={Math.max(1, quedan)} cambiar={setCantidad} />}
        <button
          type="button"
          onClick={agregar}
          aria-disabled={sinLugar}
          className={`${BOTON} flex-1 px-5 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-none`}
        >
          {agotado ? (
            "Agotado por ahora"
          ) : quedan === 0 ? (
            "Ya tienes todo lo disponible"
          ) : hecho ? (
            <>
              <Check className="h-5 w-5" aria-hidden="true" /> Agregado
            </>
          ) : (
            <>
              <ShoppingBag className="h-5 w-5" aria-hidden="true" /> Agregar a la bolsa
            </>
          )}
        </button>
      </div>
      {consulta && (
        <a href={consulta} target="_blank" rel="noopener noreferrer" className={`${BOTON_BORDE} w-full`}>
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pregunta por WhatsApp
        </a>
      )}
      {/* «Ya tienes N» no se repite acá: lo dicen el número del encabezado y el aviso flotante «Ver bolsa». */}
      <span className="sr-only" aria-live="polite">
        {aviso}
      </span>
    </div>
  );
}
