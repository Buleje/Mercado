"use client";

/**
 * useLothMapaDibujo — todo lo que se DIBUJA sobre el mapa del Libro TH.
 *
 * Tres herramientas que comparten el clic del mapa y por eso tienen que
 * saberse entre ellas:
 *   · el polígono (área de aprovechamiento o contorno del predio: el MISMO
 *     borrador, vértices arrastrables y barra — sólo cambia dónde se guarda),
 *   · la vía (carretera, trocha o río), punto por punto,
 *   · la referencia del territorio, un clic y listo.
 *
 * Y la importación de coordenadas (`coordsOpen`), que carga el borrador del
 * área o el contorno del predio sin dibujar a mano.
 */

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { polygonAreaHa, type LatLng, type LothParcela } from "@/lib/forestal/loth-geo";
import { hullBuffer } from "@/lib/forestal/loth-utm";
import type { LothCartografia } from "@/lib/forestal/loth-cartografia";

export type DestinoDibujo = "area" | "predio";

interface Deps {
  parcela: LothParcela;
  carto: LothCartografia;
  setCarto: Dispatch<SetStateAction<LothCartografia>>;
  persistParcela: (next: { vertices: LatLng[]; nota: string; deforestacionCero: boolean }) => Promise<void>;
  guardarCartografia: (siguiente?: LothCartografia) => Promise<void>;
  /** Árboles del censo ya proyectados: la envolvente arranca de ellos. */
  censo: { lat: number; lng: number }[];
}

