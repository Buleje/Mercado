import { useState, useEffect, useCallback, useId, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import type { SpecRow } from "@/components/admin/inventario/ProductSpecsEditor";
import type { RichBlock } from "@/components/admin/inventario/ProductRichContentEditor";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useUndoToast } from "@/components/admin/shared/UndoToast";
import QRCode from "qrcode";
import { limaDateKey } from "@/lib/utils";
import { useFiltroDeUrl } from "@/hooks/use-filtro-de-url";
import { esFaltaDeCatalogo, type FaltaDeCatalogo } from "@/lib/inventario/catalogo-incompleto";
import { csrfHeaders } from "@/lib/csrf-client";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import type { DbProduct, DbInventoryMovement } from "@/lib/jsondb";
import type { Rango } from "@/lib/admin/filtros-columna";
import { useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { COLS_INVENTARIO, type View } from "@/components/admin/inventario/inventario-compartido";

/** Estado de Inventario: filtros, modales, formularios y selección. Parte de `useInventario`. */
export function useInventarioEstado() {
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
  // Filtros en la cabecera, estilo Excel (Brandon, 2026-09-03/22): un solo
  // estado por columna, y las pastillas de arriba escriben el MISMO estado
  // que el autofiltro del `<th>` — no son dos filtros, son dos lugares desde
  // donde tocar uno. `[]` = todas las categorías (antes era el sentinela
  // "todos"); ahora admite VARIAS a la vez.
  const [catFilter, setCatFilter] = useState<string[]>([]);
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
  // Estado, en su columna (autofiltro de Excel): reemplaza al botón
  // "Inactivos" suelto — mismo estado que el `<th>Estado`, no dos controles
  // para lo mismo. Default `["Activo"]` para no cambiar el comportamiento de
  // siempre (los inactivos estaban ocultos salvo que se pidieran).
  const [estadoFiltro, setEstadoFiltro] = useState<string[]>(["Activo"]);
  const showInactive = estadoFiltro.length === 0 || estadoFiltro.includes("Inactivo");
  // Volumen de stock, en su columna: "entre X e Y" además del atajo "Bajo
  // stock" (que sigue existiendo — son dos preguntas distintas: un umbral fijo
  // de negocio vs. un rango que el que mira la tabla arma al vuelo).
  const [stockRango, setStockRango] = useState<Rango<number>>({ min: null, max: null });
  // Vencimiento, en su columna: "vence entre estas fechas" — antes sólo había
  // un conteo en el KPI ("vencen pronto"), sin forma de acotar la tabla a esas
  // filas.
  const [vencRango, setVencRango] = useState<Rango<string>>({ min: null, max: null });
  // Mejora 8R2: Filtro sin imagen
  const [noImageOnly, setNoImageOnly] = useState(false);
  // «Completa tu catálogo» (aviso de Inicio): productos sin costo, sin código
  // o sin mínimo — la regla vive en `lib/inventario/catalogo-incompleto.ts`.
  const [faltaDato, setFaltaDato] = useState<FaltaDeCatalogo | null>(null);
  // Los avisos de Inicio llegan con `?filter=`: abrir ya filtrado lo que avisan.
  useFiltroDeUrl((valor) => {
    if (valor === "critical") setLowOnly(true);
    else if (valor === "expiring") {
      // Los mismos 7 días que cuenta el aviso de Inicio.
      const hoy = limaDateKey();
      const en7 = new Date(`${hoy}T12:00:00Z`);
      en7.setUTCDate(en7.getUTCDate() + 7);
      setVencRango({ min: hoy, max: en7.toISOString().slice(0, 10) });
    } else if (esFaltaDeCatalogo(valor)) setFaltaDato(valor);
  });
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
  const editModalRef = useRef<HTMLDivElement>(null);
  const ventanaEdit = useVentanaDeModal(!!editModalProduct, { ref: editModalRef, aplicarTranslate: true, claveMemoria: "inventario-editar-producto" });
  const [showAdd, setShowAdd] = useState(false);
  const addModalRef = useRef<HTMLDivElement>(null);
  const ventanaAdd = useVentanaDeModal(showAdd, { ref: addModalRef, aplicarTranslate: true, claveMemoria: "inventario-nuevo-producto" });
  const [showPicker, setShowPicker] = useState(false);
  const pickerModalRef = useRef<HTMLDivElement>(null);
  const ventanaPicker = useVentanaDeModal(showPicker, { ref: pickerModalRef, aplicarTranslate: true, claveMemoria: "inventario-agregar-catalogo" });
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
  const bulkModalRef = useRef<HTMLDivElement>(null);
  const ventanaBulk = useVentanaDeModal(bulkModal, { ref: bulkModalRef, aplicarTranslate: true, claveMemoria: "inventario-edicion-masiva" });
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
  const autoReorderPanelRef = useRef<HTMLDivElement>(null);
  const autoReorderTitleId = useId();
  useModalAccesible(autoReorderPanelRef, { onCerrar: () => setShowAutoReorder(null), activo: showAutoReorder !== null });
  const ventanaAutoReorder = useVentanaDeModal(showAutoReorder !== null, { ref: autoReorderPanelRef, aplicarTranslate: true, claveMemoria: "inventario-auto-reorden" });

  // Mejora 6 nueva: QR modal
  const [showQRProduct, setShowQRProduct] = useState<DbProduct | null>(null);
  // QR generado localmente (chart.googleapis.com está muerto desde 2019).
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrPanelRef = useRef<HTMLDivElement>(null);
  const qrTitleId = useId();
  useModalAccesible(qrPanelRef, { onCerrar: () => setShowQRProduct(null), activo: !!showQRProduct });
  const ventanaQR = useVentanaDeModal(!!showQRProduct, { ref: qrPanelRef, aplicarTranslate: true, claveMemoria: "inventario-qr" });
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
  const orden = useOrdenColumnas("inventario-productos", COLS_INVENTARIO);

  // CSV Import
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [kardexProduct, setKardexProduct] = useState<{ id: number; name: string } | null>(null);
  const [modifiersProduct, setModifiersProduct] = useState<{ id: number; name: string } | null>(null);

  // Context menu state for right-click on product rows
  const [ctxMenu, setCtxMenu] = useState<{ product: DbProduct; x: number; y: number } | null>(null);

  useScrollLock(!!(showAdd || showPicker || editModalProduct || showScanner || bulkModal || bulkDeleteConfirm || bulkClearImagesConfirm));
  return {
    confirm, showUndo, products, setProducts, movements, setMovements, loading, setLoading, view,
    setView, search, setSearch, searchPlaceholders, phIndex, setPhIndex, catFilter, setCatFilter,
    savedCategories, setSavedCategories, lowOnly, setLowOnly, estadoFiltro, setEstadoFiltro,
    showInactive, stockRango, setStockRango, vencRango, setVencRango, noImageOnly, setNoImageOnly,
    faltaDato, setFaltaDato, showFilters, setShowFilters, viewMode, setViewMode, expandedOC,
    setExpandedOC, generatingOC, setGeneratingOC, editModalProduct, setEditModalProduct, editForm,
    setEditForm, saving, setSaving, editModalRef, ventanaEdit, showAdd, setShowAdd, addModalRef,
    ventanaAdd, showPicker, setShowPicker, pickerModalRef, ventanaPicker, pickerSearch,
    setPickerSearch, pickerCat, setPickerCat, EMPTY_ADD, addForm, setAddForm, addVariants,
    setAddVariants, addModifierGroups, setAddModifierGroups, addSeo, setAddSeo, addGallery,
    setAddGallery, galleryUploading, setGalleryUploading, addSpecs, setAddSpecs, addRich, setAddRich,
    editSpecs, setEditSpecs, editRich, setEditRich, showScanner, setShowScanner, scanLoading,
    setScanLoading, imgUploading, setImgUploading, imgInfo, setImgInfo, imgError, setImgError,
    aiDescGenerating, setAiDescGenerating, aiDescError, setAiDescError, showImageBank,
    setShowImageBank, showBulkImageAssign, setShowBulkImageAssign, generateDescriptionAI, addImgRef,
    galleryRef, editImgRef, dbQuery, setDbQuery, dbResults, setDbResults, dbSearching, setDbSearching,
    selectedIds, setSelectedIds, bulkModal, setBulkModal, bulkModalRef, ventanaBulk, bulkField,
    setBulkField, bulkValue, setBulkValue, bulkSaving, setBulkSaving, bulkDeleteConfirm,
    setBulkDeleteConfirm, bulkDeleting, setBulkDeleting, bulkClearImagesConfirm,
    setBulkClearImagesConfirm, bulkClearingImages, setBulkClearingImages, dontAskBulkClear,
    setDontAskBulkClear, autoReorderConfigs, setAutoReorderConfigs, showAutoReorder,
    setShowAutoReorder, arThreshold, setArThreshold, arQty, setArQty, autoReorderPanelRef,
    autoReorderTitleId, ventanaAutoReorder, showQRProduct, setShowQRProduct, qrDataUrl, setQrDataUrl,
    qrPanelRef, qrTitleId, ventanaQR, showExtendedCols, setShowExtendedCols, showExpandedTable,
    setShowExpandedTable, orden, csvImportRef, csvImporting, setCsvImporting, csvResult, setCsvResult,
    kardexProduct, setKardexProduct, modifiersProduct, setModifiersProduct, ctxMenu, setCtxMenu,
  };
}
