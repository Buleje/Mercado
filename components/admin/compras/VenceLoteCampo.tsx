"use client";

/**
 * VenceLoteCampo — «Vence» y «Lote» de una línea de la recepción.
 *
 * Opcional: si se deja vacío, la mercadería entra igual que antes. Con fecha,
 * lo que entra a stock nace como lote y aparece en «Por vencer», en la campana
 * y en los descuentos por vencer. Los atajos (+7 / +30 / +90 días) son para no
 * pelear con el calendario del celular en la puerta del almacén.
 */
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn, limaDateKey } from "@/lib/utils";
import { ATAJOS_VENCE_DIAS, errorDeVencimiento, venceEnDias } from "@/lib/compras/lotes-recepcion";

export type VenceLote = { expiryDate?: string; lote?: string };

interface VenceLoteCampoProps {
  /** Base para los `id` de los campos; única por línea. */
  id: string;
  /** Nombre del producto, para lo que lee el lector de pantalla. */
  producto: string;
  valor: VenceLote;
  onChange: (patch: VenceLote) => void;
  /** El ⓘ va una sola vez (primera línea), no repetido en cada fila. */
  ayuda?: boolean;
  className?: string;
}

const CAMPO =
  "h-8 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-primary";

export default function VenceLoteCampo({ id, producto, valor, onChange, ayuda, className }: VenceLoteCampoProps) {
  const hoy = limaDateKey();
  const vence = valor.expiryDate ?? "";
  const problema = vence ? errorDeVencimiento(vence, hoy) : null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <label htmlFor={`${id}-vence`} className="text-xs font-semibold text-[var(--text-secondary)]">
        Vence
      </label>
      {ayuda && (
        <InfoTip
          title="Vence y lote"
          what="La fecha de vencimiento de lo que llegó. Es opcional: si la dejas vacía, la mercadería entra igual."
          affects="Con fecha, lo que entra a stock queda como un lote: aparece en Inventario › Por vencer, en la campana y en los descuentos por vencer. Lo dañado o vencido no hace lote."
          example="Llegaron 24 yogures que vencen en un mes: toca «+30 d». Si la caja trae número de lote, anótalo; si no, usamos el número de la recepción."
        />
      )}
      <input
        id={`${id}-vence`}
        type="date"
        min={hoy}
        value={vence}
        onChange={(e) => onChange({ expiryDate: e.target.value || undefined })}
        aria-invalid={problema ? true : undefined}
        aria-describedby={problema ? `${id}-error` : undefined}
        aria-label={`Vence ${producto}`}
        className={cn(CAMPO, "w-36", problema && "border-[var(--data-error-500)]")}
      />
      {ATAJOS_VENCE_DIAS.map((dias) => {
        const fecha = venceEnDias(dias, hoy);
        const elegido = vence === fecha;
        return (
          <button
            key={dias}
            type="button"
            onClick={() => onChange({ expiryDate: fecha })}
            aria-pressed={elegido}
            aria-label={`${producto}: vence en ${dias} días`}
            className={cn(
              "h-8 rounded-lg border px-2 text-xs font-semibold transition-colors",
              elegido
                ? "border-primary bg-primary/10 text-primary"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary",
            )}
          >
            +{dias} d
          </button>
        );
      })}
      <input
        value={valor.lote ?? ""}
        onChange={(e) => onChange({ lote: e.target.value || undefined })}
        maxLength={60}
        placeholder="Lote (opcional)"
        aria-label={`Lote de ${producto}`}
        className={cn(CAMPO, "w-32")}
      />
      {problema && (
        <p id={`${id}-error`} role="alert" className="basis-full text-xs font-semibold text-[var(--data-error-500)]">
          {problema}
        </p>
      )}
    </div>
  );
}
