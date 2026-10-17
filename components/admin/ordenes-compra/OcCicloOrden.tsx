"use client";

import { useState } from "react";
import { PackageCheck, Wallet, ClipboardCheck, FileText } from "@buleje/design-system/icons";
import { cn, limaDateKey } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { cicloDeOrden, diaCorto, listarCorto } from "@/lib/compras/ciclo-oc";
import { button } from "@/components/ui-system/button-variants";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { TONO_TEXTO, quienLee, type OrdenOC } from "@/components/admin/ordenes-compra/oc-compartido";
import OcAnotarComprobante from "@/components/admin/ordenes-compra/OcAnotarComprobante";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

const HREF_POR_PAGAR = "/admin?tab=compras&vista=cuentas-por-pagar";
const HREF_RECEPCIONES = "/admin?tab=compras&vista=ordenes-compra&sub=recibir";

const ACCION = {
  aprobar: { label: "Aprobar", icon: ClipboardCheck },
  recibir: { label: "Recibir", icon: PackageCheck },
  comprobante: { label: "Anotar", icon: FileText },
  pagar: { label: "Ir a Por pagar", icon: Wallet },
} as const;

/**
 * C10/C59 · En qué va la orden, paso por paso (aprobación, entrega,
 * comprobante, pago), quién mueve cada uno y EL siguiente con su botón. Abajo,
 * las recepciones que la tocaron y su deuda, cada una con su enlace.
 */
export default function OcCicloOrden({ oc, o }: { oc: OrdenesCompra; o: OrdenOC }) {
  const { setRecepcionOC, updateStatus, avisar, load } = oc;
  const [anotando, setAnotando] = useState(false);
  const { pasos, siguiente } = cicloDeOrden(o, o.seguimiento, limaDateKey());
  const seg = o.seguimiento;
  const accion = siguiente.accion ? ACCION[siguiente.accion] : null;

  const hacer = () => {
    if (siguiente.accion === "aprobar") void updateStatus(o.id, "pendiente");
    else if (siguiente.accion === "recibir") setRecepcionOC(o);
    else if (siguiente.accion === "comprobante") setAnotando(true);
    else if (siguiente.accion === "pagar") irAEnlace(HREF_POR_PAGAR);
  };

  return (
    <section aria-label="En qué va la orden" className="mb-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3" data-qa="ciclo-oc">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-bold text-[var(--text-primary)]">Sigue: </span>
          <span className={cn("font-semibold", TONO_TEXTO[siguiente.tono])}>{siguiente.texto}</span>
          {siguiente.quien && <span className="text-[var(--text-secondary)]"> · {quienLee(siguiente.quien).toLowerCase()}</span>}
        </p>
        {accion && !anotando && (
          <button type="button" onClick={hacer} className={button({ variant: "secondary", className: "rounded-xl" })} data-qa={`ciclo-${siguiente.accion}`}>
            <accion.icon className="h-4 w-4" aria-hidden /> {accion.label}
          </button>
        )}
      </div>
      {anotando && (
        <OcAnotarComprobante
          orden={o}
          onCancelar={() => setAnotando(false)}
          onGuardado={(msg) => { setAnotando(false); avisar(msg); void load({ silenciosa: true }); }}
        />
      )}

      <ol className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {pasos.map((p) => (
          <li key={p.clave} className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{p.etiqueta}</p>
            <p className={cn("text-sm font-semibold", TONO_TEXTO[p.tono])}>{p.texto}</p>
            {p.quien && p.tono !== "ok" && p.tono !== "neutro" && <p className="text-xs text-[var(--text-secondary)]">{quienLee(p.quien)}</p>}
          </li>
        ))}
      </ol>

      {seg && (seg.recepciones.length > 0 || seg.cuenta) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
          {seg.recepciones.length > 0 && (
            <p>
              {seg.recepciones.length === 1 ? "Recepción" : `${seg.recepciones.length} recepciones`}:{" "}
              {listarCorto(seg.recepciones.map((r) => (r.fecha ? `${r.ref} (${diaCorto(r.fecha)})` : r.ref)))}{" · "}
              <EnlacePanel href={HREF_RECEPCIONES}>Ver en Recepciones</EnlacePanel>
            </p>
          )}
          {seg.cuenta && (
            <p>
              Deuda de {formatCurrency(seg.cuenta.monto)}
              {seg.cuenta.pagado > 0 ? `, pagaste ${formatCurrency(seg.cuenta.pagado)}` : ""}
              {seg.cuenta.vence ? ` · vence el ${diaCorto(seg.cuenta.vence)}` : ""}{" · "}
              <EnlacePanel href={HREF_POR_PAGAR}>Ver en Por pagar</EnlacePanel>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
