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
 *   footer (con el gutter del modal ya puesto; `footerBare` lo saca)
 *
 * Nuevos variants:
 *   · default — centrado, max-w-lg (diálogos normales)
 *   · fullscreen — toma toda la pantalla
 *   · side — slide-in derecho (sheet/drawer)
 *   · wide — max-w-2xl (forms largos)
 *   · centered-sm — max-w-sm (confirmaciones)
 */

import { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { X, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useVentanaDeModal, type OpcionesVentana } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "./modal-controles-ventana";
import { usePanelTokens } from "./use-panel-tokens";

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
  /**
   * Este modal se abre DESDE OTRO modal: tiene que quedar por encima.
   *
   * Los modales escritos a mano del módulo forestal se pintan en `z-60`,
   * mientras que un `AdminModal` vive en `z-50`. Abrir uno desde adentro de
   * otro lo dejaba **detrás**: se montaba, se leía en el DOM y no se veía ni se
   * podía tocar (el catálogo de especies abierto desde «Producir sin lote» —
   * Brandon, 2026-09-11: «no funciona y se lagea el modal»).
   */
  aboveModals?: boolean;
  /**
   * El pie se pinta SIN el gutter del modal (raro: barras full-bleed, un
   * visor que ocupa el ancho entero). Por defecto el pie lo recibe del modal
   * — ver `MODAL_GUTTER`.
   */
  footerBare?: boolean;
  /**
   * El modal se comporta como una VENTANA: se arrastra del header, se estira
   * de la esquina y se puede fijar para que el clic afuera no lo cierre
   * (pedido de Brandon, 2026-09-15).
   *
   * Viene prendido en las variantes centradas y NUNCA en `fullscreen`/`side`,
   * que no son ventanas. `false` lo apaga; un objeto pasa opciones al hook
   * (`anchoMinimo`, `altoMinimo`…). Debajo de 640 px se apaga solo: ahí el
   * modal es un bottom-sheet.
   */
  ventana?: boolean | OpcionesVentana;
  /**
   * Con qué nombre recuerda su posición y su tamaño. Si no viene, se deriva
   * del `title` — pasala a mano cuando el título cambia por fila («Apartar
   * Tornillo»), o cada fila tendrá su propia ventana recordada.
   */
  claveVentana?: string;
}

/**
 * El gutter del modal — la ÚNICA medida del margen lateral.
 *
 * Header, cuerpo y pie tienen que arrancar en la misma vertical: con el
 * header en `px-5` y el cuerpo canónico del Libro en `px-5 sm:px-6`, en
 * desktop el título quedaba 4px a la izquierda de su propio contenido. Se lee
 * como un modal "chueco" aunque nadie sepa decir por qué.
 */
export const MODAL_GUTTER = "px-5 sm:px-6";

/**
 * El cuerpo de un modal: el gutter del modal más su respiro vertical.
 *
 * No se aplica solo desde acá —27 modales llevan bandas internas (filtros
 * pegajosos, sub-headers) cuyo `border-b` tiene que llegar de borde a borde, y
 * heredarlo se las cortaría—. Va en el cuerpo del llamador, pero sale de la
 * misma medida que el header y el pie.
 */
export const MODAL_BODY = `py-5 ${MODAL_GUTTER}`;

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

/**
 * Las variantes que son una tarjeta centrada: las únicas que tienen sentido
 * como ventana. `fullscreen` ya ocupa todo y `side` es un cajón pegado al
 * borde — moverlos no significa nada.
 */
/**
 * Qué variantes se comportan como ventana.
 *
 * `centered-sm` queda AFUERA: son confirmaciones de 24 rem («¿Borrar esto?»)
 * que se leen y se cierran — nadie las arrastra ni trabaja con una abierta —, y
 * los dos controles le comerían 64 px al título en el modal más angosto del
 * panel. `fullscreen` y `side` tampoco: no son ventanas, son pantallas.
 */
const VARIANTES_CON_VENTANA: Variant[] = ["default", "wide", "info", "pos"];

/**
 * La misma posición centrada, pero sumándole el desplazamiento de la ventana.
 *
 * El hook publica el corrimiento en `--ventana-x` / `--ventana-y` y NO arma el
 * `translate`: acá es el único lugar que sabe que estas variantes ya se centran
 * con `-50%`. Con la ventana quieta, `calc(-50% + 0px)` es exactamente el
 * `-translate-x-1/2` de siempre, así que no se mueve ni un pixel.
 */
