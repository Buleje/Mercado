"use client";

/**
 * Un lote como tarjeta.
 *
 * Sale de `ForestLotesModule` porque el módulo pasó de coordinar a dibujar: con
 * la meta de rendimiento adentro se fue a 390 líneas y los tres chips
 * (operativo, avance, meta) ya eran componentes propios enterrados en el mismo
 * archivo.
 */

import { Tag, Target, Users } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { LABEL_OPERATIVO, estadoOperativo } from "@/lib/forestal/lote-ventana";
import { avanceDeLote, enPieTablar, type MetaLote } from "@/lib/forestal/lote-metricas";
import { RENDIMIENTO_REF_ASERRADA } from "@/lib/forestal/ctp-rendimiento";

export type LoteStatus = "abierto" | "cerrado" | "despachado" | "anulado";

export interface LoteRow {
  id: string; loteCode: string; productType: string | null;
  speciesCommon: string | null; cites: boolean; unit: string;
  grade: string | null; destino: string | null; status: LoteStatus;
  miembrosCount: number; totalCantidad: number; createdAt: string;
  /** Lo que ya salió y lo que queda del lote (despachos vivos). */
  despachado: number; disponible: number;
  /** Ventana de trabajo y dueño de la madera (ADR-327). */
  fechaInicio?: string | null; fechaFin?: string | null; titularNombre?: string | null;
  /** Rendimiento vs. la meta de referencia, calculado en el servidor. */
  meta?: MetaLote | null;
}

export const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };
const STATUS_CHIP: Record<LoteStatus, string> = {
  abierto: "bg-[var(--data-info-100)] text-[var(--data-info-700)]",
  cerrado: "bg-[var(--data-success-100)] text-[var(--data-success-700)]",
  despachado: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  anulado: "bg-[var(--data-error-100)] text-[var(--data-error-700)]",
};
const STATUS_LABEL: Record<LoteStatus, string> = { abierto: "Abierto", cerrado: "Cerrado", despachado: "Despachado", anulado: "Anulado" };

/** Las cantidades viajan por JSON: un Decimal de Prisma puede llegar como
 *  string y `.toFixed()` sobre un string revienta en pantalla (la regresión que
 *  motivó la regla de lint). Se coacciona SIEMPRE antes de formatear. */
const n4 = (v: number | string | null | undefined) => (Number(v) || 0).toFixed(4);

/** `timeZone: "UTC"` NO es cosmético: las fechas del libro son date-only y sin
 *  esto, a las 19:00 de Lima, un 20-jul se dibuja como 19-jul. Mismo criterio
 *  que CtpEntriesView y el resto del módulo. */
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };

/**
 * En qué anda el lote según su VENTANA — distinto del estado comercial.
 *
 * Sin fechas no dibuja nada: un chip "sin fechas" en cada card sería ruido en
 * las plantas que no usan la ventana.
 */
function OperativoChip({ lote }: { lote: { fechaInicio?: string | null; fechaFin?: string | null } }) {
  const est = estadoOperativo(lote);
  if (est === "sin_fecha") return null;
  const tono =
    est === "en_proceso"
      ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : est === "programado"
        ? "bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/10 dark:text-[var(--data-info-500)]"
        : "bg-[var(--surface-canvas)] text-[var(--text-secondary)]";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold ${tono}`}>
      {LABEL_OPERATIVO[est]}
    </span>
  );
}

/**
 * Cuánto del lote ya salió, como barra.
 *
 * Un lote SIN corridas no dibuja barra: una barra vacía se lee como "no
 * despaché nada de lo que tengo", que es lo contrario de "todavía no armé nada".
 */
function LoteAvance({ lote }: { lote: LoteRow }) {
  const { pct, completo, sinArmar } = avanceDeLote(lote);
  if (sinArmar) {
    return (
      <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">Sin corridas todavía.</p>
    );
  }
  return (
    <div
      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Despachado ${pct}% del lote ${lote.loteCode}`}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-[var(--motion-slow)]",
          completo ? "bg-[var(--data-success-500)]" : "bg-[var(--accent)]",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * La cuenta del jefe de planta: *"metí 40 m³, al 56% tendrían que salir 22.4,
 * llevo 18 — me faltan 4.4"*.
 *
 * Mide las corridas ENTERAS que arman el lote, no la fracción que el lote se
 * lleva: el consumo se atribuye a la corrida completa (I2). Por eso el rótulo
 * dice "sus corridas" y no "este lote" — la diferencia importa cuando una
 * corrida está repartida entre dos lotes.
 *
 * Sin consumo atribuido no se dibuja: un 0% afirmaría que la corrida no rindió.
 */
