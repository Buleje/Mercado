"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import {
  X, CreditCard, Banknote, Star, ShoppingBag,
  MessageCircle, Printer, AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Fiado = {
  id: string;
  descripcion: string;
  total: number;
  saldo: number;
  fechaCreacion: string;
  fechaVence: string | null;
};

type CuotaPendiente = {
  id: string;
  número: number;
  monto: number;
  fechaVence: string;
  status: string;
};

type Prestamo = {
  id: string;
  monto: number;
  saldoPendiente: number;
  cuotasPendientes: CuotaPendiente[];
  fechaCreacion: string;
};

type Compra = {
  id: string;
  total: number;
  status: string;
  metodoPago: string;
  fecha: string;
};

type EstadoCuentaData = {
  cliente: {
    phone: string;
    name: string;
    loyaltyPoints: number;
    loyaltyTier: string;
    totalSpent: number;
  };
  resumen: {
    totalFiados: number;
    fiadosActivos: number;
    totalPrestamos: number;
    prestamosActivos: number;
    cuotasPendientes: number;
    puntosLealtad: number;
    tierLealtad: string;
    ultimaCompra: string | null;
  };
  fiados: Fiado[];
  prestamos: Prestamo[];
  ultimasCompras: Compra[];
};

type Props = {
  customerPhone: string;
  customerName?: string;
  onClose: () => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

function fmtRelative(iso: string | null) {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  return `hace ${Math.floor(days / 30)}m`;
}

function buildWhatsAppText(data: EstadoCuentaData): string {
  const lines: string[] = [];
  lines.push(`*Estado de Cuenta — ${data.cliente.name}*`);
  lines.push(`Fecha: ${new Date().toLocaleDateString("es-PE")}`);
  lines.push("═══════════════════");

  if (data.fiados.length > 0) {
    lines.push("");
    lines.push(`*Fiados pendientes: ${fmt(data.resumen.totalFiados)}*`);
    for (const f of data.fiados) {
      lines.push(`  • ${f.descripcion || "Sin desc."} → ${fmt(f.saldo)}`);
    }
  }

  if (data.prestamos.length > 0) {
    lines.push("");
    lines.push(`*Préstamos activos: ${fmt(data.resumen.totalPrestamos)}*`);
    for (const p of data.prestamos) {
      lines.push(`  • Préstamo ${fmt(p.monto)} → Saldo: ${fmt(p.saldoPendiente)} (${p.cuotasPendientes.length} cuotas)`);
    }
  }

  lines.push("");
  lines.push(`Puntos de lealtad: ${data.resumen.puntosLealtad}`);
  lines.push(`Nivel: ${data.resumen.tierLealtad}`);
  lines.push("");
  lines.push("Gracias por su preferencia.");
  return lines.join("\n");
}

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function EstadoCuentaModal({ customerPhone, customerName, onClose }: Props) {
  const [data, setData] = useState<EstadoCuentaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(customerPhone)}/estado-cuenta`);
      if (!res.ok) throw new Error("No se pudo cargar");
      setData(await res.json());
    } catch {
      setError("Error al cargar estado de cuenta");
    }
    setLoading(false);
  }, [customerPhone]);

  useEffect(() => { load(); }, [load]);

  const handleWhatsApp = () => {
    if (!data) return;
    const text = encodeURIComponent(buildWhatsAppText(data));
    const phone = customerPhone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
  };

  const handlePrint = () => window.print();

  return (
    <div className="modal-backdrop p-4">
      <div className="bg-[var(--surface-raised)] rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
          <div>
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Estado de Cuenta
            </CardTitle>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">
              {customerName ?? customerPhone}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors">
            <X className="h-5 w-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <LoadingState />
          )}

          {error && (
            <div className="text-center py-16">
              <AlertCircle className="h-10 w-10 text-[var(--data-error-500)] mx-auto mb-2" />
              <p className="text-sm text-[var(--data-error-500)]">{error}</p>
              <button onClick={load} className="mt-2 text-xs text-primary font-bold hover:underline">Reintentar</button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Banknote className="h-3.5 w-3.5 text-[var(--data-error-500)]" />
                    <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)]/70 uppercase">Fiados</p>
                  </div>
                  <p className="text-base font-extrabold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{fmt(data.resumen.totalFiados)}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)]/70">{data.resumen.fiadosActivos} activos</p>
                </div>
                <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/30 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CreditCard className="h-3.5 w-3.5 text-[var(--data-warning-500)]" />
                    <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-500)]/70 uppercase">Préstamos</p>
                  </div>
                  <p className="text-base font-extrabold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{fmt(data.resumen.totalPrestamos)}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--data-warning-500)]/70">{data.resumen.cuotasPendientes} cuotas</p>
                </div>
                <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Star className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]/70 uppercase">Puntos</p>
                  </div>
                  <p className="text-base font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{data.resumen.puntosLealtad}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]/70 capitalize">{data.resumen.tierLealtad}</p>
                </div>
                <div className="bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ShoppingBag className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
                    <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)]/70 uppercase">Últ. compra</p>
                  </div>
                  <p className="text-base font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                    {fmtRelative(data.resumen.ultimaCompra)}
                  </p>
                </div>
              </div>

              {/* Fiados table */}
              {data.fiados.length > 0 && (
                <div className="bg-white dark:bg-surface border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
                  <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-[var(--data-error-500)]" /> Fiados pendientes
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                          <th className="text-left py-2 font-bold text-[var(--text-tertiary)] uppercase">Descripción</th>
                          <th className="text-right py-2 font-bold text-[var(--text-tertiary)] uppercase">Total</th>
                          <th className="text-right py-2 font-bold text-[var(--text-tertiary)] uppercase">Saldo</th>
                          <th className="text-left py-2 font-bold text-[var(--text-tertiary)] uppercase">Fecha</th>
                          <th className="text-left py-2 font-bold text-[var(--text-tertiary)] uppercase">Vence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.fiados.map((f) => (
                          <tr key={f.id} className="border-t border-[var(--rule-base)]">
                            <td className="py-2 text-[var(--text-primary)] dark:text-[var(--text-primary)]">{f.descripcion || "Sin descripción"}</td>
                            <td className="py-2 text-right text-[var(--text-secondary)] dark:text-muted">{fmt(f.total)}</td>
                            <td className="py-2 text-right font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{fmt(f.saldo)}</td>
                            <td className="py-2 text-[var(--text-secondary)] dark:text-muted">{fmtDate(f.fechaCreacion)}</td>
                            <td className="py-2 text-[var(--text-secondary)] dark:text-muted">{f.fechaVence ? fmtDate(f.fechaVence) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] font-bold">
                          <td className="py-2 text-[var(--text-primary)] dark:text-[var(--text-primary)]">Total</td>
                          <td className="py-2 text-right text-[var(--text-secondary)] dark:text-muted">{fmt(data.fiados.reduce((s, f) => s + f.total, 0))}</td>
                          <td className="py-2 text-right text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{fmt(data.resumen.totalFiados)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Prestamos table */}
              {data.prestamos.length > 0 && (
                <div className="bg-white dark:bg-surface border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
                  <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-[var(--data-warning-500)]" /> Préstamos activos
                  </h4>
                  {data.prestamos.map((p) => (
                    <div key={p.id} className="mb-3 last:mb-0">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                          Préstamo {fmt(p.monto)} — Saldo: <span className="text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{fmt(p.saldoPendiente)}</span>
                        </span>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtDate(p.fechaCreacion)}</span>
                      </div>
                      {p.cuotasPendientes.length > 0 && (
                        <div className="bg-[var(--surface-alt)] dark:bg-[var(--surface-raised)] rounded-lg p-2 space-y-1">
                          {p.cuotasPendientes.map((c) => (
                            <div key={c.id} className="flex justify-between text-xs">
                              <span className="text-[var(--text-secondary)] dark:text-muted">Cuota #{c.número}</span>
                              <span className="text-[var(--text-secondary)] dark:text-muted">{fmtDate(c.fechaVence)}</span>
                              <span className={cn("font-bold", c.status === "atrasado" ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]")}>
                                {fmt(c.monto)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Últimas compras */}
              {data.ultimasCompras.length > 0 && (
                <div className="bg-white dark:bg-surface border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
                  <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-primary" /> Últimas compras
                  </h4>
                  <div className="space-y-1.5">
                    {data.ultimasCompras.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--rule-base)] last:border-0">
                        <span className="text-[var(--text-secondary)] dark:text-muted">{fmtDate(c.fecha)}</span>
                        <span className="text-[var(--text-secondary)] dark:text-muted capitalize">{c.metodoPago ?? "efectivo"}</span>
                        <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
                          c.status === "entregado" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]" :
                          c.status === "cancelado" ? "bg-[var(--data-error-50)] text-[var(--data-error-500)] dark:bg-red-950/30 dark:text-[var(--data-error-500)]" :
                          "bg-[var(--data-warning-50)] text-[var(--data-warning-500)] dark:bg-amber-950/30 dark:text-[var(--data-warning-500)]"
                        )}>
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                        <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(c.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 p-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
          <button
            onClick={handlePrint}
            disabled={!data}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button
            onClick={handleWhatsApp}
            disabled={!data}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#25D366] text-white text-sm font-bold hover:bg-[#1ebe5d] transition-colors disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
