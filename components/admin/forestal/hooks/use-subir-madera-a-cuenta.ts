"use client";

/**
 * Subir el lote de madera a la cuenta de una persona: el estado de UN intento
 * (a quién, en qué sentido, qué hacer con lo que ya hay) y el pedido. Lo usan
 * las dos ventanas que lo ofrecen —«Cuenta ▾ › Guardar en la cuenta» y el
 * modal «Guardar cubicación» (24-10)—, así que el camino de plata es uno solo:
 *
 *   1. Quien llama guarda (o actualiza) el lote en el Cubicador, para que lo
 *      que se cobre sea EXACTAMENTE lo que se ve.
 *   2. `subir(ref)` crea —o actualiza, si ya hay un borrador del lote— la
 *      cubicación comercial que lo referencia por `cubicacionRefId`: el
 *      servidor copia sus piezas, re-cubica el PT y congela las medidas.
 *      Nunca manda piezas ni PT.
 *
 * Anti doble cobro (`queHacerAlGuardar`): si ya se descontó en ese sentido no
 * deja; si está en el despacho, se abre allá. Tras cualquier falla se vuelve a
 * pedir la lista antes de dejar subir otra vez (`verificando`): si la red cortó
 * con la cubicación ya creada, llega y se actualiza esa.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  cubicacionVigente, duenosDelLote, personaSugerida, queHacerAlGuardar, vistaPreviaMadera,
} from "@/lib/forestal/cubicacion-madera-cuenta";
import { limaDateKey } from "@/lib/utils";
import { usePersonasOrdenadas } from "../cubicacion-cuenta-persona";
import { guardarCubicacionComercial, type CuerpoAserrada } from "./use-cubicacion-comercial-despacho";
import {
  jsonPost, pedir, RUTA_CUBICACIONES_TROZAS, unaCubicacion, usePersonasDeLaCuenta,
  type CubicacionTrozas, type Resultado, type SentidoCubicacion,
} from "./use-cubicaciones-trozas";

/** La fecha del lote si sirve (date-only, no futura); si no, hoy en Lima. */
export const fechaValidaCuenta = (f: string | null | undefined) => {
  const d = f?.slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= limaDateKey() ? d : limaDateKey();
};

export function useSubirMaderaACuenta({
  activo = true, rows, especieDelLote, cliente, delLote, reintentar, alIniciar,
}: {
  /** Apagado (el interruptor del modal) no pide las personas. */
  activo?: boolean;
  rows: PiezaCubicada[];
  especieDelLote: string | null;
  /** El comprador o «cliente» del lote: sólo sugiere la persona. */
  cliente: string;
  /** Lo ya hecho con este lote (`mezclarDelLote`); null = todavía cargando o la lista cayó. */
  delLote: CubicacionTrozas[] | null;
  reintentar: () => void;
  /** Una vez, con la cubicación vigente del lote (para que la ventana tome su fecha, GTF y nota). */
  alIniciar?: (vigente: CubicacionTrozas) => void;
}) {
  const { personas, cargando, error: errorPersonas } = usePersonasDeLaCuenta(activo);
  const vigente = cubicacionVigente(delLote);
  const [clave, setClave] = useState("");
  const [sentido, setSentido] = useState<SentidoCubicacion>("venta");
  /* La lista con la que falló el último intento: mientras siga siendo esa, no
     se decide (puede que el servidor sí la haya guardado). */
  const [falloCon, setFalloCon] = useState<readonly CubicacionTrozas[] | null>(null);
  const verificando = !!falloCon && falloCon === delLote;
  /* La de AHORA al fallar (no la del clic): guardar el lote puede haber cambiado su id y su lista. */
  const delLoteAhora = useRef(delLote);
  useEffect(() => { delLoteAhora.current = delLote; }, [delLote]);
  const alIniciarRef = useRef(alIniciar);
  useEffect(() => { alIniciarRef.current = alIniciar; }, [alIniciar]);

  /* Una vez: con la cubicación vigente de este lote, su sentido; si no, la persona que el lote ya nombra. */
  const iniciado = useRef({ lote: false, persona: false });
  useEffect(() => {
    if (iniciado.current.lote || delLote === null) return;
    iniciado.current.lote = true;
    if (!vigente) return;
    setSentido(vigente.sentido);
    alIniciarRef.current?.(vigente);
  }, [delLote, vigente]);
  useEffect(() => {
    if (iniciado.current.persona || delLote === null || !personas) return;
    iniciado.current.persona = true;
    const dePrevia = vigente && personas.find((p) =>
      vigente.beneficiarioId ? p.beneficiarioId === vigente.beneficiarioId : !!vigente.parteId && p.parteId === vigente.parteId);
    const p = dePrevia ?? personaSugerida(personas, rows, cliente);
    if (p) setClave(p.clave);
  }, [delLote, personas, vigente, rows, cliente]);

  const ordenadas = usePersonasOrdenadas(personas, sentido);
  const persona = ordenadas.find((p) => p.clave === clave) ?? null;
  const vista = useMemo(() => vistaPreviaMadera(rows, especieDelLote), [rows, especieDelLote]);
  const duenos = useMemo(() => duenosDelLote(rows), [rows]);
  const accion = delLote === null ? null : queHacerAlGuardar(delLote, sentido);
  const actualiza = accion?.tipo === "actualizar" ? accion.cub : null;
  const cobrada = accion?.tipo === "cobrada" ? accion.cub : null;
  const enDespacho = accion?.tipo === "despacho" ? accion.cub : null;
  /** Se puede subir (falta sólo la fecha, que valida quien llama). */
  const puede = !!persona && vista.ok && !!accion && !cobrada && !enDespacho && !verificando;

  /**
   * Paso 2: la cubicación comercial del lote ya guardado (`ref`). Lo que se
   * decide (crear o actualizar cuál) es lo de ESTE render, el del clic.
   */
  const subir = async (
    ref: { id: string },
    datos: { fecha: string; gtf?: string; notas?: string },
  ): Promise<Resultado<CubicacionTrozas>> => {
    if (!persona || !puede) {
      return { ok: false, status: 0, codigo: null, mensaje: "Elige a la persona de la cuenta.", extra: {} };
    }
    const gtf = datos.gtf?.trim().slice(0, 80);
    const notas = datos.notas?.trim().slice(0, 500);
    const cuerpo: CuerpoAserrada = {
      material: "aserrada",
      modo: "pieza",
      fecha: datos.fecha,
      sentido,
      origen: "libre",
      cubicacionRefId: ref.id,
      ...(persona.beneficiarioId ? { beneficiarioId: persona.beneficiarioId } : {}),
      ...(persona.parteId ? { parteId: persona.parteId } : {}),
      ...(gtf ? { gtfNumber: gtf } : {}),
      ...(notas ? { notas } : {}),
    };
    const r = actualiza
      ? await pedir(`${RUTA_CUBICACIONES_TROZAS}/${actualiza.id}`, jsonPost("PATCH", { ...cuerpo, version: actualiza.version }), unaCubicacion)
      : await guardarCubicacionComercial(cuerpo);
    if (!r.ok) {
      /* Volver a mirar: un corte de red con la cubicación ya creada no crea otra. */
      setFalloCon(delLoteAhora.current);
      reintentar();
    }
    return r;
  };

  return {
    personas, cargando, errorPersonas, ordenadas, persona, clave, setClave, sentido, setSentido,
    vista, duenos, accion, actualiza, cobrada, enDespacho, verificando, puede, subir,
  };
}

export type SubidaACuenta = ReturnType<typeof useSubirMaderaACuenta>;
