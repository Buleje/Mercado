"use client";

/**
 * El contenido del menú de cuenta (el mismo en la lista que cae desde la
 * cabecera y en la hoja que sube en el celular).
 *
 * Tres grupos cortos, como Natura/Falabella/Sephora: lo que compraste
 * (pedidos · favoritos · puntos), lo tuyo (datos y direcciones · ayuda) y
 * aparte salir. «Mi panel» sólo para el dueño o encargado de ESTA tienda.
 */

import {
  ChevronRight,
  Heart,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Package,
  Sparkles,
  UserCircle,
  type LucideIcon,
} from "@buleje/design-system/icons";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { EntrarCuenta } from "./EntrarCuenta";
import { DESTINOS, enlaceAyuda, esDuenoDe, primerNombre, rutaCuenta } from "./cuenta-rutas";
import type { DatosCuenta } from "./use-datos-cuenta";

const FILA =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium text-[var(--text-primary)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]";

interface Opcion {
  clave: string;
  texto: string;
  href: string;
  Icono: LucideIcon;
  /** Cifra a la derecha (favoritos guardados). */
  cifra?: number;
  externo?: boolean;
}

function Fila({ opcion, onElegir }: { opcion: Opcion; onElegir: () => void }) {
  const { texto, href, Icono, cifra, externo } = opcion;
  const contenido = (
    <>
      <Icono className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={1.9} aria-hidden="true" />
      <span className="flex-1">{texto}</span>
      {typeof cifra === "number" && cifra > 0 && (
        <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
          {cifra}
        </span>
      )}
    </>
  );
  return (
    <li>
      {externo ? (
        <a href={href} onClick={onElegir} className={FILA} target="_blank" rel="noopener noreferrer">
          {contenido}
          <span className="sr-only"> (se abre WhatsApp)</span>
        </a>
      ) : (
        // Navegación sin recargar: el cliente no espera la tienda entera otra vez.
        <Link href={href} onClick={onElegir} className={FILA}>
          {contenido}
        </Link>
      )}
    </li>
  );
}

export interface PanelCuentaProps {
  datos: DatosCuenta;
  onCerrar: () => void;
}

export function PanelCuenta({ datos, onCerrar }: PanelCuentaProps) {
  const { base, nombre, conSesion, favoritos, whatsapp, negocio, salir } = datos;
  // Se lee al abrir (el panel sólo existe abierto, en el navegador): un ingreso en otra pestaña ya cuenta.
  const esDueno = esDuenoDe(negocio);
  const ayuda = enlaceAyuda(whatsapp, nombre);

  const compras: Opcion[] = [
    { clave: "pedidos", texto: "Mis pedidos", href: rutaCuenta(base, DESTINOS.pedidos), Icono: Package },
    // Sólo si hay algo guardado en lo que `/favoritos` muestra: nunca un atajo a una página vacía.
    ...(favoritos > 0
      ? [{ clave: "favoritos", texto: "Favoritos", href: rutaCuenta(base, DESTINOS.favoritos), Icono: Heart, cifra: favoritos }]
      : []),
    { clave: "puntos", texto: "Mis puntos", href: rutaCuenta(base, DESTINOS.puntos), Icono: Sparkles },
  ];
  const tuyo: Opcion[] = [
    { clave: "datos", texto: "Mis datos y direcciones", href: rutaCuenta(base, DESTINOS.datos), Icono: UserCircle },
    ayuda
      ? { clave: "ayuda", texto: "Ayuda por WhatsApp", href: ayuda, Icono: MessageCircle, externo: true }
      : { clave: "ayuda", texto: "Ayuda", href: rutaCuenta(base, DESTINOS.ayuda), Icono: MessageCircle },
  ];

  const saludo = primerNombre(nombre);
  return (
    <div className="flex flex-col">
      {conSesion ? (
        <Link
          href={rutaCuenta(base, DESTINOS.cuenta)}
          onClick={onCerrar}
          className="group flex items-center gap-3 rounded-xl p-3 transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-lg font-semibold text-[var(--text-primary)] ring-1 ring-[var(--accent)]"
          >
            {(saludo ?? "?").charAt(0).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-semibold text-[var(--text-primary)]">Hola, {saludo}</span>
            <span className="text-sm text-[var(--text-secondary)]">Ver mi cuenta</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        </Link>
      ) : (
        <EntrarCuenta className="p-3" />
      )}

      <nav aria-label="Tu cuenta">
        <ul className="flex flex-col border-t border-[var(--rule-soft)] py-1.5">
          {compras.map((o) => (
            <Fila key={o.clave} opcion={o} onElegir={onCerrar} />
          ))}
        </ul>
        <ul className="flex flex-col border-t border-[var(--rule-soft)] py-1.5">
          {tuyo.map((o) => (
            <Fila key={o.clave} opcion={o} onElegir={onCerrar} />
          ))}
        </ul>
      </nav>

      {(esDueno || conSesion) && (
        <div className="flex flex-col border-t border-[var(--rule-soft)] pt-1.5">
          {esDueno && (
            <a href="/admin" className={FILA} onClick={onCerrar}>
              <LayoutDashboard className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={1.9} aria-hidden="true" />
              <span className="flex-1">Mi panel</span>
              {/* Con el color del negocio (su acento), nunca el turquesa fijo de la bodega. */}
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-sm font-semibold text-[var(--text-primary)] ring-1 ring-[var(--accent)]">
                Dueño
              </span>
            </a>
          )}
          {conSesion && (
            <button type="button" onClick={salir} className={cn(FILA, "text-[var(--text-secondary)]")}>
              <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              Salir
            </button>
          )}
        </div>
      )}
    </div>
  );
}
