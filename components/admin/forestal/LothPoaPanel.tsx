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
import { AlertTriangle, Check, Info, Loader2, Printer, Save, Settings2, TreePine, XCircle } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import {
  CATEGORIA_COLOR,
  CATEGORIA_LABEL,
  dmcParaEspecie,
  ordenarAlertas,
  type PoaAnalisis,
  type PoaConfig,
} from "@/lib/forestal/loth-poa";
import { claveEspecie } from "@/lib/forestal/loth-constants";

const CELL = "px-3 py-2 text-sm";
const NUM = `${CELL} text-right font-mono tabular-nums`;
const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40";

interface Props {
  analisis: PoaAnalisis;
  config: PoaConfig;
  saving: boolean;
  onConfig: (next: PoaConfig) => void;
  onSave: () => void;
  onPrint: () => void;
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

export default function LothPoaPanel({ analisis, config, saving, onConfig, onSave, onPrint }: Props) {
  const [editando, setEditando] = useState(false);
  const { especies, totales, intensidad } = analisis;
  const alertas = useMemo(() => ordenarAlertas(analisis.alertas), [analisis.alertas]);

  const setDmc = (especie: string, valor: string) => {
    // FIX 2026-08-22: la clave tiene que ser la MISMA que lee `dmcParaEspecie`
    // (`normEspecie` → `claveEspecie`) — antes esta normalización local no
    // quitaba el científico entre paréntesis, así que un override para
    // "Tornillo (Cedrelinga catenaeformis)" se guardaba bajo una clave que
    // `dmcParaEspecie` nunca iba a buscar: el override se perdía en silencio,
    // el DMC volvía siempre al oficial/general.
    const key = claveEspecie(especie);
    const next = { ...config.dmcOverrides };
    const cm = Number(valor);
    if (!valor.trim() || !Number.isFinite(cm) || cm <= 0) delete next[key];
    else next[key] = Math.round(cm);
    onConfig({ ...config, dmcOverrides: next });
  };

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <div>
          <CardTitle as="h3" className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
            Plan Operativo · aprovechable según DMC
          </CardTitle>
          <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
            Diámetro mínimo de corta (RJ 458-2002-INRENA, editable por plan) + {config.semillerosPct}% de semilleros en pie
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setEditando((v) => !v)} aria-pressed={editando} className={BTN}>
            <Settings2 className="h-3.5 w-3.5" /> Parámetros
          </button>
          <button type="button" onClick={onSave} disabled={saving} className={BTN}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
          >
            <Printer className="h-3.5 w-3.5" /> Anexo POA
          </button>
        </div>
      </header>

      {/* Indicadores */}
      <div className="grid gap-2 border-b-2 border-[var(--rule-base)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Aprovechables" valor={String(totales.aprovechables)} sub={`${totales.volumenAprovechableM3.toFixed(4)} m³`} tone="success" />
        <Kpi label="Semilleros en pie" valor={String(totales.semilleros)} sub={`${config.semillerosPct}% de los ≥ DMC`} tone="accent" />
        <Kpi label="Bajo DMC" valor={String(totales.bajoDmc)} sub="no aprovechables por norma" tone="warning" />
        <Kpi
          label="Intensidad"
          valor={intensidad.m3PorHa != null ? `${intensidad.m3PorHa.toFixed(2)} m³/ha` : "—"}
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
      {editando && (
        <div className="space-y-3 border-b-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
          <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
            Semilleros a dejar en pie
            <input
              type="number"
              min={0}
              max={100}
              value={config.semillerosPct}
              onChange={(e) => onConfig({ ...config, semillerosPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
              className="h-10 w-20 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text-primary)]"
            />
            % de los árboles que superan el DMC (se reservan los de mayor DAP)
          </label>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">DMC por especie (cm)</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {especies.map((e) => {
                const oficial = dmcParaEspecie(e.especie);
                return (
                  <label key={e.especie} className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                    <span className="min-w-0 flex-1 truncate">{e.especie}</span>
                    <input
                      type="number"
                      min={10}
                      max={200}
                      placeholder={String(oficial.cm)}
                      value={config.dmcOverrides[normKey(e.especie)] ?? ""}
                      onChange={(ev) => setDmc(e.especie, ev.target.value)}
                      className="h-10 w-20 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold text-[var(--text-primary)]"
                    />
                    <span className="w-16 shrink-0 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      {oficial.fuente === "oficial" ? `norma ${oficial.cm}` : `gral. ${oficial.cm}`}
                    </span>
                  </label>
                );
              })}
              {especies.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">Cargá el censo para configurar el DMC por especie.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Cuadro por especie */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
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
                  <span className="ml-1 text-[length:var(--ts-2xs)] font-sans text-[var(--text-tertiary)]">
                    {e.dmcFuente === "plan" ? "plan" : e.dmcFuente === "oficial" ? "norma" : "gral."}
                  </span>
                </td>
                <td className={NUM}>{e.censados}</td>
                <td className={NUM}>{e.sobreDmc}</td>
                <td className={`${NUM} text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>{e.bajoDmc || "—"}</td>
                <td className={`${NUM} text-[#0d9488]`}>{e.semilleros || "—"}</td>
                <td className={`${NUM} font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]`}>{e.aprovechables}</td>
                <td className={`${NUM} font-bold`}>{e.volumenAprovechableM3.toFixed(4)}</td>
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
              <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] font-bold">
                <td className={CELL}>Total</td>
                <td className={NUM}>—</td>
                <td className={NUM}>{totales.censados}</td>
                <td className={NUM}>{totales.aprovechables + totales.semilleros}</td>
                <td className={NUM}>{totales.bajoDmc}</td>
                <td className={NUM}>{totales.semilleros}</td>
                <td className={NUM}>{totales.aprovechables}</td>
                <td className={NUM}>{totales.volumenAprovechableM3.toFixed(4)}</td>
                <td className={NUM}>{totales.volumenAutorizadoM3.toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <ul className="space-y-1.5 border-t-2 border-[var(--rule-base)] p-4">
          {alertas.slice(0, 8).map((a, i) => {
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
        </ul>
      )}

      <p className="border-t border-[var(--rule-subtle)] px-4 py-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        Leyenda del censo:{" "}
        {(["aprovechable", "semillero", "bajo_dmc", "talado"] as const).map((c) => (
          <span key={c} className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: CATEGORIA_COLOR[c] }} aria-hidden="true" />
            {CATEGORIA_LABEL[c]}
          </span>
        ))}
      </p>
    </section>
  );
}

const normKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function Kpi({ label, valor, sub, tone }: { label: string; valor: string; sub: string; tone: "success" | "warning" | "accent" | "info" }) {
  const color =
    tone === "success"
      ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : tone === "warning"
        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : tone === "accent"
          ? "text-[#0d9488]"
          : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`font-mono text-2xl font-black tabular-nums ${color}`}>{valor}</p>
      <p className="text-xs font-semibold text-[var(--text-tertiary)]">{sub}</p>
    </div>
  );
}

/** Estado visual del guardado (lo usa el panel padre si quiere feedback extra). */
export const PoaSavedIcon = Check;
