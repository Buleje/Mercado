"use client";

/**
 * «Excel» en «Anotar a mano» del despacho con guía (Brandon 16-10): descarga
 * el formato para rellenar (científico, común, codificación, D1, D2, L,
 * cantidad y volumen Smalian SERFOR) y, al importarlo, suma sus filas a la
 * lista de trozas por el mismo camino que el alta a mano (`agregarVarias`):
 * la misma revisión, el mismo borrador, la misma numeración al registrar.
 * El formato y su lectura viven en `loth-trozas-a-mano-excel`.
 */

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import { TROZAS_POR_GUIA_MAX } from "@/lib/forestal/loth-trozas-a-mano";
import { descargarFormatoTrozas, trozasDelFormato } from "@/lib/forestal/loth-trozas-a-mano-excel";
import { logger } from "@/lib/logger";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import type { CatalogoUI } from "./ctp-especie-campo";

interface Aviso {
  tono: "ok" | "error";
  texto: string;
  detalle: string[];
}

const DETALLE_A_LA_VISTA = 4;

export function useExcelDeTrozas(g: DespachoGuiaLoth, catalogo: CatalogoUI) {
  const archivo = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const caben = TROZAS_POR_GUIA_MAX - g.piezas.length;

  async function bajar() {
    setOcupado(true);
    try {
      await descargarFormatoTrozas(catalogo.nombres.map((comun) => ({ comun, cientifico: catalogo.cientificoDe(comun) })));
    } catch (e) {
      logger.error("[trozas-excel] formato failed", { error: String(e) });
      setAviso({ tono: "error", texto: "No se pudo armar el formato. Vuelve a intentarlo.", detalle: [] });
    } finally {
      setOcupado(false);
    }
  }

  async function importar(file: File) {
    setOcupado(true);
    setAviso(null);
    try {
      const r = trozasDelFormato(await leerArchivoAFilas(file), { nombres: catalogo.nombres, cientificoDe: catalogo.cientificoDe, caben });
      if (r.sinEncabezado) {
        setAviso({ tono: "error", texto: "No encontré las columnas D1, L y Nombre común: usa el formato que se descarga acá.", detalle: [] });
        return;
      }
      if (r.trozas.length === 0) {
        setAviso({ tono: "error", texto: r.errores.length ? "Ninguna fila entró." : "El archivo no trae trozas.", detalle: r.errores });
        return;
      }
      if (r.desde && g.aMano.filas.length === 0 && g.aMano.desde === 1) g.aMano.setDesde(r.desde);
      g.aMano.agregarVarias(r.trozas);
      const filas = `${r.trozas.length} fila${r.trozas.length === 1 ? "" : "s"}`;
      const trozas = `${r.cuantas} troza${r.cuantas === 1 ? "" : "s"}`;
      setAviso({
        tono: r.errores.length ? "error" : "ok",
        texto: `Importé ${filas} (${trozas})${r.errores.length ? `; ${r.errores.length} no ${r.errores.length === 1 ? "entró" : "entraron"}` : ""}.`,
        detalle: [...r.errores, ...r.avisos],
      });
    } catch (e) {
      logger.error("[trozas-excel] importar failed", { error: String(e) });
      setAviso({ tono: "error", texto: "No se pudo leer el archivo. ¿Es un .xlsx o .csv?", detalle: [] });
    } finally {
      setOcupado(false);
    }
  }

  return { archivo, ocupado, aviso, setAviso, caben, bajar, importar };
}

type ExcelDeTrozas = ReturnType<typeof useExcelDeTrozas>;

/** El botón «Excel» con sus dos opciones y el campo de archivo escondido. */
export function BotonExcelDeTrozas({ x }: { x: ExcelDeTrozas }) {
  return (
    <div className="shrink-0">
      <input
        ref={x.archivo}
        type="file"
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="sr-only"
        aria-label="Importar el formato de la lista de trozas"
        data-qa="trozas-excel-archivo"
        tabIndex={-1}
        onChange={(e) => {
          const a = e.target.files?.[0];
          if (a) void x.importar(a);
          e.target.value = "";
        }}
      />
      <ActionMenu
        label="Excel"
        icon={FileSpreadsheet}
        compactoEnMovil
        actions={[
          {
            id: "formato",
            label: "Descargar formato",
            hint: "Científico, común, codificación, D1, D2, L, cantidad y volumen Smalian",
            icon: Download,
            busy: x.ocupado,
            onSelect: () => void x.bajar(),
          },
          {
            id: "importar",
            label: "Importar formato lleno",
            hint: x.caben > 0 ? "Sus filas se suman a la lista de trozas" : `La guía ya lleva ${TROZAS_POR_GUIA_MAX} trozas`,
            icon: Upload,
            busy: x.ocupado,
            disabled: x.caben <= 0,
            onSelect: () => x.archivo.current?.click(),
          },
        ]}
      />
    </div>
  );
}

/** Lo que dejó la importación: una línea y, debajo, las filas que no entraron. */
export function AvisoExcelDeTrozas({ x }: { x: ExcelDeTrozas }) {
  const a = x.aviso;
  if (!a) return null;
  const resto = a.detalle.length - DETALLE_A_LA_VISTA;
  return (
    <div
      role="status"
      data-qa="trozas-excel-aviso"
      className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-sm ${
        a.tono === "ok"
          ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]"
          : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
      }`}
    >
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1 font-semibold">{a.texto}</span>
        <button type="button" onClick={() => x.setAviso(null)} className="-my-1 shrink-0 px-2 py-1 text-xs font-bold underline underline-offset-2">
          Cerrar
        </button>
      </span>
      {a.detalle.slice(0, DETALLE_A_LA_VISTA).map((d) => (
        <span key={d} className="text-xs">
          {d}
        </span>
      ))}
      {resto > 0 && <span className="text-xs">y {resto} más.</span>}
    </div>
  );
}
