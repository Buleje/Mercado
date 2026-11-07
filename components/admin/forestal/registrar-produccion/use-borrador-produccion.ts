/**
 * El borrador de «Registrar producción» en el navegador: se lee al abrir, se
 * guarda en cada cambio y se descarta a pedido.
 *
 * Movido tal cual desde `CtpRegistrarProduccionModal.tsx` (28-10): la lectura
 * y la escritura siguen siendo dos efectos, en el mismo orden.
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { tenantDeLaClave } from "@/lib/forestal/sembrar-reparto";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { PaqueteBorrador } from "@/lib/forestal/produccion-paquetes";

type Setter<T> = Dispatch<SetStateAction<T>>;

export function useBorradorProduccion({
  lote,
  titulo,
  codigosUsados,
  paquetes,
  dia,
  linea,
  observaciones,
  setPaquetes,
  setDia,
  setSemana,
  setLinea,
  setObservaciones,
}: {
  lote?: LoteAserrio | null;
  titulo?: string;
  codigosUsados: string[];
  paquetes: PaqueteBorrador[];
  dia: string;
  linea: string;
  observaciones: string;
  setPaquetes: Setter<PaqueteBorrador[]>;
  setDia: Setter<string>;
  setSemana: Setter<string>;
  setLinea: Setter<string>;
  setObservaciones: Setter<string>;
}) {
  /**
   * El borrador de la carga, guardado por corrida (B1).
   *
   * Cerrar el modal con catorce paquetes cargados los perdía todos, y volver a
   * tipearlos es media hora. Mismo patrón que la selección de trozas del panel
   * del lote: se guarda en cada cambio y se recupera al abrir.
   *
   * ⚠️ Al recuperar se DESCARTA lo que la corrida ya declaró (por código): si
   * el guardado salió bien y el modal se reabre, el borrador viejo volvería a
   * proponer paquetes que ya están en el libro — declararlos dos veces.
   */
  /**
   * ⚠️ La clave lleva el TENANT adelante (auditoría 2026-09-11, crítico).
   *
   * Sin lote, la clave salía del título — y el título no es único entre los dos
   * libros hermanos (ADR-395): «Terminar de declarar la corrida N° 19» existe
   * en los dos, porque `lineNo` es correlativo POR tenant. Como cambiar de
   * operación sólo swapea la cookie y recarga la misma URL, el `localStorage`
   * es el mismo: los paquetes cargados en una operación aparecían precargados
   * en el acta de la OTRA, y el filtro de recuperación no los ve (descarta por
   * código ya declarado en ESA corrida, y los del otro libro tienen otros).
   */
  const claveBorrador = `buleje-ctp-produccion-borrador:${tenantDeLaClave()}:${lote?.id ?? titulo ?? "produccion"}`;
  const [borradorRecuperado, setBorradorRecuperado] = useState(0);
  const borradorLeido = useRef(false);
  useEffect(() => {
    if (borradorLeido.current) return;
    borradorLeido.current = true;
    try {
      const crudo = localStorage.getItem(claveBorrador);
      if (!crudo) return;
      const b = JSON.parse(crudo) as {
        paquetes?: PaqueteBorrador[];
        dia?: string;
        linea?: string;
        observaciones?: string;
      };
      const yaEnElLibro = new Set(codigosUsados);
      const rescatados = (b.paquetes ?? []).filter((p) => p?.codigo && !yaEnElLibro.has(p.codigo));
      if (rescatados.length === 0) {
        localStorage.removeItem(claveBorrador);
        return;
      }
      setPaquetes(rescatados);
      if (b.dia) {
        setDia(b.dia);
        /* La tira sigue al borrador: si no, el día recuperado quedaba fuera de
           la semana a la vista y ningún casillero aparecía marcado. */
        setSemana(b.dia);
      }
      if (b.linea) setLinea(b.linea);
      if (b.observaciones) setObservaciones(b.observaciones);
      setBorradorRecuperado(rescatados.length);
    } catch {
      /* JSON corrupto, storage bloqueado o modo privado: se arranca en blanco,
         que es como estaba antes. Un borrador nunca puede romper la carga. */
    }
  }, [claveBorrador, codigosUsados]);
  useEffect(() => {
    /* No escribir ANTES de leer: el efecto de guardado corre en el primer
       render y pisaría el borrador con el estado vacío — el mismo bug que borró
       los precios por especie del cubicador. */
    if (!borradorLeido.current) return;
    try {
      if (paquetes.length === 0) localStorage.removeItem(claveBorrador);
      else
        localStorage.setItem(
          claveBorrador,
          JSON.stringify({ paquetes, dia, linea, observaciones }),
        );
    } catch {
      /* Sin persistencia se sigue cargando igual: es una red, no un requisito. */
    }
  }, [claveBorrador, paquetes, dia, linea, observaciones]);
  const descartarBorrador = () => {
    setPaquetes([]);
    setBorradorRecuperado(0);
    try {
      localStorage.removeItem(claveBorrador);
    } catch {
      /* idem */
    }
  };

  return { claveBorrador, borradorRecuperado, descartarBorrador };
}
