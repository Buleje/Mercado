"use client";

/**
 * La barra de los lotes elegidos (Brandon, 2026-10-02): «checks en cada lote»
 * y, al pie, qué hacer con ellos.
 *
 * Es la MISMA barra de Cargar sierra, Producción y Productos disponibles
 * (`CtpBarraSeleccion`): la cuenta a la izquierda (lotes, m³ y pt de madera
 * aserrada en patio) y la acción principal a la derecha.
 *
 * - **Despachar** abre la guía de transporte con la madera de esos lotes
 *   (`uidsDeCorridas`, por id de corrida: una corrida que mezcló dos lotes
 *   lleva el código de uno solo). Lo que no puede ir —sin aserrar, sin saldo,
 *   marcado como usado— se dice en la barra y no se manda.
 * - **Salió sin guía** y **Volver a disponibles** abren su modal, que primero
 *   pregunta y cuenta (el servidor decide qué corridas, no la pantalla).
 * - **Más**: cerrar los abiertos y el Excel de lo elegido.
 */

import { useState } from "react";
import { FileSpreadsheet, Lock, MoreHorizontal, PackageX, Truck, Undo2 } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { formatNumber } from "@/lib/format";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { uidsDeCorridas } from "@/lib/forestal/productos-de-lote";
import type { CorridaDisponible } from "@/lib/forestal/productos-disponibles-resumen";
import { productLabel } from "./ctp-shared";
import CtpBarraSeleccion, { type AccionSeleccion, type CifraSeleccion } from "./ctp-barra-seleccion";
import {
  TOPE_LOTES_POR_VEZ,
  avisoDeBloqueados,
  avisoDeCompartidas,
  corridaIdsDe,
  corridasCompartidas,
  resumenSeleccion,
} from "./ctp-lotes-seleccion";
import { traerDisponibles } from "./ctp-lotes-seleccion-api";
import type { SeleccionLotes } from "./hooks/use-seleccion-lotes";
import type { AvisoLotes } from "./CtpLotesModales";
import CtpMarcarUsadoLotesModal from "./CtpMarcarUsadoLotesModal";
import CtpCerrarLotesModal from "./CtpCerrarLotesModal";

type Modal = { tipo: "usado"; usado: boolean } | { tipo: "cerrar" } | null;

