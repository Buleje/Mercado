"use client";

/**
 * Las piezas del cajón de la bolsa de la tienda (ADR-511; las de Musa sin su
 * sello ni sus «¿qué quieres mejorar?»):
 *
 * · `Contador` — el `[− N +]` de cada línea (botones de 48 px). Con 1 unidad el
 *   «−» es un tacho. Los botones no se apagan con `disabled` (con el foco
 *   encima, caería al `<body>`): llevan `aria-disabled`.
 * · `LineaBolsa` — la foto (o el ícono sobre el gris), el nombre, lo que suma,
 *   «c/u» y el contador. Al sacar, la fila se desliza (200 ms) antes de irse.
 * · `AvanceBolsa` — cuánto falta para el envío gratis del negocio (sin ese
 *   monto en Ajustes, nada).
 * · `BolsaVacia` — «Tu bolsa está vacía», «Ver el catálogo» y «Seguir mirando».
 *
 * Lo que suma cada línea es una vista previa: el total lo pone el checkout (o
 * el negocio, por WhatsApp).
 */
import { useRef } from "react";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, Truck } from "@buleje/design-system/icons";
import { useCart, type CartItem } from "@/contexts/cart-context";
import { TOPE_CARRITO } from "./BotonAgregar";
import { cerrarBolsa } from "./estado-bolsa";
import { avanceEnvio, solesPedido } from "./pedido-whatsapp";
import { FotoProducto } from "./TarjetaProducto";
import { BOTON } from "./ui";

/** «Reducir movimiento» del sistema: sin deslizar ni animar. */
export const reducirMovimiento = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const PASO =
  "ti-foco relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] hover:bg-[var(--ti-suave)] active:scale-[.94] aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";

export function Contador({ valor, max, nombre, menos, mas }: { valor: number; max: number; nombre: string; menos: () => void; mas: () => void }) {
  const tacho = valor <= 1;
  const sinMas = valor >= max;
  return (
    <div role="group" aria-label={`Cantidad de ${nombre} en tu bolsa`} className="inline-flex shrink-0 items-center rounded-full border border-[var(--ti-linea)] bg-[var(--ti-fondo)]">
      <button type="button" aria-label={tacho ? `Sacar ${nombre} de tu bolsa` : `Quitar uno de ${nombre}`} onClick={menos} className={PASO}>
        {tacho ? <Trash2 className="h-4 w-4" aria-hidden="true" /> : <Minus className="h-4 w-4" aria-hidden="true" />}
      </button>
      <output aria-live="polite" className="w-7 overflow-hidden text-center text-base font-semibold tabular-nums text-[var(--ti-texto)]">
        <span key={valor} className="ti-contador-num inline-block">
          {valor}
        </span>
      </output>
      <button type="button" aria-label={`Agregar uno más de ${nombre}`} aria-disabled={sinMas || undefined} onClick={() => !sinMas && mas()} className={PASO}>
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function LineaBolsa({ item, alQuitar }: { item: CartItem; alQuitar: (i: CartItem) => void }) {
  const { updateQty } = useCart();
  const fila = useRef<HTMLLIElement>(null);
  const tope = Math.min(TOPE_CARRITO, typeof item.stock === "number" ? Math.max(item.quantity, item.stock) : TOPE_CARRITO);

  const sacar = () => {
    const el = fila.current;
    if (!el || reducirMovimiento() || typeof el.animate !== "function") return alQuitar(item);
    const fin = () => alQuitar(item);
    el.animate(
      [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: "translateX(24px)" },
      ],
      { duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
    ).finished.then(fin, fin);
  };

  return (
    <li ref={fila} className="flex gap-3 py-4" data-ti-linea-bolsa>
      <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--ti-radio-control)] bg-[var(--ti-suave)]">
        <FotoProducto src={item.image ?? ""} tamanos="64px" icono="h-7 w-7" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="flex items-start justify-between gap-3">
          <p className="line-clamp-2 min-w-0 text-[length:var(--ti-t-chico)] font-medium leading-snug text-[var(--ti-texto)]">{item.name}</p>
          <span className="ti-nombre shrink-0 text-lg leading-tight tabular-nums text-[var(--ti-texto)]">{solesPedido(item.price * item.quantity)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm tabular-nums text-[var(--ti-texto-3)]">{item.quantity > 1 ? `${solesPedido(item.price)} c/u` : ""}</span>
          <Contador
            valor={item.quantity}
            max={tope}
            nombre={item.name}
            menos={() => (item.quantity <= 1 ? sacar() : updateQty(item.id, item.quantity - 1))}
            mas={() => updateQty(item.id, item.quantity + 1)}
          />
        </div>
      </div>
    </li>
  );
}

/** «Te faltan S/ 12 para el envío gratis» con su barra; «¡Tienes envío gratis!» al llegar. */
export function AvanceBolsa({ subtotal, gratisDesde }: { subtotal: number; gratisDesde: number | null }) {
  const a = avanceEnvio(subtotal, gratisDesde);
  if (!a) return null;
  return (
    <div data-ti-avance-envio className="mt-1 rounded-[var(--ti-radio-control)] bg-[var(--ti-suave)] px-4 py-3">
      <p role="status" className="flex items-center gap-2.5 text-[length:var(--ti-t-chico)] leading-snug text-[var(--ti-texto)]">
        <Truck className="h-5 w-5 shrink-0" strokeWidth={1.7} aria-hidden="true" />
        {a.logrado ? (
          <strong className="font-semibold">¡Tienes envío gratis!</strong>
        ) : (
          <span>
            Te faltan <strong className="font-semibold tabular-nums">{solesPedido(a.falta)}</strong> para el envío gratis
          </span>
        )}
      </p>
      <span aria-hidden="true" className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-[var(--ti-linea)]">
        <span
          className="block h-full origin-left rounded-full bg-[var(--ti-acento)] transition-transform duration-[var(--ti-dur-medio)] ease-[var(--ti-ease)]"
          style={{ transform: `scaleX(${a.fraccion})` }}
        />
      </span>
    </div>
  );
}

/** La bolsa sin nada: adónde ir. `porWhatsapp` cambia la frase (se pide en un mensaje). */
export function BolsaVacia({ catalogo, porWhatsapp }: { catalogo: string; porWhatsapp: boolean }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-8 text-center" data-lenis-prevent>
      {/* Centrado en el alto que sobra; si no entra, `my-auto` da 0 y corre desde arriba. */}
      <div className="my-auto flex flex-col items-center">
        <span aria-hidden="true" className="grid h-20 w-20 place-items-center rounded-full bg-[var(--ti-suave)] text-[var(--ti-texto-2)]">
          <ShoppingBag className="h-9 w-9" strokeWidth={1.4} />
        </span>
        <p className="ti-titulo mt-5 text-2xl text-[var(--ti-texto)]">Tu bolsa está vacía</p>
        <p className="mt-2 max-w-[19rem] text-base leading-relaxed text-[var(--ti-texto-2)]">
          {porWhatsapp ? "Agrega lo que te guste y pídelo por WhatsApp en un solo mensaje." : "Agrega lo que te guste y pídelo en un solo paso."}
        </p>
        <a href={catalogo} onClick={cerrarBolsa} className={`${BOTON} mt-6`}>
          Ver el catálogo <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={cerrarBolsa}
          className="ti-foco mt-3 h-12 rounded-full px-5 text-base font-semibold text-[var(--ti-texto)] underline-offset-4 hover:underline"
        >
          Seguir mirando
        </button>
      </div>
    </div>
  );
}
