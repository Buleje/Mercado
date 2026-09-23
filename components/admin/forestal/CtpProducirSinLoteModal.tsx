"use client";

/**
 * Producir SIN lote: cubicar acá mismo (ADR-408) y declarar en un modal aparte (ADR-429).
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
 * 2. «Declarar esta producción» abre **`CtpDeclararProduccionModal`** encima
 *    (Brandon, 2026-09-22: «en un modal aparte, no en el mismo»): resumen por
 *    especie y tipo con su precio, el servicio (madera propia o aserrío a un
 *    tercero con su cuenta), el detalle, el permiso y el SNIFFS. Allá se
 *    registra —una corrida por especie— y, al registrar, esta libreta se vacía
 *    para que no se pueda declarar ni cobrar dos veces lo mismo.
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Calculator, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import {
  ControlesDeVentana,
  TiradorDeVentana,
} from "@/components/admin/shared/modal-controles-ventana";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { paquetesDeLoCubicado } from "@/lib/forestal/declarar-produccion";
import CubicadorMadera from "./CubicadorMadera";
import CtpDeclararProduccionModal from "./CtpDeclararProduccionModal";
import CtpSemanaDeProduccion from "./CtpSemanaDeProduccion";
import { useJornadasDeProduccion } from "./hooks/use-jornadas-produccion";
import { useTrozasParaCodigo } from "./hooks/use-trozas-para-codigo";
import { ESPACIO_PRODUCCION } from "./hooks/libreta-produccion";
import { esIsoValido, hoyEnLima } from "@/lib/forestal/semana-de-registro";

/** El espacio propio de este cubicador — vive en `libreta-produccion`, que es quien lo vacía. */
export { ESPACIO_PRODUCCION };

/* El «hoy» del aserradero es el de Pucallpa, no el del meridiano: pasadas las
   19:00 locales el UTC ya está en el día siguiente, y ésa es justo la hora en
   que se carga el parte de la jornada — la fecha nacía un día adelantada. */
const hoyIso = () => hoyEnLima();

