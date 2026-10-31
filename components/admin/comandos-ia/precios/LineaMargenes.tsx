"use client";

/**
 * «Margen mínimo: 15 % · piso costo + 5 % — Cambiar»: los dos números del
 * negocio con los que se armó la lista (Ajustes › Cobros y comprobantes). La
 * muestran la lista de rebajas de Análisis y la diferencia de Precios en bloque.
 */
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { pctTexto, RUTA_MARGENES_REBAJAS, type MargenesRebajas } from "@/lib/precios/margenes-rebajas";

export function LineaMargenes({ margenes, puedeCambiar }: { margenes: MargenesRebajas; puedeCambiar: boolean }) {
  return (
    <p className="text-sm text-[var(--text-secondary)] [overflow-wrap:anywhere]">
      Margen mínimo: <strong className="font-semibold text-[var(--text-primary)]">{pctTexto(margenes.margenMinimoSugerido)}</strong>
      {" · "}piso costo + <strong className="font-semibold text-[var(--text-primary)]">{pctTexto(margenes.pisoSobreCosto)}</strong>
      {puedeCambiar && (
        <>
          {" — "}
          <EnlacePanel href={RUTA_MARGENES_REBAJAS} title="Ajustes › Cobros y comprobantes › Precios y rebajas">
            Cambiar
          </EnlacePanel>
        </>
      )}
    </p>
  );
}
