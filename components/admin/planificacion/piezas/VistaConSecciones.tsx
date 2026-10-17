"use client";

/**
 * VistaConSecciones — el armazón de una vista del plan con más de un bloque
 * (ADR-497): `BarraDeSecciones` arriba, `?sub=` recordado entre visitas, y el
 * bloque elegido debajo. Si el plan todavía carga o falló, lo dice acá (el
 * módulo también lo hace; esto cubre la vista montada sola).
 */
import type { ReactNode } from "react";
import { ErrorAlert, LoadingState } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { usePlanEmpresa } from "@/hooks/use-plan-empresa";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";

interface Props<T extends string> {
  /** Dónde se recuerda la sección elegida (`admin-last-tab-<moduleId>`). */
  moduleId: string;
  claves: readonly T[];
  rotulos: Readonly<Record<T, string>>;
  /** Cuántos hay en cada sección (gris, también el 0). */
  cuentas?: Partial<Record<T, number>>;
  /** Para el lector de pantalla: «Secciones de FODA y estrategias». */
  etiqueta: string;
  idPanel: string;
  /** El bloque de la sección elegida; `irA` cambia de sección sin recargar. */
  children: (sub: T, irA: (clave: T) => void) => ReactNode;
}

export function VistaConSecciones<T extends string>({ moduleId, claves, rotulos, cuentas, etiqueta, idPanel, children }: Props<T>) {
  const plan = usePlanEmpresa();
  const { vista, irA } = useSubvistaModulo<T>(moduleId, claves, claves[0]);
  const secciones = claves.map((clave) => ({ clave, rotulo: rotulos[clave], cuenta: cuentas?.[clave] }));

  if (plan.cargando) return <LoadingState message="Trayendo el plan…" />;
  if (plan.error) {
    return (
      <ErrorAlert
        title="No se pudo leer el plan"
        description={plan.error}
        action={
          <Button variant="secondary" onClick={plan.recargar}>
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <BarraDeSecciones secciones={secciones} activa={vista} onCambiar={irA} etiqueta={etiqueta} idPanel={idPanel} tonoCuenta="neutro" />
      <div role="tabpanel" id={idPanel} aria-labelledby={idPestanaDeSeccion(idPanel, vista)} className="space-y-4">
        {children(vista, irA)}
      </div>
    </div>
  );
}
