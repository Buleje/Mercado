/**
 * «Copiado de la guía N: destinatario y transporte» del despacho con guía del
 * Libro TH (FOR-2, 09-10). Dice sólo lo que la guía anterior trajo de verdad
 * (`loCopiadoDelDespacho`), igual que «Anotar una guía» (`LothGtfForm`).
 */

import { Copy } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { listaEnFrase } from "@/lib/forestal/loth-guia-anterior";

export interface GuiaCopiadaDespacho {
  gtfNumber: string | null;
  /** `false`: el permiso todavía no tiene guías y se tomó la última del negocio. */
  delPermiso: boolean;
  copiados: string[];
}

export default function LothGuiaLineaCopiada({ gtfNumber, delPermiso, copiados }: GuiaCopiadaDespacho) {
  if (copiados.length === 0) return null;
  return (
    <p role="status" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
      <Copy className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <span>
        Copiado de {gtfNumber ? <>la guía <span className="font-mono font-semibold text-[var(--text-primary)]">{gtfNumber}</span></> : "tu última guía"}
        {delPermiso ? "" : " (de otro permiso: éste todavía no tiene guías)"}: {listaEnFrase(copiados)}.
      </span>
      <InfoTip
        title="Lo que viene de la guía anterior"
        what="Sale de la última guía de este permiso, para que el destino y el transporte se escriban igual en todas. Sólo llena lo vacío; el titular sale del plan. Edítalo o elige otro del Directorio si cambió."
        ariaLabel="De dónde sale lo copiado"
      />
    </p>
  );
}
