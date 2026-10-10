"use client";

/**
 * «Indicadores» de Vender (10-10): lo que sirve MIENTRAS se vende y no está en otra pestaña.
 *
 * Antes Vender pintaba las mismas cifras tres veces: la tira del turno (duración, ventas, cantidad,
 * ticket, comisión, medio y producto top), la tira «Hoy» de la cabecera (ventas, total y ticket del
 * día) y una píldora flotante abajo a la izquierda (duración, total, cantidad, ticket y ventas por
 * hora) — dos de ellas pidiendo /api/pos/metrics cada minuto. La duración, lo vendido, cuántas ventas
 * y por medio de pago ya están en Turnos (turno abierto) y en Caja › Hoy; el total del día, en
 * «Ventas de hoy» (F4). Acá queda sólo lo propio del mostrador, plegado en el botón de la cabecera.
 *
 * El turno se pide sólo con el panel abierto (y cada minuto mientras sigue abierto); el ticket del
 * día viaja en el botón y se actualiza con cada venta.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { HandCoins, Receipt, Timer, Trophy } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { logger } from "@/lib/logger";
import { fmt } from "@/components/admin/pos/pos-shared";
import { useResumenHoy } from "@/components/admin/pos/use-resumen-hoy";

interface MetricasTurno {
  turnoActivo: boolean;
  turnoMinutos?: number;
  cantidadVentas?: number;
  topProductos?: { nombre: string; cantidad: number }[];
  comisionEstimada?: number;
  comisionRate?: number;
}

function Tarjeta({ icono: Icono, rotulo, ayuda, children }: { icono: typeof Receipt; rotulo: string; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
          <Icono className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip what={ayuda} />}
      </div>
      {children}
    </div>
  );
}

const SIN_TURNO = <p className="text-sm text-[var(--text-tertiary)]">Sin turno abierto</p>;

export function usePOSIndicadores(refreshKey: number) {
  const hoy = useResumenHoy(refreshKey);
  const [turno, setTurno] = useState<MetricasTurno | null>(null);
  const r = hoy.estado === "ok" ? hoy.resumen : null;
  const t = turno?.turnoActivo ? turno : null;
  const porHora = t && (t.turnoMinutos ?? 0) > 0 ? (t.cantidadVentas ?? 0) / ((t.turnoMinutos ?? 0) / 60) : null;

  const tarjetas = [
    <Tarjeta
      key="ticket"
      icono={Receipt}
      rotulo="Ticket promedio de hoy"
      ayuda={r ? `${r.ventas} venta${r.ventas === 1 ? "" : "s"} ${r.alcance === "tuyas" ? "tuyas" : "del local"} hoy. El total y la lista están en «Ventas de hoy» (F4).` : undefined}
    >
      <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{r && r.ventas > 0 ? fmt(r.ticketPromedio) : "—"}</p>
    </Tarjeta>,
    <Tarjeta key="top" icono={Trophy} rotulo="Lo más vendido del turno">
      {!t ? SIN_TURNO : (t.topProductos ?? []).length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">Todavía nada</p>
      ) : (
        <ol className="space-y-0.5 text-sm">
          {(t.topProductos ?? []).map((p) => (
            <li key={p.nombre} className="flex justify-between gap-2">
              <span className="truncate text-[var(--text-primary)]">{p.nombre}</span>
              <span className="shrink-0 font-bold tabular-nums text-[var(--text-secondary)]">×{p.cantidad}</span>
            </li>
          ))}
        </ol>
      )}
    </Tarjeta>,
    <Tarjeta key="ritmo" icono={Timer} rotulo="Ritmo del turno" ayuda="Ventas por hora desde que abriste el turno.">
      {!t ? SIN_TURNO : <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{porHora != null ? `${porHora.toFixed(1)} ventas/h` : "—"}</p>}
    </Tarjeta>,
    <Tarjeta
      key="comision"
      icono={HandCoins}
      rotulo="Tu comisión estimada"
      ayuda={`Al ${t?.comisionRate ?? 2.5} % de lo que vendiste en este turno. La de cada vendedor, en Comisiones.`}
    >
      {!t ? SIN_TURNO : <p className="text-lg font-extrabold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">{fmt(t.comisionEstimada ?? 0)}</p>}
    </Tarjeta>,
  ];

  const plegables = useKpisPlegables({
    claveMemoria: "pos-vender",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: hoy.estado === "cargando",
    resumen: r && r.ventas > 0 ? `Ticket ${fmt(r.ticketPromedio)}` : undefined,
    tarjetas,
  });

  const pedirTurno = useCallback(async () => {
    try {
      const res = await fetch("/api/pos/metrics", { cache: "no-store" });
      if (res.ok) setTurno((await res.json()) as MetricasTurno);
    } catch (err) {
      logger.warn("[pos] indicadores del turno sin respuesta", { error: String(err) });
    }
  }, []);

  // Sólo con el panel abierto: plegado no muestra nada del turno.
  useEffect(() => {
    if (!plegables.abierto) return;
    void pedirTurno();
    const intervalo = setInterval(() => void pedirTurno(), 60_000);
    return () => clearInterval(intervalo);
  }, [plegables.abierto, refreshKey, pedirTurno]);

  return plegables;
}
