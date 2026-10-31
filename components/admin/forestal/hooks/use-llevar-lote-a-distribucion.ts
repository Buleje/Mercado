"use client";

import { useCallback, useState } from "react";
import { abrirResumenesDelCubicador, sembrarBloques } from "@/lib/forestal/sembrar-reparto";
import { recordarVistaModulo } from "@/hooks/use-vista-modulo";
import type { BloqueParaDistribucion } from "@/lib/forestal/bloque-de-lote-consumido";
import {
  abrirDeFrente,
  type ResultadoLoteADistribucion,
  type ResumenDeReparto,
} from "@/lib/forestal/lotes-a-distribucion";
import type { SeccionRolliza } from "../reparto-pestanas";

/** La sección de la hoja de rolliza donde se ve cada lote en su fila, con su guía. */
const LO_QUE_ENTRO: SeccionRolliza = "entrada";

/**
 * Abre los Resúmenes del cubicador en «Lo que entró»: el lote recién llevado
 * se ve en su fila, con su guía en la observación (28-10). La clave es la de
 * `useSubvistaModulo("forestal-reparto-rolliza", …)` en `reparto-pestanas`.
 */
export function abrirEnLoQueEntro(): void {
  recordarVistaModulo("forestal-reparto-rolliza", LO_QUE_ENTRO);
  abrirResumenesDelCubicador();
}

/**
 * Lleva un lote YA consumido a la Distribución de rolliza (ADR-521): pide al
 * servidor el bloque que adopta su corrida abierta, lo siembra en la hoja de
 * rolliza y abre los Resúmenes del cubicador. Ahí se reparte lo aserrado y el
 * Recorrido del permiso declara la corrida.
 *
 * Si el lote ya estaba en la hoja no se duplica (`sembrarBloques` lo da por
 * repetido) y se abre igual: la misma madera dos veces sería un error en la
 * hoja que se firma.
 *
 * `llevarVarios` (28-10): varios lotes de una vez, un bloque por lote en una
 * sola consulta. Los que el servidor no arma no frenan a los otros; si entró
 * todo, abre los Resúmenes; si no, devuelve el resumen para que la pantalla
 * diga qué quedó afuera antes de ir.
 */
type Respuesta = Extract<BloqueParaDistribucion, { ok: true }>;

export function useLlevarLoteADistribucion(): {
  llevar: (loteId: string) => Promise<void>;
  llevarVarios: (
    lotes: readonly { id: string; code: string }[],
    saltados?: ResumenDeReparto["saltados"],
  ) => Promise<ResumenDeReparto | null>;
  llevando: boolean;
  error: string | null;
} {
  const [llevando, setLlevando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const llevar = useCallback(async (loteId: string) => {
    setLlevando(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/forestal/lotes-aserrio/bloque-para-distribucion?loteId=${encodeURIComponent(loteId)}`,
        { credentials: "include" },
      );
      const json = (await r.json().catch((err: unknown) => ({ message: String(err) }))) as
        | Partial<Respuesta>
        | { message?: string };
      if (!r.ok || !("bloque" in json) || !json.bloque) {
        const msg = "message" in json && json.message ? json.message : null;
        setError(msg ?? `No se pudo llevar el lote a la Distribución (HTTP ${r.status}).`);
        return;
      }
      const siembra = sembrarBloques([json.bloque], "lote-consumido");
      if (siembra.sinTenant) {
        setError("No se detecta la operación activa: recarga el panel y vuelve a intentar. No se llevó nada.");
        return;
      }
      /* El bloque del lote ya estaba en la hoja, quizá de ANTES de consumirlo
         (sin su corrida): ese bloque no la adopta y el plan la ve como ajena.
         Se dice en vez de abrir como si nada (revisión 27-10). */
      if (siembra.sembrados === 0 && siembra.repetidos > 0) {
        setError(
          "Este lote ya estaba en la Distribución. Si lo pusiste antes de consumirlo, quítalo de la hoja y vuelve a llevarlo para que tome su corrida.",
        );
        return;
      }
      abrirEnLoQueEntro();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sin conexión: vuelve a intentarlo.");
    } finally {
      setLlevando(false);
    }
  }, []);

  const llevarVarios = useCallback(
    async (lotes: readonly { id: string; code: string }[], saltados: ResumenDeReparto["saltados"] = []) => {
      if (lotes.length === 0) return null;
      setLlevando(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/admin/forestal/lotes-aserrio/bloque-para-distribucion?loteIds=${lotes.map((l) => encodeURIComponent(l.id)).join(",")}`,
          { credentials: "include" },
        );
        const json = (await r.json().catch((err: unknown) => ({ message: String(err) }))) as {
          resultados?: ResultadoLoteADistribucion[];
          message?: string;
        };
        if (!r.ok || !Array.isArray(json.resultados)) {
          setError(json.message ?? `No se pudieron llevar los lotes a la Distribución (HTTP ${r.status}).`);
          return null;
        }
        const codigo = new Map(lotes.map((l) => [l.id, l.code]));
        const resumen: ResumenDeReparto = { entraron: [], repetidos: [], fallaron: [], saltados };
        /* Uno por uno sobre la misma hoja: así se sabe cuál ya estaba (la
           siembra junta sólo devuelve la cuenta) y cada uno ve lo que puso el
           anterior. Mismo resultado que sembrarlos de un saque. El prefijo
           lleva la vuelta: el id es `prefijo-milisegundo-n` y dos siembras en
           el mismo milisegundo daban el MISMO id a dos lotes (medido 28-10:
           React avisó la key repetida; editar o quitar uno tocaba los dos). */
        for (const [vuelta, x] of json.resultados.entries()) {
          const nombre = x.lote ?? codigo.get(x.loteId) ?? "Un lote";
          if (!x.ok) {
            resumen.fallaron.push({ lote: nombre, message: x.message });
            continue;
          }
          const siembra = sembrarBloques([x.bloque], `lote-consumido-${vuelta}`);
          if (siembra.sinTenant) {
            setError("No se detecta la operación activa: recarga el panel y vuelve a intentar. No se llevó nada.");
            return null;
          }
          /* `conEspecie`: completó el mismo bloque cargado antes sin especie. */
          if (siembra.sembrados > 0 || (siembra.conEspecie ?? 0) > 0) resumen.entraron.push(nombre);
          else if (siembra.repetidos > 0) resumen.repetidos.push(nombre);
          else resumen.fallaron.push({ lote: nombre, message: "no se pudo escribir en la hoja de este navegador (modo privado o sin espacio)." });
        }
        if (abrirDeFrente(resumen)) abrirEnLoQueEntro();
        return resumen;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sin conexión: vuelve a intentarlo.");
        return null;
      } finally {
        setLlevando(false);
      }
    },
    [],
  );

  return { llevar, llevarVarios, llevando, error };
}
