/**
 * Lo que se hace con UN paquete: por qué no entra, agregarlo (o N iguales),
 * traerlo al formulario para corregirlo o duplicarlo, y salir de la edición.
 *
 * Movido tal cual desde `CtpRegistrarProduccionModal.tsx` (28-10). No usa
 * hooks: son las mismas funciones que vivían en el cuerpo del componente y se
 * rehacen en cada render, como antes.
 */
import type { Dispatch, SetStateAction } from "react";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { RENDIMIENTO_TOPE_PCT, type PaqueteBorrador } from "@/lib/forestal/produccion-paquetes";
import type { CuentasProduccion } from "./use-cuentas-produccion";
import type { PaqueteForm } from "./use-paquete-form";
import type { MaterialAConsumir } from "./tipos";

export function accionesDelPaquete(
  f: PaqueteForm,
  c: CuentasProduccion,
  {
    material,
    paquetes,
    setPaquetes,
  }: {
    material: MaterialAConsumir;
    paquetes: PaqueteBorrador[];
    setPaquetes: Dispatch<SetStateAction<PaqueteBorrador[]>>;
  },
) {
  const {
    codigo,
    setCodigo,
    producto,
    setProducto,
    presentacion,
    setPresentacion,
    setPresentacionAuto,
    setCantidad,
    setVolumen,
    editandoId,
    setEditandoId,
    setRepetir,
    cantidadRef,
    dimensionar,
    setDimensionar,
    espesor,
    setEspesor,
    ancho,
    setAncho,
    largo,
    setLargo,
    obsPaquete,
    setObsPaquete,
    proponerCodigo,
    codigoTocado,
    sugeridoRef,
  } = f;
  const { piezas, volumenAUsar, veces, margenParaEste, tope } = c;

  /**
   * Por qué este paquete no entra. `null` = entra.
   *
   * El tope se chequea ANTES de agregarlo y no después: dejarlo entrar para
   * marcarlo en rojo obliga a borrarlo, y entre agregar y borrar el operador ya
   * tipeó el siguiente (ADR-358).
   */
  const noEntra: string | null = !codigo.trim()
    ? "Pon el código del paquete."
    : !(volumenAUsar && volumenAUsar > 0)
      ? "Pon el volumen del paquete."
      : material.volumenM3 > 0 && volumenAUsar * veces > margenParaEste
        ? margenParaEste > 0
          ? veces > 1
            ? `${veces} paquetes de ${fmtM3(volumenAUsar)} m³ pasan el tope del ${RENDIMIENTO_TOPE_PCT} %: entran ${fmtM3(margenParaEste)} m³ más (${Math.floor(margenParaEste / volumenAUsar)} paquete(s)).`
            : `Ese paquete pasa el tope del ${RENDIMIENTO_TOPE_PCT} %: entran ${fmtM3(margenParaEste)} m³ más.`
          : `Ya se llegó al tope del ${RENDIMIENTO_TOPE_PCT} % (${fmtM3(tope)} m³). Saca un paquete para agregar otro.`
        : null;

  /** Los campos del paquete, tal como quedaron en el formulario. */
  function camposDelForm(id: string, cod: string): PaqueteBorrador {
    return {
      id,
      codigo: cod,
      productType: producto,
      presentacion,
      cantidad: piezas,
      volumenM3: volumenAUsar as number,
      espesorCm: dimensionar ? Number(espesor) || null : null,
      anchoCm: dimensionar ? Number(ancho) || null : null,
      largoM: dimensionar ? Number(largo) || null : null,
      observations: obsPaquete.trim(),
    };
  }

  /** Deja el formulario listo para el paquete siguiente, con el código libre. */
  function prepararSiguiente(ocupados: readonly string[]) {
    const siguiente = proponerCodigo(ocupados);
    setCodigo(siguiente);
    sugeridoRef.current = siguiente;
    codigoTocado.current = false;
    setObsPaquete("");
    setRepetir("1");
    /* `preventScroll`: enfocar sin arrastrar el scroll del modal. Sin esto,
       cada paquete agregado saltaba la vista al medio del formulario y tapaba
       la franja de estado y la lista. */
    cantidadRef.current?.focus({ preventScroll: true });
  }

  function agregar() {
    /* El guard vive en `noEntra` (que es lo que apaga el botón y explica por
       qué): acá sólo se re-afirma el tipo, porque TS no lo puede deducir de él. */
    if (noEntra || !(volumenAUsar && volumenAUsar > 0)) return;

    /* Corrigiendo: se reemplaza EN SU LUGAR, conservando el id y la posición.
       Sacarlo y volver a agregarlo lo mandaría al final de la lista, y el orden
       de los paquetes es el orden en que salieron de la sierra. */
    if (editandoId) {
      const cod = codigo.trim();
      setPaquetes((prev) => prev.map((p) => (p.id === editandoId ? camposDelForm(p.id, cod) : p)));
      setEditandoId(null);
      prepararSiguiente([cod]);
      return;
    }

    /* N paquetes iguales de una (A1): cada uno con el próximo código libre.
       Los ya creados en este mismo click viajan como ocupados —todavía no
       están en el estado— para que la serie no se repita. */
    const nuevos: PaqueteBorrador[] = [];
    const usados: string[] = [];
    for (let k = 0; k < veces; k++) {
      const cod = k === 0 ? codigo.trim() : proponerCodigo(usados);
      if (!cod) break;
      usados.push(cod);
      nuevos.push(camposDelForm(`${Date.now()}-${paquetes.length + k}`, cod));
    }
    setPaquetes((prev) => [...prev, ...nuevos]);
    /* El resto de los campos QUEDA: una jornada carga veinte paquetes iguales
       cambiando el número. */
    prepararSiguiente(usados);
  }

  /**
   * Traer un paquete de la lista al formulario.
   *
   * `editar` lo corrige en su lugar; `duplicar` lo usa de molde y le da el
   * próximo código libre — que es como se cargan dos atados iguales seguidos.
   */
  function cargarEnForm(p: PaqueteBorrador, modo: "editar" | "duplicar") {
    setProducto(p.productType);
    setPresentacion(p.presentacion);
    setPresentacionAuto(false);
    setCantidad(p.cantidad ? String(p.cantidad) : "");
    setObsPaquete(p.observations ?? "");
    setRepetir("1");
    const dim = p.espesorCm != null && p.anchoCm != null && p.largoM != null;
    setDimensionar(dim);
    setEspesor(dim ? String(p.espesorCm) : "");
    setAncho(dim ? String(p.anchoCm) : "");
    setLargo(dim ? String(p.largoM) : "");
    setVolumen(dim ? "" : String(p.volumenM3));
    if (modo === "editar") {
      setEditandoId(p.id);
      setCodigo(p.codigo);
      codigoTocado.current = true;
    } else {
      setEditandoId(null);
      const cod = proponerCodigo([p.codigo]);
      setCodigo(cod);
      sugeridoRef.current = cod;
      codigoTocado.current = false;
    }
    /* `preventScroll`: enfocar sin arrastrar el scroll del modal. Sin esto,
       cada paquete agregado saltaba la vista al medio del formulario y tapaba
       la franja de estado y la lista. */
    cantidadRef.current?.focus({ preventScroll: true });
  }

  /** Salir de la edición sin tocar el paquete. */
  function cancelarEdicion() {
    setEditandoId(null);
    prepararSiguiente([]);
  }

  return { noEntra, prepararSiguiente, agregar, cargarEnForm, cancelarEdicion };
}
