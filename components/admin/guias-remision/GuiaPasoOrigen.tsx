"use client";

/**
 * Etapa «Origen» de la guía nueva (F17/M56): de un pedido —con el mismo buscador
 * de «Emitir comprobante», sin copiar ids— o sin pedido con su motivo; y la
 * fecha, el motivo y el comprobante que sustenta el traslado.
 */
import { LoadingState } from "@buleje/design-system";
import { AlertTriangle, Receipt } from "@buleje/design-system/icons";
import { EmitirPasoOrigen } from "@/components/admin/einvoice/EmitirPasoOrigen";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CAMPO, ETIQUETA } from "./estilos";
import { BloqueGuia, CampoGuia, errorDe, OpcionesGuia } from "./guia-piezas";
import { MOTIVO_ROTULO, MOTIVOS, type FuenteGuia } from "./tipos";
import type { NuevaGuia } from "./use-nueva-guia";

const FUENTES = [
  { valor: "pedido", rotulo: "De un pedido", detalle: "Llena cliente, dirección y productos" },
  { valor: "sin-pedido", rotulo: "Sin pedido", detalle: "Traslado entre tus locales, devolución u otro" },
] as const satisfies readonly { valor: FuenteGuia; rotulo: string; detalle: string }[];

function PedidoElegido({ g }: { g: NuevaGuia }) {
  const p = g.pedido;
  if (!p) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] px-3 py-2" data-qa="guia-pedido-elegido">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{p.codigo}</span>
            <span className="truncate text-sm text-[var(--text-primary)]">{p.cliente || "Sin nombre"}</span>
            <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(p.total)}</span>
          </span>
          <span className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
            <Receipt className="h-4 w-4 shrink-0" aria-hidden />
            {p.comprobante ? `Lo sustenta ${p.comprobante}` : "Sin comprobante todavía"}
          </span>
        </span>
        <button type="button" onClick={g.quitarPedido} className={button({ variant: "secondary", className: "rounded-xl" })}>
          Cambiar pedido
        </button>
      </div>
      {g.previa && (
        <p className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Este pedido ya tiene la guía {g.previa.numero} ({g.previa.estado}): haz otra sólo si sale en otro viaje.
        </p>
      )}
    </div>
  );
}

export function GuiaPasoOrigen({ g }: { g: NuevaGuia }) {
  const { form } = g;
  const err = errorDe(g.pendientes, g.visitados.includes("origen"));
  const faltaPedido = g.visitados.includes("origen") && form.fuente === "pedido" && !g.pedido && !g.trayendo;

  return (
    <div className="space-y-5">
      <BloqueGuia
        titulo="Guía de remisión remitente"
        extra={
          <InfoTip
            title="Guía de remisión remitente"
            what="La que haces tú cuando mueves tu mercadería: qué va, quién la recibe, en qué vehículo y por qué sale."
            affects="Se guarda e imprime aquí y viaja con el chofer. Todavía no se envía a SUNAT como guía electrónica."
            example="Vendiste 20 sacos de arroz a una bodega de Yarinacocha: eliges ese pedido y la guía sale con su dirección y sus productos."
          />
        }
      >
        <OpcionesGuia rotulo="De dónde sale la guía" valor={form.fuente} opciones={FUENTES} onCambio={g.setFuente} />
        {form.fuente === "pedido" &&
          (g.pedido ? (
            <PedidoElegido g={g} />
          ) : g.trayendo ? (
            <LoadingState message="Trayendo el pedido…" />
          ) : (
            <>
              <EmitirPasoOrigen pedidos={g.pedidos} onElegir={(p) => void g.elegirPedido(p)} />
              {faltaPedido && (
                <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">
                  Elige el pedido o cambia a «Sin pedido».
                </p>
              )}
            </>
          ))}
      </BloqueGuia>

      <BloqueGuia titulo="Traslado">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Motivo del traslado" labelClassName={ETIQUETA} required error={err("motivoTraslado")}>
            <select
              value={form.motivoTraslado}
              onChange={(e) => g.campo("motivoTraslado", e.target.value)}
              data-qa="guia-motivo"
              className={cn(CAMPO, err("motivoTraslado") && "border-[var(--data-error-500)]")}
            >
              <option value="" disabled>
                Elige el motivo
              </option>
              {MOTIVOS.map((m) => (
                <option key={m} value={m}>
                  {MOTIVO_ROTULO[m] ?? m}
                </option>
              ))}
            </select>
          </Field>
          <CampoGuia etiqueta="Fecha y hora del traslado" tipo="datetime-local" required valor={form.fechaTraslado} onCambio={(v) => g.campo("fechaTraslado", v)} error={err("fechaTraslado")} />
          <CampoGuia
            etiqueta="Doc. de referencia"
            placeholder="Boleta o factura, ej. B001-00000123"
            valor={form.documentoRef}
            onCambio={(v) => g.campo("documentoRef", v)}
            className="sm:col-span-2"
          />
        </div>
      </BloqueGuia>
    </div>
  );
}
