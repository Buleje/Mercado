"use client";

import { useMemo, useState } from "react";
import { BookOpenText, CalendarClock, Eye, Lightbulb, ListChecks, Star, X } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import {
  sugerirEsenciales, vencimientosEncontrados, type CarpetaEsencial, type UsoDoc,
} from "@/lib/documentos/esenciales";
import type { ModeloArchivo } from "../archivo/use-archivo";
import AvisosCabecera, { type AvisoCabecera } from "../AvisosCabecera";
import { useLeerPapeles } from "./LeerPapeles";
import SugerenciasEsenciales from "./SugerenciasEsenciales";
import VencimientosEncontrados from "./VencimientosEncontrados";
import { marcarEsenciales } from "./marcar-esencial";

/**
 * Lo que Esenciales te pide resolver (Brandon 23-10): las fechas de vencimiento
 * que la lectura encontró, «leer todo lo que falta» de una vez, y las carpetas
 * que abres seguido. Sin carpetas esenciales, sólo las sugerencias (para
 * arrancar), en su fila.
 *
 * 31-10 (Brandon: «que pase arriba… para que ocupe menos espacio; aplicarlo lo
 * mismo a Esenciales»): con esenciales, los tres van al menú «Avisos» de la
 * fila de las pestañas de Documentos; las fechas y las sugeridas se abren
 * debajo sólo si las pides. Antes eran dos o tres filas encima de las tarjetas.
 */
export default function AvisosEsenciales({ arch, todas, vivos, uso, abrir, soloSugerencias = false }: {
  arch: ModeloArchivo;
  todas: readonly CarpetaEsencial<DbDocumentFolder>[];
  vivos: readonly DbDocument[];
  uso: Record<string, UsoDoc>;
  abrir: (doc: DbDocument, lista: readonly DbDocument[]) => void;
  soloSugerencias?: boolean;
}) {
  const { folders, bulkFolders, aplicarSugerencia, descartarSugerencia, sugDescartadas } = arch;
  const [fuera, setFuera] = useLocalStorage<string[]>("documentos-esenciales-sugerencias-fuera", []);

  const sugeridas = useMemo(
    () => sugerirEsenciales({ carpetas: folders, docs: vivos, uso, descartadas: fuera }),
    [folders, vivos, uso, fuera],
  );
  // Los papeles de TODAS las esenciales (con sus subcarpetas).
  const deEsenciales = useMemo(() => {
    const ids = new Set(todas.flatMap((e) => [...e.carpetaIds]));
    return vivos.filter((d) => !!d.folderId && ids.has(d.folderId));
  }, [todas, vivos]);
  const fechas = useMemo(() => vencimientosEncontrados(deEsenciales, sugDescartadas), [deEsenciales, sugDescartadas]);

  const lectura = useLeerPapeles(deEsenciales, arch);
  const [verFechas, setVerFechas] = useState(false);
  const [verSugeridas, setVerSugeridas] = useState(false);

  const filaSugeridas = (
    <SugerenciasEsenciales
      sugerencias={sugeridas}
      onSumar={(f) => void marcarEsenciales(bulkFolders, [f], true)}
      onDescartar={(id) => setFuera([...fuera, id])}
    />
  );
  if (soloSugerencias) return filaSugeridas;

  const avisos: AvisoCabecera[] = [];
  if (fechas.length > 0) {
    avisos.push({
      id: "fechas", tono: "warning", icono: CalendarClock,
      corto: fechas.length === 1 ? "1 fecha por confirmar" : `${fechas.length} fechas por confirmar`,
      titulo: "Fechas de vencimiento encontradas",
      detalle: "Al leer los papeles se halló una fecha que todavía no está puesta. Al confirmarla te avisamos por WhatsApp y en la campana antes de que venza.",
      accion: { id: "fechas-ver", label: verFechas ? "Cerrar las fechas" : "Revisar y confirmar", icon: ListChecks, activo: verFechas, onSelect: () => setVerFechas((v) => !v) },
    });
  }
  if (lectura.faltan.length > 0 || lectura.progreso) {
    const p = lectura.progreso;
    const n = lectura.faltan.length;
    avisos.push({
      id: "sin-leer", tono: "accent", icono: BookOpenText,
      corto: p ? `Leyendo ${p.hechos} de ${p.total}` : n === 1 ? "1 papel sin leer" : `${n} papeles sin leer`,
      titulo: "Leer los papeles",
      detalle: "El sistema lee el texto de cada papel (los escaneados también) y lo guarda: después los encuentras buscando lo que dicen, no sólo su nombre. El texto se lee gratis; la descripción usa la IA si hay cupo.",
      accion: { id: "sin-leer-leer", label: p ? "Leyendo…" : n === 1 ? "Leerlo" : "Leerlos", icon: BookOpenText, busy: !!p, onSelect: () => void lectura.leer() },
    });
  }
  if (sugeridas.length > 0) {
    avisos.push({
      id: "sugeridas", tono: "neutro", icono: Lightbulb,
      corto: sugeridas.length === 1 ? "1 sugerida" : `${sugeridas.length} sugeridas`,
      titulo: "Carpetas que abres seguido",
      detalle: "Sus papeles los abriste varias veces en los últimos 90 días y no están en Esenciales.",
      accion: { id: "sugeridas-ver", label: verSugeridas ? "Cerrar las sugeridas" : "Ver las sugeridas", icon: Eye, activo: verSugeridas, onSelect: () => setVerSugeridas((v) => !v) },
      opciones: sugeridas.flatMap(({ carpeta, vistas }) => [
        { id: `sumar-${carpeta.id}`, label: `Sumar «${carpeta.name}»`, hint: `Abierta ${vistas === 1 ? "1 vez" : `${vistas} veces`} en 90 días`, icon: Star, onSelect: () => void marcarEsenciales(bulkFolders, [carpeta], true) },
        { id: `no-sugerir-${carpeta.id}`, label: `No sugerir «${carpeta.name}»`, icon: X, onSelect: () => setFuera([...fuera, carpeta.id]) },
      ]),
    });
  }

  return (
    <>
      <AvisosCabecera avisos={avisos} />
      {verFechas && (
        <VencimientosEncontrados
          items={fechas}
          onConfirmar={(id, fecha) => aplicarSugerencia(id, { expiresAt: fecha })}
          onDescartar={descartarSugerencia}
          onAbrir={(doc) => abrir(doc, fechas.map((x) => x.doc))}
        />
      )}
      {verSugeridas && filaSugeridas}
    </>
  );
}
