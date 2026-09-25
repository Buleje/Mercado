"use client";

/**
 * Los días marcados de la tira para el resumen, y de cada uno qué dueños
 * entran (Brandon, 2026-09-23: *«al seleccionar el check, que se pueda elegir
 * del día que tiene 2, sólo uno o los dos»*).
 *
 * Los dueños de cada día se TOMAN al marcarlo: marcar el lunes, irse a otra
 * semana y marcar otro día es normal, y la tira ya no tiene el lunes a la vista
 * para preguntarle quién produjo.
 */
import { useCallback, useMemo, useState } from "react";
import { alternarDuenoExcluido, filtroDeDuenos } from "@/lib/forestal/resumen-de-jornadas";

export function useDiasMarcados(duenosDelDia: (iso: string) => string[]) {
  const [marcados, setMarcados] = useState<string[]>([]);
  const [duenosDe, setDuenosDe] = useState<Record<string, string[]>>({});
  const [excluidosDe, setExcluidosDe] = useState<Record<string, string[]>>({});

  const marcar = useCallback(
    (iso: string) => {
      setMarcados((prev) => (prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso]));
      /* Desmarcar olvida lo elegido: volver a marcar el día lo trae entero. */
      setDuenosDe(({ [iso]: previo, ...resto }) => (previo ? resto : { ...resto, [iso]: duenosDelDia(iso) }));
      setExcluidosDe(({ [iso]: _fuera, ...resto }) => resto);
    },
    [duenosDelDia],
  );

  const limpiar = useCallback(() => {
    setMarcados([]);
    setDuenosDe({});
    setExcluidosDe({});
  }, []);

  const alternarDueno = useCallback(
    (iso: string, dueno: string) =>
      setExcluidosDe((prev) => ({
        ...prev,
        [iso]: alternarDuenoExcluido(prev[iso] ?? [], duenosDe[iso] ?? [], dueno),
      })),
    [duenosDe],
  );

  const filtro = useMemo(() => filtroDeDuenos(marcados, duenosDe, excluidosDe), [marcados, duenosDe, excluidosDe]);

  return { marcados, marcar, limpiar, duenosDe, excluidosDe, alternarDueno, filtro };
}
