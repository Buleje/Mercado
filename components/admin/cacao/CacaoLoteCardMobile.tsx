"use client";

/**
 * CacaoLoteCardMobile — un lote de acopio como tarjeta, para pantallas < 640px.
 *
 * La tabla dependía de la conversión automática `.admin-mobile-cards` (CSS
 * global): en 390px la "tarjeta" resultante medía 120px de ancho y partía la
 * fecha en tres líneas. Un acopiador trabaja con el celular en la mano en el
 * centro de acopio — la vista que más usa no puede ser la rota.
 *
 * Dual-render explícito (regla del DS): la tabla vive en `hidden sm:block` y
 * esto en `sm:hidden`, cada uno con el layout que le sirve.
 */
import { Ban, Trees, Wallet } from "@buleje/design-system/icons";
import { IconAction } from "@/components/admin/shared/module-primitives";

export interface CacaoLoteCardData {
  id: string;
  loteCode: string;
  fecha: string;
  productorId: string | null;
  productorNombre: string | null;
  parcelaCodigo: string | null;
  variedad: string | null;
  tipoGrano: string | null;
  pesoKg: string;
  humedadPct: string | null;
  totalPagado: string | null;
  status: string;
}

export default function CacaoLoteCardMobile({
  lote: l,
  fecha,
  peso,
  saldo,
  pendiente,
  gradoBadge,
  pagoBadge,
  onOpen,
  onPagar,
  onAnular,
}: {
  lote: CacaoLoteCardData;
  /** Formatters del módulo: se pasan para no duplicar la lógica de formato. */
  fecha: string;
  peso: string;
  saldo: string;
  pendiente: boolean;
  gradoBadge: React.ReactNode;
  pagoBadge: React.ReactNode;
  onOpen: () => void;
  onPagar: () => void;
  onAnular: () => void;
}) {
  const anulado = l.status === "anulado";
  return (
    <div
      className={`rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 ${anulado ? "opacity-60" : ""}`}
    >
      {/* Cabecera: qué lote es y en qué estado está. */}
      <button type="button" onClick={onOpen} className="flex w-full items-start justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <b className="font-mono text-base font-bold text-[var(--text-primary)]">{l.loteCode}</b>
            {anulado && (
              <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                ANULADO
              </span>
            )}
            {gradoBadge}
          </span>
          <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">{fecha}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">{peso}</span>
          <span className="block text-xs text-[var(--text-tertiary)]">kg</span>
        </span>
      </button>

      {/* Productor + origen. */}
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-medium text-[var(--text-primary)]">{l.productorNombre ?? "Sin productor"}</span>
        {l.productorNombre && !l.productorId && (
          <span className="rounded bg-[var(--data-warning-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">
            sin vincular
          </span>
        )}
        {l.parcelaCodigo && (
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-primary">
            <Trees className="h-3 w-3" aria-hidden="true" />
            {l.parcelaCodigo}
          </span>
        )}
      </p>

      {/* Los tres números que decide mirar: variedad, humedad y plata. */}
      <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-[var(--rule-soft)] pt-2 text-sm">
        <div>
          <dt className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">Variedad</dt>
          <dd className="truncate text-[var(--text-secondary)]">
            {l.variedad ?? "—"}
            {l.tipoGrano === "humedo" ? " (húm.)" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">Humedad</dt>
          <dd
            className={`font-mono tabular-nums ${
              l.humedadPct && Number(l.humedadPct) > 7
                ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                : "text-[var(--text-secondary)]"
            }`}
          >
            {l.humedadPct ? `${Number(l.humedadPct).toFixed(1)}%` : "—"}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">Liquidación</dt>
          <dd className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{l.totalPagado ? saldo : "—"}</dd>
        </div>
      </dl>

      {(pagoBadge || !anulado) && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span>{pagoBadge}</span>
          {!anulado && (
            <span className="flex items-center gap-1">
              {pendiente && <IconAction icon={Wallet} tone="success" label="Pagar al productor" onClick={onPagar} />}
              <IconAction icon={Ban} tone="danger" label="Anular el lote" onClick={onAnular} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
