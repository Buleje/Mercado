"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef, useMemo, type FormEvent } from "react";
import {
  Package, AlertTriangle, ArrowUp, ArrowDown, RefreshCw,
  Search, Loader2, ClipboardList, Plus, Pencil, Trash2,
  ScanBarcode, X, Camera, Download, CheckSquare, Filter, ChevronDown,
  TrendingUp, PackagePlus, Eye, EyeOff, Layers, ChevronRight, Upload, CheckCircle, BookOpen,
  Warehouse, Maximize2, Copy, Sliders,
} from "@buleje/design-system/icons";
import ProductModifiersEditor from "@/components/admin/inventario/ProductModifiersEditor";
import { ModuleActionMenu } from "@/components/admin/shared/ModuleActionMenu";
import EmptyState from "@/components/admin/shared/EmptyState";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useUndoToast } from "@/components/admin/shared/UndoToast";
import Image from "next/image";
import { cn, exportToCSV } from "@/lib/utils";
import { detectCategoryFromName } from "@/lib/category-detector";
import { exportToExcel } from "@/lib/export-excel";
import KardexModal from "./KardexModal";
import PriceSparkline from "./inventario/PriceSparkline";
import ImageWarningBadge from "./inventario/ImageWarningBadge";
import ImageUploadHints from "./inventario/ImageUploadHints";
import { validateImageUrl } from "@/lib/image-validators";
import { csrfHeaders } from "@/lib/csrf-client";
import { categories } from "@/data/products";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import type { DbProduct, DbInventoryMovement } from "@/lib/jsondb";
import dynamic from "next/dynamic";
import { usePagination, Paginator } from "@/hooks/use-pagination";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });
const ExpandedStockModal = dynamic(() => import("@/components/admin/inventario/ExpandedStockModal"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────

type View = "productos" | "kanban";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/${n.toFixed(2)}`; }

const realCategories = categories.filter(c => c.id !== "todos");

// Mejora 6: Rotation badge config
type RotationLevel = "rápido" | "normal" | "lento" | "muerto";
function getRotationInfo(salesPerWeek: number, stock: number): { level: RotationLevel; label: string; className: string } | null {
  if (salesPerWeek > 10) return { level: "rápido", label: "Rápido", className: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-orange-950/30 dark:text-[var(--data-warning)]" };
  if (salesPerWeek >= 3) return null; // Normal — no badge
  if (salesPerWeek >= 1) return { level: "lento", label: "Lento", className: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-yellow-950/30 dark:text-[var(--data-warning)]" };
  if (stock > 0) return { level: "muerto", label: "Sin rotar", className: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-red-950/30 dark:text-[var(--data-error)]" };
  return null;
}

// Mejora 7: Compute stock change from movements (últimos 30 días)
function computeStockChange(productId: number, movements: DbInventoryMovement[]): number {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let net = 0;
  for (const m of movements) {
    if (m.productId !== productId) continue;
    const ts = new Date(m.createdAt).getTime();
    if (ts < thirtyDaysAgo) continue;
    const qty = m.quantity ?? 0;
    const type = (m.type ?? "").toLowerCase();
    if (type === "compra" || type === "ajuste_positivo" || type === "devolucion") {
      net += qty;
    } else if (type === "venta" || type === "venta_online" || type === "ajuste_negativo" || type === "merma") {
      net -= qty;
    }
  }
  return net;
}

// Mejora 6: Compute sales per week from movements (últimos 30 días)
function computeSalesPerWeek(productId: number, movements: DbInventoryMovement[]): number {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let totalSold = 0;
  for (const m of movements) {
    if (m.productId !== productId) continue;
    const ts = new Date(m.createdAt).getTime();
    if (ts < thirtyDaysAgo) continue;
    const type = (m.type ?? "").toLowerCase();
    if (type === "venta" || type === "venta_online") {
      totalSold += Math.abs(m.quantity ?? 0);
    }
  }
  return totalSold / 4.3; // ~4.3 weeks in 30 days
}

// Resize a File to max 800×800 JPEG via canvas (client-side, ~40–80 KB output)
async function resizeImage(file: File, maxPx = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(objectUrl); reject(new Error("canvas unavailable")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("image load error")); };
    img.src = objectUrl;
  });
}

// ── InventoryContextMenu (right-click menu for product rows) ───────────────

interface InventoryContextMenuProps {
  product: DbProduct;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: (p: DbProduct) => void;
  onView: (p: DbProduct) => void;
  onDuplicate: (p: DbProduct) => void;
  onDelete: (p: DbProduct) => void;
}

function InventoryContextMenu({ product, x, y, onClose, onEdit, onView, onDuplicate, onDelete }: InventoryContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const items: Array<{ label: string; icon: typeof Pencil; onClick: () => void; variant?: "default" | "danger"; divider?: boolean }> = [
    { label: "Editar producto", icon: Pencil, onClick: () => onEdit(product) },
    { label: "Ver detalles", icon: Eye, onClick: () => onView(product) },
    { label: "Duplicar", icon: Copy, onClick: () => onDuplicate(product) },
    { label: "Eliminar", icon: Trash2, onClick: () => onDelete(product), variant: "danger", divider: true },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white dark:bg-zinc-900 rounded-xl border border-[var(--rule-soft)] dark:border-zinc-800 min-w-[180px] py-1 animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div key={i}>
            {item.divider && (
              <div className="my-1 border-t border-[var(--rule-soft)] dark:border-zinc-800" />
            )}
            <button
              onClick={item.onClick}
              className={cn(
                "w-full px-3 py-2 text-sm flex items-center gap-2 cursor-pointer transition-colors",
                item.variant === "danger"
                  ? "text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error)]/20"
                  : "text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-zinc-800",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function InventoryTab() {
  const { confirm } = useConfirm();
  const { showUndo } = useUndoToast();
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [movements, setMovements] = useState<DbInventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("productos");
  const [search, setSearch] = useState("");
  // Mejora visual: Placeholder rotativo en búsqueda
  const searchPlaceholders = ["Buscar por nombre...", "Buscar por código...", "Buscar por categoría..."];
  const [phIndex, setPhIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhIndex(i => (i + 1) % searchPlaceholders.length), 3000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [catFilter, setCatFilter] = useState("todos");
  const [lowOnly, setLowOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  // Mejora 8R2: Filtro sin imagen
  const [noImageOnly, setNoImageOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedOC, setExpandedOC] = useState(false);
  const [generatingOC, setGeneratingOC] = useState(false);

  // Product CRUD state
  const [editModalProduct, setEditModalProduct] = useState<DbProduct | null>(null);
  const [editForm, setEditForm] = useState<Partial<DbProduct & { expiryDate?: string; isVariant?: boolean; variantOf?: string; variantAttr?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerCat, setPickerCat] = useState("todos");
  const EMPTY_ADD = { name: "", category: "abarrotes", price: "", unit: "und", badge: "", image: "", barcode: "", costPrice: "", stock: "", stockMin: "", stockMax: "", expiryDate: "", isVariant: false, variantOf: "", variantAttr: "" };
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [showScanner, setShowScanner] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const addImgRef = useRef<HTMLInputElement>(null);
  const editImgRef = useRef<HTMLInputElement>(null);

  // National DB search
  const [dbQuery, setDbQuery] = useState("");
  const [dbResults, setDbResults] = useState<Array<{ name: string; brand: string; barcode: string; image: string; quantity: string; unit: string }>>([]);
  const [dbSearching, setDbSearching] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkField, setBulkField] = useState<"active" | "category" | "priceAdjust" | "pricePercent" | "stock">("active");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Bulk clear images
  const [bulkClearImagesConfirm, setBulkClearImagesConfirm] = useState(false);
  const [bulkClearingImages, setBulkClearingImages] = useState(false);
  const [dontAskBulkClear, setDontAskBulkClear] = useState(false);

  // Mejora 5 nueva: Auto-reorden config
  const [autoReorderConfigs, setAutoReorderConfigs] = useState<Record<number, { threshold: number; qty: number; supplierId: string }>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("auto-reorder-configs");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [showAutoReorder, setShowAutoReorder] = useState<number | null>(null);
  const [arThreshold, setArThreshold] = useState("");
  const [arQty, setArQty] = useState("");

  // Mejora 6 nueva: QR modal
  const [showQRProduct, setShowQRProduct] = useState<DbProduct | null>(null);

  // Mejora visual: Toggle de columnas extendidas
  const [showExtendedCols, setShowExtendedCols] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("inv-extended-cols") === "true"; } catch { return false; }
  });

  // Expanded table modal
  const [showExpandedTable, setShowExpandedTable] = useState(false);

  // CSV Import
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [kardexProduct, setKardexProduct] = useState<{ id: number; name: string } | null>(null);
  const [modifiersProduct, setModifiersProduct] = useState<{ id: number; name: string } | null>(null);

  // Context menu state for right-click on product rows
  const [ctxMenu, setCtxMenu] = useState<{ product: DbProduct; x: number; y: number } | null>(null);

  useScrollLock(!!(showAdd || showPicker || editModalProduct || showScanner || bulkModal || bulkDeleteConfirm || bulkClearImagesConfirm));

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
  }, []);

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

  const openEditModal = (p: DbProduct) => {
    setEditModalProduct(p);
    setEditForm({
      name: p.name, price: p.price, category: p.category, unit: p.unit,
      badge: p.badge ?? "", active: p.active, image: p.image ?? "",
      barcode: p.barcode ?? "", costPrice: p.costPrice,
      stock: p.stock, stockMin: p.stockMin, stockMax: p.stockMax,
      expiryDate: (p as DbProduct & { expiryDate?: string }).expiryDate ?? "",
      isVariant: false, variantOf: "", variantAttr: "",
    });
  };
  const closeEditModal = () => { setEditModalProduct(null); setEditForm({}); };

  const saveEdit = async () => {
    if (!editModalProduct) return;
    setSaving(true);
    await fetch(`/api/products/${editModalProduct.id}`, {
      method: "PUT",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(editForm),
    });
    setSaving(false);
    closeEditModal();
    load();
  };

  const toggleActive = async (p: DbProduct) => {
    await fetch(`/api/products/${p.id}`, {
      method: "PUT",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  };

  const deleteProduct = async (id: number) => {
    const product = products.find((p) => p.id === id);
    const name = product?.name ?? "producto";
    const ok = await confirm({
      title: "¿Eliminar producto?",
      description: `"${name}" se eliminará permanentemente. Esta acción no se puede deshacer desde la interfaz.`,
      intent: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    await fetch(`/api/products/${id}`, { method: "DELETE", headers: csrfHeaders() });
    showUndo({
      message: `Producto "${name}" eliminado`,
      detail: "Si fue un error, contacta soporte para restauración.",
      duration: 6000,
    });
    load();
  };

  const addProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.price) return;
    setSaving(true);
    await fetch("/api/products", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...addForm,
        price: Number(addForm.price),
        costPrice: addForm.costPrice ? Number(addForm.costPrice) : undefined,
        badge: addForm.badge || undefined,
        barcode: addForm.barcode || undefined,
        stock: addForm.stock !== "" ? Number(addForm.stock) : undefined,
        stockMin: addForm.stockMin !== "" ? Number(addForm.stockMin) : undefined,
        stockMax: addForm.stockMax !== "" ? Number(addForm.stockMax) : undefined,
        expiryDate: addForm.expiryDate || undefined,
      }),
    });
    setSaving(false);
    setShowAdd(false);
    setAddForm(EMPTY_ADD);
    load();
  };

  // ── Bulk operations  ─────────────────────────────────────────────────────

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };
  const clearSelection = () => setSelectedIds(new Set());

  const executeBulk = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    const ids = Array.from(selectedIds);
    const fields: Record<string, unknown> = {};
    if (bulkField === "active") fields.active = bulkValue === "true";
    if (bulkField === "category") fields.category = bulkValue;
    if (bulkField === "priceAdjust") fields.priceAdjust = Number(bulkValue);
    if (bulkField === "pricePercent") fields.pricePercent = Number(bulkValue);
    if (bulkField === "stock") fields.stock = Number(bulkValue);

    try {
      await fetch("/api/products/bulk", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, fields }),
      });
    } catch { /* ignore */ }
    setBulkSaving(false);
    setBulkModal(false);
    clearSelection();
    load();
  };

  const executeBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await fetch("/api/products/bulk", {
        method: "DELETE",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids }),
      });
    } catch { /* ignore */ }
    setBulkDeleting(false);
    setBulkDeleteConfirm(false);
    clearSelection();
    load();
  };

  /**
   * Bulk clear images — limpia el campo `image` de los productos seleccionados.
   * El producto en si NO se elimina, solo se quita la URL de la imagen para
   * que el admin pueda re-subirla con los requisitos correctos.
   *
   * Nota técnica 2026-04-20: el endpoint /api/products/bulk acepta
   * `fields.image: ""` desde el extender del schema. Si recibis 400, revisar
   * que el dev server haya recargado el schema. El load() usa cache:no-store
   * para forzar refetch.
   */
  const executeBulkClearImages = async () => {
    if (selectedIds.size === 0) return;
    setBulkClearingImages(true);
    let success = false;
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, fields: { image: "" } }),
      });
      success = res.ok;
      if (!res.ok) {
        const err = await res.text();
        console.error("[bulk-clear-images] failed", res.status, err);
      }
    } catch (e) {
      console.error("[bulk-clear-images] network error", e);
    }
    setBulkClearingImages(false);
    setBulkClearImagesConfirm(false);
    if (success) {
      // Optimistic UI: marcar localmente como sin imagen mientras llega el reload
      setProducts((prev) =>
        prev.map((p) => (selectedIds.has(p.id) ? { ...p, image: "" } : p)),
      );
    }
    clearSelection();
    await load();
  };

  // ── Purchase Order Auto-Suggestion ──────────────────────────────────────

  const lowStockProducts = products.filter(p => {
    const minStock = p.stockMin ?? 5;
    return p.stock !== undefined && p.stock <= minStock && p.active;
  });

  const generateOC = async (product: DbProduct) => {
    const minStock = product.stockMin ?? 5;
    const maxStock = product.stockMax ?? minStock * 2;
    const suggestedQty = maxStock - (product.stock ?? 0);
    const unitCost = product.costPrice ?? product.price * 0.7;

    setGeneratingOC(true);
    try {
      await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: "",
          items: [{
            productId: product.id,
            name: product.name,
            quantity: suggestedQty,
            unitCost,
            unit: product.unit,
          }],
          notes: `OC automática - stock bajo (${product.name})`,
        }),
      });
    } catch { /* ignore */ }
    setGeneratingOC(false);
  };

  const generateBulkOC = async () => {
    if (lowStockProducts.length === 0) return;
    setGeneratingOC(true);
    try {
      const items = lowStockProducts.map(p => {
        const minStock = p.stockMin ?? 5;
        const maxStock = p.stockMax ?? minStock * 2;
        const suggestedQty = maxStock - (p.stock ?? 0);
        const unitCost = p.costPrice ?? p.price * 0.7;
        return {
          productId: p.id,
          name: p.name,
          quantity: suggestedQty,
          unitCost,
          unit: p.unit,
        };
      });
      await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: "",
          items,
          notes: "OC automática - stock bajo",
        }),
      });
    } catch { /* ignore */ }
    setGeneratingOC(false);
  };

  const handleBarcodeScan = async (code: string) => {
    setShowScanner(false);
    setScanLoading(true);
    try {
      const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.found) {
        setAddForm(f => ({
          ...f,
          name: data.name || f.name,
          image: data.image || f.image,
          unit: data.unit || f.unit,
          barcode: data.barcode || code,
        }));
      } else {
        setAddForm(f => ({ ...f, barcode: code }));
      }
      setShowAdd(true);
    } catch {
      setAddForm(f => ({ ...f, barcode: code }));
      setShowAdd(true);
    }
    setScanLoading(false);
  };

  // Mejora 5 nueva: Save auto-reorder config
  const saveAutoReorder = (productId: number) => {
    const threshold = parseInt(arThreshold, 10) || 5;
    const qty = parseInt(arQty, 10) || 10;
    const updated = { ...autoReorderConfigs, [productId]: { threshold, qty, supplierId: "" } };
    setAutoReorderConfigs(updated);
    localStorage.setItem("auto-reorder-configs", JSON.stringify(updated));
    setShowAutoReorder(null);
    setArThreshold("");
    setArQty("");
  };

  const removeAutoReorder = (productId: number) => {
    const updated = { ...autoReorderConfigs };
    delete updated[productId];
    setAutoReorderConfigs(updated);
    localStorage.setItem("auto-reorder-configs", JSON.stringify(updated));
  };

  const autoReorderCount = Object.keys(autoReorderConfigs).length;

  // ── Stats ──────────────────────────────────────────────────────────────────

  const isLowStock = (p: DbProduct) =>
    p.stockMin !== undefined && p.stock !== undefined && p.stock <= p.stockMin;

  const isExpiringSoon = (p: DbProduct) => {
    const expiry = (p as DbProduct & { expiryDate?: string }).expiryDate;
    if (!expiry) return false;
    const expiryDate = new Date(expiry);
    const now = new Date();
    const diffDays = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  };

  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.active).length;
  const lowStockCount = products.filter(isLowStock).length;
  const expiringSoonCount = products.filter(isExpiringSoon).length;
  const totalStockValue = products.reduce(
    (s, p) => s + (p.stock ?? 0) * p.price, 0
  );

  // ── Mejora P-7: Detectar productos duplicados por similitud de nombre ────

  const duplicateWarning = useMemo(() => {
    const slice = products.slice(0, 100);
    const dupes: { a: string; b: string }[] = [];
    for (let i = 0; i < slice.length; i++) {
      for (let j = i + 1; j < slice.length; j++) {
        const la = slice[i].name.toLowerCase().trim();
        const lb = slice[j].name.toLowerCase().trim();
        if (la === lb || ((la.includes(lb) || lb.includes(la)) && la.length / lb.length > 0.7 && la.length / lb.length < 1.4)) {
          dupes.push({ a: slice[i].name, b: slice[j].name });
        }
      }
      if (dupes.length >= 5) break;
    }
    return dupes;
  }, [products]);

  // ── Mejora P-8: Margen promedio por categoria ─────────────────────────────

  const categoryMargins = useMemo(() => {
    const catMap = new Map<string, { sum: number; count: number }>();
    for (const p of products) {
      if (!p.active || !p.costPrice || p.costPrice <= 0 || p.price <= 0) continue;
      const cat = p.category || "otros";
      const ex = catMap.get(cat) || { sum: 0, count: 0 };
      ex.sum += ((p.price - p.costPrice) / p.price) * 100;
      ex.count++;
      catMap.set(cat, ex);
    }
    const result: { cat: string; margin: number }[] = [];
    for (const [cat, data] of catMap) {
      if (data.count >= 3) result.push({ cat, margin: data.sum / data.count });
    }
    return result.sort((a, b) => b.margin - a.margin);
  }, [products]);

  // ── Mejora QW-10i: Top 5 productos más rentables (por margen %) ─────────
  const topRentables = useMemo(() => {
    return products
      .filter(p => p.active && p.costPrice && p.costPrice > 0 && p.price > 0 && p.price > p.costPrice)
      .map(p => ({ id: p.id, margin: ((p.price - p.costPrice!) / p.price) * 100 }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5)
      .map(p => p.id);
  }, [products]);

  // ── Mejora QW-10j: Productos con costo > precio (pérdida) ─────────────
  const inconsistentes = useMemo(() => {
    return products.filter(p => p.costPrice && p.price && p.costPrice > p.price);
  }, [products]);

  // ── Filtered ───────────────────────────────────────────────────────────────

  const noImageCount = products.filter(p => !p.image || p.image === "").length;

  const filteredProducts = products.filter(p => {
    if (!showInactive && !p.active) return false;
    if (catFilter !== "todos" && p.category !== catFilter) return false;
    if (lowOnly && !isLowStock(p)) return false;
    // Mejora 8R2: Filtro sin imagen
    if (noImageOnly && p.image && p.image !== "") return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q));
    }
    return true;
  });

  const filteredMovements = movements.filter(m => {
    if (search) {
      const product = products.find(p => p.id === m.productId);
      return product?.name.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  const pgProducts = usePagination(filteredProducts, 50);
  const pgMovements = usePagination(filteredMovements, 50);

  // Reset pagination when filters change
  useEffect(() => { pgProducts.reset(); }, [search, catFilter, lowOnly, noImageOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { pgMovements.reset(); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-11 h-11 rounded-xl bg-gray-200 dark:bg-accent shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-6 w-32 bg-gray-200 dark:bg-accent rounded-lg" />
          <div className="h-4 w-56 bg-gray-200 dark:bg-accent rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 bg-gray-200 dark:bg-accent rounded-lg" />
          <div className="h-8 w-24 bg-gray-200 dark:bg-accent rounded-lg" />
        </div>
      </div>
      {/* Toolbar skeleton */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-9 flex-1 min-w-45 bg-gray-200 dark:bg-accent rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 dark:bg-accent rounded-lg" />
        <div className="h-9 w-24 bg-gray-200 dark:bg-accent rounded-lg" />
        <div className="h-9 w-20 bg-gray-200 dark:bg-accent rounded-lg" />
      </div>
      {/* KPI skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-card border border-[var(--rule-soft)] dark:border-card-border rounded-xl p-5">
            <div className="h-3 w-1/3 bg-gray-200 dark:bg-accent rounded mb-3" />
            <div className="h-7 w-1/2 bg-gray-200 dark:bg-accent rounded mb-2" />
            <div className="h-1 w-full bg-gray-200 dark:bg-accent rounded mt-3" />
          </div>
        ))}
      </div>
      {/* Product row skeletons */}
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex flex-wrap items-center gap-3 p-3 bg-white dark:bg-card rounded-xl border border-[var(--rule-soft)] dark:border-card-border">
          <div className="h-10 w-10 bg-gray-200 dark:bg-accent rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-accent rounded w-1/3" />
            <div className="h-3 bg-gray-200 dark:bg-accent rounded w-1/4" />
          </div>
          <div className="h-6 w-16 bg-gray-200 dark:bg-accent rounded-full" />
          <div className="h-5 w-14 bg-gray-200 dark:bg-accent rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Toolbar de acciones — el header del módulo lo da el padre InventarioAlmacenesModule */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="flex bg-[var(--surface-sunken)] rounded-xl p-1 overflow-x-auto">
          {(["productos", "kanban"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap",
                view === v
                  ? "bg-[var(--surface-canvas)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              {v === "productos" ? "Productos" : "Vista rápida"}
            </button>
          ))}
        </div>

        <button
          onClick={() => { setPickerSearch(""); setPickerCat("todos"); setShowPicker(true); }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo
        </button>

        <ModuleActionMenu
          items={[
            {
              label: scanLoading ? "Buscando..." : "Escanear código de barras",
              icon: ScanBarcode,
              onClick: () => setShowScanner(true),
              disabled: scanLoading,
              description: "Añadir producto con lector de barras",
            },
            {
              label: loading ? "Actualizando..." : "Actualizar",
              icon: RefreshCw,
              onClick: load,
              disabled: loading,
              description: "Recargar datos del servidor",
              dividerBefore: true,
            },
          ]}
        />
      </div>

      {/* Toolbar — busqueda + filtros + acciones en UNA barra */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-45">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] dark:text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholders[phIndex]}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary transition-colors"
          />
        </div>
        {/* Category filter */}
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary"
        >
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        {/* Filter chips inline */}
        <button
          onClick={() => setLowOnly(!lowOnly)}
          className={cn(
            "flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap",
            lowOnly ? "border-[var(--data-warning)] bg-[var(--data-warning-50)] text-[var(--data-warning)] dark:border-[var(--data-warning)] dark:bg-amber-950/20 dark:text-[var(--data-warning)]" : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Bajo stock
        </button>
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={cn(
            "flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap",
            showInactive ? "border-gray-400 bg-[var(--surface-sunken)] text-[var(--text-secondary)]" : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
          )}
        >
          {showInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          Inactivos
        </button>
        <button
          onClick={() => setNoImageOnly(!noImageOnly)}
          className={cn(
            "flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap",
            noImageOnly ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:border-[var(--rule-base)] dark:bg-[var(--accent-muted)]/20 dark:text-[var(--text-primary)]" : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
          )}
        >
          <Camera className="h-3.5 w-3.5" /> Sin foto ({noImageCount})
        </button>
        {(lowOnly || showInactive || noImageOnly) && (
          <button
            onClick={() => { setLowOnly(false); setShowInactive(false); setNoImageOnly(false); }}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors whitespace-nowrap"
          >
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
        {/* Mas filtros (vista, import/export) */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap",
            showFilters ? "border-primary bg-primary/5 text-primary" : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Mas
          <ChevronDown className={cn("h-3 w-3 transition-transform", showFilters && "rotate-180")} />
        </button>
      </div>

      {/* KPIs — grid-cols-5 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5 ">
          <p className="text-xs text-[var(--text-secondary)] dark:text-zinc-400 font-medium">Productos</p>
          <p className="text-2xl font-mono font-bold text-[var(--text-primary)] dark:text-foreground mt-1">{totalProducts}</p>
          <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 mt-1">{activeProducts} activos</p>
          <div className="h-1 rounded-full mt-2 bg-primary" />
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5 ">
          <p className="text-xs text-[var(--text-secondary)] dark:text-zinc-400 font-medium">Activos</p>
          <p className="text-2xl font-mono font-bold text-[var(--data-success)] mt-1">{activeProducts}</p>
          <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 mt-1">{totalProducts - activeProducts} inactivos</p>
          <div className="h-1 rounded-full mt-2 bg-[var(--accent-soft)]" />
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5 ">
          <p className="text-xs text-[var(--text-secondary)] dark:text-zinc-400 font-medium">Bajo stock</p>
          <p className={cn("text-2xl font-mono font-bold mt-1", lowStockCount > 0 ? "text-[var(--data-warning)]" : "text-[var(--text-primary)] dark:text-foreground")}>{lowStockCount}</p>
          <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 mt-1">{lowStockCount > 0 ? "Requieren reposicion" : "Stock saludable"}</p>
          <div className={cn("h-1 rounded-full mt-2", lowStockCount > 0 ? "bg-[var(--data-warning)]" : "bg-gray-200 dark:bg-zinc-700")} />
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5 ">
          <p className="text-xs text-[var(--text-secondary)] dark:text-zinc-400 font-medium">Prox. a vencer</p>
          <p className={cn("text-2xl font-mono font-bold mt-1", expiringSoonCount > 0 ? "text-[var(--data-warning)]" : "text-[var(--text-primary)] dark:text-foreground")}>{expiringSoonCount}</p>
          <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 mt-1">Proximos 30 dias</p>
          <div className={cn("h-1 rounded-full mt-2", expiringSoonCount > 0 ? "bg-[var(--data-warning)]" : "bg-gray-200 dark:bg-zinc-700")} />
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5 ">
          <p className="text-xs text-[var(--text-secondary)] dark:text-zinc-400 font-medium">Valor total</p>
          <p className="text-2xl font-mono font-bold text-primary mt-1">{fmt(totalStockValue)}</p>
          <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 mt-1">En inventario</p>
          <div className="h-1 rounded-full mt-2 bg-[var(--accent-soft)]" />
        </div>
      </div>

      {/* Mejora P-7: Duplicados detectados */}
      {duplicateWarning.length > 0 && (
        <div className="rounded-xl border border-[var(--data-warning)] dark:border-[var(--data-warning)]/30 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20 px-4 py-2.5 flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning)] dark:text-[var(--data-warning)] shrink-0" />
          <span className="text-xs text-[var(--data-warning)] dark:text-[var(--data-warning)]">
            Posibles duplicados: <span className="font-bold">{duplicateWarning[0].a}</span> y <span className="font-bold">{duplicateWarning[0].b}</span>
            {duplicateWarning.length > 1 && <span className="text-[var(--data-warning)]"> (y {duplicateWarning.length - 1} mas)</span>}
          </span>
        </div>
      )}

      {/* Mejora P-8: Margen promedio por categoria */}
      {categoryMargins.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-tertiary)] dark:text-muted font-medium mr-1">Margen:</span>
          {categoryMargins.map(cm => (
            <span
              key={cm.cat}
              className={cn(
                "text-xs font-mono font-bold px-2 py-0.5 rounded-full",
                cm.margin > 25 ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]"
                : cm.margin >= 15 ? "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]"
                : "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]"
              )}
            >
              {cm.cat}: {cm.margin.toFixed(0)}%
            </span>
          ))}
        </div>
      )}

      {/* OC Alerts Section (IMPROVEMENT 1) */}
      {lowStockProducts.length > 0 && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--data-warning)]/40 rounded-xl overflow-hidden ">
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-[var(--data-warning)] dark:text-[var(--data-warning)]" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
                    Alertas de Orden de Compra
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--data-warning)] dark:bg-[var(--data-warning)] text-[var(--data-warning)] dark:text-[var(--data-warning)] text-xs font-bold">
                      {lowStockProducts.length}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">
                    {lowStockProducts.length} producto{lowStockProducts.length > 1 ? "s necesitan" : " necesita"} reposición
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={generateBulkOC}
                  disabled={generatingOC}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--data-warning)] hover:bg-[var(--data-warning)] text-white text-xs font-bold transition-colors disabled:opacity-60 "
                >
                  {generatingOC ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
                  Generar OC para todos
                </button>
                <button
                  onClick={() => setExpandedOC(!expandedOC)}
                  className="p-2 rounded-lg hover:bg-[var(--data-warning-100)] dark:hover:bg-[var(--data-warning)]/30 transition-colors"
                >
                  <ChevronRight className={cn("h-4 w-4 text-[var(--text-secondary)] dark:text-muted transition-transform", expandedOC && "rotate-90")} />
                </button>
              </div>
            </div>

            {expandedOC && (
              <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                {lowStockProducts.map(p => {
                  const minStock = p.stockMin ?? 5;
                  const maxStock = p.stockMax ?? minStock * 2;
                  const suggestedQty = maxStock - (p.stock ?? 0);
                  const unitCost = p.costPrice ?? p.price * 0.7;
                  return (
                    <div key={p.id} className="bg-white dark:bg-card border border-[var(--data-warning)] dark:border-[var(--data-warning)] rounded-xl p-3 flex flex-wrap items-center gap-3">
                      {p.image ? (
                        <span className="relative inline-block shrink-0">
                          <Image src={p.image} alt={p.name} width={40} height={40} unoptimized={p.image.startsWith("data:")} className="rounded-lg object-cover border border-[var(--rule-soft)] dark:border-card-border" />
                          <ImageWarningBadge image={p.image} />
                        </span>
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-primary/40" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                          Stock: {p.stock} / Mín: {minStock} • Sugerido: <span className="font-bold text-[var(--data-warning)]">{suggestedQty} {p.unit}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Costo unit.</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(unitCost)}</p>
                      </div>
                      <button
                        onClick={() => generateOC(p)}
                        disabled={generatingOC}
                        className="px-3 py-1.5 rounded-lg bg-[var(--data-warning)] hover:bg-[var(--data-warning)] text-white text-xs font-bold transition-colors disabled:opacity-60 shrink-0"
                      >
                        Generar OC
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded options panel (Vista + Import/Export) — collapsible from toolbar "Mas" button */}
      {showFilters && (
        <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 border border-[var(--rule-soft)] dark:border-card-border space-y-3">
          {/* Grupo: Vista */}
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Vista</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { const next = !showExtendedCols; setShowExtendedCols(next); try { localStorage.setItem("inv-extended-cols", String(next)); } catch {} }}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                  showExtendedCols ? "border-[var(--data-success)]/30 bg-[var(--accent-soft)] text-[var(--data-success)] dark:border-[var(--data-success)]/30 dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]" : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-white dark:hover:bg-card"
                )}
              >
                <Layers className="h-3.5 w-3.5" /> {showExtendedCols ? "Menos columnas" : "Mas columnas"}
              </button>
              <button
                onClick={() => setShowExpandedTable(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--data-success)]/30 bg-[var(--accent-soft)] text-[var(--data-success)] dark:border-[var(--data-success)]/30 dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors"
              >
                <Maximize2 className="h-3.5 w-3.5" /> Expandir tabla
              </button>
              {view === "productos" && (
                <button
                  onClick={() => { setBulkField("pricePercent"); setBulkValue(""); setBulkModal(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
                >
                  <TrendingUp className="h-3.5 w-3.5" /> Ajuste %
                </button>
              )}
            </div>
          </div>

          {/* Grupo: Importar / Exportar */}
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Importar / Exportar</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const filtered = products.filter(p => {
                    if (catFilter !== "todos" && p.category !== catFilter) return false;
                    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.barcode ?? "").includes(search)) return false;
                    return true;
                  });
                  exportToCSV(filtered.map(p => ({
                    nombre: p.name, categoria: p.category, precio: p.price,
                    costo: p.costPrice ?? "", stock: p.stock ?? "",
                    stockMin: p.stockMin ?? "", stockMax: p.stockMax ?? "",
                    unidad: p.unit, codigo: p.barcode ?? "", activo: p.active ? "Si" : "No",
                  })), `inventario_${new Date().toISOString().slice(0, 10)}.csv`);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-white dark:hover:bg-card transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
              <button
                onClick={() => {
                  const filtered = products.filter(p => {
                    if (catFilter !== "todos" && p.category !== catFilter) return false;
                    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.barcode ?? "").includes(search)) return false;
                    return true;
                  });
                  exportToExcel(filtered.map(p => ({
                    Nombre: p.name, Categoria: p.category, "Precio (S/)": p.price,
                    "Costo (S/)": p.costPrice ?? "", Stock: p.stock ?? "",
                    "Stock Min": p.stockMin ?? "", "Stock Max": p.stockMax ?? "",
                    Unidad: p.unit, Codigo: p.barcode ?? "", Activo: p.active ? "Si" : "No",
                  })), `inventario-${new Date().toISOString().slice(0, 10)}`, "Inventario");
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
              <input ref={csvImportRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
              <button
                onClick={() => { setCsvResult(null); csvImportRef.current?.click(); }}
                disabled={csvImporting}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors disabled:opacity-50"
              >
                {csvImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Subir CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contador de resultados filtrados */}
      {filteredProducts.length !== products.length && (
        <p className="text-xs text-[var(--text-tertiary)]">Mostrando {filteredProducts.length} de {products.length} productos</p>
      )}

      {/* Content */}
      {/* CSV import result feedback */}
      {csvResult && (
        <div className={`flex items-start gap-3 px-2 sm:px-4 py-2 sm:py-3 rounded-xl text-sm mb-2 ${csvResult.errors.length > 0 ? "bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning)] dark:border-[var(--data-warning)]/40 text-[var(--data-warning)] dark:text-[var(--data-warning)]" : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)]"}`}>
          <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">{csvResult.created} producto{csvResult.created !== 1 ? "s" : ""} importado{csvResult.created !== 1 ? "s" : ""} correctamente.</p>
            {csvResult.errors.length > 0 && <ul className="mt-1 text-xs space-y-0.5">{csvResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}{csvResult.errors.length > 5 && <li>...y {csvResult.errors.length - 5} más</li>}</ul>}
          </div>
          <button onClick={() => setCsvResult(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] shrink-0"><X className="h-4 w-4" /></button>
        </div>
      )}
      {/* Mejora QW-10j: Alerta precio inconsistente */}
      {!loading && inconsistentes.length > 0 && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)] rounded-xl p-3 mb-2">
          <p className="text-sm font-bold text-[var(--data-error)] dark:text-[var(--data-error)] flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="h-4 w-4" /> {inconsistentes.length} producto{inconsistentes.length !== 1 ? "s" : ""} se vende{inconsistentes.length !== 1 ? "n" : ""} por debajo del costo:
          </p>
          <ul className="space-y-0.5 mb-2">
            {inconsistentes.slice(0, 5).map(p => (
              <li key={p.id} className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)]">
                {p.name}: costo S/{p.costPrice!.toFixed(2)} &gt; precio S/{p.price.toFixed(2)} (perdida S/{(p.costPrice! - p.price).toFixed(2)}/unid)
              </li>
            ))}
            {inconsistentes.length > 5 && <li className="text-xs text-[var(--data-error)]">...y {inconsistentes.length - 5} mas</li>}
          </ul>
          <button onClick={() => { setView("productos"); setSearch(""); }} className="text-xs font-bold text-[var(--data-error)] dark:text-[var(--data-error)] hover:underline">
            Corregir precios &rarr;
          </button>
        </div>
      )}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-[var(--text-tertiary)] dark:text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : view === "productos" ? (
        /* ── Products View ──────────────────────────────────────── */
        <>
          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {pgProducts.items.map(p => {
              const lowStock = isLowStock(p);
              const cat = categories.find(c => c.id === p.category);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "bg-white dark:bg-card border rounded-xl p-4  transition-all relative",
                    !p.active && "opacity-60 bg-[var(--surface-canvas)]",
                    lowStock ? "border-[var(--data-warning)]" : "border-[var(--rule-base)] dark:border-card-border"
                  )}
                >
                  {!p.active && (
                    <div className="absolute top-2 right-2 z-10">
                      <StatusBadge variant="neutral" label="Inactivo" icon={EyeOff} />
                    </div>
                  )}
                  <div className="flex flex-wrap items-start gap-3">
                    {p.image ? (
                      <span className="relative inline-block shrink-0">
                        <Image src={p.image} alt={p.name} width={56} height={56} unoptimized={p.image.startsWith("data:")} className="rounded-xl object-cover border border-[var(--rule-soft)] dark:border-card-border bg-gray-50 dark:bg-surface" />
                        <ImageWarningBadge image={p.image} size="md" />
                      </span>
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Package className="h-6 w-6 text-primary/40" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm leading-tight">{p.name}</p>
                        {topRentables.includes(p.id) && (
                          <StatusBadge variant="success" label="Alta rentabilidad" size="sm" />
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">{cat?.label ?? p.category} · {p.unit}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="font-extrabold text-primary text-base">S/{p.price.toFixed(2)}</span>
                        {p.costPrice && <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">costo S/{p.costPrice.toFixed(2)}</span>}
                        {p.badge && <span className="inline-flex px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">{p.badge}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button onClick={() => openEditModal(p)} className="p-2 rounded-lg bg-gray-50 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-primary/10 hover:text-primary transition-colors border border-[var(--rule-soft)] dark:border-card-border" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteProduct(p.id)} className="p-2 rounded-lg bg-gray-50 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--data-error-50)] hover:text-[var(--data-error)] transition-colors border border-[var(--rule-soft)] dark:border-card-border" title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => setKardexProduct({ id: p.id, name: p.name })} className="p-2 rounded-lg bg-gray-50 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--accent-soft)] hover:text-[var(--data-success)] transition-colors border border-[var(--rule-soft)] dark:border-card-border" title="Ver Kardex">
                        <BookOpen className="h-4 w-4" />
                      </button>
                      <button onClick={() => setModifiersProduct({ id: p.id, name: p.name })} className="p-2 rounded-lg bg-gray-50 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors border border-[var(--rule-soft)] dark:border-card-border" title="Modificadores (cremas, adicionales, talla)">
                        <Sliders className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-[var(--rule-soft)] dark:border-card-border">
                    <button
                      onClick={() => toggleActive(p)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors",
                        p.active ? "bg-[var(--accent-soft)] text-[var(--data-success)] hover:bg-[var(--accent-soft)]" : "bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200"
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", p.active ? "bg-[var(--accent-soft)]" : "bg-gray-400")} />
                      {p.active ? "Activo" : "Inactivo"}
                    </button>
                    {p.stock !== undefined ? (
                      <div className={cn(
                        "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold",
                        lowStock ? "bg-[var(--data-warning-100)] text-[var(--data-warning)]" : "bg-[var(--accent-soft)] text-[var(--data-success)]"
                      )}>
                        {lowStock && <AlertTriangle className="h-3 w-3" />}
                        Stock: {p.stock}
                        {p.stockMin !== undefined && <span className="opacity-70"> / mín {p.stockMin}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)] dark:text-muted italic">Sin stock</span>
                    )}
                    {p.barcode && <span className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono ml-auto">#{p.barcode}</span>}
                  </div>
                </div>
              );
            })}
            {filteredProducts.length === 0 && (
              <EmptyState
                illustration={products.length === 0 ? "products" : "search"}
                title={products.length === 0 ? "Sin inventario" : "Sin resultados"}
                description={products.length === 0 ? "Agrega productos y registra movimientos de stock." : "Prueba con otro filtro o busqueda."}
              />
            )}
            <Paginator page={pgProducts.page} totalPages={pgProducts.totalPages} total={pgProducts.total} pageSize={pgProducts.pageSize} onPage={pgProducts.setPage} onPageSize={pgProducts.setPageSize} />
          </div>

          {/* Desktop table — UX Mejora 18: Sticky header */}
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden  hidden sm:block">
            <div className="max-h-[65vh] overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="sticky top-0 bg-white dark:bg-card z-10 shadow-[var(--shadow-sm)]">
                  <tr className="border-b border-[var(--rule-soft)] dark:border-card-border text-left">
                    <th className="px-3 py-3 w-10">
                      <input type="checkbox" checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length} onChange={toggleSelectAll} className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted w-12">Img</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Producto</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Categoría</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Precio</th>
                    <th className={cn("px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted", !showExtendedCols && "hidden")}>Historial</th>
                    <th className={cn("px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted", !showExtendedCols && "hidden")}>Badge</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Stock</th>
                    <th className={cn("px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted", !showExtendedCols && "hidden")} title="Basado en las ultimas compras">Costo Prom.</th>
                    <th className={cn("px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted", !showExtendedCols && "hidden")}>Rotacion</th>
                    <th className={cn("px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted", !showExtendedCols && "hidden")}>Cambio 30d</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Estado</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pgProducts.items.map(p => {
                    const lowStock = isLowStock(p);
                    return (
                      <tr
                        key={p.id}
                        className={cn("hover:bg-gray-50 dark:hover:bg-surface transition-colors", !p.active && "opacity-50 bg-[var(--surface-canvas)]/30", lowStock && "bg-[var(--data-warning-50)]/40", selectedIds.has(p.id) && "bg-primary/5")}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          let x = e.clientX;
                          let y = e.clientY;
                          if (x + 200 > window.innerWidth) x = window.innerWidth - 208;
                          if (y + 200 > window.innerHeight) y = window.innerHeight - 208;
                          setCtxMenu({ product: p, x, y });
                        }}
                      >
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          {p.image ? (
                            <span className="relative inline-block shrink-0">
                              <Image src={p.image} alt={p.name} width={40} height={40} className="w-10 h-10 rounded-md object-cover" />
                              <ImageWarningBadge image={p.image} />
                            </span>
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-gray-100 dark:bg-surface flex items-center justify-center">
                              <Package className="h-4 w-4 text-[var(--text-tertiary)] dark:text-muted" />
                            </div>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Mejora 5R2: Semaforo de stock */}
                            {(() => {
                              const stockMin = p.stockMin ?? 5;
                              const stock = p.stock ?? 0;
                              if (stock === 0) return <span className="w-2.5 h-2.5 rounded-full bg-black inline-block shrink-0" title="Sin stock" />;
                              if (stock <= stockMin) return <span className="w-2.5 h-2.5 rounded-full bg-[var(--data-error)] inline-block shrink-0" title="Critico" />;
                              if (stock <= stockMin * 2) return <span className="w-2.5 h-2.5 rounded-full bg-[var(--data-warning)] inline-block shrink-0" title="Bajo" />;
                              return <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-soft)] inline-block shrink-0" title="OK" />;
                            })()}
                            <span className="font-semibold text-[var(--text-primary)] dark:text-foreground truncate-25">{p.name}</span>
                            {/* Mejora QW-10i: Badge alta rentabilidad */}
                            {topRentables.includes(p.id) && (
                              <StatusBadge variant="success" label="Alta rentabilidad" size="sm" />
                            )}
                            {!p.active && (
                              <StatusBadge variant="neutral" label="Inactivo" icon={EyeOff} size="sm" />
                            )}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted">
                          {categories.find(c => c.id === p.category)?.label ?? p.category}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-primary">S/{p.price.toFixed(2)}</td>
                        <td className={cn("px-2 sm:px-4 py-2 sm:py-3", !showExtendedCols && "hidden")}>
                          <PriceSparkline productId={p.id} />
                        </td>
                        <td className={cn("px-2 sm:px-4 py-2 sm:py-3", !showExtendedCols && "hidden")}>
                          {p.badge ? <span className="inline-flex px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">{p.badge}</span> : <span className="text-[var(--text-tertiary)] dark:text-muted">—</span>}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          {p.stock !== undefined ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0",
                                (p.stock ?? 0) === 0 ? "bg-[var(--data-error)]" :
                                lowStock ? "bg-[var(--data-warning)]" :
                                (p.stock ?? 0) > (p.stockMax ?? 999) ? "bg-[var(--accent-soft)]" :
                                "bg-[var(--accent-soft)]"
                              )} />
                              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
                                (p.stock ?? 0) === 0 ? "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-red-950/30 dark:text-[var(--data-error)]" :
                                lowStock ? "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-amber-950/30 dark:text-[var(--data-warning)]" :
                                "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]"
                              )}>
                                {(p.stock ?? 0) === 0 && <AlertTriangle className="h-3 w-3" />}
                                {lowStock && (p.stock ?? 0) > 0 && <AlertTriangle className="h-3 w-3" />}
                                {p.stock}
                              </span>
                            </div>
                          ) : <span className="text-[var(--text-tertiary)] dark:text-muted">—</span>}
                        </td>
                        {/* Mejora 6R2: Costo promedio ponderado */}
                        <td className={cn("px-2 sm:px-4 py-2 sm:py-3", !showExtendedCols && "hidden")}>
                          {p.costPrice != null && p.costPrice > 0
                            ? <span className="font-mono text-xs text-[var(--text-primary)] dark:text-foreground" title="Basado en las ultimas compras">S/{p.costPrice.toFixed(2)}</span>
                            : <span className="text-[var(--text-tertiary)] dark:text-muted">—</span>
                          }
                        </td>
                        {/* Mejora 6: Rotation indicator */}
                        <td className={cn("px-2 sm:px-4 py-2 sm:py-3", !showExtendedCols && "hidden")}>
                          {(() => {
                            const spw = computeSalesPerWeek(p.id, movements);
                            const info = getRotationInfo(spw, p.stock ?? 0);
                            if (!info) return <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">Normal</span>;
                            return (
                              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold", info.className)}>
                                {info.level === "rápido" && <TrendingUp className="h-2.5 w-2.5" />}
                                {info.label}
                              </span>
                            );
                          })()}
                        </td>
                        {/* Mejora 7: Stock change last 30 days */}
                        <td className={cn("px-2 sm:px-4 py-2 sm:py-3", !showExtendedCols && "hidden")}>
                          {(() => {
                            const delta = computeStockChange(p.id, movements);
                            if (delta > 0) return <span className="text-xs font-bold text-[var(--data-success)]"><ArrowUp className="h-3 w-3 inline" /> +{delta}</span>;
                            if (delta < 0) return <span className="text-xs font-bold text-[var(--data-error)]"><ArrowDown className="h-3 w-3 inline" /> {delta}</span>;
                            return <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">&#8594; 0</span>;
                          })()}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <button
                            onClick={() => toggleActive(p)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors",
                              p.active ? "bg-[var(--accent-soft)] text-[var(--data-success)] hover:bg-[var(--accent-soft)]" : "bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200"
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", p.active ? "bg-[var(--accent-soft)]" : "bg-gray-400")} />
                            {p.active ? "Activo" : "Inactivo"}
                          </button>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditModal(p)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-primary hover:bg-primary/8 transition-colors" title="Editar">
                              <Pencil className="h-4 w-4" />
                            </button>
                            {/* Mejora 7R2: Duplicar producto */}
                            <button
                              onClick={() => {
                                setAddForm({
                                  name: `${p.name} (Copia)`,
                                  category: p.category,
                                  price: String(p.price),
                                  unit: p.unit,
                                  badge: p.badge ?? "",
                                  image: p.image ?? "",
                                  barcode: "",
                                  costPrice: p.costPrice != null ? String(p.costPrice) : "",
                                  stock: "0",
                                  stockMin: p.stockMin != null ? String(p.stockMin) : "",
                                  stockMax: p.stockMax != null ? String(p.stockMax) : "",
                                  expiryDate: "",
                                  isVariant: false,
                                  variantOf: "",
                                  variantAttr: "",
                                });
                                setShowAdd(true);
                              }}
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success)] hover:bg-[var(--accent-soft)] transition-colors"
                              title="Duplicar"
                            >
                              <ClipboardList className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteProduct(p.id)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] transition-colors" title="Eliminar">
                              <Trash2 className="h-4 w-4" />
                            </button>
                            {/* Mejora 6 nueva: QR */}
                            <button onClick={() => setShowQRProduct(p)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors" title="QR">
                              <ScanBarcode className="h-4 w-4" />
                            </button>
                            {/* Mejora 5 nueva: Auto-reorden toggle */}
                            <button
                              onClick={() => {
                                if (autoReorderConfigs[p.id]) {
                                  removeAutoReorder(p.id);
                                } else {
                                  setArThreshold(String(p.stockMin ?? 5));
                                  setArQty(String((p.stockMax ?? (p.stockMin ?? 5) * 2) - (p.stock ?? 0)));
                                  setShowAutoReorder(p.id);
                                }
                              }}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                autoReorderConfigs[p.id]
                                  ? "text-[var(--data-success)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]"
                                  : "text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success)] hover:bg-[var(--accent-soft)]"
                              )}
                              title={autoReorderConfigs[p.id] ? "Auto-reorden activo (click para desactivar)" : "Configurar auto-reorden"}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredProducts.length === 0 && (
              <EmptyState
                illustration={products.length === 0 ? "products" : "search"}
                title={products.length === 0 ? "Sin inventario" : "Sin resultados"}
                description={products.length === 0 ? "Agrega productos y registra movimientos de stock." : "Prueba con otro filtro o busqueda."}
              />
            )}
            <Paginator page={pgProducts.page} totalPages={pgProducts.totalPages} total={pgProducts.total} pageSize={pgProducts.pageSize} onPage={pgProducts.setPage} onPageSize={pgProducts.setPageSize} />
          </div>
        </>
      ) : view === "kanban" ? (
        /* ── Kanban Stock View ────────────────────────────────────── */
        (() => {
          const columns = [
            { key: "agotado", label: "Agotado", color: "border-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-red-950/20", badgeColor: "bg-red-500", filter: (p: DbProduct) => (p.stock ?? 0) === 0 },
            { key: "bajo", label: "Pocas Existencias", color: "border-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-amber-950/20", badgeColor: "bg-amber-500", filter: (p: DbProduct) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.stockMin ?? 5) },
            { key: "normal", label: "Normal", color: "border-[var(--data-success)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", badgeColor: "bg-[var(--accent-soft)]", filter: (p: DbProduct) => (p.stock ?? 0) > (p.stockMin ?? 5) && (p.stock ?? 0) <= (p.stockMax ?? 999) },
            { key: "exceso", label: "Exceso", color: "border-[var(--data-success)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", badgeColor: "bg-[var(--accent-soft)]", filter: (p: DbProduct) => (p.stock ?? 0) > (p.stockMax ?? 999) },
          ];
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4">
              {columns.map(col => {
                const items = filteredProducts.filter(col.filter);
                return (
                  <div key={col.key} className={cn("rounded-xl border-2 p-3 min-h-50", col.color)}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">{col.label}</h4>
                      <span className={cn("text-white text-xs font-bold px-2 py-0.5 rounded-full", col.badgeColor)}>{items.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {items.length === 0 ? (
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center py-4">Sin productos</p>
                      ) : items.map(p => (
                        <div key={p.id} className="bg-white dark:bg-card rounded-lg p-2.5  border border-[var(--rule-soft)] dark:border-border cursor-pointer hover:shadow-sm transition-shadow"
                          onClick={() => { setEditModalProduct(p); }}>
                          <p className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground truncate">{p.name}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-[var(--text-secondary)] dark:text-muted">{p.category}</span>
                            <span className="text-xs font-bold">{p.stock ?? 0} uds</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()
      ) : null}

      {/* Barcode Scanner */}
      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeScan} onClose={() => setShowScanner(false)} />
      )}

      {/* ── Product Picker Modal ── */}
      {showPicker && (() => {
        const q = pickerSearch.toLowerCase();
        const pickerProducts = products.filter(p => {
          if (!p.active) return false;
          if (pickerCat !== "todos" && p.category !== pickerCat) return false;
          if (q && !p.name.toLowerCase().includes(q) && !(p.barcode ?? "").toLowerCase().includes(q)) return false;
          return true;
        });
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowPicker(false)}>
            <div className="bg-white dark:bg-card w-full sm:max-w-4xl sm:rounded-xl rounded-t-2xl overflow-hidden max-h-[90dvh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white dark:bg-card z-10">
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Escoger producto</CardTitle>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowPicker(false); setShowAdd(true); }}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    + Crear nuevo
                  </button>
                  <button onClick={() => setShowPicker(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                    <X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
                  </button>
                </div>
              </div>
              <div className="px-5 py-3 border-b flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                  <input
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
                <select
                  value={pickerCat}
                  onChange={e => setPickerCat(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm outline-none"
                >
                  <option value="todos">Todos</option>
                  {realCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {pickerProducts.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    title="Sin resultados"
                    description="No se encontraron productos con esos filtros."
                  />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {pickerProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setShowPicker(false);
                          setEditModalProduct(p);
                          setEditForm({ ...p });
                        }}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl border border-[var(--rule-base)] dark:border-card-border hover:border-primary hover:shadow-sm transition-all text-center group"
                      >
                        <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-accent overflow-hidden flex-shrink-0">
                          {p.image ? (
                            <Image src={p.image} alt={p.name} width={64} height={64} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-6 w-6 text-[var(--text-tertiary)] dark:text-muted" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground line-clamp-2 group-hover:text-primary transition-colors">{p.name}</span>
                        <span className="text-sm text-[var(--text-secondary)] dark:text-muted">{fmt(p.price)}</span>
                        {p.stock != null && (
                          <span className={cn(
                            "text-xs font-bold px-2 py-0.5 rounded-full",
                            (p.stock ?? 0) === 0 ? "bg-[var(--data-error-100)] text-[var(--data-error)]" : (p.stock ?? 0) <= (p.stockMin ?? 5) ? "bg-[var(--data-warning-100)] text-[var(--data-warning)]" : "bg-[var(--accent-soft)] text-[var(--data-success)]"
                          )}>
                            Stock: {p.stock}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add product modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="bg-white dark:bg-card w-full sm:max-w-2xl sm:rounded-xl rounded-t-2xl overflow-y-auto max-h-[90dvh]">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white dark:bg-card z-10">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Agregar producto</CardTitle>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
              </button>
            </div>
            <form onSubmit={addProduct} className="p-5 space-y-5">
              {/* National product DB search */}
              <div className="bg-[var(--accent-soft)] border border-[var(--data-success)]/30 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-[var(--data-success)] flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5" /> Buscar en base nacional de productos
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={dbQuery}
                    onChange={(e) => setDbQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleDbSearch())}
                    placeholder="Ej: arroz costeño, aceite vegetal…"
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--data-success)]/30 bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground focus:border-[var(--data-success)]/30 outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleDbSearch}
                    disabled={dbSearching || !dbQuery.trim()}
                    className="px-3 py-2 rounded-lg bg-[var(--accent-soft)] text-white hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50 flex items-center gap-1 text-sm font-bold"
                  >
                    {dbSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                </div>
                {dbResults.length > 0 && (
                  <div className="space-y-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--data-success)]/30 bg-white dark:bg-card">
                    {dbResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applyDbResult(r)}
                        className="w-full text-left px-3 py-2.5 hover:bg-[var(--accent-soft)] flex flex-wrap items-center gap-3 transition-colors border-b border-gray-50 last:border-0"
                      >
                        {r.image && (
                          <Image src={r.image} alt={r.name} width={40} height={40} className="rounded-lg object-cover border border-[var(--rule-soft)] dark:border-card-border shrink-0 bg-gray-50 dark:bg-surface" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground truncate">{r.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{r.brand}{r.quantity ? ` · ${r.quantity}` : ""}{r.barcode ? ` · ${r.barcode}` : ""}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Nombre *</label>
                  <input required value={addForm.name} onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Arroz costeño 1kg" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Categoría *</label>
                  <select value={addForm.category} onChange={(e) => setAddForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm">
                    {realCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  {/* Sugerencia automática: si el nombre del producto contiene
                      una palabra clave que mapea a otra categoría distinta a
                      la elegida, mostramos un chip con botón "Aplicar". */}
                  <CategorySuggestionInline
                    name={addForm.name}
                    currentCategory={addForm.category}
                    onApply={(id) => setAddForm(f => ({ ...f, category: id }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Precio de venta (S/) *</label>
                  <input required type="number" step="0.01" min="0" value={addForm.price} onChange={(e) => setAddForm(f => ({ ...f, price: e.target.value }))} placeholder="5.50" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Precio de costo (S/)</label>
                  <input type="number" step="0.01" min="0" value={addForm.costPrice} onChange={(e) => setAddForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="3.50" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Unidad</label>
                  <input value={addForm.unit} onChange={(e) => setAddForm(f => ({ ...f, unit: e.target.value }))} placeholder="kg, und, bolsa…" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Badge</label>
                  <select value={addForm.badge} onChange={(e) => setAddForm(f => ({ ...f, badge: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm">
                    <option value="">Sin badge</option>
                    {["Oferta", "Popular", "Fresco", "Premium"].map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Stock actual</label>
                  <input type="number" min="0" value={addForm.stock} onChange={(e) => setAddForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1" title="Cantidad mínima antes de generar alerta de stock bajo">Stock mínimo</label>
                  <input type="number" min="0" value={addForm.stockMin} onChange={(e) => setAddForm(f => ({ ...f, stockMin: e.target.value }))} placeholder="5" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Stock máximo</label>
                  <input type="number" min="0" value={addForm.stockMax} onChange={(e) => setAddForm(f => ({ ...f, stockMax: e.target.value }))} placeholder="100" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Fecha de vencimiento</label>
                  <input type="date" value={addForm.expiryDate} onChange={(e) => setAddForm(f => ({ ...f, expiryDate: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Código de barras</label>
                  <div className="flex flex-wrap gap-2">
                    <input value={addForm.barcode} onChange={(e) => setAddForm(f => ({ ...f, barcode: e.target.value }))} placeholder="7750000000000" className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm font-mono" />
                    <button type="button" onClick={() => setShowScanner(true)} className="px-3 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors">
                      <ScanBarcode className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* IMPROVEMENT 3: Variant Management */}
              <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Layers className="h-4 w-4 text-[var(--text-secondary)] dark:text-[var(--text-primary)]" />
                    <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Gestionar variantes / presentaciones</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddForm(f => ({ ...f, isVariant: !f.isVariant }))}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer",
                      addForm.isVariant ? "bg-[var(--text-primary)]" : "bg-gray-200"
                    )}
                  >
                    <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", addForm.isVariant ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
                {addForm.isVariant && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--rule-base)]">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">Variante de (producto padre)</label>
                      <select
                        value={addForm.variantOf}
                        onChange={(e) => setAddForm(f => ({ ...f, variantOf: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground focus:border-[var(--text-primary)] outline-none text-sm"
                      >
                        <option value="">Ninguno (es producto padre)</option>
                        {products.filter(p => p.active).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">Atributo de variante</label>
                      <input
                        value={addForm.variantAttr}
                        onChange={(e) => setAddForm(f => ({ ...f, variantAttr: e.target.value }))}
                        placeholder="Ej: 500ml, 1L, pack 6 unid"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground focus:border-[var(--text-primary)] outline-none text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div className="sm:col-span-2 space-y-3">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Imagen del producto</label>
                  <ImageUploadHints />
                  {(() => {
                    const validation = validateImageUrl(addForm.image);
                    if (!validation.valid && addForm.image) {
                      return (
                        <p className="text-sm text-[var(--data-warning)] flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3" strokeWidth={2} aria-hidden />
                          {validation.reason}
                        </p>
                      );
                    }
                    return null;
                  })()}
                  <div className="flex flex-wrap gap-3 items-start">
                    {addForm.image && (
                      <div className="relative h-16 w-16 rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-card-border shrink-0 bg-gray-50 dark:bg-surface">
                        <Image src={addForm.image} alt="preview" fill unoptimized={addForm.image.startsWith("data:")} className="object-cover" sizes="64px" />
                        <ImageWarningBadge image={addForm.image} size="md" />
                      </div>
                    )}
                    <div className="flex-1 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => addImgRef.current?.click()}
                        disabled={imgUploading}
                        className="w-full flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        <Camera className="h-4 w-4" />
                        {imgUploading ? "Procesando…" : "Subir foto"}
                      </button>
                      <input
                        value={addForm.image}
                        onChange={(e) => setAddForm(f => ({ ...f, image: e.target.value }))}
                        placeholder="o pegar URL de imagen (PNG con fondo transparente)"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm"
                      />
                      <input
                        ref={addImgRef}
                        type="file"
                        accept="image/png,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setImgUploading(true);
                          try {
                            const dataUrl = await resizeImage(file);
                            setAddForm(f => ({ ...f, image: dataUrl }));
                          } finally {
                            setImgUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60">
                  {saving ? "Guardando…" : "Agregar producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit product modal ── */}
      {editModalProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && closeEditModal()}>
          <div className="bg-white dark:bg-card w-full sm:max-w-2xl sm:rounded-xl rounded-t-2xl overflow-y-auto max-h-[90dvh]">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white dark:bg-card z-10">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground truncate pr-2">Editar: {editModalProduct.name}</CardTitle>
              <button onClick={closeEditModal} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors shrink-0">
                <X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Nombre *</label>
                  <input required value={editForm.name ?? ""} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Categoría</label>
                  <select value={editForm.category ?? ""} onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm">
                    {realCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  {/* Sugerencia heurística para edición — mismo flujo que en
                      el form de creación. */}
                  <CategorySuggestionInline
                    name={editForm.name ?? ""}
                    currentCategory={editForm.category ?? ""}
                    onApply={(id) => setEditForm(f => ({ ...f, category: id }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Precio de venta (S/)</label>
                  <input type="number" step="0.01" min="0" value={editForm.price ?? ""} onChange={(e) => setEditForm(f => ({ ...f, price: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Precio de costo (S/)</label>
                  <input type="number" step="0.01" min="0" value={editForm.costPrice ?? ""} onChange={(e) => setEditForm(f => ({ ...f, costPrice: Number(e.target.value) || undefined }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Unidad</label>
                  <input value={editForm.unit ?? ""} onChange={(e) => setEditForm(f => ({ ...f, unit: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Badge</label>
                  <select value={editForm.badge ?? ""} onChange={(e) => setEditForm(f => ({ ...f, badge: e.target.value || undefined }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm">
                    <option value="">Sin badge</option>
                    {["Oferta", "Popular", "Fresco", "Premium"].map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Stock actual</label>
                  <input type="number" min="0" value={editForm.stock ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stock: e.target.value !== "" ? Number(e.target.value) : undefined }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1" title="Cantidad mínima antes de generar alerta de stock bajo">Stock mínimo</label>
                  <input type="number" min="0" value={editForm.stockMin ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stockMin: e.target.value !== "" ? Number(e.target.value) : undefined }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Stock máximo</label>
                  <input type="number" min="0" value={editForm.stockMax ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stockMax: e.target.value !== "" ? Number(e.target.value) : undefined }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Fecha de vencimiento</label>
                  <input type="date" value={editForm.expiryDate ?? ""} onChange={(e) => setEditForm(f => ({ ...f, expiryDate: e.target.value || undefined }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Código de barras</label>
                  <input value={editForm.barcode ?? ""} onChange={(e) => setEditForm(f => ({ ...f, barcode: e.target.value || undefined }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm font-mono" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Descripción del producto</label>
                  <textarea
                    rows={3}
                    value={editForm.description ?? ""}
                    onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value || undefined }))}
                    placeholder="Ej: Aceite de girasol puro, ideal para frituras ligeras. Botella de 1 litro."
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm resize-none"
                  />
                </div>
              </div>

              {/* IMPROVEMENT 3: Variant Management in Edit */}
              <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Layers className="h-4 w-4 text-[var(--text-secondary)] dark:text-[var(--text-primary)]" />
                    <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Gestionar variantes / presentaciones</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, isVariant: !f.isVariant }))}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer",
                      editForm.isVariant ? "bg-[var(--text-primary)]" : "bg-gray-200"
                    )}
                  >
                    <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", editForm.isVariant ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
                {editForm.isVariant && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--rule-base)]">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">Variante de (producto padre)</label>
                      <select
                        value={editForm.variantOf ?? ""}
                        onChange={(e) => setEditForm(f => ({ ...f, variantOf: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground focus:border-[var(--text-primary)] outline-none text-sm"
                      >
                        <option value="">Ninguno (es producto padre)</option>
                        {products.filter(p => p.active && p.id !== editModalProduct?.id).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">Atributo de variante</label>
                      <input
                        value={editForm.variantAttr ?? ""}
                        onChange={(e) => setEditForm(f => ({ ...f, variantAttr: e.target.value }))}
                        placeholder="Ej: 500ml, 1L, pack 6 unid"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground focus:border-[var(--text-primary)] outline-none text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Imagen del producto</label>
                  <div className="flex flex-wrap gap-3 items-start">
                    {editForm.image && (
                      <div className="relative h-16 w-16 rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-card-border shrink-0 bg-gray-50 dark:bg-surface">
                        <Image src={editForm.image} alt="preview" fill unoptimized={editForm.image.startsWith("data:")} className="object-cover" sizes="64px" />
                      </div>
                    )}
                    <div className="flex-1 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => editImgRef.current?.click()}
                        disabled={imgUploading}
                        className="w-full flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        <Camera className="h-4 w-4" />
                        {imgUploading ? "Procesando…" : "Subir foto"}
                      </button>
                      <input
                        value={editForm.image ?? ""}
                        onChange={(e) => setEditForm(f => ({ ...f, image: e.target.value }))}
                        placeholder="o pegar URL de imagen"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm"
                      />
                      <input
                        ref={editImgRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setImgUploading(true);
                          try {
                            const dataUrl = await resizeImage(file);
                            setEditForm(f => ({ ...f, image: dataUrl }));
                          } finally {
                            setImgUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-surface rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground">Estado del producto</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{editForm.active ? "Visible en la tienda" : "Oculto en la tienda"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, active: !f.active }))}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer",
                    editForm.active ? "bg-[var(--accent-soft)]" : "bg-gray-200"
                  )}
                >
                  <span className={cn("inline-block h-5 w-5 rounded-full bg-white dark:bg-card shadow transition-transform", editForm.active ? "translate-x-5" : "translate-x-0")} />
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={closeEditModal} className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
                <button type="button" onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60">
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-primary text-white rounded-xl px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-4 animate-[slideUp_0.2s_ease-out]">
          <CheckSquare className="h-5 w-5 shrink-0" />
          <span className="text-sm font-bold">{selectedIds.size} seleccionado{selectedIds.size > 1 ? "s" : ""}</span>
          <button onClick={() => { setBulkField("active"); setBulkValue("true"); setBulkModal(true); }}
            className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors">
            Edición masiva
          </button>
          {/* IMPROVEMENT 2: Quick activate/deactivate */}
          <button
            onClick={async () => {
              const ids = Array.from(selectedIds);
              await fetch("/api/products/bulk", {
                method: "POST",
                headers: csrfHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ ids, fields: { active: true } }),
              });
              clearSelection();
              load();
            }}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] text-xs font-semibold transition-colors flex items-center gap-1"
          >
            <Eye className="h-3 w-3" /> Activar
          </button>
          <button
            onClick={async () => {
              const ids = Array.from(selectedIds);
              await fetch("/api/products/bulk", {
                method: "POST",
                headers: csrfHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ ids, fields: { active: false } }),
              });
              clearSelection();
              load();
            }}
            className="px-3 py-1.5 rounded-lg bg-gray-500/80 hover:bg-gray-500 text-xs font-semibold transition-colors flex items-center gap-1"
          >
            <EyeOff className="h-3 w-3" /> Desactivar
          </button>
          <button
            onClick={() => {
              // Si el user marco "no preguntar" antes, ejecutar directo
              const skip =
                typeof window !== "undefined" &&
                localStorage.getItem("admin-skip-bulk-clear-images-confirm") === "1";
              if (skip) {
                executeBulkClearImages();
              } else {
                setBulkClearImagesConfirm(true);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-[var(--data-warning)]/80 hover:bg-[var(--data-warning)] text-xs font-semibold transition-colors flex items-center gap-1"
            title="Quita la imagen de los productos seleccionados (no los elimina)"
          >
            <Camera className="h-3 w-3" /> Quitar imágenes
          </button>
          <button
            onClick={() => setBulkDeleteConfirm(true)}
            className="px-3 py-1.5 rounded-lg bg-[var(--data-error)]/80 hover:bg-[var(--data-error)] text-xs font-semibold transition-colors flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> Eliminar
          </button>
          <button onClick={clearSelection}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors">
            Limpiar
          </button>
        </div>
      )}

      {/* Bulk clear images confirmation modal */}
      {bulkClearImagesConfirm && (
        <div className="modal-backdrop flex items-center justify-center p-4">
          <div className="bg-white dark:bg-card rounded-xl max-w-sm w-full overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--data-warning-100)] dark:bg-orange-950/30">
                  <Camera className="h-5 w-5 text-[var(--data-warning)]" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-foreground">Quitar imágenes</CardTitle>
                  <p className="text-sm text-muted">Solo borra la imagen, no el producto</p>
                </div>
              </div>
              <p className="text-sm text-foreground">
                ¿Quitar la imagen de <strong>{selectedIds.size}</strong> producto{selectedIds.size > 1 ? "s" : ""}?
                Los productos siguen activos pero quedan sin imagen hasta que subas una nueva con
                fondo transparente.
              </p>
              <label className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontAskBulkClear}
                  onChange={(e) => setDontAskBulkClear(e.target.checked)}
                  className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                />
                <span>No volver a preguntar (puedo deshacer desde la cuenta)</span>
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setBulkClearImagesConfirm(false)}
                  className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (dontAskBulkClear) {
                      try {
                        localStorage.setItem("admin-skip-bulk-clear-images-confirm", "1");
                      } catch { /* silent */ }
                    }
                    executeBulkClearImages();
                  }}
                  disabled={bulkClearingImages}
                  className="flex-1 py-2.5 rounded-lg bg-[var(--data-warning)] hover:bg-[var(--data-warning)]/90 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {bulkClearingImages ? "Quitando…" : `Sí, quitar ${selectedIds.size}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      {bulkDeleteConfirm && (
        <div className="modal-backdrop flex items-center justify-center p-4">
          <div className="bg-white dark:bg-card rounded-xl max-w-sm w-full overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--data-error-100)] dark:bg-red-950/30">
                  <Trash2 className="h-5 w-5 text-[var(--data-error)]" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-foreground">Eliminar productos</CardTitle>
                  <p className="text-sm text-muted">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <p className="text-sm text-foreground">
                ¿Estás seguro de eliminar <strong>{selectedIds.size}</strong> producto{selectedIds.size > 1 ? "s" : ""}? Se quitarán del catálogo y ya no aparecerán en la tienda.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setBulkDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeBulkDelete}
                  disabled={bulkDeleting}
                  className="flex-1 py-2.5 rounded-lg bg-[var(--data-error)] hover:bg-[var(--data-error)] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {bulkDeleting ? "Eliminando…" : `Sí, eliminar ${selectedIds.size}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk edit modal */}
      {bulkModal && (
        <div className="modal-backdrop flex items-center justify-center p-4">
          <div className="bg-white dark:bg-card rounded-xl max-w-sm w-full overflow-hidden">
            <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
              <CardTitle className="text-lg font-bold text-foreground">Edición masiva — {selectedIds.size} producto{selectedIds.size > 1 ? "s" : ""}</CardTitle>
              <button onClick={() => setBulkModal(false)} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Campo a modificar</label>
                <select value={bulkField} onChange={e => { setBulkField(e.target.value as typeof bulkField); setBulkValue(""); }}
                  className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface px-3 py-2 text-sm">
                  <option value="active">Estado (activo/inactivo)</option>
                  <option value="category">Categoría</option>
                  <option value="priceAdjust">Ajuste de precio (S/)</option>
                  <option value="pricePercent">Ajuste de precio (%)</option>
                  <option value="stock">Stock</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Nuevo valor</label>
                {bulkField === "active" ? (
                  <select value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface px-3 py-2 text-sm">
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                ) : bulkField === "category" ? (
                  <select value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface px-3 py-2 text-sm">
                    <option value="">Seleccionar…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                ) : bulkField === "priceAdjust" ? (
                  <div className="mt-1">
                    <input type="number" step="0.01" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 1.50 para aumentar S/1.50"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface px-3 py-2 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Monto en soles a sumar o restar del precio</p>
                  </div>
                ) : bulkField === "pricePercent" ? (
                  <div className="mt-1">
                    <input type="number" step="1" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 10 para +10%, -5 para -5%"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface px-3 py-2 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      Esto ajustará el precio de {selectedIds.size} producto{selectedIds.size > 1 ? "s" : ""} un {bulkValue ? `${bulkValue}%` : "...%"}
                    </p>
                  </div>
                ) : (
                  <input type="number" min="0" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Cantidad"
                    className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface px-3 py-2 text-sm" />
                )}
              </div>
            </div>
            <div className="px-3 sm:px-6 py-4 bg-gray-50 dark:bg-surface border-t border-[var(--rule-soft)] dark:border-card-border flex flex-wrap gap-3">
              <button onClick={() => setBulkModal(false)} className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 transition-colors">Cancelar</button>
              <button onClick={executeBulk} disabled={bulkSaving || (!bulkValue && bulkField !== "active")}
                className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60">
                {bulkSaving ? "Aplicando…" : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kardex Modal */}
      {kardexProduct && (
        <KardexModal
          productId={kardexProduct.id}
          productName={kardexProduct.name}
          onClose={() => setKardexProduct(null)}
        />
      )}

      {/* Modifiers Editor */}
      {modifiersProduct && (
        <ProductModifiersEditor
          productId={modifiersProduct.id}
          productName={modifiersProduct.name}
          onClose={() => setModifiersProduct(null)}
        />
      )}

      {/* Mejora 6 nueva: QR Modal */}
      {showQRProduct && (
        <>
          <div className="modal-backdrop" onClick={() => setShowQRProduct(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowQRProduct(null)}>
            <div className="w-full max-w-sm bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5 space-y-4 text-center">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">Codigo QR</CardTitle>
                <button onClick={() => setShowQRProduct(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent">
                  <X className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>
              <Image
                src={`https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(`PROD:${showQRProduct.id}|${showQRProduct.name}|S/${showQRProduct.price}`)}`}
                alt={`QR ${showQRProduct.name}`}
                className="mx-auto"
                width={200}
                height={200}
              />
              <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{showQRProduct.name}</p>
              <p className="text-lg font-extrabold text-primary">S/{showQRProduct.price.toFixed(2)}</p>
              {showQRProduct.barcode && <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">SKU: {showQRProduct.barcode}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const w = window.open("", "_blank");
                    if (w) {
                      w.document.write(`<html><head><title>QR ${showQRProduct.name}</title><style>body{text-align:center;font-family:sans-serif;padding:40px}img{margin:20px auto}@media print{button{display:none}}</style></head><body><h2>${showQRProduct.name}</h2><img src="https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(`PROD:${showQRProduct.id}|${showQRProduct.name}|S/${showQRProduct.price}`)}" /><p style="font-size:24px;font-weight:bold;color:var(--color-primary)">S/${showQRProduct.price.toFixed(2)}</p><button onclick="window.print()">Imprimir</button></body></html>`);
                      w.document.close();
                    }
                  }}
                  className="flex-1 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground font-bold text-xs hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  Imprimir
                </button>
                <a
                  href={`https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(`PROD:${showQRProduct.id}|${showQRProduct.name}|S/${showQRProduct.price}`)}`}
                  download={`qr-${showQRProduct.name.replace(/\s+/g, "-")}.png`}
                  className="flex-1 py-2 rounded-lg bg-primary text-white font-bold text-xs hover:bg-primary-dark transition-colors flex items-center justify-center gap-1.5"
                >
                  Descargar
                </a>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mejora 5 nueva: Auto-reorden modal */}
      {showAutoReorder !== null && (
        <>
          <div className="modal-backdrop" onClick={() => setShowAutoReorder(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowAutoReorder(null)}>
            <div className="w-full max-w-sm bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">Configurar Auto-Reorden</CardTitle>
                <button onClick={() => setShowAutoReorder(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent">
                  <X className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Reordenar cuando stock sea menor o igual a:</label>
                <input
                  type="number" min="1" value={arThreshold} onChange={e => setArThreshold(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="5"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Cantidad a pedir:</label>
                <input
                  type="number" min="1" value={arQty} onChange={e => setArQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="10"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAutoReorder(null)} className="flex-1 px-4 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors">
                  Cancelar
                </button>
                <button onClick={() => saveAutoReorder(showAutoReorder)} className="flex-1 px-4 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark  transition-colors">
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mejora 5 nueva: Resumen de auto-reorden */}
      {autoReorderCount > 0 && view === "productos" && (
        <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-xl p-3 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-[var(--data-success)] shrink-0" />
          <p className="text-xs text-[var(--data-success)] dark:text-[var(--data-success)] font-bold">
            {autoReorderCount} producto{autoReorderCount > 1 ? "s" : ""} con reorden automatico configurado
          </p>
        </div>
      )}

      {/* Expanded table modal */}
      {showExpandedTable && (
        <ExpandedStockModal products={products} movements={movements} onClose={() => setShowExpandedTable(false)} />
      )}

      {/* Context menu for product rows (right-click) */}
      {ctxMenu && (
        <InventoryContextMenu
          product={ctxMenu.product}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onEdit={(p) => { openEditModal(p); setCtxMenu(null); }}
          onView={(p) => { setKardexProduct({ id: p.id, name: p.name }); setCtxMenu(null); }}
          onDuplicate={(p) => {
            setAddForm({
              name: `${p.name} (Copia)`,
              category: p.category,
              price: String(p.price),
              unit: p.unit,
              badge: p.badge ?? "",
              image: p.image ?? "",
              barcode: "",
              costPrice: p.costPrice != null ? String(p.costPrice) : "",
              stock: "0",
              stockMin: p.stockMin != null ? String(p.stockMin) : "",
              stockMax: p.stockMax != null ? String(p.stockMax) : "",
              expiryDate: "",
              isVariant: false,
              variantOf: "",
              variantAttr: "",
            });
            setShowAdd(true);
            setCtxMenu(null);
          }}
          onDelete={(p) => { deleteProduct(p.id); setCtxMenu(null); }}
        />
      )}
    </div>
  );
}

/* ── CategorySuggestionInline ────────────────────────────────────────────────
   Asistente heurístico de categoría en el form de inventario.

   Dado el nombre del producto, el detector heurístico busca palabras clave
   y propone la categoría más probable. Si la categoría detectada difiere
   de la elegida actualmente, mostramos un panel naranja con un botón
   "Aplicar" que cambia la categoría en un click.

   Si las dos coinciden, mostramos un check verde tenue como confirmación.
   Si el detector no encuentra nada confiable, no mostramos nada (silencio). */
function CategorySuggestionInline({
  name,
  currentCategory,
  onApply,
}: {
  name: string;
  currentCategory: string;
  onApply: (id: string) => void;
}) {
  const detection = useMemo(() => detectCategoryFromName(name), [name]);
  if (!detection) return null;

  if (detection.id === currentCategory) {
    return (
      <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] flex items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Categoría coincide con la detección automática.
      </p>
    );
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
          Sugerencia automática
        </p>
        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
          Detectada: <span className="text-[var(--accent)]">{detection.label}</span>
        </p>
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
          Por la palabra &ldquo;{detection.matchedKeyword}&rdquo;
        </p>
      </div>
      <button
        type="button"
        onClick={() => onApply(detection.id)}
        className="shrink-0 inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 active:scale-95 transition-all"
      >
        Aplicar
      </button>
    </div>
  );
}
