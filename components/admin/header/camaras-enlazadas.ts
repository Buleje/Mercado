/**
 * «Ver todas en vivo» desde la cabecera: de las dos respuestas que ya pide la
 * pantalla de Cámaras (la lista y el estado de Hik-Connect), las cámaras que
 * el mosaico puede mostrar — las ENLAZADAS, en el orden de la lista, como el
 * botón de la pantalla (`MosaicoNubeBoton`). Puro: lo prueba
 * `__tests__/camaras-cabecera-enlazadas.test.ts`.
 */
import { z } from "zod";

const LISTA = z.object({
  camaras: z
    .array(z.object({ id: z.string(), nombre: z.string(), zonasIgnorar: z.unknown().optional() }))
    .catch([]),
});

const HIK = z.object({
  vinculado: z.boolean(),
  enlaces: z.record(z.string(), z.object({ conCodigo: z.boolean().catch(false) }).catch({ conCodigo: false })),
});

export interface CamaraParaMosaico {
  id: string;
  nombre: string;
  conCodigo: boolean;
}

export interface CamarasEnlazadas {
  /** Lo que se le pasa al mosaico. */
  mosaico: CamaraParaMosaico[];
  /** Las cámaras crudas (con sus zonas a ignorar), para el detector. */
  crudas: { id: string; zonasIgnorar?: unknown }[];
  /** La cuenta de Hik-Connect está vinculada (sin eso no hay nada que enlazar). */
  vinculado: boolean;
}

export function camarasEnlazadas(lista: unknown, hik: unknown): CamarasEnlazadas {
  const l = LISTA.safeParse(lista);
  const h = HIK.safeParse(hik);
  const camaras = l.success ? l.data.camaras : [];
  if (!h.success || !h.data.vinculado) return { mosaico: [], crudas: camaras, vinculado: false };
  const { enlaces } = h.data;
  const mosaico = camaras
    .filter((c) => enlaces[c.id] !== undefined)
    .map((c) => ({ id: c.id, nombre: c.nombre, conCodigo: enlaces[c.id]?.conCodigo ?? false }));
  return { mosaico, crudas: camaras, vinculado: true };
}
