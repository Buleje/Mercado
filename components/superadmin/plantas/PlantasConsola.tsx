"use client";

import { EmptyState, ErrorAlert, LoadingState } from "@buleje/design-system";
import { TreePine } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { BarraPlantas } from "./BarraPlantas";
import { PlantasKpis } from "./PlantasKpis";
import { PlantasTabla } from "./PlantasTabla";
import { usePlantas } from "./use-plantas";

/** /superadmin/plantas — todas las plantas forestales con su semáforo. */
export function PlantasConsola() {
  const s = usePlantas();
  const plantas = s.data?.plantas ?? [];
  const calculadoEn = plantas.reduce<string | null>((max, p) => (!max || p.calculadoEn > max ? p.calculadoEn : max), null);

  return (
    <div className="space-y-5">
      <BarraPlantas
        idBase="plantas"
        periodo={s.periodo}
        incluirPrueba={{ valor: s.incluirPrueba, cambiar: s.setIncluirPrueba }}
        recalcular={() => void s.recalcular()}
        recalculando={s.recalculando}
        calculadoEn={calculadoEn}
        desdeCache={plantas.some((p) => p.desdeCache)}
      />

      {s.errorRecalculo && <ErrorAlert title="No se pudo recalcular" description={s.errorRecalculo} />}

      {s.error && (
        <ErrorAlert
          title="No se pudieron leer las plantas"
          description={s.error}
          action={<Button variant="secondary" onClick={s.recargar}>Reintentar</Button>}
        />
      )}

      {!s.data && s.cargando && <LoadingState message="Leyendo el libro de cada planta…" />}

      {s.data && (
        <div className={s.cargando ? "space-y-5 opacity-60 transition-opacity" : "space-y-5 transition-opacity"} aria-busy={s.cargando}>
          <PlantasKpis data={s.data} />
          {plantas.length === 0 ? (
            <EmptyState
              icon={TreePine}
              title="Ninguna planta en este filtro"
              description={s.incluirPrueba ? "Ningún negocio tiene el libro forestal activado." : "Prueba con «Incluir plantas de prueba»."}
            />
          ) : (
            <PlantasTabla plantas={plantas} sufijo={s.periodo.sufijo} />
          )}
        </div>
      )}
    </div>
  );
}
