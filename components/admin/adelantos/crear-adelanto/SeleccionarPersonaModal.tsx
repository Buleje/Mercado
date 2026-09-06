"use client";

/**
 * El modal completo de "a quién": buscador + lista entera + alta rápida.
 *
 * Antes esto vivía siempre desplegado dentro de la columna 1 del alta de
 * adelanto (`SelectorPersona`), compitiendo por espacio con la ficha de la
 * persona, el aviso de "ya tuvo hoy" y el historial — en un negocio con
 * decenas de beneficiarios la lista se comía media columna aunque casi
 * siempre se elige entre las mismas 3 o 4 personas (Brandon 2026-08-28:
 * "un botón para abrir un modal... y antes que aparezcan los 3 más
 * recurrentes"). Ese caso frecuente ahora vive en `SelectorPersona` como
 * accesos directos; este modal es el "buscar entre todas / crear nueva".
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Search, UserPlus, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { estadoDeCredito, requiereAtencion, saldoParaLimite } from "@/lib/adelantos/limite-credito";
import { ModalShell, fmtMonedas, inputCls, sinTildes } from "../shared";
import type { BeneficiarioConSaldo } from "./tipos";

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

export default function SeleccionarPersonaModal({
  beneficiarios,
  beneficiarioId,
  onElegir,
  onPersonaCreada,
  onClose,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  beneficiarioId: string;
  onElegir: (id: string) => void;
  onPersonaCreada?: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [creando, setCreando] = useState(false);

  const filtradas = useMemo(() => {
    const t = sinTildes(q);
    if (!t) return beneficiarios;
    return beneficiarios.filter(
      (b) =>
        sinTildes(b.nombre).includes(t) ||
        (b.documento ?? "").includes(t) ||
        (b.telefono ?? "").replace(/\D/g, "").includes(t.replace(/\D/g, "")),
    );
  }, [beneficiarios, q]);

  return (
    <ModalShell title="Elegir persona" subtitle="Buscá entre todas o creá una nueva sin salir de acá." onClose={onClose} size="md">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, documento o teléfono…"
            aria-label="Buscar persona"
            className={`${inputCls} pl-11 pr-10`}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Limpiar la búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCreando((v) => !v)}
          title="Crear una persona nueva sin salir de acá"
          aria-label="Nueva persona"
          aria-expanded={creando}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
            creando
              ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          }`}
        >
          <UserPlus className="h-5 w-5" />
        </button>
      </div>

      {creando && (
        <NuevaPersonaInline
          nombreSugerido={q}
          onCancelar={() => setCreando(false)}
          onCreada={(id) => {
            setCreando(false);
            setQ("");
            onElegir(id);
            onPersonaCreada?.();
            onClose();
          }}
        />
      )}

      {beneficiarios.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-base font-semibold text-[var(--text-tertiary)]">
          Todavía no hay personas cargadas. Creá la primera con «Nueva».
        </p>
      ) : filtradas.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-base font-semibold text-[var(--text-tertiary)]">
          Nadie coincide con «{q}». Podés crearla con «Nueva».
        </p>
      ) : (
        <ul
          role="listbox"
          aria-label="Personas"
          className="max-h-[420px] space-y-0.5 overflow-y-auto rounded-xl bg-[var(--surface-sunken)] p-1.5"
        >
          {filtradas.map((b) => (
            <li key={b.id}>
              <FilaPersona
                persona={b}
                elegida={b.id === beneficiarioId}
                onElegir={() => {
                  onElegir(b.id);
                  onClose();
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}

function FilaPersona({
  persona,
  elegida,
  onElegir,
}: {
  persona: BeneficiarioConSaldo;
  elegida: boolean;
  onElegir: () => void;
}) {
  const credito = estadoDeCredito(persona.limiteCredito, saldoParaLimite(persona.saldoPendiente));
  const debe = Object.values(persona.saldoPendiente).some((v) => v > 0);
  return (
    <button
      type="button"
      role="option"
      aria-selected={elegida}
      onClick={onElegir}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        elegida ? "bg-primary/12 ring-2 ring-primary" : "hover:bg-[var(--surface-raised)]"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
        {persona.nombre.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-[var(--text-primary)]">{persona.nombre}</span>
        {(persona.telefono || persona.documento) && (
          <span className="block truncate text-sm tabular-nums text-[var(--text-tertiary)]">
            {[persona.documento, persona.telefono].filter(Boolean).join(" • ")}
          </span>
        )}
      </span>
      {requiereAtencion(credito) && (
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning)]" aria-label="Cerca del tope de crédito" />
      )}
      <span
        className={`shrink-0 text-right text-sm font-extrabold tabular-nums ${
          debe ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"
        }`}
      >
        {debe ? `debe ${fmtMonedas(persona.saldoPendiente)}` : "al día"}
      </span>
    </button>
  );
}

/** Alta de persona sin salir del modal — mismo mínimo que el flujo inline. */
function NuevaPersonaInline({
  nombreSugerido,
  onCancelar,
  onCreada,
}: {
  nombreSugerido?: string;
  onCancelar: () => void;
  onCreada: (id: string) => void;
}) {
  const [nombre, setNombre] = useState(nombreSugerido?.trim() ?? "");
  const [telefono, setTelefono] = useState("");
  const [limite, setLimite] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const crear = async () => {
    if (!nombre.trim()) {
      setErr("Poné al menos el nombre.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/adelantos/beneficiarios", {
        method: "POST",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({
          nombre: nombre.trim(),
          telefono: telefono.trim() || undefined,
          limiteCredito: Number(limite) > 0 ? Number(limite) : undefined,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.id) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onCreada(j.id);
    } catch (e) {
      logger.error("[adelantos] no se pudo crear la persona", { error: String(e) });
      setErr(e instanceof Error ? e.message : "No se pudo crear la persona.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl bg-primary/8 p-4 ring-1 ring-primary/25">
      <p className="text-sm font-bold text-[var(--text-secondary)]">
        Nueva persona — lo mínimo para adelantarle hoy. El resto se completa después en su ficha.
      </p>
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre y apellido"
        aria-label="Nombre de la persona"
        className={inputCls}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Teléfono"
          inputMode="tel"
          aria-label="Teléfono"
          className={`${inputCls} tabular-nums`}
        />
        <input
          value={limite}
          onChange={(e) => setLimite(e.target.value)}
          placeholder="Tope de crédito (opcional)"
          type="number"
          min={0}
          aria-label="Tope de crédito"
          className={`${inputCls} tabular-nums`}
        />
      </div>
      {err && <p className="text-sm font-semibold text-[var(--data-error)]">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="h-11 flex-1 rounded-xl text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void crear()}
          disabled={saving}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {saving ? "Creando…" : "Crear y elegir"}
        </button>
      </div>
    </div>
  );
}
