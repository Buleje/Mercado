"use client";

/**
 * Superadmin · Repartidores
 *
 * Módulo unificado:
 *   - Header con KPIs en estilo VendorApplications.
 *   - Tabla densa con cards (1 línea visual + meta secundaria).
 *   - Drawer de detalle con tabs internos: Resumen / Documentos / Métricas / Histórico.
 *   - 3 modales: Aprobar (con notas), Rechazar (motivo obligatorio), Acceder (impersonar).
 *
 * Convenciones DS:
 *   - Tokens (`var(--accent)`, `var(--surface-*)`, etc.).
 *   - Sin emojis.
 *   - Fonts extrabold para titulos, bold para labels.
 */

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  Loader2,
  Search,
  Download,
  RefreshCw,
  X,
  ChevronRight,
  AlertTriangle,
  Eye,
  ExternalLink,
} from "@buleje/design-system/icons";
import {
  MotoIcon,
  PinIcon,
  PackageIcon,
  CashIcon,
  ShieldBadge,
  CheckBadge,
  ClockBadge,
  LiveSignal,
  PhoneRing,
  WhatsAppIcon,
  CalendarIcon,
  TrendIcon,
  StarBadge,
} from "@/components/delivery/icons";

// ─── Types ────────────────────────────────────────────────────────────────

interface KycSummary {
  schemaVersion: 1;
  applicationStatus: "pendiente" | "aprobada" | "rechazada";
  availability: string;
  kyc: {
    dni: string;
    birthDate: string;
    license: { number: string | null; category: string | null; expiresAt: string | null } | null;
    vehicle: { plate: string | null; soatNumber: string | null; soatExpiresAt: string | null } | null;
  };
  consents: {
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
    confirmAdult: boolean;
    acceptedAt: string;
    termsVersion: string;
    privacyVersion: string;
  };
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

interface PartnerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  zone: string;
  vehicleType: string;
  isActive: boolean;
  isOnline: boolean;
  rating: number;
  acceptanceRate: number;
  totalAccepted: number;
  totalOffers: number;
  tenantId: string;
  createdAt: string;
  lastPingAt: string | null;
  applicationStatus: "pendiente" | "aprobada" | "rechazada";
  kyc: KycSummary | null;
}

interface Stats {
  total: number;
  pending: number;
  active: number;
  online: number;
  rejected: number;
}

type StatusFilter = "pendiente" | "activos" | "rechazados" | "todos";
type DrawerTab = "resumen" | "documentos" | "metricas" | "historico";
type ActionModal =
  | { kind: "approve"; partner: PartnerRow }
  | { kind: "reject"; partner: PartnerRow }
  | { kind: "impersonate"; partner: PartnerRow }
  | null;

const VEHICLE_LABELS: Record<string, string> = {
  moto: "Moto",
  bicicleta: "Bicicleta",
  auto: "Auto",
  a_pie: "A pie",
};

