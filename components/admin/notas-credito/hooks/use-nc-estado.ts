import { useState, useRef, useId } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { NCStatus, NotaCredito, SaleDoc, PickerDocType, DocType, SortField, SortDir, ViewMode, NCTemplate } from "@/components/admin/notas-credito/nc-compartido";

/** Estado de Notas de crédito: lista, filtros, asistente y selector. Parte de `useNotasCredito`. */
export function useNcEstado() {
  // ── Main list state ───────────────────────────────────────────────────────
  const [notas, setNotas] = useState<NotaCredito[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<NCStatus | "">("");
  const [docTypeFilter, setDocTypeFilter] = useState<DocType>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<NotaCredito | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showAdvFilters, setShowAdvFilters] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [templates, setTemplates] = useState<NCTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem("nc-templates") ?? "[]") as NCTemplate[]; } catch { return []; }
  });
  const [showTemplates, setShowTemplates] = useState(false);

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [showNew, setShowNew] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ orderId: "", codigoMotivo: "", descripcionMotivo: "", monto: "", notasText: "" });

  // ── Document Picker state (VISUAL) ────────────────────────────────────────
  const [pickerDocs, setPickerDocs] = useState<SaleDoc[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerDocType, setPickerDocType] = useState<PickerDocType>("all");
  const [selectedVenta, setSelectedVenta] = useState<SaleDoc | null>(null);

  const [devolverStock, setDevolverStock] = useState(true);
  const esDevolucion = form.codigoMotivo === "06" || form.codigoMotivo === "07";
  const searchRef = useRef<HTMLInputElement>(null);
  const { confirm, prompt } = useConfirm();
  const wizardTitleId = useId();
  const detailTitleId = useId();
  const wizardPanelRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  return {
    notas, setNotas, loading, setLoading, error, setError, search, setSearch, debouncedSearch,
    setDebouncedSearch, statusFilter, setStatusFilter, docTypeFilter, setDocTypeFilter, page, setPage,
    selected, setSelected, checkedIds, setCheckedIds, viewMode, setViewMode, sortField, setSortField,
    sortDir, setSortDir, dateFrom, setDateFrom, dateTo, setDateTo, minAmount, setMinAmount, maxAmount,
    setMaxAmount, showAdvFilters, setShowAdvFilters, showShortcuts, setShowShortcuts, templates,
    setTemplates, showTemplates, setShowTemplates, showNew, setShowNew, wizardStep, setWizardStep,
    creating, setCreating, createError, setCreateError, form, setForm, pickerDocs, setPickerDocs,
    pickerLoading, setPickerLoading, pickerSearch, setPickerSearch, pickerDocType, setPickerDocType,
    selectedVenta, setSelectedVenta, devolverStock, setDevolverStock, esDevolucion, searchRef, confirm,
    prompt, wizardTitleId, detailTitleId, wizardPanelRef, detailPanelRef,
  };
}
