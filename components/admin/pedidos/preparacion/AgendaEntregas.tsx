"use client";

/**
 * Agenda de entregas (N01 Programados): los pedidos en marcha que tienen día
 * de entrega, agrupados por día y por franja. Desde ayer en adelante: lo de
 * ayer que sigue abierto es lo atrasado.
 *
 * El día y la franja los elige el cliente al pagar en la tienda
 * (`DeliverySlot`). Hasta el 17-10 el checkout los mandaba y el servidor no
 * los guardaba: por eso la agenda de los pedidos viejos sale vacía.
 */

import { useMemo } from "react";
import { CalendarClock } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { FRANJAS, diaRelativo, textoFranja, type EntregaAgendada } from "@/lib/pedidos/franja-entrega";
import { ROTULO_ESTADO } from "@/lib/pedidos/analisis-operativo";
import { numeroPedido } from "@/lib/pedidos/preparacion";
import { Vacio } from "./piezas";

interface Dia {
  fecha: string;
  franjas: { franja: string; pedidos: EntregaAgendada[] }[];
  total: number;
}

/** Orden de las franjas: mañana, tarde, noche y después lo escrito a mano. */
const ordenFranja = (f: string) => {
  const i = (FRANJAS as readonly string[]).indexOf(f);
  return i === -1 ? FRANJAS.length : i;
};

function agrupar(agenda: readonly EntregaAgendada[]): Dia[] {
  const porDia = new Map<string, Map<string, EntregaAgendada[]>>();
  for (const e of agenda) {
    const dia = porDia.get(e.fecha) ?? new Map<string, EntregaAgendada[]>();
    dia.set(e.franja, [...(dia.get(e.franja) ?? []), e]);
    porDia.set(e.fecha, dia);
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, franjas]) => {
      const lista = [...franjas.entries()]
        .sort(([a], [b]) => ordenFranja(a) - ordenFranja(b) || a.localeCompare(b, "es"))
        .map(([franja, pedidos]) => ({ franja, pedidos }));
      return { fecha, franjas: lista, total: lista.reduce((n, f) => n + f.pedidos.length, 0) };
    });
}

export function AgendaEntregas({ agenda, ahora }: { agenda: readonly EntregaAgendada[]; ahora: number }) {
  const ficha = useFichaEnUrl("pedido");
  const dias = useMemo(() => agrupar(agenda), [agenda]);

  if (dias.length === 0) {
    return (
      <Vacio
        icono={CalendarClock}
        texto="Ningún pedido en marcha tiene día de entrega. Aparecen acá los que el cliente programa al pagar en tu tienda."
      />
    );
  }

  const hoy = new Date(ahora);
  return (
    <div className="flex flex-col gap-3">
      {dias.map((d) => {
        const rotulo = diaRelativo(d.fecha, hoy);
        const atrasado = rotulo === "Ayer";
        return (
          <section key={d.fecha} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
            <div className="mb-2 flex items-baseline gap-2">
              <CardTitle>{rotulo}</CardTitle>
              <span className="text-sm tabular-nums text-[var(--text-tertiary)]">
                {d.total} {d.total === 1 ? "pedido" : "pedidos"}
              </span>
              {atrasado && <span className="text-sm font-semibold text-[var(--data-warning-ink)]">Atrasado: sigue sin entregar</span>}
            </div>
            <div className="flex flex-col gap-2">
              {d.franjas.map((f) => (
                <div key={f.franja} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                  <span className="shrink-0 text-sm font-semibold text-[var(--text-secondary)] sm:w-44">{textoFranja(f.franja)}</span>
                  <ul className="flex min-w-0 flex-1 flex-col divide-y divide-[var(--rule-soft)]">
                    {f.pedidos.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => ficha.abrir(e.id)}
                          className="flex min-h-12 w-full flex-wrap items-center gap-x-2 text-left text-sm hover:bg-[var(--surface-sunken)]"
                          title="Abrir el pedido"
                        >
                          <span className="font-mono font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">{numeroPedido(e.id)}</span>
                          <span className="min-w-0 truncate text-[var(--text-primary)]">{e.cliente}</span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold",
                              e.estado === "en_camino"
                                ? "bg-[var(--data-info-50)] text-[var(--data-info-ink)]"
                                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                            )}
                          >
                            {ROTULO_ESTADO[e.estado] ?? e.estado}
                          </span>
                          {e.nota && <span className="w-full truncate text-xs text-[var(--text-tertiary)] sm:w-auto">{e.nota}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
