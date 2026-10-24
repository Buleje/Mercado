"use client";

/**
 * Un parámetro «de entrada» de la URL: lo que otra pantalla pide al llegar
 * (`?q=Juan` = «busca a Juan», `?nuevo=1` = «abre el alta»). Lo lee al montar
 * y cada vez que la URL cambia sin recargar (`irAEnlace` termina con un
 * `popstate`: la pantalla ya abierta también se entera), lo aplica UNA vez y lo
 * borra de la URL —sin agregar historial— para que recargar o volver no lo
 * repita (como `?cerrar=1` de Turnos).
 *
 * `aca` dice si la URL es de ESTA pantalla: con el panel que deja montadas las
 * pestañas, un `?q=` para Compras no lo debe tomar Cobranza.
 */

import { useEffect, useRef } from "react";

export function useParamDeEntrada(
  param: string,
  aplicar: (valor: string) => void,
  aca: (params: URLSearchParams) => boolean = () => true,
): void {
  const aplicarRef = useRef(aplicar);
  const acaRef = useRef(aca);
  useEffect(() => {
    aplicarRef.current = aplicar;
    acaRef.current = aca;
  });

  useEffect(() => {
    const revisar = () => {
      const url = new URL(window.location.href);
      const valor = url.searchParams.get(param);
      if (valor === null || !acaRef.current(url.searchParams)) return;
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      aplicarRef.current(valor);
    };
    revisar();
    window.addEventListener("popstate", revisar);
    return () => window.removeEventListener("popstate", revisar);
  }, [param]);
}
