"use client";

/**
 * CtpSeccionCardMobile — card a medida para Producción y Despacho en mobile.
 *
 * Gemela de CtpIngresoCardMobile: la <table> de secciones se oculta en <640px
 * (hidden sm:block) y estas cards toman su lugar (sm:hidden), con la jerarquía
 * pensada para el celular del almacenero — producto como título, el dato grande
 * (producido / despachado) en una barra, y las acciones (Cadena / Enviar a
 * inventario / Anular) full-width. Misma data y mismos handlers que la tabla.
 */

import { AlertCircle, Boxes, Calendar, Link2, PackagePlus, Truck } from "@buleje/design-system/icons";
import { evaluarRendimiento } from "@/lib/forestal/ctp-rendimiento";
import type { CtpEntry, CtpSection } from "./CtpSectionViews";

interface CtpSeccionCardMobileProps {
  entry: CtpEntry;
  section: CtpSection;
  toProductId: string | null;
  onChain: (e: CtpEntry) => void;
  onSendInventory: (id: string) => void;
  onAnnul: (id: string) => void;
}

const n4 = (v: string | null) => (v == null ? "—" : Number(v).toFixed(4));
// timeZone UTC: entryDate es date-only a medianoche UTC (off-by-one en Lima).
const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; }
};

export default function CtpSeccionCardMobile({ entry: e, section, toProductId, onChain, onSendInventory, onAnnul }: CtpSeccionCardMobileProps) {
  const anulado = e.status === "anulado";
  const KindIcon = section === "produccion" ? Boxes : Truck;
  const rend = section === "produccion" ? evaluarRendimiento(e.productType, e.rendimientoPct != null ? Number(e.rendimientoPct) : null) : null;

  return (
    <article className={`rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 ${anulado ? "opacity-60" : ""}`}>
      {/* Encabezado: especie + CITES · estado */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[length:var(--ts-2xs)] font-mono font-bold text-[var(--text-tertiary)]">#{e.lineNo}</span>
            <h3 className="truncate text-base font-bold text-[var(--text-primary)]">{e.speciesCommon ?? "—"}</h3>
            {e.cites && (
              <span className="shrink-0 rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>
            )}
          </div>
          {e.speciesScientific && <p className="truncate text-xs italic text-[var(--text-tertiary)]">{e.speciesScientific}</p>}
        </div>
        {anulado ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]">Anulado</span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-success-100)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)]">Registrado</span>
        )}
      </div>

      {/* Dato grande: producido / despachado + rendimiento o piezas */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
        <span className="flex items-baseline gap-1">
          <KindIcon className="h-4 w-4 self-center text-[var(--accent)]" aria-hidden="true" />
          <span className="font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">{n4(e.quantity)}</span>
          <span className="text-xs text-[var(--text-tertiary)]">{e.unit ?? ""}</span>
        </span>
        {section === "produccion" ? (
          rend && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${rend.estado === "alto" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" : "bg-[var(--data-info-100)] text-[var(--data-info-700)]"}`}>
              {rend.estado === "alto" && <AlertCircle className="h-3.5 w-3.5" aria-label={`Rendimiento sobre el referencial SERFOR (${rend.ref}%)`} />}
              Rend. {e.rendimientoPct != null ? `${Number(e.rendimientoPct).toFixed(1)}%` : "—"}
            </span>
          )
        ) : (
          <span className="text-sm text-[var(--text-secondary)]">
            <strong className="font-mono tabular-nums text-[var(--text-primary)]">{e.pieces ?? "—"}</strong> pz
          </span>
        )}
      </div>

      {/* Meta */}
      <dl className="mt-3 space-y-1.5 text-sm">
        <Row icon={Calendar} label="Fecha" value={fmtDate(e.entryDate)} />
        <Row label="Producto" value={e.productType ?? "—"} />
        {section === "produccion" ? (
          <Row label="Consumido" value={`${n4(e.volumeInputM3)} m³`} />
        ) : (
          <>
            <Row label="GTF salida" value={e.gtfNumber ?? "—"} mono />
            <Row label="Destino" value={e.destino ?? "—"} />
          </>
        )}
      </dl>

      {e.annulledReason && (
        <p className="mt-2 rounded-lg bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)]">{e.annulledReason}</p>
      )}

      {!anulado && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--rule-soft)] pt-3">
          <button
            type="button"
            onClick={() => onChain(e)}
            className="inline-flex h-9 grow items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] px-3 text-xs font-bold text-[var(--data-success-700)] hover:bg-[var(--data-success-100)]"
          >
            <Link2 className="h-3.5 w-3.5" /> Cadena
          </button>
          <button
            type="button"
            disabled={toProductId === e.id}
            onClick={() => onSendInventory(e.id)}
            className="inline-flex h-9 grow items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--data-info-500)] bg-[var(--data-info-50)] px-3 text-xs font-bold text-[var(--data-info-700)] hover:bg-[var(--data-info-100)] disabled:opacity-50"
          >
            <PackagePlus className="h-3.5 w-3.5" /> {toProductId === e.id ? "Creando…" : "A inventario"}
          </button>
          <button
            type="button"
            onClick={() => onAnnul(e.id)}
            className="inline-flex h-9 grow items-center justify-center rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]"
          >
            Anular
          </button>
        </div>
      )}
    </article>
  );
}

function Row({ icon: Icon, label, value, mono }: { icon?: typeof Calendar; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />} {label}
      </dt>
      <dd className={`text-right text-[var(--text-primary)] ${mono ? "font-mono text-xs font-bold" : ""}`}>{value}</dd>
    </div>
  );
}
