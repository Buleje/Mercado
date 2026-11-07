"use client";

/**
 * PlantillasSugeridas — las seis actividades que casi todo negocio necesita
 * (ADR-501 §3, `lib/agenda/plantillas.ts`), a un clic. Nacen APAGADAS: revisas
 * sus días y la prendes. La de la cuenta de un tercero abre la ventana para
 * elegir la cuenta. Las que ya tienes salen marcadas.
 */
import { useState } from "react";
import { Check, Plus } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { toast } from "sonner";
import { TARJETA } from "@/components/admin/planificacion/piezas/clases";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda } from "@/hooks/use-agenda";
import { cn } from "@/lib/utils";
import { actividadDePlantilla, PLANTILLAS_AGENDA, type PlantillaAgenda } from "@/lib/agenda/plantillas";
import { crearActividad } from "../agenda-api";
import { hoyKey } from "../comun/fechas";
import { textoRecurrencia } from "../comun/recurrencia-texto";
import { REGLA_UI } from "../comun/reglas";

interface Props {
  /** Abre la ventana con la sugerida ya cargada (la de la cuenta de un tercero). */
  onAbrir: (p: PlantillaAgenda) => void;
}

export function PlantillasSugeridas({ onAbrir }: Props) {
  const { actividades, refrescar } = useAgenda();
  const [creando, setCreando] = useState<string | null>(null);
  const hoy = hoyKey();

  const agregar = async (p: PlantillaAgenda) => {
    if (p.pideObjetivo) return onAbrir(p);
    const cuerpo = actividadDePlantilla(p, { hoy });
    if (!cuerpo) return onAbrir(p);
    setCreando(p.id);
    const r = await crearActividad(cuerpo);
    setCreando(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`«${cuerpo.nombre}» quedó apagada: revisa sus días y préndela`);
    refrescar();
  };

  return (
    <section className={cn(TARJETA, "space-y-3 px-4 py-3")} aria-label="Actividades sugeridas">
      <div className="flex items-center gap-1.5">
        <CardTitle>Sugeridas</CardTitle>
        <InfoTip
          title="Actividades sugeridas"
          what="Las que más se repiten en un negocio como el tuyo. Al agregarla se crea apagada, con días y hora por defecto."
          affects="No avisa hasta que la prendes en la lista de abajo. Puedes cambiar sus días, su hora y por dónde te avisa."
          example="«Marcar la asistencia» de lunes a sábado a las 09:00: se da por hecha sola cuando todos marcaron."
          side="bottom"
        />
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {PLANTILLAS_AGENDA.map((p) => {
          const ui = REGLA_UI[p.regla];
          const Icono = ui.icon;
          const yaEsta = !p.pideObjetivo && actividades.some((a) => a.regla === p.regla);
          const nombre = p.pideObjetivo ? REGLA_UI.cuenta_tercero.label : p.nombre;
          const cuando = textoRecurrencia(
            { frecuencia: p.frecuencia, desde: hoy, hasta: null, diasSemana: p.diasSemana, diaMes: p.diaMes, cadaN: null },
            p.hora,
          );
          return (
            <li key={p.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--rule-soft)] p-2 pl-3">
              <Icono className="size-5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate font-semibold text-[var(--text-primary)]">{nombre}</span>
                  <InfoTip title={nombre} what={p.descripcion} side="bottom" />
                </div>
                <span className="block truncate text-sm text-[var(--text-tertiary)]">{cuando}</span>
              </div>
              {yaEsta ? (
                <span className="inline-flex h-12 shrink-0 items-center gap-1 px-2 text-sm font-semibold text-[var(--data-success-ink)]">
                  <Check className="size-4" aria-hidden="true" />
                  Ya la tienes
                </span>
              ) : (
                <button
                  type="button"
                  className={button({ variant: "secondary", className: "shrink-0 max-sm:w-12 max-sm:px-0" })}
                  onClick={() => void agregar(p)}
                  disabled={creando !== null}
                  title={p.pideObjetivo ? "Elige la cuenta" : "Se agrega apagada"}
                  aria-label={`Agregar «${nombre}»`}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  <span className="max-sm:sr-only">{creando === p.id ? "Agregando…" : p.pideObjetivo ? "Elegir cuenta" : "Agregar"}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
