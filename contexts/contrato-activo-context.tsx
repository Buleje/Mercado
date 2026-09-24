"use client";

/**
 * contrato-activo-context — bajo qué permiso se está trabajando AHORA.
 *
 * Pedido de Brandon (2026-09-19, señalando la banda del Libro de Títulos
 * Habilitantes): «que en ese apartado estén las opciones de contrato o permiso
 * para escoger rápido, y establecerse el permiso en toda la página para poner
 * fijo ese contrato en las operaciones que realizo, y poder cambiar para que se
 * aplique a todo».
 *
 * Es el contrato de TRABAJO, no una imputación: no reemplaza lo que ADR-421
 * resuelve solo. La madera, la producción y los lotes ya traen el código del
 * permiso escrito (`originCode`, `permiso`) y el backend los imputa con
 * `idPorCodigo()`; acá se elige bajo qué papel se está parado, y eso es lo que
 * los formularios proponen y las pantallas acotan. Elegirlo nunca pisa un
 * código que el documento ya trae: sugiere, no manda.
 *
 * ## Por qué guarda el código y el titular, no sólo el id
 *
 * El chip de la banda tiene que pintarse en el primer frame, antes de que
 * ninguna pantalla pida la lista de contratos. Guardar sólo el id obligaba a un
 * fetch en cada libro sólo para saber qué decía el chip — y el libro que no lo
 * pedía mostraba un hueco. El id sigue siendo la verdad; el código y el titular
 * son el cartel, y se refrescan cuando la lista llega.
 *
 * ## Dónde vive lo elegido
 *
 * `localStorage` por tenant (`contrato-activo-<tenant>`), como el resto de las
 * preferencias del panel. Se sincroniza entre pestañas con el evento `storage`:
 * cambiar de permiso en una pestaña y seguir registrando en la otra bajo el
 * anterior es exactamente el error que esto viene a evitar.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Lo mínimo para pintar el chip sin pedir nada. */
export interface ContratoActivo {
  id: string;
  codigo: string;
  titular: string | null;
}

interface ContratoActivoValue {
  /** El permiso bajo el que se trabaja, o `null` = todos / ninguno fijado. */
  activo: ContratoActivo | null;
  /** Atajo: el id, que es lo que viaja a los formularios. */
  contratoId: string | null;
  /** Fijarlo (o `null` para soltarlo). */
  fijar: (contrato: ContratoActivo | null) => void;
  /** `false` hasta leer localStorage: evita pintar «Todos» y saltar al valor. */
  listo: boolean;
  /** El interruptor «Solo este permiso» de la banda. Apagado por omisión. */
  soloEste: boolean;
  setSoloEste: (v: boolean) => void;
  /**
   * El id por el que las listas del libro se acotan: el del permiso activo
   * SÓLO si el interruptor está prendido. `null` = ver todo, como siempre.
   * Es lo único que las pantallas miran: el filtro lo hace el servidor.
   */
  contratoFiltro: string | null;
}

const Ctx = createContext<ContratoActivoValue | null>(null);

const clave = (tenant: string) => `contrato-activo-${tenant}`;
/* Clave propia y no un campo del JSON del permiso: soltar el permiso borra
   aquél, y la preferencia de filtrar tiene que sobrevivir a eso. */
const claveSolo = (tenant: string) => `contrato-activo-solo-${tenant}`;

function leerSolo(tenant: string): boolean {
  try {
    return localStorage.getItem(claveSolo(tenant)) === "1";
  } catch {
    return false;
  }
}

function leer(tenant: string): ContratoActivo | null {
  try {
    const crudo = localStorage.getItem(clave(tenant));
    if (!crudo) return null;
    const v = JSON.parse(crudo) as Partial<ContratoActivo>;
    // Un JSON de una versión anterior (o a medio escribir) no debe dejar el
    // panel trabajando bajo un contrato sin código: sin `id` y `codigo`, nada.
    if (!v?.id || !v?.codigo) return null;
    return { id: v.id, codigo: v.codigo, titular: v.titular ?? null };
  } catch {
    return null;
  }
}

export function ContratoActivoProvider({
  tenant,
  children,
}: {
  /** Slug del tenant: el permiso de un negocio no es el de otro. */
  tenant: string;
  children: ReactNode;
}) {
  const [activo, setActivo] = useState<ContratoActivo | null>(null);
  const [listo, setListo] = useState(false);
  const [soloEste, setSoloEsteState] = useState(false);

  useEffect(() => {
    setActivo(leer(tenant));
    setSoloEsteState(leerSolo(tenant));
    setListo(true);
  }, [tenant]);

  // Otra pestaña cambió de permiso: ésta se entera. Sin esto, registrar en dos
  // pestañas bajo permisos distintos es un accidente silencioso.
  useEffect(() => {
    const alCambiar = (e: StorageEvent) => {
      if (e.key === claveSolo(tenant)) {
        setSoloEsteState(leerSolo(tenant));
        return;
      }
      if (e.key !== clave(tenant)) return;
      setActivo(leer(tenant));
    };
    window.addEventListener("storage", alCambiar);
    return () => window.removeEventListener("storage", alCambiar);
  }, [tenant]);

  const fijar = useCallback(
    (contrato: ContratoActivo | null) => {
      setActivo(contrato);
      try {
        if (contrato) localStorage.setItem(clave(tenant), JSON.stringify(contrato));
        else localStorage.removeItem(clave(tenant));
      } catch {
        // Modo privado o storage lleno: la elección vale para esta pantalla
        // igual. Perder la preferencia es molesto; romper el panel, no.
      }
    },
    [tenant],
  );

  const setSoloEste = useCallback(
    (v: boolean) => {
      setSoloEsteState(v);
      try {
        if (v) localStorage.setItem(claveSolo(tenant), "1");
        else localStorage.removeItem(claveSolo(tenant));
      } catch {
        // Igual que `fijar`: sin storage vale para esta pantalla.
      }
    },
    [tenant],
  );

  const value = useMemo<ContratoActivoValue>(
    () => ({
      activo,
      contratoId: activo?.id ?? null,
      fijar,
      listo,
      soloEste,
      setSoloEste,
      /* Sin permiso fijado no hay qué acotar: el interruptor prendido y sin
         permiso es «ver todo», nunca una lista vacía que parece un error. */
      contratoFiltro: soloEste && activo ? activo.id : null,
    }),
    [activo, fijar, listo, soloEste, setSoloEste],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * El permiso bajo el que se trabaja. Fuera del provider devuelve «ninguno
 * fijado» en vez de tirar: un módulo del panel que no es forestal no tiene por
 * qué montar el provider para poder renderizarse.
 */
export function useContratoActivo(): ContratoActivoValue {
  const ctx = useContext(Ctx);
  return (
    ctx ?? {
      activo: null,
      contratoId: null,
      fijar: () => {},
      listo: true,
      soloEste: false,
      setSoloEste: () => {},
      contratoFiltro: null,
    }
  );
}
