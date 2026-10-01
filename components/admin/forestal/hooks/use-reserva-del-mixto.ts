"use client";

/**
 * use-reserva-del-mixto — cada lectura del escáner aparta la troza en el
 * servidor (ADR-441), sin perder ninguna.
 *
 * La pistola lee más rápido de lo que el servidor contesta. Las lecturas se
 * juntan: mientras un pedido viaja, las que llegan esperan y salen JUNTAS en el
 * siguiente (un PATCH con N trozas, no N PATCH que se pisan en el lock). Se
 * relee una sola vez, al vaciarse la fila.
 *
 * Lo que está viajando se sigue mostrando en su tarjeta («apartando…») hasta
 * que la relectura lo trae: sacarlo al volver el PATCH y ponerlo al releer la
 * hacía parpadear. Sin señal, `escribirDelPatio` lo anota en la cola del patio;
 * lo pendiente de este mixto se lee de la cola misma (`pendientesDelMixto`) y
 * se muestra «por subir» hasta que suba.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EVENTO_CAMBIO, listar, type AnotacionPatio } from "@/lib/forestal/patio-cola";
import { pendientesDelMixto } from "@/lib/forestal/lote-mixto-vista";
import type { EstadoLotesMixtos, LoteMixto, RechazoDeTroza } from "./use-lotes-mixtos";

type Accion = "agregar" | "quitar";

export interface ReservaDelMixto {
  /** Ids escaneados que todavía no volvieron del servidor (o no se releyeron). */
  apartando: ReadonlySet<string>;
  /** Ids que se están sacando. */
  sacando: ReadonlySet<string>;
  /** Lo que el libro no aceptó, pieza por pieza. */
  rechazadas: RechazoDeTroza[];
  /** Un pedido entero rechazado (mes cerrado, mixto ya repartido…). */
  error: string | null;
  /** Lo anotado sin señal en este equipo, según la cola del patio. */
  porSubir: { agregar: ReadonlySet<string>; quitar: ReadonlySet<string> };
  /** Rechazos que vinieron al subir la cola (el operador ya no estaba mirando). */
  rechazadasEnCola: { id: string; motivo: string }[];
  apartar: (trozaId: string) => void;
  sacar: (trozaId: string) => void;
  cerrarAvisos: () => void;
  trabajando: boolean;
}

export function useReservaDelMixto({
  mixto,
  reservar,
  alTerminar,
  codigoDe,
}: {
  mixto: Pick<LoteMixto, "id" | "code"> | null;
  reservar: EstadoLotesMixtos["reservar"];
  /** Releer el mixto y el patio: se llama una vez al vaciarse la fila. */
  alTerminar: () => Promise<void>;
  /** El código de la chapa, para el resumen de la bandeja. */
  codigoDe: (trozaId: string) => string;
}): ReservaDelMixto {
  const [apartando, setApartando] = useState<ReadonlySet<string>>(new Set());
  const [sacando, setSacando] = useState<ReadonlySet<string>>(new Set());
  const [rechazadas, setRechazadas] = useState<RechazoDeTroza[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const fila = useRef<{ accion: Accion; id: string }[]>([]);
  const corriendo = useRef(false);
  const mixtoRef = useRef(mixto);
  mixtoRef.current = mixto;
  const deps = useRef({ reservar, alTerminar, codigoDe });
  deps.current = { reservar, alTerminar, codigoDe };

  const vaciar = useCallback(async () => {
    if (corriendo.current) return;
    corriendo.current = true;
    setTrabajando(true);
    const hechas: { accion: Accion; ids: string[] }[] = [];
    try {
      while (fila.current.length > 0) {
        const m = mixtoRef.current;
        if (!m) {
          fila.current = [];
          break;
        }
        /* Una tanda = lecturas seguidas de la MISMA acción (apartar/sacar), en orden. */
        const accion = fila.current[0].accion;
        const ids: string[] = [];
        while (fila.current.length > 0 && fila.current[0].accion === accion && ids.length < 500) {
          ids.push(fila.current.shift()!.id);
        }
        const codigos = ids.map((id) => deps.current.codigoDe(id)).join(", ");
        const r = await deps.current
          .reservar(m, accion, ids, `${m.code}: ${accion === "agregar" ? "apartar" : "sacar"} ${codigos}`)
          .catch((e: unknown) => ({ estado: "error" as const, mensaje: e instanceof Error ? e.message : String(e) }));
        hechas.push({ accion, ids });
        if (r.estado === "ok" && r.rechazadas.length > 0) setRechazadas((prev) => [...r.rechazadas, ...prev]);
        if (r.estado === "error") setError(r.mensaje);
      }
      if (hechas.length > 0) await deps.current.alTerminar().catch(() => undefined);
    } finally {
      /* Recién releído se sueltan: la tarjeta pasa de «apartando» a firme sin parpadear. */
      const soltar = (accion: Accion) => {
        const ids = new Set(hechas.filter((h) => h.accion === accion).flatMap((h) => h.ids));
        return (prev: ReadonlySet<string>) => {
          if (ids.size === 0) return prev;
          const n = new Set(prev);
          for (const id of ids) n.delete(id);
          return n;
        };
      };
      setApartando(soltar("agregar"));
      setSacando(soltar("quitar"));
      corriendo.current = false;
      setTrabajando(false);
    }
    /* Lo que se escaneó mientras se releía sale en la vuelta siguiente. */
    if (fila.current.length > 0) void vaciar();
  }, []);

  const encolar = useCallback(
    (accion: Accion, id: string) => {
      fila.current.push({ accion, id });
      (accion === "agregar" ? setApartando : setSacando)((prev) => new Set(prev).add(id));
      setError(null);
      void vaciar();
    },
    [vaciar],
  );

  const cola = useColaDelMixto(mixto?.id ?? null, alTerminar);

  return {
    apartando,
    sacando,
    rechazadas,
    error,
    porSubir: { agregar: cola.agregar, quitar: cola.quitar },
    rechazadasEnCola: cola.rechazadas,
    apartar: (id) => encolar("agregar", id),
    sacar: (id) => encolar("quitar", id),
    cerrarAvisos: () => {
      setRechazadas([]);
      setError(null);
    },
    trabajando,
  };
}

/**
 * Lo de este mixto que está en la cola del patio. Sólo LEE la cola: quien la
 * sube es el `usePatioCola` del libro (dos instancias subiendo a la vez
 * mandarían dos veces lo mismo). Cuando algo de este mixto sube, relee.
 */
function useColaDelMixto(mixtoId: string | null, alSubir: () => Promise<void>) {
  const [lista, setLista] = useState<AnotacionPatio[]>([]);
  const previas = useRef(0);
  const alSubirRef = useRef(alSubir);
  alSubirRef.current = alSubir;

  useEffect(() => {
    let vivo = true;
    const leer = () => {
      listar()
        .then((l) => {
          if (vivo) setLista(l);
        })
        .catch(() => {
          /* Sin IndexedDB no hay cola: nada por subir. */
        });
    };
    leer();
    window.addEventListener(EVENTO_CAMBIO, leer);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_CAMBIO, leer);
    };
  }, []);

  const p = pendientesDelMixto(lista, mixtoId);
  const cuantas = p.agregar.size + p.quitar.size;
  useEffect(() => {
    if (cuantas < previas.current) void alSubirRef.current().catch(() => undefined);
    previas.current = cuantas;
  }, [cuantas]);
  return p;
}
