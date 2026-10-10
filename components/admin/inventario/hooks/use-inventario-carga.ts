import { useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAbrirFichaAlLlegar } from "@/hooks/use-abrir-ficha-al-llegar";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbProduct } from "@/lib/jsondb";
import { useInventarioEstado } from "@/components/admin/inventario/hooks/use-inventario-estado";

/** Carga del catálogo, base nacional, importar CSV y editar un producto. Parte de `useInventario`. */
export function useInventarioCarga(previo: ReturnType<typeof useInventarioEstado>) {
  const {
    setProducts, setMovements, setLoading, editModalProduct, setEditModalProduct, editForm,
    setEditForm, setSaving, setAddForm, editSpecs, setEditSpecs, editRich, setEditRich, setImgInfo,
    setImgError, dbQuery, setDbQuery, setDbResults, setDbSearching, csvImportRef, setCsvImporting,
    setCsvResult, products, loading, fichaProducto, setEditModalProductSinUrl,
  } = previo;

  const handleDbSearch = async () => {
    if (!dbQuery.trim()) return;
    setDbSearching(true);
    try {
      const res = await fetch(`/api/product-search?q=${encodeURIComponent(dbQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setDbResults(data.products ?? []);
      }
    } catch { /* ignore */ }
    setDbSearching(false);
  };

  const applyDbResult = (r: { name: string; brand: string; barcode: string; image: string; quantity: string; unit: string }) => {
    setAddForm(f => ({
      ...f,
      name: r.name || f.name,
      barcode: r.barcode || f.barcode,
      image: r.image || f.image,
      unit: r.unit || f.unit,
    }));
    setDbResults([]);
    setDbQuery("");
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // cache: "no-store" — sin esto el browser cachea la respuesta y los bulk
      // edits no se reflejan al recargar el listado (bug 2026-04-20 bulk-clear-images).
      const [pRes, mRes] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/inventory-movements", { cache: "no-store" }),
      ]);
      if (pRes.ok) setProducts(await pRes.json());
      if (mRes.ok) setMovements(await mRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [setLoading, setMovements, setProducts]);

  useEffect(() => { void load(); }, [load]);

  // ── CSV Bulk Import ────────────────────────────────────────────────────────
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvResult(null);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { setCsvImporting(false); return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, ""));
    const idx = (key: string) => headers.findIndex(h => h === key);
    const nameIdx = idx("nombre");
    const priceIdx = idx("precio");
    const categoryIdx = idx("categoria");
    const stockIdx = idx("stock");
    const costIdx = idx("costo");
    const unitIdx = idx("unidad");
    const barcodeIdx = idx("codigo");

    if (nameIdx === -1 || priceIdx === -1) {
      setCsvResult({ created: 0, errors: ["El CSV debe tener columnas 'nombre' y 'precio' como mínimo."] });
      setCsvImporting(false);
      if (csvImportRef.current) csvImportRef.current.value = "";
      return;
    }

    let created = 0;
    const errors: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      const name = nameIdx >= 0 ? cols[nameIdx] : "";
      const price = priceIdx >= 0 ? parseFloat(cols[priceIdx]) : NaN;
      if (!name || isNaN(price) || price <= 0) {
        errors.push(`Fila ${i + 1}: nombre o precio inválido`);
        continue;
      }
      const body: Record<string, unknown> = {
        name,
        price,
        category: categoryIdx >= 0 && cols[categoryIdx] ? cols[categoryIdx] : "otros",
        unit: unitIdx >= 0 && cols[unitIdx] ? cols[unitIdx] : "und",
        active: true,
      };
      if (stockIdx >= 0 && cols[stockIdx]) body.stock = parseInt(cols[stockIdx], 10);
      if (costIdx >= 0 && cols[costIdx]) body.costPrice = parseFloat(cols[costIdx]);
      if (barcodeIdx >= 0 && cols[barcodeIdx]) body.barcode = cols[barcodeIdx];
      try {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (res.ok) created++;
        else errors.push(`Fila ${i + 1}: Error API (${res.status})`);
      } catch {
        errors.push(`Fila ${i + 1}: Error de red`);
      }
    }
    setCsvResult({ created, errors });
    setCsvImporting(false);
    if (csvImportRef.current) csvImportRef.current.value = "";
    if (created > 0) void load();
  };

  // ── Product CRUD ───────────────────────────────────────────────────────────

  /** Llena la ventana de edición con el producto (sin tocar la URL). */
  const llenarEdicion = (p: DbProduct) => {
    setImgInfo(null);
    setImgError(null);
    setEditForm({
      name: p.name, price: p.price, category: p.category, unit: p.unit,
      badge: p.badge ?? "", active: p.active, image: p.image ?? "",
      barcode: p.barcode ?? "", costPrice: p.costPrice,
      // trackStock: si el producto no tenía stock definido, es ilimitado.
      trackStock: p.stock !== undefined && p.stock !== null,
      stock: p.stock, stockMin: p.stockMin, stockMax: p.stockMax,
      expiryDate: (p as DbProduct & { expiryDate?: string }).expiryDate ?? "",
      isVariant: false, variantOf: "", variantAttr: "",
      type: p.type ?? "product", brand: p.brand ?? "", sku: p.sku ?? "",
      taxType: p.taxType ?? "gravado", weightKg: p.weightKg, dimensions: p.dimensions ?? "",
      durationLabel: p.durationLabel ?? "", pricingUnit: p.pricingUnit ?? "fijo", notes: p.notes ?? "",
    });
  };
  const openEditModal = (p: DbProduct) => {
    setEditModalProduct(p);
    llenarEdicion(p);
  };
  const closeEditModal = () => { setEditModalProduct(null); setEditForm({}); setImgInfo(null); setImgError(null); setEditSpecs([]); setEditRich([]); };

  /* Llegar con `?producto=<id>` abre su ficha; el «atrás» la cierra (lib/admin/enlaces-panel). */
  useAbrirFichaAlLlegar<DbProduct>({
    idEnUrl: fichaProducto.id,
    idAbierto: editModalProduct ? String(editModalProduct.id) : null,
    listo: !loading,
    buscar: (id) => products.find((p) => String(p.id) === id),
    abrir: (p) => { setEditModalProductSinUrl(p); llenarEdicion(p); },
    cerrar: () => { setEditModalProductSinUrl(null); setEditForm({}); setImgInfo(null); setImgError(null); setEditSpecs([]); setEditRich([]); },
    noEsta: () => {
      toast.error("No encontramos ese producto en tu inventario.");
      fichaProducto.cerrar();
    },
  });

  // Contenido rico: inicializar specs/bloques al abrir el modal (cualquier vía).
  useEffect(() => {
    if (!editModalProduct) return;
    try {
      const a = editModalProduct.specsJson ? JSON.parse(editModalProduct.specsJson) : [];
      setEditSpecs(Array.isArray(a) ? a.filter((x: { label?: unknown; value?: unknown }) => typeof x?.label === "string" && typeof x?.value === "string") : []);
    } catch { setEditSpecs([]); }
    try {
      const a = editModalProduct.richContentJson ? JSON.parse(editModalProduct.richContentJson) : [];
      setEditRich(Array.isArray(a) ? a : []);
    } catch { setEditRich([]); }
  }, [editModalProduct, setEditRich, setEditSpecs]);

  const saveEdit = async () => {
    if (!editModalProduct) return;
    setSaving(true);
    setImgError(null);
    try {
      // Limpiar el body — Zod del backend strippa unknown keys, pero los que
      // el form maneja como string vacío para "sin valor" deben ir como null
      // o undefined para que el schema los acepte.
      const body: Record<string, unknown> = {};
      const allowedKeys = [
        "name", "category", "price", "costPrice", "image", "unit",
        "badge", "barcode", "stock", "stockMin", "stockMax", "active",
        "expiryDate", "description",
        // ── Producto/servicio completo ──
        "type", "brand", "sku", "taxType", "weightKg", "dimensions",
        "durationLabel", "pricingUnit", "notes",
      ] as const;
      for (const k of allowedKeys) {
        const v = (editForm as Record<string, unknown>)[k];
        if (v !== undefined && v !== "") body[k] = v;
      }
      // Contenido rico — siempre enviar (incl. vacío) para permitir limpiar.
      body.specs = editSpecs.filter((s) => s.label.trim() && s.value.trim());
      body.richContent = editRich.filter((b) => (b.heading?.trim() || b.body?.trim() || b.imageUrl));
      // Stock ilimitado (trackStock=false) → null explícito en los 3 campos
      // para que el backend los limpie ("stock" in body deja pasar el null).
      const tracks = (editForm as { trackStock?: boolean }).trackStock !== false
        && (editForm as { type?: string }).type !== "service";
      if (!tracks) {
        body.stock = null;
        body.stockMin = null;
        body.stockMax = null;
      }

      const res = await fetch(`/api/products/${editModalProduct.id}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string; issues?: string[] };
        const detail = (errBody.issues ?? []).join(", ");
        setImgError(`No se guardó: ${errBody.error ?? "error " + res.status}${detail ? ` — ${detail}` : ""}`);
        setSaving(false);
        return; // mantener modal abierto para que el usuario vea el error
      }
      closeEditModal();
      load();
    } catch (err) {
      setImgError(err instanceof Error ? err.message : "Error de red al guardar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: DbProduct) => {
    // Si el servidor rechaza (402 por plan vencido, 403, 503), el `load()` de
    // abajo devolvía el switch a su lugar sin decir nada: el usuario lo movía
    // tres veces creyendo que la pantalla estaba trabada.
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ active: !p.active }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          typeof body?.error === "string"
            ? body.error
            : `No se pudo ${p.active ? "desactivar" : "activar"} "${p.name}" (error ${res.status})`,
        );
      }
    } catch (err) {
      console.warn("[InventoryTab] toggleActive falló", err);
      toast.error("Sin conexión — el producto no cambió.");
    }
    load();
  };
  return {
    handleDbSearch, applyDbResult, load, handleCsvImport, openEditModal, closeEditModal, saveEdit,
    toggleActive,
  };
}