const AVAILABILITY_LABELS: Record<string, string> = {
  manana: "Mañanas",
  tarde: "Tardes",
  noche: "Noches",
  full: "Todo el día",
  fines: "Fines de semana",
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function timeSince(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

function exportCSV(rows: PartnerRow[]) {
  const header = [
    "ID", "Nombre", "DNI", "Teléfono", "Email", "Zona", "Vehículo",
    "Placa", "Licencia", "Categoría", "SOAT", "Estado", "Activo", "Online",
    "Rating", "Inscrito",
  ];
  const data = rows.map((r) => [
    r.id, r.name, r.kyc?.kyc.dni ?? "", r.phone, r.email ?? "", r.zone,
    r.vehicleType, r.kyc?.kyc.vehicle?.plate ?? "", r.kyc?.kyc.license?.number ?? "",
    r.kyc?.kyc.license?.category ?? "", r.kyc?.kyc.vehicle?.soatNumber ?? "",
    r.applicationStatus, r.isActive ? "sí" : "no", r.isOnline ? "sí" : "no",
    String(r.rating), r.createdAt,
  ]);
  const csv = [header, ...data]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `repartidores_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function isKycComplete(
  kyc: KycSummary | null,
  vehicleType: string,
): { ok: boolean; missing: string[] } {
  if (!kyc) return { ok: false, missing: ["KYC no recibido (formulario antiguo)"] };
  const missing: string[] = [];
  if (!/^\d{8}$/.test(kyc.kyc.dni ?? "")) missing.push("DNI");
  if (!kyc.kyc.birthDate) missing.push("Fecha nacimiento");
  if (!kyc.consents.acceptedTerms) missing.push("Términos");
  if (!kyc.consents.acceptedPrivacy) missing.push("Privacidad");
  if (!kyc.consents.confirmAdult) missing.push("Mayoría edad");
  const isMotor = vehicleType === "moto" || vehicleType === "auto";
  if (isMotor) {
    if (!kyc.kyc.license?.number) missing.push("Licencia");
    if (!kyc.kyc.license?.category) missing.push("Categoría");
    if (!kyc.kyc.license?.expiresAt || new Date(kyc.kyc.license.expiresAt) < new Date()) {
      missing.push("Licencia vigente");
    }
    if (!kyc.kyc.vehicle?.plate) missing.push("Placa");
    if (!kyc.kyc.vehicle?.soatNumber) missing.push("SOAT");
    if (!kyc.kyc.vehicle?.soatExpiresAt || new Date(kyc.kyc.vehicle.soatExpiresAt) < new Date()) {
      missing.push("SOAT vigente");
    }
  }
  return { ok: missing.length === 0, missing };
}

// ─── Componente principal ─────────────────────────────────────────────────

export default function RepartidoresModule() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0, pending: 0, active: 0, online: 0, rejected: 0,
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendiente");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [detail, setDetail] = useState<PartnerRow | null>(null);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/repartidores?status=${statusFilter}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: { partners: PartnerRow[]; stats: Stats } = await res.json();
      setPartners(data.partners);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (!search.trim()) return partners;
    const q = search.toLowerCase().trim();
    return partners.filter((p) =>
      [p.name, p.phone, p.zone, p.kyc?.kyc.dni, p.kyc?.kyc.vehicle?.plate]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [partners, search]);

  async function applyAction(
    partnerId: string,
    action: "approve" | "reject" | "deactivate" | "reactivate",
    reviewNotes?: string,
  ) {
    setActioning(partnerId);
    try {
      const res = await fetch("/api/superadmin/repartidores", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ partnerId, action, reviewNotes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Error al aplicar acción");
      }
      await load();
      setActionModal(null);
      if (detail?.id === partnerId) setDetail(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setActioning(null);
    }
  }

  async function impersonate(partnerId: string) {
    setActioning(partnerId);
    try {
      const res = await fetch("/api/superadmin/repartidores/impersonate", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ partnerId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Error al acceder");
      }
      const data = (await res.json()) as { redirect: string };
      window.open(data.redirect, "_blank", "noopener,noreferrer");
      setActionModal(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setActioning(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Hero canónico ───────────────────────────────────────── */}
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="w-full">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <MotoIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Plataforma · Operaciones
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Repartidores
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Aprobación de inscripciones · Verificación de documentos · Acceso directo a
                  cuentas.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={load}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                  strokeWidth={2.25}
                />
                Actualizar
              </button>
              <button
                type="button"
                onClick={() => exportCSV(partners)}
                disabled={partners.length === 0}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-extrabold uppercase tracking-wider text-white shadow-md shadow-[var(--accent)]/20 transition hover:brightness-110 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2.25} />
                Exportar CSV
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">

      {/* ── KPIs ──────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi
          label="Total inscritos"
          value={stats.total}
          icon={<PackageIcon className="h-4 w-4" />}
          iconBg="rgba(14, 165, 233, 0.1)"
          iconColor="var(--brand-info)"
        />
        <Kpi
          label="Pendientes"
          value={stats.pending}
          icon={<ClockBadge className="h-4 w-4" />}
          iconBg="rgba(249, 115, 22, 0.1)"
          iconColor="var(--brand-secondary)"
          highlight={stats.pending > 0}
        />
        <Kpi
          label="Activos"
          value={stats.active}
          icon={<CheckBadge className="h-4 w-4" />}
          iconBg="rgba(34, 197, 94, 0.1)"
          iconColor="var(--data-success)"
        />
        <Kpi
          label="En línea ahora"
          value={stats.online}
          icon={<MotoIcon className="h-4 w-4" />}
          iconBg="rgba(0, 160, 160, 0.1)"
          iconColor="var(--accent)"
        />
        <Kpi
          label="Rechazados"
          value={stats.rejected}
          icon={<X className="h-4 w-4" />}
          iconBg="rgba(239, 68, 68, 0.1)"
          iconColor="var(--brand-danger)"
        />
      </section>

      {/* ── Filtros + búsqueda ──────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "pendiente", label: `Pendientes${stats.pending > 0 ? ` (${stats.pending})` : ""}` },
              { id: "activos", label: `Activos · ${stats.active}` },
              { id: "rechazados", label: `Rechazados · ${stats.rejected}` },
              { id: "todos", label: `Todos · ${stats.total}` },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              aria-pressed={statusFilter === f.id}
              className={`h-9 px-4 rounded-lg text-sm font-bold transition-colors ${
                statusFilter === f.id
                  ? "bg-[var(--accent-600,var(--accent))] text-white"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, DNI, teléfono, placa…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] outline-none"
          />
        </div>
      </section>

      {/* ── Lista densa ──────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-[var(--brand-danger)]/30 bg-[var(--brand-danger)]/5 px-5 py-4 text-sm font-bold text-[var(--brand-danger)] flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
            <MotoIcon className="h-6 w-6" />
          </div>
          <p className="mt-3 text-base font-bold text-[var(--text-primary)]">
            Sin resultados
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Cambia el filtro o ajusta la búsqueda.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
          <ul className="divide-y divide-[var(--rule-base)]">
            {visible.map((p) => (
              <PartnerRow
                key={p.id}
                partner={p}
                onView={() => setDetail(p)}
                onApprove={() => setActionModal({ kind: "approve", partner: p })}
                onReject={() => setActionModal({ kind: "reject", partner: p })}
                onImpersonate={() => setActionModal({ kind: "impersonate", partner: p })}
              />
            ))}
          </ul>
        </div>
      )}

      {/* ── Drawer de detalle ───────────────────── */}
      {detail && (
        <DetailDrawer
          partner={detail}
          onClose={() => setDetail(null)}
          onApprove={() => setActionModal({ kind: "approve", partner: detail })}
          onReject={() => setActionModal({ kind: "reject", partner: detail })}
          onImpersonate={() => setActionModal({ kind: "impersonate", partner: detail })}
          onDeactivate={() => applyAction(detail.id, "deactivate")}
          onReactivate={() => applyAction(detail.id, "reactivate")}
          actioning={actioning === detail.id}
        />
      )}

      {/* ── Modales ──────────────────────────────── */}
      {actionModal?.kind === "approve" && (
        <ApproveModal
          partner={actionModal.partner}
          actioning={actioning === actionModal.partner.id}
          onConfirm={(notes) => applyAction(actionModal.partner.id, "approve", notes)}
          onCancel={() => setActionModal(null)}
        />
      )}
      {actionModal?.kind === "reject" && (
        <RejectModal
          partner={actionModal.partner}
          actioning={actioning === actionModal.partner.id}
          onConfirm={(reason) => applyAction(actionModal.partner.id, "reject", reason)}
          onCancel={() => setActionModal(null)}
        />
      )}
      {actionModal?.kind === "impersonate" && (
        <ImpersonateModal
          partner={actionModal.partner}
          actioning={actioning === actionModal.partner.id}
          onConfirm={() => impersonate(actionModal.partner.id)}
          onCancel={() => setActionModal(null)}
        />
      )}
      </div>{/* /max-w-1400 */}
    </div>
  );
}

// ─── KPI ──────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  highlight = false,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        highlight
          ? "border-[var(--brand-secondary)]/40 bg-[var(--brand-secondary)]/5"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {label}
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
            {value}
          </p>
        </div>
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Lista densa ──────────────────────────────────────────────────────────

function PartnerRow({
  partner,
  onView,
  onApprove,
  onReject,
  onImpersonate,
}: {
  partner: PartnerRow;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
  onImpersonate: () => void;
}) {
  const kycCheck = isKycComplete(partner.kyc, partner.vehicleType);
  const isPending = partner.applicationStatus === "pendiente" && !partner.isActive;
  const isRejected = partner.applicationStatus === "rechazada";

  return (
    <li className="group hover:bg-[var(--surface-sunken)]/50 transition-colors">
      {/* Brandon 2026-05-21 fix mobile: layout responsive. Antes en 390px
          el `flex items-center gap-4` apretaba la columna de identidad
          (~150px) hasta que el nombre + chips quedaban verticales con
          texto roto ("Campo Verde Moto hace 19d" en column). Ahora:
          · mobile: stack 2 rows — [avatar + identidad] / [acciones full-width]
          · desktop: row horizontal como antes
          padding p-4 sm:py-3.5 sm:px-4 (más vertical en mobile para
          separar las 2 sub-rows). */}
      <div className="p-4 sm:py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {/* Top sub-row mobile: avatar + identidad. Desktop sigue inline. */}
        <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
        {/* Avatar */}
        <button
          type="button"
          onClick={onView}
          className="h-10 w-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
          aria-label="Ver detalle"
        >
          <MotoIcon className="h-5 w-5" />
        </button>

        {/* Identidad principal */}
        <button
          type="button"
          onClick={onView}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-base font-extrabold text-[var(--text-primary)] truncate">
              {partner.name}
            </span>
            <StatusPill partner={partner} />
            {partner.kyc ? (
              <KycPill kycOk={kycCheck.ok} missing={kycCheck.missing} />
            ) : (
              <span className="inline-flex items-center h-6 px-2 rounded-md bg-[var(--surface-sunken)] text-[var(--text-tertiary)] text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider">
                Legacy
              </span>
            )}
            {partner.isOnline && (
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider">
                <LiveSignal className="h-1.5 w-1.5" active />
                Online
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
            {partner.kyc?.kyc.dni && (
              <span className="font-bold text-[var(--text-primary)]">DNI {partner.kyc.kyc.dni}</span>
            )}
            <span className="flex items-center gap-1">
              <PhoneRing className="h-3 w-3" /> {partner.phone}
            </span>
            <span className="flex items-center gap-1">
              <PinIcon className="h-3 w-3" /> {partner.zone}
            </span>
            <span className="flex items-center gap-1">
              <MotoIcon className="h-3 w-3" />
              {VEHICLE_LABELS[partner.vehicleType] ?? partner.vehicleType}
              {partner.kyc?.kyc.vehicle?.plate && ` · ${partner.kyc.kyc.vehicle.plate}`}
            </span>
            <span className="text-[var(--text-tertiary)]">{timeSince(partner.createdAt)}</span>
          </div>
        </button>
        </div>

        {/* Acciones — Brandon 2026-05-21 fix mobile: full-width row con
            grid cuando hay 2 botones (Rechazar/Aprobar pending), 1 col
            cuando 1 (Acceder activo). Desktop: shrink-0 inline como antes. */}
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          {isPending && (
            <>
              <button
                type="button"
                onClick={onReject}
                className="flex-1 sm:flex-none h-10 sm:h-9 px-3 rounded-lg border border-[var(--brand-danger)]/30 bg-transparent text-xs font-bold text-[var(--brand-danger)] hover:bg-[var(--brand-danger)]/10 transition-colors"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={onApprove}
                disabled={!kycCheck.ok}
                title={kycCheck.ok ? "Aprobar repartidor" : `Falta: ${kycCheck.missing.join(", ")}`}
                className="flex-1 sm:flex-none h-10 sm:h-9 px-3 rounded-lg bg-[var(--data-success-500)] text-xs font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                Aprobar
              </button>
            </>
          )}
          {partner.isActive && (
            <button
              type="button"
              onClick={onImpersonate}
              title="Acceder a su cuenta"
              className="flex-1 sm:flex-none h-10 sm:h-9 px-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Acceder
            </button>
          )}
          {isRejected && (
            <span className="flex-1 sm:flex-none text-xs font-bold text-[var(--text-tertiary)] px-2 inline-flex items-center justify-center">
              Rechazado
            </span>
          )}
          <button
            type="button"
            onClick={onView}
            aria-label="Ver detalle"
            className="h-10 w-10 sm:h-9 sm:w-9 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

function StatusPill({ partner }: { partner: PartnerRow }) {
  if (partner.applicationStatus === "pendiente" && !partner.isActive) {
    return (
      <span className="inline-flex items-center h-6 px-2 rounded-md bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)] text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider">
        Pendiente
      </span>
    );
  }
  if (partner.isActive) {
    return (
      <span className="inline-flex items-center h-6 px-2 rounded-md bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider">
        Activo
      </span>
    );
  }
  if (partner.applicationStatus === "rechazada") {
    return (
      <span className="inline-flex items-center h-6 px-2 rounded-md bg-[var(--brand-danger)]/10 text-[var(--brand-danger)] text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider">
        Rechazado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center h-6 px-2 rounded-md bg-[var(--surface-sunken)] text-[var(--text-tertiary)] text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider">
      Inactivo
    </span>
  );
}

function KycPill({ kycOk, missing }: { kycOk: boolean; missing: string[] }) {
  if (kycOk) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider">
        <ShieldBadge className="h-3 w-3" />
        KYC OK
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[var(--brand-danger)]/10 text-[var(--brand-danger)] text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider"
      title={`Falta: ${missing.join(", ")}`}
    >
      KYC ({missing.length})
    </span>
  );
}

// ─── Drawer detalle con tabs ──────────────────────────────────────────────

function DetailDrawer({
  partner,
  onClose,
  onApprove,
  onReject,
  onImpersonate,
  onDeactivate,
  onReactivate,
  actioning,
}: {
  partner: PartnerRow;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onImpersonate: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  actioning: boolean;
}) {
  const [tab, setTab] = useState<DrawerTab>("resumen");
  const kycCheck = isKycComplete(partner.kyc, partner.vehicleType);
  const isPending = partner.applicationStatus === "pendiente" && !partner.isActive;
  const waPhone = partner.phone.replace(/\D/g, "");

  const TABS: { id: DrawerTab; label: string }[] = [
    { id: "resumen", label: "Resumen" },
    { id: "documentos", label: "Documentos" },
    { id: "metricas", label: "Métricas" },
    { id: "historico", label: "Histórico" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <aside
        className="relative w-full max-w-2xl bg-[var(--surface-canvas)] shadow-[var(--shadow-xl)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="sticky top-0 z-10 px-6 py-5 bg-[var(--surface-canvas)]/95 backdrop-blur border-b border-[var(--rule-base)]">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-12 w-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <MotoIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--accent)]">
                  Repartidor
                </p>
                <h2 className="text-xl font-extrabold text-[var(--text-primary)] truncate">
                  {partner.name}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="h-9 w-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Status + acciones rápidas */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill partner={partner} />
            {partner.kyc && <KycPill kycOk={kycCheck.ok} missing={kycCheck.missing} />}
            {partner.isOnline && (
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider">
                <LiveSignal className="h-1.5 w-1.5" active />
                En línea
              </span>
            )}
            <span className="ml-auto flex gap-1.5">
              <a
                href={`tel:${partner.phone}`}
                className="h-8 px-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs font-bold text-[var(--text-primary)] inline-flex items-center gap-1.5 hover:bg-[var(--surface-sunken)]"
              >
                <PhoneRing className="h-3.5 w-3.5" />
                Llamar
              </a>
              <a
                href={`https://wa.me/51${waPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-2.5 rounded-lg bg-[var(--data-success-500)] text-xs font-bold text-white inline-flex items-center gap-1.5"
              >
                <WhatsAppIcon className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            </span>
          </div>

          {/* Tabs */}
          <nav role="tablist" className="mt-5 flex gap-1 border-b border-[var(--rule-base)] -mb-5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                onClick={() => setTab(t.id)}
                aria-selected={tab === t.id}
                className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors -mb-px ${
                  tab === t.id
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        {/* Contenido por tab */}
        <div className="px-6 py-6 space-y-5">
          {tab === "resumen" && <ResumenTab partner={partner} kycCheck={kycCheck} />}
          {tab === "documentos" && <DocumentosTab partner={partner} />}
          {tab === "metricas" && <MetricasTab partner={partner} />}
          {tab === "historico" && <HistoricoTab partner={partner} />}
        </div>

        {/* Footer */}
        <footer className="sticky bottom-0 px-6 py-4 bg-[var(--surface-canvas)]/95 backdrop-blur border-t border-[var(--rule-base)] flex items-center gap-2">
          {isPending ? (
            <>
              <button
                type="button"
                onClick={onReject}
                disabled={actioning}
                className="flex-1 h-11 rounded-xl border border-[var(--brand-danger)]/30 bg-transparent text-sm font-bold text-[var(--brand-danger)] hover:bg-[var(--brand-danger)]/10 disabled:opacity-50 transition-colors"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={onApprove}
                disabled={actioning || !kycCheck.ok}
                title={kycCheck.ok ? "Aprobar" : `Falta: ${kycCheck.missing.join(", ")}`}
                className="flex-[2] h-11 rounded-xl bg-[var(--data-success-500)] text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              >
                {actioning ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Aprobar repartidor"}
              </button>
            </>
          ) : partner.isActive ? (
            <>
              <button
                type="button"
                onClick={onDeactivate}
                disabled={actioning}
                className="flex-1 h-11 rounded-xl border border-[var(--brand-danger)]/30 bg-transparent text-sm font-bold text-[var(--brand-danger)] hover:bg-[var(--brand-danger)]/10 disabled:opacity-50"
              >
                Desactivar
              </button>
              <button
                type="button"
                onClick={onImpersonate}
                disabled={actioning}
                className="flex-[2] h-11 rounded-xl bg-[var(--accent)] text-sm font-bold text-white inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
              >
                <ExternalLink className="h-4 w-4" />
                Acceder a su cuenta
              </button>
            </>
          ) : partner.applicationStatus === "rechazada" ? (
            <button
              type="button"
              onClick={onReactivate}
              disabled={actioning}
              className="flex-1 h-11 rounded-xl bg-[var(--accent)] text-sm font-bold text-white disabled:opacity-50"
            >
              Reactivar repartidor
            </button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}

// ─── Tabs de drawer ───────────────────────────────────────────────────────

function ResumenTab({ partner, kycCheck }: { partner: PartnerRow; kycCheck: { ok: boolean; missing: string[] } }) {
  return (
    <>
      {!kycCheck.ok && partner.kyc && (
        <div className="rounded-xl bg-[var(--brand-danger)]/5 border border-[var(--brand-danger)]/30 px-4 py-3 text-sm text-[var(--text-primary)] flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-[var(--brand-danger)] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-[var(--brand-danger)]">Aprobación bloqueada</p>
            <p className="mt-0.5 text-[var(--text-secondary)]">
              Falta: <span className="font-bold text-[var(--text-primary)]">{kycCheck.missing.join(" · ")}</span>
            </p>
          </div>
        </div>
      )}

      <DataCard
        title="Identidad"
        rows={[
          ["Nombre", partner.name],
          ["DNI", partner.kyc?.kyc.dni ?? "—"],
          ["Fecha nacimiento", fmtDate(partner.kyc?.kyc.birthDate ?? null)],
          ["WhatsApp", partner.phone],
          ["Email", partner.email ?? "—"],
        ]}
      />
      <DataCard
        title="Operación"
        rows={[
          ["Vehículo", VEHICLE_LABELS[partner.vehicleType] ?? partner.vehicleType],
          ["Zona", partner.zone],
          [
            "Horario",
            partner.kyc
              ? AVAILABILITY_LABELS[partner.kyc.availability] ?? partner.kyc.availability
              : "—",
          ],
        ]}
      />
    </>
  );
}

function DocumentosTab({ partner }: { partner: PartnerRow }) {
  const isMotor = partner.vehicleType === "moto" || partner.vehicleType === "auto";

  if (!partner.kyc) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-8 text-center">
        <p className="text-base font-bold text-[var(--text-primary)]">Sin KYC en sistema</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Inscripción del formulario antiguo. Pídele que se vuelva a inscribir con el nuevo formulario.
        </p>
      </div>
    );
  }

  return (
    <>
      {isMotor && partner.kyc.kyc.license && (
        <DataCard
          title="Licencia de conducir"
          icon={<ShieldBadge className="h-4 w-4" />}
          rows={[
            ["Categoría", partner.kyc.kyc.license.category ?? "—"],
            ["Número", partner.kyc.kyc.license.number ?? "—"],
            ["Vence", fmtDate(partner.kyc.kyc.license.expiresAt)],
          ]}
        />
      )}
      {isMotor && partner.kyc.kyc.vehicle && (
        <DataCard
          title="Vehículo y SOAT"
          icon={<MotoIcon className="h-4 w-4" />}
          rows={[
            ["Placa", partner.kyc.kyc.vehicle.plate ?? "—"],
            ["N° SOAT", partner.kyc.kyc.vehicle.soatNumber ?? "—"],
            ["Vence SOAT", fmtDate(partner.kyc.kyc.vehicle.soatExpiresAt)],
          ]}
        />
      )}
      {!isMotor && (
        <div className="rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 px-4 py-3 text-sm text-[var(--text-primary)]">
          <p className="font-bold">No requiere documentos vehiculares</p>
          <p className="mt-0.5 text-[var(--text-secondary)]">
            Para {partner.vehicleType === "bicicleta" ? "bicicleta" : "reparto a pie"} no se exige licencia ni SOAT.
          </p>
        </div>
      )}
      <DataCard
        title="Consentimientos legales"
        icon={<CheckBadge className="h-4 w-4" />}
        rows={[
          ["Términos", partner.kyc.consents.acceptedTerms ? "Aceptado" : "No aceptado"],
          ["Privacidad (Ley 29733)", partner.kyc.consents.acceptedPrivacy ? "Aceptado" : "No aceptado"],
          ["Mayoría de edad", partner.kyc.consents.confirmAdult ? "Confirmado" : "No confirmado"],
          ["Aceptado el", fmtDateTime(partner.kyc.consents.acceptedAt)],
          ["Versión T&C", partner.kyc.consents.termsVersion],
          ["Versión Privacidad", partner.kyc.consents.privacyVersion],
        ]}
      />
    </>
  );
}

function MetricasTab({ partner }: { partner: PartnerRow }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<StarBadge className="h-4 w-4 text-[var(--brand-secondary)]" />}
          label="Rating"
          value={Number(partner.rating).toFixed(1)}
        />
        <MetricCard
          icon={<TrendIcon className="h-4 w-4 text-[var(--data-success-500)]" />}
          label="Aceptación"
          value={`${Math.round(partner.acceptanceRate * 100)}%`}
        />
        <MetricCard
          icon={<PackageIcon className="h-4 w-4 text-[var(--accent)]" />}
          label="Entregas"
          value={String(partner.totalAccepted)}
        />
        <MetricCard
          icon={<CashIcon className="h-4 w-4 text-[var(--brand-info)]" />}
          label="Ofertas"
          value={String(partner.totalOffers)}
        />
      </div>
      <DataCard
        title="Actividad"
        icon={<CalendarIcon className="h-4 w-4" />}
        rows={[
          ["Inscrito", fmtDateTime(partner.createdAt)],
          ["Último ping GPS", fmtDateTime(partner.lastPingAt)],
          ["Online ahora", partner.isOnline ? "Sí" : "No"],
        ]}
      />
    </>
  );
}

function HistoricoTab({ partner }: { partner: PartnerRow }) {
  if (!partner.kyc?.reviewedAt) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-8 text-center">
        <p className="text-base font-bold text-[var(--text-primary)]">Sin revisión registrada</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Esta solicitud aún no ha sido revisada por ningún superadmin.
        </p>
      </div>
    );
  }
  return (
    <DataCard
      title="Última revisión"
      icon={<CheckBadge className="h-4 w-4" />}
      rows={[
        ["Estado", partner.applicationStatus],
        ["Revisado el", fmtDateTime(partner.kyc.reviewedAt)],
        ["Revisado por", partner.kyc.reviewedBy ?? "—"],
        ["Notas", partner.kyc.reviewNotes ?? "—"],
      ]}
    />
  );
}

// ─── Sub-bloques ──────────────────────────────────────────────────────────

function DataCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon?: ReactNode;
  rows: [string, string][];
}) {
  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <h3 className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-2 mb-3">
        {icon && <span className="text-[var(--accent)]">{icon}</span>}
        {title}
      </h3>
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3 text-sm">
            <dt className="text-[var(--text-tertiary)]">{k}</dt>
            <dd className="font-bold text-[var(--text-primary)] text-right truncate max-w-[60%]">
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </span>
      </div>
      <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">{value}</p>
    </div>
  );
}

// ─── Modales ──────────────────────────────────────────────────────────────

function Modal({
  title,
  subtitle,
  icon,
  iconBg,
  iconColor,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-2xl bg-[var(--surface-canvas)] shadow-[var(--shadow-xl)] border border-[var(--rule-base)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-[var(--rule-base)] flex items-start gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: iconBg, color: iconColor }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function ApproveModal({
  partner,
  actioning,
  onConfirm,
  onCancel,
}: {
  partner: PartnerRow;
  actioning: boolean;
  onConfirm: (notes?: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <Modal
      title="Aprobar repartidor"
      subtitle={`Activarás a ${partner.name} en la plataforma y recibirá un mensaje de bienvenida por WhatsApp.`}
      icon={<CheckBadge className="h-5 w-5" />}
      iconBg="rgba(34, 197, 94, 0.1)"
      iconColor="var(--data-success)"
      onClose={onCancel}
    >
      <div className="px-5 py-4 space-y-3">
        <div className="rounded-lg bg-[var(--surface-sunken)] p-3 text-sm space-y-1">
          <p className="font-bold text-[var(--text-primary)]">{partner.name}</p>
          <p className="text-[var(--text-secondary)]">
            DNI {partner.kyc?.kyc.dni ?? "—"} · {VEHICLE_LABELS[partner.vehicleType] ?? partner.vehicleType}
            {partner.kyc?.kyc.vehicle?.plate && ` · ${partner.kyc.kyc.vehicle.plate}`}
          </p>
        </div>
        <label className="block">
          <span className="block text-sm font-bold text-[var(--text-primary)] mb-1.5">
            Notas internas (opcional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="Ej: documentos verificados con foto del DNI físico el 30/04/2026"
            className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] outline-none resize-none"
          />
          <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
            Quedan registradas en el histórico de la solicitud.
          </span>
        </label>
      </div>
      <footer className="px-5 py-4 border-t border-[var(--rule-base)] flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={actioning}
          className="flex-1 h-11 rounded-xl border border-[var(--rule-base)] bg-transparent text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onConfirm(notes.trim() || undefined)}
          disabled={actioning}
          className="flex-[2] h-11 rounded-xl bg-[var(--data-success-500)] text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {actioning ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Aprobar y notificar"}
        </button>
      </footer>
    </Modal>
  );
}

function RejectModal({
  partner,
  actioning,
  onConfirm,
  onCancel,
}: {
  partner: PartnerRow;
  actioning: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState<string | null>(null);

  const PRESETS = [
    "Documentos no coinciden con los datos del registro",
    "Licencia o SOAT vencidos",
    "Edad no permitida o datos no verificables",
    "Zona fuera de cobertura actual",
  ];

  const finalReason = preset ?? reason.trim();
  const valid = finalReason.length >= 5;

  return (
    <Modal
      title="Rechazar solicitud"
      subtitle={`Marcarás la solicitud de ${partner.name} como rechazada y le enviaremos el motivo por WhatsApp.`}
      icon={<X className="h-5 w-5" />}
      iconBg="rgba(239, 68, 68, 0.1)"
      iconColor="var(--brand-danger)"
      onClose={onCancel}
    >
      <div className="px-5 py-4 space-y-4">
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)] mb-2">Motivo predefinido</p>
          <div className="space-y-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p === preset ? null : p)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  preset === p
                    ? "border-[var(--brand-danger)] bg-[var(--brand-danger)]/5 text-[var(--text-primary)] font-bold"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="block text-sm font-bold text-[var(--text-primary)] mb-1.5">
            O escribe un motivo personalizado
          </span>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value.slice(0, 500));
              setPreset(null);
            }}
            rows={3}
            placeholder="Mínimo 5 caracteres. El repartidor verá este texto."
            className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--brand-danger)] outline-none resize-none"
          />
        </label>
      </div>
      <footer className="px-5 py-4 border-t border-[var(--rule-base)] flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={actioning}
          className="flex-1 h-11 rounded-xl border border-[var(--rule-base)] bg-transparent text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => valid && onConfirm(finalReason)}
          disabled={actioning || !valid}
          className="flex-[2] h-11 rounded-xl bg-[var(--brand-danger)] text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
        >
          {actioning ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Rechazar y notificar"}
        </button>
      </footer>
    </Modal>
  );
}

function ImpersonateModal({
  partner,
  actioning,
  onConfirm,
  onCancel,
}: {
  partner: PartnerRow;
  actioning: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title="Acceder a la cuenta del repartidor"
      subtitle="Abrirás la app del repartidor con su sesión activa en una nueva pestaña."
      icon={<ExternalLink className="h-5 w-5" />}
      iconBg="rgba(0, 160, 160, 0.1)"
      iconColor="var(--accent)"
      onClose={onCancel}
    >
      <div className="px-5 py-4 space-y-3">
        <div className="rounded-lg bg-[var(--surface-sunken)] p-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <MotoIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[var(--text-primary)] truncate">{partner.name}</p>
            <p className="text-sm text-[var(--text-secondary)]">
              {partner.phone} · {partner.zone}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-[var(--brand-secondary)]/5 border border-[var(--brand-secondary)]/30 p-3 text-sm">
          <p className="font-bold text-[var(--brand-secondary)] flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Esta acción queda en el log de auditoría
          </p>
          <p className="mt-1 text-[var(--text-secondary)]">
            Solo úsalo para diagnóstico o soporte del repartidor. La sesión dura 7 días pero
            puedes cerrar la pestaña en cualquier momento.
          </p>
        </div>
      </div>
      <footer className="px-5 py-4 border-t border-[var(--rule-base)] flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={actioning}
          className="flex-1 h-11 rounded-xl border border-[var(--rule-base)] bg-transparent text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={actioning}
          className="flex-[2] h-11 rounded-xl bg-[var(--accent)] text-sm font-bold text-white inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
        >
          {actioning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Eye className="h-4 w-4" />
              Acceder ahora
            </>
          )}
        </button>
      </footer>
    </Modal>
  );
}
