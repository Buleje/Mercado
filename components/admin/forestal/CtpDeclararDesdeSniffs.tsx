"use client";

/**
 * Declarar la producción de un lote que YA existe, con lo que dice el SNIFFS
 * (ADR-398).
 *
 * Cierra el ciclo de las programaciones: la lista las trae con el consumo
 * declarado y la producción pendiente, y acá se completa —pegando el detalle
 * del lote, o directamente con los productos que ese lote ya tenía guardados si
 * entró por una captura.
 *
 * No es una segunda forma de declarar: abre el MISMO formulario de producción
 * que el resto del libro, con su tope del 56 %, su rendimiento y sus códigos de
 * paquete. Lo único que agrega es de dónde vienen las filas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  type CorridaDelLote,
  type LoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import { origenesDeTrozas, RENDIMIENTO_TOPE_PCT } from "@/lib/forestal/produccion-paquetes";
import { sniffsRefDesdeDetalle, type DetalleProduccionSniffs } from "@/lib/forestal/sniffs-produccion-parse";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { PaquetePrevio } from "./CtpMaterialPanel";
import CtpRegistrarProduccionModal, { type ProduccionRegistrada } from "./CtpRegistrarProduccionModal";
import {
  guardarProduccionDeCorrida,
  paquetesYaDeclarados,
  type ModoDeclaracion,
} from "./hooks/guardar-produccion-corrida";

/** El día de la corrida en `AAAA-MM-DD`, que es lo que el modal muestra. */
const diaIso = (iso: string | null | undefined) => (iso ?? new Date().toISOString()).slice(0, 10);

/**
 * La corrida viva del lote que todavía puede recibir producción.
 *
 * La que declaró de menos y la que no declaró nada son el mismo trabajo para el
 * operador —«falta cargar lo que salió»— y dos acciones distintas del libro; la
 * diferencia la resuelve `modo`, no dos pantallas.
 */
export function corridaAcompletar(lote: LoteAserrio): CorridaDelLote | null {
  const vivas = (lote.corridas && lote.corridas.length > 0
    ? lote.corridas
    : lote.produccion
      ? [lote.produccion]
      : []
  ).filter((c) => c.viva && (c.unit ?? "m3") === "m3" && Number(c.volumeInputM3 ?? 0) > 0);
  /* Primero la que no declaró nada: es la deuda más grande del libro. */
  return vivas.find((c) => c.quantity == null) ?? vivas.find((c) => Number(c.quantity) > 0) ?? null;
}

/**
 * Lo que el lote ya tiene guardado del SNIFFS, con la forma que el formulario
 * espera. Sin productos devuelve `null`: no hay nada que precargar.
 */
export function detalleGuardado(lote: LoteAserrio): DetalleProduccionSniffs | null {
  const s = lote.sniffs;
  if (!s || !s.productos || s.productos.length === 0) return null;
  return {
    lote: s.lote,
    fechaInicio: s.fechaInicio,
    fechaFin: s.fechaFin,
    especieComun: s.especieComun,
    especieCientifica: s.especieCientifica,
    volumenConsumidoM3: s.volumenConsumidoM3,
    productos: s.productos.map((p) => ({
      productoCrudo: p.productoCrudo,
      productType: p.productType,
      volumenM3: p.volumenM3,
      pctAprovechado: p.pctAprovechado,
      especie: s.especieComun,
      dudoso: false,
      volumenLeido: String(p.volumenM3),
    })),
    avisos: [],
  };
}

