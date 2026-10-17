"use client";

/**
 * Prender/apagar UNA pieza de UN negocio y abrir sus opciones: lo comparten la
 * tabla de todos y la ficha del negocio, para que se comporten igual (sin
 * opciones que sirvan ni valores por defecto, primero se abren las opciones).
 */
import { useState } from "react";
import { comoObjeto } from "./campos-de-schema";
import type { PiezaAbierta } from "./OpcionesPiezaModal";
import type { PiezasSuperadmin } from "./use-piezas-superadmin";
import type { Oferta } from "./piezas-del-negocio";
import type { EnchufeId } from "@/extensiones/_contrato";

export const claveDeCelda = (t: string, p: string, e: string) => `${t}:${p}:${e}`;

export function useAlternarPieza(guardar: PiezasSuperadmin["guardar"], soltarPieza?: PiezasSuperadmin["soltar"]) {
  /** Todas las celdas que están guardando AHORA: dos a la vez no se pisan el «cargando». */
  const [pendientes, setPendientes] = useState<ReadonlySet<string>>(new Set());
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<PiezaAbierta | null>(null);

  async function alternar(negocio: { id: string; name: string }, { pieza, enchufe, fila }: Oferta) {
    const prender = !fila?.prendida;
    const sirven = fila?.opcionesValidas === true;
    if (!sirven && pieza.opcionesPorDefecto === null) {
      setAbierta({ tenantId: negocio.id, tenantNombre: negocio.name, pieza, enchufe: enchufe as EnchufeId, fila, prender });
      return;
    }
    const k = claveDeCelda(negocio.id, pieza.id, enchufe);
    setPendientes((p) => new Set(p).add(k));
    setAviso(null);
    // Se conservan las opciones del negocio, salvo que ya no sirvan.
    const opciones = sirven ? comoObjeto(fila.opciones) : (pieza.opcionesPorDefecto ?? {});
    const r = await guardar({ tenantId: negocio.id, piezaId: pieza.id, enchufe: enchufe as EnchufeId, prendida: prender, opciones });
    if (!r.ok) setAviso(r.mensaje);
    setPendientes((p) => {
      const queda = new Set(p);
      queda.delete(k);
      return queda;
    });
  }

  async function soltar(negocio: { id: string }, { pieza, enchufe }: Oferta) {
    if (!soltarPieza) return;
    const k = claveDeCelda(negocio.id, pieza.id, enchufe);
    setPendientes((p) => new Set(p).add(k));
    setAviso(null);
    const r = await soltarPieza({ tenantId: negocio.id, piezaId: pieza.id, enchufe: enchufe as EnchufeId });
    if (!r.ok) setAviso(r.mensaje);
    setPendientes((p) => {
      const queda = new Set(p);
      queda.delete(k);
      return queda;
    });
  }

  const abrirOpciones = (negocio: { id: string; name: string }, o: Oferta) =>
    setAbierta({ tenantId: negocio.id, tenantNombre: negocio.name, pieza: o.pieza, enchufe: o.enchufe as EnchufeId, fila: o.fila });

  const guardarOpciones = (a: PiezaAbierta, opciones: Record<string, unknown>, rotulos: Record<string, string>) =>
    guardar(
      { tenantId: a.tenantId, piezaId: a.pieza.id, enchufe: a.enchufe, prendida: a.prender ?? a.fila?.prendida ?? false, opciones },
      rotulos,
    );

  return { pendientes, aviso, abierta, cerrar: () => setAbierta(null), alternar, soltar, abrirOpciones, guardarOpciones };
}
