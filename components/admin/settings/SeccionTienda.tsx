import dynamic from "next/dynamic";
import { useTenant } from "@/contexts/tenant-context";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { Palmtree } from "@buleje/design-system/icons";
import { FieldLabel, TextInput, Toggle, SectionCard, SaveButton, Plegable } from "@/components/admin/settings/campos";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";

const StorefrontEditor = dynamic(() => import("@/components/admin/StorefrontEditor"), { ssr: false });

export function SeccionTienda({ aj }: { aj: AjustesEstado }) {
  const { businessName, maintenanceMode, setMaintenanceMode, maintenanceMsg, setMaintenanceMsg, primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, slogan, setSlogan, patch, saving, savedSection } = aj;
  const { branding } = useTenant();
  // Vista previa: el nombre del negocio, o el del tenant si todavía no lo escribiste.
  const nombreVisible = businessName.trim() || branding.name || "Tu tienda";
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
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
            <FieldLabel>Mensaje para clientes</FieldLabel>
            <TextInput value={maintenanceMsg} onChange={setMaintenanceMsg} placeholder="Ej: Estamos de vacaciones. Volvemos el lunes." />
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]">
              <Palmtree className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" aria-hidden />
              <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium flex-1">{maintenanceMsg || "Vista previa..."}</p>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Colores de marca" desc="Personaliza los colores de tu tienda">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel>Color primario</FieldLabel>
            <div className="flex items-center gap-2">
              <input aria-label="Color primario" type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-[var(--rule-base)] cursor-pointer" />
              <TextInput value={primaryColor} onChange={setPrimaryColor} mono />
            </div>
          </div>
          <div>
            <FieldLabel>Color secundario</FieldLabel>
            <div className="flex items-center gap-2">
              <input aria-label="Color secundario" type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-[var(--rule-base)] cursor-pointer" />
              <TextInput value={secondaryColor} onChange={setSecondaryColor} mono />
            </div>
          </div>
          <div className="sm:col-span-2"><FieldLabel>Slogan</FieldLabel><TextInput id="settings-slogan" value={slogan} onChange={setSlogan} placeholder="Productos frescos, precios justos" /></div>
        </div>
        {/* Live preview */}
        <div className="mt-4 p-4 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)]" style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${secondaryColor}15)` }}>
          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-2">Vista previa</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: primaryColor }}>{nombreVisible.slice(0, 1).toUpperCase()}</div>
            <div><p className="text-sm font-extrabold" style={{ color: primaryColor }}>{nombreVisible}</p><p className="text-xs" style={{ color: secondaryColor }}>{slogan || "Tu slogan"}</p></div>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: primaryColor }}>Primario</span>
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: secondaryColor }}>Secundario</span>
          </div>
        </div>
      </SectionCard>

      </div>

      <SaveButton saving={saving} saved={savedSection === "tienda"} label="Guardar colores y mensaje" onClick={() => patch({ primaryColor, secondaryColor, slogan, maintenanceMessage: maintenanceMsg })} />

      <Plegable clave="tienda-secciones-menu" titulo="Secciones y menú de la tienda" resumen="Qué bloques salen en el inicio de tu tienda y en qué orden">
        <StorefrontEditor />
      </Plegable>
    </div>
  );
}
