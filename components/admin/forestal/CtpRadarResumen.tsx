"use client";

/**
 * CtpRadarResumen — la lectura de un fiscalizador antes de mirar el dibujo.
 *
 * Los dos porcentajes que definen si el período aguanta una inspección (cuánta
 * salida traza hasta su GTF y cuánta materia prima ya pasó por producción), los
 * cuatro conteos accionables, el selector de las tres lecturas y —lo que más
 * importa— los ESLABONES SIN CERRAR con el arreglo a un click.
 *
 * Sale de CtpTrazaRadar (que pasaba de 900 líneas) sin cambiarle nada: la
 * lógica del balance sigue viviendo en `lib/forestal/ctp-radar*` y acá sólo se
 * dibuja lo que esas libs ya calcularon.
 */

import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Eye,
  ShieldAlert,
  Truck,
  X as XIcon,
} from "@buleje/design-system/icons";
import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";
import type { RadarAnalisis } from "@/lib/forestal/ctp-radar";
import { alertasRendimiento, type RendimientoCorrida } from "@/lib/forestal/ctp-radar-rendimiento";
import type { AnalisisTiempo } from "@/lib/forestal/ctp-radar-tiempo";
import type { CadenaGtf } from "@/lib/forestal/ctp-radar-cadena";
import type { DetailTarget } from "./CtpNodeDetailLoader";
import CtpRadarCadenaGtf from "./CtpRadarCadenaGtf";
import { fmtNum, SummaryChip, trunc } from "./ctp-radar-svg";
import type { Foco, Vista } from "./ctp-radar-tipos";
import { VISTAS } from "./ctp-radar-tipos";

export interface CtpRadarResumenProps {
  g: TrazaGrafo;
  a: RadarAnalisis;
  tiempo: AnalisisTiempo | null;
  rendimiento: RendimientoCorrida[];
  foco: Foco;
  onFoco: (f: Foco) => void;
  vista: Vista;
  onVista: (v: Vista) => void;
  seguirId: string | null;
  onSeguir: (id: string | null) => void;
  cadenaSeguida: CadenaGtf | null;
  onDetail: (t: DetailTarget) => void;
  totalHuecos: number;
  huecoDespachos: TrazaGrafo["despachos"];
  despachosParciales: TrazaGrafo["despachos"];
  huerfanaCorridas: TrazaGrafo["corridas"];
  /** Unidad de la línea (los ingresos son m³; producción/despacho, la suya). */
  unidadDe: (id: string) => string;
}

