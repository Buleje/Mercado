"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { AsignacionGrupo, BloqueRolliza, ComplementoEnLibro, JornadaEnLibro } from "@/lib/forestal/cubicacion-reparto";
import { sumaDeLineas, type JornadaDelBloque, type PlanCompletar } from "@/lib/forestal/jornadas-de-bloque";
import type { ResultadoJornada } from "@/lib/forestal/registrar-jornadas";
import { codigosExistentes, paquetesDeGrupos, useRegistrarJornadas, type LotesParaJornadas } from "./use-registrar-jornadas";

/**
 * use-libro-de-bloques — la Distribución de rolliza escribe en el Libro
 * (ADR-464, fases 3 y 4).
 *
 * Qué escribir lo decide `jornadas-de-bloque.ts` (puro, con tests); acá sólo
 * se manda y se anota en el bloque lo que quedó escrito. Reusa las puertas de
 * siempre: consumir en el patio (`/lotes-aserrio`, lock por troza, cierre y
 * congelado), declarar y ampliar producción (`/ctp`, tope del 56 %). El
 * servidor es la segunda llave: una troza ya consumida no entra dos veces.
 *
 * Un solo pedido a la vez (`enCurso`, síncrono): el estado de React tarda un
 * render y dos toques rápidos alcanzaban a mandar dos corridas.
 */

export interface AvisoLibro {
  bloqueId: string;
  tono: "ok" | "aviso" | "error";
  texto: string;
}

type Aplicar = (bloqueId: string, cambio: (b: BloqueRolliza) => BloqueRolliza) => void;

const NOTA_MAX = 300;
const recortar = (s: string) => (s.length > NOTA_MAX ? `${s.slice(0, NOTA_MAX - 1)}…` : s);
const texto = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sinRepetir = (lista: readonly string[]) => [...new Set(lista)];

