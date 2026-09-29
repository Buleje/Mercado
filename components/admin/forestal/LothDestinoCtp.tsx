"use client";

/**
 * LothDestinoCtp — bajo el destinatario de la guía del Libro TH: ¿esta madera va
 * a tu propia planta? (28-09-2026). Si el RUC del destinatario es el de la
 * Ficha del CTP, al emitir la guía queda en tu Libro CTP para recibirla con sus
 * trozas; si es otra empresa, no pasa nada allá. «Es mi planta» pone el
 * destinatario con los datos de la Ficha, sin tipear.
 *
 * Sin Libro CTP en el negocio no se dibuja: no hay adónde pasar.
 */

import { Check, Info, TreePine } from "@buleje/design-system/icons";
import { destinoDeGuiaTh } from "@/lib/forestal/guia-th-al-ctp";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { Btn } from "./ctp-shared";

export default function LothDestinoCtp({ g }: { g: DespachoGuiaLoth }) {
  const planta = g.prep?.ctpPropio;
  if (!planta) return null;
  const destino = destinoDeGuiaTh(g.datos, planta.ruc);

  const esMiPlanta = () =>
    g.setDatos((d) => ({
      ...d,
      destinatario: {
        ...d.destinatario,
        nombre: planta.nombre ?? d.destinatario.nombre,
        docTipo: "RUC",
        docNumero: planta.ruc ?? "",
        direccion: planta.direccion || d.destinatario.direccion,
        departamento: planta.departamento || d.destinatario.departamento,
        provincia: planta.provincia || d.destinatario.provincia,
        distrito: planta.distrito || d.destinatario.distrito,
      },
      traslado: { ...d.traslado, puntoLlegada: d.traslado.puntoLlegada || planta.direccion },
    }));

  if (destino.propio) {
    return (
      <p
        data-testid="destino-ctp"
        className="flex items-start gap-2 rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--surface-raised)] px-3 py-2 text-sm font-bold text-[var(--text-primary)]"
      >
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)]" aria-hidden="true" />
        Va a tu planta: al emitirla queda en tu Libro CTP para recibirla con sus trozas.
      </p>
    );
  }
  return (
    <div
      data-testid="destino-ctp"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-secondary)]"
    >
      {destino.motivo === "sin_ruc_propio" ? (
        <>
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 basis-60">
            Pon el RUC de tu planta en la Ficha del CTP y las guías que vayan a tu planta pasarán solas a tu Libro CTP.
          </span>
        </>
      ) : (
        <>
          <TreePine className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 basis-60">
            {destino.motivo === "otra_empresa"
              ? "Va a otra empresa: no pasa a tu Libro CTP."
              : "¿La madera va a tu planta? Ponla de destinatario y la guía queda en tu Libro CTP."}
          </span>
          <Btn variant="secondary" size="sm" onClick={esMiPlanta} className="max-sm:h-11 max-sm:w-full">
            Es mi planta
          </Btn>
        </>
      )}
    </div>
  );
}
