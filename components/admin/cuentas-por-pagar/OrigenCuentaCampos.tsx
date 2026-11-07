"use client";

import { Field } from "@/components/admin/shared/Field";
import { FORMAS_DE_PAGO } from "@/lib/compras/estados-oc";
import {
  ORIGENES_CUENTA, TIPOS_DOCUMENTO, type DatosDeOrigen, type OrdenSinCuenta, type TipoDocumento,
} from "@/lib/compras/referencia-documento";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fechaConDia } from "./resumen-cuentas";
import { useOrdenesSinCuenta } from "./use-origenes-proveedor";

export const ROTULO = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";
export const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

/** «#AB12CD34 · jueves 10/10 · S/ 140.00 · Crédito 15 días · Factura F001-9». */
export function rotuloDeOrden(o: OrdenSinCuenta): string {
  const condicion = FORMAS_DE_PAGO.find((f) => f.id === o.condicion)?.label;
  return [o.codigo, fechaConDia(o.fecha), formatCurrency(o.total), condicion, o.documento].filter(Boolean).join(" · ");
}

/**
 * De dónde sale la deuda (C41) y con qué papel (C42): factura o boleta con
 * serie y número, una orden de compra que todavía no tiene cuenta, el saldo
 * que ya le debías al empezar o otro motivo. Lo que se elige acá arma la
 * descripción con forma fija (`armarDescripcion`).
 */
export default function OrigenCuentaCampos({ d, setD, proveedorId, onElegirOrden }: {
  d: DatosDeOrigen;
  setD: (cambio: Partial<DatosDeOrigen>) => void;
  proveedorId: string;
  onElegirOrden: (o: OrdenSinCuenta | null) => void;
}) {
  const { ordenes, cargando, error } = useOrdenesSinCuenta(proveedorId, d.origen === "orden");
  const pedirMotivo = d.origen === "saldo-inicial" || d.origen === "otro";

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="De dónde sale la deuda" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ORIGENES_CUENTA.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={d.origen === o.id}
            onClick={() => {
              setD({ origen: o.id });
              if (o.id !== "orden") onElegirOrden(null);
            }}
            className={cn(
              "h-12 rounded-xl border px-3 text-sm font-semibold transition-colors",
              d.origen === o.id
                ? "border-primary bg-primary text-white"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {d.origen === "documento" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Tipo" labelClassName={ROTULO}>
            <select value={d.tipo} onChange={(e) => setD({ tipo: e.target.value as TipoDocumento })} className={CAMPO}>
              {TIPOS_DOCUMENTO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Serie *" labelClassName={ROTULO}>
            <input value={d.serie} onChange={(e) => setD({ serie: e.target.value.toUpperCase() })} placeholder="F001" maxLength={4} autoComplete="off" className={CAMPO} />
          </Field>
          <Field label="Número *" labelClassName={ROTULO}>
            <input value={d.numero} onChange={(e) => setD({ numero: e.target.value })} placeholder="123" inputMode="numeric" maxLength={10} autoComplete="off" className={CAMPO} />
          </Field>
          <Field label="Emitida el" labelClassName={ROTULO}>
            <input type="date" value={d.emitida} onChange={(e) => setD({ emitida: e.target.value })} className={CAMPO} />
          </Field>
        </div>
      )}

      {d.origen === "orden" && (
        <Field
          label="Orden de compra *"
          labelClassName={ROTULO}
          hint={
            !proveedorId ? "Elige primero el proveedor."
              : cargando ? "Trayendo sus órdenes…"
              : error ?? (ordenes.length === 0 ? "Este proveedor no tiene órdenes sin cuenta: las de crédito ya crearon la suya." : undefined)
          }
        >
          <select
            value={d.ordenId}
            disabled={!proveedorId || cargando || ordenes.length === 0}
            onChange={(e) => {
              const o = ordenes.find((x) => x.id === e.target.value) ?? null;
              setD({ ordenId: o?.id ?? "", ordenDocumento: o?.documento ?? undefined });
              onElegirOrden(o);
            }}
            className={cn(CAMPO, "disabled:opacity-60")}
          >
            <option value="">Elige la orden</option>
            {ordenes.map((o) => <option key={o.id} value={o.id}>{rotuloDeOrden(o)}</option>)}
          </select>
        </Field>
      )}

      <Field label={pedirMotivo ? "Motivo *" : "Nota (opcional)"} labelClassName={ROTULO}>
        <input
          value={d.nota}
          onChange={(e) => setD({ nota: e.target.value })}
          maxLength={200}
          placeholder={d.origen === "saldo-inicial" ? "Lo que le debías al empezar a usar el sistema" : pedirMotivo ? "Préstamo de mercadería, flete…" : "Lote de arroz de octubre…"}
          className={CAMPO}
        />
      </Field>
    </div>
  );
}
