"use client";

/**
 * ConfirmDialog — el reemplazo del panel para `confirm()`, `prompt()` y `alert()`.
 *
 * Los tres diálogos nativos del navegador (145 llamadas medidas el 2026-09-12)
 * rompían el panel de tres maneras: se ven como un error del sistema y no como
 * parte del producto, no respetan el tema oscuro, y bloquean el hilo entero
 * (un `alert` a mitad de un guardado congela la pantalla).
 *
 * Uso vía hook — el mismo `await` que la versión nativa:
 *   const { confirm, prompt, notice } = useConfirm();
 *   if (!(await confirm({ title: "¿Eliminar este producto?", intent: "danger", confirmLabel: "Sí, eliminar" }))) return;
 *   const motivo = await prompt({ title: "Motivo de la anulación", required: true });
 *   if (motivo === null) return;            // canceló
 *   await notice({ title: "No se pudo guardar", description: msg, intent: "danger" });
 *
 * Para un aviso que no necesita respuesta, preferí `toast` (sonner): no
 * interrumpe. `notice` es para lo que el usuario TIENE que leer antes de seguir.
 *
 * <ConfirmDialogProvider /> ya está montado en `app/admin/providers.tsx`.
 */

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { usePanelTokens } from "./use-panel-tokens";

type Intent = "danger" | "warning" | "info" | "success";

interface BaseParams {
  title: string;
  description?: string;
  intent?: Intent;
  confirmLabel?: string;
}

interface ConfirmParams extends BaseParams {
  cancelLabel?: string;
}

interface PromptParams extends ConfirmParams {
  /** Rótulo visible del campo. Si falta, el campo se nombra con el título. */
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  /** `textarea` para motivos largos; `number` abre el teclado numérico. */
  inputType?: "text" | "number" | "textarea";
  /** No deja aceptar con el campo vacío. */
  required?: boolean;
}

type NoticeParams = BaseParams;

interface ConfirmContextValue {
  confirm: (params: ConfirmParams) => Promise<boolean>;
  /** Devuelve el texto escrito, o `null` si canceló. */
  prompt: (params: PromptParams) => Promise<string | null>;
  /** Un aviso con un solo botón. Resuelve al cerrarlo. */
  notice: (params: NoticeParams) => Promise<void>;
}

type Pending =
  | { kind: "confirm"; params: ConfirmParams; resolve: (v: boolean) => void }
  | { kind: "prompt"; params: PromptParams; resolve: (v: string | null) => void }
  | { kind: "notice"; params: NoticeParams; resolve: () => void };

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * Los botones llevan el tono -600/-700 y no el -500: blanco sobre `#ef4444` da
 * 3.8:1 y sobre el coral `#ff6b5b` 2.8:1 — los dos por debajo de AA para un
 * texto de 14px.
 */
const INTENT_STYLES: Record<Intent, { icon: typeof AlertTriangle; color: string; bg: string; btn: string }> = {
  danger: {
    icon: XCircle,
    color: "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]",
    bg: "bg-[var(--data-error-50)]",
    btn: "bg-[var(--data-error-600)] hover:bg-[var(--data-error-700)]",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    bg: "bg-[var(--data-warning-50)]",
    btn: "bg-[var(--data-warning-700)] hover:opacity-90",
  },
  info: {
    icon: Info,
    color: "text-[var(--accent-ink)] dark:text-[var(--accent)]",
    bg: "bg-primary/10 dark:bg-primary/20",
    btn: "bg-primary hover:bg-primary/90",
  },
  success: {
    icon: CheckCircle2,
    color: "text-[var(--accent-ink)] dark:text-[var(--accent)]",
    bg: "bg-primary/10 dark:bg-primary/20",
    btn: "bg-primary hover:bg-primary/90",
  },
};

