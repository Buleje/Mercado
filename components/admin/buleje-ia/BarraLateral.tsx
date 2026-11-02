"use client";

/**
 * Barra de Buleje IA: «Nueva conversación», las vistas y las conversaciones.
 * En PC va fija a la izquierda; en el celular la misma barra vive en un cajón.
 */
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { ArrowLeft, Brain, Cable, Cpu, Loader2, MessageSquare, Plus } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { button } from "@/components/ui-system/button-variants";
import type { BulejeIaConversaciones } from "@/hooks/use-buleje-ia-conversaciones";
import { fechaCorta } from "./formato";
import type { VistaIa } from "./vistas";

const VISTAS_MENU: Array<{ id: Exclude<VistaIa, "chat">; label: string; Icono: typeof Cpu }> = [
  { id: "modelos", label: "Modelos", Icono: Cpu },
  { id: "memoria", label: "Lo que recuerda", Icono: Brain },
  { id: "conectar", label: "Conectar apps", Icono: Cable },
];

export function BarraLateral({
  vista,
  conversacionId,
  conversaciones,
  onNueva,
  onAbrir,
  onVista,
}: {
  vista: VistaIa;
  conversacionId: string | null;
  conversaciones: BulejeIaConversaciones;
  onNueva: () => void;
  onAbrir: (id: string) => void;
  onVista: (v: VistaIa) => void;
}) {
  return (
    <nav aria-label="Buleje IA" className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <Kicker>Buleje IA</Kicker>
        <EnlacePanel href="/admin?tab=asistente-ia" apariencia="heredada" className={button({ variant: "ghost", className: "px-3 hover:no-underline" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Panel
        </EnlacePanel>
      </div>

      <Button variant="accent" fullWidth onClick={onNueva}>
        <Plus className="h-5 w-5" aria-hidden /> Nueva conversación
      </Button>

      <ul className="space-y-1">
        {VISTAS_MENU.map(({ id, label, Icono }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onVista(id)}
              aria-current={vista === id ? "page" : undefined}
              className={button({
                variant: "ghost",
                fullWidth: true,
                className: `justify-start rounded-xl px-3 ${vista === id ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : ""}`,
              })}
            >
              <Icono className="h-5 w-5" aria-hidden /> {label}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--rule-soft)] pt-3">
        <p className="px-1 pb-2 text-xs font-semibold text-[var(--text-tertiary)]">Conversaciones</p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversaciones.cargando && conversaciones.items.length === 0 ? (
            <p className="flex items-center gap-2 px-1 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
            </p>
          ) : conversaciones.error ? (
            <div className="space-y-2 px-1 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <p>{conversaciones.error}</p>
              <Button variant="secondary" onClick={conversaciones.recargar}>
                Reintentar
              </Button>
            </div>
          ) : conversaciones.items.length === 0 ? (
            <p className="px-1 text-sm text-[var(--text-secondary)]">Todavía no hay conversaciones.</p>
          ) : (
            <ul className="space-y-1">
              {conversaciones.items.map((c) => {
                const activa = vista === "chat" && c.id === conversacionId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onAbrir(c.id)}
                      aria-current={activa ? "page" : undefined}
                      className={button({
                        variant: "ghost",
                        fullWidth: true,
                        className: `h-auto min-h-12 flex-col items-start gap-0.5 whitespace-normal rounded-xl px-3 py-2 text-left font-normal ${
                          activa ? "bg-[var(--surface-sunken)]" : ""
                        }`,
                      })}
                    >
                      <span className="flex w-full items-center gap-2">
                        <MessageSquare className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{c.titulo || "Sin título"}</span>
                        <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{fechaCorta(c.actualizadoEl)}</span>
                      </span>
                      {c.ultimo && <span className="line-clamp-1 w-full pl-6 text-xs text-[var(--text-secondary)]">{c.ultimo}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </nav>
  );
}
