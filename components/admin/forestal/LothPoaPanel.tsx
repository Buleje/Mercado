"use client";

/**
 * LothPoaPanel — el CUADRO DEL PLAN OPERATIVO: cruza el censo con el DMC de
 * cada especie y responde lo único que importa antes de entrar al monte:
 * **cuántos árboles se pueden tumbar de verdad, cuánto volumen sostienen y
 * cuántos quedan como semilleros.**
 *
 * Hasta acá el módulo mostraba "volumen autorizado" (lo que dice el papel) y
 * "censado" (lo que hay). Faltaba el filtro legal del medio: un árbol bajo el
 * DMC de su especie no es madera aprovechable, es una infracción.
 *
 * La matemática vive en `loth-poa` (puro y testeado); acá va la edición de los
 * parámetros y la lectura.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Check, Info, Loader2, Printer, Save, Settings2, TreePine, XCircle } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import {
  CATEGORIA_COLOR,
  CATEGORIA_LABEL,
  ordenarAlertas,
  type PoaAnalisis,
  type PoaConfig,
} from "@/lib/forestal/loth-poa";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { useLocalStorage } from "@/hooks/use-local-storage";
import LothPoaParametros from "./LothPoaParametros";
import { BloquePlan, BotonPlegar, CifraLinea } from "./loth-plan-ui";

/** Clave de la preferencia. Exportada: la prueba en navegador la lee. */
export const CLAVE_INDICADORES_POA = "loth:plan:poa-indicadores-abiertos";

const CELL = "px-3 py-2 text-sm";
const NUM = `${CELL} text-right font-mono tabular-nums`;
const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40";

interface Props {
  analisis: PoaAnalisis;
  config: PoaConfig;
  saving: boolean;
  /** Hay parámetros cambiados sin guardar: sólo entonces aparece «Guardar». */
  sucio?: boolean;
  onConfig: (next: PoaConfig) => void;
  onSave: () => void;
  /** Sin él no hay botón: en la vista del plan el anexo vive en «Opciones». */
  onPrint?: () => void;
}

const NIVEL_ICON = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;
const NIVEL_CLASS = {
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  info: "text-[var(--text-tertiary)]",
} as const;

