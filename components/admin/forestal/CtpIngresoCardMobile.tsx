"use client";

/**
 * CtpIngresoCardMobile — card a medida del ingreso para pantallas chicas.
 *
 * El shell admin auto-convierte cualquier <table> en cards genéricas (label:
 * valor) a ≤639px; funciona, pero es plana. Esta card le da jerarquía pensada
 * para el almacenero en el celular: especie como título + chips de estado/CITES/
 * plazo arriba, volumen y piezas como el dato grande, y las acciones full-width.
 * La tabla desktop se oculta en mobile (hidden sm:block) y estas cards se
 * muestran solo ahí (sm:hidden) — dual-render, misma data y mismos handlers.
 */

import { Calendar, MapPin, TreePine } from "@buleje/design-system/icons";
import CtpEntryActions, { type CtpEntryActionsProps } from "./CtpEntryActions";
import {
  PLAZO_REGISTRO_DIAS,
  StatusBadge,
  diasDeRegistro,
  estaFueraDePlazo,
  formatDate,
  originLabel,
  productLabel,
  type WoodEntry,
} from "./ctp-shared";

interface CtpIngresoCardMobileProps extends Omit<CtpEntryActionsProps, "block"> {
  entry: WoodEntry;
  selected: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
}

export default function CtpIngresoCardMobile(props: CtpIngresoCardMobileProps) {
  const { entry: e, selected, onToggleSelect, onDetail } = props;
  const tarde = estaFueraDePlazo(e);

  return (
    <article className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      {/* Encabezado: especie (título) + científico · a la derecha estado */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {e.status === "pendiente" && (
              <input
                type="checkbox"
                aria-label={`Seleccionar ingreso ${e.gtfNumber}`}
                checked={selected}
                onChange={(ev) => onToggleSelect(e.id, ev.target.checked)}
                className="h-4 w-4 shrink-0 accent-[var(--brand-ink)]"
              />
            )}
            <h3 className="truncate text-base font-bold text-[var(--text-primary)]">
              {e.speciesCommonName}
            </h3>
            {e.speciesCites && (
              <span
                title="Especie protegida CITES"
                className="shrink-0 rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]"
              >
                CITES
              </span>
            )}
          </div>
          {e.speciesScientificName && (
            <p className="truncate text-xs italic text-[var(--text-tertiary)]">
              {e.speciesScientificName}
            </p>
          )}
        </div>
        <StatusBadge status={e.status} />
      </div>

      {/* Dato grande: volumen + piezas + producto */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
        <span className="flex items-baseline gap-1">
          <TreePine className="h-4 w-4 self-center text-[var(--accent)]" aria-hidden="true" />
          <span className="font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
            {Number(e.volumeM3).toFixed(4)}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">m³</span>
        </span>
        <span className="text-sm text-[var(--text-secondary)]">
          <strong className="font-mono tabular-nums text-[var(--text-primary)]">{e.pieces}</strong> pz
        </span>
        <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
          {productLabel(e.productType)}
        </span>
      </div>

      {/* Meta: GTF · fecha (+plazo) · proveedor/origen */}
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">GTF</dt>
          <dd>
            <button
              type="button"
              onClick={() => onDetail(e)}
              className="font-mono text-sm font-bold text-[var(--brand-ink)] underline-offset-2 hover:underline"
            >
              {e.gtfNumber}
            </button>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Ingreso
          </dt>
          <dd className="flex items-center gap-2 text-right text-[var(--text-primary)]">
            {formatDate(e.entryDate)}
            {tarde && (
              <span
                title={`Registrado ${diasDeRegistro(e)} días después de la operación (plazo ${PLAZO_REGISTRO_DIAS} días hábiles)`}
                className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]"
              >
                fuera de plazo
              </span>
            )}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Origen
          </dt>
          <dd className="text-right text-[var(--text-primary)]">
            {e.providerName}
            <span className="block text-xs text-[var(--text-tertiary)]">{originLabel(e.originType)}</span>
          </dd>
        </div>
      </dl>

      {e.rejectionReason && (
        <p className="mt-2 rounded-lg bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)]">
          {e.rejectionReason}
        </p>
      )}

      {/* Acciones full-width (mismo componente que la tabla desktop) */}
      <div className="mt-3 border-t border-[var(--rule-soft)] pt-3">
        <CtpEntryActions {...props} block />
      </div>
    </article>
  );
}
