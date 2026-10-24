"use client";

/**
 * Qué se puede HACER con la madera de «Productos disponibles» (ADR-367/418):
 * los modales que abre cada acción y la barra de lo tildado. Salió del
 * componente de 2 187 líneas (27-09); la lógica de cada acción es la de
 * siempre, nada se sacó:
 *
 *  ficha del paquete · editar la fila · cubicar (ANEXO N° 04) · cubicar lo
 *  tildado · apartar (una fila o lo tildado) · reprocesar · marcar como usado /
 *  desmarcar · cargar escuadría · despachar con guía lo tildado.
 */

import { useMemo } from "react";
import { BookmarkPlus, Ruler, Truck } from "@buleje/design-system/icons";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import type { FilaDeclarada } from "@/lib/forestal/cubicacion-cuadre";
import { ptDe } from "@/lib/forestal/productos-disponibles-resumen";
import CtpApartarModal from "./CtpApartarModal";
import CtpBarraSeleccion from "./ctp-barra-seleccion";
import CtpCubicarProductoModal from "./CtpCubicarProductoModal";
import CtpDespachoGuiaModal from "./CtpDespachoGuiaModal";
import CtpEditarLineaModal from "./CtpEditarLineaModal";
import CtpEscuadriaPaqueteModal from "./CtpEscuadriaPaqueteModal";
import CtpMarcarUsadoModal from "./CtpMarcarUsadoModal";
import CtpPaqueteFicha from "./CtpPaqueteFicha";
import CtpReprocesoModal from "./CtpReprocesoModal";
import { etiquetaDe, type AccionesProductos } from "./hooks/use-acciones-productos";
import type { EstadoProductosDisponibles } from "./hooks/use-productos-disponibles";

export type { AccionesProductos } from "./hooks/use-acciones-productos";

