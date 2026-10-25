"use client";

/**
 * Las secciones del cubicador de madera (Brandon 23-10: «que se haga sección e
 * ir en sección y sección; que no estén todas las secciones visibles en una
 * pantalla»). Se ve UNA a la vez y la URL la recuerda (`?sub=`, regla 11 de la
 * vista): Cargar · Lote · Guardadas · Grabaciones.
 *
 * Antes eran tres bloques apilados con un índice pegajoso que llevaba a cada
 * uno (`cubicador-indice`, 23-10 a la mañana). Para no dictar a ciegas ahora
 * que la tabla no está debajo, «Cargar» muestra arriba el mismo «Lo que llevas
 * medido» del lote y, al lado del micrófono, `UltimasDelLote`
 * (`cubicador-ultimas`): las 4 últimas piezas con las columnas de la tabla.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";

export const SECCIONES_CUBICADOR = ["cargar", "lote", "guardadas", "grabaciones"] as const;
export type SeccionCubicador = (typeof SECCIONES_CUBICADOR)[number];

const ROTULO: Record<SeccionCubicador, string> = {
  cargar: "Cargar",
  lote: "Lote",
  guardadas: "Guardadas",
  grabaciones: "Grabaciones",
};

const ID_PANEL = "cubicador-madera-seccion";

/**
 * La sección que se ve, en `?sub=` (y recordada para la próxima visita).
 * `visitadas`: las que ya se abrieron. Las Grabaciones quedan montadas después
 * de la primera visita: salir a «Cargar» no puede cortar una grabación.
 */
export function useSeccionDelCubicador(): {
  seccion: SeccionCubicador;
  irA: (s: SeccionCubicador) => void;
  visitadas: ReadonlySet<SeccionCubicador>;
} {
  const { vista, irA } = useSubvistaModulo<SeccionCubicador>("forestal-cubicador-madera", SECCIONES_CUBICADOR, "cargar");
  const ir = useCallback((s: SeccionCubicador) => irA(s), [irA]);
  const [visitadas, setVisitadas] = useState<ReadonlySet<SeccionCubicador>>(() => new Set([vista]));
  /* Ajuste durante el render (patrón de React): sin un efecto que pinte un cuadro de más. */
  if (!visitadas.has(vista)) setVisitadas(new Set([...visitadas, vista]));
  return { seccion: vista, irA: ir, visitadas };
}

/** Atributos del contenedor que cambia con la barra (patrón ARIA de pestañas). */
export function panelDeSeccion(seccion: SeccionCubicador) {
  return { role: "tabpanel" as const, id: ID_PANEL, "aria-labelledby": idPestanaDeSeccion(ID_PANEL, seccion) };
}

/**
 * La barra de secciones, pegada arriba: en un lote de 700 filas la vuelta a
 * «Cargar» no puede pedir subir toda la tabla. Al cambiar de sección desde
 * abajo, se sube al principio del cubicador (la sección nueva empieza ahí).
 */
export function BarraDelCubicador({ seccion, onCambiar, piezasDelLote, resumen }: {
  seccion: SeccionCubicador;
  onCambiar: (s: SeccionCubicador) => void;
  /** Piezas del lote, al lado de «Lote». */
  piezasDelLote: number;
  /** m³ · PT del lote, a la derecha (desde 640 px). */
  resumen?: ReactNode;
}) {
  const ancla = useRef<HTMLDivElement>(null);
  const secciones = SECCIONES_CUBICADOR.map((clave) => ({
    clave,
    rotulo: ROTULO[clave],
    cuenta: clave === "lote" ? piezasDelLote : undefined,
  }));
  const cambiar = (s: SeccionCubicador) => {
    onCambiar(s);
    const el = ancla.current;
    /* 64 px = la cabecera del panel: más arriba, la barra ya está pegada. */
    if (el && el.getBoundingClientRect().top < 64) el.scrollIntoView({ block: "start", behavior: "auto" });
  };
  return (
    <>
      <div ref={ancla} aria-hidden className="scroll-mt-16" />
      <div className="sticky top-16 z-20 flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-sm)]">
        <div className="min-w-0 flex-1">
          <BarraDeSecciones
            secciones={secciones}
            activa={seccion}
            onCambiar={cambiar}
            etiqueta="Secciones del cubicador"
            idPanel={ID_PANEL}
            tonoCuenta="neutro"
          />
        </div>
        {resumen && (
          <span className="hidden shrink-0 pr-2 font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)] sm:inline">
            {resumen}
          </span>
        )}
      </div>
    </>
  );
}
