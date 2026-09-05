"use client";

/**
 * Anotar qué pasó con un cliente fiado — port de AnotarGestion.tsx (Adelantos).
 *
 * La promesa de pago es el caso importante: la fecha la pone el propio
 * cliente, así que es el compromiso más fácil de reclamar — y el que hay
 * que hacer reaparecer el día que vence.
 */

import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { TIPOS_GESTION, type TipoGestion } from "@/lib/fiados/gestion-cobranza";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalActions, inputCls } from "./shared";

const isoDia = (d: Date) => {
  const c = new Date(d);
  c.setMinutes(c.getMinutes() - c.getTimezoneOffset());
  return c.toISOString().slice(0, 10);
};
const enDias = (n: number) => isoDia(new Date(Date.now() + n * 86_400_000));

const PLAZOS = [
  { label: "Mañana", dias: 1 },
  { label: "En 3 días", dias: 3 },
  { label: "En 1 semana", dias: 7 },
  { label: "En 15 días", dias: 15 },
] as const;

export default function AnotarGestion({
  customerId,
  nombre,
  saldo,
  onClose,
  onGuardada,
}: {
  customerId: string;
  nombre: string;
  saldo: number;
  onClose: () => void;
  onGuardada: () => void;
}) {
  const [tipo, setTipo] = useState<TipoGestion>("PROMESA");
  const [nota, setNota] = useState("");
  const [fechaPrometida, setFechaPrometida] = useState(enDias(7));
  const [montoPrometido, setMontoPrometido] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const esPromesa = tipo === "PROMESA";

  const guardar = async () => {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/fiados/gestiones", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          customerId,
          tipo,
          nota: nota.trim() || undefined,
          fechaPrometida: esPromesa && fechaPrometida ? new Date(`${fechaPrometida}T12:00:00`).toISOString() : null,
          montoPrometido: esPromesa && Number(montoPrometido) > 0 ? Number(montoPrometido) : null,
        }),
      });
      if (res.ok) {
        onGuardada();
        return;
      }
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? "No se pudo anotar la gestión.");
    } catch (e) {
      logger.error("[fiados] no se pudo anotar la gestión", { error: String(e) });
      setErr("No se pudo anotar. Revisá la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Anotar gestión · ${nombre}`}
      description={`Debe S/ ${saldo.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`}
      variant="wide"
      footer={<ModalActions onClose={onClose} onSubmit={guardar} saving={saving} label="Anotar" />}
    >
      <div className="space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_GESTION.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              aria-pressed={tipo === t.id}
              title={t.ayuda}
              className={`rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                tipo === t.id
                  ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {esPromesa && (
          <div className="space-y-2 rounded-xl bg-primary/8 p-3.5 ring-1 ring-primary/25">
            <p className="text-sm font-bold text-[var(--text-secondary)]">¿Para cuándo?</p>
            <div className="flex flex-wrap gap-1.5">
              {PLAZOS.map((p) => {
                const f = enDias(p.dias);
                return (
                  <button
                    key={p.dias}
                    type="button"
                    onClick={() => setFechaPrometida(f)}
                    className={`h-9 rounded-lg px-3 text-sm font-bold transition-colors ${
                      fechaPrometida === f
                        ? "bg-primary/15 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]"
                        : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <input
              type="date"
              value={fechaPrometida}
              min={isoDia(new Date())}
              onChange={(e) => setFechaPrometida(e.target.value)}
              aria-label="Fecha prometida"
              className={`${inputCls} tabular-nums`}
            />
            <input
              type="number"
              min={0}
              value={montoPrometido}
              onChange={(e) => setMontoPrometido(e.target.value)}
              placeholder={`¿Cuánto? (vacío = todo, S/ ${saldo.toFixed(2)})`}
              aria-label="Monto prometido"
              className={`${inputCls} tabular-nums`}
            />
          </div>
        )}

        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={3}
          placeholder="Qué dijo, con quién hablaste…"
          aria-label="Nota de la gestión"
          className={`${inputCls} h-auto py-3`}
        />

        {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
      </div>
    </AdminModal>
  );
}
