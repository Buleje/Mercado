"use client";

/**
 * Los lotes como tabla, con totales y paginación.
 *
 * Las cards se leen bien con diez lotes; con cincuenta, comparar rendimientos o
 * buscar el que tiene saldo obliga a recorrer la página entera. La tabla existe
 * para ESO —barrer una columna de arriba abajo—, así que trae el pie de totales
 * que las cards no pueden dar.
 *
 * Es la misma data que las cards y el mismo click: sólo cambia la forma.
 */

import { DataTable } from "@buleje/design-system";
import { ChevronLeft, ChevronRight, Tag } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { RENDIMIENTO_REF_ASERRADA } from "@/lib/forestal/ctp-rendimiento";
import { paginar, type MetaLote } from "@/lib/forestal/lote-metricas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export interface LoteFila {
  id: string;
  loteCode: string;
  productType: string | null;
  speciesCommon: string | null;
  cites: boolean;
  unit: string;
  grade: string | null;
  destino: string | null;
  status: string;
  miembrosCount: number;
  totalCantidad: number;
  despachado: number;
  disponible: number;
  titularNombre?: string | null;
  meta?: MetaLote | null;
}

const n4 = (v: number | string | null | undefined) => (Number(v) || 0).toFixed(4);
/** `l.unit` no siempre es m³ (kg/pt/unidad, según el lote): los tres decimales
 *  de SERFOR sólo aplican cuando de verdad se está declarando m³. */
const nCantidad = (v: number | string | null | undefined, unit: string) =>
  unit === "m3" ? fmtM3(Number(v) || 0) : n4(v);
const UNIDAD: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "u" };

/**
 * Cuánto se apartó del coeficiente referencial de SERFOR.
 *
 * El color NO es "cerca de la meta = bien". Pasarse del referencial es la señal
 * de blanqueo que describe la RDE D000259-2024 —se declara más madera de la que
 * la troza puede dar— y el resto del módulo ya la pinta como advertencia.
 * Quedarse corto no es infracción: es productividad, y va neutro.
 */
function SaldoMeta({ meta }: { meta: MetaLote | null | undefined }) {
  if (!meta) return <span className="text-[var(--text-tertiary)]">—</span>;
  const porEncima = meta.saldoM3 < 0;
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        meta.sobreReferencial
          ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          : "text-[var(--text-secondary)]",
      )}
      title={
        meta.sobreReferencial
          ? `Rinde ${meta.rendimientoPct}%, sobre el referencial SERFOR de ${RENDIMIENTO_REF_ASERRADA}% — revisá antes de presentar el libro`
          : porEncima
            ? "Por encima del referencial, dentro de la tolerancia"
            : "Por debajo del referencial (no es una infracción)"
      }
    >
      {porEncima ? "+" : "−"}
      {fmtM3(Math.abs(meta.saldoM3))}
    </span>
  );
}

