/**
 * lib/tienda-cliente/cuenta-recordada.ts — «Continuar como Ana · an•••@gmail.com»
 * en las tiendas (17-10).
 *
 * Al entrar con Google, ESTE navegador recuerda la cuenta para el próximo
 * ingreso. Ley 29733: el recuerdo es local (localStorage), lleva lo mínimo y
 * se borra con «Olvidar» (o «No soy yo»):
 *   · nombre y foto (lo que Google ya muestra en su propio selector),
 *   · el correo ENMASCARADO (`an•••@gmail.com`), nunca entero,
 *   · `pista`: el `sub` de Google (un número opaco). Es lo que Google acepta
 *     como `login_hint` para no volver a elegir la cuenta; no es un token, no
 *     abre sesión ni se puede usar para entrar en nombre de nadie.
 * Nunca tokens ni cookies.
 *
 * Funciones puras con el almacén inyectable: los tests pasan uno propio.
 */
import { z } from "zod";
import type { ClienteTienda } from "./contrato";

export const CLAVE_CUENTA_RECORDADA = "tienda:cuenta-google";
/** Se dispara en `window` al guardar o borrar (la pestaña actual; otras pestañas oyen `storage`). */
export const EVENTO_CUENTA_RECORDADA = "tienda:cuenta-google-cambio";

export interface CuentaRecordada {
  nombre: string;
  /** Enmascarado: `an•••@gmail.com`. */
  correo: string | null;
  /** Foto de Google (https) o null. */
  foto: string | null;
  /** `sub` de Google para `login_hint`; null si no se conoce. */
  pista: string | null;
  /** Entró y no salió: el globito de Google no se ofrece. */
  conectado: boolean;
  /** `auto_select` del globito: false después de «Salir» hasta que vuelva a entrar. */
  autoEntrar: boolean;
}

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PISTA = /^[\w.-]{1,255}$/;

/** Foto de perfil de Google: sólo https de `*.googleusercontent.com` (security 17-10). */
export function fotoDeGoogle(url: string | null | undefined): string | null {
  if (!url || url.length > 500) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "googleusercontent.com" || u.hostname.endsWith(".googleusercontent.com"))
      ? url
      : null;
  } catch {
    return null;
  }
}

const esquema = z.object({
  v: z.literal(1),
  nombre: z.string().min(1).max(80),
  correo: z.string().max(120).nullable(),
  foto: z.string().max(500).nullable(),
  pista: z.string().regex(PISTA).nullable(),
  conectado: z.boolean(),
  autoEntrar: z.boolean(),
});

/** `brandon@gmail.com` → `br•••@gmail.com`; `al@x.pe` → `a•••@x.pe`. El largo no se delata. */
export function enmascararCorreo(email: string | null | undefined): string | null {
  const limpio = email?.trim();
  if (!limpio) return null;
  const arroba = limpio.lastIndexOf("@");
  if (arroba < 1 || arroba === limpio.length - 1) return null;
  const usuario = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1).toLowerCase();
  return `${usuario.slice(0, usuario.length > 3 ? 2 : 1)}•••@${dominio}`;
}

function almacenDelNavegador(): Almacen | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // Safari privado / almacenamiento bloqueado
  }
}

/** El texto guardado tal cual (instantánea estable para `useSyncExternalStore`). */
export function leerCrudoCuentaRecordada(a: Almacen | null = almacenDelNavegador()): string | null {
  try {
    return a?.getItem(CLAVE_CUENTA_RECORDADA) ?? null;
  } catch {
    return null;
  }
}

export function parsearCuentaRecordada(crudo: string | null): CuentaRecordada | null {
  if (!crudo) return null;
  try {
    const r = esquema.safeParse(JSON.parse(crudo));
    if (!r.success) return null;
    const { nombre, correo, foto, pista, conectado, autoEntrar } = r.data;
    return { nombre, correo, foto: fotoDeGoogle(foto), pista, conectado, autoEntrar };
  } catch {
    return null;
  }
}

export function leerCuentaRecordada(a: Almacen | null = almacenDelNavegador()): CuentaRecordada | null {
  return parsearCuentaRecordada(leerCrudoCuentaRecordada(a));
}

function avisar(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_CUENTA_RECORDADA));
}

function escribir(cuenta: CuentaRecordada | null, a: Almacen): void {
  const nuevo = cuenta ? JSON.stringify({ v: 1, ...cuenta }) : null;
  if (nuevo === leerCrudoCuentaRecordada(a)) return; // nada cambió: sin aviso (evita re-render en bucle)
  try {
    if (nuevo) a.setItem(CLAVE_CUENTA_RECORDADA, nuevo);
    else a.removeItem(CLAVE_CUENTA_RECORDADA);
  } catch {
    return; // almacén lleno o bloqueado: no se recuerda, la tienda sigue igual
  }
  avisar();
}

/** Guarda (o refresca) la cuenta que acaba de entrar. */
export function recordarCuenta(
  cliente: ClienteTienda,
  pista: string | null | undefined,
  a: Almacen | null = almacenDelNavegador(),
): void {
  if (!a) return;
  const nombre = cliente.nombre.trim().slice(0, 80);
  if (!nombre) return;
  const correo = enmascararCorreo(cliente.email);
  const previa = leerCuentaRecordada(a);
  const pistaValida = pista && PISTA.test(pista) ? pista : null;
  escribir(
    {
      nombre,
      correo,
      foto: fotoDeGoogle(cliente.avatar),
      // Sin pista nueva, la de antes sirve sólo si es la misma cuenta.
      pista: pistaValida ?? (previa && previa.correo === correo ? previa.pista : null),
      conectado: true,
      autoEntrar: true,
    },
    a,
  );
}

/** «Salir»: se sigue recordando para «Continuar como…», pero sin entrar solo. */
export function marcarSalida(a: Almacen | null = almacenDelNavegador()): void {
  if (!a) return;
  const previa = leerCuentaRecordada(a);
  if (previa) escribir({ ...previa, conectado: false, autoEntrar: false }, a);
}

/** La sesión venció sola (sin «Salir»): el globito vuelve a ofrecerse y puede entrar solo. */
export function marcarSinSesion(a: Almacen | null = almacenDelNavegador()): void {
  if (!a) return;
  const previa = leerCuentaRecordada(a);
  if (previa?.conectado) escribir({ ...previa, conectado: false }, a);
}

/** «Olvidar» / «No soy yo»: borra todo rastro de la cuenta en este navegador. */
export function olvidarCuenta(a: Almacen | null = almacenDelNavegador()): void {
  if (a) escribir(null, a);
}

export function suscribirCuentaRecordada(alCambiar: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const alGuardar = (e: StorageEvent) => {
    if (e.key === null || e.key === CLAVE_CUENTA_RECORDADA) alCambiar();
  };
  window.addEventListener(EVENTO_CUENTA_RECORDADA, alCambiar);
  window.addEventListener("storage", alGuardar);
  return () => {
    window.removeEventListener(EVENTO_CUENTA_RECORDADA, alCambiar);
    window.removeEventListener("storage", alGuardar);
  };
}