/** Los modales de la pestaña y la barra de lo tildado. Sólo se monta lo abierto. */
export function ModalesProductos({ e, a }: { e: EstadoProductosDisponibles; a: AccionesProductos }) {
  const tildadas = useMemo(() => e.filas.filter((f) => a.seleccion.has(f.clave)), [e.filas, a.seleccion]);
  const elegidas = useMemo<FilaDeclarada[]>(
    () =>
      tildadas.map((f) => ({
        id: f.clave,
        etiqueta: etiquetaDe(f),
        especie: f.corrida.especie,
        producto: f.paquete?.producto ?? f.corrida.producto,
        piezas: f.paquete?.cantidad ?? null,
        volumenM3: f.volumenM3,
      })),
    [tildadas],
  );
  const total = useMemo(
    () => ({
      piezas: elegidas.reduce((s, f) => s + (f.piezas ?? 0), 0),
      m3: Math.round(elegidas.reduce((s, f) => s + (f.volumenM3 ?? 0), 0) * 10_000) / 10_000,
      corridas: [...new Set(tildadas.map((f) => f.corrida.id))],
    }),
    [elegidas, tildadas],
  );
  /** Para quién se apartó antes: el segundo apartado del mismo cliente no cambia de grafía. */
  const destinatarios = useMemo(
    () =>
      [
        ...new Set(
          e.corridas
            .flatMap((c) => [c.apartado?.para, ...c.paquetes.map((p) => p.apartado?.para)])
            .filter((v): v is string => !!v && v.trim().length > 0)
            .map((v) => v.trim()),
        ),
      ].sort((x, y) => x.localeCompare(y, "es-PE")),
    [e.corridas],
  );
  const despuesDe = (msg: string) => {
    e.setNota(msg);
    void e.recargar();
  };

  return (
    <>
      {a.ficha && <CtpPaqueteFicha codigo={a.ficha} onClose={() => a.setFicha(null)} />}
      {a.cubicarConjunto && (
        <CtpCubicarProductoModal
          ctpEntryIds={total.corridas}
          titulo={`Cubicar ${elegidas.length} registro(s) · ${fmtM3(total.m3)} m³`}
          filas={elegidas}
          onClose={() => a.setCubicarConjunto(false)}
          onGuardada={(msg) => {
            a.setCubicarConjunto(false);
            a.setSeleccion(new Set());
            e.setNota(msg);
          }}
        />
      )}
      {a.editar && (
        <CtpEditarLineaModal
          linea={a.editar}
          onCerrar={() => a.setEditar(null)}
          onListo={(resumen) => {
            invalidarCtp();
            despuesDe(resumen);
          }}
        />
      )}
      {a.seleccion.size > 0 && (
        <CtpBarraSeleccion
          cifras={[
            { label: "Registros", valor: `${elegidas.length}` },
            { label: "Piezas", valor: `${total.piezas}` },
            { label: "Volumen", valor: `${fmtM3(total.m3)} m³`, fuerte: true },
            { label: "Pie tablar", valor: `${formatNumber(ptDe(total.m3))} pt` },
          ]}
          onLimpiar={() => a.setSeleccion(new Set())}
          accionLabel="Cubicar madera"
          accionIcon={Ruler}
          onAccion={() => a.setCubicarConjunto(true)}
          accionesSecundarias={[
            { label: "Despachar con guía", icon: Truck, onClick: () => a.setDespachando(true) },
            ...(a.puedeApartar
              ? [{ label: "Apartar para un cliente", icon: BookmarkPlus, onClick: () => a.abrirApartar(tildadas, null) }]
              : []),
          ]}
        />
      )}
      {a.despachando && (
        <CtpDespachoGuiaModal
          presetUids={[...a.seleccion]}
          onClose={() => a.setDespachando(false)}
          onSaved={({ lineas, offline }) => {
            a.setDespachando(false);
            a.setSeleccion(new Set());
            /* El saldo cambió: sin esto la recarga podía volver con la foto de hace 8 s. */
            invalidarCtp("/forestal/");
            despuesDe(
              offline
                ? `Sin señal: ${lineas} producto${lineas === 1 ? "" : "s"} quedaron anotados y suben solos con la conexión.`
                : `Guía registrada · ${lineas} ${lineas === 1 ? "línea" : "líneas"}.`,
            );
          }}
        />
      )}
      {a.reprocesar && (
        <CtpReprocesoModal
          origen={{
            id: a.reprocesar.id,
            lineNo: a.reprocesar.lineNo,
            especie: a.reprocesar.especie,
            producto: a.reprocesar.producto,
            unidad: a.reprocesar.unidad,
            disponible: a.reprocesar.disponible,
          }}
          sugerencia={
            e.sugerido
              ? { producto: e.sugerido.productoDestino, m3: e.sugerido.m3, desdeTipo: e.sugerido.desdeTipo }
              : undefined
          }
          onClose={() => a.setReprocesar(null)}
          onListo={(msg, detalle) => {
            a.setReprocesar(null);
            /* El pase se consume: dejarlo colgado ofrecería declarar dos veces el mismo reproceso. */
            e.avanzarCola();
            despuesDe(`${msg} — ${detalle}`);
          }}
        />
      )}
      {a.marcarUsado && (
        <CtpMarcarUsadoModal
          corridaId={a.marcarUsado.id}
          lineNo={a.marcarUsado.lineNo}
          onClose={() => a.setMarcarUsado(null)}
          onListo={(msg) => {
            a.setMarcarUsado(null);
            despuesDe(msg);
          }}
        />
      )}
      {a.cubicar && (
        <CtpCubicarProductoModal
          ctpEntryIds={[a.cubicar.corrida.id]}
          titulo={etiquetaDe(a.cubicar)}
          filas={[
            {
              id: a.cubicar.paquete?.id ?? a.cubicar.corrida.id,
              etiqueta: etiquetaDe(a.cubicar),
              especie: a.cubicar.corrida.especie,
              producto: a.cubicar.paquete?.producto ?? a.cubicar.corrida.producto,
              piezas: a.cubicar.paquete?.cantidad ?? null,
              volumenM3: a.cubicar.volumenM3,
            },
          ]}
          onClose={() => a.setCubicar(null)}
          onGuardada={(msg) => {
            a.setCubicar(null);
            e.setNota(msg);
          }}
        />
      )}
      {a.escuadria && (
        <CtpEscuadriaPaqueteModal
          paquete={a.escuadria}
          onCerrar={() => a.setEscuadria(null)}
          onGuardar={(m) => e.guardarEscuadria(m, () => a.setEscuadria(null))}
        />
      )}
      {a.apartando && (
        <CtpApartarModal
          abierto
          filas={a.apartando.filas}
          apartadoActual={a.apartando.apartadoActual}
          destinatariosConocidos={destinatarios}
          onCerrar={() => a.setApartando(null)}
          onListo={(msg) => {
            a.setApartando(null);
            a.setSeleccion(new Set());
            invalidarCtp("/forestal/ctp");
            despuesDe(msg);
          }}
        />
      )}
    </>
  );
}
