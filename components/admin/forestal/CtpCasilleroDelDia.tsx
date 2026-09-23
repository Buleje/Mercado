"use client";

/**
 * CtpCasilleroDelDia — UN día de la tira del registro (`CtpSemanaDeRegistro`).
 *
 * Tocar el casillero elige el día; la marca lo suma al resumen de varios días;
 * el ícono (i) abre el detalle flotante; y la papelera (2026-09-23, Brandon:
 * *«al pasar el mouse sobre el día tenga opción para eliminar esa cubicación de
 * ese día»*) anula lo declarado ese día. Son cuatro decisiones distintas y por
 * eso cuatro controles HERMANOS: un control dentro de otro es anidado inválido
 * y el clic se vuelve ambiguo.
 *
 * La papelera aparece al pasar el mouse o al llegar con Tab, y sólo desde
 * `lg` con puntero fino: más angosto, el casillero no tiene rincón libre (la
 * marca y el (i) ya ocupan la franja de arriba), y en táctil no hay «pasar».
 * Ahí se anula desde el detalle del día, que tiene el mismo botón.
 */

import { Info, Loader2, Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaCorta, etiquetaLarga, nombreDelDia } from "@/lib/forestal/semana-de-registro";
import { SIN_DUENO } from "@/lib/forestal/detalle-de-jornada";
import { nombreCortoDeDueno } from "@/lib/forestal/dueno-de-la-madera";
import CtpDetalleDeJornada from "./CtpDetalleDeJornada";
import type { useDetalleFlotante } from "./hooks/use-detalle-flotante";
import type { JornadaDeProduccion } from "./hooks/use-jornadas-produccion";
import { cuantos, type NombreDeLaTira } from "./tira-de-dias-copy";

interface Props {
  iso: string;
  /** 0 = lunes … 6 = domingo (de qué lado abre el detalle). */
  columna: number;
  idTira: string;
  jornada: JornadaDeProduccion | undefined;
  elegido: boolean;
  esHoy: boolean;
  futuro: boolean;
  /** Después de `maximo`: no se elige. */
  bloqueado: boolean;
  nombre: NombreDeLaTira;
  esProduccion: boolean;
  marcado: boolean;
  onMarcar: () => void;
  onElegir: () => void;
  flotante: ReturnType<typeof useDetalleFlotante>;
  onVerResumen: () => void;
  /** Anular lo declarado ese día. Sin esto no se ofrece: consumo, despacho, o un rol que no
   *  puede anular (lo decide `CtpSemanaDeProduccion` con `puedePedir`). */
  onAnular?: () => void;
  /** Se está anulando ESTE día: la papelera gira y no se vuelve a pedir. */
  anulando?: boolean;
}

