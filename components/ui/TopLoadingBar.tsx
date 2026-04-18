"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * TopLoadingBar — barra de progreso fina en la parte superior de la pantalla
 * que se activa en cada cambio de ruta del App Router.
 *
 * Usa usePathname() para detectar navegaciones: cada vez que el pathname
 * cambia, React re-ejecuta el efecto y simula un progreso incremental
 * (30% → 60% → 90% → 100%) antes de ocultarse.
 *
 * z-[9999] para que quede por encima del navbar (z-50) y cualquier modal.
 * aria-hidden porque es puramente decorativo — no aporta info de accesibilidad.
 */
export default function TopLoadingBar() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setLoading(true);
    setProgress(30);

    const t1 = setTimeout(() => setProgress(60), 100);
    const t2 = setTimeout(() => setProgress(90), 300);
    const t3 = setTimeout(() => {
      setProgress(100);
      // Pequeña pausa para que el 100% sea visible antes de ocultar
      const t4 = setTimeout(() => setLoading(false), 200);
      return () => clearTimeout(t4);
    }, 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [pathname]);

  if (!loading) return null;

  return (
    <div
      aria-hidden="true"
      role="presentation"
      className="fixed top-0 left-0 right-0 z-[9999] h-0.5 pointer-events-none"
    >
      <div
        className="h-full transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          background: "linear-gradient(90deg, var(--color-primary) 0%, #3B82F6 50%, #8B5CF6 100%)",
        }}
      />
    </div>
  );
}
