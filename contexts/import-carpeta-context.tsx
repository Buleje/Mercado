"use client";

/**
 * Importación de carpetas EN SEGUNDO PLANO.
 *
 * Subir 400 archivos son varios minutos. Que el modal te retenga mirando una
 * barra —sin poder cobrar, ni ver un pedido— es la parte cara de la feature.
 * Acá vive el motor: arranca desde el modal del drive y sigue corriendo aunque
 * lo cierres o te vayas a otra pestaña del panel, porque el provider está
 * montado por encima del router de tabs.
 *
 * Lo que NO sobrevive es recargar la página: los `File` viven en memoria del
 * navegador y no hay forma de retomarlos sin volver a elegir la carpeta. Por
 * eso, mientras hay un import en curso, se avisa antes de cerrar.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import type { ArchivoPlan } from "@/lib/documentos/importar-arbol";
import type { EstadoArchivo, FilaArchivo } from "@/components/admin/documentos/ImportarProgreso";

/** Todo lo que el importador necesita para trabajar solo. */
export interface EncargoImport {
  destino: string | null;
  destinoNombre?: string;
  /** Rutas de carpeta del plan, en orden padre→hijo. */
  rutasCarpetas: string[];
  /** Cuántas de esas carpetas son nuevas (el resto se reusa). */
  aCrear: number;
  /** Los archivos de ESTA tanda, ya sin duplicados ni excedente. */
  archivos: ArchivoPlan[];
  /** Los que quedaron para una próxima tanda por el tope del servidor. */
  paraLaProxima: number;
  /** Cuántos se omitieron por estar ya subidos. */
  duplicados: number;
  crearArbol: (parentId: string | null, rutas: string[]) => Promise<{ idPorRuta: Record<string, string>; creadas: number }>;
  subir: (files: File[], opts?: {
    folderIdDe?: (file: File) => string | null | undefined;
    onProgress?: (done: number, total: number) => void;
    onEstado?: (file: File, estado: EstadoArchivo, motivo?: string) => void;
    signal?: AbortSignal;
  }) => Promise<unknown>;
}

export interface EstadoImport {
  fase: "subiendo" | "listo";
  destinoNombre?: string;
  filas: FilaArchivo[];
  estados: Record<string, EstadoArchivo>;
  motivos: Record<string, string>;
  bytesListos: number;
  bytesTotal: number;
  carpetasListas: number;
  carpetasTotal: number;
  aCrear: number;
  duplicados: number;
  paraLaProxima: number;
  segundos: number;
  paso: string;
  errores: string[];
  /** No llegó ni a subir (falló el árbol). */
  abortado: boolean;
  /** Lo frenó el usuario. */
  detenido: boolean;
  subidosOk: number;
  fallados: number;
  total: number;
}

interface Ctx {
  estado: EstadoImport | null;
  /** El panel flotante está desplegado (o encogido a pastilla). */
  desplegado: boolean;
  setDesplegado: (v: boolean) => void;
  iniciar: (encargo: EncargoImport) => void;
  detener: () => void;
  /** Sacar de pantalla un import ya terminado. */
  descartar: () => void;
  /** Sube de a uno cada vez que termina un import: el drive lo usa para refrescar. */
  terminados: number;
}

const ImportCarpetaContext = createContext<Ctx | null>(null);

export function useImportCarpeta(): Ctx {
  const ctx = useContext(ImportCarpetaContext);
  if (!ctx) throw new Error("useImportCarpeta fuera de ImportCarpetaProvider");
  return ctx;
}

/** Un "HTTP 429: {...}" no le dice nada a nadie; esto sí. */
function mensajeError(e: unknown): string {
  const crudo = e instanceof Error ? e.message : String(e);
  if (crudo.includes("429")) return "el servidor pidió esperar (demasiadas subidas seguidas). Probá de nuevo en unos minutos.";
  if (crudo.includes("413") || crudo.includes("too_large")) return "hay archivos más pesados de lo permitido.";
  if (crudo.includes("415") || crudo.includes("mime_not_allowed")) return "hay tipos de archivo que el drive no acepta.";
  return crudo.slice(0, 160);
}

/**
 * Reintenta SÓLO los cortes de red: en el celular de una bodega pasan todo el
 * tiempo y no pueden tumbar un import de 300 archivos. Un 400 o un 429 fallan
 * igual al segundo intento, así que esos suben tal cual.
 */
async function conReintento<T>(fn: () => Promise<T>, aviso: (intento: number) => void): Promise<T> {
  let ultimo: unknown;
  for (let i = 1; i <= 3; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      const msg = e instanceof Error ? e.message : String(e);
      const esRed = e instanceof TypeError || /failed to fetch|network|load failed/i.test(msg);
      if (!esRed || i === 3) break;
      aviso(i + 1);
      await new Promise((r) => setTimeout(r, i * 1500));
    }
  }
  throw ultimo;
}

