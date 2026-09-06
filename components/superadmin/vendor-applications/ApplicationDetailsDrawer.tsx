"use client";

/**
 * ApplicationDetailsDrawer — Drawer con detalle completo de aplicación.
 *
 * Mejoras:
 *  - Fullscreen en mobile (max-w-full sm:max-w-lg)
 *  - ESC cierra
 *  - Copy-to-clipboard en RUC / teléfono / email
 *  - Botón "Reabrir" para rechazadas (acción reopen)
 *  - Touch targets ≥44px en mobile
 *  - Focus visible
 */

import { useState, useEffect, useRef } from "react";
import {
  X,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  Package,
  Calendar,
  Wallet,
  Copy,
  RotateCcw,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { VendorIdentityBadge } from "./VendorIdentityBadge";
import { ApplicationScoreBreakdown } from "./ApplicationScoreBadge";
import type { ApplicationScore } from "@/lib/marketplace/application-score";

export interface VendorApplication {
  id: string;
  businessName: string;
  ownerName: string;
  ruc: string;
  phone: string;
  email: string;
  district: string;
  address: string;
  category: string;
  monthlyRevenue: string;
  productsCount: number;
  hasDelivery: boolean;
  hasPos: boolean;
  description: string;
  status: "pendiente" | "aprobada" | "rechazada" | "info_solicitada";
  submittedAt: string;
  reviewedAt?: string;
  rejectReason?: string;
  requestedInfo?: string;
  score: ApplicationScore;
}

function fmtDate(iso: string) {
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

interface Props {
  application: VendorApplication;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onRequestInfo: (id: string, info: string) => void;
  onReopen?: (id: string) => void;
  /** Optional copy-to-clipboard helper from parent (shows toast). */
  onCopy?: (text: string, label: string) => void;
}

export function ApplicationDetailsDrawer({
  application,
  onClose,
  onApprove,
  onReject,
  onRequestInfo,
  onReopen,
  onCopy,
}: Props) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [requestingInfo, setRequestingInfo] = useState(false);
  const [info, setInfo] = useState("");
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // ESC cierra (cuando no hay un sub-form abierto)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (rejecting) {
        setRejecting(false);
        return;
      }
      if (requestingInfo) {
        setRequestingInfo(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handler);
    // Auto-focus al cerrar para que TAB no salga al fondo
    closeBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", handler);
  }, [rejecting, requestingInfo, onClose]);

  // Bloqueo de scroll del body
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleReject = () => {
    if (!reason.trim()) return;
    onReject(application.id, reason);
    setRejecting(false);
  };

  const handleRequestInfo = () => {
    if (!info.trim()) return;
    onRequestInfo(application.id, info);
    setRequestingInfo(false);
  };

  const handleCopy = async (text: string, label: string) => {
    if (onCopy) {
      onCopy(text, label);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* noop — feature de comodidad */
    }
  };

  const statusStyles = {
    pendiente: "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200",
    aprobada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
    rechazada: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
    info_solicitada: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  } as const;

  const statusLabels = {
    pendiente: "Pendiente",
    aprobada: "Aprobada",
    rechazada: "Rechazada",
    info_solicitada: "Info solicitada",
  } as const;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- backdrop modal (cierra al click; Escape también cierra)
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- contenedor del drawer: stopPropagation, no interactivo */}
      <div
        className="bg-white dark:bg-gray-900 w-full max-w-full sm:max-w-lg h-full shadow-2xl overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 z-10 flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-linear-to-br from-[var(--accent)] to-emerald-500 text-white flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="drawer-title"
                className="font-extrabold text-base text-gray-900 dark:text-white truncate"
              >
                {application.businessName}
              </h3>
              <p className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] font-mono truncate">
                {application.id}
              </p>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Cerrar"
            className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-gray-500 dark:text-[var(--text-tertiary)] hover:text-gray-900 dark:hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 sm:space-y-5 flex-1">
          {/* Estado */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Estado</span>
            <span
              className={cn(
                "inline-flex px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider",
                statusStyles[application.status],
              )}
            >
              {statusLabels[application.status]}
            </span>
          </div>

          {/* Triage de revisión (completitud + riesgo) */}
          <ApplicationScoreBreakdown score={application.score} />

          {/* Info del negocio */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 dark:text-[var(--text-tertiary)] uppercase tracking-wide">
              Datos del negocio
            </p>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
              <InfoRow
                icon={<Building2 className="h-4 w-4 text-gray-400" />}
                label="Razón social"
                value={application.businessName}
              />
              <InfoRow
                icon={<FileText className="h-4 w-4 text-gray-400" />}
                label="RUC"
                value={application.ruc}
                onCopy={() => handleCopy(application.ruc, "RUC")}
              />
              <InfoRow
                icon={<Package className="h-4 w-4 text-gray-400" />}
                label="Categoría"
                value={application.category}
              />
              <InfoRow
                icon={<Wallet className="h-4 w-4 text-gray-400" />}
                label="Ingreso mensual estimado"
                value={application.monthlyRevenue}
              />
            </div>
          </div>

          {/* Verificación de identidad — TD-058 */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 dark:text-[var(--text-tertiary)] uppercase tracking-wide">
              Verificación de identidad
            </p>
            <VendorIdentityBadge ruc={application.ruc} ownerName={application.ownerName} />
            <p className="text-[length:var(--ts-2xs)] text-gray-400">
              Consulta RENIEC/SUNAT en vivo. Resultados cacheados 24h. No se persiste — sirve para
              decidir si aprobar.
            </p>
          </div>

          {/* Contacto */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 dark:text-[var(--text-tertiary)] uppercase tracking-wide">
              Contacto
            </p>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
              <InfoRow
                icon={<User className="h-4 w-4 text-gray-400" />}
                label="Propietario"
                value={application.ownerName}
              />
              <InfoRow
                icon={<Phone className="h-4 w-4 text-gray-400" />}
                label="Teléfono"
                value={application.phone}
                href={`tel:${application.phone}`}
                onCopy={() => handleCopy(application.phone, "Teléfono")}
              />
              <InfoRow
                icon={<Mail className="h-4 w-4 text-gray-400" />}
                label="Email"
                value={application.email}
                href={`mailto:${application.email}`}
                onCopy={() => handleCopy(application.email, "Email")}
              />
            </div>
          </div>

          {/* Ubicación */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 dark:text-[var(--text-tertiary)] uppercase tracking-wide">
              Ubicación
            </p>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
              <InfoRow
                icon={<MapPin className="h-4 w-4 text-gray-400" />}
                label="Distrito"
                value={application.district}
              />
              <InfoRow
                icon={<MapPin className="h-4 w-4 text-gray-400" />}
                label="Dirección"
                value={application.address}
              />
            </div>
          </div>

          {/* Capacidades */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 dark:text-[var(--text-tertiary)] uppercase tracking-wide">
              Capacidades
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                <p className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">Productos</p>
                <p className="text-lg font-extrabold text-gray-900 dark:text-white">
                  {application.productsCount}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                <p className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">
                  Funcionalidades
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {application.hasDelivery && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[length:var(--ts-xs)] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
                      Delivery
                    </span>
                  )}
                  {application.hasPos && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[length:var(--ts-xs)] font-bold bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">
                      POS
                    </span>
                  )}
                  {!application.hasDelivery && !application.hasPos && (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Descripción */}
          {application.description && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 dark:text-[var(--text-tertiary)] uppercase tracking-wide">
                Descripción
              </p>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {application.description}
                </p>
              </div>
            </div>
          )}

          {/* Cronología */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 dark:text-[var(--text-tertiary)] uppercase tracking-wide">
              Cronología
            </p>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Enviada
                </span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {fmtDate(application.submittedAt)}
                </span>
              </div>
              {application.reviewedAt && (
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Revisada
                  </span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {fmtDate(application.reviewedAt)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Motivos previos */}
          {application.rejectReason && (
            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl">
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wide mb-1">
                Motivo de rechazo
              </p>
              <p className="text-sm text-rose-800 dark:text-rose-200">{application.rejectReason}</p>
            </div>
          )}
          {application.requestedInfo && (
            <div className="p-3 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 rounded-xl">
              <p className="text-xs font-bold text-sky-700 dark:text-sky-300 uppercase tracking-wide mb-1">
                Info solicitada
              </p>
              <p className="text-sm text-sky-800 dark:text-sky-200">{application.requestedInfo}</p>
            </div>
          )}

          {/* Forms de acción */}
          {rejecting && (
            <div className="space-y-2 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl">
              <div className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>El solicitante recibirá un email con el motivo. Podrá volver a aplicar luego.</p>
              </div>
              <label
                htmlFor="reject-reason"
                className="text-xs font-bold text-gray-700 dark:text-gray-300"
              >
                Motivo del rechazo
              </label>
              <textarea
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Explica el motivo de forma clara y constructiva..."
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm resize-none focus:outline-none focus:border-[var(--accent)]"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setRejecting(false)}
                  className="flex-1 h-11 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Volver
                </button>
                <button
                  onClick={handleReject}
                  disabled={!reason.trim()}
                  className="flex-1 h-11 rounded-lg text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                >
                  Confirmar rechazo
                </button>
              </div>
            </div>
          )}

          {requestingInfo && (
            <div className="space-y-2 p-3 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 rounded-xl">
              <div className="flex items-start gap-2 text-xs text-sky-700 dark:text-sky-300">
                <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  El solicitante recibirá un email con tu mensaje y podrá completar la info
                  faltante.
                </p>
              </div>
              <label
                htmlFor="info-needed"
                className="text-xs font-bold text-gray-700 dark:text-gray-300"
              >
                Info que necesitas
              </label>
              <textarea
                id="info-needed"
                value={info}
                onChange={(e) => setInfo(e.target.value)}
                rows={3}
                placeholder="Ej: Enviar foto del letrero exterior, copia del RUC, etc..."
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm resize-none focus:outline-none focus:border-[var(--accent)]"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setRequestingInfo(false)}
                  className="flex-1 h-11 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Volver
                </button>
                <button
                  onClick={handleRequestInfo}
                  disabled={!info.trim()}
                  className="flex-1 h-11 rounded-lg text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50"
                >
                  Enviar solicitud
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Acciones principales — sticky footer en mobile */}
        {application.status === "pendiente" && !rejecting && !requestingInfo && (
          <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 p-4 sm:p-5 space-y-2">
            <button
              onClick={() => onApprove(application.id)}
              className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <CheckCircle className="h-5 w-5" />
              Aprobar solicitud
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRequestingInfo(true)}
                className="inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-bold text-sky-700 bg-sky-100 hover:bg-sky-200 dark:text-sky-200 dark:bg-sky-500/15 dark:hover:bg-sky-500/25 transition-colors"
              >
                <MessageSquare className="h-4 w-4" />
                Solicitar info
              </button>
              <button
                onClick={() => setRejecting(true)}
                className="inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 dark:text-rose-200 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 transition-colors"
              >
                <X className="h-4 w-4" />
                Rechazar
              </button>
            </div>
          </div>
        )}

        {application.status === "rechazada" && onReopen && (
          <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 p-4 sm:p-5">
            <button
              onClick={() => onReopen(application.id)}
              className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-extrabold text-white bg-teal-600 hover:bg-teal-700 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            >
              <RotateCcw className="h-5 w-5" />
              Reabrir aplicación
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  href,
  onCopy,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 gap-3">
      <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] flex items-center gap-1.5 shrink-0">
        {icon}
        {label}
      </span>
      <div className="flex items-center gap-1 min-w-0">
        {href ? (
          <a
            href={href}
            className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-right break-words min-w-0 hover:text-[var(--accent)] hover:underline"
          >
            {value}
          </a>
        ) : (
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-right break-words min-w-0">
            {value}
          </span>
        )}
        {onCopy && (
          <button
            onClick={onCopy}
            aria-label={`Copiar ${label}`}
            title={`Copiar ${label}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:text-[var(--accent)] hover:bg-gray-100 dark:hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-800 shrink-0"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
