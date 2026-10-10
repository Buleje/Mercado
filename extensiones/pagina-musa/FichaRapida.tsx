"use client";

/**
 * La ficha rápida del salón: un clic en la foto o el nombre de una tarjeta
 * (`EnlaceFicha`) abre el producto en un modal —en el celular, una hoja desde
 * abajo— con su foto, precio, existencias, cantidad y «Agregar», sin salir de
 * donde estás. «Ver ficha completa» lleva a la de siempre. Los productos del
 * salón no tienen variantes (`ProductoSalon`): si un día las tienen, van acá.
 *
 * Se monta UNA vez junto a la bolsa (`PartesBolsa`): sirve en la portada, el
 * catálogo y la ficha. Estado de módulo (`estado-ficha.ts`), como la bolsa.
 *
 * Al agregar: suena (`Comprar`), el modal se cierra y la foto vuela a la bolsa
 * (`efecto-agregar.ts`). Foco atrapado, Escape y clic fuera cierran, el fondo
 * no se mueve (`useModalAccesible`) y la rueda no la toma Lenis
 * (`data-lenis-prevent`). Sin portal: así hereda los colores del salón.
 */
import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Clock, Sparkles, X } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { Comprar } from "./Comprar";
import type { ProductoSalon } from "./datos";
import { reducirMovimiento, volarABolsa } from "./efecto-agregar";
import { cerrarFicha, useFichaAbierta, useRegistrarFicha } from "./estado-ficha";
import { Existencias, Precio } from "./FichaPartes";
import { esServicio } from "./rutina";
import { BOTON, BOTON_BORDE, KICKER } from "./ui";

export function FichaRapida() {
  const p = useFichaAbierta();
  const [aviso, setAviso] = useState("");
  useRegistrarFicha();
  return (
    <>
      {p && <Modal key={p.id} p={p} avisar={setAviso} />}
      {/* Fuera del modal: el aviso se lee aunque el modal ya se cerró. */}
      <span className="sr-only" aria-live="polite">
        {aviso}
      </span>
    </>
  );
}

function Modal({ p, avisar }: { p: ProductoSalon; avisar: (texto: string) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const foto = useRef<HTMLDivElement>(null);
  const titulo = useId();
  const servicio = esServicio(p);
  useModalAccesible(caja, { onCerrar: cerrarFicha });

  // Entrada: en el celular la hoja sube; en la compu aparece y crece apenas.
  useEffect(() => {
    const el = caja.current;
    if (!el || reducirMovimiento()) return;
    const ancha = window.matchMedia("(min-width: 640px)").matches;
    el.animate(
      ancha ? [{ opacity: 0, transform: "translateY(12px) scale(0.97)" }, { opacity: 1, transform: "none" }] : [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
      { duration: ancha ? 260 : 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, []);

  const agregado = (n: number) => {
    avisar(`Agregaste ${n} × ${p.nombre} a tu bolsa.`);
    volarABolsa(foto.current, p.imagen);
    cerrarFicha();
  };

  return (
    <div className="fixed inset-0 z-system flex items-end justify-center sm:items-center sm:p-6" data-lenis-prevent>
      <div className="absolute inset-0 bg-[var(--mu-cacao)]/50 backdrop-blur-[2px]" onClick={cerrarFicha} aria-hidden="true" />
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo}
        tabIndex={-1}
        data-mu-ficha-rapida
        data-lenis-prevent
        className="relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-[var(--surface-canvas)] shadow-[var(--shadow-xl)] outline-none sm:max-w-[56rem] sm:rounded-3xl"
      >
        <span aria-hidden="true" className="mx-auto mt-2.5 block h-1.5 w-12 rounded-full bg-[var(--rule-base)] sm:hidden" />
        <button
          type="button"
          onClick={cerrarFicha}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--mu-nude-claro)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:right-4 sm:top-4"
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </button>

        <div className="grid gap-5 p-4 pt-3 sm:grid-cols-2 sm:gap-8 sm:p-8">
          <div ref={foto} className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-[var(--mu-nude-claro)] sm:aspect-square">
            {p.imagen ? (
              <Image src={p.imagen} alt={p.nombre} fill sizes="(min-width: 640px) 420px, 100vw" className="object-cover" />
            ) : (
              <Sparkles className="absolute inset-0 m-auto h-14 w-14 text-[var(--mu-nude-fuerte)]" strokeWidth={1.2} aria-hidden="true" />
            )}
            {/* El % ya va junto al precio (`Precio`): en la foto, sólo la etiqueta del dueño, como en la ficha. */}
            {p.etiqueta && (
              <span className="absolute left-3 top-3 rounded-full bg-[var(--surface-raised)]/90 px-3 py-1 text-sm font-semibold text-[var(--text-primary)] backdrop-blur">{p.etiqueta}</span>
            )}
          </div>

          <div className="flex min-w-0 flex-col sm:py-2">
            <p className={KICKER}>{servicio ? "Servicio del salón" : (p.marca ?? p.categoria)}</p>
            <h2 id={titulo} className="mu-serif mt-2 text-2xl leading-[1.1] tracking-tight text-[var(--text-primary)] sm:pr-12 sm:text-3xl">
              {p.nombre}
            </h2>
            <Precio p={p} />
            {servicio ? (
              p.duracion && (
                <p className="mt-4 inline-flex items-center gap-2 text-base text-[var(--text-secondary)]">
                  <Clock className="h-5 w-5" aria-hidden="true" /> {p.duracion}
                </p>
              )
            ) : (
              <Existencias stock={p.stock} />
            )}
            {p.descripcion && <p className="mt-4 line-clamp-2 text-base leading-relaxed text-[var(--text-secondary)] sm:line-clamp-4">{p.descripcion}</p>}
            {!servicio && (
              <Comprar
                producto={{ id: p.id, name: p.nombre, category: p.categoria, price: p.precio, image: p.imagen, unit: p.unidad, ...(p.stock !== null ? { stock: p.stock } : {}) }}
                alAgregar={agregado}
              />
            )}
            <a href={p.href} className={`${servicio ? BOTON : BOTON_BORDE} ${servicio ? "mt-7" : "mt-3"} w-full`}>
              {servicio ? "Ver cómo reservar" : "Ver ficha completa"} <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
