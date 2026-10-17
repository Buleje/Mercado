"use client";
/**
 * Productos e inventario › Categorías (también en Catálogo de la tienda).
 *
 * Una fila de cabecera (título ⓘ · Indicadores · Guardar · Nueva categoría ·
 * Más), el buscador pegado a la lista y la lista compacta con cuántos
 * productos tiene cada categoría. Datos y guardado en `categorias/use-categorias`.
 */
import { useMemo, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Check, Layers, Loader2, MoreHorizontal, Plus, RefreshCw, Save, Search, Sparkles } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { FilaCategoria } from "./categorias/FilaCategoria";
import { NuevaCategoriaModal } from "./categorias/NuevaCategoriaModal";
import { useCategorias } from "./categorias/use-categorias";
import { useIndicadoresCategorias } from "./categorias/use-indicadores-categorias";

export default function CategoriesEditorTab() {
  const ed = useCategorias();
  const kpis = useIndicadoresCategorias(ed.cats, ed.cargando);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [seoAbierto, setSeoAbierto] = useState<Set<string>>(new Set());
  const [arrastrada, setArrastrada] = useState<number | null>(null);

  const q = busqueda.trim().toLowerCase();
  const visibles = useMemo(
    () => (q ? ed.cats.filter((c) => c.label.toLowerCase().includes(q) || c.id.includes(q)) : ed.cats),
    [ed.cats, q],
  );

  const alternarSeo = (clave: string) =>
    setSeoAbierto((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });

  const acciones: MenuAccion[] = [
    {
      id: "seo",
      label: "Auto-generar SEO de todas",
      hint: "Título, descripción y palabras clave con el nombre de tu tienda; se guarda con «Guardar cambios»",
      icon: Sparkles,
      onSelect: ed.generarSeoTodas,
      disabled: ed.cats.length === 0,
    },
    { id: "actualizar", label: "Actualizar", hint: "Vuelve a contar los productos de cada categoría", icon: RefreshCw, onSelect: () => void ed.recargar() },
  ];

  const mostrarGuardar = ed.hayCambios || ed.guardando || ed.guardado;

  return (
    <div className="space-y-3">
      {/* Una fila: título ⓘ · Indicadores · Guardar · Nueva · Más. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Categorías</SectionTitle>
          <InfoTip
            title="Categorías"
            what="Las categorías de tu catálogo: las que creaste y las que ya usan tus productos, con cuántos productos tiene cada una."
            affects="Cambiar el nombre renombra la categoría de todos sus productos al guardar (en Productos y stock y en el POS). Si le pones el nombre de otra, se juntan. El orden y ocultar también se guardan con «Guardar cambios»."
            example="«Abarrotes · 11 productos»: la renombras «Despensa» y guardas → los 11 productos pasan a Despensa."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          {mostrarGuardar && (
            <button
              type="button"
              onClick={() => void ed.guardar()}
              disabled={ed.guardando || !ed.hayCambios}
              className={button({ variant: "primary", className: "gap-1.5 rounded-xl px-4" })}
            >
              {ed.guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : ed.guardado ? <Check className="h-4 w-4" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              {ed.guardado ? "Guardado" : <>Guardar<span className="hidden sm:inline">&nbsp;cambios</span></>}
            </button>
          )}
          <button
            type="button"
            onClick={() => setNuevaAbierta(true)}
            aria-label="Nueva categoría"
            className={button({ variant: mostrarGuardar ? "secondary" : "primary", className: "gap-1.5 rounded-xl px-3 sm:px-4" })}
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Nueva categoría</span>
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Auto-generar SEO y actualizar" />
        </div>
      </div>

      {kpis.panel}

      {ed.errorGuardar && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2 text-sm font-semibold text-[var(--data-error-ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {ed.errorGuardar}
        </p>
      )}

      {ed.cargando ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Cargando categorías…
        </div>
      ) : ed.errorCarga ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-ink)]">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <span className="flex-1">No se pudieron cargar las categorías: {ed.errorCarga}</span>
          <button type="button" onClick={() => void ed.cargar()} className={button({ variant: "secondary", className: "rounded-xl" })}>Reintentar</button>
        </div>
      ) : ed.cats.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-6 py-10 text-center">
          <Layers className="h-7 w-7 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">Todavía no tienes categorías: crea la primera y elígela al cargar tus productos.</p>
          <button type="button" onClick={() => setNuevaAbierta(true)} className={button({ variant: "primary", className: "gap-1.5 rounded-xl" })}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva categoría
          </button>
        </div>
      ) : (
        <>
          {ed.cats.length > 6 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-md">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar categoría…"
                  aria-label="Buscar categoría"
                  className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-12 pr-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
                />
              </div>
              <span className="text-sm text-[var(--text-secondary)]" aria-live="polite">
                {q ? `${visibles.length} de ${ed.cats.length}` : `${ed.cats.length} categorías`}
              </span>
            </div>
          )}
          {visibles.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--rule-base)] px-6 py-8 text-center text-sm text-[var(--text-secondary)]">
              Ninguna categoría coincide con «{busqueda}».
            </p>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)] overflow-clip rounded-2xl border border-[var(--rule-base)]">
              {visibles.map((cat) => {
                const indice = ed.cats.findIndex((c) => c.clave === cat.clave);
                return (
                  <FilaCategoria
                    key={cat.clave}
                    cat={cat}
                    indice={indice}
                    total={ed.cats.length}
                    puedeReordenar={!q}
                    arrastrada={arrastrada === indice}
                    seoAbierto={seoAbierto.has(cat.clave)}
                    onAlternarSeo={() => alternarSeo(cat.clave)}
                    onArrastrar={setArrastrada}
                    onSoltar={(hasta) => { if (arrastrada !== null) ed.mover(arrastrada, hasta); setArrastrada(null); }}
                    editor={ed}
                  />
                );
              })}
            </ul>
          )}
        </>
      )}

      <NuevaCategoriaModal abierto={nuevaAbierta} onCerrar={() => setNuevaAbierta(false)} onCrear={ed.crear} storeName={ed.storeName} />
    </div>
  );
}
