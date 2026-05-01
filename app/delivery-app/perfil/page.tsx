"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User, Phone, Mail, Lock, Star, CheckCircle2, Bike,
  LogOut, Loader2, AlertTriangle, Save, MapPin,
} from "@buleje/design-system/icons";

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

  // Password change
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
    } catch {
      // noop — logout sigue
    }
    // Borrar cookie partner.
    document.cookie = "buleje-partner-sess=; Max-Age=0; path=/";
    router.push("/delivery-app/login");
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (!me) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] px-4">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-amber-500" />
          <p className="mt-3 text-[var(--text-secondary)]">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      <header className="sticky top-0 z-30 border-b border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur px-4 py-3">
        <h1 className="font-extrabold text-[var(--text-primary)] flex items-center gap-2">
          <User className="h-5 w-5 text-[var(--accent)]" />
          Mi perfil
        </h1>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Info personal */}
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Datos personales
          </h2>
          <Field icon={<User className="h-4 w-4" />} label="Nombre" value={me.name} />
          <Field icon={<Phone className="h-4 w-4" />} label="WhatsApp" value={me.phone} />
          <Field icon={<Mail className="h-4 w-4" />} label="Email" value={me.email ?? "—"} />
          <Field icon={<MapPin className="h-4 w-4" />} label="Zona" value={me.zone} />
          <Field icon={<Bike className="h-4 w-4" />} label="Vehículo" value={me.vehicleType} last />
        </div>

        {/* Stats */}
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Tu rendimiento
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <StatBox icon={<Star className="h-4 w-4 text-amber-500" />} value={me.rating.toFixed(1)} label="Rating" />
            <StatBox icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} value={`${Math.round(me.acceptanceRate * 100)}%`} label="Aceptación" />
            <StatBox icon={<Bike className="h-4 w-4 text-[var(--accent)]" />} value={String(me.totalAccepted)} label="Pedidos" />
          </div>
        </div>

        {/* Cambio de contraseña */}
        <form onSubmit={handleChangePwd} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            <Lock className="inline h-4 w-4 mr-1.5" />
            Cambiar contraseña
          </h2>
          <input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            placeholder="Contraseña actual"
            required
            autoComplete="current-password"
            className="w-full h-12 mb-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
          />
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="Nueva contraseña (min 6)"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full h-12 mb-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
          />
          {pwdMsg && (
            <div className={`rounded-xl px-4 py-3 text-sm font-semibold mb-3 ${
              pwdMsg.type === "ok"
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
            }`}>
              {pwdMsg.text}
            </div>
          )}
          <button
            type="submit"
            disabled={pwdLoading}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-extrabold text-white disabled:opacity-50"
          >
            {pwdLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar contraseña
          </button>
        </form>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-red-300 dark:border-red-800 bg-[var(--surface-raised)] text-base font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}

function Field({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${!last ? "border-b border-[var(--rule-base)]" : ""}`}>
      <span className="text-[var(--text-tertiary)]">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
        <p className="text-base font-semibold text-[var(--text-primary)] truncate">{value}</p>
      </div>
    </div>
  );
}

function StatBox({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 text-center">
      <div className="flex items-center justify-center mb-1">{icon}</div>
      <div className="text-lg font-extrabold text-[var(--text-primary)]">{value}</div>
      <div className="text-xs font-semibold text-[var(--text-tertiary)]">{label}</div>
    </div>
  );
}
