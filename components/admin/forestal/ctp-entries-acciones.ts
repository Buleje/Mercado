/**
 * Los tres menús de la barra de Producción/Despacho (ADR-360).
 *
 * Son configuración, no vista: qué se ofrece, con qué explicación y con qué
 * cifra al lado. Viven fuera del componente porque la vista ya pasaba de 300
 * líneas y porque acá se leen los tres juntos —que es como se decide qué queda
 * a la vista y qué se pliega—.
 *
 * La regla que los ordena: a la barra sale lo de todos los días (buscar,
 * filtrar, el CTA) y lo que es DEUDA del libro (una corrida abierta sin
 * declarar); al menú, lo que se hace de vez en cuando.
 */

import {
  Boxes,
  Calculator,
  ClipboardList,
  Download,
  FileText,
  Layers,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  Table,
} from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { CtpEntry, CtpSection } from "./ctp-section-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Un lote abierto con lo que tiene esperando la sierra. */
export interface LoteConMadera {
  lote: LoteAserrio;
  piezas: number;
  volumenM3: number;
  /** m³ que le quedan por declarar debajo del tope — la recuperación (ADR-365). */
  margenM3?: number;
  /** Nació de una declaración de inventario: no tiene trozas que tildar. */
  inventario?: boolean;
}

/** Lo que se hace de vez en cuando: descargar, recargar y las del período. */
export function accionesDeSeccion({
  section,
  visibles,
  cargando,
  totalAnexos,
  onDescargar,
  onRecargar,
  onSimular,
  onParteDeTurno,
  onAnexos,
  onLibro,
}: {
  section: CtpSection;
  /** Cuántas líneas hay bajo el filtro actual (es lo que se descarga). */
  visibles: number;
  cargando: boolean;
  totalAnexos: number;
  onDescargar: () => void;
  onRecargar: () => void;
  onSimular: () => void;
  onParteDeTurno: () => void;
  onAnexos: () => void;
  /**
   * Abrir el LIBRO de producción —la tabla «Todos / Registrados»— en un modal
   * (Brandon, 2026-09-02). La pantalla de Producción es para trabajar sobre el
   * lote que entra a la sierra; lo ya registrado se consulta, y una consulta no
   * necesita ocupar el lugar donde se decide.
   */
  onLibro?: () => void;
}): MenuAccion[] {
  const lista: MenuAccion[] = [
    {
      id: "descargar",
      label: "Descargar en Excel",
      hint: `${visibles === 1 ? "La línea" : `Las ${visibles} líneas`} de este filtro, con las columnas ya separadas`,
      icon: Download,
      disabled: visibles === 0,
      onSelect: onDescargar,
    },
    {
      id: "recargar",
      label: "Recargar",
      hint: "Volver a pedir el período al servidor (atajo: R)",
      icon: RefreshCw,
      busy: cargando,
      onSelect: onRecargar,
    },
  ];

  if (section === "produccion") {
    if (onLibro) {
      /* Primero de la lista: es la consulta de todos los días —«¿qué declaré
         este mes?»— y antes vivía a la vista, ocupando la pantalla entera. */
      lista.unshift({
        id: "libro",
        label: "Producción · Todos y registrados",
        hint: "La tabla del libro en grande: las corridas del período con sus chips Todos / Registrados",
        icon: Table,
        meta: visibles > 0 ? String(visibles) : undefined,
        onSelect: onLibro,
      });
    }
    lista.push(
      {
        id: "simular",
        label: "Simular una corrida",
        hint: "Previsualizá producido, costo y margen antes de registrarla — no guarda nada",
        icon: Calculator,
        onSelect: onSimular,
      },
      {
        id: "parte",
        label: "Importar parte de turno",
        hint: "Carga masiva de corridas desde el parte del turno (ADR-323)",
        icon: ClipboardList,
        onSelect: onParteDeTurno,
      },
    );
  } else {
    lista.push({
      id: "anexos",
      label: "Anexos N° 04 emitidos",
      hint: "Re-imprimir, buscar o bajar en Excel los anexos ya emitidos",
      icon: FileText,
      meta: totalAnexos > 0 ? String(totalAnexos) : undefined,
      onSelect: onAnexos,
    });
  }

  return lista;
}

