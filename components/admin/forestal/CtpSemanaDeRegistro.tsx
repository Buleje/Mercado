"use client";

/**
 * CtpSemanaDeRegistro — el día al que va este registro, en una tira de semana.
 *
 * El caso real (Brandon, 2026-09-11): *«quiero un apartado para escoger los
 * días o el día que quiero que se ponga este registro… cuadros uno al lado del
 * otro diciendo el día, y los que ya tienen registro que se muestren
 * resaltados o con la cantidad de pies de esa fecha»*.
 *
 * El Libro CTP se registra **día por día** y el parte de la sierra llega tarde:
 * cortó el sábado, el papel aparece el lunes. Con un `<input type="date">`
 * pelado hay que acordarse de qué día era y, sobre todo, no hay forma de saber
 * si esa jornada YA se cargó — así es como la misma producción entra dos veces.
 *
 * Por eso cada casillero trae **lo que ese día ya tiene anotado** (pie tablar y
 * cuántas corridas). Es el dato que convierte la tira en una decisión: «el
 * martes ya tiene 2.374 PT, entonces esto es del miércoles».
 *
 * ## Lo que NO hace
 *
 * No bloquea un día que ya tiene producción: dos corridas el mismo día son
 * normales (dos líneas de sierra, dos turnos). Muestra el dato y deja decidir —
 * un guard acá le impediría al aserradero anotar su segundo turno.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Loader2, Lock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import CtpResumenDeJornadasModal from "./CtpResumenDeJornadasModal";
import {
  correrSemanas,
  diasDeLaSemana,
  esIsoValido,
  etiquetaCorta,
  etiquetaLarga,
  hoyEnLima,
  nombreDelDia,
  tituloDeLaSemana,
} from "@/lib/forestal/semana-de-registro";
import type { JornadaDeProduccion, SeccionDeJornada } from "./hooks/use-jornadas-produccion";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";

interface Props {
  /** El día elegido, `YYYY-MM-DD`. Es la misma fecha que guarda el asiento. */
  valor: string;
  onElegir: (iso: string) => void;
  /** La semana que se está mirando (puede no contener a `valor`). */
  semana: string;
  onSemana: (iso: string) => void;
  /** Lo ya producido, por día. Los días sin nada no están en el mapa. */
  porDia: Map<string, JornadaDeProduccion>;
  cargando?: boolean;
  error?: string | null;
  /**
   * Traer las piezas de una corrida ya declarada al lote cubicado.
   *
   * Sólo lo pasa quien TIENE un cubicador montado (los modales de producción).
   * Desde el libro pelado el botón no tendría a dónde mandarlas, así que ahí no
   * se ofrece.
   */
  onCopiarAlCubicado?: (piezas: PiezaCubicada[]) => void;
  /**
   * Qué hecho cuenta cada casillero (2026-09-12). Cambia el nombre de lo que
   * «ya tiene» el día y qué acciones se ofrecen: el resumen por especie y el
   * traer al cubicado son de PRODUCCIÓN; un consumo o un despacho se miran en
   * su propia pantalla.
   */
  seccion?: SeccionDeJornada;
  /**
   * El último día que se puede elegir (`YYYY-MM-DD`). Un consumo no se anota
   * en el futuro: la madera todavía no entró a la sierra. Los días después se
   * dibujan apagados y no responden.
   */
  maximo?: string;
}

/** Cómo se llama lo que un día «ya tiene», según la sección. */
const NOMBRE: Record<SeccionDeJornada, { uno: string; varios: string; titulo: string; aviso: string }> = {
  produccion: {
    uno: "corrida",
    varios: "corridas",
    titulo: "Día del registro",
    aviso: "Si es otro turno u otra sierra, seguí; si es la misma, la estarías cargando dos veces.",
  },
  consumo: {
    uno: "consumo",
    varios: "consumos",
    titulo: "Día del consumo",
    aviso: "Si entró otra tanda a la sierra ese día, seguí; si es la misma, la madera se contaría dos veces.",
  },
  despacho: {
    uno: "despacho",
    varios: "despachos",
    titulo: "Día del despacho",
    aviso: "Si salió otro camión ese día, seguí; si es la misma guía, estaría duplicada.",
  },
};

const BOTON_FLECHA =
  "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]";

