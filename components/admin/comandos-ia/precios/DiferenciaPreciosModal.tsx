"use client";

import { useState } from "react";
import { Check, Loader2, Tags } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { usd } from "../papel/formato";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { margen, type FilaDiferencia } from "@/lib/admin/comandos-ia/precios";
import FilasDiferencia, { BTN, leerPrecio, precioFinal } from "./FilasDiferencia";
import type { FilaAplicar, PlanPrecios, Rechazada } from "./use-precios-en-bloque";

const ORIGEN: Record<PlanPrecios["origen"], string> = {
  reglas: "Entendí tu orden sin IA",
  ia: "La IA entendió tu orden",
  lista: "Lista del proveedor",
};

export function costoIaTexto(n: number): string {
  return `IA ${usd(n)}`;
}

type ResultadoAplicar = { ok: true } | { ok: false; error: string; rechazadas: Rechazada[] };

/** La diferencia Hoy → Queda, con casilla y precio editable por fila; nada se guarda sin «Aplicar». */
export default function DiferenciaPreciosModal({
  plan,
  aplicando,
  onCerrar,
  onAplicar,
}: {
  plan: PlanPrecios;
  aplicando: boolean;
  onCerrar: () => void;
  onAplicar: (filas: FilaAplicar[], resumen: string) => Promise<ResultadoAplicar>;
}) {
  const [filas, setFilas] = useState<FilaDiferencia[]>(plan.filas);
  const [marcadas, setMarcadas] = useState(() => new Set(plan.filas.filter((f) => !f.aviso).map((f) => f.productId)));
  const [precios, setPrecios] = useState<Record<number, string>>({});
  const [cambiadas, setCambiadas] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const elegidas = filas.filter((f) => marcadas.has(f.productId) && f.aviso !== "excluido");
  const n = elegidas.length;

  const marcar = (id: number, v: boolean) =>
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (v) s.add(id);
      else s.delete(id);
      return s;
    });

  const aplicar = async () => {
    const mala = elegidas.find((f) => (precios[f.productId] ?? "").trim() !== "" && leerPrecio(precios[f.productId]) == null);
    if (mala) return setError(`Revisa el precio de ${mala.nombre}.`);
    setError(null);
    const r = await onAplicar(
      elegidas.map((f) => ({
        productId: f.productId,
        precioEsperado: f.precioHoy,
        costoEsperado: f.costoHoy,
        precioNuevo: precioFinal(f, precios),
        ...(f.costoNuevo != null && f.costoNuevo !== f.costoHoy ? { costoNuevo: f.costoNuevo } : {}),
      })),
      plan.interpretacion,
    );
    if (r.ok) return;
    setError(r.error);
    if (!r.rechazadas.length) return;
    // 409: el «Hoy» de esas filas pasa a ser el de ahora y quedan sin marcar para que las revises.
    const porId = new Map(r.rechazadas.map((x) => [x.productId, x]));
    setFilas((prev) =>
      prev.flatMap((f) => {
        const x = porId.get(f.productId);
        if (!x) return [f];
        if (x.motivo === "no-existe" || x.precioActual == null) return [];
        return [{ ...f, precioHoy: x.precioActual, costoHoy: x.costoActual, margenHoy: margen(x.precioActual, x.costoActual) }];
      }),
    );
    setCambiadas(new Set(porId.keys()));
    setMarcadas((prev) => new Set([...prev].filter((id) => !porId.has(id))));
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="La diferencia"
      icon={Tags}
      variant="wide"
      footer={
        <ModalFooter error={error} nota={`${n} ${n === 1 ? "precio cambia" : "precios cambian"} · ${costoIaTexto(plan.costoIaUsd)}`}>
          <button type="button" onClick={onCerrar} className={`${BTN.secundario} max-sm:flex-1`}>
            Cancelar
          </button>
          <button type="button" disabled={n === 0 || aplicando} onClick={() => void aplicar()} className={`${BTN.primario} max-sm:flex-1`}>
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            Aplicar {n}
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-primary)] [overflow-wrap:anywhere]">{plan.interpretacion}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
            {ORIGEN[plan.origen]}
            <InfoTip
              title="Revisa antes de aplicar"
              what="Marcadas = las que cambian. Las que tienen aviso (sin costo, margen bajo 15 %) empiezan sin marcar."
              affects="Al aplicar se guarda el historial de precios y te queda un recibo para deshacer."
              example={plan.sinCambio ? `${plan.sinCambio} productos ya tenían ese precio y no aparecen.` : "Toca un precio para corregirlo."}
            />
          </span>
        </div>

        <FilasDiferencia
          filas={filas}
          marcadas={marcadas}
          onMarcar={marcar}
          onMarcarTodas={(v) => setMarcadas(v ? new Set(filas.filter((f) => f.aviso !== "excluido").map((f) => f.productId)) : new Set())}
          precios={precios}
          onPrecio={(id, t) => setPrecios((p) => ({ ...p, [id]: t }))}
          cambiadas={cambiadas}
        />

        {plan.noAplica.length > 0 && (
          <details className="rounded-xl border border-[var(--rule-base)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--text-secondary)]">
              {plan.noAplica.length} {plan.noAplica.length === 1 ? "no entra" : "no entran"}
            </summary>
            <ul className="mt-2 space-y-1">
              {plan.noAplica.map((x) => (
                <li key={`${x.nombre}-${x.motivo}`} className="text-sm text-[var(--text-secondary)] [overflow-wrap:anywhere]">
                  <span className="font-medium text-[var(--text-primary)]">{x.nombre}</span> · {x.motivo}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </AdminModal>
  );
}
