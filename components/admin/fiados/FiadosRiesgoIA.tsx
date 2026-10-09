"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CreditCard, MessageCircle, RefreshCw, ShieldAlert, Users } from "@buleje/design-system/icons";
import { StatCard, type StatCardEmphasis } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { waLink } from "@/lib/whatsapp-link";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";

/*
 * Quién te debe (Analítica › Clientes › Fiados). Vivía en Comandos IA como
 * «Fiados»; se mudó acá el 2026-10-09 porque es un reporte, no algo que la IA
 * haga. Pasada de diseño del mismo día: lista que entra a 400 px, filtros con
 * su cuenta pegados a la lista, el nombre abre la ficha del cliente, el aviso
 * de WhatsApp con el 51 bien puesto (`waLink`) y sin el botón muerto del pie.
 */

type Fiado = {
  id: string;
  customerName?: string;
  customerPhone?: string;
  balance?: number;
  status?: "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";
  dueDate?: string;
};

type Filtro = "todos" | "vencidos" | "por-vencer" | "al-dia";
type Riesgo = "ALTO" | "MEDIO" | "BAJO";

const DIA_MS = 86_400_000;
const diasHasta = (fecha: string) => Math.floor((new Date(fecha).getTime() - Date.now()) / DIA_MS);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const esVencido = (f: Fiado) => f.status === "VENCIDO";
const esPorVencer = (f: Fiado) => f.status === "ACTIVO" && !!f.dueDate && diasHasta(f.dueDate) >= 0 && diasHasta(f.dueDate) <= 7;
const esAlDia = (f: Fiado) => f.status === "ACTIVO" && !!f.dueDate && diasHasta(f.dueDate) > 7;
const debe = (f: Fiado) => f.status === "ACTIVO" || f.status === "VENCIDO";
/* Vencidos, después los que deben, al final los cerrados (pagados o cancelados). */
const rango = (f: Fiado) => (esVencido(f) ? 0 : debe(f) ? 1 : 2);

const FILTROS: { id: Filtro; label: string; cumple: (f: Fiado) => boolean }[] = [
  { id: "todos", label: "Todos", cumple: () => true },
  { id: "vencidos", label: "Vencidos", cumple: esVencido },
  { id: "por-vencer", label: "Por vencer", cumple: esPorVencer },
  { id: "al-dia", label: "Al día", cumple: esAlDia },
];

const VACIO: Record<Filtro, string> = {
  todos: "Todavía no hay fiados registrados.",
  vencidos: "Nadie tiene un fiado vencido.",
  "por-vencer": "Ningún fiado vence esta semana.",
  "al-dia": "No hay fiados con más de 7 días de plazo.",
};

function nivelDeRiesgo(vencidos: number, activos: number): Riesgo {
  const total = vencidos + activos;
  const pct = total === 0 ? 0 : vencidos / total;
  return pct > 0.3 ? "ALTO" : pct >= 0.1 ? "MEDIO" : "BAJO";
}

const RIESGO: Record<Riesgo, { emphasis: StatCardEmphasis; detalle: string }> = {
  ALTO: { emphasis: "error", detalle: "Más del 30 % vencido" },
  MEDIO: { emphasis: "warning", detalle: "Entre 10 y 30 % vencido" },
  BAJO: { emphasis: "success", detalle: "Menos del 10 % vencido" },
};

function textoRecordatorio(f: Fiado): string {
  const nombre = f.customerName && f.customerName !== f.customerPhone ? f.customerName.split(" ")[0] : "";
  const vence = f.dueDate ? `, que ${esVencido(f) ? "venció" : "vence"} el ${formatDateShort(f.dueDate)}` : "";
  return `¡Hola${nombre ? ` ${nombre}` : ""}! Te escribo para recordarte tu saldo pendiente de ${formatCurrency(f.balance ?? 0)}${vence}. ¿Coordinamos el pago? Gracias.`;
}

