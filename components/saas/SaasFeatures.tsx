"use client";

import { useState, useEffect, useRef } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  Shield, MessageCircle, TrendingUp, BarChart3, WifiOff,
  DollarSign, Camera, Gift, ChevronDown, Tag, RefreshCw,
  MapPin, Truck, ShoppingCart, Search, Moon, Megaphone,
  Star, Mic, Calculator, AlertTriangle,
} from "@buleje/design-system/icons";
import type { LucideIcon } from "lucide-react";

type FilterPill = "Estrella" | "IA" | "Ventas" | "Stock" | "Todas";
type Cat = "Ventas" | "IA" | "Stock";

interface StarFeature {
  id: number; icon: LucideIcon; title: string; category: Cat;
  problema: string; solucion: string;
  label: string; num: number; suffix: string; prefix: string;
}
interface MiniFeature {
  icon: LucideIcon; title: string; desc: string;
  cat: Cat; border: string;
}

const C_BORDER: Record<Cat, string> = { Ventas: "var(--accent)", IA: "#2563eb", Stock: "#d97706" };
const C_BG:     Record<Cat, string> = { Ventas: "rgba(0, 160, 160,0.12)", IA: "rgba(37,99,235,0.12)", Stock: "rgba(217,119,6,0.12)" };
const C_TEXT:   Record<Cat, string> = { Ventas: "#14C2C2", IA: "#60a5fa", Stock: "#fbbf24" };
const C_ICON:   Record<Cat, string> = {
  Ventas: "linear-gradient(135deg,var(--accent),#14C2C2)",
  IA:     "linear-gradient(135deg,#1d4ed8,#3b82f6)",
  Stock:  "linear-gradient(135deg,#b45309,#f59e0b)",
};

const STARS: StarFeature[] = [
  { id:1, icon:Shield,        title:"Semáforo de Crédito",   category:"Ventas", problema:"Don Jorge fiaba a todos y perdía S/ 300 al mes en deudas que nunca se cobraban", solucion:"El semáforo evalúa al cliente: verde = fiar tranquilo, amarillo = cuidado, rojo = no fiar", label:"cobros al mes",             num:85, suffix:"%", prefix:"+" },
  { id:2, icon:MessageCircle, title:"Vendedor IA WhatsApp",   category:"IA",     problema:"Rosa no podía atender WhatsApp mientras vendía en mostrador y perdía pedidos", solucion:"El bot toma pedidos, confirma y cobra — todo automático por WhatsApp las 24 horas",    label:"pedidos",                  num:40, suffix:"%", prefix:"+" },
  { id:3, icon:TrendingUp,    title:"Predicción de Stock",    category:"Stock",  problema:"Carlos se enteraba que faltaba arroz justo cuando el cliente lo pidea y ya era tarde", solucion:"El sistema avisa 3 días antes de que se agote según las ventas reales de tu tienda", label:"quiebres de stock",         num:70, suffix:"%", prefix:"-" },
  { id:4, icon:BarChart3,     title:"Panel del Día",          category:"Ventas", problema:"Ana cerraba la tienda cada noche sin saber si ese día había ganado o perdido plata", solucion:"Un panel verde/rojo te dice cómo va tu día en tiempo real, sin calcular nada a mano",  label:"control del negocio",      num:25, suffix:"%", prefix:"+" },
  { id:5, icon:WifiOff,       title:"Modo Offline",           category:"Ventas", problema:"En Pucallpa se va el internet 2 o 3 veces por semana y la venta se paraba completo", solucion:"Sigues vendiendo aunque no haya señal. Cuando vuelve el internet, todo se sincroniza", label:"ventas perdidas por corte", num:0,  suffix:"",  prefix:"" },
  { id:6, icon:DollarSign,    title:"Cobranza Inteligente",   category:"Ventas", problema:"Pedro tenía 15 clientes con deuda y no sabía a quién cobrar primero ni cómo", solucion:"4 niveles automáticos: recordatorio suave → descuento → mensaje urgente → bloqueo",       label:"deudas recuperadas",       num:60, suffix:"%", prefix:"+" },
  { id:7, icon:Camera,        title:"Escanea Facturas",       category:"Stock",  problema:"Registrar cada compra a mano tomaba 30 minutos que le robaba tiempo de atención", solucion:"Tomas foto de la factura y el sistema registra todo automáticamente con IA",            label:"tiempo de registro",       num:90, suffix:"%", prefix:"-" },
  { id:8, icon:Gift,          title:"Combos Inteligentes",    category:"IA",     problema:"No sabía qué productos se vendían juntos para poder armar ofertas que funcionen", solucion:"La IA analiza tus ventas reales y sugiere combos que tus clientes ya compran juntos",   label:"ticket promedio",          num:20, suffix:"%", prefix:"+" },
];

