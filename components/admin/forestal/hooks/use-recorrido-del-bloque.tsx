"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Route } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { logger } from "@/lib/logger";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { claveMarca, type BloqueDistribuido, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { EstadoRecorrido } from "@/lib/forestal/recorrido-permiso";
import RecorridoPermisoModal from "../recorrido/RecorridoPermisoModal";
import type { EstadoLotesAserrio } from "./use-lotes-aserrio";

/**
 * use-recorrido-del-bloque — el botón «Recorrido del permiso» de cada bloque
 * de la Distribución y su ventana (ADR-519, fase 4), para que el cableado del
 * Libro sólo lo monte.
 *
 * Lote y jornadas los escribe el servidor (POST del recorrido). Lo escrito se
 * trae al bloque del dispositivo desde la distribución guardada: si no, el
 * próximo «anotar en la guardada» de este bloque mandaría sus corridas vacías
 * encima de las que dejó el servidor, y sus botones de jornada se ofrecerían
 * otra vez.
 */

type Aplicar = (bloqueId: string, cambio: (b: BloqueRolliza) => BloqueRolliza) => void;

/** Lo que pone la pantalla de la Distribución: el anexo y el guardado son suyos. */
export interface AccionesDeLaDistribucion {
  piezasDe: (b: BloqueDistribuido) => PiezaCubicada[];
  abrirAnexo: (b: BloqueDistribuido) => void;
  guardarDistribucion: () => void;
}

const URL_DISTRIBUCIONES = "/api/admin/forestal/distribuciones";
const CAMPOS_DEL_LIBRO = ["loteId", "corridaIds", "jornadasLibro", "complementos", "trozasElegidas"] as const;
type CamposDelLibro = Pick<BloqueRolliza, (typeof CAMPOS_DEL_LIBRO)[number]>;

async function libroDeLaGuardada(distribucionId: string, bloqueId: string): Promise<Partial<CamposDelLibro> | null> {
  const r = await fetch(URL_DISTRIBUCIONES, { credentials: "include", cache: "no-store" });
  if (!r.ok) throw new Error(`No se pudo leer la distribución guardada (HTTP ${r.status})`);
  const j = (await r.json()) as { distribuciones?: { id: string; bloques?: (Partial<CamposDelLibro> & { id: string })[] }[] };
  const b = j.distribuciones?.find((d) => d.id === distribucionId)?.bloques?.find((x) => x.id === bloqueId);
  if (!b) return null;
  const campos: Partial<CamposDelLibro> = {};
  for (const k of CAMPOS_DEL_LIBRO) if (b[k] != null) Object.assign(campos, { [k]: b[k] });
  return campos;
}

/** `?recorrido=<bloqueId>` abre la ventana de ese bloque (el aviso del cubicador lleva acá). */
function bloqueDelEnlace(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("recorrido");
}

export function useRecorridoDelBloque({
  distribucionId,
  porId,
  vistaPorId,
  aplicar,
  lotes,
  marcar,
  puedeDeclarar,
  hoy,
  acciones,
}: {
  distribucionId: string | null;
  /** Los bloques con el volumen del Libro (el mismo mapa que elige las trozas). */
  porId: ReadonlyMap<string, BloqueDistribuido>;
  /** Los bloques como se ven: de ahí salen las claves «Distribuido» a tildar. */
  vistaPorId: ReadonlyMap<string, BloqueDistribuido>;
  aplicar: Aplicar;
  lotes: EstadoLotesAserrio;
  marcar: (claves: string[], estado?: boolean) => void;
  puedeDeclarar: boolean;
  hoy: string;
  acciones?: AccionesDeLaDistribucion;
}) {
  const [abiertoDe, setAbiertoDe] = useState<string | null>(null);
  const enlace = useRef<string | null>(null);

  /* El enlace se lee una vez y espera a que el bloque exista (los bloques del
     dispositivo llegan después del primer render). */
  useEffect(() => {
    if (enlace.current === null) enlace.current = bloqueDelEnlace() ?? "";
    if (enlace.current && porId.has(enlace.current)) {
      setAbiertoDe(enlace.current);
      enlace.current = "";
    }
  }, [porId]);

  const alEjecutar = useCallback(
    async (estado: EstadoRecorrido | null) => {
      const id = abiertoDe;
      if (!id || !distribucionId) return;
      try {
        const campos = await libroDeLaGuardada(distribucionId, id);
        if (campos && Object.keys(campos).length > 0) aplicar(id, (b) => ({ ...b, ...campos }));
      } catch (err) {
        logger.error("[recorrido] traer lo escrito al bloque falló", { error: String(err) });
      }
      await lotes.recargar();
      /* Escritas las jornadas, la lista «Distribuido» del bloque queda tildada,
         igual que con el botón de cada día. */
      if (estado?.pasos.some((p) => p.paso === "jornadas" && p.estado === "hecho")) {
        const bv = vistaPorId.get(id);
        if (bv) marcar(bv.porDia.flatMap((d) => d.grupos.map((g) => claveMarca(id, d.dia, g.clave))), true);
      }
    },
    [abiertoDe, distribucionId, aplicar, lotes, vistaPorId, marcar],
  );

  const boton = (b: BloqueDistribuido): ReactNode => {
    if ((b.bloque.trozaIds ?? []).length === 0 && !b.bloque.permiso) return null;
    return (
      <button
        type="button"
        data-recorrido-abrir={b.bloque.id}
        onClick={() => setAbiertoDe(b.bloque.id)}
        title="Del permiso a la salida: en qué paso va este bloque y qué falta"
        className={button({ variant: "secondary", size: "xs" })}
      >
        <Route className="h-4 w-4" aria-hidden /> Recorrido del permiso
      </button>
    );
  };

  const bd = abiertoDe ? porId.get(abiertoDe) : undefined;
  const nodo = bd ? (
    <RecorridoPermisoModal
      key={bd.bloque.id}
      bd={bd}
      distribucionId={distribucionId}
      hoy={hoy}
      puedeDeclarar={puedeDeclarar}
      acciones={{
        bd,
        aplicar,
        patio: lotes.trozas,
        onCambio: () => void lotes.recargar(),
        piezas: acciones?.piezasDe(bd) ?? [],
        abrirAnexo: acciones ? () => acciones.abrirAnexo(bd) : undefined,
      }}
      guardarDistribucion={acciones?.guardarDistribucion}
      onEjecutado={(e) => void alEjecutar(e)}
      onClose={() => setAbiertoDe(null)}
    />
  ) : null;

  return { boton, nodo };
}
