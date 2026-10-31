"use client";

/**
 * CtpGuiasEmitidasView — las guías que salieron del CTP (ADR-321).
 *
 * Hasta acá una GTF de salida sólo se podía ver desde su despacho: para
 * reimprimir había que acordarse de qué línea era. Esta vista responde las tres
 * preguntas que se hacen de verdad: *"¿qué guías emití este mes?"*, *"¿cuáles
 * quedaron a medio llenar?"* y *"¿dónde está la del camión que se fue ayer?"*.
 *
 * No guarda nada: cada fila ES un despacho con número de guía.
 *
 * Las guías se tildan para llevarlas a un trámite ya lleno (relación de guías,
 * anulación, pérdida, talonario), igual que en la vista GTF del Libro TH.
 */


import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Loader2 } from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { filtrarGuias, numerosRepetidos, type GuiaEmitida } from "@/lib/forestal/guias-emitidas";
import { Btn, TablaSkeleton, VistaHeader } from "./ctp-shared";
import CtpGuiasEmitidasLista from "./CtpGuiasEmitidasLista";
import CtpGuiasEmitidasBarra from "./CtpGuiasEmitidasBarra";
import { useSeleccionGuias } from "./hooks/use-seleccion-guias";
import { useGuiasEmitidasKpis } from "./hooks/use-guias-emitidas-kpis";
import { useGuiaSalidaBuscada } from "./hooks/use-guia-salida-buscada";
import AvisoRegistroAusente from "@/components/admin/shared/AvisoRegistroAusente";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { TextoDeAccion } from "@/components/admin/shared/libro-acciones-vista";
import { CLASE_ENCENDIDO_RIEL, useBuscarEnRiel } from "./ctp-riel-piezas";

export default function CtpGuiasEmitidasView({
  period,
  onAbrirDespacho,
}: {
  period: CtpPeriod;
  /** Lleva a la línea de despacho, que es donde se imprime y se completa. */
  onAbrirDespacho?: () => void;
}) {
  const [guias, setGuias] = useState<GuiaEmitida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [soloIncompletas, setSoloIncompletas] = useState(false);
  /**
   * Las tildadas, por id de despacho. Se cruzan con TODO lo cargado del
   * período, no con lo filtrado: buscar otra guía no destilda las anteriores
   * (una relación se arma buscando de a un N°). Con otro período, las que no
   * están en él dejan de contar.
   */
  const seleccion = useSeleccionGuias();
  const elegidas = useMemo(() => guias.filter((g) => seleccion.tiene(g.despachoId)), [guias, seleccion]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    const qs = new URLSearchParams();
    if (period.from) qs.set("desde", period.from);
    if (period.to) qs.set("hasta", period.to);
    fetch(`/api/admin/forestal/ctp/guias-emitidas?${qs}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudieron leer las guías (${r.status})`);
        return (await r.json()) as { guias: GuiaEmitida[] };
      })
      .then((j) => { if (vivo) setGuias(j.guias ?? []); })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [period.from, period.to]);

  /* ⌘K: `?gtfSalida=` ubica la guía (si es de otro período, trae sus líneas). */
  const sumarBuscada = useCallback((extra: GuiaEmitida[]) => setGuias((prev) => [...prev, ...extra]), []);
  const buscada = useGuiaSalidaBuscada(guias, cargando, sumarBuscada);
  useEffect(() => {
    if (!buscada.resaltada) return;
    setQ("");
    setSoloIncompletas(false);
  }, [buscada.resaltada]);

  const { kpis, delFiltro, resumen } = useGuiasEmitidasKpis(guias, period.label);
  const repetidos = useMemo(() => numerosRepetidos(guias), [guias]);
  const visibles = useMemo(() => {
    const base = soloIncompletas ? delFiltro.filter((g) => g.estado === "incompleta") : delFiltro;
    return filtrarGuias(base, q);
  }, [delFiltro, q, soloIncompletas]);

  /* En el libro, la búsqueda es una lupa en el riel de las pestañas y el campo
     se abre acá (Brandon, 2026-10-17: los botones al lado de las pestañas). */
  const buscar = useBuscarEnRiel({
    id: "ctp-guias-search",
    etiqueta: "Buscar guías",
    placeholder: "Buscar por N° de guía, destino, destinatario o placa…",
    valor: q,
    onCambiar: setQ,
    claseFuera: "flex-1",
  });

  return (
    <div className="space-y-3">
      {/*
        Los cuatro conteos de calidad SÓLO cuando hay guías.

        Con el período en cero decían «todas completas», «todas verificadas»,
        «todas con origen declarado»: cuatro tarjetas felicitando por un
        conjunto vacío. No es un cero neutro como el de un tramo de antigüedad
        —es una afirmación FALSA sobre documentos que se presentan ante SERFOR—
        y encima repetía lo que el estado vacío de abajo ya dice mejor
        («Todavía no se emitió ninguna guía»), con el botón para ir a Despacho.
      */}
      <VistaHeader
        titulo="Guías emitidas"
        meta={`${visibles.length} de ${guias.length}`}
        hint="Las GTF de salida del CTP. Cada fila es un despacho: para imprimir o completarla, ábrela desde Despachos."
      >
        {kpis.boton}
        {buscar.boton}
        <button
          type="button"
          aria-pressed={soloIncompletas}
          onClick={() => setSoloIncompletas((v) => !v)}
          title="Mostrar sólo las guías a medio llenar: no se pueden imprimir así"
          className={cn(
            button({ variant: "secondary", className: "shrink-0 rounded-xl" }),
            soloIncompletas && CLASE_ENCENDIDO_RIEL,
            resumen.incompletas > 0 ? "@max-[80rem]/riel:px-3" : "@max-[80rem]/riel:w-12 @max-[80rem]/riel:px-0",
          )}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <TextoDeAccion>Sólo las incompletas</TextoDeAccion>
          {resumen.incompletas > 0 && (
            <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-xs font-bold tabular-nums">
              {resumen.incompletas}
            </span>
          )}
        </button>
        {onAbrirDespacho && (
          <Btn size="sm" variant="secondary" onClick={onAbrirDespacho}>
            <FileText className="h-4 w-4" />
            Ir a Despacho
          </Btn>
        )}
      </VistaHeader>

      {kpis.panel}

      {buscada.noEncontrada && <AvisoRegistroAusente que="Esa GTF de salida" />}

      {repetidos.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 text-sm font-medium text-[var(--data-warning-700)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Número repetido en más de un despacho vigente: {repetidos.join(", ")}. Puede ser una guía que ampara varias
          líneas, o un error de tipeo — conviene revisarlo antes de que lo haga un control.
        </p>
      )}

      {buscar.campo}

      {error && (
        <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-sunken)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {cargando ? (
        <TablaSkeleton />
      ) : visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
          {guias.length === 0
            ? "Todavía no se emitió ninguna guía de salida en el período."
            : "Ninguna guía coincide con el filtro."}
        </p>
      ) : (
        <CtpGuiasEmitidasLista guias={visibles} todas={guias} sel={seleccion} resaltada={buscada.resaltada} />
      )}

      {cargando && guias.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Actualizando…
        </p>
      )}

      <CtpGuiasEmitidasBarra elegidas={elegidas} onLimpiar={seleccion.limpiar} />
    </div>
  );
}
