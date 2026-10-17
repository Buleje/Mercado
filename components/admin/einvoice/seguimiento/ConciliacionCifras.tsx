"use client";

/**
 * Las cifras de la conciliación (N08), en cuatro bloques que no se mezclan:
 * lo electrónico (SUNAT), las notas (internas), los pedidos y el mostrador.
 * Emitido, aceptado y cobrado van separados: nada de esto es «plata disponible».
 * Cada cifra dice cuántos documentos la forman y, cuando hay lista detrás,
 * abre esos registros. Todas las sumas vienen del servidor.
 */
import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { Cifra, Conciliacion, TipoDiferencia } from "@/lib/comprobantes/conciliacion";
import { fmt } from "../tipos";
import { TEXTO_TONO, type Tono } from "../tonos";

const BLOQUE = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4";

const docs = (n: number, uno = "documento", varios = "documentos") => `${n} ${n === 1 ? uno : varios}`;

interface RenglonProps {
  rotulo: string;
  cifra: Cifra;
  unidad?: [string, string];
  tono?: Tono;
  fuerte?: boolean;
  onAbrir?: () => void;
  qa?: string;
}

function Renglon({ rotulo, cifra, unidad, tono, fuerte, onAbrir, qa }: RenglonProps) {
  const cuerpo = (
    <>
      <span className={cn("min-w-0 flex-1 text-left", fuerte ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>{rotulo}</span>
      <span className="text-sm tabular-nums text-[var(--text-tertiary)]">{docs(cifra.cantidad, ...(unidad ?? []))}</span>
      <span className={cn("w-28 text-right tabular-nums", fuerte && "font-extrabold", tono && cifra.cantidad > 0 ? TEXTO_TONO[tono] : "text-[var(--text-primary)]")}>
        {fmt(cifra.importe)}
      </span>
      {onAbrir && <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
    </>
  );
  if (!onAbrir || cifra.cantidad === 0) {
    return <li className="flex min-h-10 items-center gap-3 text-sm">{cuerpo}{onAbrir && <span className="w-4" aria-hidden />}</li>;
  }
  return (
    <li>
      <button type="button" onClick={onAbrir} data-qa={qa} className="flex min-h-12 w-full items-center gap-3 rounded-lg text-sm hover:bg-[var(--surface-sunken)]">
        {cuerpo}
      </button>
    </li>
  );
}

function Bloque({ id, titulo, ayuda, children }: { id: string; titulo: string; ayuda: ReactNode; children: ReactNode }) {
  return (
    <section className={BLOQUE} aria-labelledby={id}>
      <div className="mb-2 flex items-center gap-2">
        <CardTitle id={id}>{titulo}</CardTitle>
        {ayuda}
      </div>
      <ul className="grid gap-1">{children}</ul>
    </section>
  );
}

export interface ConciliacionCifrasProps {
  c: Conciliacion;
  /** Abre la lista de Facturas y boletas con ese estado y el mismo período. */
  onVerComprobantes: (estado: string) => void;
  onVerDiferencias: (tipo: TipoDiferencia) => void;
  onVerNotas: () => void;
}

export function ConciliacionCifras({ c, onVerComprobantes, onVerDiferencias, onVerNotas }: ConciliacionCifrasProps) {
  const { comprobantes: k, notas: n, pedidos: p } = c;
  const neto: Cifra = { cantidad: k.emitido.cantidad, importe: c.neto };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloque
        id="conc-sunat"
        titulo="Comprobantes electrónicos"
        ayuda={
          <InfoTip
            what="Sólo boletas y facturas enviadas a SUNAT. Emitido = aceptado + esperando a SUNAT (los rechazados y anulados no cuentan). Neto = emitido − notas de crédito emitidas."
            affects="Emitido no es cobrado: un comprobante de un pedido fiado está emitido y todavía no entró a la caja."
            example="Aceptado S/ 1,200 + esperando S/ 80 = emitido S/ 1,280; notas S/ 50 → neto S/ 1,230."
          />
        }
      >
        <Renglon rotulo="Emitido (vigente)" cifra={k.emitido} fuerte onAbrir={() => onVerComprobantes("vigentes")} qa="conc-emitido" />
        <Renglon rotulo="Aceptado por SUNAT" cifra={k.aceptado} tono="ok" onAbrir={() => onVerComprobantes("aceptado")} />
        <Renglon rotulo="Esperando a SUNAT" cifra={k.pendiente} tono="info" onAbrir={() => onVerComprobantes("pendiente")} />
        <Renglon rotulo="Rechazado" cifra={k.rechazado} tono="error" onAbrir={() => onVerComprobantes("rechazado")} />
        <Renglon rotulo="Anulado" cifra={k.anulado} onAbrir={() => onVerComprobantes("anulado")} />
        <li className="my-1 border-t border-[var(--rule-base)]" aria-hidden />
        <Renglon rotulo="Neto facturado" cifra={neto} fuerte />
      </Bloque>

      <Bloque
        id="conc-notas"
        titulo="Notas de crédito"
        ayuda={<InfoTip what="Las notas del negocio, por estado y por motivo. Son internas: quedan en tus registros y no se envían a SUNAT." example="2 devoluciones totales S/ 36 · 1 descuento S/ 5." />}
      >
        <Renglon rotulo="Emitidas" cifra={n.emitidas} unidad={["nota", "notas"]} fuerte onAbrir={onVerNotas} />
        <Renglon rotulo="En borrador" cifra={n.borradores} unidad={["nota", "notas"]} tono="aviso" onAbrir={onVerNotas} />
        <Renglon rotulo="Anuladas" cifra={n.anuladas} unidad={["nota", "notas"]} />
        {n.porMotivo.length > 0 && <li className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Emitidas por motivo</li>}
        {n.porMotivo.map((m) => (
          <Renglon key={m.codigo} rotulo={`${m.codigo} · ${m.descripcion}`} cifra={m} unidad={["nota", "notas"]} />
        ))}
      </Bloque>

      <Bloque
        id="conc-pedidos"
        titulo="Pedidos del período"
        ayuda={
          <InfoTip
            what="Los pedidos creados en el período y si tienen su boleta o factura. «En curso» todavía no se entregan; los cancelados no se cuentan como venta."
            affects="Fiado = quedó a deber: no es plata disponible aunque tenga comprobante."
          />
        }
      >
        <Renglon rotulo="Todos" cifra={p.todos} unidad={["pedido", "pedidos"]} fuerte />
        <Renglon rotulo="Entregados" cifra={p.entregados} unidad={["pedido", "pedidos"]} />
        <Renglon rotulo="· con comprobante" cifra={p.conComprobante} unidad={["pedido", "pedidos"]} tono="ok" />
        <Renglon rotulo="· sin comprobante" cifra={p.sinComprobante} unidad={["pedido", "pedidos"]} tono="aviso" onAbrir={() => onVerDiferencias("pedido-sin-comprobante")} qa="conc-sin-comprobante" />
        <Renglon rotulo="En curso" cifra={p.enCurso} unidad={["pedido", "pedidos"]} />
        <Renglon rotulo="Cancelados" cifra={p.cancelados} unidad={["pedido", "pedidos"]} />
        <Renglon rotulo="Fiados (a deber)" cifra={p.fiados} unidad={["pedido", "pedidos"]} tono="aviso" />
      </Bloque>

      <Bloque
        id="conc-mostrador"
        titulo="Mostrador"
        ayuda={<InfoTip what="Las ventas de la caja según el papel que eligió el cajero. Su número es interno: no es una boleta electrónica ni pasó por SUNAT." example="13 tickets S/ 295.30 · 2 boletas internas S/ 40." />}
      >
        {c.mostrador.length === 0 ? (
          <li className="text-sm text-[var(--text-secondary)]">Sin ventas del mostrador en el período.</li>
        ) : (
          c.mostrador.map((m) => <Renglon key={m.tipo} rotulo={m.rotulo} cifra={m} unidad={["venta", "ventas"]} />)
        )}
      </Bloque>
    </div>
  );
}
