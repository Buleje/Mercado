"use client";

/**
 * Los modales de la vista Lotes (ADR-334), en un archivo aparte.
 *
 * Salieron de `CtpLotesView` (27-09) sin cambiar su comportamiento: la vista
 * pasaba de 800 líneas y la mitad era esto. Quién abre cada uno vive en
 * `useLotesModales`; lo que sólo pasa ADENTRO de los modales —el paso 2 del
 * inventario, la guía que abren «Productos» y «Despachar desde lotes»— es
 * estado local de acá.
 */

import { useState } from "react";
import type { EstadoLotesAserrio } from "./hooks/use-lotes-aserrio";
import type { LotesModales } from "./hooks/use-lotes-modales";
import type { LoteAProducir } from "./CtpLotesView";
import CtpLoteArmarModal, { type MaterialDeInventario } from "./CtpLoteArmarModal";
import CtpArmarLoteEscaneoModal from "./CtpArmarLoteEscaneoModal";
import CtpLoteDetalleModal from "./CtpLoteDetalleModal";
import CtpLoteProductosModal from "./CtpLoteProductosModal";
import CtpDespacharDesdeLotesModal from "./CtpDespacharDesdeLotesModal";
import CtpDespachoGuiaModal from "./CtpDespachoGuiaModal";
import CtpImportarProgramacionesModal from "./CtpImportarProgramacionesModal";
import CtpCuadreSniffsModal from "./CtpCuadreSniffsModal";
import CtpDeclararDesdeSniffs from "./CtpDeclararDesdeSniffs";
import CtpLotesInventarioPaso2 from "./CtpLotesInventarioPaso2";

export type AvisoLotes = { tono: "ok" | "aviso"; texto: string };

