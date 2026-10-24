"use client";

/**
 * Los bloques del expediente (N03): papeles, importes, cobro, productos y la
 * línea de tiempo. Sólo dibujan lo que manda el servidor: ningún total se
 * calcula acá.
 */
import { CardTitle } from "@buleje/design-system";
import { ClipboardList, ExternalLink, FileMinus, ReceiptText, Truck } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { textoFecha, textoFechaHora } from "@/lib/comprobantes/periodo";
import type { DocumentoExpediente, Expediente, EventoExpediente } from "@/lib/comprobantes/expediente";
import { fmt } from "../tipos";
import { CHIP, CHIP_TONO, TEXTO_TONO, type Tono } from "../tonos";

const ICONO_CLASE: Record<DocumentoExpediente["clase"], LucideIcon> = {
  comprobante: ReceiptText,
  nota: FileMinus,
  guia: Truck,
  cotizacion: ClipboardList,
};

const BLOQUE = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4";

function tonoDeDocumento(d: DocumentoExpediente): Tono {
  if (!d.confirmado) return "aviso";
  if (/rechaz/i.test(d.estado)) return "error";
  if (!d.vigente) return "neutro";
  return /borrador/i.test(d.estado) ? "aviso" : "ok";
}

type Operacion = NonNullable<Expediente["operacion"]>;

