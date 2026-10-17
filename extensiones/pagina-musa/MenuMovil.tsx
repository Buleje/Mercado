"use client";

/**
 * El menú del celular de Musa (contrato §e): un `popover` nativo que entra
 * desde la izquierda (Escape y tocar afuera lo cierran sin JS; se cierra solo
 * al elegir un enlace, porque un ancla de la misma página no recarga).
 *
 * Tres pisos, como una página del catálogo:
 * 1. La tienda: lista editorial en Cormorant con filetes y flecha; «Regalos de
 *    Navidad» resaltado en achiote con el destello ✦ (la campaña del momento).
 * 2. Tu cuenta: dos filas chicas en Poppins con ícono.
 * 3. Al fondo, la tarjeta de asesoría en gris muy claro: «¿Dudas?» (la única de
 *    esta vista, ≥28 px), la frase de Drucila, el botón de WhatsApp (selva,
 *    7,43:1) y el horario. Llena el vacío que dejaba la lista corta.
 */
import { useEffect, useRef } from "react";
import { ChevronRight, Menu, MessageCircle, Package, User, X } from "@buleje/design-system/icons";
import { Sello } from "./Sello";
import { BOTON_WHATSAPP, Script } from "./ui";

export type EnlaceMenu = { texto: string; href: string; resaltado?: boolean };

const ICONO_CUENTA = { cuenta: User, pedidos: Package } as const;

export function MenuMovil({
  nombre,
  tienda,
  cuenta,
  asesoria,
}: {
  nombre: string;
  tienda: EnlaceMenu[];
  cuenta: (EnlaceMenu & { icono: keyof typeof ICONO_CUENTA })[];
  asesoria: { href: string; horario: string };
}) {
  const panel = useRef<HTMLDivElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const alTocar = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest("a")) el.hidePopover();
    };
    // Un `role="dialog"` recibe el foco al abrirse: va a «Cerrar» (el primero del panel).
    // Escape y cerrar lo devuelven solos al botón del menú (popover nativo).
    const alAbrir = (e: Event) => {
      if ((e as ToggleEvent).newState === "open") cerrar.current?.focus();
    };
    el.addEventListener("click", alTocar);
    el.addEventListener("toggle", alAbrir);
    return () => {
      el.removeEventListener("click", alTocar);
      el.removeEventListener("toggle", alAbrir);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        popoverTarget="mu-menu-movil"
        aria-label="Abrir el menú"
        className="mu-foco inline-flex h-12 w-12 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--mu-nude-claro)] md:hidden"
      >
        <Menu className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id="mu-menu-movil"
        popover="auto"
        role="dialog"
        aria-label="Menú de la tienda"
        className="mu-menu-movil inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-[min(22rem,88vw)] overflow-y-auto border-0 border-r border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-0 text-[var(--text-primary)]"
      >
        <div className="flex min-h-full flex-col">
          <div className="sticky top-0 z-[1] flex h-14 shrink-0 items-center justify-between border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] pl-5 pr-3">
            <span className="flex items-center gap-2.5">
              <Sello id="menu-movil" simple className="h-9 w-9" />
              <span className="mu-serif text-[1.5rem] leading-none">{nombre}</span>
            </span>
            <button
              ref={cerrar}
              type="button"
              popoverTarget="mu-menu-movil"
              popoverTargetAction="hide"
              aria-label="Cerrar el menú"
              className="mu-foco inline-flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--mu-nude-claro)]"
            >
              <X className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Tienda" className="px-5 pt-5">
            <p className="mu-kicker text-[var(--mu-acento-tinta)]">Tienda</p>
            <ul className="mt-1">
              {tienda.map((e) => (
                <li key={e.href + e.texto} className="border-b border-[var(--rule-soft)] last:border-b-0">
                  <a
                    href={e.href}
                    className={`mu-foco group flex min-h-[3.25rem] items-center gap-2 rounded-[var(--mu-radio-control)] text-[1.125rem] font-medium leading-tight ${
                      e.resaltado ? "text-[var(--mu-achiote-tinta)]" : "text-[var(--text-primary)]"
                    }`}
                  >
                    <span className="flex-1">{e.texto}</span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Tu cuenta" className="mt-2 border-t border-[var(--rule-soft)] px-5 py-4">
            <p className="mu-kicker text-[var(--text-tertiary)]">Tu cuenta</p>
            <ul className="mt-1">
              {cuenta.map((e) => {
                const Icono = ICONO_CUENTA[e.icono];
                return (
                  <li key={e.href}>
                    <a
                      href={e.href}
                      className="mu-foco flex min-h-12 items-center gap-3 rounded-[var(--mu-radio-control)] text-[length:var(--mu-t-cuerpo)] font-medium text-[var(--text-secondary)] transition-colors duration-[var(--mu-dur-corto)] hover:text-[var(--text-primary)]"
                    >
                      <Icono className="h-5 w-5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                      {e.texto}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <aside aria-label="Asesoría gratis" className="mx-4 mb-4 mt-auto rounded-[var(--mu-radio-tarjeta)] bg-[var(--surface-sunken)] p-5">
            <Script>¿Dudas?</Script>
            <p className="mt-2 text-[length:var(--mu-t-chico)] leading-relaxed text-[var(--text-secondary)]">
              Drucila te ayuda a elegir lo tuyo, gratis y sin compromiso.
            </p>
            <a href={asesoria.href} target="_blank" rel="noopener noreferrer" className={`${BOTON_WHATSAPP} mt-4 w-full`}>
              <MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              Escribir a Drucila
            </a>
            <p className="mt-3 text-center text-[length:var(--mu-t-chico)] text-[var(--text-tertiary)]">{asesoria.horario}</p>
          </aside>
        </div>
      </div>
    </>
  );
}
