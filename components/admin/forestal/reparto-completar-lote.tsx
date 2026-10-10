"use client";

/**
 * «Completar el lote» desde la Distribución de rolliza (ADR-464, fase 4).
 *
 * El lote del bloque ya declaró producción y la distribución le da más de lo
 * que se escribió. Brandon (2026-10-03): las dos líneas, eligiendo.
 *  · **LPC** — complemento de la línea principal, bajo el tope del 56 %. Con
 *    rolliza libre en el lote es una corrida nueva; sin ella se suma a una
 *    corrida del lote con margen (una corrida sin materia prima no tiene tope
 *    que medir).
 *  · **LRE** — recuperación: abre el MISMO reproceso del Libro desde la corrida
 *    del lote, con lo elegido como sugerencia.
 */

import { useMemo, useState } from "react";
import { BookOpen, Loader2, RefreshCw } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import type { AsignacionGrupo } from "@/lib/forestal/cubicacion-reparto";
import {
  fechaCorta,
  motivoLpc,
  sumaDeLineas,
  type CorridaDelLoteParaCompletar,
  type PlanCompletar,
} from "@/lib/forestal/jornadas-de-bloque";
import { RENDIMIENTO_TOPE_PCT } from "@/lib/forestal/produccion-paquetes";

const BTN = "inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50";
const BTN_PRIMARIO = "inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50";
const CAMPO = "h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

type Linea = "LPC" | "LRE";

