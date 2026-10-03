"use client";
/**
 * reparto-variado — la tarjeta del Variado arriba de la Distribución (Brandon,
 * 2026-10-02): cuántos paquetes 6×6 Variado se abrieron, en qué especies (por
 * proporción del volumen libre de cada permiso), si el PT cuadra y qué quedó
 * sin abrir y por qué. El reparto por especie es un DERIVADO, no una medición:
 * se rotula así acá y en el PDF/Excel.
 *
 * «Aplicar el desglose al lote» lo vuelve real (ADR-463): cambia en el lote
 * del cubicador cada fila Variado por sus piezas, con copia para deshacer.
 * Hasta entonces el cubicador no envía ni vincula al Libro.
 */
import { AlertTriangle, Boxes, Check, PackageOpen, Undo2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { formatNumber, formatTime, formatWeekday } from "@/lib/format";
import type { ConfigVariado, MotivoSinDesglosar, ResultadoVariado } from "@/lib/forestal/variado-desglose";
import { medidaVariadoTxt, pesosTxt } from "./cubicador-variado";
import { useAplicarVariado, type AplicarVariado } from "./hooks/use-aplicar-variado";

/** La línea que se imprime en el PDF/Excel de la Distribución cuando hay Variado. */
export const NOTA_VARIADO_PAPEL =
  "Variado: los paquetes 6×6 se abren en medidas y especies por proporción del volumen libre de cada permiso — es un reparto calculado, no una medición.";

const MOTIVO: Record<MotivoSinDesglosar, string> = {
  "no-6x6": "no es 6×6",
  "sin-especies": "sin especies donde repartir",
  "no-cierra": "no cierra con las medidas que entran",
};

const pt2 = (v: number) => formatNumber(v, 2);

const BOTON =
  "inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-lg border px-2.5 font-bold transition-colors disabled:opacity-50 sm:min-h-[2rem]";

/** La copia del lote de antes: cuándo se aplicó y el botón para volver. */
function LineaRespaldo({ v }: { v: AplicarVariado }) {
  const r = v.respaldo;
  if (!r) return null;
  const cuando = r.fecha ? ` el ${formatWeekday(r.fecha, { largo: true })}, ${formatTime(r.fecha)}` : "";
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--text-secondary)]">
      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden />
      <span className="min-w-0 flex-1">
        Variado abierto en el lote{cuando}: salieron {fmtPiezas(r.salen)} {r.salen === 1 ? "fila" : "filas"} ({fmtPiezas(r.paquetes)} paq.) y entraron {fmtPiezas(r.entran)}.
      </span>
      <button
        type="button"
        onClick={() => void v.deshacer()}
        disabled={v.ocupado}
        className={`${BOTON} border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]`}
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden /> Deshacer
      </button>
    </p>
  );
}

