"use client";

/**
 * Empresa › Ficha (ADR-497): arriba el membrete en sólo lectura —nombre, RUC,
 * logo, teléfono y dirección viven en Configuración y no se vuelven a pedir—
 * y debajo lo que el plan agrega: razón social, sociedad, régimen, rubro…
 */
import { Building2 } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { usePlanEmpresa, useSeccionPlan } from "@/hooks/use-plan-empresa";
import { REGIMENES_TRIBUTARIOS, TIPOS_SOCIEDAD, type DatosSeccion } from "@/lib/planificacion/secciones";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { CAMPO, CAMPO_AREA, Campo } from "./campos-plan";
import { AYUDA_REGIMEN, AYUDA_SOCIEDAD } from "./textos-empresa";

type Ficha = DatosSeccion<"ficha">;
type CampoTexto = Exclude<keyof Ficha, "tipoSociedad" | "regimenTributario">;

/** Los campos de texto, en el orden del formulario. */
const TEXTOS: { k: CampoTexto; rotulo: string; ayuda?: string; ejemplo?: string; tipo?: string; ancho?: boolean }[] = [
  { k: "razonSocial", rotulo: "Razón social", ayuda: "El nombre legal que figura en tu ficha RUC.", ejemplo: "Inversiones Buleje S.A.C." },
  { k: "nombreComercial", rotulo: "Nombre comercial", ayuda: "Cómo te conoce la gente, si es distinto del nombre del membrete.", ejemplo: "Bodega San Martín" },
  { k: "rubro", rotulo: "Rubro", ayuda: "A qué se dedica el negocio, en palabras.", ejemplo: "Bodega y minimarket" },
  { k: "tipoNegocio", rotulo: "Cómo vendes", ayuda: "Tienda física, delivery, mayorista, servicio, en línea…", ejemplo: "Tienda física con delivery" },
  { k: "ciiu", rotulo: "Código CIIU", ayuda: "La actividad económica de tu ficha RUC (opcional).", ejemplo: "4711" },
  { k: "fechaInicio", rotulo: "Inicio de actividades", tipo: "date" },
  { k: "horario", rotulo: "Horario de atención", ejemplo: "Lunes a domingo de 7:00 a 23:00" },
  { k: "correo", rotulo: "Correo de la empresa", tipo: "email" },
  { k: "redes", rotulo: "Redes y web", ayuda: "Facebook, Instagram, TikTok o tu página.", ejemplo: "facebook.com/bodegasanmartin" },
];

