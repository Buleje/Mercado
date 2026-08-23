"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef, useMemo, type FormEvent } from "react";
import {
  Package, AlertTriangle, ArrowUp, ArrowDown, RefreshCw,
  Search, Loader2, ClipboardList, Plus, Pencil, Trash2,
  ScanBarcode, X, Camera, Download, Filter, ChevronDown,
  TrendingUp, PackagePlus, Eye, EyeOff, Layers, ChevronRight, Upload, CheckCircle, BookOpen,
  Maximize2, Sliders, LayoutGrid, LayoutList, Sparkles,
} from "@buleje/design-system/icons";
import ProductModifiersEditor from "@/components/admin/inventario/ProductModifiersEditor";
import ProductVariantsInline from "@/components/admin/inventario/ProductVariantsInline";
import ImageBankPicker from "@/components/admin/inventario/ImageBankPicker";
import ProductSpecsEditor, { type SpecRow } from "@/components/admin/inventario/ProductSpecsEditor";
import ProductRichContentEditor, { type RichBlock } from "@/components/admin/inventario/ProductRichContentEditor";
import { toast } from "sonner";
import { ModuleActionMenu, type ModuleActionItem } from "@/components/admin/shared/ModuleActionMenu";
import EmptyState from "@/components/admin/shared/EmptyState";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useUndoToast } from "@/components/admin/shared/UndoToast";
import Image from "next/image";
import QRCode from "qrcode";
import { cn, exportToCSV } from "@/lib/utils";
import { StockLevelBar } from "@/components/admin/inventario/StockLevelBar";
import { StockTrackToggle } from "@/components/admin/inventario/StockTrackToggle";
import { InventoryContextMenu } from "@/components/admin/inventario/InventoryContextMenu";
import { getRotationInfo, computeStockChange, computeSalesPerWeek, processImage } from "@/components/admin/inventario/inventory-helpers";
import { CategorySuggestionInline } from "@/components/admin/inventario/CategorySuggestionInline";
import { exportToExcel } from "@/lib/export-excel";
import KardexModal from "./KardexModal";
import PriceSparkline from "./inventario/PriceSparkline";
import ImageWarningBadge from "./inventario/ImageWarningBadge";
import ImageUploadHints from "./inventario/ImageUploadHints";
import { Field } from "@/components/admin/shared/Field";
import { validateImageUrl } from "@/lib/image-validators";
import { csrfHeaders } from "@/lib/csrf-client";
import { categories } from "@/data/products";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import type { DbProduct, DbInventoryMovement } from "@/lib/jsondb";
import dynamic from "next/dynamic";
import { usePagination, Paginator } from "@/hooks/use-pagination";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });
const ExpandedStockModal = dynamic(() => import("@/components/admin/inventario/ExpandedStockModal"), { ssr: false });
const BulkImageAssignModal = dynamic(() => import("@/components/admin/inventario/BulkImageAssignModal"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────

type View = "productos" | "kanban";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/${n.toFixed(2)}`; }

const realCategories = categories.filter(c => c.id !== "todos");

// ── Estilos compartidos de los modales de producto (minimalista 2026-06-06) ──
// Borde 1px, fondo blanco, foco con ring sutil — limpio y profesional, sin la
// densidad de border-2 + ring-4 anterior.
const FIELD_INPUT =
  "w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] placeholder:font-normal placeholder:text-[var(--text-tertiary)] outline-none transition-colors hover:border-[var(--accent)]/40 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const FIELD_LABEL =
  "block text-xs font-semibold text-[var(--text-secondary)] mb-1.5";

// ── Component ────────────────────────────────────────────────────────────────

export default function InventoryTab({ headerActions = [] }: { headerActions?: ModuleActionItem[] } = {}) {
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
    // BUG-FIX (audit 2026-05-05): guard contra modulus-by-zero si el array
    // se vacía dinámicamente — `% 0` retorna NaN y causa "phIndex must be a number".
    const len = searchPlaceholders.length;
    if (len === 0) return;
    const t = setInterval(() => setPhIndex(i => (i + 1) % len), 3000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [catFilter, setCatFilter] = useState("todos");
  // Categorías que el comerciante creó en Promociones → Categorías
  // (settings.categoryOrder). El form de productos las usa en vez del
  // catálogo demo estático. Vacío para negocios sin categorías propias.
  const [savedCategories, setSavedCategories] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (cancelled || !s) return;
        const order = (s.categoryOrder ?? []) as Array<{ id: string; label: string; visible?: boolean }>;
        setSavedCategories(order.filter((c) => c.visible !== false).map((c) => ({ id: c.id, label: c.label })));
      })
      .catch(() => {
        /* settings opcional — si falla, se usan las categorías por defecto del catálogo */
      });
    return () => { cancelled = true; };
  }, []);
  const [lowOnly, setLowOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  // Mejora 8R2: Filtro sin imagen
  const [noImageOnly, setNoImageOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  // View mode toggle (table vs cards) — persistido en localStorage
  const [viewMode, setViewMode] = useState<"table" | "cards">(() => {
    if (typeof window === "undefined") return "table";
    const saved = window.localStorage.getItem("inv-view-mode");
    return saved === "cards" ? "cards" : "table";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("inv-view-mode", viewMode);
  }, [viewMode]);
  const [expandedOC, setExpandedOC] = useState(false);
  const [generatingOC, setGeneratingOC] = useState(false);

  // Product CRUD state
  const [editModalProduct, setEditModalProduct] = useState<DbProduct | null>(null);
  const [editForm, setEditForm] = useState<Partial<DbProduct & { expiryDate?: string; isVariant?: boolean; variantOf?: string; variantAttr?: string; trackStock?: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerCat, setPickerCat] = useState("todos");
  // trackStock: Brandon 2026-06-06 — cuando false, el producto es de stock
  // ILIMITADO (comidas que se preparan al pedido, servicios, etc.) → no se
  // controla inventario. Al guardar, stock/min/max van como null.
  const EMPTY_ADD = { name: "", category: "", price: "", unit: "und", badge: "", image: "", barcode: "", costPrice: "", trackStock: true, stock: "", stockMin: "", stockMax: "", expiryDate: "", isVariant: false, variantOf: "", variantAttr: "", type: "product", description: "", brand: "", sku: "", taxType: "gravado", weightKg: "", dimensions: "", durationLabel: "", pricingUnit: "fijo", notes: "" };
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  // Fase 2: presentaciones / variantes (ProductVariant[]) del producto a crear.
  // Cada fila tiene precio ABSOLUTO; al guardar se convierte a priceModifier
  // (delta vs precio base) que es lo que persiste el modelo.
  const [addVariants, setAddVariants] = useState<{ name: string; price: string; stock: string }[]>([]);
  // Fase 2: grupos de modificadores (ProductModifierGroup[]) — ej "Cremas" → ají,
  // mayonesa (+precio). priceDelta SIEMPRE ≥ 0 (es un extra). Se guardan vía PUT
  // /api/products/[id]/modifiers tras crear el producto.
  const [addModifierGroups, setAddModifierGroups] = useState<{ name: string; required: boolean; multi: boolean; options: { name: string; priceDelta: string }[] }[]>([]);
  // Fase 2: SEO del producto (metaTitle/metaDescription/ogImage) — se guarda vía
  // PUT /api/marketplace/products/[id]/seo tras crear (la página de producto lo lee).
  const [addSeo, setAddSeo] = useState({ metaTitle: "", metaDescription: "", ogImage: "" });
  // Fase 2: galería de fotos adicionales (ProductImage[]). La imagen principal
  // sigue en addForm.image; estas son extra (isPrimary:false). Se suben a
  // /api/upload y se persisten vía POST /api/marketplace/products/[id]/images.
  const [addGallery, setAddGallery] = useState<string[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(false);
  // Contenido rico (estilo Amazon): ficha técnica editable + bloques A+.
  const [addSpecs, setAddSpecs] = useState<SpecRow[]>([]);
  const [addRich, setAddRich] = useState<RichBlock[]>([]);
  const [editSpecs, setEditSpecs] = useState<SpecRow[]>([]);
  const [editRich, setEditRich] = useState<RichBlock[]>([]);
  // Reset de extras cada vez que se abre el modal (alta o duplicar).
  useEffect(() => { if (showAdd) { setAddVariants([]); setAddModifierGroups([]); setAddSeo({ metaTitle: "", metaDescription: "", ogImage: "" }); setAddGallery([]); setAddSpecs([]); setAddRich([]); } }, [showAdd]);
  const [showScanner, setShowScanner] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgInfo, setImgInfo] = useState<{ originalKB: number; finalKB: number; width: number; height: number; quality: number } | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [aiDescGenerating, setAiDescGenerating] = useState(false);
  const [aiDescError, setAiDescError] = useState<string | null>(null);
  const [showImageBank, setShowImageBank] = useState(false);
  const [showBulkImageAssign, setShowBulkImageAssign] = useState(false);

  const generateDescriptionAI = useCallback(async (form: typeof editForm, setter: typeof setEditForm) => {
    const name = form.name?.trim();
    if (!name || name.length < 2) {
      setAiDescError("Ponele un nombre al producto antes de generar");
      return;
    }
    setAiDescGenerating(true);
    setAiDescError(null);
    try {
      const res = await fetch("/api/products/generate-description", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({
          name,
          category: form.category ?? null,
          attributes: [form.unit, form.badge].filter(Boolean).join(", ") || null,
          tone: "friendly",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Error al generar");
      }
      const data = await res.json() as { description: string };
      setter(f => ({ ...f, description: data.description }));
    } catch (e) {
      setAiDescError(e instanceof Error ? e.message : "Error al generar");
    } finally {
      setAiDescGenerating(false);
    }
  }, []);
  const addImgRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const editImgRef = useRef<HTMLInputElement>(null);

  // National DB search
  const [dbQuery, setDbQuery] = useState("");
  const [dbResults, setDbResults] = useState<Array<{ name: string; brand: string; barcode: string; image: string; quantity: string; unit: string }>>([]);
  const [dbSearching, setDbSearching] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkField, setBulkField] = useState<"active" | "category" | "price" | "priceDelta" | "pricePercent" | "stock" | "stockMin" | "stockMax" | "badge">("active");
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
  // QR generado localmente (chart.googleapis.com está muerto desde 2019).
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!showQRProduct) { setQrDataUrl(null); return; }
    const payload = `PROD:${showQRProduct.id}|${showQRProduct.name}|S/${showQRProduct.price}`;
    QRCode.toDataURL(payload, { width: 300, margin: 2, color: { dark: "#1a3d2e", light: "#ffffff" } })
      .then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [showQRProduct]);

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
  const closeEditModal = () => { setEditModalProduct(null); setEditForm({}); setImgInfo(null); setImgError(null); setEditSpecs([]); setEditRich([]); };

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
  }, [editModalProduct]);

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

  // Auto-save del campo `image` cuando el usuario lo cambia en modo edit.
  // Optimistic update local — NO refetch (load() global resetea el scrollTop
  // del div overflow-y-auto del modal, dejando el preview fuera de viewport
  // ~900ms después del pick, que el usuario percibe como "no se aplicó").
  const autoSaveImage = useCallback(async (productId: number, imageUrl: string) => {
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ image: imageUrl }),
      });
      if (!res.ok) {
        toast.error("La imagen se ve aqui pero no persistio. Reintenta o usa Guardar.", { duration: 4000 });
        return;
      }
      toast.success("Imagen guardada", { duration: 1800 });
      setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, image: imageUrl } : p)));
    } catch {
      toast.error("Error de red al guardar imagen. Verifica conexion.", { duration: 4000 });
    }
  }, []);

  /**
   * Subir archivo de imagen al endpoint /api/upload (Supabase Storage + Sharp).
   * Reemplaza el flujo viejo `processImage` que devolvia dataUrl base64 inline
   * (~1-5MB en string que iba al JSON del PUT — lento y a veces fallaba).
   *
   * Retorna URL publica de la imagen subida o null si fallo.
   */
  const uploadImageFile = useCallback(async (file: File): Promise<string | null> => {
    const t = toast.loading("Subiendo imagen...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "products");
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: csrfHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error("No se pudo subir la imagen", {
          id: t,
          description: err.error ?? `HTTP ${res.status}. Intenta con una imagen mas chica.`,
        });
        return null;
      }
      const data = await res.json() as { url: string };
      toast.success("Imagen subida", { id: t, duration: 1500 });
      return data.url;
    } catch (e) {
      toast.error("Error de red al subir imagen", {
        id: t,
        description: e instanceof Error ? e.message : "Verifica conexion.",
      });
      return null;
    }
  }, []);

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
    // Antes se anunciaba «Producto eliminado» pasara lo que pasara. Con un
    // 409 (el producto tiene ventas asociadas) o un 402 (plan vencido) el
    // aviso salía igual —incluido el «contacta soporte para restauración»—,
    // el `load()` lo traía de vuelta a la lista, y el encargado terminaba sin
    // saber si el producto estaba borrado o no.
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          typeof body?.error === "string"
            ? body.error
            : `No se pudo eliminar "${name}" (error ${res.status})`,
        );
        return;
      }
      showUndo({
        message: `Producto "${name}" eliminado`,
        detail: "Si fue un error, contacta soporte para restauración.",
        duration: 6000,
      });
    } catch (err) {
      console.warn("[InventoryTab] eliminar producto falló", err);
      toast.error("Sin conexión — el producto NO se eliminó.");
      return;
    }
    load();
  };

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
      toast.error("Error de conexión. Reintentá.");
    }
    setSaving(false);
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
    // Precio: fijar (absoluto), ajustar en soles (delta) o en porcentaje.
    // FIX 2026-06-11: antes "priceAdjust" (etiquetado S/) se aplicaba como % y
    // "pricePercent" se enviaba a un campo inexistente → no hacía nada. Ahora
    // cada modo mapea al campo correcto del endpoint (/api/products/bulk).
    if (bulkField === "price") fields.price = Number(bulkValue);
    if (bulkField === "priceDelta") fields.priceDelta = Number(bulkValue);
    if (bulkField === "pricePercent") fields.priceAdjust = Number(bulkValue);
    if (bulkField === "stock") fields.stock = Number(bulkValue);
    if (bulkField === "stockMin") fields.stockMin = Number(bulkValue);
    if (bulkField === "stockMax") fields.stockMax = Number(bulkValue);
    // Etiqueta: string vacío → null = quitar la etiqueta.
    if (bulkField === "badge") fields.badge = bulkValue.trim() || null;

    try {
      // Una edición masiva toca el precio o el stock de decenas de productos:
      // que falle sin decir nada es la peor combinación posible. Antes el
      // modal se cerraba y la selección se limpiaba igual, así que ni siquiera
      // quedaba a mano para reintentar.
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, fields }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          typeof body?.error === "string"
            ? body.error
            : `No se pudo aplicar el cambio a ${ids.length} producto${ids.length === 1 ? "" : "s"} (error ${res.status})`,
        );
        return;
      }
      toast.success(`${ids.length} producto${ids.length === 1 ? "" : "s"} actualizado${ids.length === 1 ? "" : "s"}`);
      setBulkModal(false);
      clearSelection();
      load();
    } catch (err) {
      console.warn("[InventoryTab] edición masiva falló", err);
      toast.error("Sin conexión — no se aplicó ningún cambio.");
    } finally {
      setBulkSaving(false);
    }
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

  /**
   * Exporta a CSV solo los productos seleccionados (acción masiva client-side,
   * sin endpoint). Útil para revisar/editar en Excel o pasar a un proveedor.
   */
  const exportSelectedCSV = () => {
    const rows = products
      .filter((p) => selectedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        nombre: p.name,
        categoria: p.category ?? "",
        precio: Number(p.price ?? 0),
        stock: p.stock ?? "",
        stock_min: p.stockMin ?? "",
        stock_max: p.stockMax ?? "",
        unidad: p.unit ?? "",
        sku: p.sku ?? "",
        codigo_barras: p.barcode ?? "",
        etiqueta: p.badge ?? "",
        activo: p.active ? "Sí" : "No",
      }));
    if (rows.length === 0) return;
    exportToCSV(rows, `productos-seleccion-${rows.length}`);
    toast.success(`${rows.length} producto${rows.length > 1 ? "s" : ""} exportado${rows.length > 1 ? "s" : ""} a CSV`);
  };

  // ── Purchase Order Auto-Suggestion ──────────────────────────────────────

  const lowStockProducts = products.filter(p => {
    const minStock = p.stockMin ?? 5;
    return p.stock != null && p.stock <= minStock && p.active;
  });

  /**
   * Activar o desactivar productos en lote, avisando si no entró.
   * Devuelve `true` sólo si el servidor lo aceptó.
   */
  const bulkEstado = async (ids: number[], active: boolean): Promise<boolean> => {
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, fields: { active } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          typeof body?.error === "string"
            ? body.error
            : `No se pudo ${active ? "activar" : "desactivar"} ${ids.length} producto${ids.length === 1 ? "" : "s"} (error ${res.status})`,
        );
        return false;
      }
      toast.success(`${ids.length} producto${ids.length === 1 ? "" : "s"} ${active ? "activado" : "desactivado"}${ids.length === 1 ? "" : "s"}`);
      return true;
    } catch (err) {
      console.warn("[InventoryTab] bulk activar/desactivar falló", err);
      toast.error("Sin conexión — no cambió ningún producto.");
      return false;
    }
  };

  const generateOC = async (product: DbProduct) => {
    const minStock = product.stockMin ?? 5;
    const maxStock = product.stockMax ?? minStock * 2;
    const suggestedQty = maxStock - (product.stock ?? 0);
    const unitCost = product.costPrice ?? product.price * 0.7;

    setGeneratingOC(true);
    try {
      /**
       * Este botón nunca creó una orden.
       *
       * Manda `supplierId: ""` y la columna `PurchaseOrder.supplierId` es
       * obligatoria con FK: Postgres responde
       * `Foreign key constraint violated on PurchaseOrder_supplierId_fkey` y
       * el endpoint devuelve 500 — medido. Como no se miraba la respuesta y el
       * `catch` estaba mudo, el usuario clickeaba «Generar OC», no pasaba
       * nada, y no había forma de saber por qué.
       *
       * El producto no guarda a qué proveedor se le compra, así que la orden
       * no se puede armar sola: se dice qué falta y dónde hacerlo.
       */
      const res = await fetch("/api/purchases", {
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
      if (!res.ok) {
        toast.error(
          `No se pudo generar la orden de "${product.name}": falta elegir el proveedor. ` +
          "Creala desde Compras › Órdenes, con el proveedor y la cantidad.",
        );
        return;
      }
      toast.success(`Orden generada: ${suggestedQty} × ${product.name}`);
    } catch (err) {
      console.warn("[InventoryTab] generar OC falló", err);
      toast.error("Sin conexión — no se generó la orden.");
    } finally {
      setGeneratingOC(false);
    }
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
      // Mismo caso que `generateOC`: sin proveedor la orden no se puede crear
      // (FK obligatoria), y antes fallaba en silencio para TODA la lista.
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: "",
          items,
          notes: "OC automática - stock bajo",
        }),
      });
      if (!res.ok) {
        toast.error(
          `No se pudo generar la orden con ${items.length} producto${items.length === 1 ? "" : "s"}: ` +
          "falta elegir el proveedor. Creala desde Compras › Órdenes.",
        );
        return;
      }
      toast.success(`Orden generada con ${items.length} producto${items.length === 1 ? "" : "s"}`);
    } catch (err) {
      console.warn("[InventoryTab] generar OC masiva falló", err);
      toast.error("Sin conexión — no se generó la orden.");
    } finally {
      setGeneratingOC(false);
    }
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

  // Brandon 2026-06-01 (fix KPI "Bajo stock"): usa default stockMin 5 (igual que
  // `lowStockProducts` y el chip "Pocas existencias") en vez de exigir stockMin
  // definido. Antes un producto con stock 0 SIN stockMin nunca contaba como bajo
  // → el KPI mostraba "Stock saludable" aunque hubiera productos agotados.
  // Excluye stock no gestionado (undefined) y productos inactivos.
  const isLowStock = (p: DbProduct) =>
    Boolean(p.active) && p.stock != null && p.stock <= (p.stockMin ?? 5);

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
  // Valuación a COSTO REAL (unificado 2026-06-04, fuente única lib/chart-helpers):
  // solo productos con costPrice cargado — NUNCA fabricar price*0.7 (inflaba e
  // inconsistía con el dashboard de Inicio, que ya usa costo real). Para SUNAT
  // el inventario se valúa al costo de adquisición real.
  const totalStockValue = products.reduce(
    (s, p) => (p.costPrice != null ? s + (p.stock ?? 0) * p.costPrice : s), 0
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

  // ── Dynamic categories — derivadas del inventario real ─────────────────
  // En lugar de la lista hardcodeada de data/products.ts, calculamos las
  // categorías que efectivamente tienen productos (con conteo). Si el
  // catálogo del tenant no tiene "carnes" pero sí "panadería", solo se
  // muestra panadería. Mantenemos siempre "Todos" como primer chip.
  const dynamicCategories = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    products.forEach(p => {
      if (!showInactive && !p.active) return;
      const cat = (p.category || "otros").toLowerCase().trim();
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
      total++;
    });
    const humanize = (id: string) => {
      // 1) Categoría creada por el comerciante (settings.categoryOrder)
      const saved = savedCategories.find(sc => sc.id === id);
      if (saved) return saved.label;
      // 2) Catálogo conocido (data/products.ts) por label oficial
      const known = realCategories.find(rc => rc.id === id);
      if (known) return known.label;
      // Fallback: id-con-guiones → "Id Con Guiones"
      return id
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ") || "Otros";
    };
    const real = Array.from(counts.entries())
      .map(([id, count]) => ({ id, label: humanize(id), count }))
      .sort((a, b) => b.count - a.count);
    return [
      { id: "todos", label: "Todos", count: total },
      ...real,
    ];
  }, [products, showInactive, savedCategories]);

  // Categorías ASIGNABLES en el form de productos: las que el comerciante creó
  // (categoryOrder) + las que ya usan sus productos. NADA del catálogo demo
  // estático. Si no tiene ninguna → "General" para no bloquear el alta.
  const formCategories = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of savedCategories) map.set(c.id, c.label);
    for (const c of dynamicCategories) {
      if (c.id !== "todos" && !map.has(c.id)) map.set(c.id, c.label);
    }
    const arr = Array.from(map, ([id, label]) => ({ id, label }));
    return arr.length ? arr : [{ id: "general", label: "General" }];
  }, [savedCategories, dynamicCategories]);

  // Label legible de una categoría: 1) la del comerciante (categoryOrder),
  // 2) catálogo estático conocido, 3) id humanizado.
  const catLabelOf = useCallback((id: string): string => {
    if (!id) return "Sin categoría";
    const saved = savedCategories.find(c => c.id === id);
    if (saved) return saved.label;
    const known = realCategories.find(c => c.id === id);
    if (known) return known.label;
    return id.split(/[-_\s]+/).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ") || id;
  }, [savedCategories]);

  // Default de categoría al abrir el alta: primera categoría real del comercio.
  // EMPTY_ADD nace con category="" (las categorías cargan async).
  useEffect(() => {
    if (showAdd && (!addForm.category || !formCategories.some(c => c.id === addForm.category))) {
      setAddForm(f => ({ ...f, category: formCategories[0]?.id ?? "general" }));
    }
  }, [showAdd, formCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si el filtro activo ya no existe en el inventario (p.ej. eliminaron
  // todos los productos de esa categoría), reseteamos a "todos".
  useEffect(() => {
    if (catFilter !== "todos" && !dynamicCategories.some(c => c.id === catFilter)) {
      setCatFilter("todos");
    }
  }, [dynamicCategories, catFilter]);

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
        <div className="w-11 h-11 rounded-xl bg-[var(--rule-soft)] dark:bg-accent shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-6 w-32 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
          <div className="h-4 w-56 bg-[var(--rule-soft)] dark:bg-accent rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
          <div className="h-8 w-24 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
        </div>
      </div>
      {/* Toolbar skeleton */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-9 flex-1 min-w-45 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
        <div className="h-9 w-28 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
        <div className="h-9 w-24 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
        <div className="h-9 w-20 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
      </div>
      {/* KPI skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] rounded-xl p-5">
            <div className="h-3 w-1/3 bg-[var(--rule-soft)] dark:bg-accent rounded mb-3" />
            <div className="h-7 w-1/2 bg-[var(--rule-soft)] dark:bg-accent rounded mb-2" />
            <div className="h-1 w-full bg-[var(--rule-soft)] dark:bg-accent rounded mt-3" />
          </div>
        ))}
      </div>
      {/* Product row skeletons */}
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex flex-wrap items-center gap-3 p-3 bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
          <div className="h-10 w-10 bg-[var(--rule-soft)] dark:bg-accent rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[var(--rule-soft)] dark:bg-accent rounded w-1/3" />
            <div className="h-3 bg-[var(--rule-soft)] dark:bg-accent rounded w-1/4" />
          </div>
          <div className="h-6 w-16 bg-[var(--rule-soft)] dark:bg-accent rounded-full" />
          <div className="h-5 w-14 bg-[var(--rule-soft)] dark:bg-accent rounded" />
        </div>
      ))}
    </div>
  );

  // `space-y-4` y no 6: entre la barra de filtros y el primer producto había
  // cinco separaciones de 24 px —120 px de aire— y a Inventario se entra a ver
  // productos, no el cromo.
  return (
    <div className="space-y-4">
      {/* Toolbar único — búsqueda + filtros + acciones en UNA sola fila */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative h-10 min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] dark:text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholders[phIndex]}
            className="h-10 w-full pl-10 pr-4 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary transition-colors"
          />
        </div>
        {/* Filter chips inline */}
        <button
          onClick={() => setLowOnly(!lowOnly)}
          className={cn(
            "flex items-center gap-1 px-3 h-10 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap",
            lowOnly ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] dark:bg-amber-950/20 dark:text-[var(--data-warning-500)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-surface"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Bajo stock
        </button>
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={cn(
            "flex items-center gap-1 px-3 h-10 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap",
            showInactive ? "border-gray-400 bg-[var(--surface-sunken)] text-[var(--text-secondary)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-surface"
          )}
        >
          {showInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          Inactivos
        </button>
        <button
          onClick={() => setNoImageOnly(!noImageOnly)}
          className={cn(
            "flex items-center gap-1 px-3 h-10 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap",
            noImageOnly ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:border-[var(--rule-base)] dark:bg-primary/15 dark:text-[var(--text-primary)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-surface"
          )}
        >
          <Camera className="h-3.5 w-3.5" /> Sin foto ({noImageCount})
        </button>
        {(lowOnly || showInactive || noImageOnly) && (
          <button
            onClick={() => { setLowOnly(false); setShowInactive(false); setNoImageOnly(false); }}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors whitespace-nowrap"
          >
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
        {/* Mas filtros (vista, import/export) */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1 px-3 h-10 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap",
            showFilters ? "border-primary bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-surface"
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Mas
          <ChevronDown className={cn("h-3 w-3 transition-transform", showFilters && "rotate-180")} />
        </button>
        {/* View mode toggle: tabla / cards (solo desktop) */}
        <div className="hidden sm:inline-flex items-center rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden ml-auto">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            aria-pressed={viewMode === "table"}
            title="Vista tabla"
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-2 text-xs font-bold transition-colors",
              viewMode === "table"
                ? "bg-primary text-white"
                : "bg-[var(--surface-raised)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-surface"
            )}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Tabla
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            aria-pressed={viewMode === "cards"}
            title="Vista cards"
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-2 text-xs font-bold transition-colors border-l border-[var(--rule-base)] dark:border-[var(--rule-base)]",
              viewMode === "cards"
                ? "bg-primary text-white"
                : "bg-[var(--surface-raised)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-surface"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Cards
          </button>
        </div>
        {/* Nuevo + Más acciones */}
        <button
          onClick={() => { setPickerSearch(""); setPickerCat("todos"); setShowPicker(true); }}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo
        </button>
        <ModuleActionMenu
          items={[
            // Acciones del módulo padre (Conteo físico, Generar declaración…)
            ...headerActions,
            {
              label: view === "productos" ? "Vista rápida (kanban)" : "Vista de productos",
              icon: Layers,
              onClick: () => setView(view === "productos" ? "kanban" : "productos"),
              description: "Cambia entre lista y tablero",
              dividerBefore: headerActions.length > 0,
            },
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
            },
          ]}
        />
      </div>

      {/* Category chips — derivadas dinámicamente del inventario real, sin emojis */}
      {dynamicCategories.length > 1 && (
        <div className="-mx-2 px-2 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 min-w-fit">
            {dynamicCategories.map(c => {
              const active = catFilter === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCatFilter(c.id)}
                  aria-pressed={active}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border-2 text-sm font-bold transition-all whitespace-nowrap",
                    active
                      ? "border-primary bg-primary text-white shadow-[var(--shadow-sm)]"
                      : "border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] dark:text-muted hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                  <span>{c.label}</span>
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[length:var(--ts-2xs)] font-bold",
                    active ? "bg-white/20 text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-tertiary)] dark:text-muted"
                  )}>
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* KPIs.
          Eran cinco y dos decían lo mismo: «Productos 57 · 56 activos» al lado
          de «Activos 56 · 1 inactivo». Ahora el estado del catálogo va en una
          sola tarjeta y el resto son las tres cifras que se miran para decidir
          algo: qué reponer, qué se vence, cuánto vale lo que hay.

          Compactas a propósito: esta franja empujaba el primer producto de la
          tabla fuera de la pantalla, y a Inventario se entra a ver productos. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-zinc-400">Productos</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[var(--text-primary)]">{totalProducts}</p>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)] dark:text-zinc-500">
            {activeProducts} activos
            {totalProducts - activeProducts > 0 && ` · ${totalProducts - activeProducts} inactivo${totalProducts - activeProducts === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-zinc-400">Bajo stock</p>
          <p className={cn("mt-1 font-mono text-2xl font-bold", lowStockCount > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]")}>{lowStockCount}</p>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)] dark:text-zinc-500">{lowStockCount > 0 ? "Requieren reposición" : "Stock saludable"}</p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-zinc-400">Próx. a vencer</p>
          <p className={cn("mt-1 font-mono text-2xl font-bold", expiringSoonCount > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]")}>{expiringSoonCount}</p>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)] dark:text-zinc-500">Próximos 30 días</p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-zinc-400">Valor inventario</p>
          <p className="mt-1 font-mono text-2xl font-bold text-primary">{fmt(totalStockValue)}</p>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)] dark:text-zinc-500">Valuado a costo</p>
        </div>
      </div>

      {/* Mejora P-7: Duplicados detectados */}
      {duplicateWarning.length > 0 && (
        <div className="rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 px-4 py-2.5 flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] shrink-0" />
          <span className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
            Posibles duplicados: <span className="font-bold">{duplicateWarning[0].a}</span> y <span className="font-bold">{duplicateWarning[0].b}</span>
            {duplicateWarning.length > 1 && <span className="text-[var(--data-warning-500)]"> (y {duplicateWarning.length - 1} mas)</span>}
          </span>
        </div>
      )}

      {/* Margen por categoría: se mira de vez en cuando y no se puede clickear
          —no filtra nada—, así que ocupaba una fila entera para informar. Va
          plegado: el que lo busca lo abre. */}
      {/* Meta-información en una línea: cuántos se están viendo y el margen
          plegado. Sin nada que decir, la fila no existe —un contenedor vacío
          sigue costando su separación. */}
      {(filteredProducts.length !== products.length || categoryMargins.length > 0) && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {filteredProducts.length !== products.length && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Mostrando {filteredProducts.length} de {products.length} productos
        </p>
      )}
      {categoryMargins.length > 0 && (
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
            Margen por categoría ({categoryMargins.length})
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {categoryMargins.map(cm => (
            <span
              key={cm.cat}
              className={cn(
                "text-xs font-mono font-bold px-2 py-0.5 rounded-full",
                cm.margin > 25 ? "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/30 dark:text-[var(--data-success-500)]"
                : cm.margin >= 15 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]"
                : "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]"
              )}
            >
              {cm.cat}: {Number(cm.margin).toFixed(0)}%
            </span>
          ))}
          </div>
        </details>
      )}
      </div>
      )}

      {/* OC Alerts Section (IMPROVEMENT 1) */}
      {lowStockProducts.length > 0 && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--data-warning-500)]/40 rounded-xl overflow-hidden ">
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                    Alertas de Orden de Compra
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-xs font-bold">
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)] text-white text-xs font-bold transition-colors disabled:opacity-60 "
                >
                  {generatingOC ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
                  Generar OC para todos
                </button>
                <button
                  onClick={() => setExpandedOC(!expandedOC)}
                  className="p-2 rounded-lg hover:bg-[var(--data-warning-100)] dark:hover:bg-[var(--data-warning-500)]/30 transition-colors"
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
                    <div key={p.id} className="bg-[var(--surface-raised)] border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-3 flex flex-wrap items-center gap-3">
                      {p.image ? (
                        <span className="relative inline-block shrink-0">
                          <Image src={p.image} alt={p.name} width={40} height={40} unoptimized={p.image.startsWith("data:")} className="rounded-lg object-cover border border-[var(--rule-soft)] dark:border-[var(--rule-base)]" />
                          <ImageWarningBadge image={p.image} />
                        </span>
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-primary/40" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{p.name}</p>
                        <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                          Stock: {p.stock} / Mín: {minStock} • Sugerido: <span className="font-bold text-[var(--data-warning-500)]">{suggestedQty} {p.unit}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Costo unit.</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(unitCost)}</p>
                      </div>
                      <button
                        onClick={() => generateOC(p)}
                        disabled={generatingOC}
                        className="px-3 py-1.5 rounded-lg bg-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)] text-white text-xs font-bold transition-colors disabled:opacity-60 shrink-0"
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
        <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 border border-[var(--rule-soft)] dark:border-[var(--rule-base)] space-y-3">
          {/* Grupo: Vista */}
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Vista</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { const next = !showExtendedCols; setShowExtendedCols(next); try { localStorage.setItem("inv-extended-cols", String(next)); } catch {} }}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                  showExtendedCols ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:border-[var(--data-success-500)]/30 dark:bg-primary/15 dark:text-[var(--data-success-500)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-white dark:hover:bg-[var(--surface-raised)]"
                )}
              >
                <Layers className="h-3.5 w-3.5" /> {showExtendedCols ? "Menos columnas" : "Mas columnas"}
              </button>
              <button
                onClick={() => setShowExpandedTable(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:border-[var(--data-success-500)]/30 dark:bg-primary/15 dark:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors"
              >
                <Maximize2 className="h-3.5 w-3.5" /> Expandir tabla
              </button>
              {view === "productos" && (
                <button
                  onClick={() => { setBulkField("pricePercent"); setBulkValue(""); setBulkModal(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-primary/30 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors"
                >
                  <TrendingUp className="h-3.5 w-3.5" /> Ajuste %
                </button>
              )}
              <button
                onClick={() => setShowBulkImageAssign(true)}
                title="Asigna imágenes del banco a varios productos a la vez con drag & drop"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all",
                  noImageCount > 0
                    ? "border-primary bg-linear-to-r from-primary to-[var(--data-success-500)] text-white hover:opacity-90 shadow-[var(--shadow-sm)]"
                    : "border-primary/30 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5",
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Añadir IMG Amplio
                {noImageCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/25 text-[length:var(--ts-2xs)] font-extrabold">
                    {noImageCount} sin foto
                  </span>
                )}
              </button>
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
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-white dark:hover:bg-[var(--surface-raised)] transition-colors"
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
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
              <input ref={csvImportRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
              <button
                onClick={() => { setCsvResult(null); csvImportRef.current?.click(); }}
                disabled={csvImporting}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors disabled:opacity-50"
              >
                {csvImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Subir CSV
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Content */}
      {/* CSV import result feedback */}
      {csvResult && (
        <div className={`flex items-start gap-3 px-2 sm:px-4 py-2 sm:py-3 rounded-xl text-sm mb-2 ${csvResult.errors.length > 0 ? "bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" : "bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"}`}>
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
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-xl p-3 mb-2">
          <p className="text-sm font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="h-4 w-4" /> {inconsistentes.length} producto{inconsistentes.length !== 1 ? "s" : ""} se vende{inconsistentes.length !== 1 ? "n" : ""} por debajo del costo:
          </p>
          <ul className="space-y-0.5 mb-2">
            {inconsistentes.slice(0, 5).map(p => (
              <li key={p.id} className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
                {p.name}: costo S/{p.costPrice!.toFixed(2)} &gt; precio S/{Number(p.price).toFixed(2)} (perdida S/{(p.costPrice! - p.price).toFixed(2)}/unid)
              </li>
            ))}
            {inconsistentes.length > 5 && <li className="text-xs text-[var(--data-error-500)]">...y {inconsistentes.length - 5} mas</li>}
          </ul>
          <button onClick={() => { setView("productos"); setSearch(""); }} className="text-xs font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] hover:underline">
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
          {/* Cards view — siempre en mobile, opcional en desktop via viewMode */}
          <div className={cn(
            "grid grid-cols-1 gap-3",
            viewMode === "cards"
              ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "sm:hidden"
          )}>
            {pgProducts.items.map(p => {
              const lowStock = isLowStock(p);
              const cat = categories.find(c => c.id === p.category);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "group relative flex flex-col rounded-2xl border bg-[var(--surface-raised)] p-4 transition-all hover:shadow-[var(--shadow-sm)]",
                    !p.active && "opacity-70 bg-[var(--surface-canvas)]",
                    lowStock ? "border-[var(--data-warning-500)]/60" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
                  )}
                >
                  {/* Estado — pill clickeable arriba a la derecha (uno solo para activo/inactivo) */}
                  <button
                    onClick={() => toggleActive(p)}
                    title={p.active ? "Activo — tocá para desactivar" : "Inactivo — tocá para activar"}
                    className={cn(
                      "absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold transition-colors",
                      p.active
                        ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:brightness-95"
                        : "bg-[var(--surface-sunken)] dark:bg-accent text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)]"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", p.active ? "bg-[var(--data-success-500)]" : "bg-[var(--text-tertiary)]")} />
                    {p.active ? "Activo" : "Inactivo"}
                  </button>

                  {/* Cabecera: imagen + nombre (protagonista) + precio */}
                  <div className="flex items-start gap-3 pr-20">
                    {p.image ? (
                      <span className="relative inline-block shrink-0">
                        <Image src={p.image} alt={p.name} width={56} height={56} unoptimized={p.image.startsWith("data:")} className="h-14 w-14 rounded-xl object-cover border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-surface" />
                        <ImageWarningBadge image={p.image} size="md" />
                      </span>
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                        <Package className="h-6 w-6 text-primary/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-bold text-sm leading-tight text-[var(--text-primary)] dark:text-[var(--text-primary)] line-clamp-2">{p.name}</p>
                        {p.type === "service" && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--accent)]">Servicio</span>
                        )}
                        {topRentables.includes(p.id) && (
                          <StatusBadge variant="success" label="Alta rentabilidad" size="sm" />
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)] dark:text-muted">{cat?.label ?? p.category} · {p.unit}</p>
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-base font-extrabold text-primary">S/{Number(p.price).toFixed(2)}</span>
                        {p.costPrice && <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">costo S/{Number(p.costPrice).toFixed(2)}</span>}
                        {p.badge && <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{p.badge}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Stock — compacto, deja respirar */}
                  <div className="mt-3">
                    {p.stock !== undefined ? (
                      <StockLevelBar
                        variant="compact"
                        stock={p.stock}
                        stockMin={p.stockMin}
                        stockMax={p.stockMax}
                        unit={p.unit}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-semibold text-[var(--text-tertiary)] dark:text-muted" title="Este producto no gestiona inventario">
                        <RefreshCw className="h-3 w-3" /> No controla stock
                      </span>
                    )}
                  </div>

                  {/* Acciones — fila horizontal ordenada (Editar protagonista + secundarias) */}
                  <div className="mt-3 flex items-center gap-1.5 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-3">
                    <button onClick={() => openEditModal(p)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-surface px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary" title="Editar producto">
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </button>
                    <button onClick={() => setKardexProduct({ id: p.id, name: p.name })} title="Ver Kardex (movimientos)" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted transition-colors hover:bg-primary/10 hover:text-[var(--data-success-500)]">
                      <BookOpen className="h-4 w-4" />
                    </button>
                    <button onClick={() => setModifiersProduct({ id: p.id, name: p.name })} title="Modificadores (cremas, adicionales, talla)" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted transition-colors hover:bg-primary/10 hover:text-[var(--accent)]">
                      <Sliders className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteProduct(p.id)} title="Eliminar producto" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-500)]">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {p.barcode && <p className="mt-2 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">#{p.barcode}</p>}
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

          {/* Desktop table — UX Mejora 18: Sticky header. Oculta cuando viewMode==="cards". */}
          <div className={cn(
            "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden",
            viewMode === "cards" ? "hidden" : "hidden sm:block"
          )}>
            <div className="max-h-[65vh] overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="sticky top-0 bg-[var(--surface-raised)] z-10 shadow-[var(--shadow-sm)]">
                  <tr className="border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] text-left">
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
                        className={cn("hover:bg-[var(--surface-alt)] dark:hover:bg-surface transition-colors", !p.active && "opacity-50 bg-[var(--surface-canvas)]/30", lowStock && "bg-[var(--data-warning-50)]/40", selectedIds.has(p.id) && "bg-primary/5")}
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
                            <div className="w-10 h-10 rounded-md bg-[var(--surface-sunken)] dark:bg-surface flex items-center justify-center">
                              <Package className="h-4 w-4 text-[var(--text-tertiary)] dark:text-muted" />
                            </div>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Mejora 5R2: Semaforo de stock */}
                            {(() => {
                              const stockMin = p.stockMin ?? 5;
                              // Brandon 2026-06-01: distinguir "no gestiona stock"
                              // (undefined → restaurante que no controla inventario)
                              // de "agotado" (stock 0). Antes `?? 0` pintaba ambos
                              // como agotado.
                              if (p.stock === undefined || p.stock === null) return <span className="w-2.5 h-2.5 rounded-full bg-[var(--rule-base)] inline-block shrink-0" title="Sin control de stock" />;
                              const stock = p.stock;
                              if (stock === 0) return <span className="w-2.5 h-2.5 rounded-full bg-black inline-block shrink-0" title="Agotado" />;
                              if (stock <= stockMin) return <span className="w-2.5 h-2.5 rounded-full bg-[var(--data-error-500)] inline-block shrink-0" title="Critico" />;
                              if (stock <= stockMin * 2) return <span className="w-2.5 h-2.5 rounded-full bg-[var(--data-warning-500)] inline-block shrink-0" title="Bajo" />;
                              return <span className="w-2.5 h-2.5 rounded-full bg-primary/10 inline-block shrink-0" title="OK" />;
                            })()}
                            <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate-25">{p.name}</span>
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
                          {catLabelOf(p.category)}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-primary">S/{Number(p.price).toFixed(2)}</td>
                        <td className={cn("px-2 sm:px-4 py-2 sm:py-3", !showExtendedCols && "hidden")}>
                          <PriceSparkline productId={p.id} />
                        </td>
                        <td className={cn("px-2 sm:px-4 py-2 sm:py-3", !showExtendedCols && "hidden")}>
                          {p.badge ? <span className="inline-flex px-2 py-0.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-semibold">{p.badge}</span> : <span className="text-[var(--text-tertiary)] dark:text-muted">—</span>}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          {/* Brandon 2026-06-06: barra visual de nivel de stock
                              (estado por color + marcador del mínimo) en vez del
                              número plano. Ver StockLevelBar. */}
                          <StockLevelBar
                            stock={p.stock}
                            stockMin={p.stockMin}
                            stockMax={p.stockMax}
                            unit={p.unit}
                          />
                        </td>
                        {/* Mejora 6R2: Costo promedio ponderado */}
                        <td className={cn("px-2 sm:px-4 py-2 sm:py-3", !showExtendedCols && "hidden")}>
                          {p.costPrice != null && p.costPrice > 0
                            ? <span className="font-mono text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)]" title="Basado en las ultimas compras">S/{Number(p.costPrice).toFixed(2)}</span>
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
                            if (delta > 0) return <span className="text-xs font-bold text-[var(--data-success-500)]"><ArrowUp className="h-3 w-3 inline" /> +{delta}</span>;
                            if (delta < 0) return <span className="text-xs font-bold text-[var(--data-error-500)]"><ArrowDown className="h-3 w-3 inline" /> {delta}</span>;
                            return <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">&#8594; 0</span>;
                          })()}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <button
                            onClick={() => toggleActive(p)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors",
                              p.active ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:bg-primary/10" : "bg-[var(--surface-sunken)] dark:bg-accent text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)]"
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", p.active ? "bg-primary/10" : "bg-gray-400")} />
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
                                  ...EMPTY_ADD,
                                  type: p.type ?? "product",
                                  brand: p.brand ?? "",
                                  taxType: p.taxType ?? "gravado",
                                  weightKg: p.weightKg != null ? String(p.weightKg) : "",
                                  dimensions: p.dimensions ?? "",
                                  durationLabel: p.durationLabel ?? "",
                                  pricingUnit: p.pricingUnit ?? "fijo",
                                  notes: p.notes ?? "",
                                  description: p.description ?? "",
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
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-primary/10 transition-colors"
                              title="Duplicar"
                            >
                              <ClipboardList className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteProduct(p.id)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors" title="Eliminar">
                              <Trash2 className="h-4 w-4" />
                            </button>
                            {/* Adicionales / modificadores (cremas, sabores, extras) */}
                            <button onClick={() => setModifiersProduct({ id: p.id, name: p.name })} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--accent)] hover:bg-primary/10 transition-colors" title="Adicionales y modificadores (cremas, salsas, extras)">
                              <Sliders className="h-4 w-4" />
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
                                  ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10"
                                  : "text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-primary/10"
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
            { key: "agotado", label: "Agotado", color: "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/20", badgeColor: "bg-[var(--data-error-500)]", filter: (p: DbProduct) => (p.stock ?? 0) === 0 },
            { key: "bajo", label: "Pocas Existencias", color: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-amber-950/20", badgeColor: "bg-[var(--data-warning-500)]", filter: (p: DbProduct) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.stockMin ?? 5) },
            { key: "normal", label: "Normal", color: "border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15", badgeColor: "bg-primary/10", filter: (p: DbProduct) => (p.stock ?? 0) > (p.stockMin ?? 5) && (p.stock ?? 0) <= (p.stockMax ?? 999) },
            { key: "exceso", label: "Exceso", color: "border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15", badgeColor: "bg-primary/10", filter: (p: DbProduct) => (p.stock ?? 0) > (p.stockMax ?? 999) },
          ];
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4">
              {columns.map(col => {
                const items = filteredProducts.filter(col.filter);
                return (
                  <div key={col.key} className={cn("rounded-xl border-2 p-3 min-h-50", col.color)}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">{col.label}</h4>
                      <span className={cn("text-white text-xs font-bold px-2 py-0.5 rounded-full", col.badgeColor)}>{items.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {items.length === 0 ? (
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center py-4">Sin productos</p>
                      ) : items.map(p => (
                        <div key={p.id} role="button" tabIndex={0}
                          aria-label={`Editar ${p.name}`}
                          className="bg-[var(--surface-raised)] rounded-lg p-2.5  border border-[var(--rule-soft)] dark:border-border cursor-pointer hover:shadow-[var(--shadow-sm)] transition-shadow"
                          onClick={() => { setEditModalProduct(p); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditModalProduct(p); } }}>
                          <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                            {p.type === "service" && <span className="mr-1 rounded bg-primary/10 px-1 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--accent)]">Serv</span>}
                            {p.name}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-[var(--text-secondary)] dark:text-muted">{catLabelOf(p.category)}</span>
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
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[2px] sm:p-4" onClick={(e) => e.target === e.currentTarget && setShowPicker(false)}>
            <div className="bg-[var(--surface-raised)] w-full sm:max-w-4xl sm:rounded-2xl rounded-t-2xl overflow-hidden max-h-[92dvh] flex flex-col border border-[var(--rule-base)] shadow-[var(--shadow-xl)]">
              <div className="flex items-start gap-3 px-5 sm:px-6 py-5 border-b-2 border-[var(--rule-soft)] sticky top-0 bg-[var(--surface-raised)] z-10">
                <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <PackagePlus className="h-6 w-6" strokeWidth={2.1} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Inventario</p>
                  <h2 className="text-xl font-extrabold text-[var(--text-primary)] leading-tight">Agregar al catálogo</h2>
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)] leading-snug">Tocá un producto para editarlo, o creá uno nuevo.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { setShowPicker(false); setShowAdd(true); }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-bold text-white hover:bg-[var(--accent)]/90 transition-colors"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.4} /> <span className="hidden sm:inline">Crear nuevo</span><span className="sm:hidden">Nuevo</span>
                  </button>
                  <button onClick={() => setShowPicker(false)} aria-label="Cerrar" className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors">
                    <X className="h-5 w-5" />
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
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
                <select
                  value={pickerCat}
                  onChange={e => setPickerCat(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm outline-none"
                >
                  <option value="todos">Todos</option>
                  {formCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {pickerProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-10">
                    <span aria-hidden className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] mb-3">
                      <PackagePlus className="h-7 w-7" strokeWidth={1.9} />
                    </span>
                    <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                      {products.length === 0 ? "Tu catálogo está vacío" : "Sin resultados"}
                    </h3>
                    <p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">
                      {products.length === 0
                        ? "Todavía no cargaste productos. Creá el primero para empezar a vender."
                        : "No se encontraron productos con esos filtros."}
                    </p>
                    <button
                      onClick={() => { setShowPicker(false); setShowAdd(true); }}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white hover:bg-[var(--accent)]/90 transition-colors"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.4} /> Crear producto
                    </button>
                  </div>
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
                        className="flex flex-col items-center gap-2 p-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary hover:shadow-[var(--shadow-sm)] transition-all text-center group"
                      >
                        <div className="w-16 h-16 rounded-lg bg-[var(--surface-sunken)] dark:bg-accent overflow-hidden flex-shrink-0">
                          {p.image ? (
                            <Image src={p.image} alt={p.name} width={64} height={64} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-6 w-6 text-[var(--text-tertiary)] dark:text-muted" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] line-clamp-2 group-hover:text-primary transition-colors">{p.name}</span>
                        <span className="text-sm text-[var(--text-secondary)] dark:text-muted">{fmt(p.price)}</span>
                        {p.stock != null && (
                          <span className={cn(
                            "text-xs font-bold px-2 py-0.5 rounded-full",
                            (p.stock ?? 0) === 0 ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]" : (p.stock ?? 0) <= (p.stockMin ?? 5) ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[2px] sm:p-4" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="bg-[var(--surface-raised)] w-full sm:max-w-5xl sm:rounded-2xl rounded-t-2xl overflow-y-auto max-h-[92dvh] border border-[var(--rule-base)] shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 backdrop-blur">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[var(--text-primary)] leading-tight">Nuevo producto</h2>
                <p className="text-xs text-[var(--text-tertiary)]">Producto físico o servicio del catálogo</p>
              </div>
              <button onClick={() => setShowAdd(false)} aria-label="Cerrar" className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={addProduct} className="p-6 space-y-6">
              {/* Vista previa compacta — solo mobile (en desktop va la tarjeta sticky de la derecha) */}
              <div className="lg:hidden flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
                {addForm.image ? (
                  <Image src={addForm.image} alt="" width={48} height={48} unoptimized={addForm.image.startsWith("data:")} className="h-12 w-12 rounded-lg object-cover border border-[var(--rule-soft)] bg-[var(--surface-alt)]" />
                ) : (
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><PackagePlus className="h-6 w-6" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{addForm.name.trim() || "Nuevo producto"}</p>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">{formCategories.find(c => c.id === addForm.category)?.label ?? "Sin categoría"} · {addForm.type === "service" ? "Servicio" : "Producto"}</p>
                </div>
                <span className="shrink-0 font-mono text-base font-extrabold text-primary">{addForm.price ? fmt(Number(addForm.price)) : "S/—"}</span>
              </div>

              {/* Layout 2 columnas: formulario (izq) + vista previa sticky (der, desktop) */}
              <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:items-start">
                <div className="space-y-6 min-w-0">
              {/* Tipo: producto físico vs servicio */}
              <div className="flex gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1">
                {([
                  ["product", "Producto", "Con stock, código de barras y vencimiento"],
                  ["service", "Servicio", "Sin stock — duración, notas y precio por unidad/hora"],
                ] as const).map(([val, label, hint]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAddForm(f => ({ ...f, type: val }))}
                    title={hint}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
                      addForm.type === val
                        ? "bg-[var(--accent)] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* National product DB search — solo productos físicos */}
              {addForm.type !== "service" && (
              <div className="bg-primary/10 border border-[var(--data-success-500)]/30 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-[var(--data-success-500)] flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5" /> Buscar en base nacional de productos
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={dbQuery}
                    onChange={(e) => setDbQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleDbSearch())}
                    placeholder="Ej: arroz costeño, aceite vegetal…"
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--data-success-500)]/30 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--data-success-500)]/30 outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleDbSearch}
                    disabled={dbSearching || !dbQuery.trim()}
                    className="px-3 py-2 rounded-lg bg-primary/10 text-white hover:bg-primary/10 transition-colors disabled:opacity-50 flex items-center gap-1 text-sm font-bold"
                  >
                    {dbSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                </div>
                {dbResults.length > 0 && (
                  <div className="space-y-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--surface-raised)]">
                    {dbResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applyDbResult(r)}
                        className="w-full text-left px-3 py-2.5 hover:bg-primary/10 flex flex-wrap items-center gap-3 transition-colors border-b border-gray-50 last:border-0"
                      >
                        {r.image && (
                          <Image src={r.image} alt={r.name} width={40} height={40} className="rounded-lg object-cover border border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0 bg-[var(--surface-alt)] dark:bg-surface" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{r.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{r.brand}{r.quantity ? ` · ${r.quantity}` : ""}{r.barcode ? ` · ${r.barcode}` : ""}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <Field label="Nombre *" labelClassName={FIELD_LABEL}>
                  <input required value={addForm.name} onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Arroz costeño 1kg" className={FIELD_INPUT} />
                </Field>
                <Field label="Categoría *" labelClassName={FIELD_LABEL}>
                  {(id) => (<>
                    <select id={id} value={addForm.category} onChange={(e) => setAddForm(f => ({ ...f, category: e.target.value }))} className={FIELD_INPUT}>
                      {formCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      {/* Categoría aplicada desde la sugerencia que aún no está
                          en la lista del comercio → mostrarla igual para no perderla. */}
                      {addForm.category && !formCategories.some(c => c.id === addForm.category) && (
                        <option value={addForm.category}>{catLabelOf(addForm.category)}</option>
                      )}
                    </select>
                    {/* Sugerencia automática: si el nombre del producto contiene
                        una palabra clave que mapea a otra categoría distinta a
                        la elegida, mostramos un chip con botón "Aplicar". */}
                    <CategorySuggestionInline
                      name={addForm.name}
                      currentCategory={addForm.category}
                      onApply={(id) => setAddForm(f => ({ ...f, category: id }))}
                    />
                  </>)}
                </Field>
                <Field label="Precio de venta (S/) *" labelClassName={FIELD_LABEL}>
                  <input required type="number" step="0.01" min="0" value={addForm.price} onChange={(e) => setAddForm(f => ({ ...f, price: e.target.value }))} placeholder="5.50" className={FIELD_INPUT} />
                </Field>
                <Field label="Precio de costo (S/)" labelClassName={FIELD_LABEL}>
                  <input type="number" step="0.01" min="0" value={addForm.costPrice} onChange={(e) => setAddForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="3.50" className={FIELD_INPUT} />
                </Field>
                <Field label="Unidad" labelClassName={FIELD_LABEL}>
                  <input value={addForm.unit} onChange={(e) => setAddForm(f => ({ ...f, unit: e.target.value }))} placeholder="kg, und, bolsa…" className={FIELD_INPUT} />
                </Field>
                <Field label="Badge" labelClassName={FIELD_LABEL}>
                  <select value={addForm.badge} onChange={(e) => setAddForm(f => ({ ...f, badge: e.target.value }))} className={FIELD_INPUT}>
                    <option value="">Sin badge</option>
                    {["Oferta", "Popular", "Fresco", "Premium"].map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                {/* Stock / vencimiento / código de barras — solo productos físicos */}
                {addForm.type !== "service" && (<>
                <div className="sm:col-span-2 mt-1 flex items-center gap-2">
                  <span className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Inventario y control</span>
                  <span aria-hidden className="h-px flex-1 bg-[var(--rule-soft)]" />
                </div>
                {/* Toggle: controlar stock vs ilimitado (Brandon 2026-06-06) —
                    para comidas que se preparan al pedido (no se sabe cuándo
                    "sale") o productos de stock infinito. */}
                <div className="sm:col-span-2">
                  <StockTrackToggle
                    value={addForm.trackStock}
                    onChange={(v) => setAddForm(f => ({ ...f, trackStock: v }))}
                  />
                </div>
                {addForm.trackStock && (<>
                <Field label="Stock actual" labelClassName={FIELD_LABEL}>
                  <input type="number" min="0" value={addForm.stock} onChange={(e) => setAddForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" className={FIELD_INPUT} />
                </Field>
                <Field label={<span title="Cantidad mínima antes de generar alerta de stock bajo">Stock mínimo</span>} labelClassName={FIELD_LABEL}>
                  <input type="number" min="0" value={addForm.stockMin} onChange={(e) => setAddForm(f => ({ ...f, stockMin: e.target.value }))} placeholder="5" className={FIELD_INPUT} />
                </Field>
                <Field label="Stock máximo" labelClassName={FIELD_LABEL}>
                  <input type="number" min="0" value={addForm.stockMax} onChange={(e) => setAddForm(f => ({ ...f, stockMax: e.target.value }))} placeholder="100" className={FIELD_INPUT} />
                </Field>
                {/* Preview en vivo del nivel de stock (Brandon 2026-06-06) */}
                {addForm.stock !== "" && (
                  <div className="sm:col-span-2">
                    <StockLevelBar
                      variant="full"
                      stock={Number(addForm.stock) || 0}
                      stockMin={addForm.stockMin !== "" ? Number(addForm.stockMin) : undefined}
                      stockMax={addForm.stockMax !== "" ? Number(addForm.stockMax) : undefined}
                      unit={addForm.unit}
                    />
                  </div>
                )}
                </>)}
                <Field label="Fecha de vencimiento" labelClassName={FIELD_LABEL}>
                  <input type="date" value={addForm.expiryDate} onChange={(e) => setAddForm(f => ({ ...f, expiryDate: e.target.value }))} className={FIELD_INPUT} />
                </Field>
                <Field label="Código de barras" labelClassName={FIELD_LABEL}>
                  {(id) => (
                    <div className="flex flex-wrap gap-2">
                      <input id={id} value={addForm.barcode} onChange={(e) => setAddForm(f => ({ ...f, barcode: e.target.value }))} placeholder="7750000000000" className={cn(FIELD_INPUT, "flex-1 font-mono")} />
                      <button type="button" onClick={() => setShowScanner(true)} className="px-3 py-2 rounded-lg border border-primary/30 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors">
                        <ScanBarcode className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </Field>
                {/* Producto completo */}
                <div className="sm:col-span-2 mt-1 flex items-center gap-2">
                  <span className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Detalles del producto</span>
                  <span aria-hidden className="h-px flex-1 bg-[var(--rule-soft)]" />
                </div>
                <Field label="Marca / fabricante" labelClassName={FIELD_LABEL}>
                  <input value={addForm.brand} onChange={(e) => setAddForm(f => ({ ...f, brand: e.target.value }))} placeholder="Ej: Costeño, Gloria" className={FIELD_INPUT} />
                </Field>
                <Field label={<span title="Código interno del negocio, distinto del código de barras">SKU / código interno</span>} labelClassName={FIELD_LABEL}>
                  <input value={addForm.sku} onChange={(e) => setAddForm(f => ({ ...f, sku: e.target.value }))} placeholder="Ej: ABR-001" className={cn(FIELD_INPUT, "font-mono")} />
                </Field>
                <Field label="Peso (kg)" labelClassName={FIELD_LABEL}>
                  <input type="number" step="0.001" min="0" value={addForm.weightKg} onChange={(e) => setAddForm(f => ({ ...f, weightKg: e.target.value }))} placeholder="0.5" className={FIELD_INPUT} />
                </Field>
                <Field label="Medidas" labelClassName={FIELD_LABEL}>
                  <input value={addForm.dimensions} onChange={(e) => setAddForm(f => ({ ...f, dimensions: e.target.value }))} placeholder="30x20x10 cm o 2 m³" className={FIELD_INPUT} />
                </Field>
                </>)}

                {/* Servicio — campos propios */}
                {addForm.type === "service" && (<>
                <div className="sm:col-span-2 mt-1 flex items-center gap-2">
                  <span className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Detalles del servicio</span>
                  <span aria-hidden className="h-px flex-1 bg-[var(--rule-soft)]" />
                </div>
                <Field label="Duración estimada" labelClassName={FIELD_LABEL}>
                  <input value={addForm.durationLabel} onChange={(e) => setAddForm(f => ({ ...f, durationLabel: e.target.value }))} placeholder="Ej: 2 horas, 1 día, 3 días" className={FIELD_INPUT} />
                </Field>
                <Field label="Cobro por" labelClassName={FIELD_LABEL}>
                  <select value={addForm.pricingUnit} onChange={(e) => setAddForm(f => ({ ...f, pricingUnit: e.target.value }))} className={FIELD_INPUT}>
                    <option value="fijo">Precio fijo</option>
                    <option value="hora">Por hora</option>
                    <option value="m3">Por m³</option>
                    <option value="unidad">Por unidad</option>
                    <option value="dia">Por día</option>
                  </select>
                </Field>
                </>)}

                {/* Afecto a IGV — productos y servicios */}
                <Field label={<span title="Determina el IGV en la boleta/factura">Afecto a IGV</span>} labelClassName={FIELD_LABEL}>
                  <select value={addForm.taxType} onChange={(e) => setAddForm(f => ({ ...f, taxType: e.target.value }))} className={FIELD_INPUT}>
                    <option value="gravado">Gravado (IGV 18%)</option>
                    <option value="exonerado">Exonerado</option>
                    <option value="inafecto">Inafecto</option>
                  </select>
                </Field>

                {/* Descripción — ambos */}
                <Field label="Descripción" labelClassName={FIELD_LABEL} className="sm:col-span-2">
                  <textarea value={addForm.description} onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder={addForm.type === "service" ? "Qué incluye el servicio…" : "Detalle del producto…"} className={cn(FIELD_INPUT, "resize-none")} />
                </Field>

                {/* Notas / requisitos — solo servicios */}
                {addForm.type === "service" && (
                <Field label="Notas / requisitos para el cliente" labelClassName={FIELD_LABEL} className="sm:col-span-2">
                  <textarea value={addForm.notes} onChange={(e) => setAddForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Ej: el cliente debe traer la madera; trabajamos de lunes a sábado…" className={cn(FIELD_INPUT, "resize-none")} />
                </Field>
                )}
              </div>

              {/* Fase 2: Presentaciones / variantes (ProductVariant[]) — solo productos físicos */}
              {addForm.type !== "service" && (
              <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-[var(--text-secondary)]" />
                    <p className="text-sm font-bold text-[var(--text-primary)]">Presentaciones / variantes</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddVariants(v => [...v, { name: "", price: "", stock: "" }])}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar
                  </button>
                </div>
                {addVariants.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)]">Ej: 1/2 Litro, 1 Litro, Pack x6 — cada presentación con su precio y stock propios.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_96px_80px_36px] gap-2 px-1 text-[length:var(--ts-2xs,0.6875rem)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                      <span>Nombre</span><span>Precio (S/)</span><span>Stock</span><span aria-hidden />
                    </div>
                    {addVariants.map((v, i) => (
                      <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_80px_36px] gap-2 items-center">
                        <input
                          value={v.name}
                          onChange={(e) => setAddVariants(arr => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                          placeholder="Ej: 1 Litro"
                          className={FIELD_INPUT}
                        />
                        <input
                          type="number" step="0.01" min="0"
                          value={v.price}
                          onChange={(e) => setAddVariants(arr => arr.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                          placeholder={addForm.price || "0.00"}
                          className={FIELD_INPUT}
                        />
                        <input
                          type="number" min="0"
                          value={v.stock}
                          onChange={(e) => setAddVariants(arr => arr.map((x, j) => j === i ? { ...x, stock: e.target.value } : x))}
                          placeholder="—"
                          className={FIELD_INPUT}
                        />
                        <button
                          type="button"
                          onClick={() => setAddVariants(arr => arr.filter((_, j) => j !== i))}
                          title="Quitar presentación"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-[var(--text-tertiary)]">Precio vacío = usa el precio base. El stock por presentación es opcional.</p>
                  </div>
                )}
              </div>
              )}

              {/* Fase 2: Modificadores / opciones (ProductModifierGroup[]) */}
              <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-[var(--text-secondary)]" />
                    <p className="text-sm font-bold text-[var(--text-primary)]">Modificadores / opciones</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddModifierGroups(g => [...g, { name: "", required: false, multi: true, options: [{ name: "", priceDelta: "" }] }])}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar grupo
                  </button>
                </div>
                {addModifierGroups.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)]">Ej: &ldquo;Cremas&rdquo; → Ají, Mayonesa (+S/0.50) · &ldquo;Término&rdquo; → Jugoso, Bien cocido. El cliente las elige al pedir.</p>
                ) : (
                  <div className="space-y-3">
                    {addModifierGroups.map((g, gi) => (
                      <div key={gi} className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={g.name}
                            onChange={(e) => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, name: e.target.value } : x))}
                            placeholder="Nombre del grupo (ej: Cremas)"
                            className={cn(FIELD_INPUT, "flex-1")}
                          />
                          <button type="button" onClick={() => setAddModifierGroups(arr => arr.filter((_, j) => j !== gi))} title="Quitar grupo" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs">
                          <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)]">
                            <input type="checkbox" checked={g.required} onChange={(e) => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, required: e.target.checked } : x))} className="accent-[var(--accent)]" /> Obligatorio
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)]">
                            <input type="checkbox" checked={g.multi} onChange={(e) => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, multi: e.target.checked } : x))} className="accent-[var(--accent)]" /> Permite varias
                          </label>
                        </div>
                        <div className="space-y-1.5 pl-1">
                          {g.options.map((o, oi) => (
                            <div key={oi} className="grid grid-cols-[minmax(0,1fr)_88px_32px] gap-2 items-center">
                              <input
                                value={o.name}
                                onChange={(e) => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, options: x.options.map((y, k) => k === oi ? { ...y, name: e.target.value } : y) } : x))}
                                placeholder="Opción (ej: Ají)"
                                className={FIELD_INPUT}
                              />
                              <input
                                type="number" step="0.01" min="0"
                                value={o.priceDelta}
                                onChange={(e) => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, options: x.options.map((y, k) => k === oi ? { ...y, priceDelta: e.target.value } : y) } : x))}
                                placeholder="+0.00"
                                className={FIELD_INPUT}
                              />
                              <button type="button" onClick={() => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, options: x.options.filter((_, k) => k !== oi) } : x))} title="Quitar opción" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          ))}
                          <button type="button" onClick={() => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, options: [...x.options, { name: "", priceDelta: "" }] } : x))} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3 w-3" /> Agregar opción</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fase 2: SEO / posicionamiento (opcional) */}
              <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-[var(--text-secondary)]" />
                  <p className="text-sm font-bold text-[var(--text-primary)]">SEO / posicionamiento <span className="font-normal text-[var(--text-tertiary)]">(opcional)</span></p>
                </div>
                <Field label={<>Título SEO <span className="font-normal text-[var(--text-tertiary)]">({addSeo.metaTitle.length}/70)</span></>} labelClassName={FIELD_LABEL}>
                  <input value={addSeo.metaTitle} onChange={(e) => setAddSeo(s => ({ ...s, metaTitle: e.target.value }))} maxLength={70} placeholder="Ej: Arroz Costeño 5kg — barato en Ciudad Constitución" className={FIELD_INPUT} />
                </Field>
                <Field label={<>Descripción SEO <span className="font-normal text-[var(--text-tertiary)]">({addSeo.metaDescription.length}/160)</span></>} labelClassName={FIELD_LABEL}>
                  <textarea value={addSeo.metaDescription} onChange={(e) => setAddSeo(s => ({ ...s, metaDescription: e.target.value }))} maxLength={160} rows={2} placeholder="Aparece en Google bajo el título. Resumí el producto en 1-2 líneas." className={cn(FIELD_INPUT, "resize-none")} />
                </Field>
                <Field label={<>Imagen para compartir (URL) <span className="font-normal text-[var(--text-tertiary)]">(opcional)</span></>} labelClassName={FIELD_LABEL}>
                  <input value={addSeo.ogImage} onChange={(e) => setAddSeo(s => ({ ...s, ogImage: e.target.value }))} placeholder="https://… (si vacío, usa la imagen del producto)" className={FIELD_INPUT} />
                </Field>
                <p className="text-xs text-[var(--text-tertiary)]">Mejora cómo se ve el producto en Google y al compartir el enlace.</p>
              </div>

              {/* Contenido rico (estilo Amazon) — ficha técnica editable + bloques A+ */}
              <ProductSpecsEditor value={addSpecs} onChange={setAddSpecs} />
              <ProductRichContentEditor value={addRich} onChange={setAddRich} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <Field label="Imagen del producto" labelClassName={FIELD_LABEL} className="sm:col-span-2 space-y-3">
                  {(imgFieldId) => (<>
                  <ImageUploadHints />
                  {(() => {
                    const validation = validateImageUrl(addForm.image);
                    if (!validation.valid && addForm.image) {
                      return (
                        <p className="text-sm text-[var(--data-warning-500)] flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3" strokeWidth={2} aria-hidden />
                          {validation.reason}
                        </p>
                      );
                    }
                    return null;
                  })()}
                  <div className="flex flex-wrap gap-3 items-start">
                    {addForm.image && (
                      <div className="relative h-16 w-16 rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-[var(--rule-base)] shrink-0 bg-[var(--surface-alt)] dark:bg-surface">
                        <Image src={addForm.image} alt="preview" fill unoptimized={addForm.image.startsWith("data:")} className="object-cover" sizes="64px" />
                        <ImageWarningBadge image={addForm.image} size="md" />
                      </div>
                    )}
                    <div className="flex-1 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => addImgRef.current?.click()}
                        disabled={imgUploading}
                        className="w-full flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-primary/40 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        <Camera className="h-4 w-4" />
                        {imgUploading ? "Procesando…" : "Subir foto"}
                      </button>
                      <input
                        id={imgFieldId}
                        value={addForm.image}
                        onChange={(e) => setAddForm(f => ({ ...f, image: e.target.value }))}
                        placeholder="o pegar URL de imagen (PNG con fondo transparente)"
                        className={FIELD_INPUT}
                      />
                      <input
                        ref={addImgRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setImgUploading(true);
                          setImgError(null);
                          try {
                            // Subir a /api/upload (Supabase Storage + Sharp).
                            // Antes guardaba dataUrl base64 inline — bug de lentitud.
                            const url = await uploadImageFile(file);
                            if (url) {
                              setAddForm(f => ({ ...f, image: url }));
                              setImgInfo({ originalKB: Math.round(file.size / 1024), finalKB: Math.round(file.size / 1024), width: 0, height: 0, quality: 82 });
                            } else {
                              setImgError("No se pudo subir la imagen. Reintenta.");
                            }
                          } catch (err) {
                            setImgError(err instanceof Error ? err.message : "Error al procesar imagen");
                          } finally {
                            setImgUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                      {imgInfo && (
                        <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] flex items-center gap-1.5 leading-snug">
                          <CheckCircle className="h-3 w-3 shrink-0" />
                          Imagen optimizada: {imgInfo.originalKB} KB → <strong>{imgInfo.finalKB} KB</strong> · {imgInfo.width}×{imgInfo.height}px · WebP {imgInfo.quality}%
                        </p>
                      )}
                      {imgError && (
                        <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] flex items-center gap-1.5 leading-snug">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {imgError}
                        </p>
                      )}
                    </div>
                  </div>
                  </>)}
                </Field>
              </div>

              {/* Fase 2: Galería de fotos adicionales (ProductImage[]) */}
              <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-[var(--text-secondary)]" />
                    <p className="text-sm font-bold text-[var(--text-primary)]">Galería <span className="font-normal text-[var(--text-tertiary)]">(fotos adicionales)</span></p>
                  </div>
                  <button
                    type="button"
                    onClick={() => galleryRef.current?.click()}
                    disabled={galleryUploading}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {galleryUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Agregar foto
                  </button>
                </div>
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = "";
                    if (!files.length) return;
                    setGalleryUploading(true);
                    try {
                      const urls = await Promise.all(files.map(f => uploadImageFile(f)));
                      setAddGallery(g => [...g, ...urls.filter((u): u is string => !!u)]);
                    } catch (err) {
                      console.error("[InventoryTab] galería upload falló", err);
                    } finally {
                      setGalleryUploading(false);
                    }
                  }}
                />
                {addGallery.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)]">Subí más ángulos del producto. La principal es la de arriba; estas son extra.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {addGallery.map((url, i) => (
                      <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden border border-[var(--rule-base)] bg-[var(--surface-alt)]">
                        <Image src={url} alt={`Foto ${i + 1}`} fill unoptimized={url.startsWith("data:")} className="object-cover" sizes="64px" />
                        <button
                          type="button"
                          onClick={() => setAddGallery(g => g.filter((_, j) => j !== i))}
                          title="Quitar foto"
                          className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-[var(--data-error-500)] transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
                </div>

                {/* Columna derecha — vista previa en vivo (desktop, sticky) */}
                <aside className="hidden lg:block">
                  <div className="sticky top-4">
                    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
                      <p className="px-4 pt-3 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Vista previa</p>
                      <div className="mx-4 mt-2 aspect-square rounded-xl overflow-hidden bg-[var(--surface-sunken)] flex items-center justify-center relative">
                        {addForm.image ? (
                          <Image src={addForm.image} alt={addForm.name || "Producto"} fill unoptimized={addForm.image.startsWith("data:")} className="object-cover" sizes="300px" />
                        ) : (
                          <PackagePlus className="h-14 w-14 text-[var(--text-tertiary)]" strokeWidth={1.25} />
                        )}
                        {addForm.badge && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent)] text-white">{addForm.badge}</span>
                        )}
                      </div>
                      <div className="p-4 space-y-2">
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {formCategories.find(c => c.id === addForm.category)?.label ?? "Sin categoría"}{addForm.brand ? ` · ${addForm.brand}` : ""}
                        </p>
                        <p className="text-sm font-extrabold text-[var(--text-primary)] line-clamp-2 min-h-[2.5em]">{addForm.name.trim() || "Nombre del producto"}</p>
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xl font-extrabold text-primary">{addForm.price ? fmt(Number(addForm.price)) : "S/—"}</span>
                          {addForm.unit && <span className="text-xs text-[var(--text-tertiary)]">/ {addForm.unit}</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(() => {
                            const price = Number(addForm.price) || 0;
                            const cost = Number(addForm.costPrice) || 0;
                            if (cost > 0 && price > 0) {
                              return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">Margen {((1 - cost / price) * 100).toFixed(0)}%</span>;
                            }
                            return null;
                          })()}
                          {addForm.type !== "service" && addForm.trackStock && addForm.stock !== "" && (() => {
                            const s = Number(addForm.stock) || 0;
                            const min = addForm.stockMin !== "" ? Number(addForm.stockMin) : 0;
                            const cls = s <= 0 ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]" : s <= min ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
                            const txt = s <= 0 ? "Sin stock" : s <= min ? `Stock bajo · ${s}` : `En stock · ${s}`;
                            return <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", cls)}>{txt}</span>;
                          })()}
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                            {addForm.taxType === "exonerado" ? "Exonerado" : addForm.taxType === "inafecto" ? "Inafecto" : "IGV 18%"}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                            {addForm.type === "service" ? "Servicio" : "Producto"}
                          </span>
                        </div>
                        {addForm.type !== "service" && (addForm.weightKg || addForm.dimensions) && (
                          <p className="text-xs text-[var(--text-tertiary)]">
                            {addForm.weightKg ? `${addForm.weightKg} kg` : ""}{addForm.weightKg && addForm.dimensions ? " · " : ""}{addForm.dimensions || ""}
                          </p>
                        )}
                        {addVariants.filter(v => v.name.trim()).length > 0 && (
                          <p className="text-xs font-semibold text-[var(--accent)]">{addVariants.filter(v => v.name.trim()).length} presentación(es)</p>
                        )}
                        <p className="pt-1 text-[length:var(--ts-2xs,0.6875rem)] text-[var(--text-tertiary)] leading-snug">Así se verá en tu tienda mientras lo creás.</p>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>

              <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center gap-3 border-t-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-6 py-4">
                <button type="button" onClick={() => setShowAdd(false)} className="h-11 px-5 rounded-xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">Cancelar</button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-extrabold text-white shadow-[var(--shadow-lg)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-xl)] active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
                  style={{ backgroundImage: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)" }}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
                  {saving ? "Guardando…" : (addForm.type === "service" ? "Agregar servicio" : "Agregar producto")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit product modal ── */}
      {editModalProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[2px] sm:p-4" onClick={(e) => e.target === e.currentTarget && closeEditModal()}>
          <div className="bg-[var(--surface-raised)] w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl overflow-y-auto max-h-[92dvh] border border-[var(--rule-base)] shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 backdrop-blur">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--text-tertiary)]">Editar {(editForm.type ?? "product") === "service" ? "servicio" : "producto"}</p>
                <h2 className="text-lg font-bold text-[var(--text-primary)] leading-tight truncate">{editModalProduct.name}</h2>
              </div>
              <button onClick={closeEditModal} aria-label="Cerrar" className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Vista previa en vivo */}
              <div className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
                {editForm.image ? (
                  <Image src={editForm.image} alt="" width={48} height={48} unoptimized={editForm.image.startsWith("data:")} className="h-12 w-12 rounded-lg object-cover border border-[var(--rule-soft)] bg-[var(--surface-alt)]" />
                ) : (
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Package className="h-6 w-6" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{editForm.name?.trim() || "Producto"}</p>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">{formCategories.find(c => c.id === editForm.category)?.label ?? "Sin categoría"} · {(editForm.type ?? "product") === "service" ? "Servicio" : "Producto"}</p>
                </div>
                <span className="shrink-0 font-mono text-base font-extrabold text-primary">{editForm.price ? fmt(Number(editForm.price)) : "S/—"}</span>
              </div>
              {/* Tipo: producto físico vs servicio */}
              <div className="flex gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1">
                {([
                  ["product", "Producto"],
                  ["service", "Servicio"],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, type: val }))}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
                      (editForm.type ?? "product") === val
                        ? "bg-[var(--accent)] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <Field label="Nombre *" labelClassName={FIELD_LABEL}>
                  <input required value={editForm.name ?? ""} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className={FIELD_INPUT} />
                </Field>
                <Field label="Categoría" labelClassName={FIELD_LABEL}>
                  {(id) => (<>
                    <select id={id} value={editForm.category ?? ""} onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))} className={FIELD_INPUT}>
                      {formCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      {editForm.category && !formCategories.some(c => c.id === editForm.category) && (
                        <option value={editForm.category}>{catLabelOf(editForm.category)}</option>
                      )}
                    </select>
                    {/* Sugerencia heurística para edición — mismo flujo que en
                        el form de creación. */}
                    <CategorySuggestionInline
                      name={editForm.name ?? ""}
                      currentCategory={editForm.category ?? ""}
                      onApply={(id) => setEditForm(f => ({ ...f, category: id }))}
                    />
                  </>)}
                </Field>
                <Field label="Precio de venta (S/)" labelClassName={FIELD_LABEL}>
                  <input type="number" step="0.01" min="0" value={editForm.price ?? ""} onChange={(e) => setEditForm(f => ({ ...f, price: Number(e.target.value) }))} className={FIELD_INPUT} />
                </Field>
                <Field label="Precio de costo (S/)" labelClassName={FIELD_LABEL}>
                  <input type="number" step="0.01" min="0" value={editForm.costPrice ?? ""} onChange={(e) => setEditForm(f => ({ ...f, costPrice: Number(e.target.value) || undefined }))} className={FIELD_INPUT} />
                </Field>
                <Field label="Unidad" labelClassName={FIELD_LABEL}>
                  <input value={editForm.unit ?? ""} onChange={(e) => setEditForm(f => ({ ...f, unit: e.target.value }))} className={FIELD_INPUT} />
                </Field>
                <Field label="Badge" labelClassName={FIELD_LABEL}>
                  <select value={editForm.badge ?? ""} onChange={(e) => setEditForm(f => ({ ...f, badge: e.target.value || undefined }))} className={FIELD_INPUT}>
                    <option value="">Sin badge</option>
                    {["Oferta", "Popular", "Fresco", "Premium"].map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                {editForm.type !== "service" && (<>
                {/* Toggle controlar stock vs ilimitado (Brandon 2026-06-06) */}
                <div className="sm:col-span-2">
                  <StockTrackToggle
                    value={(editForm as { trackStock?: boolean }).trackStock !== false}
                    onChange={(v) => setEditForm(f => ({ ...f, trackStock: v }))}
                  />
                </div>
                {(editForm as { trackStock?: boolean }).trackStock !== false && (<>
                <Field label="Stock actual" labelClassName={FIELD_LABEL}>
                  <input type="number" min="0" value={editForm.stock ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stock: e.target.value !== "" ? Number(e.target.value) : undefined }))} className={FIELD_INPUT} />
                </Field>
                <Field label={<span title="Cantidad mínima antes de generar alerta de stock bajo">Stock mínimo</span>} labelClassName={FIELD_LABEL}>
                  <input type="number" min="0" value={editForm.stockMin ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stockMin: e.target.value !== "" ? Number(e.target.value) : undefined }))} className={FIELD_INPUT} />
                </Field>
                <Field label="Stock máximo" labelClassName={FIELD_LABEL}>
                  <input type="number" min="0" value={editForm.stockMax ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stockMax: e.target.value !== "" ? Number(e.target.value) : undefined }))} className={FIELD_INPUT} />
                </Field>
                {/* Preview en vivo del nivel de stock (Brandon 2026-06-06) */}
                {editForm.stock !== undefined && editForm.stock !== null && (
                  <div className="sm:col-span-2">
                    <StockLevelBar
                      variant="full"
                      stock={editForm.stock}
                      stockMin={editForm.stockMin}
                      stockMax={editForm.stockMax}
                      unit={editForm.unit}
                    />
                  </div>
                )}
                </>)}
                <Field label="Fecha de vencimiento" labelClassName={FIELD_LABEL}>
                  <input type="date" value={editForm.expiryDate ?? ""} onChange={(e) => setEditForm(f => ({ ...f, expiryDate: e.target.value || undefined }))} className={FIELD_INPUT} />
                </Field>
                <Field label="Código de barras" labelClassName={FIELD_LABEL}>
                  <input value={editForm.barcode ?? ""} onChange={(e) => setEditForm(f => ({ ...f, barcode: e.target.value || undefined }))} className={cn(FIELD_INPUT, "font-mono")} />
                </Field>
                <Field label="Marca / fabricante" labelClassName={FIELD_LABEL}>
                  <input value={editForm.brand ?? ""} onChange={(e) => setEditForm(f => ({ ...f, brand: e.target.value }))} placeholder="Ej: Costeño, Gloria" className={FIELD_INPUT} />
                </Field>
                <Field label="SKU / código interno" labelClassName={FIELD_LABEL}>
                  <input value={editForm.sku ?? ""} onChange={(e) => setEditForm(f => ({ ...f, sku: e.target.value }))} placeholder="Ej: ABR-001" className={cn(FIELD_INPUT, "font-mono")} />
                </Field>
                <Field label="Peso (kg)" labelClassName={FIELD_LABEL}>
                  <input type="number" step="0.001" min="0" value={editForm.weightKg ?? ""} onChange={(e) => setEditForm(f => ({ ...f, weightKg: e.target.value !== "" ? Number(e.target.value) : undefined }))} placeholder="0.5" className={FIELD_INPUT} />
                </Field>
                <Field label="Medidas" labelClassName={FIELD_LABEL}>
                  <input value={editForm.dimensions ?? ""} onChange={(e) => setEditForm(f => ({ ...f, dimensions: e.target.value }))} placeholder="30x20x10 cm o 2 m³" className={FIELD_INPUT} />
                </Field>
                </>)}
                {editForm.type === "service" && (<>
                <Field label="Duración estimada" labelClassName={FIELD_LABEL}>
                  <input value={editForm.durationLabel ?? ""} onChange={(e) => setEditForm(f => ({ ...f, durationLabel: e.target.value }))} placeholder="Ej: 2 horas, 1 día" className={FIELD_INPUT} />
                </Field>
                <Field label="Cobro por" labelClassName={FIELD_LABEL}>
                  <select value={editForm.pricingUnit ?? "fijo"} onChange={(e) => setEditForm(f => ({ ...f, pricingUnit: e.target.value }))} className={FIELD_INPUT}>
                    <option value="fijo">Precio fijo</option>
                    <option value="hora">Por hora</option>
                    <option value="m3">Por m³</option>
                    <option value="unidad">Por unidad</option>
                    <option value="dia">Por día</option>
                  </select>
                </Field>
                <Field label="Notas / requisitos para el cliente" labelClassName={FIELD_LABEL} className="sm:col-span-2">
                  <textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={cn(FIELD_INPUT, "resize-none")} />
                </Field>
                </>)}
                <Field label="Afecto a IGV" labelClassName={FIELD_LABEL}>
                  <select value={editForm.taxType ?? "gravado"} onChange={(e) => setEditForm(f => ({ ...f, taxType: e.target.value }))} className={FIELD_INPUT}>
                    <option value="gravado">Gravado (IGV 18%)</option>
                    <option value="exonerado">Exonerado</option>
                    <option value="inafecto">Inafecto</option>
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">Descripción del producto</span>
                    <button
                      type="button"
                      onClick={() => generateDescriptionAI(editForm, setEditForm)}
                      disabled={aiDescGenerating || !editForm.name}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-linear-to-r from-primary to-[var(--data-success-500)] text-white text-[length:var(--ts-2xs)] font-bold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      title={!editForm.name ? "Primero ingresa el nombre del producto" : "Generar descripción con IA"}
                    >
                      {aiDescGenerating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {aiDescGenerating ? "Generando…" : "Generar con IA"}
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={editForm.description ?? ""}
                    onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value || undefined }))}
                    placeholder="Ej: Aceite de girasol puro, ideal para frituras ligeras. Botella de 1 litro."
                    className={cn(FIELD_INPUT, "resize-none")}
                  />
                  {aiDescError && (
                    <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {aiDescError}
                    </p>
                  )}
                </div>
              </div>

              {/* Contenido rico (estilo Amazon) — ficha técnica editable + bloques A+ */}
              <ProductSpecsEditor value={editSpecs} onChange={setEditSpecs} />
              <ProductRichContentEditor value={editRich} onChange={setEditRich} />

              {/* Variantes — editor inline real (CRUD vía /api/.../variants) */}
              <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Layers className="h-4 w-4 text-[var(--text-secondary)] dark:text-[var(--text-primary)]" />
                  <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Variantes / presentaciones</p>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">— Tamaños, colores, sabores. Cada uno con su foto y stock.</span>
                </div>
                <ProductVariantsInline
                  productId={editModalProduct.id}
                  basePrice={Number(editForm.price) || editModalProduct.price}
                  parentImage={editForm.image ?? null}
                />
              </div>

              {/* Adicionales / Modificadores — extras que el cliente elige al ordenar */}
              <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-[var(--text-secondary)] dark:text-[var(--text-primary)]" />
                      <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Adicionales / extras</p>
                    </div>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-1 leading-snug">
                      Cosas que el cliente elige <strong>encima</strong> del producto base — cremas, salsas, presa, sabores, toppings, palta extra. <strong>No afecta el stock</strong> del producto principal.
                    </p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-0.5">
                      Ejemplos: <em>Pollo a la brasa</em> con grupo &quot;Cremas&quot; (mayonesa +0, ají +0.5, mostaza +0) o <em>Hamburguesa</em> con &quot;Extras&quot; (queso +2, tocino +3, palta +2).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => editModalProduct && setModifiersProduct({ id: editModalProduct.id, name: editModalProduct.name })}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shrink-0"
                  >
                    <Sliders className="h-4 w-4" />
                    Configurar adicionales
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <Field label="Imagen del producto" labelClassName={FIELD_LABEL} className="sm:col-span-2">
                  {(editImgFieldId) => (<>
                  {/* Drag-and-drop zone — arrastrá o click para subir */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary", "bg-primary/5"); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove("ring-2", "ring-primary", "bg-primary/5"); }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("ring-2", "ring-primary", "bg-primary/5");
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      setImgUploading(true);
                      setImgError(null);
                      try {
                        const result = await processImage(file);
                        setEditForm(f => ({ ...f, image: result.dataUrl }));
                        setImgInfo({ originalKB: result.originalKB, finalKB: result.finalKB, width: result.width, height: result.height, quality: result.quality });
                      } catch (err) {
                        setImgError(err instanceof Error ? err.message : "Error al procesar imagen");
                      } finally {
                        setImgUploading(false);
                      }
                    }}
                    className="flex flex-wrap gap-3 items-start p-3 rounded-xl border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 transition-all"
                  >
                    {editForm.image ? (
                      <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-[var(--rule-base)] shrink-0 bg-[var(--surface-alt)] dark:bg-surface group">
                        <Image src={editForm.image} alt="preview" fill unoptimized={editForm.image.startsWith("data:")} className="object-cover" sizes="80px" />
                        <button
                          type="button"
                          onClick={() => { setEditForm(f => ({ ...f, image: "" })); setImgInfo(null); }}
                          title="Quitar imagen"
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-[var(--data-error-500)] transition-all"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-20 w-20 rounded-xl border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] dark:bg-surface flex items-center justify-center shrink-0">
                        <Camera className="h-6 w-6 text-[var(--text-tertiary)] dark:text-muted" />
                      </div>
                    )}
                    <div className="flex-1 space-y-1.5 min-w-[180px]">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => editImgRef.current?.click()}
                          disabled={imgUploading}
                          className="inline-flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors text-sm font-bold disabled:opacity-50"
                        >
                          <Camera className="h-4 w-4" />
                          {imgUploading ? "Procesando…" : "Subir foto"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowImageBank(true)}
                          className="inline-flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-lg bg-linear-to-r from-primary to-[var(--data-success-500)] text-white hover:opacity-90 transition-all text-sm font-bold"
                          title="Elegir una imagen del banco global mantenido por el superadmin"
                        >
                          <BookOpen className="h-4 w-4" />
                          Banco de imágenes
                        </button>
                      </div>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted text-center">
                        o arrastrá una imagen aquí — cualquier formato (JPG, PNG, WebP, AVIF…)
                      </p>
                      <input
                        id={editImgFieldId}
                        value={editForm.image ?? ""}
                        onChange={(e) => setEditForm(f => ({ ...f, image: e.target.value }))}
                        placeholder="o pegar URL de imagen"
                        className={FIELD_INPUT}
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
                          setImgError(null);
                          try {
                            // Subir a /api/upload (Supabase Storage + Sharp) y auto-save.
                            // Antes guardaba dataUrl base64 inline — el JSON del PUT
                            // pesaba 1-5MB y a veces fallaba silencioso.
                            const url = await uploadImageFile(file);
                            if (url) {
                              setEditForm(f => ({ ...f, image: url }));
                              setImgInfo({ originalKB: Math.round(file.size / 1024), finalKB: Math.round(file.size / 1024), width: 0, height: 0, quality: 82 });
                              // AUTO-SAVE: el usuario ya no espera al click "Guardar".
                              if (editModalProduct) {
                                void autoSaveImage(editModalProduct.id, url);
                              }
                            } else {
                              setImgError("No se pudo subir la imagen. Reintenta.");
                            }
                          } catch (err) {
                            setImgError(err instanceof Error ? err.message : "Error al procesar imagen");
                          } finally {
                            setImgUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                      {imgInfo && (
                        <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] flex items-center gap-1.5 leading-snug">
                          <CheckCircle className="h-3 w-3 shrink-0" />
                          Imagen optimizada: {imgInfo.originalKB} KB → <strong>{imgInfo.finalKB} KB</strong> · {imgInfo.width}×{imgInfo.height}px · WebP {imgInfo.quality}%
                        </p>
                      )}
                      {imgError && (
                        <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] flex items-center gap-1.5 leading-snug">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {imgError}
                        </p>
                      )}
                    </div>
                  </div>
                  </>)}
                </Field>
              </div>
              <div className="flex items-center justify-between p-4 bg-[var(--surface-alt)] dark:bg-surface rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Estado del producto</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{editForm.active ? "Visible en la tienda" : "Oculto en la tienda"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, active: !f.active }))}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer",
                    editForm.active ? "bg-primary/10" : "bg-[var(--rule-soft)]"
                  )}
                >
                  <span className={cn("inline-block h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow transition-transform", editForm.active ? "translate-x-5" : "translate-x-0")} />
                </button>
              </div>
              <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center gap-3 border-t-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-6 py-4">
                <button type="button" onClick={closeEditModal} className="h-11 px-5 rounded-xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">Cancelar</button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-extrabold text-white shadow-[var(--shadow-lg)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-xl)] active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
                  style={{ backgroundImage: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)" }}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" strokeWidth={2.5} />}
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-2 py-1.5 shadow-lg backdrop-blur-md animate-[slideUp_0.2s_ease-out]">
          {/* Conteo — chip discreto, sin barra de color saturada */}
          <span className="inline-flex items-center gap-2 pl-1.5 pr-1 text-sm font-semibold text-[var(--text-primary)]">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-black tabular-nums text-[var(--accent)]">
              {selectedIds.size}
            </span>
            <span className="hidden sm:inline">seleccionado{selectedIds.size > 1 ? "s" : ""}</span>
          </span>

          <span className="mx-1 h-6 w-px bg-[var(--rule-soft)]" aria-hidden />

          {/* Activar / Desactivar — toggle rápido del estado (ghost monocromo) */}
          <button
            onClick={async () => {
              const ids = Array.from(selectedIds);
              // Activar/desactivar en lote toca la vidriera de N productos:
              // si el servidor rechaza, la selección se limpiaba igual y no
              // quedaba rastro de que no había pasado nada.
              if (await bulkEstado(ids, true)) { clearSelection(); load(); }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Activar</span>
          </button>
          <button
            onClick={async () => {
              const ids = Array.from(selectedIds);
              if (await bulkEstado(ids, false)) { clearSelection(); load(); }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <EyeOff className="h-4 w-4" /> <span className="hidden sm:inline">Desactivar</span>
          </button>

          {/* Editar campos — abre el modal con TODAS las opciones (precio, stock,
              categoría, etiqueta…). Única acción con fondo sutil para marcarla
              como primaria sin gritar. */}
          <button
            onClick={() => { setBulkField("active"); setBulkValue("true"); setBulkModal(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--rule-soft)]"
          >
            <Sliders className="h-4 w-4" /> <span className="hidden sm:inline">Editar</span>
          </button>

          {/* Overflow — acciones secundarias + la destructiva (Radix, auto-flip
              hacia arriba porque el bar vive abajo). */}
          <ModuleActionMenu
            iconOnly
            label="Más acciones"
            align="end"
            items={[
              { label: "Exportar selección (CSV)", icon: Download, onClick: exportSelectedCSV },
              {
                label: "Quitar imágenes",
                icon: Camera,
                description: "Borra solo la imagen, no el producto",
                onClick: () => {
                  const skip =
                    typeof window !== "undefined" &&
                    localStorage.getItem("admin-skip-bulk-clear-images-confirm") === "1";
                  if (skip) executeBulkClearImages();
                  else setBulkClearImagesConfirm(true);
                },
              },
              {
                label: `Eliminar ${selectedIds.size} producto${selectedIds.size > 1 ? "s" : ""}`,
                icon: Trash2,
                destructive: true,
                dividerBefore: true,
                onClick: () => setBulkDeleteConfirm(true),
              },
            ]}
          />

          <span className="mx-1 h-6 w-px bg-[var(--rule-soft)]" aria-hidden />

          {/* Limpiar selección */}
          <button
            onClick={clearSelection}
            aria-label="Limpiar selección"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk clear images confirmation modal */}
      {bulkClearImagesConfirm && (
        <div className="modal-backdrop flex items-center justify-center p-4">
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-sm w-full overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--data-warning-100)] dark:bg-orange-950/30">
                  <Camera className="h-5 w-5 text-[var(--data-warning-500)]" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Quitar imágenes</CardTitle>
                  <p className="text-sm text-muted">Solo borra la imagen, no el producto</p>
                </div>
              </div>
              <p className="text-sm text-[var(--text-primary)]">
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
                  className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] transition-colors"
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
                  className="flex-1 py-2.5 rounded-lg bg-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]/90 text-white text-sm font-semibold transition-colors disabled:opacity-50"
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
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-sm w-full overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--data-error-100)] dark:bg-red-950/30">
                  <Trash2 className="h-5 w-5 text-[var(--data-error-500)]" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Eliminar productos</CardTitle>
                  <p className="text-sm text-muted">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <p className="text-sm text-[var(--text-primary)]">
                ¿Estás seguro de eliminar <strong>{selectedIds.size}</strong> producto{selectedIds.size > 1 ? "s" : ""}? Se quitarán del catálogo y ya no aparecerán en la tienda.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setBulkDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeBulkDelete}
                  disabled={bulkDeleting}
                  className="flex-1 py-2.5 rounded-lg bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] text-white text-sm font-semibold transition-colors disabled:opacity-50"
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
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-sm w-full overflow-hidden">
            <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Edición masiva — {selectedIds.size} producto{selectedIds.size > 1 ? "s" : ""}</CardTitle>
              <button onClick={() => setBulkModal(false)} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-4">
              <Field label="Campo a modificar" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <select value={bulkField} onChange={e => { const v = e.target.value as typeof bulkField; setBulkField(v); setBulkValue(v === "active" ? "true" : ""); }}
                  className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface px-3 py-2 text-sm">
                  <optgroup label="General">
                    <option value="active">Estado (activo / inactivo)</option>
                    <option value="category">Categoría</option>
                    <option value="badge">Etiqueta</option>
                  </optgroup>
                  <optgroup label="Precio">
                    <option value="price">Fijar precio (S/)</option>
                    <option value="priceDelta">Ajustar precio (± S/)</option>
                    <option value="pricePercent">Ajustar precio (± %)</option>
                  </optgroup>
                  <optgroup label="Stock">
                    <option value="stock">Fijar stock</option>
                    <option value="stockMin">Stock mínimo (alerta)</option>
                    <option value="stockMax">Stock máximo</option>
                  </optgroup>
                </select>
              </Field>
              <Field label="Nuevo valor" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                {(bulkValId) => (<>
                {bulkField === "active" ? (
                  <select id={bulkValId} value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface px-3 py-2 text-sm">
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                ) : bulkField === "category" ? (
                  <select value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface px-3 py-2 text-sm">
                    <option value="">Seleccionar…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                ) : bulkField === "badge" ? (
                  <div className="mt-1 space-y-2">
                    <input type="text" maxLength={50} value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: Oferta, Nuevo, Combo…"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface px-3 py-2 text-sm" />
                    <div className="flex flex-wrap gap-1.5">
                      {["Nuevo", "Oferta", "Combo", "Recomendado", "Más vendido"].map(b => (
                        <button key={b} type="button" onClick={() => setBulkValue(b)}
                          className="rounded-full border border-[var(--rule-base)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                          {b}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">Dejá el campo vacío y aplicá para <strong>quitar</strong> la etiqueta.</p>
                  </div>
                ) : bulkField === "price" ? (
                  <div className="mt-1">
                    <input type="number" min="0.01" step="0.01" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 12.50"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface px-3 py-2 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Fija el mismo precio en {selectedIds.size} producto{selectedIds.size > 1 ? "s" : ""}.</p>
                  </div>
                ) : bulkField === "priceDelta" ? (
                  <div className="mt-1">
                    <input type="number" step="0.01" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 1.50 sube · -2 baja"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface px-3 py-2 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Suma o resta soles al precio actual de cada producto.</p>
                  </div>
                ) : bulkField === "pricePercent" ? (
                  <div className="mt-1">
                    <input type="number" step="1" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 10 = +10% · -5 = -5%"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface px-3 py-2 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      Ajusta el precio {bulkValue ? `un ${bulkValue}%` : "un …%"} en {selectedIds.size} producto{selectedIds.size > 1 ? "s" : ""}.
                    </p>
                  </div>
                ) : bulkField === "stockMin" ? (
                  <div className="mt-1">
                    <input type="number" min="0" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 5"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface px-3 py-2 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Umbral para la alerta de “stock bajo”.</p>
                  </div>
                ) : bulkField === "stockMax" ? (
                  <div className="mt-1">
                    <input type="number" min="0" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 100"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface px-3 py-2 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Capacidad máxima sugerida (para reposición).</p>
                  </div>
                ) : (
                  <input type="number" min="0" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Cantidad"
                    className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface px-3 py-2 text-sm" />
                )}
                </>)}
              </Field>
            </div>
            <div className="px-3 sm:px-6 py-4 bg-[var(--surface-alt)] dark:bg-surface border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap gap-3">
              <button onClick={() => setBulkModal(false)} className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] transition-colors">Cancelar</button>
              <button onClick={executeBulk} disabled={bulkSaving || (!bulkValue && bulkField !== "active" && bulkField !== "badge")}
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

      {/* Bulk image assign — drag&drop banco → productos sin imagen */}
      {showBulkImageAssign && (
        <BulkImageAssignModal
          open={showBulkImageAssign}
          onOpenChange={setShowBulkImageAssign}
          products={products}
          onAssigned={(productId, imageUrl) => {
            // Optimistic update local — evita refetch que rompe scroll del modal
            setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, image: imageUrl } : p)));
          }}
        />
      )}

      {/* Image Bank picker — comparte el state showImageBank entre add+edit modal */}
      <ImageBankPicker
        open={showImageBank}
        onOpenChange={setShowImageBank}
        onPick={(picked) => {
          // Si el modal edit está abierto, fill ahí Y auto-save la imagen.
          if (editModalProduct) {
            setEditForm(f => ({ ...f, image: picked.imageUrl }));
            // Si el nombre del producto en el form está vacío, sugerir el del banco.
            if (!editForm.name?.trim()) {
              setEditForm(f => ({ ...f, name: picked.name }));
            }
            // AUTO-SAVE inmediato del campo image — Brandon esperaba que se
            // aplicara de inmediato sin necesidad de click "Guardar" extra.
            void autoSaveImage(editModalProduct.id, picked.imageUrl);
          } else if (showAdd) {
            // En el add form (producto nuevo) no hay productId aun, persiste
            // al click "Crear producto". Solo actualiza preview.
            setAddForm(f => ({ ...f, image: picked.imageUrl, name: f.name || picked.name }));
            toast.success("Imagen seleccionada. Click Crear para guardar el producto.", { duration: 2500 });
          }
          setImgInfo(null);
          setImgError(null);
        }}
      />

      {/* Mejora 6 nueva: QR Modal */}
      {showQRProduct && (
        <>
          <div className="modal-backdrop" onClick={() => setShowQRProduct(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowQRProduct(null)}>
            <div className="w-full max-w-sm bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-5 space-y-4 text-center">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Codigo QR</CardTitle>
                <button onClick={() => setShowQRProduct(null)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent">
                  <X className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>
              {qrDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- data URL local, next/image no aplica */
                <img
                  src={qrDataUrl}
                  alt={`QR ${showQRProduct.name}`}
                  className="mx-auto bg-white p-2 rounded-lg"
                  width={200}
                  height={200}
                />
              ) : (
                <div className="mx-auto h-[200px] w-[200px] animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
              )}
              <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{showQRProduct.name}</p>
              <p className="text-lg font-extrabold text-primary">S/{Number(showQRProduct.price).toFixed(2)}</p>
              {showQRProduct.barcode && <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">SKU: {showQRProduct.barcode}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!qrDataUrl) return;
                    const w = window.open("", "_blank");
                    if (w) {
                      w.document.write(`<html><head><title>QR ${showQRProduct.name}</title><style>body{text-align:center;font-family:sans-serif;padding:40px}img{margin:20px auto;width:300px;height:300px}@media print{button{display:none}}</style></head><body><h2>${showQRProduct.name}</h2><img src="${qrDataUrl}" alt="QR" /><p style="font-size:24px;font-weight:bold;color:var(--color-primary)">S/${Number(showQRProduct.price).toFixed(2)}</p><button onclick="window.print()">Imprimir</button></body></html>`);
                      w.document.close();
                    }
                  }}
                  className="flex-1 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] font-bold text-xs hover:bg-[var(--surface-alt)] transition-colors flex items-center justify-center gap-1.5"
                >
                  Imprimir
                </button>
                <a
                  href={qrDataUrl ?? "#"}
                  download={`qr-${showQRProduct.name.replace(/\s+/g, "-")}.png`}
                  aria-disabled={!qrDataUrl}
                  className={cn(
                    "flex-1 py-2 rounded-lg bg-primary text-white font-bold text-xs hover:bg-primary-dark transition-colors flex items-center justify-center gap-1.5",
                    !qrDataUrl && "pointer-events-none opacity-50"
                  )}
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
            <div className="w-full max-w-sm bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Configurar Auto-Reorden</CardTitle>
                <button onClick={() => setShowAutoReorder(null)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent">
                  <X className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>
              <Field label="Reordenar cuando stock sea menor o igual a:" labelClassName="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                <input
                  type="number" min="1" value={arThreshold} onChange={e => setArThreshold(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="5"
                />
              </Field>
              <Field label="Cantidad a pedir:" labelClassName="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                <input
                  type="number" min="1" value={arQty} onChange={e => setArQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="10"
                />
              </Field>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAutoReorder(null)} className="flex-1 px-4 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors">
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
        <div className="bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />
          <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-bold">
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
              ...EMPTY_ADD,
              type: p.type ?? "product",
              brand: p.brand ?? "",
              taxType: p.taxType ?? "gravado",
              weightKg: p.weightKg != null ? String(p.weightKg) : "",
              dimensions: p.dimensions ?? "",
              durationLabel: p.durationLabel ?? "",
              pricingUnit: p.pricingUnit ?? "fijo",
              notes: p.notes ?? "",
              description: p.description ?? "",
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
