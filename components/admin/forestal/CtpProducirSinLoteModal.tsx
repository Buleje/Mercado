"use client";

/**
 * Producir SIN lote: cubicar acá mismo y declarar la corrida (ADR-408).
 *
 * El caso real del aserradero (Brandon, 2026-09-09): *«quiero registrar una
 * producción sin lote ni consumo — poner la producción ahí mismo»*. Pasa todo
 * el tiempo: la sierra cortó el sábado, el parte llega el lunes y el lote con
 * sus trozas se arma después. Obligar a tener el lote ANTES empuja a inventar
 * uno —o a no anotar la jornada, que es peor.
 *
 * ## Lo que hace
 *
 * 1. Abre el **cubicador de madera entero** (medidas, voz, tabla, apartados) en
 *    su propio espacio de almacenamiento: lo que se cubica acá NO toca el lote
 *    del cubicador, ni Resúmenes, ni el reparto, ni el papel.
 * 2. Con lo cubicado arma los **paquetes** —uno por medida, con su escuadría en
 *    cm/m como los pide el Libro— y declara la corrida de Producción.
 *
 * ## El permiso a vincular (ADR-409)
 *
 * Lo único que sí se declara del origen es **a qué título habilitante se va a
 * vincular** esta producción. Va a `ForestCtpEntry.originCode` —el permiso
 * declarado del asiento (ADR-402), el mismo campo que usa una existencia de
 * apertura— y no inventa trazabilidad: sigue sin haber trozas atribuidas. Lo
 * que habilita es la cuenta del apartado «Saldo por permiso»: cuánto puede dar
 * ese permiso al 56 %, cuánto ya se declaró sin lote contra él y cuánto queda.
 * La simulación se ve acá mismo ANTES de registrar.
 *
 * ## Lo que NO hace, a propósito
 *
 * No inventa el origen. La corrida nace **sin consumos y sin lote**: el Libro ya
 * sabe mostrar eso (una corrida que declaró producción y todavía no dice de qué
 * madera salió). Vincularla con su lote es un acto aparte —con sus reglas de
 * especie, volumen y largo— y hasta que ocurra, la corrida se ve como lo que
 * es: producción declarada sin materia prima atribuida. Declararle un origen
 * que nadie eligió sería fabricar trazabilidad.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Calculator, Loader2, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { logger } from "@/lib/logger";
import { unificarPorMedida, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { tipoDePieza } from "@/lib/forestal/cubicacion-tipo";
import { productoDelTipoComercial } from "@/lib/forestal/loctp-catalogos";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { guardarProduccionDeCorrida } from "./hooks/guardar-produccion-corrida";
import { useSaldoPermisos } from "./hooks/use-saldo-permisos";
import { SIN_PERMISO, simularCorrida } from "@/lib/forestal/saldo-por-permiso";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { sugerirCodigoPaquete } from "@/lib/forestal/produccion-paquetes";
import CubicadorMadera from "./CubicadorMadera";
import { Btn } from "./ctp-shared";

/** El espacio propio de este cubicador — otra libreta, la misma pantalla. */
export const ESPACIO_PRODUCCION = "-ctp-produccion";

const PULG_A_CM = 2.54;
const PIE_A_M = 0.3048;
const hoyIso = () => new Date().toISOString().slice(0, 10);
const r4 = (n: number) => Math.round(n * 10000) / 10000;

const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const LABEL =
  "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";

/** Un paquete del Libro armado desde una medida cubicada. */
interface PaqueteDeMedida {
  codigo: string;
  productType: string | null;
  presentacion: string;
  cantidad: number;
  volumenM3: number;
  espesorCm: number;
  anchoCm: number;
  largoM: number;
  medida: string;
  especie: string;
  pieTablar: number;
}

/**
 * De las piezas cubicadas a los paquetes del Libro: una línea por MEDIDA, con
 * las escuadrías pasadas a cm y m, que es como las declara el LO-CTP.
 */
