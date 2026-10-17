"use client";

/**
 * MenuCuenta — el botón de cuenta de la cabecera de TODAS las tiendas de
 * negocios (la general `StorefrontNavbar` y las páginas propias) y lo que abre:
 * una lista corta que cae desde el botón en la compu y una hoja que sube desde
 * abajo en el celular (< 640 px).
 *
 * Botón como en Natura/Falabella: dos líneas «¡Hola! / Entrar» sin sesión y
 * «Hola, Ana / Mi cuenta» con sesión (`variante="pastilla"`); las páginas
 * propias lo dibujan con su propio ícono (`variante="icono"` + `claseBoton`).
 *
 * Rápido: abre sin pedir nada (todo viene del contexto de la tienda o del
 * navegador). Teclado: Escape cierra y devuelve el foco al botón; la hoja
 * atrapa el Tab; clic afuera cierra.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, User } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useSettingsSafe } from "@/contexts/settings-context";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { PanelCuenta } from "./PanelCuenta";
import { primerNombre } from "./cuenta-rutas";
import { useDatosCuentaConProveedor, useDatosCuentaSinProveedor, type DatosCuenta } from "./use-datos-cuenta";
import { useAnotarWhatsappDeLaPagina } from "./whatsapp-de-la-pagina";

export interface MenuCuentaProps {
  /** `pastilla`: avatar + dos líneas (tienda general). `icono`: sólo el ícono (páginas propias). */
  variante?: "pastilla" | "icono";
  /** Clases del botón en la variante `icono` (cada página propia trae su forma y su foco). */
  claseBoton?: string;
  /** WhatsApp del negocio si la página lo conoce mejor que la configuración. */
  whatsapp?: string | null;
  /** Clases del contenedor (p. ej. `hidden md:block` donde la barra del celular no tiene sitio). */
  className?: string;
}

export function MenuCuenta(props: MenuCuentaProps) {
  const settings = useSettingsSafe();
  // El número que trae la página propia también lo usa «Mi cuenta › Ayuda».
  useAnotarWhatsappDeLaPagina(props.whatsapp);
  // Los proveedores de la tienda están o no para toda la página: la rama no cambia.
  return settings ? <ConProveedor {...props} settings={settings} /> : <SinProveedor {...props} />;
}

function ConProveedor({ settings, ...props }: MenuCuentaProps & { settings: NonNullable<ReturnType<typeof useSettingsSafe>> }) {
  return <MenuVista {...props} datos={useDatosCuentaConProveedor(settings, props.whatsapp)} />;
}

function SinProveedor(props: MenuCuentaProps) {
  return <MenuVista {...props} datos={useDatosCuentaSinProveedor(props.whatsapp)} />;
}

const CONSULTA_CELULAR = "(max-width: 639px)";

function MenuVista({ datos, variante = "pastilla", claseBoton, className }: MenuCuentaProps & { datos: DatosCuenta }) {
  const [abierto, setAbierto] = useState(false);
  const [esCelular, setEsCelular] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const hoja = useRef<HTMLDivElement>(null);
  const idPanel = useId();

  const cerrar = useCallback((devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }, []);

  const alternar = () => {
    if (!abierto) setEsCelular(window.matchMedia(CONSULTA_CELULAR).matches);
    setAbierto((a) => !a);
  };

  // Lista de la compu: clic afuera, Escape y foco al primer enlace al abrir.
  useEffect(() => {
    if (!abierto || esCelular) return;
    lista.current?.querySelector<HTMLElement>("a[href], button")?.focus();
    const alPresionar = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) cerrar(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("mousedown", alPresionar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alPresionar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto, esCelular, cerrar]);

  // Hoja del celular: foco adentro, Tab atrapado, Escape, fondo quieto y el foco vuelve al botón.
  useModalAccesible(hoja, { onCerrar: () => setAbierto(false), activo: abierto && esCelular });

  const nombre = primerNombre(datos.nombre);
  const etiqueta = datos.conSesion && nombre ? `Mi cuenta, ${nombre}` : "Entrar a mi cuenta";
  const panel = <PanelCuenta datos={datos} onCerrar={() => cerrar(false)} />;

  return (
    <div ref={raiz} className={cn("relative shrink-0", className)}>
      <button
        ref={boton}
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        aria-haspopup="dialog"
        aria-label={etiqueta}
        className={
          variante === "icono"
            ? cn("relative", claseBoton)
            : "group inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-1.5 text-[var(--text-primary)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:pr-3"
        }
      >
        {variante === "icono" ? (
          <>
            <User className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
            {datos.conSesion && (
              <span aria-hidden="true" className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface-canvas)]" />
            )}
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-semibold",
                datos.conSesion
                  ? "bg-[var(--accent-soft)] text-[var(--text-primary)] ring-1 ring-[var(--accent)]"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
              )}
            >
              {datos.conSesion && nombre ? nombre.charAt(0).toUpperCase() : <User className="h-5 w-5" strokeWidth={1.9} />}
            </span>
            <span aria-hidden="true" className="hidden flex-col items-start leading-tight sm:flex">
              <span className="max-w-28 truncate text-sm text-[var(--text-secondary)]">
                {datos.conSesion && nombre ? `Hola, ${nombre}` : "¡Hola!"}
              </span>
              <span className="text-sm font-semibold">{datos.conSesion ? "Mi cuenta" : "Entrar"}</span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "hidden h-4 w-4 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-fast)] sm:block",
                abierto && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      {abierto && !esCelular && (
        <div
          ref={lista}
          id={idPanel}
          role="dialog"
          aria-label="Tu cuenta"
          className="absolute right-0 top-full z-[var(--z-dropdown)] mt-2 w-80 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 text-left shadow-[var(--shadow-lg)] motion-safe:animate-[fadeDown_var(--dur-fast)_var(--ease-editorial)]"
        >
          {panel}
        </div>
      )}

      {abierto &&
        esCelular &&
        createPortal(
          <div className="fixed inset-0 z-[var(--z-system)]">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Cerrar"
              onClick={() => cerrar()}
              className="absolute inset-0 h-full w-full bg-black/45 motion-safe:animate-[fadeIn_var(--dur-fast)_ease-out]"
            />
            <div
              ref={hoja}
              id={idPanel}
              role="dialog"
              aria-modal="true"
              aria-label="Tu cuenta"
              className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 text-left shadow-[var(--shadow-xl)] motion-safe:animate-[slideUp_var(--dur-base)_var(--ease-editorial)]"
            >
              <div aria-hidden="true" className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-[var(--rule-base)]" />
              {panel}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