export default function RepartoVariado({ des, paquetes, bloques, cfg }: {
  /** El desglose del lote; `null` = el lote ya no trae Variado. */
  des: ResultadoVariado | null;
  paquetes: number;
  bloques: readonly BloqueRolliza[];
  cfg: ConfigVariado;
}) {
  const v = useAplicarVariado(bloques, cfg);
  if (!des) {
    if (!v.respaldo) return null;
    return (
      <div className="mb-4 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 text-xs">
        <LineaRespaldo v={v} />
        {v.error && <p role="alert" className="mt-1.5 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{v.error}</p>}
      </div>
    );
  }
  const { ptOrigen, ptDesglose, toleranciaPt } = des.cuadre;
  const delta = ptDesglose - ptOrigen;
  const abiertos = des.grupos.reduce((a, g) => a + g.paquetes, 0);
  /* La cota del redondeo a centésimas de las filas abiertas (0,005 PT c/u). */
  const cuadra = des.grupos.length > 0 && Math.abs(delta) <= toleranciaPt + 1e-9;
  const porMotivo = (Object.keys(MOTIVO) as MotivoSinDesglosar[])
    .map((m) => ({ m, n: des.sinDesglosar.filter((s) => s.motivo === m).length }))
    .filter((x) => x.n > 0);

  return (
    <div className="mb-4 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Boxes className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{fmtPiezas(paquetes)} paq. 6×6 Variado</span>
        {des.pesos.length > 0 && (
          <span className="min-w-0 text-[var(--text-secondary)]">→ {pesosTxt(des.pesos)}</span>
        )}
        <span className="rounded-full border border-[var(--rule-base)] px-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">por proporción</span>
        <InfoTip
          title="Variado en la Distribución"
          what="Cada paquete 6×6 Variado se abre en las medidas que entran (2×2, 2×3, 2×4, 1×4, 1×3, 1×2 y poco de 1.5×3 y 3×3) hasta cerrar su sección, y las piezas se reparten entre especies."
          affects="La especie sale del volumen libre de cada permiso en los bloques: más volumen, más piezas de esa especie. Es un reparto calculado, no medido; así lo dice también el PDF y el Excel."
          example="Tornillo con 62 % del libre y Cumala con 38 %: de cada 100 piezas, ~62 van a Tornillo."
        />
        {des.grupos.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => void v.aplicar()}
              disabled={v.ocupado}
              className={`${BOTON} border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] hover:bg-[var(--accent-muted)]`}
            >
              <PackageOpen className="h-3.5 w-3.5" aria-hidden /> Aplicar el desglose al lote
            </button>
            <InfoTip
              title="Aplicar el desglose al lote"
              what="Cambia en el lote del cubicador cada fila Variado por las piezas de arriba (las iguales, juntas). Antes pide confirmación y guarda una copia del lote."
              affects="Mientras el lote diga «Variado», el cubicador no lo envía ni lo vincula al Libro: el Anexo 04 de ese despacho saldría «VARIADO 6×6». Con «Deshacer» vuelve como estaba."
              example="15 filas «Variado 6×6×10» salen y entran ~16 filas: Tornillo 2×4×10 ×40, Cumala 2×4×10 ×34…"
            />
          </span>
        )}
      </div>

      {des.grupos.length > 0 && (
        <p className={`mt-1.5 flex flex-wrap items-center gap-1.5 font-mono tabular-nums ${cuadra ? "text-[var(--text-secondary)]" : "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}>
          {cuadra ? <Check className="h-3.5 w-3.5 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
          <span className="font-sans">PT de {fmtPiezas(abiertos)} paq.</span> {pt2(ptOrigen)}
          <span className="font-sans">· abiertos</span> {pt2(ptDesglose)}
          <span className="font-sans">· diferencia</span> {delta > 0 ? "+" : ""}{pt2(delta)}
        </p>
      )}

      {v.respaldo && <div className="mt-1.5"><LineaRespaldo v={v} /></div>}
      {v.error && <p role="alert" className="mt-1.5 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{v.error}</p>}

      {porMotivo.length > 0 && (
        <p role="alert" className="mt-1.5 flex flex-wrap items-center gap-1.5 font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Sin abrir: {porMotivo.map(({ m, n }) => `${n} fila${n === 1 ? "" : "s"} ${MOTIVO[m]}`).join(" · ")} — quedan como Variado en «Falta por distribuir».
        </p>
      )}

      {des.grupos.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Ver cómo se abrió cada fila ({des.grupos.length})
          </summary>
          <ul className="mt-1.5 space-y-1">
            {des.grupos.map((g) => (
              <li key={g.origenId} className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5">
                <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{formatNumber(g.largo, { max: 2 })}′ · {fmtPiezas(g.paquetes)} paq.</span>
                {g.porEspecie.map((e) => (
                  <span key={e.especie} className="ml-2 inline-block text-[var(--text-secondary)]">
                    <b className="text-[var(--text-primary)]">{e.especie}:</b>{" "}
                    <span className="font-mono tabular-nums">{e.medidas.map((m) => `${medidaVariadoTxt(m)} ×${formatNumber(m.piezas, 0)}`).join(" · ")}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
