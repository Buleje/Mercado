"use client";

/**
 * Las piezas del cajón de la bolsa (`Cajon.tsx`) y del contador de la ficha:
 *
 * · `Contador` — el `[− N +]` de la línea (40 px) y de la ficha (48 px). El número
 *   es un `<output>` con `tabular-nums` (el botón no salta de ancho) y sube con
 *   `mu-contador-sube` cuando crece. Los botones no se apagan con `disabled` (con
 *   el foco encima, caería al `<body>`): llevan `aria-disabled`.
 * · `Miniatura` — la ilustración del producto en un arco, sobre el tinte de su
 *   categoría; sin imagen, el sello de Musa. La ilustración es cuadrada, con aire
 *   arriba y a los lados: se acerca ×1,32 desde abajo (88 %) para que el envase se
 *   lea a 64 px. Medido en las 27: ningún envase se corta (el más alto empieza al
 *   26 % y los kits ocupan del 18 al 82 % del ancho).
 * · `LineaBolsa` — una línea: ilustración, nombre, contador y lo que suma (el código
 *   del producto no se lee: va en el mensaje del pedido).
 *   Con 1 unidad el «−» es un tacho y la fila se va deslizando (200 ms).
 * · `BolsaVacia` — el sello, «aún vacía», «Ver kits» y las necesidades.
 * («Drucila te sugiere», el kit que completa lo que llevas, es `SugerenciaKit.tsx`.)
 */
import { useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Minus, Plus, Trash2 } from "@buleje/design-system/icons";
import { useCart, type CartItem } from "@/contexts/cart-context";
import { MEJORAR } from "./anuncios";
import { hrefDestino, rutas } from "./destinos";
import { imagenDe, tinteDe } from "./imagenes";
import { reducirMovimiento } from "./efecto-agregar";
import { cerrarBolsa } from "./estado-bolsa";
import { solesPedido as soles } from "./pedido-whatsapp";
import type { InfoProducto } from "./PedirPorWhatsapp";
import { Sello } from "./Sello";

/** El tope por producto del carrito de la tienda (`MAX_QTY` de `cart-context`). */
export const TOPE_CARRITO = 20;

const PASO =
  "mu-foco relative inline-flex shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] after:absolute after:-inset-0.5 hover:bg-[var(--mu-nude-claro)] active:scale-[.94] aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";

export function Contador({
  valor,
  max,
  etiqueta,
  menosEtiqueta,
  masEtiqueta,
  menos,
  mas,
  tacho = false,
  grande = false,
}: {
  valor: number;
  max: number;
  etiqueta: string;
  menosEtiqueta: string;
  masEtiqueta: string;
  menos: () => void;
  mas: () => void;
  /** Con 1 unidad, el «−» saca el producto (tacho) en vez de quedar apagado. */
  tacho?: boolean;
  grande?: boolean;
}) {
  const [antes, setAntes] = useState(valor);
  const [subio, setSubio] = useState(false);
  if (valor !== antes) {
    setSubio(valor > antes);
    setAntes(valor);
  }
  const conTacho = tacho && valor <= 1;
  const sinMenos = !tacho && valor <= 1;
  const sinMas = valor >= max;
  const boton = grande ? "h-12 w-12" : "h-12 w-12";
  const icono = grande ? "h-5 w-5" : "h-4 w-4";
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className={`inline-flex ${grande ? "h-12" : "h-12"} shrink-0 items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)]`}
    >
      <button
        type="button"
        aria-label={menosEtiqueta}
        aria-disabled={sinMenos || undefined}
        onClick={() => !sinMenos && menos()}
        className={`${PASO} ${boton}`}
      >
        {conTacho ? (
          <Trash2 className={icono} aria-hidden="true" />
        ) : (
          <Minus className={icono} aria-hidden="true" />
        )}
      </button>
      <output
        aria-live="polite"
        className={`${grande ? "w-9 text-lg" : "w-7 text-base"} overflow-hidden text-center font-semibold tabular-nums text-[var(--text-primary)]`}
      >
        <span
          key={valor}
          className={`inline-block ${subio ? "animate-[mu-contador-sube_var(--mu-dur-corto)_var(--mu-ease-rebote)]" : ""}`}
        >
          {valor}
        </span>
      </output>
      <button
        type="button"
        aria-label={masEtiqueta}
        aria-disabled={sinMas || undefined}
        onClick={() => !sinMas && mas()}
        className={`${PASO} ${boton}`}
      >
        <Plus className={icono} aria-hidden="true" />
      </button>
    </div>
  );
}

export function Miniatura({
  imagen: guardada,
  codigo = null,
  categoria,
  id,
  className = "",
  fondo,
}: {
  imagen: string;
  /** Sin imagen guardada (una bolsa de antes de las ilustraciones), su envase por código. */
  codigo?: string | null;
  categoria: string;
  id: string;
  className?: string;
  fondo?: string;
}) {
  const imagen = imagenDe({ imagen: guardada, codigo }).src;
  return (
    <div
      className={`mu-arco relative shrink-0 overflow-hidden ${fondo ?? tinteDe(categoria)} ${className}`}
    >
      {imagen ? (
        <Image
          src={imagen}
          alt=""
          fill
          sizes="80px"
          unoptimized={/\.svg($|\?)/.test(imagen)}
          className="origin-[50%_88%] scale-[1.32] object-cover"
        />
      ) : (
        <Sello id={id} className="absolute inset-[18%] h-[64%] w-[64%] opacity-90" />
      )}
    </div>
  );
}