export function Papeles({ documentos, interno }: { documentos: readonly DocumentoExpediente[]; interno: Operacion["documentoInterno"] }) {
  return (
    <section className={BLOQUE} aria-labelledby="exp-papeles">
      <div className="mb-3 flex items-center gap-2">
        <CardTitle id="exp-papeles">Papeles</CardTitle>
        <InfoTip
          what="Cada papel de la operación. «Electrónico» = boleta o factura enviada a SUNAT; «Interno» = queda en tus registros y no va a SUNAT (notas de crédito, guías, cotizaciones, ticket del mostrador)."
          example="Pedido #a1b2c3: cotización COT-0004 → boleta B001-12 aceptada → nota de crédito NC-0002 por una devolución."
        />
      </div>
      {documentos.length === 0 && !interno ? (
        <p className="text-sm text-[var(--text-secondary)]">Todavía no tiene ningún papel.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {interno && (
            <li className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <ReceiptText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <span className="font-semibold text-[var(--text-primary)]">
                {interno.tipo === "ticket" ? "Ticket del mostrador" : `${interno.tipo[0]?.toUpperCase() ?? ""}${interno.tipo.slice(1)} del mostrador`}
                {interno.numero ? ` ${interno.numero}` : ""}
              </span>
              <span className={cn(CHIP, CHIP_TONO.neutro)}>Interno · no va a SUNAT</span>
            </li>
          )}
          {documentos.map((d) => {
            const Icono = ICONO_CLASE[d.clase];
            const tono = tonoDeDocumento(d);
            return (
              <li key={`${d.clase}:${d.id}`} className="py-2">
                <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1">
                  <Icono className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                  <span className="font-mono font-bold text-[var(--text-primary)]">{d.numero}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{d.tipo}</span>
                  <span className={cn(CHIP, CHIP_TONO[tono])}>{d.estado}</span>
                  <span className={cn(CHIP, d.ambiente === "electronico" ? CHIP_TONO.info : CHIP_TONO.neutro)}>
                    {d.ambiente === "electronico" ? "Electrónico · SUNAT" : "Interno"}
                  </span>
                  <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]">{textoFecha(d.fecha)}</span>
                  {d.total != null && <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(d.total)}</span>}
                  {d.pdfUrl && (
                    <a href={d.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-1 rounded-xl px-2 text-sm font-bold text-primary hover:bg-[var(--surface-sunken)]">
                      PDF <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  )}
                </div>
                {d.detalle && <p className={cn("pl-7 text-sm", tono === "error" ? TEXTO_TONO.error : "text-[var(--text-secondary)]")}>{d.detalle}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Importes({ importes }: { importes: Expediente["importes"] }) {
  const filas: { rotulo: string; valor: number | null; tono?: Tono; fuerte?: boolean }[] = [
    { rotulo: "La operación", valor: importes.operacion },
    { rotulo: "Comprobantes vigentes", valor: importes.comprobantes },
    { rotulo: "Notas de crédito emitidas", valor: importes.notas ? -importes.notas : 0 },
    { rotulo: "Neto facturado", valor: importes.neto, fuerte: true },
  ];
  const dif = importes.diferencia;
  return (
    <section className={BLOQUE} aria-labelledby="exp-importes">
      <div className="mb-3 flex items-center gap-2">
        <CardTitle id="exp-importes">Importes</CardTitle>
        <InfoTip
          what="Neto facturado = comprobantes vigentes (aceptados o esperando a SUNAT) − notas de crédito emitidas. Lo facturado no es lo cobrado: el cobro va en su bloque."
          example="Pedido S/ 118; boleta S/ 118; nota de crédito S/ 18 → neto S/ 100 y diferencia S/ 18 con el pedido."
        />
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
        {filas.map((f) => (
          <div key={f.rotulo} className="contents">
            <dt className={cn("text-[var(--text-secondary)]", f.fuerte && "font-semibold text-[var(--text-primary)]")}>{f.rotulo}</dt>
            <dd className={cn("text-right tabular-nums text-[var(--text-primary)]", f.fuerte && "font-extrabold")}>{f.valor == null ? "—" : fmt(f.valor)}</dd>
          </div>
        ))}
        <dt className="text-[var(--text-secondary)]">Diferencia con la operación</dt>
        <dd className={cn("text-right font-bold tabular-nums", dif == null ? "text-[var(--text-tertiary)]" : Math.abs(dif) > 0.05 ? TEXTO_TONO.aviso : TEXTO_TONO.ok)}>
          {dif == null ? "Sin comprobante" : Math.abs(dif) > 0.05 ? fmt(dif) : "Cuadra"}
        </dd>
      </dl>
    </section>
  );
}

const MEDIO: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", plin: "Plin", tarjeta: "Tarjeta", transferencia: "Transferencia", fiado: "Fiado", mixto: "Mixto" };

export function Cobro({ cobro }: { cobro: Operacion["cobro"] }) {
  const filas: [string, string, Tono?][] = [];
  if (cobro.medio) filas.push(["Medio", MEDIO[cobro.medio] ?? cobro.medio]);
  if (cobro.operacionYape) filas.push(["N.º de operación Yape", cobro.operacionYape]);
  if (cobro.aprobacion) filas.push(["Pago por confirmar", `${cobro.aprobacion.estado} · esperado ${fmt(cobro.aprobacion.esperado)}${cobro.aprobacion.detectado != null ? ` · llegó ${fmt(cobro.aprobacion.detectado)}` : ""}`, "aviso"]);
  if (cobro.pagado != null) filas.push(["Pagó", `${fmt(cobro.pagado)}${cobro.vuelto ? ` · vuelto ${fmt(cobro.vuelto)}` : ""}`]);
  if (cobro.fiado) filas.push(["Fiado", "Quedó a deber: no es plata en caja", "aviso"]);
  for (const [i, c] of cobro.cuotas.entries()) filas.push([`Cuota ${i + 1}`, `${fmt(c.pagado)} de ${fmt(c.total)} · ${c.estado}`, c.pagado + 0.05 < c.total ? "aviso" : "ok"]);
  for (const m of cobro.caja) filas.push([`Caja · ${textoFechaHora(m.fecha)}`, `${m.tipo} ${fmt(m.monto)} · ${m.medio}`]);
  return (
    <section className={BLOQUE} aria-labelledby="exp-cobro">
      <div className="mb-3 flex items-center gap-2">
        <CardTitle id="exp-cobro">Cobro</CardTitle>
        <InfoTip what="Cómo se pagó, por separado de lo facturado. Lo fiado o en cuotas todavía no es plata disponible." />
      </div>
      {filas.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Sin datos del cobro.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {filas.map(([r, v, tono], i) => (
            <div key={`${r}-${i}`} className="contents">
              <dt className="text-[var(--text-secondary)]">{r}</dt>
              <dd className={cn("text-right tabular-nums", tono && tono !== "ok" ? TEXTO_TONO[tono] : "text-[var(--text-primary)]")}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function Productos({ lineas }: { lineas: Operacion["lineas"] }) {
  if (lineas.length === 0) return null;
  return (
    <section className={BLOQUE} aria-labelledby="exp-productos">
      <CardTitle id="exp-productos" className="mb-2">Productos</CardTitle>
      <ul className="grid gap-1 text-sm">
        {lineas.map((l, i) => (
          <li key={`${l.nombre}-${i}`} className="flex gap-3">
            <span className="tabular-nums text-[var(--text-secondary)]">{l.cantidad} {l.unidad}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{l.nombre}</span>
            <span className="tabular-nums text-[var(--text-secondary)]">{fmt(l.precio)} c/u</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LineaDeTiempo({ eventos }: { eventos: readonly EventoExpediente[] }) {
  return (
    <section className={BLOQUE} aria-labelledby="exp-tiempo">
      <CardTitle id="exp-tiempo" className="mb-3">Línea de tiempo</CardTitle>
      {eventos.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Sin movimientos registrados.</p>
      ) : (
        <ol className="relative ml-2 border-l border-[var(--rule-base)]">
          {eventos.map((e, i) => (
            <li key={`${e.fecha}-${i}`} className="relative pb-3 pl-5 last:pb-0">
              <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)]" aria-hidden />
              <p className="text-sm tabular-nums text-[var(--text-tertiary)]">{textoFechaHora(e.fecha)}</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{e.titulo}</p>
              {e.detalle && <p className="text-sm text-[var(--text-secondary)]">{e.detalle}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
