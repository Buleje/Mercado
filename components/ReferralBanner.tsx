"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { Copy, Check, Share2, Users, Star } from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";

function generateReferralCode(phone: string): string {
  const last4 = phone.replace(/\D/g, "").slice(-4);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const sum = last4.split("").reduce((a, d) => a + parseInt(d, 10), 0);
  return `Buleje${last4}${chars[sum % chars.length]}`;
}

const STEPS = [
  { n: "1", label: "Comparte tu cÃ³digo" },
  { n: "2", label: "Tu amigo hace su primer pedido" },
  { n: "3", label: "Â¡Ambos ganan 50 puntos!" },
];

export default function ReferralBanner() {
  const { customer } = useCustomer();
  const [copied, setCopied] = useState(false);
  const [referralCount, setReferralCount] = useState(0);

  const show = !!customer?.phone;

  useEffect(() => {
    if (!customer?.phone) return;
    try {
      const saved = localStorage.getItem(`buleje-referrals-${customer.phone}`);
      if (saved) startTransition(() => setReferralCount(parseInt(saved, 10) || 0));
    } catch {}
  }, [customer?.phone]);

  const code = customer?.phone ? generateReferralCode(customer.phone) : "";

  const handleCopy = useCallback(() => {
    const msg = `Â¡Compra en Buleje con mi cÃ³digo ${code} y ambos ganamos puntos extra! ðŸŽðŸ›’`;
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  }, [code]);

  const handleShare = useCallback(async () => {
    const msg = `Â¡Compra en Buleje con mi cÃ³digo ${code} y ambos ganamos puntos extra! ðŸŽðŸ›’`;
    if (navigator.share) {
      try { await navigator.share({ title: "Buleje - Referido", text: msg }); } catch {}
    } else { handleCopy(); }
  }, [code, handleCopy]);

  if (!show || !code) return null;

  return (
    <section className="py-14 sm:py-20 bg-background overflow-hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">

        {/* Section label */}
        <div className="flex flex-col items-center text-center mb-10">
          <span className="inline-flex items-center gap-2 bg-primary/8 dark:bg-primary/15 text-primary text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
            <Users className="w-3.5 h-3.5" />
            Programa de referidos
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[var(--text-primary)] leading-tight">
            Invita amigos,{" "}
            <span className="text-primary">gana puntos</span>
          </h2>
          <p className="mt-3 text-muted text-base max-w-md leading-relaxed">
            Comparte tu cÃ³digo y por cada amigo que haga su primer pedido,
            ambos ganan <strong className="text-[var(--text-primary)]">50 puntos</strong> de lealtad.
          </p>
        </div>

        {/* Main card */}
        <div className="relative rounded-3xl overflow-hidden shadow-[var(--shadow-xl)]" style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, var(--accent-dark) 40%, var(--accent) 70%, var(--accent-dark) 100%)",
        }}>
          {/* Decorative circles */}
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(244,162,97,0.18) 0%, transparent 70%)" }} />
          <div className="absolute -bottom-24 -left-12 w-64 h-64 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(74,222,128,0.12) 0%, transparent 70%)" }} />

          {/* Fine dot grid */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)",
            backgroundSize: "28px 28px", opacity: 0.12,
          }} />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-0">

            {/* LEFT â€” stats + steps */}
            <div className="px-8 sm:px-12 py-10 sm:py-12 flex flex-col justify-center"
              style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>
              {/* Points stats */}
              <div className="flex items-stretch gap-0 mb-8">
                <div className="flex flex-col pr-8">
                  <span className="text-4xl font-extrabold text-white leading-none">{referralCount}</span>
                  <span className="text-xs text-white/45 uppercase tracking-widest font-semibold mt-2">Referidos</span>
                </div>
                <div style={{ width: 1, background: "rgba(255,255,255,0.15)", alignSelf: "stretch" }} />
                <div className="flex flex-col pl-8">
                  <span className="text-4xl font-extrabold leading-none" style={{ color: "var(--color-secondary)" }}>{referralCount * 50}</span>
                  <span className="text-xs text-white/45 uppercase tracking-widest font-semibold mt-2">Puntos ganados</span>
                </div>
              </div>

              {/* Steps */}
              <div className="flex flex-col gap-4">
                {STEPS.map((s, i) => (
                  <div key={s.n} className="flex items-center gap-4">
                    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold"
                      style={{ background: i === 2 ? "var(--color-secondary)" : "rgba(255,255,255,0.15)", color: "#fff" }}>
                      {s.n}
                    </div>
                    <p className="text-sm text-white/70 font-medium leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT â€” code + actions */}
            <div className="px-8 sm:px-12 py-10 sm:py-12 flex flex-col justify-center gap-5">

              {/* Star badge */}
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Tu cÃ³digo personal</span>
              </div>

              {/* Code display */}
              <div style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px dashed rgba(255,255,255,0.25)",
                borderRadius: "1.25rem",
                padding: "1.5rem 2rem",
                textAlign: "center",
              }}>
                <p className="text-4xl sm:text-5xl font-extrabold text-white tracking-[var(--ls-wider)] font-mono select-all">
                  {code}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCopy}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95",
                    copied ? "bg-[var(--data-success-500)] text-white" : "bg-white text-primary hover:bg-white/90"
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Â¡Copiado!" : "Copiar cÃ³digo"}
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-all"
                  style={{ background: "var(--color-secondary)", color: "#fff", boxShadow: "0 6px 20px rgba(244,162,97,0.35)" }}
                >
                  <Share2 className="h-4 w-4" />
                  Compartir
                </button>
              </div>

              <p className="text-xs text-white/35 text-center">
                Al compartir aceptas nuestros tÃ©rminos del programa de referidos.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

