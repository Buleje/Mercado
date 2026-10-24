"use client";

import { useState } from "react";
import { FileText } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared/admin-tokens";
import { enlaceDesdeTitulo, limpiarEnlace } from "./tipos";

const CAMPO =
  "w-full h-11 px-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Devuelve el mensaje de error si no se pudo crear. */
  onCrear: (titulo: string, enlace: string) => Promise<string | null>;
}

export default function NuevaPaginaModal({ open, onClose, onCrear }: Props) {
  const [titulo, setTitulo] = useState("");
  const [enlace, setEnlace] = useState("");
  const [enlaceATocado, setEnlaceATocado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enlaceVisible = enlaceATocado ? enlace : enlaceDesdeTitulo(titulo);
  const enlaceFinal = enlaceVisible.replace(/^-+|-+$/g, "");
  const puede = titulo.trim().length > 0 && enlaceFinal.length > 0 && !enviando;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!puede) return;
    setEnviando(true);
    setError(null);
    const fallo = await onCrear(titulo.trim(), enlaceFinal);
    setEnviando(false);
    if (fallo) setError(fallo);
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Nueva página"
      icon={FileText}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ADMIN_TOKENS.btnSecondary}>
            Cancelar
          </button>
          <button type="submit" form="form-nueva-pagina" disabled={!puede} className={ADMIN_TOKENS.btnPrimary}>
            {enviando ? "Creando…" : "Crear y editar"}
          </button>
        </div>
      }
    >
      <form id="form-nueva-pagina" onSubmit={enviar} className="space-y-4">
        <div>
          <label htmlFor="pagina-titulo" className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">
            Título
          </label>
          <input
            id="pagina-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Nuestras ofertas"
            className={CAMPO}
            autoComplete="off"
          />
        </div>
        <div>
          {/* El ⓘ va AL LADO del <label>, no adentro: adentro, tocarlo enfocaba el campo. */}
          <div className="mb-1.5 flex items-center gap-1.5">
            <label htmlFor="pagina-enlace" className="text-sm font-semibold text-[var(--text-secondary)]">
              Enlace
            </label>
            <InfoTip
              title="El enlace de la página"
              what="Lo que va después de /cms/ en la dirección. Solo minúsculas, números y guiones; lo armamos con tu título y puedes cambiarlo."
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-tertiary)] shrink-0">/cms/</span>
            <input
              id="pagina-enlace"
              value={enlaceVisible}
              onChange={(e) => {
                setEnlaceATocado(true);
                setEnlace(limpiarEnlace(e.target.value));
              }}
              placeholder="nuestras-ofertas"
              className={CAMPO}
              autoComplete="off"
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)]">
            {error}
          </p>
        )}
      </form>
    </AdminModal>
  );
}
