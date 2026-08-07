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
} from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { CtpEntry, CtpSection } from "./ctp-section-shared";

/** Un lote abierto con lo que tiene esperando la sierra. */
export interface LoteConMadera {
  lote: LoteAserrio;
  piezas: number;
  volumenM3: number;
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
  const lista: MenuAccion[] = lotes.map(({ lote, piezas, volumenM3 }) => {
    const cuantas = piezas || lote.piezas;
    return {
      id: lote.id,
      label: `${lote.code} · ${lote.speciesCommon}`,
      hint: `${cuantas} pieza${cuantas === 1 ? "" : "s"} esperando la sierra`,
      meta: `${volumenM3.toFixed(4)} m³`,
      icon: Layers,
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
  onDeclarar: (corrida: CtpEntry) => void,
): MenuAccion[] {
  return enProceso.map((c) => ({
    id: c.id,
    /* La CORRIDA primero y el lote como referencia: al revés («LA-2026-025 · N°
       95034») el menú se leía como una lista de lotes para producir, y al
       elegir salía el modal de cerrar una corrida ya consumida. Son dos actos
       distintos y el rótulo tiene que decir cuál es cuál. */
    label: `Corrida N° ${c.lineNo}${c.materiaPrimaRef ? ` · del lote ${c.materiaPrimaRef}` : ""}`,
    hint: "Ya consumió su madera: falta declarar qué salió de la sierra",
    meta: `${Number(c.volumeInputM3 ?? 0).toFixed(4)} m³`,
    icon: Boxes,
    onSelect: () => onDeclarar(c),
  }));
}
