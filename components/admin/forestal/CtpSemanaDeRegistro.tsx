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

import { useId, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import CtpResumenDeJornadasModal from "./CtpResumenDeJornadasModal";
import CtpCasilleroDelDia from "./CtpCasilleroDelDia";
import CtpCabeceraDeLaTira from "./CtpCabeceraDeLaTira";
import { AvisoDiaConRegistro, DiasMarcados } from "./CtpAvisosDeLaTira";
import { useDetalleFlotante } from "./hooks/use-detalle-flotante";
import {
  correrSemanas,
  diasDeLaSemana,
  esIsoValido,
  etiquetaLarga,
  hoyEnLima,
} from "@/lib/forestal/semana-de-registro";
import type { JornadaDeProduccion, SeccionDeJornada } from "./hooks/use-jornadas-produccion";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { NOMBRE_DE_LA_TIRA } from "./tira-de-dias-copy";

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
  /**
   * Anular lo declarado un día (2026-09-23). Sólo producción, y sólo quien lo
   * pasa: el que monta la tira es el que sabe pedir confirmación y releer.
   */
  onAnularDia?: (iso: string) => void;
  /** El día que se está anulando ahora (la papelera gira). */
  anulandoDia?: string | null;
}

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
  onAnularDia,
  anulandoDia = null,
}: Props) {
  const hoy = hoyEnLima();
  const nombre = NOMBRE_DE_LA_TIRA[seccion];
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
   * Plegar la tira (Brandon, 2026-09-23: *«poder ocultar y mostrar la sección
   * de día de registro»*). Se recuerda por dispositivo y por sección —en el
   * celular se pliega para ver el cubicador; en la PC se deja abierta—.
   *
   * Plegada NO esconde a qué día va el registro: la línea que queda dice el día
   * elegido y lo que ya tiene. Plegar no es esconder el dato.
   */
  const [plegada, setPlegada] = useLocalStorage<boolean>(`ctp-tira-dias-plegada:${seccion}`, false);
  const idCuerpo = useId();

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

  /* El detalle flotante de un día (Brandon, 2026-09-14): especies,
     clasificación, dueño… sin abrir el resumen. Sólo en producción y sólo si
     la respuesta lo trae — una vieja del caché deja la tira como antes. Con la
     tira plegada no hay casilleros: tampoco hay panel que atender. */
  const idTira = useId();
  const flotante = useDetalleFlotante(
    idTira,
    esProduccion && !plegada ? dias.filter((d) => porDia.get(d)?.detalle) : [],
  );

  /** Un día después de `maximo` no se elige: ese hecho todavía no pasó. */
  const bloqueado = (iso: string) => !!maximo && iso > maximo;

  /** Flechas sobre la tira: mover de a un día es lo que se hace al corregir. */
  const onTeclas = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    /* Dentro del panel las flechas son del panel: no mueven el día elegido. */
    if (e.target instanceof Element && e.target.closest("[data-detalle-panel]")) return;
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

  return (
    <section
      aria-label={nombre.titulo}
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1.5"
    >
      <CtpCabeceraDeLaTira
        nombre={nombre}
        valor={valor}
        jornadaElegida={jornadaElegida}
        base={base}
        cargando={cargando}
        error={error}
        elegidoFuera={elegidoFuera}
        plegada={plegada}
        setPlegada={setPlegada}
        idCuerpo={idCuerpo}
        onSemana={onSemana}
        onHoy={() => {
          onSemana(hoy);
          if (!bloqueado(hoy)) onElegir(hoy);
        }}
      />

      {!plegada && (
        <div id={idCuerpo}>
          <div
            role="group"
            aria-label="Elige el día de la jornada"
            onKeyDown={onTeclas}
            className="mt-1.5 grid grid-cols-7 gap-1"
          >
            {dias.map((iso, columna) => (
              <CtpCasilleroDelDia
                key={iso}
                iso={iso}
                columna={columna}
                idTira={idTira}
                jornada={porDia.get(iso)}
                elegido={iso === valor}
                esHoy={iso === hoy}
                futuro={iso > hoy}
                bloqueado={bloqueado(iso)}
                nombre={nombre}
                esProduccion={esProduccion}
                marcado={marcados.includes(iso)}
                onMarcar={() => marcar(iso)}
                onElegir={() => onElegir(iso)}
                flotante={flotante}
                onVerResumen={() => setResumen([iso])}
                onAnular={onAnularDia ? () => onAnularDia(iso) : undefined}
                anulando={anulandoDia === iso}
              />
            ))}
          </div>

          {jornadaElegida && (
            <AvisoDiaConRegistro
              valor={valor}
              jornada={jornadaElegida}
              nombre={nombre}
              onVerResumen={esProduccion ? () => setResumen([valor]) : undefined}
            />
          )}

          {marcados.length > 0 && (
            <DiasMarcados
              marcados={marcados}
              onLimpiar={() => setMarcados([])}
              onResumen={() => setResumen([...marcados])}
            />
          )}

          {/* La ayuda de siempre sólo cuando el día elegido está libre: si ya
              tiene registros, el aviso de arriba dice lo mismo con las cifras. */}
          {(error || elegidoFuera || !jornadaElegida) && (
            <p className="mt-1 text-xs leading-snug text-[var(--text-tertiary)]">
              {error ? (
                <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  No se pudo leer lo ya producido ({error}). Elige el día igual: el registro no depende de
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
                  tablar — dos {nombre.varios} el mismo día es normal, pero repetir{" "}
                  {esProduccion ? "la misma corrida" : `el mismo ${nombre.uno}`} no.
                </>
              )}
            </p>
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
    </section>
  );
}
