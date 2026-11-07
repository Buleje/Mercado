"use client";

/**
 * Los bloques del formato de la Guía de Transporte Forestal.
 *
 * El formulario del SNIFFS no es una lista de campos: son BLOQUES con nombre
 * —«Propietario del Producto», «Destinatario», «Transportista»— y adentro los
 * casilleros del formato. Reproducir esa forma no es cosmética: el operador que
 * llena la guía en el sistema oficial busca el dato por el bloque, y un
 * fiscalizador pregunta por «el (27)», no por «la provincia del destinatario».
 *
 * Acá viven las piezas que se repiten en los tres bloques de partes, para que
 * el tab no las re-escriba tres veces con tres criterios distintos.
 */

import { useEffect, useId, useRef } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, Check, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useDocumentoLookup } from "@/hooks/use-documento-lookup";
import { avisoDeSunat, normalizarNumero, type DocumentoEncontrado } from "@/lib/documento/tipos";
import { Field, I, useEstiloFormulario } from "./ctp-shared";
import { FranjaGtf } from "./gtf-papel";
import { CLASE_NO_APLICA, CLASE_SIN_CAJA, EstadoBloque } from "./ctp-guia-piezas";

/* Los casilleros de ubicación viven en su archivo (16-10-2026, tamaño); se
   re-exportan para los que ya los importaban de acá. */
export { UbicacionDeParte } from "./ctp-guia-ubicacion-parte";

/** Identidad de una parte tal como la guarda `gtfDatosSchema`. */
export interface ParteEditable {
  nombre: string;
  docTipo: "RUC" | "DNI" | "CE" | "PASAPORTE";
  docNumero: string;
  direccion: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  zona?: string;
}

/**
 * Un bloque con su barra de título, como el formato.
 *
 * La barra es una franja teñida y no un `<h3>` pelado porque en un formulario
 * de sesenta casilleros el título tiene que cortar la página de un vistazo.
 *
 * Rediseño 2026-09-27: la ayuda pasó al ⓘ (iba truncada en gris al lado del
 * título y nadie la leía entera) y la cabecera dice el ESTADO del bloque
 * —«Completo» o «Faltan N»— para ver qué falta sin recorrer los casilleros.
 */
