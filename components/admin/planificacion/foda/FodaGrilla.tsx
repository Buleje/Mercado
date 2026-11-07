"use client";

/**
 * FodaGrilla — el FODA en una grilla 2×2 (ADR-497): arriba lo de adentro
 * (fortalezas, debilidades), abajo lo de afuera (oportunidades, amenazas). A
 * 400 px los cuadrantes se apilan. Todo se guarda solo.
 */
import { undoToast } from "@buleje/design-system";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import type { CuadranteFoda as ClaveCuadrante } from "@/lib/planificacion/secciones";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { CuadranteFoda } from "./CuadranteFoda";
import { CUADRANTE, ORDEN_GRILLA, type PuntoFoda } from "./foda-config";

export function FodaGrilla() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("foda");

  const agregar = (c: ClaveCuadrante, texto: string) =>
    cambiar((prev) => ({ ...prev, [c]: [...prev[c], { id: nuevoId(), texto, impacto: "medio" as const }] }));

  const editar = (c: ClaveCuadrante, id: string, cambio: Partial<Omit<PuntoFoda, "id">>) =>
    cambiar((prev) => ({ ...prev, [c]: prev[c].map((p) => (p.id === id ? { ...p, ...cambio } : p)) }));

  const borrar = (c: ClaveCuadrante, id: string, avisar: boolean) => {
    const indice = datos[c].findIndex((p) => p.id === id);
    const punto = datos[c][indice];
    if (!punto) return;
    cambiar((prev) => ({ ...prev, [c]: prev[c].filter((p) => p.id !== id) }));
    if (!avisar) return;
    undoToast({
      message: `Borraste un punto de ${CUADRANTE[c].nombre.toLowerCase()}`,
      description: punto.texto.slice(0, 80),
      onUndo: () =>
        cambiar((prev) => {
          if (prev[c].some((p) => p.id === id)) return prev;
          const lista = [...prev[c]];
          lista.splice(Math.min(indice, lista.length), 0, punto);
          return { ...prev, [c]: lista };
        }),
    });
  };

  return (
    <div className="space-y-3">
      <CabeceraSeccion
        seccion="foda"
        titulo="FODA"
        ayuda="Lo que tienes a favor y en contra: adentro del negocio (fortalezas y debilidades) y afuera (oportunidades y amenazas). Toca el impacto de cada punto para cambiarlo."
        ejemplo="Fortaleza: clientes fieles del barrio. Amenaza: abre un minimarket de cadena en la avenida."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {ORDEN_GRILLA.map((c) => (
          <CuadranteFoda
            key={c}
            clave={c}
            puntos={datos[c]}
            puedeEditar={puedeEditar}
            onAgregar={(texto) => agregar(c, texto)}
            onEditar={(id, cambio) => editar(c, id, cambio)}
            onBorrar={(id, avisar) => borrar(c, id, avisar)}
          />
        ))}
      </div>
    </div>
  );
}
