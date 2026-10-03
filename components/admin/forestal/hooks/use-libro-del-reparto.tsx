"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, BookOpen, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import type { DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { claveMarca, type AsignacionGrupo, type BloqueDistribuido, type BloqueRolliza, type Distribucion } from "@/lib/forestal/cubicacion-reparto";
import { completarDelLote, planLibroDeBloque, sumaDeLineas, type CorridaDelLoteParaCompletar } from "@/lib/forestal/jornadas-de-bloque";
import { productoDelTipoComercial } from "@/lib/forestal/loctp-catalogos";
import { distConVolumenOficial, repartoOficial } from "@/lib/forestal/reparto-oficial";
import CtpReprocesoModal from "../CtpReprocesoModal";
import RepartoCompletarLote from "../reparto-completar-lote";
import { AvisoDelLibro, JornadaLibro } from "../reparto-jornada-libro";
import { anotarLibroEnLaGuardada } from "../reparto-lotes-sugeridos-api";
import { useLibroDeBloques } from "./use-libro-de-bloques";
import { useMiRol } from "@/hooks/use-mi-rol";
import type { EstadoLotesAserrio } from "./use-lotes-aserrio";

/**
 * use-libro-del-reparto — el cableado de la Distribución de rolliza con el
 * Libro (ADR-464, fases 3 y 4), para que `ResumenReparto` sólo lo monte.
 *
 * La producción se declara POR PRODUCTO, mire la tabla lo que mire: con la
 * vista «Por largo» los grupos serían 12', 14'… y el Libro no tiene ese
 * producto. Por eso el plan sale del reparto por tipo con el volumen OFICIAL
 * (el mismo que imprime el Anexo 04), y la tabla que se ve sigue igual.
 */

type Aplicar = (bloqueId: string, cambio: (b: BloqueRolliza) => BloqueRolliza) => void;

const BTN_BLOQUE =
  "inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] px-2 py-1 text-xs font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 dark:text-[var(--accent)]";

