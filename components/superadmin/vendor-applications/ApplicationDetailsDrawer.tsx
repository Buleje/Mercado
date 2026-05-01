"use client";

/**
 * ApplicationDetailsDrawer — Drawer con detalle completo de aplicación.
 *
 * Muestra toda la info recopilada en el wizard /vender/registro y
 * permite aprobar, rechazar o pedir más info.
 */

import { useState } from "react";
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
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

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
}

export function ApplicationDetailsDrawer({
  application,
  onClose,
  onApprove,
  onReject,
  onRequestInfo,
}: Props) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [requestingInfo, setRequestingInfo] = useState(false);
  const [info, setInfo] = useState("");

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

  const statusStyles = {
    pendiente: "bg-[var(--data-warning-100)] text-[var(--data-warning)]",
    aprobada: "bg-[var(--data-success-100)] text-[var(--data-success)]",
    rechazada: "bg-[var(--data-error-100)] text-[var(--data-error)]",
    info_solicitada: "bg-[var(--data-info-100)] text-[var(--data-info)]",
  };

  const statusLabels = {
    pendiente: "Pendiente",
    aprobada: "Aprobada",
    rechazada: "Rechazada",
    info_solicitada: "Info solicitada",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full max-w-lg h-full shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-linear-to-br from-teal-500 to-emerald-500 text-white flex items-center justify-center">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-gray-900 dark:text-white">{application.businessName}</h3>
              <p className="text-xs text-gray-500">{application.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Estado */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Estado</span>
            <span className={cn("inline-flex px-3 py-1 rounded-full text-xs font-bold", statusStyles[application.status])}>
              {statusLabels[application.status]}
            </span>
          </div>

          {/* Info del negocio */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Datos del negocio</p>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
              <InfoRow icon={<Building2 className="h-4 w-4 text-gray-400" />} label="Razón social" value={application.businessName} />
              <InfoRow icon={<FileText className="h-4 w-4 text-gray-400" />} label="RUC" value={application.ruc} />
              <InfoRow icon={<Package className="h-4 w-4 text-gray-400" />} label="Categoría" value={application.category} />
              <InfoRow icon={<Wallet className="h-4 w-4 text-gray-400" />} label="Ingreso mensual estimado" value={application.monthlyRevenue} />
            </div>
          </div>

          {/* Contacto */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Contacto</p>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
              <InfoRow icon={<User className="h-4 w-4 text-gray-400" />} label="Propietario" value={application.ownerName} />
              <InfoRow icon={<Phone className="h-4 w-4 text-gray-400" />} label="Teléfono" value={application.phone} />
              <InfoRow icon={<Mail className="h-4 w-4 text-gray-400" />} label="Email" value={application.email} />
            </div>
          </div>

          {/* Ubicación */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Ubicación</p>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
              <InfoRow icon={<MapPin className="h-4 w-4 text-gray-400" />} label="Distrito" value={application.district} />
              <InfoRow icon={<MapPin className="h-4 w-4 text-gray-400" />} label="Dirección" value={application.address} />
            </div>
          </div>

          {/* Capacidades */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Capacidades</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                <p className="text-xs text-gray-500">Productos</p>
                <p className="text-lg font-extrabold text-gray-900 dark:text-white">{application.productsCount}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                <p className="text-xs text-gray-500">Funcionalidades</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {application.hasDelivery && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[length:var(--ts-xs)] font-bold bg-[var(--data-success-100)] text-[var(--data-success)]">
                      Delivery
                    </span>
                  )}
                  {application.hasPos && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[length:var(--ts-xs)] font-bold bg-[var(--data-info-100)] text-[var(--data-info)]">
                      POS
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Descripción */}
          {application.description && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Descripción</p>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {application.description}
                </p>
              </div>
            </div>
          )}

          {/* Cronología */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Cronología</p>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Enviada
                </span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {fmtDate(application.submittedAt)}
                </span>
              </div>
              {application.reviewedAt && (
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs text-gray-500 flex items-center gap-1.5">
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
            <div className="p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl">
              <p className="text-xs font-bold text-[var(--data-error)] uppercase tracking-wide mb-1">Motivo de rechazo</p>
              <p className="text-sm text-[var(--data-error)]">{application.rejectReason}</p>
            </div>
          )}
          {application.requestedInfo && (
            <div className="p-3 bg-[var(--data-info-50)] border border-[var(--data-info)] rounded-xl">
              <p className="text-xs font-bold text-[var(--data-info)] uppercase tracking-wide mb-1">Info solicitada</p>
              <p className="text-sm text-[var(--data-info)]">{application.requestedInfo}</p>
            </div>
          )}

          {/* Forms de acción */}
          {rejecting && (
            <div className="space-y-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl">
              <div className="flex items-start gap-2 text-xs text-[var(--data-error)]">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>El solicitante recibirá un email con el motivo. Podrá volver a aplicar luego.</p>
              </div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Motivo del rechazo</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Explica el motivo de forma clara y constructiva..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setRejecting(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  Volver
                </button>
                <button
                  onClick={handleReject}
                  disabled={!reason.trim()}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-[var(--data-error)] hover:bg-[var(--data-error)] disabled:opacity-50"
                >
                  Confirmar rechazo
                </button>
              </div>
            </div>
          )}

          {requestingInfo && (
            <div className="space-y-2 p-3 bg-[var(--data-info-50)] border border-[var(--data-info)] rounded-xl">
              <div className="flex items-start gap-2 text-xs text-[var(--data-info)]">
                <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
                <p>El solicitante recibirá un email con tu mensaje y podrá completar la info faltante.</p>
              </div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Info que necesitas</label>
              <textarea
                value={info}
                onChange={(e) => setInfo(e.target.value)}
                rows={3}
                placeholder="Ej: Enviar foto del letrero exterior, copia del RUC, etc..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setRequestingInfo(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  Volver
                </button>
                <button
                  onClick={handleRequestInfo}
                  disabled={!info.trim()}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-[var(--data-info)] hover:bg-[var(--data-info)] disabled:opacity-50"
                >
                  Enviar solicitud
                </button>
              </div>
            </div>
          )}

          {/* Acciones principales */}
          {application.status === "pendiente" && !rejecting && !requestingInfo && (
            <div className="space-y-2 pt-2">
              <button
                onClick={() => onApprove(application.id)}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-[var(--data-success)] hover:bg-[var(--data-success)] transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Aprobar solicitud
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRequestingInfo(true)}
                  className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-[var(--data-info)] bg-[var(--data-info-50)] hover:bg-[var(--data-info-100)] transition-colors"
                >
                  <MessageSquare className="h-4 w-4" />
                  Solicitar info
                </button>
                <button
                  onClick={() => setRejecting(true)}
                  className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-[var(--data-error)] bg-[var(--data-error-50)] hover:bg-[var(--data-error-100)] transition-colors"
                >
                  <X className="h-4 w-4" />
                  Rechazar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 gap-3">
      <span className="text-xs text-gray-500 flex items-center gap-1.5 shrink-0">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-right break-words min-w-0">
        {value}
      </span>
    </div>
  );
}
