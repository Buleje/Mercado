"use client";

/**
 * Lo que se toca en la ficha de un producto (ADR-460): cuántos (contador grande),
 * «Agregar 2 · S/ 118» y «Pregunta por WhatsApp».
 *
 * La bolsa es el CARRITO DE LA TIENDA (`useCart` del layout — nunca otro
 * `CartProvider`). Al agregar suena el «pop» (`addMultiple` no lo toca: lo pide
 * `sonarAgregado`). En la ficha, la ilustración vuela a la bolsa del encabezado
 * (que late y muestra «Agregaste…», `EncabezadoVivo.tsx`) y abajo del botón queda «Ya
 * llevas 2 en tu bolsa · Ver bolsa»: no se abre el cajón para que sigas mirando.
 * En la ficha rápida (`FichaRapida`), `alAgregar` reemplaza todo eso: el modal se
 * cierra y la foto vuela desde ahí. Sin `consulta` no sale «Pregunta por WhatsApp».
 *
 * «Agregaste…» (el globo y el anuncio para el lector de pantalla) lo pone la bolsa
 * del encabezado (`EncabezadoVivo.tsx`) al ver crecer el carrito.
 *
 * (La barra fija del celular, cuando este botón sale de la vista, es `BarraCompra`.)
 *
 * El total del botón es una vista previa (precio × cantidad): el pedido lo
 * confirma Drucila. Tope: lo que queda en existencia menos lo que ya está en tu
 * bolsa (nunca más de 20, el tope del carrito).
 */
import { useState } from "react";
import { Check, MessageCircle, ShoppingBag } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import type { Product } from "@/data/products";
import { Contador, TOPE_CARRITO } from "./BolsaPartes";
import { sonarAgregado, volarABolsa } from "./efecto-agregar";
import { abrirBolsa } from "./estado-bolsa";
import { solesPedido } from "./pedido-whatsapp";

const AGREGAR =
  "mu-foco inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--mu-boton-fondo)] px-5 text-base font-semibold text-[var(--mu-boton-texto)] transition duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] hover:-translate-y-0.5 hover:bg-[var(--mu-boton-fondo-hover)] active:scale-[.97] aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:translate-y-0";

const CONSULTA =
  "mu-foco inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 text-base font-semibold text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] hover:border-[var(--mu-whatsapp-fondo)]";

export function Comprar({
  producto,
  consulta,
  alAgregar,
}: {
  producto: Product;
  consulta?: string;
  alAgregar?: (cantidad: number) => void;
}) {
  const { addMultiple, items } = useCart();
  const [cantidad, setCantidad] = useState(1);

  const enBolsa = items.find((i) => i.id === producto.id)?.quantity ?? 0;
  const existencia = typeof producto.stock === "number" ? producto.stock : TOPE_CARRITO;
  const agotado = typeof producto.stock === "number" && producto.stock <= 0;
  const quedan = Math.max(0, Math.min(existencia, TOPE_CARRITO) - enBolsa);
  const n = Math.max(1, Math.min(cantidad, quedan));
  const sinLugar = agotado || quedan === 0;

  const agregar = (origen: Element | null) => {
    if (sinLugar) return;
    addMultiple([{ product: producto, quantity: n }]);
    sonarAgregado();
    setCantidad(1);
    if (alAgregar) alAgregar(n);
    else volarABolsa(origen, producto.image);
  };

  return (
    <div className="mt-7 flex flex-col gap-3">
      <div className="flex gap-3">
        {!agotado && quedan > 0 && (
          <Contador
            grande
            valor={n}
            max={Math.max(1, quedan)}
            etiqueta={`Cuántos ${producto.name} vas a agregar`}
            menosEtiqueta="Uno menos"
            masEtiqueta="Uno más"
            menos={() => setCantidad(n - 1)}
            mas={() => setCantidad(n + 1)}
          />
        )}
        <button
          type="button"
          onClick={(e) => agregar(e.currentTarget)}
          aria-disabled={sinLugar || undefined}
          className={AGREGAR}
        >
          {agotado ? (
            "Agotado por ahora"
          ) : quedan === 0 ? (
            "Ya tienes todo lo disponible"
          ) : (
            <>
              <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                Agregar{n > 1 ? ` ${n}` : ""} ·{" "}
                <span
                  key={n}
                  className="inline-block animate-[mu-contador-sube_var(--mu-dur-corto)_var(--mu-ease-rebote)] tabular-nums"
                >
                  {solesPedido(producto.price * n)}
                </span>
              </span>
            </>
          )}
        </button>
      </div>
      {enBolsa > 0 && !alAgregar && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-[var(--mu-exito)]">
          <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          Ya llevas {enBolsa} en tu bolsa ·{" "}
          <button
            type="button"
            onClick={abrirBolsa}
            className="mu-foco inline-flex h-12 items-center rounded font-semibold underline underline-offset-4 hover:no-underline"
          >
            Ver bolsa
          </button>
        </p>
      )}
      {consulta && (
        <a href={consulta} target="_blank" rel="noopener noreferrer" className={CONSULTA}>
          <MessageCircle className="h-5 w-5 text-[var(--mu-exito)]" aria-hidden="true" /> Pregunta
          por WhatsApp
        </a>
      )}
    </div>
  );
}
