"use client";

/**
 * CtpFichaCompletitud — cuánto le falta a la Ficha, de un vistazo.
 *
 * La medición que lo motivó: en el tenant real los 18 campos de texto de la
 * Ficha estaban vacíos y la pantalla no lo decía en ningún número — había que
 * leer una lista de avisos para enterarse. Ahora hay una cifra y la lista de
 * lo que falta, con la instrucción oficial de cómo se llena cada casillero.
 *
 * La fuente es `REQUISITOS_FICHA_CTP` (el Anexo 1 de la RDE D000025-2023 + lo que
 * consumen los papeles del centro), la MISMA que alimenta el aviso
 * «la carátula sale con casilleros en blanco» de `avisosDeFicha`: el indicador
 * y el aviso no pueden decir cosas distintas.
 */

import { CheckCircle2, ListChecks, Pencil } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { completitudFichaCtp, type CtpFicha, type RequisitoFichaCtp } from "@/lib/forestal/ctp-ficha-types";

const GRUPO_LABEL: Record<RequisitoFichaCtp["grupo"], string> = {
  caratula: "Carátula del Libro (Anexo 1)",
  documentos: "Guías y certificados del centro",
};

function Barra({ pct, completo }: { pct: number; completo: boolean }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Datos de la Ficha cargados"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-[var(--dur-slow)] ${completo ? "bg-[var(--data-success-500)]" : "bg-[var(--accent)]"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function CtpFichaCompletitud({
  ficha,
  onEditar,
}: {
  ficha: CtpFicha;
  /** Si se pasa, aparece el botón «Completar». En el editor no hace falta. */
  onEditar?: () => void;
}) {
  const total = completitudFichaCtp(ficha);
  const caratula = completitudFichaCtp(ficha, "caratula");
  const documentos = completitudFichaCtp(ficha, "documentos");
  const completo = total.faltan.length === 0;

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              {completo ? (
                <CheckCircle2
                  className="h-4 w-4 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]"
                  aria-hidden
                />
              ) : (
                <ListChecks className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
              )}
              Datos de la Ficha
            </CardTitle>
            <InfoTip
              title="Datos de la Ficha"
              what="Son los que pide el Libro y los papeles del centro."
              affects="La carátula es lo que la ARFFS recibe al frente de los Cuadros Resumen cada mes."
            />
          </div>
          <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
            {completo ? `Los ${total.total} datos están cargados.` : `Faltan ${total.faltan.length} de ${total.total}.`}
          </p>
        </div>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {total.completos}
          </span>
          <span className="text-sm font-medium text-[var(--text-tertiary)]">de {total.total}</span>
        </span>
      </div>

      <Barra pct={total.pct} completo={completo} />

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[caratula, documentos].map((g, i) => {
          const grupo = (i === 0 ? "caratula" : "documentos") as RequisitoFichaCtp["grupo"];
          return (
            <div key={grupo} className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-[var(--text-secondary)]">
                  {GRUPO_LABEL[grupo]}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {g.completos}/{g.total}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {!completo && (
        <>
          <ul className="mt-3 space-y-1.5">
            {total.faltan.map((r) => (
              <li
                key={r.label}
                className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2"
              >
                {/* Qué falta, a la vista; cómo se llena, en el ⓘ (2026-09-24). */}
                <p className="flex items-center gap-1 text-sm font-bold text-[var(--text-primary)]">
                  {r.label}
                  <InfoTip icono="ayuda" title={r.label} what={r.comoSeLlena} />
                </p>
              </li>
            ))}
          </ul>
          {onEditar && (
            <button
              type="button"
              onClick={onEditar}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            >
              <Pencil className="h-4 w-4" aria-hidden /> Completar la Ficha
            </button>
          )}
        </>
      )}
    </section>
  );
}
