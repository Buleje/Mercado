"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ErrorAlert, LoadingState } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { BarraDeSecciones, idPestanaDeSeccion, type SeccionDeBarra } from "@/components/admin/shared/BarraDeSecciones";
import { BarraPlantas } from "./BarraPlantas";
import { FichaCabecera } from "./FichaCabecera";
import { FichaExistencias } from "./FichaExistencias";
import { FichaKpis } from "./FichaKpis";
import { FichaMovimiento } from "./FichaMovimiento";
import { FichaInspecciones, FichaPendientes } from "./FichaSeguimiento";
import { TablaIncoherencias } from "./TablaIncoherencias";
import { ordenarPorM3 } from "./use-incoherencias";
import { usePlanta } from "./use-planta";

type Seccion = "incoherencias" | "existencias" | "movimiento" | "seguimiento";
const SECCIONES: Seccion[] = ["incoherencias", "existencias", "movimiento", "seguimiento"];
const ID_PANEL = "ficha-planta-panel";

/** La sección vive en `?sub=` (se comparte el enlace y sobrevive a recargar). */
function useSeccion(): [Seccion, (s: Seccion) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const crudo = params.get("sub") as Seccion | null;
  const activa: Seccion = crudo && SECCIONES.includes(crudo) ? crudo : "incoherencias";
  const cambiar = useCallback(
    (s: Seccion) => {
      const q = new URLSearchParams(params.toString());
      if (s === "incoherencias") q.delete("sub");
      else q.set("sub", s);
      const t = q.toString();
      router.replace(t ? `${pathname}?${t}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return [activa, cambiar];
}

/** /superadmin/plantas/[tenantId] — todo lo de una planta para inspeccionarla. */
export function PlantaFichaConsola({ tenantId }: { tenantId: string }) {
  const s = usePlanta(tenantId);
  const [seccion, irA] = useSeccion();

  if (!s.data) {
    if (s.error) {
      return <ErrorAlert title="No se pudo abrir la ficha" description={s.error} action={<Button variant="secondary" onClick={s.recargar}>Reintentar</Button>} />;
    }
    return <LoadingState message="Leyendo su libro…" />;
  }

  const { resumen, porEspecie, incoherencias, tendencia, pendientes, inspecciones } = s.data;
  const errores = incoherencias.filter((i) => i.gravedad === "error").length;
  const secciones: SeccionDeBarra<Seccion>[] = [
    { clave: "incoherencias", rotulo: "Incoherencias", cuenta: errores },
    { clave: "existencias", rotulo: "Existencias", cuenta: porEspecie.filter((e) => e.existenciaFinalM3 < 0).length },
    { clave: "movimiento", rotulo: "Movimiento" },
    { clave: "seguimiento", rotulo: "Pendientes e inspecciones", cuenta: pendientes.filter((p) => p.urgencia === "bloquea").length },
  ];

  return (
    <div className={s.cargando ? "space-y-5 opacity-60 transition-opacity" : "space-y-5 transition-opacity"} aria-busy={s.cargando}>
      <FichaCabecera resumen={resumen} sufijo={s.periodo.sufijo} marcarPrueba={(v) => void s.marcarPrueba(v)} cambiandoPrueba={s.ocupado === "prueba"} />
      {s.errorAccion && <ErrorAlert title="No se pudo guardar" description={s.errorAccion} />}
      {s.error && <ErrorAlert title="No se pudo actualizar" description={`${s.error} Lo que ves es la lectura anterior.`} />}

      <BarraPlantas
        idBase="ficha"
        periodo={s.periodo}
        recalcular={() => void s.recalcular()}
        recalculando={s.ocupado === "recalcular"}
        calculadoEn={resumen.calculadoEn}
        desdeCache={resumen.desdeCache}
      />
      <FichaKpis resumen={resumen} />

      <BarraDeSecciones secciones={secciones} activa={seccion} onCambiar={irA} etiqueta="Secciones de la planta" idPanel={ID_PANEL} />
      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)}>
        {seccion === "incoherencias" &&
          (incoherencias.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Su libro no muestra incoherencias en este período.</p>
          ) : (
            <TablaIncoherencias items={ordenarPorM3(incoherencias)} slugDe={() => resumen.identidad.slug} />
          ))}
        {seccion === "existencias" && (
          <FichaExistencias porEspecie={porEspecie} especiesLeidas={resumen.lecturas.conciliacion === "ok"} aserrada={resumen.aserrada} />
        )}
        {seccion === "movimiento" && <FichaMovimiento movimiento={resumen.movimiento} tendencia={tendencia} />}
        {seccion === "seguimiento" && (
          <div className="space-y-6">
            <FichaPendientes pendientes={pendientes} leidos={resumen.lecturas.pendientes === "ok"} />
            <FichaInspecciones inspecciones={inspecciones} />
          </div>
        )}
      </div>
    </div>
  );
}
