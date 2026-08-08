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

import { useEffect, useRef } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, Check, Loader2 } from "@buleje/design-system/icons";
import { useDocumentoLookup } from "@/hooks/use-documento-lookup";
import { avisoDeSunat, normalizarNumero, type DocumentoEncontrado } from "@/lib/documento/tipos";
import { Field, I } from "./ctp-shared";
import CtpUbigeoSelects from "./CtpUbigeoSelects";

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
 * de sesenta campos el título tiene que cortar la página en dos de un vistazo.
 */
export function Bloque({
  titulo,
  hint,
  acciones,
  children,
  className = "",
}: {
  titulo: string;
  hint?: string;
  /** Controles del bloque (buscar en la libreta, traer del padrón…). */
  acciones?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] ${className}`}>
      {/* Título y ayuda en la MISMA línea: son sesenta casilleros repartidos en
          seis bloques, y dos renglones de cabecera por bloque son media pantalla
          de encabezados antes de llegar al primer campo. */}
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1.5">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">{titulo}</CardTitle>
        {hint && <p className="min-w-0 flex-1 truncate text-xs text-[var(--text-tertiary)]">{hint}</p>}
        {acciones && <div className="ml-auto">{acciones}</div>}
      </header>
      <div className="grid grid-cols-1 gap-x-3 gap-y-2 p-3 sm:grid-cols-12">{children}</div>
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
}: {
  parte: ParteEditable;
  onChange: (v: Partial<ParteEditable>) => void;
  span?: 3 | 4 | 6;
}) {
  const esRuc = parte.docTipo === "RUC";
  const etiquetaIzq = parte.docTipo === "CE" ? "Nro CE" : parte.docTipo === "PASAPORTE" ? "Nro pasaporte" : "Nro DNI";
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

  return (
    <>
      {/* Una parte declara UN documento: la casilla del otro tipo no es un
          pendiente, es la que no corresponde. Se dice, y así el formulario deja
          de leerse a medias por dos casilleros que nunca se van a llenar. */}
      <Field
        span={span}
        label={etiquetaIzq}
        noAplica={esRuc && tieneDoc ? "esta parte declara RUC" : undefined}
      >
        <input
          type="text"
          inputMode="numeric"
          className={`${I} font-mono`}
          value={esRuc ? "" : parte.docNumero}
          onChange={(e) => { tocado.current = true; onChange({ docTipo: esRuc ? "DNI" : parte.docTipo, docNumero: e.target.value }); }}
        />
      </Field>
      <Field
        span={span}
        label="Nro RUC"
        noAplica={!esRuc && tieneDoc ? `esta parte declara ${etiquetaIzq.replace(/^Nro /, "")}` : undefined}
      >
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            className={`${I} font-mono ${consultando ? "pr-10" : ""}`}
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
              : "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          }`}
        >
          {hallado ? (
            <>
              <Check className="h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
              <b className="text-[var(--text-primary)]">{hallado.nombre}</b>
              <span className="text-[var(--text-tertiary)]">
                {hallado.fuente}
                {hallado.estado ? ` · ${hallado.estado}` : ""}
                {hallado.condicion ? ` · ${hallado.condicion}` : ""}
              </span>
              {avisoDeSunat(hallado) && (
                <span className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
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

/**
 * Casilleros de ubicación: departamento (17)(26), provincia (18)(27), distrito
 * (19)(28) y —sólo el destinatario— la zona. Van sueltos y no dentro de la
 * dirección porque el control pide uno por uno.
 */
export function UbicacionDeParte({
  parte,
  onChange,
  conZona,
}: {
  parte: ParteEditable;
  onChange: (v: Partial<ParteEditable>) => void;
  /** El destinatario tiene «Zona» en el formato; el propietario no. */
  conZona?: boolean;
}) {
  return (
    <>
      {conZona && (
        <Field
          span={2}
          label="Zona"
          hint="Sector o caserío"
          noAplica={parte.zona?.trim() ? undefined : "sólo si la dirección usa sector o caserío"}
        >
          <input type="text" className={I} value={parte.zona ?? ""} onChange={(e) => onChange({ zona: e.target.value })} />
        </Field>
      )}
      {/* Los tres casilleros entran en la MISMA fila que el domicilio (6 + 2+2+2):
          sueltos abajo, cada parte se llevaba un renglón entero de más. */}
      <CtpUbigeoSelects
        span={2}
        valor={{ departamento: parte.departamento, provincia: parte.provincia, distrito: parte.distrito }}
        onChange={onChange}
      />
    </>
  );
}

/** Dato que el sistema ya sabe y la guía sólo muestra (identidad del emisor). */
export function CampoSoloLectura({ label, valor, span = 6, falta }: { label: string; valor: string; span?: 3 | 4 | 6 | 8 | 12; falta?: string }) {
  return (
    <Field span={span} label={label} hint={valor ? undefined : falta}>
      <input
        type="text"
        readOnly
        value={valor || "—"}
        className={`${I} cursor-default bg-[var(--surface-sunken)] text-[var(--text-secondary)]`}
      />
    </Field>
  );
}
