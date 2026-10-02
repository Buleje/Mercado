"use client";

/**
 * La lista corta de «Nueva línea» del LO-TH (ADR-127): lo que el plan elegido
 * tiene disponible para esta etapa —el árbol del censo, la tala a trozar, la
 * troza a despachar…— con su buscador, el selector del plan y, en Tala y
 * Trozado, el botón «Ver censo».
 *
 * En la tala de una PLANTACIÓN (ADR-459) la lista ofrece las especies del
 * registro con lo que queda en pie; el censo («árboles marcados»), si lo hay,
 * queda como la otra pestaña. Cada especie trae «Varios»: «Bolaina × N» abre
 * la planilla de la tala en tanda con N filas de esa especie.
 *
 * Presentación pura: el formulario decide qué hay en la lista y qué hace
 * elegir un ítem.
 */

import { useMemo, useState } from "react";
import { Loader2, Search, Table } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { ordenarCenso, type ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import type { LothSection } from "@/lib/forestal/loth-constants";
import type { EspecieDelRegistro } from "@/lib/forestal/loth-tala-plantacion";
import { CitesPill, cls, etiquetaPlan } from "./loth-entry-form-ui";
import FilaRegistro from "./LothFuentesRegistro";

export interface PlanOpt {
  id: string;
  planType: string;
  planNumber: string | null;
  titularName: string;
  /** Con el código del papel («REG-PLT…») se reconoce una plantación cargada como PO. */
  tituloHabilitante?: string | null;
}

export interface SourceItem {
  kind: string; code: string | null; species: string | null; scientific: string | null; cites?: boolean;
  dapM?: number | null; hcM?: number | null; vol?: number | null; productType?: string | null;
  quantity?: number | null; unit?: string | null; meta?: string | null; trozaCode?: string | null;
  utmZona?: string | null; utmX?: number | null; utmY?: number | null;
  /** Tala: lo que hay que saber antes de tumbarlo (semillero, bajo DMC…). */
  aviso?: string | null;
  /** Trozado: cuántas trozas salieron ya de esa tala. */
  trozas?: number | null;
  /** Tala de una plantación: la especie del registro, con lo que queda en pie. */
  registro?: { registradoM3: number; enPieM3: number } | null;
}

export const TITULO_FUENTE: Record<LothSection, string> = {
  tala: "Elige el árbol del censo",
  trozado: "Elige la tala a trozar",
  despacho_troza: "Elige la troza a despachar",
  consumo_troza: "Elige la troza a consumir",
  producto_terminado: "Elige la troza consumida (materia prima)",
  despacho_producto: "Elige el producto a despachar",
};

/** Tala: lo disponible sale del censo cruzado con el libro (un talado no se ofrece). */
export function fuentesDelCenso(arboles: readonly ArbolParaElegir[]): SourceItem[] {
  return ordenarCenso(arboles.filter((a) => a.disponibilidad === "disponible"), "codigo", "asc").map((a) => ({
    kind: "censo",
    code: a.treeCode,
    species: a.speciesCommon,
    scientific: a.speciesScientific,
    cites: a.cites,
    dapM: a.dapM,
    hcM: a.hcM,
    vol: a.volM3,
    utmZona: a.utmZona,
    utmX: a.utmX,
    utmY: a.utmY,
    aviso: a.reparo ? (a.reparo.nivel === "infraccion" ? "No se tala" : "Semillero del plan") : null,
  }));
}

/** Tala de una plantación: una fila por especie del registro (ADR-459). */
export function fuentesDelRegistro(especies: readonly EspecieDelRegistro[]): SourceItem[] {
  return especies.map((e) => ({
    kind: "registro",
    code: null,
    species: e.especie,
    scientific: e.cientifico,
    cites: e.cites,
    vol: e.enPieM3,
    registro: { registradoM3: e.registradoM3, enPieM3: e.enPieM3 },
  }));
}

/** Trozado: cada tala con cuántas trozas ya salieron de ella (del cruce del censo). */
export function conTrozasDelCenso(talas: readonly SourceItem[], arboles: readonly ArbolParaElegir[]): SourceItem[] {
  const uso = new Map(arboles.map((a) => [a.treeCode, a.uso?.trozas ?? 0]));
  return talas.map((t) => (t.code && uso.has(t.code) ? { ...t, trozas: uso.get(t.code) ?? 0 } : t));
}

interface Props {
  section: LothSection;
  planId: string | null;
  plans: PlanOpt[];
  onPlan: (id: string | null) => void;
  fuentes: SourceItem[];
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  onElegir: (it: SourceItem) => void;
  /** Tala y Trozado: el censo entero en otra ventana. En una plantación, «Ver marcados». */
  verCenso: { total: number; onAbrir: () => void; etiqueta?: string } | null;
  /**
   * Tala de una plantación: qué ofrece la lista —las especies del registro o
   * los árboles marcados del censo— y cuántos hay de cada uno.
   */
  plantacion?: {
    modo: "registro" | "censo";
    onModo: (m: "registro" | "censo") => void;
    especies: number;
    arbolesMarcados: number;
  } | null;
  /** Plantación: «Bolaina × N» → la planilla de la tala en tanda. Sin esto (corrigiendo), no se ofrece. */
  onTalarVarios?: ((especie: string, n: number) => void) | null;
}

const VACIO_REGISTRO = "Este registro no tiene especies cargadas: agrégalas en Plan de manejo → Registro y saldo.";

export default function LothFuentesLista({ section, planId, plans, onPlan, fuentes, cargando, error, onReintentar, onElegir, verCenso, plantacion, onTalarVarios }: Props) {
  const [query, setQuery] = useState("");
  /** La especie con «Varios» abierto (una a la vez). */
  const [varios, setVarios] = useState<string | null>(null);
  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? fuentes.filter(
          (s) =>
            (s.code ?? "").toLowerCase().includes(q) ||
            (s.species ?? "").toLowerCase().includes(q) ||
            (s.scientific ?? "").toLowerCase().includes(q) ||
            (s.productType ?? "").toLowerCase().includes(q),
        )
      : fuentes;
    return list.slice(0, 60);
  }, [fuentes, query]);
  const porRegistro = plantacion?.modo === "registro";
  const titulo = porRegistro ? "Elige la especie del registro" : plantacion ? "Elige el árbol marcado" : TITULO_FUENTE[section];
  /* Las dos pestañas sólo si hay de las dos: con una sola, no hay qué elegir. */
  const conPestanas = plantacion != null && plantacion.especies > 0 && plantacion.arbolesMarcados > 0;

  return (
    <section aria-label={titulo} className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
            {titulo}
          </span>
          {porRegistro ? (
            <InfoTip
              icono="ayuda"
              title={titulo}
              what="Una plantación no necesita censo: elige la especie y la línea se llena con su nombre, el científico y un código de árbol que puedes cambiar."
              affects="Lo que tales se descuenta de lo registrado de esa especie."
              example="Bolaina · quedan 118.250 de 120.500 m³ → talas 3.100 → quedan 115.150."
            />
          ) : (
            <InfoTip
              icono="ayuda"
              title={titulo}
              what="Elige de la lista para autocompletar la línea, o cárgala a mano abajo."
              affects="Sólo aparece lo que el plan elegido tiene disponible para esta etapa."
            />
          )}
        </div>
        <select
          value={planId ?? ""}
          onChange={(e) => onPlan(e.target.value || null)}
          aria-label="Elegir plan de manejo"
          className="h-9 max-w-full truncate rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs font-bold text-[var(--text-primary)] outline-none"
        >
          {plans.length === 0 && <option value="">Sin plan</option>}
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{etiquetaPlan(p)}</option>
          ))}
        </select>
      </div>
      {conPestanas && (
        <div role="group" aria-label="Qué ofrece la lista" className="inline-flex rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5">
          {(
            [
              ["registro", "Por especie", plantacion.especies],
              ["censo", "Árboles marcados", plantacion.arbolesMarcados],
            ] as const
          ).map(([m, label, n]) => (
            <button
              key={m}
              type="button"
              aria-pressed={plantacion.modo === m}
              onClick={() => plantacion.onModo(m)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors ${
                plantacion.modo === m
                  ? "bg-[var(--accent-dark)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              }`}
            >
              {label}
              <span className={`font-mono text-xs tabular-nums ${plantacion.modo === m ? "text-white/80" : "text-[var(--text-tertiary)]"}`}>{n}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={porRegistro ? "Buscar especie" : "Buscar por código o especie"}
            placeholder={porRegistro ? "Buscar especie..." : "Buscar por código o especie..."}
            className={`${cls.input} h-9 pl-8`}
          />
        </div>
        {/* El censo entero, con lo que ya se taló y lo que no se toca
            (Brandon 28-09: «un botón… una tabla… para tomar mejores
            decisiones»). */}
        {verCenso && (
          <button
            type="button"
            onClick={verCenso.onAbrir}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <Table className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
            {verCenso.etiqueta ?? "Ver censo"}
            {verCenso.total > 0 && (
              <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{verCenso.total}</span>
            )}
          </button>
        )}
      </div>
      <div className="max-h-40 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        {cargando ? (
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : error ? (
          <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <span>{error}</span>
            <button type="button" onClick={onReintentar} className="shrink-0 font-semibold underline underline-offset-2">Reintentar</button>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="px-3 py-3 text-center text-sm text-[var(--text-tertiary)]">
            {porRegistro && plantacion.especies === 0 ? (
              VACIO_REGISTRO
            ) : porRegistro ? (
              "Ninguna especie del registro coincide con la búsqueda."
            ) : (
              <>Nada disponible en este plan para esta etapa.{section !== "tala" && " Registra primero la etapa anterior."}</>
            )}
          </div>
        ) : porRegistro ? (
          filtradas.map((it, i) => (
            <FilaRegistro
              key={`${it.species}-${i}`}
              it={it}
              onElegir={onElegir}
              varios={
                onTalarVarios && it.species
                  ? {
                      abierto: varios === it.species,
                      onAbrir: (v) => setVarios(v ? it.species : null),
                      onTalar: (n) => onTalarVarios(it.species ?? "", n),
                    }
                  : null
              }
            />
          ))
        ) : (
          filtradas.map((it, i) => (
            <button
              key={`${it.code}-${i}`}
              type="button"
              onClick={() => onElegir(it)}
              className="flex min-h-9 w-full items-center justify-between gap-3 px-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <span className="flex min-w-0 items-center gap-2 truncate">
                <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{it.code ?? it.productType ?? "—"}</span>
                {it.species && <span className="truncate text-sm text-[var(--text-secondary)]">{it.species}</span>}
                {it.cites && <CitesPill />}
                {it.aviso && (
                  <span className="shrink-0 rounded bg-[var(--data-warning-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
                    {it.aviso}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                {it.trozas ? `${it.trozas} ${it.trozas === 1 ? "troza" : "trozas"} · ` : ""}
                {it.dapM ? `Ø ${Number(it.dapM).toFixed(2)}m ` : ""}
                {it.vol != null ? `${fmtM3(it.vol)} m³` : it.quantity != null ? `${Number(it.quantity).toFixed(2)} ${it.unit ?? ""}` : ""}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
