"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Unlock, Check, X, ArrowRight } from "lucide-react";
import Link from "next/link";

// ── Beneficios por modulo Pro ──────────────────────────────────────────────────

const PRO_BENEFITS: Record<string, { title: string; benefits: string[] }> = {
  "analytics": {
    title: "Reportes Avanzados",
    benefits: [
      "Ve que productos te dan mas ganancia",
      "Compara ventas mes a mes",
      "Sabe en que horario vendes mas",
    ],
  },
  "analytics-bi": {
    title: "Reportes Avanzados",
    benefits: [
      "Ve que productos te dan mas ganancia",
      "Compara ventas mes a mes",
      "Sabe en que horario vendes mas",
    ],
  },
  "finanzas-pro": {
    title: "Contabilidad Completa",
    benefits: [
      "Estado de perdidas y ganancias",
      "Presupuestos mensuales",
      "Facturacion electronica SUNAT",
    ],
  },
  "finanzas": {
    title: "Contabilidad Completa",
    benefits: [
      "Estado de perdidas y ganancias",
      "Presupuestos mensuales",
      "Facturacion electronica SUNAT",
    ],
  },
  "crm-pro": {
    title: "Gestion de Clientes",
    benefits: [
      "Conoce a tus clientes frecuentes",
      "Segmenta por tipo de compra",
      "Programa de puntos y fidelizacion",
    ],
  },
  "crm-clientes": {
    title: "Gestion de Clientes",
    benefits: [
      "Conoce a tus clientes frecuentes",
      "Segmenta por tipo de compra",
      "Programa de puntos y fidelizacion",
    ],
  },
  "marketing": {
    title: "Marketing y Campanas",
    benefits: [
      "Envia promos por WhatsApp",
      "Campanas automaticas",
      "Mide cuantas ventas genera cada promo",
    ],
  },
  "ventas-marketing": {
    title: "Marketing y Campanas",
    benefits: [
      "Envia promos por WhatsApp",
      "Campanas automaticas",
      "Mide cuantas ventas genera cada promo",
    ],
  },
  "logistica-pro": {
    title: "Logistica Avanzada",
    benefits: [
      "Optimiza rutas de delivery",
      "Calendario de entregas",
      "Control de devoluciones",
    ],
  },
  "logistica": {
    title: "Logistica Avanzada",
    benefits: [
      "Optimiza rutas de delivery",
      "Calendario de entregas",
      "Control de devoluciones",
    ],
  },
  "rrhh": {
    title: "Gestion de Personal",
    benefits: [
      "Fichas de empleados",
      "Control de nomina",
      "Comisiones por ventas",
    ],
  },
  "automatizacion": {
    title: "Automatizacion",
    benefits: [
      "Alertas automaticas de stock bajo",
      "Recordatorios de pagos",
      "Tareas y pendientes",
    ],
  },
  "alertas-automatizacion": {
    title: "Automatizacion",
    benefits: [
      "Alertas automaticas de stock bajo",
      "Recordatorios de pagos",
      "Tareas y pendientes",
    ],
  },
};

const DEFAULT_BENEFIT = {
  title: "Funciones Pro",
  benefits: [
    "Acceso a todos los modulos avanzados",
    "Reportes y estadisticas completas",
    "Soporte prioritario",
  ],
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface UpgradeBannerProps {
  /** ID del modulo que requiere plan Pro (coincide con las keys de PRO_BENEFITS) */
  moduleId: string;
  /** Nombre amigable del modulo para el titulo principal */
  moduleName?: string;
  /** Callback al cerrar el banner y quedarse en Plan Basico */
  onDismiss: () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function UpgradeBanner({ moduleId, moduleName, onDismiss }: UpgradeBannerProps) {
  const info = PRO_BENEFITS[moduleId] ?? DEFAULT_BENEFIT;
  const displayName = moduleName ?? info.title;

  return (
    <AnimatePresence>
      <motion.div
        key="upgrade-banner-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Gradiente de fondo */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(135deg, #2d6a4f 0%, #3d8b68 40%, #f4a261 100%)",
            }}
          />

          {/* Patron decorativo sutil */}
          <div className="absolute inset-0 pointer-events-none opacity-10">
            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/20" />
            <div className="absolute -bottom-12 -left-8 w-56 h-56 rounded-full bg-white/10" />
          </div>

          {/* Boton cerrar */}
          <button
            onClick={onDismiss}
            aria-label="Cerrar"
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-white" />
          </button>

          {/* Contenido */}
          <div className="relative z-10 px-7 py-8 flex flex-col items-center text-center">
            {/* Icono de candado */}
            <motion.div
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-5 shadow-lg"
            >
              <Unlock className="h-10 w-10 text-white" strokeWidth={1.5} />
            </motion.div>

            {/* Badge Plan Pro */}
            <span className="inline-block px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase tracking-widest mb-3">
              Plan Pro
            </span>

            {/* Titulo */}
            <h2 className="text-white text-2xl font-extrabold leading-tight mb-2">
              Desbloquea {displayName}
            </h2>

            {/* Subtitulo */}
            <p className="text-white/80 text-sm mb-6">
              Con el Plan Pro tendras acceso a {info.title.toLowerCase()} y mucho mas para hacer crecer tu bodega.
            </p>

            {/* Lista de beneficios */}
            <ul className="w-full text-left space-y-2.5 mb-8">
              {info.benefits.map((benefit, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.18 + i * 0.07, duration: 0.25 }}
                  className="flex items-start gap-3"
                >
                  <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                  </span>
                  <span className="text-white text-sm leading-snug">{benefit}</span>
                </motion.li>
              ))}
            </ul>

            {/* Boton principal */}
            <Link
              href="/pricing"
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-[#2d6a4f] font-bold text-base shadow-lg hover:shadow-xl hover:bg-white/95 active:scale-[0.98] transition-all mb-3"
            >
              Ver planes
              <ArrowRight className="h-4 w-4" />
            </Link>

            {/* Boton secundario */}
            <button
              onClick={onDismiss}
              className="w-full px-6 py-3 rounded-2xl text-white/80 text-sm font-medium hover:text-white hover:bg-white/10 active:scale-[0.98] transition-all"
            >
              Seguir con Plan Basico
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
