"use client";

/**
 * EnviarLibroModal — registra el lote cubicado en el Libro CTP como PRODUCCIÓN
 * y, opcionalmente, lo envuelve en un LOTE de producción (código L-YYYY-NNN con
 * grado y certificado + QR). La materia prima (guías) se atribuye después en el
 * Libro — acá no se fuerza, para no fabricar orígenes inventados (invariantes I2/I5).
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Boxes, Check, Loader2, Send } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn, Field, I, ModalBody, ModalFooter } from "./ctp-shared";

const GRADES = ["", "Exportación", "Grado A", "Grado B", "Grado C", "Primera", "Segunda"];

export default function EnviarLibroModal({
  piezas, pieTablar, m3, especie, enviando, onConfirmar, onCerrar,
}: {
  piezas: number;
  pieTablar: number;
  m3: number;
  especie: string | null;
  enviando: boolean;
  onConfirmar: (opts: { grade: string; crearLote: boolean }) => void;
  onCerrar: () => void;
}) {
  const [grade, setGrade] = useState("");
  const [crearLote, setCrearLote] = useState(true);
  const fmt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !enviando) onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar, enviando]);

  return (
    // AdminModal: mientras se envía, el cierre queda bloqueado (igual que antes).
    <AdminModal
      open
      onClose={() => { if (!enviando) onCerrar(); }}
      title="Enviar al Libro CTP"
      icon={Send}
      footer={
        <ModalFooter nota={`${piezas} piezas · ${fmt(pieTablar)} PT · ${fmt(m3)} m³`}>
          <Btn variant="ghost" onClick={onCerrar} disabled={enviando}>Cancelar</Btn>
          <Btn variant="dark" onClick={() => onConfirmar({ grade, crearLote })} disabled={enviando}>
            {enviando ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</> : <><Send className="h-4 w-4" /> {crearLote ? "Registrar y crear lote" : "Registrar producción"}</>}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody>

        {/* Resumen de lo que se registra */}
        <div className="mb-3 rounded-xl bg-primary/10 px-4 py-3">
          <div className="text-sm font-bold text-[var(--text-primary)]">{piezas} piezas · {fmt(pieTablar)} PT</div>
          <div className="text-xs text-[var(--text-secondary)]">{fmt(m3)} m³{especie ? ` · ${especie}` : ""} · Madera aserrada (producción)</div>
        </div>

        {/* Grado */}
        <Field label="Grado de calidad">
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className={I}>
            {GRADES.map((g) => <option key={g} value={g}>{g || "— sin grado —"}</option>)}
          </select>
        </Field>

        {/* Crear lote */}
        <button type="button" onClick={() => setCrearLote((v) => !v)} aria-pressed={crearLote} className={`mt-3 flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition ${crearLote ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)]"}`}>
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${crearLote ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--rule-base)]"}`}>
            {crearLote && <Check className="h-3.5 w-3.5" />}
          </span>
          <span>
            <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]"><Boxes className="h-4 w-4 text-[var(--accent)]" /> Crear lote de producción</span>
            <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">Le da un código <b>L-{new Date().getFullYear()}-NNN</b>, hereda la cadena de custodia y habilita certificado + QR en la pestaña Lotes.</span>
          </span>
        </button>

        <p className="mt-3 flex items-start gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          La materia prima (guías consumidas) se atribuye después en el Libro. El certificado exige la cadena de custodia completa.
        </p>

      </ModalBody>
    </AdminModal>
  );
}
