"use client";

/**
 * Qué dueño se declara y el borrador de cada uno (Brandon, 2026-09-23: «que
 * proponga 2 registros solos»).
 *
 * Con piezas de un solo dueño todo queda como antes: un borrador, sin
 * propuesta, sin selector. Con dos o más, cada dueño es SU registro —su
 * servicio, su cuenta, sus precios, su permiso— y el borrador de cada uno se
 * guarda aparte: saltar de WASACO a «Sin dueño» para mirar no arrastra el
 * precio pactado de uno al cobro del otro (la misma razón por la que los
 * precios ya se guardaban por servicio).
 *
 * Vive en el componente de AFUERA de «Declarar», que no se desmonta: cerrar
 * para volver a cubicar no borra lo elegido.
 */
import { useCallback, useMemo, useState, type SetStateAction } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { TipoServicio } from "@/lib/forestal/declarar-produccion";
import {
  etiquetaDeGrupo,
  gruposPorDueno,
  servicioPropuesto,
  type GrupoDeDueno,
} from "@/lib/forestal/declarar-por-dueno";
import { TEXTOS_VACIOS, type TextosDePrecio } from "./declarar-produccion-pantalla";

export interface BorradorDeclaracion {
  /** Sin valor inicial a propósito: suponer «propia» es la respuesta que nadie revisa. */
  servicio: TipoServicio | null;
  /** Aserrío a un tercero: a quién se le carga. */
  parteId: string | null;
  /**
   * Madera propia: para qué cliente, si ya se sabe (opcional). Sólo sugiere el
   * precio de venta de su trato (ADR-430); no viaja al servidor. Va aparte de
   * `parteId`: el dueño de una madera ajena no es el comprador de la propia.
   */
  compradorId: string | null;
  textos: TextosDePrecio;
  linea: string;
  permiso: string;
  observaciones: string;
  /** La especie que se le pone a lo cubicado SIN especie. Nunca pisa una que ya está. */
  especieParaSinEspecie: string | null;
}

export const BORRADOR_INICIAL: BorradorDeclaracion = {
  servicio: null,
  parteId: null,
  compradorId: null,
  textos: TEXTOS_VACIOS,
  /* La del día a día, como el alta con lote (`CtpRegistrarProduccionModal`). */
  linea: "LP",
  permiso: "",
  observaciones: "",
  especieParaSinEspecie: null,
};

/** El borrador con que arranca un grupo de una libreta partida: lo que propone su dueño. */
export function borradorDelGrupo(grupo: GrupoDeDueno | null): BorradorDeclaracion {
  const propuesto = servicioPropuesto(grupo);
  return propuesto ? { ...BORRADOR_INICIAL, ...propuesto } : BORRADOR_INICIAL;
}

/* Sin piezas no hay dueño: el borrador de «nada todavía». */
const SIN_GRUPO = "__sin_grupo__";

export interface DeclararPorDueno {
  grupos: GrupoDeDueno[];
  /** Hay 2+ dueños: se declara uno a la vez y se muestra el selector. */
  separados: boolean;
  /** El grupo a la vista (`null` = no hay nada declarable). */
  grupo: GrupoDeDueno | null;
  /** Las piezas que se declaran ahora: las del grupo, o todas si hay un solo dueño. */
  piezas: readonly PiezaCubicada[];
  elegir: (clave: string) => void;
  borrador: BorradorDeclaracion;
  setBorrador: (accion: SetStateAction<BorradorDeclaracion>) => void;
  /** Lo que ya se registró de esta libreta mientras quedaban otros dueños. */
  aviso: string | null;
  cerrarAviso: () => void;
  /**
   * Se registró el grupo a la vista. Devuelve las piezas que QUEDAN (vacío =
   * no queda nada declarable: se vacía la libreta) y el mensaje para quien
   * cierra — con los registros anteriores de la misma tanda, si los hubo.
   */
  registrado: (mensaje: string) => { quedan: PiezaCubicada[]; ids: string[]; mensaje: string };
}

export function useDeclararPorDueno(todas: readonly PiezaCubicada[]): DeclararPorDueno {
  const grupos = useMemo(() => gruposPorDueno(todas), [todas]);
  const separados = grupos.length > 1;
  const [elegido, setElegido] = useState<string | null>(null);
  const [borradores, setBorradores] = useState<Record<string, BorradorDeclaracion>>({});
  /* Los mensajes de los dueños ya registrados, para el aviso del final. */
  const [hechos, setHechos] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const grupo = grupos.find((g) => g.clave === elegido) ?? grupos[0] ?? null;
  /* El borrador va SIEMPRE con su dueño, haya uno o varios (revisión 23-09,
     dinero): con una clave aparte para «un solo dueño», elegir «propia» para
     WASACO se perdía al aparecer un segundo dueño, y un «tercero a la cuenta
     de Centro» quedaba puesto sobre piezas que ya eran todas de WASACO — su
     aserrío se le cobraba a otro. Cambiar el dueño de la libreta arranca un
     borrador nuevo para ese dueño; es lo seguro. */
  const clave = grupo?.clave ?? SIN_GRUPO;
  const inicial = useMemo(
    () => (separados ? borradorDelGrupo(grupo) : BORRADOR_INICIAL),
    [separados, grupo],
  );
  const borrador = borradores[clave] ?? inicial;

  const setBorrador = useCallback(
    (accion: SetStateAction<BorradorDeclaracion>) =>
      setBorradores((prev) => {
        const actual = prev[clave] ?? inicial;
        return { ...prev, [clave]: typeof accion === "function" ? accion(actual) : accion };
      }),
    [clave, inicial],
  );

  const piezas = useMemo(() => (separados && grupo ? grupo.piezas : todas), [separados, grupo, todas]);

  const registrado = (mensaje: string) => {
    const ids = piezas.map((p) => p.id);
    const fuera = new Set(ids);
    const quedan = todas.filter((p) => !fuera.has(p.id));
    const siguientes = gruposPorDueno(quedan);
    /* El nombre del dueño va si la libreta se partió: también en el último,
       que ya se declara sin selector pero cierra una tanda de varios. */
    const conNombre = (separados || hechos.length > 0) && grupo ? `${etiquetaDeGrupo(grupo)}: ${mensaje}` : mensaje;

    if (siguientes.length === 0) {
      /* No queda nada que declarar: todo vuelve a cero, como siempre. */
      const final = [...hechos, conNombre].join(" ");
      setBorradores({});
      setElegido(null);
      setHechos([]);
      setAviso(null);
      return { quedan: [], ids, mensaje: final };
    }

    /* Queda otro dueño: su borrador se arma YA con lo que él propone. Si queda
       uno solo, sigue siendo SU borrador (la clave es siempre la del dueño):
       conserva lo que ya se le había puesto al mirarlo. */
    setBorradores((prev) => {
      const next = { ...prev };
      delete next[clave];
      for (const g of siguientes) next[g.clave] = prev[g.clave] ?? borradorDelGrupo(g);
      return next;
    });
    setElegido(siguientes[0].clave);
    setHechos((h) => [...h, conNombre]);
    setAviso(conNombre);
    return { quedan, ids, mensaje: conNombre };
  };

  return {
    grupos,
    separados,
    grupo,
    piezas,
    elegir: setElegido,
    borrador,
    setBorrador,
    aviso,
    cerrarAviso: () => setAviso(null),
    registrado,
  };
}