export function useLibroDeBloques(lotes: LotesParaJornadas, aplicar: Aplicar) {
  const { registrar } = useRegistrarJornadas(lotes);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoLibro | null>(null);
  const enCurso = useRef<string | null>(null);
  /* El pedido termina varios segundos después: anota sobre los bloques de ESE
     momento, no sobre los del render en que se tocó el botón. */
  const aplicarRef = useRef(aplicar);
  useEffect(() => {
    aplicarRef.current = aplicar;
  }, [aplicar]);

  const tomar = useCallback((clave: string) => {
    if (enCurso.current) return false;
    enCurso.current = clave;
    setOcupado(clave);
    setAviso(null);
    return true;
  }, []);
  const soltar = useCallback(() => {
    enCurso.current = null;
    setOcupado(null);
  }, []);

  /** Fase 3: una jornada del bloque → una corrida del Libro (línea principal). */
  const registrarJornada = useCallback(
    async (b: BloqueRolliza, j: JornadaDelBloque, totalDias: number): Promise<ResultadoJornada["estado"] | null> => {
      if (j.estado !== "lista" || !b.loteId || !tomar(`${b.id}#${j.dia}`)) return null;
      const nota = `Jornada ${j.dia} de ${totalDias} · bloque ${b.etiqueta || "sin etiqueta"} · distribución de rolliza`;
      try {
        const r = await registrar([j], {
          loteId: b.loteId,
          observaciones: nota,
          notaProduccion: () => nota,
          lineaProduccion: "LP",
          exigirTodas: true,
        });
        const res = r.resultados[0];
        if (res?.corridaId && res.lineNo != null && res.estado !== "no-consumio") {
          const escrito: JornadaEnLibro = {
            dia: j.dia,
            corridaId: res.corridaId,
            lineNo: res.lineNo,
            estado: res.estado === "declarada" ? "declarada" : "abierta",
            fecha: j.fecha,
          };
          aplicarRef.current(b.id, (prev) => ({
            ...prev,
            corridaIds: sinRepetir([...(prev.corridaIds ?? []), escrito.corridaId]),
            jornadasLibro: [...(prev.jornadasLibro ?? []).filter((x) => x.dia !== j.dia), escrito],
          }));
        }
        setAviso({
          bloqueId: b.id,
          tono: res?.estado === "declarada" ? "ok" : res?.estado === "corrida-abierta" ? "aviso" : "error",
          texto:
            res?.estado === "declarada"
              ? `Día ${j.dia} en el Libro: corrida N° ${res.lineNo}.`
              : res?.estado === "corrida-abierta"
                ? `Día ${j.dia}: la corrida N° ${res.lineNo} consumió sus trozas pero la producción no se declaró (${res.detalle ?? "sin detalle"}). Declárala desde la tabla del Libro.`
                : `Día ${j.dia} no se registró: ${res?.detalle ?? r.mensaje}`,
        });
        return res?.estado ?? null;
      } catch (e) {
        setAviso({ bloqueId: b.id, tono: "error", texto: `Día ${j.dia} no se registró: ${texto(e)}` });
        return null;
      } finally {
        soltar();
      }
    },
    [registrar, tomar, soltar],
  );

  const anotarComplemento = useCallback(
    (b: BloqueRolliza, c: ComplementoEnLibro) =>
      aplicarRef.current(b.id, (prev) => ({
        ...prev,
        corridaIds: c.corridaId ? sinRepetir([...(prev.corridaIds ?? []), c.corridaId]) : prev.corridaIds,
        complementos: [...(prev.complementos ?? []), c],
      })),
    [],
  );

  /**
   * Fase 4, LPC. Con rolliza libre: corrida NUEVA del lote (consume esa rolliza
   * y declara en LPC). Sin rolliza: se suma a una corrida del lote con margen
   * (`ampliar_produccion`, ADR-361), que el servidor topea al 56 % acumulado.
   */
  const completarLpc = useCallback(
    async (
      b: BloqueRolliza,
      plan: PlanCompletar,
      elegidas: readonly AsignacionGrupo[],
      destino: { corridaId: string | null; fecha: string },
    ): Promise<boolean> => {
      if (elegidas.length === 0 || !tomar(`${b.id}#completar`)) return false;
      const suma = sumaDeLineas(elegidas);
      const nota = `Complemento (LPC) del bloque ${b.etiqueta || "sin etiqueta"} · distribución de rolliza`;
      const claves = elegidas.map((g) => g.clave);
      try {
        if (plan.trozasLibres.length > 0) {
          const r = await registrar(
            [
              {
                dia: 1,
                fecha: destino.fecha,
                trozaIds: plan.trozasLibres.map((t) => t.id),
                etiquetas: plan.trozasLibres.map((t) => t.etiqueta),
                rollizaM3: plan.rollizaLibreM3,
                grupos: [...elegidas],
                ...suma,
              },
            ],
            { loteId: plan.loteId, observaciones: nota, notaProduccion: () => nota, lineaProduccion: "LPC", exigirTodas: true },
          );
          const res = r.resultados[0];
          if (!res || res.estado === "no-consumio" || !res.corridaId) throw new Error(res?.detalle ?? r.mensaje);
          /* Abierta también se anota: la corrida existe con su materia prima y
             ofrecer esas líneas otra vez llevaría a declararlas dos veces. */
          anotarComplemento(b, { linea: "LPC", corridaId: res.corridaId, lineNo: res.lineNo ?? null, claves, m3: suma.m3, fecha: destino.fecha });
          setAviso({
            bloqueId: b.id,
            tono: res.estado === "declarada" ? "ok" : "aviso",
            texto:
              res.estado === "declarada"
                ? `Complemento en el Libro: corrida N° ${res.lineNo} (LPC) · ${suma.piezas} pzas.`
                : `La corrida N° ${res.lineNo} consumió la rolliza libre pero no se declaró (${res.detalle ?? "sin detalle"}): declárala desde la tabla del Libro.`,
          });
          return true;
        }

        const c = plan.corridas.find((x) => x.id === destino.corridaId);
        if (!c) throw new Error("Elige a qué corrida del lote se suma.");
        const existentes = await codigosExistentes();
        /* La nota va en cada paquete: `observations` de la corrida pisaría la
           que ya tiene (la de su jornada). */
        const paquetes = paquetesDeGrupos(elegidas, destino.fecha, existentes, []).map((p) => ({
          ...p,
          observations: recortar(p.observations ? `${nota} · ${p.observations}` : nota),
        }));
        const resp = await fetch("/api/admin/forestal/ctp", {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ action: "ampliar_produccion", id: c.id, paquetes }),
        });
        if (!resp.ok) {
          const j = (await resp.json().catch(() => ({}))) as { message?: string; error?: string };
          throw new Error(j.message ?? j.error ?? `El servidor respondió ${resp.status}`);
        }
        invalidarCtp("/forestal/");
        await lotes.recargar();
        anotarComplemento(b, { linea: "LPC", corridaId: c.id, lineNo: c.lineNo, claves, m3: suma.m3, fecha: destino.fecha });
        setAviso({ bloqueId: b.id, tono: "ok", texto: `Se sumaron ${suma.piezas} pzas (${suma.m3} m³) a la corrida N° ${c.lineNo}.` });
        return true;
      } catch (e) {
        setAviso({ bloqueId: b.id, tono: "error", texto: `No se completó: ${texto(e)}` });
        return false;
      } finally {
        soltar();
      }
    },
    [registrar, lotes, tomar, soltar, anotarComplemento],
  );

  /** Fase 4, LRE: el reproceso ya se registró con su modal; acá se anota. */
  const anotarLre = useCallback((b: BloqueRolliza, elegidas: readonly AsignacionGrupo[], fecha: string, detalle: string) => {
    anotarComplemento(b, { linea: "LRE", corridaId: null, lineNo: null, claves: elegidas.map((g) => g.clave), m3: sumaDeLineas(elegidas).m3, fecha });
    setAviso({ bloqueId: b.id, tono: "ok", texto: detalle });
    lotes.recargar().catch((err: unknown) => setAviso({ bloqueId: b.id, tono: "aviso", texto: `${detalle} (no se pudo recargar el lote: ${texto(err)})` }));
  }, [lotes, anotarComplemento]);

  return { registrarJornada, completarLpc, anotarLre, ocupado, aviso, cerrarAviso: () => setAviso(null) };
}