function MetaChip({ meta }: { meta?: MetaLote | null }) {
  if (!meta) return null;
  const falta = meta.saldoM3 > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--surface-sunken)] px-2.5 py-1.5 text-sm">
      <span className="inline-flex items-center gap-1 font-bold text-[var(--text-tertiary)]">
        <Target className="h-3.5 w-3.5" aria-hidden /> Meta {RENDIMIENTO_REF_ASERRADA}%
      </span>
      <span className="font-mono tabular-nums text-[var(--text-secondary)]">
        {n4(meta.trozasM3)} → {n4(meta.metaM3)} m³
      </span>
      <span
        className={cn(
          "ml-auto font-mono font-bold tabular-nums",
          falta
            ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
            : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
        )}
        title={
          falta
            ? `Faltan ${n4(meta.saldoM3)} m³ (${meta.saldoPt.toLocaleString("es-PE")} pt) para la meta de sus corridas`
            : `Superó la meta en ${n4(-meta.saldoM3)} m³`
        }
      >
        {falta ? `faltan ${n4(meta.saldoM3)}` : `+${n4(-meta.saldoM3)}`}
      </span>
      {meta.unidadesMezcladas && (
        <span className="w-full text-[var(--text-tertiary)]">
          Hay corridas en otra unidad: el saldo es parcial.
        </span>
      )}
    </div>
  );
}


export default function LoteCard({ lote: l, onAbrir }: { lote: LoteRow; onAbrir: (id: string) => void }) {
  return (
            <button type="button" onClick={() => onAbrir(l.id)} className="flex flex-col gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-left transition-colors hover:border-[var(--brand-ink)] hover:bg-[var(--surface-canvas)]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-lg font-bold text-[var(--text-primary)]">{l.loteCode}</span>
                <div className="flex items-center gap-1.5">
                  {/* Dos ejes distintos: el comercial (abierto/cerrado) y el
                      operativo (programado/en proceso/finalizado). Un lote puede
                      estar abierto y ya terminado de aserrar. */}
                  <OperativoChip lote={l} />
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold ${STATUS_CHIP[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-[var(--text-primary)]">{l.productType ?? "—"}</span>
                {l.speciesCommon && <span className="text-[var(--text-secondary)]">· {l.speciesCommon}</span>}
                {l.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
              </div>
              <div className="border-t border-[var(--rule-soft)] pt-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">
                    {n4(l.totalCantidad)}{" "}
                    <span className="text-sm font-normal text-[var(--text-tertiary)]">{UNIT_LABELS[l.unit] ?? l.unit}</span>
                  </span>
                  {/* Acá la madera se habla en pie tablar: el m³ es el del libro,
                      el pt es el que usa el comprador. Van los dos o hay que
                      convertir de cabeza en el teléfono. */}
                  {l.unit === "m3" && (
                    <span className="font-mono text-sm tabular-nums text-[var(--text-tertiary)]">
                      {enPieTablar(l.totalCantidad).toLocaleString("es-PE")} pt
                    </span>
                  )}
                </div>
                <LoteAvance lote={l} />
                <div className="mt-1.5 flex items-center justify-between text-sm text-[var(--text-tertiary)]">
                  <span>{l.miembrosCount} {l.miembrosCount === 1 ? "corrida" : "corridas"}</span>
                  <span>
                    Quedan{" "}
                    <b className="font-mono tabular-nums text-[var(--text-primary)]">{n4(l.disponible)}</b>{" "}
                    {UNIT_LABELS[l.unit] ?? l.unit}
                  </span>
                </div>
              </div>
              <MetaChip meta={l.meta} />
              {l.titularNombre && (
                <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                  <Users className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">Madera de {l.titularNombre}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                {l.grade ? <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" />{l.grade}</span> : <span />}
                <span>{l.fechaInicio || l.fechaFin ? `${l.fechaInicio ? fmtDate(l.fechaInicio) : "?"} → ${l.fechaFin ? fmtDate(l.fechaFin) : "?"}` : fmtDate(l.createdAt)}</span>
              </div>
            </button>
  );
}