export default function LothPoaPanel({ analisis, config, saving, sucio = false, onConfig, onSave, onPrint }: Props) {
  const [editando, setEditando] = useState(false);
  const [todasLasAlertas, setTodasLasAlertas] = useState(false);
  const [kpisAbiertos, setKpisAbiertos] = useLocalStorage<boolean>(CLAVE_INDICADORES_POA, false);
  const { especies, totales, intensidad } = analisis;
  const alertas = useMemo(() => ordenarAlertas(analisis.alertas), [analisis.alertas]);
  const intensidadTxt = intensidad.m3PorHa != null ? `${intensidad.m3PorHa.toFixed(2)} m³/ha` : "—";

  return (
    <BloquePlan
      id="loth-plan-poa"
      titulo="Plan Operativo · aprovechable según DMC"
      sub={`Diámetro mínimo de corta (RJ 458-2002-INRENA, editable por plan) + ${config.semillerosPct}% de semilleros en pie`}
      acciones={
        <>
          <BotonPlegar
            abierto={kpisAbiertos}
            onClick={() => setKpisAbiertos(!kpisAbiertos)}
            controla="loth-plan-poa-indicadores"
            label="Indicadores"
            icon={BarChart3}
            compacto
            titulo={kpisAbiertos ? "Oculta los indicadores del POA. Se recuerda en este navegador." : "Muestra los indicadores del POA"}
          />
          <button type="button" onClick={() => setEditando((v) => !v)} aria-pressed={editando} className={BTN}>
            <Settings2 className="h-3.5 w-3.5" /> Parámetros
          </button>
          {/* «Guardar» aparece cuando hay algo que guardar: siempre a la vista
              era un botón más que no hacía nada la mayor parte del tiempo. */}
          {(editando || sucio || saving) && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !sucio}
              className={sucio ? "inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--data-success-700)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50" : BTN}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {sucio ? "Guardar cambios" : "Guardado"}
            </button>
          )}
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
            >
              <Printer className="h-3.5 w-3.5" /> Anexo POA
            </button>
          )}
        </>
      }
    >
      {/* Indicadores: plegados dicen sus cifras en una línea —las mismas que
          las tarjetas— y la preferencia se recuerda en el navegador. */}
      {!kpisAbiertos && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--rule-soft)] px-4 py-2.5 text-sm">
          <CifraLinea valor={String(totales.aprovechables)} label={`aprovechables (${fmtM3(totales.volumenAprovechableM3)} m³)`} tono="ok" />
          <span aria-hidden="true" className="text-[var(--text-tertiary)]">·</span>
          <CifraLinea valor={String(totales.semilleros)} label="semilleros en pie" />
          <span aria-hidden="true" className="text-[var(--text-tertiary)]">·</span>
          <CifraLinea valor={String(totales.bajoDmc)} label="bajo DMC" tono={totales.bajoDmc > 0 ? "warn" : undefined} />
          <span aria-hidden="true" className="text-[var(--text-tertiary)]">·</span>
          <CifraLinea valor={intensidadTxt} label="de intensidad" />
        </p>
      )}
      <div id="loth-plan-poa-indicadores" hidden={!kpisAbiertos} className="grid gap-2 border-b border-[var(--rule-soft)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Aprovechables" valor={String(totales.aprovechables)} sub={`${fmtM3(totales.volumenAprovechableM3)} m³`} tone="success" />
        <Kpi label="Semilleros en pie" valor={String(totales.semilleros)} sub={`${config.semillerosPct}% de los ≥ DMC`} tone="accent" />
        <Kpi label="Bajo DMC" valor={String(totales.bajoDmc)} sub="no aprovechables por norma" tone="warning" />
        <Kpi
          label="Intensidad"
          valor={intensidadTxt}
          sub={
            intensidad.arbolesPorHa != null
              ? // En áreas grandes el ratio por hectárea es < 0,01: sin decimales
                // extra parecería "cero árboles", que es falso.
                `${intensidad.arbolesPorHa.toFixed(intensidad.arbolesPorHa < 0.01 ? 4 : 2)} árb/ha · ${intensidad.areaHa} ha`
              : "sin área declarada"
          }
          tone="info"
        />
      </div>

      {/* Parámetros */}
      {editando && <LothPoaParametros especies={especies} config={config} onConfig={onConfig} />}

      {/* Cuadro por especie */}
      <div className="overflow-x-auto">
        <DataTable className="w-full border-collapse">
          <thead>
            <tr className="bg-[var(--surface-canvas)] text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
              <th className={`${CELL} text-left font-bold`}>Especie</th>
              <th className={`${CELL} text-right font-bold`}>DMC</th>
              <th className={`${CELL} text-right font-bold`}>Censados</th>
              <th className={`${CELL} text-right font-bold`}>≥ DMC</th>
              <th className={`${CELL} text-right font-bold`}>Bajo DMC</th>
              <th className={`${CELL} text-right font-bold`}>Semilleros</th>
              <th className={`${CELL} text-right font-bold`}>Aprovech.</th>
              <th className={`${CELL} text-right font-bold`}>Vol. aprov. (m³)</th>
              <th className={`${CELL} text-right font-bold`}>Autorizado (m³)</th>
            </tr>
          </thead>
          <tbody>
            {especies.map((e) => (
              <tr
                key={e.especie}
                className={`border-t border-[var(--rule-subtle)] ${
                  e.fueraDelPlan ? "bg-[var(--data-error-500)]/10" : e.autorizadoSinRespaldo ? "bg-[var(--data-warning-500)]/10" : ""
                }`}
              >
                <td className={`${CELL} font-bold text-[var(--text-primary)]`}>
                  {e.especie}
                  {e.fueraDelPlan && (
                    <span className="ml-1.5 rounded bg-[var(--data-error-500)]/20 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-black text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                      NO EN PLAN
                    </span>
                  )}
                </td>
                <td className={NUM}>
                  {e.dmcCm}
                  <span className="ml-1 text-xs font-sans text-[var(--text-tertiary)]">
                    {e.dmcFuente === "plan" ? "plan" : e.dmcFuente === "oficial" ? "norma" : "gral."}
                  </span>
                </td>
                <td className={NUM}>{e.censados}</td>
                <td className={NUM}>{e.sobreDmc}</td>
                <td className={`${NUM} text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>{e.bajoDmc || "—"}</td>
                <td className={`${NUM} text-[var(--accent-ink)] dark:text-[var(--accent)]`}>{e.semilleros || "—"}</td>
                <td className={`${NUM} font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]`}>{e.aprovechables}</td>
                <td className={`${NUM} font-bold`}>{fmtM3(e.volumenAprovechableM3)}</td>
                <td className={NUM}>{e.volumenAutorizadoM3 != null ? e.volumenAutorizadoM3.toFixed(2) : "—"}</td>
              </tr>
            ))}
            {especies.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
                  <TreePine className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  Sin censo cargado: el POA se calcula sobre los árboles censados.
                </td>
              </tr>
            )}
          </tbody>
          {especies.length > 0 && (
            <tfoot>
              <tr className="border-t border-[var(--rule-base)] bg-[var(--surface-canvas)] font-bold">
                <td className={CELL}>Total</td>
                <td className={NUM}>—</td>
                <td className={NUM}>{totales.censados}</td>
                <td className={NUM}>{totales.aprovechables + totales.semilleros}</td>
                <td className={NUM}>{totales.bajoDmc}</td>
                <td className={NUM}>{totales.semilleros}</td>
                <td className={NUM}>{totales.aprovechables}</td>
                <td className={NUM}>{fmtM3(totales.volumenAprovechableM3)}</td>
                <td className={NUM}>{totales.volumenAutorizadoM3.toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </DataTable>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <ul className="space-y-1.5 border-t border-[var(--rule-soft)] p-4">
          {/* Las tres primeras (vienen ordenadas por gravedad) y el resto a un
              clic: cinco avisos de dos renglones empujaban el editor de
              especies fuera de la pantalla. */}
          {alertas.slice(0, todasLasAlertas ? 8 : 3).map((a, i) => {
            const Icon = NIVEL_ICON[a.nivel];
            return (
              <li key={`${a.titulo}-${i}`} className="flex items-start gap-2 text-sm">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${NIVEL_CLASS[a.nivel]}`} />
                <span>
                  <b className={NIVEL_CLASS[a.nivel]}>{a.titulo}.</b>{" "}
                  <span className="text-[var(--text-secondary)]">{a.detalle}</span>
                </span>
              </li>
            );
          })}
          {Math.min(alertas.length, 8) > 3 && (
            <li>
              <button
                type="button"
                onClick={() => setTodasLasAlertas((v) => !v)}
                aria-expanded={todasLasAlertas}
                className="text-xs font-bold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
              >
                {todasLasAlertas ? "Ver sólo las tres primeras" : `Ver los ${Math.min(alertas.length, 8)} avisos`}
              </button>
            </li>
          )}
        </ul>
      )}

      <p className="border-t border-[var(--rule-subtle)] px-4 py-2 text-xs text-[var(--text-tertiary)]">
        Leyenda del censo:{" "}
        {(["aprovechable", "semillero", "bajo_dmc", "talado"] as const).map((c) => (
          <span key={c} className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: CATEGORIA_COLOR[c] }} aria-hidden="true" />
            {CATEGORIA_LABEL[c]}
          </span>
        ))}
      </p>
    </BloquePlan>
  );
}

function Kpi({ label, valor, sub, tone }: { label: string; valor: string; sub: string; tone: "success" | "warning" | "accent" | "info" }) {
  const color =
    tone === "success"
      ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : tone === "warning"
        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : tone === "accent"
          ? "text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`font-mono text-2xl font-black tabular-nums ${color}`}>{valor}</p>
      <p className="text-xs font-semibold text-[var(--text-tertiary)]">{sub}</p>
    </div>
  );
}

/** Estado visual del guardado (lo usa el panel padre si quiere feedback extra). */
export const PoaSavedIcon = Check;
