"use client";

/**
 * La lógica de «Escanear troza» del Control del permiso: qué hacer con cada
 * lectura (cámara, pistola o tipeo). Qué troza es lo decide
 * `lib/forestal/loth-qr-troza.ts` (puro, con test); acá se decide qué se
 * muestra y, en modo ráfaga, qué entra a la lista del conteo.
 *
 * Mismas defensas que el escáner del CTP (`EscanerTrozas`), porque la
 * etiqueta es la misma (ADR-436):
 *   · el QR grande, el chico y el Code128 son la MISMA pieza: leídos seguidos
 *     (< 2 s) no son «ya estaba», se callan (`esEcoDeEtiqueta`);
 *   · la pistola tipea la ficha línea por línea: lo que llega detrás de
 *     `TROZA <código>` durante 3 s es el resto de la ficha, no un código.
 */

import { useCallback, useRef, useState } from "react";
import {
  ECO_DE_ETIQUETA_MS,
  VENTANA_FICHA_MS,
  claveDeCodigo,
  esEcoDeEtiqueta,
  esFichaDeTroza,
} from "@/lib/forestal/leer-escaneo-troza";
import {
  agregarARafaga,
  buscarEnTablero,
  leerQrTrozaLoth,
  type LecturaRafaga,
} from "@/lib/forestal/loth-qr-troza";
import { ESTADOS_META, type TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import type { Aviso, Tono, TrozaDelEscaner } from "../escaner-trozas-partes";

/** La troza del tablero con la forma que entiende el renglón de candidatas del escáner. */
export const comoCandidata = (f: TrozaTablero): TrozaDelEscaner => ({
  id: f.code,
  codigoPlanta: f.code,
  especieComun: f.especie,
  gtfNumber: f.gtf,
  volumenM3: f.volumenM3,
});

const nombre = (f: TrozaTablero) => (f.especie ? `${f.code} · ${f.especie}` : f.code);

export function useEscanerTrozaLoth(filas: readonly TrozaTablero[]) {
  const [rafaga, setRafaga] = useState(false);
  const [aviso, setAviso] = useState<Aviso<TrozaDelEscaner> | null>(null);
  const [actual, setActual] = useState<TrozaTablero | null>(null);
  const [lista, setListaState] = useState<LecturaRafaga[]>([]);
  /* La lista en un ref: dos lecturas en el mismo tick (pistola rápida) tienen
     que ver la lista que dejó la anterior, no la del último render. */
  const listaRef = useRef<LecturaRafaga[]>([]);
  const contador = useRef(0);
  const ultimaRef = useRef<{ id: string; en: number } | null>(null);
  const fichaHastaRef = useRef(0);

  const setLista = useCallback((l: LecturaRafaga[]) => {
    listaRef.current = l;
    setListaState(l);
  }, []);

  const avisar = useCallback((tono: Tono, mensaje: string, candidatas?: TrozaDelEscaner[]) => {
    contador.current += 1;
    setAviso({ tono, mensaje, candidatas, n: contador.current });
  }, []);

  /** Suma a la lista del conteo; `false` si ya estaba. */
  const contar = useCallback(
    (codigo: string, fila: TrozaTablero | null) => {
      const r = agregarARafaga(listaRef.current, codigo, fila);
      setLista(r.lista);
      return !r.repetida;
    },
    [setLista],
  );

  /** Una troza del permiso reconocida. Devuelve `true` si se tomó (no era eco). */
  const tomar = useCallback(
    (fila: TrozaTablero): boolean => {
      const ahora = Date.now();
      if (esEcoDeEtiqueta(ultimaRef.current, fila.code, ahora)) return false;
      ultimaRef.current = { id: fila.code, en: ahora };
      const salida = fila.estado !== "disponible";
      const estado = ESTADOS_META[fila.estado].label.toLowerCase();
      if (rafaga) {
        if (!contar(fila.code, fila)) {
          avisar("ya", `Troza ${nombre(fila)}: ya estaba en la lista.`);
          return true;
        }
        avisar(
          salida ? "ya" : "ok",
          salida
            ? `Troza ${nombre(fila)} contada, pero figura ${estado}${fila.gtf ? ` (GTF ${fila.gtf})` : ""}.`
            : `Troza ${nombre(fila)} contada.`,
        );
        return true;
      }
      setActual(fila);
      avisar(salida ? "ya" : "ok", `Troza ${nombre(fila)}: ${estado}.`);
      return true;
    },
    [rafaga, contar, avisar],
  );

  const desconocida = useCallback(
    (codigo: string) => {
      const ahora = Date.now();
      const id = `?${claveDeCodigo(codigo)}`;
      if (esEcoDeEtiqueta(ultimaRef.current, id, ahora, ECO_DE_ETIQUETA_MS)) return;
      ultimaRef.current = { id, en: ahora };
      if (rafaga && !contar(codigo, null)) {
        avisar("ya", `${codigo}: ya estaba en la lista como desconocida.`);
        return;
      }
      if (!rafaga) setActual(null);
      avisar("no", `${codigo}: esta troza no es de este permiso o no está registrada en el libro.`);
    },
    [rafaga, contar, avisar],
  );

  /**
   * Procesa una lectura. Devuelve `true` cuando dejó UNA troza en pantalla
   * (con una lectura sola, la cámara ya se puede cerrar para ver la tarjeta).
   */
  const procesar = useCallback(
    (crudo: string): boolean => {
      const ahora = Date.now();
      const enFicha = ahora < fichaHastaRef.current;
      const lectura = leerQrTrozaLoth(crudo);
      if (lectura?.tipo === "linea-ficha") {
        if (ultimaRef.current) ultimaRef.current = { ...ultimaRef.current, en: ahora };
        fichaHastaRef.current = ahora + VENTANA_FICHA_MS;
        return false;
      }
      if (esFichaDeTroza(crudo)) fichaHastaRef.current = ahora + VENTANA_FICHA_MS;
      if (!lectura) {
        if (!enFicha && crudo.trim()) avisar("no", "Eso no es el código de una troza.");
        return false;
      }
      if (lectura.tipo === "sin-codigo") {
        avisar(
          "no",
          "Esa etiqueta se imprimió sin código: escanea su código de barras o tipea el del árbol.",
        );
        return false;
      }
      if (lectura.tipo === "otro-libro") {
        avisar("no", "Esa etiqueta es de una troza del Libro CTP, no de este permiso.");
        return false;
      }
      const r = buscarEnTablero(filas, lectura.codigo);
      if (r.estado === "una") {
        /* Una troza reconocida por un código que NO es ficha (Code128, QR
           chico): la pistola ya está en otra etiqueta y la ficha anterior
           terminó. Sin esto, la desconocida escaneada justo después se callaba
           como «resto de la ficha» y desaparecía del conteo. */
        if (!esFichaDeTroza(crudo)) fichaHastaRef.current = 0;
        return tomar(r.fila) && !rafaga;
      }
      if (r.estado === "varias" || r.estado === "arbol") {
        if (r.filas.some((f) => esEcoDeEtiqueta(ultimaRef.current, f.code, ahora))) return false;
        avisar(
          "varias",
          r.estado === "arbol"
            ? `${r.arbol} es un árbol con ${r.filas.length} trozas en este permiso: elige cuál.`
            : `El código ${lectura.codigo} está en ${r.filas.length} trozas: elige cuál.`,
          r.filas.map(comoCandidata),
        );
        return false;
      }
      /* El resto de una ficha tipeada sin sus íconos (`Shihuahuaco`) no es un
         código perdido; otra ficha o una dirección sí son otra etiqueta. */
      const otraEtiqueta =
        esFichaDeTroza(crudo) || /^([a-z][a-z0-9+.-]*:\/\/|\/)/i.test(crudo.trim());
      if (enFicha && !otraEtiqueta) {
        fichaHastaRef.current = ahora + VENTANA_FICHA_MS;
        return false;
      }
      desconocida(r.codigo);
      return false;
    },
    [filas, rafaga, tomar, desconocida, avisar],
  );

  /** Elegir una de las candidatas de un código repetido o de un árbol. */
  const elegir = useCallback(
    (t: TrozaDelEscaner) => {
      const fila = filas.find((f) => f.code === t.id);
      if (!fila) return;
      ultimaRef.current = null;
      tomar(fila);
    },
    [filas, tomar],
  );

  const cambiarModo = useCallback((r: boolean) => {
    setRafaga(r);
    setAviso(null);
    ultimaRef.current = null;
  }, []);

  const vaciar = useCallback(() => {
    setLista([]);
    setAviso(null);
    ultimaRef.current = null;
  }, [setLista]);

  return { rafaga, cambiarModo, aviso, actual, lista, procesar, elegir, vaciar };
}
