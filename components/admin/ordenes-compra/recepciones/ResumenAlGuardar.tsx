"use client";

import { listarCorto } from "@/lib/compras/ciclo-oc";
import { cn } from "@/lib/utils";
import type { NuevaRecepcion as Estado } from "@/components/admin/ordenes-compra/recepciones/use-nueva-recepcion";

type Fila = { rotulo: string; texto: string; tono: string };
const cantidades = (lista: Array<{ nombre: string; n: number }>) => listarCorto(lista.map((x) => `${x.n} ${x.nombre}`));

/**
 * C23 · Lo que va a pasar al guardar, en vivo y contado como el servidor:
 * qué suma al stock, qué va a merma, qué deja de esperar la orden, lo de más y
 * cómo queda la orden. Antes se guardaba a ciegas y había que ir a Inventario
 * a ver si entró.
 */
export default function ResumenAlGuardar({ n }: { n: Estado }) {
  const { efectos: e, origen, ocElegida, errorGuardar } = n;
  const filas: Fila[] = [];
  if (origen === "sin_orden") {
    filas.push({ rotulo: "Al guardar", texto: "Queda anotada la llegada. No suma al stock ni a lo que debes.", tono: "text-[var(--text-secondary)]" });
  } else if (ocElegida) {
    if (e.aStock.length) filas.push({ rotulo: "Suma al stock", texto: cantidades(e.aStock), tono: "text-[var(--data-success-ink)]" });
    if (e.merma.length) filas.push({ rotulo: "Va a merma", texto: `${cantidades(e.merma)} (no se vende)`, tono: "text-[var(--data-warning-ink)]" });
    if (e.noLlegara.length) filas.push({ rotulo: "Ya no se espera", texto: cantidades(e.noLlegara), tono: "text-[var(--data-info-ink)]" });
    if (e.deMas.length) filas.push({ rotulo: "De más", texto: `${cantidades(e.deMas)}: pasa lo pedido y entra igual`, tono: "text-[var(--data-error-ink)]" });
    if (e.fueraDeOrden.length) filas.push({ rotulo: "No es de la orden", texto: `${listarCorto(e.fueraDeOrden)}: se anota, no suma`, tono: "text-[var(--data-warning-ink)]" });
    filas.push(
      e.ordenQueda === "recibido"
        ? { rotulo: "La orden", texto: "queda recibida entera", tono: "text-[var(--data-success-ink)]" }
        : { rotulo: "La orden", texto: `sigue esperando ${cantidades(e.quedaPendiente)}`, tono: "text-[var(--text-secondary)]" },
    );
  }
  if (filas.length === 0 && !errorGuardar) return null;

  return (
    <div className="space-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3" data-qa="resumen-recepcion" aria-live="polite">
      {filas.map((f) => (
        <p key={f.rotulo} className="text-sm">
          <span className="font-bold text-[var(--text-primary)]">{f.rotulo}: </span>
          <span className={cn("font-semibold", f.tono)}>{f.texto}</span>
        </p>
      ))}
      {errorGuardar && <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">{errorGuardar}</p>}
    </div>
  );
}
