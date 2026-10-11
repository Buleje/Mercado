"use client";

/**
 * SocioMembersAdminModule — Programa Socio Buleje (membresía con precios
 * exclusivos y cashback).
 *
 * Patrón del panel: una fila de cabecera (título · Indicadores plegables · «⋯»),
 * buscador + plan + estado en una fila y «Ver perfil» por socio. Los datos
 * vienen de /api/admin/socio/* (ADR-078): ya no hay socios de ejemplo — si el
 * negocio no tiene ninguno, la lista dice que no hay.
 *
 * «Ofertas exclusivas» (`socio-admin/ExclusiveOffersTab`) ya no se monta: sólo
 * guardaba en la memoria de la pestaña (sin endpoint), así que lo creado se
 * perdía al recargar y el checkout nunca lo leía. `?sub=ofertas` cae en Socios.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, RefreshCw, RotateCcw } from "@buleje/design-system/icons";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { tenantFetch } from "@/lib/tenant-fetch";
import { LoadingState } from "@buleje/design-system";
import { useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { CabeceraVista, descargarCsv, tarjetasDe } from "@/components/admin/campanas/comun";
import { MemberProfileDrawer, type SocioMember } from "./socio-admin/MemberProfileDrawer";
import { filtrarMiembros, fmtSoles, ListaMiembros, PLAN_LABELS, SIN_FILTRO, STATUS_LABELS, type FiltroMiembros } from "./socio-admin/ListaMiembros";

const MODULE_ID = "socio-members";
const SECCIONES = ["miembros"] as const;
const ALIAS = { ofertas: "miembros" } as const;

// ── Server → SocioMember mapper (ADR-078) ─────────────────────────────────────

type ServerMember = {
  userId: string;
  plan: "monthly" | "annual";
  status: "trial" | "active" | "past_due" | "paused" | "cancelled";
  startedAt: string;
  currentPeriodEnd: string;
  cashbackBalance: number;
  totalEarned: number;
};

type ServerStats = {
  totalMembers: number;
  activeMembers: number;
  trialMembers: number;
  mrrSoles: number;
  churnRate30d: number;
  outstandingCashbackLiabilitySoles: number;
} | null;

function serverToLegacyMember(m: ServerMember): SocioMember {
  const statusMap = {
    active: "activo" as const,
    trial: "activo" as const,
    past_due: "activo" as const,
    paused: "pausado" as const,
    cancelled: "cancelado" as const,
  };
  const planMap = { monthly: "mensual" as const, annual: "anual" as const };
  const monthlyFee = m.plan === "annual" ? 15 : 19;
  return {
    id: m.userId,
    name: `Socio …${m.userId.slice(-6)}`,
    phone: "",
    plan: planMap[m.plan],
    status: statusMap[m.status],
    startDate: m.startedAt.split("T")[0] ?? m.startedAt,
    renewsAt: m.currentPeriodEnd.split("T")[0] ?? m.currentPeriodEnd,
    monthlyFee,
    totalCashback: m.cashbackBalance,
    totalSpent: 0,
    ordersCount: 0,
    offersUsed: 0,
  };
}

export default function SocioMembersAdminModule() {
  // `?sub=` por si el módulo vuelve a tener secciones; el viejo `ofertas` cae en Socios.
  useSubvistaModulo(MODULE_ID, SECCIONES, SECCIONES[0], undefined, { alias: ALIAS });
  const [members, setMembers] = useState<SocioMember[]>([]);
  const [selected, setSelected] = useState<SocioMember | null>(null);
  const [serverStats, setServerStats] = useState<ServerStats>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [filtro, setFiltro] = useState<FiltroMiembros>(SIN_FILTRO);
  const orden = useOrdenColumnas("socio-miembros", ["miembro", "plan", "renovacion", "cashback", "pedidos", "estado"]);

  // ADR-078: los socios y las cifras salen de /api/admin/socio/*.
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [membersRes, statsRes] = await Promise.all([
          fetch("/api/admin/socio/members?limit=200", { cache: "no-store", signal: ac.signal }),
          fetch("/api/admin/socio/stats", { cache: "no-store", signal: ac.signal }),
        ]);
        if (!membersRes.ok) throw new Error(`HTTP ${membersRes.status}`);
        const data = (await membersRes.json()) as { ok: boolean; members: ServerMember[] };
        setMembers(data.ok && Array.isArray(data.members) ? data.members.map(serverToLegacyMember) : []);
        if (statsRes.ok) {
          const s = (await statsRes.json()) as { ok: boolean; stats: ServerStats };
          if (s.ok) setServerStats(s.stats);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("No se pudieron cargar los socios.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [recarga]);

  const activos = members.filter((m) => m.status === "activo");
  const mrr = activos.reduce((sum, m) => sum + m.monthlyFee, 0);
  const nuevosEsteMes = useMemo(() => {
    const now = new Date();
    return members.filter((m) => {
      const d = new Date(m.startDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [members]);
  const churnEsteMes = useMemo(() => {
    const now = new Date();
    return members.filter((m) => {
      const d = new Date(m.renewsAt);
      return m.status === "cancelado" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [members]);

  const nActivos = serverStats?.activeMembers ?? activos.length;
  const ingresoMes = serverStats?.mrrSoles ?? mrr;
  const bajas = serverStats ? `${(serverStats.churnRate30d * 100).toFixed(1)} %` : String(churnEsteMes);

  const kpis = useKpisPlegables({
    claveMemoria: "socio-buleje",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: loading,
    resumen: `${nActivos} activos`,
    tarjetas: tarjetasDe([
      { rotulo: "Socios activos", valor: String(nActivos), detalle: "Membresía vigente" },
      { rotulo: "Ingreso mensual", valor: fmtSoles(ingresoMes), detalle: "Cuotas de los últimos 30 días" },
      { rotulo: "Nuevos este mes", valor: String(nuevosEsteMes), detalle: "Altas del mes en curso" },
      { rotulo: serverStats ? "Bajas (30 días)" : "Bajas este mes", valor: bajas, detalle: "Socios que se fueron", tono: (serverStats?.churnRate30d ?? 0) > 0.08 || churnEsteMes > 3 ? "aviso" : undefined },
    ]),
  });

  // Persiste la acción en el backend. Optimista; si falla se avisa y se vuelve a pedir
  // la lista para mostrar lo que de verdad quedó.
  const persistMemberAction = useCallback(async (body: { userId: string; action: "cancel" | "extend"; months?: number; reason?: string }) => {
    try {
      const res = await tenantFetch("/api/admin/socio/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(body.action === "cancel" ? "Membresía cancelada" : "Membresía extendida");
    } catch {
      toast.error("No se pudo guardar el cambio. Se vuelve a mostrar lo que hay guardado.");
      setRecarga((n) => n + 1);
    }
  }, []);

  const handleExtend = (id: string, months: number) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const current = new Date(m.renewsAt);
        current.setMonth(current.getMonth() + months);
        return { ...m, renewsAt: current.toISOString().split("T")[0] };
      }),
    );
    setSelected(null);
    void persistMemberAction({ userId: id, action: "extend", months });
  };

  const handleCancel = (id: string, reason: string) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, status: "cancelado" as const } : m)));
    setSelected(null);
    void persistMemberAction({ userId: id, action: "cancel", reason });
  };

  const filtrados = useMemo(() => filtrarMiembros(members, filtro), [members, filtro]);

  const menu: MenuAccion[] = [
    {
      id: "csv",
      label: "Descargar CSV",
      hint: `${filtrados.length} socios, con los filtros de ahora`,
      icon: Download,
      disabled: filtrados.length === 0,
      onSelect: () =>
        descargarCsv(
          "socios",
          ["Código", "Nombre", "Teléfono", "Plan", "Estado", "Inicio", "Renovación", "Cashback", "Gastado", "Pedidos"],
          filtrados.map((r) => [r.id, r.name, r.phone, PLAN_LABELS[r.plan], STATUS_LABELS[r.status], r.startDate, r.renewsAt, Number(r.totalCashback).toFixed(2), Number(r.totalSpent).toFixed(2), r.ordersCount]),
        ),
    },
    ...(orden.cambiado ? [{ id: "columnas", label: "Restablecer columnas", hint: "Vuelve al orden de siempre", icon: RotateCcw, onSelect: orden.restablecer }] : []),
    { id: "recargar", label: "Actualizar", icon: RefreshCw, onSelect: () => setRecarga((n) => n + 1) },
  ];

  return (
    <div className="space-y-4">
      <CabeceraVista
        titulo="Socio Buleje"
        ayuda={{
          title: "Socio Buleje",
          what: "El programa de membresía: tus socios pagan una cuota y reciben precios exclusivos y cashback.",
          affects: "El cashback acumulado es saldo que el socio puede gastar en tus productos.",
          example: "María es socia anual: en cada compra acumula cashback y ves su renovación el 15/06.",
        }}
        indicadores={kpis.boton}
        menu={menu}
        tituloMenu="Descargar CSV, columnas y actualizar"
      />
      {kpis.panel}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] py-10 text-center">
          <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{error}</p>
          <button type="button" onClick={() => setRecarga((n) => n + 1)} className="min-h-12 rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">
            Reintentar
          </button>
        </div>
      ) : (
        <ListaMiembros total={members.length} filtrados={filtrados} filtro={filtro} onFiltro={setFiltro} onSelect={setSelected} orden={orden} />
      )}

      {selected && <MemberProfileDrawer member={selected} onClose={() => setSelected(null)} onExtend={handleExtend} onCancel={handleCancel} />}
    </div>
  );
}
