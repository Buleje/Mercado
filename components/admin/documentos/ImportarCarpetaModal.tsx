"use client";

/**
 * ImportarCarpetaModal — subir una carpeta ENTERA al drive, con su estructura.
 *
 * Hasta ahora se subían archivos sueltos: pasar un año de contratos ordenado en
 * subcarpetas significaba crear cada carpeta a mano y arrastrar tanda por tanda.
 * Acá se elige (o se suelta) la carpeta, se ve el plan —cuántas carpetas,
 * cuántos archivos, cuánto pesa, qué se ignora— y recién ahí se sube.
 *
 * El orden importa: primero las carpetas padre→hijo (así el hijo siempre
 * encuentra a su padre), después los archivos con el pool de subida que ya
 * usaba el drive.
 *
 * La SUBIDA no vive acá: al apretar Importar el trabajo se le encarga al motor
 * de segundo plano (`import-carpeta-context`) y este modal se cierra. Así se
 * puede seguir cobrando o mirando pedidos mientras suben 400 archivos.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Check, FolderOpen, FolderTree, Loader2, Upload,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  archivosDesdeDrop, bytesLegibles, planificarImport, planReuso, ARCHIVOS_POR_TANDA,
  type CarpetaExistente, type PlanImport,
} from "@/lib/documentos/importar-arbol";
import { useImportCarpeta } from "@/contexts/import-carpeta-context";
import type { EstadoArchivo } from "./ImportarProgreso";

type Fase = "elegir" | "revisar";

/** "1 archivo" / "5 archivos" — el "(s)" queda para los formularios de banco. */
function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

export interface ImportarCarpetaProps {
  /** Carpeta del drive donde cuelga lo importado (null = raíz). */
  destino: string | null;
  destinoNombre?: string;
  /** Carpetas que ya están en el drive: las que coincidan se reusan, no se duplican. */
  existentes: CarpetaExistente[];
  /**
   * Crea el árbol entero y devuelve el id de cada ruta. Una sola llamada: una
   * por carpeta se comía el rate limit y dejaba el import a medias (ADR-306).
   */
  crearArbol: (parentId: string | null, rutas: string[]) => Promise<{ idPorRuta: Record<string, string>; creadas: number }>;
  /** Nombre+peso de lo que ya hay en esas carpetas, para no subirlo dos veces. */
  yaSubidos: (folderIds: (string | null)[]) => Promise<Record<string, { name: string; size: number }[]>>;
  /**
   * Sube archivos a una carpeta concreta (pool + compresión del drive).
   * `onEstado` es lo que alimenta la lista archivo-por-archivo del progreso.
   */
  subir: (files: File[], opts?: {
    folderId?: string | null;
    /** Carpeta por archivo: una sola tanda para todo el import. */
    folderIdDe?: (file: File) => string | null | undefined;
    onProgress?: (done: number, total: number) => void;
    onEstado?: (file: File, estado: EstadoArchivo, motivo?: string) => void;
    signal?: AbortSignal;
  }) => Promise<unknown>;
  /**
   * Carpeta que el usuario soltó DIRECTO en el drive: el modal arranca con el
   * plan ya armado, sin pedirle que la vuelva a elegir.
   */
  soltado?: { file: File; ruta: string }[] | null;
  onClose: () => void;
}

