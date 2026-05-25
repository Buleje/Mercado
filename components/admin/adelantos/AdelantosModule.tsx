"use client";

import { useState, useEffect, useCallback } from "react";
import { CardTitle, SectionTitle, StatCard } from "@buleje/design-system";
import {
  Coins,
  Users,
  Plus,
  X,
  TrendingDown,
  TrendingUp,
  Wallet,
  CheckCircle,
  Clock,
  Package,
  Ban,
  ChevronRight,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { formatCurrency } from "@/lib/currency";
import { csrfHeaders } from "@/lib/csrf-client";
import type {
  DbAdelanto,
  DbBeneficiario,
  AdelantoModalidad,
} from "@/lib/db/adelantos.db";

type BeneficiarioConSaldo = DbBeneficiario & {
  totalAdelantado: number;
  saldoPendiente: number;
  adelantosAbiertos: number;
};

type Resumen = {
  totalAdelantado: number;
  totalLiquidado: number;
  saldoPendiente: number;
  excedente: number;
  adelantosAbiertos: number;
  adelantosLiquidados: number;
  beneficiarios: number;
};

const MODULE_ID = "adelantos";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ABIERTO: { label: "Abierto", className: "bg-[var(--data-warning)]/15 text-[var(--data-warning)]" },
  LIQUIDADO: { label: "Liquidado", className: "bg-[var(--data-success)]/15 text-[var(--data-success)]" },
  EXCEDIDO: { label: "Excedido", className: "bg-[var(--data-info)]/15 text-[var(--data-info)]" },
  CANCELADO: { label: "Cancelado", className: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
};

const TABS = [
  { id: "resumen", label: "Resumen", icon: Wallet },
  { id: "lista", label: "Adelantos", icon: Coins },
  { id: "personas", label: "Personas", icon: Users },
];

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

export default function AdelantosModule() {
  const [tab, setTab] = useState("resumen");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [adelantos, setAdelantos] = useState<DbAdelanto[]>([]);
  const [beneficiarios, setBeneficiarios] = useState<BeneficiarioConSaldo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, a, b] = await Promise.all([
        fetch("/api/adelantos/resumen", { credentials: "include" }).then((x) => (x.ok ? x.json() : null)),
        fetch("/api/adelantos", { credentials: "include" }).then((x) => (x.ok ? x.json() : [])),
        fetch("/api/adelantos/beneficiarios", { credentials: "include" }).then((x) => (x.ok ? x.json() : [])),
      ]);
      setResumen(r);
      setAdelantos(Array.isArray(a) ? a : []);
      setBeneficiarios(Array.isArray(b) ? b : []);
    } catch {
      setError("No se pudo cargar los adelantos");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const sinPersonas = beneficiarios.length === 0;

  return (
    <div>
      <AdminModuleHeader
        eyebrow="Finanzas · Adelantos"
        title="Adelantos & Liquidaciones"
        description="Adelantos de dinero a personas por servicios. Se liquidan con lo que te entregan (producto o servicio)."
        icon={Coins}
      >
        <button
          onClick={() => setTab(sinPersonas ? "personas" : "lista")}
          className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-5 w-5" />
          {sinPersonas ? "Agregar persona" : "Nuevo adelanto"}
        </button>
      </AdminModuleHeader>

      <AdminTabBar tabs={TABS} activeTab={tab} onTabChange={setTab} moduleId={MODULE_ID}>
        {error && (
          <div className="mb-4 rounded-2xl border-2 border-[var(--data-error)]/30 bg-[var(--data-error)]/10 px-4 py-3 text-base font-semibold text-[var(--data-error)]">
            {error}
          </div>
        )}

        {tab === "resumen" && <ResumenView resumen={resumen} adelantos={adelantos} loading={loading} onGoTab={setTab} />}
        {tab === "lista" && (
          <AdelantosView
            adelantos={adelantos}
            beneficiarios={beneficiarios}
            loading={loading}
            onChange={reload}
          />
        )}
        {tab === "personas" && (
          <PersonasView beneficiarios={beneficiarios} loading={loading} onChange={reload} />
        )}
      </AdminTabBar>
    </div>
  );
}

