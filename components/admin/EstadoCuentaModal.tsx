"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Loader2, CreditCard, Banknote, Star, ShoppingBag,
  MessageCircle, Printer, AlertCircle,
} from "lucide-react";
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
  numero: number;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-card-border shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Estado de Cuenta
            </h3>
            <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
              {customerName ?? customerPhone}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="text-center py-16">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={load} className="mt-2 text-xs text-primary font-bold hover:underline">Reintentar</button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Banknote className="h-3.5 w-3.5 text-red-500" />
                    <p className="text-[10px] font-bold text-red-600/70 uppercase">Fiados</p>
                  </div>
                  <p className="text-base font-extrabold text-red-700 dark:text-red-400">{fmt(data.resumen.totalFiados)}</p>
                  <p className="text-[10px] text-red-500/70">{data.resumen.fiadosActivos} activos</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CreditCard className="h-3.5 w-3.5 text-amber-500" />
                    <p className="text-[10px] font-bold text-amber-600/70 uppercase">Préstamos</p>
                  </div>
                  <p className="text-base font-extrabold text-amber-700 dark:text-amber-400">{fmt(data.resumen.totalPrestamos)}</p>
                  <p className="text-[10px] text-amber-500/70">{data.resumen.cuotasPendientes} cuotas</p>
                </div>
                <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Star className="h-3.5 w-3.5 text-violet-500" />
                    <p className="text-[10px] font-bold text-violet-600/70 uppercase">Puntos</p>
                  </div>
                  <p className="text-base font-extrabold text-violet-700 dark:text-violet-400">{data.resumen.puntosLealtad}</p>
                  <p className="text-[10px] text-violet-500/70 capitalize">{data.resumen.tierLealtad}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ShoppingBag className="h-3.5 w-3.5 text-emerald-500" />
                    <p className="text-[10px] font-bold text-emerald-600/70 uppercase">Últ. compra</p>
                  </div>
                  <p className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                    {fmtRelative(data.resumen.ultimaCompra)}
                  </p>
                </div>
              </div>

              {/* Fiados table */}
              {data.fiados.length > 0 && (
                <div className="bg-white dark:bg-surface border border-gray-200 dark:border-card-border rounded-xl p-4">
                  <h4 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-red-500" /> Fiados pendientes
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-card-border">
                          <th className="text-left py-2 font-bold text-gray-400 uppercase">Descripción</th>
                          <th className="text-right py-2 font-bold text-gray-400 uppercase">Total</th>
                          <th className="text-right py-2 font-bold text-gray-400 uppercase">Saldo</th>
                          <th className="text-left py-2 font-bold text-gray-400 uppercase">Fecha</th>
                          <th className="text-left py-2 font-bold text-gray-400 uppercase">Vence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.fiados.map((f) => (
                          <tr key={f.id} className="border-t border-gray-50 dark:border-card-border">
                            <td className="py-2 text-gray-700 dark:text-foreground">{f.descripcion || "Sin descripción"}</td>
                            <td className="py-2 text-right text-gray-500 dark:text-muted">{fmt(f.total)}</td>
                            <td className="py-2 text-right font-bold text-red-600 dark:text-red-400">{fmt(f.saldo)}</td>
                            <td className="py-2 text-gray-500 dark:text-muted">{fmtDate(f.fechaCreacion)}</td>
                            <td className="py-2 text-gray-500 dark:text-muted">{f.fechaVence ? fmtDate(f.fechaVence) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 dark:border-card-border font-bold">
                          <td className="py-2 text-gray-700 dark:text-foreground">Total</td>
                          <td className="py-2 text-right text-gray-500 dark:text-muted">{fmt(data.fiados.reduce((s, f) => s + f.total, 0))}</td>
                          <td className="py-2 text-right text-red-600 dark:text-red-400">{fmt(data.resumen.totalFiados)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Prestamos table */}
              {data.prestamos.length > 0 && (
                <div className="bg-white dark:bg-surface border border-gray-200 dark:border-card-border rounded-xl p-4">
                  <h4 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-amber-500" /> Préstamos activos
                  </h4>
                  {data.prestamos.map((p) => (
                    <div key={p.id} className="mb-3 last:mb-0">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-gray-700 dark:text-foreground">
                          Préstamo {fmt(p.monto)} — Saldo: <span className="text-amber-600 dark:text-amber-400">{fmt(p.saldoPendiente)}</span>
                        </span>
                        <span className="text-[10px] text-gray-400">{fmtDate(p.fechaCreacion)}</span>
                      </div>
                      {p.cuotasPendientes.length > 0 && (
                        <div className="bg-gray-50 dark:bg-card rounded-lg p-2 space-y-1">
                          {p.cuotasPendientes.map((c) => (
                            <div key={c.id} className="flex justify-between text-xs">
                              <span className="text-gray-600 dark:text-muted">Cuota #{c.numero}</span>
                              <span className="text-gray-600 dark:text-muted">{fmtDate(c.fechaVence)}</span>
                              <span className={cn("font-bold", c.status === "atrasado" ? "text-red-600" : "text-gray-700 dark:text-foreground")}>
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
                <div className="bg-white dark:bg-surface border border-gray-200 dark:border-card-border rounded-xl p-4">
                  <h4 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-primary" /> Últimas compras
                  </h4>
                  <div className="space-y-1.5">
                    {data.ultimasCompras.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 dark:border-card-border last:border-0">
                        <span className="text-gray-500 dark:text-muted">{fmtDate(c.fecha)}</span>
                        <span className="text-gray-500 dark:text-muted capitalize">{c.metodoPago ?? "efectivo"}</span>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                          c.status === "entregado" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" :
                          c.status === "cancelado" ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400" :
                          "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                        )}>
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                        <span className="font-bold text-gray-900 dark:text-foreground">{fmt(c.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 p-4 border-t border-gray-100 dark:border-card-border shrink-0">
          <button
            onClick={handlePrint}
            disabled={!data}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button
            onClick={handleWhatsApp}
            disabled={!data}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#1ebe5d] transition-colors disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
