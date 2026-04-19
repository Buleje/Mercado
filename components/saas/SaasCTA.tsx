"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useScroll, useTransform, useReducedMotion } from "framer-motion";

// ─── Animated counter ─────────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1400;
    const step = 16;
    const increment = target / (duration / step);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, step);
    return () => clearInterval(timer);
  }, [inView, target]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SaasCTA() {
  const shineRef = useRef<HTMLSpanElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Scroll-driven scale/opacity para el botón CTA
  // offset: ["start end"] = cuando el top del section llega al bottom del viewport
  //         ["center center"] = cuando el centro del section coincide con centro del viewport
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "center center"],
  });

  // Lejos: scale 0.95 / opacity 0.8 → en viewport: scale 1.0 / opacity 1.0 → centro: scale 1.05
  const buttonScale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    shouldReduceMotion ? [1, 1, 1] : [0.95, 1.0, 1.05]
  );
  const buttonOpacity = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    shouldReduceMotion ? [1, 1, 1] : [0.8, 1.0, 1.0]
  );

  return (
    <section
      ref={sectionRef}
      className="py-20 md:py-28 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #00B4A6 0%, #33C4B8 50%, #2dd4bf 100%)",
      }}
    >
      {/* Variante dark mode: gradiente más oscuro */}
      <div
        aria-hidden="true"
        className="absolute inset-0 dark:block hidden"
        style={{
          background: "linear-gradient(135deg, #0a4f48 0%, #009690 50%, #00B4A6 100%)",
        }}
      />

      {/* Dots pattern sutil — igual que el hero */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Glow decorativo central */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-3xl mx-auto px-5 sm:px-8 lg:px-12 relative text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] }}
          className="flex flex-col items-center gap-5"
        >
          {/* Counter social */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
            style={{
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
            }}
          >
            {/* Avatares apilados — 4 avatares con overlap -ml-2 y borde blanco */}
            <div className="flex -space-x-2">
              {["ML", "CR", "RH", "JP"].map((initials, i) => (
                <div
                  key={initials}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-white shrink-0"
                  style={{
                    background: `hsl(${170 + i * 14}, 58%, ${36 + i * 5}%)`,
                    zIndex: 4 - i,
                    border: "2px solid #fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  }}
                  aria-hidden="true"
                >
                  {initials}
                </div>
              ))}
            </div>
            <span>
              Únete a +<AnimatedCounter target={50} /> bodegas que ya gestionan todo
            </span>
          </motion.div>

          {/* Titulo */}
          <h2
            className="font-extrabold text-white"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
              letterSpacing: "-0.02em",
            }}
          >
            ¿Listo para modernizar tu bodega?
          </h2>

          {/* Subtitulo */}
          <p
            className="text-white/80 max-w-xl"
            style={{ fontSize: "clamp(1rem, 1.5vw, 1.1rem)", lineHeight: 1.75 }}
          >
            Únete a las bodegas que ya gestionan todo desde su celular
          </p>

          {/* CTA button: scroll-driven scale/opacity + hover + shine */}
          <motion.a
            href="/registro"
            whileHover={{ scale: 1.02, boxShadow: "0 24px 48px -8px rgba(0,0,0,0.35)" }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="inline-flex items-center justify-center min-h-[56px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white relative overflow-hidden"
            style={{
              background: "#fff",
              color: "#00B4A6",
              borderRadius: "1rem",
              padding: "1rem 2.5rem",
              fontSize: "1.125rem",
              fontWeight: 800,
              boxShadow: "0 8px 24px -4px rgba(0,0,0,0.2)",
              textDecoration: "none",
              whiteSpace: "nowrap",
              // Scroll-driven: escala de 0.95 → 1.05 conforme entra en viewport
              scale: buttonScale,
              opacity: buttonOpacity,
              willChange: "transform, opacity",
            }}
          >
            {/* Shine effect — recorre el botón cada 3 segundos */}
            <motion.span
              ref={shineRef}
              aria-hidden="true"
              className="absolute top-0 bottom-0 w-1/3 pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.65) 50%, transparent 100%)",
                skewX: "-12deg",
              }}
              animate={{ left: ["-50%", "160%"] }}
              transition={{
                duration: 0.6,
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 2.4,
              }}
            />
            <span className="relative">Empezar gratis ahora →</span>
          </motion.a>

          {/* Garantías */}
          <p className="text-white/60 text-sm">
            Sin tarjeta de crédito · Gratis para siempre · Cancela cuando quieras
          </p>
        </motion.div>
      </div>
    </section>
  );
}
