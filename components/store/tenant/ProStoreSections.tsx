"use client";

/**
 * ProStoreSections — bloques "pro" OPT-IN por tienda (ADR-298 / feature flags).
 *
 * Se renderizan SOLO si el flag está en `settings.storeTheme.features` del tenant.
 * Así una tienda (ej. CompraFácil) tiene funciones extra sin afectar a las demás,
 * todo sobre la MISMA plantilla `app/t/[slug]/page.tsx`.
 *
 * Flags soportados: "trust" | "urgency" | "content" | "capture".
 * Sin datos inventados: garantías = verdades reales; "más vendidos" = productos
 * reales pasados por props; testimonios solo si hay reviews reales (no se fabrican).
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  RotateCcw, Banknote, MessageCircle, Truck, ChevronDown,
  Sparkles, ShoppingBag, Lock, Check,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

export interface ProShowcaseItem {
  id: string; name: string; image: string; unit: string; price: number;
}

interface Props {
  features: string[];
  displayName: string;
  primary: string;          // css color (var-aware)
  accent: string;
  tenantSlug: string;
  whatsappPhone?: string | null;
  bestSellers?: ProShowcaseItem[];
  freeShippingThreshold?: number;
}

export default function ProStoreSections({
  features, displayName, primary, accent, tenantSlug,
  whatsappPhone, bestSellers = [], freeShippingThreshold = 99,
}: Props) {
  const has = (f: string) => features.includes(f);
  const wa = (whatsappPhone ?? "").replace(/\D/g, "");

  return (
    <>
      {/* ───────── CONFIANZA & CONVERSIÓN ───────── */}
      {has("trust") && (
        <section className="max-w-5xl mx-auto px-4 py-10">
          <div className="mb-6">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">Compra tranquilo</p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">Por qué comprar en {displayName}</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { Icon: Lock, t: "Compra 100% segura", d: "Conexión cifrada y datos protegidos (Ley 29733)." },
              { Icon: RotateCcw, t: "Garantía de devolución", d: "¿Llegó mal? Te lo cambiamos o devolvemos." },
              { Icon: Banknote, t: "Paga al recibir", d: "Yape, Plin o efectivo. Sin tarjeta obligatoria." },
              { Icon: MessageCircle, t: "Soporte por WhatsApp", d: "Te respondemos rápido, persona real." },
            ].map(({ Icon, t, d }) => (
              <div key={t} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white mb-3" style={{ background: primary }}>
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">{t}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)] leading-snug">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {["Yape", "Plin", "Visa", "Mastercard", "Efectivo"].map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)]">
                <Check className="h-3.5 w-3.5" style={{ color: primary }} />{m}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ───────── URGENCIA & OFERTAS ───────── */}
      {has("urgency") && (
        <section className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 rounded-2xl p-4 text-white shadow-lg" style={{ background: `linear-gradient(90deg, ${primary} 0%, ${accent} 100%)` }}>
            <Truck className="h-7 w-7 shrink-0" strokeWidth={2} />
            <div className="min-w-0">
              <p className="font-extrabold leading-tight">Envío GRATIS en pedidos desde S/{freeShippingThreshold}</p>
              <p className="text-white/85 text-sm">Arma tu pedido y ahorra el delivery.</p>
            </div>
          </div>

          {bestSellers.length > 0 && (
            <div className="mt-8">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">Lo más pedido</p>
                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">Más vendidos</h2>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {bestSellers.slice(0, 4).map((p, idx) => (
                  <Link key={p.id} href={`/t/${tenantSlug}/tienda`} className="group relative rounded-2xl overflow-hidden bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-sm hover:shadow-xl transition-all hover:-translate-y-0.5">
                    <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded-full text-white font-extrabold text-[length:var(--ts-2xs)] shadow" style={{ background: accent }}>#{idx + 1} en ventas</div>
                    <div className="aspect-square bg-[var(--surface-sunken)] overflow-hidden relative">
                      {p.image ? (
                        <Image src={p.image} alt={p.name} fill sizes="(max-width:768px) 50vw, 20vw" className="object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center"><ShoppingBag className="w-8 h-8 text-[var(--text-tertiary)]" strokeWidth={1.5} /></div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-sm truncate text-[var(--text-primary)]">{p.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mb-1">{p.unit}</p>
                      <span className="font-extrabold text-lg" style={{ color: primary }}>S/{p.price.toFixed(2)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ───────── CONTENIDO & SEO (cómo funciona + FAQ) ───────── */}
      {has("content") && (
        <section className="max-w-5xl mx-auto px-4 py-10">
          <div className="mb-6">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">Cómo funciona</p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">Comprar es fácil</h2>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {[
              { n: "01", t: "Elige tus productos", d: "Mira el catálogo y agrega lo que te guste al carrito." },
              { n: "02", t: "Haz tu pedido", d: "Confirmas por la web o WhatsApp. Ves el total sin sorpresas." },
              { n: "03", t: "Recíbelo en casa", d: "Te llega a tu puerta. Pagas al recibir con Yape o efectivo." },
            ].map((s) => (
              <li key={s.n} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
                <p className="font-display text-[2rem] font-extrabold leading-none text-[var(--rule-base)] tabular-nums mb-3">{s.n}</p>
                <h3 className="text-base font-extrabold text-[var(--text-primary)] leading-tight">{s.t}</h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">{s.d}</p>
              </li>
            ))}
          </ol>

          <h3 className="font-display text-xl font-extrabold tracking-tight text-[var(--text-primary)] mb-4">Preguntas frecuentes</h3>
          <div className="space-y-2">
            {[
              { q: "¿Cómo pago mi pedido?", a: "Con Yape, Plin o efectivo al recibir. No necesitas tarjeta." },
              { q: "¿Cuánto tarda el envío?", a: "El delivery local llega en el día; a otras zonas coordinamos por WhatsApp." },
              { q: "¿Puedo devolver un producto?", a: "Sí. Si llega dañado o no es lo que pediste, te lo cambiamos o devolvemos." },
              { q: "¿Es seguro comprar acá?", a: "Sí. La conexión es cifrada y tus datos están protegidos por la Ley 29733." },
            ].map((f, i) => <FaqItem key={i} q={f.q} a={f.a} primary={primary} />)}
          </div>
        </section>
      )}

      {/* ───────── CAPTURA & RETENCIÓN (newsletter + WhatsApp flotante) ───────── */}
      {has("capture") && (
        <>
          <section className="max-w-5xl mx-auto px-4 py-10">
            <div className="rounded-3xl p-8 text-center text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)` }}>
              <Sparkles className="h-8 w-8 mx-auto mb-3" strokeWidth={2} />
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">10% OFF en tu primera compra</h2>
              <p className="text-white/85 mb-5 max-w-md mx-auto">Suscríbete y te mandamos el cupón + las ofertas de {displayName} antes que nadie.</p>
              <NewsletterForm />
            </div>
          </section>
          {wa && (
            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hola ${displayName}, quiero hacer un pedido.`)}`}
              target="_blank" rel="noopener noreferrer"
              aria-label="Pedir por WhatsApp"
              className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[var(--shadow-xl)] hover:scale-105 transition-transform"
              style={{ background: primary }}
            >
              <MessageCircle className="h-7 w-7" strokeWidth={2.25} />
            </a>
          )}
        </>
      )}
    </>
  );
}

function FaqItem({ q, a, primary }: { q: string; a: string; primary: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <span className="text-sm font-bold text-[var(--text-primary)]">{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`} style={open ? { color: primary } : undefined} />
      </button>
      {open && <p className="px-4 pb-4 -mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">{a}</p>}
    </div>
  );
}

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [coupon, setCoupon] = useState<{ code: string; discountValue: number } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setState("loading");
    try {
      const r = await fetch("/api/newsletter", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (r.ok) {
        const data = (await r.json().catch(() => ({}))) as { coupon?: { code: string; discountValue: number } | null };
        setCoupon(data?.coupon ?? null);
        setState("ok");
      } else {
        setState("err");
      }
    } catch { setState("err"); }
  };
  if (state === "ok")
    return (
      <div className="inline-flex flex-col items-center gap-2 font-bold">
        <span className="inline-flex items-center gap-2"><Check className="h-5 w-5" /> ¡Listo! Ya estás suscrito.</span>
        {coupon ? (
          <span className="inline-flex flex-wrap items-center justify-center gap-2 text-sm font-semibold text-white/90">
            Usa tu cupón
            <span className="rounded-lg bg-white/20 px-2.5 py-1 font-mono tracking-widest text-white">{coupon.code}</span>
            y obtén {coupon.discountValue}% OFF
          </span>
        ) : (
          <span className="text-sm font-semibold text-white/90">Te avisaremos de las próximas ofertas.</span>
        )}
      </div>
    );
  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
      <input
        type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@correo.com"
        className="flex-1 h-12 rounded-full px-5 text-[var(--text-primary)] bg-white border-2 border-transparent focus:border-white outline-none"
      />
      <button type="submit" disabled={state === "loading"} className="h-12 rounded-full bg-white px-6 font-extrabold text-sm disabled:opacity-70" style={{ color: "var(--accent)" }}>
        {state === "loading" ? "Enviando…" : "Quiero mi 10%"}
      </button>
      {state === "err" && <span className="sr-only">Error</span>}
    </form>
  );
}
