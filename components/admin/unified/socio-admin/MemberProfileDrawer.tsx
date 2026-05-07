"use client";

import { CardTitle } from "@buleje/design-system";
/**
 * MemberProfileDrawer — Drawer lateral con perfil de miembro Socio Buleje.
 *
 * Muestra historial de compras, cashback acumulado, ofertas aprovechadas
 * y permite extender gratis o cancelar membresía.
 */

import { useState } from "react";
import {
  X,
  User,
  Wallet,
  ShoppingBag,
  Gift,
  Calendar,
  Award,
  AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface SocioMember {
  id: string;
  name: string;
  phone: string;
  email?: string;
  plan: "mensual" | "anual";
  status: "activo" | "pausado" | "cancelado";
  startDate: string;
  renewsAt: string;
  monthlyFee: number;
  totalCashback: number;
  totalSpent: number;
  ordersCount: number;
  offersUsed: number;
  lastOrder?: string;
}

const PLAN_LABELS: Record<SocioMember["plan"], string> = {
  mensual: "Mensual",
  anual: "Anual",
};

const STATUS_STYLES: Record<SocioMember["status"], string> = {
  activo: "bg-[var(--data-success-100)] text-[var(--data-success-500)]",
  pausado: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
  cancelado: "bg-gray-100 text-[var(--text-secondary)]",
};

const STATUS_LABELS: Record<SocioMember["status"], string> = {
  activo: "Activo",
  pausado: "Pausado",
  cancelado: "Cancelado",
};

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  member: SocioMember;
  onClose: () => void;
  onExtend: (id: string, months: number) => void;
  onCancel: (id: string, reason: string) => void;
}

export function MemberProfileDrawer({ member, onClose, onExtend, onCancel }: Props) {
  const [extending, setExtending] = useState(false);
  const [months, setMonths] = useState(1);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const handleExtend = () => {
    onExtend(member.id, months);
    setExtending(false);
  };

  const handleCancel = () => {
    if (!reason.trim()) return;
    onCancel(member.id, reason);
    setCancelling(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-linear-to-br from-[var(--accent)] to-[var(--data-success-500)] text-white flex items-center justify-center font-bold">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <CardTitle className="font-extrabold text-[var(--text-primary)]">{member.name}</CardTitle>
              <p className="text-xs text-[var(--text-secondary)]">Socio Buleje · {PLAN_LABELS[member.plan]}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Estado */}
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <span className="text-sm font-semibold text-[var(--text-secondary)]">Estado</span>
            <span className={cn("inline-flex px-3 py-1 rounded-full text-xs font-bold", STATUS_STYLES[member.status])}>
              {STATUS_LABELS[member.status]}
            </span>
          </div>

          {/* Contacto */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Contacto</p>
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-[var(--text-tertiary)]" />
                <span className="font-semibold text-[var(--text-primary)]">{member.phone}</span>
              </div>
              {member.email && (
                <p className="text-xs text-[var(--text-secondary)] ml-6">{member.email}</p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-primary" />
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Cashback</p>
              </div>
              <p className="text-xl font-extrabold text-primary">{fmt(member.totalCashback)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="h-4 w-4 text-[var(--data-info-500)]" />
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Gastado</p>
              </div>
              <p className="text-xl font-extrabold text-[var(--text-primary)]">{fmt(member.totalSpent)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Award className="h-4 w-4 text-[var(--data-warning-500)]" />
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Ofertas usadas</p>
              </div>
              <p className="text-xl font-extrabold text-[var(--text-primary)]">{member.offersUsed}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="h-4 w-4 text-[var(--data-info-500)]" />
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Pedidos</p>
              </div>
              <p className="text-xl font-extrabold text-[var(--text-primary)]">{member.ordersCount}</p>
            </div>
          </div>

          {/* Suscripción */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Suscripción</p>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Inicio
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{fmtDate(member.startDate)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Próxima renovación
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{fmtDate(member.renewsAt)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-[var(--text-secondary)]">Cuota mensual</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{fmt(member.monthlyFee)}</span>
              </div>
              {member.lastOrder && (
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs text-[var(--text-secondary)]">Último pedido</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{fmtDate(member.lastOrder)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Extend form */}
          {extending && (
            <div className="space-y-2 p-3 bg-[var(--data-success-50)] border border-[var(--data-success-500)] rounded-xl">
              <label className="text-xs font-bold text-[var(--text-primary)]">Extender membresía gratis</label>
              <select
                value={months}
                onChange={(e) => setMonths(parseInt(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                <option value={1}>1 mes adicional</option>
                <option value={3}>3 meses adicionales</option>
                <option value={6}>6 meses adicionales</option>
                <option value={12}>12 meses adicionales</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setExtending(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleExtend}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-[var(--data-success-500)] hover:bg-[var(--data-success-500)]"
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}

          {/* Cancel form */}
          {cancelling && (
            <div className="space-y-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl">
              <div className="flex items-start gap-2 text-xs text-[var(--data-error-500)]">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>La cancelación es definitiva. El cliente pierde acceso a precios Socio inmediatamente.</p>
              </div>
              <label className="text-xs font-bold text-[var(--text-primary)]">Motivo de cancelación</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Ej: Solicitud del cliente, impago..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setCancelling(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200"
                >
                  Volver
                </button>
                <button
                  onClick={handleCancel}
                  disabled={!reason.trim()}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] disabled:opacity-50"
                >
                  Confirmar cancelación
                </button>
              </div>
            </div>
          )}

          {/* Acciones */}
          {!extending && !cancelling && member.status === "activo" && (
            <div className="space-y-2 pt-2">
              <button
                onClick={() => setExtending(true)}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-[var(--data-success-500)] bg-[var(--data-success-50)] hover:bg-[var(--data-success-100)] transition-colors"
              >
                <Gift className="h-4 w-4" />
                Extender membresía gratis
              </button>
              <button
                onClick={() => setCancelling(true)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--data-error-500)] bg-[var(--data-error-50)] hover:bg-[var(--data-error-100)] transition-colors"
              >
                Cancelar membresía
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
