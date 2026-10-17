"use client";

/**
 * Paso 2 de «Emitir comprobante»: todo lo que va a salir, antes de confirmar
 * (F05/F07/F43). Cliente precargado del pedido y validado junto al campo; las
 * líneas y el total son los del pedido (backend): acá no se calcula ningún total.
 */
import { useId, useMemo, type Dispatch, type SetStateAction } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SunatEmisor } from "@/lib/sunat/modo-oficial.types";
import { clientesFrecuentes, nombreAnteriorDistinto } from "./clientes-frecuentes";
import { diaYFecha, TOPE_BOLETA_SIN_DNI, type DatosCliente, type PedidoElegible, type TipoComprobante } from "./emision-reglas";
import type { EDocument } from "./tipos";

const ETIQUETA = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";
const CAMPO = "h-12 w-full rounded-xl border bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]";
const MENSAJE_CAMPO = "mt-1 block text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

interface Props {
  pedido: PedidoElegible;
  datos: DatosCliente;
  setDatos: Dispatch<SetStateAction<DatosCliente>>;
  emisor: SunatEmisor | null;
  falta: { campo: "nombre" | "documento"; mensaje: string } | null;
  onCambiarPedido: () => void;
  /** Comprobantes vivos (sin filtro): de ahí salen los clientes frecuentes (F40). */
  docs: readonly EDocument[];
}

export function EmitirPasoRevisar({ pedido, datos, setDatos, emisor, falta, onCambiarPedido, docs }: Props) {
  const id = useId();
  const frecuentes = useMemo(() => clientesFrecuentes(docs, datos), [docs, datos]);
  const otroNombre = useMemo(() => nombreAnteriorDistinto(docs, datos), [docs, datos]);
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

      {/* F40: el mensaje va debajo de SU campo; las sugerencias sólo se ponen con un clic. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={ETIQUETA}>{datos.tipo === "factura" ? "Razón social" : "Cliente"}</span>
          <input
            value={datos.nombre}
            onChange={(e) => cambiar({ nombre: e.target.value })}
            aria-invalid={falta?.campo === "nombre"}
            aria-describedby={falta?.campo === "nombre" ? `${id}-nombre` : undefined}
            className={cn(CAMPO, borde("nombre"))}
          />
          {falta?.campo === "nombre" && (
            <span id={`${id}-nombre`} aria-live="polite" className={MENSAJE_CAMPO}>
              {falta.mensaje}
            </span>
          )}
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
            aria-describedby={falta?.campo === "documento" || otroNombre ? `${id}-documento` : undefined}
            className={cn(CAMPO, "font-mono", borde("documento"))}
          />
          {falta?.campo === "documento" ? (
            <span id={`${id}-documento`} aria-live="polite" className={MENSAJE_CAMPO}>
              {falta.mensaje}
            </span>
          ) : (
            otroNombre && (
              <span id={`${id}-documento`} aria-live="polite" className="mt-1 block text-sm font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
                Este número salió antes a nombre de «{otroNombre}». Revisa el nombre antes de emitir.
              </span>
            )
          )}
        </label>
      </div>
      {frecuentes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Clientes a los que ya emitiste">
          <span className="text-sm text-[var(--text-secondary)]">Ya le emitiste a:</span>
          {frecuentes.map((c) => (
            <button
              key={c.documento}
              type="button"
              onClick={() => cambiar({ nombre: c.nombre, documento: c.documento })}
              title={`${c.veces} ${c.veces === 1 ? "vez" : "veces"} · se pone en los campos para que lo revises`}
              data-qa="cliente-frecuente"
              className="inline-flex min-h-12 max-w-full items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-left text-sm hover:bg-[var(--surface-sunken)]"
            >
              <span className="truncate font-semibold text-[var(--text-primary)]">{c.nombre}</span>
              <span className="shrink-0 font-mono text-[var(--text-secondary)]">{c.documento}</span>
            </button>
          ))}
        </div>
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
