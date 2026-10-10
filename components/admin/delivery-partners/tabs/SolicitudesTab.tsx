"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { AlertCircle, CheckCircle, Clock, FileText, MapPin, Phone, ThumbsDown, ThumbsUp, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { TableSkeleton, VehicleIcon } from "@/components/admin/delivery-partners/shared";
import { useIndicadoresReparto } from "@/components/admin/delivery/reparto-indicadores";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { formatDateNumeric, formatDateTime } from "@/lib/format";
import { AVAILABILITY_LABELS, consentIcon, isKycComplete, KycSection, parseApplicationBody, VEHICLE_LABELS, type DriverApplication } from "../solicitudes-helpers";

export function SolicitudesTab({ selector }: { selector?: ReactNode } = {}) {
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

  const kpis = useIndicadoresReparto({
    clave: "postulantes",
    cargando: loading && apps.length === 0,
    resumen: `${pendingCount} por revisar · ${readyToApprove} ${readyToApprove === 1 ? "lista" : "listas"}`,
    indicadores: [
      { icono: FileText, rotulo: "Recibidas", valor: String(apps.length), extra: reviewedCount > 0 ? `${reviewedCount} ya ${reviewedCount === 1 ? "revisada" : "revisadas"}` : undefined },
      { icono: Clock, rotulo: "Por revisar", valor: String(pendingCount), tono: pendingCount > 0 ? "alerta" : undefined },
      {
        icono: CheckCircle,
        rotulo: "Listas para aprobar",
        valor: String(readyToApprove),
        ayuda: "Por revisar y con todos sus documentos (KYC) completos.",
        tono: readyToApprove > 0 ? "ok" : undefined,
      },
      {
        icono: AlertCircle,
        rotulo: "Les faltan documentos",
        valor: String(incompleteCount),
        ayuda: "Por revisar, pero sin todos sus documentos: aprobarlas es aceptar sin KYC completo.",
        tono: incompleteCount > 0 ? "error" : undefined,
      },
    ],
  });

  return (
    <div className="space-y-4">
      {kpis.boton}
      {kpis.panel}
      {error && (
        <div className="flex items-center gap-3 py-1 pl-4 pr-1 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-2xl text-sm text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-bold">{error}</span>
          <button aria-label="Quitar"
            type="button"
            onClick={() => setError(null)}
            className="ml-auto inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-[var(--data-error-100)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Una fila: Tu equipo / Postulantes · Por revisar / Todas. */}
      <div className="flex flex-wrap items-center gap-2">
        {selector}
        {apps.length > 0 && (
          <SegmentedControl<"pending" | "all">
            value={filter}
            onChange={setFilter}
            label="Qué solicitudes ver"
            size="lg"
            options={[
              { value: "pending", label: "Por revisar", badge: pendingCount },
              { value: "all", label: "Todas", badge: apps.length },
            ]}
          />
        )}
      </div>

      {/* ── 3. Lista / Empty state ─────────────────────────────────── */}
      {loading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-8 text-center text-sm font-semibold text-[var(--text-secondary)]">
          {filter === "pending"
            ? "No hay postulantes por revisar: cuando alguien postule desde la app, aparece acá."
            : "Todavía no llegó ninguna solicitud de repartidor."}
        </p>
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
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-[var(--accent-ink)] dark:text-[var(--accent)] text-xl font-extrabold shrink-0">
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
                                ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
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
                      <p className="text-sm text-[var(--text-secondary)] mt-2 font-bold">
                        Recibida:{" "}
                        {formatDateTime(app.createdAt)}
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
                        className="inline-flex items-center gap-2 px-4 h-12 rounded-xl text-sm font-semibold bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] border border-[var(--data-success-500)]/30 hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ThumbsUp className="h-4 w-4" />
                        {isProcessing ? "..." : "Aprobar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction(app.id, "reject")}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-2 px-4 h-12 rounded-xl text-sm font-semibold bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/30 hover:bg-[var(--data-error-100)] disabled:opacity-50 transition-colors"
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
                      <div className="text-sm text-[var(--text-secondary)]">
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
                        ["Términos", consentIcon(app.kyc.consents.acceptedTerms)],
                        ["Privacidad (Ley 29733)", consentIcon(app.kyc.consents.acceptedPrivacy)],
                        ["18+ confirmado", consentIcon(app.kyc.consents.confirmAdult)],
                        [
                          "Aceptado el",
                          formatDateNumeric(app.kyc.consents.acceptedAt),
                        ],
                      ]}
                    />
                    {!kycCheck.ok && (
                      <div className="sm:col-span-2 rounded-xl bg-[var(--data-error-100)] text-[var(--data-error-500)] px-3 py-2 text-sm font-bold">
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
