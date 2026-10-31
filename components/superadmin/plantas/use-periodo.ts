"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PeriodoPlanta } from "@/lib/superadmin/plantas-forestales/tipos";
import { esClavePeriodo, rangoDePeriodo, type ClavePeriodo } from "./formato";

/**
 * El período elegido vive en la URL (`?periodo=mes-pasado`): la ficha que se
 * abre desde la lista hereda el mismo, y el enlace se puede compartir.
 */
export function usePeriodo(): {
  clave: ClavePeriodo;
  rango: PeriodoPlanta;
  cambiar: (c: ClavePeriodo) => void;
  /** «?periodo=…» para los enlaces internos (vacío si es el de por defecto). */
  sufijo: string;
} {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const crudo = params.get("periodo");
  const clave: ClavePeriodo = esClavePeriodo(crudo) ? crudo : "mes";
  const rango = useMemo(() => rangoDePeriodo(clave), [clave]);

  const cambiar = useCallback(
    (c: ClavePeriodo) => {
      const q = new URLSearchParams(params.toString());
      if (c === "mes") q.delete("periodo");
      else q.set("periodo", c);
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { clave, rango, cambiar, sufijo: clave === "mes" ? "" : `?periodo=${clave}` };
}
