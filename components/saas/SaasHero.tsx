"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { m as motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { csrfHeaders } from "@/lib/csrf-client";

const SPRING = [0.175, 0.885, 0.32, 1.275] as [number, number, number, number];
const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: SPRING } };
const stagger = { animate: { transition: { staggerChildren: 0.08 } } };
const bubbleV: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: SPRING } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

function useTypingEffect(text: string, speed = 28, delay = 800) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    let i = 0; setDisplayed(""); setDone(false);
    const t = setTimeout(() => {
      const iv = setInterval(() => { i++; setDisplayed(text.slice(0, i)); if (i >= text.length) { clearInterval(iv); setDone(true); } }, speed);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(t);
  }, [text, speed, delay]);
  return { displayed, done };
}

function useAnimatedCounter(target: number, duration = 1200, run = true) {
  const [count, setCount] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (!run) return;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, run]);
  return count;
}

function useViewportCounter(target: number, duration = 1600) {
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = useAnimatedCounter(started ? target : 0, duration);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStarted(true); obs.disconnect(); } }, { threshold: 0.3 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return { count, ref };
}

const KPI_CYCLES = [
  { ventas: "S/ 2,840", pedidos: "18", stock: "2", margen: "28%" },
  { ventas: "S/ 3,450", pedidos: "24", stock: "5", margen: "32%" },
  { ventas: "S/ 4,120", pedidos: "31", stock: "3", margen: "35%" },
];
const VENTAS_CYCLES = [
  [{ n: "Rosa H.", m: "S/ 45.00", t: "hace 2 min" }, { n: "Carlos R.", m: "S/ 120.50", t: "hace 5 min" }, { n: "Ana V.", m: "S/ 32.00", t: "hace 8 min" }],
  [{ n: "Miguel S.", m: "S/ 67.00", t: "hace 1 min" }, { n: "Lucía P.", m: "S/ 88.50", t: "hace 4 min" }, { n: "José M.", m: "S/ 21.00", t: "hace 9 min" }],
  [{ n: "Carmen T.", m: "S/ 54.00", t: "hace 2 min" }, { n: "Pedro V.", m: "S/ 99.00", t: "hace 6 min" }, { n: "Elena R.", m: "S/ 43.50", t: "hace 11 min" }],
];
const CHART_BARS = [
  { label: "L", h: 52 }, { label: "M", h: 68 }, { label: "X", h: 44 }, { label: "J", h: 80 },
  { label: "V", h: 90 }, { label: "S", h: 75 }, { label: "D", h: 60, today: true },
];
const PRODUCTOS = [
  { nombre: "Arroz", precio: 3.5 }, { nombre: "Aceite", precio: 8.9 }, { nombre: "Azúcar", precio: 4.2 },
  { nombre: "Leche", precio: 5.5 }, { nombre: "Fideos", precio: 2.8 }, { nombre: "Atún", precio: 4.5 },
];
const CHAT = [
  { tipo: "cliente", texto: "Hola, ¿tienen arroz?" },
  { tipo: "bot", texto: "¡Hola! Sí, tenemos Arroz Extra 1kg a S/ 3.50. ¿Cuántos deseas?" },
  { tipo: "cliente", texto: "2 por favor" },
  { tipo: "bot", texto: "Perfecto. Tu pedido: 2x Arroz = S/ 7.00. ¿Confirmas? Escribe CONFIRMO" },
  { tipo: "cliente", texto: "CONFIRMO" },
  { tipo: "bot", texto: "✅ Pedido confirmado. Lo preparamos para ti." },
];

