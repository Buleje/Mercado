"use client";

/**
 * Las dos partes plegables del detalle: las notas internas del equipo y la
 * línea de tiempo del pedido. Salieron de `OrdersDetailPanel.tsx` (10-10).
 *
 * 17-10 (P05/P10): las dos leen el historial de verdad
 * (`useHistorialPedidos`). Las notas nunca se habían guardado (el panel
 * mandaba un campo que el servidor descartaba); ahora cada una dice quién la
 * escribió y cuándo. La línea de tiempo dice quién movió cada paso y el
 * motivo (cancelación, entrega sin reparto); sólo si el pedido no tiene
 * registro cae a la estimación de antes, y lo avisa.
 */
import { useState, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { getOrderTimeline } from "@/lib/admin-helpers";
import { formatDateTimeShort } from "@/lib/format";
import type { DbOrder } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import type { EventoPedido } from "../hooks/useHistorialPedidos";
import { STATUS_LABELS } from "../types";
import { usePermisosPedidos } from "../permisos-pedidos";

function Plegable({
  titulo,
  marca,
  children,
}: {
  titulo: string;
  marca?: ReactNode;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="group flex min-h-12 w-full items-center gap-2"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[var(--text-tertiary)] transition-transform",
            !abierto && "-rotate-90",
          )}
          aria-hidden
        />
        <CardTitle className="text-sm font-bold text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">
          {titulo}
        </CardTitle>
        {marca}
      </button>
      {abierto && <div className="mt-1 space-y-2">{children}</div>}
    </section>
  );
}

type Nota = Extract<EventoPedido, { tipo: "nota" }>;
type CambioDeEstado = Extract<EventoPedido, { tipo: "estado" }>;

interface NotasProps {
  orderId: string;
  /** Las guardadas, de la más vieja a la más nueva. */
  notas: readonly Nota[];
  /** No se pudo leer el historial: se dice en vez de mostrar «sin notas». */
  errorAlLeer: boolean;
  nota: string;
  guardando: boolean;
  onNota: (v: string) => void;
  onGuardar: (orderId: string) => void;
}

export function DetalleNotas({
  orderId,
  notas,
  errorAlLeer,
  nota,
  guardando,
  onNota,
  onGuardar,
}: NotasProps) {
  /* Anotar es un PATCH del pedido: el almacenero las lee, no las escribe. */
  const { mover } = usePermisosPedidos();
  return (
    <Plegable
      titulo="Notas internas"
      marca={
        notas.length > 0 ? (
          <span className="rounded-full bg-[var(--data-warning-500)]/15 px-2 text-sm font-bold tabular-nums text-[var(--data-warning-ink)]">
            {notas.length}
          </span>
        ) : undefined
      }
    >
      {errorAlLeer && (
        <p className="text-sm text-[var(--data-error-ink)]">No pudimos leer las notas guardadas.</p>
      )}
      {notas.length > 0 && (
        <ul className="space-y-2">
          {notas.map((n) => (
            <li
              key={`${n.cuando}-${n.quien}`}
              className="rounded-lg border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/10 p-3"
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                {n.texto}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {n.quien} · {formatDateTimeShort(n.cuando)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {!mover && notas.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">Sin notas.</p>
      )}
      {mover && (
        <div className="flex items-center gap-2">
          <input
            value={nota}
            onChange={(e) => onNota(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !guardando && onGuardar(orderId)}
            placeholder="Agregar nota interna…"
            aria-label="Nota interna nueva"
            maxLength={2000}
            className="h-12 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-primary"
          />
          <button
            type="button"
            onClick={() => onGuardar(orderId)}
            disabled={guardando || !nota.trim()}
            className={button({ variant: "primary", className: "rounded-xl px-4" })}
          >
            {guardando ? "…" : "Guardar"}
          </button>
        </div>
      )}
    </Plegable>
  );
}

const PUNTO =
  "absolute -left-6 top-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2";

function Paso({
  titulo,
  cuando,
  detalle,
  tono,
}: {
  titulo: string;
  cuando?: string;
  detalle?: string;
  tono: "hecho" | "cancelado" | "falta";
}) {
  return (
    <li className="relative pb-3 last:pb-0">
      <span
        aria-hidden
        className={cn(
          PUNTO,
          tono === "cancelado" && "border-[var(--data-error-500)] bg-[var(--data-error-500)]",
          tono === "hecho" && "border-[var(--data-success-500)] bg-[var(--data-success-500)]",
          tono === "falta" && "border-[var(--rule-base)] bg-[var(--surface-canvas)]",
        )}
      />
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            "text-sm font-semibold",
            tono === "cancelado" && "text-[var(--data-error-ink)]",
            tono === "hecho" && "text-[var(--text-primary)]",
            tono === "falta" && "text-[var(--text-tertiary)]",
          )}
        >
          {titulo}
        </p>
        {cuando && (
          <span className="shrink-0 text-sm tabular-nums text-[var(--text-secondary)]">
            {cuando}
          </span>
        )}
      </div>
      {detalle && <p className="text-sm text-[var(--text-secondary)]">{detalle}</p>}
    </li>
  );
}

interface LineaProps {
  order: DbOrder;
  /** Los cambios de estado guardados; vacío = el pedido no tiene registro. */
  cambios: readonly CambioDeEstado[];
  cargando: boolean;
}

export function DetalleLineaDeTiempo({ order, cambios, cargando }: LineaProps) {
  const real = cambios.length > 0;
  return (
    <Plegable
      titulo="Línea de tiempo"
      marca={
        !real && !cargando ? (
          <span className="text-sm text-[var(--text-tertiary)]">estimada</span>
        ) : undefined
      }
    >
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <ol className="relative pl-6">
          <span
            aria-hidden
            className="absolute bottom-3 left-2.5 top-3 w-px bg-[var(--rule-base)]"
          />
          {real ? (
            <>
              <Paso
                titulo="Pedido recibido"
                cuando={formatDateTimeShort(order.createdAt)}
                tono="hecho"
              />
              {cambios.map((c) => (
                <Paso
                  key={`${c.cuando}-${c.a}`}
                  titulo={STATUS_LABELS[c.a as keyof typeof STATUS_LABELS] ?? c.a}
                  cuando={formatDateTimeShort(c.cuando)}
                  detalle={
                    [c.quien && `Por ${c.quien}`, c.nota].filter(Boolean).join(" · ") || undefined
                  }
                  tono={c.a === "cancelado" ? "cancelado" : "hecho"}
                />
              ))}
            </>
          ) : (
            getOrderTimeline(order).map((step) => (
              <Paso
                key={step.status}
                titulo={step.label}
                cuando={step.timestamp ?? undefined}
                tono={
                  !(step.completed || step.current)
                    ? "falta"
                    : step.status === "cancelado"
                      ? "cancelado"
                      : "hecho"
                }
              />
            ))
          )}
        </ol>
      </div>
    </Plegable>
  );
}
