"use client";

import { useMemo, useState } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { MoreHorizontal, Search, Settings2, ShoppingBag, UserMinus, UserPlus } from "@buleje/design-system/icons";
import { toast } from "sonner";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { limaDateKey } from "@/lib/utils";
import type { RevendedoraFila } from "@/lib/revendedoras/reglas";
import { useRevendedoras } from "./use-revendedoras";
import { diaDeLima, fechaCorta, nombreDelMes, pct, soles } from "./formato";
import ConfigRevendedorasModal from "./ConfigRevendedorasModal";
import AgregarRevendedoraModal from "./AgregarRevendedoraModal";
import PedidoRevendedoraModal from "./PedidoRevendedoraModal";

type Abierto = { que: "reglas" } | { que: "agregar" } | { que: "pedido"; customerId: string | null } | null;

const INPUT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Clientes › Revendedoras (ADR-507): clientas de otros pueblos que compran con
 * descuento y revenden. Una fila por revendedora con lo que compró este mes (en
 * Lima), su descuento y cuánto le falta para el siguiente nivel. Las reglas y el
 * pedido armado van en ventanas; el precio lo calcula siempre el servidor.
 */
export default function RevendedorasVista() {
  const { datos, cargando, error, recargar, guardarConfig, marcar, quitar } = useRevendedoras();
  const { confirm } = useConfirm();
  const [buscar, setBuscar] = useState("");
  const [abierto, setAbierto] = useState<Abierto>(null);
  const hoy = limaDateKey();

  const filas = useMemo(() => {
    const lista = datos?.revendedoras ?? [];
    const q = sinTildes(buscar.trim());
    if (!q) return lista;
    return lista.filter((r) => sinTildes(`${r.nombre} ${r.celular} ${r.pueblo}`).includes(q));
  }, [datos, buscar]);

  async function quitarRevendedora(r: RevendedoraFila) {
    const ok = await confirm({
      title: `¿Quitar a ${r.nombre} de revendedoras?`,
      description: "Vuelve al precio general. Sus compras no se tocan y la puedes volver a agregar cuando quieras.",
      intent: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (!ok) return;
    const res = await quitar(r.customerId);
    if (res.ok) toast.success(`${r.nombre} ya no es revendedora`);
    else toast.error(res.error);
  }

  const acciones: MenuAccion[] = [
    { id: "pedido", label: "Armar un pedido", hint: "Lista de precios por nivel y el total que paga", icon: ShoppingBag, onSelect: () => setAbierto({ que: "pedido", customerId: null }) },
    { id: "reglas", label: "Reglas", hint: "Descuentos, pedido mínimo, envío y ganancia mínima", icon: Settings2, onSelect: () => setAbierto({ que: "reglas" }) },
  ];

  const r = datos?.resumen;
  const config = datos?.config;

  return (
    <div className="space-y-3">
      {/* Una fila: título ⓘ · resumen del mes · buscar · Agregar · Más */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Revendedoras</SectionTitle>
          <InfoTip
            title="Revendedoras"
            what="Clientas de otros pueblos que te compran con descuento para revender. El descuento sube según lo que compran en el mes."
            affects="El precio nunca baja de tu ganancia mínima y las ofertas no suman descuento. El total lo calcula el sistema, no la pantalla."
            example="Rosa, de Oxapampa, pide productos por S/ 500 de catálogo: paga S/ 400 y gana S/ 100 al venderlos."
            side="bottom"
          />
        </div>
        {r && (
          <span className="rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-sm text-[var(--text-secondary)] sm:whitespace-nowrap" data-testid="revendedoras-resumen">
            <b className="text-[var(--text-primary)]">{r.activas}</b> de {r.meta} compraron en {nombreDelMes(r.mes)} · {soles(r.vendidoMes)}
          </span>
        )}
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 max-sm:basis-full">
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Buscar revendedora</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre, celular o pueblo" className={INPUT} />
          </label>
          <button type="button" onClick={() => setAbierto({ que: "agregar" })} className={button({ variant: "primary", className: "h-12 shrink-0 rounded-2xl" })}>
            <UserPlus className="h-4 w-4" aria-hidden />
            <span className="max-sm:hidden">Agregar revendedora</span>
            <span className="sm:hidden">Agregar</span>
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Armar un pedido y reglas" />
        </div>
      </div>

      {config && !config.activo && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
          <span className="min-w-0 flex-1">Las reglas de revendedoras todavía no están activas en tu negocio.</span>
          <InfoTip
            title="Reglas apagadas"
            what="Mientras estén apagadas, la lista de precios usa los números de fábrica: 20 % de entrada, 25 % desde S/ 600 al mes, pedido mínimo S/ 150."
            affects="Revísalas y actívalas para que valgan las de tu negocio."
            example="Si tu ganancia mínima es 35 %, cámbiala antes de activar."
            side="bottom"
          />
          <button type="button" onClick={() => setAbierto({ que: "reglas" })} className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-2xl" })}>
            Revisar y activar
          </button>
        </div>
      )}

      {error && !datos ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void recargar()} className={button({ variant: "secondary", className: "h-12 rounded-2xl" })}>Reintentar</button>
        </div>
      ) : cargando && !datos ? (
        <TableSkeleton rows={4} cols={5} />
      ) : filas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
          {buscar ? "Ninguna revendedora con ese nombre, celular o pueblo." : "Todavía no tienes revendedoras: agrega una clienta con «Agregar revendedora»."}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--rule-base)]">
          <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full" data-testid="tabla-revendedoras">
            <thead>
              <tr>
                <th>Revendedora</th>
                <th className="text-right">Este mes</th>
                <th className="text-right">Descuento</th>
                <th>Para subir de nivel</th>
                <th>Fiado</th>
                <th className="text-right" data-label="Acciones"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {filas.map((f) => (
                <FilaRevendedora
                  key={f.customerId}
                  f={f}
                  hoy={hoy}
                  onPedido={() => setAbierto({ que: "pedido", customerId: f.customerId })}
                  onQuitar={() => void quitarRevendedora(f)}
                />
              ))}
            </tbody>
          </DataTable>
        </div>
      )}

      {datos && abierto?.que === "reglas" && (
        <ConfigRevendedorasModal
          open
          onClose={() => setAbierto(null)}
          config={datos.config}
          porDefecto={datos.porDefecto}
          categorias={datos.categorias}
          onGuardar={guardarConfig}
        />
      )}
      {abierto?.que === "agregar" && <AgregarRevendedoraModal open onClose={() => setAbierto(null)} onMarcar={marcar} />}
      {datos && abierto?.que === "pedido" && (
        <PedidoRevendedoraModal open onClose={() => setAbierto(null)} revendedoras={datos.revendedoras} inicial={abierto.customerId} />
      )}
    </div>
  );
}

