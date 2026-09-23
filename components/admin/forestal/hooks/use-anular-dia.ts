"use client";

/**
 * use-anular-dia — anular lo declarado en un día de la tira del registro
 * (Brandon, 2026-09-23: *«opción para eliminar esa cubicación de ese día»*).
 *
 * El camino, en el orden en que el operador lo ve:
 *  1. Se pregunta al servidor QUÉ se anularía (`GET …/anular-dia?dia=`): las
 *     corridas vivas del día, con los mismos números del casillero, y cuál de
 *     ellas tiene algo que impide anularla en bloque.
 *  2. Si una lo impide, se dice cuál y por qué y NO se pregunta nada: pedir
 *     confirmación para algo que va a fallar es hacer perder el tiempo.
 *  3. Si no, se confirma con lo que se va (`«6 corridas · 1,276 PT · WASACO»`)
 *     y un motivo, que queda escrito en cada línea anulada.
 *  4. Se anula (`POST`, todo o nada) y quien monta la tira relee.
 */

import { useCallback, useRef, useState } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import {
  corridasBloqueadas,
  MOTIVO_POR_DEFECTO,
  renglonesDeBloqueo,
  resumenParaConfirmar,
  type PreviaAnularDia,
  type RespuestaAnularDia,
} from "@/lib/forestal/anular-dia-produccion";

const API = "/api/admin/forestal/ctp/anular-dia";

/** El mensaje del servidor, o uno que diga qué pasó en palabras del operador. */
function mensajeDe(cuerpo: unknown, estado: number): string {
  const m = (cuerpo as { message?: unknown } | null)?.message;
  if (typeof m === "string" && m.trim()) return m;
  if (estado === 401 || estado === 403)
    return "Sólo el dueño o un administrador puede anular corridas del Libro.";
  return `El servidor respondió ${estado}. Vuelve a intentarlo en un momento.`;
}

async function leerJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

export function useAnularDiaDeProduccion({
  onAnulado,
}: {
  /** Ya se anuló: relee la tira y avisa. `resumen` es lo que se confirmó. */
  onAnulado: (respuesta: RespuestaAnularDia, resumen: string) => void;
}) {
  const { prompt, notice } = useConfirm();
  const [anulando, setAnulando] = useState<string | null>(null);
  /* Un doble clic no abre dos confirmaciones: el estado llega un render tarde. */
  const enCurso = useRef(false);

  const anularDia = useCallback(
    async (dia: string) => {
      if (enCurso.current) return;
      enCurso.current = true;
      setAnulando(dia);
      const etiqueta = etiquetaLarga(dia);
      try {
        const r = await fetch(`${API}?dia=${encodeURIComponent(dia)}`, { credentials: "include" });
        const cuerpo = await leerJson(r);
        if (!r.ok) {
          await notice({
            title: `No se pudo revisar el ${etiqueta}`,
            description: mensajeDe(cuerpo, r.status),
            intent: "danger",
          });
          return;
        }
        const previa = cuerpo as PreviaAnularDia;
        if (previa.corridas.length === 0) {
          await notice({
            title: `El ${etiqueta} ya no tiene corridas`,
            description: "No hay nada que anular: la tira se va a releer.",
            intent: "info",
          });
          onAnulado({ dia, anuladas: [], total: previa.total }, "");
          return;
        }
        if (previa.periodoCerrado) {
          await notice({
            title: `El ${etiqueta} es de un mes cerrado`,
            description: `El período ${previa.periodoCerrado} está cerrado: no se anulan líneas de un mes cerrado. Reábrelo en Cierre para corregir.`,
            intent: "warning",
          });
          return;
        }
        const bloqueadas = corridasBloqueadas(previa);
        if (bloqueadas.length > 0) {
          await notice({
            title: `No se puede anular el ${etiqueta}`,
            description:
              `${bloqueadas.length === 1 ? "Esta corrida tiene" : "Estas corridas tienen"} movimientos que no se deshacen en bloque:\n\n` +
              `${renglonesDeBloqueo(bloqueadas).join("\n")}\n\n` +
              "No se tocó nada. Corrígelas en el Libro y vuelve a intentarlo, o anúlalas ahí de a una con su motivo.",
            intent: "warning",
          });
          return;
        }

        const resumen = resumenParaConfirmar(previa);
        const n = previa.corridas.length;
        const motivo = await prompt({
          title: `¿Anular lo declarado el ${etiqueta}?`,
          description:
            `${resumen}.\n\n` +
            "Las corridas quedan ANULADAS en el Libro con este motivo —no se borran: SERFOR pide la traza— " +
            "y el día queda libre para volver a cubicarlo.",
          label: "Motivo de la anulación",
          defaultValue: MOTIVO_POR_DEFECTO,
          required: true,
          intent: "danger",
          confirmLabel: n === 1 ? "Sí, anular la corrida" : `Sí, anular las ${n} corridas`,
        });
        if (motivo === null) return;

        const w = await fetch(API, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ dia, ids: previa.corridas.map((c) => c.id), motivo }),
        });
        const hecho = await leerJson(w);
        if (w.ok) {
          /* Se escribió el libro: todo lo que las vistas forestales tengan en el
             caché corto de `ctpGet` (8 s) ya miente — la tabla y los KPIs de
             atrás seguían mostrando las corridas como registradas. */
          invalidarCtp("/forestal/");
        } else {
          await notice({
            title: `No se anuló el ${etiqueta}`,
            description: mensajeDe(hecho, w.status),
            intent: "danger",
          });
          return;
        }
        onAnulado(hecho as RespuestaAnularDia, resumen);
      } catch (e) {
        await notice({
          title: `No se pudo anular el ${etiqueta}`,
          description: e instanceof Error ? e.message : String(e),
          intent: "danger",
        });
      } finally {
        enCurso.current = false;
        setAnulando(null);
      }
    },
    [notice, prompt, onAnulado],
  );

  return { anularDia, anulando };
}