export function Bloque({
  titulo,
  tituloPapel,
  hint,
  nota,
  faltan,
  acciones,
  children,
  className = "",
}: {
  titulo: string;
  /** Con `FormularioPapel`: el título de la franja tal como lo imprime el talonario («Datos del destinatario»). */
  tituloPapel?: string;
  /** Qué es el bloque: va en el ⓘ del título. */
  hint?: string;
  /** Un dato de más para el ⓘ (norma, cuándo se completa). */
  nota?: string;
  /** Lo que le falta para imprimir la guía; sin la prop, el bloque no muestra estado. */
  faltan?: readonly string[];
  /** Controles del bloque (buscar en la libreta, traer del padrón…). */
  acciones?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const papel = useEstiloFormulario() === "papel";
  const idTitulo = useId();
  if (papel) {
    /* La cara del talonario: sin tarjeta, una franja de sección en mayúsculas
       sobre la hoja; el ⓘ, el estado y la libreta van en la franja.
       `flex-auto`, no `flex-1`: con base 0 nunca bajaba de renglón y a 400 px
       el título largo la apretaba hasta cortar «Libreta» y «Es el titular». */
    return (
      <section aria-labelledby={idTitulo} className={className}>
        <FranjaGtf
          id={idTitulo}
          titulo={tituloPapel ?? titulo}
          extra={
            <div className="flex min-w-0 flex-auto flex-wrap items-center gap-2">
              {hint && <InfoTip title={titulo} what={hint} affects={nota} ariaLabel={`Qué es: ${titulo}`} />}
              {faltan && <EstadoBloque faltan={faltan} />}
              {acciones && <div className={`ml-auto flex flex-wrap items-center gap-2 ${CLASE_SIN_CAJA}`}>{acciones}</div>}
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 px-3 py-3 sm:grid-cols-12 sm:[&_label]:min-h-6">{children}</div>
      </section>
    );
  }
  return (
    <section className={`overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] ${className}`}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1.5">
        <div className="flex min-h-8 items-center gap-1">
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">{titulo}</CardTitle>
          {hint && <InfoTip title={titulo} what={hint} affects={nota} ariaLabel={`Qué es: ${titulo}`} />}
        </div>
        {faltan && <EstadoBloque faltan={faltan} />}
        {acciones && <div className={`ml-auto flex flex-wrap items-center gap-2 ${CLASE_SIN_CAJA}`}>{acciones}</div>}
      </header>
      {/* `sm:[&_label]:min-h-6`: el rótulo con ⓘ mide 24 px (el botón) y el que
          no lo tiene, 20. Sin igualarlos, dos campos de la misma fila
          arrancaban su caja a 4 px de distancia y la grilla se veía dentada. En
          una sola columna no hay fila que alinear: ahí no suma alto. */}
      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 p-3 sm:grid-cols-12 sm:[&_label]:min-h-6">{children}</div>
    </section>
  );
}

/**
 * Los dos casilleros de documento del formato: «Nro DNI» y «Nro RUC».
 *
 * El esquema guarda UN documento con su tipo (es lo correcto: una parte tiene
 * uno), pero el formato oficial tiene las dos casillas. Se muestran las dos y se
 * escribe en la que corresponda — tipear el RUC marca la parte como RUC. Un CE o
 * un pasaporte traído de la libreta se muestra en la casilla de la izquierda y
 * NO se convierte en DNI al editarlo: perder el tipo dejaría un número de
 * pasaporte declarado como documento nacional.
 */
export function DocsDeParte({
  parte,
  onChange,
  span = 3,
  casillero,
}: {
  parte: ParteEditable;
  onChange: (v: Partial<ParteEditable>) => void;
  span?: 3 | 4 | 6;
  /** El «DNI/RUC N.º» del formato 2024 (`casilleroGtf2024`): sin la prop, las casillas no llevan número. */
  casillero?: string;
}) {
  const esRuc = parte.docTipo === "RUC";
  const papel = useEstiloFormulario() === "papel";
  const etiquetaIzq = parte.docTipo === "CE" ? "Nro CE" : parte.docTipo === "PASAPORTE" ? "Nro pasaporte" : "Nro DNI";
  /* En papel, como el talonario: «DNI N.º», «RUC N.º». */
  const rotuloIzq = papel ? `${etiquetaIzq.replace(/^Nro /, "").replace(/^pasaporte$/, "Pasaporte")} N.º` : etiquetaIzq;
  const rotuloRuc = papel ? "RUC N.º" : "Nro RUC";
  /* Sin documento cargado todavía, NINGUNA de las dos casillas «no aplica»:
     las dos siguen siendo el camino para declarar de qué tipo es. */
  const tieneDoc = Boolean(parte.docNumero?.trim());

  /**
   * El número trae los datos (ADR-367).
   *
   * Se tipea el RUC en su casilla y SUNAT devuelve razón social, domicilio y
   * ubigeo; se tipea el DNI y RENIEC devuelve el nombre. Va acá y no en una barra
   * aparte porque **acá es donde el operador escribe el número**: tenerlo en otro
   * lado obligaba a tipearlo dos veces.
   *
   * Sólo se rellena lo que está vacío —lo que alguien escribió no se pisa— y sólo
   * se consulta lo que se TIPEA: el documento que ya venía cargado no gasta una
   * consulta al abrir la guía.
   */
  /* `tocado` se prende en el `onChange` de los casilleros: es la única señal de
     que el número lo escribió alguien. Mirar «cambió respecto del primer render»
     no alcanza — el propietario se auto-completa con la Ficha después de montar,
     y eso disparaba una consulta (y un rojo) sobre un dato que nadie tipeó. */
  const tocado = useRef(false);
  const { consultando, resultado, numeroConsultado } = useDocumentoLookup(parte.docNumero, {
    auto: tocado.current,
  });
  const numero = normalizarNumero(parte.docNumero);
  const hallado =
    resultado?.encontrado && numeroConsultado === numero ? (resultado as DocumentoEncontrado) : null;
  const noHallado = resultado && !resultado.encontrado && numeroConsultado === numero ? resultado.motivo : null;

  const aplicado = useRef("");
  useEffect(() => {
    if (!hallado || aplicado.current === hallado.numero) return;
    aplicado.current = hallado.numero;
    const vacio = (v: string | undefined) => !v?.trim();
    onChange({
      docTipo: hallado.tipo,
      ...(vacio(parte.nombre) && hallado.nombre ? { nombre: hallado.nombre } : {}),
      ...(vacio(parte.direccion) && hallado.direccion ? { direccion: hallado.direccion } : {}),
      ...(vacio(parte.departamento) && hallado.departamento ? { departamento: hallado.departamento } : {}),
      ...(vacio(parte.provincia) && hallado.provincia ? { provincia: hallado.provincia } : {}),
      ...(vacio(parte.distrito) && hallado.distrito ? { distrito: hallado.distrito } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hallado]);

  /* Una parte declara UN documento: la casilla del otro tipo no es un
     pendiente, es la que no corresponde. Se dice DENTRO del casillero
     («no aplica», punteado) y el porqué va al ⓘ: abajo ocupaba dos o tres
     renglones por parte en una columna angosta. */
  const izqNoAplica = esRuc && tieneDoc ? "esta parte declara RUC" : undefined;
  const rucNoAplica = !esRuc && tieneDoc ? `esta parte declara ${etiquetaIzq.replace(/^Nro /, "")}` : undefined;

  return (
    <>
      <Field span={span} label={rotuloIzq} casillero={casillero} hint={izqNoAplica && `No aplica: ${izqNoAplica}`}>
        <input
          type="text"
          inputMode="numeric"
          className={`${I} font-mono ${izqNoAplica ? CLASE_NO_APLICA : ""}`}
          placeholder={izqNoAplica ? "no aplica" : undefined}
          value={esRuc ? "" : parte.docNumero}
          onChange={(e) => { tocado.current = true; onChange({ docTipo: esRuc ? "DNI" : parte.docTipo, docNumero: e.target.value }); }}
        />
      </Field>
      <Field span={span} label={rotuloRuc} casillero={casillero} hint={rucNoAplica && `No aplica: ${rucNoAplica}`}>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            /* Con el ícono de carga al lado el `Field` rotula el grupo, no el
               campo: el nombre va explícito para no quedar mudo. */
            aria-label={rotuloRuc}
            className={`${I} font-mono ${consultando ? "pr-10" : ""} ${rucNoAplica ? CLASE_NO_APLICA : ""}`}
            placeholder={rucNoAplica ? "no aplica" : undefined}
            value={esRuc ? parte.docNumero : ""}
            onChange={(e) => { tocado.current = true; onChange({ docTipo: "RUC", docNumero: e.target.value }); }}
          />
          {consultando && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-tertiary)]" aria-hidden />
          )}
        </div>
      </Field>
      {/* Lo que contestó el padrón: una línea que ocupa el ancho del bloque. */}
      {(hallado || noHallado) && (
        <p
          className={`flex flex-wrap items-center gap-x-2 rounded-lg px-2.5 py-1 text-sm sm:col-span-12 ${
            hallado
              ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
              : "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]"
          }`}
        >
          {hallado ? (
            <>
              <Check className="h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden />
              <b className="text-[var(--text-primary)]">{hallado.nombre}</b>
              <span className="text-[var(--text-tertiary)]">
                {hallado.fuente}
                {hallado.estado ? ` · ${hallado.estado}` : ""}
                {hallado.condicion ? ` · ${hallado.condicion}` : ""}
              </span>
              {avisoDeSunat(hallado) && (
                <span className="font-bold text-[var(--data-warning-ink)]">
                  {avisoDeSunat(hallado)}
                </span>
              )}
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {noHallado}
            </>
          )}
        </p>
      )}
    </>
  );
}
