"use client";

/**
 * Sección Cajeros › «Descuentos y quitados del mes»: por cajero, cuánto
 * descontó en el POS y qué productos quitó del ticket antes de cobrar (Square:
 * «descuentos por empleado» y «comps & voids»). El detalle de lo quitado va en
 * el «⋯» de cada fila. Cifras del servidor (`GET /api/pos/cajeros-mes`).
 */
import { useState } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { Eye, MoreHorizontal, ShieldCheck } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { Inicial } from "./TurnosPorCajero";
import { QuitadosModal } from "./QuitadosModal";
import { nombreDeClave, useControlCajeros, type FilaControlCajero } from "./use-control-cajeros";
import type { Cajero } from "./tipos";

const TITULO_BLOQUE = "flex items-center gap-2 px-4 py-3 text-sm font-bold text-[var(--text-primary)] border-b border-[var(--rule-soft)]";
const BLOQUE = "bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Primero quien más quitó (en plata); después quien más descontó. */
function ordenar(filas: FilaControlCajero[]): FilaControlCajero[] {
  return [...filas].sort((a, b) => b.quitados.monto - a.quitados.monto || b.descuentos.monto - a.descuentos.monto);
}

export function ControlCajerosMes({ cajeros }: { cajeros: Cajero[] }) {
  const { estado, filas, reintentar } = useControlCajeros();
  const [abierto, setAbierto] = useState<{ clave: string; nombre: string } | null>(null);

  if (estado === "sin-permiso") return null;

  /* El ⋯ no devuelve el foco a su botón al elegir: se enfoca antes de abrir. */
  const verQuitados = (clave: string, nombre: string) => () => {
    document.querySelector<HTMLElement>(`[data-menu-cajero="${CSS.escape(clave)}"] button`)?.focus({ preventScroll: true });
    setAbierto({ clave, nombre });
  };
  const accionesDe = (f: FilaControlCajero, nombre: string): MenuAccion[] => [
    { id: "quitados", label: "Ver lo que quitó", hint: "Cada producto, cuándo y por cuánto", icon: Eye, onSelect: verQuitados(f.clave, nombre) },
  ];

  return (
    <section className={BLOQUE} aria-busy={estado === "cargando"}>
      {/* El ⓘ va al lado del título, no adentro (lector de pantalla: el título es sólo el título). */}
      <div className={TITULO_BLOQUE}>
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <ShieldCheck className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          Descuentos y quitados este mes
        </CardTitle>
        <InfoTip
          title="Descuentos y productos quitados"
          what="Por cajero: lo que descontó al total de sus tickets y los productos que sacó del ticket ANTES de cobrar (la X de una línea o «Vaciar carrito»)."
          affects="Descuentos: el del total del ticket, que incluye el trueque; el descuento por producto ya baja el precio de la línea. Quitados: cuenta desde el 11-10."
          example="Quitar seguido después de mostrar el total, o vaciar tickets enteros, merece una mirada: el detalle está en el «⋯»."
        />
      </div>

      {estado === "cargando" ? (
        <div className="h-24 animate-pulse bg-[var(--surface-sunken)]" role="status" aria-label="Cargando descuentos y quitados" />
      ) : estado === "error" ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm text-[var(--data-error-ink)]">
          No se pudo cargar el control del mes.
          <button type="button" onClick={reintentar} className="min-h-12 rounded-xl px-3 font-bold underline">Reintentar</button>
        </p>
      ) : filas.length === 0 ? (
        <p className="p-6 text-center text-sm text-[var(--text-secondary)]">Este mes nadie dio descuentos ni quitó productos del ticket.</p>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Cajero</th>
              <th className="text-right">Descuentos</th>
              <th className="text-right">Quitados del ticket</th>
              <th className="w-14"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {ordenar(filas).map((f) => {
              const nombre = nombreDeClave(f.clave, cajeros);
              return (
                <tr key={f.clave}>
                  <td className="font-medium">
                    <span className="flex items-center gap-2">
                      <Inicial nombre={nombre} />
                      <span className="truncate max-w-[160px]">{nombre}</span>
                    </span>
                  </td>
                  {/* Un div por celda: en el celular la celda es flex y las dos líneas quedaban lado a lado. */}
                  <td className="text-right whitespace-nowrap">
                    <div className="min-w-0">
                      <span className="block font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(f.descuentos.monto)}</span>
                      <span className="block text-sm text-[var(--text-secondary)]">{plural(f.descuentos.tickets, "ticket", "tickets")}</span>
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <div className="min-w-0">
                      <span className="block font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(f.quitados.monto)}</span>
                      <span className="block text-sm text-[var(--text-secondary)]">{plural(f.quitados.unidades, "producto", "productos")}</span>
                    </div>
                  </td>
                  <td className="text-right">
                    {f.quitados.veces > 0 && (
                      <div data-menu-cajero={f.clave} className="inline-flex">
                        <ActionMenu label={`Más de ${nombre}`} icon={MoreHorizontal} actions={accionesDe(f, nombre)} soloIcono size="md" className="w-12 shrink-0" title="Ver lo que quitó" />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}

      <QuitadosModal usuario={abierto?.clave ?? null} nombre={abierto?.nombre ?? ""} onCerrar={() => setAbierto(null)} />
    </section>
  );
}
