import dynamic from "next/dynamic";
import { KeepAliveSwitch } from "@/components/shared/KeepAliveSwitch";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { AlertTriangle, Key, ChevronRight } from "@buleje/design-system/icons";
import { Toggle, SectionCard } from "@/components/admin/settings/campos";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";

const TeamTab = dynamic(() => import("@/components/admin/TeamTab"));
const LoginDevicesCard = dynamic(() => import("@/components/admin/security/LoginDevicesCard"), { ssr: false });

export function SeccionEquipo({ aj, onNavigateTab }: { aj: AjustesEstado; onNavigateTab?: (tab: string) => void }) {
  const { bypassLogin, setBypassLogin, cargaFallida } = aj;
  return (
    <div className="space-y-4">
      <TeamTab />

      <SectionCard
        title="Tu acceso"
        desc="Tu contraseña, la sesión y desde dónde entraste"
        accion={
          /* La puerta a Mi perfil desde Configuración (salió de la barra
             lateral; la otra es el menú del avatar). En la fila del título. */
          <button type="button" onClick={() => onNavigateTab?.("mi-perfil")} title="Tus datos y tu contraseña, en Mi perfil" className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--surface-sunken)]">
            <Key className="h-4 w-4" aria-hidden /> Tu contraseña <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        }
      >
        {/* Mantener sesión activa y acceso sin login, lado a lado a lo ancho. */}
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
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
        </div>
        {bypassLogin && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 text-[var(--data-error-ink)] shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm text-[var(--data-error-ink)] font-medium">Riesgo de seguridad: cualquier persona puede entrar a tu panel.</p>
          </div>
        )}
        {/* Dispositivos y accesos (#3a) — desde dónde entró el admin */}
        <LoginDevicesCard embebido />
      </SectionCard>
    </div>
  );
}
