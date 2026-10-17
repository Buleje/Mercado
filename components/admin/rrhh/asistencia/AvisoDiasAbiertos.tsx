"use client";

/**
 * AvisoDiasAbiertos — «Quedaron 8 días sin marcar en setiembre» (ADR-417).
 *
 * Medido el 2026-09-15 contra la base real de Blas: del 1 al 15 de setiembre
 * hay 8 días sin ninguna marca (01 a 07 y el 13). Nadie avisaba: la hoja del
 * día sólo muestra el día que estás mirando, y quien vuelve después de una
 * semana no sabe qué quedó abierto. Acá esos días son chips: un clic y la
 * hoja salta a ese día para cargarlo.
 *
 * Tres decisiones de forma:
 * - **Sin días abiertos no renderiza nada.** Una banda que dice «todo al día»
 *   ocupa el mismo lugar que la que avisa de verdad y enseña a ignorar la
 *   franja entera.
 * - **Ni el spinner ni el error se muestran.** Es un complemento de la hoja
 *   —que ya avisa sus propios errores— y una segunda barra roja por lo mismo
 *   es ruido. El fallo queda registrado igual: `use-rrhh-asistencia` lo pasa
 *   por `sinDato`.
 * - **Los domingos se listan igual**, con su nombre al lado. No hay calendario
 *   de feriados en el sistema; inventarlo sería peor que dejar que el dueño
 *   juzgue («ah, el 13 fue domingo»). El criterio completo está en
 *   `dias-abiertos.ts`.
 */

import { useId, useMemo, useState } from "react";
import { CalendarOff } from "@buleje/design-system/icons";
import { useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import { diasDelMes, mesDe, rangoDeDias } from "@/lib/rrhh/fechas";
import { cn, limaDateKey } from "@/lib/utils";
import { AvisoRrhh, claseChipFiltro } from "../rrhh-form";
import { diasAbiertos, notaDomingos, tituloDiasAbiertos } from "./dias-abiertos";
import type { FechaKey } from "@/lib/rrhh/tipos";


interface Props {
  /** Mes a revisar, `"2026-09"`. Por defecto, el mes en curso en Lima. */
  mes?: string;
  /** Saltar a ese día en la hoja del día. */
  onIrAlDia: (fecha: FechaKey) => void;
  className?: string;
}

export default function AvisoDiasAbiertos({ mes, onIrAlDia, className }: Props) {
  const [desplegado, setDesplegado] = useState(false);
  // `useId`, no un id fijo: la banda puede estar montada en la hoja del día y
  // en la del mes a la vez, y dos `id` iguales rompen el `aria-controls`.
  const idLista = useId();

  // `limaDateKey()` es puro y devuelve el mismo texto todo el día: `desde` y
  // `hasta` salen iguales en cada render, así que el hook (que depende de esos
  // dos textos) pide la hoja UNA vez, no en cada render.
  const mesRevisado = mes ?? mesDe(limaDateKey());
  const desde = `${mesRevisado}-01`;
  const hasta = `${mesRevisado}-${String(diasDelMes(desde)).padStart(2, "0")}`;
  const { hoja, loading, error } = useRrhhAsistencia(desde, hasta);

  const abiertos = useMemo(() => {
    if (!hoja) return [];
    return diasAbiertos({
      dias: rangoDeDias(hoja.desde, hoja.hasta),
      marcas: hoja.marcas,
      hoy: hoja.hoy,
      colaboradores: hoja.colaboradores,
      ventana: hoja.ventana,
    });
  }, [hoja]);

  if (loading || error || abiertos.length === 0) return null;

  const nota = notaDomingos(abiertos);
  const unico = abiertos.length === 1 ? abiertos[0] : null;
  // Una línea (noche 11-10): el título y UN botón. Con un solo día, el botón
  // lleva a ese día; con varios, despliega los chips debajo (antes la banda
  // pintaba 9-12 chips siempre y ocupaba 90 px arriba de la hoja).
  const accion = unico ? (
    <button type="button" onClick={() => onIrAlDia(unico.fecha)} aria-label={`Ir al ${unico.etiqueta}, sin marcar`} className={claseChipFiltro(false)}>
      Ir al {unico.diaSemana.slice(0, 3)} {unico.fecha.slice(8, 10)}
    </button>
  ) : (
    <button type="button" onClick={() => setDesplegado((v) => !v)} aria-expanded={desplegado} aria-controls={idLista} className={claseChipFiltro(desplegado)}>
      {desplegado ? "Ocultar los días" : `Ver los ${abiertos.length} días`}
    </button>
  );

  return (
    <AvisoRrhh tono="aviso" icono={CalendarOff} accion={accion} className={cn("items-center py-1.5", className)}>
      <p className="font-semibold">
        {tituloDiasAbiertos(abiertos, mesRevisado)}
        {nota && <span className="font-normal text-[var(--text-secondary)]"> · {nota}</span>}
      </p>
      {!unico && (
        <ul id={idLista} hidden={!desplegado} aria-label="Días sin ninguna marca" className="mt-2 flex flex-wrap items-center gap-1.5">
          {abiertos.map((dia) => (
            <li key={dia.fecha}>
              <button type="button" onClick={() => onIrAlDia(dia.fecha)} aria-label={`Ir al ${dia.etiqueta}, sin marcar`} className={claseChipFiltro(false)}>
                <span className="font-normal text-[var(--text-tertiary)]">{dia.diaSemana.slice(0, 3)}</span>
                <span className="tabular-nums">{dia.fecha.slice(8, 10)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AvisoRrhh>
  );
}
