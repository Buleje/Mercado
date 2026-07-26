"use client";

/**
 * HealthFillAllModal — Modal único para rellenar TODOS los campos de salud
 * de un tenant en una sola pasada. Reemplaza la fricción de abrir un modal
 * por cada check.
 *
 * Secciones (collapsibles):
 *   - Identidad visual: logo + banner
 *   - Marketplace: publicado + descripción
 *   - Pagos: Yape (toggle+phone+name), Efectivo
 *   - Ubicación: dirección + zona delivery + lat/lng
 *   - Comercial: razón social + RUC + nombre comercial
 *   - Contacto: tel dueño, email verificado, tel negocio
 *   - Operación: horarios
 *
 * Auto-load del snapshot actual al abrir. Save batch al cerrar.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  X,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
} from "@buleje/design-system/icons";
import ImageUploader from "../_shared/ImageUploader";

interface HealthFillAllModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  onSaved?: () => void;
}

type Snapshot = {
  tenant: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    ownerPhone: string | null;
    ownerEmail: string | null;
    emailVerified: boolean;
  };
  store: {
    logo: string | null;
    banner: string | null;
    description: string | null;
    isPublished: boolean;
    zone: string | null;
  } | null;
  settings: {
    businessName: string | null;
    businessPhone: string | null;
    businessAddress: string | null;
    razonSocial: string | null;
    ruc: string | null;
    hours: string | null;
    deliveryZone: string | null;
    yapeEnabled: boolean;
    yapePhone: string | null;
    yapeName: string | null;
    cashEnabled: boolean;
  } | null;
};

type FormState = {
  // Identidad
  logo: string;
  banner: string;
  description: string;
  isPublished: boolean;
  // Pagos
  yapeEnabled: boolean;
  yapePhone: string;
  // Ubicación
  businessAddress: string;
  deliveryZone: string;
  // Comercial
  razonSocial: string;
  ruc: string;
  businessName: string;
  // Contacto
  ownerPhone: string;
  businessPhone: string;
  // Operación
  hours: string;
};

const EMPTY_FORM: FormState = {
  logo: "",
  banner: "",
  description: "",
  isPublished: false,
  yapeEnabled: false,
  yapePhone: "",
  businessAddress: "",
  deliveryZone: "",
  razonSocial: "",
  ruc: "",
  businessName: "",
  ownerPhone: "",
  businessPhone: "",
  hours: "",
};

type SaveResult = {
  total: number;
  ok: number;
  failed: string[];
};

export default function HealthFillAllModal({
  open,
  onClose,
  tenantId,
  tenantSlug,
  tenantName,
  onSaved,
}: HealthFillAllModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["identidad", "pagos", "comercial"]),
  );
  const [error, setError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [saveProgress, setSaveProgress] = useState(0);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>(
    {},
  );

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/superadmin/stores/health-snapshot?tenantId=${tenantId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("load_failed");
      const json = (await res.json()) as Snapshot;
      setForm({
        logo: json.tenant.logoUrl ?? json.store?.logo ?? "",
        banner: json.store?.banner ?? "",
        description: json.store?.description ?? "",
        isPublished: json.store?.isPublished ?? false,
        yapeEnabled: json.settings?.yapeEnabled ?? false,
        yapePhone: json.settings?.yapePhone ?? "",
        businessAddress: json.settings?.businessAddress ?? "",
        deliveryZone: json.settings?.deliveryZone ?? json.store?.zone ?? "",
        razonSocial: json.settings?.razonSocial ?? "",
        ruc: json.settings?.ruc ?? "",
        businessName: json.settings?.businessName ?? "",
        ownerPhone: json.tenant.ownerPhone ?? "",
        businessPhone: json.settings?.businessPhone ?? "",
        hours: json.settings?.hours ?? "",
      });
    } catch {
      setError("No pudimos cargar los datos actuales del tenant.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (open) {
      loadSnapshot();
      setSaveResult(null);
    }
  }, [open, loadSnapshot]);

  // Escape para cerrar
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const update = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    // Limpiar el error de validación de ese campo al editarlo
    setValidationErrors((prev) => {
      if (!prev[k as string]) return prev;
      const next = { ...prev };
      delete next[k as string];
      return next;
    });
  }, []);

  // ── Validador ─────────────────────────────────────────────────────────
  const validate = useCallback((f: FormState): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (f.ruc && f.ruc.length > 0 && f.ruc.length !== 8 && f.ruc.length !== 11) {
      errs.ruc = "RUC debe tener 11 dígitos o DNI 8 dígitos";
    }
    const phoneRe = /^[0-9+\s-]{7,15}$/;
    if (f.ownerPhone && !phoneRe.test(f.ownerPhone)) {
      errs.ownerPhone = "Formato inválido (7-15 dígitos)";
    }
    if (f.businessPhone && !phoneRe.test(f.businessPhone)) {
      errs.businessPhone = "Formato inválido";
    }
    if (f.yapeEnabled && (!f.yapePhone || !/^9\d{8}$/.test(f.yapePhone))) {
      errs.yapePhone = "Yape debe ser celular 9XXXXXXXX";
    }
    return errs;
  }, []);

  // ── Score per-section: calcula campos llenos por sección ─────────────
  const sectionScores = useMemo(() => {
    const score = (filled: boolean[], required: number = filled.length): { ok: number; total: number } => {
      const ok = filled.filter(Boolean).length;
      return { ok, total: required };
    };
    return {
      identidad: score([!!form.logo, !!form.banner], 2),
      marketplace: score([!!form.description, form.isPublished], 2),
      pagos: score([form.yapeEnabled && !!form.yapePhone], 1),
      ubicacion: score([!!form.businessAddress, !!form.deliveryZone], 2),
      comercial: score(
        [!!form.businessName, !!form.razonSocial, !!form.ruc],
        3,
      ),
      contacto: score([!!form.ownerPhone, !!form.businessPhone], 2),
      operacion: score([!!form.hours], 1),
    };
  }, [form]);

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const saveAll = useCallback(async () => {
    // Validación pre-save
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setValidationErrors(errs);
      setError(`Hay ${Object.keys(errs).length} campo(s) con formato inválido. Revisá los marcados.`);
      return;
    }
    setValidationErrors({});

    setSaving(true);
    setError(null);
    setSaveResult(null);
    setSaveProgress(0);

    // Construir array de PATCH calls — un check a la vez al endpoint mapper
    const patches: Array<{ checkId: string; value: string }> = [
      { checkId: "logo", value: form.logo ?? "" },
      { checkId: "banner", value: form.banner ?? "" },
      { checkId: "description", value: form.description ?? "" },
      { checkId: "published", value: form.isPublished ? "true" : "false" },
      {
        checkId: "yape",
        value: JSON.stringify({
          enabled: form.yapeEnabled,
          phone: form.yapePhone,
        }),
      },
      { checkId: "businessAddress", value: form.businessAddress ?? "" },
      { checkId: "deliveryZone", value: form.deliveryZone ?? "" },
      { checkId: "razonSocial", value: form.razonSocial ?? "" },
      { checkId: "ruc", value: form.ruc ?? "" },
      { checkId: "businessName", value: form.businessName ?? "" },
      { checkId: "ownerPhone", value: form.ownerPhone ?? "" },
      { checkId: "businessPhone", value: form.businessPhone ?? "" },
      { checkId: "hours", value: form.hours ?? "" },
    ];

    const failed: string[] = [];
    let ok = 0;

    // Progress live: ejecuta los PATCH secuencialmente para que el progress
    // bar se incremente con cada save real. Más confianza en el UX.
    for (const p of patches) {
      try {
        const r = await fetch("/api/superadmin/stores/health-field", {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            tenantId,
            checkId: p.checkId,
            value: p.value,
          }),
        });
        if (!r.ok) throw new Error(`${p.checkId}: ${r.status}`);
        ok += 1;
      } catch (e) {
        failed.push((e as Error).message);
      }
      setSaveProgress((curr) => curr + 1);
    }

    setSaveResult({ total: patches.length, ok, failed });
    setSaving(false);
    if (failed.length === 0) {
      onSaved?.();
      setTimeout(() => onClose(), 1200);
    }
  }, [form, tenantId, onClose, onSaved, validate]);

  // Cmd/Ctrl+S — atajo para guardar sin levantar el mouse
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!saving && !loading) saveAll();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, saving, loading, saveAll]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Rellenar datos de ${tenantName}`}
      className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl my-4 rounded-2xl bg-[var(--surface-canvas)] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
          <div className="min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
              Rellenar datos del tenant
            </p>
            <p className="text-xl font-black text-[var(--text-primary)] mt-0.5">
              {tenantName}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              /{tenantSlug} · Llená todo lo que falte y guardá una sola vez
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Cargando datos actuales...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-[var(--data-error-500)]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && (
            <>
              {/* ── Identidad visual ─────────────────────────────── */}
              <Section
                id="identidad"
                title="Identidad visual"
                description="Logo y banner que ven los clientes en /tiendas"
                score={sectionScores.identidad}
                isOpen={openSections.has("identidad")}
                onToggle={toggleSection}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                      Logo
                    </label>
                    <ImageUploader
                      value={form.logo || null}
                      onChange={(url) => update("logo", url ?? "")}
                      folder={`tenant-${tenantSlug}-logo`}
                      mode="square"
                      aspectClass="aspect-[4/3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                      Banner
                    </label>
                    <ImageUploader
                      value={form.banner || null}
                      onChange={(url) => update("banner", url ?? "")}
                      folder={`tenant-${tenantSlug}-banner`}
                      mode="wide"
                      aspectClass="aspect-[16/7]"
                    />
                  </div>
                </div>
              </Section>

              {/* ── Marketplace ──────────────────────────────────── */}
              <Section
                id="marketplace"
                title="Marketplace"
                description="Cómo aparece la tienda en el directorio"
                score={sectionScores.marketplace}
                isOpen={openSections.has("marketplace")}
                onToggle={toggleSection}
              >
                <Field label="Descripción de la tienda">
                  <textarea
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    rows={2}
                    placeholder="Texto corto que invite a comprar"
                    className={inputCls}
                  />
                </Field>
                <Toggle
                  label="Publicar tienda en marketplace"
                  checked={form.isPublished}
                  onChange={(v) => update("isPublished", v)}
                />
              </Section>

              {/* ── Pagos ────────────────────────────────────────── */}
              <Section
                id="pagos"
                title="Métodos de pago"
                description="Yape y efectivo"
                score={sectionScores.pagos}
                isOpen={openSections.has("pagos")}
                onToggle={toggleSection}
              >
                <Toggle
                  label="Activar Yape"
                  checked={form.yapeEnabled}
                  onChange={(v) => update("yapeEnabled", v)}
                />
                <Field label="Número Yape">
                  <input
                    type="tel"
                    value={form.yapePhone}
                    onChange={(e) =>
                      update("yapePhone", e.target.value.replace(/[^0-9]/g, ""))
                    }
                    placeholder="9XX XXX XXX"
                    disabled={!form.yapeEnabled}
                    className={`${inputCls} disabled:opacity-50`}
                  />
                </Field>
              </Section>

              {/* ── Ubicación ────────────────────────────────────── */}
              <Section
                id="ubicacion"
                title="Ubicación"
                description="Dirección física y zona de delivery"
                score={sectionScores.ubicacion}
                isOpen={openSections.has("ubicacion")}
                onToggle={toggleSection}
              >
                <Field label="Dirección física">
                  <input
                    type="text"
                    value={form.businessAddress}
                    onChange={(e) => update("businessAddress", e.target.value)}
                    placeholder="Av. ... Pucallpa"
                    className={inputCls}
                  />
                </Field>
                <Field label="Zona de delivery">
                  <input
                    type="text"
                    value={form.deliveryZone}
                    onChange={(e) => update("deliveryZone", e.target.value)}
                    placeholder="Centro / Manantay / Yarinacocha"
                    className={inputCls}
                  />
                </Field>
              </Section>

              {/* ── Comercial ────────────────────────────────────── */}
              <Section
                id="comercial"
                title="Datos comerciales"
                description="Razón social, RUC y nombre comercial"
                score={sectionScores.comercial}
                isOpen={openSections.has("comercial")}
                onToggle={toggleSection}
              >
                <Field label="Nombre comercial">
                  <input
                    type="text"
                    value={form.businessName}
                    onChange={(e) => update("businessName", e.target.value)}
                    placeholder="Mi Tienda"
                    className={inputCls}
                  />
                </Field>
                <Field label="Razón social">
                  <input
                    type="text"
                    value={form.razonSocial}
                    onChange={(e) => update("razonSocial", e.target.value)}
                    placeholder="Empresa S.A.C."
                    className={inputCls}
                  />
                </Field>
                <Field label="RUC / DNI" error={validationErrors.ruc}>
                  <input
                    type="text"
                    value={form.ruc}
                    onChange={(e) => update("ruc", e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="20XXXXXXXXX (RUC) o 0XXXXXXX (DNI)"
                    className={`${inputCls} ${validationErrors.ruc ? "border-rose-400" : ""}`}
                  />
                </Field>
              </Section>

              {/* ── Contacto ─────────────────────────────────────── */}
              <Section
                id="contacto"
                title="Contacto"
                description="Teléfono dueño y del negocio"
                score={sectionScores.contacto}
                isOpen={openSections.has("contacto")}
                onToggle={toggleSection}
              >
                <Field label="Teléfono del dueño (admin)">
                  <input
                    type="tel"
                    value={form.ownerPhone}
                    onChange={(e) =>
                      update("ownerPhone", e.target.value.replace(/[^0-9+\s-]/g, ""))
                    }
                    placeholder="9XX XXX XXX"
                    className={inputCls}
                  />
                </Field>
                <Field label="Teléfono público del negocio">
                  <input
                    type="tel"
                    value={form.businessPhone}
                    onChange={(e) =>
                      update(
                        "businessPhone",
                        e.target.value.replace(/[^0-9+\s-]/g, ""),
                      )
                    }
                    placeholder="9XX XXX XXX"
                    className={inputCls}
                  />
                </Field>
              </Section>

              {/* ── Operación ────────────────────────────────────── */}
              <Section
                id="operacion"
                title="Operación"
                description="Horarios de atención"
                score={sectionScores.operacion}
                isOpen={openSections.has("operacion")}
                onToggle={toggleSection}
              >
                <Field label="Horarios">
                  <input
                    type="text"
                    value={form.hours}
                    onChange={(e) => update("hours", e.target.value)}
                    placeholder="Lun a Dom · 7am – 11pm"
                    className={inputCls}
                  />
                </Field>
              </Section>

              {saveResult && (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    saveResult.failed.length === 0
                      ? "bg-emerald-50 border-emerald-200 text-[var(--data-success-700)]"
                      : "bg-teal-50 border-teal-200 text-teal-800"
                  }`}
                >
                  {saveResult.failed.length === 0 ? (
                    <>
                      <CheckCircle2 className="inline h-4 w-4 mr-1" />
                      Guardados {saveResult.ok} de {saveResult.total} campos
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="inline h-4 w-4 mr-1" />
                      Guardados {saveResult.ok} de {saveResult.total}.{" "}
                      {saveResult.failed.length} fallaron:{" "}
                      {saveResult.failed.slice(0, 2).join("; ")}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Progress bar mientras saving — feedback live */}
        {saving && (
          <div className="px-5 py-2 border-t border-[var(--rule-base)] bg-primary/10/30">
            <div className="flex items-center justify-between text-[length:var(--ts-xs)] font-bold text-[var(--accent)] mb-1">
              <span>Guardando...</span>
              <span className="tabular-nums">{saveProgress}/13</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--surface-canvas)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-200"
                style={{ width: `${(saveProgress / 13) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-raised)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg bg-[var(--accent-600,var(--accent))] text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {saveProgress > 0 ? `Guardando ${saveProgress}/13...` : "Guardando..."}
              </>
            ) : (
              <>
                Guardar todo
                <span className="hidden sm:inline ml-1.5 text-[length:var(--ts-2xs)] opacity-80">
                  Ctrl+S
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none";

function Section({
  id,
  title,
  description,
  score,
  isOpen,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  score?: { ok: number; total: number };
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isComplete = score && score.ok === score.total;
  const scorePct = score ? Math.round((score.ok / Math.max(score.total, 1)) * 100) : 0;
  return (
    <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-sunken)]/50 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-[var(--text-primary)]">{title}</p>
            {score && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider ${
                  isComplete
                    ? "bg-emerald-100 text-[var(--data-success-700)]"
                    : scorePct >= 50
                      ? "bg-teal-100 text-teal-700"
                      : "bg-rose-100 text-[var(--data-error-500)]"
                }`}
              >
                {score.ok}/{score.total}
                {isComplete && " ✓"}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              {description}
            </p>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-[var(--text-tertiary)] shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div className="border-t border-[var(--rule-base)] p-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-[length:var(--ts-xs)] font-bold text-[var(--data-error-500)]">{error}</p>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}
