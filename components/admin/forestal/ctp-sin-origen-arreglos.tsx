"use client";

/**
 * «¿De qué trozas salió?» (ADR-447): una línea por arreglo, con lo que frena a
 * sus corridas, el botón que abre el modal que YA existe y lo que deja hecho
 * según el servidor («deja 11 para vincular»). Las decisiones del dueño se
 * abren en la misma línea con sus dos caminos; nada se aplica solo.
 *
 * Las líneas salen de `lineasDeArreglo` (puro, testeado); los modales, de
 * `CtpSinOrigenModales`; lo que leen antes de abrirse, de `useAbrirArreglo`.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Clock, Link2, Loader2, Scale, Wrench, type LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { SimulacionDeArreglos } from "@/lib/forestal/origen-en-tanda";
import type { DiagnosticoSinOrigen } from "@/lib/forestal/vincular-trozas";
import { PASTILLA } from "./CtpGuiaSinRegistrar";
import CtpSinOrigenModales, { lineaDeCorrida } from "./CtpSinOrigenModales";
import { Btn, type CtpIngresosFiltroRapido } from "./ctp-shared";
import DecisionDeLinea from "./ctp-sin-origen-decision";
import { ddmm, ptDe } from "./ctp-sin-origen-comun";
import { lineasDeArreglo, type LineaDeArreglo } from "./ctp-sin-origen-lineas";
import { useAbrirArreglo } from "./hooks/use-abrir-arreglo";

const LINK =
  "inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] underline underline-offset-2 hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]";

function iconoDe(l: LineaDeArreglo): LucideIcon {
  if (l.accion.tipo === "vincular") return Link2;
  if (l.decision) return Scale;
  return l.boton ? Wrench : Clock;
}

export default function ArreglosSinOrigen({
  datos,
  simulacion,
  firma,
  puedeEditar,
  onVincular,
  onIr,
  onCambio,
}: {
  datos: DiagnosticoSinOrigen;
  /** Lo que deja cada arreglo (`GET ?tanda=1`); sin él, las líneas no dicen cuánto dejan. */
  simulacion: SimulacionDeArreglos | null;
  /** Vincula el dueño o un administrador. */
  firma: boolean;
  /** El rol corrige corridas (el editor ADR-401). */
  puedeEditar: boolean;
  onVincular: () => void;
  onIr?: (vista: string, filtro?: CtpIngresosFiltroRapido) => void;
  onCambio: (mensaje: string) => void;
}) {
  const lineas = useMemo(() => lineasDeArreglo(datos, simulacion), [datos, simulacion]);
  const especies = useMemo(
    () =>
      [
        ...new Set(
          datos.corridas.flatMap((c) => [
            c.especie,
            ...(c.arreglo.tipo === "corregir_corrida" && c.arreglo.campo === "especie" && c.arreglo.propuesta ? [c.arreglo.propuesta] : []),
          ]),
        ),
      ].sort((a, b) => a.localeCompare(b, "es-PE")),
    [datos],
  );
  const arreglo = useAbrirArreglo();
  const [ver, setVer] = useState<ReadonlySet<string>>(new Set());
  const [decidiendo, setDecidiendo] = useState<ReadonlySet<string>>(new Set());
  const alternar = (set: ReadonlySet<string>, k: string) => {
    const s = new Set(set);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    return s;
  };

  /** El botón de la línea, o `null` si con este rol o esta pantalla no hay nada que apretar. */
  const accion = (l: LineaDeArreglo): (() => void) | null => {
    const a = l.accion;
    switch (a.tipo) {
      case "vincular":
        return firma ? onVincular : null;
      case "corregir_llegada":
        return () => void arreglo.corregirLlegada(l.clave, a.guias.map((g) => g.gtfNumber));
      case "recibir_guia":
        return () => void arreglo.recibirGuia(l.clave, a.guias.map((g) => g.gtfNumber));
      case "acomodar_trozas":
        return () =>
          arreglo.abrirYa({
            tipo: "acomodar_trozas",
            woodEntryIds: a.woodEntryIds,
            descripcion: a.guias.length === 1 ? `Guía ${a.guias[0]}` : `Las ${a.guias.length} guías de estas corridas`,
          });
      case "declarar_apertura":
        return () => arreglo.abrirYa({ tipo: "declarar_apertura", corridas: l.corridas });
      case "ir_a_ingresos":
        return onIr ? () => onIr("ingresos", a.pendiente ? "pendiente" : undefined) : null;
      case "soltar_corrida":
      case "corregir_permiso":
      case "corregir_especie":
        return () => setDecidiendo((s) => alternar(s, l.clave));
      case "ninguna":
        return null;
    }
  };

  return (
    <>
      <ul className="space-y-2">
        {lineas.map((l) => {
          const Icono = iconoDe(l);
          const hacer = l.boton ? accion(l) : null;
          const abierta = decidiendo.has(l.clave);
          const leyendo = arreglo.abriendo === l.clave;
          const e = arreglo.error;
          const error = e && (e.clave === l.clave || e.clave.startsWith(`${l.clave}:`)) ? e.texto : null;
          const guias = l.accion.tipo === "corregir_llegada" || l.accion.tipo === "recibir_guia" ? l.accion.guias : [];
          return (
            <li
              key={l.clave}
              className={`rounded-xl border ${l.decision ? "border-[var(--data-warning-500)]/40" : "border-[var(--rule-base)]"} bg-[var(--surface-raised)] px-3 py-2`}
            >
              <div className="grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="flex items-start gap-2">
                    <Icono aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                    <span className="min-w-0 font-bold text-[var(--text-primary)]">{l.texto}</span>
                    <InfoTip title={l.texto} what={l.ayuda} />
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs tabular-nums text-[var(--text-tertiary)]">
                    <span>
                      <b className="font-semibold text-[var(--text-secondary)]">{fmtPt(ptDe(l.m3))} pt</b> · {fmtM3(l.m3)} m³
                    </span>
                    {l.deja && (
                      <span className="rounded-full border border-[var(--accent)]/40 px-2 py-0.5 font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                        {l.deja}
                      </span>
                    )}
                    {l.decision && <span className={`rounded-full border px-2 py-0.5 font-bold ${PASTILLA.aviso}`}>Decides tú</span>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-1 gap-y-1 max-sm:pl-6">
                  {l.accion.tipo !== "vincular" && !l.decision && (
                    <button type="button" onClick={() => setVer((s) => alternar(s, l.clave))} aria-expanded={ver.has(l.clave)} className={LINK}>
                      {ver.has(l.clave) ? "Ocultar" : "Ver cuáles"}
                    </button>
                  )}
                  {l.boton && hacer && (
                    <Btn
                      size="sm"
                      variant={l.accion.tipo === "vincular" ? "primary" : "secondary"}
                      onClick={hacer}
                      disabled={arreglo.abriendo != null}
                      aria-expanded={l.decision ? abierta : undefined}
                      aria-busy={leyendo}
                      className="max-sm:h-11 max-sm:flex-1"
                    >
                      {leyendo && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                      {leyendo ? "Abriendo…" : l.decision && abierta ? "Ocultar" : l.boton}
                    </Btn>
                  )}
                  {l.accion.tipo === "vincular" && !firma && (
                    <span className="text-xs text-[var(--text-tertiary)]">Las vincula el dueño o un administrador.</span>
                  )}
                </div>
              </div>

              {error && (
                <p role="alert" className="mt-1 flex items-start gap-1.5 text-sm text-[var(--data-error-ink)]">
                  <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
              )}

              {ver.has(l.clave) && (
                <ul className="mt-1.5 space-y-1 border-t border-[var(--rule-soft)] pt-1.5 text-sm text-[var(--text-secondary)]">
                  {guias.map((g) => (
                    <li key={g.gtfNumber} className="tabular-nums">
                      <b className="text-[var(--text-primary)]">{g.gtfNumber}</b> ·{" "}
                      {g.llegada ? `figura el ${ddmm(g.llegada)}` : "sin recibir"}
                      {g.propuesta ? `, su guía dice ${ddmm(g.propuesta)}` : ""}
                    </li>
                  ))}
                  {l.corridas.slice(0, 12).map((c) => (
                    <li key={c.corridaId}>
                      <span className="tabular-nums">{lineaDeCorrida(c)}</span>
                      {c.detalle && <span className="block text-[var(--text-tertiary)]">{c.detalle}</span>}
                    </li>
                  ))}
                  {l.corridas.length > 12 && <li className="text-[var(--text-tertiary)]">y {l.corridas.length - 12} más</li>}
                </ul>
              )}

              {l.decision && abierta && (
                <DecisionDeLinea
                  linea={l}
                  abriendo={arreglo.abriendo}
                  puedeEditar={puedeEditar}
                  firma={firma}
                  onVerDia={(dia) => arreglo.abrirYa({ tipo: "ver_dia", dia })}
                  onEditar={(c, clave) => void arreglo.editarCorrida(clave, c, especies)}
                  onSoltar={(t) =>
                    arreglo.abrirYa({ tipo: "soltar_trozas", corridaId: t.corridaId, lineNo: t.lineNo, esperan: l.corridas })
                  }
                />
              )}
            </li>
          );
        })}
      </ul>

      <CtpSinOrigenModales abierto={arreglo.abierto} onCerrar={arreglo.cerrar} onCambio={onCambio} />
    </>
  );
}