export function paquetesDeLoCubicado(
  piezas: readonly PiezaCubicada[],
  /**
   * Los códigos de paquete que YA existen en la planta. El código es único en
   * TODO el tenant, así que la numeración `SL-1`, `SL-2`… de la primera versión
   * chocaba con la segunda producción sin lote —medido: la corrida se creaba y
   * el paquete la rechazaba, dejándola vacía—. Con la serie de la planta el
   * código sale libre de entrada, igual que en `CtpRegistrarProduccionModal`.
   */
  opts: { codigosEnPlanta?: readonly string[]; hoy?: Date } = {},
): PaqueteDeMedida[] {
  const hoy = opts.hoy ?? new Date();
  const enPlanta = opts.codigosEnPlanta ?? [];
  /* Los ya propuestos en ESTA tanda: dos medidas no pueden pedir el mismo. */
  const propuestos: string[] = [];
  return unificarPorMedida([...piezas])
    .filter((p) => p.cantidad > 0 && (p.m3 ?? 0) > 0)
    .map((p) => {
      const tipo = tipoDePieza(p);
      const codigo = sugerirCodigoPaquete(enPlanta, { hoy, ocupados: propuestos });
      propuestos.push(codigo);
      return {
        codigo,
        productType: productoDelTipoComercial(tipo),
        presentacion: "PIEZAS",
        cantidad: p.cantidad,
        volumenM3: r4(p.m3 ?? 0),
        espesorCm: Math.round(p.espesor * PULG_A_CM * 100) / 100,
        anchoCm: Math.round(p.ancho * PULG_A_CM * 100) / 100,
        largoM: Math.round(p.largo * PIE_A_M * 100) / 100,
        medida: `${p.espesor}×${p.ancho}×${p.largo}`,
        especie: (p.especie ?? "").trim(),
        pieTablar: p.pieTablar ?? 0,
      };
    });
}

