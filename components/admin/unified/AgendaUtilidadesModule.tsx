"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, StickyNote, Filter } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const SharedCalendarTab = dynamic(() => import("@/components/admin/SharedCalendarTab"), { loading: S });
const QuickNotesTab = dynamic(() => import("@/components/admin/QuickNotesTab"), { loading: S });
const SavedFiltersTab = dynamic(() => import("@/components/admin/SavedFiltersTab"), { loading: S });

const MODULE_ID = "agenda-utilidades";

const TABS = [
  { id: "calendario", label: "Calendario", icon: CalendarDays },
  { id: "notas", label: "Notas Rápidas", icon: StickyNote },
  { id: "filtros", label: "Filtros Guardados", icon: Filter },
];

export default function AgendaUtilidadesModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Agenda & Utilidades"
        description="Calendario compartido, notas rápidas y filtros guardados"
        icon={CalendarDays}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "calendario" && <SharedCalendarTab />}
      {sub === "notas" && <QuickNotesTab />}
      {sub === "filtros" && <SavedFiltersTab />}
    </div>
  );
}
