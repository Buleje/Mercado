"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Banknote, Building2, Loader2, RotateCcw, Smartphone, Wallet, XCircle } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { BOTON, CLASE_AREA, CLASE_CAMPO, claseChipFiltro } from "@/components/admin/rrhh/rrhh-form";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CuerpoAccion, RetiroFila } from "./use-retiros";

type Metodo = "yape" | "efectivo" | "transferencia";

const METODOS: { id: Metodo; label: string; icon: typeof Wallet }[] = [
  { id: "yape", label: "Yape", icon: Smartphone },
  { id: "efectivo", label: "Efectivo", icon: Banknote },
  { id: "transferencia", label: "Transferencia", icon: Building2 },
];

const FORM_ID = "form-resolver-retiro";

interface Props {
  retiro: RetiroFila | null;
  modo: "pagar" | "rechazar" | "deshacer";
  onClose: () => void;
  /** Lanza con el mensaje del servidor si no se pudo. */
  onConfirmar: (cuerpo: CuerpoAccion) => Promise<void>;
}

const TEXTOS = {
  rechazar: { titulo: "Rechazar retiro", boton: "Rechazar", hint: "Lo ve el repartidor; la plata vuelve a su saldo.", icono: XCircle },
  deshacer: {
    titulo: "Deshacer pago",
    boton: "Deshacer pago",
    hint: "Queda en la auditoría. Se borra el gasto, el retiro vuelve a «por pagar» y, si salió de la caja abierta, la plata vuelve.",
    icono: RotateCcw,
  },
} as const;

/** Pagar (con medio, salida de caja y n.° de operación), rechazar o deshacer un pago (con motivo). */
export function ResolverRetiroModal({ retiro, modo, onClose, onConfirmar }: Props) {
  const [metodo, setMetodo] = useState<Metodo>("yape");
  const [deCaja, setDeCaja] = useState(true);
  const [referencia, setReferencia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada retiro abre el formulario limpio.
  useEffect(() => {
    setMetodo("yape");
    setDeCaja(true);
    setReferencia("");
    setMotivo("");
    setError(null);
  }, [retiro?.id, modo]);

  if (!retiro) return null;
  const pagando = modo === "pagar";
  const conMotivo = modo === "pagar" ? null : TEXTOS[modo];

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!retiro) return;
    if (!pagando && motivo.trim().length < 3) {
      setError(modo === "deshacer" ? "Escribe por qué deshaces el pago." : "Escribe el motivo: lo verá el repartidor en su app.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onConfirmar(
        pagando
          ? { accion: "pagar", metodo, salidaDeCaja: metodo === "efectivo" && deCaja, referencia: referencia.trim() || undefined }
          : { accion: modo === "deshacer" ? "deshacer" : "rechazar", motivo: motivo.trim() },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      title={conMotivo?.titulo ?? "Pagar retiro"}
      icon={conMotivo?.icono ?? Wallet}
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={BOTON.fantasma}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} disabled={guardando} className={pagando ? BOTON.primario : BOTON.peligro}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {conMotivo?.boton ?? `Pagar ${formatCurrency(retiro.amount)}`}
          </button>
        </ModalFooter>
      }
    >
      <form id={FORM_ID} onSubmit={enviar} noValidate className={cn(MODAL_BODY, "space-y-4")}>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{retiro.partnerName}</p>
            <p className="text-xs text-[var(--text-tertiary)] tabular-nums">Yape {retiro.yapeNumber}</p>
          </div>
          <span className="text-lg font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(retiro.amount)}</span>
        </div>

        {pagando ? (
          <>
            <Field label="¿Cómo le pagaste?">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Medio de pago">
                {METODOS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={metodo === id}
                    onClick={() => setMetodo(id)}
                    className={claseChipFiltro(metodo === id)}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            {metodo === "efectivo" && (
              <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <input type="checkbox" checked={deCaja} onChange={(e) => setDeCaja(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                Sale de la caja abierta
              </label>
            )}
            <Field label="N.° de operación (opcional)" hint="Queda en el historial y en el gasto.">
              {(id) => (
                <input
                  id={id}
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  maxLength={120}
                  inputMode={metodo === "yape" ? "numeric" : "text"}
                  placeholder={metodo === "yape" ? "Ej. 12345678" : ""}
                  className={CLASE_CAMPO}
                />
              )}
            </Field>
            <p className="text-xs text-[var(--text-tertiary)]">Se anota el gasto «Pago a repartidor · {retiro.partnerName}» en Transporte.</p>
          </>
        ) : (
          <Field label="Motivo" required hint={conMotivo?.hint}>
            {(id) => (
              <textarea id={id} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} rows={3} className={CLASE_AREA} />
            )}
          </Field>
        )}
      </form>
    </AdminModal>
  );
}
