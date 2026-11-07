"use client";

import { useEffect, useState } from "react";
import { TAB_CATEGORIES } from "@/app/admin/_lib/tab-categories";
import { hayOrdenManual } from "@/lib/admin/orden-barra";
import { leerOrdenManual, oirOrdenManual } from "@/lib/admin/orden-manual-barra";

const FABRICA = TAB_CATEGORIES.map((c) => c.id);

/**
 * ¿La barra sigue un orden que alguien fijó a mano? (en Configuración o con el
 * lápiz). Se entera de los cambios sin recargar. Un orden guardado igual al de
 * fábrica no cuenta (`hayOrdenManual`).
 */
export function useHayOrdenManual(): boolean {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    const leer = () => setHay(hayOrdenManual(leerOrdenManual(), FABRICA));
    leer();
    return oirOrdenManual(leer);
  }, []);
  return hay;
}
