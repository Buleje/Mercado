"use client";

/**
 * TestCustomerPanel — SOLO desarrollo local. Activa una sesión de cliente de
 * prueba (cookie real `buleje-customer-sess`) sin registrarse, para probar el
 * flujo de compra completo: en /tiendas, al comprar y "Continuar", NO redirige
 * al login → va directo a /checkout/datos con este cliente ya logueado.
 *
 * Usa POST /api/auth/customer/test-session (gateado a NODE_ENV development/test
 * o ALLOW_E2E_TEST_AUTH=1; en producción ese endpoint devuelve 404). Este panel
 * tampoco se renderiza en producción.
 */

import { useState } from "react";
import Link from "next/link";
import { FlaskConical, Check, ArrowRight, LogOut, Loader2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

const TEST_CUSTOMER = { phone: "999000111", name: "Cliente Prueba", tenantId: "main" };

// El CustomerContext PREFIERE localStorage sobre la cookie. Si hay un cliente
// viejo guardado (de pruebas manuales), gana sobre la sesión de prueba y el
// checkout se confunde. Por eso al activar escribimos el cliente de prueba en
// las claves que leen el context + el checkout, y limpiamos las conflictivas.
const TEST_CUSTOMER_LS = {
  id: TEST_CUSTOMER.phone,
  phone: TEST_CUSTOMER.phone,
  name: TEST_CUSTOMER.name,
  location: "Jr. Ucayali 450, Pucallpa",
  reference: "Frente a la plaza",
};
// Claves de identidad de cliente que pueden tener data vieja conflictiva.
const STALE_CUSTOMER_KEYS = [
  "buleje-customer",
  "marketplace-customer",
  "marketplace-checkout-customer",
  "buleje-checkout-data",
  "buleje-customer-mi-pollo",
];

/** Borra TODA identidad de cliente vieja (cualquier tenant) + las claves de
 *  checkout. El context lee `buleje-{tenant}-customer` y el tenant activo puede
 *  apuntar a otro negocio por logins previos — por eso limpiamos todas. */
function clearAllCustomerIdentities() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (/-customer$/.test(k) || /^(marketplace-customer|marketplace-checkout-customer|buleje-checkout-data)$/.test(k)) {
        localStorage.removeItem(k);
      }
    }
    for (const k of STALE_CUSTOMER_KEYS) localStorage.removeItem(k);
  } catch {
    /* sin localStorage */
  }
}

function writeTestCustomerToStorage() {
  clearAllCustomerIdentities();
  try {
    // Forzar tenant "main" para que getStorageKey() del context apunte a
    // buleje-main-customer (cookie httpOnly:false → escribible desde JS).
    document.cookie = "active-tenant=main; path=/; max-age=604800; samesite=lax";
    document.cookie = "active-tenant-slug=main; path=/; max-age=604800; samesite=lax";
    const v = JSON.stringify(TEST_CUSTOMER_LS);
    localStorage.setItem("buleje-main-customer", v);
    localStorage.setItem("buleje-customer", v);
  } catch {
    /* localStorage no disponible — la cookie de sesión igual sirve */
  }
}

function clearTestCustomerFromStorage() {
  clearAllCustomerIdentities();
}

export default function TestCustomerPanel() {
  const [state, setState] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [msg, setMsg] = useState("");

  // Doble candado: el panel no existe en producción.
  if (process.env.NODE_ENV === "production") return null;

  const activate = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/auth/customer/test-session", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(TEST_CUSTOMER),
      });
      if (res.status === 404) {
        setState("error");
        setMsg("El endpoint está deshabilitado (NODE_ENV no es development/test).");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Cookie + localStorage sincronizados → el context y el checkout usan
      // al cliente de prueba sin race ni conflicto con identidades viejas.
      writeTestCustomerToStorage();
      setState("active");
      setMsg("Sesión activa como «Cliente Prueba». Andá a Tiendas, agregá productos y al continuar irás directo al checkout — sin login.");
    } catch (e) {
      setState("error");
      setMsg(`No se pudo activar: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const deactivate = async () => {
    setState("loading");
    await fetch("/api/auth/logout", { method: "POST", headers: csrfHeaders() }).catch(() => {
      /* best-effort: en dev no bloqueamos la UI si el logout falla */
    });
    clearTestCustomerFromStorage();
    setState("idle");
    setMsg("Sesión de prueba cerrada.");
  };

  return (
    <div className="mb-5 rounded-2xl border-2 border-dashed border-[var(--accent)]/40 bg-[var(--accent-soft)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
            <FlaskConical className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-extrabold text-[var(--text-primary)]">
              Modo prueba — comprar sin registrarse
              <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wide text-white">
                Solo local
              </span>
            </p>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
              Activá un cliente de prueba ya logueado. En Tiendas podrás comprar y llegar
              al checkout sin pasar por login. {state === "active" && msg ? msg : "No funciona en producción."}
            </p>
            {state === "error" && (
              <p className="mt-1 text-xs font-bold text-[var(--data-error-500)]">{msg}</p>
            )}
            {state === "idle" && msg && (
              <p className="mt-1 text-xs font-bold text-[var(--text-tertiary)]">{msg}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {state === "active" ? (
            <>
              <Link
                href="/tiendas"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:opacity-90"
              >
                Ir a comprar
                <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </Link>
              <button
                type="button"
                onClick={deactivate}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                <LogOut className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                Cerrar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={activate}
              disabled={state === "loading"}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {state === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} aria-hidden />
              ) : (
                <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              )}
              Activar usuario de prueba
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
