import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { Palmtree } from "@buleje/design-system/icons";
import { FieldLabel, TextInput, Toggle, SectionCard } from "@/components/admin/settings/campos";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";

export function SeccionTienda({ aj }: { aj: AjustesEstado }) {
  const { maintenanceMode, setMaintenanceMode, maintenanceMsg, setMaintenanceMsg, marcarGuardado } = aj;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {/* Maintenance mode */}
      <SectionCard title="Modo vacaciones / mantenimiento" desc="Bloquea compras mostrando un banner">
        <Toggle enabled={maintenanceMode} onChange={async v => {
          const previous = maintenanceMode;
          const previousMsg = maintenanceMsg;
          setMaintenanceMode(v);
          const msg = v && !maintenanceMsg ? "Estamos de vacaciones. ¡Volvemos pronto!" : maintenanceMsg;
          if (v && !maintenanceMsg) setMaintenanceMsg(msg);
          try {
            const res = await fetch("/api/settings", { method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ maintenanceMode: v, maintenanceMessage: msg }) });
            if (!res.ok) {
              setMaintenanceMode(previous);
              setMaintenanceMsg(previousMsg);
              toast.error(`No se pudo cambiar el modo mantenimiento (error ${res.status})`);
            } else {
              // El mensaje ya quedó guardado con el interruptor: no es un «cambio sin guardar».
              marcarGuardado({ maintenanceMessage: msg });
            }
          } catch (err) {
            setMaintenanceMode(previous);
            setMaintenanceMsg(previousMsg);
            console.warn("[SettingsModule] modo mantenimiento falló", err);
            toast.error("No se pudo cambiar el modo mantenimiento — revisa tu conexión.");
          }
        }} label={maintenanceMode ? "Modo activo — tienda bloqueada" : "Desactivado"} desc="Los clientes ven el catálogo pero no pueden comprar" />
        {maintenanceMode && (
          <div className="space-y-2">
            <FieldLabel htmlFor="settings-maintenanceMsg">Mensaje para clientes</FieldLabel>
            <TextInput id="settings-maintenanceMsg" value={maintenanceMsg} onChange={setMaintenanceMsg} placeholder="Ej: Estamos de vacaciones. Volvemos el lunes." />
            {/* Texto semántico chico en -ink: el coral -500 sobre su fondo no llegaba a 4,5:1. */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)]">
              <Palmtree className="h-4 w-4 text-[var(--data-warning-ink)] shrink-0" aria-hidden />
              <p className="text-sm text-[var(--data-warning-ink)] font-medium flex-1">{maintenanceMsg || "Vista previa…"}</p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Colores, eslogan y secciones del inicio: los lee la tienda desde Mi tienda › Apariencia
          (medido 11-10: Configuración guardaba otro color y la tienda no lo mostraba). */}
      <SectionCard title="Apariencia de la tienda" desc="Colores, eslogan y secciones del inicio se editan en un solo lugar">
        <ul className="space-y-2 text-sm">
          <li><EnlacePanel href="/admin?tab=pagina-inicio&vista=apariencia&sub=colores">Editar colores en Mi tienda › Apariencia</EnlacePanel></li>
          <li><EnlacePanel href="/admin?tab=pagina-inicio&vista=apariencia&sub=identidad">Editar nombre y eslogan en Mi tienda › Apariencia</EnlacePanel></li>
          <li><EnlacePanel href="/admin?tab=pagina-inicio&vista=apariencia&sub=contacto">Secciones del inicio y contacto en Mi tienda › Apariencia</EnlacePanel></li>
        </ul>
      </SectionCard>

      </div>

    </div>
  );
}
