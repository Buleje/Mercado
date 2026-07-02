"use client";

/**
 * CacaoVentas — registro de ventas de cacao seco (ADR-128 v3). Self-fetch.
 * KPIs (ventas, kg vendido, ingresos, precio prom, FOB), tabla, anular,
 * export CSV y modal de nueva venta. Las ventas descuentan del inventario.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Coins,
  Plus,
  Search,
  RefreshCw,
  Download,
  AlertCircle,
  AlertTriangle,
  Globe,
  Scale,
  TrendingUp,
  Printer,
  Wallet,
  Loader2,
  Leaf,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  ESTADO_PAGO_LABEL,
  cacaoEstadoPago,
  type CacaoEstadoPago,
} from "@/lib/cacao/cacao-quality";
import { printCacaoVentasReporte } from "@/lib/cacao/cacao-liquidacion";
import CacaoVentaForm from "./CacaoVentaForm";

interface Venta {
  id: string;
  ventaCode: string;
  fecha: string;
  compradorNombre: string | null;
  canal: string | null;
  loteCode: string | null;
  pesoKg: string;
  moneda: string;
  precioPorKg: string | null;
  tipoCambio: string | null;
  totalPen: string | null;
  montoCobrado: string | null;
  estadoPago: string;
  esFob: boolean;
  variedad: string | null;
  grado: string | null;
  status: string;
}
interface Stats {
  ventas: number;
  kgVendido: number;
  ingresos: number;
  precioVentaPromKg: number;
  ventasFob: number;
  cobrado: number;
  saldoPendiente: number;
  ventasConSaldo: number;
}

const n2 = (v: string | number | null) => (v == null || v === "" ? "—" : Number(v).toFixed(2));
const fdate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
};
const CANAL_LABEL: Record<string, string> = {
  cooperativa: "Cooperativa",
  exportador: "Exportador",
  mercado_local: "Mercado local",
  otro: "Otro",
};

export default function CacaoVentas() {
  const [items, setItems] = useState<Venta[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulBusy, setAnnulBusy] = useState(false);
  const [cobro, setCobro] = useState<Venta | null>(null);
  const [cobroMonto, setCobroMonto] = useState("");
  const [cobroBusy, setCobroBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rv, rs] = await Promise.all([
        fetch("/api/admin/cacao?view=ventas", { credentials: "include" }),
        fetch("/api/admin/cacao?view=ventas-stats", { credentials: "include" }),
      ]);
      if (!rv.ok) throw new Error(`HTTP ${rv.status}`);
      setItems((await rv.json()).ventas ?? []);
      setStats(rs.ok ? ((await rs.json()).stats ?? null) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function annul() {
    if (!annulId) return;
    setAnnulBusy(true);
    try {
      const r = await fetch("/api/admin/cacao", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "annul_venta", id: annulId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setAnnulId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnnulBusy(false);
    }
  }

  function openCobro(v: Venta) {
    setCobro(v);
    setCobroMonto(v.totalPen ?? "");
  }
  async function doCobro() {
    if (!cobro) return;
    setCobroBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/cacao", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          action: "pago_venta",
          id: cobro.id,
          montoCobrado: cobroMonto === "" ? 0 : Number(cobroMonto),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setCobro(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCobroBusy(false);
    }
  }

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? items.filter(
          (v) =>
            v.ventaCode.toLowerCase().includes(q) ||
            (v.compradorNombre ?? "").toLowerCase().includes(q),
        )
      : items;
  }, [items, search]);

  function exportCsv() {
    const head = [
      "Venta",
      "Fecha",
      "Comprador",
      "Canal",
      "Kg",
      "Moneda",
      "Precio/kg",
      "Tipo cambio",
      "Total S/",
      "FOB",
    ];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = view.map((v) =>
      [
        v.ventaCode,
        v.fecha.slice(0, 10),
        v.compradorNombre,
        v.canal,
        n2(v.pesoKg),
        v.moneda,
        n2(v.precioPorKg),
        n2(v.tipoCambio),
        n2(v.totalPen),
        v.esFob ? "si" : "no",
      ]
        .map(esc)
        .join(","),
    );
    const csv = "﻿" + [head.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cacao-ventas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Ingresos por venta"
          value={`S/ ${n2(stats?.ingresos ?? 0)}`}
          subValue={`${stats?.ventas ?? 0} ventas${stats?.ventasFob ? ` · ${stats.ventasFob} FOB` : ""}`}
          icon={Coins}
          emphasis="success"
        />
        <StatCard
          label="Kg vendido"
          value={`${n2(stats?.kgVendido ?? 0)} kg`}
          subValue={`S/ ${n2(stats?.precioVentaPromKg ?? 0)}/kg prom.`}
          icon={Scale}
          emphasis="neutral"
        />
        <StatCard
          label="Cobrado"
          value={`S/ ${n2(stats?.cobrado ?? 0)}`}
          subValue="ingresado a caja"
          icon={Wallet}
          emphasis="neutral"
        />
        <StatCard
          label="Saldo por cobrar"
          value={`S/ ${n2(stats?.saldoPendiente ?? 0)}`}
          subValue={
            stats?.ventasConSaldo
              ? `${stats.ventasConSaldo} venta${stats.ventasConSaldo === 1 ? "" : "s"}`
              : "todo cobrado"
          }
          icon={TrendingUp}
          emphasis={stats && stats.saldoPendiente > 0 ? "warning" : "success"}
        />
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-12 min-w-[200px] flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o comprador…"
            className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={view.length === 0}
          className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          CSV
        </button>
        <button
          type="button"
          onClick={() =>
            stats &&
            printCacaoVentasReporte(
              view.filter((v) => v.status !== "anulado"),
              stats,
            )
          }
          disabled={view.length === 0}
          className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          Reporte
        </button>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"
        >
          <Plus className="h-5 w-5" />
          Registrar venta
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th>Venta</Th>
              <Th>Fecha</Th>
              <Th>Comprador</Th>
              <Th>Canal</Th>
              <Th className="text-right">Kg</Th>
              <Th className="text-right">Total S/</Th>
              <Th>Pago</Th>
              <Th className="text-right">Acción</Th>
            </tr>
          </thead>
          <tbody>
            {view.map((v) => {
              const total = v.totalPen == null ? 0 : Number(v.totalPen);
              const { saldo } = cacaoEstadoPago(
                total,
                v.montoCobrado == null ? null : Number(v.montoCobrado),
              );
              return (
                <tr key={v.id} className="border-t border-[var(--rule-soft)]">
                  <Td>
                    <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                      {v.ventaCode}
                    </span>
                    {v.esFob && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">
                        <Globe className="h-3 w-3" />
                        FOB
                      </span>
                    )}
                    {v.loteCode && (
                      <span
                        title={`Trazabilidad: lote ${v.loteCode}`}
                        className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]"
                      >
                        <Leaf className="h-3 w-3" />
                        {v.loteCode}
                      </span>
                    )}
                  </Td>
                  <Td className="text-[var(--text-secondary)]">{fdate(v.fecha)}</Td>
                  <Td className="text-[var(--text-primary)]">{v.compradorNombre ?? "—"}</Td>
                  <Td className="text-[var(--text-secondary)]">
                    {v.canal ? (CANAL_LABEL[v.canal] ?? v.canal) : "—"}
                  </Td>
                  <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {n2(v.pesoKg)}
                  </Td>
                  <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {v.totalPen ? `S/ ${n2(v.totalPen)}` : "—"}
                  </Td>
                  <Td>
                    <PagoBadge estado={v.estadoPago} saldo={saldo} />
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {v.status !== "anulado" && v.estadoPago !== "pagado" && total > 0 && (
                        <button
                          type="button"
                          onClick={() => openCobro(v)}
                          className="inline-flex h-8 items-center gap-1 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] px-2.5 text-xs font-bold text-[var(--data-success-700)] hover:opacity-90"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          Cobrar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAnnulId(v.id)}
                        className="inline-flex h-8 items-center rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]"
                      >
                        Anular
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && items.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-tertiary)]">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
            <p className="mt-2 text-sm">Cargando…</p>
          </div>
        ) : (
          view.length === 0 &&
          (search ? (
            <div className="p-12 text-center text-[var(--text-tertiary)]">
              <Search className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="text-base font-medium">Sin resultados.</p>
            </div>
          ) : (
            <div className="p-12 text-center text-[var(--text-tertiary)]">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Coins className="h-7 w-7" />
              </span>
              <p className="text-base font-bold text-[var(--text-primary)]">
                Sin ventas registradas
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm">
                Registrá la venta de tu cacao seco (local o exportación FOB). Se descuenta del
                inventario y verás tus ingresos.
              </p>
              <button
                type="button"
                onClick={() => setShowNew(true)}
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Registrar venta
              </button>
            </div>
          ))
        )}
      </div>

      {showNew && (
        <CacaoVentaForm
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      )}

      {cobro &&
        (() => {
          const total = cobro.totalPen == null ? 0 : Number(cobro.totalPen);
          const prev = cacaoEstadoPago(total, cobroMonto === "" ? 0 : Number(cobroMonto));
          return (
            <AdminModal open onClose={() => setCobro(null)} variant="centered-sm" hideCloseButton>
              <div className="bg-[var(--surface-raised)] p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--data-success-50)] text-[var(--data-success-700)]">
                    <Wallet className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-[var(--text-primary)]">
                      Registrar cobro · {cobro.ventaCode}
                    </h3>
                    <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
                      Total de la venta:{" "}
                      <b className="text-[var(--text-secondary)]">S/ {n2(cobro.totalPen)}</b>.
                      Ingresá el monto cobrado acumulado (anticipo + abonos).
                    </p>
                  </div>
                </div>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                    Monto cobrado (S/)
                  </span>
                  <input
                    autoFocus
                    type="number"
                    step="0.01"
                    min="0"
                    value={cobroMonto}
                    onChange={(e) => setCobroMonto(e.target.value)}
                    className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base font-mono tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm">
                  <PagoBadge estado={prev.estado} saldo={prev.saldo} />
                  <button
                    type="button"
                    onClick={() => setCobroMonto(String(total))}
                    className="text-xs font-bold text-[var(--data-success-700)] hover:underline"
                  >
                    Marcar pagado (S/ {n2(total)})
                  </button>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCobro(null)}
                    className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={cobroBusy}
                    onClick={doCobro}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--data-success-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {cobroBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wallet className="h-4 w-4" />
                    )}
                    Guardar cobro
                  </button>
                </div>
              </div>
            </AdminModal>
          );
        })()}

      {annulId && (
        <AdminModal open onClose={() => setAnnulId(null)} variant="centered-sm" hideCloseButton>
          <div className="bg-[var(--surface-raised)] p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--data-error-50)] text-[var(--data-error-600)]">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Anular venta {items.find((v) => v.id === annulId)?.ventaCode ?? ""}
                </h3>
                <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
                  Sale de los ingresos y el cacao vuelve al inventario disponible.{" "}
                  <strong className="text-[var(--text-secondary)]">No se borra</strong> — queda en
                  el historial.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAnnulId(null)}
                className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={annulBusy}
                onClick={annul}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                <AlertTriangle className="h-4 w-4" />
                {annulBusy ? "Anulando…" : "Anular venta"}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
function PagoBadge({ estado, saldo }: { estado: string; saldo: number }) {
  const cls =
    estado === "pagado"
      ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]"
      : estado === "parcial"
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]"
        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>
        {ESTADO_PAGO_LABEL[estado as CacaoEstadoPago] ?? estado}
      </span>
      {saldo > 0 && (
        <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
          S/ {saldo.toFixed(2)}
        </span>
      )}
    </span>
  );
}
