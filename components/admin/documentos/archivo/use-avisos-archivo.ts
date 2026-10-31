"use client";

import { useState } from "react";
import {
  AlarmClock, CalendarClock, Check, Eye, EyeOff, FolderInput, FolderOpen, ListChecks, ScanText,
  Sparkles, TriangleAlert, Wand2, X,
} from "@buleje/design-system/icons";
import { RUTA_VISTA_CAMARAS } from "@/components/admin/forestal/camaras/otra-pantalla-ui";
import { useRetencionPersonas } from "@/components/admin/forestal/camaras/use-retencion-personas";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { TAG_FOTO_PERSONA } from "@/lib/camaras/personas-retencion";
import { etiquetaParaVerFotos } from "@/lib/documents/fotos-de-maquina";
import { textoCuando } from "@/lib/documentos/aviso-vencimiento";
import { textoConteo } from "@/lib/documentos/ordenar-archivo";
import { logger } from "@/lib/logger";
import type { DbDocument } from "@/lib/types/documents";
import type { AvisoCabecera } from "../AvisosCabecera";
import { useConteoOrden } from "../ordenar/use-conteo-orden";
import { MODOS_CON_LINEA_DE_FOTOS, VISTAS_CON_CONTENIDO_PROPIO } from "./compartido";
import type { ModeloArchivo } from "./use-archivo";
import { sinCarpetaRepetida, usePropuestaCarpeta } from "./use-propuesta-carpeta";

/**
 * Los avisos del Archivo para la cabecera de Documentos (Brandon 31-10: «que
 * pase arriba… para que ocupe menos espacio»). Antes eran pastillas con
 * Ver/Revisar/✕ en una fila propia, la línea de fotos escondidas y la fila de
 * «N sin descripción» encima de la lista. Ahora cada uno es un `AvisoCabecera`
 * con su acción de un clic y el resto de sus acciones en el menú «Avisos»;
 * las listas que se abren (sugerencias de la IA, «¿Va a…?») siguen debajo.
 */

const docs = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
const papeles = (n: number) => docs(n, "papel", "papeles");
const fotos = (n: number) => docs(n, "foto", "fotos");

/** «Licencia (venció hace 3 días) · Contrato (vence HOY) y 2 más» para el tooltip. */
function nombresConFecha(items: readonly { d: DbDocument; n: number }[]): string {
  const vistos = items.slice(0, 3).map(({ d, n }) => `${d.name} (${textoCuando(n)})`).join(" · ");
  return items.length > 3 ? `${vistos} y ${items.length - 3} más` : vistos;
}

/** «DNI del jefe, Licencia y 2 más» para el tooltip. */
function nombresSimples(items: readonly DbDocument[]): string {
  const vistos = items.slice(0, 3).map((d) => d.name).join(" · ");
  return items.length > 3 ? `${vistos} y ${items.length - 3} más` : vistos;
}

