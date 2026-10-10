"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import {
  Plus,
  Package,
  ShoppingCart,
  UserPlus,
  CreditCard,
  X,
  EyeOff,
  ChevronUp,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tapPress, EASE, DURATION } from "@/components/ui-system";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { BTN } from "@/lib/copy";

/**
 * QuickActionsFab — boton flotante global para acciones admin frecuentes.
 *
 * Bottom-right fijo, siempre accesible. Al tap abre menu radial con 4 atajos:
 * nuevo producto, registrar venta, nuevo cliente, dar fiado.
 *
 * Research: Hick's law — 4 opciones max (5 con close). Thumb-reach bottom
 * para mobile. Cierra con ESC o click outside.
 *
 * Solo aparece en /admin/*, no en /admin/login, kiosk, pos-mobile.
 */

interface QuickAction {
  Icon: typeof Package;
  label: string;
  href?: string;
  onClick?: () => void;
  /** Atajo de teclado. Ej: "P" para producto */
  shortcut?: string;
}

// Brandon 2026-05-28: hrefs usaban `?module=` (legacy) cuando el admin lee
// `?tab=` (resolveInitialTab en useAdminTabs.ts). Resultado: las acciones del
// FAB no abrían el módulo correspondiente, el panel se quedaba en el tab
// activo. Ahora apuntan a los ids canónicos de tabs.types.ts.
const ACTIONS: QuickAction[] = [
  {
    Icon: ShoppingCart,
    label: BTN.createOrder, // Registrar venta — top 1 del bodeguero
    href: "/admin?tab=ventas-caja",
    shortcut: "V",
  },
  {
    Icon: Package,
    label: BTN.createProduct, // Nuevo producto
    href: "/admin?tab=productos",
    shortcut: "P",
  },
  {
    Icon: CreditCard,
    label: BTN.createCredit, // Cobrar / dar fiado
    href: "/admin?tab=fiados",
    shortcut: "F",
  },
  {
    Icon: UserPlus,
    label: BTN.createCustomer, // Nuevo cliente
    href: "/admin?tab=clientes",
    shortcut: "C",
  },
];

const HIDE_KEY = "admin-quickfab-hidden";

// Tabs con composer de chat pegado al borde inferior: el FAB fijo abajo-derecha
// TAPA el botón de enviar (bug real medido con Playwright 2026-07-16).
const CHAT_TABS = new Set(["whatsapp-inbox", "marketplace-chat", "support-inbox"]);