export default function CtpCasilleroDelDia({
  iso,
  columna,
  idTira,
  jornada: j,
  elegido,
  esHoy,
  futuro,
  bloqueado,
  nombre,
  esProduccion,
  marcado,
  onMarcar,
  onElegir,
  flotante,
  onVerResumen,
  onAnular,
  anulando = false,
}: Props) {
  /* El detalle sólo si la respuesta lo trae: consumo y despacho no lo piden,
     y una respuesta vieja del caché tampoco lo tiene. */
  const detalle = esProduccion ? j?.detalle : undefined;
  const abiertoAca = !!detalle && flotante.abierto === iso;
  const duenosDelDia = (detalle?.duenos ?? [])
    .filter((d) => d.etiqueta !== SIN_DUENO)
    .map((d) => nombreCortoDeDueno(d.etiqueta));
  const idPanel = `${idTira}-detalle-${iso}`;
  const puedeAnular = !!onAnular && !!j && esProduccion;
  /* Antes de preguntar se cierra el detalle: con el panel abierto, su Escape
     (en `window`, captura) se comería el Escape del diálogo de confirmación. */
  const anular = () => {
    flotante.cerrar();
    onAnular?.();
  };

  return (
    /* El panel se dibuja en un portal dentro del diálogo (`use-ubicar-flotante`),
       pero en React es hijo del casillero: el foco y el mouse que salen del
       panel suben hasta acá. */
    <div
      data-casillero={flotante.clave(iso)}
      className="group/dia relative"
      onPointerEnter={
        detalle
          ? (e) => {
              if (e.pointerType === "mouse") flotante.entrar(iso);
            }
          : undefined
      }
      onPointerLeave={
        detalle
          ? (e) => {
              if (e.pointerType === "mouse") flotante.salir();
            }
          : undefined
      }
      onBlur={detalle ? flotante.alPerderFoco : undefined}
    >
      <button
        type="button"
        onClick={onElegir}
        disabled={bloqueado}
        aria-pressed={elegido}
        title={
          bloqueado
            ? `${etiquetaLarga(iso)} — todavía no llegó: un ${nombre.uno} no se anota antes de que pase`
            : detalle
              ? /* El panel dice más: el globo nativo encima sería ruido. */
                undefined
              : j
                ? `${etiquetaLarga(iso)} — ya tiene ${fmtPt(j.pt)} PT · ${fmtM3(j.m3)} m³ · ${fmtPiezas(j.piezas)} pza en ${cuantos(j.corridas, nombre)}`
                : `${etiquetaLarga(iso)} — ${nombre.ninguno}`
        }
        className={cn(
          "flex h-full min-h-[4rem] w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          /* A 400 px el casillero mide ~42 px y la marca y el ícono, arriba,
             pisaban el nombre del día. Se les reserva la franja de arriba en
             TODOS los casilleros, para que la tira no quede despareja. */
          esProduccion && "max-sm:pt-5",
          elegido
            ? "border-[var(--accent)] bg-primary/10 text-[var(--text-primary)] ring-1 ring-[var(--accent)]"
            : j
              ? /* Resaltado: el día que YA tiene jornada anotada se ve distinto
                   de un día vacío antes de leer la cifra. */
                "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/12 hover:border-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]",
          /* El futuro se ofrece igual —se puede programar una jornada— pero se
             dibuja apagado: la mayoría de las veces llegar ahí es haberse
             pasado de semana. */
          futuro && !elegido && "opacity-60",
        )}
      >
        <span
          className={cn(
            "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide",
            esHoy
              ? "text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "text-[var(--text-tertiary)]",
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
              {/* Una corrida chica puede redondear a 0 PT, y «0 PT» se lee igual
                  que «no hay nada» — que es justo lo contrario de lo que este
                  casillero tiene que decir. Ahí se cuentan las corridas. */}
              {j.pt >= 1 ? `${fmtPt(j.pt)} PT` : cuantos(j.corridas, nombre)}
            </span>
            {/* Las otras dos unidades del mismo hecho: el m³ es el del papel y
                las piezas son lo que se cuenta en la pila. Desde `lg` van en
                un renglón: hay ancho, y la tira baja una línea. */}
            <span className="flex flex-col items-center font-mono text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)] lg:flex-row lg:gap-1">
              <span>{fmtM3(j.m3)} m³</span>
              {j.piezas > 0 && (
                <>
                  <span aria-hidden className="max-lg:hidden">
                    ·
                  </span>
                  <span>{fmtPiezas(j.piezas)} pza</span>
                </>
              )}
            </span>
            {/* De quién es lo del día, sutil (Brandon, 2026-09-23): con dos
                dueños el mismo día, es lo que distingue un registro del otro. */}
            {duenosDelDia.length > 0 && (
              <span
                className="max-w-full truncate text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]"
                title={duenosDelDia.join(" · ")}
              >
                {duenosDelDia.join(" · ")}
              </span>
            )}
          </>
        ) : (
          /* El hueco se reserva igual: sin esto la tira baila de altura según
             qué días tengan producción. */
          <span className="text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">
            {esHoy ? "hoy" : "—"}
          </span>
        )}
      </button>

      {/* Sólo los días CON producción se pueden marcar: marcar un día vacío no
          suma nada a un resumen. */}
      {j && esProduccion && (
        <label
          className="absolute left-1 top-1 flex cursor-pointer items-center"
          title={`Sumar el ${etiquetaLarga(iso)} al resumen (por día, por especie y tipo)`}
        >
          <input
            type="checkbox"
            checked={marcado}
            onChange={onMarcar}
            aria-label={`Sumar el ${etiquetaLarga(iso)} al resumen de días`}
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
          />
        </label>
      )}

      {puedeAnular && (
        <button
          type="button"
          onClick={anular}
          disabled={anulando}
          aria-label={`Anular lo declarado el ${etiquetaLarga(iso)}`}
          title={`Anular las ${cuantos(j.corridas, nombre)} del ${etiquetaLarga(iso)} (pide confirmación)`}
          className={cn(
            "absolute right-7 top-0.5 hidden h-6 w-6 place-items-center rounded-full text-[var(--text-tertiary)] lg:grid pointer-coarse:hidden",
            "opacity-0 transition-opacity group-hover/dia:opacity-100 group-focus-within/dia:opacity-100 focus-visible:opacity-100",
            "hover:bg-[var(--surface-raised)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]",
            anulando && "opacity-100",
          )}
        >
          {anulando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      )}

      {detalle && j && (
        <>
          <button
            type="button"
            data-detalle-ancla
            onPointerDown={flotante.alPresionarAncla}
            onFocus={() => flotante.alEnfocarAncla(iso)}
            onKeyDown={(e) => flotante.alTeclaEnAncla(e, iso)}
            onClick={() => flotante.alternar(iso)}
            aria-label={`Ver el detalle del ${etiquetaLarga(iso)}`}
            aria-haspopup="dialog"
            aria-expanded={abiertoAca}
            aria-controls={abiertoAca ? idPanel : undefined}
            className={cn(
              "absolute right-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]",
              abiertoAca &&
                "bg-[var(--surface-raised)] text-[var(--accent-ink)] dark:text-[var(--accent)]",
            )}
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
          {abiertoAca && (
            <CtpDetalleDeJornada
              id={idPanel}
              clave={flotante.clave(iso)}
              jornada={j}
              detalle={detalle}
              columna={columna}
              onEntrar={() => flotante.entrar(iso)}
              onSalir={flotante.salir}
              onVolverAlAncla={flotante.volverAlAncla}
              onCerrar={flotante.cerrarDesdePanel}
              onVerResumen={() => {
                flotante.cerrar();
                onVerResumen();
              }}
              onAnular={puedeAnular ? anular : undefined}
              anulando={anulando}
            />
          )}
        </>
      )}
    </div>
  );
}
