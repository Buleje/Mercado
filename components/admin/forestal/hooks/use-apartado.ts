"use client";

/**
 * Apartar y liberar madera contra el API del libro, contando lo que de verdad pasó.
 *
 * El API aparta de a UNA fila. Con tres tildadas se hacen tres llamadas y una
 * puede rebotar (otro la apartó primero, la corrida se anuló): el hook devuelve
 * **cuáles** quedaron afuera y por qué, en vez de un «no se pudo» que no dice
 * nada y hace repetir la selección entera.
 *
 * Vive fuera del modal porque la misma operación la va a querer la ficha del
 * paquete y cualquier acción masiva de la tabla — y porque así la cuenta de
 * «entraron 2 de 3» se prueba sin montar un diálogo. El hook NO avisa a la
 * pantalla: devuelve cuántas entraron y el que llama decide qué decir, porque
 * el mensaje («3 paquetes apartados para X») depende de lo que se apartó.
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Una fila del stock: el paquete si lo hay, la corrida entera si no. */
export interface FilaAApartar {
  ctpEntryId: string;
  paqueteId: string | null;
  /** Cómo se la nombra al reportar («PQ-2609-004», «Corrida N° 12»). */
  etiqueta: string;
  volumenM3: number;
  piezas: number | null;
}

/** Lo que se escribe en la reserva. `hasta`/`nota` en `null` = no hay. */
export interface DatosDelApartado {
  para: string;
  hasta: string | null;
  nota: string | null;
}

export interface FallaDeApartado {
  etiqueta: string;
  motivo: string;
}

const nf = (n: number) => n.toLocaleString("es-PE");

/**
 * «3 paquetes», «1 corrida», «2 filas» — el sustantivo sale de lo que hay
 * tildado, y con él su género, para no escribir «1 corrida apartado».
 */
export function contarFilas(filas: readonly FilaAApartar[]): { texto: string; genero: "o" | "a" } {
  const n = filas.length;
  const paquetes = filas.filter((f) => f.paqueteId).length;
  const [palabra, genero] =
    paquetes === n
      ? (["paquete", "o"] as const)
      : paquetes === 0
        ? (["corrida", "a"] as const)
        : (["fila", "a"] as const);
  return { texto: `${nf(n)} ${palabra}${n === 1 ? "" : "s"}`, genero };
}

/** Qué se está apartando, en una línea: «3 paquetes · 12.480 m³ · 240 piezas». */
export function resumirFilas(filas: readonly FilaAApartar[]): string {
  const n = filas.length;
  if (n === 0) return "No hay ninguna fila elegida";
  const conPiezas = filas.filter((f) => f.piezas != null);
  const piezas = conPiezas.reduce((a, f) => a + (f.piezas ?? 0), 0);
  return [
    contarFilas(filas).texto,
    `${fmtM3(filas.reduce((a, f) => a + f.volumenM3, 0))} m³`,
    conPiezas.length ? `${nf(piezas)} pieza${piezas === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const comoTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function pedir(body: Record<string, unknown>): Promise<void> {
  const r = await fetch("/api/admin/forestal/ctp", {
    /* PATCH, como `marcar_usado`: las dos acciones cambian el estado de una
       fila que ya existe en el libro y viven en el mismo handler del route. */
    method: "PATCH",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await leerJson(r)) as { message?: string; error?: string } | null;
  if (!r.ok) throw new Error(data?.message ?? data?.error ?? `El servidor respondió ${r.status}`);
}

export function useApartado() {
  const [enviando, setEnviando] = useState<"apartar" | "liberar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallos, setFallos] = useState<FallaDeApartado[]>([]);

  /** Cuántas filas entraron de verdad. `=== filas.length` es el único «listo». */
  const apartar = useCallback(
    async (filas: readonly FilaAApartar[], datos: DatosDelApartado): Promise<number> => {
      setEnviando("apartar");
      setError(null);
      setFallos([]);
      const rechazadas: FallaDeApartado[] = [];
      let entraron = 0;
      /* De a una y en orden: el servidor bloquea la fila mientras la aparta, y
         dispararlas todas juntas convierte un rechazo legítimo en un choque. */
      for (const f of filas) {
        try {
          await pedir({
            action: "apartar_producto",
            ctpEntryId: f.ctpEntryId,
            paqueteId: f.paqueteId,
            ...datos,
          });
          entraron += 1;
        } catch (e) {
          rechazadas.push({ etiqueta: f.etiqueta, motivo: comoTexto(e) });
        }
      }
      invalidarCtp("/forestal/ctp");
      setEnviando(null);
      if (rechazadas.length === 0) return entraron;
      setFallos(rechazadas);
      setError(
        entraron === 0
          ? `No se apartó ninguna de las ${nf(filas.length)}.`
          : `Se apartaron ${nf(entraron)} de ${nf(filas.length)}; ${nf(rechazadas.length)} ${rechazadas.length === 1 ? "quedó" : "quedaron"} afuera.`,
      );
      return entraron;
    },
    [],
  );

  const liberar = useCallback(
    async (apartadoId: string, motivo: string | null): Promise<boolean> => {
      setEnviando("liberar");
      setError(null);
      try {
        await pedir({ action: "liberar_apartado", apartadoId, motivo });
        invalidarCtp("/forestal/ctp");
        return true;
      } catch (e) {
        setError(`No se pudo liberar: ${comoTexto(e)}`);
        return false;
      } finally {
        setEnviando(null);
      }
    },
    [],
  );

  return { enviando, error, setError, fallos, apartar, liberar };
}