const ALL: MiniFeature[] = [
  { icon:Shield,       title:"Semáforo Crédito",    desc:"Verde/rojo por cliente",        cat:"Ventas", border:C_BORDER.Ventas },
  { icon:MessageCircle,title:"Vendedor IA WA",      desc:"Bot 24/7 en WhatsApp",          cat:"IA",     border:C_BORDER.IA },
  { icon:TrendingUp,   title:"Predicción Stock",    desc:"Aviso 3 días antes",            cat:"Stock",  border:C_BORDER.Stock },
  { icon:BarChart3,    title:"Panel del Día",       desc:"Verde/rojo en tiempo real",     cat:"Ventas", border:C_BORDER.Ventas },
  { icon:WifiOff,      title:"Modo Offline",        desc:"Vende sin internet",            cat:"Ventas", border:C_BORDER.Ventas },
  { icon:DollarSign,   title:"Cobranza Inteligente",desc:"4 niveles automáticos",         cat:"Ventas", border:C_BORDER.Ventas },
  { icon:Camera,       title:"Escanea Facturas",    desc:"Foto → registro automático",    cat:"Stock",  border:C_BORDER.Stock },
  { icon:Gift,         title:"Combos Inteligentes", desc:"IA sugiere ofertas reales",     cat:"IA",     border:C_BORDER.IA },
  { icon:Tag,          title:"Precio Inteligente",  desc:"Sube/baja según rotación",      cat:"Ventas", border:C_BORDER.Ventas },
  { icon:RefreshCw,    title:"Reposición Auto",      desc:"Genera orden de compra",        cat:"Stock",  border:C_BORDER.Stock },
  { icon:MapPin,       title:"Mapa Clientes",       desc:"Heat map de compras",           cat:"Ventas", border:C_BORDER.Ventas },
  { icon:Truck,        title:"Portal Proveedores",  desc:"Proveedor ve tu stock",         cat:"Stock",  border:C_BORDER.Stock },
  { icon:ShoppingCart, title:"Compra Automática",   desc:"Qué comprar en 4 días",         cat:"Stock",  border:C_BORDER.Stock },
  { icon:Search,       title:"Detecta Fugas",       desc:"Alerta si caja no cuadra",      cat:"Ventas", border:C_BORDER.Ventas },
  { icon:Moon,         title:"Productos Dormidos",  desc:"Qué no se vende",               cat:"Stock",  border:C_BORDER.Stock },
  { icon:Megaphone,    title:"Campañas Auto",       desc:"Promos por WhatsApp",           cat:"Ventas", border:C_BORDER.Ventas },
  { icon:Star,         title:"Cliente Frecuente",   desc:"Puntos sin tarjeta",            cat:"Ventas", border:C_BORDER.Ventas },
  { icon:Mic,          title:"ERP con Voz",         desc:"Habla en español peruano",      cat:"IA",     border:C_BORDER.IA },
  { icon:Calculator,   title:"Simulador Utilidad",  desc:"ROI antes de comprar",          cat:"Ventas", border:C_BORDER.Ventas },
  { icon:AlertTriangle,title:"Radar Fuga Clientes", desc:"Detecta quién dejó de comprar", cat:"IA",     border:C_BORDER.IA },
];

