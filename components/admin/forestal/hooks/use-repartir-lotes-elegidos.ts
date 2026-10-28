"use client";

import { useState } from "react";
import { LayoutGrid } from "@buleje/design-system/icons";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  TOPE_LOTES_A_DISTRIBUCION,
  abrirDeFrente,
  avisoDeReparto,
  ayudaDeReparto,
  partirParaDistribucion,
} from "@/lib/forestal/lotes-a-distribucion";
import type { AccionSeleccion } from "../ctp-barra-seleccion";
import { abrirEnLoQueEntro, useLlevarLoteADistribucion } from "./use-llevar-lote-a-distribucion";

/**
 * «Repartir en la distribución (N)» de la barra de los lotes elegidos
 * (Brandon 28-10): lleva TODOS los elegidos que están en consumo a la
 * Distribución de una vez, un bloque por lote con su guía en la observación.
 * Los que no están en consumo se saltan (se dice cuántos y por qué en el
 * `title`, y en el aviso si quedó algo afuera).
 *
 * Si entró todo, abre los Resúmenes en «Lo que entró». Si algo quedó afuera, la barra lo dice y
 * el botón pasa a «Abrir la Distribución»: al navegar el aviso se perdería.
 */
export function useRepartirLotesElegidos(
  lista: readonly LoteAserrio[],
  frenado: boolean,
): { accion: AccionSeleccion | null; aviso: string | null; demasiados: boolean } {
  const { llevarVarios, llevando, error } = useLlevarLoteADistribucion();
  /* El resultado vale para ESTA selección: si cambia, se vuelve a ofrecer llevar. */
  const [hecho, setHecho] = useState<{ clave: string; texto: string; entraron: number } | null>(null);
  const { enConsumo, saltados } = partirParaDistribucion(lista);
  if (enConsumo.length === 0) return { accion: null, aviso: null, demasiados: false };

  const clave = lista.map((l) => l.id).join(",");
  const vigente = hecho?.clave === clave ? hecho : null;
  const demasiados = enConsumo.length > TOPE_LOTES_A_DISTRIBUCION;

  const accion: AccionSeleccion =
    vigente && vigente.entraron > 0
      ? {
          label: `Abrir la Distribución (${vigente.entraron})`,
          icon: LayoutGrid,
          title: "Abre los Resúmenes del cubicador con los lotes que entraron",
          onClick: abrirEnLoQueEntro,
        }
      : {
          label: llevando ? "Llevando a la distribución…" : `Repartir en la distribución (${enConsumo.length})`,
          icon: LayoutGrid,
          title: ayudaDeReparto(enConsumo.length, saltados),
          disabled: frenado || llevando || demasiados,
          onClick: () =>
            void llevarVarios(
              enConsumo.map((l) => ({ id: l.id, code: l.code })),
              saltados,
            ).then((r) => {
              if (r && !abrirDeFrente(r)) setHecho({ clave, texto: avisoDeReparto(r) ?? "", entraron: r.entraron.length });
            }),
        };

  const aviso = demasiados
    ? `Para la Distribución elige hasta ${TOPE_LOTES_A_DISTRIBUCION} lotes en consumo por vez (tienes ${enConsumo.length}).`
    : (error ?? vigente?.texto ?? null);
  return { accion, aviso, demasiados };
}