export default function CtpLotesSeleccionBarra({
  sel,
  todos,
  onDespachar,
  setAviso,
  onCambio,
}: {
  sel: SeleccionLotes;
  /** Todos los lotes cargados: para avisar de corridas compartidas con uno NO elegido. */
  todos: readonly LoteAserrio[];
  /** Abre la guía de transporte con estos `uid`s ya cargados. */
  onDespachar: (uids: string[]) => void;
  setAviso: (a: AvisoLotes) => void;
  /** Algo se escribió en el libro: recargar (y con eso se limpia la selección). */
  onCambio: () => void;
}) {
  const [modal, setModal] = useState<Modal>(null);
  const [ocupado, setOcupado] = useState<"despachar" | "excel" | null>(null);
  const r = resumenSeleccion(sel.lista);

  const despachar = async () => {
    setModal(null);
    setOcupado("despachar");
    try {
      const corridas = await traerDisponibles();
      /* Sólo por id de corrida, como marcar: el texto del lote no es la verdad
         de qué corrida comió qué lote (una mixta lleva el código de uno solo). */
      const uids = uidsDeCorridas(corridaIdsDe(r.despachables), corridas);
      if (uids.length === 0) {
        setAviso({ tono: "aviso", texto: "Esos lotes no tienen madera disponible para una guía." });
        return;
      }
      onDespachar(uids);
    } catch (e) {
      setAviso({ tono: "aviso", texto: `No se pudo leer la madera disponible: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setOcupado(null);
    }
  };

  /* El Excel se arma recién al pedirlo: los módulos de la hoja no viajan con la vista. */
  const excel = async () => {
    setOcupado("excel");
    try {
      const [resumen, hojas, xls, corridas] = await Promise.all([
        import("@/lib/forestal/productos-disponibles-resumen"),
        import("@/lib/forestal/productos-disponibles-excel"),
        import("@/lib/export-excel"),
        traerDisponibles<CorridaDisponible>(),
      ]);
      const ids = new Set(corridaIdsDe(sel.lista));
      const ahora = new Date();
      const filas = resumen.filasDeProductos(
        corridas.filter((c) => ids.has(c.id)),
        ahora,
      );
      if (filas.length === 0) {
        setAviso({ tono: "aviso", texto: "Esos lotes no tienen productos disponibles para el Excel." });
        return;
      }
      await xls.exportSheetsToExcel(
        hojas.hojasDeProductos({
          filas,
          paquetes: filas,
          ahora,
          filtros: [`Lotes: ${sel.lista.map((l) => l.code).join(", ")}`],
          alcance: null,
          etiquetaProducto: productLabel,
        }),
        hojas.nombreArchivoProductos(ahora).replace("productos-disponibles", "productos-de-lotes"),
      );
    } catch (e) {
      setAviso({ tono: "aviso", texto: `No se pudo armar el Excel: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setOcupado(null);
    }
  };

  /* Más de 200 de una vez: el servidor los rechaza. Se dice y se apaga todo lo que le pide algo. */
  const demasiados = sel.lista.length > TOPE_LOTES_POR_VEZ;
  const frenado = ocupado != null || demasiados;

  const cifras: CifraSeleccion[] = [
    { label: "Lotes", valor: formatNumber(r.lotes, 0), fuerte: true },
    ...(r.m3 != null ? [{ label: "m³ en patio", valor: formatNumber(r.m3, 2) }] : []),
    ...(r.pt != null ? [{ label: "pt", valor: formatNumber(r.pt, 0) }] : []),
  ];

  const secundarias: AccionSeleccion[] = [
    { label: "Salió sin guía", icon: PackageX, onClick: () => setModal({ tipo: "usado", usado: true }), disabled: frenado },
    ...(r.conMarcada
      ? [{ label: "Volver a disponibles", icon: Undo2, onClick: () => setModal({ tipo: "usado", usado: false }), disabled: frenado }]
      : []),
  ];

  const nDesp = r.despachables.length;
  const aviso = demasiados
    ? `Elige hasta ${TOPE_LOTES_POR_VEZ} lotes por vez (tienes ${sel.lista.length}).`
    : [avisoDeBloqueados(r.bloqueados), avisoDeCompartidas(corridasCompartidas(r.despachables, todos))]
        .filter(Boolean)
        .join(" ") || null;

  return (
    <>
      <CtpBarraSeleccion
        cifras={cifras}
        onLimpiar={sel.limpiar}
        accionLabel={ocupado === "despachar" ? "Abriendo la guía…" : nDesp < r.lotes && nDesp > 0 ? `Despachar ${nDesp}` : "Despachar"}
        accionIcon={Truck}
        accionDisabled={nDesp === 0 || frenado}
        onAccion={() => void despachar()}
        aviso={aviso}
        avisoTono={demasiados ? "error" : "aviso"}
        accionesSecundarias={secundarias}
        menu={
          <ActionMenu
            label="Más"
            disabled={demasiados}
            icon={MoreHorizontal}
            size="md"
            compactoEnMovil
            title="Cerrar los lotes abiertos o bajar el Excel de los elegidos"
            actions={[
              {
                id: "cerrar",
                label: r.abiertos.length > 0 ? `Cerrar ${r.abiertos.length} abierto${r.abiertos.length === 1 ? "" : "s"}` : "Cerrar lotes",
                hint: r.abiertos.length > 0 ? "Lo que no entró a la sierra vuelve al patio" : "Ninguno de los elegidos está abierto",
                icon: Lock,
                disabled: r.abiertos.length === 0,
                onSelect: () => setModal({ tipo: "cerrar" }),
              },
              {
                id: "excel",
                label: "Excel de los elegidos",
                hint: "Sus productos disponibles, paquete por paquete",
                icon: FileSpreadsheet,
                busy: ocupado === "excel",
                disabled: ocupado != null,
                onSelect: () => void excel(),
              },
            ]}
          />
        }
      />

      {modal?.tipo === "usado" && (
        <CtpMarcarUsadoLotesModal
          lotes={sel.lista.map((l) => ({ id: l.id, code: l.code }))}
          usado={modal.usado}
          onClose={() => setModal(null)}
          onDespachar={() => void despachar()}
          onListo={(texto) => {
            setModal(null);
            setAviso({ tono: "ok", texto });
            onCambio();
          }}
        />
      )}

      {modal?.tipo === "cerrar" && (
        <CtpCerrarLotesModal
          lotes={r.abiertos.map((l) => ({ id: l.id, code: l.code }))}
          onClose={() => setModal(null)}
          onListo={(texto, tono) => {
            setModal(null);
            setAviso({ tono, texto });
            onCambio();
          }}
        />
      )}
    </>
  );
}

/** «Elegir los 12 visibles», pegado a la lista que elige. */
export function ElegirTodosLotes({ sel, total }: { sel: SeleccionLotes; total: number }) {
  if (total === 0) return null;
  return (
    <label className="inline-flex h-11 cursor-pointer items-center gap-2.5 rounded-xl px-1 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
      <input
        type="checkbox"
        checked={sel.todos}
        ref={(el) => {
          if (el) el.indeterminate = sel.algunos;
        }}
        onChange={sel.alternarTodos}
        className="h-5 w-5 accent-[var(--accent-dark)]"
      />
      {sel.todos ? `Los ${total} visibles elegidos` : `Elegir los ${total} visibles`}
      {sel.lista.length > 0 && !sel.todos && (
        <span className="text-[var(--text-tertiary)]">· {sel.lista.length} elegido{sel.lista.length === 1 ? "" : "s"}</span>
      )}
    </label>
  );
}

