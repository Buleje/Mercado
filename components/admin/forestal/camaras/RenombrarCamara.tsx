"use client";
/**
 * RenombrarCamara — el lápiz al lado del nombre de una cámara (05-10).
 *
 * «Camara 1 oficina» mostraba el patio de trozas y el sistema no tenía cómo
 * corregirlo: había que borrarla y crearla de nuevo, perdiendo su enlace con
 * Hik-Connect. Ahora sólo cambia el nombre: el id, la dirección (token), las
 * fotos y el enlace quedan iguales. Llama directo a `PATCH /api/admin/camaras`
 * (`accion: "renombrar"`) y avisa con `onListo` para que la lista se relea.
 */
import { useState } from "react";
import { Check, Loader2, Pencil, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { BTN } from "./camaras-ui";

const CAMPO =
  "h-9 min-w-0 flex-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-base)] px-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none";

export default function RenombrarCamara({
  id,
  nombre,
  onListo,
}: {
  id: string;
  nombre: string;
  /** La lista se relee (el nombre nuevo sale del servidor, no del campo). */
  onListo: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nombre);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editando)
    return (
      <button
        type="button"
        onClick={() => {
          setValor(nombre);
          setError(null);
          setEditando(true);
        }}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        aria-label={`Cambiar el nombre de ${nombre}`}
        title="Cambiar el nombre"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
    );

  const guardar = async () => {
    const limpio = valor.trim();
    if (!limpio || limpio === nombre) return setEditando(false);
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/camaras", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id, accion: "renombrar", nombre: limpio }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!r.ok || j.error) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
      setEditando(false);
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form
      className="flex w-full basis-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditando(false)}
        maxLength={80}
        autoFocus
        aria-label="Nombre de la cámara"
        placeholder="Patio de trozas"
        className={CAMPO}
      />
      <button type="submit" disabled={guardando || !valor.trim()} className={BTN}>
        {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
        Guardar
      </button>
      <button type="button" onClick={() => setEditando(false)} disabled={guardando} className={BTN} aria-label="Cancelar">
        <X className="h-4 w-4" aria-hidden />
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-[var(--data-error-ink)]">
          {error}
        </p>
      )}
    </form>
  );
}
