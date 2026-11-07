"use client";

/**
 * «Valorizar» de un borrador de MADERA que salió de un lote del Cubicador
 * (`cubicacionRefId`) y se abrió desde otro lado —la lista de guardadas, el
 * despacho, o el propio cubicador con su lista caída—: lee ese lote, le pone a
 * cada pieza el precio con el MISMO resolver del cubicador
 * (`useResolverDePrecio`: precio a mano, por especie y tratos del Directorio)
 * y arma los `preciosSugeridosMadera`. Así la marca de «Cedro tiene 2 precios
 * en el lote» llega a TODAS las puertas, no sólo a la del cubicador.
 *
 * El precio de cada pieza no se guarda en ningún lado del servidor (vive en el
 * navegador): por eso la marca viaja en el pedido y el servidor rechaza el
 * general sobre una especie marcada (`especiesConVariosPrecios`, 422).
 *
 *   - Del cubicador (origen libre) → precarga sus precios, como el cubicador.
 *   - Del despacho → sólo la marca: el precio de esa cuenta no es el del lote.
 *   - Lote borrado → sin marca (no hay de dónde leerla).
 *   - Lote o trato que no se pudo leer → NO deja cobrar: «reintenta».
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "@buleje/design-system/icons";
import type { PiezaCubicada, Unidad } from "@/lib/forestal/cubicacion";
import { esDelCubicador, preciosSugeridosMadera } from "@/lib/forestal/cubicacion-madera-cuenta";
import { BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import ValorizarPrecios from "./cubicador-trozas-precios";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import { leerPreciosGuardados, useResolverDePrecio } from "./hooks/use-precio-cubicador";
import type { CubicacionTrozas, CuentaDeLaPersona } from "./hooks/use-cubicaciones-trozas";

type PiezaDelLote = Partial<PiezaCubicada> & { cantidad: number; espesor: number; ancho: number; largo: number };
type LoteDelCubicador = { id: string; especie?: string | null; piezas?: PiezaDelLote[] };
type Lectura = { lote: LoteDelCubicador | null; error: boolean } | null;

const SIN_PIEZAS: PiezaCubicada[] = [];
const unidad = (u: Unidad | undefined, porDefecto: Unidad): Unidad => u ?? porDefecto;

/** Las piezas del lote como filas del cubicador. El precio sólo mira especie y dueño. */
function filasDelLote(lote: LoteDelCubicador | null): PiezaCubicada[] {
  if (!lote?.piezas?.length) return SIN_PIEZAS;
  return lote.piezas.map((p, i) => ({
    ...p,
    id: p.id ?? `pieza-${i}`,
    uEspesor: unidad(p.uEspesor, "pulg"),
    uAncho: unidad(p.uAncho, "pulg"),
    uLargo: unidad(p.uLargo, "pies"),
    especie: p.especie ?? undefined,
    duenoParteId: p.duenoParteId ?? undefined,
    pieTablar: p.pieTablar ?? 0,
    m3: p.m3 ?? 0,
  }));
}

/** El lote del Cubicador (KV). `null` = leyendo; `lote: null` sin error = ya no existe. */
function useLoteDelCubicador(refId: string) {
  const [lectura, setLectura] = useState<Lectura>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vivo = true;
    setLectura(null);
    fetch("/api/admin/forestal/cubicaciones", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { cubicaciones?: LoteDelCubicador[] };
        if (!Array.isArray(j.cubicaciones)) throw new Error("respuesta sin cubicaciones");
        if (vivo) setLectura({ lote: j.cubicaciones.find((c) => c.id === refId) ?? null, error: false });
      })
      .catch(() => { if (vivo) setLectura({ lote: null, error: true }); });
    return () => { vivo = false; };
  }, [refId, vuelta]);
  const reintentar = useCallback(() => setVuelta((v) => v + 1), []);
  return { lectura, reintentar };
}

export default function ValorizarPreciosDelLote({
  cub, refId, cuenta, onAplicada,
}: {
  cub: CubicacionTrozas;
  refId: string;
  cuenta: CuentaDeLaPersona | null;
  onAplicada: (c: CubicacionTrozas) => void;
}) {
  const { lectura, reintentar } = useLoteDelCubicador(refId);
  const lote = lectura?.lote ?? null;
  const rows = useMemo(() => filasDelLote(lote), [lote]);
  const [guardados] = useState(() => leerPreciosGuardados(""));
  const catalogo = useEspeciesCatalogo();
  const resolver = useResolverDePrecio(rows, guardados, catalogo.grupos, catalogo.cargando);

  const sugeridos = useMemo(() => {
    if (!lote) return null;
    const s = preciosSugeridosMadera(rows, lote.especie ?? null, resolver.precioDe, resolver.general);
    return esDelCubicador(cub) ? s : { ...s, general: null, porEspecie: {} };
  }, [lote, rows, resolver.precioDe, resolver.general, cub]);

  const conTratos = guardados.modo !== "manual" && resolver.clientes.length > 0;
  const falla = lectura?.error
    ? { msg: "No pude leer el lote: reintenta", reintentar }
    : resolver.erroresTrato.length > 0
      ? { msg: "No pude leer el trato de un dueño del lote: reintenta", reintentar: resolver.recargarTratos }
      : conTratos && catalogo.errorLectura
        ? { msg: "No pude leer las especies del lote: reintenta", reintentar: () => void catalogo.recargar() }
        : null;

  if (falla) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--data-error-50)] px-4 py-3 dark:bg-[var(--data-error-500)]/12" role="alert" data-vista="lote-sin-leer">
        <span className="flex flex-1 items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {falla.msg}
        </span>
        <button type="button" className={BOTON_SECUNDARIO} onClick={falla.reintentar} data-accion="reintentar-lote">
          <RotateCcw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }
  /* Montar los precios recién con todo leído: arrancan con lo sugerido. */
  if (!lectura || catalogo.cargando || resolver.calculando) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]" data-vista="lote-leyendo">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo los precios del lote…
      </p>
    );
  }
  return <ValorizarPrecios cub={cub} cuenta={cuenta} preciosSugeridos={sugeridos} onAplicada={onAplicada} />;
}
