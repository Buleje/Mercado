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
import { ESPECIES_MADERA, unificarPorMedida, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { avisoDeEspecie, especieDelAsiento } from "@/lib/forestal/especie-del-asiento";
import { recordarCodigosDeCorrida } from "@/lib/forestal/codigos-de-corrida";
import { tipoDePieza } from "@/lib/forestal/cubicacion-tipo";
import { productoDelTipoComercial } from "@/lib/forestal/loctp-catalogos";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import {
  etiquetaDeDueno,
  revisarDueno,
  type DuenoMadera,
} from "@/lib/forestal/dueno-de-la-madera";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { bloquesDeCorrida, type CobroAserrioValor, type ResultadoCobro } from "@/lib/forestal/tarifa-aserrio";
import CtpCobroAserrio from "./CtpCobroAserrio";
import { guardarProduccionDeCorrida, mensajeCobroAserrio } from "./hooks/guardar-produccion-corrida";
import { useSaldoPermisos } from "./hooks/use-saldo-permisos";
import { SIN_PERMISO, simularCorrida } from "@/lib/forestal/saldo-por-permiso";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { sugerirCodigoPaquete } from "@/lib/forestal/produccion-paquetes";
import CubicadorMadera from "./CubicadorMadera";
import CtpSemanaDeRegistro from "./CtpSemanaDeRegistro";
import { useJornadasDeProduccion } from "./hooks/use-jornadas-produccion";
import { useTrozasParaCodigo } from "./hooks/use-trozas-para-codigo";
import { esIsoValido, hoyEnLima } from "@/lib/forestal/semana-de-registro";
import { Btn } from "./ctp-shared";

/** El espacio propio de este cubicador — otra libreta, la misma pantalla. */
export const ESPACIO_PRODUCCION = "-ctp-produccion";

const PULG_A_CM = 2.54;
const PIE_A_M = 0.3048;
/* El «hoy» del aserradero es el de Pucallpa, no el del meridiano: pasadas las
   19:00 locales el UTC ya está en el día siguiente, y ésa es justo la hora en
   que se carga el parte de la jornada — la fecha nacía un día adelantada. */
const hoyIso = () => hoyEnLima();
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
  /* La semana que se está MIRANDO. Arranca en la del día elegido y se mueve
     sola cuando se tipea una fecha de otra semana en el campo: dos controles
     sobre el mismo dato tienen que contarse lo que pasó. */
  const [semana, setSemana] = useState(fecha);
  const jornadas = useJornadasDeProduccion(semana);
  /* Las trozas del patio para el campo «Código» del cubicador: se leen UNA
     vez con el modal, no cada vez que se vuelve del paso «declarar». */
  const trozasParaCodigo = useTrozasParaCodigo();
  /* Piezas que vienen de una corrida ya declarada, camino al cubicador. Se
     vuelven a `null` apenas entran: si no, cada re-render las agregaría otra
     vez. */
  const [aImportar, setAImportar] = useState<PiezaCubicada[] | null>(null);
  const [linea, setLinea] = useState("");
  /* El título habilitante al que se va a vincular esta producción (ADR-402).
     Texto libre con sugerencias: un permiso puede no tener todavía ninguna
     troza cargada, y rechazarlo obligaría a anotar la jornada sin él. */
  const [permiso, setPermiso] = useState("");
  const [observaciones, setObservaciones] = useState("");
  /* De quién es la madera (ADR-412). Arranca sin elegir a propósito: un centro
     que asierra por encargo no es el dueño de lo que produce, y suponer que sí
     es la respuesta que después nadie revisa. */
  const [dueno, setDueno] = useState<DuenoMadera | null>(null);
  const [titular, setTitular] = useState("");
  /* A quién se le cobra y a qué precio (ADR-412) — sólo tiene sentido cuando la
     madera es «de un tercero»: el centro no se cobra a sí mismo. */
  const [aserrio, setAserrio] = useState<CobroAserrioValor>({ duenoParteId: null, precioManualPt: null });
  /* "A mano" con el campo vacío mientras el botón sigue en "a mano" no se
     puede registrar (ver `CtpCobroAserrio`). */
  const [aserrioValido, setAserrioValido] = useState(true);
  const directorioParaCobro = useDirectorioForestal();
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

  /**
   * La especie que el asiento va a declarar (ADR-417). El libro declara UNA por
   * asiento, y hasta hoy salía sola de lo cubicado: si nadie la había puesto en
   * las piezas, el campo decía «Sin especie declarada» y la corrida se
   * registraba igual — así quedó la única producción sin lote real del tenant
   * (N.º 28 del 10/09: 6 paquetes, 0,2417 m³, sin especie y sin permiso).
   * Ahora, cuando lo cubicado no la trae o trae varias, se elige acá y se baja a
   * las piezas, que es donde vive: el paquete la lleva porque la pieza la tiene.
   */
  const [especieElegida, setEspecieElegida] = useState<string | null>(null);
  const decision = useMemo(() => especieDelAsiento(especies, especieElegida), [especies, especieElegida]);
  const especiePrincipal = decision.especie;
  /**
   * Lo que se ofrece para elegir sale de lo que el modal YA tiene cargado —lo
   * cubicado, el patio que trajo el campo «Código» y las de fábrica—: un hook
   * más de catálogo acá sería un segundo pedido de la misma lista que el
   * cubicador ya pidió.
   */
  const especiesOfrecidas = useMemo(() => {
    const delPatio = trozasParaCodigo.trozas.map((t) => t.especie).filter((e): e is string => Boolean(e));
    return [...new Set([...especies, ...delPatio, ...ESPECIES_MADERA])];
  }, [especies, trozasParaCodigo.trozas]);
  /** Aplica la especie a TODAS las piezas: el asiento declara una sola. */
  const declararEspecie = (nombre: string) => {
    setEspecieElegida(nombre || null);
    if (!nombre) return;
    setPiezas((previas) => previas.map((pieza) => ({ ...pieza, especie: nombre })));
  };

  /** Los mismos paquetes cubicados, en la forma que pide `cotizarAserrio` (ADR-412). */
  const bloquesAserrio = useMemo(
    () =>
      bloquesDeCorrida(
        { lineNo: null, speciesCommon: especiePrincipal, productType: paquetes[0]?.productType ?? null, quantity: total.m3 },
        paquetes.map((p) => ({
          codigo: p.codigo,
          productType: p.productType,
          volumenM3: p.volumenM3,
          espesorCm: p.espesorCm,
          anchoCm: p.anchoCm,
          largoM: p.largoM,
        })),
      ),
    [especiePrincipal, paquetes, total.m3],
  );

  /* El saldo por permiso se pide recién en el paso «declarar»: es la lectura
     más cara del libro y cubicar no la necesita. */
  const saldo = useSaldoPermisos(paso === "declarar");
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

  /* Lo declarado tiene que decir algo: «de tercero» sin nombre no dice de quién
     es la madera, y un titular colgado de «propia» dice dos cosas a la vez. */
  const revisionDueno = useMemo(
    () => revisarDueno({ dueno, titularNombre: titular }),
    [dueno, titular],
  );

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
          // La DECIDIDA, no la primera cubicada: hoy coinciden porque elegirla la
          // baja a las piezas, pero el asiento no puede depender de ese rebote.
          speciesCommon: especiePrincipal,
          materiaPrimaRef: "Sin lote — cubicado en el Libro",
          /* El permiso DECLARADO del asiento: sólo vale porque esta corrida no
             consume ninguna guía de la que heredarlo (ADR-402). */
          originCode: permiso.trim() || null,
          duenoMadera: revisionDueno.normalizado.dueno,
          titularNombre: revisionDueno.normalizado.titularNombre,
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
      let aserrioCobrado: ResultadoCobro | undefined;
      try {
        ({ aserrio: aserrioCobrado } = await guardarProduccionDeCorrida(entryId, "declarar", {
          fecha,
          lineaProduccion: linea,
          observaciones: observaciones.trim() || null,
          // Sólo tiene sentido cuando la madera es de un tercero — «Es del
          // centro» no se cobra a sí mismo.
          // Corrida NUEVA: no hay trato previo que preservar, así que acá
          // "nada elegido" y "ausente" dan lo mismo — no como en declarar/
          // ampliar una corrida existente, donde ausente == no tocar.
          aserrio: dueno === "tercero" && aserrio.duenoParteId ? aserrio : undefined,
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
        }));
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
      /* Los códigos anotados al cubicar quedan atados a ESTA corrida: con eso
         «Vincular materia prima» se abre con la propuesta ya armada, en vez de
         pedir que alguien recuerde de qué trozas salió (ADR-417). */
      recordarCodigosDeCorrida(entryId, piezas);
      invalidarCtp();
      const avisoCobro = mensajeCobroAserrio(aserrioCobrado);
      onListo(
        `Producción registrada sin lote: ${fmtPiezas(total.piezas)} piezas · ${fmtM3(total.m3)} m³ en ${paquetes.length} paquete(s). Falta vincularle su materia prima.` +
          (avisoCobro ? ` ${avisoCobro}` : ""),
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
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <Calculator className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle as="h3" className="font-display text-lg text-[var(--text-primary)]">
              Producir sin lote
            </CardTitle>
            <p className="text-xs text-[var(--text-tertiary)]">
              Cubica acá y decláralo en el Libro. La materia prima se vincula después —
              <b> lo que cubiques acá no toca el lote del cubicador</b>.
            </p>
          </div>
          <span className="ml-auto flex flex-wrap items-center gap-2 font-mono text-sm tabular-nums">
            <span className="rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5">
              {fmtPiezas(total.piezas)}{" "}
              <span className="font-sans text-xs text-[var(--text-tertiary)]">pzas</span>
            </span>
            <span className="rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5">
              {fmtM3(total.m3)}{" "}
              <span className="font-sans text-xs text-[var(--text-tertiary)]">m³</span>
            </span>
            <span className="rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5">
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

        {/* El día al que va este registro (Brandon, 2026-09-11). Va acá arriba,
            fuera del cuerpo que scrollea, porque es una decisión del ASIENTO y
            no de lo cubicado: se ve y se cambia igual mientras se miden las
            piezas, y cada casillero dice lo que ese día ya tiene anotado. */}
        <div className="shrink-0 border-b border-[var(--rule-base)] px-5 py-3 sm:px-6">
          <CtpSemanaDeRegistro
            valor={fecha}
            onElegir={(iso) => {
              setFecha(iso);
              setSemana(iso);
            }}
            semana={semana}
            onSemana={setSemana}
            porDia={jornadas.porDia}
            cargando={jornadas.cargando}
            error={jornadas.error}
            /* Traer una corrida al cubicado: acá SÍ hay dónde ponerla. Vuelve
               al paso de cubicar, porque es ahí donde se editan las filas. */
            onCopiarAlCubicado={(piezas) => {
              setAImportar(piezas);
              setPaso("cubicar");
            }}
          />
        </div>

        {/* Cuerpo: el cubicador ENTERO, en su propia libreta */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:px-6">
          {paso === "cubicar" ? (
            <CubicadorMadera
              espacio={ESPACIO_PRODUCCION}
              onLote={setPiezas}
              piezasAImportar={aImportar}
              onImportado={() => setAImportar(null)}
              /* El código de la troza es interno (Brandon, 2026-09-14): no
                 entra a `paquetesDeLoCubicado` ni a lo que se registra. */
              codigoDeTroza={trozasParaCodigo}
            />
          ) : (
            <div className="mx-auto max-w-3xl space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className={LABEL}>Fecha de la producción</span>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => {
                      setFecha(e.target.value);
                      /* Tipear una fecha de otra semana mueve la tira de arriba:
                         si no, el campo dice «02/05» y los siete casilleros
                         siguen mostrando otra semana sin ninguno marcado. */
                      if (esIsoValido(e.target.value)) setSemana(e.target.value);
                    }}
                    title="El mismo día que la tira de arriba — acá se llega rápido a una fecha lejana"
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
                  {decision.estado === "de-lo-cubicado" ? (
                    <input
                      value={decision.especie}
                      readOnly
                      title="Sale de lo cubicado: el asiento declara UNA especie"
                      className={`mt-1 ${CAMPO} bg-[var(--surface-sunken)]`}
                    />
                  ) : (
                    <select
                      value={especieElegida ?? ""}
                      onChange={(e) => declararEspecie(e.target.value)}
                      className={`mt-1 ${CAMPO}`}
                    >
                      <option value="">
                        {especies.length === 0 ? "Elige la especie…" : `Cubicaste ${especies.length}: elige cuál declara`}
                      </option>
                      {especiesOfrecidas.map((nombre) => (
                        <option key={nombre} value={nombre}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                  )}
                  {avisoDeEspecie(decision, total.piezas) && (
                    <span className="mt-1 block text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
                      {avisoDeEspecie(decision, total.piezas)}
                    </span>
                  )}
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
                      saldo.cargando ? "Buscando permisos…" : "Ej. CON-25-001 · o escríbelo"
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
                      Elige un permiso para ver cuánto le queda después de declarar esto.
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

              {/* De quién es la madera (ADR-412). Un aserradero que presta
                  servicio de maquila produce madera que NO es suya, y el
                  certificado tiene que decirlo. Sin elegir queda sin declarar:
                  es más honesto que suponerle un dueño al asiento. */}
              <div>
                <span className={LABEL}>Dueño de la madera</span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {([
                    { v: "propia" as const, t: "Es del centro" },
                    { v: "tercero" as const, t: "Es de un tercero" },
                  ]).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      aria-pressed={dueno === o.v}
                      onClick={() => {
                        /* Volver a tocar la misma opción la suelta: así se puede
                           dejar sin declarar después de haber elegido. */
                        setDueno((d) => (d === o.v ? null : o.v));
                        if (o.v === "propia") {
                          setTitular("");
                          // El centro no se cobra a sí mismo: sin esto, elegir
                          // "Es del centro" DESPUÉS de haber picado un dueño
                          // dejaba el cobro colgado, listo para mandarse igual.
                          setAserrio({ duenoParteId: null, precioManualPt: null });
                        }
                      }}
                      className={`h-10 rounded-xl border px-3.5 text-sm font-semibold transition ${
                        dueno === o.v
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {o.t}
                    </button>
                  ))}
                  {dueno === "tercero" && (
                    <input
                      value={titular}
                      onChange={(e) => setTitular(e.target.value)}
                      placeholder="CC.NN. San Luis · servicio de maquila"
                      aria-label="Titular de la madera"
                      className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  )}
                </div>
                <p
                  className={`mt-1 text-xs ${
                    revisionDueno.problema
                      ? "font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                      : "text-[var(--text-tertiary)]"
                  }`}
                >
                  {revisionDueno.problema ??
                    etiquetaDeDueno(revisionDueno.normalizado) ??
                    "Si no lo eliges, la corrida queda sin declararlo — y eso es lo que va a decir el libro."}
                </p>
              </div>

              {/* Cobrarle el aserrío a ese tercero (ADR-412): elegilo de la
                  libreta y el nombre declarado se copia solo — dos casillas
                  que dicen lo mismo no pueden quedar desincronizadas. */}
              {dueno === "tercero" && (
                <div className="rounded-xl border border-[var(--rule-base)] p-3">
                  <CtpCobroAserrio
                    fecha={fecha}
                    bloques={bloquesAserrio}
                    valor={aserrio}
                    onValidez={setAserrioValido}
                    onChange={(v) => {
                      setAserrio(v);
                      const elegido = v.duenoParteId
                        ? directorioParaCobro.partes.find((p) => p.id === v.duenoParteId)
                        : null;
                      if (elegido) setTitular(elegido.nombre);
                    }}
                  />
                  {!aserrio.duenoParteId && titular.trim() && (
                    <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                      No está en la libreta: se declara, pero no se le puede cobrar.
                    </p>
                  )}
                </div>
              )}

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
                      <th scope="col" className={`${LABEL} px-3 py-2.5 text-left`}>
                        Paquete
                      </th>
                      <th scope="col" className={`${LABEL} px-3 py-2.5 text-left`}>
                        Producto
                      </th>
                      <th scope="col" className={`${LABEL} px-3 py-2.5 text-left`}>
                        Medida
                      </th>
                      <th scope="col" className={`${LABEL} px-3 py-2.5 text-right`}>
                        Piezas
                      </th>
                      <th scope="col" className={`${LABEL} px-3 py-2.5 text-right`}>
                        m³
                      </th>
                      <th scope="col" className={`${LABEL} px-3 py-2.5 text-right`}>
                        PT
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paquetes.map((p) => (
                      <tr key={p.codigo} className="border-t border-[var(--rule-soft)]">
                        <td className="px-3 py-2.5 font-mono font-bold text-[var(--text-primary)]">
                          {p.codigo}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                          {p.productType ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[var(--text-secondary)]">
                          {p.medida}
                          <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                            {p.espesorCm} × {p.anchoCm} cm · {p.largoM} m
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {fmtPiezas(p.cantidad)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
                          {fmtM3(p.volumenM3)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                          {fmtPt(p.pieTablar)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      <th scope="row" className="px-3 py-2.5 text-left" colSpan={3}>
                        {paquetes.length} {paquetes.length === 1 ? "paquete" : "paquetes"}
                      </th>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {fmtPiezas(total.piezas)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {fmtM3(total.m3)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
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
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-[var(--rule-base)] px-5 py-3.5 sm:px-6">
          {paso === "declarar" && (
            <Btn onClick={() => setPaso("cubicar")} disabled={guardando}>
              Volver a cubicar
            </Btn>
          )}
          <span className="mr-auto text-xs text-[var(--text-tertiary)]">
            {paquetes.length === 0
              ? "Cubica al menos una medida para poder declarar."
              : paso === "declarar" && !especiePrincipal
                ? "Falta la especie: el libro declara una por asiento."
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
              disabled={guardando || paquetes.length === 0 || !especiePrincipal || !revisionDueno.valido || !aserrioValido}
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
