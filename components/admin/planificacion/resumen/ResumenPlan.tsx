"use client";

/**
 * Planificación › Resumen (ADR-497): cómo va el plan de un vistazo. En la
 * cabecera, cuánto está escrito; debajo las cifras (inversión, socios,
 * objetivos y papeles), lo que pide atención —cada aviso lleva a donde se
 * arregla— y el mapa de las secciones. Desde el «⋯», el plan impreso.
 */
import { useState } from "react";
import { CardTitle, StatCard } from "@buleje/design-system";
import { ArrowRight, FileCheck, MoreHorizontal, PiggyBank, Printer, Target, Users } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { usePlanEmpresa } from "@/hooks/use-plan-empresa";
import { estadoLicencia, llenadoGeneral, objetivoAtrasado, participacion, totalesInversion } from "@/lib/planificacion/calculos";
import type { SeccionPlan } from "@/lib/planificacion/secciones";
import { formatCurrency } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { plural } from "../empresa/campos-plan";
import { porciento } from "../socios/BarraParticipacion";
import { PlanImprimible } from "../imprimir/PlanImprimible";
import { DESTINO, avisosDelPlan } from "./avisos";
import { ListaAtencion } from "./ListaAtencion";
import { LlenadoSecciones } from "./LlenadoSecciones";

/* Socios e inversión se esconden a quien no los ve: la fila se ajusta a las cifras que quedan. */
const COLUMNAS: Record<number, string> = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };

type Enfasis = "neutral" | "warning" | "error";
interface Cifra {
  label: string;
  value: string;
  subValue?: string;
  emphasis: Enfasis;
}

/** La cifra que manda es el problema: si hay vencidas, se cuentan ésas (no el total en rojo). */
function cifraLicencias(total: number, vencidas: number, porVencer: number): Cifra {
  if (vencidas > 0) {
    const resto = porVencer > 0 ? ` · ${porVencer} por vencer` : "";
    return { label: vencidas === 1 ? "Licencia vencida" : "Licencias vencidas", value: String(vencidas), subValue: `de ${total}${resto}`, emphasis: "error" };
  }
  if (porVencer > 0) return { label: "Licencias por vencer", value: String(porVencer), subValue: `de ${total}`, emphasis: "warning" };
  return { label: "Licencias", value: String(total), subValue: total > 0 ? "Al día" : undefined, emphasis: "neutral" };
}

function cifraObjetivos(total: number, enCurso: number, atrasados: number): Cifra {
  if (atrasados > 0) {
    return { label: atrasados === 1 ? "Objetivo atrasado" : "Objetivos atrasados", value: String(atrasados), subValue: `${enCurso} en curso de ${total}`, emphasis: "error" };
  }
  return { label: "Objetivos en curso", value: String(enCurso), subValue: total > 0 ? "Ninguno atrasado" : undefined, emphasis: "neutral" };
}

interface Props {
  irA: (vista: string, params?: Readonly<Record<string, string>>) => void;
}

export function ResumenPlan({ irA }: Props) {
  const { datos } = usePlanEmpresa();
  const [imprimir, setImprimir] = useState(false);
  const hoy = limaDateKey();
  const general = llenadoGeneral(datos);
  const abrir = (s: SeccionPlan) => irA(DESTINO[s].vista, { sub: DESTINO[s].sub });
  const avisos = avisosDelPlan(datos, hoy);

  const licencias = datos.licencias?.items ?? [];
  const estados = licencias.map((l) => estadoLicencia(l, hoy).estado);
  const lic = cifraLicencias(licencias.length, estados.filter((e) => e === "vencida").length, estados.filter((e) => e === "por-vencer").length);
  const objetivos = datos.objetivos?.items ?? [];
  const obj = cifraObjetivos(
    objetivos.length,
    objetivos.filter((o) => o.estado === "en-curso").length,
    objetivos.filter((o) => objetivoAtrasado(o, hoy)).length,
  );
  const socios = datos.socios?.items;
  const inversion = datos.inversion ? totalesInversion(datos.inversion, socios ?? []) : null;
  const part = socios ? participacion(socios) : null;
  const columnas = COLUMNAS[2 + (inversion ? 1 : 0) + (socios ? 1 : 0)];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="mr-auto flex min-w-0 items-center gap-1.5">
          <CardTitle>Cómo va tu plan</CardTitle>
          <InfoTip
            what="El plan de tu empresa de un vistazo: cuánto está escrito, la plata, los objetivos y los papeles. Cada aviso te lleva a donde se arregla."
            affects="El porcentaje es el promedio de lo escrito en cada sección que puedes ver."
            example="Imprímelo entero desde el «⋯» para llevarlo al banco, a un socio o a un concurso."
          />
        </div>
        <div className="flex items-center gap-2" aria-label={`Plan escrito al ${general} %`}>
          <span className="block h-2 w-24 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
            <span
              className={cn("block h-full rounded-full", general >= 100 ? "bg-[var(--data-success-500)]" : "bg-[var(--accent)]")}
              style={{ width: `${general}%` }}
            />
          </span>
          <span className="text-sm whitespace-nowrap text-[var(--text-secondary)] tabular-nums">{general} % escrito</span>
        </div>
        <ActionMenu
          label="Más opciones"
          icon={MoreHorizontal}
          soloIcono
          size="md"
          actions={[
            {
              id: "imprimir",
              label: "Imprimir el plan",
              hint: "Todo el plan como documento, con tu membrete, para el banco o un socio",
              icon: Printer,
              onSelect: () => setImprimir(true),
            },
          ]}
        />
      </div>
      {general === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] p-6">
          <span className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
            Tu plan está en blanco: anota los datos de la empresa y avanza sección por sección.
          </span>
          <button type="button" className={button({ variant: "primary" })} onClick={() => abrir("ficha")}>
            Empieza por la ficha
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <>
          <div className={cn("grid grid-cols-2 gap-3", columnas)}>
            {inversion ? (
              <StatCard
                density="compact"
                label="Inversión inicial"
                value={formatCurrency(inversion.total)}
                subValue={inversion.mesesRecupero ? `Se recupera en ${plural(inversion.mesesRecupero, "mes", "meses")}` : undefined}
                icon={PiggyBank}
              />
            ) : null}
            {socios && part ? (
              <StatCard
                density="compact"
                label="Socios"
                value={String(socios.length)}
                subValue={socios.length > 0 ? (part.cuadra ? "Suman 100 %" : `Suman ${porciento(part.total)}`) : undefined}
                emphasis={part.cuadra ? "neutral" : "warning"}
                icon={Users}
              />
            ) : null}
            <StatCard density="compact" {...obj} icon={Target} />
            <StatCard density="compact" {...lic} icon={FileCheck} />
          </div>
          <ListaAtencion avisos={avisos} onIr={(a) => abrir(a.seccion)} />
        </>
      )}
      <LlenadoSecciones plan={datos} general={general} onAbrir={abrir} />
      {imprimir ? <PlanImprimible abierto onCerrar={() => setImprimir(false)} /> : null}
    </div>
  );
}