export default function CtpLotesModales({
  m,
  estado,
  ahora,
  onProducir,
  onCargar,
  setAviso,
}: {
  m: LotesModales;
  estado: EstadoLotesAserrio;
  ahora: Date;
  onProducir: (lote: LoteAProducir) => void;
  onCargar: (lote: LoteAProducir) => void;
  setAviso: (a: AvisoLotes) => void;
}) {
  const {
    lotes,
    trozas,
    cargando,
    error,
    recargar,
    crearConTrozas,
    agregarTrozas,
    crearInventario,
    quitarTroza,
    editarLote,
    deshacer,
    deshacerForzado,
  } = estado;
  /* Los `uid`s que van a la guía viven en `m`: también la abre la barra de lotes elegidos. */
  const { uidsParaGuia, setUidsParaGuia } = m;

  /**
   * El material del modo INVENTARIO, entre el paso 1 (especie + volumen
   * consumido) y el paso 2 (los paquetes que produjo). El lote y la corrida
   * nacen juntos recién al confirmar el paso 2 — nada se crea a medias.
   */
  const [materialInventario, setMaterialInventario] = useState<MaterialDeInventario | null>(null);

  const detalle = m.detalleId ? (lotes.find((l) => l.id === m.detalleId) ?? null) : null;
  const resolviendo = m.resolviendoId ? (lotes.find((l) => l.id === m.resolviendoId) ?? null) : null;



  return (
    <>
      {/* La mesa de lo que no cuadra, y el formulario que lo resuelve. */}
      {m.verCuadre && (
        <CtpCuadreSniffsModal
          lotes={lotes}
          onResolver={(l) => {
            m.setVerCuadre(false);
            m.setResolviendoId(l.id);
          }}
          onVer={(l) => {
            m.setVerCuadre(false);
            m.setDetalleId(l.id);
          }}
          onClose={() => m.setVerCuadre(false)}
        />
      )}

      {resolviendo && (
        <CtpDeclararDesdeSniffs
          lote={resolviendo}
          trozas={trozas}
          onListo={(texto) => {
            setAviso({ tono: "ok", texto });
            void recargar();
          }}
          onError={(texto) => setAviso({ tono: "aviso", texto })}
          onClose={() => m.setResolviendoId(null)}
          onCambioEnElLibro={() => void recargar()}
        />
      )}

      {/* Importar la lista de programaciones (ADR-398): cada fila nace como un
          lote con su consumo declarado y la producción pendiente. */}
      {m.importar && (
        <CtpImportarProgramacionesModal
          lotes={lotes}
          crearProgramacion={async (input) => {
            const r = await crearInventario({
              code: input.code,
              speciesCommon: input.speciesCommon,
              speciesScientific: input.speciesScientific,
              volumenConsumidoM3: input.volumenConsumidoM3,
              fecha: input.fecha,
              finProceso: input.finProceso,
              notes: input.leida.estado ? `SNIFFS: ${input.leida.estado}` : null,
              /* Vacío = programación: el consumo entra al libro y la producción
                 queda pendiente, que es lo que la lista del SNIFFS afirma. */
              paquetes: [],
              sniffs: {
                lote: input.leida.lote,
                fechaInicio: input.leida.fechaInicio,
                fechaFin: input.leida.fechaFin,
                especieCientifica: input.leida.especieCientifica,
                especieComun: input.leida.especieComun,
                volumenConsumidoM3: input.volumenConsumidoM3,
                productos: [],
                leidoEn: new Date().toISOString(),
                fuente: "lista",
              },
            });
            return { code: r.lote.code, lineNo: r.corrida.lineNo };
          }}
          onListo={({ creados, fallados }) =>
            setAviso({
              tono: fallados.length > 0 ? "aviso" : "ok",
              texto:
                `Entraron ${creados.length} lote${creados.length === 1 ? "" : "s"} del SNIFFS con su consumo declarado ` +
                `(${creados.map((c) => c.code).join(", ")}). La producción de cada uno se declara desde la tabla de Producción.` +
                (fallados.length > 0 ? ` ${fallados.length} no se pudieron importar.` : ""),
            })
          }
          onClose={() => m.setImportar(false)}
        />
      )}

      {m.escaneando && (
        <CtpArmarLoteEscaneoModal
          estado={{ lotes, trozas, cargando, error, crearConTrozas, agregarTrozas, deshacer }}
          onClose={() => m.setEscaneando(false)}
          onProducir={(l) => {
            m.setEscaneando(false);
            onProducir(l);
          }}
          onCargar={(l) => {
            m.setEscaneando(false);
            onCargar(l);
          }}
        />
      )}

      {m.armar && (
        <CtpLoteArmarModal
          trozas={trozas}
          crear={async (input) => {
            const r = await crearConTrozas({ ...input, trozaIds: [] });
            return { code: r.code };
          }}
          onIniciarInventario={(material) => {
            setMaterialInventario(material);
            m.setArmar(false);
          }}
          onListo={(texto, tono) => setAviso({ texto, tono })}
          onClose={() => m.setArmar(false)}
        />
      )}

      {/* Paso 2 del modo inventario: los paquetes que produjo esta madera,
          con el MISMO formulario que declara producción desde un lote real —
          el tope del 56 % y el rendimiento se ven igual, no hay una segunda
          versión de esta pantalla. */}
      {materialInventario && (
        <CtpLotesInventarioPaso2
          material={materialInventario}
          crearInventario={crearInventario}
          setAviso={setAviso}
          onCerrar={() => setMaterialInventario(null)}
          onCambioEnElLibro={() => void recargar()}
        />
      )}

      {detalle && (
        <CtpLoteDetalleModal
          lote={detalle}
          ahora={ahora}
          onQuitar={(trozaId) => quitarTroza(detalle.id, trozaId)}
          onEditar={(cambios) => editarLote(detalle.id, cambios)}
          onDeshacer={async () => {
            await deshacer(detalle.id);
            setAviso({
              tono: "ok",
              texto: `Lote ${detalle.code} deshecho: sus piezas volvieron al patio.`,
            });
            m.setDetalleId(null);
          }}
          onDeshacerForzado={async (motivo, forzar) => {
            const r = await deshacerForzado(detalle.id, motivo, forzar);
            setAviso({
              tono: "ok",
              texto: `Lote ${r.code} eliminado${r.corridaAnulada ? " y su corrida anulada" : ""}: sus piezas volvieron al patio.`,
            });
            m.setDetalleId(null);
          }}
          onProducir={() => {
            m.setDetalleId(null);
            onProducir({ id: detalle.id, code: detalle.code });
          }}
          onRecargar={recargar}
          onClose={() => m.setDetalleId(null)}
        />
      )}

      {/* Qué salió de un lote: lo que queda en patio, lo despachado y lo de uso propio. */}
      {m.productosDe && (
        <CtpLoteProductosModal
          lote={m.productosDe}
          onClose={() => m.setProductosDe(null)}
          onDespachar={(uids) => {
            m.setProductosDe(null);
            setUidsParaGuia(uids);
          }}
        />
      )}

      {/* Elegir lotes → elegir su madera → la guía, sin salir de la pantalla. */}
      {m.despachando && (
        <CtpDespacharDesdeLotesModal
          onClose={() => m.setDespachando(false)}
          onDespachar={(uids) => {
            m.setDespachando(false);
            setUidsParaGuia(uids);
          }}
        />
      )}

      {/* La MISMA guía que emite «Productos disponibles»: lo elegido entra por
          `presetUids`, así que no hay una segunda forma de declarar una salida. */}
      {uidsParaGuia && (
        <CtpDespachoGuiaModal
          presetUids={uidsParaGuia}
          onClose={() => setUidsParaGuia(null)}
          onSaved={(r) => {
            setUidsParaGuia(null);
            setAviso({
              tono: "ok",
              texto: `Guía emitida con ${r.lineas} línea${r.lineas === 1 ? "" : "s"}${r.offline ? " (queda en cola: se envía al volver la señal)" : ""}.`,
            });
            void recargar();
          }}
        />
      )}
    </>
  );
}