const PILLS: { label: string; key: FilterPill }[] = [
  { label:"Estrella", key:"Estrella" },
  { label:"IA",       key:"IA" },
  { label:"Ventas",   key:"Ventas" },
  { label:"Stock",    key:"Stock" },
  { label:"Todas (20)",key:"Todas" },
];

function SectionCounter({ target }: { target: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / 1200, 1);
          setCount(Math.round((1 - Math.pow(1 - p, 3)) * target));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{count}</span>;
}

function AnimatedCounter({ num, prefix, suffix, active }: { num: number; prefix: string; suffix: string; active: boolean }) {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!active) { setCount(0); started.current = false; return; }
    if (started.current) return;
    started.current = true;
    if (num === 0) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / 900, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * num));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active, num]);
  return <span>{num === 0 ? "0" : `${prefix}${count}${suffix}`}</span>;
}

function AccordionItem({ f, isOpen, onToggle, index }: { f: StarFeature; isOpen: boolean; onToggle: () => void; index: number }) {
  const Icon = f.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.42, ease: [0.175, 0.885, 0.32, 1.275] }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: isOpen ? C_BG[f.category] : "transparent",
        border: `1px solid ${isOpen ? C_BORDER[f.category] : "rgba(45,106,79,0.15)"}`,
        borderLeft: `3px solid ${C_BORDER[f.category]}`,
        transition: "background 0.2s ease, border-color 0.2s ease",
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 sm:px-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] min-h-[56px]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: C_ICON[f.category] }} aria-hidden="true">
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-[#f0f4f1] truncate">{f.title}</span>
          <span className="hidden sm:inline-flex shrink-0 text-[length:var(--ts-2xs)] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ background: C_BG[f.category], color: C_TEXT[f.category] }}>
            {f.category}
          </span>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25, ease: "easeInOut" }} aria-hidden="true">
          <ChevronDown className="w-4 h-4" style={{ color: isOpen ? C_TEXT[f.category] : "rgba(156,163,175,0.8)" }} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 sm:px-5 pb-5 pt-1 grid sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-widest mb-1" style={{ color: C_TEXT[f.category] }}>Problema</p>
                  <p className="text-sm text-gray-600 dark:text-[rgba(240,244,241,0.65)] leading-relaxed">&ldquo;{f.problema}&rdquo;</p>
                </div>
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-widest mb-1" style={{ color: C_TEXT[f.category] }}>Solución</p>
                  <p className="text-sm text-gray-700 dark:text-[rgba(240,244,241,0.82)] leading-relaxed">{f.solucion}</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl py-5 px-4" style={{ background: "rgba(45,106,79,0.06)", border: "1px solid rgba(45,106,79,0.12)" }}>
                <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-widest text-gray-400 dark:text-[rgba(240,244,241,0.45)] mb-2">Resultado</p>
                <p className="font-extrabold tabular-nums leading-none mb-1" style={{ fontSize: "clamp(2rem,6vw,3rem)", color: C_TEXT[f.category] }}>
                  <AnimatedCounter num={f.num} prefix={f.prefix} suffix={f.suffix} active={isOpen} />
                </p>
                <p className="text-xs text-center text-gray-500 dark:text-[rgba(240,244,241,0.5)]">{f.label}</p>
                <div className="mt-3 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C_ICON[f.category] }} aria-hidden="true">
                  <Icon className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MiniCard({ f, index }: { f: MiniFeature; index: number }) {
  const Icon = f.icon;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, duration: 0.3, ease: "easeOut" }}
      className="rounded-xl p-3 flex flex-col gap-1.5"
      style={{ background: "rgba(45,106,79,0.05)", border: "1px solid rgba(45,106,79,0.14)", borderLeft: `3px solid ${f.border}` }}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${f.border}22` }} aria-hidden="true">
        <Icon className="w-3.5 h-3.5" style={{ color: f.border }} />
      </div>
      <p className="text-xs font-semibold text-gray-900 dark:text-[#f0f4f1] leading-tight">{f.title}</p>
      <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-[rgba(240,244,241,0.45)] leading-snug">{f.desc}</p>
    </motion.div>
  );
}

export default function SaasFeatures() {
  const [pill, setPill] = useState<FilterPill>("Estrella");
  const [openId, setOpenId] = useState<number | null>(1);
  const [showAll, setShowAll] = useState(false);

  const filteredStars = (pill === "Estrella" || pill === "Todas")
    ? STARS
    : STARS.filter((f) => f.category === (pill as Cat));

  const filteredAll = (pill === "Estrella" || pill === "Todas")
    ? ALL
    : ALL.filter((f) => f.cat === (pill as Cat));

  function changePill(p: FilterPill) { setPill(p); setOpenId(null); setShowAll(false); }

  return (
    <section id="caracteristicas" className="py-20 md:py-28 bg-white dark:bg-[#0a0f0d]">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 lg:px-12">

        {/* Header */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] }}
        >
          <h2 className="font-extrabold text-gray-900 dark:text-[#f0f4f1] mb-3" style={{ fontSize: "clamp(1.5rem,3vw,2.2rem)", letterSpacing: "-0.02em" }}>
            Herramientas que transforman tu bodega
          </h2>
          <p className="text-gray-500 dark:text-[rgba(240,244,241,0.6)] text-base sm:text-lg max-w-xl mx-auto">
            <span className="font-black tabular-nums" style={{ color: "var(--accent)" }}>
              <SectionCounter target={8} />
            </span>{" "}
            funciones estrella —{" "}
            <span className="text-gray-400 dark:text-[rgba(240,244,241,0.45)]">haz click en cada una para ver cómo te ayuda</span>
          </p>
        </motion.div>

        {/* Pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:justify-center mb-8">
          {PILLS.map(({ label, key }) => {
            const active = pill === key;
            return (
              <button
                key={key}
                onClick={() => changePill(key)}
                aria-pressed={active}
                className="shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] whitespace-nowrap min-h-[44px]"
                style={active
                  ? { background: "linear-gradient(135deg,var(--accent),#14C2C2)", color: "#fff", boxShadow: "0 4px 14px -4px rgba(0, 160, 160,0.45)" }
                  : { background: "transparent", color: "inherit", border: "1px solid rgba(0, 160, 160,0.22)" }
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Accordion */}
        <AnimatePresence mode="wait">
          {pill !== "Todas" && (
            <motion.div key={pill} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-3 mb-8">
              {filteredStars.length === 0
                ? <p className="text-center text-sm text-gray-400 dark:text-[rgba(240,244,241,0.4)] py-8">No hay funciones estrella en esta categoría</p>
                : filteredStars.map((f, i) => (
                    <AccordionItem key={f.id} f={f} isOpen={openId === f.id} onToggle={() => setOpenId(openId === f.id ? null : f.id)} index={i} />
                  ))
              }
            </motion.div>
          )}
        </AnimatePresence>

        {/* Botón ver todas */}
        {(pill === "Estrella" || pill === "Todas") && (
          <div className="text-center mb-4">
            <button
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="inline-flex items-center gap-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] min-h-[44px] px-4"
              style={{ color: "var(--accent)" }}
            >
              {showAll ? "Ocultar funciones ↑" : "Ver las 20 funciones →"}
            </button>
          </div>
        )}

        {/* Grid de 20 */}
        <AnimatePresence>
          {(showAll || pill === "Todas") && (
            <motion.div
              key="all"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-2 pb-6">
                <p className="text-xs text-gray-400 dark:text-[rgba(240,244,241,0.4)] text-center mb-4">{filteredAll.length} funciones disponibles</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {filteredAll.map((f, i) => <MiniCard key={f.title} f={f} index={i} />)}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </section>
  );
}
