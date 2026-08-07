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

import { CardTitle } from "@buleje/design-system";
import { Field, I } from "./ctp-shared";

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
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2.5">
        <div className="min-w-0">
          <CardTitle as="h3" className="truncate text-sm font-bold text-[var(--text-primary)]">{titulo}</CardTitle>
          {hint && <p className="truncate text-xs text-[var(--text-tertiary)]">{hint}</p>}
        </div>
        {acciones}
      </header>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-12">{children}</div>
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
  return (
    <>
      <Field span={span} label={etiquetaIzq}>
        <input
          type="text"
          inputMode="numeric"
          className={`${I} font-mono`}
          value={esRuc ? "" : parte.docNumero}
          onChange={(e) => onChange({ docTipo: esRuc ? "DNI" : parte.docTipo, docNumero: e.target.value })}
        />
      </Field>
      <Field span={span} label="Nro RUC">
        <input
          type="text"
          inputMode="numeric"
          className={`${I} font-mono`}
          value={esRuc ? parte.docNumero : ""}
          onChange={(e) => onChange({ docTipo: "RUC", docNumero: e.target.value })}
        />
      </Field>
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
        <Field span={4} label="Zona" hint="Sector, caserío o kilómetro">
          <input type="text" className={I} value={parte.zona ?? ""} onChange={(e) => onChange({ zona: e.target.value })} />
        </Field>
      )}
      <Field span={conZona ? 4 : 4} label="Departamento">
        <input type="text" className={I} value={parte.departamento ?? ""} onChange={(e) => onChange({ departamento: e.target.value })} />
      </Field>
      <Field span={4} label="Provincia">
        <input type="text" className={I} value={parte.provincia ?? ""} onChange={(e) => onChange({ provincia: e.target.value })} />
      </Field>
      <Field span={4} label="Distrito">
        <input type="text" className={I} value={parte.distrito ?? ""} onChange={(e) => onChange({ distrito: e.target.value })} />
      </Field>
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