export function FichaEmpresa() {
  const { membrete } = usePlanEmpresa();
  const { datos, cambiar, puedeEditar } = useSeccionPlan("ficha");
  const poner = <K extends keyof Ficha>(k: K, v: Ficha[K]) => cambiar((prev) => ({ ...prev, [k]: v }));

  return (
    <section className="space-y-4" aria-label="Ficha de la empresa">
      <CabeceraSeccion
        seccion="ficha"
        titulo="Ficha de la empresa"
        ayuda="Los datos legales y de contacto de tu negocio. Nombre, RUC, logo, teléfono y dirección salen de Configuración."
      />

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
        {membrete?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo del tenant, de cualquier origen
          <img src={membrete.logoUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-[var(--surface-raised)] object-contain" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
            <Building2 className="h-6 w-6" aria-hidden />
          </span>
        )}
        <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="sr-only">Nombre</dt>
            <dd className="text-base font-semibold text-[var(--text-primary)]">{membrete?.nombre || "Sin nombre"}</dd>
          </div>
          <Dato rotulo="RUC" valor={membrete?.ruc} />
          <Dato rotulo="Teléfono" valor={membrete?.telefono} />
          <Dato rotulo="Dirección" valor={membrete?.direccion} ancho />
        </dl>
        <div className="flex items-center gap-1">
          <EnlacePanel href="/admin?tab=config" className="text-sm">
            Cambiar en Configuración
          </EnlacePanel>
          <InfoTip what="Estos datos salen del membrete del negocio: los mismos de tus boletas, guías y reportes." />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEXTOS.slice(0, 2).map((c) => (
          <CampoFicha key={c.k} c={c} valor={datos[c.k]} onCambiar={(v) => poner(c.k, v)} editable={puedeEditar} />
        ))}
        <Campo rotulo="Tipo de sociedad" ayuda={<Lista textos={AYUDA_SOCIEDAD} />}>
          {(id) => (
            <select
              id={id}
              className={CAMPO}
              value={datos.tipoSociedad}
              disabled={!puedeEditar}
              onChange={(e) => poner("tipoSociedad", e.target.value as Ficha["tipoSociedad"])}
            >
              <option value="">Elige…</option>
              {TIPOS_SOCIEDAD.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo rotulo="Régimen tributario" ayuda={<Lista textos={AYUDA_REGIMEN} nota="Confirma con tu contador o en SUNAT cuál te corresponde." />}>
          {(id) => (
            <select
              id={id}
              className={CAMPO}
              value={datos.regimenTributario}
              disabled={!puedeEditar}
              onChange={(e) => poner("regimenTributario", e.target.value as Ficha["regimenTributario"])}
            >
              <option value="">Elige…</option>
              {REGIMENES_TRIBUTARIOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </Campo>
        {TEXTOS.slice(2).map((c) => (
          <CampoFicha key={c.k} c={c} valor={datos[c.k]} onCambiar={(v) => poner(c.k, v)} editable={puedeEditar} />
        ))}
        <Campo
          rotulo="Descripción del negocio"
          ayuda="En pocas líneas: qué vendes, dónde, desde cuándo y qué te hace distinto. Sirve de presentación para el banco o un socio."
          className="sm:col-span-2 lg:col-span-3"
        >
          {(id) => (
            <textarea
              id={id}
              className={CAMPO_AREA}
              rows={4}
              value={datos.descripcion}
              readOnly={!puedeEditar}
              maxLength={4000}
              onChange={(e) => poner("descripcion", e.target.value)}
            />
          )}
        </Campo>
      </div>
    </section>
  );
}

function Dato({ rotulo, valor, ancho }: { rotulo: string; valor: string | null | undefined; ancho?: boolean }) {
  return (
    <div className={ancho ? "flex min-w-0 gap-1.5 sm:col-span-2" : "flex min-w-0 gap-1.5"}>
      <dt className="shrink-0 text-[var(--text-secondary)]">{rotulo}:</dt>
      <dd className="min-w-0 break-words text-[var(--text-primary)]">{valor || "—"}</dd>
    </div>
  );
}

function CampoFicha({
  c,
  valor,
  onCambiar,
  editable,
}: {
  c: (typeof TEXTOS)[number];
  valor: string;
  onCambiar: (v: string) => void;
  editable: boolean;
}) {
  return (
    <Campo rotulo={c.rotulo} ayuda={c.ayuda} ejemplo={c.ejemplo}>
      {(id) => (
        <input
          id={id}
          type={c.tipo ?? "text"}
          className={CAMPO}
          value={valor}
          readOnly={!editable}
          maxLength={c.k === "ciiu" ? 10 : 160}
          placeholder={c.tipo ? undefined : c.ejemplo}
          onChange={(e) => onCambiar(e.target.value)}
        />
      )}
    </Campo>
  );
}

/** Lo que va dentro de un ⓘ con una línea por opción (sólo `<span>`, nunca `<p>`). */
function Lista({ textos, nota }: { textos: Record<string, string>; nota?: string }) {
  return (
    <span className="flex flex-col gap-1.5">
      {Object.entries(textos).map(([k, v]) => (
        <span key={k}>
          <strong>{k}:</strong> {v}
        </span>
      ))}
      {nota ? <span className="text-[var(--text-secondary)]">{nota}</span> : null}
    </span>
  );
}
