"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Phone, Mail, Lock, LogOut, Loader2, AlertTriangle, Save,
} from "@buleje/design-system/icons";
import {
  MotoIcon, PinIcon, StarBadge, CheckBadge, PackageIcon,
} from "@/components/delivery/icons";

interface Me {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  zone: string;
  vehicleType: string;
  rating: number;
  acceptanceRate: number;
  totalOffers: number;
  totalAccepted: number;
  isOnline: boolean;
}

function csrf(): string {
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

export default function PerfilPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/delivery/me/me", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          router.push("/delivery-app/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (data?.partner) setMe(data.partner);
        else setError("No pudimos cargar tu perfil.");
      })
      .catch(() => setError("Error de red."))
      .finally(() => setLoading(false));
  }, [router]);

  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (newPwd.length < 6) {
      setPwdMsg({ type: "error", text: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    setPwdLoading(true);
    try {
      const res = await fetch("/api/delivery/me/password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwdMsg({ type: "error", text: data.error ?? "No pudimos cambiar la contraseña." });
        return;
      }
      setPwdMsg({ type: "ok", text: "Contraseña actualizada." });
      setCurrentPwd("");
      setNewPwd("");
    } catch {
      setPwdMsg({ type: "error", text: "Error de red." });
    } finally {
      setPwdLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/delivery/me/online", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ isOnline: false }),
      });
    } catch { /* noop */ }
    document.cookie = "buleje-partner-sess=; Max-Age=0; path=/";
    router.push("/delivery-app/login");
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (!me) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-[var(--brand-secondary)]" />
          <p className="mt-3 text-base text-[var(--text-secondary)]">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-6 lg:py-10 space-y-6">
      {/* Hero perfil */}
      <header className="rounded-3xl border-2 border-[var(--rule-base)] bg-gradient-to-br from-[var(--accent-soft)] via-[var(--surface-raised)] to-[var(--surface-raised)] p-5 lg:p-7 flex items-center gap-4 lg:gap-6">
        <div className="h-16 w-16 lg:h-20 lg:w-20 rounded-3xl bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
          <MotoIcon className="h-9 w-9 lg:h-11 lg:w-11" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs lg:text-sm font-extrabold uppercase tracking-wider text-[var(--accent)]">
            Repartidor Buleje
          </p>
          <h1 className="mt-1 text-2xl lg:text-3xl font-extrabold text-[var(--text-primary)] truncate">
            {me.name}
          </h1>
          <p className="text-sm lg:text-base font-semibold text-[var(--text-secondary)]">
            Zona {me.zone} · {me.vehicleType}
          </p>
        </div>
      </header>

      {/* Stats grid */}
      <section className="grid grid-cols-3 gap-3 lg:gap-4">
        <Stat
          icon={<StarBadge className="h-6 w-6 text-[var(--brand-secondary)]" />}
          value={me.rating.toFixed(1)}
          label="Rating"
          tone="amber"
        />
        <Stat
          icon={<CheckBadge className="h-6 w-6 text-[var(--data-success-500)]" />}
          value={`${Math.round(me.acceptanceRate * 100)}%`}
          label="Aceptación"
          tone="success"
        />
        <Stat
          icon={<PackageIcon className="h-6 w-6 text-[var(--accent)]" />}
          value={String(me.totalAccepted)}
          label="Pedidos"
          tone="accent"
        />
      </section>

      {/* Two-col en desktop: datos + password */}
      <div className="grid lg:grid-cols-2 gap-5 lg:gap-6">
        <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 lg:p-6">
          <h2 className="text-base lg:text-lg font-extrabold text-[var(--text-primary)] mb-4">
            Datos personales
          </h2>
          <Field icon={<Phone className="h-5 w-5" strokeWidth={2.25} />} label="WhatsApp" value={me.phone} />
          <Field icon={<Mail className="h-5 w-5" strokeWidth={2.25} />} label="Email" value={me.email ?? "—"} />
          <Field icon={<PinIcon className="h-5 w-5" />} label="Zona" value={me.zone} />
          <Field icon={<MotoIcon className="h-5 w-5" />} label="Vehículo" value={me.vehicleType} last />
        </div>

        <form
          onSubmit={handleChangePwd}
          className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 lg:p-6"
        >
          <h2 className="text-base lg:text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2 mb-4">
            <Lock className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.25} />
            Cambiar contraseña
          </h2>
          <input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            placeholder="Contraseña actual"
            required
            autoComplete="current-password"
            className="w-full h-12 mb-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none transition-colors"
          />
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="Nueva contraseña (mín. 6)"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full h-12 mb-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none transition-colors"
          />
          {pwdMsg && (
            <div
              className={`rounded-2xl px-4 py-3 text-sm font-bold mb-3 border-2 ${
                pwdMsg.type === "ok"
                  ? "bg-[var(--data-success-500)]/10 border-[var(--data-success-500)]/30 text-[var(--data-success-500)]"
                  : "bg-[var(--brand-danger)]/10 border-[var(--brand-danger)]/30 text-[var(--brand-danger)]"
              }`}
            >
              {pwdMsg.text}
            </div>
          )}
          <button
            type="submit"
            disabled={pwdLoading}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white shadow-md shadow-[var(--accent)]/20 disabled:opacity-50"
          >
            {pwdLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" strokeWidth={2.25} />}
            Guardar contraseña
          </button>
        </form>
      </div>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="w-full lg:w-auto lg:px-8 h-12 inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[var(--brand-danger)]/30 bg-[var(--surface-raised)] text-base font-extrabold text-[var(--brand-danger)] hover:bg-[var(--brand-danger)]/10 transition-colors"
      >
        <LogOut className="h-5 w-5" strokeWidth={2.25} />
        Cerrar sesión
      </button>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 py-3 ${!last ? "border-b border-[var(--rule-base)]" : ""}`}>
      <span className="h-10 w-10 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
        <p className="text-base font-bold text-[var(--text-primary)] truncate">{value}</p>
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: "accent" | "success" | "amber";
}) {
  const ring: Record<typeof tone, string> = {
    accent: "bg-[var(--accent-soft)]",
    success: "bg-[var(--data-success-500)]/10",
    amber: "bg-[var(--brand-secondary)]/10",
  } as const;
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 lg:p-5 text-center">
      <div className={`mx-auto h-11 w-11 rounded-xl flex items-center justify-center mb-2 ${ring[tone]}`}>
        {icon}
      </div>
      <div className="text-2xl lg:text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-xs lg:text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}