export default function CtpProducirSinLoteModal({
  onCerrar,
  onListo,
  onCambioEnElLibro,
}: {
  onCerrar: () => void;
  /** Se llama con el resumen de lo registrado, para refrescar la vista. */
  onListo: (mensaje: string) => void;
  /**
   * El libro cambió SIN cerrar este modal (se anuló un día desde la tira):
   * la tabla de producción de atrás tiene que releer, pero acá se sigue
   * cubicando — lo normal es anular el día mal cargado y volver a declararlo.
   */
  onCambioEnElLibro?: () => void;
}) {
  const [piezas, setPiezas] = useState<PiezaCubicada[]>([]);
  const [declarando, setDeclarando] = useState(false);
  /* Registrar vacía la libreta: el cubicador se vuelve a montar para leerla
     vacía —si alguien deja este modal abierto, no puede re-declarar lo mismo—. */
  const [libreta, setLibreta] = useState(0);
  const [fecha, setFecha] = useState(hoyIso);
  /* La semana que se está MIRANDO. Arranca en la del día elegido y se mueve
     sola cuando se tipea una fecha de otra semana en el campo: dos controles
     sobre el mismo dato tienen que contarse lo que pasó. */
  const [semana, setSemana] = useState(fecha);
  const jornadas = useJornadasDeProduccion(semana);

  /* Las trozas del patio para el campo «Código» del cubicador: se leen UNA
     vez con el modal, y «Declarar» las reusa para proponer el permiso. */
  const trozasParaCodigo = useTrozasParaCodigo();
  /* Piezas que vienen de una corrida ya declarada, camino al cubicador. Se
     vuelven a `null` apenas entran: si no, cada re-render las agregaría otra
     vez. */
  const [aImportar, setAImportar] = useState<PiezaCubicada[] | null>(null);
  /* Estable: el cubicador está memorizado y una función nueva en cada render lo
     redibujaría entero al abrir «Declarar» (medido 23-09). */
  const alImportar = useCallback(() => setAImportar(null), []);
  /* Foco adentro, Tab que no se escapa, Escape que cierra y foco devuelto. Con
     «Declarar» abierto encima, se calla solo (hay otro diálogo arriba). */
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar });
  /**
   * Ventana: se mueve, se achica y se fija (ADR-420).
   *
   * Acá pesa más que en ningún otro modal del libro. Ocupa el 96 % del alto y
   * mientras se cubica hay que mirar la tabla de producción que quedó detrás —
   * qué corrida se declaró ayer, qué permiso toca. Hasta ahora había que
   * cerrar, mirar y volver a abrir, perdiendo lo cargado a medio dictar.
   */
  const ventana = useVentanaDeModal(true, {
    ref: cajaRef,
    aplicarTranslate: true,
    claveMemoria: "ctp-producir-sin-lote",
  });

  /* La serie de códigos que ya usa la planta: sin ella el sugerido puede caer
     en uno tomado y el servidor rechaza la declaración entera. */
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
  /* Se dice ANTES de abrir «Declarar»: lo que no tiene especie no se registra. */
  const piezasSinEspecie = useMemo(
    () => paquetes.filter((p) => !claveEspecie(p.especie)).reduce((a, p) => a + p.cantidad, 0),
    [paquetes],
  );
  const especies = useMemo(
    () => new Set(paquetes.map((p) => claveEspecie(p.especie)).filter(Boolean)).size,
    [paquetes],
  );
  const elegirFecha = (iso: string) => {
    setFecha(iso);
    /* Tipear una fecha de otra semana mueve la tira de arriba: si no, el campo
       dice «02/05» y los siete casilleros siguen mostrando otra semana. */
    if (esIsoValido(iso)) setSemana(iso);
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-modal-2 flex items-center justify-center bg-black/60 p-2">
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Producir sin lote"
        /* `relative`: el tirador de redimensión se ancla a esta esquina. */
        className="relative flex h-[96vh] w-full max-w-[98vw] flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        {/* Cabecera — y asa para arrastrar la ventana. En UNA fila: sin las
            pastillas de PT · m³ · piezas (Brandon, 2026-09-23: «quítalo porque
            ya tengo KPIs» — son los indicadores del cubicador, justo abajo). */}
        <div
          {...ventana.asaProps}
          className="flex shrink-0 items-center gap-2.5 border-b border-[var(--rule-base)] px-4 py-2 sm:px-5"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-[var(--accent-ink)] max-sm:hidden dark:text-[var(--accent)]">
            <Calculator className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle as="h3" className="font-display text-lg leading-tight text-[var(--text-primary)]">
              Producir sin lote
            </CardTitle>
            <p className="text-xs leading-snug text-[var(--text-tertiary)]">
              Cubica acá y decláralo en el Libro; la materia prima se vincula después.{" "}
              <b>No toca el lote del cubicador.</b>
            </p>
          </div>
          <ControlesDeVentana ventana={ventana} />
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* El día al que va este registro (Brandon, 2026-09-11). Va acá arriba,
            fuera del cuerpo que scrollea, porque es una decisión del ASIENTO y
            no de lo cubicado: se ve y se cambia igual mientras se miden las
            piezas, y cada casillero dice lo que ese día ya tiene anotado. */}
        <div className="shrink-0 border-b border-[var(--rule-base)] px-2 py-2 sm:px-5">
          {/* Con «Anular el día» (2026-09-23): la papelera del casillero o el
              detalle del día anulan lo declarado; se relee la tira y el libro. */}
          <CtpSemanaDeProduccion
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
            /* Traer una corrida al cubicado: acá SÍ hay dónde ponerla. */
            onCopiarAlCubicado={(copiadas) => setAImportar(copiadas)}
            onReleer={() => void jornadas.recargar()}
            onCambioEnElLibro={onCambioEnElLibro}
          />
        </div>

        {/* Cuerpo: el cubicador ENTERO, en su propia libreta */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-5 sm:py-4">
          <CubicadorMadera
            key={libreta}
            espacio={ESPACIO_PRODUCCION}
            onLote={setPiezas}
            piezasAImportar={aImportar}
            onImportado={alImportar}
            /* El código de la troza es interno (Brandon, 2026-09-14): no
               entra a `paquetesDeLoCubicado` ni a lo que se registra. */
            codigoDeTroza={trozasParaCodigo}
          />
        </div>

        {/* Pie */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-[var(--rule-base)] px-4 py-2.5 sm:px-5">
          <span
            className={`mr-auto text-xs ${
              piezasSinEspecie > 0
                ? "font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                : "text-[var(--text-tertiary)]"
            }`}
          >
            {paquetes.length === 0
              ? "Cubica al menos una medida para poder declarar."
              : piezasSinEspecie > 0
                ? `${fmtPiezas(piezasSinEspecie)} ${piezasSinEspecie === 1 ? "pieza no tiene" : "piezas no tienen"} especie: pónsela en la columna «Especie» antes de declarar.`
                : `${paquetes.length} ${paquetes.length === 1 ? "medida" : "medidas"} · ${especies} ${
                    especies === 1 ? "especie: 1 corrida" : `especies: ${especies} corridas`
                  }`}
          </span>
          <button
            type="button"
            onClick={() => setDeclarando(true)}
            disabled={paquetes.length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            <Boxes className="h-4 w-4" aria-hidden /> Declarar esta producción
          </button>
        </div>

        <TiradorDeVentana ventana={ventana} />
      </div>

      {/* El modal APARTE (ADR-429): se monta encima y guarda su borrador aunque
          se cierre para volver a cubicar. */}
      <CtpDeclararProduccionModal
        abierto={declarando}
        onCerrar={() => setDeclarando(false)}
        piezas={piezas}
        codigosEnPlanta={codigosPlanta}
        fecha={fecha}
        onFecha={elegirFecha}
        trozas={trozasParaCodigo.trozas}
        onRegistrado={(mensaje) => {
          setDeclarando(false);
          setPiezas([]);
          setLibreta((n) => n + 1);
          onListo(mensaje);
        }}
      />
    </div>
  );
}
