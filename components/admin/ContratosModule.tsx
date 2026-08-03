"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar, { type AdminTab } from "@/components/admin/shared/AdminTabBar";
import { activateProps } from "@/components/admin/shared/a11y";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Search, Plus, X, ChevronLeft, ChevronRight, Loader2, AlertTriangle,
  FileText, User, Printer, DollarSign, Clock, CheckCircle, BookOpen, FileSignature, LayoutGrid, List,
  Download, Copy, Eye, Edit3, ArrowRight, ArrowLeft, Briefcase, Truck, Home, Package, Users,
  Lock, TreePine, Scale, PenTool, Save, BarChart3, AlertCircle, ClipboardCopy,
  MapPin, Info } from "@buleje/design-system/icons";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  PLANTILLAS,
  LEGAL_TOOLTIPS,
  EMISOR_FIELD_MAP,
  CARGO_OPTIONS,
  LUGAR_ENTREGA_OPTIONS,
  fillTemplate,
  numberToWords,
  validateField,
  montoDelContrato,
  vencimientoDelContrato,
  inicioDelContrato,
  contraparteDelContrato,
} from "@/lib/contratos/plantillas";
import type { ContractTemplate } from "@/lib/contratos/plantillas";
import {
  TIPO_LABELS,
  ESTADO_VISIBLE_LABELS,
  estadoVisible,
  diasParaVencer,
} from "@/lib/types/contracts";
import type { DbContract, EstadoVisible } from "@/lib/types/contracts";
import PanelFirmantes from "@/components/admin/contratos/PanelFirmantes";
import PanelRevision from "@/components/admin/contratos/PanelRevision";
import VinculoContraparte from "@/components/admin/contratos/VinculoContraparte";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * El contrato tal como lo devuelve la API. Antes este tipo declaraba
 * `montoTotal`/`clienteDocumento`/`fechaContrato` mientras el backend mandaba
 * `monto`/`clienteDoc`/`fecha`, así que TODO monto salía S/ 0.00 y el documento
 * de la contraparte salía vacío. Ahora es el mismo tipo de la capa de datos.
 */
type ContratoAPI = DbContract;

const MODULE_ID = "contratos";

type TabId = "dashboard" | "plantillas" | "contratos" | "crear" | "editor";

// ── Icon Map ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, Briefcase, Users, PenTool, Truck, Home, Lock, TreePine, DollarSign, Scale,
};

function TemplateIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICON_MAP[icon] || FileText;
  return <Icon className={className} />;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Respeta la moneda del contrato: un contrato en dólares se mostraba en soles. */
