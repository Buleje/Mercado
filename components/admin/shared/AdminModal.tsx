"use client";

/**
 * AdminModal — wrapper sobre @radix-ui/react-dialog con estilos editoriales.
 *
 * Actualizado 2026-04-18: migración de implementación custom a Radix Dialog.
 *
 * Beneficios Radix (gratis, sin código):
 *   - Focus trap (Tab no escapa del modal)
 *   - Return focus al trigger al cerrar
 *   - ESC handling
 *   - Click fuera (overlay)
 *   - Body scroll lock
 *   - Portal (no se corta por overflow)
 *   - aria-modal, aria-labelledby, role="dialog"
 *   - Screen readers anuncian apertura/cierre
 *
 * API backward-compatible con la implementación anterior:
 *   open, onClose, title, variant, children, className, hideCloseButton
 *
 * Nuevos variants:
 *   · default — centrado, max-w-lg (diálogos normales)
 *   · fullscreen — toma toda la pantalla
 *   · side — slide-in derecho (sheet/drawer)
 *   · wide — max-w-2xl (forms largos)
 *   · centered-sm — max-w-sm (confirmaciones)
 */

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { X, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * El tema de acento del admin (que puede diferir del root del tenant) vive en un
 * wrapper inline bajo <body>. El modal se portalea a <body>, FUERA de ese wrapper,
 * así que sin esto heredaría el acento del root (a veces otro color). Copiamos los
 * tokens de acento del wrapper al contenido del modal para que matchee su panel.
 */
function useAdminAccent(open: boolean): React.CSSProperties {
  const [vars, setVars] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const wrap = Array.from(document.body.children).find((el) =>
      (el.getAttribute("style") || "").includes("--accent"),
    );
    if (!wrap) return;
    const cs = getComputedStyle(wrap);
    const next: Record<string, string> = {};
    for (const v of ["--accent", "--accent-dark", "--accent-soft", "--accent-muted"]) {
      const val = cs.getPropertyValue(v).trim();
      if (val) next[v] = val;
    }
    setVars(next as React.CSSProperties);
  }, [open]);
  return vars;
}

type Variant = "default" | "fullscreen" | "side" | "wide" | "centered-sm" | "pos" | "info";

interface AdminModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Descripción opcional debajo del título (accessibility). */
  description?: string;
  /** Icono opcional: chip en accent-soft antes del título (menos genérico). */
  icon?: LucideIcon;
  variant?: Variant;
  children: React.ReactNode;
  /** Acciones fijas al pie (fuera del área scrolleable). */
  footer?: React.ReactNode;
  className?: string;
  hideCloseButton?: boolean;
}

// Brandon 2026-05-27: en CELULAR (<640px) las variantes centradas pasan a
// "bottom-sheet" (full-width, pegado abajo, esquinas superiores redondeadas) —
// el patrón móvil estándar, más cómodo que una tarjeta flotante centrada.
// En sm+ vuelven a ser tarjetas centradas como siempre.
// Brandon 2026-07-03: los anchos van en REM EXPLÍCITOS, no en tokens `max-w-{sm,md,lg,xl}`.
// Este proyecto redefine `--container-{sm,md,lg,xl}` en @theme (globals.css) como una
// escala de contenedores de layout (md=960px, lg=1200px…), y en Tailwind v4 `max-w-md`
// = `var(--container-md)`. Usar los tokens hacía que los modales salieran 2× de ancho
// (el drawer `side` a 960px se veía "chueco"). Los rem fijos son inmunes al override y
// matchean el intent original (sm=24rem, md=28rem, lg=32rem). `wide`/`pos` usan `2xl`/`6xl`
// que NO están overrideados, así que quedan como estaban.
const VARIANT_CLASSES: Record<Variant, string> = {
  default: "w-full rounded-t-2xl max-h-[90vh] sm:w-[calc(100vw-2rem)] sm:max-w-[32rem] sm:rounded-2xl sm:max-h-[85vh]",
  "centered-sm": "w-full rounded-t-2xl max-h-[90vh] sm:w-[calc(100vw-2rem)] sm:max-w-[24rem] sm:rounded-2xl sm:max-h-[85vh]",
  wide: "w-full rounded-t-2xl max-h-[90vh] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:rounded-2xl sm:max-h-[85vh]",
  // Brandon 2026-07-18: variant `info` para fichas de datos densas (detalle,
  // cadena, kardex…). Ancho grande (64rem en rem EXPLÍCITO, inmune al override
  // de --container) + 92vh para que las secciones se lean en 2 columnas SIN
  // scrollear de más. Bottom-sheet en mobile como el resto de las centradas.
  info: "w-full rounded-t-2xl max-h-[92vh] sm:w-[calc(100vw-2rem)] sm:max-w-[64rem] sm:rounded-2xl sm:max-h-[92vh]",
  // Brandon 2026-05-16: variant `pos` para checkouts con 2-columnas desktop.
  // max-w-6xl + 92vh para que en PC quepa TODO el flujo de cobro sin scroll.
  pos: "w-full rounded-t-2xl max-h-[92vh] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:rounded-2xl",
  fullscreen: "w-screen h-screen rounded-none",
  side: "h-screen w-full max-w-[28rem] rounded-l-2xl",
};

