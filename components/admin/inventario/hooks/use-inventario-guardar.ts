import { useEffect, useRef, type FormEvent } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { useInventarioEstado } from "@/components/admin/inventario/hooks/use-inventario-estado";
import { useInventarioCarga } from "@/components/admin/inventario/hooks/use-inventario-carga";
import { useInventarioImagenes } from "@/components/admin/inventario/hooks/use-inventario-imagenes";
import { useInventarioMasivo } from "@/components/admin/inventario/hooks/use-inventario-masivo";
import { useInventarioPedidos } from "@/components/admin/inventario/hooks/use-inventario-pedidos";
import { useInventarioFiltros } from "@/components/admin/inventario/hooks/use-inventario-filtros";
import type { GuardarCosto } from "@/components/admin/inventario/CostoEnFila";
import { formatCurrency } from "@/lib/format";
import { centimosDelCosto } from "@/lib/inventario/costo-en-fila";

/** Dar de alta un producto y seleccionar todo lo filtrado (usan `formCategories` y `filteredProducts`, por eso van al final). Parte de `useInventario`. */
export function useInventarioGuardar(previo: ReturnType<typeof useInventarioEstado> & ReturnType<typeof useInventarioCarga> & ReturnType<typeof useInventarioImagenes> & ReturnType<typeof useInventarioMasivo> & ReturnType<typeof useInventarioPedidos> & ReturnType<typeof useInventarioFiltros>) {
  const {
    saving, setSaving, setShowAdd, EMPTY_ADD, addForm, setAddForm, addVariants, setAddVariants,
    addModifierGroups, setAddModifierGroups, addSeo, setAddSeo, addGallery, setAddGallery, addSpecs,
    addRich, selectedIds, setSelectedIds, load, formCategories, filteredProducts,
    products, setProducts, showUndo, showExtendedCols, faltaDato,
  } = previo;
  const addProduct = async (e: FormEvent) => {
    e.preventDefault();
    // BUG-FIX (audit 2026-05-05): guard contra doble-submit + chequeo res.ok
    if (saving) return;
    if (!addForm.name || !addForm.price) return;
    // Guard anti-categoría-vacía (las categorías cargan async).
    const category = addForm.category || formCategories[0]?.id || "general";
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...addForm,
          category,
          price: Number(addForm.price),
          costPrice: addForm.costPrice ? Number(addForm.costPrice) : undefined,
          badge: addForm.badge || undefined,
          barcode: addForm.barcode || undefined,
          // Stock ilimitado (trackStock=false o servicio) → null en los 3.
          stock: !addForm.trackStock || addForm.type === "service" ? null : (addForm.stock !== "" ? Number(addForm.stock) : undefined),
          stockMin: !addForm.trackStock || addForm.type === "service" ? null : (addForm.stockMin !== "" ? Number(addForm.stockMin) : undefined),
          stockMax: !addForm.trackStock || addForm.type === "service" ? null : (addForm.stockMax !== "" ? Number(addForm.stockMax) : undefined),
          expiryDate: addForm.expiryDate || undefined,
          // ── Producto/servicio completo ──
          type: addForm.type || "product",
          description: addForm.description || undefined,
          brand: addForm.brand || undefined,
          sku: addForm.sku || undefined,
          taxType: addForm.taxType || undefined,
          weightKg: addForm.weightKg !== "" ? Number(addForm.weightKg) : undefined,
          dimensions: addForm.dimensions || undefined,
          durationLabel: addForm.durationLabel || undefined,
          pricingUnit: addForm.pricingUnit || undefined,
          notes: addForm.notes || undefined,
          // Contenido rico (estilo Amazon).
          specs: addSpecs.filter((s) => s.label.trim() && s.value.trim()),
          richContent: addRich.filter((b) => (b.heading?.trim() || b.body?.trim() || b.imageUrl)),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || `No se pudo crear el producto (HTTP ${res.status})`);
        setSaving(false);
        return;
      }
      // Fase 2: persistir presentaciones/variantes y modificadores si los hay.
      const created = await res.json().catch((err) => { console.error("[InventoryTab] parse producto creado falló", err); return null; }) as { id?: number } | null;
      const newId = created?.id;
      const extras: string[] = [];
      let extrasFailed = 0;

      // Variantes → POST /api/marketplace/products/[id]/variants (1 por fila).
      const validVariants = addVariants.filter(v => v.name.trim());
      if (newId && validVariants.length > 0) {
        const basePrice = Number(addForm.price) || 0;
        const results = await Promise.allSettled(validVariants.map(v =>
          fetch(`/api/marketplace/products/${newId}/variants`, {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              name: v.name.trim(),
              priceModifier: (v.price !== "" ? Number(v.price) : basePrice) - basePrice,
              stock: v.stock !== "" ? Number(v.stock) : undefined,
            }),
          }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
        ));
        const failed = results.filter(r => r.status === "rejected").length;
        extrasFailed += failed;
        if (validVariants.length - failed > 0) extras.push(`${validVariants.length - failed} presentación(es)`);
        if (failed > 0) console.error("[InventoryTab] addProduct: variantes fallidas", results);
      }

      // Modificadores → PUT /api/products/[id]/modifiers (recrea groups+options).
      const validGroups = addModifierGroups
        .map(g => ({ ...g, options: g.options.filter(o => o.name.trim()) }))
        .filter(g => g.name.trim() && g.options.length > 0);
      if (newId && validGroups.length > 0) {
        try {
          const r = await fetch(`/api/products/${newId}/modifiers`, {
            method: "PUT",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              groups: validGroups.map((g, gi) => ({
                name: g.name.trim(),
                required: g.required,
                minSelect: g.required ? 1 : 0,
                maxSelect: g.multi ? Math.max(1, g.options.length) : 1,
                position: gi,
                options: g.options.map((o, oi) => ({
                  name: o.name.trim(),
                  priceDelta: o.priceDelta !== "" ? Math.max(0, Number(o.priceDelta)) : 0,
                  position: oi,
                })),
              })),
            }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          extras.push(`${validGroups.length} grupo(s) de opciones`);
        } catch (err) {
          console.error("[InventoryTab] addProduct: modificadores fallidos", err);
          extrasFailed += 1;
        }
      }

      // Galería → POST /api/marketplace/products/[id]/images (1 por foto, extra).
      const gallery = addGallery.filter(Boolean);
      if (newId && gallery.length > 0) {
        const results = await Promise.allSettled(gallery.map((url, i) =>
          fetch(`/api/marketplace/products/${newId}/images`, {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ url, position: i + 1, isPrimary: false }),
          }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
        ));
        const failed = results.filter(r => r.status === "rejected").length;
        extrasFailed += failed;
        if (gallery.length - failed > 0) extras.push(`${gallery.length - failed} foto(s)`);
        if (failed > 0) console.error("[InventoryTab] addProduct: galería fallida", results);
      }

      // SEO → PUT /api/marketplace/products/[id]/seo (la página de producto lo lee).
      const seoBody: Record<string, string> = {};
      if (addSeo.metaTitle.trim()) seoBody.metaTitle = addSeo.metaTitle.trim();
      if (addSeo.metaDescription.trim()) seoBody.metaDescription = addSeo.metaDescription.trim();
      if (addSeo.ogImage.trim()) seoBody.ogImage = addSeo.ogImage.trim();
      if (newId && Object.keys(seoBody).length > 0) {
        try {
          const r = await fetch(`/api/marketplace/products/${newId}/seo`, {
            method: "PUT",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(seoBody),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          extras.push("SEO");
        } catch (err) {
          console.error("[InventoryTab] addProduct: SEO falló", err);
          extrasFailed += 1;
        }
      }

      if (extrasFailed > 0) toast.error(`Producto creado, pero ${extrasFailed} extra(s) no se guardaron`);
      else if (extras.length > 0) toast.success(`Producto creado · ${extras.join(" · ")}`);
      else toast.success("Producto creado");

      setShowAdd(false);
      setAddForm(EMPTY_ADD);
      setAddVariants([]);
      setAddModifierGroups([]);
      setAddSeo({ metaTitle: "", metaDescription: "", ogImage: "" });
      setAddGallery([]);
      load();
    } catch (err) {
      console.error("[InventoryTab] addProduct error", err);
      toast.error("Error de conexión. Reintenta.");
    }
    setSaving(false);
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };
  // Costo en la fila (FAC-2): la misma ruta que la ventana de editar, con
  // SÓLO el costo. Soles con 2 decimales salidos de céntimos enteros; null =
  // quitar el costo (nunca 0). Al volver, el producto se actualiza en la
  // lista: el filtro «Sin costo» y sus cifras se recalculan sin recargar.
  const ponerCosto = async (productId: number, soles: number | null): Promise<string | null> => {
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ costPrice: soles }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string; costPrice?: number | string | null } | null;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return "No tienes permiso para cambiar costos";
        return json?.error || `No se guardó (HTTP ${res.status})`;
      }
      const guardado = json?.costPrice != null && Number(json.costPrice) > 0 ? Number(json.costPrice) : undefined;
      setProducts((prev) => prev.map((x) => (x.id === productId ? { ...x, costPrice: guardado } : x)));
      return null;
    } catch (err) {
      console.error("[Inventario] guardar costo falló", err);
      return "Sin conexión: reintenta";
    }
  };
  // La lista al momento del clic en «Deshacer» (el cierre de guardarCosto ve
  // la de antes de guardar).
  const productosAhora = useRef(products);
  useEffect(() => { productosAhora.current = products; }, [products]);
  const guardarCosto: GuardarCosto = async (productId, centimos) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return "Ese producto ya no está en la lista";
    const antes = p.costPrice != null && p.costPrice > 0 ? p.costPrice : null;
    const soles = centimos == null ? null : centimos / 100;
    const fallo = await ponerCosto(productId, soles);
    if (fallo) return fallo;
    showUndo({
      message: soles == null ? `${p.name}: costo quitado` : `${p.name}: costo ${formatCurrency(soles)}`,
      detail: antes != null ? `Antes: ${formatCurrency(antes)}` : undefined,
      onUndo: () => {
        // Si el costo ya no es el que puso ESTE guardado (lo corregiste otra
        // vez, o desde la ventana de editar), deshacer pisaría el nuevo.
        const actual = productosAhora.current.find((x) => x.id === productId);
        if (!actual || centimosDelCosto(actual.costPrice) !== centimos) {
          toast.info(`${p.name}: el costo ya cambió; no se deshizo`);
          return;
        }
        void ponerCosto(productId, antes).then((e) => {
          if (e) toast.error(`No se pudo deshacer: ${e}`);
        });
      },
    });
    return null;
  };
  /** La columna Costo se ve con «Más columnas» o cuando el filtro pide completar costos. */
  const verColumnaCosto = showExtendedCols || faltaDato === "sin-costo" || faltaDato === "incompleto";
  return {
    addProduct, toggleSelectAll, guardarCosto, verColumnaCosto,
  };
}
