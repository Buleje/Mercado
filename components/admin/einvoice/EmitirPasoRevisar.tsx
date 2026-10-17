"use client";

/**
 * Paso 2 de «Emitir comprobante»: todo lo que va a salir, antes de confirmar
 * (F05/F07/F43). Cliente precargado del pedido y validado junto al campo; las
 * líneas y el total son los del pedido (backend): acá no se calcula ningún total.
 */
import type { Dispatch, SetStateAction } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SunatEmisor } from "@/lib/sunat/modo-oficial.types";
import { diaYFecha, TOPE_BOLETA_SIN_DNI, type DatosCliente, type PedidoElegible, type TipoComprobante } from "./emision-reglas";

const ETIQUETA = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";
const CAMPO = "h-12 w-full rounded-xl border bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]";

interface Props {
  pedido: PedidoElegible;
  datos: DatosCliente;
  setDatos: Dispatch<SetStateAction<DatosCliente>>;
  emisor: SunatEmisor | null;
  falta: { campo: "nombre" | "documento"; mensaje: string } | null;
  onCambiarPedido: () => void;
}

export function EmitirPasoRevisar({ pedido, datos, setDatos, emisor, falta, onCambiarPedido }: Props) {
  const serie = (t: TipoComprobante) => (t === "boleta" ? emisor?.serieBoleta : emisor?.serieFactura);
  const cambiar = (parcial: Partial<DatosCliente>) => setDatos((d) => ({ ...d, ...parcial }));
  const borde = (campo: "nombre" | "documento") =>
    falta?.campo === campo ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]";

  return (
    <div className="space-y-4">
      {/* El pedido de origen. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">Pedido {pedido.codigo}</span>
        <span className="text-sm text-[var(--text-secondary)]">{diaYFecha(pedido.creado)} · {pedido.estado}</span>
        <button type="button" onClick={onCambiarPedido} className="ml-auto min-h-12 rounded-xl px-3 text-sm font-semibold text-primary hover:underline">
          Cambiar pedido
        </button>
      </div>

      {/* Boleta o factura, con la serie real del negocio. */}
      <div role="radiogroup" aria-label="Tipo de comprobante" className="grid grid-cols-2 gap-2">
        {(["boleta", "factura"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={datos.tipo === t}
            onClick={() => cambiar({ tipo: t, documento: "" })}
            className={cn(
              "min-h-12 rounded-xl border px-3 text-sm font-semibold transition-colors",
              datos.tipo === t
                ? "border-primary bg-primary/10 text-[var(--text-primary)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            {t === "boleta" ? "Boleta" : "Factura"}
            {serie(t) && <span className="ml-1 font-mono text-[var(--text-secondary)]">{serie(t)}</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={ETIQUETA}>{datos.tipo === "factura" ? "Razón social" : "Cliente"}</span>
          <input
            value={datos.nombre}
            onChange={(e) => cambiar({ nombre: e.target.value })}
            aria-invalid={falta?.campo === "nombre"}
            className={cn(CAMPO, borde("nombre"))}
          />
        </label>
        <label className="block">
          <span className={ETIQUETA}>
            {datos.tipo === "factura" ? "RUC" : `DNI${pedido.total > TOPE_BOLETA_SIN_DNI ? "" : " (opcional)"}`}
          </span>
          <input
            value={datos.documento}
            onChange={(e) => cambiar({ documento: e.target.value.replace(/\D/g, "").slice(0, datos.tipo === "factura" ? 11 : 8) })}
            inputMode="numeric"
            placeholder={datos.tipo === "factura" ? "11 dígitos" : "8 dígitos"}
            aria-invalid={falta?.campo === "documento"}
            className={cn(CAMPO, "font-mono", borde("documento"))}
          />
        </label>
      </div>
      {falta && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {falta.mensaje}
        </p>
      )}

      {/* Lo que va a decir el comprobante: líneas y total del pedido. */}
      <div className="rounded-xl border border-[var(--rule-base)]">
        <ul className="max-h-48 divide-y divide-[var(--rule-soft)] overflow-y-auto">
          {pedido.lineas.map((l, i) => (
            <li key={`${l.nombre}-${i}`} className="flex items-baseline gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{l.nombre}</span>
              <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
                {formatNumber(l.cantidad)} {l.unidad} × {formatCurrency(l.precio)}
              </span>
            </li>
          ))}
        </ul>
        {pedido.descuento > 0 && (
          <div className="flex justify-between border-t border-[var(--rule-soft)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            <span>Descuento del pedido</span>
            <span className="tabular-nums">− {formatCurrency(pedido.descuento)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-[var(--rule-base)] px-3 py-2">
          <span className="flex items-center gap-1 text-sm font-bold text-[var(--text-primary)]">
            Total del comprobante
            <InfoTip
              what="Es el total cobrado del pedido. El IGV lo separa el sistema producto por producto (gravado, exonerado o inafecto) al emitir."
              affects="Emitir no cobra otra vez, no descuenta stock ni crea otra venta: sólo documenta este pedido."
              side="top"
            />
          </span>
          <span className="text-base font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(pedido.total)}</span>
        </div>
      </div>
    </div>
  );
}
