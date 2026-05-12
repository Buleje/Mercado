"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Phone,
  AlertTriangle,
  Ban,
  Gift,
  Loader2,
  RefreshCw,
  X,
  CheckCircle2,
  DollarSign,
  Users,
  TrendingUp,
  Send,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type FiadoStatus = "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";

type Fiado = {
  id: string;
  customerId: string;
  customerName?: string;
  saldo: number;
  total: number;
  status: FiadoStatus;
  fechaVence?: string;
  createdAt: string;
  updatedAt: string;
};

type NivelEscalado = 1 | 2 | 3 | 4;

type FiadoConNivel = Fiado & {
  diasVencido: number;
  nivel: NivelEscalado;
};

// ── Nivel de escalado ─────────────────────────────────────────────────────────

const NIVEL_META: Record<
  NivelEscalado,
  {
    label: string;
    descripcion: string;
    colorBadge: string;
    colorRow: string;
    colorBtn: string;
    icon: typeof MessageCircle;
    rango: string;
  }
> = {
  1: {
    label: "Recordatorio amable",
    descripcion: "WhatsApp amable",
    colorBadge:
      "bg-[color-mix(in_oklch,var(--data-success)_12%,transparent)] text-[var(--data-success-500)]",
    colorRow: "hover:bg-[var(--accent-soft)]/50",
    colorBtn:
      "bg-[var(--data-success-500)] hover:opacity-90 text-white",
    icon: MessageCircle,
    rango: "1-3 días",
  },
  2: {
    label: "Segundo aviso",
    descripcion: "WhatsApp + descuento 5%",
    colorBadge:
      "bg-[color-mix(in_oklch,var(--data-warning)_12%,transparent)] text-[var(--data-warning-500)]",
    colorRow: "hover:bg-[color-mix(in_oklch,var(--data-warning)_6%,transparent)]",
    colorBtn:
      "bg-[var(--data-warning-500)] hover:opacity-90 text-white",
    icon: Gift,
    rango: "4-7 días",
  },
  3: {
    label: "Aviso urgente",
    descripcion: "WhatsApp urgente + llamar",
    colorBadge:
      "bg-[color-mix(in_oklch,var(--data-warning)_18%,transparent)] text-[var(--data-warning-500)]",
    colorRow: "hover:bg-[color-mix(in_oklch,var(--data-warning)_8%,transparent)]",
    colorBtn:
      "bg-[var(--data-warning-500)] hover:opacity-80 text-white",
    icon: AlertTriangle,
    rango: "8-15 días",
  },
  4: {
    label: "Bloqueo de crédito",
    descripcion: "Bloquear fiado + contacto personal",
    colorBadge:
      "bg-[color-mix(in_oklch,var(--data-error)_12%,transparent)] text-[var(--data-error-500)]",
    colorRow: "hover:bg-[color-mix(in_oklch,var(--data-error)_6%,transparent)]",
    colorBtn:
      "bg-[var(--data-error-500)] hover:opacity-90 text-white",
    icon: Ban,
    rango: "16+ días",
  },
};

function calcularNivel(diasVencido: number): NivelEscalado {
  if (diasVencido <= 3) return 1;
  if (diasVencido <= 7) return 2;
  if (diasVencido <= 15) return 3;
  return 4;
}

function calcularDiasVencido(fiado: Fiado): number {
  const now = new Date();
  if (fiado.fechaVence) {
    const vence = new Date(fiado.fechaVence);
    const diff = Math.floor(
      (now.getTime() - vence.getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.max(0, diff);
  }
  // Sin fecha: usar fecha de creación + 30 días por defecto
  const creado = new Date(fiado.createdAt);
  const venceDefault = new Date(creado.getTime() + 30 * 24 * 60 * 60 * 1000);
  const diff = Math.floor(
    (now.getTime() - venceDefault.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, diff);
}

// ── Mensajes WhatsApp por nivel ───────────────────────────────────────────────

function buildMensajeWhatsApp(
  fiado: FiadoConNivel,
  conDescuento?: { pct: number }
): string {
  const nombre = fiado.customerName || fiado.customerId;
  const monto = Number(fiado.saldo).toFixed(2);

  if (conDescuento) {
    const montoDesc = (fiado.saldo * (1 - conDescuento.pct / 100)).toFixed(2);
    return `Hola ${nombre}, si pagas tu deuda de S/${monto} hoy, te hacemos ${conDescuento.pct}% de descuento. Solo pagarías S/${montoDesc}`;
  }

  switch (fiado.nivel) {
    case 1:
      return `Hola ${nombre}! Te paso el aviso de tu cuentita en la bodega: S/${monto}. Cuando puedas pasate!`;
    case 2:
      return `Hola ${nombre}, todo bien? Ya van unos días con tu pendiente de S/${monto}. Tenemos un descuento especial si te pones al día esta semana`;
    case 3:
      return `${nombre}, tu deuda de S/${monto} lleva ${fiado.diasVencido} días vencida. Necesito que te acerques a regularizar o me llames para coordinar`;
    case 4:
      return `${nombre}, tu cuenta de S/${monto} lleva ${fiado.diasVencido} días sin pago. Lamentablemente hemos tenido que suspender el crédito. Acércate a la bodega para ponerte al día.`;
  }
}

function abrirWhatsApp(fiado: FiadoConNivel, mensaje: string) {
  const rawPhone = fiado.customerId.replace(/\D/g, "");
  const phone = rawPhone.startsWith("51") ? rawPhone : `51${rawPhone}`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  colorClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof DollarSign;
  colorClass: string;
}) {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4  flex items-center gap-3">
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          colorClass
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--text-tertiary)] font-medium truncate">
          {label}
        </p>
        <p className="text-lg font-extrabold text-[var(--text-primary)] leading-tight">
          {value}
        </p>
        {sub && (
          <p className="text-xs text-[var(--text-tertiary)]">{sub}</p>
        )}
      </div>
    </div>
  );
}