const ESTADO: Record<NonNullable<Fiado["status"]>, { label: string; clase: string }> = {
  VENCIDO: { label: "Vencido", clase: "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" },
  ACTIVO: { label: "Activo", clase: "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent-ink)]" },
  PAGADO: { label: "Pagado", clase: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  CANCELADO: { label: "Cancelado", clase: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] line-through" },
};

function Plazo({ f }: { f: Fiado }) {
  if (!f.dueDate || (f.status !== "ACTIVO" && f.status !== "VENCIDO")) return <span className="text-[var(--text-tertiary)]">—</span>;
  const d = diasHasta(f.dueDate);
  if (esVencido(f) || d < 0) {
    /* Con la etiqueta «Vencido» al lado, basta «Hace N días» (a 400 px entra en una línea). */
    const hace = `${esVencido(f) ? "Hace" : "Venció hace"} ${plural(Math.max(1, -d), "día", "días")}`;
    return <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{hace}</span>;
  }
  if (d === 0) return <span className="font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">Vence hoy</span>;
  return <span className="text-[var(--text-secondary)]">Vence en {plural(d, "día", "días")}</span>;
}

/* Misma grilla para cabecera y filas cuando la tarjeta mide ≥ 42rem (@container);
   más angosta (celular, tablet con barra lateral), cada fiado en dos líneas. */
const COLUMNAS = "@2xl:grid-cols-[minmax(0,1fr)_7rem_6.5rem_9rem_7.5rem]";

function FilaFiado({ f }: { f: Fiado }) {
  const estado = ESTADO[f.status ?? "ACTIVO"] ?? ESTADO.ACTIVO;
  const enlaceWa = debe(f) ? waLink(f.customerPhone, textoRecordatorio(f)) : null;
  const nombre = f.customerName || f.customerPhone || "Sin nombre";
  return (
    <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3", COLUMNAS)}>
      {f.customerPhone ? (
        <EnlacePanel cosa="cliente" id={f.customerPhone} apariencia="heredada" className="truncate text-sm font-medium text-[var(--text-primary)]" title={`Abrir la ficha de ${nombre}`}>
          {nombre}
        </EnlacePanel>
      ) : (
        <span className="truncate text-sm font-medium text-[var(--text-primary)]">{nombre}</span>
      )}
      <span className={cn("text-right text-sm font-semibold tabular-nums", esVencido(f) ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : debe(f) ? "text-[var(--text-primary)]" : "font-normal text-[var(--text-tertiary)]")}>
        {formatCurrency(f.balance ?? 0)}
      </span>
      {/* Angosto: estado, plazo y aviso en una segunda línea; ancho: son columnas. */}
      <div className="col-span-2 flex items-center gap-2 text-xs @2xl:contents">
        <span className={cn("w-fit rounded-full border px-2 py-0.5 text-xs font-medium", estado.clase)}>{estado.label}</span>
        <span className="text-xs">
          <Plazo f={f} />
        </span>
        {enlaceWa ? (
          <a
            href={enlaceWa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Recordarle por WhatsApp a ${nombre}`}
            className="ml-auto inline-flex min-h-9 items-center justify-center gap-1.5 justify-self-end rounded-md border border-[var(--color-whatsapp)]/40 bg-[var(--color-whatsapp)]/10 px-2.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--color-whatsapp)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] @2xl:ml-0 @2xl:min-h-8"
          >
            <MessageCircle className="h-3.5 w-3.5 text-[var(--color-whatsapp)]" aria-hidden />
            Recordar
          </a>
        ) : (
          <span className="ml-auto justify-self-end text-[var(--text-tertiary)] @2xl:ml-0">—</span>
        )}
      </div>
    </li>
  );
}

export default function FiadosRiesgoIA() {
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [estado, setEstado] = useState<"cargando" | "error" | "listo">("cargando");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const cargar = useCallback(async () => {
    setEstado("cargando");
    try {
      const r = await fetch("/api/fiados");
      if (!r.ok) throw new Error(String(r.status));
      const d: unknown = await r.json();
      const lista = Array.isArray(d) ? d : ((d as { fiados?: Fiado[] })?.fiados ?? []);
      setFiados(lista as Fiado[]);
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const kpis = useMemo(() => {
    const deben = fiados.filter(debe);
    const vencidos = fiados.filter(esVencido).length;
    const activos = fiados.filter((f) => f.status === "ACTIVO").length;
    return {
      saldo: deben.reduce((s, f) => s + (f.balance ?? 0), 0),
      vencidos,
      registros: activos + vencidos,
      clientes: new Set(deben.map((f) => f.customerPhone ?? f.customerName ?? f.id)).size,
      riesgo: nivelDeRiesgo(vencidos, activos),
    };
  }, [fiados]);

  const cuentas = useMemo(
    () => Object.fromEntries(FILTROS.map((x) => [x.id, fiados.filter(x.cumple).length])) as Record<Filtro, number>,
    [fiados],
  );

  const lista = useMemo(() => {
    const cumple = FILTROS.find((x) => x.id === filtro)?.cumple ?? (() => true);
    return fiados
      .filter(cumple)
      .sort((a, b) => rango(a) - rango(b) || (b.balance ?? 0) - (a.balance ?? 0));
  }, [fiados, filtro]);

  if (estado === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5 px-4 py-3 text-sm text-[var(--text-primary)]">
        No pudimos traer los fiados.
        <button type="button" onClick={() => void cargar()} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </button>
      </div>
    );
  }

  const cargando = estado === "cargando";
  const riesgo = RIESGO[kpis.riesgo];

  return (
    <div className="@container space-y-4" aria-busy={cargando}>
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        {cargando ? (
          Array.from({ length: 4 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />)
        ) : (
          <>
            <StatCard density="compact" icon={CreditCard} label="Te deben" value={formatCurrency(kpis.saldo)} subValue={plural(kpis.registros, "fiado abierto", "fiados abiertos")} emphasis="neutral" iconEmphasis />
            <StatCard density="compact" icon={AlertTriangle} label="Vencidos" value={String(kpis.vencidos)} subValue={kpis.vencidos === 1 ? "cuenta" : "cuentas"} emphasis={kpis.vencidos > 0 ? "error" : "neutral"} iconEmphasis />
            <StatCard density="compact" icon={Users} label="Clientes" value={String(kpis.clientes)} subValue="con saldo abierto" emphasis="neutral" iconEmphasis />
            <StatCard density="compact" icon={ShieldAlert} label="Riesgo" value={kpis.riesgo} subValue={riesgo.detalle} emphasis={riesgo.emphasis} iconEmphasis />
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {/* Filtros pegados a la lista que filtran (ley de la vista 5) + salida al módulo. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-base)] px-3 py-2.5">
          {FILTROS.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={filtro === x.id}
              onClick={() => setFiltro(x.id)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                filtro === x.id
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]",
              )}
            >
              {x.label}
              {!cargando && <span className="tabular-nums opacity-80">{cuentas[x.id]}</span>}
            </button>
          ))}
          <EnlacePanel href="/admin?tab=fiados#fiados" className="ml-auto text-xs">
            Ir a Fiados
          </EnlacePanel>
        </div>

        {cargando ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-md bg-[var(--surface-sunken)]" />)}
          </div>
        ) : lista.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">{VACIO[filtro]}</p>
        ) : (
          <>
            <div className={cn("hidden gap-x-3 bg-[var(--surface-sunken)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] @2xl:grid", COLUMNAS)} aria-hidden>
              <span>Cliente</span>
              <span className="text-right">Saldo</span>
              <span>Estado</span>
              <span>Plazo</span>
              <span className="text-right">Aviso</span>
            </div>
            <ul className="divide-y divide-[var(--rule-soft)]">
              {lista.map((f) => (
                <FilaFiado key={f.id} f={f} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