export default function ImportarCarpetaModal({
  destino, destinoNombre, existentes, crearArbol, yaSubidos, subir, soltado, onClose,
}: ImportarCarpetaProps) {
  const [fase, setFase] = useState<Fase>("elegir");
  const [plan, setPlan] = useState<PlanImport | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { iniciar } = useImportCarpeta();

  /**
   * Qué carpetas del plan ya están en el drive: se fusiona con ellas.
   *
   * Se calcula contra una FOTO del drive tomada al armar el plan. Si se
   * recalculara en vivo, la propia importación iría creando las carpetas y al
   * terminar el resumen diría "0 nuevas · 6 ya existían" — contando su propio
   * trabajo como preexistente.
   */
  const [fotoDrive, setFotoDrive] = useState<CarpetaExistente[]>(existentes);
  const reuso = useMemo(
    () => (plan ? planReuso(plan.carpetas, fotoDrive, destino) : new Map<string, string>()),
    [plan, fotoDrive, destino],
  );
  const aCrear = plan ? plan.carpetas.length - reuso.size : 0;

  /**
   * Archivos del plan que YA están arriba (mismo nombre y mismo peso en la
   * carpeta destino). Sin esto, reimportar una carpeta a la que le agregaste 3
   * archivos volvía a subir los 300 y el drive quedaba con todo duplicado.
   */
  const [duplicados, setDuplicados] = useState<Set<File>>(new Set());
  const [buscandoDuplicados, setBuscandoDuplicados] = useState(false);
  useEffect(() => {
    if (!plan || plan.archivos.length === 0) { setDuplicados(new Set()); return; }
    // Sólo hay con qué chocar en las carpetas que ya existían (y en el destino).
    const idPorRuta = new Map<string, string | null>([["", destino]]);
    for (const [ruta, id] of reuso) idPorRuta.set(ruta, id);
    const aConsultar = [...new Set(plan.archivos.map((a) => idPorRuta.get(a.carpeta)).filter((v) => v !== undefined))];
    if (aConsultar.length === 0) { setDuplicados(new Set()); return; }

    let vigente = true;
    setBuscandoDuplicados(true);
    yaSubidos(aConsultar)
      .then((porCarpeta) => {
        if (!vigente) return;
        const dup = new Set<File>();
        for (const a of plan.archivos) {
          const id = idPorRuta.get(a.carpeta);
          if (id === undefined) continue;
          const previos = porCarpeta[id ?? ""] ?? [];
          if (previos.some((p) => p.name === a.file.name && p.size === a.file.size)) dup.add(a.file);
        }
        setDuplicados(dup);
      })
      .catch((err) => {
        // Si no se pudo consultar, se sube todo: duplicar es molesto, no
        // importar es peor. Queda el rastro en consola para diagnosticar.
        console.error("[importar-carpeta] no pude consultar lo ya subido", err);
      })
      .finally(() => { if (vigente) setBuscandoDuplicados(false); });
    return () => { vigente = false; };
  }, [plan, reuso, destino, yaSubidos]);

  /**
   * Lo que realmente se va a subir EN ESTA TANDA. El servidor acepta 400
   * archivos cada 15 minutos (preset DRIVE): mandar 900 no los sube más
   * rápido, los últimos 500 rebotan con 429. Se sube el tope y se avisa que
   * hay que volver — la segunda vuelta omite sola lo que ya está.
   */
  const pendientes = useMemo(
    () => (plan?.archivos ?? []).filter((a) => !duplicados.has(a.file)),
    [plan, duplicados],
  );
  const aSubir = useMemo(() => pendientes.slice(0, ARCHIVOS_POR_TANDA), [pendientes]);
  const paraLaProxima = pendientes.length - aSubir.length;
  const total = aSubir.length;
  const pesoASubir = useMemo(() => aSubir.reduce((s, a) => s + a.file.size, 0), [aSubir]);

  // Contar una vez, no una vez por carpeta: un import de 2.000 archivos hacía
  // un filter completo por cada fila del árbol.
  const archivosPorCarpeta = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of aSubir) m.set(a.carpeta, (m.get(a.carpeta) ?? 0) + 1);
    return m;
  }, [aSubir]);
  const sueltosEnRaiz = archivosPorCarpeta.get("") ?? 0;

  const tomarArchivos = useCallback((files: File[], rutaDe?: (f: File) => string) => {
    const p = planificarImport(files, rutaDe ? { rutaDe } : {});
    setPlan(p);
    setFotoDrive(existentes); // la foto se toma acá y ya no se mueve
    setFase(p.archivos.length > 0 ? "revisar" : "elegir");
  }, [existentes]);

  // Si el modal se abrió porque soltaron una carpeta en el drive, el plan se
  // arma solo: pedirle al usuario que la elija otra vez sería una burla.
  const yaTomado = useRef(false);
  useEffect(() => {
    if (!soltado || yaTomado.current) return;
    yaTomado.current = true;
    if (soltado.length === 0) return;
    const mapa = new Map(soltado.map((x) => [x.file, x.ruta]));
    tomarArchivos(soltado.map((x) => x.file), (f) => mapa.get(f) ?? f.name);
  }, [soltado, tomarArchivos]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    // En un drop el navegador NO da webkitRelativePath: hay que caminar el árbol.
    const conRuta = await archivosDesdeDrop(e.dataTransfer.items);
    if (conRuta.length === 0) return;
    const mapa = new Map(conRuta.map((x) => [x.file, x.ruta]));
    tomarArchivos(conRuta.map((x) => x.file), (f) => mapa.get(f) ?? f.name);
  }, [tomarArchivos]);

  /**
   * Le pasa el trabajo al motor de segundo plano y cierra: el panel flotante
   * muestra el progreso desde cualquier pestaña del admin.
   */
  const importar = () => {
    if (!plan) return;
    iniciar({
      destino,
      destinoNombre,
      rutasCarpetas: plan.carpetas.map((c) => c.ruta),
      aCrear,
      archivos: aSubir,
      paraLaProxima,
      duplicados: duplicados.size,
      crearArbol,
      subir,
    });
    onClose();
  };

  const resumen = useMemo(() => {
    if (!plan) return null;
    const partes = [
      plural(aCrear, "carpeta nueva", "carpetas nuevas"),
      plural(total, "archivo", "archivos"),
      bytesLegibles(pesoASubir),
    ];
    if (reuso.size > 0) partes.splice(1, 0, `${reuso.size} que ya existía${reuso.size === 1 ? "" : "n"}`);
    if (duplicados.size > 0) partes.push(`${duplicados.size} ya subido${duplicados.size === 1 ? "" : "s"}`);
    if (paraLaProxima > 0) partes.push(`${paraLaProxima} para la próxima tanda`);
    return partes.join(" · ");
  }, [plan, aCrear, reuso.size, total, pesoASubir, duplicados.size, paraLaProxima]);

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      title="Importar carpeta"
      description={destinoNombre ? `Se agrega dentro de ${destinoNombre}` : "Se agrega en la raíz del drive"}
      icon={FolderTree}
      footer={
        // En celular el resumen y los botones no entran en una línea: se
        // apilan. Amontonados, "Cancelar" quedaba encima del botón de subir.
        <div className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="min-w-0 text-xs text-[var(--text-tertiary)]">{resumen}</span>
          <span className="flex flex-wrap items-center justify-end gap-2 [&>button]:whitespace-nowrap">
            {fase === "revisar" && (
              // Elegiste la carpeta equivocada: cambiarla sin cerrar y reabrir.
              <button
                type="button"
                onClick={() => { setPlan(null); setFase("elegir"); }}
                className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                Elegir otra
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              Cancelar
            </button>
            {fase === "revisar" && (
              <button
                type="button"
                onClick={importar}
                disabled={buscandoDuplicados || total === 0}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {buscandoDuplicados
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Revisando qué falta…</>
                  : total === 0
                    ? <><Check className="h-4 w-4" /> Ya está todo subido</>
                    : <><Upload className="h-4 w-4" /> Importar {plural(total, "archivo", "archivos")}</>}
              </button>
            )}
          </span>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        {fase === "elegir" && (
          <>
            {/* Soltar la carpeta o elegirla: las dos vías llevan al mismo plan. */}
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                arrastrando ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
              }`}
            >
              <FolderTree className="h-10 w-10 text-[var(--text-tertiary)]" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Soltá una carpeta acá</p>
              <p className="max-w-sm text-xs text-[var(--text-tertiary)]">
                Se respeta la estructura: cada subcarpeta se crea en el drive y cada archivo queda donde estaba.
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
              >
                <Upload className="h-4 w-4" /> Elegir carpeta…
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                // Atributos no estándar: sólo existen en el DOM, no en los tipos de React.
                {...{ webkitdirectory: "", directory: "" }}
                className="hidden"
                onChange={(e) => tomarArchivos(Array.from(e.target.files ?? []))}
              />
            </div>
            {plan && plan.archivos.length === 0 && (
              <p className="flex items-center gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                <AlertCircle className="h-4 w-4 shrink-0" /> Esa carpeta no tiene archivos que se puedan subir.
              </p>
            )}
          </>
        )}

        {fase === "revisar" && plan && (
          <>
            <p className="text-sm text-[var(--text-secondary)]">
              Esto es lo que se va a crear. Revisalo antes de subir.
              {reuso.size > 0 && " Lo que ya existe se reusa: no se duplica ninguna carpeta."}
            </p>
            {/* Árbol de lo que se va a crear: se ve la forma antes de tocar nada. */}
            <div className="max-h-64 overflow-auto rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
              <ul className="space-y-0.5 text-sm">
                {sueltosEnRaiz > 0 && (
                  <li className="flex items-center gap-2 text-[var(--text-tertiary)]">
                    <span className="font-mono text-xs tabular-nums">{sueltosEnRaiz}</span>
                    {sueltosEnRaiz === 1 ? "archivo suelto" : "archivos sueltos"} en la raíz
                  </li>
                )}
                {plan.carpetas.map((c) => {
                  const cuantos = archivosPorCarpeta.get(c.ruta) ?? 0;
                  const existe = reuso.has(c.ruta);
                  return (
                    <li key={c.ruta} className="flex items-center gap-2" style={{ paddingLeft: `${c.nivel * 16}px` }}>
                      {existe
                        ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                        : <FolderTree className="h-3.5 w-3.5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" />}
                      <span className="truncate font-medium text-[var(--text-primary)]">{c.nombre}</span>
                      {existe && (
                        <span className="shrink-0 rounded-md bg-[var(--surface-raised)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                          ya existe
                        </span>
                      )}
                      {cuantos > 0 && <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{cuantos}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>

            {paraLaProxima > 0 && (
              <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  Son {pendientes.length} archivos y el servidor acepta {ARCHIVOS_POR_TANDA} cada 15 minutos.
                  Ahora suben los primeros {ARCHIVOS_POR_TANDA}; dentro de un rato volvé a importar
                  la misma carpeta y sigue por {paraLaProxima === 1 ? "el que falta" : `los ${paraLaProxima} que faltan`}.
                </span>
              </p>
            )}

            {duplicados.size > 0 && (
              <p className="flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                <Check className="h-4 w-4 shrink-0 text-[var(--data-success-500)]" />
                {plural(duplicados.size, "archivo ya estaba", "archivos ya estaban")} en el drive — se omiten y sólo se sube lo que falta.
              </p>
            )}

            {plan.ignorados.length > 0 && (
              <details className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                <summary className="cursor-pointer text-xs font-bold text-[var(--text-secondary)]">
                  {plural(plan.ignorados.length, "archivo que se deja", "archivos que se dejan")} afuera
                </summary>
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-xs text-[var(--text-tertiary)]">
                  {plan.ignorados.slice(0, 40).map((i) => (
                    <li key={i.nombre} className="truncate">{i.nombre} — {i.motivo}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

      </div>
    </AdminModal>
  );
}
