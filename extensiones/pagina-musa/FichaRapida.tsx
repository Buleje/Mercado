"use client";

/**
 * La ficha rápida de Musa: un clic en la ilustración o el nombre de una
 * tarjeta (`EnlaceFicha`) abre el producto en un modal —en el celular, una
 * hoja desde abajo— con su envase en el arco, precio (y el ahorro real si es
 * kit), preventa o encargo y «Agregar», que se vuelve el contador `[− n +]`
 * sincronizado con la bolsa (`BotonAgregar` grande): así ves cuántos llevas
 * sin cerrar el modal. «Ver bolsa» lo cierra y abre la bolsa; «Ver ficha
 * completa» lleva a la de siempre.
 *
 * Se monta UNA vez junto a la bolsa (`PartesBolsa`): sirve en la portada, el
 * catálogo y la ficha. Estado de módulo (`estado-ficha.ts`), como la bolsa.
 * Foco atrapado, Escape y clic fuera cierran, el fondo no se mueve
 * (`useModalAccesible`) y la rueda no la toma Lenis (`data-lenis-prevent`).
 * Sin portal: así hereda los colores del salón.
 */
import { useEffect, useId, useRef } from "react";
import { ArrowRight, Clock, X } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { BotonAgregar } from "./BotonAgregar";
import type { ProductoSalon } from "./datos";
import { reducirMovimiento } from "./efecto-agregar";
import { abrirBolsa } from "./estado-bolsa";
import { cerrarFicha, useFichaAbierta, useRegistrarFicha } from "./estado-ficha";
import { EstadoPedido, Existencias, Precio } from "./FichaPartes";
import { imagenDe, resumenDe } from "./imagenes";
import { esServicio } from "./rutina";
import { Escenario, Ilustracion, Insignia } from "./TarjetaProducto";
import { BOTON, BOTON_BORDE, KICKER } from "./ui";

export function FichaRapida() {
  const p = useFichaAbierta();
  useRegistrarFicha();
  return p ? <Modal key={p.id} p={p} /> : null;
}

function Modal({ p }: { p: ProductoSalon }) {
  const caja = useRef<HTMLDivElement>(null);
  const titulo = useId();
  const servicio = esServicio(p);
  const { src, ilustracion } = imagenDe(p);
  useModalAccesible(caja, { onCerrar: cerrarFicha });

  // Entrada: en el celular la hoja sube; en la compu aparece y crece apenas.
  useEffect(() => {
    const el = caja.current;
    if (!el || reducirMovimiento()) return;
    const ancha = window.matchMedia("(min-width: 640px)").matches;
    el.animate(
      ancha ? [{ opacity: 0, transform: "translateY(12px) scale(0.97)" }, { opacity: 1, transform: "none" }] : [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
      { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, []);

  const verBolsa = () => {
    cerrarFicha();
    abrirBolsa();
  };
  const linea = p.kit ? p.kit.componentes.map((c) => (c.cantidad > 1 ? `${c.cantidad} × ${c.nombre}` : c.nombre)).join(" + ") : resumenDe(p.descripcion);

  return (
    <div className="fixed inset-0 z-system flex items-end justify-center sm:items-center sm:p-6" data-lenis-prevent>
      <div className="absolute inset-0 bg-[var(--mu-velo)]/40 backdrop-blur-[2px]" onClick={cerrarFicha} aria-hidden="true" />
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo}
        tabIndex={-1}
        data-mu-ficha-rapida
        data-mu-producto
        data-lenis-prevent
        className="mu-sombra-flotante relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[1.5rem] bg-[var(--surface-canvas)] outline-none sm:max-w-[56rem] sm:rounded-[var(--mu-radio-tarjeta)]"
      >
        <span aria-hidden="true" className="mx-auto mt-2.5 block h-1.5 w-12 rounded-full bg-[var(--rule-base)] sm:hidden" />
        <button
          type="button"
          onClick={cerrarFicha}
          aria-label="Cerrar"
          className="mu-foco mu-sombra-tarjeta absolute right-3 top-3 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors duration-200 hover:bg-[var(--mu-nude-claro)] sm:right-4 sm:top-4"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="grid gap-5 p-4 pt-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] sm:gap-8 sm:p-8">
          <div>
            <div data-mu-foto className="relative">
              <Escenario categoria={p.categoria} className="mu-arco mx-auto aspect-[5/4] w-full max-w-[22rem] sm:aspect-[4/5] sm:max-w-none">
                <Ilustracion p={p} tamanos="(min-width: 640px) 24rem, 80vw" alt={ilustracion ? `${p.nombre} (ilustración referencial)` : p.nombre} sello="h-[44%] w-[44%]" />
              </Escenario>
            </div>
            {ilustracion && src && <p className="mt-2 text-center text-sm text-[var(--text-tertiary)]">Ilustración referencial</p>}
          </div>

          <div className="flex min-w-0 flex-col sm:py-2">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:pr-12">
              <span className={KICKER}>{servicio ? "Servicio del salón" : p.kit ? (p.kit.componentes.length === 1 ? "Dúo" : "Kit") : p.categoria}</span>
              {p.codigo && <span className="text-sm font-semibold tabular-nums text-[var(--text-tertiary)]">{p.codigo}</span>}
            </p>
            <h2 id={titulo} className="mu-serif mt-2 text-[1.625rem] leading-[1.1] text-[var(--text-primary)] sm:pr-12 sm:text-[2rem]">
              {p.nombre}
            </h2>
            {p.etiqueta && (
              <p className="mt-3">
                <Insignia texto={p.etiqueta} />
              </p>
            )}
            <Precio p={p} />
            {servicio ? (
              p.duracion && (
                <p className="mt-4 inline-flex items-center gap-2 text-base text-[var(--text-secondary)]">
                  <Clock className="h-5 w-5" aria-hidden="true" /> {p.duracion}
                </p>
              )
            ) : (
              <>
                <EstadoPedido etiqueta={p.etiqueta} />
                <Existencias stock={p.stock} />
              </>
            )}
            {linea && <p className="mt-4 line-clamp-3 text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]">{linea}</p>}
            {!servicio && (
              <div className="mt-6">
                <BotonAgregar
                  variante="grande"
                  alVerBolsa={verBolsa}
                  producto={{ id: p.id, name: p.nombre, category: p.categoria, price: p.precio, image: src ?? "", unit: p.unidad, ...(p.stock !== null ? { stock: p.stock } : {}) }}
                />
              </div>
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