export function LineaBolsa({
  item,
  info,
  alQuitar,
}: {
  item: CartItem;
  info: InfoProducto | undefined;
  alQuitar: (i: CartItem) => void;
}) {
  const { updateQty } = useCart();
  const fila = useRef<HTMLLIElement>(null);
  const tope = Math.min(TOPE_CARRITO, typeof item.stock === "number" ? item.stock : TOPE_CARRITO);

  const sacar = () => {
    const el = fila.current;
    if (!el || reducirMovimiento()) return alQuitar(item);
    const fin = () => alQuitar(item);
    el.animate(
      [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: "translateX(24px)" },
      ],
      {
        duration: 200,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      },
    ).finished.then(fin, fin);
  };

  return (
    <li ref={fila} className="flex gap-3 py-3.5">
      <Miniatura
        imagen={item.image}
        codigo={info?.codigo}
        categoria={item.category}
        id={`bolsa-${item.id}`}
        className="h-[4.75rem] w-16"
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)]">
              {item.name}
            </p>
            {/* El código (MU001…) ya no se lee acá: lo lleva el mensaje del pedido. */}
            {info?.encargo && (
              <span className="mt-1 inline-block rounded-full bg-[var(--mu-encargo-fondo)] px-2 text-sm font-medium text-[var(--mu-encargo)]">
                Por encargo
              </span>
            )}
          </div>
          <span className="mu-precio shrink-0 text-xl text-[var(--text-primary)]">
            {soles(item.price * item.quantity)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm tabular-nums text-[var(--text-tertiary)]">
            {item.quantity > 1 ? `${soles(item.price)} c/u` : ""}
          </span>
          <Contador
            valor={item.quantity}
            max={tope}
            tacho
            etiqueta={`Cantidad de ${item.name} en tu bolsa`}
            menosEtiqueta={
              item.quantity <= 1 ? `Sacar ${item.name} de tu bolsa` : `Quitar uno de ${item.name}`
            }
            masEtiqueta={`Agregar uno más de ${item.name}`}
            menos={() => (item.quantity <= 1 ? sacar() : updateQty(item.id, item.quantity - 1))}
            mas={() => updateQty(item.id, item.quantity + 1)}
          />
        </div>
      </div>
    </li>
  );
}

const BOTON_CACAO =
  "mu-foco inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--mu-boton-fondo)] px-6 text-base font-semibold text-[var(--mu-boton-texto)] transition duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] hover:-translate-y-0.5 hover:bg-[var(--mu-boton-fondo-hover)] active:scale-[.97]";

export function BolsaVacia() {
  // Sólo se dibuja en el navegador (el cajón abre con un clic): el negocio sale de la ruta.
  const slug =
    typeof window === "undefined"
      ? undefined
      : window.location.pathname.match(/^\/t\/([^/]+)/)?.[1];
  const negocio = slug ? decodeURIComponent(slug) : null;
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-8 text-center" data-lenis-prevent>
      {/* Centrado en el alto que sobra; si no entra, `my-auto` da 0 y corre desde arriba. */}
      <div className="my-auto flex flex-col items-center">
        <Sello id="bolsa-vacia" className="h-24 w-24" />
        <p className="mu-script mt-2 text-[2.75rem] leading-none text-[var(--mu-rosa-tinta)]">
          aún vacía
        </p>
        <p className="mt-3 max-w-[19rem] text-base leading-relaxed text-[var(--text-secondary)]">
          Agrega lo que te guste y pídelo por WhatsApp en un solo mensaje. Drucila te ayuda a
          elegir.
        </p>
        {negocio && (
          <>
            <a
              href={rutas(negocio).categoria("Kits y ofertas")}
              onClick={cerrarBolsa}
              className={`${BOTON_CACAO} mt-6`}
            >
              Ver kits de regalo <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <p className="mu-kicker mt-9 text-[var(--mu-acento-tinta)]">¿Qué quieres mejorar?</p>
            <ul className="mt-3 flex flex-wrap justify-center gap-2">
              {MEJORAR.slice(0, 8).map((m) => (
                <li key={m.titulo}>
                  <a
                    href={hrefDestino(m.destino, negocio, null).href}
                    onClick={cerrarBolsa}
                    className="mu-foco inline-flex h-12 items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] hover:border-[var(--mu-rosa-tinta)] hover:bg-[var(--mu-rosa-claro)]"
                  >
                    {m.titulo}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
        <button
          type="button"
          onClick={cerrarBolsa}
          className="mu-foco mt-7 h-12 rounded-full px-5 text-base font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
        >
          Seguir mirando
        </button>
      </div>
    </div>
  );
}
