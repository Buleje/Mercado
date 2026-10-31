"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, Ban, Check } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CAMPO_INPUT } from "@/components/admin/shared/campos-personalizados-ui";
import { EJEMPLO_UBICACION, UBICACION_FISICA_MAX, ubicacionLimpia } from "@/lib/documentos/ubicacion-fisica";
import type { DbDocumentFolder } from "@/lib/types/documents";
import type { BulkFolderAccion } from "@/hooks/use-documents";
import { mensajeDeError } from "../archivo/compartido";
import { FOLDER_COLORS, FOLDER_ICON_OPTIONS, FolderGlyph } from "../folder-visuals";

/** Emojis para papeles y trámites (los mismos del lote del Archivo). */
const EMOJIS = [
  "📁", "📂", "🗂️", "📄", "🧾", "🧮", "📊", "⚖️",
  "🛡️", "🏛️", "🏦", "💰", "💳", "🔑", "📌", "🏠",
  "🚚", "🔧", "🧰", "🌲", "🪵", "🐟", "🌱", "👥",
  "📸", "📅", "⭐", "🔥", "✅", "⚠️",
];

const rotulo = "mb-2 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]";

/**
 * «Cambiar ícono» de una carpeta de Esenciales: emoji, ícono de la lista y
 * color, con vista previa y «Quitar» (vuelve al de carpeta). Guarda con los
 * mismos puntos del Archivo: ícono/color por el PATCH de la carpeta y el emoji
 * por `folders/bulk` (sólo dueño/admin; 403 → aviso).
 *
 * ADR-526 — con UNA carpeta, además «¿Dónde guardas estos papeles?» (el
 * archivador/separador del físico): va en el mismo PATCH y sus papeles lo
 * heredan al marcarlos registrados. «Quitar» no lo borra: es dato, no adorno.
 */