export default function CtpDeclararDesdeSniffs({
  lote,
  trozas,
  onListo,
  onError,
  onClose,
}: {
  lote: LoteAserrio;
  /** El patio: sólo alimenta el reparto entre títulos habilitantes. */
  trozas: readonly TrozaConsumible[];
  onListo: (mensaje: string) => void;
  onError: (mensaje: string) => void;
  onClose: () => void;
}) {
  const corrida = useMemo(() => corridaAcompletar(lote), [lote]);
  const modo: ModoDeclaracion = corrida?.quantity == null ? "declarar" : "ampliar";
  const yaDeclarado = Number(corrida?.quantity ?? 0);
  const entrada = Number(corrida?.volumeInputM3 ?? 0);

  const [paquetesPrevios, setPaquetesPrevios] = useState<PaquetePrevio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Lo pegado en ESTA vuelta: reemplaza la foto guardada si el guardado sale bien. */
  const [detalleNuevo, setDetalleNuevo] = useState<DetalleProduccionSniffs | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!corrida) {
      setCargando(false);
      return;
    }
    paquetesYaDeclarados(corrida.id)
      .then((p) => { if (vivo) setPaquetesPrevios(p as PaquetePrevio[]); })
      .catch((e: unknown) => {
        /* Sin los códigos se declara igual —el servidor sigue validando—, pero
           se dice: el sugerido no está cruzado contra los que ya están. */
        if (vivo) {
          setError(
            `No se pudieron leer los paquetes ya declarados (${e instanceof Error ? e.message : String(e)}): ` +
              "revisá que el código que uses no esté repetido.",
          );
        }
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [corrida]);

  const piezas = useMemo(
    () => (corrida ? trozas.filter((t) => t.consumidaEnId === corrida.id) : []),
    [trozas, corrida],
  );

  const guardar = useCallback(
    async (datos: ProduccionRegistrada) => {
      if (!corrida) return;
      setGuardando(true);
      setError(null);
      try {
        await guardarProduccionDeCorrida(corrida.id, modo, datos);
        /* La foto del SNIFFS se guarda DESPUÉS del asiento y sin poder
           romperlo: si falla, la producción ya quedó declarada y lo único que
           se pierde es el cotejo, que se puede volver a pegar. */
        if (detalleNuevo) {
          try {
            const { csrfHeaders } = await import("@/lib/csrf-client");
            await fetch("/api/admin/forestal/lotes-aserrio", {
              method: "PATCH",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              credentials: "include",
              body: JSON.stringify({
                accion: "sniffs",
                loteId: lote.id,
                sniffs: sniffsRefDesdeDetalle(detalleNuevo, "captura"),
              }),
            });
          } catch {
            /* El cuadre se vuelve a pegar; el asiento ya está. */
          }
        }
        const total = Math.round((yaDeclarado + datos.volumen) * 10_000) / 10_000;
        const rend = entrada > 0 ? ` · rendimiento ${Math.round((total / entrada) * 1000) / 10} %` : "";
        onListo(
          `Lote ${lote.code}: la corrida N° ${corrida.lineNo} declara ${fmtM3(total)} m³ en ` +
            `${datos.paquetes.length} paquete(s)${rend}. Ya se puede despachar de esta corrida.`,
        );
        onClose();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        onError(msg);
      } finally {
        setGuardando(false);
      }
    },
    [corrida, modo, detalleNuevo, lote.id, lote.code, yaDeclarado, entrada, onListo, onError, onClose],
  );

  if (!corrida) return null;
  if (cargando) return null;

  return (
    <CtpRegistrarProduccionModal
      lote={lote}
      material={{
        especie: corrida.speciesCommon?.trim() || lote.speciesCommon,
        especieCientifica: lote.speciesScientific,
        piezas: piezas.length,
        volumenM3: entrada,
        permisos: [...new Set(piezas.map((t) => (t.permiso ?? "").trim()).filter(Boolean))],
        origenes: origenesDeTrozas(piezas),
      }}
      trozas={piezas}
      fecha={diaIso(corrida.entryDate)}
      guardando={guardando}
      error={error}
      yaDeclaradoM3={yaDeclarado}
      paquetesPrevios={paquetesPrevios}
      titulo={`Declarar la producción del lote ${lote.code}`}
      descripcion={
        modo === "declarar"
          ? `Corrida N° ${corrida.lineNo} · ${fmtM3(entrada)} m³ consumidos, producción todavía sin declarar` +
            (lote.sniffs?.lote ? ` · SNIFFS N° ${lote.sniffs.lote}` : "")
          : `Corrida N° ${corrida.lineNo} · ya declaró ${fmtM3(yaDeclarado)} m³ y admite más hasta el tope del ${RENDIMIENTO_TOPE_PCT} %`
      }
      ctaLabel={modo === "declarar" ? "Declarar la producción" : "Agregar a la corrida"}
      /* Si el lote ya trae los productos del SNIFFS, aparecen listos para
         revisar: no hace falta volver a pegar la misma captura. */
      sniffsInicial={detalleGuardado(lote)}
      onSniffsLeido={setDetalleNuevo}
      onConfirmar={(datos) => void guardar(datos)}
      onClose={onClose}
    />
  );
}
