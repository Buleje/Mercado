"use client";

/**
 * TramiteCamposPanel — los campos del trámite (grupos + guías + seguimiento),
 * extraído de `TramiteFormulario` (ADR-364 ronda 5, Brandon 2026-08-20:
 * "quiero poder editar en la misma página que veo el documento"). Se usa DOS
 * veces — en la columna del formulario y dentro de `TramiteDocumentoModal` —
 * pero NUNCA montado dos veces a la vez (`TramiteFormulario` decide cuál de
 * las dos lo muestra): `TramiteRelacionGuias` siembra su estado desde `value`
 * una sola vez al montar, así que dos copias vivas a la vez divergirían en
 * cuanto se edite una — ver `TramiteFormulario` para el guard.
 *
 * Sin estado propio: todo (`datos`, `estado`, `expediente`…) vive en el padre.
 */

import { useRef, type Dispatch, type SetStateAction } from "react";
import { ImageIcon } from "@buleje/design-system/icons";
import { ESTADOS_TRAMITE, type TramiteRegistro } from "@/lib/forestal/tramites-registro";
import type { DatosTramite, FormatoTramite } from "@/lib/forestal/tramites-catalogo";
import type { GtfDuplicada } from "@/lib/forestal/tramites-relacion-guias";
import type { LogoTramite } from "@/lib/forestal/tramites-logo";
import { Field, I } from "./ctp-shared";
import TramiteEntidadPicker, { type EntidadElegida } from "./TramiteEntidadPicker";
import TramiteHistorialRelaciones from "./TramiteHistorialRelaciones";
import TramiteRelacionGuias from "./TramiteRelacionGuias";

/**
 * Qué campo de un `FormatoTramite` llena cada dato de un emisor elegido, por
 * el id de campo tal como aparece en `tramites-catalogo.ts`. Single source
 * (2026-08-25): un formato nuevo que use alguno de estos ids recibe el picker
 * solo con agregar el campo — no hay que tocar este componente.
 */
const CAMPO_A_EMISOR: Record<string, keyof EntidadElegida> = {
  entidadNombre: "nombre",
  entidadRuc: "docNumero",
  entidadRepresentante: "representante",
  entidadCodigoCtp: "codigoCtp",
  firmante: "nombre",
  firmanteDni: "docNumero",
  membreteEmpresa: "nombre",
};

/** Los `datos` que hay que pisar en el formulario para aplicar el emisor
 *  elegido a ESTOS campos — sólo los que el grupo realmente tiene, y sólo
 *  cuando el emisor trae ese dato (RUC en un campo de RUC, DNI en uno de DNI). */
function datosDeEmisor(campos: FormatoTramite["campos"], e: EntidadElegida): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of campos) {
    if (c.id === "lugar") {
      if (e.provincia || e.region) out.lugar = e.provincia || e.region;
      continue;
    }
    if (c.id === "entidadRuc" || c.id === "firmanteDni") {
      // El campo de RUC sólo se llena con un RUC, y el de DNI sólo con un DNI
      // — cruzarlos imprimiría un documento que no es el que dice la etiqueta.
      const tipoQueVale = c.id === "entidadRuc" ? "RUC" : "DNI";
      if (e.docTipo === tipoQueVale && e.docNumero) out[c.id] = e.docNumero;
      continue;
    }
    if (c.id === "membreteEmpresa") {
      // El membrete es un bloque: si el nombre pasa a ser el de otra parte,
      // su Código de CTP y dirección viajan CON el nombre — `tramites-print.ts`
      // deja de heredar el resto de la Ficha en cuanto el nombre del membrete
      // deja de ser el nuestro, así que sin esto un comunero elegido acá
      // imprimía SU nombre junto al Código de CTP de NUESTRO aserradero
      // (Brandon 2026-08-25: "pone que número de CTP pero es comunidad
      // nativa, no es aserradero").
      if (e.docTipo === "RUC" && e.docNumero) out.membreteRuc = e.docNumero;
      if (e.codigoCtp) out.membreteCodigoCtp = e.codigoCtp;
      if (e.direccion) out.membreteDireccion = e.direccion;
    }
    const rol = CAMPO_A_EMISOR[c.id];
    if (rol && e[rol]) out[c.id] = String(e[rol]);
  }
  return out;
}

