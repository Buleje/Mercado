"use client";

/**
 * AltaFlujoN8n — agregar un flujo de n8n que el asistente pueda disparar.
 *
 * La descripción no es decorativa: es lo único que lee el modelo para elegir
 * cuál disparar cuando alguien dice «mándale esto al contador». Por eso se
 * exige y el placeholder muestra cómo se escribe. Dos filas: nombre y para
 * qué sirve; la URL y el botón, juntos.
 */

import { useState } from "react";
import { Loader2, Plus } from "@buleje/design-system/icons";
import { principal48 } from "./piezas-canal";

const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export interface NuevoFlujo {
  nombre: string;
  descripcion: string;
  url: string;
}

export default function AltaFlujoN8n({ onAgregar }: { onAgregar: (f: NuevoFlujo) => Promise<boolean> }) {
  const [form, setForm] = useState<NuevoFlujo>({ nombre: "", descripcion: "", url: "" });
  const [guardando, setGuardando] = useState(false);
  const completo = Boolean(form.nombre.trim() && form.descripcion.trim() && form.url.trim());

  const agregar = async () => {
    if (!completo) return;
    setGuardando(true);
    const ok = await onAgregar(form);
    setGuardando(false);
    if (ok) setForm({ nombre: "", descripcion: "", url: "" });
  };

  return (
    <form
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
      onSubmit={(e) => {
        e.preventDefault();
        void agregar();
      }}
    >
      <input
        value={form.nombre}
        onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
        placeholder="Nombre: Avisar al contador"
        aria-label="Nombre del flujo"
        className={CAMPO}
      />
      <input
        value={form.descripcion}
        onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
        placeholder="Para qué sirve: manda un correo al contador con el gasto del día"
        aria-label="Para qué sirve el flujo"
        className={CAMPO}
      />
      <div className="flex gap-2 sm:col-span-2">
        <input
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          placeholder="https://tu-n8n.com/webhook/…"
          aria-label="URL del webhook de n8n"
          className={`${CAMPO} min-w-0 flex-1 font-mono`}
        />
        <button type="submit" disabled={guardando || !completo} className={principal48}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="max-sm:sr-only">Agregar</span>
        </button>
      </div>
    </form>
  );
}