/**
 * El CTA de Producción: elegir el lote que entra a la sierra.
 *
 * Antes esto era un `<select>` al lado de un botón «Nueva producción» que abría
 * un formulario en blanco — dos caminos para el mismo acto, y el del formulario
 * pedía a mano lo que el lote ya sabe (especie, permisos, materia prima). Queda
 * uno solo, y cada lote muestra con cuánto llega: se elige por peso, no por
 * nombre, que el código del lote no dice nada.
 */
export function accionesDeLotes({
  lotes,
  loteAbierto,
  onElegir,
  onIr,
}: {
  lotes: LoteConMadera[];
  /** El lote cuyo panel está abierto: se marca y volver a elegirlo lo cierra. */
  loteAbierto: string;
  onElegir: (loteId: string) => void;
  onIr?: (vista: string) => void;
}): MenuAccion[] {
  const lista: MenuAccion[] = lotes.map(({ lote, volumenM3, margenM3 = 0, inventario = false, piezas: libres }) => {
    /*
     * `libres` son las piezas del lote que TODAVÍA no entraron a una corrida —
     * las únicas que se pueden meter a la sierra hoy.
     *
     * Antes acá había `piezas || lote.piezas`, y ese fallback mentía: sobre un
     * lote ya aserrado, `libres` es 0 y `lote.piezas` sigue contando las tres
     * que ya se consumieron, así que el menú prometía «3 piezas esperando la
     * sierra» al lado de «0.000 m³». Medido en pantalla con LA-2026-050.
     */
    const soloMargen = libres === 0 && margenM3 > 0.01;
    return {
      id: lote.id,
      label: `${lote.code} · ${lote.speciesCommon}`,
      hint: soloMargen
        ? "Ya aserrado: queda volumen por declarar (recuperación)"
        : inventario
          ? "Declarado por inventario: su volumen se declara directo"
          : libres > 0
            ? `${libres} pieza${libres === 1 ? "" : "s"} esperando la sierra` +
              (margenM3 > 0.01 ? ` · y ${fmtM3(margenM3)} m³ por declarar` : "")
            : "Sin piezas libres — abrilo para ver qué tiene",
      meta: soloMargen ? `${fmtM3(margenM3)} m³` : `${fmtM3(volumenM3)} m³`,
      icon: inventario ? ClipboardList : soloMargen ? RotateCcw : Layers,
      activo: loteAbierto === lote.id,
      onSelect: () => onElegir(lote.id),
    };
  });

  if (onIr) {
    lista.push({
      id: "ir-lotes",
      label: lotes.length === 0 ? "Programar un lote" : "Armar otro lote",
      hint: "Se aparta la madera del patio que entra junta al carro",
      icon: PackageOpen,
      onSelect: () => onIr("lotes"),
    });
  }

  return lista;
}

/** Las corridas que consumieron y no dijeron qué salió (ADR-340). Son deuda del
 *  libro, no una opción más: van en su propio botón, con el número. */
export function accionesPorDeclarar(
  enProceso: CtpEntry[],
  /** Elegir una ABRE SU PANEL arriba de la tabla, con sus trozas a la vista. */
  onAbrir: (corrida: CtpEntry) => void,
  /** La que ya está abierta: se marca, y volver a elegirla cierra el panel. */
  abiertaId?: string | null,
): MenuAccion[] {
  return enProceso.map((c) => ({
    id: c.id,
    /* La CORRIDA primero y el lote como referencia: al revés («LA-2026-025 · N°
       95034») el menú se leía como una lista de lotes para producir, y al
       elegir salía el modal de cerrar una corrida ya consumida. Son dos actos
       distintos y el rótulo tiene que decir cuál es cuál. */
    label: `Corrida N° ${c.lineNo}${c.materiaPrimaRef ? ` · del lote ${c.materiaPrimaRef}` : ""}`,
    hint: "Ya consumió su madera: abre sus trozas para declarar qué salió de la sierra",
    meta: `${fmtM3(Number(c.volumeInputM3 ?? 0))} m³`,
    icon: Boxes,
    activo: abiertaId === c.id,
    onSelect: () => onAbrir(c),
  }));
}
