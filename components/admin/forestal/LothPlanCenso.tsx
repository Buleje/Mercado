"use client";

/**
 * El censo forestal: buscar, filtrar, agregar, importar y borrar árboles.
 *
 * «Importar censo» se usa una vez por plan: vive en «Opciones» de la vista
 * (llega acá por `importarSignal`) y sólo se muestra en el bloque cuando el
 * censo está vacío, que es cuando ES la acción principal. La tabla scrollea
 * dentro de su caja con la cabecera fija: un censo de miles de árboles no
 * empuja el croquis tres pantallas más abajo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, Trash2, TreePine, Upload } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import { DAP_AVISO_M, DAP_MAX_M, claveEspecie, fmtDapM, mensajeDapFueraDeRango, sugerenciaDapM } from "@/lib/forestal/loth-constants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CATEGORIA_LABEL } from "@/lib/forestal/loth-poa";
import LothCensoImportModal from "./LothCensoImportModal";
import { censusVol, n, type Tree } from "./loth-plan-shared";
import { AddBtn, BloquePlan, CategoriaTag, Cell, CitesPill, EstadoTag, Field, Mono, Table, cls } from "./loth-plan-ui";
import { formatNumber } from "@/lib/format";

export default function LothPlanCenso({ planId, trees, total, truncado, authorizedSpecies, categorias, dmcOverrides, onChange, importarSignal = 0 }: {
  planId: string; trees: Tree[]; total: number; truncado: boolean; authorizedSpecies: Set<string>;
  /** Cada incremento abre el importador (lo pide «Opciones» de la vista). */
  importarSignal?: number;
  /** DMC fijado por el plan — el importador avisa si una fila cae por debajo. */
  dmcOverrides: Record<string, number>;
  /** Categoría POA por árbol (aprovechable / semillero / bajo DMC…). */
  categorias: Map<string, keyof typeof CATEGORIA_LABEL>;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const importarAtendido = useRef(importarSignal);
  useEffect(() => {
    if (importarSignal === importarAtendido.current) return;
    importarAtendido.current = importarSignal;
    setImporting(true);
  }, [importarSignal]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [catFilter, setCatFilter] = useState("todas");
  /** Cuántas filas se pintan. Un censo real tiene miles y el DOM no las aguanta. */
  const [visibles, setVisibles] = useState(200);
  const [f, setF] = useState({ treeCode: "", speciesCommon: "", dapM: "", alturaComercialM: "", factorForma: "0.65", utmZona: "18L", utmX: "", utmY: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const auto = censusVol(Number(f.dapM), Number(f.alturaComercialM), Number(f.factorForma) || 0.65);
  // El DAP va en metros: 15 (típicamente un centímetro tecleado de más) no
  // existe. Bloquea con sugerencia de un clic; entre DAP_AVISO_M y DAP_MAX_M
  // sólo avisa — hay árboles reales así de gruesos (lupunas, ceibas).
  const dapNum = f.dapM.trim() ? Number(f.dapM) : null;
  const dapFueraDeTope = dapNum != null && Number.isFinite(dapNum) && dapNum > DAP_MAX_M;
  const dapAviso = dapNum != null && !dapFueraDeTope && dapNum > DAP_AVISO_M;
  const dapMensaje = dapNum != null && dapFueraDeTope ? mensajeDapFueraDeRango(dapNum) : null;
  const dapSugerido = dapNum != null && dapFueraDeTope ? sugerenciaDapM(dapNum) : null;
  const dapAvisoTexto = dapNum != null && dapAviso ? `DAP de ${fmtDapM(dapNum)} m: es un árbol inusualmente grueso — revisa que esté en metros antes de guardar.` : null;

  // Buscador (código/especie) + filtro por estado, sobre el censo completo.
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return trees.filter((t) => {
      if (estadoFilter !== "todos" && t.estado !== estadoFilter) return false;
      if (catFilter !== "todas" && categorias.get(t.id) !== catFilter) return false;
      if (query && !`${t.treeCode} ${t.speciesCommon}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [trees, q, estadoFilter, catFilter, categorias]);
  // Un árbol cuya especie NO está autorizada en el plan = tala potencialmente ilegal.
  const outOfPlan = (name: string) => authorizedSpecies.size > 0 && !authorizedSpecies.has(claveEspecie(name));
  const { confirm } = useConfirm();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.treeCode.trim() || !f.speciesCommon.trim() || dapFueraDeTope) return;
    setBusy(true);
    const matched = findSpeciesByCommonName(f.speciesCommon);
    try {
      const r = await fetch("/api/admin/forestal/plan/census", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          planId, treeCode: f.treeCode.trim(), speciesCommon: f.speciesCommon.trim(),
          speciesScientific: matched?.scientificName ?? null, cites: matched?.cites ?? false,
          dapM: f.dapM ? Number(f.dapM) : null, alturaComercialM: f.alturaComercialM ? Number(f.alturaComercialM) : null,
          factorForma: Number(f.factorForma) || 0.65,
          utmZona: f.utmZona || null, utmX: f.utmX ? Number(f.utmX) : null, utmY: f.utmY ? Number(f.utmY) : null,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo agregar el árbol (error ${r.status})`);
        return;
      }
      setF({ ...f, treeCode: "", dapM: "", alturaComercialM: "", utmX: "", utmY: "" });
      onChange();
    } catch (err) {
      console.warn("[LothPlanView] agregar árbol falló", err);
      toast.error("No se pudo agregar el árbol — revisa tu conexión.");
    } finally { setBusy(false); }
  }
  /** Importa las filas ya validadas por el modal (shape del endpoint bulk). */
  async function doImport(filas: Record<string, unknown>[]) {
    if (busy || filas.length === 0) return;
    setBusy(true); setMsg(null);
    const rows = filas.map((f) => {
      const matched = findSpeciesByCommonName(String(f.speciesCommon ?? ""));
      return { ...f, speciesScientific: matched?.scientificName ?? null, cites: matched?.cites ?? false };
    });
    try {
      const r = await fetch("/api/admin/forestal/plan/census?bulk=1", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ planId, rows }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(typeof j?.error === "string" ? j.error : `No se pudo importar el censo (error ${r.status})`);
        return;
      }
      setMsg(`Importados ${j.creados ?? 0} árboles${j.errores?.length ? ` · ${j.errores.length} con error` : ""}.`);
      setImporting(false); onChange();
    } catch (err) {
      console.warn("[LothPlanView] importar censo falló", err);
      toast.error("No se pudo importar el censo — revisa tu conexión.");
    } finally { setBusy(false); }
  }

  async function del(t: Tree) {
    // El árbol del censo es el punto de partida de la trazabilidad: si ya fue
    // talado, borrarlo deja la cadena sin origen. Se avisa con nombre y código.
    const ok = await confirm({
      title: `¿Borrar el árbol ${t.treeCode} del censo?`,
      description: `${t.speciesCommon ?? "Sin especie"} · es el origen de la cadena de custodia. Si ya se taló, su trazabilidad queda sin punto de partida. No se puede deshacer.`,
      intent: "danger",
      confirmLabel: "Sí, borrar el árbol",
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/admin/forestal/plan/census?id=${t.id}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo borrar el árbol (error ${r.status})`);
        return;
      }
      onChange();
    } catch (err) {
      console.warn("[LothPlanView] borrar árbol falló", err);
      toast.error("No se pudo borrar el árbol — revisa tu conexión.");
    }
  }

  return (
    <BloquePlan
      id="loth-plan-censo"
      titulo="Censo forestal"
      sub={
        <>
          <span className="font-mono tabular-nums">{formatNumber(total)}</span> {total === 1 ? "árbol" : "árboles"} en el censo
          {truncado && <> · se cargaron <span className="font-mono tabular-nums">{formatNumber(trees.length)}</span></>}
        </>
      }
      acciones={
        <>
          {trees.length === 0 && (
            <button type="button" onClick={() => setImporting(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Upload className="h-3.5 w-3.5" /> Importar censo</button>
          )}
          <AddBtn onClick={() => setOpen(true)} />
        </>
      }
    >
      <div className="space-y-3 p-4">
      <LothCensoImportModal
        open={importing}
        importing={busy}
        ctx={{
          codigosExistentes: new Set(trees.map((t) => t.treeCode.toLowerCase())),
          especiesAutorizadas: authorizedSpecies,
          dmcOverrides,
        }}
        onClose={() => setImporting(false)}
        onImport={doImport}
      />
      {msg && <p className="text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{msg}</p>}
      <AdminModal
        open={open}
        onClose={() => setOpen(false)}
        title="Agregar árbol al censo"
        description="Cada árbol censado es el punto de partida de la cadena de custodia; la Tala lo jala por su código."
        icon={TreePine}
        variant="wide"
      >
        <form onSubmit={add} className="space-y-4 px-5 py-5 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Código del árbol *"><input value={f.treeCode} onChange={(e) => set("treeCode", e.target.value)} placeholder="85-TOR" autoFocus /* eslint-disable-line jsx-a11y/no-autofocus -- el modal se abre para escribir el código del árbol de inmediato */ className={cls} /></Field>
            <Field label="Especie *"><input value={f.speciesCommon} onChange={(e) => set("speciesCommon", e.target.value)} placeholder="Tornillo" className={cls} /></Field>
            <Field label="DAP — diámetro a la altura del pecho (m)">
              <input
                type="number"
                step="0.001"
                value={f.dapM}
                onChange={(e) => set("dapM", e.target.value)}
                placeholder="0.850"
                aria-invalid={dapFueraDeTope}
                className={`${cls} ${dapFueraDeTope ? "border-[var(--data-error-500)] focus:border-[var(--data-error-500)]" : ""}`}
              />
            </Field>
            <Field label="Altura comercial (m)"><input type="number" step="0.01" value={f.alturaComercialM} onChange={(e) => set("alturaComercialM", e.target.value)} placeholder="18.00" className={cls} /></Field>
            <Field label="Factor de forma"><input type="number" step="0.01" value={f.factorForma} onChange={(e) => set("factorForma", e.target.value)} placeholder="0.65" className={cls} /></Field>
            <Field label="Volumen estimado (m³)"><input disabled value={auto > 0 ? fmtM3(auto) : ""} placeholder="se calcula solo" className={`${cls} opacity-70`} /></Field>
          </div>
          {dapFueraDeTope && (
            <p className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2 text-xs font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              {dapMensaje}
              {dapSugerido != null && (
                <button
                  type="button"
                  onClick={() => set("dapM", String(dapSugerido))}
                  className="rounded-md border border-[var(--data-error-500)]/50 bg-[var(--surface-raised)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)] dark:text-[var(--data-error-500)]"
                >
                  Usar {fmtDapM(dapSugerido)} m
                </button>
              )}
            </p>
          )}
          {dapAvisoTexto && (
            <p className="text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              {dapAvisoTexto}
            </p>
          )}
          <p className="text-xs text-[var(--text-tertiary)]">El volumen sale de DAP² × π/4 × altura comercial × factor de forma. Si el árbol está por debajo del DMC de su especie, el libro va a bloquear su tala.</p>
          <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="submit" disabled={busy || !f.treeCode.trim() || !f.speciesCommon.trim() || dapFueraDeTope} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar al censo
            </button>
          </div>
        </form>
      </AdminModal>
      {trees.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 grow basis-[14rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código o especie…"
              aria-label="Buscar en el censo por código o especie"
              className={`${cls} pl-9`}
            />
          </div>
          <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} aria-label="Filtrar por estado del árbol" className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none">
            <option value="todos">Todos los estados</option>
            <option value="en_pie">En pie</option>
            <option value="talado">Talado</option>
            <option value="descartado">Descartado</option>
          </select>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Filtrar por categoría POA" className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none">
            <option value="todas">Toda categoría POA</option>
            <option value="aprovechable">Aprovechables</option>
            <option value="semillero">Semilleros</option>
            <option value="bajo_dmc">Bajo DMC</option>
            <option value="sin_dap">Sin DAP</option>
          </select>
          <span className="text-xs tabular-nums text-[var(--text-secondary)]">
            {/* Tres números distintos y los tres importan: lo que se ve, lo que
                pasa el filtro y lo que hay. Con uno solo, 200 filas de 3.000
                parecen el censo entero. */}
            {Math.min(visibles, filtered.length)} de {filtered.length}
            {filtered.length !== total && <> · {formatNumber(total)} en el censo</>}
          </span>
        </div>
      )}
      <Table head={["Código", "Especie", "DAP", "Hc", "Vol. est. m³", "Categoría POA", "Estado", ""]} alto="max-h-[60vh]">
        {filtered.slice(0, visibles).map((t) => {
          const fuera = outOfPlan(t.speciesCommon);
          return (
          <tr key={t.id} className={`border-t border-[var(--rule-soft)] ${fuera ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12" : ""}`}>
            <Cell><Mono bold>{t.treeCode}</Mono></Cell>
            <Cell><span className="text-[var(--text-primary)]">{t.speciesCommon}</span>{t.cites && <CitesPill />}{fuera && <span className="ml-1.5 rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/20 dark:text-[var(--data-error-500)]">NO EN PLAN</span>}</Cell>
            <Cell right><Mono>{n(t.dapM, 2)}</Mono></Cell>
            <Cell right><Mono>{n(t.alturaComercialM, 2)}</Mono></Cell>
            <Cell right><Mono bold>{n(t.volumenEstimadoM3)}</Mono></Cell>
            <Cell><CategoriaTag categoria={categorias.get(t.id)} /></Cell>
            <Cell><EstadoTag estado={t.estado} /></Cell>
            <Cell right><button type="button" onClick={() => void del(t)} title={`Borrar ${t.treeCode}`} aria-label={`Borrar el árbol ${t.treeCode}`} className="text-[var(--data-error-600)] hover:text-[var(--data-error-700)]"><Trash2 className="h-4 w-4" /></button></Cell>
          </tr>
          );
        })}
        {trees.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-2 h-8 w-8 opacity-30" />Sin árboles censados. Agrega o importa el censo (CSV).</td></tr>}
        {trees.length > 0 && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">Ningún árbol coincide con el filtro.</td></tr>}
      </Table>
      {filtered.length > visibles && (
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => setVisibles((v) => v + 200)}
            className="h-10 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Ver 200 más ({formatNumber(filtered.length - visibles)} restantes)
          </button>
          {truncado && (
            <p className="text-center text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              Además hay {formatNumber(total - trees.length)} árboles que no se cargaron: filtra por estado para alcanzarlos.
            </p>
          )}
        </div>
      )}
      </div>
    </BloquePlan>
  );
}
