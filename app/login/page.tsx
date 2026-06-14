/**
 * /login — página de inicio de sesión dedicada (Brandon 2026-06-14). Reemplaza
 * al modal: "Ingresar", el chat sin sesión, checkout, etc. navegan acá.
 * LoginClient usa useSearchParams (next / oauth / name) → va dentro de Suspense.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import LoginClient from "@/components/auth/LoginClient";

export const metadata: Metadata = {
  title: "Ingresar a Buleje",
  description: "Iniciá sesión o creá tu cuenta para comprar en las tiendas de tu barrio.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
