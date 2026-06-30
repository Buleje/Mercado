"use client";

import { useEffect, useRef, useState } from "react";
import {
  MoreVertical,
  Eye,
  Pencil,
  Share2,
  History,
  Activity,
  Trash2,
  PenTool,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";

interface Props {
  doc: DbDocument;
  busy?: boolean;
  /** "sm" para la card (compacto), "md" para la fila. */
  size?: "sm" | "md";
  onPreview: (doc: DbDocument) => void;
  onEdit: (doc: DbDocument) => void;
  onShare: (doc: DbDocument) => void;
  onVersions: (doc: DbDocument) => void;
  onActivity: (doc: DbDocument) => void;
  onSign?: (doc: DbDocument) => void;
  onRemove: (doc: DbDocument) => void;
}

/**
 * Menú "kebab" (⋯) con las acciones secundarias de un documento.
 * Click-fuera + Escape cierran. Las acciones primarias (favorito, descargar)
 * quedan fuera del menú en la fila/card.
 */
export default function DocumentActionsMenu({
  doc,
  busy,
  size = "md",
  onPreview,
  onEdit,
  onShare,
  onVersions,
  onActivity,
  onSign,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const pick = (fn: (doc: DbDocument) => void) => () => {
    setOpen(false);
    fn(doc);
  };

  const iconBtn = size === "sm" ? "p-1.5" : "p-2";
  const iconSz = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  const items: { key: string; label: string; Icon: typeof Pencil; onClick: () => void; danger?: boolean }[] = [
    { key: "preview", label: "Vista previa", Icon: Eye, onClick: pick(onPreview) },
    { key: "edit", label: "Editar", Icon: Pencil, onClick: pick(onEdit) },
    { key: "share", label: "Compartir por link", Icon: Share2, onClick: pick(onShare) },
    { key: "versions", label: "Versiones", Icon: History, onClick: pick(onVersions) },
    ...(onSign && doc.mimeType === "application/pdf"
      ? [{ key: "sign", label: "Firmar", Icon: PenTool, onClick: pick(onSign) }]
      : []),
    { key: "activity", label: "Actividad", Icon: Activity, onClick: pick(onActivity) },
    { key: "remove", label: "Borrar", Icon: Trash2, onClick: pick(onRemove), danger: true },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más acciones"
        title="Más acciones"
        className={cn(
          "rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-[var(--surface-sunken)] disabled:opacity-50",
          iconBtn,
        )}
      >
        <MoreVertical className={iconSz} />
      </button>

      {open && (
        <>
          {/* backdrop click-fuera */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 w-52 overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)] py-1"
          >
            {items.map(({ key, label, Icon, onClick, danger }) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={onClick}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors",
                  danger
                    ? "text-[var(--data-error-500)] hover:bg-[var(--data-error-50)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-primary",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
