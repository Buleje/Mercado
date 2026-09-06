"use client";

import dynamic from "next/dynamic";
import { Gauge, Shield, Activity } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub de Sistema (consolidación 3→1) ───────────────────────────────────────
// Antes: 3 entradas top-level sueltas (rendimiento, auditoria, colas). Ahora 1
// centro técnico con 3 sub-tabs. El header "Sistema" se muestra SIEMPRE arriba
// (coherencia admin, Brandon 2026-06-19) — los sub-módulos con header propio
// quedan debajo dando jerarquía "Sistema → <sección>".
const RendimientoModule = dynamic(() => import("@/components/admin/unified/RendimientoModule"), { loading: S });
const AuditTab          = dynamic(() => import("@/components/admin/tabs/AuditTab"),             { loading: S });
const ColasTab          = dynamic(() => import("@/components/admin/ColasTab"),                  { loading: S });

const MODULE_ID = "sistema-hub";

const TABS = [
  { id: "rendimiento", label: "Rendimiento", icon: Gauge },
  { id: "auditoria",   label: "Auditoría",   icon: Shield },
  { id: "colas",       label: "Colas",       icon: Activity },
];

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);

export default function SistemaHubModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: así se comparte por link, el botón «atrás»
  // la recorre y el buscador global puede mandar directo acá. `initialTab` gana
  // cuando el módulo se abre desde un tab alias (ver useVistaModulo).
  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0], initialTab);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        eyebrow="Sistema · Técnico"
        title="Sistema"
        description="Salud técnica, registro de actividad y colas de trabajo."
        icon={Gauge}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "rendimiento" && <RendimientoModule />}
        {sub === "auditoria" && <AuditTab />}
        {sub === "colas" && <ColasTab />}
      </AdminTabBar>
    </div>
  );
}
