"use client";

import { useState, useEffect } from "react";
import { Monitor, Smartphone, MapPin, Clock, ShieldCheck } from "@buleje/design-system/icons";
import { logger } from "@/lib/logger";

/**
 * LoginDevicesCard — "Dispositivos y accesos" (Configuración → Seguridad).
 * Muestra desde dónde ingresó el admin: último acceso + lista de dispositivos
 * conocidos. La data la puebla `alertNewDeviceLogin` en cada login. Read-only.
 */

type Device = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

/** Parse liviano del user-agent → "Chrome · Windows". */
function friendlyDevice(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Dispositivo desconocido", mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  let browser = "Navegador";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "Mac";
  else if (/Linux/.test(ua)) os = "Linux";
  return { label: os ? `${browser} · ${os}` : browser, mobile };
}

/** "hace 2 h", "hace 3 días", etc. */
function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} día${d === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
}

export default function LoginDevicesCard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/security/devices", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.devices) setDevices(data.devices);
      })
      .catch((err) => logger.error("[LoginDevicesCard] load failed", { error: String(err) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />;
  }
  if (devices.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-[var(--accent)]" aria-hidden />
        <h3 className="text-base font-bold text-[var(--text-primary)]">Dispositivos y accesos</h3>
      </div>
      <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
        Desde dónde entraste a tu panel. Si ves un acceso que no reconocés, cambiá tu contraseña.
      </p>

      <ul className="mt-4 space-y-2">
        {devices.map((d, i) => {
          const dev = friendlyDevice(d.userAgent);
          const Icon = dev.mobile ? Smartphone : Monitor;
          return (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)]">
                <Icon className="h-4.5 w-4.5 text-[var(--text-secondary)]" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  {dev.label}
                  {i === 0 && (
                    <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">
                      Este dispositivo
                    </span>
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden />
                    {i === 0 ? "Ahora" : relative(d.lastSeenAt)}
                  </span>
                  {d.ip && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {d.ip}
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
