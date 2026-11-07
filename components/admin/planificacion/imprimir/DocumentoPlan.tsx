/**
 * El plan de la empresa como documento (ADR-497): membrete con logo, la fecha
 * y una sección numerada por cada parte elegida. Es el mismo árbol en la
 * vista previa del modal y en la hoja impresa.
 */
import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { NOMBRE_SECCION, type DatosPlan, type PlanEmpresaRespuesta, type SeccionPlan } from "@/lib/planificacion/secciones";
import { FichaDoc, IdentidadDoc, InversionDoc, LicenciasDoc, LienzoDoc, SociosDoc } from "./partes-empresa";
import { EspaciosDoc, EstrategiasDoc, FodaDoc, ObjetivosDoc, OrganizacionDoc, PoliticasDoc } from "./partes-estrategia";
import { SeccionDoc, fechaDoc } from "./piezas-doc";

type Membrete = PlanEmpresaRespuesta["membrete"];

function contenido(s: SeccionPlan, p: Partial<DatosPlan>, hoy: string): ReactNode {
  switch (s) {
    case "ficha":
      return p.ficha ? <FichaDoc d={p.ficha} /> : null;
    case "identidad":
      return p.identidad ? <IdentidadDoc d={p.identidad} /> : null;
    case "lienzo":
      return p.lienzo ? <LienzoDoc d={p.lienzo} /> : null;
    case "licencias":
      return p.licencias ? <LicenciasDoc d={p.licencias} hoy={hoy} /> : null;
    case "socios":
      return p.socios ? <SociosDoc d={p.socios} /> : null;
    case "inversion":
      return p.inversion ? <InversionDoc d={p.inversion} socios={p.socios?.items ?? []} hoy={hoy} /> : null;
    case "foda":
      return p.foda ? <FodaDoc d={p.foda} /> : null;
    case "estrategias":
      return p.estrategias ? <EstrategiasDoc d={p.estrategias} /> : null;
    case "objetivos":
      return p.objetivos ? <ObjetivosDoc d={p.objetivos} /> : null;
    case "organizacion":
      return p.organizacion ? <OrganizacionDoc d={p.organizacion} /> : null;
    case "espacios":
      return p.espacios ? <EspaciosDoc d={p.espacios} /> : null;
    case "politicas":
      return p.politicas ? <PoliticasDoc d={p.politicas} /> : null;
  }
}

interface Props {
  plan: Partial<DatosPlan>;
  membrete: Membrete | null;
  hoy: string;
  /** Las secciones a imprimir, en el orden del plan. */
  secciones: readonly SeccionPlan[];
}

export function DocumentoPlan({ plan, membrete, hoy, secciones }: Props) {
  const nombre = membrete?.nombre || plan.ficha?.nombreComercial || plan.ficha?.razonSocial || "Tu empresa";
  const linea = [membrete?.ruc ? `RUC ${membrete.ruc}` : "", membrete?.direccion ?? "", membrete?.telefono ?? ""].filter(Boolean).join(" · ");

  return (
    <article className="space-y-5 text-[var(--text-primary)]">
      <header className="flex items-start gap-4 border-b border-[var(--rule-strong)] pb-4">
        {membrete?.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- el logo del membrete se imprime tal cual */
          <img src={membrete.logoUrl} alt={`Logo de ${nombre}`} className="h-16 w-16 shrink-0 object-contain" />
        ) : null}
        <div className="min-w-0 flex-1">
          <SectionTitle as="h1">{nombre}</SectionTitle>
          {linea ? <span className="block text-sm text-[var(--text-secondary)]">{linea}</span> : null}
        </div>
        <div className="shrink-0 text-right text-sm">
          <span className="block font-semibold">Plan de empresa</span>
          <span className="block text-[var(--text-secondary)]">{fechaDoc(hoy)}</span>
        </div>
      </header>
      {secciones.map((s, i) => (
        <SeccionDoc key={s} numero={i + 1} titulo={NOMBRE_SECCION[s]}>
          {contenido(s, plan, hoy)}
        </SeccionDoc>
      ))}
      <footer className="border-t border-[var(--rule-base)] pt-2 text-sm text-[var(--text-secondary)]">
        Plan de {nombre}, al {fechaDoc(hoy)}.
      </footer>
    </article>
  );
}