function formatMoney(n: number, moneda: "PEN" | "USD" = "PEN") {
  const simbolo = moneda === "USD" ? "US$" : "S/";
  return `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDatePeru(iso: string | null | undefined) {
  if (!iso) return "---";
  try {
    const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

const ESTADO_STYLES: Record<EstadoVisible, string> = {
  VIGENTE: "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  POR_VENCER: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
  VENCIDO: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
  PENDIENTE_FIRMA: "bg-[color-mix(in_oklch,var(--accent)_14%,transparent)] text-[var(--accent-ink)] dark:text-[var(--accent)]",
  RENOVADO: "bg-[var(--surface-sunken)] dark:bg-white/5 text-[var(--text-secondary)]",
  TERMINADO: "bg-[var(--surface-sunken)] dark:bg-white/5 text-[var(--text-secondary)]",
  ANULADO: "bg-[var(--rule-soft)] dark:bg-white/5 text-[var(--text-tertiary)]",
  BORRADOR: "bg-[var(--surface-sunken)] dark:bg-white/5 text-[var(--text-secondary)]",
};

// Using CSS variables via getComputedStyle to honor DS tokens at runtime
const PIE_COLORS = [
  "var(--brand-ink)", "var(--secondary)", "var(--data-warning)", "var(--data-error)",
  "var(--accent)", "var(--brand-ink-light, #00BDBD)", "var(--data-success)",
  "var(--text-secondary)", "var(--rule-base)", "var(--data-warning-100)",
  "var(--surface-sunken)", "var(--data-error-100)",
];

const PER_PAGE = 12;

/** Cómo se lee cada evento del historial, en criollo. */
const EVENTO_LABELS: Record<string, string> = {
  CREADO: "Se creó el contrato",
  EDITADO: "Se editó",
  PDF_GENERADO: "Se generó el PDF",
  ENVIADO_FIRMA: "Se envió a firmar",
  FIRMADO: "Lo firmaron",
  RECHAZADO: "Lo rechazaron",
  VENCIMIENTO_AVISADO: "Se avisó del vencimiento",
  RENOVADO: "Se renovó",
  ANULADO: "Se anuló",
  TERMINADO: "Se dio por terminado",
  REVISADO_IA: "Lo revisó la IA",
};

// ── LegalTooltip Component ──────────────────────────────────────────────

function LegalTooltip({ term, explanation, example }: { term: string; explanation: string; example: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className="ml-1 w-5 h-5 rounded-full bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-xs flex items-center justify-center hover:bg-primary/10 transition-colors"
        title="¿Qué significa esto?"
        aria-expanded={open}
        aria-haspopup="true"
      >?</button>
      {open && (
        <div className="absolute bottom-7 left-0 z-50 w-72 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3 text-xs shadow-[var(--shadow-lg)]">
          <p className="font-bold text-[var(--text-primary)] mb-1">{term}</p>
          <p className="text-[var(--text-secondary)] mb-2">{explanation}</p>
          <div className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 rounded-lg p-2">
            <p className="text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"><strong>Ejemplo:</strong> {example}</p>
          </div>
        </div>
      )}
    </span>
  );
}


// ── Main Component ──────────────────────────────────────────────────────

/**
 * ⚠️ Este módulo NO usa `useVistaModulo` (`?vista=`) a propósito: se renderiza
 * DENTRO de DocumentosHubModule, que ya es dueño de ese parámetro. Dos componentes
 * escribiendo el mismo `?vista=` se pisarían — el de adentro le cambiaría la
 * pestaña al de afuera en cada click. Su sub-vista se queda en localStorage
 * hasta que exista un segundo nivel de direccionamiento.
 */
export default function ContratosModule() {
  // -- Data from API
  const [contratos, setContratos] = useState<ContratoAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -- UI
  // Recuerda el último tab, igual que los hubs y Mi Plata: entrar a Contratos
  // y caer siempre en Dashboard obligaba a re-navegar en cada visita.
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "dashboard";
    const saved = localStorage.getItem(`admin-last-tab-${MODULE_ID}`);
    return (saved as TabId) || "dashboard";
  });
  useEffect(() => {
    try { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, activeTab); } catch { /* modo privado */ }
  }, [activeTab]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [filterTipo, setFilterTipo] = useState<string>("ALL");
  const [filterEstado, setFilterEstado] = useState<string>("ALL");

  // -- Contract detail
  const [selected, setSelected] = useState<ContratoAPI | null>(null);
  /** El mismo contrato pero completo (con firmantes e historial), pedido al abrirlo. */
  const [detalle, setDetalle] = useState<ContratoAPI | null>(null);
  const [archivando, setArchivando] = useState<string | null>(null);
  const [archivoError, setArchivoError] = useState<string | null>(null);
  const [renovando, setRenovando] = useState(false);
  const [renovarError, setRenovarError] = useState<string | null>(null);
  const [mesesRenovacion, setMesesRenovacion] = useState(12);

  // -- Wizard: Crear Contrato
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
  const [wizardData, setWizardData] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  /** Vencimiento cargado a mano cuando la plantilla no define ninguno. */
  const [vencimientoManual, setVencimientoManual] = useState("");

  // -- Auto-fill from settings
  const [storeSettings, setStoreSettings] = useState<Record<string, string>>({});
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());

  // -- Geolocation
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoResult, setGeoResult] = useState<string | null>(null);

  // -- Validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // -- Select "Otro" custom values
  const [customSelectValues, setCustomSelectValues] = useState<Record<string, string>>({});

  // -- Editor
  const [editorTemplate, setEditorTemplate] = useState<ContractTemplate | null>(null);
  const [editorText, setEditorText] = useState("");
  const [editorPreview, setEditorPreview] = useState(false);

  // -- Refs
  const printRef = useRef<HTMLDivElement>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────

  const fetchContratos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contratos");
      if (!res.ok) throw new Error("Error al cargar contratos");
      const json = await res.json();
      const data: ContratoAPI[] = Array.isArray(json) ? json : Array.isArray(json?.contratos) ? json.contratos : [];
      setContratos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContratos(); }, [fetchContratos]);

  // El listado no trae el historial (sería una consulta por contrato); se pide
  // sólo al abrir el detalle.
  useEffect(() => {
    if (!selected) { setDetalle(null); return; }
    let vigente = true;
    fetch(`/api/contratos/${selected.id}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: ContratoAPI | null) => { if (vigente && data) setDetalle(data); })
      .catch((err) => console.warn("[contratos] no se pudo cargar el detalle", err));
    return () => { vigente = false; };
  }, [selected]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selected) setSelected(null);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [selected]);

  // Fetch store settings for auto-fill
  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          const s: Record<string, string> = {};
          if (data.storeName) s.storeName = data.storeName;
          if (data.ruc) s.ruc = data.ruc;
          if (data.address) s.address = data.address;
          if (data.ownerName) s.ownerName = data.ownerName;
          setStoreSettings(s);
        }
      })
      .catch(() => { /* noop */ });
  }, []);

  // ── Geolocation ────────────────────────────────────────────────────────

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=es`
          );
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || "Pucallpa";
          const state = data.address?.state || "Ucayali";
          setWizardData(p => ({ ...p, CIUDAD: city }));
          setGeoResult(`${city}, ${state}`);
        } catch {
          setWizardData(p => ({ ...p, CIUDAD: "Pucallpa" }));
          setGeoResult("Pucallpa, Ucayali");
        }
        setGeoLoading(false);
      },
      () => {
        setGeoLoading(false);
        setGeoResult(null);
      }
    );
  }, []);

  // ── Computed ──────────────────────────────────────────────────────────

  const filteredContratos = useMemo(() => {
    let list = contratos;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(c => c.clienteNombre.toLowerCase().includes(q) || c.numero.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q));
    }
    if (filterTipo !== "ALL") list = list.filter(c => c.tipo === filterTipo);
    if (filterEstado !== "ALL") list = list.filter(c => estadoVisible(c) === filterEstado);
    return list;
  }, [contratos, debouncedSearch, filterTipo, filterEstado]);

  const totalPages = Math.max(1, Math.ceil(filteredContratos.length / PER_PAGE));
  const paginated = filteredContratos.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => { setPage(1); }, [debouncedSearch, filterTipo, filterEstado]);

  // Stats
  const stats = useMemo(() => {
    const vigentes = contratos.filter(c => estadoVisible(c) === "VIGENTE").length;
    const porVencer = contratos.filter(c => estadoVisible(c) === "POR_VENCER").length;
    const vencidos = contratos.filter(c => estadoVisible(c) === "VENCIDO").length;
    const pendientesFirma = contratos.filter(c => estadoVisible(c) === "PENDIENTE_FIRMA").length;
    // Lo comprometido = lo que sigue en pie. Un contrato anulado o vencido ya no
    // es plata que la bodega deba o vaya a cobrar.
    const montoVigente = contratos
      .filter(c => ["VIGENTE", "POR_VENCER", "PENDIENTE_FIRMA"].includes(estadoVisible(c)))
      .reduce((s, c) => s + (c.monto || 0), 0);

    const byType: Record<string, number> = {};
    contratos.forEach(c => { byType[c.tipo] = (byType[c.tipo] || 0) + 1; });
    const typeData = Object.entries(byType).map(([k, v]) => ({
      name: TIPO_LABELS[k as keyof typeof TIPO_LABELS] || k,
      value: v,
    }));

    const byMonth: Record<string, number> = {};
    contratos.forEach(c => {
      const m = c.createdAt ? c.createdAt.substring(0, 7) : "N/A";
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    const monthData = Object.entries(byMonth).sort().slice(-6).map(([k, v]) => ({ name: k, contratos: v }));

    // Mezclar monedas en un solo total sería mentir; el panel muestra soles y
    // avisa aparte si hay contratos en dólares.
    const hayDolares = contratos.some(c => c.moneda === "USD" && c.monto > 0);

    return { vigentes, porVencer, vencidos, pendientesFirma, montoVigente, hayDolares, typeData, monthData, total: contratos.length };
  }, [contratos]);

  // ── Wizard: Create ────────────────────────────────────────────────────

  const startWizard = (tpl: ContractTemplate) => {
    setSelectedTemplate(tpl);
    setCreateError(null);
    setFieldErrors({});
    setCustomSelectValues({});
    setGeoResult(null);
    setVencimientoManual("");

    // Auto-fill emisor fields from settings + date + city
    const autoData: Record<string, string> = {};
    const autoKeys = new Set<string>();

    tpl.fields.forEach(f => {
      const settingsKey = EMISOR_FIELD_MAP[f.key];
      if (settingsKey && storeSettings[settingsKey]) {
        autoData[f.key] = storeSettings[settingsKey];
        autoKeys.add(f.key);
      }
    });

    // Auto-fill FECHA with today
    const today = new Date().toISOString().slice(0, 10);
    const fechaField = tpl.fields.find(f => f.key === "FECHA");
    if (fechaField) {
      autoData["FECHA"] = today;
      autoKeys.add("FECHA");
    }

    // Auto-fill CIUDAD with Pucallpa
    const ciudadField = tpl.fields.find(f => f.key === "CIUDAD");
    if (ciudadField) {
      autoData["CIUDAD"] = "Pucallpa";
      autoKeys.add("CIUDAD");
    }

    setWizardData(autoData);
    setAutoFilledFields(autoKeys);
    setWizardStep(0);
    setActiveTab("crear");
  };

  const wizardGroups = selectedTemplate ? [
    { id: "emisor", label: "Datos del Emisor", fields: selectedTemplate.fields.filter(f => f.group === "emisor") },
    { id: "contraparte", label: "Datos de la Contraparte", fields: selectedTemplate.fields.filter(f => f.group === "contraparte") },
    { id: "contrato", label: "Datos del Contrato", fields: selectedTemplate.fields.filter(f => f.group === "contrato") },
  ] : [];

  const wizardGroupLabels = ["Datos del Emisor", "Datos de la Contraparte", "Datos del Contrato", "Vista Previa", "Confirmar y Generar"];

  const generateContent = useCallback(() => {
    if (!selectedTemplate) return "";
    return selectedTemplate.clausulas.map(c => fillTemplate(c, wizardData)).join("\n\n");
  }, [selectedTemplate, wizardData]);

  const generateSummary = useCallback(() => {
    if (!selectedTemplate) return "";
    return fillTemplate(selectedTemplate.summaryTemplate, wizardData);
  }, [selectedTemplate, wizardData]);

  const handleCreate = async () => {
    if (!selectedTemplate) return;
    setCreateError(null);

    // Validate required fields
    const missing = selectedTemplate.fields.filter(f => f.required && !wizardData[f.key]?.trim());
    if (missing.length > 0) {
      setCreateError(`Campos requeridos faltantes: ${missing.map(f => f.label).join(", ")}`);
      return;
    }

    setCreating(true);
    try {
      const { nombre: clienteNombre, documento: clienteDoc } = contraparteDelContrato(selectedTemplate, wizardData);
      const monto = montoDelContrato(selectedTemplate, wizardData);

      const content = generateContent();
      const summary = generateSummary();
      const descripcion = `${selectedTemplate.name} — ${summary}`.substring(0, 1999);

      const fecha = inicioDelContrato(wizardData);
      // El vencimiento sale de la fecha de fin o del plazo en meses/años de la
      // plantilla. Antes no se mandaba nunca: todos los contratos quedaban
      // vigentes para siempre y los avisos jamás se disparaban. Si la plantilla
      // no lo define, lo cargó a mano en el último paso.
      const fechaVencimiento =
        vencimientoDelContrato(selectedTemplate, wizardData) || vencimientoManual.trim() || null;

      const clausulasArr = content.split("\n\n").filter(c => c.trim());

      const res = await fetch("/api/contratos", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          // El tipo va tal cual lo declara la plantilla. El mapa viejo aplastaba
          // 12 tipos en 8, así que un NDA se guardaba y se listaba como "Servicios".
          tipo: selectedTemplate.tipo,
          clienteNombre,
          clienteDoc,
          descripcion,
          resumen: summary.substring(0, 1999),
          monto,
          fecha,
          fechaVencimiento,
          plantillaId: selectedTemplate.id,
          lugarFirma: wizardData["CIUDAD"] || "Pucallpa",
          // El texto y los datos del asistente ahora viajan al servidor: antes
          // vivían sólo en el localStorage del navegador que creó el contrato.
          contenido: content,
          datos: wizardData,
          clausulas: clausulasArr.slice(0, 40),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(typeof err.error === "string" ? err.error : JSON.stringify(err.error));
      }
      const creado: ContratoAPI = await res.json();

      setSelectedTemplate(null);
      setWizardData({});
      setVencimientoManual("");
      setWizardStep(0);
      setActiveTab("contratos");
      await fetchContratos();
      // El asistente terminaba tirándote al listado, y definir quién firma o
      // revisar el contrato quedaba como algo que había que descubrir después.
      // Ahora se abre la ficha recién creada, que es donde están el revisor,
      // los firmantes y el envío por WhatsApp, todo seguido.
      setSelected(creado);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  // ── Download Helpers ──────────────────────────────────────────────────

  /**
   * El texto del contrato vive en el servidor. El localStorage queda sólo como
   * rescate de los contratos creados antes de la migración, cuyo texto nunca
   * salió del navegador que los generó.
   */
  const getContractContent = (c: ContratoAPI): { content: string; summary: string } => {
    if (c.contenido?.trim()) return { content: c.contenido, summary: c.resumen || c.descripcion };
    try {
      const raw = localStorage.getItem(`contract-content-${c.id}`);
      if (raw) { const p = JSON.parse(raw); return { content: p.content || "", summary: p.summary || "" }; }
    } catch { /* el rescate es best-effort: si no está, caemos a las cláusulas */ }
    return { content: c.clausulas.join("\n\n"), summary: c.resumen || c.descripcion };
  };

  /**
   * PDF de verdad, armado en el servidor con pdf-lib. Antes esto abría una
   * ventana con HTML y llamaba a `window.print()`: no quedaba archivo, así que
   * el contrato no se podía guardar, firmar ni mandar.
   */
  const downloadPDF = (c: ContratoAPI) => {
    window.open(`/api/contratos/${c.id}/pdf?download=1`, "_blank", "noopener");
  };

  const verPDF = (c: ContratoAPI) => {
    window.open(`/api/contratos/${c.id}/pdf`, "_blank", "noopener");
  };

  /** Deja el contrato archivado en Documentación, con su vencimiento. */
  const archivarEnDrive = async (c: ContratoAPI) => {
    setArchivando(c.id);
    setArchivoError(null);
    try {
      const res = await fetch(`/api/contratos/${c.id}/pdf`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "No se pudo archivar");
      setDetalle(d => (d && d.id === c.id ? { ...d, documentId: json.documentId, hashSha256: json.hash } : d));
      setContratos(prev => prev.map(x => (x.id === c.id ? { ...x, documentId: json.documentId } : x)));
    } catch (e) {
      setArchivoError(e instanceof Error ? e.message : "No se pudo archivar");
    } finally {
      setArchivando(null);
    }
  };

  const downloadWord = (c: ContratoAPI) => {
    const { content, summary } = getContractContent(c);
    const tipoLabel = TIPO_LABELS[c.tipo] || c.tipo;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Contrato ${c.numero}</title>
<style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.6;}h1{text-align:center;font-size:14pt;text-transform:uppercase;}p{text-align:justify;margin:8pt 0;}</style></head>
<body><h1>CONTRATO DE ${tipoLabel.toUpperCase()}</h1><p style="text-align:center;color:#555;">N.o ${c.numero}</p>
${summary ? `<p style="background:#f0f0e0;padding:10px;border-left:4px solid var(--accent);"><b>RESUMEN:</b> ${summary}</p>` : ""}
${content.split("\n\n").map(p => `<p>${p}</p>`).join("")}
<br/><br/><table width="100%"><tr><td width="45%" style="border-top:1px solid #000;text-align:center;padding-top:8px;">PRIMERA PARTE</td><td width="10%"></td><td width="45%" style="border-top:1px solid #000;text-align:center;padding-top:8px;">SEGUNDA PARTE</td></tr></table>
</body></html>`;
    const blob = new Blob(["\ufeff" + html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Contrato_${c.numero}.doc`; a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (c: ContratoAPI) => {
    const { content, summary } = getContractContent(c);
    const text = `CONTRATO N.o ${c.numero}\n\nRESUMEN: ${summary}\n\n${content}`;
    try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
  };

  // ── Renovar ───────────────────────────────────────────────────────────

  /**
   * Crea el contrato sucesor y deja el actual marcado como renovado. Se abre
   * el nuevo para que quede claro qué se firmó y desde cuándo rige.
   */
  const renovarContrato = async (c: ContratoAPI) => {
    setRenovando(true);
    setRenovarError(null);
    try {
      const res = await fetch(`/api/contratos/${c.id}/renovar`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ meses: mesesRenovacion }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "No se pudo renovar");
      await fetchContratos();
      setSelected(json.contrato ?? null);
    } catch (e) {
      setRenovarError(e instanceof Error ? e.message : "No se pudo renovar");
    } finally {
      setRenovando(false);
    }
  };

  // ── Duplicar ──────────────────────────────────────────────────────────

  /**
   * Vuelve a abrir el asistente con los datos del contrato original. Los datos
   * llegan del servidor (`datos`), así que duplicar funciona desde cualquier
   * dispositivo — antes dependía del localStorage del navegador que lo creó.
   */
  const duplicarContrato = (c: ContratoAPI) => {
    const tpl =
      PLANTILLAS.find(t => t.id === c.plantillaId) ??
      PLANTILLAS.find(t => t.tipo === c.tipo);

    let datos: Record<string, string> = c.datos ?? {};
    if (Object.keys(datos).length === 0) {
      try {
        const raw = localStorage.getItem(`contract-content-${c.id}`);
        if (raw) datos = JSON.parse(raw).data ?? {};
      } catch { /* rescate de contratos viejos: si no está, arranca vacío */ }
    }

    if (!tpl) {
      setActiveTab("plantillas");
      setSelected(null);
      return;
    }
    setSelectedTemplate(tpl);
    setWizardData(datos);
    setWizardStep(0);
    setSelected(null);
    setActiveTab("crear");
  };

  // ── Tab definitions ───────────────────────────────────────────────────

  const TABS: AdminTab[] = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "plantillas", label: "Plantillas", icon: BookOpen },
    { id: "contratos", label: "Mis Contratos", icon: FileText },
    { id: "crear", label: "Crear Contrato", icon: Plus },
    { id: "editor", label: "Editor", icon: Edit3 },
  ];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Legal · Documentos"
        title="Contratos"
        description="Gestión legal de contratos con plantillas peruanas."
        icon={FileSignature}
      >
        {contratos.length > 0 && (
          <span className="bg-[var(--surface-sunken)] text-xs px-2.5 py-1 rounded-full font-semibold text-[var(--text-secondary)]">{contratos.length}</span>
        )}
        <button
          onClick={() => setActiveTab("plantillas")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <Plus className="h-4 w-4" />
          Nuevo Contrato
        </button>
      </AdminModuleHeader>

      {/* AdminTabBar, el mismo componente que el resto del panel. Antes esto
          era un segmented control propio: mismo rol que las sub-pestañas de
          Mi Plata o Marketplace pero con otro alto, otro radio y otro estado
          activo, y sin el reorden por arrastre ni la persistencia del último
          tab que el resto sí tiene. */}
      <AdminTabBar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        moduleId={MODULE_ID}
      />

      {/* Loading / Error */}
      {loading && (
        <LoadingState />
      )}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
          <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
          <button onClick={fetchContratos} className="text-xs text-primary hover:underline font-semibold">Reintentar</button>
        </div>
      )}

      {/* Tab Content */}
      {!loading && !error && (
        <AnimatePresence mode="wait">
          <m.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {/* ═══ DASHBOARD ═══ */}
            {activeTab === "dashboard" && (
              <div className="space-y-6">
                {/* KPI Cards — uniform surface; intent solo en icono+valor cuando count > 0 */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {([
                    { label: "Contratos", value: stats.total, icon: FileText, tone: "neutral" as const },
                    { label: "Vigentes", value: stats.vigentes, icon: CheckCircle, tone: "neutral" as const },
                    { label: "Esperando firma", value: stats.pendientesFirma, icon: PenTool, tone: "neutral" as const },
                    { label: "Por vencer", value: stats.porVencer, icon: Clock, tone: (stats.porVencer > 0 ? "warning" : "neutral") as "neutral" | "warning" },
                    { label: "Vencidos", value: stats.vencidos, icon: AlertCircle, tone: (stats.vencidos > 0 ? "danger" : "neutral") as "neutral" | "danger" },
                  ]).map(kpi => {
                    const iconBg =
                      kpi.tone === "warning" ? "bg-[color-mix(in_oklch,var(--data-warning)_12%,transparent)]" :
                      kpi.tone === "danger" ? "bg-[color-mix(in_oklch,var(--data-error)_12%,transparent)]" :
                      "bg-[color-mix(in_oklch,var(--accent)_10%,transparent)]";
                    const iconColor =
                      kpi.tone === "warning" ? "text-[var(--data-warning-500)]" :
                      kpi.tone === "danger" ? "text-[var(--data-error-500)]" :
                      "text-[var(--text-secondary)]";
                    const valueColor =
                      kpi.tone === "warning" ? "text-[var(--data-warning-500)]" :
                      kpi.tone === "danger" ? "text-[var(--data-error-500)]" :
                      "text-[var(--text-primary)]";
                    return (
                      <div key={kpi.label} className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", iconBg)}>
                            <kpi.icon className={cn("h-5 w-5", iconColor)} />
                          </div>
                          <div>
                            <p className={cn("text-2xl font-bold tabular-nums", valueColor)}>{kpi.value}</p>
                            <p className="text-xs text-[var(--text-tertiary)]">{kpi.label}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Plata comprometida — sólo lo que sigue en pie */}
                <div className="bg-[var(--brand-ink)] rounded-lg p-6 text-[var(--surface-canvas)]">
                  <p className="text-sm opacity-80">Plata comprometida en contratos vigentes</p>
                  <p className="text-3xl font-bold mt-1">{formatMoney(stats.montoVigente)}</p>
                  {stats.hayDolares && (
                    <p className="text-xs opacity-70 mt-1">
                      Hay contratos en dólares: se muestran aparte en cada ficha, no se suman acá.
                    </p>
                  )}
                </div>

                {/* Charts Row */}
                {/* Gráficos sin datos NO se muestran; cada card se oculta si su serie está vacía */}
                {(stats.typeData.length > 0 || stats.monthData.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Por tipo */}
                  {stats.typeData.length > 0 && (
                  <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
                    <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Contratos por Tipo</CardTitle>
                    <ResponsiveContainer minWidth={0} width="100%" height={250}>
                      <RechartsPie>
                        <Pie data={stats.typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                          {stats.typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                  )}

                  {/* Por mes */}
                  {stats.monthData.length > 0 && (
                  <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
                    <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Contratos por Mes</CardTitle>
                    <ResponsiveContainer minWidth={0} width="100%" height={250}>
                      <BarChart data={stats.monthData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" fontSize={11} />
                        <YAxis fontSize={11} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="contratos" fill="var(--brand-ink)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  )}
                </div>
                )}

                {/* Contratos por vencer */}
                {stats.porVencer > 0 && (
                  <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/50 rounded-xl p-4">
                    <CardTitle className="text-sm font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4" /> Contratos por vencer (30 dias)
                    </CardTitle>
                    <div className="space-y-2">
                      {contratos.filter(c => estadoVisible(c) === "POR_VENCER").slice(0, 5).map(c => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{c.clienteNombre} — {c.numero} — vence {formatDatePeru(c.fechaVencimiento!)}</span>
                          <button onClick={() => { setSelected(c); }} className="px-2 py-1 rounded-lg bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/40 text-[var(--data-warning-500)] font-bold hover:bg-[var(--data-warning-500)] transition-colors">
                            Ver
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ PLANTILLAS ═══ */}
            {activeTab === "plantillas" && (
              <div className="space-y-6">
                <p className="text-sm text-[var(--text-secondary)]">Selecciona una plantilla para crear un contrato con clausulas legales peruanas reales.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {PLANTILLAS.map(tpl => (
                    <m.div
                      key={tpl.id}
                      whileHover={{ scale: 1.02 }}
                      className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-lg p-4 cursor-pointer hover:border-primary hover:shadow-[var(--shadow-lg)] transition-all group"
                      onClick={() => startWizard(tpl)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors text-[var(--accent-ink)] dark:text-[var(--accent)]">
                          <TemplateIcon icon={tpl.icon} className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-[var(--text-primary)]">{tpl.name}</h4>
                          <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{tpl.description}</p>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="text-[length:var(--ts-2xs)] px-2 py-0.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] font-bold">{tpl.category}</span>
                            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{tpl.fields.length} campos</span>
                            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{tpl.clausulas.length} clausulas</span>
                          </div>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1 italic">{tpl.legalBasis}</p>
                        </div>
                      </div>
                    </m.div>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ MIS CONTRATOS ═══ */}
            {activeTab === "contratos" && (
              <div className="space-y-6">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                    <input
                      type="text"
                      placeholder="Buscar por cliente, número..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="ALL">Todos los tipos</option>
                    {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="ALL">Todos los estados</option>
                    <option value="VIGENTE">Vigentes</option>
                    <option value="POR_VENCER">Por vencer</option>
                    <option value="VENCIDO">Vencidos</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setViewMode("cards")} className={cn("p-2 rounded-lg transition-colors", viewMode === "cards" ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-white/5 text-[var(--text-secondary)]")}><LayoutGrid className="h-4 w-4" /></button>
                    <button onClick={() => setViewMode("list")} className={cn("p-2 rounded-lg transition-colors", viewMode === "list" ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-white/5 text-[var(--text-secondary)]")}><List className="h-4 w-4" /></button>
                  </div>
                </div>

                {filteredContratos.length === 0 ? (
                  <div className="text-center py-16">
                    <FileText className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
                    <CardTitle className="text-lg font-semibold text-[var(--text-primary)] mb-2">Sin contratos</CardTitle>
                    <p className="text-sm text-[var(--text-secondary)] mb-6">Crea tu primer contrato desde una plantilla</p>
                    <button onClick={() => setActiveTab("plantillas")} className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-dark">Ver Plantillas</button>
                  </div>
                ) : viewMode === "cards" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {paginated.map(c => {
                      const estado = estadoVisible(c);
                      const dias = diasParaVencer(c.fechaVencimiento);
                      const borderColor = estado === "VENCIDO" ? "border-l-red-500" : estado === "POR_VENCER" ? "border-l-amber-500" : "border-l-emerald-500";
                      return (
                        <div
                          key={c.id}
                          {...activateProps(() => setSelected(c))}
                          className={cn("bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-lg  hover:shadow-[var(--shadow-lg)] transition-all cursor-pointer border-l-4", borderColor)}
                        >
                          <div className="p-4 space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-[var(--text-tertiary)] font-mono">{c.numero}</p>
                                <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{TIPO_LABELS[c.tipo] || c.tipo}</p>
                              </div>
                              <span className={cn("px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold shrink-0 ml-2", ESTADO_STYLES[estado])}>
                                {ESTADO_VISIBLE_LABELS[estado]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-secondary/20 flex items-center justify-center shrink-0"><User className="h-3.5 w-3.5 text-secondary" /></div>
                              <div className="min-w-0">
                                <p className="text-sm text-[var(--text-secondary)] truncate">{c.clienteNombre}</p>
                                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.clienteDoc}</p>
                              </div>
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] space-y-0.5">
                              <p>Fecha: {formatDatePeru(c.fechaInicio || c.createdAt)}</p>
                              {c.fechaVencimiento && <p>Vence: {formatDatePeru(c.fechaVencimiento)} {dias !== null && dias >= 0 ? `(${dias}d)` : dias !== null ? `(hace ${Math.abs(dias)}d)` : ""}</p>}
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-[var(--rule-soft)] dark:border-white/5">
                              <p className="text-sm font-bold text-primary">{formatMoney(c.monto, c.moneda)}</p>
                              <div className="flex gap-1">
                                <button onClick={e => { e.stopPropagation(); downloadPDF(c); }} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 text-[var(--text-tertiary)] hover:text-primary transition-colors" title="PDF"><Printer className="h-3.5 w-3.5" /></button>
                                <button onClick={e => { e.stopPropagation(); downloadWord(c); }} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] transition-colors" title="Word"><Download className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--rule-soft)] dark:border-white/5 text-left">
                            <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)]">N.o</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)]">Cliente</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] hidden sm:table-cell">Tipo</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-right">Monto</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] hidden md:table-cell">Fecha</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] hidden lg:table-cell">Estado</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)]">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map(c => {
                            const estado = estadoVisible(c);
                            return (
                              <tr key={c.id} onClick={() => setSelected(c)} className="border-b border-[var(--rule-soft)] dark:border-white/5 hover:bg-[var(--surface-alt)] dark:hover:bg-white/5 cursor-pointer transition-colors">
                                <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{c.numero}</td>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-[var(--text-primary)] truncate">{c.clienteNombre}</p>
                                  <p className="text-xs text-[var(--text-tertiary)]">{c.clienteDoc}</p>
                                </td>
                                <td className="px-4 py-3 hidden sm:table-cell">
                                  <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-[var(--surface-sunken)] dark:bg-white/5 text-[var(--text-secondary)]">{TIPO_LABELS[c.tipo] || c.tipo}</span>
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">{formatMoney(c.monto, c.moneda)}</td>
                                <td className="px-4 py-3 text-[var(--text-secondary)] hidden md:table-cell">{formatDatePeru(c.fechaInicio || c.createdAt)}</td>
                                <td className="px-4 py-3 hidden lg:table-cell">
                                  <span className={cn("px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold", ESTADO_STYLES[estado])}>{ESTADO_VISIBLE_LABELS[estado]}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-1">
                                    <button onClick={e => { e.stopPropagation(); downloadPDF(c); }} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 text-[var(--text-tertiary)]" title="PDF"><Printer className="h-4 w-4" /></button>
                                    <button onClick={e => { e.stopPropagation(); downloadWord(c); }} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 text-[var(--text-tertiary)]" title="Word"><Download className="h-4 w-4" /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--text-secondary)]">{filteredContratos.length} contrato{filteredContratos.length !== 1 ? "s" : ""} — Pag. {page}/{totalPages}</p>
                    <div className="flex gap-1">
                      <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                      <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ CREAR CONTRATO (WIZARD) ═══ */}
            {activeTab === "crear" && (
              <div className="space-y-6">
                {!selectedTemplate ? (
                  <div className="text-center py-16">
                    <BookOpen className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
                    <CardTitle className="text-lg font-semibold text-[var(--text-primary)] mb-2">Selecciona una plantilla</CardTitle>
                    <p className="text-sm text-[var(--text-secondary)] mb-6">Ve a la pestana &quot;Plantillas&quot; para elegir una plantilla legal</p>
                    <button onClick={() => setActiveTab("plantillas")} className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-dark">Ver Plantillas</button>
                  </div>
                ) : (
                  <>
                    {/* Wizard Header */}
                    <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-[var(--accent-ink)] dark:text-[var(--accent)]">
                          <TemplateIcon icon={selectedTemplate.icon} className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">{selectedTemplate.name}</CardTitle>
                          <p className="text-xs text-[var(--text-tertiary)]">{selectedTemplate.legalBasis}</p>
                        </div>
                        <button onClick={() => { setSelectedTemplate(null); setWizardStep(0); setWizardData({}); }} className="ml-auto text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Step Indicators */}
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {wizardGroupLabels.map((label, i) => (
                          <button
                            key={i}
                            onClick={() => setWizardStep(i)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                              wizardStep === i ? "bg-primary text-white" : wizardStep > i ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "bg-[var(--surface-sunken)] dark:bg-white/5 text-[var(--text-tertiary)]"
                            )}
                          >
                            <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold",
                              wizardStep === i ? "bg-white/20 text-white" : wizardStep > i ? "bg-primary text-white" : "bg-[var(--rule-soft)] dark:bg-white/10 text-[var(--text-secondary)]"
                            )}>
                              {wizardStep > i ? <CheckCircle className="h-3 w-3" /> : i + 1}
                            </span>
                            <span className="hidden sm:inline">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {(() => {
                      const allFields = selectedTemplate.fields;
                      const totalRequired = allFields.filter(f => f.required).length;
                      const filledRequired = allFields.filter(f => f.required && wizardData[f.key]?.trim()).length;
                      const progress = totalRequired > 0 ? Math.round((filledRequired / totalRequired) * 100) : 0;
                      return (
                        <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-[var(--text-secondary)]">Progreso del contrato</span>
                            <span className="text-xs font-bold text-[var(--text-primary)]">{filledRequired} de {totalRequired} campos completados ({progress}%)</span>
                          </div>
                          <div className="relative h-3 bg-[var(--rule-soft)] dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-[var(--dur-slow)]", progress === 100 ? "bg-primary/10" : progress >= 60 ? "bg-primary" : "bg-secondary")}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Wizard Steps 0-2: Form Fields */}
                    {wizardStep < 3 && (
                      <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-6 space-y-4">
                        <h4 className="text-sm font-bold text-[var(--text-primary)]">{wizardGroupLabels[wizardStep]}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {wizardGroups[wizardStep]?.fields.map(field => {
                            // Determine if field should be a select with options
                            const isCargoField = field.key === "CARGO" && field.type === "text";
                            const isLugarEntrega = field.key === "LUGAR_ENTREGA" && field.type === "text";
                            const effectiveType = (isCargoField || isLugarEntrega) ? "smart-select" : field.type;
                            const selectOptions = isCargoField ? CARGO_OPTIONS : isLugarEntrega ? LUGAR_ENTREGA_OPTIONS : field.options;

                            const hasTooltip = LEGAL_TOOLTIPS[field.key];
                            const isAutoFilled = autoFilledFields.has(field.key) && wizardData[field.key];
                            const validationError = fieldErrors[field.key];
                            const isCiudadField = field.key === "CIUDAD";

                            // Check if current select value is "Otro (escribir)"
                            const currentVal = wizardData[field.key] || "";
                            const isOtroSelected = (effectiveType === "smart-select" || field.type === "select") && currentVal === "Otro (escribir)";

                            return (
                              <div key={field.key} className={(field.type === "textarea") ? "sm:col-span-2" : ""}>
                                <label className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] mb-1">
                                  {field.label} {field.required && <span className="text-[var(--data-error-500)]">*</span>}
                                  {hasTooltip && <LegalTooltip term={field.label} explanation={hasTooltip.explanation} example={hasTooltip.example} />}
                                  {isAutoFilled && (
                                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                                      Auto-completado
                                    </span>
                                  )}
                                </label>

                                {/* Ciudad field with geolocation button */}
                                {isCiudadField && (
                                  <div className="flex gap-2 mb-1">
                                    <input
                                      type="text"
                                      value={wizardData[field.key] || ""}
                                      onChange={e => {
                                        setWizardData(p => ({ ...p, [field.key]: e.target.value }));
                                        setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                      }}
                                      placeholder={field.placeholder}
                                      className={cn(
                                        "flex-1 px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30",
                                        isAutoFilled ? "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15" : "border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5"
                                      )}
                                    />
                                    <button
                                      type="button"
                                      onClick={detectLocation}
                                      disabled={geoLoading}
                                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-primary/10 hover:bg-primary/10 disabled:opacity-50 transition-colors shrink-0"
                                    >
                                      {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                                      Detectar
                                    </button>
                                  </div>
                                )}
                                {isCiudadField && geoResult && (
                                  <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] flex items-center gap-1 mt-0.5 mb-1">
                                    <MapPin className="h-3 w-3" /> Ubicacion detectada: {geoResult}
                                  </p>
                                )}

                                {/* Smart select (CARGO, LUGAR_ENTREGA) */}
                                {!isCiudadField && effectiveType === "smart-select" && (
                                  <>
                                    <select
                                      value={isOtroSelected ? "Otro (escribir)" : (selectOptions?.includes(currentVal) ? currentVal : (currentVal && !selectOptions?.includes(currentVal) ? "Otro (escribir)" : ""))}
                                      onChange={e => {
                                        const v = e.target.value;
                                        if (v === "Otro (escribir)") {
                                          setWizardData(p => ({ ...p, [field.key]: "Otro (escribir)" }));
                                          setCustomSelectValues(p => ({ ...p, [field.key]: "" }));
                                        } else {
                                          setWizardData(p => ({ ...p, [field.key]: v }));
                                          setCustomSelectValues(p => { const n = { ...p }; delete n[field.key]; return n; });
                                        }
                                        setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                      }}
                                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    >
                                      <option value="">Seleccionar...</option>
                                      {selectOptions?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    {(isOtroSelected || (currentVal && !selectOptions?.includes(currentVal) && currentVal !== "Otro (escribir)")) && (
                                      <input
                                        type="text"
                                        value={currentVal === "Otro (escribir)" ? (customSelectValues[field.key] || "") : currentVal}
                                        onChange={e => {
                                          const v = e.target.value;
                                          setCustomSelectValues(p => ({ ...p, [field.key]: v }));
                                          setWizardData(p => ({ ...p, [field.key]: v || "Otro (escribir)" }));
                                        }}
                                        placeholder="Escriba el valor personalizado..."
                                        className="w-full mt-2 px-3 py-2 rounded-lg border border-secondary/50 bg-secondary/5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-secondary/30"
                                      />
                                    )}
                                  </>
                                )}

                                {/* Original select fields */}
                                {!isCiudadField && effectiveType !== "smart-select" && field.type === "select" && (
                                  <select
                                    value={wizardData[field.key] || ""}
                                    onChange={e => {
                                      setWizardData(p => ({ ...p, [field.key]: e.target.value }));
                                      setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                    }}
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  >
                                    <option value="">Seleccionar...</option>
                                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                )}

                                {/* Textarea */}
                                {!isCiudadField && field.type === "textarea" && (
                                  <textarea
                                    value={wizardData[field.key] || ""}
                                    onChange={e => {
                                      setWizardData(p => ({ ...p, [field.key]: e.target.value }));
                                      setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                    }}
                                    placeholder={field.placeholder}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                                  />
                                )}

                                {/* Standard inputs (text, number, date) */}
                                {!isCiudadField && effectiveType !== "smart-select" && field.type !== "select" && field.type !== "textarea" && (
                                  <input
                                    type={field.type}
                                    value={wizardData[field.key] || ""}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setWizardData(p => {
                                        const next = { ...p, [field.key]: val };
                                        // Auto-generate PRECIO_LETRAS / MONTO_LETRAS
                                        if ((field.key === "PRECIO_TOTAL" || field.key === "MONTO_PRESTAMO") && val) {
                                          const num = parseFloat(val);
                                          if (!isNaN(num) && num > 0) {
                                            const letrasKey = field.key === "PRECIO_TOTAL" ? "PRECIO_LETRAS" : "MONTO_LETRAS";
                                            next[letrasKey] = numberToWords(num);
                                          }
                                        }
                                        return next;
                                      });
                                      setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                      // Validate on change
                                      const err = validateField(field.key, val, wizardData);
                                      setFieldErrors(prev => {
                                        const next = { ...prev };
                                        if (err) next[field.key] = err; else delete next[field.key];
                                        return next;
                                      });
                                    }}
                                    placeholder={field.placeholder}
                                    step={field.type === "number" ? "0.01" : undefined}
                                    className={cn(
                                      "w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30",
                                      isAutoFilled && !isCiudadField ? "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15" : validationError ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10" : "border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5"
                                    )}
                                  />
                                )}

                                {/* Validation error */}
                                {validationError && (
                                  <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mt-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3 shrink-0" /> {validationError}
                                  </p>
                                )}

                                {/* Auto-generated letras preview */}
                                {(field.key === "PRECIO_LETRAS" || field.key === "MONTO_LETRAS") && wizardData[field.key] && (
                                  <p className="text-[length:var(--ts-2xs)] text-primary dark:text-[var(--data-success-500)] mt-1 flex items-center gap-1">
                                    <Info className="h-3 w-3 shrink-0" /> Auto-generado del monto numerico
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Step 3: Preview */}
                    {wizardStep === 3 && (
                      <div className="space-y-6">
                        {/* Summary Card */}
                        <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Scale className="h-4 w-4 text-primary" />
                            <h4 className="text-sm font-bold text-primary">Resumen en Lenguaje Simple</h4>
                          </div>
                          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{generateSummary()}</p>
                        </div>

                        {/* Full Document Preview — with highlighted filled fields */}
                        <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-6 sm:p-8 max-h-[60vh] overflow-y-auto">
                          <div className="max-w-[680px] mx-auto font-serif" ref={printRef}>
                            <SectionTitle className="text-center text-base font-bold mb-1">
                              CONTRATO DE {selectedTemplate.name.toUpperCase()}
                            </SectionTitle>
                            <p className="text-center text-xs text-[var(--text-tertiary)] mb-6">{selectedTemplate.legalBasis}</p>
                            <div className="border-t-2 border-double border-[var(--rule-strong)] mb-6" />
                            {selectedTemplate.clausulas.map((clause, i) => {
                              // Replace {{KEY}} with highlighted spans for filled data
                              const parts = clause.split(/(\{\{\w+\}\})/g);
                              return (
                                <p key={i} className="text-sm text-[var(--text-secondary)] mb-4 text-justify leading-relaxed">
                                  {parts.map((part, j) => {
                                    const match = part.match(/^\{\{(\w+)\}\}$/);
                                    if (match) {
                                      const key = match[1];
                                      const val = wizardData[key];
                                      if (val) {
                                        return <span key={j} className="bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] px-0.5 rounded font-semibold">{val}</span>;
                                      }
                                      return <span key={j} className="bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] px-0.5 rounded">[{key}]</span>;
                                    }
                                    return <span key={j}>{part}</span>;
                                  })}
                                </p>
                              );
                            })}
                            <div className="mt-12 flex justify-between gap-8">
                              <div className="flex-1 text-center">
                                <div className="border-t border-[var(--rule-strong)] mt-16 pt-2 text-xs text-[var(--text-secondary)]">PRIMERA PARTE</div>
                              </div>
                              <div className="flex-1 text-center">
                                <div className="border-t border-[var(--rule-strong)] mt-16 pt-2 text-xs text-[var(--text-secondary)]">SEGUNDA PARTE</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Preview legend */}
                        <div className="flex items-center gap-4 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 border border-[var(--data-warning-500)]" /> Campos completados</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 border border-[var(--data-error-500)]" /> Campos pendientes</span>
                        </div>
                      </div>
                    )}

                    {/* Step 4: Confirm */}
                    {wizardStep === 4 && (
                      <div className="space-y-6">
                        <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-6 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center text-white">
                              <CheckCircle className="h-6 w-6" />
                            </div>
                            <div>
                              <h4 className="text-base font-bold text-[var(--text-primary)]">Confirmar Contrato</h4>
                              <p className="text-xs text-[var(--text-secondary)]">{selectedTemplate.name} — {selectedTemplate.legalBasis}</p>
                            </div>
                          </div>

                          {/* Data Summary */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedTemplate.fields.filter(f => wizardData[f.key]).map(f => (
                              <div key={f.key} className="p-2 bg-[var(--surface-alt)] dark:bg-white/5 rounded-lg">
                                <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">{f.label}</p>
                                <p className="text-sm text-[var(--text-secondary)] truncate">{wizardData[f.key]}</p>
                              </div>
                            ))}
                          </div>

                          <div className="bg-primary/5 dark:bg-primary/10 rounded-xl p-4">
                            <p className="text-sm text-[var(--text-secondary)]">{generateSummary()}</p>
                          </div>

                          {/* Cuándo deja de valer. Si la plantilla no lo pide (ni fecha
                              de fin ni plazo), acá se pregunta en vez de guardar el
                              contrato sin vencimiento y que nadie te avise nunca. */}
                          {(() => {
                            const delaPlantilla = vencimientoDelContrato(selectedTemplate, wizardData);
                            if (delaPlantilla) {
                              return (
                                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                  <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                                  Vence el <strong className="text-[var(--text-primary)]">{formatDatePeru(delaPlantilla)}</strong>.
                                  Te vamos a avisar 30 días antes.
                                </div>
                              );
                            }
                            return (
                              <div className="rounded-xl border border-[var(--rule-base)] dark:border-white/10 p-3 space-y-2">
                                <label className="block text-sm font-semibold text-[var(--text-primary)]" htmlFor="venc-manual">
                                  ¿Hasta cuándo vale este contrato?
                                </label>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  Esta plantilla no pide fecha de término. Si la cargás, te avisamos
                                  30 días antes de que venza; si la dejás vacía, no te avisa nadie.
                                </p>
                                <input
                                  id="venc-manual"
                                  type="date"
                                  value={vencimientoManual}
                                  min={inicioDelContrato(wizardData)}
                                  onChange={e => setVencimientoManual(e.target.value)}
                                  className="w-full sm:w-auto px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5 text-sm text-[var(--text-primary)]"
                                />
                              </div>
                            );
                          })()}

                          {createError && <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold bg-[var(--data-error-50)] dark:bg-red-950/20 p-3 rounded-lg">{createError}</p>}
                        </div>
                      </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => wizardStep > 0 ? setWizardStep(s => s - 1) : setSelectedTemplate(null)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 transition-colors"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        {wizardStep === 0 ? "Cancelar" : "Anterior"}
                      </button>
                      <div className="flex gap-2">
                        {wizardStep < 4 && (
                          <button
                            onClick={() => setWizardStep(s => s + 1)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors"
                          >
                            Siguiente
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                        {wizardStep === 4 && (
                          <button
                            onClick={handleCreate}
                            disabled={creating}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
                          >
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar Contrato
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ═══ EDITOR ═══ */}
            {activeTab === "editor" && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Editor de Plantillas</CardTitle>
                  <select
                    value={editorTemplate?.id || ""}
                    onChange={e => {
                      const tpl = PLANTILLAS.find(p => p.id === e.target.value);
                      if (tpl) {
                        setEditorTemplate(tpl);
                        setEditorText(tpl.clausulas.join("\n\n"));
                        setEditorPreview(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Seleccionar plantilla...</option>
                    {PLANTILLAS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {editorTemplate && (
                    <button
                      onClick={() => setEditorPreview(!editorPreview)}
                      className={cn("flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors",
                        editorPreview ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-white/5 text-[var(--text-secondary)]"
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" /> {editorPreview ? "Editando" : "Preview"}
                    </button>
                  )}
                </div>

                {!editorTemplate ? (
                  <div className="text-center py-12">
                    <Edit3 className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
                    <p className="text-sm text-[var(--text-secondary)]">Selecciona una plantilla para editar sus clausulas</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Editor */}
                    <div className="space-y-3">
                      <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
                        <p className="text-xs font-bold text-[var(--text-secondary)] mb-2">Campos disponibles (clic para insertar):</p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {editorTemplate.fields.map(f => (
                            <button
                              key={f.key}
                              onClick={() => setEditorText(prev => prev + ` {{${f.key}}}`)}
                              className="px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/20 transition-colors"
                            >
                              {`{{${f.key}}}`}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={editorText}
                          onChange={e => setEditorText(e.target.value)}
                          rows={20}
                          className="w-full px-4 py-3 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-alt)] dark:bg-white/5 text-sm text-[var(--text-primary)] font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                          placeholder="Escribe o edita las clausulas del contrato..."
                        />
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-6 max-h-[70vh] overflow-y-auto">
                      <h4 className="text-sm font-bold text-[var(--text-primary)] mb-4">Vista Previa</h4>
                      <div className="font-serif space-y-3">
                        {editorText.split("\n\n").filter(p => p.trim()).map((para, i) => (
                          <p key={i} className="text-sm text-[var(--text-secondary)] text-justify leading-relaxed">
                            {para.replace(/\{\{(\w+)\}\}/g, (_, key) => {
                              const field = editorTemplate.fields.find(f => f.key === key);
                              return `[${field?.label || key}]`;
                            })}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </m.div>
        </AnimatePresence>
      )}

      {/* ═══ CONTRACT DETAIL SHEET ═══ */}
      <AnimatePresence>
        {selected && (
          <>
            <m.div key="ct-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" style={{ zIndex: 40 }} onClick={() => setSelected(null)} />
            <m.div
              key="ct-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[var(--surface-raised)] dark:bg-[#1a1a2e] border-l border-[var(--rule-base)] dark:border-white/10 overflow-y-auto"
            >
              <div className="p-4 sm:p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Contrato {selected.numero}</CardTitle>
                    <p className="text-xs text-[var(--text-tertiary)]">{TIPO_LABELS[selected.tipo] || selected.tipo}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5">
                    <X className="h-5 w-5 text-[var(--text-secondary)]" />
                  </button>
                </div>

                {/* Summary Card */}
                {(() => {
                  const { summary } = getContractContent(selected);
                  if (!summary) return null;
                  return (
                    <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Scale className="h-4 w-4 text-primary" />
                        <h4 className="text-xs font-bold text-primary uppercase">Resumen</h4>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{summary}</p>
                    </div>
                  );
                })()}

                {/* Estado Badge */}
                <div className="flex items-center gap-2">
                  <span className={cn("px-3 py-1 rounded-lg text-xs font-bold", ESTADO_STYLES[estadoVisible(selected)])}>
                    {ESTADO_VISIBLE_LABELS[estadoVisible(selected)]}
                  </span>
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-[var(--surface-sunken)] dark:bg-white/5 text-[var(--text-secondary)]">
                    {TIPO_LABELS[selected.tipo] || selected.tipo}
                  </span>
                </div>

                {/* Parties */}
                <div className="bg-[var(--surface-alt)] dark:bg-white/5 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="font-bold text-[var(--text-primary)]">{selected.clienteNombre}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{selected.clienteDoc}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--rule-base)] dark:border-white/10">
                    <div><p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Monto</p><p className="text-sm font-bold text-primary">{formatMoney(selected.monto, selected.moneda)}</p></div>
                    <div><p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Fecha</p><p className="text-sm text-[var(--text-secondary)]">{formatDatePeru(selected.fechaInicio || selected.createdAt)}</p></div>
                  </div>

                  {/* Vigencia Timeline */}
                  {selected.fechaVencimiento && (() => {
                    const inicio = new Date(selected.fechaInicio || selected.createdAt).getTime();
                    const vence = new Date(selected.fechaVencimiento).getTime();
                    const hoy = Date.now();
                    const total = vence - inicio;
                    const progreso = total > 0 ? Math.max(0, Math.min(((hoy - inicio) / total) * 100, 100)) : 0;
                    const diasRestantes = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
                    const barColor = progreso >= 100 ? "bg-[var(--data-error-500)]" : progreso > 80 ? "bg-[var(--data-warning-500)]" : "bg-primary";
                    return (
                      <div className="pt-3 border-t border-[var(--rule-base)] dark:border-white/10 space-y-1.5">
                        <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Vigencia</p>
                        <div className="relative h-2.5 bg-[var(--rule-soft)] dark:bg-white/10 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${progreso}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                          <span>{formatDatePeru(selected.fechaInicio || selected.createdAt)}</span>
                          <span className="font-bold">{diasRestantes > 0 ? `${diasRestantes} dias restantes` : diasRestantes === 0 ? "Vence hoy" : `Vencido hace ${Math.abs(diasRestantes)}d`}</span>
                          <span>{formatDatePeru(selected.fechaVencimiento)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Clausulas */}
                {selected.clausulas.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)] mb-3">Clausulas</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {selected.clausulas.map((c, i) => (
                        <div key={i} className="p-3 bg-[var(--surface-alt)] dark:bg-white/5 rounded-xl text-sm text-[var(--text-secondary)] text-justify leading-relaxed">
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Qué pasó con este contrato — historial real, guardado en el servidor */}
                {detalle?.eventos && detalle.eventos.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4" /> Qué pasó con este contrato
                      <span className="text-[length:var(--ts-2xs)] bg-[var(--surface-sunken)] dark:bg-white/10 px-2 py-0.5 rounded-full">{detalle.eventos.length}</span>
                    </h4>
                    <ol className="space-y-1.5 border-l-2 border-[var(--rule-soft)] pl-3">
                      {detalle.eventos.map(ev => (
                        <li key={ev.id} className="text-xs">
                          <p className="font-semibold text-[var(--text-primary)]">{EVENTO_LABELS[ev.tipo] ?? ev.tipo}</p>
                          {ev.detalle && <p className="text-[var(--text-secondary)]">{ev.detalle}</p>}
                          <p className="text-[var(--text-tertiary)]">
                            {new Date(ev.createdAt).toLocaleString("es-PE")}{ev.actor ? ` · ${ev.actor}` : ""}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Con quién es de verdad: atado a su ficha, no texto suelto */}
                <VinculoContraparte
                  contratoId={selected.id}
                  clienteNombre={selected.clienteNombre}
                  customerId={(detalle ?? selected).customerId}
                  supplierId={(detalle ?? selected).supplierId}
                  onVinculado={(patch) => {
                    setDetalle(d => (d ? { ...d, ...patch } : d));
                    setContratos(prev => prev.map(c => (c.id === selected.id ? { ...c, ...patch } : c)));
                  }}
                />

                {/* Revisor de cláusulas */}
                <PanelRevision
                  contratoId={selected.id}
                  revision={(detalle ?? selected).revisionIa}
                  onRevisado={rev => setDetalle(d => (d ? { ...d, revisionIa: rev } : d))}
                />

                {/* Firmantes y links de firma */}
                <PanelFirmantes contrato={detalle ?? selected} onCambio={fetchContratos} />

                {/* Renovar: sólo tiene sentido cuando el contrato tiene un final a la vista */}
                {["VIGENTE", "POR_VENCER", "VENCIDO"].includes(estadoVisible(selected)) && (
                  <div className="p-3 rounded-xl bg-[var(--surface-alt)] dark:bg-white/5 space-y-2">
                    <p className="text-xs text-[var(--text-secondary)]">
                      Renovar crea un contrato nuevo con las mismas condiciones y las fechas corridas.
                      El actual queda archivado como renovado, sin perder qué estuvo vigente y cuándo.
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        value={mesesRenovacion}
                        onChange={e => setMesesRenovacion(Number(e.target.value))}
                        className="px-2.5 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)] dark:bg-white/5 text-xs text-[var(--text-primary)]"
                        aria-label="Meses de renovación"
                      >
                        {[3, 6, 12, 24, 36].map(m => (
                          <option key={m} value={m}>{m} meses</option>
                        ))}
                      </select>
                      <button
                        onClick={() => renovarContrato(selected)}
                        disabled={renovando}
                        // Renovar es constructivo: en coral lleno se leía como
                        // una acción destructiva, justo al lado del badge rojo
                        // de "Vencido".
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] border-2 border-primary/40 hover:bg-primary/10 transition-colors disabled:opacity-60"
                      >
                        {renovando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                        Renovar contrato
                      </button>
                    </div>
                    {renovarError && <p className="text-xs text-[var(--data-error-500)]">{renovarError}</p>}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => verPDF(selected)} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors">
                      <Eye className="h-4 w-4" /> Ver PDF
                    </button>
                    <button onClick={() => downloadPDF(selected)} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10 transition-colors">
                      <Download className="h-4 w-4" /> Descargar
                    </button>
                  </div>

                  {/* Guardar en el drive: de ahí salen la búsqueda, la IA, los permisos y el aviso de vencimiento */}
                  <button
                    onClick={() => archivarEnDrive(selected)}
                    disabled={archivando === selected.id}
                    // En dark el brand-ink es casi negro: sin borde el botón se
                    // funde con el panel y parece un hueco, no una acción.
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--brand-ink)] border border-transparent dark:border-white/20 hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {archivando === selected.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Save className="h-4 w-4" />}
                    {(detalle?.documentId ?? selected.documentId)
                      ? "Actualizar en Documentación"
                      : "Guardar en Documentación"}
                  </button>
                  {(detalle?.documentId ?? selected.documentId) && (
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center">
                      Archivado en Documentación · se busca por su texto, la IA lo lee y te avisa antes de que venza.
                    </p>
                  )}
                  {archivoError && (
                    <p className="text-xs text-[var(--data-error-500)] text-center">{archivoError}</p>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => downloadWord(selected)} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] dark:bg-white/5 hover:bg-[var(--rule-soft)] transition-colors">
                      <FileText className="h-3.5 w-3.5" /> Word
                    </button>
                    <button onClick={() => copyToClipboard(selected)} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] dark:bg-white/5 hover:bg-[var(--rule-soft)] transition-colors">
                      <ClipboardCopy className="h-3.5 w-3.5" /> Copiar
                    </button>
                    <button onClick={() => duplicarContrato(selected)} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold text-secondary bg-secondary/10 hover:bg-secondary/20 transition-colors">
                      <Copy className="h-3.5 w-3.5" /> Duplicar
                    </button>
                  </div>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
