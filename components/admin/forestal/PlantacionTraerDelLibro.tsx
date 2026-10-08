"use client";

/**
 * «Traer lo del Libro TH» — en el trámite de ACTUALIZACIÓN del registro de
 * plantación, la producción por especie sale del libro en vez de tipearse
 * (ADR-459, ronda 3).
 *
 * Se elige la plantación del libro (la propone el código del trámite), se ve
 * qué haría con cada especie y un botón lo aplica. Nunca pisa lo escrito: lo
 * dice especie por especie. Las especies que el libro tiene y el trámite no se
 * agregan con un clic. Las reglas viven en `lib/forestal/plantacion-libro.ts`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { usePlantacionLibro } from "@/hooks/use-plantacion-libro";
import { formatNumber } from "@/lib/format";
import {
  agregarDelLibro,
  aplicarLlenado,
  etiquetaPlanDelLibro,
  planDeLlenado,
  sugerirPlanDelTramite,
  type EspecieDelLibro,
  type SugerenciaPlan,
} from "@/lib/forestal/plantacion-libro";
import type { BloqueInput } from "@/lib/forestal/plantacion-tramite";
import { Btn, I } from "./ctp-shared";
import PlantacionLibroFila from "./PlantacionLibroFila";

const AVISO = "flex items-start gap-2 rounded-xl border-l-4 p-3 text-sm";
const AVISO_ERROR = `${AVISO} border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]`;

function textoSugerencia(s: SugerenciaPlan, codigo: string | null, elegido: string | null): string {
  if (elegido && s.planId && elegido !== s.planId) {
    return s.motivo === "codigo" ? "Elegiste otra plantación que la del código del trámite." : "Elegiste esta plantación.";
  }
  if (s.motivo === "codigo") return "Coincide con el código de plantación del trámite.";
  if (s.motivo === "unica") return "Es la única plantación del libro.";
  if (s.motivo === "ambigua") return "Hay más de una plantación con este código: elige cuál.";
  return codigo?.trim()
    ? `Ninguna plantación del libro tiene el código «${codigo.trim()}»: elige cuál.`
    : "Escribe arriba el código de plantación y se elige sola.";
}

export default function PlantacionTraerDelLibro({
  bloques,
  codigo,
  onChange,
}: {
  bloques: BloqueInput[];
  codigo: string | null;
  onChange: (bloques: BloqueInput[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [bloqueDestino, setBloqueDestino] = useState(0);
  const [hecho, setHecho] = useState<string | null>(null);
  const libro = usePlantacionLibro(abierto);
  /** La persona eligió en la lista: desde ahí manda ella, el código ya no cambia la plantación. */
  const tocado = useRef(false);

  const sugerencia = useMemo(() => sugerirPlanDelTramite(codigo, libro.planes), [codigo, libro.planes]);
  const { elegir, planId } = libro;

  /* Mientras nadie eligió, se toma la sugerida —también si el código se escribe
     con el panel abierto—. Nunca cambia una elección hecha. */
  useEffect(() => {
    if (libro.estadoPlanes !== "listo" || tocado.current || planId || !sugerencia.planId) return;
    void elegir(sugerencia.planId);
  }, [libro.estadoPlanes, sugerencia.planId, planId, elegir]);

  const plan = useMemo(() => planDeLlenado(bloques, libro.especies ?? []), [bloques, libro.especies]);
  const faltan = plan.destinos.filter((d) => d.destino.tipo === "falta").map((d) => d.especie);
  const destino = bloqueDestino < bloques.length ? bloqueDestino : 0;

  function completar() {
    const completadas = plan.destinos.flatMap(({ especie, destino: d }) =>
      d.tipo === "completar" ? [`${especie.comun} ${formatNumber(d.m3, 3)} m³ (bloque ${d.bloque})`] : [],
    );
    onChange(aplicarLlenado(bloques, libro.especies ?? []));
    const respetadas = plan.destinos.filter(({ destino: d }) => d.tipo === "ya_tiene" || d.tipo === "otra_unidad").length;
    setHecho(
      `Completé la producción de ${completadas.join(", ")}.` +
        (respetadas > 0 ? ` No cambié ${respetadas === 1 ? "una especie que ya tenía dato" : `${respetadas} especies que ya tenían dato`}.` : ""),
    );
  }

  function agregar(especies: EspecieDelLibro[]) {
    if (especies.length === 0) return;
    onChange(agregarDelLibro(bloques, especies, destino));
    const n = bloques.length === 0 ? 1 : (bloques[destino]?.numero ?? destino + 1);
    setHecho(
      `Agregué ${especies.map((e) => e.comun).join(", ")} al bloque ${n}` +
        (especies.some((e) => e.taladoM3 > 0) ? ", con lo talado como producción" : "") +
        ". Completa el mes de instalación.",
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" data-traer-del-libro>
      {/* Con «Traer…» a 400 px el botón baja a su fila: partido, el título se leía en tres renglones. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5">
            <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Producción del Libro TH</CardTitle>
            <InfoTip
              title="Producción del Libro TH"
              what="La producción de cada especie es lo TALADO en el Libro TH: la madera rolliza que dio tu plantación, en m³. Se llena sin tipearla."
              affects="Lo despachado con guía es una parte de lo talado (lo que ya salió) y se muestra al lado. Lo que ya escribiste no se cambia."
              example="Bolaina con 2,553 m³ talados → Producción: 2,553 m³."
            />
          </span>
        </div>
        {abierto ? (
          <Btn size="sm" variant="ghost" className="shrink-0" onClick={() => setAbierto(false)}>Cerrar</Btn>
        ) : (
          <Btn variant="primary" className="shrink-0" onClick={() => setAbierto(true)}>
            <BookOpen className="h-4 w-4" aria-hidden="true" /> Traer lo del Libro TH
          </Btn>
        )}
      </header>

      {abierto && (
        <div className="space-y-3 border-t border-[var(--rule-base)] px-4 py-3">
          {libro.estadoPlanes === "cargando" || libro.estadoPlanes === "idle" ? (
            <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Buscando las plantaciones del libro…
            </p>
          ) : libro.estadoPlanes === "error" ? (
            <div className={AVISO_ERROR} role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{libro.errorPlanes}</span>
              <Btn size="sm" onClick={() => void libro.cargarPlanes()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
              </Btn>
            </div>
          ) : libro.planes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-4 text-sm text-[var(--text-secondary)]">
              El Libro TH no tiene plantaciones. Créala en Libro TH → Plan de manejo → Nuevo → Plantación, con sus especies y m³ registrados.
            </p>
          ) : (
            <>
              <div className="max-w-[36rem]">
                <label htmlFor="traer-libro-plan" className="mb-1 block text-sm font-semibold text-[var(--text-secondary)]">
                  Plantación del Libro TH
                </label>
                <select
                  id="traer-libro-plan"
                  className={I}
                  value={planId ?? ""}
                  onChange={(e) => {
                    tocado.current = true;
                    setHecho(null);
                    void elegir(e.target.value || null);
                  }}
                >
                  <option value="">Elige la plantación…</option>
                  {libro.planes.map((p) => (
                    <option key={p.id} value={p.id}>{etiquetaPlanDelLibro(p)}</option>
                  ))}
                </select>
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">{textoSugerencia(sugerencia, codigo, planId)}</p>
              </div>

              {libro.estadoDetalle === "cargando" && (
                <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Leyendo lo talado…
                </p>
              )}
              {libro.estadoDetalle === "error" && (
                <div className={AVISO_ERROR} role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{libro.errorDetalle}</span>
                  <Btn size="sm" onClick={() => void elegir(planId)}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
                  </Btn>
                </div>
              )}
              {libro.estadoDetalle === "listo" &&
                (plan.destinos.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">Esta plantación no tiene especies registradas ni talas en el libro.</p>
                ) : (
                  <>
                    <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]" aria-label="Especies del Libro TH">
                      {plan.destinos.map(({ especie, destino: d }) => (
                        <PlantacionLibroFila key={`${especie.registrada}-${especie.comun}`} especie={especie} destino={d} onAgregar={() => agregar([especie])} />
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-2">
                      <Btn variant="primary" disabled={plan.aCompletar === 0} onClick={completar}>
                        Completar la producción{plan.aCompletar > 0 ? ` (${plan.aCompletar})` : ""}
                      </Btn>
                      {faltan.length > 1 && (
                        <Btn onClick={() => agregar(faltan)}>Agregar las {faltan.length} que faltan</Btn>
                      )}
                      {faltan.length > 0 && bloques.length > 1 && (
                        <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                          <span aria-hidden="true">Agregar al</span>
                          <select
                            aria-label="Bloque al que se agregan las especies"
                            className={`${I} w-auto`}
                            value={destino}
                            onChange={(e) => setBloqueDestino(Number(e.target.value))}
                          >
                            {bloques.map((b, i) => (
                              <option key={i} value={i}>Bloque {b.numero || i + 1}</option>
                            ))}
                          </select>
                        </span>
                      )}
                    </div>
                  </>
                ))}
              <p aria-live="polite" className={hecho ? "rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-semibold text-[var(--text-primary)]" : "sr-only"}>
                {hecho}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