export default function RepartoCompletarLote({
  etiqueta,
  plan,
  hoy,
  ocupado,
  onLpc,
  onLre,
  onCerrar,
}: {
  etiqueta: string;
  plan: PlanCompletar;
  hoy: string;
  ocupado: boolean;
  onLpc: (elegidas: AsignacionGrupo[], destino: { corridaId: string | null; fecha: string }) => Promise<boolean>;
  onLre: (origen: CorridaDelLoteParaCompletar, elegidas: AsignacionGrupo[]) => void;
  onCerrar: () => void;
}) {
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(plan.lineas.map((g) => g.clave)));
  const [linea, setLinea] = useState<Linea>("LPC");
  const conMargen = plan.corridas.filter((c) => c.margen);
  const conSaldo = plan.corridas.filter((c) => c.disponibleM3 > 0);
  const [corridaLpc, setCorridaLpc] = useState<string>(conMargen[0]?.id ?? "");
  const [corridaLre, setCorridaLre] = useState<string>(conSaldo[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoy);

  const lista = useMemo(() => plan.lineas.filter((g) => elegidas.has(g.clave)), [plan.lineas, elegidas]);
  const suma = sumaDeLineas(lista);
  const nueva = plan.trozasLibres.length > 0;
  const origenLre = conSaldo.find((c) => c.id === corridaLre) ?? null;
  const motivo =
    linea === "LPC"
      ? motivoLpc(plan, lista, { corridaId: corridaLpc || null, fecha, hoy })
      : lista.length === 0
        ? "Elige al menos una línea de lo que falta."
        : !origenLre
          ? "El lote no tiene producto en planta para reprocesar."
          : null;

  const alternar = (clave: string) =>
    setElegidas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });

  const confirmar = async () => {
    if (motivo || ocupado) return;
    if (linea === "LRE" && origenLre) {
      onLre(origenLre, lista);
      return;
    }
    const ok = await onLpc(lista, { corridaId: nueva ? null : corridaLpc, fecha });
    if (ok) onCerrar();
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      icon={BookOpen}
      title={`Completar el lote ${plan.loteCode}`}
      description={`Bloque ${etiqueta}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {motivo && <span className="mr-auto text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{motivo}</span>}
          <button type="button" onClick={onCerrar} className={BTN}>Cancelar</button>
          <button type="button" onClick={() => void confirmar()} disabled={Boolean(motivo) || ocupado} className={BTN_PRIMARIO}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : linea === "LRE" ? <RefreshCw className="h-4 w-4" aria-hidden /> : <BookOpen className="h-4 w-4" aria-hidden />}
            {ocupado ? "Escribiendo…" : linea === "LRE" ? "Abrir el reproceso" : nueva ? "Declarar corrida LPC" : "Sumar a su corrida (queda en su línea)"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4 sm:px-6">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
          <span>declaró <b className="text-[var(--text-primary)]">{fmtM3(plan.declaradoM3)} m³</b></span>
          <span>de <b className="text-[var(--text-primary)]">{fmtM3(plan.consumidoM3)} m³</b> de rolliza</span>
          <span>margen del lote <b className="text-[var(--accent-ink)] dark:text-[var(--accent)]">{fmtM3(plan.margenLoteM3)} m³</b></span>
          <InfoTip
            title="Margen hasta el tope"
            what={`Lo que el lote todavía puede declarar sin pasar el ${RENDIMIENTO_TOPE_PCT} % de la rolliza que entró a la sierra. Es un derivado: tope menos lo declarado.`}
            affects="El servidor lo vuelve a medir al escribir: si se pasa, no entra."
            example="10 m³ de rolliza → tope 5,6 m³; declaró 4,8 → margen 0,8 m³."
          />
        </p>

        <fieldset>
          <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Lo que falta declarar</legend>
          {plan.lineas.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">La distribución no le da nada más a este bloque.</p>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
              {plan.lineas.map((g) => (
                <li key={g.clave}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                    <input type="checkbox" checked={elegidas.has(g.clave)} onChange={() => alternar(g.clave)} className="h-4 w-4 accent-[var(--accent)]" />
                    <span className="flex-1 font-semibold text-[var(--text-primary)]">{g.label}</span>
                    <span className="font-mono tabular-nums text-[var(--text-secondary)]">{fmtPiezas(g.piezas)} pzas · {fmtM3(g.m3)} m³</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            Elegiste <b className="text-[var(--text-primary)]">{fmtPiezas(suma.piezas)} pzas · {fmtM3(suma.m3)} m³</b>
          </p>
        </fieldset>

        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">¿Por qué línea?</legend>
          <OpcionLinea activa={linea === "LPC"} onElegir={() => setLinea("LPC")} titulo="LPC · Complemento" detalle={`Más producción de la misma rolliza, sin pasar el ${RENDIMIENTO_TOPE_PCT} %.`} />
          <OpcionLinea activa={linea === "LRE"} onElegir={() => setLinea("LRE")} titulo="LRE · Recuperación" detalle="Reprocesar lo que el lote ya produjo en lo que falta." />
        </fieldset>

        {linea === "LPC" && (nueva ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <p className="text-sm text-[var(--text-secondary)]">
              Corrida nueva del lote con <b>{plan.trozasLibres.length} troza{plan.trozasLibres.length === 1 ? "" : "s"} libre{plan.trozasLibres.length === 1 ? "" : "s"}</b>{" "}
              ({fmtM3(plan.rollizaLibreM3)} m³): admite hasta <b>{fmtM3(plan.topeCorridaNuevaM3)} m³</b>.
            </p>
            <label className="text-xs font-bold text-[var(--text-tertiary)]">
              Fecha
              <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={`${CAMPO} mt-1 sm:w-44`} />
            </label>
          </div>
        ) : (
          <div className="block text-xs font-bold text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-1">
              <label htmlFor="reparto-corrida-lpc">Se suma a la corrida</label>
              <InfoTip
                title="Sin rolliza nueva"
                what="Todas las trozas del lote ya entraron a la sierra: una corrida nueva no tendría materia prima y el tope no se podría medir."
                affects="Lo que falta entra como filas nuevas de esa corrida (no la reescribe), con el tope medido sobre su total. Quedan en la línea de esa corrida (la LP de su jornada), no como LPC: el Libro guarda una línea por corrida."
              />
            </span>
            <select id="reparto-corrida-lpc" value={corridaLpc} onChange={(e) => setCorridaLpc(e.target.value)} className={`${CAMPO} mt-1`}>
              {conMargen.length === 0 && <option value="">Ninguna corrida del lote tiene margen</option>}
              {conMargen.map((c) => (
                <option key={c.id} value={c.id}>N° {c.lineNo} · {fechaCorta(c.fecha)} · {c.producto ?? "—"} · margen {fmtM3(c.margen!.margenM3)} m³</option>
              ))}
            </select>
          </div>
        ))}

        {linea === "LRE" && (
          <label className="block text-xs font-bold text-[var(--text-tertiary)]">
            Sale de la corrida
            <select value={corridaLre} onChange={(e) => setCorridaLre(e.target.value)} className={`${CAMPO} mt-1`}>
              {conSaldo.length === 0 && <option value="">Ninguna corrida del lote tiene producto en planta</option>}
              {conSaldo.map((c) => (
                <option key={c.id} value={c.id}>N° {c.lineNo} · {fechaCorta(c.fecha)} · {c.producto ?? "—"} · en planta {fmtM3(c.disponibleM3)} m³</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </AdminModal>
  );
}

function OpcionLinea({ activa, onElegir, titulo, detalle }: { activa: boolean; onElegir: () => void; titulo: string; detalle: string }) {
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={activa}
      className={`rounded-xl border-2 px-3 py-2 text-left transition-colors ${activa ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)] hover:border-[var(--accent)]"}`}
    >
      <span className="block text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
      <span className="block text-xs text-[var(--text-secondary)]">{detalle}</span>
    </button>
  );
}