// ── Resumen ──────────────────────────────────────────────────────────────────
function ResumenView({
  resumen,
  adelantos,
  loading,
  onGoTab,
}: {
  resumen: Resumen | null;
  adelantos: DbAdelanto[];
  loading: boolean;
  onGoTab: (tab: string) => void;
}) {
  if (loading) return <SkeletonGrid />;
  if (!resumen) return <EmptyState icon={Wallet} title="Sin datos aún" hint="Creá tu primer adelanto en la pestaña Adelantos." />;

  // Sin actividad todavía → guía de 2 pasos en vez del muro de ceros.
  const sinActividad =
    resumen.beneficiarios === 0 &&
    resumen.adelantosAbiertos === 0 &&
    resumen.adelantosLiquidados === 0;

  if (sinActividad) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Coins className="h-8 w-8 text-primary" />
        </div>
        <SectionTitle className="text-2xl">Empezá a registrar adelantos</SectionTitle>
        <p className="mt-2 text-base text-[var(--text-secondary)]">
          Un adelanto es plata que le das a alguien y se va liquidando con lo que te entrega (producto o servicio).
        </p>
        <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white">1</span>
            <p className="mt-2 text-base font-bold text-[var(--text-primary)]">Agregá una persona</p>
            <p className="text-sm text-[var(--text-secondary)]">A quién le vas a adelantar plata.</p>
          </div>
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white">2</span>
            <p className="mt-2 text-base font-bold text-[var(--text-primary)]">Registrá el adelanto</p>
            <p className="text-sm text-[var(--text-secondary)]">El monto y cómo se va a liquidar.</p>
          </div>
        </div>
        <button
          onClick={() => onGoTab("personas")}
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-white transition-colors hover:bg-primary-dark"
        >
          <Plus className="h-5 w-5" /> Agregar primera persona
        </button>
      </div>
    );
  }

  const adelantado = resumen.totalAdelantado;
  const liquidado = resumen.totalLiquidado;
  const pct = adelantado > 0 ? Math.min(100, Math.round((liquidado / adelantado) * 100)) : 0;
  const abiertos = adelantos
    .filter((a) => a.status === "ABIERTO" && a.saldoPendiente > 0)
    .sort((a, b) => b.saldoPendiente - a.saldoPendiente);
  const totalPorRecuperar = abiertos.reduce((s, a) => s + a.saldoPendiente, 0);

  // Mensaje de salud: prioriza lo que te deben; si nada, todo al día; si excedente, a favor de ellos.
  const health =
    resumen.saldoPendiente > 0
      ? { cls: "text-[var(--data-warning)]", Icon: Clock, text: `Te faltan ${formatCurrency(resumen.saldoPendiente)} por recuperar.` }
      : resumen.excedente > 0
        ? { cls: "text-[var(--data-info)]", Icon: Coins, text: `Te entregaron ${formatCurrency(resumen.excedente)} de más.` }
        : { cls: "text-[var(--data-success)]", Icon: CheckCircle, text: "Todo al día — nadie te debe nada." };

  return (
    <div className="space-y-5">
      {/* Hero saldo + barra de progreso de recuperación */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Saldo pendiente</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(resumen.saldoPendiente)}</p>
          <div className={`mt-3 flex items-center gap-2 text-base font-semibold ${health.cls}`}>
            <health.Icon className="h-5 w-5 shrink-0" />
            <span>{health.text}</span>
          </div>
        </div>
        <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Recuperación de adelantos</CardTitle>
            <span className="text-2xl font-extrabold tabular-nums text-[var(--data-success)]">{pct}%</span>
          </div>
          <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div className="h-full rounded-full bg-[var(--data-success)] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-base text-[var(--text-secondary)]">
            Recuperaste <span className="font-bold text-[var(--text-primary)]">{formatCurrency(liquidado)}</span> de{" "}
            <span className="font-bold text-[var(--text-primary)]">{formatCurrency(adelantado)}</span> adelantados.
          </p>
        </div>
      </div>

      {/* Quién te debe — lista accionable de adelantos abiertos */}
      {abiertos.length > 0 && (
        <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5">
          <div className="mb-2 flex items-center justify-between">
            <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Quién te debe ({abiertos.length})</CardTitle>
            <button onClick={() => onGoTab("lista")} className="inline-flex items-center gap-1 text-base font-bold text-primary hover:underline">
              Ver todos <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <ul className="divide-y divide-[var(--rule-soft)]">
            {abiertos.slice(0, 5).map((a) => (
              <li key={a.id}>
                <button onClick={() => onGoTab("lista")} className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)]/50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-extrabold text-primary">
                    {(a.beneficiario?.nombre ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 text-base font-bold text-[var(--text-primary)]">{a.beneficiario?.nombre ?? "—"}</span>
                  <span className="tabular-nums text-base font-extrabold text-[var(--data-warning)]">{formatCurrency(a.saldoPendiente)}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t-2 border-[var(--rule-base)] pt-3">
            <span className="text-base font-bold text-[var(--text-secondary)]">Total por recuperar</span>
            <span className="tabular-nums text-lg font-extrabold text-[var(--data-warning)]">{formatCurrency(totalPorRecuperar)}</span>
          </div>
        </div>
      )}

      {/* Plata (secundario) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total adelantado" value={formatCurrency(adelantado)} icon={TrendingDown} subValue="Plata que diste" />
        <StatCard label="Total liquidado" value={formatCurrency(liquidado)} icon={TrendingUp} emphasis="success" subValue="Recuperado en entregas" />
        <StatCard label="A favor de ellos" value={formatCurrency(resumen.excedente)} icon={Coins} emphasis={resumen.excedente > 0 ? "error" : "neutral"} subValue="Entregaron de más" />
      </div>

      {/* Contadores clickeables → llevan a la lista/personas filtrada */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Adelantos abiertos" value={String(resumen.adelantosAbiertos)} icon={Coins} density="compact" onClick={() => onGoTab("lista")} />
        <StatCard label="Liquidados" value={String(resumen.adelantosLiquidados)} icon={CheckCircle} density="compact" onClick={() => onGoTab("lista")} />
        <StatCard label="Personas" value={String(resumen.beneficiarios)} icon={Users} density="compact" onClick={() => onGoTab("personas")} />
      </div>
    </div>
  );
}

// ── Adelantos ────────────────────────────────────────────────────────────────
function AdelantosView({
  adelantos,
  beneficiarios,
  loading,
  onChange,
}: {
  adelantos: DbAdelanto[];
  beneficiarios: BeneficiarioConSaldo[];
  loading: boolean;
  onChange: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [detalle, setDetalle] = useState<DbAdelanto | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">
          {adelantos.length} adelanto{adelantos.length === 1 ? "" : "s"}
        </CardTitle>
        <button
          onClick={() => setShowCreate(true)}
          disabled={beneficiarios.length === 0}
          className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
          title={beneficiarios.length === 0 ? "Creá primero una persona" : undefined}
        >
          <Plus className="h-5 w-5" /> Nuevo adelanto
        </button>
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : adelantos.length === 0 ? (
        <EmptyState icon={Coins} title="Sin adelantos" hint={beneficiarios.length === 0 ? "Primero creá una persona en la pestaña Personas." : "Registrá tu primer adelanto."} />
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-white">
          <table className="w-full text-base">
            <thead className="bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
              <tr className="text-left">
                <th className="px-4 py-3 font-bold">Persona</th>
                <th className="px-4 py-3 font-bold">Adelantado</th>
                <th className="px-4 py-3 font-bold">Saldo</th>
                <th className="px-4 py-3 font-bold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {adelantos.map((a) => {
                const badge = STATUS_BADGE[a.status];
                return (
                  <tr key={a.id} onClick={() => setDetalle(a)} className="cursor-pointer hover:bg-[var(--surface-sunken)]/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{a.beneficiario?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">{formatCurrency(a.montoAdelantado)}</td>
                    <td className="px-4 py-3 tabular-nums font-bold text-[var(--text-primary)]">{formatCurrency(a.saldoPendiente)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${badge?.className ?? ""}`}>{badge?.label ?? a.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CrearAdelantoModal
          beneficiarios={beneficiarios}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            onChange();
          }}
        />
      )}
      {detalle && (
        <DetalleAdelantoModal
          adelantoId={detalle.id}
          onClose={() => setDetalle(null)}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function CrearAdelantoModal({
  beneficiarios,
  onClose,
  onCreated,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [beneficiarioId, setBeneficiarioId] = useState(beneficiarios[0]?.id ?? "");
  const [modalidad, setModalidad] = useState<AdelantoModalidad>("CUENTA_CORRIENTE");
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const m = Number(monto);
    if (!beneficiarioId || !m || m <= 0) {
      setErr("Elegí una persona y un monto válido.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/adelantos", {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ beneficiarioId, modalidad, montoAdelantado: m, notas: notas.trim() || undefined }),
    });
    setSaving(false);
    if (res.ok) onCreated();
    else setErr("No se pudo crear el adelanto.");
  };

  return (
    <ModalShell title="Nuevo adelanto" onClose={onClose}>
      <Field label="Persona">
        <select value={beneficiarioId} onChange={(e) => setBeneficiarioId(e.target.value)} className={inputCls}>
          {beneficiarios.map((b) => (
            <option key={b.id} value={b.id}>{b.nombre}</option>
          ))}
        </select>
      </Field>
      <Field label="Modalidad">
        <div className="grid grid-cols-2 gap-2">
          {([["CUENTA_CORRIENTE", "Cuenta corriente"], ["ENTREGAS_PACTADAS", "Entregas pactadas"]] as const).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setModalidad(val)}
              className={`h-12 rounded-2xl border-2 text-base font-bold transition-colors ${modalidad === val ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-secondary)]"}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Monto adelantado (S/)">
        <input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="500.00" className={inputCls + " tabular-nums"} />
      </Field>
      <Field label="Notas (opcional)">
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={inputCls + " py-3"} />
      </Field>
      {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
      <ModalActions onClose={onClose} onSubmit={submit} saving={saving} label="Crear adelanto" />
    </ModalShell>
  );
}

function DetalleAdelantoModal({
  adelantoId,
  onClose,
  onChange,
}: {
  adelantoId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const [a, setA] = useState<DbAdelanto | null>(null);
  const [loading, setLoading] = useState(true);
  // form entrega
  const [tipo, setTipo] = useState<"LIBRE" | "PRODUCTO">("LIBRE");
  const [descripcion, setDescripcion] = useState("");
  const [valor, setValor] = useState("");
  const [productId, setProductId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [sumarAStock, setSumarAStock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/adelantos/${adelantoId}`, { credentials: "include" });
    setA(res.ok ? await res.json() : null);
    setLoading(false);
  }, [adelantoId]);

  useEffect(() => { load(); }, [load]);

  const registrar = async () => {
    setErr(null);
    const body: Record<string, unknown> = { tipo, notas: descripcion.trim() || undefined };
    if (tipo === "LIBRE") {
      const v = Number(valor);
      if (!descripcion.trim() || !v || v <= 0) { setErr("Describí la entrega y poné un valor."); return; }
      body.descripcion = descripcion.trim();
      body.valorManual = v;
    } else {
      const pid = Number(productId);
      if (!pid) { setErr("Indicá el ID del producto."); return; }
      body.productId = pid;
      body.descripcion = descripcion.trim() || undefined;
      if (cantidad) body.cantidad = Number(cantidad);
      if (valor) body.valorManual = Number(valor);
      body.sumarAStock = sumarAStock;
    }
    setSaving(true);
    const res = await fetch(`/api/adelantos/${adelantoId}/entregas`, {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setDescripcion(""); setValor(""); setProductId(""); setCantidad(""); setSumarAStock(false);
      await load();
      onChange();
    } else {
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? "No se pudo registrar la entrega.");
    }
  };

  const cancelar = async () => {
    if (!confirm("¿Cancelar este adelanto? No se borra el historial.")) return;
    await fetch(`/api/adelantos/${adelantoId}`, { method: "PATCH", headers: jsonHeaders(), credentials: "include", body: JSON.stringify({ cancelar: true }) });
    await load();
    onChange();
  };

  const badge = a ? STATUS_BADGE[a.status] : null;

  return (
    <ModalShell title={a ? `Adelanto · ${a.beneficiario?.nombre ?? ""}` : "Adelanto"} onClose={onClose} wide>
      {loading || !a ? (
        <SkeletonGrid />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Adelantado" value={formatCurrency(a.montoAdelantado)} />
            <MiniStat label="Entregado" value={formatCurrency(a.totalEntregado)} tone="success" />
            <MiniStat label="Saldo" value={formatCurrency(a.saldoPendiente)} tone={a.saldoPendiente > 0 ? "warning" : "neutral"} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${badge?.className ?? ""}`}>{badge?.label}</span>
            {a.status !== "CANCELADO" && (
              <button onClick={cancelar} className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-error)] hover:underline">
                <Ban className="h-4 w-4" /> Cancelar adelanto
              </button>
            )}
          </div>

          {a.status !== "CANCELADO" && (
            <div className="rounded-2xl border-2 border-[var(--rule-base)] p-4 space-y-3">
              <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Registrar entrega</CardTitle>
              <div className="grid grid-cols-2 gap-2">
                {(["LIBRE", "PRODUCTO"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTipo(t)} className={`h-12 rounded-2xl border-2 text-base font-bold transition-colors ${tipo === t ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-secondary)]"}`}>
                    {t === "LIBRE" ? "Servicio / libre" : "Producto"}
                  </button>
                ))}
              </div>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={tipo === "LIBRE" ? "Ej: reparación del local" : "Descripción (opcional)"} className={inputCls} />
              {tipo === "PRODUCTO" && (
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="ID producto" className={inputCls + " tabular-nums"} />
                  <input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Cantidad" className={inputCls + " tabular-nums"} />
                </div>
              )}
              <input type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={tipo === "LIBRE" ? "Valor en S/" : "Valor S/ (vacío = precio × cantidad)"} className={inputCls + " tabular-nums"} />
              {tipo === "PRODUCTO" && (
                <label className="flex items-center gap-2 text-base font-semibold text-[var(--text-secondary)]">
                  <input type="checkbox" checked={sumarAStock} onChange={(e) => setSumarAStock(e.target.checked)} className="h-5 w-5" />
                  Sumar al stock del inventario
                </label>
              )}
              {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
              <button onClick={registrar} disabled={saving} className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-[var(--data-success)] text-white text-base font-bold hover:opacity-90 transition disabled:opacity-50">
                <CheckCircle className="h-5 w-5" /> {saving ? "Registrando…" : "Registrar entrega"}
              </button>
            </div>
          )}

          <div>
            <CardTitle className="text-base font-extrabold text-[var(--text-primary)] mb-2">Historial de entregas ({a.entregas.length})</CardTitle>
            {a.entregas.length === 0 ? (
              <p className="text-base text-[var(--text-tertiary)]">Todavía no hay entregas.</p>
            ) : (
              <ul className="space-y-2">
                {a.entregas.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-soft)] px-4 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--data-success)]/10 text-[var(--data-success)] shrink-0">
                      {e.tipo === "PRODUCTO" ? <Package className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-[var(--text-primary)] truncate">{e.descripcion || (e.tipo === "PRODUCTO" ? `Producto #${e.productId}` : "Entrega")}</p>
                      <p className="text-sm text-[var(--text-tertiary)] tabular-nums">{new Date(e.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</p>
                    </div>
                    <span className="text-base font-extrabold tabular-nums text-[var(--data-success)] shrink-0">{formatCurrency(e.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Personas ─────────────────────────────────────────────────────────────────
function PersonasView({
  beneficiarios,
  loading,
  onChange,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  loading: boolean;
  onChange: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">
          {beneficiarios.length} persona{beneficiarios.length === 1 ? "" : "s"}
        </CardTitle>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark transition-colors">
          <Plus className="h-5 w-5" /> Nueva persona
        </button>
      </div>
      {loading ? (
        <SkeletonGrid />
      ) : beneficiarios.length === 0 ? (
        <EmptyState icon={Users} title="Sin personas" hint="Agregá a quién le das adelantos." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {beneficiarios.map((b) => (
            <div key={b.id} className="rounded-2xl border-2 border-[var(--rule-base)] bg-white p-4">
              <p className="text-base font-extrabold text-[var(--text-primary)] truncate">{b.nombre}</p>
              {b.documento && <p className="text-sm text-[var(--text-tertiary)] tabular-nums">{b.documento}</p>}
              {b.telefono && <p className="text-sm text-[var(--text-tertiary)] tabular-nums">{b.telefono}</p>}
              <div className="mt-3 flex items-center justify-between border-t-2 border-[var(--rule-soft)] pt-3">
                <span className="text-sm font-semibold text-[var(--text-tertiary)]">Saldo</span>
                <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(b.saldoPendiente)}</span>
              </div>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">{b.adelantosAbiertos} abierto{b.adelantosAbiertos === 1 ? "" : "s"}</p>
            </div>
          ))}
        </div>
      )}
      {showCreate && (
        <CrearPersonaModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); onChange(); }} />
      )}
    </div>
  );
}

function CrearPersonaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefono, setTelefono] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!nombre.trim()) { setErr("El nombre es obligatorio."); return; }
    setSaving(true);
    const res = await fetch("/api/adelantos/beneficiarios", {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ nombre: nombre.trim(), documento: documento.trim() || undefined, telefono: telefono.trim() || undefined }),
    });
    setSaving(false);
    if (res.ok) onCreated();
    else setErr("No se pudo crear la persona.");
  };

  return (
    <ModalShell title="Nueva persona" onClose={onClose}>
      <Field label="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} /></Field>
      <Field label="DNI / RUC (opcional)"><input value={documento} onChange={(e) => setDocumento(e.target.value)} className={inputCls + " tabular-nums"} /></Field>
      <Field label="Teléfono (opcional)"><input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls + " tabular-nums"} /></Field>
      {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
      <ModalActions onClose={onClose} onSubmit={submit} saving={saving} label="Crear persona" />
    </ModalShell>
  );
}

// ── Primitivos compartidos ─────────────────────────────────────────────────────
const inputCls =
  "w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-white text-base font-semibold text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      {children}
    </label>
  );
}

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-[var(--shadow-xl)]`}>
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-lg font-extrabold text-[var(--text-primary)]">{title}</CardTitle>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSubmit, saving, label }: { onClose: () => void; onSubmit: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-2 pt-2">
      <button onClick={onClose} className="flex-1 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
      <button onClick={onSubmit} disabled={saving} className="flex-1 h-12 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark disabled:opacity-50">{saving ? "Guardando…" : label}</button>
    </div>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" }) {
  const color = tone === "success" ? "text-[var(--data-success)]" : tone === "warning" ? "text-[var(--data-warning)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] p-3 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: typeof Wallet; title: string; hint: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3"><Icon className="h-6 w-6" /></div>
      <p className="text-base font-extrabold text-[var(--text-primary)]">{title}</p>
      <p className="text-base text-[var(--text-secondary)] mt-1">{hint}</p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] animate-pulse" />
      ))}
    </div>
  );
}
