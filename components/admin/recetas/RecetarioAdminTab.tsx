"use client";

/**
 * Recetario web: las recetas PÚBLICAS de la tienda (con pasos, tiempo y
 * porciones). No es la receta de producción de la pestaña «Recetas»: ésta se
 * publica a los clientes, aquella descuenta insumos. Fila de filtros pegada a
 * la tabla; por receta, «Editar» y un «⋯» con publicar/ocultar y eliminar.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Plus, BookOpen, Clock, Users, Eye, EyeOff, Trash2, MoreHorizontal } from "@buleje/design-system/icons";
import { DataTable, LoadingState } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModal from "@/components/admin/shared/AdminModal";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { useOrdenColumnas, EnOrden, BotonRestablecerColumnas } from "@/components/admin/shared/columnas-ordenables";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { ModalRecetario } from "./ModalRecetario";
import { CATEGORIAS, type ProductSearch, type RecetaPublica } from "./recetario-tipos";

const CAJA = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const TH = "px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]";

async function mensajeDeError(res: Response, porDefecto: string) {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === "string" ? body.error : `${porDefecto} (error ${res.status})`;
}

export default function RecetarioAdminTab() {
  const [recetas, setRecetas] = useState<RecetaPublica[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCat, setFilterCat] = useState("");
  // Columnas de la tabla: arrastrar el título para reordenarlas.
  const ordenRecetario = useOrdenColumnas("recetario-lista", ["receta", "categoria", "ingredientes", "costo", "estado"]);
  const [form, setForm] = useState<{ abierto: boolean; receta: RecetaPublica | null; clave: number }>({ abierto: false, receta: null, clave: 0 });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductSearch[]>([]);

  const fetchRecetas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/recetario");
      if (res.ok) {
        const data = await res.json();
        setRecetas(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRecetas(); }, [fetchRecetas]);

  // Productos para sugerir al escribir un ingrediente.
  useEffect(() => {
    fetch("/api/products?limit=500")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setProducts(d); })
      .catch((err) => console.warn("[RecetarioAdminTab] products fetch failed:", String(err)));
  }, []);

  const abrirForm = (receta: RecetaPublica | null) => setForm(f => ({ abierto: true, receta, clave: f.clave + 1 }));
  const cerrarForm = () => setForm(f => ({ ...f, abierto: false }));

  const toggleActiva = async (r: RecetaPublica) => {
    if (!r._noteId) return;
    try {
      const res = await fetch(`/api/admin/recetario/${r._noteId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ activa: !r.activa }),
      });
      if (!res.ok) { toast.error(await mensajeDeError(res, "No se pudo cambiar el estado")); return; }
      fetchRecetas();
    } catch (err) {
      console.warn("[RecetarioAdminTab] cambiar estado falló", err);
      toast.error("No se pudo cambiar el estado — revisa tu conexión.");
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      const res = await fetch(`/api/admin/recetario/${noteId}`, { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok) { toast.error(await mensajeDeError(res, "No se pudo eliminar la receta")); return; }
      toast.success("Receta eliminada");
      setDeleteConfirm(null);
      fetchRecetas();
    } catch (err) {
      console.warn("[RecetarioAdminTab] eliminar receta falló", err);
      toast.error("No se pudo eliminar la receta — revisa tu conexión.");
    }
  };

  const filtered = useMemo(() => recetas.filter(r =>
    (!searchTerm || r.nombre.toLowerCase().includes(searchTerm.toLowerCase())) && (!filterCat || r.categoria === filterCat),
  ), [recetas, searchTerm, filterCat]);

  const activas = recetas.filter(r => r.activa !== false).length;
  const avgIng = recetas.length > 0 ? Math.round(recetas.reduce((s, r) => s + (r.ingredientes?.length || 0), 0) / recetas.length) : 0;
  const avgCost = recetas.length > 0 ? recetas.reduce((s, r) => s + (r.totalIngredientes || 0), 0) / recetas.length : 0;

  const kpis = useKpisPlegables({
    claveMemoria: "recetas-recetario",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && recetas.length === 0,
    resumen: `${activas} publicada${activas === 1 ? "" : "s"} · costo prom. ${formatCurrency(avgCost)}`,
    tarjetas: [
      ["Recetas publicadas", String(activas)],
      ["Ingredientes promedio", String(avgIng)],
      ["Costo promedio", formatCurrency(avgCost)],
    ].map(([rotulo, valor]) => (
      <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</p>
      </div>
    )),
  });

  const accionesDe = (r: RecetaPublica): MenuAccion[] => [
    { id: "activa", label: r.activa !== false ? "Ocultar de la tienda" : "Publicar en la tienda", icon: r.activa !== false ? EyeOff : Eye, onSelect: () => toggleActiva(r) },
    { id: "eliminar", label: "Eliminar", icon: Trash2, tone: "danger", onSelect: () => setDeleteConfirm(r._noteId || null) },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <label className="relative min-w-0 grow basis-full sm:basis-60">
          <span className="sr-only">Buscar receta</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input type="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar receta…" className={cn(CAJA, "w-full pl-9 pr-3 placeholder:text-[var(--text-tertiary)]")} />
        </label>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} aria-label="Filtrar por categoría" className={cn(CAJA, "shrink-0 px-3")}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c} ({recetas.filter(r => r.categoria === c).length})</option>)}
        </select>
        <BotonRestablecerColumnas cambiado={ordenRecetario.cambiado} onRestablecer={ordenRecetario.restablecer} />
        <div className="ml-auto flex items-center gap-2">
          {kpis.boton}
          <button type="button" onClick={() => abrirForm(null)} className={button({ variant: "primary", className: "shrink-0 gap-2 rounded-xl" })}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva receta
          </button>
        </div>
      </div>
      {kpis.panel}

      {loading ? (
        <LoadingState />
      ) : recetas.length === 0 ? (
        // «No hay nada» se decide por el total SIN filtrar: con filtro que deja todo afuera, la tabla sigue y ofrece quitarlo.
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-10 text-center">
          <BookOpen className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">Aún no hay recetas en el recetario.</p>
          <button type="button" onClick={() => abrirForm(null)} className={button({ variant: "secondary", className: "rounded-xl" })}>Crear la primera receta</button>
        </div>
      ) : (
        <DataTable className="w-full">
          <thead ref={ordenRecetario.refCabecera}>
            <tr>
              <EnOrden
                orden={ordenRecetario.orden}
                celdas={{
                  receta: <th data-col="receta" className={TH}>Receta</th>,
                  categoria: <th data-col="categoria" className={cn(TH, "hidden sm:table-cell")}>Categoría</th>,
                  ingredientes: <th data-col="ingredientes" className={cn(TH, "hidden text-center md:table-cell")}>Ingredientes</th>,
                  costo: <th data-col="costo" className={cn(TH, "text-right")}>Costo</th>,
                  estado: <th data-col="estado" className={cn(TH, "text-center")}>Estado</th>,
                }}
              />
              <th className={TH}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center">
                  <p className="text-sm text-[var(--text-secondary)]">Ninguna receta coincide con el filtro.</p>
                  <button type="button" onClick={() => { setSearchTerm(""); setFilterCat(""); }} className={button({ variant: "secondary", className: "mt-2 rounded-xl" })}>Quitar filtros</button>
                </td>
              </tr>
            )}
            {filtered.map(r => (
              <tr key={r._noteId || r.id}>
                <EnOrden
                  orden={ordenRecetario.orden}
                  celdas={{
                    receta: (
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="text-lg" aria-hidden>{r.emoji}</span>
                          <div>
                            <p className="font-medium text-[var(--text-primary)]">{r.nombre}</p>
                            <p className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{r.tiempoMinutos} min</span>
                              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />{r.porciones} porc.</span>
                            </p>
                          </div>
                        </div>
                      </td>
                    ),
                    categoria: <td className="hidden text-[var(--text-secondary)] sm:table-cell">{r.categoria}</td>,
                    ingredientes: <td className="hidden text-center text-[var(--text-secondary)] md:table-cell">{r.ingredientes?.length || 0}</td>,
                    costo: <td className="text-right font-bold tabular-nums">{formatCurrency(r.totalIngredientes || 0)}</td>,
                    estado: (
                      <td className={cn("text-center font-semibold", r.activa !== false ? "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]")}>
                        {r.activa !== false ? "Publicada" : "Oculta"}
                      </td>
                    ),
                  }}
                />
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => abrirForm(r)} className={button({ variant: "secondary", className: "rounded-xl" })}>Editar</button>
                    <ActionMenu label="Más" icon={MoreHorizontal} soloIcono size="md" className="w-12 shrink-0" title={`Más acciones de ${r.nombre}`} actions={accionesDe(r)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <AdminModal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Eliminar receta" variant="centered-sm">
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <p className="text-sm text-[var(--text-secondary)]">Esta acción no se puede deshacer. La receta se eliminará del recetario público.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDeleteConfirm(null)} className={button({ variant: "secondary", className: "flex-1 rounded-xl" })}>Cancelar</button>
            <button type="button" onClick={() => deleteConfirm && handleDelete(deleteConfirm)} className={button({ variant: "danger", className: "flex-1 rounded-xl" })}>Eliminar</button>
          </div>
        </div>
      </AdminModal>

      <ModalRecetario key={form.clave} abierto={form.abierto} editando={form.receta} products={products} onCerrar={cerrarForm} onGuardada={fetchRecetas} />
    </div>
  );
}
