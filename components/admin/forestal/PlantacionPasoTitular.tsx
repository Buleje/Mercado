"use client";

/**
 * PlantacionPasoTitular — Sección 3 (Titular) + Sección 4 (Representante legal)
 * del Formato Único RNPF. `repTiene` sólo cambia visibilidad — nunca borra lo
 * ya tipeado del representante, aunque se apague el switch.
 */

import type { PlantacionInput } from "@/lib/forestal/plantacion-tramite";
import { TIPOS_DOCUMENTO_IDENTIDAD, TIPOS_VIA, type TipoPersona } from "@/lib/forestal/plantacion-catalogo";
import { CampoGrid, Field, I } from "./ctp-shared";
import CtpUbigeoSelects from "./CtpUbigeoSelects";

type Patch = Partial<PlantacionInput>;

/** Cabecera de sección numerada, misma identidad visual del resto del módulo. */
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

/** Bloque de dirección (vía/dirección/número) — idéntico para titular y representante. */
function DireccionCampos({
  tipoVia,
  direccion,
  numero,
  soloLectura,
  onTipoVia,
  onDireccion,
  onNumero,
}: {
  tipoVia: string | null | undefined;
  direccion: string | null | undefined;
  numero: string | null | undefined;
  soloLectura?: boolean;
  onTipoVia: (v: string | null) => void;
  onDireccion: (v: string | null) => void;
  onNumero: (v: string | null) => void;
}) {
  return (
    <>
      <Field label="Tipo de vía" span={3}>
        <select className={I} disabled={soloLectura} value={tipoVia ?? ""} onChange={(e) => onTipoVia(e.target.value || null)}>
          <option value="">—</option>
          {TIPOS_VIA.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label="Dirección" span={6}>
        <input className={I} disabled={soloLectura} value={direccion ?? ""} onChange={(e) => onDireccion(e.target.value || null)} />
      </Field>
      <Field label="Número" span={3}>
        <input className={I} disabled={soloLectura} value={numero ?? ""} onChange={(e) => onNumero(e.target.value || null)} />
      </Field>
    </>
  );
}

export default function PlantacionPasoTitular({
  datos,
  soloLectura,
  onChange,
}: {
  datos: PlantacionInput;
  soloLectura?: boolean;
  onChange: (patch: Patch) => void;
}) {
  const esJuridica = datos.titularTipoPersona === "juridica";

  function elegirTipoPersona(tipo: TipoPersona) {
    onChange({
      titularTipoPersona: tipo,
      titularTipoDocumento: tipo === "juridica" ? "ruc" : datos.titularTipoDocumento === "ruc" ? null : datos.titularTipoDocumento,
    });
  }

  return (
    <div className="space-y-5">
      <Seccion numero={3} titulo="Titular de la plantación" hint="Quién inscribe la plantación ante el RNPF">
        <CampoGrid>
          <Field label="Tipo de persona" span={4}>
            <div className="flex gap-2">
              {(["natural", "juridica"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={soloLectura}
                  aria-pressed={datos.titularTipoPersona === t}
                  onClick={() => elegirTipoPersona(t)}
                  className={`h-11 flex-1 rounded-xl border-2 text-sm font-bold transition ${
                    datos.titularTipoPersona === t
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                  }`}
                >
                  {t === "natural" ? "Persona natural" : "Persona jurídica"}
                </button>
              ))}
            </div>
          </Field>

          {esJuridica ? (
            <>
              <Field label="Razón social" span={8}>
                <input className={I} disabled={soloLectura} value={datos.titularRazonSocial ?? ""} onChange={(e) => onChange({ titularRazonSocial: e.target.value || null })} />
              </Field>
              <Field label="Tipo de documento" span={2}>
                <input className={I} disabled value="RUC" />
              </Field>
              <Field label="Número de RUC" span={2}>
                <input className={I} disabled={soloLectura} value={datos.titularNumeroDocumento ?? ""} onChange={(e) => onChange({ titularNumeroDocumento: e.target.value || null })} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Tipo de documento" span={2}>
                <select className={I} disabled={soloLectura} value={datos.titularTipoDocumento ?? ""} onChange={(e) => onChange({ titularTipoDocumento: e.target.value || null })}>
                  <option value="">—</option>
                  {TIPOS_DOCUMENTO_IDENTIDAD.filter((d) => d.value !== "ruc").map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Número de documento" span={2}>
                <input className={I} disabled={soloLectura} value={datos.titularNumeroDocumento ?? ""} onChange={(e) => onChange({ titularNumeroDocumento: e.target.value || null })} />
              </Field>
              <Field label="Apellido paterno" span={2}>
                <input className={I} disabled={soloLectura} value={datos.titularApellidoPaterno ?? ""} onChange={(e) => onChange({ titularApellidoPaterno: e.target.value || null })} />
              </Field>
              <Field label="Apellido materno" span={2}>
                <input className={I} disabled={soloLectura} value={datos.titularApellidoMaterno ?? ""} onChange={(e) => onChange({ titularApellidoMaterno: e.target.value || null })} />
              </Field>
              <Field label="Nombres" span={4}>
                <input className={I} disabled={soloLectura} value={datos.titularNombres ?? ""} onChange={(e) => onChange({ titularNombres: e.target.value || null })} />
              </Field>
            </>
          )}

          <Field label="Teléfono fijo" span={4}>
            <input className={I} disabled={soloLectura} value={datos.titularTelefonoFijo ?? ""} onChange={(e) => onChange({ titularTelefonoFijo: e.target.value || null })} />
          </Field>
          <Field label="Celular" span={4}>
            <input className={I} disabled={soloLectura} value={datos.titularCelular ?? ""} onChange={(e) => onChange({ titularCelular: e.target.value || null })} />
          </Field>
          <Field label="Correo electrónico" span={4}>
            <input type="email" className={I} disabled={soloLectura} value={datos.titularEmail ?? ""} onChange={(e) => onChange({ titularEmail: e.target.value || null })} />
          </Field>

          <CtpUbigeoSelects
            span={4}
            valor={{ departamento: datos.titularDepartamento ?? undefined, provincia: datos.titularProvincia ?? undefined, distrito: datos.titularDistrito ?? undefined }}
            onChange={(v) =>
              onChange({
                titularDepartamento: v.departamento ?? datos.titularDepartamento ?? null,
                titularProvincia: v.provincia ?? datos.titularProvincia ?? null,
                titularDistrito: v.distrito ?? datos.titularDistrito ?? null,
              })
            }
          />

          <DireccionCampos
            tipoVia={datos.titularTipoVia}
            direccion={datos.titularDireccion}
            numero={datos.titularNumero}
            soloLectura={soloLectura}
            onTipoVia={(v) => onChange({ titularTipoVia: v })}
            onDireccion={(v) => onChange({ titularDireccion: v })}
            onNumero={(v) => onChange({ titularNumero: v })}
          />

          <Field label="Documento que autoriza el uso del área" span={12} hint="Sólo si quien inscribe la plantación no es el titular del predio">
            <input className={I} disabled={soloLectura} value={datos.titularDocumentoAutorizaUso ?? ""} onChange={(e) => onChange({ titularDocumentoAutorizaUso: e.target.value || null })} />
          </Field>
        </CampoGrid>
      </Seccion>

      <Seccion
        numero={4}
        titulo="Representante legal"
        hint="Sólo si alguien más firma en nombre del titular"
        aside={
          <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
            <input
              type="checkbox"
              disabled={soloLectura}
              checked={Boolean(datos.repTiene)}
              onChange={(e) => onChange({ repTiene: e.target.checked })}
              className="h-5 w-5 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)]"
            />
            Cuenta con representante legal
          </label>
        }
      >
        {datos.repTiene ? (
          <CampoGrid>
            <Field label="Tipo de documento" span={2}>
              <select className={I} disabled={soloLectura} value={datos.repTipoDocumento ?? ""} onChange={(e) => onChange({ repTipoDocumento: e.target.value || null })}>
                <option value="">—</option>
                {TIPOS_DOCUMENTO_IDENTIDAD.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Número de documento" span={2}>
              <input className={I} disabled={soloLectura} value={datos.repNumeroDocumento ?? ""} onChange={(e) => onChange({ repNumeroDocumento: e.target.value || null })} />
            </Field>
            <Field label="Apellido paterno" span={2}>
              <input className={I} disabled={soloLectura} value={datos.repApellidoPaterno ?? ""} onChange={(e) => onChange({ repApellidoPaterno: e.target.value || null })} />
            </Field>
            <Field label="Apellido materno" span={2}>
              <input className={I} disabled={soloLectura} value={datos.repApellidoMaterno ?? ""} onChange={(e) => onChange({ repApellidoMaterno: e.target.value || null })} />
            </Field>
            <Field label="Nombres" span={4}>
              <input className={I} disabled={soloLectura} value={datos.repNombres ?? ""} onChange={(e) => onChange({ repNombres: e.target.value || null })} />
            </Field>

            <Field label="Teléfono fijo" span={4}>
              <input className={I} disabled={soloLectura} value={datos.repTelefonoFijo ?? ""} onChange={(e) => onChange({ repTelefonoFijo: e.target.value || null })} />
            </Field>
            <Field label="Celular" span={4}>
              <input className={I} disabled={soloLectura} value={datos.repCelular ?? ""} onChange={(e) => onChange({ repCelular: e.target.value || null })} />
            </Field>
            <Field label="Correo electrónico" span={4}>
              <input type="email" className={I} disabled={soloLectura} value={datos.repEmail ?? ""} onChange={(e) => onChange({ repEmail: e.target.value || null })} />
            </Field>

            <CtpUbigeoSelects
              span={4}
              valor={{ departamento: datos.repDepartamento ?? undefined, provincia: datos.repProvincia ?? undefined, distrito: datos.repDistrito ?? undefined }}
              onChange={(v) =>
                onChange({
                  repDepartamento: v.departamento ?? datos.repDepartamento ?? null,
                  repProvincia: v.provincia ?? datos.repProvincia ?? null,
                  repDistrito: v.distrito ?? datos.repDistrito ?? null,
                })
              }
            />

            <DireccionCampos
              tipoVia={datos.repTipoVia}
              direccion={datos.repDireccion}
              numero={datos.repNumero}
              soloLectura={soloLectura}
              onTipoVia={(v) => onChange({ repTipoVia: v })}
              onDireccion={(v) => onChange({ repDireccion: v })}
              onNumero={(v) => onChange({ repNumero: v })}
            />
          </CampoGrid>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">No corresponde — el titular firma directamente.</p>
        )}
      </Seccion>
    </div>
  );
}
