"use client";

/**
 * M30 · lo que queda pendiente ANTES de cerrar la caja y la constancia que
 * sale DESPUÉS. La lógica es pura (`lib/caja/constancia-cierre.ts`); acá sólo
 * se dibuja y se imprime.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Info, Printer } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cachedJson } from "@/lib/client-cache-fetch";
import {
  htmlConstanciaDeCierre,
  type CajaCerradaParaConstancia,
  type DestinoPendiente,
  type PendienteDeCierre,
} from "@/lib/caja/constancia-cierre";
import { abrirHojaImpresa } from "./acciones-parte";

const DONDE: Record<DestinoPendiente, string> = { hoy: "Ver hoy", movimientos: "Ver movimientos", cuadrar: "Ir a cuadrar" };

/** «Antes de cerrar»: una línea por pendiente, la explicación en la ⓘ y un enlace a donde se arregla. */
export function PendientesAntesDeCerrar({
  pendientes,
  onIr,
}: {
  pendientes: ReadonlyArray<PendienteDeCierre>;
  onIr?: (destino: DestinoPendiente) => void;
}) {
  if (pendientes.length === 0) return null;
  const graves = pendientes.some((p) => p.grave);
  return (
    <div
      data-qa="pendientes-cierre"
      className={cn(
        "rounded-xl border p-3",
        graves
          ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10"
          : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10",
      )}
    >
      <Kicker className="libro-kicker mb-1 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden /> Antes de cerrar
        <InfoTip
          what="Lo que el cierre va a fijar tal como está. Puedes cerrar igual: quedan escritos en la constancia."
          affects="Lo que se arregla después del cierre ya no cambia el conteo de esta caja."
        />
      </Kicker>
      <ul className="space-y-1">
        {pendientes.map((p) => (
          <li key={p.clave} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            {p.grave ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" aria-hidden />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
            )}
            <span className="min-w-0 flex-1">{p.texto}</span>
            <InfoTip what={p.detalle} />
            {onIr && (
              <button
                type="button"
                onClick={() => onIr(p.ir)}
                className="inline-flex shrink-0 items-center gap-1 min-h-10 px-2 rounded-lg text-sm font-semibold text-primary hover:bg-primary/10"
              >
                {DONDE[p.ir]} <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface DatosConstancia {
  negocio: string;
  responsable: string | null;
  tolerancia: number;
  pendientes: ReadonlyArray<PendienteDeCierre>;
  yaEstabaCerrada?: boolean;
}

/** Nombre completo de quien confirma el cierre (va en la constancia: «Cerró: …»). */
export function useQuienCierra(): string | null {
  const [yo, setYo] = useState<string | null>(null);
  useEffect(() => {
    cachedJson<{ name?: string | null; username?: string | null }>("/api/auth/me", 60_000)
      .then((d) => setYo(d?.name?.trim() || d?.username?.trim() || null))
      .catch(() => setYo(null));
  }, []);
  return yo;
}

/** Abre la constancia del cierre con las cifras que devolvió el servidor. `false` = el navegador bloqueó la ventana. */
export function imprimirConstancia(caja: CajaCerradaParaConstancia, datos: DatosConstancia): boolean {
  return abrirHojaImpresa(htmlConstanciaDeCierre(caja, datos, formatCurrency));
}

/** Botón del pie de la vista «La caja quedó cerrada». */
export function BotonConstancia({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" data-qa="imprimir-constancia" onClick={onClick} className={button({ variant: "secondary", className: "flex-1 rounded-xl" })}>
      <Printer className="h-5 w-5" aria-hidden /> Imprimir constancia
    </button>
  );
}
