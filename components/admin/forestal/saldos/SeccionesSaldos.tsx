"use client";

/**
 * Las cuatro preguntas de Saldos, cada una con su pestaña.
 *
 * Diez bloques en una sola tirada obligaban a scrollear por lo que no se está
 * mirando: cómo está hoy · qué puede salir · cómo se movió · qué firma el libro.
 *
 * A 400 px las cuatro se encimaban (medido 24-09: botones de 87 px con texto de
 * 111 a 144 px). La causa era `flex-1 whitespace-nowrap` dentro de un
 * `flex-wrap`: con base 0 % ningún botón pide renglón y el texto se sale. Ahora
 * es una grilla de 2×2 en angosto y de 4 en ancho, y el texto envuelve.
 */

import type { ReactNode } from "react";
import CtpKpiFiltros, { notaDeFiltros } from "../CtpKpiFiltros";
import Pestanas from "./Pestanas";

export const SECCIONES = [
  { id: "estado" as const, label: "Cómo está hoy" },
  { id: "capacidad" as const, label: "Qué puede salir" },
  { id: "movimiento" as const, label: "Cómo se movió" },
  { id: "libro" as const, label: "Lo que firma el libro" },
];
export type Seccion = (typeof SECCIONES)[number]["id"];
export const SECCION_IDS = SECCIONES.map((s) => s.id) as readonly Seccion[];

const idTab = (s: Seccion) => `saldos-tab-${s}`;
const idPanel = (s: Seccion) => `saldos-panel-${s}`;

export default function SeccionesSaldos({
  seccion,
  onSeccion,
  cargando,
  children,
}: {
  seccion: Seccion;
  onSeccion: (s: Seccion) => void;
  /** El panel se está refrescando: lo dice sin tapar lo que ya se ve. */
  cargando?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <Pestanas
        items={SECCIONES.map((s) => ({ id: s.id, contenido: s.label }))}
        activa={seccion}
        onCambiar={onSeccion}
        etiqueta="Secciones de Saldos"
        idTab={idTab}
        idPanel={idPanel}
        className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-sunken)] p-1 lg:grid-cols-4"
        claseBoton={(sel) =>
          `min-h-11 rounded-lg px-3 py-2 text-center text-sm font-semibold leading-tight transition-colors ${
            sel
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]/60 hover:text-[var(--text-primary)]"
          }`
        }
      />
      <div
        role="tabpanel"
        id={idPanel(seccion)}
        aria-labelledby={idTab(seccion)}
        aria-busy={cargando || undefined}
        className="space-y-6"
      >
        {children}
      </div>
    </>
  );
}

/**
 * La especie de los indicadores (ADR-400). Gobierna las TRES lecturas del
 * período —saldos, conciliación y curva—: la calcula el servidor con la especie
 * puesta. No va en «Qué puede salir», que se sirve de otras fuentes y trae su
 * propio recorte: un filtro que sigue en pantalla sin gobernar lo de abajo es la
 * contradicción que ese ADR vino a sacar.
 */
export function FiltroEspecieKpis({
  especie,
  opciones,
  onCambiar,
}: {
  especie: string;
  opciones: readonly string[];
  onCambiar: (especie: string) => void;
}) {
  return (
    <CtpKpiFiltros
      campos={[
        {
          key: "especie",
          label: "Especie",
          todos: "Todas las especies",
          valor: especie || undefined,
          opciones: opciones.map((e) => ({ value: e, label: e })),
          onChange: (v) => onCambiar(v[0] ?? ""),
          /* Viaja a `useCtpSaldos`: la consulta admite una especie. */
          unico: true,
        },
      ]}
      onLimpiar={() => onCambiar("")}
      nota={notaDeFiltros([{ label: "Especie", valores: especie ? [especie] : [] }])}
    />
  );
}