export function ImportCarpetaProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoImport | null>(null);
  const [desplegado, setDesplegado] = useState(true);
  const [terminados, setTerminados] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const corriendoRef = useRef(false);

  const parche = useCallback((cambio: Partial<EstadoImport> | ((p: EstadoImport) => Partial<EstadoImport>)) => {
    setEstado((prev) => {
      if (!prev) return prev;
      return { ...prev, ...(typeof cambio === "function" ? cambio(prev) : cambio) };
    });
  }, []);

  // El reloj vive acá: el panel puede estar cerrado y el tiempo sigue corriendo.
  useEffect(() => {
    if (estado?.fase !== "subiendo") return;
    const inicio = Date.now() - estado.segundos * 1000;
    const t = setInterval(() => parche({ segundos: (Date.now() - inicio) / 1000 }), 500);
    return () => clearInterval(t);
    // Sólo al cambiar de fase: si dependiera de `segundos` se recrearía cada tick.
  }, [estado?.fase, parche]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cerrar la pestaña con un import a medias pierde lo que falta: avisar.
  useEffect(() => {
    if (estado?.fase !== "subiendo") return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [estado?.fase]);

  const detener = useCallback(() => {
    parche({ detenido: true });
    abortRef.current?.abort();
  }, [parche]);

  const descartar = useCallback(() => setEstado(null), []);

  const iniciar = useCallback((encargo: EncargoImport) => {
    if (corriendoRef.current) return; // un import por vez: dos pisarían el mismo drive
    corriendoRef.current = true;
    abortRef.current = new AbortController();
    setDesplegado(true);

    const filas: FilaArchivo[] = encargo.archivos.map((a) => ({
      ruta: a.carpeta ? `${a.carpeta}/${a.file.name}` : a.file.name,
      nombre: a.file.name,
      carpeta: a.carpeta,
      size: a.file.size,
    }));

    setEstado({
      fase: "subiendo",
      destinoNombre: encargo.destinoNombre,
      filas,
      estados: {},
      motivos: {},
      bytesListos: 0,
      bytesTotal: encargo.archivos.reduce((s, a) => s + a.file.size, 0),
      carpetasListas: 0,
      carpetasTotal: encargo.rutasCarpetas.length,
      aCrear: encargo.aCrear,
      duplicados: encargo.duplicados,
      paraLaProxima: encargo.paraLaProxima,
      segundos: 0,
      paso: "",
      errores: [],
      abortado: false,
      detenido: false,
      subidosOk: 0,
      fallados: 0,
      total: encargo.archivos.length,
    });

    void (async () => {
      try {
        // 1 · El árbol de carpetas, en lotes, antes de mandar un solo byte.
        const idPorRuta = new Map<string, string | null>([["", encargo.destino]]);
        if (encargo.rutasCarpetas.length > 0) {
          parche({ paso: `Creando ${encargo.aCrear} carpeta${encargo.aCrear === 1 ? "" : "s"}…` });
          try {
            const { idPorRuta: ids } = await conReintento(
              () => encargo.crearArbol(encargo.destino, encargo.rutasCarpetas),
              (intento) => parche({ paso: `Se cortó la conexión — reintentando (${intento} de 3)…` }),
            );
            for (const [ruta, id] of Object.entries(ids)) idPorRuta.set(ruta, id);
            parche({ carpetasListas: encargo.rutasCarpetas.length });
          } catch (e) {
            // Sin árbol no se sigue: 300 archivos sueltos en la raíz son peores
            // que ninguno — ordenarlos después es imposible.
            parche({ errores: [`No se pudo crear el árbol de carpetas: ${mensajeError(e)}`], abortado: true, fase: "listo", paso: "" });
            return;
          }
        }

        // 2 · Todos los archivos en UNA tanda, con su carpeta resuelta.
        const rutaDe = new Map(encargo.archivos.map((a) => [a.file, a.carpeta ? `${a.carpeta}/${a.file.name}` : a.file.name]));
        const carpetaDe = new Map(encargo.archivos.map((a) => [a.file, idPorRuta.get(a.carpeta) ?? encargo.destino]));

        parche({ paso: `Subiendo ${encargo.archivos.length} archivo${encargo.archivos.length === 1 ? "" : "s"}` });
        try {
          await encargo.subir(encargo.archivos.map((a) => a.file), {
            signal: abortRef.current?.signal,
            folderIdDe: (f) => carpetaDe.get(f) ?? encargo.destino,
            onEstado: (file, est, motivo) => {
              const clave = rutaDe.get(file) ?? file.name;
              parche((p) => ({
                estados: { ...p.estados, [clave]: est },
                ...(motivo ? { motivos: { ...p.motivos, [clave]: motivo } } : {}),
                ...(est === "listo" ? { bytesListos: p.bytesListos + file.size, subidosOk: p.subidosOk + 1 } : {}),
                ...(est === "error" ? { fallados: p.fallados + 1 } : {}),
              }));
            },
          });
        } catch (e) {
          if (!abortRef.current?.signal.aborted) {
            parche((p) => ({ errores: [...p.errores, mensajeError(e)] }));
          }
        }

        parche({ fase: "listo", paso: "" });
        setTerminados((n) => n + 1);
      } finally {
        corriendoRef.current = false;
      }
    })();
  }, [parche]);

  const valor = useMemo<Ctx>(
    () => ({ estado, desplegado, setDesplegado, iniciar, detener, descartar, terminados }),
    [estado, desplegado, iniciar, detener, descartar, terminados],
  );

  return <ImportCarpetaContext.Provider value={valor}>{children}</ImportCarpetaContext.Provider>;
}
