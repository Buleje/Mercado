"use client";

/**
 * PlantacionPasoPredio — Sección 5 (Datos del predio) + Sección 6 (Titularidad
 * del predio) + Sección 7 (Título habilitante / contrato) del Formato Único RNPF.
 *
 * Titularidad "posesionario" (D.L. N°1283, costa/sierra) suma 3 campos propios
 * a los comunes — no los reemplaza, el predio puede tener ambos juegos de datos
 * a la vez si el operador cambia de opción y vuelve.
 */

import type { PlantacionInput } from "@/lib/forestal/plantacion-tramite";
import {
  TIPOS_DOCUMENTO_IDENTIDAD,
  TIPOS_DOCUMENTO_PROPIEDAD,
  TIPOS_TITULARIDAD_PREDIO,
  TIPOS_TITULO_HABILITANTE,
  type TipoPersona,
} from "@/lib/forestal/plantacion-catalogo";
import { CampoGrid, Field, I } from "./ctp-shared";
import CtpUbigeoSelects from "./CtpUbigeoSelects";

type Patch = Partial<PlantacionInput>;

function Seccion({
  numero,
  titulo,
  hint,
  aside,
  children,
}: {
  numero: number;
  titulo: string;
  hint?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b-2 border-[var(--rule-soft)] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-black text-[var(--accent-ink)] dark:text-[var(--accent)]">{numero}</span>
          <div className="min-w-0">
            <h4 className="text-base font-bold leading-tight text-[var(--text-primary)]">{titulo}</h4>
            {hint && <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export default function PlantacionPasoPredio({
  datos,
  soloLectura,
  onChange,
}: {
  datos: PlantacionInput;
  soloLectura?: boolean;
  onChange: (patch: Patch) => void;
}) {
  const esPosesionario = datos.titularidadTipo === "posesionario";
  const esJuridica = datos.titularidadTipoPersona === "juridica";

  function elegirTipoPersonaTitularidad(tipo: TipoPersona) {
    onChange({
      titularidadTipoPersona: tipo,
      titularidadDocumentoTipo: tipo === "juridica" ? "ruc" : datos.titularidadDocumentoTipo === "ruc" ? null : datos.titularidadDocumentoTipo,
    });
  }

  return (
    <div className="space-y-5">
      <Seccion numero={5} titulo="Datos del predio" hint="Dónde está la plantación">
        <CampoGrid>
          <Field label="Nombre del predio" span={6}>
            <input className={I} disabled={soloLectura} value={datos.predioNombre ?? ""} onChange={(e) => onChange({ predioNombre: e.target.value || null })} />
          </Field>
          <Field label="Área total del predio (ha)" span={3}>
            <input type="number" min={0} step="0.0001" className={I} disabled={soloLectura} value={datos.predioAreaTotalHa ?? ""} onChange={(e) => onChange({ predioAreaTotalHa: numOrNull(e.target.value) })} />
          </Field>
          <Field label="Sector / Anexo / Caserío / Comunidad" span={3}>
            <input className={I} disabled={soloLectura} value={datos.predioSectorAnexo ?? ""} onChange={(e) => onChange({ predioSectorAnexo: e.target.value || null })} />
          </Field>

          <CtpUbigeoSelects
            span={4}
            valor={{ departamento: datos.predioDepartamento ?? undefined, provincia: datos.predioProvincia ?? undefined, distrito: datos.predioDistrito ?? undefined }}
            onChange={(v) =>
              onChange({
                predioDepartamento: v.departamento ?? datos.predioDepartamento ?? null,
                predioProvincia: v.provincia ?? datos.predioProvincia ?? null,
                predioDistrito: v.distrito ?? datos.predioDistrito ?? null,
              })
            }
          />

          <Field label="Zona UTM" span={3} hint="Ej. 18M">
            <input className={I} disabled={soloLectura} value={datos.predioZonaUtm ?? ""} onChange={(e) => onChange({ predioZonaUtm: e.target.value || null })} />
          </Field>
          <Field label="Este (centroide)" span={3}>
            <input type="number" step="any" className={I} disabled={soloLectura} value={datos.predioEste ?? ""} onChange={(e) => onChange({ predioEste: numOrNull(e.target.value) })} />
          </Field>
          <Field label="Norte (centroide)" span={3}>
            <input type="number" step="any" className={I} disabled={soloLectura} value={datos.predioNorte ?? ""} onChange={(e) => onChange({ predioNorte: numOrNull(e.target.value) })} />
          </Field>
          <Field label="Datum" span={3}>
            <input className={I} disabled={soloLectura} value={datos.predioDatum ?? "WGS84"} onChange={(e) => onChange({ predioDatum: e.target.value || "WGS84" })} />
          </Field>
        </CampoGrid>
      </Seccion>

      <Seccion numero={6} titulo="Titularidad del predio" hint="Bajo qué derecho se usa el área">
        <CampoGrid>
          <Field label="Tipo de titularidad" span={4}>
            <select className={I} disabled={soloLectura} value={datos.titularidadTipo ?? ""} onChange={(e) => onChange({ titularidadTipo: e.target.value || null })}>
              <option value="">—</option>
              {TIPOS_TITULARIDAD_PREDIO.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de persona" span={4}>
            <div className="flex gap-2">
              {(["natural", "juridica"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={soloLectura}
                  aria-pressed={datos.titularidadTipoPersona === t}
                  onClick={() => elegirTipoPersonaTitularidad(t)}
                  className={`h-11 flex-1 rounded-xl border-2 text-sm font-bold transition ${
                    datos.titularidadTipoPersona === t
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                  }`}
                >
                  {t === "natural" ? "Natural" : "Jurídica"}
                </button>
              ))}
            </div>
          </Field>

          {esJuridica ? (
            <Field label="Tipo de documento" span={4}>
              <input className={I} disabled value="RUC" />
            </Field>
          ) : (
            <Field label="Tipo de documento" span={4}>
              <select className={I} disabled={soloLectura} value={datos.titularidadDocumentoTipo ?? ""} onChange={(e) => onChange({ titularidadDocumentoTipo: e.target.value || null })}>
                <option value="">—</option>
                {TIPOS_DOCUMENTO_IDENTIDAD.filter((d) => d.value !== "ruc").map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Número de documento" span={4}>
            <input className={I} disabled={soloLectura} value={datos.titularidadDocumentoNumero ?? ""} onChange={(e) => onChange({ titularidadDocumentoNumero: e.target.value || null })} />
          </Field>
          <Field label="Nombre / razón social" span={4}>
            <input className={I} disabled={soloLectura} value={datos.titularidadNombre ?? ""} onChange={(e) => onChange({ titularidadNombre: e.target.value || null })} />
          </Field>

          <Field label="Documento que acredita la propiedad" span={4}>
            <select className={I} disabled={soloLectura} value={datos.titularidadDocAcreditaTipo ?? ""} onChange={(e) => onChange({ titularidadDocAcreditaTipo: e.target.value || null })}>
              <option value="">—</option>
              {TIPOS_DOCUMENTO_PROPIEDAD.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="N° del documento" span={4}>
            <input className={I} disabled={soloLectura} value={datos.titularidadDocAcreditaNumero ?? ""} onChange={(e) => onChange({ titularidadDocAcreditaNumero: e.target.value || null })} />
          </Field>
          <Field label="N° de inscripción registral SUNARP" span={4} hint="Opcional">
            <input className={I} disabled={soloLectura} value={datos.titularidadInscripcionSunarp ?? ""} onChange={(e) => onChange({ titularidadInscripcionSunarp: e.target.value || null })} />
          </Field>

          <Field label="Documento que autoriza el uso del área" span={12}>
            <input className={I} disabled={soloLectura} value={datos.titularidadDocAutorizaUso ?? ""} onChange={(e) => onChange({ titularidadDocAutorizaUso: e.target.value || null })} />
          </Field>

          {esPosesionario && (
            <>
              <Field label="Nombre del posesionario" span={4} hint="D.L. N°1283 — costa/sierra">
                <input className={I} disabled={soloLectura} value={datos.posesionarioNombre ?? ""} onChange={(e) => onChange({ posesionarioNombre: e.target.value || null })} />
              </Field>
              <Field label="Documento que acredita la posesión" span={4}>
                <input className={I} disabled={soloLectura} value={datos.posesionarioDocumentoAcredita ?? ""} onChange={(e) => onChange({ posesionarioDocumentoAcredita: e.target.value || null })} />
              </Field>
              <Field label="Años que conduce la parcela" span={4}>
                <input type="number" min={0} step="1" className={I} disabled={soloLectura} value={datos.posesionarioAniosConduccion ?? ""} onChange={(e) => onChange({ posesionarioAniosConduccion: numOrNull(e.target.value) })} />
              </Field>
            </>
          )}
        </CampoGrid>
      </Seccion>

      <Seccion
        numero={7}
        titulo="Título habilitante / contrato"
        hint="Cesión en uso para sistemas agroforestales o concesión para plantaciones"
        aside={
          <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
            <input
              type="checkbox"
              disabled={soloLectura}
              checked={Boolean(datos.tituloHabilitanteTiene)}
              onChange={(e) => onChange({ tituloHabilitanteTiene: e.target.checked })}
              className="h-5 w-5 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)]"
            />
            Corresponde un título habilitante o contrato
          </label>
        }
      >
        {datos.tituloHabilitanteTiene ? (
          <CampoGrid>
            <Field label="Tipo de título habilitante" span={6}>
              <select className={I} disabled={soloLectura} value={datos.tituloHabilitanteTipo ?? ""} onChange={(e) => onChange({ tituloHabilitanteTipo: e.target.value || null })}>
                <option value="">—</option>
                {TIPOS_TITULO_HABILITANTE.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Código / número del título habilitante" span={6}>
              <input className={I} disabled={soloLectura} value={datos.tituloHabilitanteCodigo ?? ""} onChange={(e) => onChange({ tituloHabilitanteCodigo: e.target.value || null })} />
            </Field>
          </CampoGrid>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">No corresponde.</p>
        )}
      </Seccion>
    </div>
  );
}
