"use client";

/**
 * Punto de partida y de llegada de la guía de SALIDA de la planta (Libro CTP),
 * cada uno por partes: dirección + departamento + provincia + distrito
 * (Brandon 29-09-2026, igual que la guía del bosque del Libro TH).
 *
 *   · Partida: la dirección de la planta y su ubigeo, de la Ficha del CTP. Sin
 *     ubigeo en la Ficha, los casilleros quedan vacíos y se dice cuáles faltan:
 *     no se adivina.
 *   · Llegada: la dirección y el ubigeo del destinatario, con «Usar la del
 *     destinatario» para volver a ella.
 *
 * Registrar el despacho admite huecos; imprimir el original no (`faltantesGtf`).
 */

import type { Dispatch, SetStateAction } from "react";
import type { FichaCtp } from "@/hooks/use-ficha-ctp";
import { componerPunto, llegadaDelDestinatario, mismaUbicacion, ubicacionDelPunto, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { useTrasladoGuiaCtp } from "./hooks/use-traslado-guia-ctp";
import PuntoTraslado from "./PuntoTraslado";
import { Btn } from "./ctp-shared";

export default function CtpTrasladoPuntos({
  datos,
  setDatos,
  ficha,
  className,
}: {
  datos: GtfDatos;
  setDatos: Dispatch<SetStateAction<GtfDatos>>;
  ficha: FichaCtp | null;
  /** Cuánto ocupa cada punto en la grilla del bloque. */
  className?: string;
}) {
  const t = useTrasladoGuiaCtp({ datos, setDatos, ficha });
  const partida = ubicacionDelPunto(datos.traslado, "partida");
  const llegada = ubicacionDelPunto(datos.traslado, "llegada");
  const destino = llegadaDelDestinatario(datos);
  const hayPlanta = Boolean(componerPunto(t.planta));
  return (
    <>
      <PuntoTraslado
        titulo="Punto de partida"
        requerido
        ayuda="La planta: su dirección y su departamento, provincia y distrito salen de la Ficha del CTP. Así lo publica SERFOR: dirección, distrito, provincia, departamento."
        valor={partida}
        onChange={(v) => t.setPunto("partida", v)}
        dondeSeCarga="en la Ficha del CTP"
        className={className}
        acciones={
          hayPlanta && !mismaUbicacion(t.planta, partida) ? (
            <Btn size="sm" variant="ghost" onClick={t.usarPartidaDeLaFicha}>
              Usar la de la Ficha
            </Btn>
          ) : null
        }
      />
      <PuntoTraslado
        titulo="Punto de llegada"
        requerido
        ayuda="Sale de la dirección y el ubigeo del destinatario, y lo sigue mientras no lo cambies a mano."
        valor={llegada}
        onChange={(v) => t.setPunto("llegada", v)}
        className={className}
        acciones={
          componerPunto(destino) && !mismaUbicacion(destino, llegada) ? (
            <Btn size="sm" variant="ghost" onClick={t.usarLlegadaDelDestinatario}>
              Usar la del destinatario
            </Btn>
          ) : null
        }
      />
    </>
  );
}
