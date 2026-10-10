"use client";

/**
 * useNumeroGuiaLoth — el N° de GTF del despacho con guía del Libro TH
 * (Brandon 29-09-2026: «N° de GTF correlativo por región»).
 *
 * Con la serie de la región conocida (`019-001`, `talonarioDelPlan`), se
 * escribe sólo el correlativo impreso en el talonario: «65» queda
 * `019-001-0000065` (`leerGtfConfirmada`, 7 dígitos). «Otra serie» deja
 * escribir el N° entero, y pegar un N° entero de otra serie pasa solo a ese
 * modo. El N° que vale —el que se registra y se imprime— es `gtfNumber`.
 */

import { useCallback, useMemo, useState } from "react";
import { correlativoEnSerie, leerGtfConfirmada } from "@/lib/forestal/gtf-talonario";
import { revisarNumeroLoth, type DuenoDelTalonario, type TalonarioDelPlan } from "@/lib/forestal/loth-guia-despacho";

const ultimoTramo = (n: string): string => n.trim().split(/\s*-\s*/).pop() ?? "";

export function useNumeroGuiaLoth(talonario: TalonarioDelPlan | null, dueno: DuenoDelTalonario | null) {
  const [texto, setTexto] = useState("");
  const [otraSerie, setOtraSerie] = useState(false);
  const serie = talonario?.serie ?? null;
  const digitos = talonario?.digitos ?? 7;
  const libre = !serie || otraSerie;

  const gtfNumber = useMemo(() => {
    const t = texto.trim();
    if (libre || !serie || !t) return t;
    const r = leerGtfConfirmada(t, serie, digitos);
    return r.ok ? r.gtf : "";
  }, [texto, libre, serie, digitos]);

  /** Lo que se tipea en el campo. */
  const escribir = useCallback(
    (v: string) => {
      if (!libre && serie && v.includes("-")) {
        // Pegó el N° entero: de la serie, queda el correlativo; de otra, pasa a «otra serie».
        if (correlativoEnSerie(v, serie)) {
          setTexto(ultimoTramo(v));
          return;
        }
        setOtraSerie(true);
      }
      setTexto(v);
    },
    [libre, serie],
  );

  /** «Otra serie» ↔ «La serie de la región». El N° escrito se conserva si cabe. */
  const cambiarSerie = useCallback(
    (otra: boolean) => {
      setOtraSerie(otra);
      if (otra) setTexto(gtfNumber || texto);
      else setTexto(serie && correlativoEnSerie(texto, serie) ? ultimoTramo(texto) : /^\d+$/.test(texto.trim()) ? texto.trim() : "");
    },
    [gtfNumber, texto, serie],
  );

  /** Un N° entero que viene de afuera («Usar el que sigue»). */
  const usarNumero = useCallback(
    (n: string) => {
      if (serie && correlativoEnSerie(n, serie)) {
        setOtraSerie(false);
        setTexto(ultimoTramo(n));
      } else {
        setOtraSerie(true);
        setTexto(n);
      }
    },
    [serie],
  );

  /**
   * Al abrir y al cambiar de plan: el que sigue en SU talonario. Se pisa lo
   * escrito a propósito: otro plan es otro titular (u otra región), y un N°
   * tipeado para el talonario de uno no es del otro.
   */
  const sembrar = useCallback((t: TalonarioDelPlan) => {
    const p = t.propuesta;
    setOtraSerie(false);
    setTexto(p ? (t.serie ? ultimoTramo(p.gtf) : p.gtf) : "");
  }, []);

  const revision = useMemo(
    () => (talonario && gtfNumber ? revisarNumeroLoth(gtfNumber, talonario, dueno ?? undefined) : null),
    [talonario, gtfNumber, dueno],
  );

  return {
    /** Lo que muestra el campo: el correlativo (con serie) o el N° entero. */
    texto,
    escribir,
    /** Se escribe el N° entero (no hay serie, o se eligió otra). */
    libre,
    serie,
    cambiarSerie,
    usarNumero,
    sembrar,
    gtfNumber,
    /** Hay algo escrito que no es un correlativo válido. */
    invalido: texto.trim() !== "" && gtfNumber === "",
    revision,
  };
}

export type NumeroGuiaLoth = ReturnType<typeof useNumeroGuiaLoth>;
