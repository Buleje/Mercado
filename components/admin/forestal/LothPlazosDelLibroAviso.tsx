"use client";

/**
 * El plazo de 15 días del LIBRO, en su propio aviso (B5, revisión 25-10).
 *
 * Un despacho no lleva plan: el plazo para asentarlo (RDE 264-2019) es del
 * libro entero. Antes iba como una razón del semáforo de cada plan, y la
 * grilla tenía que esconderlo o cada tarjeta repetía el mismo despacho. Acá
 * se dice una vez, sobre los avisos del plan, con la misma cuenta
 * (`razonesPlazo` sobre `GET /loth/semaforo`, el mismo GET compartido).
 *
 * Una línea + ⓘ (regla del panel). Sin nada que hacer, no se dibuja; lo
 * asentado tarde esta semana es informativo y se queda fuera. Si la lectura
 * falló, lo dice («No pude leer…»): callar sería un verde falso.
 */

import { AlertTriangle, ShieldAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { razonesPlazo } from "@/lib/forestal/loth-plan-semaforo";
import { useLecturaDelLibro } from "./hooks/use-loth-semaforo-libro";

export default function LothPlazosDelLibroAviso({ firma }: { firma?: number }) {
  const lectura = useLecturaDelLibro(firma);
  const plazos = lectura.estado === "listo" ? lectura.datos.plazos : lectura.estado === "fallo" ? null : undefined;
  const razones = razonesPlazo(plazos).filter((r) => r.nivel !== "info");
  if (razones.length === 0) return null;
  const rojo = razones.some((r) => r.nivel === "rojo");
  const Icono = rojo ? ShieldAlert : AlertTriangle;
  return (
    <div
      data-aviso-plazos-libro={rojo ? "rojo" : "ambar"}
      data-aviso-nivel={rojo ? "rojo" : "ambar"}
      data-aviso-resumen={razones[0].texto.replace(/(:|\.\s|\.$).*$/, "")}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 px-3 py-2 text-sm ${
        rojo
          ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/12"
          : "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15"
      }`}
    >
      <span className="flex min-w-0 grow basis-[18rem] items-center gap-2">
        <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="font-bold">{rojo ? "Riesgo de multa en el libro" : "Revisa el libro"}:</span>{" "}
          {razones.map((r) => r.texto).join(" ")}
        </span>
        <InfoTip
          title="Plazo de 15 días del libro"
          ariaLabel="Qué es el plazo de 15 días del libro"
          what="Cada operación se asienta en el Libro TH hasta 15 días después de hecha (RDE 264-2019). Este aviso cuenta los despachos que todavía no están asentados."
          affects="Es del libro entero, no de este plan: un despacho no lleva plan. Pasado el plazo, OSINFOR lo puede observar."
          example="Un despacho del lunes 05/10 se asienta hasta el martes 20/10."
        />
      </span>
    </div>
  );
}