// ── Modal de descuento ────────────────────────────────────────────────────────

function ModalDescuento({
  fiado,
  onClose,
}: {
  fiado: FiadoConNivel;
  onClose: () => void;
}) {
  const nombre = fiado.customerName || fiado.customerId;

  const opciones = [
    { label: "Paga hoy", desc: 5, sub: "5% de descuento" },
    { label: "Paga esta semana", desc: 3, sub: "3% de descuento" },
  ];

  return (
    <div className="modal-backdrop flex items-center justify-center p-4">
      <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <SectionTitle className="text-sm font-bold text-[var(--text-primary)]">
              Ofrecer descuento
            </SectionTitle>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <p className="text-xs text-[var(--text-tertiary)]">
            Cliente:{" "}
            <span className="font-bold text-[var(--text-primary)]">
              {nombre}
            </span>{" "}
            · Deuda:{" "}
            <span className="font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
              S/{Number(fiado.saldo).toFixed(2)}
            </span>
          </p>

          {opciones.map((op) => {
            const montoFinal = (fiado.saldo * (1 - op.desc / 100)).toFixed(2);
            const msg = buildMensajeWhatsApp(fiado, { pct: op.desc });
            return (
              <div
                key={op.desc}
                className="border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      {op.label}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {op.sub} → solo paga{" "}
                      <span className="font-bold text-primary">
                        S/{montoFinal}
                      </span>
                    </p>
                  </div>
                  <span className="text-lg font-extrabold text-primary">
                    -{op.desc}%
                  </span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] italic bg-gray-50 dark:bg-white/5 rounded-lg px-2 py-1.5">
                  {msg}
                </p>
                <button
                  onClick={() => {
                    abrirWhatsApp(fiado, msg);
                    onClose();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold text-white bg-[#25D366] hover:bg-[#1da851] transition-colors"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Enviar por WhatsApp
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CobranzaInteligente() {
  const [fiados, setFiados] = useState<FiadoConNivel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroNivel, setFiltroNivel] = useState<NivelEscalado | 0>(0);
  const [modalDescuento, setModalDescuento] = useState<FiadoConNivel | null>(
    null
  );

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchFiados = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fiados?status=ACTIVO,VENCIDO");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: Fiado[] = await res.json();

      // Solo los que tienen saldo pendiente y están vencidos
      const pendientes = data.filter(
        (f) => f.saldo > 0 && (f.status === "VENCIDO" || f.status === "ACTIVO")
      );

      const conNivel: FiadoConNivel[] = pendientes.map((f) => {
        const diasVencido = calcularDiasVencido(f);
        return {
          ...f,
          diasVencido,
          nivel: calcularNivel(diasVencido),
        };
      });

      // Ordenar por nivel desc, luego por saldo desc
      conNivel.sort((a, b) => {
        if (b.nivel !== a.nivel) return b.nivel - a.nivel;
        return b.saldo - a.saldo;
      });

      setFiados(conNivel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar fiados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiados();
  }, [fetchFiados]);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const totalPorCobrar = fiados.reduce((s, f) => s + f.saldo, 0);
  const enNivel1 = fiados.filter((f) => f.nivel === 1).length;
  const enNivel2mas = fiados.filter((f) => f.nivel >= 2).length;

  // ── Filtro por nivel ──────────────────────────────────────────────────────

  const fiadosFiltrados =
    filtroNivel === 0 ? fiados : fiados.filter((f) => f.nivel === filtroNivel);

  // ── Envío masivo por nivel ────────────────────────────────────────────────

  function enviarMasivo(nivel: NivelEscalado) {
    const destinos = fiados.filter((f) => f.nivel === nivel);
    if (destinos.length === 0) return;
    for (const f of destinos) {
      const msg = buildMensajeWhatsApp(f);
      abrirWhatsApp(f, msg);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LoadingState message="Cargando cobranza..." />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
        <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
        <button
          onClick={fetchFiados}
          className="text-xs text-primary hover:underline font-semibold"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Titulo + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-base font-extrabold text-[var(--text-primary)]">
            Cobranza Inteligente
          </SectionTitle>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Escalado automático por días vencidos · Descuentos por pronto pago
          </p>
        </div>
        <button
          onClick={fetchFiados}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total por cobrar"
          value={`S/${totalPorCobrar.toFixed(2)}`}
          sub={`${fiados.length} clientes pendientes`}
          icon={DollarSign}
          colorClass="bg-primary/10 text-primary"
        />
        <KpiCard
          label="En nivel 1"
          value={String(enNivel1)}
          sub="Recordatorio amable"
          icon={CheckCircle2}
          colorClass="bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]"
        />
        <KpiCard
          label="Nivel 2 o más"
          value={String(enNivel2mas)}
          sub="Requieren acción"
          icon={AlertTriangle}
          colorClass="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
        />
        <KpiCard
          label="Sin vencer"
          value={String(fiados.filter((f) => f.diasVencido === 0).length)}
          sub="Al día o por vencer"
          icon={Users}
          colorClass="bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]"
        />
      </div>

      {/* Acciones masivas por nivel */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 ">
        <p className="text-xs font-bold text-[var(--text-tertiary)] mb-3">
          Envío masivo por nivel
        </p>
        <div className="flex flex-wrap gap-2">
          {([1, 2, 3, 4] as NivelEscalado[]).map((nivel) => {
            const meta = NIVEL_META[nivel];
            const count = fiados.filter((f) => f.nivel === nivel).length;
            if (count === 0) return null;
            return (
              <button
                key={nivel}
                onClick={() => enviarMasivo(nivel)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors",
                  meta.colorBtn
                )}
              >
                <Send className="h-3 w-3" />
                Nivel {nivel} ({count})
              </button>
            );
          })}
          {fiados.length === 0 && (
            <p className="text-xs text-[var(--text-tertiary)] italic">
              No hay fiados pendientes
            </p>
          )}
        </div>
      </div>

      {/* Filtro por nivel */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-[var(--text-tertiary)]">
          Filtrar:
        </span>
        <button
          onClick={() => setFiltroNivel(0)}
          className={cn(
            "px-2.5 py-1 rounded-full text-xs font-bold transition-colors",
            filtroNivel === 0
              ? "bg-primary text-white"
              : "bg-gray-100 dark:bg-white/5 text-[var(--text-secondary)] hover:bg-gray-200"
          )}
        >
          Todos ({fiados.length})
        </button>
        {([1, 2, 3, 4] as NivelEscalado[]).map((nivel) => {
          const meta = NIVEL_META[nivel];
          const count = fiados.filter((f) => f.nivel === nivel).length;
          return (
            <button
              key={nivel}
              onClick={() => setFiltroNivel(nivel)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-bold transition-colors",
                filtroNivel === nivel
                  ? "ring-2 ring-offset-1 " + meta.colorBadge
                  : "bg-gray-100 dark:bg-white/5 text-[var(--text-secondary)] hover:bg-gray-200"
              )}
            >
              Nivel {nivel} ({count})
            </button>
          );
        })}
      </div>

      {/* Tabla de cobranza */}
      {fiadosFiltrados.length === 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-10 text-center">
          <TrendingUp className="h-10 w-10 text-primary/40 mx-auto mb-2" />
          <p className="text-sm font-bold text-[var(--text-tertiary)]">
            {fiados.length === 0
              ? "No hay fiados vencidos pendientes"
              : "No hay fiados en este nivel"}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden ">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="sticky top-0 bg-[var(--surface-raised)] z-10 border-b border-[var(--rule-soft)] dark:border-white/5">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-xs">
                    Cliente
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-xs text-right">
                    Monto
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-xs text-center">
                    Días vencido
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-xs">
                    Nivel
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-xs hidden md:table-cell">
                    Acción sugerida
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-xs text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {fiadosFiltrados.map((f) => {
                  const meta = NIVEL_META[f.nivel];
                  const NivelIcon = meta.icon;
                  const nombre = f.customerName || f.customerId;

                  return (
                    <tr
                      key={f.id}
                      className={cn(
                        "border-b border-gray-50 dark:border-white/5 transition-colors",
                        meta.colorRow
                      )}
                    >
                      {/* Cliente */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const avatarColors = [
                              "var(--accent)",
                              "#f97316",
                              "#e63946",
                              "#457b9d",
                              "#6b705c",
                            ];
                            let h = 0;
                            for (let i = 0; i < nombre.length; i++)
                              h = nombre.charCodeAt(i) + ((h << 5) - h);
                            const color =
                              avatarColors[Math.abs(h) % avatarColors.length];
                            const initials = nombre
                              .split(" ")
                              .map((w: string) => w[0])
                              .join("")
                              .substring(0, 2)
                              .toUpperCase();
                            return (
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ backgroundColor: color }}
                              >
                                {initials}
                              </div>
                            );
                          })()}
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--text-primary)] truncate max-w-[140px]">
                              {nombre}
                            </p>
                            <p className="text-xs text-[var(--text-tertiary)] font-mono">
                              {f.customerId}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Monto */}
                      <td className="px-4 py-3 text-right">
                        <span className="font-extrabold font-mono text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
                          S/{Number(f.saldo).toFixed(2)}
                        </span>
                        {f.total !== f.saldo && (
                          <p className="text-xs text-[var(--text-tertiary)]">
                            de S/{Number(f.total).toFixed(2)}
                          </p>
                        )}
                      </td>

                      {/* Días vencido */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded-full text-xs font-bold",
                            f.diasVencido === 0
                              ? "bg-gray-100 text-[var(--text-secondary)] dark:bg-white/10"
                              : meta.colorBadge
                          )}
                        >
                          {f.diasVencido === 0
                            ? "Hoy"
                            : `${f.diasVencido}d`}
                        </span>
                      </td>

                      {/* Nivel */}
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold",
                            meta.colorBadge
                          )}
                        >
                          <NivelIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>

                      {/* Acción sugerida */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {meta.descripcion}
                        </p>
                        {f.nivel === 3 && (
                          <a
                            href={`tel:${f.customerId.replace(/\D/g, "")}`}
                            className="inline-flex items-center gap-1 text-xs text-[var(--data-warning-500)] hover:underline font-bold mt-0.5"
                          >
                            <Phone className="h-2.5 w-2.5" />
                            Llamar
                          </a>
                        )}
                        {f.nivel === 4 && (
                          <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-bold mt-0.5">
                            Bloquear credito
                          </p>
                        )}
                      </td>

                      {/* Botones de acción */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Boton recordatorio WhatsApp */}
                          <button
                            onClick={() => {
                              const msg = buildMensajeWhatsApp(f);
                              abrirWhatsApp(f, msg);
                            }}
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors",
                              meta.colorBtn
                            )}
                            title={`Enviar recordatorio nivel ${f.nivel}`}
                          >
                            <MessageCircle className="h-3 w-3" />
                            <span className="hidden sm:inline">Recordar</span>
                          </button>

                          {/* Boton descuento (niveles 2+) */}
                          {f.nivel >= 2 && (
                            <button
                              onClick={() => setModalDescuento(f)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                              title="Ofrecer descuento por pronto pago"
                            >
                              <Gift className="h-3 w-3" />
                              <span className="hidden sm:inline">Descuento</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer con total */}
          <div className="px-4 py-3 border-t border-[var(--rule-soft)] dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-white/2">
            <p className="text-xs text-[var(--text-tertiary)]">
              {fiadosFiltrados.length} fiado
              {fiadosFiltrados.length !== 1 ? "s" : ""} mostrado
              {fiadosFiltrados.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs font-extrabold text-[var(--text-primary)] font-mono">
              Total:{" "}
              <span className="text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
                S/
                {fiadosFiltrados
                  .reduce((s, f) => s + f.saldo, 0)
                  .toFixed(2)}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Leyenda de niveles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {([1, 2, 3, 4] as NivelEscalado[]).map((nivel) => {
          const meta = NIVEL_META[nivel];
          const NivelIcon = meta.icon;
          return (
            <div
              key={nivel}
              className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 flex items-start gap-2"
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0",
                  meta.colorBadge
                )}
              >
                <NivelIcon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[var(--text-primary)] leading-tight">
                  Nivel {nivel}: {meta.label}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {meta.rango} · {meta.descripcion}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de descuento */}
      {modalDescuento && (
        <ModalDescuento
          fiado={modalDescuento}
          onClose={() => setModalDescuento(null)}
        />
      )}
    </div>
  );
}
