"use client";

/**
 * «Por imprimir» — la cola del monte en el Libro TH (16-10,
 * `?tab=loth-libro-operaciones&vista=monte`). La abre el celular del
 * campamento desde el enlace del WhatsApp: arriba lo que falta imprimir, luego
 * lo impreso por confirmar y lo observado; lo terminado, plegado al final.
 * Arriba, «Cargas medidas» (F3): medir una carga por foto y guardarla para la oficina.
 * `&trabajo=<id>` (el enlace del WhatsApp) lleva a esa guía y la resalta.
 */

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "@buleje/design-system/icons";
import { esVivo } from "@/lib/forestal/gtf-cola-monte";
import { PERFIL_MONTE_ID } from "@/lib/forestal/gtf-matricial-perfiles";
import type { EstadoTrabajo, TrabajoImpresion } from "@/lib/forestal/gtf-salida-tipos";
import { Btn, PanelSkeleton, VistaHeader } from "./ctp-shared";
import { useColaMonte } from "./hooks/use-cola-monte";
import TarjetaTrabajoMonte from "./gtf-cola-monte-tarjeta";
import { PastillaEstadoMonte, cuandoLima, srcFotoHoja } from "./gtf-cola-monte-ui";
import { AvisoImpresionDirecta, BotonProbarImpresora, QueNecesitasEnElMonte } from "./gtf-impresion-directa";
import { useImprimirDirecto } from "./hooks/use-imprimir-directo";
import LothMedirCargaMonte from "./LothMedirCargaMonte";

/** Primero lo que hay que imprimir, después lo que hay que confirmar, después lo observado. */
const ORDEN: Partial<Record<EstadoTrabajo, number>> = { pendiente: 0, impresa: 1, observada: 2 };
const porOrden = (a: TrabajoImpresion, b: TrabajoImpresion) =>
  (ORDEN[a.estado] ?? 9) - (ORDEN[b.estado] ?? 9) || a.creadoEn.localeCompare(b.creadoEn);

const TERMINADAS_A_LA_VISTA = 30;

export default function LothColaMonte() {
  const { datos, cargando, error, recargar, cambiar } = useColaMonte();
  const [foco, setFoco] = useState<string | null>(null);
  const prueba = useImprimirDirecto();
  const trabajos = datos?.trabajos;
  const vivos = useMemo(() => (trabajos ?? []).filter(esVivo).sort(porOrden), [trabajos]);
  const terminadas = useMemo(
    () => (trabajos ?? []).filter((t) => !esVivo(t)).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).slice(0, TERMINADAS_A_LA_VISTA),
    [trabajos],
  );

  useEffect(() => setFoco(new URLSearchParams(window.location.search).get("trabajo")), []);
  const hayDatos = datos !== null;
  useEffect(() => {
    if (!foco || !hayDatos) return;
    document.getElementById(`trabajo-${foco}`)?.scrollIntoView({ block: "center" });
  }, [foco, hayDatos]);

  const porImprimir = vivos.filter((t) => t.estado === "pendiente").length;
  /* Sólo lo que no es cero: a 400 px la cifra entra en la fila del título. */
  const meta = [porImprimir && `${porImprimir} por imprimir`, vivos.length - porImprimir && `${vivos.length - porImprimir} por confirmar`].filter(Boolean).join(" · ") || "Al día";
  return (
    <div className="mx-auto max-w-2xl space-y-4" data-qa="cola-monte">
      <VistaHeader
        titulo="Por imprimir"
        meta={datos ? meta : undefined}
        hint="Las guías que la oficina manda al monte (⋯ › Enviar al monte en la tabla GTF). Imprímela en la hoja que dice, toca «Ya la imprimí» y sube la foto con el N° de la hoja: si no coincide, la oficina lo ve."
      >
        <QueNecesitasEnElMonte />
        {/* La prueba usa la hoja del titular y la impresora del primer envío; sin envío vivo, «Monte». Sin guías, no hay hoja. */}
        <BotonProbarImpresora gtfId={vivos[0]?.gtfId ?? trabajos?.[0]?.gtfId ?? null} perfilId={vivos[0]?.perfilId ?? PERFIL_MONTE_ID} d={prueba} />
        <Btn variant="secondary" onClick={() => void recargar()} disabled={cargando} aria-label="Volver a leer la cola" title="Volver a leer la cola">
          <RefreshCw className={cargando ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden /> <span className="max-sm:sr-only">Actualizar</span>
        </Btn>
      </VistaHeader>
      <AvisoImpresionDirecta d={prueba} />
      <LothMedirCargaMonte />

      {error && (
        <p role="alert" className="rounded-xl bg-[var(--data-error-50)] px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
      {!datos && cargando && <PanelSkeleton kpis={1} />}
      {datos && vivos.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-base text-[var(--text-secondary)]" data-qa="cola-vacia">
          No hay guías por imprimir.
        </p>
      )}

      <div className="space-y-4">
        {vivos.map((t) => (
          <TarjetaTrabajoMonte key={t.id} t={t} cambiar={cambiar} resaltado={t.id === foco} />
        ))}
      </div>

      {terminadas.length > 0 && (
        <details className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" data-qa="terminadas-monte">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-bold text-[var(--text-primary)]">
            Terminadas ({terminadas.length})
          </summary>
          <ul className="divide-y divide-[var(--rule-soft)] px-4 pb-2">
            {terminadas.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="font-mono font-bold text-[var(--text-primary)]">{t.numeroGuia}</span>
                <PastillaEstadoMonte estado={t.estado} conFoto={!!t.fotoDocId} />
                {t.numeroHoja && <span className="font-mono text-[var(--text-secondary)]">hoja {t.numeroHoja}</span>}
                <span className="ml-auto text-xs text-[var(--text-tertiary)]">{cuandoLima(t.revisadaEn ?? t.creadoEn)}</span>
                {t.fotoDocId && (
                  <a href={srcFotoHoja(t.numeroGuia, t.fotoDocId)} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]">
                    Foto
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
