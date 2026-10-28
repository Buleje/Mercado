"use client";

/**
 * Libro CTP › Lotes de aserrío — una vista, dos pestañas internas
 * (compactación del libro, 17-10; plan `.claude/autonomo/ctp-compactar/plan.md`).
 *
 *   · Lotes: las tarjetas donde se arma lo que va a la sierra (`CtpLotesLista`).
 *     Contesta «¿qué hago hoy?».
 *   · Historia del lote: el expediente de punta a punta (`CtpHistoriaLoteView`).
 *     Contesta «¿qué pasó con este lote?».
 *
 * Eran dos vistas del riel que leían los MISMOS lotes (`useLotesAserrio`).
 * Juntas, tocar el código de un lote abre su historia sin salir de la vista, y
 * la historia vuelve a la lista con un toque. Cada pestaña monta el mismo
 * componente de antes: nada se copió ni se recalcula.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { Boxes, History } from "@buleje/design-system/icons";
import type { CtpIngresosFiltroRapido } from "./ctp-shared";
import CtpLotesLista from "./CtpLotesLista";
import CtpHistoriaLoteView from "./CtpHistoriaLoteView";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import { usePestanaInterna } from "./hooks/use-pestana-interna";
import { SUBS_LOTES, subPedidoPorVistaVieja, type SubLotes } from "./ctp-vistas-fusionadas";

/** El lote elegido para producir viaja al formulario de la pestaña Producción. */
export interface LoteAProducir {
  id: string;
  code: string;
}

const PESTANAS: readonly PestanaDeVista<SubLotes>[] = [
  { id: "lotes", label: "Lotes", icon: Boxes, hint: "Arma los lotes, cárgalos y mándalos a la sierra" },
  {
    id: "historia",
    label: "Historia del lote",
    icon: History,
    hint: "Qué trozas se apartaron, qué corrida se las comió, qué salió y con qué guía se fue",
  },
];

export default function CtpLotesView({
  onProducir,
  onCargar,
  onIr,
  pedido = null,
  loteInicial = null,
}: {
  onProducir: (lote: LoteAProducir) => void;
  /** «Cargar»: lleva a Consumos con este lote elegido (ADR-342). */
  onCargar: (lote: LoteAProducir) => void;
  /** Saltar a otra vista del libro (el aviso de guías sin recepcionar). */
  onIr?: (vista: string, filtro?: CtpIngresosFiltroRapido) => void;
  /** Un salto del libro a una pestaña (`irA("historia-lote")` estando ya en Lotes). */
  pedido?: { sub: string; n: number } | null;
  /** El lote que la historia muestra al abrir (Volumen disponible › pila de un lote). */
  loteInicial?: string | null;
}) {
  /* La URL vieja (`?vista=historia-lote`) se lee UNA vez, al montar. */
  const [forzada] = useState(() => subPedidoPorVistaVieja("lotes"));
  const { sub, irA } = usePestanaInterna<SubLotes>({
    moduleId: "ctp-lotes",
    validas: SUBS_LOTES,
    porDefecto: "lotes",
    forzada,
    pedido,
  });

  /* El lote de la historia vive acá: la pestaña se desmonta al volver a la
     lista y, al regresar, abre en el último que se miró. `n` remonta la
     historia cuando se pide OTRO lote desde afuera estando ya en ella. */
  const [historia, setHistoria] = useState<{ lote: string | null; n: number }>({ lote: loteInicial, n: 0 });
  const abrirHistoria = useCallback(
    (lote: string) => {
      setHistoria((h) => ({ lote, n: h.n + 1 }));
      irA("historia");
    },
    [irA],
  );
  /* ⌘K: `?loteAserrio=<id>` abre la historia de ESE lote; el parámetro se consume. */
  const delBuscador = useFichaEnUrl("loteAserrio");
  const { id: loteBuscado, cerrar: soltarLoteBuscado } = delBuscador;
  useEffect(() => {
    if (!loteBuscado) return;
    abrirHistoria(loteBuscado);
    soltarLoteBuscado();
  }, [loteBuscado, abrirHistoria, soltarLoteBuscado]);
  const pedidoAntes = useRef(loteInicial);
  useEffect(() => {
    if (!loteInicial || loteInicial === pedidoAntes.current) return;
    pedidoAntes.current = loteInicial;
    abrirHistoria(loteInicial);
  }, [loteInicial, abrirHistoria]);

  return (
    <PestanasDeVista prefijo="ctp-lotes" etiqueta="Pestañas de Lotes de aserrío" items={PESTANAS} activa={sub} onCambiar={irA}>
      {sub === "lotes" && <CtpLotesLista onProducir={onProducir} onCargar={onCargar} onIr={onIr} onHistoria={abrirHistoria} />}
      {sub === "historia" && (
        <CtpHistoriaLoteView
          key={historia.n}
          loteInicial={historia.lote}
          onLote={(lote) => setHistoria((h) => ({ ...h, lote }))}
          onVolver={() => irA("lotes")}
        />
      )}
    </PestanasDeVista>
  );
}
