"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowRight, Store, Crown } from "@buleje/design-system/icons";
import { HeroDeliveryIllustration, MotoIcon } from "@/components/delivery/icons";
import { cn } from "@/lib/utils";

export default function DeliveryLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const csrf = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1];
      const res = await fetch("/api/delivery/me/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ phone: phone.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos iniciar sesión");
        return;
      }
      router.push("/delivery-app");
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] grid lg:grid-cols-2">
      {/* ── Hero pane (solo desktop) ──────────────────────── */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-[var(--accent)] to-[var(--brand-primary-light)] text-white relative overflow-hidden">
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute top-10 right-10 h-64 w-64 rounded-full bg-white/5 blur-2xl pointer-events-none" />

        <div className="flex items-center gap-3 relative">
          <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <MotoIcon className="h-7 w-7" />
          </div>
          <div>
            <p className="text-lg font-extrabold leading-tight">Buleje Delivery</p>
            <p className="text-sm text-white/80">Pucallpa · Perú</p>
          </div>
        </div>

        <div className="relative">
          <div className="text-white/90">
            <HeroDeliveryIllustration className="h-64 w-auto" />
          </div>
          <h2 className="mt-8 text-4xl font-extrabold leading-tight">
            Maneja tu tiempo,<br />gana más por viaje.
          </h2>
          <p className="mt-4 text-lg text-white/85 max-w-md leading-relaxed">
            Recibe pedidos cerca de ti, navega con un toque y cobra tu propina al instante.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 relative">
          <Highlight value="2 km" label="Promedio por viaje" />
          <Highlight value="S/ 6" label="Tarifa base" />
          <Highlight value="24/7" label="Soporte WhatsApp" />
        </div>
      </aside>

      {/* ── Form pane ──────────────────────────────────────── */}
      <section className="flex items-center justify-center px-4 py-10 lg:px-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] mb-4">
              <MotoIcon className="h-9 w-9" />
            </div>
            <h1 className="text-3xl font-extrabold text-[var(--text-primary)]">
              Buleje Delivery
            </h1>
            <p className="mt-2 text-base text-[var(--text-secondary)]">
              Ingresa con tu teléfono para empezar a recibir pedidos
            </p>
          </div>

          <div className="hidden lg:block mb-8">
            <h1 className="text-4xl font-extrabold text-[var(--text-primary)]">
              Iniciar sesión
            </h1>
            <p className="mt-2 text-base text-[var(--text-secondary)]">
              Ingresa con el número de WhatsApp con el que te inscribiste.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 lg:p-8"
          >
            <div>
              <label htmlFor="login-phone" className="mb-2 block text-sm font-extrabold text-[var(--text-primary)]">
                Tu número de WhatsApp
              </label>
              <input
                id="login-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9XX XXX XXX"
                autoComplete="tel"
                className="w-full h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] outline-none transition-colors"
              />
            </div>

            <div>
              <label htmlFor="login-pwd" className="mb-2 block text-sm font-extrabold text-[var(--text-primary)]">
                Contraseña
              </label>
              <input
                id="login-pwd"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                autoComplete="current-password"
                className="w-full h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] outline-none transition-colors"
              />
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                Si es tu primera vez, contacta a tu admin para obtener acceso.
              </p>
            </div>

            {error && (
              <div role="alert" className="rounded-2xl bg-[var(--brand-danger)]/10 border-2 border-[var(--brand-danger)]/30 px-4 py-3 text-sm font-bold text-[var(--brand-danger)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white shadow-lg shadow-[var(--accent)]/25 transition-all hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
              ) : (
                <>
                  Entrar
                  <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            ¿Aún no eres repartidor?{" "}
            <Link href="/marketplace/repartidor" className="font-extrabold text-[var(--accent)]">
              Inscríbete aquí
            </Link>
          </p>

          {/* Switches a otros paneles */}
          <div className="mt-8 pt-6 border-t border-[var(--rule-soft)] space-y-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
              ¿Buscás otro panel?
            </p>
            <DeliverySwitchChip
              href="/admin/login"
              icon={<Store className="h-4 w-4" strokeWidth={2} />}
              eyebrow="Negocio"
              title="Panel de la bodega"
              accent="teal"
            />
            <DeliverySwitchChip
              href="/superadmin/login"
              icon={<Crown className="h-4 w-4" strokeWidth={2} />}
              eyebrow="Plataforma"
              title="Acceso Superadmin"
              accent="violet"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function DeliverySwitchChip({
  href, icon, eyebrow, title, accent,
}: {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  accent: "teal" | "violet" | "orange";
}) {
  const styles =
    accent === "violet" ? "bg-[var(--brand-purple)]/10 border-[var(--brand-purple)]/30 text-[var(--brand-purple)]" :
    accent === "orange" ? "bg-[var(--brand-secondary)]/10 border-[var(--brand-secondary)]/30 text-[var(--brand-secondary)]" :
    "bg-[var(--accent-soft)] border-[var(--accent)]/30 text-[var(--accent)]";

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[var(--surface-sunken)] hover:bg-[var(--surface-sunken)]/60 border border-transparent hover:border-[var(--rule-base)] transition-all group"
    >
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg border", styles)}>
          {icon}
        </span>
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            {eyebrow}
          </p>
          <p className="text-sm font-extrabold text-[var(--text-primary)]">{title}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

function Highlight({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/15 backdrop-blur px-4 py-3">
      <p className="text-2xl font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-xs font-semibold text-white/80 leading-tight">{label}</p>
    </div>
  );
}