const FIELD =
  "w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-primary/30";

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const fieldId = useId();
  const panelTokens = usePanelTokens(open);

  const confirm = useCallback(
    (params: ConfirmParams) =>
      new Promise<boolean>((resolve) => {
        setPending({ kind: "confirm", params, resolve });
        setOpen(true);
      }),
    [],
  );

  const prompt = useCallback(
    (params: PromptParams) =>
      new Promise<string | null>((resolve) => {
        setValue(params.defaultValue ?? "");
        setPending({ kind: "prompt", params, resolve });
        setOpen(true);
      }),
    [],
  );

  const notice = useCallback(
    (params: NoticeParams) =>
      new Promise<void>((resolve) => {
        setPending({ kind: "notice", params, resolve });
        setOpen(true);
      }),
    [],
  );

  const settle = (accepted: boolean) => {
    if (!pending) return;
    if (pending.kind === "confirm") pending.resolve(accepted);
    else if (pending.kind === "prompt") pending.resolve(accepted ? value : null);
    else pending.resolve();
    setOpen(false);
  };

  const params = pending?.params;
  const isPrompt = pending?.kind === "prompt";
  const promptParams = isPrompt ? (pending.params as PromptParams) : null;
  const blocked = Boolean(promptParams?.required && !value.trim());
  const intent = params?.intent ?? (pending?.kind === "confirm" ? "danger" : "info");
  const styles = INTENT_STYLES[intent];
  const Icon = styles.icon;

  return (
    <ConfirmContext.Provider value={{ confirm, prompt, notice }}>
      {children}
      <AlertDialog.Root open={open} onOpenChange={(v) => !v && settle(false)}>
        <AlertDialog.Portal>
          {/* z-[100]: se pide desde cualquier lado —también desde un modal a
              mano (z-60) o uno `aboveModals` (z-70)— y tiene que quedar arriba.
              El `confirm()` nativo siempre lo estaba. */}
          <AlertDialog.Overlay className="modal-backdrop z-[100] data-[state=open]:animate-confirm-overlay-in" />
          <AlertDialog.Content
            style={panelTokens}
            onOpenAutoFocus={(e) => {
              if (!isPrompt) return;
              e.preventDefault();
              inputRef.current?.focus();
              inputRef.current?.select();
            }}
            className={cn(
              "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[calc(100vw-2rem)] max-w-[28rem]",
              "bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)] outline-none overflow-hidden",
              "data-[state=open]:animate-confirm-content-in",
            )}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!blocked) settle(true);
              }}
            >
              <div className="flex gap-4 px-5 pt-5 pb-4 sm:px-6">
                <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", styles.bg)}>
                  <Icon className={cn("h-5 w-5", styles.color)} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <AlertDialog.Title className="text-base font-semibold leading-snug text-[var(--text-primary)]">
                    {params?.title}
                  </AlertDialog.Title>
                  {params?.description && (
                    <AlertDialog.Description className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
                      {params.description}
                    </AlertDialog.Description>
                  )}
                  {promptParams && (
                    <div className="mt-3 space-y-1.5">
                      <label
                        htmlFor={fieldId}
                        className={cn("block text-xs font-semibold text-[var(--text-secondary)]", !promptParams.label && "sr-only")}
                      >
                        {promptParams.label ?? promptParams.title}
                      </label>
                      {promptParams.inputType === "textarea" ? (
                        <textarea
                          id={fieldId}
                          ref={inputRef}
                          rows={3}
                          value={value}
                          required={promptParams.required}
                          placeholder={promptParams.placeholder}
                          onChange={(e) => setValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !blocked) settle(true);
                          }}
                          className={cn(FIELD, "min-h-[5.5rem] py-2.5")}
                        />
                      ) : (
                        <input
                          id={fieldId}
                          ref={inputRef}
                          type={promptParams.inputType ?? "text"}
                          inputMode={promptParams.inputType === "number" ? "decimal" : undefined}
                          value={value}
                          required={promptParams.required}
                          placeholder={promptParams.placeholder}
                          onChange={(e) => setValue(e.target.value)}
                          className={cn(FIELD, "h-11")}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-5 py-3 sm:px-6">
                {pending?.kind !== "notice" && (
                  <AlertDialog.Cancel asChild>
                    <button
                      type="button"
                      className="min-h-10 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--rule-soft)] hover:text-[var(--text-primary)]"
                    >
                      {(params as ConfirmParams | undefined)?.cancelLabel ?? "Cancelar"}
                    </button>
                  </AlertDialog.Cancel>
                )}
                {/* `type=submit` y no AlertDialog.Action: Action cierra antes de
                    validar, y un prompt obligatorio vacío no debe cerrarse. */}
                <button
                  type="submit"
                  disabled={blocked}
                  className={cn(
                    "min-h-10 rounded-xl px-4 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    styles.btn,
                  )}
                >
                  {params?.confirmLabel ?? (pending?.kind === "notice" ? "Entendido" : pending?.kind === "prompt" ? "Aceptar" : "Confirmar")}
                </button>
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <style jsx global>{`
        @keyframes confirm-overlay-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes confirm-content-in {
          from {
            opacity: 0;
            transform: translate(-50%, -48%) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        [data-radix-alert-dialog-overlay].animate-confirm-overlay-in {
          animation: confirm-overlay-in 180ms ease-out;
        }
        [data-radix-alert-dialog-content].animate-confirm-content-in {
          animation: confirm-content-in 200ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-radix-alert-dialog-overlay].animate-confirm-overlay-in,
          [data-radix-alert-dialog-content].animate-confirm-content-in {
            animation: none !important;
          }
        }
      `}</style>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmDialogProvider");
  }
  return ctx;
}