export default function CtpRadarResumen({
  g,
  a,
  tiempo,
  rendimiento,
  foco,
  onFoco,
  vista,
  onVista,
  seguirId,
  onSeguir,
  cadenaSeguida,
  onDetail,
  totalHuecos,
  huecoDespachos,
  despachosParciales,
  huerfanaCorridas,
  unidadDe,
}: CtpRadarResumenProps) {
  const toggleFoco = (f: Foco) => onFoco(foco === f ? "todos" : f);
  const setVista = onVista;
  const setSeguirId = onSeguir;
  const setDetail = onDetail;

  return (
    <>
          {/* Los dos números que un fiscalizador lee primero: cuánta salida traza
              hasta su GTF, y cuánto de lo que entró ya pasó por producción. */}
          {/* Salud de la cadena en UNA tira: los dos porcentajes que lee un
              fiscalizador y los cuatro conteos accionables. Antes eran dos
              filas de tarjetas (≈250px) para seis cifras. */}
          <div className="space-y-2.5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {a.totales.trazabilidadPct != null && (
                <Medidor
                  pct={a.totales.trazabilidadPct}
                  titulo="Trazabilidad"
                  detalle={`${a.totales.despachosCompletos} de ${g.despachos.length} despachos llegan a su GTF`}
                />
              )}
              {a.totales.consumoPct != null && (
                <Medidor
                  pct={a.totales.consumoPct}
                  titulo="Materia prima consumida"
                  detalle={`${fmtNum(a.totales.consumidoM3)} de ${fmtNum(a.totales.ingresoM3)} m³${a.totales.stockSinConsumirM3 > 0 ? ` · ${fmtNum(a.totales.stockSinConsumirM3)} en patio` : ""}`}
                  neutro
                />
              )}
            </div>

            {/* Píldoras, no tarjetas: cuatro tarjetas con ícono de 40px son 190px
                de alto para cuatro números. Cada una filtra el grafo al tocarla. */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2.5">
              <SummaryChip pill icon={CheckCircle2} tone="success" value={a.totales.despachosCompletos} label="con cadena completa" />
              <SummaryChip pill icon={AlertTriangle} tone="warning" value={a.totales.despachosHueco + a.totales.corridasHuerfanas} label="sin origen" onClick={() => toggleFoco("huecos")} activo={foco === "huecos"} />
              <SummaryChip pill icon={Boxes} tone="info" value={a.totales.despachosParciales} label="a medio atribuir" onClick={() => toggleFoco("parciales")} activo={foco === "parciales"} />
              <SummaryChip pill icon={ShieldAlert} tone="danger" value={a.totales.citesCount} label="ingresos CITES" onClick={() => toggleFoco("cites")} activo={foco === "cites"} />
            </div>
          </div>

          {/* Tres lecturas del mismo período. Apiladas serían tres pantallas de
              scroll; como pestañas, cada pregunta tiene su lugar. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-11 items-center overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
              {VISTAS.map((v) => {
                const Icon = v.icon;
                const alertas = v.key === "cronologia" ? (tiempo?.anomalias.length ?? 0)
                  : v.key === "rendimiento" ? alertasRendimiento(rendimiento).length
                  : 0;
                return (
                  <button
                    key={v.key} type="button" title={v.hint} onClick={() => setVista(v.key)} aria-pressed={vista === v.key}
                    className={`flex h-full items-center gap-1.5 px-3.5 text-sm font-bold transition ${vista === v.key ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" /> {v.label}
                    {alertas > 0 && (
                      <span className={`ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums ${vista === v.key ? "bg-white/25 text-white" : "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/20 dark:text-[var(--data-warning-500)]"}`}>
                        {alertas}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {seguirId && (
              <button type="button" onClick={() => setSeguirId(null)} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--accent)] bg-primary/10 dark:bg-[var(--accent)]/12 px-3 text-xs font-bold text-[var(--accent)]">
                <XIcon className="h-3.5 w-3.5" /> Dejar de seguir la GTF
              </button>
            )}
          </div>

          {/* Seguimiento de una GTF: la vista que se arma a mano cuando OSINFOR
              pregunta por un ingreso puntual. */}
          {cadenaSeguida && (
            <CtpRadarCadenaGtf
              cadena={cadenaSeguida}
              onCerrar={() => setSeguirId(null)}
              onVerNodo={(kind, id, gtf) => setDetail(kind === "ingreso" ? { kind, id, gtf: gtf ?? "" } : { kind, id })}
            />
          )}

          {/* Huecos accionables: la cadena rota, con el arreglo a un click. El
              libro los admite; el certificado exige cadena completa. */}
          {totalHuecos > 0 && (
            <div className="rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 dark:bg-[var(--data-warning-500)]/12">
              <div className="mb-1 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />
                <p className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  {totalHuecos} {totalHuecos === 1 ? "eslabón sin cerrar" : "eslabones sin cerrar"}
                </p>
              </div>
              <p className="mb-3 text-sm text-[var(--text-secondary)]">
                Estos eslabones no trazan (o trazan sólo en parte) hasta su GTF de ingreso. El libro los admite, pero el certificado exige cadena completa — tocá para completarlos.
              </p>
              <ul className="space-y-2">
                {huecoDespachos.map((d) => (
                  <HuecoFila
                    key={d.id} icon={Truck} tono="warning"
                    titulo={`Despacho #${d.lineNo}`}
                    detalle={`${trunc(d.destino || d.label || "—", 32)} — sin origen atribuido`}
                    accion="Atribuir origen"
                    onClick={() => setDetail({ kind: "despacho", id: d.id })}
                  />
                ))}
                {despachosParciales.map((d) => {
                  const bal = a.despachos.get(d.id)!;
                  return (
                    <HuecoFila
                      key={d.id} icon={Truck} tono="info"
                      titulo={`Despacho #${d.lineNo}`}
                      detalle={`${trunc(d.destino || d.label || "—", 26)} — faltan ${fmtNum(bal.sinAtribuir)} ${unidadDe(d.id)} de ${fmtNum(bal.total)} por atribuir`}
                      accion="Completar origen"
                      onClick={() => setDetail({ kind: "despacho", id: d.id })}
                    />
                  );
                })}
                {huerfanaCorridas.map((c) => (
                  <HuecoFila
                    key={c.id} icon={Boxes} tono="warning"
                    titulo={`Corrida #${c.lineNo}`}
                    detalle={`${trunc(c.label || "—", 32)} — sin materia prima`}
                    accion="Atribuir materia prima"
                    onClick={() => setDetail({ kind: "corrida", id: c.id })}
                  />
                ))}
              </ul>
            </div>
          )}
    </>
  );
}

function Medidor({ pct, titulo, detalle, neutro }: { pct: number; titulo: string; detalle: string; neutro?: boolean }) {
  // El consumo de materia prima NO es una nota: tener stock sin procesar es
  // normal. Sólo la trazabilidad se semaforiza.
  const tono = neutro
    ? { texto: "text-[var(--text-primary)]", barra: "bg-[var(--accent)]" }
    : pct === 100
      ? { texto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", barra: "bg-[var(--data-success-500)]" }
      : pct >= 80
        ? { texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", barra: "bg-[var(--data-warning-500)]" }
        : { texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]", barra: "bg-[var(--data-error-500)]" };
  return (
    // La barra va debajo y a todo el ancho: al costado del texto el `flex-1`
    // colapsaba a un guioncito y la proporción dejaba de leerse.
    <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className={`font-mono text-2xl font-extrabold tabular-nums leading-none ${tono.texto}`}>{pct}%</span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">{titulo}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{detalle}</p>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--rule-base)]" role="img" aria-label={`${pct}% — ${titulo}`}>
        <div className={`h-full rounded-full transition-[width] duration-[var(--dur-slow)] ${tono.barra}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Fila de la lista de eslabones sin cerrar. */
function HuecoFila({
  icon: Icon, tono, titulo, detalle, accion, onClick,
}: {
  icon: typeof Truck; tono: "warning" | "info"; titulo: string; detalle: string; accion: string; onClick: () => void;
}) {
  const color = tono === "warning" ? "text-[var(--data-warning-600)]" : "text-[var(--data-info-500)]";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Icon className={`h-4 w-4 shrink-0 ${color}`} />
        <span>
          <span className="font-bold text-[var(--text-primary)]">{titulo}</span>
          <span className="text-[var(--text-tertiary)]"> · {detalle}</span>
        </span>
      </div>
      <button type="button" onClick={onClick} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-600)]">
        <Eye className="h-3.5 w-3.5" /> {accion}
      </button>
    </li>
  );
}
