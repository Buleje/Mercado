"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { BlockTitle, DataTable, LoadingState } from "@buleje/design-system";
import { PackageCheck, RefreshCw } from "@buleje/design-system/icons";
import CabeceraOrdenes from "@/components/admin/ordenes-compra/CabeceraOrdenes";
import OcFechaPrometida from "@/components/admin/ordenes-compra/OcFechaPrometida";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { claveDeDia, diaCorto, lineasDeSeguimiento, listarCorto, type GrupoEntrega } from "@/lib/compras/ciclo-oc";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrdenOC } from "@/components/admin/ordenes-compra/oc-compartido";
import { useEntregasOc } from "@/components/admin/ordenes-compra/hooks/use-entregas-oc";

const OCRecepcionModal = dynamic(() => import("@/components/admin/compras/OCRecepcionModal"), { ssr: false });

const AYUDA = {
  title: "Entregas",
  what: "Las órdenes que esperan mercadería, agrupadas por el día que el proveedor prometió traerla.",
  affects:
    "Cambiar la fecha sólo reprograma: no suma stock ni cambia el estado de la orden, y queda anotado quién la cambió. Para sumar al stock, usa «Recibir».",
  example: "Frigorífico Amazonia prometió el jueves 15/10 y no vino: sale en «Atrasadas». Si te dice que llega el lunes, cambia la fecha.",
};

const TONO_GRUPO: Record<GrupoEntrega, string> = {
  atrasadas: "text-[var(--data-error-ink)]",
  hoy: "text-[var(--data-warning-ink)]",
  semana: "text-[var(--text-primary)]",
  despues: "text-[var(--text-primary)]",
  sin_fecha: "text-[var(--text-secondary)]",
};

/** «Faltan 3 arroz, 2 atún» si ya llegó una parte; si no, lo pedido. */
function queFalta(o: OrdenOC): string {
  const lineas = lineasDeSeguimiento(o.items, o.seguimiento);
  const empezo = lineas.some((l) => l.llego > 0 || l.noLlegara > 0);
  if (!empezo) return listarCorto(lineas.map((l) => `${l.pedido} ${l.nombre}`));
  const faltan = lineas.filter((l) => l.falta > 0);
  if (faltan.length === 0) return "Ya llegó todo: falta darla por recibida";
  return `Faltan ${listarCorto(faltan.map((l) => `${l.falta} ${l.nombre}`))}`;
}

/**
 * C14 · Compras › Órdenes › Entregas: lo que tiene que llegar, por día
 * prometido (atrasadas arriba), con «Recibir» en cada orden y el lápiz para
 * reprogramar. Antes la fecha prometida sólo se veía dentro de cada orden.
 */
export default function OcEntregas({ barra }: { barra?: ReactNode }) {
  const { grupos, cargando, error, aviso, hoy, recibiendo, setRecibiendo, alRecibir, cambiarFecha, guardandoFecha, cargar } = useEntregasOc();

  return (
    <div className="space-y-4">
      <CabeceraOrdenes
        barra={barra}
        ayuda={AYUDA}
        acciones={[{ id: "actualizar", label: "Actualizar", hint: "Vuelve a traer las órdenes", icon: RefreshCw, onSelect: () => void cargar() }]}
        tituloMenu="Actualizar"
      />

      {aviso && <p role="status" className="text-sm font-semibold text-[var(--data-success-ink)]">{aviso}</p>}
      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--data-error-ink)]">
          {error}
          <button type="button" onClick={() => void cargar()} className={button({ variant: "ghost", className: "rounded-xl" })}>Reintentar</button>
        </p>
      )}

      {cargando ? (
        <LoadingState />
      ) : grupos.length === 0 ? (
        !error && <p className="text-sm text-[var(--text-secondary)]">No hay órdenes esperando mercadería.</p>
      ) : (
        grupos.map((g) => (
          <section key={g.id} aria-label={g.rotulo} className="space-y-2" data-qa={`entregas-${g.id}`}>
            <BlockTitle className={TONO_GRUPO[g.id]}>{g.rotulo} · {g.ordenes.length}</BlockTitle>
            <DataTable className="[&_thead_th]:py-0">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Prometida</th>
                  <th>Qué llega</th>
                  <th className="text-right">Total</th>
                  <th className="text-right"><span className="sr-only">Recibir</span></th>
                </tr>
              </thead>
              <tbody>
                {g.ordenes.map((o) => {
                  const pedida = claveDeDia(o.createdAt);
                  return (
                    <tr key={o.id}>
                      <td>
                        <EnlacePanel cosa="oc" id={o.id} apariencia="heredada" className="font-semibold">{o.supplierName || "Sin proveedor"}</EnlacePanel>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {o.status === "parcial" ? "Llegó una parte" : pedida ? `Pedida el ${diaCorto(pedida)}` : "Pendiente"}
                        </p>
                      </td>
                      <td>
                        <OcFechaPrometida o={o} hoy={hoy} guardando={guardandoFecha === o.id} onCambiar={(f) => cambiarFecha(o, f)} />
                      </td>
                      <td className="max-w-[20rem] text-sm text-[var(--text-secondary)]">{queFalta(o)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatCurrency(Number(o.total))}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => setRecibiendo(o)}
                          className={cn(button({ variant: "secondary", className: "rounded-xl" }), "shrink-0")}
                          title="Contar lo que llegó y sumarlo al stock"
                          data-qa="entregas-recibir"
                        >
                          <PackageCheck className="h-4 w-4" aria-hidden /> Recibir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </section>
        ))
      )}

      {recibiendo && (
        <OCRecepcionModal
          ocId={recibiendo.id}
          supplier={recibiendo.supplierName}
          items={recibiendo.items}
          seguimiento={recibiendo.seguimiento}
          onComplete={alRecibir}
          onClose={() => setRecibiendo(null)}
        />
      )}
    </div>
  );
}
