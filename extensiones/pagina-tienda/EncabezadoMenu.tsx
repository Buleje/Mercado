"use client";

/**
 * El menú del celular de la tienda (como el de Musa, `pagina-musa/MenuMovil.tsx`):
 * un `popover` nativo que entra desde la izquierda (Escape y tocar afuera lo
 * cierran sin JS; se cierra solo al elegir un enlace).
 *
 * Tres pisos: la tienda (todo + las categorías del negocio), tu cuenta y, al
 * fondo y SÓLO si el negocio tiene WhatsApp, la tarjeta «¿Dudas?» con el botón
 * para escribirle y su horario (si lo tiene).
 */
import { useEffect, useRef } from "react";
import { ChevronRight, Menu, MessageCircle, Package, User, X } from "@buleje/design-system/icons";
import { Sello } from "./Sello";
import { BOTON, EXTERNO, ICONO } from "./ui";

export type EnlaceMenu = { texto: string; href: string };

const ID_MENU = "ti-menu-movil";

export function EncabezadoMenu({
  nombre,
  logo,
  tienda,
  cuenta,
  whatsapp,
  horario,
}: {
  nombre: string;
  logo: string | null;
  tienda: EnlaceMenu[];
  cuenta: { mi: string; pedidos: string };
  /** Enlace ya armado a `wa.me`; `null` = el negocio no tiene WhatsApp (no hay tarjeta). */
  whatsapp: string | null;
  horario: string | null;
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

  const fila =
    "ti-foco flex min-h-12 items-center gap-3 rounded-[var(--ti-radio-control)] text-[length:var(--ti-t-cuerpo)] font-medium text-[var(--ti-texto-2)] transition-colors duration-[var(--ti-dur-corto)] hover:text-[var(--ti-texto)]";

  return (
    <>
      <button type="button" popoverTarget={ID_MENU} aria-label="Abrir el menú" className={`${ICONO} inline-flex md:hidden`}>
        <Menu className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={ID_MENU}
        popover="auto"
        role="dialog"
        aria-label="Menú de la tienda"
        className="ti-menu-movil inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-[min(22rem,88vw)] overflow-y-auto border-0 border-r border-[var(--ti-linea-suave)] bg-[var(--ti-fondo)] p-0 text-[var(--ti-texto)]"
      >
        <div className="flex min-h-full flex-col">
          <div className="sticky top-0 z-[1] flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--ti-linea-suave)] bg-[var(--ti-fondo)] pl-5 pr-3">
            <span className="flex items-center gap-2.5 overflow-hidden">
              <Sello nombre={nombre} logo={logo} className="h-9 w-9" />
              <span className="ti-nombre truncate text-xl leading-none">{nombre}</span>
            </span>
            <button
              ref={cerrar}
              type="button"
              popoverTarget={ID_MENU}
              popoverTargetAction="hide"
              aria-label="Cerrar el menú"
              className={`${ICONO} inline-flex shrink-0`}
            >
              <X className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Tienda" className="px-5 pt-5">
            <p className="ti-kicker text-[var(--ti-texto-3)]">Tienda</p>
            <ul className="mt-1">
              {tienda.map((e) => (
                <li key={e.href + e.texto} className="border-b border-[var(--ti-linea-suave)] last:border-b-0">
                  <a
                    href={e.href}
                    className="ti-foco group flex min-h-[3.25rem] items-center gap-2 rounded-[var(--ti-radio-control)] text-lg font-medium leading-tight text-[var(--ti-texto)]"
                  >
                    <span className="flex-1">{e.texto}</span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-[var(--ti-texto-3)] transition-transform duration-[var(--ti-dur-corto)] ease-[var(--ti-ease)] group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Tu cuenta" className="mt-2 border-t border-[var(--ti-linea-suave)] px-5 py-4">
            <p className="ti-kicker text-[var(--ti-texto-3)]">Tu cuenta</p>
            <ul className="mt-1">
              <li>
                <a href={cuenta.mi} className={fila}>
                  <User className="h-5 w-5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  Mi cuenta
                </a>
              </li>
              <li>
                <a href={cuenta.pedidos} className={fila}>
                  <Package className="h-5 w-5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  Mis pedidos
                </a>
              </li>
            </ul>
          </nav>

          {whatsapp && (
            <aside aria-label="Escríbenos" className="mx-4 mb-4 mt-auto rounded-[var(--ti-radio-tarjeta)] bg-[var(--ti-suave)] p-5">
              <p className="ti-titulo text-2xl text-[var(--ti-texto)]">¿Dudas?</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ti-texto-2)]">Escríbenos y te ayudamos a elegir.</p>
              <a href={whatsapp} {...EXTERNO} className={`${BOTON} mt-4 w-full`}>
                <MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                Escribir por WhatsApp
              </a>
              {horario && <p className="mt-3 text-center text-sm text-[var(--ti-texto-3)]">{horario}</p>}
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