export default function LotesTabla({
  lotes,
  pagina,
  porPagina,
  onPagina,
  onPorPagina,
  onAbrir,
}: {
  lotes: LoteFila[];
  pagina: number;
  porPagina: number;
  onPagina: (p: number) => void;
  onPorPagina: (n: number) => void;
  onAbrir: (id: string) => void;
}) {
  // El recorte vive en `paginar()`, que está probado: acá se cometen los
  // off-by-one y con diez lotes no hay segunda página que cruzar en el navegador.
  const { visibles, pagina: actual, paginas, desde, hasta } = paginar(lotes, pagina, porPagina);

  // Los totales son de TODO lo filtrado, no de la página: un total que cambia al
  // pasar de página no es un total, es una casualidad.
  const enM3 = lotes.filter((l) => l.unit === "m3");
  const tot = {
    armado: enM3.reduce((a, l) => a + (Number(l.totalCantidad) || 0), 0),
    despachado: enM3.reduce((a, l) => a + (Number(l.despachado) || 0), 0),
    disponible: enM3.reduce((a, l) => a + (Number(l.disponible) || 0), 0),
    saldo: enM3.reduce((a, l) => a + (l.meta?.saldoM3 ?? 0), 0),
  };

  return (
    <div className="@container space-y-3">
      {/* Sin `hoja-grilla`: en mobile `.admin-mobile-cards` (globals.css) la
          convierte sola en cards con la etiqueta de cada columna al lado, que
          para once columnas se lee mejor que cualquier scroll lateral. Por eso
          acá NO va el degradé de borde que sí llevan los cuadros SERFOR —esos
          sí optan por quedarse como tabla, porque son el formato oficial. */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <DataTable className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--rule-base)] text-left text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <th className="px-3 py-2.5 font-bold">Código</th>
              <th className="px-3 py-2.5 font-bold">Producto · especie</th>
              <th className="px-3 py-2.5 font-bold">Grado</th>
              <th className="px-3 py-2.5 text-right font-bold">Armado</th>
              <th className="px-3 py-2.5 text-right font-bold">Despachado</th>
              <th className="px-3 py-2.5 text-right font-bold">Disponible</th>
              <th className="px-3 py-2.5 text-right font-bold">Trozas m³</th>
              <th className="px-3 py-2.5 text-right font-bold">Ref. SERFOR {RENDIMIENTO_REF_ASERRADA}%</th>
              <th className="px-3 py-2.5 text-right font-bold">Vs. referencial</th>
              <th className="px-3 py-2.5 text-right font-bold">Rend.</th>
              <th className="px-3 py-2.5 font-bold">Destino</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {visibles.map((l) => (
              <tr
                key={l.id}
                onClick={() => onAbrir(l.id)}
                className="cursor-pointer transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <td className="whitespace-nowrap px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                  {l.loteCode}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">
                  {l.productType ?? "—"}
                  {l.speciesCommon && <> · {l.speciesCommon}</>}
                  {l.cites && (
                    <span className="ml-1.5 rounded-full bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">
                      CITES
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">
                  {l.grade ? (
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5" aria-hidden /> {l.grade}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {nCantidad(l.totalCantidad, l.unit)} <span className="text-[var(--text-tertiary)]">{UNIDAD[l.unit] ?? l.unit}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {nCantidad(l.despachado, l.unit)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                  {nCantidad(l.disponible, l.unit)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {l.meta ? fmtM3(l.meta.trozasM3) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {l.meta ? fmtM3(l.meta.metaM3) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <SaldoMeta meta={l.meta} />
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {l.meta?.rendimientoPct != null ? `${l.meta.rendimientoPct}%` : "—"}
                </td>
                <td className="max-w-48 truncate px-3 py-2 text-[var(--text-secondary)]">
                  {l.destino ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--rule-base)] font-bold text-[var(--text-primary)]">
              <td className="px-3 py-2.5" colSpan={3}>
                Totales · {enM3.length} en m³
                {lotes.length > enM3.length && (
                  <span className="ml-1 font-normal text-[var(--text-tertiary)]">
                    (+{lotes.length - enM3.length} en otra unidad, sin sumar)
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtM3(tot.armado)}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtM3(tot.despachado)}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtM3(tot.disponible)}</td>
              <td className="px-3 py-2.5" colSpan={2} />
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtM3(tot.saldo)}</td>
              <td className="px-3 py-2.5" colSpan={2} />
            </tr>
          </tfoot>
        </DataTable>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          Por página
          <select
            value={porPagina}
            onChange={(e) => {
              onPorPagina(Number(e.target.value));
              onPagina(1); // Cambiar el tamaño y quedar en la página 7 deja la vista vacía.
            }}
            className="h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <p className="text-sm text-[var(--text-tertiary)]" aria-live="polite">
          {lotes.length === 0 ? "Sin lotes" : `${desde}–${hasta} de ${lotes.length}`}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPagina(actual - 1)}
            disabled={actual <= 1}
            className="inline-flex h-12 items-center gap-1 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-40 disabled:hover:border-[var(--rule-base)]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
          </button>
          <span className="text-sm tabular-nums text-[var(--text-secondary)]">
            {actual} / {paginas}
          </span>
          <button
            type="button"
            onClick={() => onPagina(actual + 1)}
            disabled={actual >= paginas}
            className="inline-flex h-12 items-center gap-1 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-40 disabled:hover:border-[var(--rule-base)]"
          >
            Siguiente <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
