"use client";

/**
 * El censo forestal: buscar, filtrar, agregar, importar y borrar árboles.
 *
 * «Importar censo» está SIEMPRE en el bloque (y en «Opciones» de la vista, que
 * llega acá por `importarSignal`): el regente manda la hoja por partes, y los
 * códigos que ya están se descartan con su motivo en la vista previa. La tabla
 * scrollea dentro de su caja con la cabecera fija: un censo de miles de
 * árboles no empuja el croquis tres pantallas más abajo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Upload } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { CATEGORIA_LABEL } from "@/lib/forestal/loth-poa";
import { formatNumber } from "@/lib/format";
import LothCensoArbolForm from "./LothCensoArbolForm";
import LothCensoImportModal from "./LothCensoImportModal";
import LothCensoTabla from "./LothCensoTabla";
import { BarraSeleccion, BotonBorrarTodos, useBorrarArboles } from "./LothCensoSeleccion";
import { ordenarPorCodigo, sugerirPorEspecie, type ArbolCenso, type EspeciePlanCenso } from "./loth-censo-arbol";
import type { Tree } from "./loth-plan-shared";
import { AddBtn, BloquePlan, cls } from "./loth-plan-ui";

const SIN_ESPECIES: (EspeciePlanCenso & { cites?: boolean })[] = [];

export default function LothPlanCenso({ planId, trees, total, truncado, authorizedSpecies, categorias, dmcOverrides, onChange, importarSignal = 0, especies = SIN_ESPECIES, plantacion = false }: {
  planId: string; trees: Tree[]; total: number; truncado: boolean; authorizedSpecies: Set<string>;
  /** Registro de plantación (ADR-459): no hay censo, hay árboles marcados (opcionales). */
  plantacion?: boolean;
  /** Cada incremento abre el importador (lo pide «Opciones» de la vista). */
  importarSignal?: number;
  /** DMC fijado por el plan — el importador avisa si una fila cae por debajo. */
  dmcOverrides: Record<string, number>;
  /** Categoría POA por árbol (aprovechable / semillero / bajo DMC…). */
  categorias: Map<string, keyof typeof CATEGORIA_LABEL>;
  /** Especies del plan: el alta y la importación toman de acá el científico. */
  especies?: (EspeciePlanCenso & { cites?: boolean })[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  /** Cambia tras importar: el modal vuelve a nacer vacío (no con la hoja ya importada). */
  const [importKey, setImportKey] = useState(0);
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

  /** Por código natural: el servidor ordena como texto y «13» salía antes que «2». */
  const arboles = useMemo(() => ordenarPorCodigo<ArbolCenso>(trees), [trees]);
  // Buscador (código / especie / científico / nativo) + filtros, sobre el censo completo.
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return arboles.filter((t) => {
      if (estadoFilter !== "todos" && t.estado !== estadoFilter) return false;
      if (catFilter !== "todas" && categorias.get(t.id) !== catFilter) return false;
      if (query && !`${t.treeCode} ${t.speciesCommon} ${t.speciesScientific ?? ""} ${t.speciesNative ?? ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [arboles, q, estadoFilter, catFilter, categorias]);
  // Un árbol cuya especie NO está autorizada en el plan = tala potencialmente ilegal.
  const outOfPlan = (name: string) => authorizedSpecies.size > 0 && !authorizedSpecies.has(claveEspecie(name));
  const importCtx = useMemo(() => ({
    codigosExistentes: new Set(trees.map((t) => t.treeCode.toLowerCase())),
    especiesAutorizadas: authorizedSpecies,
    dmcOverrides,
  }), [trees, authorizedSpecies, dmcOverrides]);
  const { confirm } = useConfirm();
  /** Seleccionados para borrar en bloque. Sólo cuentan los que siguen en el censo. */
  const [marcadosRaw, setMarcados] = useState<Set<string>>(() => new Set());
  const marcados = useMemo(() => new Set(trees.filter((t) => marcadosRaw.has(t.id)).map((t) => t.id)), [trees, marcadosRaw]);
  const { borrar: borrarVarios, borrando } = useBorrarArboles(planId, () => { setMarcados(new Set()); onChange(); });
  const alternar = (id: string) => setMarcados((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarIds = (ids: string[], marcar: boolean) => setMarcados((prev) => { const n = new Set(prev); for (const id of ids) { if (marcar) n.add(id); else n.delete(id); } return n; });

  /** Importa las filas ya validadas por el modal (shape del endpoint bulk). */
  async function doImport(filas: Record<string, unknown>[]) {
    if (busy || filas.length === 0) return;
    setBusy(true); setMsg(null);
    const rows = filas.map((f) => {
      const especie = String(f.speciesCommon ?? "");
      const delPlan = especies.find((s) => claveEspecie(s.speciesCommon) === claveEspecie(especie));
      const catalogo = findSpeciesByCommonName(especie);
      // El científico de la HOJA manda; sólo si viene vacío se toma del plan,
      // del censo o del catálogo. Antes el catálogo lo pisaba siempre (y sin
      // coincidencia lo dejaba en null aunque la hoja lo trajera).
      const cientifico = typeof f.speciesScientific === "string" && f.speciesScientific.trim() ? f.speciesScientific : sugerirPorEspecie(especie, especies, arboles).cientifico;
      return { ...f, speciesScientific: cientifico, cites: delPlan?.cites ?? catalogo?.cites ?? false };
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
      setImporting(false); setImportKey((k) => k + 1); onChange();
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
      titulo={plantacion ? "Árboles marcados" : "Censo forestal"}
      sub={
        <>
          <span className="font-mono tabular-nums">{formatNumber(total)}</span> {total === 1 ? "árbol" : "árboles"} {plantacion ? "marcados" : "en el censo"}
          {truncado && <> · se cargaron <span className="font-mono tabular-nums">{formatNumber(trees.length)}</span></>}
        </>
      }
      acciones={
        <>
          <button type="button" onClick={() => setImporting(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Upload className="h-3.5 w-3.5" /> {plantacion ? "Importar árboles" : "Importar censo"}</button>
          <BotonBorrarTodos total={total} borrando={borrando} onBorrar={() => void borrarVarios({ todos: true }, total, plantacion ? `los ${formatNumber(total)} árboles marcados` : `los ${formatNumber(total)} árboles del censo`)} />
          <AddBtn onClick={() => setOpen(true)} />
        </>
      }
    >
      <div className="space-y-3 p-4">
      <LothCensoImportModal
        key={importKey}
        open={importing}
        importing={busy}
        ctx={importCtx}
        onClose={() => setImporting(false)}
        onImport={doImport}
      />
      {msg && <p className="text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{msg}</p>}
      <LothCensoArbolForm
        open={open}
        onClose={() => setOpen(false)}
        planId={planId}
        arboles={arboles}
        especiesPlan={especies}
        autorizadas={authorizedSpecies}
        dmcOverrides={dmcOverrides}
        onAgregado={onChange}
      />
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
      <BarraSeleccion
        marcados={marcados.size}
        filtrados={filtered.length}
        borrando={borrando}
        onMarcarFiltrados={() => marcarIds(filtered.map((t) => t.id), true)}
        onLimpiar={() => setMarcados(new Set())}
        onBorrar={() => void borrarVarios({ ids: [...marcados] }, marcados.size, marcados.size === 1 ? "el árbol seleccionado" : `los ${formatNumber(marcados.size)} árboles seleccionados`)}
      />
      <LothCensoTabla
        arboles={filtered.slice(0, visibles)}
        marcados={marcados}
        onMarcar={alternar}
        onMarcarVisibles={(marcar) => marcarIds(filtered.slice(0, visibles).map((t) => t.id), marcar)}
        vacio={trees.length === 0}
        sinCoincidencias={trees.length > 0 && filtered.length === 0}
        fueraDelPlan={outOfPlan}
        categorias={categorias}
        onBorrar={(t) => void del(t)}
      />
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