export default function CtpSemanaDeRegistro({
  valor,
  onElegir,
  semana,
  onSemana,
  porDia,
  cargando = false,
  error = null,
  onCopiarAlCubicado,
  seccion = "produccion",
  maximo,
}: Props) {
  const hoy = hoyEnLima();
  const nombre = NOMBRE[seccion];
  const esProduccion = seccion === "produccion";
  const base = esIsoValido(semana) ? semana : hoy;
  const dias = useMemo(() => diasDeLaSemana(base), [base]);

  /* El día elegido puede caer fuera de la semana que se está mirando: se navega
     para ver jornadas de otra semana sin perder lo que ya se eligió. Decirlo es
     mejor que dibujar siete casilleros donde ninguno está marcado. */
  const elegidoFuera = esIsoValido(valor) && !dias.includes(valor);

  /* Lo que el día elegido YA tiene declarado. Es el aviso que evita cargar la
     misma jornada dos veces, y vive ACÁ y no en cada modal: la tira es la que
     sabe qué día se eligió y qué tiene ese día. */
  const jornadaElegida = porDia.get(valor);

  /**
   * Los días MARCADOS para mirar juntos (Brandon, 2026-09-11: *«seleccionar
   * varias corridas y fechas… tener resumen tipo especie de todos ellos»*).
   *
   * Es otra cosa que el día elegido: ese dice a dónde va el registro que se
   * está cargando, y éstos son los que se quieren leer. Mezclarlos obligaría a
   * mover el registro para poder comparar dos semanas.
   *
   * Sobreviven al cambio de semana a propósito: marcar el lunes, irse a la
   * semana anterior y marcar otro es justo para lo que sirve.
   */
  const [marcados, setMarcados] = useState<string[]>([]);
  const [resumen, setResumen] = useState<string[] | null>(null);
  const marcar = (iso: string) =>
    setMarcados((prev) => (prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso]));

  /** Flechas sobre la tira: mover de a un día es lo que se hace al corregir. */
  const onTeclas = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const desde = esIsoValido(valor) ? valor : base;
    const i = dias.indexOf(desde);
    if (i < 0) return;
    const siguiente = dias[i + (e.key === "ArrowRight" ? 1 : -1)];
    e.preventDefault();
    if (siguiente) {
      if (!bloqueado(siguiente)) onElegir(siguiente);
      return;
    }
    /* Al borde de la tira se salta de semana y se cae en el día equivalente:
       después del domingo viene el lunes, no «nada». */
    const otra = correrSemanas(base, e.key === "ArrowRight" ? 1 : -1);
    const diasOtra = diasDeLaSemana(otra);
    onSemana(otra);
    const destino = e.key === "ArrowRight" ? diasOtra[0]! : diasOtra[6]!;
    if (!bloqueado(destino)) onElegir(destino);
  };

  /** Un día después de `maximo` no se elige: ese hecho todavía no pasó. */
  const bloqueado = (iso: string) => !!maximo && iso > maximo;

  return (
    <section
      aria-label="Día del registro"
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          {nombre.titulo}
        </span>
        {cargando && (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]"
            aria-label="Leyendo lo ya producido"
          />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSemana(correrSemanas(base, -1))}
            aria-label="Semana anterior"
            className={BOTON_FLECHA}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-[10.5rem] text-center text-xs font-semibold text-[var(--text-secondary)]">
            {tituloDeLaSemana(base)}
          </span>
          <button
            type="button"
            onClick={() => onSemana(correrSemanas(base, 1))}
            aria-label="Semana siguiente"
            className={BOTON_FLECHA}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              onSemana(hoy);
              if (!bloqueado(hoy)) onElegir(hoy);
            }}
            className="h-8 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          >
            Hoy
          </button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Elegí el día de la jornada"
        onKeyDown={onTeclas}
        className="mt-2 grid grid-cols-7 gap-1"
      >
        {dias.map((iso) => {
          const j = porDia.get(iso);
          const elegido = iso === valor;
          const esHoy = iso === hoy;
          const futuro = iso > hoy;
          return (
            /* La marca NO va adentro del botón del día: un control dentro de
               otro control es anidado inválido y el clic se vuelve ambiguo —
               tocar el casillero elige el día, tocar la marca lo suma al
               resumen, y son dos decisiones distintas. */
            <div key={iso} className="relative">
              <button
                type="button"
                onClick={() => onElegir(iso)}
                disabled={bloqueado(iso)}
                aria-pressed={elegido}
                title={
                  bloqueado(iso)
                    ? `${etiquetaLarga(iso)} — todavía no llegó: un ${nombre.uno} no se anota antes de que pase`
                    : j
                      ? `${etiquetaLarga(iso)} — ya tiene ${fmtPt(j.pt)} PT · ${fmtM3(j.m3)} m³ · ${fmtPiezas(j.piezas)} pza en ${j.corridas} ${j.corridas === 1 ? nombre.uno : nombre.varios}`
                      : `${etiquetaLarga(iso)} — sin ${nombre.varios} anotados`
                }
                className={cn(
                  "flex min-h-[4.25rem] w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  elegido
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--text-primary)] ring-1 ring-[var(--accent)]"
                    : j
                      ? /* Resaltado: el día que YA tiene jornada anotada se ve
                           distinto de un día vacío antes de leer la cifra. */
                        "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/12 hover:border-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]",
                  /* El futuro se ofrece igual —se puede programar una jornada—
                     pero se dibuja apagado: la mayoría de las veces llegar ahí es
                     haberse pasado de semana. */
                  futuro && !elegido && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide",
                    esHoy ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-tertiary)]",
                  )}
                >
                  {nombreDelDia(iso)}
                </span>
                <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                  {etiquetaCorta(iso)}
                </span>
                {j ? (
                  <>
                    <span className="font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums leading-tight text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                      {/* Una corrida chica puede redondear a 0 PT, y «0 PT» se lee
                          igual que «no hay nada» — que es justo lo contrario de lo
                          que este casillero tiene que decir. Ahí se cuentan las
                          corridas, que es el dato que importa: el día ya se cargó. */}
                      {j.pt >= 1 ? `${fmtPt(j.pt)} PT` : `${j.corridas} ${j.corridas === 1 ? nombre.uno : nombre.varios}`}
                    </span>
                    {/* Las otras dos unidades del mismo hecho: el m³ es el del
                        papel y las piezas son lo que se cuenta en la pila. Van
                        chicas — el PT es lo que se mira de lejos. */}
                    <span className="font-mono text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">
                      {fmtM3(j.m3)} m³
                    </span>
                    {j.piezas > 0 && (
                      <span className="font-mono text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">
                        {fmtPiezas(j.piezas)} pza
                      </span>
                    )}
                  </>
                ) : (
                  /* El hueco se reserva igual: sin esto la tira baila de altura
                     según qué días tengan producción. */
                  <span className="text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">
                    {esHoy ? "hoy" : "—"}
                  </span>
                )}
              </button>
              {/* Sólo los días CON producción se pueden marcar: marcar un día
                  vacío no suma nada a un resumen. */}
              {j && esProduccion && (
                <label
                  className="absolute left-1 top-1 flex cursor-pointer items-center"
                  title={`Sumar el ${etiquetaLarga(iso)} al resumen`}
                >
                  <input
                    type="checkbox"
                    checked={marcados.includes(iso)}
                    onChange={() => marcar(iso)}
                    aria-label={`Sumar el ${etiquetaLarga(iso)} al resumen por especie`}
                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>

      {jornadaElegida && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            El {etiquetaLarga(valor)} ya tiene{" "}
            <b className="tabular-nums">
              {jornadaElegida.corridas} {jornadaElegida.corridas === 1 ? nombre.uno : nombre.varios}
            </b>{" "}
            ({fmtM3(jornadaElegida.m3)} m³ · {fmtPt(jornadaElegida.pt)} PT). {nombre.aviso}
          </span>
          {/* Ver QUÉ salió ese día es lo que resuelve la duda: si el resumen
              dice lo mismo que se está por cargar, es la misma jornada. Sólo
              en producción: el resumen lee corridas. */}
          {esProduccion && (
            <button
              type="button"
              onClick={() => setResumen([valor])}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-current px-2.5 py-1 text-xs font-bold hover:bg-[var(--surface-raised)]"
            >
              <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Ver qué salió ese día
            </button>
          )}
        </div>
      )}

      {/* Varios días marcados: el resumen de todos juntos. */}
      {marcados.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 text-[var(--text-secondary)]">
            <b className="tabular-nums">{marcados.length}</b> día
            {marcados.length === 1 ? "" : "s"} marcado{marcados.length === 1 ? "" : "s"}
            {/* Se dicen cuáles: marcando en varias semanas, los de las otras no
                están a la vista y «3 días» no dice cuáles. */}
            <span className="ml-1 text-[var(--text-tertiary)]">
              ({[...marcados].sort().map(etiquetaCorta).join(" · ")})
            </span>
          </span>
          <button
            type="button"
            onClick={() => setMarcados([])}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => setResumen([...marcados])}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-primary/10 px-2.5 py-1 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
          >
            <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Resumen por especie de{" "}
            {marcados.length === 1 ? "ese día" : "esos días"}
          </button>
          {/* Marcar muchos días es el gesto de «quiero cerrar el mes»: ese
              camino ya existe entero (revisar pendientes, cerrar, bajar el
              paquete oficial) y estaba a cinco clics sin cartel. */}
          {marcados.length >= 5 && (
            <a
              href="/admin?tab=ctp-libro-operaciones&vista=cierre"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden /> ¿Cerrar el mes? Está en Cierre
            </a>
          )}
        </div>
      )}

      {resumen && (
        <CtpResumenDeJornadasModal
          dias={resumen}
          onClose={() => setResumen(null)}
          onCopiarAlCubicado={onCopiarAlCubicado}
        />
      )}

      <p className="mt-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
        {error ? (
          <span className="text-[var(--data-error-500)]">
            No se pudo leer lo ya producido ({error}). Elegí el día igual: el registro no depende de
            este dato.
          </span>
        ) : elegidoFuera ? (
          <>
            Estás viendo otra semana. El registro va al{" "}
            <b className="text-[var(--text-secondary)]">{etiquetaLarga(valor)}</b>.
          </>
        ) : (
          <>
            El día que elijas es la fecha del asiento. Los que ya tienen {nombre.varios} lo dicen en pie
            tablar — dos {nombre.varios} el mismo día es normal, pero repetir {esProduccion ? "la misma corrida" : `el mismo ${nombre.uno}`} no.
          </>
        )}
      </p>
    </section>
  );
}
