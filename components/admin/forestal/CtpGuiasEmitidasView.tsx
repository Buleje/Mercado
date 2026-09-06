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
 */

import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@buleje/design-system";
import { AlertTriangle, Check, FileText, Loader2, Search } from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import {
  filtrarGuias,
  numerosRepetidos,
  resumirGuias,
  type EstadoGuia,
  type GuiaEmitida,
} from "@/lib/forestal/guias-emitidas";
import { Btn, I, TablaSkeleton, VistaHeader } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });

const ESTADO_CLASE: Record<EstadoGuia, string> = {
  completa: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  incompleta: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  anulada: "text-[var(--text-tertiary)] line-through",
};

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

  const resumen = useMemo(() => resumirGuias(guias), [guias]);
  const repetidos = useMemo(() => numerosRepetidos(guias), [guias]);
  const visibles = useMemo(() => {
    const base = soloIncompletas ? guias.filter((g) => g.estado === "incompleta") : guias;
    return filtrarGuias(base, q);
  }, [guias, q, soloIncompletas]);

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
      <div className={`grid grid-cols-2 gap-3 ${resumen.total > 0 ? "lg:grid-cols-5" : ""}`}>
        <StatCard density="compact" label="Guías emitidas" value={String(resumen.total)} subValue={period.label} icon={FileText} emphasis="neutral" />
        {resumen.total > 0 && (
          <>
        <StatCard
          density="compact"
          label="Listas para imprimir"
          value={String(resumen.completas)}
          subValue={resumen.completas === resumen.total - resumen.anuladas ? "todas completas" : "con todos sus datos"}
          icon={Check}
          emphasis="success"
        />
        <StatCard
          density="compact"
          label="A medio llenar"
          value={String(resumen.incompletas)}
          subValue={resumen.incompletas > 0 ? "no se pueden imprimir así" : "ninguna pendiente"}
          icon={AlertTriangle}
          emphasis={resumen.incompletas > 0 ? "warning" : "neutral"}
        />
        <StatCard
          density="compact"
          label="Sin verificar en SERFOR"
          value={String(resumen.sinVerificar)}
          subValue={resumen.sinVerificar > 0 ? "lo primero que mira un control" : "todas verificadas"}
          icon={AlertTriangle}
          emphasis={resumen.sinVerificar > 0 ? "warning" : "success"}
        />
        <StatCard
          density="compact"
          label="Amparan madera sin origen"
          value={String(resumen.sinOrigen)}
          subValue={resumen.sinOrigen > 0 ? "el documento ya salió" : "todas con origen declarado"}
          icon={AlertTriangle}
          emphasis={resumen.sinOrigen > 0 ? "warning" : "success"}
        />
          </>
        )}
      </div>

      <VistaHeader
        titulo="Guías emitidas"
        meta={`${visibles.length} de ${guias.length}`}
        hint="Las GTF de salida del CTP. Cada fila es un despacho: para imprimir o completar, se abre desde Despacho."
      >
        {onAbrirDespacho && (
          <Btn size="sm" variant="secondary" onClick={onAbrirDespacho}>
            <FileText className="h-4 w-4" />
            Ir a Despacho
          </Btn>
        )}
      </VistaHeader>

      {repetidos.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-2.5 text-sm font-medium text-[var(--data-warning-700)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Número repetido en más de un despacho vigente: {repetidos.join(", ")}. Puede ser una guía que ampara varias
          líneas, o un error de tipeo — conviene revisarlo antes de que lo haga un control.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="search"
            className={`${I} pl-9`}
            placeholder="Buscar por N° de guía, destino, destinatario o placa…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Btn
          size="md"
          variant={soloIncompletas ? "dark" : "secondary"}
          aria-pressed={soloIncompletas}
          onClick={() => setSoloIncompletas((v) => !v)}
        >
          <AlertTriangle className="h-4 w-4" />
          Sólo las incompletas
        </Btn>
      </div>

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
        <ul className="space-y-1.5">
          {visibles.map((g) => (
            <li
              key={g.despachoId}
              className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5"
            >
              <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                {fecha(g.fecha)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`font-mono text-sm font-bold ${ESTADO_CLASE[g.estado]}`}>{g.gtfNumber}</span>
                  <span className="truncate text-sm text-[var(--text-secondary)]">
                    {g.destinatario ?? g.destino ?? "sin destinatario"}
                  </span>
                  {g.placa && <span className="font-mono text-xs text-[var(--text-tertiary)]">{g.placa}</span>}
                </div>
                <span className="block truncate text-xs text-[var(--text-tertiary)]">
                  {[
                    g.lineNo != null ? `línea #${g.lineNo}` : null,
                    g.producto,
                    g.especie,
                    g.cantidad != null ? `${g.cantidad} ${g.unidad ?? ""}`.trim() : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <span className={`shrink-0 text-sm font-bold ${ESTADO_CLASE[g.estado]}`}>
                {g.estado === "anulada"
                  ? "anulada"
                  : g.estado === "completa"
                    ? "lista"
                    : `faltan ${g.faltan}`}
              </span>
              {g.estado !== "anulada" && !g.verificada && (
                <span
                  className="shrink-0 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-bold text-[var(--text-tertiary)]"
                  title="No se verificó contra el SNIFFS de SERFOR"
                >
                  sin verificar
                </span>
              )}
              {/* Distinto de «faltan N», que cuenta CAMPOS del documento: una
                  guía puede estar impecable y amparar madera cuyo origen todavía
                  no se declaró. Ese documento ya salió a la calle. */}
              {g.sinOrigen > 0.001 && (
                <span
                  className="shrink-0 rounded bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                  title="Esta guía ampara madera sin corrida de producción atribuida. Completá el origen desde Despacho ▸ cadena de custodia."
                >
                  {g.unidad === "m3" ? fmtM3(g.sinOrigen) : g.sinOrigen.toFixed(4)} {g.unidad ?? ""} sin origen
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {cargando && guias.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Actualizando…
        </p>
      )}
    </div>
  );
}
