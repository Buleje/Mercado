"use client";

/**
 * LothMapaAreaHeredada — el permiso elegido todavía no tiene su área y el mapa
 * muestra la del negocio (ADR-462, 02-10-2026). Una línea y un botón:
 * «Pasar a este permiso» COPIA el área del negocio al permiso; la del negocio
 * no se borra. Si el permiso ya tenía la suya, el servidor no la pisa (409) y
 * la pantalla la vuelve a leer.
 */

import { ArrowRightLeft, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Btn } from "./ctp-shared";

interface Props {
  /** Cómo se llama el permiso de la banda. */
  permiso: string;
  copiando: boolean;
  onPasar: () => void;
}

export default function LothMapaAreaHeredada({ permiso, copiando, onPasar }: Props) {
  return (
    <div
      role="status"
      data-area-heredada
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]"
    >
      <span className="font-semibold">
        {permiso} todavía no tiene su área: ves la del negocio.
      </span>
      <InfoTip
        title="Área del negocio"
        what="El área se dibujó antes de separar el mapa por permiso, así que es del negocio. «Pasar a este permiso» la copia a éste; la del negocio queda como estaba."
        affects="El plano, el cuadro de coordenadas y el EUDR de este permiso. Si dibujas y guardas acá, también queda como suya."
        example="Las talas con GPS de PLANTACION 096 caen dentro del área del negocio: pásala a ese permiso y desde ahí cada permiso tiene la suya."
      />
      <Btn size="sm" variant="primary" onClick={onPasar} disabled={copiando} className="ml-auto">
        {copiando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />}
        {copiando ? "Pasando…" : "Pasar a este permiso"}
      </Btn>
    </div>
  );
}
