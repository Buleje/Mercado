"use client";

import { useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { csrfHeaders } from "@/lib/csrf-client";
import type { RecurrenteFrecuencia } from "@/lib/db/adelantos.db";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { inputCls, Field } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

export const FREC_LABEL: Record<RecurrenteFrecuencia, string> = { semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual" };
const MONEDAS = ["PEN", "USD"] as const;

/** Un adelanto fijo nuevo: a quién, cuánto y cada cuánto se crea solo. */
export default function CrearRecurrenteModal({ beneficiarios, onClose, onCreated }: { beneficiarios: BeneficiarioConSaldo[]; onClose: () => void; onCreated: () => void }) {
  const [beneficiarioId, setBeneficiarioId] = useState(beneficiarios[0]?.id ?? "");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<"PEN" | "USD">("PEN");
  const [frecuencia, setFrecuencia] = useState<RecurrenteFrecuencia>("mensual");
  const [diaMes, setDiaMes] = useState("1");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const m = Number(monto);
    if (!beneficiarioId || !m || m <= 0) { setErr("Elige persona y un monto válido."); return; }
    setSaving(true);
    const res = await fetch("/api/adelantos/recurrentes", {
      method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
      body: JSON.stringify({ beneficiarioId, monto: m, moneda, frecuencia, diaMes: frecuencia === "mensual" ? Number(diaMes) : undefined }),
    });
    setSaving(false);
    if (res.ok) onCreated();
    else { const j = await leerJson<{ error?: string }>(res); setErr(j?.error ?? "No se pudo crear el adelanto fijo."); }
  };

  return (
    /* Se abre desde la ventana de Adelantos fijos: va encima. */
    <AdminModal
      open
      onClose={saving ? () => undefined : onClose}
      title="Nuevo adelanto fijo"
      size="sm"
      aboveModals
      claveVentana="adelantos-fijo-nuevo"
      footer={
        <ModalFooter error={err}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cancelar</button>
          <button type="button" onClick={() => void submit()} disabled={saving} className={button({ variant: "primary" })}>
            {saving ? "Creando…" : "Crear adelanto fijo"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
      <Field label="Persona">
        <select value={beneficiarioId} onChange={(e) => setBeneficiarioId(e.target.value)} className={inputCls}>
          {beneficiarios.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="col-span-2">
          <Field label="Monto"><input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="200.00" className={inputCls + " tabular-nums"} /></Field>
        </div>
        <Field label="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as "PEN" | "USD")} className={inputCls}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m === "PEN" ? "S/" : "$"}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Frecuencia">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(["semanal", "quincenal", "mensual"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFrecuencia(f)} className={button({ variant: "secondary", size: "xl", className: `rounded-2xl border-2 ${frecuencia === f ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)]"}` })}>{FREC_LABEL[f]}</button>
          ))}
        </div>
      </Field>
      {frecuencia === "mensual" && (
        <Field label="Día del mes (1-28)"><input type="number" min={1} max={28} value={diaMes} onChange={(e) => setDiaMes(e.target.value)} className={inputCls + " tabular-nums"} /></Field>
      )}
      </div>
    </AdminModal>
  );
}