/** Lo que el navegador tabula, en el orden en que lo hace. */
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const POSICION_VENTANA =
  "bottom-0 left-0 right-0 sm:bottom-auto sm:right-auto sm:top-1/2 sm:left-1/2 sm:translate-x-[calc(-50%_+_var(--ventana-x,0px))] sm:translate-y-[calc(-50%_+_var(--ventana-y,0px))]";

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
  aboveModals = false,
  footerBare = false,
  ventana: configVentana,
  claveVentana,
}: AdminModalProps) {
  /* Portal a <body>: sin esto el modal hereda los tokens de la tienda. */
  const panelTokens = usePanelTokens(open);
  /* Para `onEscapeKeyDown`: Radix invoca ese callback con el KeyboardEvent
     NATIVO tal como llegó a su propio listener en `document` — su
     `currentTarget` ahí es `document`, no el content. Un ref propio es la
     única forma confiable de preguntarle a ESTE diálogo si tiene un menú
     marcado como abierto. */
  const contentRef = useRef<HTMLDivElement>(null);
  const opcionesVentana: OpcionesVentana = typeof configVentana === "object" ? configVentana : {};
  const ventana = useVentanaDeModal(open, {
    ...opcionesVentana,
    /* Nunca en `fullscreen`/`side`; en las centradas, salvo que la apaguen. */
    habilitado:
      VARIANTES_CON_VENTANA.includes(variant) && configVentana !== false && (opcionesVentana.habilitado ?? true),
    claveMemoria: claveVentana ?? opcionesVentana.claveMemoria ?? (title ? `titulo:${title}` : undefined),
    /* Con el ref el hook puede MEDIR: es lo que evita que el modal termine
       arrastrado fuera de la pantalla, donde ya no se puede ni cerrar. */
    ref: contentRef,
  });
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "modal-backdrop",
            "data-[state=open]:animate-modal-overlay-in",
            /* Un peldaño por encima del modal que lo abrió (z-60), para que el
               fondo se oscurezca sobre ÉL y no debajo. */
            aboveModals && "z-[69]",
            /* Fijado = «lo dejo abierto y sigo trabajando atrás»: el velo no
               puede seguir tapando ni comiéndose los clics (regla al pie). */
            ventana.fijado && "ventana-fijada",
          )}
        />
        <Dialog.Content
          ref={contentRef}
          aria-describedby={description ? undefined : undefined}
          style={{ ...panelTokens, ...ventana.estilo }}
          className={cn(
            "fixed z-50 bg-[var(--surface-raised)] overflow-hidden flex flex-col shadow-[var(--shadow-xl)] outline-none",
            ventana.activa ? POSICION_VENTANA : VARIANT_POSITION[variant],
            VARIANT_CLASSES[variant],
            "data-[state=open]:animate-modal-in",
            aboveModals && "z-[70]",
            className,
          )}
          /* Un `ActionMenu` (u otro menú de fila) abierto DENTRO de este
             diálogo se marca a sí mismo con `data-menu-abierto` mientras dura
             (ver `action-menu.tsx`). Escape con ese menú abierto tiene que
             cerrar SÓLO esa capa de arriba — el menú ya se cierra solo con su
             propio listener; acá sólo se evita que Radix ADEMÁS cierre el
             diálogo entero (medido: Escape se llevaba las dos capas). */
          onEscapeKeyDown={(e) => {
            if (contentRef.current?.hasAttribute("data-menu-abierto")) e.preventDefault();
          }}
          /* Con el modal fijado el clic afuera no cierra. Escape y la X sí:
             fijar no puede dejar a nadie encerrado. */
          onInteractOutside={ventana.onInteractOutside}
          /* El asa es enfocable (para mover la ventana con las flechas) y vive
             primera en el DOM, así que Radix le daría el foco al abrir. Se
             saltean el asa y los botones de ventana: el foco arranca EXACTO
             donde arrancaba antes de que la ventana existiera (la X, o el
             primer control del cuerpo si el modal no la tiene). Al asa se llega
             con Shift+Tab. */
          onOpenAutoFocus={(e) => {
            if (!ventana.activa) return;
            const caja = contentRef.current;
            if (!caja) return;
            const asa = caja.firstElementChild;
            const primero = [...caja.querySelectorAll<HTMLElement>(ENFOCABLES)].find(
              (el) => el !== asa && !el.hasAttribute("data-ventana-control"),
            );
            if (!primero) return;
            e.preventDefault();
            primero.focus();
          }}
          data-ventana={ventana.activa ? "true" : undefined}
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
            <div
              {...ventana.asaProps}
              className={cn("flex items-center justify-between py-4 border-b border-[var(--rule-base)] shrink-0 gap-3", MODAL_GUTTER)}
            >
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
                    <Dialog.Title
                      /* Los controles de ventana le quitan ~64 px al título, y
                         con `truncate` eso se come el final de los títulos
                         largos. El tooltip nativo devuelve lo cortado sin
                         sacar ninguna función del header. */
                      title={title}
                      className="font-display text-base sm:text-lg font-semibold text-[var(--text-primary)] tracking-tight truncate"
                    >
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
              {/* Los controles de ventana van ANTES de la X: la salida no se
                  mueve de lugar entre un modal y otro. Sin ventana activa este
                  grupo es sólo la X, igual que siempre. */}
              {(ventana.activa || !hideCloseButton) && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <ControlesDeVentana ventana={ventana} />
                  {!hideCloseButton && (
                    <Dialog.Close asChild>
                      <button
                        className="h-10 w-10 sm:h-8 sm:w-8 rounded-xl flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
                        aria-label="Cerrar"
                      >
                        <X className="h-5 w-5 sm:h-4 sm:w-4" strokeWidth={1.75} />
                      </button>
                    </Dialog.Close>
                  )}
                </div>
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
            <div
              className={cn(
                "shrink-0 border-t border-[var(--rule-base)] bg-[var(--surface-raised)]",
                /* El gutter lo pone el modal, no cada pie. Pasarlo a cada
                   llamador dejaba pies al ras del borde —el botón «Listo» del
                   resumen por especie salía cortado contra el filo (Brandon,
                   2026-09-12: «se ven feos, apegados»)—. */
                !footerBare && `py-3.5 ${MODAL_GUTTER}`,
              )}
            >
              {footer}
            </div>
          )}

          <TiradorDeVentana ventana={ventana} />
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
        /* Fijado: el velo deja de tapar y de comerse los clics. Va con dos
           clases para ganarle en especificidad a \`.modal-backdrop\` de
           globals.css, que trae el oscurecido y el blur. */
        .modal-backdrop.ventana-fijada {
          background: transparent;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          /* \`!important\` porque Radix pinta el overlay con
             \`style="pointer-events:auto"\` INLINE (para cazar el clic de afuera
             mientras el body está apagado). Sin esto, el velo sigue comiéndose
             los clics aunque ya no se vea: medido, el elemento bajo el cursor
             seguía siendo \`.modal-backdrop\`. */
          pointer-events: none !important;
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
