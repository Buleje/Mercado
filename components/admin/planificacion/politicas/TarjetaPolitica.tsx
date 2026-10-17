"use client";

/**
 * TarjetaPolitica — una política en su tarjeta (ADR-497): título, texto
 * recortado, desde cuándo rige, si toca revisarla o le faltan datos, y
 * «Copiar para WhatsApp» a la vista. Editar y borrar van en «⋯».
 */
import { Check, Copy, MoreHorizontal, Pencil, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { PASTILLA, PASTILLA_TONO, TARJETA } from "../piezas/clases";
import { fechaCorta } from "../piezas/fechas";
import { tieneHuecos, tocaRevisar, type Politica } from "./politicas-config";

interface Props {
  politica: Politica;
  hoy: string;
  puedeEditar: boolean;
  copiada: boolean;
  onCopiar: () => void;
  onEditar: () => void;
  onBorrar: () => void;
}

export function TarjetaPolitica({ politica: p, hoy, puedeEditar, copiada, onCopiar, onEditar, onBorrar }: Props) {
  const revisar = tocaRevisar(p, hoy);
  const huecos = tieneHuecos(p.texto);
  const menu: MenuAccion[] = [
    { id: "editar", label: "Editar", icon: Pencil, onSelect: onEditar },
    { id: "borrar", label: "Borrar", icon: Trash2, tone: "danger", onSelect: onBorrar },
  ];
  const cuerpo = (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-bold leading-snug text-[var(--text-primary)]">{p.titulo || "Sin título"}</span>
        {revisar && (
          <span className={cn(PASTILLA, PASTILLA_TONO.aviso)} title={`Tocaba revisarla el ${fechaCorta(p.revisar, hoy)}`}>
            Revisar
          </span>
        )}
        {huecos && <span className={cn(PASTILLA, PASTILLA_TONO.info)}>Por completar</span>}
      </span>
      {p.texto ? (
        <span className="mt-1 line-clamp-4 block text-sm whitespace-pre-line text-[var(--text-secondary)]">{p.texto}</span>
      ) : (
        <span className="mt-1 block text-sm text-[var(--text-tertiary)]">Sin texto todavía.</span>
      )}
    </>
  );

  return (
    <li className={cn(TARJETA, "flex flex-col gap-2 p-3")}>
      <div className="flex items-start gap-1">
        {puedeEditar ? (
          <button
            type="button"
            onClick={onEditar}
            className="min-h-12 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            {cuerpo}
          </button>
        ) : (
          <div className="min-w-0 flex-1">{cuerpo}</div>
        )}
        {puedeEditar && (
          <div className="shrink-0">
            <ActionMenu label={`Opciones de ${p.titulo || "esta política"}`} icon={MoreHorizontal} actions={menu} soloIcono size="md" />
          </div>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {(p.vigenteDesde || p.revisar) && (
          <span className="mr-auto text-xs text-[var(--text-tertiary)]">
            {p.vigenteDesde && `Rige desde el ${fechaCorta(p.vigenteDesde, hoy)}`}
            {p.vigenteDesde && p.revisar && " · "}
            {p.revisar && `revisar el ${fechaCorta(p.revisar, hoy)}`}
          </span>
        )}
        <button type="button" className={cn(button({ variant: "ghost" }), "ml-auto")} onClick={onCopiar} aria-live="polite">
          {copiada ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copiada ? "Copiado" : "Copiar para WhatsApp"}
        </button>
      </div>
    </li>
  );
}