function FilaRevendedora({ f, hoy, onPedido, onQuitar }: { f: RevendedoraFila; hoy: string; onPedido: () => void; onQuitar: () => void }) {
  const sig = f.nivel.siguiente;
  const avance = sig && sig.desde > 0 ? Math.min(100, (f.compradoMes / sig.desde) * 100) : 100;
  const sinFiado = f.sinCreditoHasta && f.sinCreditoHasta > hoy;
  const acciones: MenuAccion[] = [
    { id: "pedido", label: "Armar su pedido", hint: "Con el descuento que le toca hoy", icon: ShoppingBag, onSelect: onPedido },
    { id: "quitar", label: "Quitar de revendedoras", hint: "Vuelve al precio general", icon: UserMinus, tone: "danger", onSelect: onQuitar },
  ];
  return (
    <tr data-revendedora={f.customerId}>
      <td className="align-top">
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{f.nombre}</div>
          <div className="text-xs text-[var(--text-tertiary)]">{[f.celular, f.pueblo].filter(Boolean).join(" · ") || "Sin celular"}</div>
        </div>
      </td>
      <td className="whitespace-nowrap text-right align-top">
        <div>
          <div className="font-semibold tabular-nums">{soles(f.compradoMes)}</div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {f.comprasMes === 0 ? (f.ultimaCompra ? `Última: ${diaDeLima(f.ultimaCompra)}` : "Sin compras todavía") : `${f.comprasMes} ${f.comprasMes === 1 ? "compra" : "compras"}`}
          </div>
        </div>
      </td>
      <td className="text-right align-top">
        <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          {pct(f.nivel.descuento)}
        </span>
      </td>
      <td className="min-w-40 align-top">
        {sig ? (
          <div className="space-y-1">
            <div className="text-sm">
              Le falta <b className="tabular-nums">{soles(sig.falta)}</b> para el {pct(sig.descuento)}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${avance}%` }} />
            </div>
          </div>
        ) : (
          <span className="text-sm text-[var(--text-secondary)]">En el nivel más alto</span>
        )}
      </td>
      <td className="align-top text-sm sm:whitespace-nowrap">
        {sinFiado ? (
          <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">Paga al contado hasta {fechaCorta(f.sinCreditoHasta)}</span>
        ) : (
          <span className="text-[var(--text-secondary)]">Puede fiar</span>
        )}
      </td>
      <td className="text-right align-top">
        <ActionMenu label={`Acciones de ${f.nombre}`} icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12" />
      </td>
    </tr>
  );
}