const TabDashboard = memo(function TabDashboard() {
  const [cy, setCy] = useState(0);
  const [vcy, setVcy] = useState(0);
  useEffect(() => {
    const t1 = setInterval(() => setCy((c) => (c + 1) % 3), 3000);
    const t2 = setInterval(() => setVcy((c) => (c + 1) % 3), 4000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);
  const kpi = KPI_CYCLES[cy];
  const ventas = VENTAS_CYCLES[vcy];
  const kpiItems = [
    { label: "Ventas hoy", valor: kpi.ventas, color: "#14C2C2", bg: "rgba(0, 160, 160,0.12)", border: "rgba(0, 160, 160,0.3)" },
    { label: "Pedidos", valor: kpi.pedidos, color: "color-mix(in oklab, var(--accent) 60%, white)", bg: "rgba(0, 160, 160,0.08)", border: "rgba(0, 160, 160,0.2)" },
    { label: "Stock bajo", valor: kpi.stock, color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)" },
    { label: "Margen", valor: kpi.margen, color: "#ff8676", bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.2)" },
  ];
  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {kpiItems.map((item) => (
          <div key={item.label} className="rounded-xl p-2.5 border" style={{ background: item.bg, borderColor: item.border }}>
            <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
            <AnimatePresence mode="wait">
              <motion.p key={item.valor} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="text-base font-bold font-mono" style={{ color: item.color }}>
                {item.valor}
              </motion.p>
            </AnimatePresence>
          </div>
        ))}
      </div>
      <div aria-hidden="true">
        <p className="text-xs text-gray-500 mb-2">Ventas por día</p>
        <div className="flex items-end gap-1.5 h-16">
          {CHART_BARS.map((bar) => (
            <div key={bar.label} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full relative rounded-t" style={{ height: `${bar.h}%` }}>
                <div className="w-full h-full rounded-t" style={{ background: bar.today ? "linear-gradient(to top, var(--accent), #14C2C2)" : "rgba(0, 160, 160,0.35)" }} />
                {bar.today && <div className="absolute inset-0 rounded-t animate-pulse" style={{ background: "linear-gradient(to top, rgba(0, 160, 160,0.3), rgba(20, 194, 194,0.3))" }} />}
              </div>
              <span className="text-gray-600 dark:text-gray-500" style={{ fontSize: "0.6rem" }}>{bar.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Ultimas ventas</p>
        <div className="space-y-1.5">
          <AnimatePresence mode="wait">
            {ventas.map((v, i) => (
              <motion.div key={`${vcy}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.25, delay: i * 0.06 }} className="flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-gray-300 font-medium">{v.n}</span>
                <span style={{ color: "#14C2C2" }} className="font-mono font-semibold">{v.m}</span>
                <span className="text-gray-500">{v.t}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
});

const TabPOS = memo(function TabPOS() {
  const [carrito, setCarrito] = useState<{ nombre: string; precio: number; qty: number }[]>([]);
  const [cobrado, setCobrado] = useState(false);
  const agregar = useCallback((p: { nombre: string; precio: number }) => {
    setCobrado(false);
    setCarrito((prev) => { const idx = prev.findIndex((x) => x.nombre === p.nombre); if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n; } return [...prev, { ...p, qty: 1 }]; });
  }, []);
  const total = carrito.reduce((s, p) => s + p.precio * p.qty, 0);
  const cobrar = useCallback(() => { setCobrado(true); setTimeout(() => { setCarrito([]); setCobrado(false); }, 2000); }, []);
  return (
    <div className="p-3 flex gap-3" style={{ minHeight: "220px" }}>
      <div className="flex-1">
        <p className="text-xs text-gray-500 mb-2">Productos</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PRODUCTOS.map((p) => (
            <button key={p.nombre} type="button" onClick={() => agregar(p)} className="text-left rounded-xl p-2 border transition-all duration-150 hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" style={{ background: "rgba(0, 160, 160,0.08)", borderColor: "rgba(0, 160, 160,0.2)", minHeight: "44px" }}>
              <p className="text-xs font-semibold text-gray-200 leading-tight">{p.nombre}</p>
              <p className="text-xs font-mono" style={{ color: "#14C2C2" }}>S/ {Number(p.precio).toFixed(2)}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="w-28 flex flex-col gap-2">
        <p className="text-xs text-gray-500">Carrito</p>
        <div className="flex-1 space-y-1 overflow-hidden">
          <AnimatePresence>
            {carrito.length === 0 ? <p className="text-xs text-gray-600 text-center mt-4">Sin items</p> :
              carrito.map((item) => (
                <motion.div key={item.nombre} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2 }} className="text-xs rounded-lg px-2 py-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="text-gray-300">{item.nombre}</span><span className="text-gray-500 ml-1">x{item.qty}</span>
                </motion.div>
              ))}
          </AnimatePresence>
        </div>
        {carrito.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Total: <span className="font-mono font-bold" style={{ color: "#14C2C2" }}>S/ {total.toFixed(2)}</span></p>
            <AnimatePresence mode="wait">
              {cobrado
                ? <motion.div key="ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-xs font-bold text-center py-1.5 rounded-xl" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}>Venta lista</motion.div>
                : <motion.button key="cobrar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} type="button" onClick={cobrar} className="w-full text-xs font-bold py-1.5 rounded-xl text-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", minHeight: "32px" }}>Cobrar S/ {total.toFixed(2)}</motion.button>
              }
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
});

const TabWhatsApp = memo(function TabWhatsApp({ active }: { active: boolean }) {
  const [vis, setVis] = useState(0);
  useEffect(() => {
    if (!active) { setVis(0); return; }
    let i = 0;
    const t = setInterval(() => { i++; setVis(i); if (i >= CHAT.length) clearInterval(t); }, 1500);
    return () => clearInterval(t);
  }, [active]);
  return (
    <div className="p-3" style={{ minHeight: "220px" }}>
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3" style={{ background: "rgba(0, 160, 160,0.15)", border: "1px solid rgba(0, 160, 160,0.25)" }}>
        <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: "var(--accent)" }} aria-hidden="true">WA</div>
        <div><p className="text-xs font-semibold text-gray-200">Bot Bodega</p><p className="text-gray-400" style={{ fontSize: "0.65rem" }}>En linea</p></div>
        <div className="ml-auto h-2 w-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
      </div>
      <div className="space-y-2 overflow-hidden">
        <AnimatePresence>
          {CHAT.slice(0, vis).map((msg, i) => (
            <motion.div key={i} variants={bubbleV} initial="initial" animate="animate" exit="exit" className={`flex ${msg.tipo === "bot" ? "justify-start" : "justify-end"}`}>
              <div className="max-w-[85%] text-xs px-2.5 py-1.5 rounded-2xl leading-relaxed" style={msg.tipo === "bot" ? { background: "rgba(0, 160, 160,0.25)", color: "#e2e8f0", borderBottomLeftRadius: "4px" } : { background: "rgba(255,255,255,0.1)", color: "#d1d5db", borderBottomRightRadius: "4px" }}>
                {msg.texto}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {vis > 0 && vis < CHAT.length && CHAT[vis]?.tipo === "bot" && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 px-3 py-2 rounded-2xl" style={{ background: "rgba(0, 160, 160,0.2)", borderBottomLeftRadius: "4px" }} aria-label="Escribiendo...">
              {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: "#14C2C2", animationDelay: `${d * 150}ms` }} aria-hidden="true" />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const StatCounter = memo(function StatCounter({ target, suffix, label, delay }: { target: number; suffix: string; label: string; delay: number }) {
  const { count, ref } = useViewportCounter(target, 1600);
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay, duration: 0.5, ease: SPRING }} className="text-center">
      <p className="text-4xl sm:text-5xl font-black tracking-tight font-mono" style={{ color: "var(--accent)", letterSpacing: "-0.03em" }}>{count}{suffix}</p>
      <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1 font-medium">{label}</p>
    </motion.div>
  );
});

const DotBg = <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ backgroundImage: "radial-gradient(circle, #00A0A010 1px, transparent 1px)", backgroundSize: "24px 24px" }} />;
const GlowBg = <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ background: "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(0, 160, 160,0.12) 0%, transparent 70%)" }} />;
const SUBTITLE = "Gestiona ventas, inventario, clientes y fiados desde tu celular. Con inteligencia artificial, WhatsApp integrado y modo offline. Gratis para empezar.";
const TABS = ["Dashboard", "Punto de Venta", "WhatsApp"] as const;
type Tab = (typeof TABS)[number];

export default function SaasHero() {
  const reduced = useReducedMotion();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Dashboard");
  const mockupRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const isDesktop = useRef(false);
  const { displayed: typed, done: typingDone } = useTypingEffect(SUBTITLE, 28, 800);
  const subtitle = reduced ? SUBTITLE : typed;

  // ── Demo state ───────────────────────────────────────────
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const handleDemo = useCallback(async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      const res = await fetch("/api/demo/create", { method: "POST", headers: csrfHeaders() });
      const data = await res.json() as { slug?: string; error?: string };
      if (!res.ok) {
        setDemoError(data.error ?? "No se pudo crear el demo. Intenta en unos minutos.");
        return;
      }
      router.push(`/t/${data.slug}/admin`);
    } catch {
      setDemoError("Error de red. Revisa tu conexión.");
    } finally {
      setDemoLoading(false);
    }
  }, [router]);

  useEffect(() => { isDesktop.current = window.matchMedia("(min-width: 1024px)").matches; }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDesktop.current || reduced) return;
    if (glowRef.current) {
      cancelAnimationFrame(rafRef.current);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left - 200; const y = e.clientY - rect.top - 200;
      rafRef.current = requestAnimationFrame(() => { if (glowRef.current) { glowRef.current.style.transform = `translate(${x}px, ${y}px)`; glowRef.current.style.opacity = "1"; } });
    }
    if (mockupRef.current) {
      const r = mockupRef.current.getBoundingClientRect();
      const rx = ((e.clientX - r.left - r.width / 2) / (r.width / 2)) * 3;
      const ry = -((e.clientY - r.top - r.height / 2) / (r.height / 2)) * 3;
      mockupRef.current.style.transform = `perspective(1000px) rotateY(${rx}deg) rotateX(${ry}deg)`;
    }
  }, [reduced]);

  const onMouseLeave = useCallback(() => {
    if (glowRef.current) glowRef.current.style.opacity = "0";
    if (mockupRef.current) mockupRef.current.style.transform = "perspective(1000px) rotateY(0deg) rotateX(0deg)";
  }, []);

  const _scrollToPlanes = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    document.getElementById("planes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 overflow-hidden" aria-label="Seccion principal" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      {DotBg}{GlowBg}

      {/* Cursor glow desktop */}
      <div ref={glowRef} className="absolute pointer-events-none opacity-0 transition-opacity duration-300 hidden lg:block" aria-hidden="true"
        style={{ width: "400px", height: "400px", top: 0, left: 0, background: "radial-gradient(circle, rgba(0, 160, 160,0.15) 0%, transparent 70%)", borderRadius: "50%", willChange: "transform" }} />

      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Columna izquierda */}
          <motion.div variants={stagger} initial="initial" animate="animate" className="flex flex-col items-start">
            <motion.div variants={reduced ? {} : fadeUp} className="mb-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white shadow-lg"
              style={{ background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)", boxShadow: "0 4px 20px -4px rgba(0, 160, 160,0.5)" }}>
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-white/70" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              <span>Hecho en Peru por bodegueros, para bodegueros</span>
              <span aria-label="Bandera del Peru">🇵🇪</span>
            </motion.div>

            <motion.h1 variants={reduced ? {} : fadeUp} className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight mb-6" style={{ letterSpacing: "-0.03em" }}>
              Tu bodega merece un sistema{" "}<span style={{ color: "var(--accent)" }}>inteligente</span>
            </motion.h1>

            <motion.p variants={reduced ? {} : fadeUp} className="text-base sm:text-lg text-gray-600 dark:text-gray-400 leading-relaxed mb-8 max-w-xl" aria-label={SUBTITLE}>
              {subtitle}
              {!typingDone && !reduced && <span className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse" style={{ backgroundColor: "var(--accent)" }} aria-hidden="true" />}
            </motion.p>

            <motion.div variants={reduced ? {} : fadeUp} className="flex flex-col sm:flex-row gap-3 mb-3 w-full sm:w-auto">
              <Link href="/registro" className="inline-flex items-center justify-center px-8 py-4 rounded-2xl text-lg font-bold text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] min-h-[44px]"
                style={{ background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)", boxShadow: "0 8px 32px -4px rgba(0, 160, 160,0.5), inset 0 1px 0 rgba(255,255,255,0.12)" }}>
                Empezar gratis →
              </Link>
              <button
                type="button"
                onClick={handleDemo}
                disabled={demoLoading}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-lg font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-[var(--accent)] hover:text-[var(--accent)] dark:hover:border-[var(--accent)] dark:hover:text-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] min-h-[44px]"
              >
                {demoLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Creando demo…
                  </>
                ) : (
                  "Probar demo gratis"
                )}
              </button>
            </motion.div>

            {demoError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-[var(--data-error-500)] dark:text-red-400 mb-3"
                role="alert"
              >
                {demoError}
              </motion.p>
            )}

            <motion.div variants={reduced ? {} : fadeUp} className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
              <span>✓ Sin tarjeta de credito</span>
              <span>✓ Gratis para siempre</span>
              <span>✓ Cancela cuando quieras</span>
            </motion.div>
          </motion.div>

          {/* Columna derecha — demo interactivo */}
          <motion.div initial={reduced ? {} : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2, ease: SPRING }} className="relative w-full">
            <div className="absolute -inset-8 rounded-3xl pointer-events-none" aria-hidden="true" style={{ boxShadow: "0 0 120px 40px rgba(0, 160, 160,0.15)" }} />
            <div className="absolute -inset-8 rounded-3xl pointer-events-none" aria-hidden="true" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0, 160, 160,0.12) 0%, transparent 70%)", filter: "blur(24px)" }} />

            <div ref={mockupRef} className="relative rounded-2xl overflow-hidden border shadow-2xl"
              style={{ background: "#111827", borderColor: "rgba(0, 160, 160,0.35)", boxShadow: "0 32px 64px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(0, 160, 160,0.15)", transition: "transform 0.15s ease-out", willChange: "transform" }}>

              {/* Barra de titulo */}
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ background: "#1f2937", borderColor: "rgba(255,255,255,0.08)" }} aria-hidden="true">
                <span className="h-3 w-3 rounded-full bg-[var(--data-error-500)]" />
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="h-3 w-3 rounded-full bg-green-500" />
                <span className="ml-2 text-xs text-gray-400 font-medium truncate">Buleje — Sistema ERP</span>
              </div>

              {/* Tabs pill-style */}
              <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ background: "#1a2535", borderColor: "rgba(255,255,255,0.06)" }} role="tablist" aria-label="Modulos del sistema">
                {TABS.map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                    className="relative text-xs px-3 py-1.5 rounded-full font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] min-h-[32px]"
                    style={{ color: tab === t ? "#fff" : "rgba(156,163,175,0.8)", background: tab === t ? "transparent" : "transparent" }}>
                    {tab === t && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }} transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} aria-hidden="true" />}
                    <span className="relative z-10">{t}</span>
                  </button>
                ))}
              </div>

              {/* Contenido de tabs */}
              <div style={{ minHeight: "240px" }}>
                <AnimatePresence mode="wait">
                  {tab === "Dashboard" && (
                    <motion.div key="dashboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                      <TabDashboard />
                    </motion.div>
                  )}
                  {tab === "Punto de Venta" && (
                    <motion.div key="pos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                      <TabPOS />
                    </motion.div>
                  )}
                  {tab === "WhatsApp" && (
                    <motion.div key="whatsapp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                      <TabWhatsApp active={tab === "WhatsApp"} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Stats bar */}
        <motion.div initial={reduced ? {} : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1, ease: SPRING }} className="mt-16 sm:mt-20 pt-10 border-t border-gray-200 dark:border-gray-800">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-4">
            <StatCounter target={107} suffix="+" label="modulos" delay={0.1} />
            <StatCounter target={20} suffix="+" label="integraciones" delay={0.2} />
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 0.5, ease: SPRING }} className="text-center">
              <p className="text-4xl sm:text-5xl font-black tracking-tight font-mono" style={{ color: "var(--accent)", letterSpacing: "-0.03em" }}>100%</p>
              <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1 font-medium">peruano</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
