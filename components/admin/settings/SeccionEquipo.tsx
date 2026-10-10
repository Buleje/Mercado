import dynamic from "next/dynamic";
import { KeepAliveSwitch } from "@/components/shared/KeepAliveSwitch";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { AlertTriangle, Key, ChevronRight } from "@buleje/design-system/icons";
import { Toggle, SectionCard } from "@/components/admin/settings/campos";
import { LINK_A_OTRA_PANTALLA } from "@/components/admin/settings/enlaces";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";

const TeamTab = dynamic(() => import("@/components/admin/TeamTab"));
const LoginDevicesCard = dynamic(() => import("@/components/admin/security/LoginDevicesCard"), { ssr: false });

export function SeccionEquipo({ aj, onNavigateTab }: { aj: AjustesEstado; onNavigateTab?: (tab: string) => void }) {
  const { bypassLogin, setBypassLogin, cargaFallida } = aj;
  return (
    <div className="space-y-6">
      <TeamTab />

      <SectionCard title="Tu acceso" desc="Tu contraseña, la sesión y desde dónde entraste">
        <button type="button" onClick={() => onNavigateTab?.("mi-perfil")} className={LINK_A_OTRA_PANTALLA}>
          <Key className="h-4 w-4 text-primary shrink-0" />
          <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-primary)]">Cambiar mi contraseña</span>
          <span className="text-xs text-[var(--text-secondary)]">en Mi perfil</span>
          <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        </button>
        {/* Mantener sesión activa — no volver al login mientras se trabaja */}
        <KeepAliveSwitch />
        {!cargaFallida && <Toggle enabled={bypassLogin} onChange={async v => {
          const previous = bypassLogin;
          setBypassLogin(v);
          try {
            const res = await fetch("/api/settings", { method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ adminBypassLogin: v }) });
            if (!res.ok) {
              setBypassLogin(previous);
              toast.error(`No se pudo cambiar el acceso sin login (error ${res.status})`);
            }
          } catch (err) {
            setBypassLogin(previous);
            console.warn("[SettingsModule] bypass login falló", err);
            toast.error("No se pudo cambiar el acceso sin login — revisa tu conexión.");
          }
        }} label="Acceso sin login" desc="Permite entrar al panel sin credenciales" danger />}
        {bypassLogin && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-medium">RIESGO DE SEGURIDAD: Cualquier persona podrá acceder al panel de administración.</p>
          </div>
        )}
        {/* Dispositivos y accesos (#3a) — desde dónde entró el admin */}
        <LoginDevicesCard embebido />
      </SectionCard>
    </div>
  );
}
