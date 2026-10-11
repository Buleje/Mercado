"use client";

/**
 * Cobrar un fiado (o todo lo que debe un cliente) en un toque: monto con
 * atajos «Todo»/«Mitad», el medio (Efectivo/Yape/Plin/Tarjeta) y si entra a
 * la caja abierta. Reemplaza al «Registrar Pago» que vivía en FiadoModals,
 * donde el medio sólo se podía escribir en la nota.
 *
 * Ventana a mano en z-60: se abre encima de la ficha del fiado (z-50).
 * El Escape lo maneja el Escape central de FiadosModule.
 */
import { useEffect, useId, useState } from "react";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { Banknote, CreditCard, DollarSign, Loader2, Smartphone } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { tenantCacheKey } from "@/lib/tenant-cache";
import { ETIQUETA_METODO, type MetodoCobro } from "@/lib/fiados/cobro-metodo";
import type { DatosCobro } from "./tipos";

const MEDIOS: { id: MetodoCobro; icon: typeof Banknote }[] = [
  { id: "efectivo", icon: Banknote },
  { id: "yape", icon: Smartphone },
  { id: "plin", icon: Smartphone },
  { id: "tarjeta", icon: CreditCard },
];

const CLAVE_PREF = "fiados-cobro-preferencia";
const INPUT =
  "w-full px-3 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30";

function leerPreferencia(): { metodo: MetodoCobro; aCaja: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(tenantCacheKey(CLAVE_PREF)) || "{}") as {
      metodo?: MetodoCobro;
      aCaja?: boolean;
    };
    return {
      metodo: v.metodo && v.metodo in ETIQUETA_METODO ? v.metodo : "efectivo",
      aCaja: v.aCaja !== false,
    };
  } catch {
    return { metodo: "efectivo", aCaja: true };
  }
}

type Props = {
  abierto: boolean;
  /** «Rosa Pérez» o «Rosa Pérez · 2 fiados». */
  titulo: string;
  saldo: number;
  pagando: boolean;
  error: string | null;
  onCerrar: () => void;
  onCobrar: (datos: DatosCobro) => void;
};

export default function PagoFiadoModal({
  abierto,
  titulo,
  saldo: saldoCrudo,
  pagando,
  error,
  onCerrar,
  onCobrar,
}: Props) {
  // El saldo por cliente es una suma de floats (10.1 + 20.2 = 30.299999…): sin redondear,
  // `max` queda debajo de «Todo» (30.30) y el navegador no deja enviar el formulario.
  const saldo = Math.round(saldoCrudo * 100) / 100;
  const formId = useId();
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const [metodo, setMetodo] = useState<MetodoCobro>("efectivo");
  const [aCaja, setACaja] = useState(true);

  // Cada vez que abre: el saldo completo y el último medio que usaste.
  useEffect(() => {
    if (!abierto) return;
    const pref = leerPreferencia();
    setMetodo(pref.metodo);
    setACaja(pref.aCaja);
    setMonto(saldo > 0 ? saldo.toFixed(2) : "");
    setNotas("");
  }, [abierto, saldo]);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(tenantCacheKey(CLAVE_PREF), JSON.stringify({ metodo, aCaja }));
    } catch {
      /* sin memoria: igual cobra */
    }
    onCobrar({ monto: parseFloat(monto), metodo, aCaja, notas });
  };

  return (
    /* Se puede abrir desde la ficha del fiado (otra ventana): va encima. */
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={`Cobrar a ${titulo}`}
      aboveModals
      claveVentana="fiados-cobrar"
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            disabled={pagando}
            className={button({ variant: "primary", className: "gap-2" })}
          >
            {pagando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <DollarSign className="h-4 w-4" />
            )}
            Cobrar {monto && !isNaN(parseFloat(monto)) ? formatCurrency(parseFloat(monto)) : ""}
          </button>
        </ModalFooter>
      }
    >
      <form id={formId} onSubmit={enviar} className={`space-y-4 ${MODAL_BODY}`}>
        <p className="text-sm text-[var(--text-secondary)]">
          Debe{" "}
          <span className="font-bold text-[var(--data-error-500)]">{formatCurrency(saldo)}</span>
        </p>

        <Field
          label="Monto que paga (S/)"
          labelClassName="mb-1 block text-xs font-bold text-[var(--text-secondary)]"
        >
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={saldo}
              value={monto}
              autoFocus
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              className={cn(INPUT, "flex-1 font-mono text-base")}
            />
            <button
              type="button"
              onClick={() => setMonto(saldo.toFixed(2))}
              className="h-11 rounded-xl bg-[var(--surface-sunken)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]"
            >
              Todo
            </button>
            <button
              type="button"
              onClick={() => setMonto((Math.round(saldo * 50) / 100).toFixed(2))}
              className="h-11 rounded-xl bg-[var(--surface-sunken)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]"
            >
              Mitad
            </button>
          </div>
        </Field>

        <fieldset>
          <legend className="mb-1 text-xs font-bold text-[var(--text-secondary)]">
            ¿Cómo paga?
          </legend>
          {/* `!`: en celular globals.css apila todo `form .grid` en 1 columna con !important;
                    una utilidad con ! (capa utilities) le gana y quedan 2×2 en vez de 4 filas. */}
          <div className="grid grid-cols-2! gap-1.5 sm:grid-cols-4!" role="radiogroup">
            {MEDIOS.map(({ id, icon: Icono }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={metodo === id}
                onClick={() => setMetodo(id)}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-bold transition-colors",
                  metodo === id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]",
                )}
              >
                <Icono className="h-4 w-4" aria-hidden />
                {ETIQUETA_METODO[id]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={aCaja}
              onChange={(e) => setACaja(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--rule-base)] text-primary focus:ring-primary"
            />
            Anotar en la caja abierta
          </label>
          <InfoTip
            title="Anotar en la caja"
            what="El cobro entra como ingreso de la caja del turno, con su medio."
            affects="Sólo el efectivo suma a lo que tienes que contar al cerrar; Yape, Plin y tarjeta quedan anotados aparte."
            example="Rosa paga S/ 20 en efectivo: la caja espera S/ 20 más en el arqueo."
          />
        </div>

        <Field
          label="Nota (opcional)"
          labelClassName="mb-1 block text-xs font-bold text-[var(--text-secondary)]"
        >
          <input
            type="text"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={400}
            placeholder="Ej: pagó su hijo"
            className={INPUT}
          />
        </Field>
      </form>
    </AdminModal>
  );
}
