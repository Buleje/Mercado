"use client";

/**
 * Los casilleros de identidad de una parte de la guía, con el padrón adentro
 * (ADR-367).
 *
 * Dos cambios sobre la versión anterior, y los dos son del mismo problema —el
 * formulario era largo y se tipeaba entero a mano—:
 *
 * 1. **El número trae los datos.** Se escribe el RUC y SUNAT devuelve razón
 *    social, dirección y ubigeo; se escribe el DNI y RENIEC devuelve el nombre.
 *    Sólo se rellenan los campos **vacíos**: lo que una persona escribió no se
 *    pisa sin que lo pida (botón «Traer todo del padrón»).
 * 2. **Dos filas en vez de cuatro.** La grilla de 12 columnas mete nombre,
 *    documento y ubicación en el alto que antes ocupaba sólo la mitad. En un
 *    formulario de cuatro bloques, cada fila de más es un scroll.
 */

import { useEffect, useRef } from "react";
import { AlertCircle, Check, Loader2, Search } from "@buleje/design-system/icons";
import { useDocumentoLookup } from "@/hooks/use-documento-lookup";
import { avisoDeSunat, normalizarNumero, tipoDeDocumento, type DocumentoEncontrado } from "@/lib/documento/tipos";
import { Field, I } from "./ctp-shared";

export type DocTipoParte = "RUC" | "DNI" | "CE" | "PASAPORTE";

export interface ParteIdentidad {
  nombre: string;
  docTipo: DocTipoParte;
  docNumero: string;
  direccion: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  /** Sector o caserío del formato oficial (ADR-373). */
  zona?: string;
}

