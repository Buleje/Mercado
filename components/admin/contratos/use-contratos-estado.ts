import { useState, useRef, useId } from "react";
import { type ContratoAPI, type TabId, MODULE_ID, CONTRATOS_VISTAS } from "./constantes-contratos";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useContratoParaPersona } from "@/components/admin/contratos/contrato-para-persona";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import type { ContractTemplate } from "@/lib/contratos/plantillas";
export function useContratosEstado() {
  // -- Data from API
  const [contratos, setContratos] = useState<ContratoAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -- UI
  // Recuerda el último tab, igual que los hubs y Mi Plata: entrar a Contratos
  // y caer siempre en Dashboard obligaba a re-navegar en cada visita.
  const { vista: activeTab, irA: setActiveTab } = useSubvistaModulo<TabId>(
    MODULE_ID,
    CONTRATOS_VISTAS,
    // Lo que se abre es la lista (11-10): antes, el tablero de cifras, que
    // ahora vive en «Indicadores». `?sub=dashboard` sigue llevando al resumen.
    "contratos",
  );
  // «Hacer contrato» desde Equipo › Personal llega con `?colaborador=<id>`:
  // sus datos se precargan en la plantilla y el contrato queda ligado a ella.
  const paraPersona = useContratoParaPersona();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  const [filterTipo, setFilterTipo] = useState<string>("ALL");
  const [filterEstado, setFilterEstado] = useState<string>("ALL");

  // -- Contract detail
  const [selected, setSelected] = useState<ContratoAPI | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelTitleId = useId();
  // El propio Escape de arriba ya cierra el panel — el hook sólo aporta foco
  // inicial + trampa de Tab (por eso cerrarConEscape: false).
  useModalAccesible(panelRef, { cerrarConEscape: false, activo: !!selected });
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
  return { contratos, setContratos, loading, setLoading, error, setError, activeTab, setActiveTab,
    paraPersona, search, setSearch, debouncedSearch, setDebouncedSearch, page, setPage, viewMode, setViewMode,
    filterTipo, setFilterTipo, filterEstado, setFilterEstado, selected, setSelected, panelRef, panelTitleId,
    detalle, setDetalle, archivando, setArchivando, archivoError, setArchivoError, renovando, setRenovando,
    renovarError, setRenovarError, mesesRenovacion, setMesesRenovacion, wizardStep, setWizardStep,
    selectedTemplate, setSelectedTemplate, wizardData, setWizardData, creating, setCreating, createError,
    setCreateError, vencimientoManual, setVencimientoManual, storeSettings, setStoreSettings,
    autoFilledFields, setAutoFilledFields, geoLoading, setGeoLoading, geoResult, setGeoResult, fieldErrors,
    setFieldErrors, customSelectValues, setCustomSelectValues, editorTemplate, setEditorTemplate, editorText,
    setEditorText, editorPreview, setEditorPreview, printRef };
}
export type HastaContratosEstado = ReturnType<typeof useContratosEstado>;