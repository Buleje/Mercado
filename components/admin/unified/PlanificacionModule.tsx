"use client";

/**
 * PlanificacionModule — `?tab=planificacion` (ADR-497): el plan de la empresa.
 *
 * Brandon (16-10): «información del negocio… nombre, razón social, inversión
 * inicial, socios, croquis, tipo de negocio, estrategias, FODA… políticas,
 * atención». Siete vistas en `?vista=`; las que tienen más de un bloque los
 * separan con `BarraDeSecciones` en `?sub=`, y cada una recuerda el suyo
 * (al salir de una vista se borra su `?sub=`: la siguiente abre en el que
 * dejaste la última vez).
 *
 * Todo el plan llega en UNA llamada (`PlanEmpresaProvider`) y cada bloque se
 * guarda solo. Socios e inversión son plata y documentos: si el rol no los ve,
 * la vista ni aparece.
 */
import dynamic from "next/dynamic";
import { ErrorAlert } from "@buleje/design-system";
import {
  Briefcase,
  Building2,
  Compass,
  Grid3x3,
  LayoutDashboard,
  RefreshCw,
  ScrollText,
  Target,
  Users,
} from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { button } from "@/components/ui-system/button-variants";
import { PlanEmpresaProvider, usePlanEmpresa } from "@/hooks/use-plan-empresa";
import { useVistaModulo, type ParamsDeVista } from "@/hooks/use-vista-modulo";

function Cargando() {
  return (
    <div role="status" aria-label="Cargando" className="flex justify-center py-12">
      <LoadingSpinner size={32} />
    </div>
  );
}

const ResumenPlan = dynamic(() => import("@/components/admin/planificacion/resumen/ResumenPlan").then((m) => m.ResumenPlan), {
  ssr: false,
  loading: Cargando,
});
const EmpresaVista = dynamic(() => import("@/components/admin/planificacion/empresa/EmpresaVista").then((m) => m.EmpresaVista), {
  ssr: false,
  loading: Cargando,
});
const SociosInversionVista = dynamic(
  () => import("@/components/admin/planificacion/socios/SociosInversionVista").then((m) => m.SociosInversionVista),
  { ssr: false, loading: Cargando },
);
const FodaEstrategiasVista = dynamic(
  () => import("@/components/admin/planificacion/foda/FodaEstrategiasVista").then((m) => m.FodaEstrategiasVista),
  { ssr: false, loading: Cargando },
);
const ObjetivosVista = dynamic(() => import("@/components/admin/planificacion/objetivos/ObjetivosVista").then((m) => m.ObjetivosVista), {
  ssr: false,
  loading: Cargando,
});
const OrganizacionVista = dynamic(
  () => import("@/components/admin/planificacion/organizacion/OrganizacionVista").then((m) => m.OrganizacionVista),
  { ssr: false, loading: Cargando },
);
const PoliticasVista = dynamic(() => import("@/components/admin/planificacion/politicas/PoliticasVista").then((m) => m.PoliticasVista), {
  ssr: false,
  loading: Cargando,
});

const MODULE_ID = "planificacion";

export type VistaPlan = "resumen" | "empresa" | "socios" | "foda" | "objetivos" | "organizacion" | "politicas";
const VISTAS: readonly VistaPlan[] = ["resumen", "empresa", "socios", "foda", "objetivos", "organizacion", "politicas"];

/** Al salir de una vista con bloques, su `?sub=` se va con ella. */
const PARAMS_DE_VISTA: ParamsDeVista<VistaPlan> = {
  empresa: ["sub"],
  socios: ["sub"],
  foda: ["sub"],
  objetivos: ["sub"],
  organizacion: ["sub"],
  politicas: ["sub"],
};

const TABS = [
  { id: "resumen", label: "Resumen", icon: LayoutDashboard },
  { id: "empresa", label: "Empresa", icon: Building2 },
  { id: "socios", label: "Socios e inversión", shortLabel: "Socios", icon: Users },
  { id: "foda", label: "FODA y estrategias", shortLabel: "FODA", icon: Grid3x3 },
  { id: "objetivos", label: "Objetivos y plan", shortLabel: "Objetivos", icon: Target },
  { id: "organizacion", label: "Organización", icon: Briefcase },
  { id: "politicas", label: "Políticas y atención", shortLabel: "Políticas", icon: ScrollText },
];

export default function PlanificacionModule() {
  return (
    <PlanEmpresaProvider>
      <Planificacion />
    </PlanEmpresaProvider>
  );
}

function Planificacion() {
  const { cargando, error, recargar, ocultas } = usePlanEmpresa();
  const { vista, irA } = useVistaModulo<VistaPlan>(MODULE_ID, VISTAS, "resumen", undefined, { paramsDeVista: PARAMS_DE_VISTA });
  const sinSocios = ocultas.includes("socios") && ocultas.includes("inversion");
  const tabs = sinSocios ? TABS.filter((t) => t.id !== "socios") : TABS;
  /* Un enlace viejo a Socios con un rol que no la ve cae en el Resumen. */
  const actual: VistaPlan = sinSocios && vista === "socios" ? "resumen" : vista;

  return (
    <div className="space-y-4">
      <AdminTabBar
        heading={{
          title: "Planificación",
          icon: Compass,
          description: (
            <span>
              El plan de tu empresa en un solo lugar: la ficha y los papeles, socios e inversión, FODA y estrategias, objetivos,
              organigrama y espacios, y las políticas de atención. Se guarda solo mientras escribes y puedes imprimirlo entero
              desde el Resumen.
            </span>
          ),
        }}
        tabs={tabs}
        activeTab={actual}
        onTabChange={(id) => irA(id)}
        moduleId={MODULE_ID}
      >
        {cargando ? (
          <Cargando />
        ) : error ? (
          <ErrorAlert
            title="No se pudo leer el plan"
            description={error}
            action={
              <button type="button" className={button({ variant: "secondary" })} onClick={recargar}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Reintentar
              </button>
            }
          />
        ) : (
          <div>
            {actual === "resumen" && <ResumenPlan irA={irA} />}
            {actual === "empresa" && <EmpresaVista />}
            {actual === "socios" && <SociosInversionVista />}
            {actual === "foda" && <FodaEstrategiasVista />}
            {actual === "objetivos" && <ObjetivosVista />}
            {actual === "organizacion" && <OrganizacionVista />}
            {actual === "politicas" && <PoliticasVista />}
          </div>
        )}
      </AdminTabBar>
    </div>
  );
}
