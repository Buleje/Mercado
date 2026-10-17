"use client";

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { CheckCircle, Copy, MoreHorizontal, RotateCcw, ThumbsUp, Wallet, XCircle } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BOTON, CLASE_CHIP } from "@/components/admin/rrhh/rrhh-form";
import { useIndicadoresReparto } from "@/components/admin/delivery/reparto-indicadores";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ResolverRetiroModal } from "./ResolverRetiroModal";
import { useRetiros, type CuerpoAccion, type FiltroHistorial, type RespuestaAccion, type RetiroFila } from "./use-retiros";

const ESTADO: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" },
  approved: { label: "Aprobado", cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
  paid: { label: "Pagado", cls: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" },
  rejected: { label: "Rechazado", cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" },
};

function ChipEstado({ status }: { status: string }) {
  const e = ESTADO[status] ?? { label: status, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
  return <span className={cn(CLASE_CHIP, e.cls)}>{e.label}</span>;
}

/** Lo que pasó al deshacer un pago, en una línea (el servidor ya decidió todo). */
function textoDeshecho(retiro: RetiroFila, r: RespuestaAccion): string {
  const gasto = r.gastoBorrado ? " Se borró su gasto." : " Su gasto ya no estaba en Gastos.";
  const d = r.devolucion;
  let caja = "";
  if (d?.estado === "devuelto") caja = ` Los ${formatCurrency(d.monto)} vuelven a la caja abierta.`;
  else if (d?.estado === "cerrada") {
    caja = ` El efectivo salió de la caja del ${d.dia}, que ya cerró: si la plata volvió al cajón, anótala como ingreso en la caja de hoy.`;
  }
  return `Pago deshecho: el retiro de ${retiro.partnerName} vuelve a «por pagar».${gasto}${caja}`;
}

const VACIO: Record<FiltroHistorial, string> = {
  todos: "Todavía no hay retiros resueltos.",
  paid: "Todavía no hay retiros pagados.",
  rejected: "No hay retiros rechazados.",
};

/**
 * «Retiros por pagar»: lo que los repartidores pidieron en su app. Pagar anota
 * el gasto (y, en efectivo, el egreso de la caja); rechazar devuelve la plata
 * a su saldo. Todo lo decide el servidor: esta vista sólo pide y muestra.
 *
 * 17-10 (P31): la sección se llamaba «Pagos» y no decía quién le debe a quién.
 * Ahora: «Retiros por pagar» = lo que TU negocio le debe al repartidor; lo que
 * él cobró a tus clientes en efectivo no está acá.
 */
export function RetirosTab() {
  const [filtro, setFiltro] = useState<FiltroHistorial>("todos");
  const { datos, cargando, error, resolver } = useRetiros(filtro);
  const [modal, setModal] = useState<{ retiro: RetiroFila; modo: "pagar" | "rechazar" | "deshacer" } | null>(null);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [aprobando, setAprobando] = useState<string | null>(null);

  async function confirmar(retiro: RetiroFila, cuerpo: CuerpoAccion) {
    const r = await resolver(retiro.id, cuerpo);
    setModal(null);
    if (r.yaEstaba) {
      setAviso({ tono: "ok", texto: "Ese retiro ya estaba resuelto: no se anotó nada de nuevo." });
    } else if (cuerpo.accion === "pagar") {
      const caja = r.caja?.sinCaja ? " No había caja abierta: el cajón no se tocó." : r.caja ? " Salió de la caja abierta." : "";
      setAviso({ tono: "ok", texto: `Pagado ${formatCurrency(retiro.amount)} a ${retiro.partnerName}. Quedó el gasto en Transporte.${caja}` });
    } else if (cuerpo.accion === "deshacer") {
      setAviso({ tono: "ok", texto: textoDeshecho(retiro, r) });
    } else if (cuerpo.accion === "rechazar") {
      setAviso({ tono: "ok", texto: `Rechazado. Los ${formatCurrency(retiro.amount)} vuelven al saldo de ${retiro.partnerName}.` });
    } else {
      setAviso({ tono: "ok", texto: `Aprobado. Los ${formatCurrency(retiro.amount)} de ${retiro.partnerName} quedan apartados hasta que los pagues.` });
    }
  }

  async function aprobar(retiro: RetiroFila) {
    setAprobando(retiro.id);
    try {
      await confirmar(retiro, { accion: "aprobar" });
    } catch (err) {
      setAviso({ tono: "error", texto: err instanceof Error ? err.message : String(err) });
    } finally {
      setAprobando(null);
    }
  }

  function acciones(r: RetiroFila): MenuAccion[] {
    const lista: MenuAccion[] = [];
    if (r.status === "pending") {
      lista.push({ id: "aprobar", label: "Aprobar", hint: "Lo pagas después", icon: ThumbsUp, busy: aprobando === r.id, onSelect: () => void aprobar(r) });
    }
    lista.push({
      id: "copiar",
      label: "Copiar número Yape",
      icon: Copy,
      onSelect: () => void navigator.clipboard?.writeText(r.yapeNumber).catch(() => setAviso({ tono: "error", texto: "No se pudo copiar." })),
    });
    lista.push({ id: "rechazar", label: "Rechazar", icon: XCircle, tone: "danger", onSelect: () => setModal({ retiro: r, modo: "rechazar" }) });
    return lista;
  }

  const historial = datos?.historial ?? [];
  const resumen = datos?.resumen;
  const kpis = useIndicadoresReparto({
    clave: "pagos",
    cargando: !datos && cargando,
    resumen: resumen ? `${formatCurrency(resumen.porPagar.monto)} por pagar` : undefined,
    indicadores: resumen
      ? [
          {
            icono: Wallet,
            rotulo: "Les debes",
            valor: formatCurrency(resumen.porPagar.monto),
            ayuda: "Lo que tus repartidores te pidieron retirar de lo que ganaron con sus tarifas. Es plata que tu negocio les debe.",
            extra: `${resumen.porPagar.cantidad} ${resumen.porPagar.cantidad === 1 ? "retiro" : "retiros"}`,
            tono: resumen.porPagar.cantidad > 0 ? "alerta" : undefined,
          },
          {
            icono: CheckCircle,
            rotulo: "Pagado este mes",
            valor: formatCurrency(resumen.pagadoEsteMes.monto),
            ayuda: "Cada pago quedó también como gasto «Pago a repartidor» en Transporte.",
          },
        ]
      : [],
  });

  return (
    <div className="space-y-4">
      {kpis.boton}
      {kpis.panel}
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle>Retiros por pagar</CardTitle>
        {resumen && resumen.porPagar.cantidad > 0 && (
          <span className="text-sm tabular-nums text-[var(--text-secondary)]">
            {resumen.porPagar.cantidad} {resumen.porPagar.cantidad === 1 ? "retiro" : "retiros"} · {formatCurrency(resumen.porPagar.monto)}
          </span>
        )}
        <InfoTip
          title="Quién le debe a quién"
          what="Acá TÚ le debes al repartidor: pidió retirar, desde su app, lo que ganó con sus tarifas por entrega. No incluye lo que él cobró a tus clientes en efectivo: esa plata es tuya y te la entrega él."
          affects="Al pagar se anota el gasto «Pago a repartidor» en Transporte; en efectivo puede salir de la caja abierta. Rechazar le devuelve la plata a su saldo. Si pagaste por error: «Deshacer pago» en el historial."
          example="Juan pidió S/ 80 a su Yape: lo yapeas, tocas Pagar y queda en Gastos."
        />
      </div>
      {aviso && (
        <p
          role="status"
          className={cn(
            "rounded-xl px-3 py-2 text-sm",
            aviso.tono === "ok" ? "bg-[var(--data-success-100)] text-[var(--data-success-700)]" : "bg-[var(--data-error-100)] text-[var(--data-error-700)]",
          )}
        >
          {aviso.texto}
        </p>
      )}
      {error && <p className="text-sm text-[var(--data-error-700)]">{error}</p>}
      {datos && !datos.puedeResolver && datos.porPagar.length > 0 && (
        <p className="text-sm text-[var(--text-tertiary)]">Solo el administrador o el dueño pagan o rechazan retiros.</p>
      )}

      {!datos ? null : datos.porPagar.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">
          Ningún repartidor tiene retiros por pagar.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--rule-base)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {datos.porPagar.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="flex-[1_1_12rem]">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{r.partnerName}</p>
                <p className="text-sm text-[var(--text-secondary)] tabular-nums">
                  Yape {r.yapeNumber} · pidió el {formatDateTimeShort(r.createdAt)}
                </p>
              </div>
              <ChipEstado status={r.status} />
              <span className="w-24 text-right text-base font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(r.amount)}</span>
              {datos.puedeResolver && (
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setModal({ retiro: r, modo: "pagar" })} className={cn(BOTON.chicoPrimario, "h-12 rounded-xl px-4")}>
                    <Wallet className="h-4 w-4" aria-hidden />
                    Pagar
                  </button>
                  <ActionMenu label="Más acciones" icon={MoreHorizontal} soloIcono size="md" className="w-12" actions={acciones(r)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Historial</CardTitle>
          <SegmentedControl<FiltroHistorial>
            value={filtro}
            onChange={setFiltro}
            label="Qué retiros ver en el historial"
            size="lg"
            className="ml-auto"
            options={[
              { value: "todos", label: "Todos" },
              { value: "paid", label: "Pagados" },
              { value: "rejected", label: "Rechazados" },
            ]}
          />
        </div>
        {historial.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">{VACIO[filtro]}</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-base)] rounded-xl border border-[var(--rule-base)]">
            {historial.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                {r.status === "paid" ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-[var(--data-success-600)]" aria-hidden />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                )}
                <div className="flex-[1_1_12rem]">
                  <p className="truncate text-sm text-[var(--text-primary)]">{r.partnerName}</p>
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {r.resolvedAt ? formatDateTimeShort(r.resolvedAt) : formatDateTimeShort(r.createdAt)}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <ChipEstado status={r.status} />
                <span className="w-24 text-right text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatCurrency(r.amount)}</span>
                {datos?.puedeResolver && r.status === "paid" && (
                  <ActionMenu
                    label="Más acciones"
                    icon={MoreHorizontal}
                    soloIcono
                    size="md"
                    className="w-12"
                    actions={[
                      {
                        id: "deshacer",
                        label: "Deshacer pago",
                        hint: "Borra el gasto y vuelve a «por pagar»",
                        icon: RotateCcw,
                        tone: "danger",
                        onSelect: () => setModal({ retiro: r, modo: "deshacer" }),
                      },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal && (
        <ResolverRetiroModal
          retiro={modal.retiro}
          modo={modal.modo}
          onClose={() => setModal(null)}
          onConfirmar={(cuerpo) => confirmar(modal.retiro, cuerpo)}
        />
      )}
    </div>
  );
}
