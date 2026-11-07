"use client";

/**
 * useLothMapaToques — qué hace tocar algo en el mapa del Libro TH ahora que
 * hay árboles, rutas y puntos que abren su ficha (29-09):
 *
 *   · tocar un árbol abre su ficha y cierra la de la ruta; en «Elegir varios»
 *     lo marca;
 *   · tocar una ruta o un pin abre su ficha y cierra la del árbol;
 *   · arrastrar el patio de la vista previa (sin rutas guardadas, panel
 *     cerrado) abre el planificador, que es donde se recalcula y se guarda.
 *
 * Los tres callbacks son ESTABLES: el canvas va en `memo`, y uno nuevo en
 * cada render (el cursor se mueve y el marco se repinta) rearmaba la capa
 * entera de árboles.
 */

import { useCallback, useMemo } from "react";
import type { LatLng } from "@/lib/forestal/loth-geo";
import type { FilaPunto, FilaRuta } from "@/lib/forestal/loth-rutas-coordenadas";
import type { LothMapaArboles } from "./use-loth-mapa-arboles";
import type { LothMapaTalaVarios } from "./use-loth-mapa-tala-varios";
import type { LothMapaRutas } from "./use-loth-mapa-rutas";
import type { LothPlanificador } from "./use-loth-planificador";

interface Deps {
  arb: LothMapaArboles;
  variosTala: LothMapaTalaVarios;
  rutas: LothMapaRutas;
  plan: LothPlanificador;
  centrar: (p: LatLng) => void;
}

export function useLothMapaToques({ arb, variosTala, rutas, plan, centrar }: Deps) {
  const { elegir: elegirArbol, encuadrar } = arb;
  const { alternar: alternarVarios, activo: eligiendoVarios } = variosTala;
  const { cerrar: cerrarRuta, elegirEnElMapa: elegirRuta, fichaRuta, fichaPunto } = rutas;
  const { abierto: planAbierto, setAbierto: abrirPlan, moverPatio } = plan;

  const onArbolTocado = useCallback(
    (id: string | null) => {
      if (eligiendoVarios) {
        if (id) alternarVarios(id);
        return;
      }
      if (id) cerrarRuta();
      elegirArbol(id);
    },
    [eligiendoVarios, alternarVarios, cerrarRuta, elegirArbol],
  );

  const onRutaTocada = useCallback(
    (clave: string | null) => {
      if (clave) elegirArbol(null);
      elegirRuta(clave);
    },
    [elegirArbol, elegirRuta],
  );

  const onPatioMovido = useCallback(
    (p: LatLng) => {
      if (!planAbierto) abrirPlan(true);
      moverPatio(p);
    },
    [planAbierto, abrirPlan, moverPatio],
  );

  /** La ficha sobre el mapa: la de una ruta o la de un punto (nunca las dos). */
  const ficha = useMemo((): { ruta: FilaRuta } | { punto: FilaPunto } | null => (fichaRuta ? { ruta: fichaRuta } : fichaPunto ? { punto: fichaPunto } : null), [fichaRuta, fichaPunto]);

  /** «Llevar el mapa hasta acá»: la ruta entera a la vista, o el punto al centro. */
  const centrarFicha = useCallback(() => {
    if (fichaRuta) encuadrar(fichaRuta.vertices.map((v): LatLng => [v.lat, v.lng]));
    else if (fichaPunto) centrar([fichaPunto.punto.lat, fichaPunto.punto.lng]);
  }, [fichaRuta, fichaPunto, encuadrar, centrar]);

  return {
    onArbolTocado,
    onRutaTocada,
    onPatioMovido,
    /** Lo punteado: la propuesta del panel abierto o, sin rutas guardadas, la que se muestra sola. */
    propuesta: plan.vistaPrevia ?? rutas.previa,
    ficha,
    centrarFicha,
  };
}
