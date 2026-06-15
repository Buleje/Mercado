"use client";
import { useState, useEffect, useCallback } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, CheckCircle, Clock, FileText, MapPin, Phone, RefreshCw, ThumbsDown, ThumbsUp, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { TableSkeleton, VehicleIcon } from "@/components/admin/delivery-partners/shared";

export function SolicitudesTab() {
  const [apps, setApps] = useState<DriverApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [error, setError] = useState<string | null>(null);

  const fetchApps = useCallback(() => {
    setLoading(true);
    tenantFetch("/api/admin/driver-applications")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setApps(d.data ?? []))
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setProcessing(id);
    setError(null);
    try {
      const res = await tenantFetch("/api/admin/driver-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notificationId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      fetchApps();
    } catch (err) {
      // FIX 2026-05-06: catch silencioso → ahora muestra error al admin.
      // Aprobar/rechazar driver sin feedback dejaba al admin creyendo que
      // se procesó cuando no — bug operacional crítico en flujo KYC.
      const msg = err instanceof Error ? err.message : "desconocido";
      setError(`Error al ${action === "approve" ? "aprobar" : "rechazar"} la solicitud: ${msg}`);
    } finally {
      setProcessing(null);
    }
  };

  const filtered = filter === "pending"
    ? apps.filter((a) => !a.readAt)
    : apps;

  const pendingCount = apps.filter((a) => !a.readAt).length;
  const reviewedCount = apps.length - pendingCount;
  // Cuenta solicitudes pendientes con KYC completo (listas para aprobar)
  const readyToApprove = apps.filter((a) => {
    if (a.readAt) return false;
    if (!a.kyc) return false;
    const data = parseApplicationBody(a.body);
    const vehicleType = a.partner?.vehicleType ?? data.vehicle;
    return isKycComplete(a.kyc, vehicleType).ok;
  }).length;
  const incompleteCount = pendingCount - readyToApprove;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-2xl text-sm text-[var(--data-error-500)]">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-bold">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto p-1 rounded-lg hover:bg-[var(--data-error-100)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Solicitudes de repartidores
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {apps.length === 0
                  ? "Aún no llegaron solicitudes. Los nuevos repartidores aparecerán acá para que las revises."
                  : `${apps.length} ${apps.length === 1 ? "solicitud recibida" : "solicitudes recibidas"} · revisá KYC, aprobá o rechazá.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchApps}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualizar
          </button>
        </div>

        {apps.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Total
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
                {apps.length}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Recibidas</p>
            </div>
            <button
              type="button"
              onClick={() => setFilter("pending")}
              disabled={pendingCount === 0}
              className={cn(
                "text-left rounded-xl border p-5 transition-colors",
                pendingCount > 0
                  ? "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] hover:brightness-95"
                  : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] cursor-default",
              )}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-100)]">
                  <Clock className="h-5 w-5 text-[var(--data-warning-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Pendientes
              </p>
              <p className={cn(
                "text-3xl font-extrabold tabular-nums leading-tight mt-2",
                pendingCount > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]",
              )}>
                {pendingCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Por revisar</p>
            </button>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <CheckCircle className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Listas para aprobar
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight mt-2">
                {readyToApprove}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">KYC completo</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-error-100)]">
                  <AlertCircle className="h-5 w-5 text-[var(--data-error-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Incompletas
              </p>
              <p className={cn(
                "text-3xl font-extrabold tabular-nums leading-tight mt-2",
                incompleteCount > 0 ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)]",
              )}>
                {incompleteCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Falta KYC</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Filtros ─────────────────────────────────────────────── */}
      {apps.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mr-2">
              Filtrar
            </span>
            <button
              type="button"
              onClick={() => setFilter("pending")}
              className={cn(
                "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                filter === "pending"
                  ? "bg-primary text-white border-primary"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              Pendientes
              <span className={cn(
                "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-extrabold tabular-nums",
                filter === "pending" ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
              )}>
                {pendingCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                filter === "all"
                  ? "bg-primary text-white border-primary"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              Todas
              <span className={cn(
                "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-extrabold tabular-nums",
                filter === "all" ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
              )}>
                {apps.length}
              </span>
            </button>
            {reviewedCount > 0 && (
              <span className="ml-auto text-sm text-[var(--text-tertiary)] font-bold">
                {reviewedCount} {reviewedCount === 1 ? "ya revisada" : "ya revisadas"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── 3. Lista / Empty state ─────────────────────────────────── */}
      {loading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <FileText className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            {filter === "pending" ? "No hay solicitudes pendientes" : "No hay solicitudes"}
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            {filter === "pending"
              ? "Cuando lleguen nuevos postulantes, aparecerán acá para que los revises."
              : "Aún no se recibieron solicitudes de repartidores."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => {
            const data = parseApplicationBody(app.body);
            const isPending = !app.readAt;
            const isProcessing = processing === app.id;
            const vehicleType = app.partner?.vehicleType ?? data.vehicle;
            const kycCheck = isKycComplete(app.kyc, vehicleType);
            const canApprove = kycCheck.ok;

            return (
              <div
                key={app.id}
                className={cn(
                  "bg-[var(--surface-raised)] border rounded-2xl p-5 sm:p-6 shadow-sm transition-all",
                  isPending
                    ? "border-2 border-[var(--data-warning-500)]/40"
                    : "border-[var(--rule-base)] opacity-75",
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-xl font-extrabold shrink-0">
                      {(data.name || "?").trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                          {data.name}
                        </p>
                        {isPending ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-[var(--data-warning-100)] text-[var(--data-warning-500)]">
                            <Clock className="h-3.5 w-3.5" />
                            Pendiente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Revisado
                          </span>
                        )}
                        {app.kyc ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold",
                              kycCheck.ok
                                ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                                : "bg-[var(--data-error-100)] text-[var(--data-error-500)]",
                            )}
                          >
                            {kycCheck.ok ? (
                              <>
                                <CheckCircle className="h-3.5 w-3.5" />
                                KYC completo
                              </>
                            ) : (
                              <>
                                <AlertCircle className="h-3.5 w-3.5" />
                                KYC incompleto ({kycCheck.missing.length})
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                            Sin KYC (legacy)
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--text-secondary)]">
                        {data.dni && (
                          <span className="flex items-center gap-1.5 font-bold text-[var(--text-primary)] tabular-nums">
                            DNI {data.dni}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                          <span className="font-mono">{data.phone}</span>
                        </span>
                        {(app.partner?.zone || data.zone) && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                            {app.partner?.zone || data.zone}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <VehicleIcon type={vehicleType} className="h-4 w-4 text-[var(--text-tertiary)]" />
                          {VEHICLE_LABELS[vehicleType] ?? vehicleType}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                          {AVAILABILITY_LABELS[data.availability] ?? data.availability}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-2 font-bold">
                        Recibida:{" "}
                        {new Date(app.createdAt).toLocaleDateString("es-PE", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAction(app.id, "approve")}
                        disabled={isProcessing || !canApprove}
                        title={canApprove ? "Aprobar repartidor" : `Falta: ${kycCheck.missing.join(", ")}`}
                        className="inline-flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-bold bg-[var(--accent-soft)] text-[var(--data-success-500)] border border-[var(--data-success-500)]/30 hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ThumbsUp className="h-4 w-4" />
                        {isProcessing ? "..." : "Aprobar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction(app.id, "reject")}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-bold bg-[var(--data-error-50)] text-[var(--data-error-500)] border border-[var(--data-error-500)]/30 hover:bg-[var(--data-error-100)] disabled:opacity-50 transition-colors"
                      >
                        <ThumbsDown className="h-4 w-4" />
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>

                {/* KYC details */}
                {app.kyc && (
                  <div className="mt-3 grid sm:grid-cols-2 gap-3 pt-3 border-t border-[var(--rule-base)]">
                    <KycSection
                      title="Identidad"
                      rows={[
                        ["DNI", app.kyc.kyc.dni],
                        ["Fecha nacimiento", app.kyc.kyc.birthDate],
                      ]}
                    />
                    {app.kyc.kyc.license ? (
                      <KycSection
                        title="Licencia"
                        rows={[
                          ["Categoría", app.kyc.kyc.license.category ?? "—"],
                          ["Número", app.kyc.kyc.license.number ?? "—"],
                          ["Vence", app.kyc.kyc.license.expiresAt ?? "—"],
                        ]}
                      />
                    ) : (
                      <div className="text-xs text-[var(--text-tertiary)]">
                        Vehículo no motorizado — sin licencia.
                      </div>
                    )}
                    {app.kyc.kyc.vehicle && (
                      <KycSection
                        title="Vehículo / SOAT"
                        rows={[
                          ["Placa", app.kyc.kyc.vehicle.plate ?? "—"],
                          ["SOAT", app.kyc.kyc.vehicle.soatNumber ?? "—"],
                          ["Vence SOAT", app.kyc.kyc.vehicle.soatExpiresAt ?? "—"],
                        ]}
                      />
                    )}
                    <KycSection
                      title="Consentimientos"
                      rows={[
                        ["Términos", app.kyc.consents.acceptedTerms ? "✔" : "✗"],
                        ["Privacidad (Ley 29733)", app.kyc.consents.acceptedPrivacy ? "✔" : "✗"],
                        ["18+ confirmado", app.kyc.consents.confirmAdult ? "✔" : "✗"],
                        [
                          "Aceptado el",
                          new Date(app.kyc.consents.acceptedAt).toLocaleDateString("es-PE"),
                        ],
                      ]}
                    />
                    {!kycCheck.ok && (
                      <div className="sm:col-span-2 rounded-xl bg-[var(--data-error-100)] text-[var(--data-error-500)] px-3 py-2 text-xs font-bold">
                        Faltan datos para aprobar: {kycCheck.missing.join(" · ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KycSection({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] px-3 py-2.5">
      <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
        {title}
      </p>
      <dl className="space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 text-xs">
            <dt className="text-[var(--text-tertiary)]">{k}</dt>
            <dd className="font-bold text-[var(--text-primary)] truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
interface DeliveryKPIs {
  activePartners: number;
  deliveriesToday: number;
  pendingDeliveries: number;
}


// ── Tipos/helpers movidos de DeliveryPartnersModule (refactor 2026-06-15) ──
interface DriverKycSummary {
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

interface DriverApplication {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  partner: { id: string; isActive: boolean; vehicleType: string; zone: string } | null;
  kyc: DriverKycSummary | null;
}

function parseApplicationBody(body: string) {
  // Soporta dos formatos:
  //   v1 legacy:   "Name (Phone) - Zona: zone - Vehículo: type - Horario: avail"
  //   v2 KYC:      "Name · DNI 12345678 | Tel 999333222 | ... | Horario: full"
  const v1 = body.match(
    /^(.+?)\s*\((.+?)\)\s*-\s*Zona:\s*(.+?)\s*-\s*Vehículo:\s*(.+?)\s*-\s*Horario:\s*(.+)$/,
  );
  if (v1) {
    return {
      name: v1[1].trim(),
      phone: v1[2].trim(),
      zone: v1[3].trim(),
      vehicle: v1[4].trim(),
      availability: v1[5].trim(),
      dni: "",
    };
  }
  // v2: extraer por tokens.
  const nameMatch = body.match(/^([^·|]+)/);
  const phoneMatch = body.match(/Tel\s+(\d{6,15})/i);
  const dniMatch = body.match(/DNI\s+(\d{8})/i);
  const vehicleMatch = body.match(/Vehículo:\s*([^·|]+)/i);
  const availMatch = body.match(/Horario:\s*([^·|]+)/i);
  return {
    name: nameMatch?.[1]?.trim() ?? body,
    phone: phoneMatch?.[1] ?? "",
    zone: "",
    vehicle: vehicleMatch?.[1]?.trim()?.split(/\s+/)?.[0] ?? "",
    availability: availMatch?.[1]?.trim() ?? "",
    dni: dniMatch?.[1] ?? "",
  };
}

/** Verifica que el KYC esté completo según el tipo de vehículo (gate de aprobación). */
function isKycComplete(kyc: DriverKycSummary | null, vehicleType: string): { ok: boolean; missing: string[] } {
  if (!kyc) return { ok: false, missing: ["KYC no enviado (formulario antiguo)"] };
  const missing: string[] = [];
  if (!/^\d{8}$/.test(kyc.kyc.dni)) missing.push("DNI inválido");
  if (!kyc.kyc.birthDate) missing.push("Fecha de nacimiento");
  if (!kyc.consents.acceptedTerms) missing.push("Términos no aceptados");
  if (!kyc.consents.acceptedPrivacy) missing.push("Privacidad no aceptada");
  if (!kyc.consents.confirmAdult) missing.push("Edad no confirmada");
  // FIX 2026-05-06: case-insensitive — VEHICLE_TYPES en UI usa "Moto"/"Auto"
  // (capital), antes la comparación lowercase saltaba la validación de
  // licencia/SOAT silenciosamente — riesgo legal/operacional crítico.
  const vt = (vehicleType ?? "").toLowerCase();
  const isMotor = vt === "moto" || vt === "auto";
  if (isMotor) {
    if (!kyc.kyc.license?.number) missing.push("Licencia");
    if (!kyc.kyc.license?.category) missing.push("Categoría licencia");
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

const AVAILABILITY_LABELS: Record<string, string> = {
  manana: "Mañana",
  tarde: "Tarde",
  noche: "Noche",
  full: "Todo el día",
  fines: "Fines de semana",
};

const VEHICLE_LABELS: Record<string, string> = {
  moto: "Moto",
  bicicleta: "Bicicleta",
  auto: "Auto",
  a_pie: "A pie",
};