export function useLothMapaDibujo({ parcela, carto, setCarto, persistParcela, guardarCartografia, censo }: Deps) {
  const { confirm } = useConfirm();
  const [drawTarget, setDrawTarget] = useState<DestinoDibujo>("area");
  const [drawMode, setDrawMode] = useState(false);
  const [draft, setDraft] = useState<LatLng[]>([]);
  /** A dónde van los vértices que se peguen: al área declarada o al predio. */
  const [coordsOpen, setCoordsOpen] = useState<null | DestinoDibujo>(null);
  const [markMode, setMarkMode] = useState(false);
  /** Traza en curso del modo "dibujar vía" (null = inactivo). */
  const [viaDraft, setViaDraft] = useState<LatLng[] | null>(null);

  const startDraw = useCallback(() => {
    setDrawTarget("area");
    setDraft(parcela.vertices.slice());
    setDrawMode(true);
  }, [parcela.vertices]);

  /** Levantar el contorno del predio a mano (o corregir el que ya está). */
  const startDrawPredio = useCallback(() => {
    setDrawTarget("predio");
    setDraft(carto.predio.vertices.slice());
    setDrawMode(true);
  }, [carto.predio.vertices]);

  const cancelDraw = useCallback(() => {
    setDrawMode(false);
    setDraft([]);
  }, []);

  const saveDraw = async () => {
    if (draft.length < 3) return;
    if (drawTarget === "predio") {
      // El predio vive en la cartografía: se guarda ahí y se persiste en el
      // mismo PUT que las referencias y las vías.
      const siguiente = { ...carto, predio: { ...carto.predio, vertices: draft } };
      setCarto(siguiente);
      await guardarCartografia(siguiente);
    } else {
      await persistParcela({ vertices: draft, nota: parcela.nota, deforestacionCero: parcela.deforestacionCero });
    }
    setDrawMode(false);
    setDraft([]);
  };

  const clearParcela = useCallback(async () => {
    // El polígono sostiene el área declarada, el cross-check del POA y el DDS
    // de EUDR: borrarlo no es un "ok" al pasar, va con el diálogo del DS.
    const ok = await confirm({
      title: "¿Borrar el polígono del área de aprovechamiento?",
      description:
        "Se pierden los vértices dibujados y con ellos el área calculada, el cross-check contra el POA y la geometría del expediente EUDR. Vas a tener que volver a dibujarlo o importarlo.",
      intent: "danger",
      confirmLabel: "Sí, borrar el polígono",
    });
    if (!ok) return;
    await persistParcela({ vertices: [], nota: "", deforestacionCero: false });
  }, [persistParcela, confirm]);

  const toggleDeforestacion = useCallback(
    (v: boolean) => persistParcela({ vertices: parcela.vertices, nota: parcela.nota, deforestacionCero: v }),
    [persistParcela, parcela.vertices, parcela.nota],
  );

  /** Envolvente del censo + franja de 60 m: polígono de arranque, editable a mano. */
  const envolverCenso = () => {
    if (censo.length === 0) return;
    const ring = hullBuffer(censo.map((t): LatLng => [t.lat, t.lng]), 60);
    if (ring.length >= 3) setDraft(ring);
  };

  const addVertex = useCallback((v: LatLng) => setDraft((d) => [...d, v]), []);
  const moveVertex = useCallback((i: number, v: LatLng) => setDraft((d) => d.map((old, idx) => (idx === i ? v : old))), []);
  const deleteVertex = useCallback((i: number) => setDraft((d) => d.filter((_, idx) => idx !== i)), []);
  const insertVertex = useCallback((i: number, v: LatLng) => setDraft((d) => [...d.slice(0, i), v, ...d.slice(i)]), []);
  const undoVertex = useCallback(() => setDraft((d) => d.slice(0, -1)), []);

  /** Marca una referencia donde el usuario tocó (se renombra en el bloque de referencias). */
  const marcarReferencia = useCallback(
    (v: LatLng) => {
      setCarto((c) => ({
        ...c,
        referencias: [
          ...c.referencias,
          {
            id: `ref-${c.referencias.length + 1}-${c.referencias.length}`,
            nombre: `Referencia ${c.referencias.length + 1}`,
            tipo: "centro_poblado" as const,
            lat: v[0],
            lng: v[1],
            nota: "",
          },
        ],
      }));
      setMarkMode(false);
    },
    [setCarto],
  );

  const addViaPoint = useCallback((v: LatLng) => setViaDraft((d) => [...(d ?? []), v]), []);

  /** Cierra el trazado y suma la vía a la cartografía (se nombra en el bloque de vías). */
  const terminarVia = () => {
    const pts = viaDraft ?? [];
    if (pts.length >= 2) {
      setCarto((c) => ({
        ...c,
        vias: [
          ...c.vias,
          { id: `via-${c.vias.length + 1}-${c.vias.length}`, nombre: `Vía ${c.vias.length + 1}`, tipo: "acceso" as const, puntos: pts },
        ],
      }));
    }
    setViaDraft(null);
  };

  const iniciarVia = () => setViaDraft([]);
  const deshacerVia = () => setViaDraft((d) => (d ? d.slice(0, -1) : d));
  const cancelarVia = () => setViaDraft(null);

  /** Lo que llega del modal de coordenadas. */
  const aplicarCoordenadas = (vertices: LatLng[]) => {
    if (coordsOpen === "predio") {
      // El predio se guarda derecho: no pasa por el borrador del área, que
      // tiene su propio flujo de dibujo y confirmación.
      setCarto((c) => ({ ...c, predio: { ...c.predio, vertices } }));
      return;
    }
    if (!drawMode) setDrawMode(true);
    setDraft(vertices);
  };

  /** Importar al área: entra al dibujo (si no estaba) y abre el pegado. */
  const importarArea = () => {
    if (!drawMode) startDraw();
    setCoordsOpen("area");
  };

  return {
    drawTarget,
    drawMode,
    draft,
    draftAreaHa: draft.length >= 3 ? polygonAreaHa(draft) : 0,
    startDraw,
    startDrawPredio,
    cancelDraw,
    saveDraw,
    clearParcela,
    toggleDeforestacion,
    envolverCenso,
    addVertex,
    moveVertex,
    deleteVertex,
    insertVertex,
    undoVertex,
    markMode,
    setMarkMode,
    marcarReferencia,
    viaDraft,
    addViaPoint,
    iniciarVia,
    deshacerVia,
    cancelarVia,
    terminarVia,
    coordsOpen,
    setCoordsOpen,
    aplicarCoordenadas,
    importarArea,
  };
}

export type LothMapaDibujo = ReturnType<typeof useLothMapaDibujo>;
