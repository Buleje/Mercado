"use client";

import { AlertCircle, Plus } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { diaYFecha } from "@/lib/compras/devoluciones-proveedor";
import { cn } from "@/lib/utils";
import type { LineaOrigen, OrigenDevolucion, Revision } from "./origen-devolucion";
import { soles } from "./tipos";

const CAMPO = "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40";
const ROTULO = "text-sm font-medium text-[var(--text-secondary)]";

interface Props {
  ordenes: OrigenDevolucion[];
  cargando: boolean;
  error: string | null;
  ordenId: string;
  onOrden: (id: string) => void;
  revision: Revision;
  sinMotivo: string;
  onSinMotivo: (texto: string) => void;
  /** productIds ya puestos en la lista de ítems. */
  agregados: Set<number>;
  onAgregar: (linea: LineaOrigen) => void;
}

/**
 * C49 (17-10): de qué compra sale lo que se devuelve. Elegir la orden trae sus
 * líneas con el costo de esa compra y lo que todavía se puede devolver; lo que no
 * llegó de este proveedor por el sistema pide el porqué.
 */
export function OrigenDevolucionCampo({ ordenes, cargando, error, ordenId, onOrden, revision, sinMotivo, onSinMotivo, agregados, onAgregar }: Props) {
  const orden = ordenes.find((o) => o.ordenId === ordenId);
  return (
    <div className="space-y-2">
      <Field
        label="Compra de origen"
        labelClassName={ROTULO}
        className="space-y-1"
        hint={cargando ? "Trayendo sus compras recibidas…" : error ?? (ordenes.length === 0 ? "No hay compras recibidas de este proveedor en el sistema." : "Opcional: con la orden, el costo es el de esa compra.")}
      >
        {(id) => (
          <select id={id} value={ordenId} onChange={(e) => onOrden(e.target.value)} disabled={cargando || ordenes.length === 0} className={cn(CAMPO, "disabled:opacity-60")}>
            <option value="">Sin elegir: se mira todo lo que te vendió</option>
            {ordenes.map((o) => (
              <option key={o.ordenId} value={o.ordenId}>
                Orden {o.codigo} · recibida el {diaYFecha(o.fecha)} · {o.lineas.length} {o.lineas.length === 1 ? "producto" : "productos"}
              </option>
            ))}
          </select>
        )}
      </Field>

      {orden && (
        <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
          {orden.lineas.map((l) => {
            const ya = agregados.has(l.productId);
            return (
              <li key={l.productId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 basis-40 font-medium text-[var(--text-primary)]">{l.nombre}</span>
                <span className="tabular-nums text-[var(--text-secondary)]">
                  llegaron {l.llegaron} {l.unidad} · puedes devolver {l.puedesDevolver} · {soles(l.costo)} c/u
                </span>
                <button
                  type="button"
                  onClick={() => onAgregar(l)}
                  disabled={ya || l.puedesDevolver <= 0}
                  className="flex h-12 items-center gap-1 px-2 text-sm font-medium text-[var(--accent-ink)] hover:underline disabled:text-[var(--text-tertiary)] disabled:no-underline dark:text-[var(--accent)]"
                >
                  {!ya && <Plus className="h-4 w-4" aria-hidden />}
                  {ya ? "Agregado" : l.puedesDevolver <= 0 ? "Ya devuelto" : "Agregar"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {revision.excede.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2.5 text-sm text-[var(--data-error-ink)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>No puedes devolver más de lo que te llegó. {revision.excede.join(" ")}</span>
        </div>
      )}

      {revision.sinRecepcion.length > 0 && (
        <Field
          label={`${revision.sinRecepcion.join(", ")} no ${revision.sinRecepcion.length === 1 ? "llegó" : "llegaron"} de este proveedor por el sistema. ¿Por qué lo devuelves? *`}
          labelClassName={ROTULO}
          className="space-y-1"
        >
          {(id) => (
            <input id={id} value={sinMotivo} onChange={(e) => onSinMotivo(e.target.value)} maxLength={300} placeholder="Ej.: lo compramos antes de usar el sistema" className={CAMPO} />
          )}
        </Field>
      )}
    </div>
  );
}