/**
 * Logo del membrete (ADR-364 ronda 6): botón-preview grande, igual patrón que
 * `Anexo04Campos.ImagenGuardada` — una caja de 20px de alto no deja juzgar un
 * logo. Vive acá (no en `tramites-logo.ts`, que es sólo lectura/escritura de
 * localStorage) porque es puramente presentacional.
 */
function LogoMembrete({
  logo,
  onArchivo,
  onQuitar,
}: {
  logo: LogoTramite | null;
  onArchivo: (f?: File) => void;
  onQuitar: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onArchivo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        title={logo ? "Cambiar logo" : "Subir logo"}
        aria-label={logo ? "Cambiar logo del membrete" : "Subir logo del membrete"}
        className={`flex h-11 w-16 items-center justify-center overflow-hidden rounded-xl border-2 bg-[var(--surface-raised)] p-1 transition ${logo ? "border-[var(--data-success-500)]/50" : "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- dataURL local, no pasa por el optimizador
          <img src={logo.src} alt="Logo del membrete" className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon className="h-5 w-5" />
        )}
      </button>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold text-[var(--text-primary)]">Logo del membrete</span>
        <div className="flex items-center gap-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          <span>Va arriba de la hoja, al lado de la razón social</span>
          {logo && (
            <button type="button" onClick={onQuitar} className="font-bold underline hover:text-[var(--data-error-700)]">
              Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Cabecera de cada bloque del formulario ("1 · A quién va", "2 · Qué se pide"…).
 * Chip numerado (el orden en que se llena) + texto normal: la jerarquía se
 * nota por PESO, no por mayúscula-espaciada (Brandon 2026-08-20).
 */
export function SeccionHeader({
  numero,
  titulo,
  hint,
  aside,
}: {
  numero: number;
  titulo: string;
  hint?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b-2 border-[var(--rule-soft)] pb-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-black text-[var(--accent-ink)] dark:text-[var(--accent)]">
          {numero}
        </span>
        <div className="min-w-0">
          <h4 className="text-base font-bold leading-tight text-[var(--text-primary)]">{titulo}</h4>
          {hint && <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>}
        </div>
      </div>
      {aside}
    </div>
  );
}

export default function TramiteCamposPanel({
  formato,
  datos,
  setDatos,
  set,
  gruposVisibles,
  sugerenciaPeriodo,
  relacionesFormato,
  idActual,
  duplicadosCruzados,
  existente,
  estado,
  setEstado,
  expediente,
  setExpediente,
  fechaPresentacion,
  setFechaPresentacion,
  fechaLimite,
  setFechaLimite,
  notas,
  setNotas,
  logo,
  onLogoArchivo,
  onLogoQuitar,
}: {
  formato: FormatoTramite;
  datos: DatosTramite;
  setDatos: Dispatch<SetStateAction<DatosTramite>>;
  set: (id: string, valor: string) => void;
  gruposVisibles: { id: string; label: string; hint: string }[];
  sugerenciaPeriodo: string | null;
  relacionesFormato: TramiteRegistro[];
  idActual: string | null;
  duplicadosCruzados: GtfDuplicada[];
  existente?: TramiteRegistro | null;
  estado: string;
  setEstado: (v: string) => void;
  expediente: string;
  setExpediente: (v: string) => void;
  fechaPresentacion: string;
  setFechaPresentacion: (v: string) => void;
  fechaLimite: string;
  setFechaLimite: (v: string) => void;
  notas: string;
  setNotas: (v: string) => void;
  /** Logo del membrete (ADR-364 ronda 6) — vive por tenant, no en `datos`. */
  logo: LogoTramite | null;
  onLogoArchivo: (f?: File) => void;
  onLogoQuitar: () => void;
}) {
  const campoInput = (c: FormatoTramite["campos"][number]) =>
    c.tipo === "textarea" ? (
      <textarea
        rows={3}
        className={`${I} h-auto py-2`}
        value={datos[c.id] ?? ""}
        placeholder={c.placeholder}
        onChange={(e) => set(c.id, e.target.value)}
      />
    ) : (
      <input
        type={c.tipo === "numero" ? "number" : c.tipo === "fecha" ? "date" : "text"}
        className={I}
        value={datos[c.id] ?? ""}
        placeholder={c.placeholder}
        onChange={(e) => set(c.id, e.target.value)}
      />
    );

  return (
    <div className="space-y-4">
      {gruposVisibles.map((g, i) => {
        const campos = formato.campos.filter((c) => (c.grupo ?? "datos") === g.id);
        const camposDeEmisor = campos.filter((c) => c.id in CAMPO_A_EMISOR || c.id === "lugar");
        return (
          <section key={g.id} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
            <SeccionHeader
              numero={i + 1}
              titulo={g.label}
              hint={g.hint}
              aside={
                camposDeEmisor.length > 0 ? (
                  <TramiteEntidadPicker
                    onElegir={(e) => setDatos((p) => ({ ...p, ...datosDeEmisor(camposDeEmisor, e) }))}
                  />
                ) : undefined
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {campos.map((c) => (
                <Field
                  key={c.id}
                  label={c.label}
                  required={c.requerido}
                  hint={
                    // Continuidad de período (ADR-364 ronda 4): sólo se
                    // muestra si el campo todavía está vacío.
                    c.id === "periodoDesde" && sugerenciaPeriodo && !datos.periodoDesde?.trim()
                      ? `Sugerido: ${sugerenciaPeriodo} (día siguiente a tu última relación presentada)`
                      : c.hint
                  }
                >
                  {campoInput(c)}
                </Field>
              ))}
            </div>
            {g.id === "firma" && (
              <div className="mt-4 border-t-2 border-[var(--rule-soft)] pt-4">
                <LogoMembrete logo={logo} onArchivo={onLogoArchivo} onQuitar={onLogoQuitar} />
              </div>
            )}
          </section>
        );
      })}

      {formato.correlativo && <TramiteHistorialRelaciones relaciones={relacionesFormato} idActual={idActual} />}

      {formato.tablaGuias && (
        <TramiteRelacionGuias
          key={existente?.id ?? formato.id}
          numero={gruposVisibles.length + 1}
          value={datos.guiasJson ?? ""}
          onChange={(json) => set("guiasJson", json)}
          periodoDesde={datos.periodoDesde}
          periodoHasta={datos.periodoHasta}
          duplicadosCruzados={duplicadosCruzados}
        />
      )}

      {/* Seguimiento: lo que convierte un papel en expediente. */}
      <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
        <SeccionHeader
          numero={gruposVisibles.length + (formato.tablaGuias ? 2 : 1)}
          titulo="Seguimiento"
          hint="Para saber después qué pasó con este trámite"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Estado">
            <select className={I} value={estado} onChange={(e) => setEstado(e.target.value)}>
              {ESTADOS_TRAMITE.map((e) => (
                <option key={e.key} value={e.key}>{e.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Expediente de la autoridad" hint="El número con el que se pregunta después">
            <input type="text" className={I} value={expediente} onChange={(e) => setExpediente(e.target.value)} />
          </Field>
          <Field label="Fecha de presentación" hint="Sin fecha no se puede contar el plazo">
            <input type="date" className={I} value={fechaPresentacion} onChange={(e) => setFechaPresentacion(e.target.value)} />
          </Field>
          <Field
            label="Fecha límite para responder"
            hint="Sólo si ESTE trámite responde a una notificación con plazo (ej. descargo). Poné la fecha real de tu caso — el sistema no la inventa — y avisa 3 días antes"
          >
            <input type="date" className={I} value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
          </Field>
          <Field label="Notas internas">
            <input type="text" className={I} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Field>
        </div>
      </section>
    </div>
  );
}
