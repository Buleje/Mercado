/**
 * Piezas chicas del alta de persona: el pie que revisa un número en vivo, el
 * aviso de una línea y la cabecera de la tarjeta que no se pliega («Quién es»).
 */
import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Revision } from "./validacion";
import { PIE, PIE_AVISO, PIE_AYUDA, PIE_OK, TARJETA } from "./clases";

/**
 * Debajo del campo: «Faltan 3 dígitos» mientras se escribe, el aviso en coral
 * cuando ya no puede ser válido y un visto bueno cuando cierra. `aria-live`:
 * quien no ve la pantalla se entera sin salir del campo.
 */
export function PieRevision({
  revision,
  ayuda,
  okTexto,
  id,
}: {
  revision: Revision;
  /** Lo que se lee con el campo vacío. */
  ayuda?: string;
  okTexto?: string;
  id?: string;
}) {
  let contenido: ReactNode = null;
  if (revision.estado === "mal") {
    contenido = (
      <span className={cn(PIE, PIE_AVISO)}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {revision.texto}
      </span>
    );
  } else if (revision.estado === "escribiendo") {
    contenido = <span className={cn(PIE, PIE_AYUDA)}>{revision.texto}</span>;
  } else if (revision.estado === "ok" && okTexto) {
    contenido = (
      <span className={cn(PIE, PIE_OK)}>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {okTexto}
      </span>
    );
  } else if (revision.estado === "vacio" && ayuda) {
    contenido = <span className={cn(PIE, PIE_AYUDA)}>{ayuda}</span>;
  }
  return (
    <span id={id} aria-live="polite" className="block">
      {contenido}
    </span>
  );
}

/** Un aviso que pide mirar algo, en una línea (con acción opcional a la derecha). */
export function Aviso({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3.5 py-2.5 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
      <span className="min-w-0 flex-1 font-semibold text-[var(--text-primary)]">{children}</span>
      {accion}
    </div>
  );
}

/** Tarjeta fija (no se pliega) con la misma cabecera que el `Plegable`. */
export function TarjetaSeccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className={TARJETA}>
      <CardTitle className="flex min-h-14 items-center px-5 py-2 text-sm font-bold">{titulo}</CardTitle>
      <div className="space-y-4 border-t border-[var(--rule-soft)] px-5 pb-5 pt-4">{children}</div>
    </section>
  );
}
