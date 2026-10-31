"use client";

import { useState } from "react";
import { Archive, Check, PenLine, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { CAMPO_INPUT } from "@/components/admin/shared/campos-personalizados-ui";
import { cn } from "@/lib/utils";
import { EJEMPLO_UBICACION, UBICACION_FISICA_MAX, ubicacionLimpia } from "@/lib/documentos/ubicacion-fisica";

/**
 * ADR-526 — «Guardado en: …» del papel original, con editar en el mismo lugar
 * (Enter guarda, Escape cancela; vacío la borra). El valor que se ve es el
 * último guardado aunque el padre todavía no haya refrescado su lista.
 */
export default function GuardadoEnEditable({ valor, onGuardar }: {
  valor: string | null | undefined;
  /** Guarda (`null` = borrar); si falla, lanza y se muestra el aviso. */
  onGuardar: (texto: string | null) => Promise<unknown>;
}) {
  const base = ubicacionLimpia(valor);
  // Lo recién guardado, atado al valor del padre: cuando el padre ya trae el nuevo, manda el suyo.
  const [guardado, setGuardado] = useState<{ base: string | null; texto: string | null } | null>(null);
  const actual = guardado && guardado.base === base ? guardado.texto : base;
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = () => { setBorrador(actual ?? ""); setError(null); setEditando(true); };
  const guardar = async () => {
    const texto = ubicacionLimpia(borrador);
    if (texto === actual) { setEditando(false); return; }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(texto);
      setGuardado({ base, texto });
      setEditando(false);
    } catch (err) {
      console.warn("[documentos] no pude guardar dónde está el original", err);
      setError("No se pudo guardar. Prueba otra vez.");
    } finally {
      setGuardando(false);
    }
  };

  if (editando) {
    return (
      <div className="space-y-1" data-qa="guardado-en-editor">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void guardar(); }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditando(false); }
            }}
            maxLength={UBICACION_FISICA_MAX}
            placeholder={EJEMPLO_UBICACION}
            aria-label="¿Dónde guardas el papel original?"
            autoFocus
            disabled={guardando}
            className={CAMPO_INPUT}
            data-qa="guardado-en-input"
          />
          <button type="button" onClick={() => void guardar()} disabled={guardando} title="Guardar" aria-label="Guardar dónde está el original" className={button({ variant: "primary", size: "icon" })}>
            <Check className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setEditando(false)} disabled={guardando} title="Cancelar" aria-label="Cancelar" className={button({ variant: "ghost", size: "icon" })}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <p role="alert" className="text-sm font-bold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-qa="guardado-en">
      <Archive className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      {actual ? (
        <span className="min-w-0 break-words text-[var(--text-secondary)]">
          Guardado en: <span className="font-bold text-[var(--text-primary)]" data-qa="guardado-en-texto">{actual}</span>
        </span>
      ) : (
        <span className="text-[var(--text-tertiary)]">Sin anotar dónde está el original</span>
      )}
      <button
        type="button"
        onClick={abrir}
        title={actual ? "Cambiar dónde está guardado el original" : "Anotar en qué archivador está el original"}
        className={cn(button({ variant: "ghost", size: "xs" }), "gap-1")}
        data-qa="guardado-en-editar"
      >
        <PenLine className="h-4 w-4" aria-hidden /> {actual ? "Cambiar" : "Anotar"}
      </button>
    </div>
  );
}
