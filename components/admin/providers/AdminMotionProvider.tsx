"use client";

/**
 * AdminMotionProvider
 *
 * Wrapper de LazyMotion para el panel de administración.
 * Carga solo las features de `domAnimation` (~16 KB vs ~80 KB del bundle completo
 * de framer-motion) de forma asíncrona, reduciendo el JS inicial del admin.
 *
 * Patrón idéntico al MotionProvider del storefront (@/components/MotionProvider.tsx)
 * pero separado para que el admin layout pueda tener su propio boundary y no depender
 * del store layout.
 *
 * Uso en app/admin/layout.tsx:
 *   import AdminMotionProvider from "@/components/admin/providers/AdminMotionProvider";
 *   // Wrapear children:
 *   <AdminMotionProvider>{children}</AdminMotionProvider>
 *
 * En componentes admin que usen animaciones, reemplazar:
 *   import { motion } from "framer-motion"          // bundle completo — evitar
 * por:
 *   import { m } from "@/components/admin/providers" // usa el LazyMotion boundary
 */

import { LazyMotion, domAnimation } from "framer-motion";

interface AdminMotionProviderProps {
  children: React.ReactNode;
}

export default function AdminMotionProvider({ children }: AdminMotionProviderProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