export default function IconoCarpetaModal({ folder, ids, updateFolder, bulkFolders, onClose }: {
  /** Una carpeta (modo normal). Sin ella, `ids` = modo lote. */
  folder?: DbDocumentFolder;
  /** Modo lote: las carpetas marcadas; un solo POST por cada cosa que cambies. */
  ids?: string[];
  updateFolder?: (id: string, patch: { color?: string | null; icon?: string | null; ubicacionFisica?: string | null }) => Promise<void>;
  bulkFolders: (ids: string[], accion: BulkFolderAccion) => Promise<number>;
  onClose: () => void;
}) {
  const lote = !folder && !!ids?.length;
  const emoji0 = folder?.emoji?.trim() || null;
  const [emoji, setEmoji] = useState<string | null>(emoji0);
  const [icon, setIcon] = useState<string | null>(folder?.icon ?? null);
  const [color, setColor] = useState<string | null>(folder?.color ?? null);
  const ubic0 = ubicacionLimpia(folder?.ubicacionFisica);
  const [ubic, setUbic] = useState<string>(ubic0 ?? "");
  const cambiaUbic = !lote && ubicacionLimpia(ubic) !== ubic0;
  // En lote no hay valor de partida común: sólo se aplica lo que toques.
  const [tocado, setTocado] = useState({ emoji: false, icon: false, color: false });
  const [saving, setSaving] = useState(false);

  const cambio = lote
    ? tocado.emoji || tocado.icon || tocado.color
    : emoji !== emoji0 || icon !== (folder?.icon ?? null) || color !== (folder?.color ?? null) || cambiaUbic;

  const guardar = async () => {
    if (saving || !cambio) return;
    setSaving(true);
    try {
      if (lote && ids) {
        // Elegir ícono ya limpia el emoji en el servidor: no hace falta otro POST.
        if (tocado.icon) await bulkFolders(ids, { action: "icon", icon });
        else if (tocado.emoji) await bulkFolders(ids, { action: "emoji", emoji });
        if (tocado.color) await bulkFolders(ids, { action: "color", color });
        toast.success(`Listo: ${ids.length} carpetas con su ícono nuevo.`);
      } else if (folder && updateFolder) {
        const cambiaIcono = icon !== folder.icon || color !== folder.color;
        if (cambiaIcono || cambiaUbic) {
          await updateFolder(folder.id, {
            ...(cambiaIcono ? { icon, color } : {}),
            ...(cambiaUbic ? { ubicacionFisica: ubicacionLimpia(ubic) } : {}),
          });
        }
        if (emoji !== emoji0) await bulkFolders([folder.id], { action: "emoji", emoji });
        const soloUbic = cambiaUbic && !cambiaIcono && emoji === emoji0;
        const donde = ubicacionLimpia(ubic);
        toast.success(soloUbic
          ? donde ? `Listo: los papeles de «${folder.name}» se guardan en ${donde}.` : `Listo: «${folder.name}» ya no tiene archivador anotado.`
          : `Listo: «${folder.name}» tiene su ícono nuevo.`);
      }
      onClose();
    } catch (err) {
      logger.warn("[documentos.esenciales] no se pudo cambiar el ícono", { error: String(err) });
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg.includes("403") ? "Sólo el dueño o un administrador pueden cambiar el ícono." : `No se pudo guardar: ${mensajeDeError(msg)}`);
    } finally {
      setSaving(false);
    }
  };

  const quitar = () => { setEmoji(null); setIcon(null); setColor(null); setTocado({ emoji: true, icon: true, color: true }); };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={lote ? "Cambiar ícono" : "Ícono y archivador"}
      size="md"
      claveVentana="esencial-icono"
      footer={
        <ModalFooter>
          <button type="button" onClick={quitar} className={cn(button({ variant: "ghost" }), "mr-auto")}>Quitar</button>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cancelar</button>
          <button type="button" onClick={() => void guardar()} disabled={saving || !cambio} className={button({ variant: "primary" })}>
            <Check className="h-4 w-4" /> Guardar
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-3xl" data-qa="icono-previa">
            <FolderGlyph folder={{ icon, color, emoji }} className="h-8 w-8" />
          </span>
          <span className="min-w-0 truncate text-base font-extrabold text-[var(--text-primary)]">{lote ? `${ids?.length} carpetas` : folder?.name}</span>
        </div>

        {!lote && (
          <div>
            <span className={cn(rotulo, "inline-flex items-center gap-1")}>
              <Archive className="h-4 w-4" aria-hidden />
              <label htmlFor="carpeta-ubicacion-fisica">¿Dónde guardas estos papeles?</label>
              <InfoTip
                title="El archivador del papel físico"
                what="El archivador y el separador donde guardas los originales de esta carpeta."
                affects="Al marcar un papel como registrado («Ya lo anoté») se le copia, si no tiene uno propio; y al buscar «archivador guías» aparece."
                example="Archivador Guías 2026 · separador octubre"
              />
            </span>
            <input
              id="carpeta-ubicacion-fisica"
              type="text"
              value={ubic}
              onChange={(e) => setUbic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guardar(); } }}
              maxLength={UBICACION_FISICA_MAX}
              placeholder={EJEMPLO_UBICACION}
              className={CAMPO_INPUT}
              data-qa="carpeta-ubicacion-fisica"
            />
          </div>
        )}

        <div>
          <span className={rotulo}>Emoji</span>
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { setEmoji(e); setTocado((t) => ({ ...t, emoji: true })); }}
                aria-label={`Emoji ${e}`}
                aria-pressed={emoji === e}
                className={cn("flex h-9 items-center justify-center rounded-lg border-2 text-lg transition-colors", emoji === e ? "border-primary bg-primary/10" : "border-transparent hover:bg-primary/10")}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={rotulo}>Ícono</span>
          <div className="grid grid-cols-5 gap-2">
            {FOLDER_ICON_OPTIONS.map((o) => {
              const elegido = !emoji && (icon ?? "folder") === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => { setIcon(o.key); setEmoji(null); setTocado((t) => ({ ...t, icon: true })); }}
                  title={o.label}
                  aria-label={o.label}
                  aria-pressed={elegido}
                  className={cn("flex aspect-square items-center justify-center rounded-xl border-2 transition-colors", elegido ? "border-primary bg-primary/10" : "border-[var(--rule-base)] hover:border-primary/40")}
                >
                  <o.Icon className="h-5 w-5" style={color ? { color } : undefined} />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className={rotulo}>Color</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setColor(null); setTocado((t) => ({ ...t, color: true })); }}
              title="Sin color"
              aria-label="Sin color"
              className={cn("flex h-8 w-8 items-center justify-center rounded-full border-2", color === null ? "border-primary" : "border-[var(--rule-base)]")}
            >
              <Ban className="h-4 w-4 text-[var(--text-tertiary)]" />
            </button>
            {FOLDER_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => { setColor(c.value); setTocado((t) => ({ ...t, color: true })); }}
                style={{ backgroundColor: c.value }}
                title={c.label}
                aria-label={c.label}
                className={cn("flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-[var(--surface-raised)]", color === c.value ? "ring-primary" : "ring-transparent")}
              >
                {color === c.value && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
