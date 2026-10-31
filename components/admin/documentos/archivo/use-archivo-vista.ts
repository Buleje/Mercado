import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useState, useEffect, useCallback } from "react";
import { type VistaArchivo, leerVista, CLAVE_VISTA } from "../explorador/vista-archivo";
import { SIDEBAR_MIN_W, SIDEBAR_MAX_W, SIDEBAR_DEFAULT_W, DRIVE_MODOS, leerCarpetaDeUrl, escribirCarpetaEnUrl, leerEtiquetaDeUrl, escribirEtiquetaEnUrl } from "./compartido";
import type { OrdenArchivo } from "../explorador/menus-explorador";
import { type FiltrosDoc as FiltrosDocumento, FILTROS_VACIOS } from "@/lib/documentos/filtros-doc";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
export function useArchivoVista() {
  const { confirm, prompt } = useConfirm();
  // Vista (grilla/lista), ancho de sidebar y KPIs: preferencias por-dispositivo,
  // no por-tenant — cada persona que abre el drive en su compu puede querer
  // algo distinto. Los KPIs arrancan OCULTOS (Brandon 2026-08-30): el resumen
  // ocupaba una fila entera antes de llegar a los documentos, que es lo que
  // se busca el 100% de las veces que se abre esta pantalla.
  // Tarjetas, o como el Explorador de Windows: íconos grandes, medianos,
  // lista o detalles (`explorador/vista-archivo.ts`).
  const [view, setView] = useState<VistaArchivo>(() => {
    try { return leerVista(localStorage.getItem(CLAVE_VISTA)); } catch { return "grid"; }
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem("doc-sidebar-width"));
      return raw >= SIDEBAR_MIN_W && raw <= SIDEBAR_MAX_W ? raw : SIDEBAR_DEFAULT_W;
    } catch { return SIDEBAR_DEFAULT_W; }
  });
  // Todo lo que no es "Todos" (Resumen, Asistente IA, Favoritos… hasta
  // Papelera) vive colapsado bajo "Más vistas" por defecto — la lista plana
  // de hasta 12 ítems era la mitad del sidebar antes de llegar a "Carpetas".
  const [otrosAbierto, setOtrosAbierto] = useState(() => {
    try { return localStorage.getItem("doc-sidebar-otros-abierto") === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem(CLAVE_VISTA, view); } catch { /* quota */ } }, [view]);
  useEffect(() => { try { localStorage.setItem("doc-sidebar-otros-abierto", otrosAbierto ? "1" : "0"); } catch { /* quota */ } }, [otrosAbierto]);
  // Columnas opcionales de la vista lista (Nombre y Acción son fijas).
  // Etiquetas/Vencimiento arrancan ocultas: son nuevas, no cambiar lo que
  // Brandon ya venía viendo por defecto.
  const [colsVisibles, setColsVisibles] = useState<{
    categoria: boolean; tamano: boolean; subido: boolean; etiquetas: boolean; vencimiento: boolean;
  }>(() => {
    const defaults = { categoria: true, tamano: true, subido: true, etiquetas: false, vencimiento: false };
    try {
      const raw = localStorage.getItem("doc-cols-visibles");
      return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<typeof defaults>) } : defaults;
    } catch { return defaults; }
  });
  useEffect(() => { try { localStorage.setItem("doc-cols-visibles", JSON.stringify(colsVisibles)); } catch { /* quota */ } }, [colsVisibles]);
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  useEffect(() => {
    if (!colsMenuOpen) return;
    const close = () => setColsMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [colsMenuOpen]);
  const [sortBy, setSortBy] = useState<OrdenArchivo>("recent");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  /** Ver sólo lo que todavía no tiene descripción (lo que no se puede buscar). */
  const [soloSinDescribir, setSoloSinDescribir] = useState(false);
  // Cuántas tarjetas se dibujan: una carpeta de 300 documentos no es 300
  // tarjetas de golpe. «Ver más» suma otro tanto; cambiar de vista vuelve a 10.
  const [tarjetasVisibles, setTarjetasVisibles] = useState(10);
  /** Tipo de archivo, peso, cuándo entró y cuándo vence. */
  const [filtros, setFiltros] = useState<FiltrosDocumento>(FILTROS_VACIOS);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  /** Progreso de "describir todo lo que falta" (una llamada IA por documento). */
  const [progresoDesc, setProgresoDesc] = useState<{ hechos: number; total: number } | null>(null);
  /** Por qué la IA no pudo describir (sin cupo, sin clave, sin modelo de visión). */
  const [avisoIA, setAvisoIA] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [semantic, setSemantic] = useState(false);
  /**
   * El modo y la carpeta viven en la URL (`?sub=` y `?carpeta=`).
   *
   * El drive es la pantalla donde MÁS se pasan links —«mirá la carpeta de
   * contratos 2026»— y hasta ahora eso era imposible: se mandaba el link del
   * módulo y se explicaba de palabra dónde hacer click. Va en `?sub=` y no en
   * `?vista=` porque el drive se renderiza dentro de Documentos, que ya es
   * dueño de ese parámetro.
   *
   * SIN memoria a propósito (`recordar: false`): reabrir el drive en «Papelera»
   * porque ahí quedaste la vez pasada sería una sorpresa. Empieza en «todos».
   */
  const { vista: filterMode, irA: irAModo } = useSubvistaModulo(
    "documentos-drive",
    DRIVE_MODOS,
    "all",
    undefined,
    { recordar: false },
  );
  const [activeFolderId, setActiveFolderIdRaw] = useState<string | null>(
    () => leerCarpetaDeUrl(),
  );

  /** Abrir/cerrar carpeta: estado + URL, siempre juntos. Se llama en una docena
   *  de lugares, así que envuelve al setter en vez de repetir el par. */
  const setActiveFolderId = useCallback((id: string | null) => {
    setActiveFolderIdRaw(id);
    escribirCarpetaEnUrl(id);
  }, []);

  /** Filtro por etiqueta del Archivo-hub (ADR-502), en estado + URL, siempre juntos. */
  const [etiquetaFiltro, setEtiquetaFiltroRaw] = useState<{ tag: string; label: string } | null>(
    () => leerEtiquetaDeUrl(),
  );
  const setEtiquetaFiltro = useCallback((f: { tag: string; label: string } | null) => {
    setEtiquetaFiltroRaw(f);
    escribirEtiquetaEnUrl(f);
  }, []);

  /** Atrás/adelante: la carpeta y la etiqueta las dicta la URL, igual que el modo. */
  useEffect(() => {
    // 30-10: popstate llega mientras Next dibuja su Router; los setState van en microtask.
    const onPop = () =>
      queueMicrotask(() => {
        setActiveFolderIdRaw(leerCarpetaDeUrl());
        setEtiquetaFiltroRaw(leerEtiquetaDeUrl());
      });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /**
   * Cambiar de modo, soltando la carpeta si el modo nuevo no la usa.
   *
   * Va DESPUÉS del estado de la carpeta a propósito: si sólo limpiara la URL
   * —como estaba— el estado quedaría con una carpeta abierta que el link ya no
   * menciona, y recargar mostraría otra cosa que la pantalla actual.
   */
  const setFilterMode = useCallback(
    (modo: (typeof DRIVE_MODOS)[number]) => {
      if (modo !== "folder") setActiveFolderId(null);
      irAModo(modo);
    },
    [irAModo, setActiveFolderId],
  );
  return { confirm, prompt, view, setView, sidebarWidth, setSidebarWidth, otrosAbierto, setOtrosAbierto,
    colsVisibles, setColsVisibles, colsMenuOpen, setColsMenuOpen, sortBy, setSortBy, statusFilter,
    setStatusFilter, soloSinDescribir, setSoloSinDescribir, tarjetasVisibles, setTarjetasVisibles, filtros,
    setFiltros, filtrosAbiertos, setFiltrosAbiertos, progresoDesc, setProgresoDesc, avisoIA, setAvisoIA,
    search, setSearch, searchDebounced, setSearchDebounced, semantic, setSemantic, filterMode, irAModo,
    activeFolderId, setActiveFolderIdRaw, setActiveFolderId, etiquetaFiltro, setEtiquetaFiltroRaw,
    setEtiquetaFiltro, setFilterMode };
}
export type HastaArchivoVista = ReturnType<typeof useArchivoVista>;