export default function CtpProducirSinLoteModal({
  onCerrar,
  onListo,
}: {
  onCerrar: () => void;
  /** Se llama con el id de la corrida creada, para refrescar la vista. */
  onListo: (mensaje: string) => void;
}) {
  const [piezas, setPiezas] = useState<PiezaCubicada[]>([]);
  const [paso, setPaso] = useState<"cubicar" | "declarar">("cubicar");
  const [fecha, setFecha] = useState(hoyIso);
  const [linea, setLinea] = useState("");
  /* El título habilitante al que se va a vincular esta producción (ADR-402).
     Texto libre con sugerencias: un permiso puede no tener todavía ninguna
     troza cargada, y rechazarlo obligaría a anotar la jornada sin él. */
  const [permiso, setPermiso] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Foco adentro, Tab que no se escapa, Escape que cierra y foco devuelto. */
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: guardando ? undefined : onCerrar });

  /* La serie de códigos que ya usa la planta: sin ella el sugerido puede caer
     en uno tomado y el paquete se rechaza DESPUÉS de crear la corrida. */
  const [codigosPlanta, setCodigosPlanta] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/ctp?codigosPaquete=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { codigos: [] }))
      .then((j: { codigos?: string[] }) => {
        if (vivo) setCodigosPlanta(j.codigos ?? []);
      })
      /* Sin la serie se propone desde cero y el servidor sigue validando: es
         una ayuda, no un requisito. */
      .catch(() => {
        if (vivo) setCodigosPlanta([]);
      });
    return () => {
      vivo = false;
    };
  }, []);
  const paquetes = useMemo(
    () => paquetesDeLoCubicado(piezas, { codigosEnPlanta: codigosPlanta }),
    [piezas, codigosPlanta],
  );
  const total = useMemo(
    () =>
      paquetes.reduce(
        (a, p) => ({
          piezas: a.piezas + p.cantidad,
          m3: a.m3 + p.volumenM3,
          pt: a.pt + p.pieTablar,
        }),
        { piezas: 0, m3: 0, pt: 0 },
      ),
    [paquetes],
  );
  /** La especie del lote cubicado. Con dos, se dice: el asiento declara UNA. */
  const especies = useMemo(
    () => [...new Set(paquetes.map((p) => p.especie).filter(Boolean))],
    [paquetes],
  );

  /* El saldo por permiso se pide recién en el paso «declarar»: es la lectura
     más cara del libro y cubicar no la necesita. */
  const saldo = useSaldoPermisos(paso === "declarar");
  /** La especie que el asiento va a declarar — la misma que se simula. */
  const especiePrincipal = especies[0] ?? null;
  /**
   * Los permisos que se ofrecen: **sólo los que tienen rolliza de la especie
   * que se está declarando** (Brandon, 2026-09-10). Ofrecer un permiso de
   * copaiba mientras se cubica tornillo es ofrecer un error: el saldo de esa
   * especie nace en cero y el sobrante en rojo.
   *
   * Si ninguno la tiene, se ofrecen TODOS y la pantalla lo dice: recortar la
   * lista a cero dejaría sin elegir a quien sí sabe de qué permiso salió —el
   * campo es libre justamente para eso—.
   */
  const permisos = useMemo(() => {
    const todos = (saldo.datos?.rolliza ?? [])
      .map((r) => r.permiso)
      .filter((p): p is string => Boolean(p));
    const clave = claveEspecie(especiePrincipal ?? "");
    if (!clave) return { lista: todos, filtrados: false };
    const conLaEspecie = (saldo.datos?.rolliza ?? [])
      .filter((r) => r.permiso && r.especies.some((e) => e.clave === clave))
      .map((r) => r.permiso as string);
    return conLaEspecie.length > 0
      ? { lista: conLaEspecie, filtrados: true }
      : { lista: todos, filtrados: false };
  }, [saldo.datos, especiePrincipal]);
  /**
   * Cómo queda el permiso si esta producción se registra. No hay aritmética
   * nueva: el borrador entra como una corrida más en la MISMA cuenta que dibuja
   * el apartado «Saldo por permiso» (ADR-409).
   */
  const simulacion = useMemo(() => {
    const codigo = permiso.trim();
    if (!saldo.datos || !codigo || total.m3 <= 0) return null;
    const { antes, despues } = simularCorrida(saldo.datos.rolliza, saldo.datos.corridas, {
      id: "borrador",
      lineNo: null,
      fecha,
      especie: especiePrincipal,
      permiso: codigo,
      cantidad: r4(total.m3),
      unidad: "m3",
      referencia: null,
    });
    const clave = claveEspecie(especiePrincipal ?? "");
    return {
      antes: antes?.especies.find((e) => e.clave === clave) ?? null,
      despues: despues?.especies.find((e) => e.clave === clave) ?? null,
    };
  }, [saldo.datos, permiso, total.m3, fecha, especiePrincipal]);

  const registrar = async () => {
    if (paquetes.length === 0) return;
    setGuardando(true);
    setError(null);
    try {
      /* 1) La corrida nace ABIERTA y sin origen: sin consumos y sin lote. */
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          section: "produccion",
          entryDate: fecha,
          speciesCommon: especies[0] ?? null,
          materiaPrimaRef: "Sin lote — cubicado en el Libro",
          /* El permiso DECLARADO del asiento: sólo vale porque esta corrida no
             consume ninguna guía de la que heredarlo (ADR-402). */
          originCode: permiso.trim() || null,
          observations: observaciones.trim() || null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        entry?: { id?: string };
        message?: string;
        error?: string;
      };
      if (!r.ok || !j.entry?.id)
        throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);

      /* 2) Y se declara con los paquetes — el mismo camino que una corrida que
            se abrió consumiendo: no hay dos formas de declarar producción.

            Si esto falla, la corrida del paso 1 se DESHACE: una producción
            creada sin nada declarado queda en el libro como una línea vacía que
            nadie sabe de dónde salió —pasó de verdad, con un código de paquete
            ya tomado— y es peor que no haberla registrado. Mismo criterio que
            el POST de despacho con trozas. */
      const entryId = j.entry.id;
      try {
        await guardarProduccionDeCorrida(entryId, "declarar", {
          fecha,
          lineaProduccion: linea,
          observaciones: observaciones.trim() || null,
          paquetes: paquetes.map((p) => ({
            /* `id` es del borrador de la UI (React key), no del Libro: el
             servidor sólo lee código, producto, cantidad y medidas. */
            id: p.codigo,
            codigo: p.codigo,
            /* Sin catálogo que lo mapee queda «MADERA ASERRADA» a secas: el Libro
             admite el genérico, inventar un tipo sería peor. */
            productType: p.productType ?? "MADERA ASERRADA",
            presentacion: p.presentacion,
            cantidad: p.cantidad,
            volumenM3: p.volumenM3,
            espesorCm: p.espesorCm,
            anchoCm: p.anchoCm,
            largoM: p.largoM,
            observations: "",
          })),
          volumen: r4(total.m3),
        });
      } catch (e) {
        await fetch(`/api/admin/forestal/ctp?id=${entryId}`, {
          method: "DELETE",
          credentials: "include",
          headers: csrfHeaders(),
          /* Si el deshacer TAMBIÉN falla, el error que se muestra sigue siendo
             el de la declaración —es el que explica qué pasó— pero queda el
             rastro de la línea vacía que quedó en el libro. */
        }).catch((err) =>
          logger.error("[producir-sin-lote] no se pudo deshacer la corrida vacía", {
            entryId,
            error: String(err),
          }),
        );
        /* Y se dice: sin esto, quien lee el error sale a buscar en el libro una
           corrida que ya no está. */
        throw new Error(
          `${e instanceof Error ? e.message : String(e)} · No quedó nada registrado: la corrida se deshizo.`,
        );
      }
      invalidarCtp();
      onListo(
        `Producción registrada sin lote: ${fmtPiezas(total.piezas)} piezas · ${fmtM3(total.m3)} m³ en ${paquetes.length} paquete(s). Falta vincularle su materia prima.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-2">
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Producir sin lote"
        className="flex h-[96vh] w-full max-w-[98vw] flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        {/* Cabecera */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--rule-base)] px-4 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <Calculator className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle as="h3" className="font-display text-lg text-[var(--text-primary)]">
              Producir sin lote
            </CardTitle>
            <p className="text-xs text-[var(--text-tertiary)]">
              Cubicá acá y declaralo en el Libro. La materia prima se vincula después —
              <b> lo que cubiques acá no toca el lote del cubicador</b>.
            </p>
          </div>
          <span className="ml-auto flex flex-wrap items-center gap-2 font-mono text-sm tabular-nums">
            <span className="rounded-lg border border-[var(--rule-base)] px-2 py-1">
              {fmtPiezas(total.piezas)}{" "}
              <span className="font-sans text-xs text-[var(--text-tertiary)]">pzas</span>
            </span>
            <span className="rounded-lg border border-[var(--rule-base)] px-2 py-1">
              {fmtM3(total.m3)}{" "}
              <span className="font-sans text-xs text-[var(--text-tertiary)]">m³</span>
            </span>
            <span className="rounded-lg border border-[var(--rule-base)] px-2 py-1">
              {fmtPt(total.pt)}{" "}
              <span className="font-sans text-xs text-[var(--text-tertiary)]">PT</span>
            </span>
          </span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-xl p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo: el cubicador ENTERO, en su propia libreta */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {paso === "cubicar" ? (
            <CubicadorMadera espacio={ESPACIO_PRODUCCION} onLote={setPiezas} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className={LABEL}>Fecha de la producción</span>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className={`mt-1 ${CAMPO}`}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>Línea de producción</span>
                  <input
                    value={linea}
                    onChange={(e) => setLinea(e.target.value)}
                    placeholder="Sierra principal"
                    className={`mt-1 ${CAMPO}`}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>Especie</span>
                  <input
                    value={especies.join(" · ") || "Sin especie declarada"}
                    readOnly
                    title="Sale de lo cubicado: el asiento declara UNA especie"
                    className={`mt-1 ${CAMPO} bg-[var(--surface-sunken)]`}
                  />
                </label>
              </div>
              {/* El permiso al que se va a vincular esta producción, y cómo le
                  queda el saldo si se registra (ADR-409). El campo es libre con
                  sugerencias: un título habilitante puede no tener todavía
                  ninguna troza cargada, y rechazarlo empujaría a anotar la
                  jornada sin él —que es el dato que después falta. */}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>Permiso a vincular (título habilitante)</span>
                  <input
                    value={permiso}
                    onChange={(e) => setPermiso(e.target.value)}
                    list="ctp-permisos-sin-lote"
                    placeholder={
                      saldo.cargando ? "Buscando permisos…" : "Ej. CON-25-001 · o escribilo"
                    }
                    className={`mt-1 ${CAMPO} font-mono`}
                  />
                  <datalist id="ctp-permisos-sin-lote">
                    {permisos.lista.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                  <span className="mt-1 block text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
                    {permisos.filtrados
                      ? permisos.lista.length === 1
                        ? `Se ofrece el único permiso con rolliza de ${especiePrincipal} en el patio. `
                        : `Se ofrecen los ${permisos.lista.length} permisos con rolliza de ${especiePrincipal} en el patio. `
                      : especiePrincipal && permisos.lista.length > 0
                        ? `Ningún permiso tiene rolliza de ${especiePrincipal} en el patio: se ofrecen todos. `
                        : ""}
                    Se guarda en el asiento, no en una guía: esta corrida no consume ninguna. Sin
                    él, la producción queda bajo «{SIN_PERMISO}» en el saldo por permiso.
                  </span>
                </label>

                <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                    Simulación del permiso · {especiePrincipal || "sin especie"}
                  </p>
                  {!permiso.trim() ? (
                    <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                      Elegí un permiso para ver cuánto le queda después de declarar esto.
                    </p>
                  ) : saldo.cargando && !saldo.datos ? (
                    <p className="mt-1 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo el patio…
                    </p>
                  ) : simulacion?.despues ? (
                    <>
                      <p className="mt-0.5 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                        {fmtM3(simulacion.despues.rollizaM3)} m³ rolliza en patio ·{" "}
                        {fmtPt(simulacion.despues.aserrablePt)} pt aserrables al 56 %
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        Sobrante:{" "}
                        <b className="font-mono tabular-nums">
                          {fmtM3(simulacion.antes?.sobranteM3 ?? 0)}
                        </b>{" "}
                        →{" "}
                        <b
                          className={`font-mono tabular-nums ${
                            simulacion.despues.sobranteM3 < -0.001
                              ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {fmtM3(simulacion.despues.sobranteM3)}
                        </b>{" "}
                        m³ ({fmtPt(simulacion.despues.sobrantePt)} pt)
                      </p>
                      {simulacion.despues.sobranteM3 < -0.001 && (
                        <p className="mt-1 text-[length:var(--ts-2xs)] leading-snug text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                          {simulacion.despues.rollizaM3 <= 0 ? (
                            <>
                              Este permiso{" "}
                              <b>no tiene rolliza de {especiePrincipal || "esta especie"}</b> en el
                              patio: lo declarado va a quedar sin madera que lo respalde. Se
                              registra igual —el tope de verdad lo mide la corrida contra su materia
                              prima— pero conviene revisar si esta producción es de otro permiso.
                            </>
                          ) : (
                            <>
                              Con esto el permiso queda declarando{" "}
                              <b>más producto del que su rolliza puede dar</b> al 56 %. Se registra
                              igual —el tope de verdad lo mide la corrida contra su materia prima—
                              pero conviene revisar si esta producción es de otro permiso.
                            </>
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                      Ese permiso todavía no tiene rolliza cargada en el libro: la producción va a
                      quedar sin respaldo de materia prima en el saldo.
                    </p>
                  )}
                </div>
              </div>

              <label className="block">
                <span className={LABEL}>Observaciones</span>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  placeholder="Turno, sierra, quién cortó… lo que haga falta para reconocer esta jornada"
                  className="mt-1 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>

              {especies.length > 1 && (
                <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
                  Lo cubicado tiene <b>{especies.length} especies</b> ({especies.join(", ")}). El
                  asiento declara la primera; si son de verdad distintas, conviene una corrida por
                  especie — el Libro pide una especie por asiento.
                </p>
              )}

              <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
                <table className="w-full text-sm">
                  <caption className="sr-only">Paquetes que se van a declarar</caption>
                  <thead className="bg-[var(--surface-sunken)]">
                    <tr>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-left`}>
                        Paquete
                      </th>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-left`}>
                        Producto
                      </th>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-left`}>
                        Medida
                      </th>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-right`}>
                        Piezas
                      </th>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-right`}>
                        m³
                      </th>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-right`}>
                        PT
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paquetes.map((p) => (
                      <tr key={p.codigo} className="border-t border-[var(--rule-soft)]">
                        <td className="px-2 py-1.5 font-mono font-bold text-[var(--text-primary)]">
                          {p.codigo}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--text-secondary)]">
                          {p.productType ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[var(--text-secondary)]">
                          {p.medida}
                          <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                            {p.espesorCm} × {p.anchoCm} cm · {p.largoM} m
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                          {fmtPiezas(p.cantidad)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums">
                          {fmtM3(p.volumenM3)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                          {fmtPt(p.pieTablar)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      <th scope="row" className="px-2 py-1.5 text-left" colSpan={3}>
                        {paquetes.length} {paquetes.length === 1 ? "paquete" : "paquetes"}
                      </th>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {fmtPiezas(total.piezas)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {fmtM3(total.m3)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {fmtPt(total.pt)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-secondary)]">
                La corrida se registra <b>sin materia prima atribuida</b>: nace sin consumos y sin
                lote. Queda en el Libro como producción declarada que todavía no dice de qué madera
                salió — vincularla con su lote es el paso siguiente, con sus reglas de especie,
                volumen y largo.
              </p>
              {error && (
                <p className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--rule-base)] px-4 py-3">
          {paso === "declarar" && (
            <Btn onClick={() => setPaso("cubicar")} disabled={guardando}>
              Volver a cubicar
            </Btn>
          )}
          <span className="mr-auto text-xs text-[var(--text-tertiary)]">
            {paquetes.length === 0
              ? "Cubicá al menos una medida para poder declarar."
              : `${paquetes.length} ${paquetes.length === 1 ? "medida cubicada" : "medidas cubicadas"}`}
          </span>
          {paso === "cubicar" ? (
            <button
              type="button"
              onClick={() => setPaso("declarar")}
              disabled={paquetes.length === 0}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              <Boxes className="h-4 w-4" aria-hidden /> Declarar esta producción
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void registrar()}
              disabled={guardando || paquetes.length === 0}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
            >
              {guardando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Boxes className="h-4 w-4" aria-hidden />
              )}
              {guardando ? "Registrando…" : "Registrar producción"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
