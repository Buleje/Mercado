"use client";

/**
 * «Sin recepcionar N · X m³» en el riel de Trozas: las guías que entraron sin
 * fecha de llegada al patio —típico: por el importador sin la casilla «ya
 * están en el patio»— y el atajo a la recepción en bloque que ya existe
 * (`CtpRecepcionBloqueModal`, la misma de Ingresos). Sólo aparece si hay alguna:
 * un cero sería un adorno.
 */

import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Loader2, PackageCheck } from "@buleje/design-system/icons";
import { CLASE_TEXTO_ACCION, TextoDeAccion } from "@/components/admin/shared/libro-acciones-vista";
import { button } from "@/components/ui-system/button-variants";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { cn } from "@/lib/utils";
import { n2 } from "./ctp-trozas-ui";
import { useGuiasSinRecibir } from "./hooks/use-guias-sin-recibir";

const CtpRecepcionBloqueModal = dynamic(() => import("./CtpRecepcionBloqueModal"), { ssr: false });

const BTN_AVISO = button({
  variant: "secondary",
  className:
    "shrink-0 gap-1.5 rounded-xl border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-3 font-bold hover:bg-[var(--data-warning-500)]/20",
});

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export default function CtpGuiasSinRecibir({ onRecibidas }: { onRecibidas?: () => void }) {
  const { resumen, abriendo, guias, abrir, cerrar, recargar } = useGuiasSinRecibir();
  const n = resumen?.guias ?? 0;
  if (n === 0 && !guias) return null;

  const frase =
    `Sin recepcionar: ${n} ${plural(n, "guía", "guías")}, ${n2(resumen?.m3 ?? 0)} m³` +
    ((resumen?.trozas ?? 0) > 0 ? `, ${resumen?.trozas} trozas` : "") +
    " sin fecha de llegada al patio. Recibirlas en bloque";

  return (
    <>
      {n > 0 && (
        <button
          type="button"
          disabled={abriendo}
          title={frase}
          aria-label={frase}
          data-guias-sin-recibir={n}
          onClick={() => {
            void abrir().then((aviso) => {
              if (aviso) toast.info(aviso);
            });
          }}
          className={BTN_AVISO}
        >
          {abriendo ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <PackageCheck className="h-4 w-4 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden="true" />
          )}
          <TextoDeAccion>Sin recepcionar</TextoDeAccion>
          <span className="font-mono tabular-nums">{n}</span>
          <span className={cn("font-mono text-xs font-normal tabular-nums text-[var(--text-secondary)]", CLASE_TEXTO_ACCION)}>
            {n2(resumen?.m3 ?? 0)} m³
          </span>
        </button>
      )}
      {guias && (
        <CtpRecepcionBloqueModal
          guias={guias}
          onClose={cerrar}
          onListo={(r) => {
            cerrar();
            invalidarCtp();
            recargar();
            onRecibidas?.();
            const ok = r.recibidas.length;
            const fallas = r.fallaron.map((f) => `${f.gtfNumber}: ${f.motivo}`).join(" · ");
            if (ok === 0) toast.error(`No se recibió ninguna guía. ${fallas}`);
            else toast.success(`${plural(ok, "Se recibió 1 guía", `Se recibieron ${ok} guías`)}${fallas ? ` · no: ${fallas}` : "."}`);
          }}
        />
      )}
    </>
  );
}
