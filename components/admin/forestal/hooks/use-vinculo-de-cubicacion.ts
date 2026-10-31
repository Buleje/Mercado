"use client";

/**
 * Lo que decide «Agregar cubicación» (`CtpVincularCubicacionModal`): qué
 * corridas del día, qué cubicación guardada y si el conjunto CUADRA.
 *
 * El cuadre es contra TODAS las corridas a las que la cubicación quedaría
 * atada: las que ya tenía (de este día o de otros) más las que se tildan acá.
 * Revisión 27-09: cuadrando sólo contra el día, una cubicación de 3,2 m³ ya
 * atada al lunes se ataba también al martes (3,2 contra 3,2) y respaldaba
 * 6,4 m³ declarados con 3,2 m³ de piezas.
 */

import { useMemo, useState } from "react";
import { useCubicacionesGuardadas } from "@/hooks/use-cubicaciones-guardadas";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { CorridaDelDia } from "@/lib/forestal/piezas-del-dia";
import { corridaPideCubicacion, necesarioDelDia, type NecesarioDe } from "../marcas-del-dia";
import { cuadrarVinculo, type CuadreDelVinculo } from "../vincular-cubicacion-cuadre";
import { useJornadasConPaquetes } from "./use-jornadas-con-paquetes";
import { useCorridasAtadas } from "./use-corridas-atadas";
import { corridasDeLaCubicacion } from "./use-vincular-cubicacion";

/** Días entre dos `YYYY-MM-DD` (para ordenar las guardadas por cercanía). */
const distancia = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));

/** Las corridas que se tildan solas: las que piden cubicación, o todas si el día no trae marcas. */
function porDefecto(
  corridas: readonly CorridaDelDia[],
  necesario: NecesarioDe,
  inicial?: string,
): Set<string> {
  if (inicial && corridas.some((c) => c.id === inicial)) return new Set([inicial]);
  if (corridas.every((c) => !c.origenYSalida)) return new Set(corridas.map((c) => c.id));
  return new Set(
    corridas.filter((c) => corridaPideCubicacion(c.origenYSalida, necesario)).map((c) => c.id),
  );
}

export function useVinculoDeCubicacion(dia: string, corridaInicial?: string) {
  const { datos, error: errorDia } = useJornadasConPaquetes([dia]);
  const guardadas = useCubicacionesGuardadas();

  /* Lo que a cada corrida del día le falta explicar: con eso se juzga una
     cubicación que ampara varias corridas (`origenVisibleDeCorrida`). */
  const necesario = useMemo(() => necesarioDelDia(datos?.detalle ?? []), [datos]);
  /* Las que piden cubicación, primero; una corrida sin m³ no tiene contra qué cuadrar. */
  const corridas = useMemo(
    () =>
      (datos?.detalle ?? [])
        .filter((c) => c.m3 > 0)
        .sort(
          (a, b) =>
            Number(corridaPideCubicacion(b.origenYSalida, necesario)) -
              Number(corridaPideCubicacion(a.origenYSalida, necesario)) || a.lineNo - b.lineNo,
        ),
    [datos, necesario],
  );

  /* Las guardadas: primero las que no están atadas a nada, después la más cercana al día. */
  const lista = useMemo(
    () =>
      [...guardadas.lista].sort(
        (a, b) =>
          Number(corridasDeLaCubicacion(a).length > 0) -
            Number(corridasDeLaCubicacion(b).length > 0) ||
          distancia(a.fecha, dia) - distancia(b.fecha, dia),
      ),
    [guardadas.lista, dia],
  );
  /* Lo que entra sin tipear: si UNA sola guardada es de ese día y está suelta, viene elegida. */
  const sugerida = useMemo(() => {
    const delDia = lista.filter((c) => c.fecha === dia && corridasDeLaCubicacion(c).length === 0);
    return delDia.length === 1 ? delDia[0]!.id : "";
  }, [lista, dia]);
  const [elegidaId, setElegidaId] = useState<string | null>(null);
  const id = elegidaId ?? sugerida;
  const cubicacion = lista.find((c) => c.id === id);

  /* A qué está atada YA (de este día o de otros): cuenta en el cuadre. */
  const idsAtadas = useMemo(
    () => (cubicacion ? corridasDeLaCubicacion(cubicacion) : []),
    [cubicacion],
  );
  const atadas = useCorridasAtadas(idsAtadas, datos?.detalle ?? []);
  const setAtadas = useMemo(() => new Set(idsAtadas), [idsAtadas]);

  /* Tildadas: `null` = todavía no las tocó nadie, mandan las de fábrica. */
  const [tildadas, setTildadas] = useState<Set<string> | null>(null);
  const elegidas = useMemo(() => {
    if (tildadas) return tildadas;
    const base = porDefecto(corridas, necesario, corridaInicial);
    if (!cubicacion || corridaInicial) return base;
    /* Con una cubicación elegida se tildan sólo las de sus especies. */
    const especies = new Set(cubicacion.piezas.map((p) => claveEspecie(p.especie)));
    const deEsas = new Set(
      [...base].filter((cid) =>
        especies.has(claveEspecie(corridas.find((c) => c.id === cid)?.especie)),
      ),
    );
    return deEsas.size > 0 ? deEsas : base;
  }, [tildadas, corridas, necesario, corridaInicial, cubicacion]);
  /** Las que se atan AHORA (tildadas y todavía no atadas). */
  const nuevas = useMemo(
    () => corridas.filter((c) => elegidas.has(c.id) && !setAtadas.has(c.id)),
    [corridas, elegidas, setAtadas],
  );
  const alternar = (cid: string) => {
    const s = new Set(elegidas);
    if (s.has(cid)) s.delete(cid);
    else s.add(cid);
    setTildadas(s);
  };

  const yaVinculada =
    !!cubicacion && nuevas.length === 0 && [...elegidas].some((c) => setAtadas.has(c));
  const cuadre: CuadreDelVinculo = useMemo(() => {
    const base = cuadrarVinculo([...atadas.corridas, ...nuevas], cubicacion?.piezas ?? []);
    const traba = atadas.cargando
      ? "Leyendo las corridas a las que ya está atada…"
      : atadas.error
        ? `No se pudieron leer las corridas a las que ya está atada: ${atadas.error}`
        : nuevas.length === 0
          ? yaVinculada
            ? "Ya está vinculada a esas corridas."
            : "Elige al menos una corrida."
          : null;
    return traba ? { ...base, cuadra: false, motivo: traba } : base;
  }, [atadas.corridas, atadas.cargando, atadas.error, nuevas, cubicacion, yaVinculada]);

  return {
    datos,
    errorDia,
    guardadas: { lista, cargando: guardadas.cargando, recargar: guardadas.recargar },
    corridas,
    necesario,
    id,
    elegir: setElegidaId,
    cubicacion,
    elegidas,
    alternar,
    nuevas,
    /** Las ya atadas, con lo que declararon (de este día y de otros). */
    atadas: atadas.corridas,
    idsAtadas: setAtadas,
    cuadre,
    yaVinculada,
  };
}
