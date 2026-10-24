"use client";

/**
 * CtpIngresoDesdeLibroTh — «Nuevo ingreso › Desde tu Libro TH» (ADR-481).
 *
 * Brandon (08-10): «cuando se sacó de libro de títulos habilitantes a CTP se
 * tiene que rellenar todo: las trozas, lista de trozas, resúmenes, titular…».
 * Acá se elige la guía del TH que todavía no entró a la planta; «Traer con
 * todo» la deja guardada en el CTP y abre «Recibir» con todo puesto (titular,
 * permiso, origen, especies, cada troza con su código, D1, D2, largo y m³, y
 * el resumen). Lo único que se pone es lo que la guía no sabe: el día en que
 * bajó la madera y cuáles bajaron.
 *
 * Estados: leyendo · error (Reintentar) · vacía · lista · trayendo una guía ·
 * no se pudo traer (el motivo del servidor, en la fila).
 */

import { useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, RefreshCw, TreePine } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { diaCorto } from "@/lib/forestal/loth-aprovechamiento";
import type { GuiaThAlistada, GuiaThPorIngresar } from "@/lib/forestal/guias-th-por-ingresar";
import { useGuiasThPorIngresar } from "./hooks/use-guias-th-por-ingresar";
import { Btn, Seccion } from "./ctp-shared";

const trozas = (n: number) => `${n} ${n === 1 ? "troza" : "trozas"}`;

const AYUDA =
  "Las guías que emitiste o importaste en tu Libro TH y que todavía no entraron a tu planta. Al traer una, el ingreso sale con todo: titular, permiso, origen, especies, la lista de trozas con su código, D1, D2, largo y m³, y el resumen por especie. Tú revisas, marcas lo que bajó del camión y tocas «Recibir».";

export default function CtpIngresoDesdeLibroTh({ onAlistada }: { onAlistada: (a: GuiaThAlistada) => void }) {
  const { guias, ingresadas, cargando, error, recargar, traer, trayendo } = useGuiasThPorIngresar(true);
  /** El «no» del servidor, en la fila de esa guía. */
  const [errores, setErrores] = useState<Record<string, string>>({});

  const alTraer = async (g: GuiaThPorIngresar) => {
    setErrores((e) => ({ ...e, [g.gtfId]: "" }));
    const r = await traer(g.gtfId);
    if (r.ok) onAlistada(r.alistada);
    else setErrores((e) => ({ ...e, [g.gtfId]: r.mensaje }));
  };

  const listas = guias?.filter((g) => g.lista).length ?? 0;

  return (
    <Seccion numero={1} title="Guías de tu Libro TH por ingresar" hint={AYUDA}>
      <div className="col-span-full space-y-3" data-testid="ingreso-desde-loth">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span aria-live="polite">
            {cargando && !guias
              ? "Leyendo tus guías…"
              : guias
                ? `${guias.length === 1 ? "1 guía" : `${guias.length} guías`} sin ingreso${listas < (guias.length || 0) ? ` · ${listas} ${listas === 1 ? "se puede traer" : "se pueden traer"}` : ""}${ingresadas > 0 ? ` · ${ingresadas} ya en tu CTP` : ""}`
                : ""}
          </span>
          <Btn size="sm" variant="ghost" className="ml-auto" onClick={recargar} disabled={cargando} aria-label="Volver a leer las guías">
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden /> Actualizar
          </Btn>
        </div>

        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{error}</span>
            <Btn size="sm" variant="secondary" onClick={recargar}>Reintentar</Btn>
          </div>
        )}

        {cargando && !guias && !error && (
          <div className="space-y-2" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
            ))}
          </div>
        )}

        {guias && guias.length === 0 && !error && (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            No hay guías de tu Libro TH por ingresar. Si la madera vino con otra guía, usa «Carga manual» o «Desde SERFOR».
          </p>
        )}

        {guias && guias.length > 0 && (
          <ul className="space-y-2">
            {guias.map((g) => (
              <FilaGuia key={g.gtfId} g={g} trayendo={trayendo === g.gtfId} ocupado={trayendo != null} error={errores[g.gtfId] || null} onTraer={() => void alTraer(g)} />
            ))}
          </ul>
        )}
      </div>
    </Seccion>
  );
}

function FilaGuia({
  g,
  trayendo,
  ocupado,
  error,
  onTraer,
}: {
  g: GuiaThPorIngresar;
  trayendo: boolean;
  ocupado: boolean;
  error: string | null;
  onTraer: () => void;
}) {
  return (
    <li
      className={`rounded-xl border px-4 py-3 ${g.lista ? "border-[var(--rule-base)] bg-[var(--surface-canvas)]" : "border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]"}`}
      data-gtf={g.gtfNumber}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="whitespace-nowrap font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">GTF {g.gtfNumber}</span>
            {g.gtfDate && <span className="text-[var(--text-secondary)]">del {diaCorto(g.gtfDate)}</span>}
            {g.guardadaId && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                ya en tus guías por recibir
              </span>
            )}
          </p>
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]" title={g.titular ?? undefined}>
            {g.titular ?? "Sin titular"}
            {g.permiso && <span className="font-mono font-normal text-[var(--text-secondary)]"> · {g.permiso}</span>}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {[g.origen && `Sale de ${g.origen}`, g.destinatario && `va a ${g.destinatario}`, g.especies.join(", ")].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className="text-right text-sm tabular-nums text-[var(--text-primary)]">
            <span className="font-bold">{trozas(g.trozas)}</span>
            {g.volumenM3 != null && <span className="text-[var(--text-secondary)]"> · {fmtM3(g.volumenM3)} m³</span>}
          </p>
          {g.lista && (
            <Btn size="sm" variant="primary" onClick={onTraer} disabled={ocupado} data-testid="traer-guia-th">
              {trayendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <TreePine className="h-4 w-4" aria-hidden />}
              {trayendo ? "Trayendo…" : "Traer con todo"}
              {!trayendo && <ArrowRight className="h-4 w-4" aria-hidden />}
            </Btn>
          )}
        </div>
      </div>
      {(g.motivo || error) && (
        <p role={error ? "alert" : undefined} className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{error || g.motivo}</span>
        </p>
      )}
    </li>
  );
}
