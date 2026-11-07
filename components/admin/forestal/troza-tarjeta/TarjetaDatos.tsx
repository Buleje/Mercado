/**
 * Los papeles de la troza: lo que pide una fiscalización parado frente a ella.
 * Van los seis siempre, con «—» si falta: en esta tarjeta que falte la
 * constancia del SNIFFS es información, no ruido.
 */

import { Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";

export interface DatoTarjeta {
  rotulo: string;
  valor: string | null;
  /** Códigos (GTF, permiso, constancia): en mono, se leen como identificador. */
  codigo?: boolean;
  /** Textos largos (titular, resolución) ocupan el ancho entero. */
  ancho?: boolean;
}

export default function TarjetaDatos({ datos }: { datos: readonly DatoTarjeta[] }) {
  return (
    <section aria-labelledby="tarjeta-datos" className="space-y-3 p-5 sm:p-6">
      <Kicker as="h2" id="tarjeta-datos" className="text-[var(--text-secondary)]">
        Papeles
      </Kicker>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {datos.map((d) => (
          <div key={d.rotulo} className={cn("min-w-0 border-b border-[var(--rule-soft)] pb-2.5", d.ancho && "col-span-2")}>
            <dt className="text-sm text-[var(--text-secondary)]">{d.rotulo}</dt>
            <dd
              className={cn(
                "mt-0.5 break-words text-base font-semibold",
                d.valor ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
                d.codigo && d.valor && "font-mono tabular-nums",
              )}
            >
              {d.valor ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