const VARIANT_POSITION: Record<Variant, string> = {
  default: "bottom-0 left-0 right-0 sm:bottom-auto sm:right-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
  "centered-sm": "bottom-0 left-0 right-0 sm:bottom-auto sm:right-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
  wide: "bottom-0 left-0 right-0 sm:bottom-auto sm:right-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
  info: "bottom-0 left-0 right-0 sm:bottom-auto sm:right-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
  pos: "bottom-0 left-0 right-0 sm:bottom-auto sm:right-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
  fullscreen: "top-0 left-0",
  side: "top-0 right-0",
};

export default function AdminModal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  variant = "default",
  children,
  footer,
  className,
  hideCloseButton,
}: AdminModalProps) {
  const accentVars = useAdminAccent(open);
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "modal-backdrop",
            "data-[state=open]:animate-modal-overlay-in",
          )}
        />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          style={accentVars}
          className={cn(
            "fixed z-50 bg-[var(--surface-raised)] overflow-hidden flex flex-col shadow-[var(--shadow-xl)] outline-none",
            VARIANT_POSITION[variant],
            VARIANT_CLASSES[variant],
            "data-[state=open]:animate-modal-in",
            className,
          )}
        >
          {/* a11y fix 2026-05-09: Radix exige Dialog.Title presente. Cuando no
              hay title visible, lo renderizamos dentro de VisuallyHidden para
              que screen readers lo lean sin pintarlo. */}
          {!title && (
            <VisuallyHidden.Root asChild>
              <Dialog.Title>Modal</Dialog.Title>
            </VisuallyHidden.Root>
          )}

          {/* Header */}
          {(title || Icon || !hideCloseButton) && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] shrink-0 gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {Icon && (
                  // Tinte con alpha real: con `--accent-soft` (token que ya
                  // trae alpha) el chip compilaba a un claro opaco y en dark
                  // era una mancha blanca.
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] dark:bg-primary/20">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                )}
                <div className="min-w-0">
                  {title && (
                    <Dialog.Title className="font-display text-base sm:text-lg font-semibold text-[var(--text-primary)] tracking-tight truncate">
                      {title}
                    </Dialog.Title>
                  )}
                  {description && (
                    <Dialog.Description className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
                      {description}
                    </Dialog.Description>
                  )}
                </div>
              </div>
              {!hideCloseButton && (
                <Dialog.Close asChild>
                  <button
                    className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
                    aria-label="Cerrar"
                  >
                    <X className="h-5 w-5 sm:h-4 sm:w-4" strokeWidth={1.75} />
                  </button>
                </Dialog.Close>
              )}
            </div>
          )}

          {/* Content — `min-h-0` es lo que permite que este hijo se ENCOJA:
              sin él, en un flex-col el área scrolleable crece hasta el alto de
              su contenido y empuja lo que venga después fuera del modal (el
              footer de los formularios de alta quedaba invisible, con el botón
              "Registrar" incluido). */}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

          {/* Footer fijo — vive FUERA del scroll: las acciones de un formulario
              largo no deberían exigir llegar al final para aparecer. */}
          {footer && (
            <div className="shrink-0 border-t border-[var(--rule-base)] bg-[var(--surface-raised)]">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>

      <style jsx global>{`
        @keyframes modal-overlay-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes modal-in {
          from {
            opacity: 0;
            transform: ${variant === "side" ? "translateX(16px)" : "translate(-50%, -48%) scale(0.96)"};
          }
          to {
            opacity: 1;
            transform: ${variant === "side" ? "translateX(0)" : "translate(-50%, -50%) scale(1)"};
          }
        }
        [data-radix-dialog-overlay].animate-modal-overlay-in {
          animation: modal-overlay-in 180ms ease-out;
        }
        [data-radix-dialog-content].animate-modal-in {
          animation: modal-in 200ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-radix-dialog-overlay].animate-modal-overlay-in,
          [data-radix-dialog-content].animate-modal-in {
            animation: none !important;
          }
        }
      `}</style>
    </Dialog.Root>
  );
}
