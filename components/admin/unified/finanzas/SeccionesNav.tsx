"use client";

/**
 * El segundo nivel de Mi Plata, en la fila del título.
 *
 * ANTES era una segunda barra de pestañas metida arriba del contenido: 40 px de
 * botones + 16 px de aire en 14 de las 15 vistas, y el primer dato recién
 * aparecía a los 325 px (medido a 1280 px el 2026-09-21). Un control chico al
 * lado del título hace el mismo trabajo sin cobrar una fila entera.
 *
 * 2026-10-11 («todo parejo»): dibuja la MISMA `BarraDeSecciones` que el resto
 * del panel (Turnos, Me deben, Análisis, Entradas y salidas). Hasta hoy era un
 * radiogroup propio con píldoras redondas, íconos y su propio tamaño: la única
 * barra de secciones del panel que se veía distinta. Las direcciones no
 * cambian: las secciones de Mi Plata siguen en `?vista=` y las pestañas de
 * Préstamos, Adelantos y Activos en su `?sub=` (lo decide quien llama).
 *
 * LO QUE ESTÁ EN CERO NO OCUPA LUGAR: una sección cuyo dato existe pero está
 * vacío (préstamos sin préstamos, tesorería sin cuentas por pagar) sale de la
 * fila y se pliega detrás de «+N sin usar». No se borra: se sigue pudiendo
 * entrar —por ahí se carga el primero— y un enlace directo la muestra siempre,
 * porque la sección activa nunca se esconde.
 */

import { useState } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { BarraDeSecciones, type SeccionDeBarra } from "@/components/admin/shared/BarraDeSecciones";
import type { ClaveDeDato } from "./estructura";
import type { MapaDeDatos } from "@/hooks/use-secciones-con-datos";

/** El `tabpanel` de la hoja de Mi Plata: lo que cambia con el segundo nivel. */
export const ID_HOJA_DE_PLATA = "plata-hoja";

/**
 * Una opción del segundo nivel: una sección de Mi Plata (`Seccion`) o una
 * pestaña propia de un módulo montado adentro (Préstamos, Adelantos, Activos),
 * que trae su contador (`badge`) y a veces no trae ícono.
 */
export interface ItemDeNivel {
  id: string;
  label: string;
  corto?: string;
  /**
   * Ya no se dibujan (2026-10-11): la `BarraDeSecciones` del panel lleva sólo el
   * rótulo y, angosta, se desliza con la elegida al centro. Siguen en el tipo
   * porque `estructura.ts` y los módulos los usan para otras cosas (menú, ⓘ).
   */
  angosto?: string;
  icon?: LucideIcon;
  dato?: ClaveDeDato;
  badge?: number | string;
}

interface Props {
  secciones: readonly ItemDeNivel[];
  /** La sección activa (una vista de `adentro` marca a su dueña). */
  activa: string;
  onIr: (id: string) => void;
  /** Qué áreas tienen algo cargado. `undefined` = todavía no se sabe → se muestra. */
  datos?: MapaDeDatos;
  /** Nombre accesible del grupo («Secciones de Movimientos»). */
  etiqueta: string;
}

/** Una cifra va al contador de la barra; una marca («!») viaja en el rótulo. */
function aSeccion(s: ItemDeNivel): SeccionDeBarra<string> {
  const rotulo = s.corto ?? s.label;
  if (s.badge == null || s.badge === "") return { clave: s.id, rotulo };
  const n = typeof s.badge === "number" ? s.badge : Number(s.badge);
  return Number.isFinite(n) ? { clave: s.id, rotulo, cuenta: n } : { clave: s.id, rotulo: `${rotulo} ${s.badge}` };
}

export default function SeccionesNav({ secciones, activa, onIr, datos = {}, etiqueta }: Props) {
  const [mostrarVacias, setMostrarVacias] = useState(false);

  const estaVacia = (s: ItemDeNivel) => Boolean(s.dato) && datos[s.dato!] === false && s.id !== activa;
  const vacias = secciones.filter(estaVacia);
  /* Al pedir las vacías entran a la barra en su lugar: es la misma lista. */
  const visibles = mostrarVacias ? secciones : secciones.filter((s) => !estaVacia(s));

  return (
    <div data-secciones-nav="" className="flex min-w-0 max-w-full items-center gap-1.5">
      <BarraDeSecciones
        secciones={visibles.map(aSeccion)}
        activa={activa}
        onCambiar={onIr}
        etiqueta={etiqueta}
        idPanel={ID_HOJA_DE_PLATA}
      />
      {vacias.length > 0 && !mostrarVacias && (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setMostrarVacias(true)}
          title={`Sin datos todavía: ${vacias.map((s) => s.label).join(", ")}`}
          className="inline-flex min-h-12 shrink-0 items-center gap-1 rounded-xl border border-dashed border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)] max-sm:px-2"
        >
          +{vacias.length}
          {/* En angosto alcanza el «+1»: el tooltip y el texto oculto dicen el resto. */}
          <span className="hidden sm:inline">sin usar</span>
          <span className="sr-only">secciones sin datos todavía</span>
        </button>
      )}
    </div>
  );
}