export function QuickActionsFab() {
  const searchParams = useSearchParams();
  const activeTab = searchParams?.get("tab") ?? "";
  const [open, setOpen] = useState(false);
  // Preferencia persistida: el botón flotante puede ocultarse y queda como un
  // pequeño asa minimizada en la esquina, para que no tape el contenido.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(localStorage.getItem(HIDE_KEY) === "1"); } catch { /* ignore */ }
  }, []);
  const setHiddenPersist = useCallback((v: boolean) => {
    setHidden(v);
    try { localStorage.setItem(HIDE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
    if (v) setOpen(false);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // Al llegar al final de una página que sí scrollea, el botón se retira hacia
  // abajo: el panel ya no le reserva 96 px de aire en blanco al pie (Brandon
  // 2026-09-29, «un espacio en blanco debajo del croquis») y, aun así, lo
  // último de la vista —el «Agregar» del censo— no queda tapado. Al subir un
  // poco, vuelve. Con el menú abierto o el foco en el botón no se mueve.
  const [enfocado, setEnfocado] = useState(false);
  const [alFondo, setAlFondo] = useState(false);
  useEffect(() => {
    const medir = () => {
      const el = document.documentElement;
      const scrollea = el.scrollHeight > window.innerHeight + 16;
      setAlFondo(scrollea && el.scrollHeight - (window.scrollY + window.innerHeight) < 8);
    };
    medir();
    window.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    // La vista crece o encoge sin scroll (carga de datos, otra pestaña): re-medir.
    const ro = new ResizeObserver(medir);
    ro.observe(document.body);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, []);
  /* Con un modal abierto el «+» también se retira (Brandon 2026-10-03): está
     en la misma capa z-50 que los modales y tapaba la esquina del Anexo 04 y
     del Cuadre. Se mira el DOM porque los modales del panel son de varias
     familias (Radix, a mano); una vez por cuadro, no en cada mutación. */
  const [hayModal, setHayModal] = useState(false);
  useEffect(() => {
    let cuadro = 0;
    const mirar = () => {
      if (cuadro) return;
      cuadro = requestAnimationFrame(() => {
        cuadro = 0;
        /* Sólo los VISIBLES: el menú de navegación del celular vive montado
           como diálogo con `display:none`, y contarlo escondía el «+» siempre
           (medido 03-10). Sin caja dibujada = no hay modal a la vista. */
        /* La barra de selección del libro (`ctp-barra-seleccion`, fija abajo, z-40)
           también: el «+» le tapaba el borde derecho en sus 6 pantallas (07-10). */
        const modales = document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"], [role="alertdialog"], [data-barra-seleccion]',
        );
        setHayModal([...modales].some((d) => d.getClientRects().length > 0));
      });
    };
    mirar();
    const mo = new MutationObserver(mirar);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "role"] });
    return () => {
      mo.disconnect();
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, []);
  const retirado = (alFondo || hayModal) && !open && !enfocado;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      // Atajos rapidos con FAB abierto
      const match = ACTIONS.find((a) => a.shortcut?.toLowerCase() === e.key.toLowerCase());
      if (match?.href) {
        close();
        irAEnlace(match.href);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Atajo global ⌘+K abre el FAB
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // En tabs de chat el FAB tapa el botón de enviar del composer → no renderizar.
  // (Después de todos los hooks — rules of hooks.)
  if (CHAT_TABS.has(activeTab)) return null;

  return (
    <>
      {/* Overlay cerrar */}
      <AnimatePresence>
        {open && (
          <m.div
            className="modal-backdrop" style={{ zIndex: 40 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast }}
            onClick={close}
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* Menu radial */}
      <AnimatePresence>
        {open && (
          <m.div
            className="fixed right-6 bottom-24 z-50 flex flex-col items-end gap-2 sm:bottom-28"
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.04, staggerDirection: -1 },
              },
            }}
          >
            {ACTIONS.map((a) => {
              const AIcon = a.Icon;
              return (
                <m.div
                  key={a.label}
                  variants={{
                    hidden: { opacity: 0, y: 8, scale: 0.95 },
                    show: { opacity: 1, y: 0, scale: 1 },
                  }}
                  transition={{ duration: DURATION.fast, ease: EASE.entrance }}
                >
                  <EnlacePanel apariencia="heredada"
                    href={a.href}
                    onClick={close}
                    className="group flex items-center gap-3 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-xl pl-4 pr-5 py-2.5 hover:border-[var(--rule-strong)] transition-colors hover:no-underline"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-primary)]">
                      <AIcon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <span className="text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap">
                      {a.label}
                    </span>
                    {a.shortcut && (
                      <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-[var(--surface-sunken)] border border-[var(--rule-base)] px-1.5 text-[length:var(--ts-2xs)] font-mono tabular-nums text-[var(--text-tertiary)]">
                        {a.shortcut}
                      </kbd>
                    )}
                  </EnlacePanel>
                </m.div>
              );
            })}
            {/* Ocultar el botón flotante */}
            <button
              type="button"
              onClick={() => setHiddenPersist(true)}
              className="group flex items-center gap-3 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-xl pl-4 pr-5 py-2.5 hover:border-[var(--rule-strong)] transition-colors"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-tertiary)]">
                <EyeOff className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span className="text-sm font-semibold text-[var(--text-secondary)] whitespace-nowrap">Ocultar este botón</span>
            </button>
            {/* Hint teclado global */}
            <div className="mt-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/55 bg-black/40 backdrop-blur rounded-full px-3 py-1">
              ESC para cerrar · ⌘K para abrir
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {hidden ? (
        /* Minimizado: asa discreta en la esquina. Click = restaurar el botón. */
        <button
          type="button"
          onClick={() => setHiddenPersist(false)}
          className={cn(
            "fixed right-0 bottom-24 z-50 flex items-center gap-1 rounded-l-full py-1.5 pl-2.5 pr-2 shadow-lg transition-all",
            "bg-[var(--text-primary)] text-[var(--surface-canvas)] opacity-60 hover:opacity-100 hover:pr-3",
          )}
          aria-label="Mostrar el botón de acciones rápidas"
          title="Acciones rápidas (oculto) — click para mostrar"
        >
          <ChevronUp className="h-3.5 w-3.5 rotate-[-90deg]" strokeWidth={2.5} aria-hidden />
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </button>
      ) : (
        /* FAB button */
        <m.button
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          type="button"
          onClick={() => setOpen((v) => !v)}
          whileTap={tapPress}
          className={cn(
            "fixed right-6 bottom-6 z-50 h-14 w-14 rounded-full shadow-xl transition-all",
            "flex items-center justify-center",
            "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
            "hover:scale-105 active:scale-95",
            open && "rotate-45",
            retirado && "pointer-events-none translate-y-24 opacity-0",
          )}
          tabIndex={retirado ? -1 : undefined}
          aria-hidden={retirado || undefined}
          inert={retirado || undefined}
          style={{ transformOrigin: "center" }}
          aria-label={open ? "Cerrar acciones rápidas" : "Abrir acciones rápidas"}
          aria-expanded={open}
        >
          {open ? (
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          ) : (
            <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
          )}
        </m.button>
      )}
    </>
  );
}