export default function CtpParteCampos({
  etiquetaNombre,
  parte,
  onChange,
  direccionRequerida,
  sinUbicacion,
  extra,
}: {
  etiquetaNombre: string;
  parte: ParteIdentidad;
  onChange: (v: Partial<ParteIdentidad>) => void;
  /** El transportista no tiene casilleros de ubicación en el formato. */
  sinUbicacion?: boolean;
  direccionRequerida?: boolean;
  extra?: React.ReactNode;
}) {
  /**
   * El documento que YA venía cargado no se consulta solo.
   *
   * Abrir una guía disparaba tres consultas —propietario, destinatario,
   * transportista— sin que nadie pidiera nada: el padrón cobra por consulta y
   * además saludaba con un rojo («SUNAT no tiene ese RUC») sobre un dato que el
   * operador no acababa de escribir. Se consulta lo que se TIPEA; para lo viejo
   * está el botón de la lupa.
   */
  const documentoInicial = useRef(parte.docNumero);
  const tipeado = parte.docNumero !== documentoInicial.current;
  const { consultando, resultado, numeroConsultado, consultar } = useDocumentoLookup(parte.docNumero, {
    auto: tipeado,
  });
  const numero = normalizarNumero(parte.docNumero);
  const tipoPadron = tipoDeDocumento(numero);
  /** El resultado corresponde a ESTE número (no al que se estaba tipeando antes). */
  const alDia = resultado != null && numeroConsultado === numero;
  const hallado = alDia && resultado.encontrado ? (resultado as DocumentoEncontrado) : null;

  /** Rellena; `pisar` sólo cuando lo pide el operador con el botón. */
  const aplicar = (r: DocumentoEncontrado, pisar: boolean) => {
    const tomar = (actual: string | undefined, nuevo: string | undefined) =>
      nuevo && (pisar || !actual?.trim()) ? nuevo : undefined;
    const cambios: Partial<ParteIdentidad> = {
      /* El tipo lo decide el padrón que contestó: un RUC cargado como DNI hace
         que el formato oficial declare el número en la casilla equivocada. */
      docTipo: r.tipo,
      ...(tomar(parte.nombre, r.nombre) ? { nombre: r.nombre } : {}),
      ...(tomar(parte.direccion, r.direccion) ? { direccion: r.direccion } : {}),
      ...(tomar(parte.departamento, r.departamento) ? { departamento: r.departamento } : {}),
      ...(tomar(parte.provincia, r.provincia) ? { provincia: r.provincia } : {}),
      ...(tomar(parte.distrito, r.distrito) ? { distrito: r.distrito } : {}),
    };
    onChange(cambios);
  };

  /* Auto-relleno de lo vacío, una sola vez por número: el efecto no puede
     depender de `parte`, o se re-dispararía con cada tecla del nombre. */
  const aplicado = useRef("");
  useEffect(() => {
    if (!hallado || aplicado.current === hallado.numero) return;
    aplicado.current = hallado.numero;
    aplicar(hallado, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hallado]);

  /** ¿Hay algo del padrón que NO está reflejado? Entonces vale ofrecer pisarlo. */
  const difiere =
    hallado != null &&
    [
      [parte.nombre, hallado.nombre],
      [parte.direccion, hallado.direccion],
      [parte.departamento, hallado.departamento],
      [parte.provincia, hallado.provincia],
      [parte.distrito, hallado.distrito],
    ].some(([actual, delPadron]) => delPadron && (actual ?? "").trim() !== delPadron.trim());

  const aviso = hallado ? avisoDeSunat(hallado) : null;

  /**
   * La grilla la manda el CONTENEDOR, no la ventana.
   *
   * Este formulario vive dentro del modal del despacho, en una columna de ~460
   * px: con `sm:grid-cols-12` (que mira el viewport de 1440) «Tipo doc.» quedaba
   * en 76 px y mostraba «Tipo d…». Con container queries la misma fila es de 6
   * columnas cuando el hueco es angosto y de 12 cuando hay lugar — los `span` de
   * los campos no cambian, cambia cuántas columnas hay para repartir.
   */
  return (
    <div className="@container">
    <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 @sm:grid-cols-6 @2xl:grid-cols-12">
      <div className="@sm:col-span-6 @2xl:col-span-6">
      <Field label={etiquetaNombre} required>
        <input type="text" className={I} value={parte.nombre} onChange={(e) => onChange({ nombre: e.target.value })} />
      </Field>
      </div>
      <div className="@sm:col-span-2 @2xl:col-span-2">
      <Field label="Tipo doc.">
        <select className={I} value={parte.docTipo} onChange={(e) => onChange({ docTipo: e.target.value as DocTipoParte })}>
          {(["RUC", "DNI", "CE", "PASAPORTE"] as const).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      </div>
      <div className="@sm:col-span-4 @2xl:col-span-4">
      <Field
        label="N° de documento"
        hint={tipoPadron ? undefined : "8 dígitos (DNI) u 11 (RUC) traen los datos solos"}
      >
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            className={`${I} font-mono`}
            value={parte.docNumero}
            onChange={(e) => onChange({ docNumero: e.target.value })}
          />
          {/* Manual además de automático: el operador que corrigió un dato y
              quiere el del padrón de vuelta no tiene por qué re-tipear el número. */}
          <button
            type="button"
            disabled={!tipoPadron || consultando}
            onClick={() => consultar(numero)}
            title={
              tipoPadron
                ? `Consultar ${tipoPadron === "RUC" ? "SUNAT" : "RENIEC"} con ese número`
                : "Escribí 8 dígitos (DNI) u 11 (RUC)"
            }
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="sr-only">Traer del padrón</span>
          </button>
        </div>
      </Field>
      </div>

      {/* Qué dijo el padrón: una línea, no un bloque. */}
      {alDia && (
        <div className="@sm:col-span-6 @2xl:col-span-12">
          {hallado ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
              <Check className="h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
              <b className="text-[var(--text-primary)]">{hallado.nombre}</b>
              <span className="text-[var(--text-tertiary)]">
                {hallado.fuente}
                {hallado.estado ? ` · ${hallado.estado}` : ""}
                {hallado.condicion ? ` · ${hallado.condicion}` : ""}
                {hallado.demo ? " · dato de demostración" : ""}
              </span>
              {difiere && (
                <button
                  type="button"
                  onClick={() => aplicar(hallado, true)}
                  className="ml-auto rounded-lg border-2 border-[var(--rule-base)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                >
                  Traer todo del padrón
                </button>
              )}
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-1.5 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {resultado.encontrado ? "" : resultado.motivo}
            </p>
          )}
          {aviso && (
            <p className="mt-1 px-3 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              {aviso}
            </p>
          )}
        </div>
      )}

      <div className={sinUbicacion ? "@sm:col-span-6 @2xl:col-span-12" : "@sm:col-span-6"}>
      <Field
        label="Dirección"
        required={direccionRequerida}
        hint={direccionRequerida ? "Es el punto de llegada que cotejan los controles" : undefined}
      >
        <input type="text" className={I} value={parte.direccion} onChange={(e) => onChange({ direccion: e.target.value })} />
      </Field>
      </div>
      {/* Casilleros (17)(18)(19) y (26)(27)(28) del formato: el control pide
          «el (27)», así que van sueltos y no dentro de la dirección. */}
      {!sinUbicacion && (
        <>
          <div className="@sm:col-span-2">
          <Field label="Departamento" hint="Casillero oficial">
            <input type="text" className={I} value={parte.departamento ?? ""} onChange={(e) => onChange({ departamento: e.target.value })} />
          </Field>
          </div>
          <div className="@sm:col-span-2">
          <Field label="Provincia">
            <input type="text" className={I} value={parte.provincia ?? ""} onChange={(e) => onChange({ provincia: e.target.value })} />
          </Field>
          </div>
          <div className="@sm:col-span-2">
          <Field label="Distrito">
            <input type="text" className={I} value={parte.distrito ?? ""} onChange={(e) => onChange({ distrito: e.target.value })} />
          </Field>
          </div>
          <div className="@sm:col-span-2">
          {/* Sector o caserío: en la selva es lo que identifica el punto de
              llegada cuando la dirección no tiene numeración, y es un casillero
              del formato. Guardado acá, la guía lo hereda sola. */}
          <Field label="Zona" hint="Sector o caserío">
            <input type="text" className={I} value={parte.zona ?? ""} onChange={(e) => onChange({ zona: e.target.value })} />
          </Field>
          </div>
        </>
      )}
      {extra}
    </div>
    </div>
  );
}
