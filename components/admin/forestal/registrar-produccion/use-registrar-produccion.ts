/**
 * Todo el estado de «Registrar producción», en un solo lugar.
 *
 * La ventana pasó de una pantalla de 28 campos a tres pasos (28-10), pero los
 * pasos son sólo PANTALLA: este hook es el cuerpo del componente viejo, con
 * los mismos estados, los mismos efectos y en el mismo orden (jornadas →
 * serie de la planta → medidas → código sugerido → borrador leído → borrador
 * guardado → Ctrl+Enter). Lo que `confirmar` entrega es lo que entregaba.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useJornadasDeProduccion } from "../hooks/use-jornadas-produccion";
import type { CobroAserrioValor } from "@/lib/forestal/tarifa-aserrio";
import type { PaqueteBorrador } from "@/lib/forestal/produccion-paquetes";
import { accionesDelPaquete } from "./acciones-del-paquete";
import { useBorradorProduccion } from "./use-borrador-produccion";
import { useCuentasProduccion } from "./use-cuentas-produccion";
import { usePaqueteForm } from "./use-paquete-form";
import type { RegistrarProduccionProps } from "./tipos";

export function useRegistrarProduccion({
  lote,
  material,
  fecha,
  guardando,
  titulo,
  yaDeclaradoM3 = 0,
  paquetesPrevios,
  productoInicial,
  cobroInicial,
  onConfirmar,
}: RegistrarProduccionProps) {
  const [dia, setDia] = useState(fecha);
  /* La semana que se está MIRANDO en la tira de días: arranca en la del día
     elegido y se mueve con las flechas sin cambiar el día. */
  const [semana, setSemana] = useState(fecha);
  const jornadas = useJornadasDeProduccion(semana);
  const [linea, setLinea] = useState("LP");
  const [observaciones, setObservaciones] = useState("");
  const [paquetes, setPaquetes] = useState<PaqueteBorrador[]>([]);
  /* Quién es el dueño de esta madera y a qué precio se le asierra (ADR-412).
     Arranca con el dueño que la corrida YA tiene (`cobroInicial`) — no en
     blanco — para que "no toqué nada" y "elegí sacarle el dueño" sean cosas
     distintas (ver `duenoTocado`/`precioTocado` y el comentario en `confirmar`). */
  const [aserrio, setAserrio] = useState<CobroAserrioValor>({
    duenoParteId: cobroInicial?.duenoParteId ?? null,
    precioManualPt: cobroInicial?.precioManualPt ?? null,
  });
  const [duenoTocado, setDuenoTocado] = useState(false);
  const [precioTocado, setPrecioTocado] = useState(false);
  /* "A mano" con el campo vacío mientras el botón sigue en "a mano" no se
     puede guardar (ver `CtpCobroAserrio`): sin esto el Ctrl+Enter/botón
     guardaba igual y mandaba `null` (tarifa) sin que nadie lo eligiera. */
  const [aserrioValido, setAserrioValido] = useState(true);

  // ── El formulario de «Agregar producción» ──
  const codigosUsados = useMemo(
    () => (paquetesPrevios ?? []).map((p) => p.codigo),
    [paquetesPrevios],
  );
  const f = usePaqueteForm({ productoInicial, codigosUsados, paquetes });
  const b = useBorradorProduccion({
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
  });
  const c = useCuentasProduccion({
    material,
    yaDeclaradoM3,
    paquetesPrevios,
    productoInicial,
    guardando,
    codigosUsados,
    paquetes,
    aserrioValido,
    cantidad: f.cantidad,
    espesor: f.espesor,
    ancho: f.ancho,
    largo: f.largo,
    dimensionar: f.dimensionar,
    volumen: f.volumen,
    editandoId: f.editandoId,
    repetir: f.repetir,
  });
  const { claveBorrador } = b;
  const { listo, totales } = c;

  /**
   * Guardar: se limpia el borrador y se entrega.
   *
   * Se limpia ACÁ y no al cerrar: si el guardado falla, el modal queda abierto
   * con los paquetes en pantalla y se puede reintentar. Dejar el borrador vivo
   * después de un guardado exitoso es peor — al reabrir propondría declarar de
   * nuevo lo que ya está en el libro.
   */
  const confirmar = useCallback(() => {
    if (!listo) return;
    try {
      localStorage.removeItem(claveBorrador);
    } catch {
      /* storage bloqueado */
    }
    onConfirmar({
      fecha: dia,
      lineaProduccion: linea,
      observaciones: observaciones.trim() || null,
      paquetes,
      volumen: totales.volumen,
      /* Ausente si no se tocó nada: el contrato de la PATCH dice que eso NO
         cambia el cobro que la corrida ya tenía. Cada clave viaja SÓLO si se
         tocó ESA parte — `duenoParteId` ausente no toca al dueño (los flujos
         que no lo conocen de antemano no pueden borrarlo por tocar sólo el
         precio) y `precioManualPt` ausente no toca el trato de precio. */
      aserrio:
        !duenoTocado && !precioTocado
          ? undefined
          : {
              ...(duenoTocado ? { duenoParteId: aserrio.duenoParteId } : {}),
              ...(precioTocado ? { precioManualPt: aserrio.precioManualPt } : {}),
            },
    });
  }, [
    listo,
    claveBorrador,
    onConfirmar,
    dia,
    linea,
    observaciones,
    paquetes,
    totales.volumen,
    aserrio,
    duenoTocado,
    precioTocado,
  ]);

  /* Ctrl+Enter guarda desde cualquier campo: con veinte paquetes cargados,
     buscar el botón con el mouse es el último peaje de la jornada. */
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        confirmar();
      }
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [confirmar]);

  const a = accionesDelPaquete(f, c, { material, paquetes, setPaquetes });

  return {
    ...f,
    ...b,
    ...c,
    ...a,
    dia,
    setDia,
    semana,
    setSemana,
    jornadas,
    linea,
    setLinea,
    observaciones,
    setObservaciones,
    paquetes,
    setPaquetes,
    aserrio,
    setAserrio,
    setDuenoTocado,
    setPrecioTocado,
    aserrioValido,
    setAserrioValido,
    codigosUsados,
    confirmar,
  };
}

export type RegistrarProduccion = ReturnType<typeof useRegistrarProduccion>;