export function useAvisosArchivo(arch: ModeloArchivo) {
  const { vencidosDocs, expiringDocs, expiryBannerDismissed, verVencimientos, setExpiryBannerDismissed,
    sugerenciasIA, aplicarSugerencia, aplicarTodasLasSugerencias, aplicandoTodas, setOrdenando, ordenVersion,
    vistaGeneral, filterMode, fotosEsc, verFotosDeMaquina, refresh, documents, folders, bulk, hayBusqueda,
    setMovingDoc, indexableDocs, soloSinDescribir, setSoloSinDescribir, describirFaltantes, progresoDesc,
    avisoIA, sinVenceDocs, repasoVence, setRepasoVence, repasoHechas, setRepasoHechas } = arch;

  // «¿Va a "X"?» para lo que acabas de subir y quedó suelto (24-10).
  const propuesta = usePropuestaCarpeta({ documents, folders, bulk, refresh, activo: filterMode !== "trash" && !hayBusqueda });
  const [verPropuestas, setVerPropuestas] = useState(false);
  // Las sugerencias de la IA no repiten la carpeta de un papel que ya pregunta «¿Va a…?».
  const sugerencias = sinCarpetaRepetida(sugerenciasIA, propuesta.items);
  const repetidas = sugerencias.length !== sugerenciasIA.length || sugerencias.some((s, i) => s !== sugerenciasIA[i]);
  const [verSugerencias, setVerSugerencias] = useState(false);
  const [aplicandoSinRepetir, setAplicandoSinRepetir] = useState(false);
  const aplicarTodas = async () => {
    if (!repetidas) return aplicarTodasLasSugerencias();
    setAplicandoSinRepetir(true);
    try {
      for (const { doc, carpeta, vence } of sugerencias) {
        await aplicarSugerencia(doc.id, { ...(carpeta ? { folderId: carpeta.folderId } : {}), ...(vence ? { expiresAt: vence } : {}) })
          .catch((err) => logger.warn("[documentos] sugerencia fail", { docId: doc.id, err: String(err) }));
      }
      await refresh();
    } finally {
      setAplicandoSinRepetir(false);
    }
  };
  const [vencidosDescartado, setVencidosDescartado] = useState(false);
  const ordenar = useConteoOrden(true, ordenVersion);
  const conteoFotos = fotosEsc.conteo;
  const conFotos = vistaGeneral && MODOS_CON_LINEA_DE_FOTOS.has(filterMode) && (conteoFotos?.total ?? 0) > 0;
  const hayPersonas = conFotos && (conteoFotos?.porTag[TAG_FOTO_PERSONA] ?? 0) > 0;
  // Los días se piden sólo si hay fotos de PERSONAS escondidas: es lo único que los muestra.
  const { retencion } = useRetencionPersonas(hayPersonas);

  const avisos: AvisoCabecera[] = [];

  if (vencidosDocs.length > 0 && !vencidosDescartado) {
    avisos.push({
      id: "vencidos", tono: "error", icono: TriangleAlert,
      corto: docs(vencidosDocs.length, "vencido", "vencidos"),
      titulo: "Documentos ya vencidos",
      detalle: `${nombresConFecha(vencidosDocs)}. Renueva el papel y cambia su fecha de vencimiento: así deja de salir acá.`,
      accion: { id: "vencidos-ver", label: "Ver los vencidos", icon: Eye, onSelect: () => verVencimientos("vencidos") },
      opciones: [{ id: "vencidos-ocultar", label: "Ocultar el aviso", hint: "Hasta la próxima visita", icon: X, onSelect: () => setVencidosDescartado(true) }],
    });
  }

  if (expiringDocs.length > 0 && !expiryBannerDismissed) {
    avisos.push({
      id: "por-vencer", tono: "warning", icono: AlarmClock,
      corto: `${expiringDocs.length} por vencer`,
      titulo: "Por vencer en 30 días",
      detalle: `${nombresConFecha(expiringDocs)}. Te avisamos por WhatsApp y en el panel unos 7 días antes de cada vencimiento.`,
      accion: { id: "por-vencer-ver", label: "Ver los que vencen", icon: Eye, onSelect: () => verVencimientos("porVencer") },
      opciones: [{ id: "por-vencer-ocultar", label: "Ocultar el aviso", hint: "Hasta la próxima visita", icon: X, onSelect: () => setExpiryBannerDismissed(true) }],
    });
  }

  const primera = propuesta.items[0];
  if (primera) {
    const c = primera.candidatas[0];
    const ocupado = propuesta.moviendo === primera.doc.id;
    const n = propuesta.items.length;
    avisos.push({
      id: "va-a", tono: "accent", icono: FolderInput,
      corto: `${n} por ubicar`,
      titulo: `¿Va a «${c.nombre}»?`,
      detalle: `${primera.doc.name}${n > 1 ? ` y ${papeles(n - 1)} más` : ""}: ${c.motivos.join(" · ")}. Nada se mueve solo.`,
      accion: { id: "va-a-revisar", label: verPropuestas ? "Cerrar la lista" : "Ver dónde va cada uno", icon: ListChecks, activo: verPropuestas, onSelect: () => setVerPropuestas((v) => !v) },
      opciones: [
        { id: "va-a-mover", label: `Mover a «${c.nombre}»`, hint: primera.doc.name, icon: FolderInput, busy: ocupado, onSelect: () => void propuesta.mover(primera.doc, c.folderId) },
        { id: "va-a-otra", label: "Otra carpeta…", hint: primera.doc.name, icon: FolderOpen, onSelect: () => setMovingDoc(primera.doc) },
        { id: "va-a-no", label: "No va ahí", hint: "No te lo vuelvo a proponer", icon: X, onSelect: () => propuesta.descartar(primera.doc.id) },
      ],
    });
  } else if (propuesta.leyendo.length > 0) {
    avisos.push({
      id: "va-a", tono: "neutro", icono: FolderInput,
      corto: `Leyendo ${papeles(propuesta.leyendo.length)}`,
      titulo: "Carpeta para lo que subiste",
      detalle: `Leyendo ${papeles(propuesta.leyendo.length)} para proponerte carpeta…`,
      accion: { id: "va-a-leyendo", label: "Leyendo…", icon: FolderInput, busy: true, onSelect: () => undefined },
    });
  }

  if (sugerencias.length > 0) {
    const n = sugerencias.length;
    avisos.push({
      id: "sugerencias-ia", tono: "accent", icono: Sparkles,
      corto: `${n} por ordenar`,
      titulo: "Sugerencias de la IA",
      detalle: "Al leer cada archivo, la IA propone la carpeta donde va y la fecha en que vence. Aplicarla lo mueve a esa carpeta y el vencimiento entra a tus avisos por WhatsApp.",
      accion: { id: "ia-revisar", label: verSugerencias ? "Cerrar la lista" : "Revisar una por una", icon: ListChecks, activo: verSugerencias, onSelect: () => setVerSugerencias((v) => !v) },
      opciones: n > 1
        ? [{ id: "ia-todas", label: `Aplicar las ${n}`, hint: "Guardar las carpetas y los vencimientos sugeridos de todos", icon: Check, busy: aplicandoTodas || aplicandoSinRepetir, onSelect: () => void aplicarTodas() }]
        : [],
    });
  }

  // Un vencimiento sin anotar es un aviso que nunca llega: el cron mira `expiresAt`.
  if (!VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && filterMode !== "trash" && (sinVenceDocs.length > 0 || repasoVence)) {
    const n = sinVenceDocs.length;
    avisos.push({
      id: "sin-vencimiento", tono: "warning", icono: CalendarClock,
      corto: repasoVence ? (n > 0 ? `Repaso: quedan ${n}` : "Repaso listo") : `${n} sin vencimiento`,
      titulo: "Papeles sin fecha de vencimiento",
      detalle: repasoVence
        ? `${repasoHechas === 1 ? "1 fecha anotada" : `${repasoHechas} fechas anotadas`} en este repaso. «No vence» saca el papel del repaso.`
        : `${nombresSimples(sinVenceDocs)} parecen vencer (DNI, licencia, permiso, contrato…) y no tienen fecha: sin ella no te avisamos cuando se acerque. «Repasar» los pasa uno por uno al costado, para anotar la fecha sin abrir nada más.`,
      accion: repasoVence
        ? { id: "sin-vence-salir", label: "Salir del repaso", icon: X, onSelect: () => setRepasoVence(false) }
        : { id: "sin-vence-repasar", label: "Repasar", icon: ListChecks, onSelect: () => { setRepasoHechas(0); setRepasoVence(true); } },
    });
  }

  if (ordenar.conteo) {
    const textos = ordenar.conteo.partes.map((x) => textoConteo(x.tipo, x.n));
    avisos.push({
      id: "ordenar", tono: "neutro", icono: Wand2,
      corto: textos.length === 1 ? textos[0] : `${ordenar.conteo.total} por limpiar`,
      titulo: "Ordenar mi Archivo",
      detalle: `${textos.join(" · ")}. «Revisar» te muestra cada cambio antes de hacerlo; puedes deshacerlo todo mientras esa ventana siga abierta.`,
      accion: { id: "ordenar-revisar", label: "Revisar y ordenar", icon: Wand2, onSelect: () => setOrdenando(true) },
      opciones: [{ id: "ordenar-ocultar", label: "Ocultar el aviso", hint: "Hasta que haya algo nuevo", icon: X, onSelect: ordenar.ocultar }],
    });
  }

  // Lo que todavía no se puede buscar por lo que dice: sólo aparece si te acuerdas del nombre.
  if (!VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && filterMode !== "trash" && (indexableDocs.length > 0 || soloSinDescribir)) {
    const n = indexableDocs.length;
    avisos.push({
      id: "sin-descripcion", tono: "accent", icono: ScanText,
      corto: progresoDesc ? `Describiendo ${progresoDesc.hechos}/${progresoDesc.total}` : n > 0 ? `${n} sin descripción` : "Todo descrito",
      titulo: "Sin descripción",
      detalle: [
        n > 0 ? "No aparecen cuando buscas por lo que dicen adentro. Se leen solos cada noche; con «Describirlos con IA» se apura la fila." : "Ya está todo descrito.",
        avisoIA,
      ].filter(Boolean).join(" "),
      accion: { id: "sin-desc-ver", label: soloSinDescribir ? "Ver todos" : "Ver cuáles", icon: Eye, activo: soloSinDescribir, onSelect: () => setSoloSinDescribir((v) => !v) },
      opciones: n > 0
        ? [{ id: "sin-desc-ia", label: progresoDesc ? `Describiendo ${progresoDesc.hechos}/${progresoDesc.total}…` : "Describirlos con IA", hint: "La IA lee cada uno y escribe de qué se trata (unos segundos por documento)", icon: Wand2, busy: !!progresoDesc, onSelect: () => void describirFaltantes() }]
        : [],
    });
  }

  // Las fotos de las cámaras: información, no alarma → sólo en el menú.
  if (conFotos && conteoFotos) {
    const etiqueta = etiquetaParaVerFotos(conteoFotos.porTag);
    const total = fotos(conteoFotos.total);
    avisos.push({
      id: "fotos-escondidas", tono: "neutro", icono: EyeOff, enLinea: false,
      corto: `${total} escondidas`,
      titulo: "Fotos de las cámaras",
      detalle: "Las sacan solas las cámaras y la asistencia; no son papeles tuyos, por eso no salen mezcladas. Con «Quitar» vuelves a tus papeles.",
      accion: etiqueta
        ? { id: "fotos-ver", label: `Ver las ${total}`, icon: Eye, onSelect: () => verFotosDeMaquina(etiqueta) }
        : { id: "fotos-info", label: `${total} escondidas de la vista`, icon: EyeOff, disabled: true, onSelect: () => undefined },
      opciones: hayPersonas && retencion
        ? [{ id: "fotos-dias", label: `Se guardan ${retencion.dias === 1 ? "1 día" : `${retencion.dias} días`}: cambiar`, hint: "En Cámaras eliges cuántos días se guardan", icon: CalendarClock, onSelect: () => irAEnlace(RUTA_VISTA_CAMARAS) }]
        : [],
    });
  }

  return {
    avisos,
    propuesta,
    verPropuestas,
    sugerencias,
    verSugerencias: verSugerencias && sugerencias.length > 0,
  };
}