export function useLibroDelReparto({
  bloques,
  guardar,
  distribucionId,
  dim,
  distVista,
  distPorTipo,
  lotes,
  marcar,
}: {
  bloques: BloqueRolliza[];
  /** Guarda la tabla en el dispositivo (la misma función de la pantalla). */
  guardar: (next: BloqueRolliza[]) => void;
  /** La distribución guardada abierta: se le anota lo escrito, sin subir la tabla. */
  distribucionId: string | null;
  dim: DimensionResumen;
  distVista: Distribucion;
  distPorTipo: Distribucion;
  lotes: EstadoLotesAserrio;
  marcar: (claves: string[], estado?: boolean) => void;
}) {
  const [hoy] = useState(() => limaDateKey());
  const bloquesRef = useRef(bloques);
  useEffect(() => {
    bloquesRef.current = bloques;
  }, [bloques]);

  const aplicar = useCallback<Aplicar>(
    (id, cambio) => {
      const next = bloquesRef.current.map((b) => (b.id === id ? cambio(b) : b));
      bloquesRef.current = next;
      guardar(next);
      const actual = next.find((b) => b.id === id);
      if (distribucionId && actual) {
        anotarLibroEnLaGuardada(distribucionId, actual).catch((err: unknown) =>
          logger.error("[reparto] anotar el Libro en la distribución guardada falló", { error: String(err) }),
        );
      }
    },
    [guardar, distribucionId],
  );
  const libro = useLibroDeBloques(lotes, aplicar);
  const rol = useMiRol();
  const puedeDeclarar = rol === "admin" || rol === "owner";

  const distLibro = useMemo(
    () => (dim === "tipo" ? distVista : distConVolumenOficial(distPorTipo, repartoOficial(distPorTipo))),
    [dim, distVista, distPorTipo],
  );
  const porId = useMemo(() => new Map(distLibro.especies.flatMap((e) => e.bloques).map((b) => [b.bloque.id, b])), [distLibro]);
  const vistaPorId = useMemo(() => new Map(distVista.especies.flatMap((e) => e.bloques).map((b) => [b.bloque.id, b])), [distVista]);
  const lotePorId = useMemo(() => new Map(lotes.lotes.map((l) => [l.id, l])), [lotes.lotes]);
  const loteDe = useCallback((bd: BloqueDistribuido) => (bd.bloque.loteId ? lotePorId.get(bd.bloque.loteId) : undefined), [lotePorId]);
  const planes = useMemo(() => new Map([...porId].map(([id, bd]) => [id, planLibroDeBloque(bd, loteDe(bd), hoy)])), [porId, loteDe, hoy]);
  const completos = useMemo(() => new Map([...porId].map(([id, bd]) => [id, completarDelLote(bd, loteDe(bd))])), [porId, loteDe]);

  const [completarDe, setCompletarDe] = useState<string | null>(null);
  const [lre, setLre] = useState<{ bloqueId: string; origen: CorridaDelLoteParaCompletar; elegidas: AsignacionGrupo[] } | null>(null);

  /** Un lote que todavía no llegó del servidor no es «no existe». */
  const leyendo = (bd: BloqueDistribuido) => lotes.cargando && Boolean(bd.bloque.loteId) && !loteDe(bd);

  const registrar = async (id: string, dia: number) => {
    const bd = porId.get(id);
    const plan = planes.get(id);
    const j = plan?.jornadas.find((x) => x.dia === dia);
    if (!bd || !plan || !j) return;
    const estado = await libro.registrarJornada(bd.bloque, j, plan.jornadas.length);
    /* Escrita la jornada, la lista «Distribuido» de ese día queda tildada: es
       lo que antes se marcaba a mano después de pasarlo al Libro. */
    if (estado === "declarada") {
      const dVista = vistaPorId.get(id)?.porDia.find((d) => d.dia === dia);
      if (dVista) marcar(dVista.grupos.map((g) => claveMarca(id, dia, g.clave)), true);
    }
  };

  const dia = (b: BloqueDistribuido, d: number): ReactNode => {
    const id = b.bloque.id;
    const plan = planes.get(id);
    const j = plan?.jornadas.find((x) => x.dia === d);
    if (!plan || plan.oculto || !j) return null;
    if (leyendo(b)) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Leyendo el Libro…
        </span>
      );
    }
    /* Declarar la producción (PATCH del Libro) es de admin y dueño: el
       almacenero puede consumir pero no declarar, y su «Registrar» dejaba la
       corrida abierta sin producción. Se le apaga con el motivo. */
    const jVista = j.estado === "lista" && !puedeDeclarar
      ? { ...j, estado: "apagada" as const, motivo: "Registrar la producción en el Libro es de admin o dueño: tu rol puede consumir, pero no declarar lo que salió." }
      : j;
    return (
      <JornadaLibro
        jornada={jVista}
        ocupado={libro.ocupado === `${id}#${d}`}
        bloqueado={libro.ocupado != null}
        onRegistrar={() => void registrar(id, d)}
      />
    );
  };

  const bloque = (b: BloqueDistribuido): ReactNode => {
    const id = b.bloque.id;
    const c = completos.get(id);
    const plan = planes.get(id);
    /* Mientras una jornada se pueda registrar —hoy o cuando llegue su fecha—,
       ése es el camino: «Completar» es para lo que las jornadas ya no pueden escribir. */
    if (!puedeDeclarar || !c?.ofrecer || c.lineas.length === 0 || plan?.jornadas.some((j) => j.estado === "lista" || j.enEspera)) return null;
    return (
      <button type="button" onClick={() => setCompletarDe(id)} disabled={libro.ocupado != null} title={`Declarar lo que falta del lote ${c.loteCode} (LPC o LRE)`} className={`${BTN_BLOQUE} disabled:opacity-50`}>
        <BookOpen className="h-4 w-4" aria-hidden /> Completar
      </button>
    );
  };

  const aviso = (b: BloqueDistribuido): ReactNode => {
    const id = b.bloque.id;
    const plan = planes.get(id);
    const faltan = plan && !plan.oculto && plan.noDisponibles > 0 && !leyendo(b);
    return (
      <>
        {libro.aviso?.bloqueId === id && <AvisoDelLibro aviso={libro.aviso} onCerrar={libro.cerrarAviso} />}
        {faltan && (
          <p className="mx-3 mt-2 flex items-center gap-1.5 text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {plan.noDisponibles} troza{plan.noDisponibles === 1 ? "" : "s"} del bloque ya no {plan.noDisponibles === 1 ? "está libre" : "están libres"} en su lote
            {plan.sinAtribuirM3 > 0 ? ` · ${fmtM3(plan.sinAtribuirM3)} m³ sin atribuir` : ""}
            <InfoTip
              title="Sin atribuir"
              what="Esas trozas entraron a la sierra por otra corrida, se sacaron del lote o no tienen volumen. Las jornadas se registran sólo con las que siguen libres."
              affects="Nunca se declara producción sobre madera que no está: lo que no alcanza queda sin atribuir."
            />
          </p>
        )}
      </>
    );
  };

  const bdCompletar = completarDe ? porId.get(completarDe) : undefined;
  const planCompletar = completarDe ? completos.get(completarDe) : undefined;
  const bdLre = lre ? porId.get(lre.bloqueId) : undefined;
  const sumaLre = lre ? sumaDeLineas(lre.elegidas) : null;
  const primera = lre?.elegidas[0];

  const nodo = (
    <>
      {bdCompletar && planCompletar && (
        <RepartoCompletarLote
          etiqueta={bdCompletar.bloque.etiqueta || "sin etiqueta"}
          plan={planCompletar}
          hoy={hoy}
          ocupado={libro.ocupado === `${bdCompletar.bloque.id}#completar`}
          onLpc={(elegidas, destino) => libro.completarLpc(bdCompletar.bloque, planCompletar, elegidas, destino)}
          onLre={(origen, elegidas) => {
            /* Se cierra uno y se abre el otro: un modal encima de otro se monta detrás. */
            setCompletarDe(null);
            setLre({ bloqueId: bdCompletar.bloque.id, origen, elegidas });
          }}
          onCerrar={() => setCompletarDe(null)}
        />
      )}
      {lre && bdLre && sumaLre && primera && (
        <CtpReprocesoModal
          origen={{
            id: lre.origen.id,
            lineNo: lre.origen.lineNo,
            especie: loteDe(bdLre)?.speciesCommon ?? (bdLre.bloque.especie || null),
            producto: lre.origen.producto,
            unidad: "m3",
            disponible: lre.origen.disponibleM3,
          }}
          sugerencia={{ producto: productoDelTipoComercial(primera.label) ?? primera.label, m3: sumaLre.m3 }}
          onListo={(mensaje, detalle, hecho) => {
            libro.anotarLre(bdLre.bloque, lre.elegidas, hoy, `${mensaje}: ${detalle}`, hecho);
            setLre(null);
          }}
          onClose={() => setLre(null)}
        />
      )}
    </>
  );

  return { libro: { bloque, aviso, dia }, nodo };
}
