"use client";

/**
 * Accesos rápidos al lado de «Buscar módulos» (Brandon 2026-10-10).
 *
 * - Con lugar (cabecera ≥ 56 rem) los anclados van a la vista, ícono de 48 px
 *   con tooltip y nombre accesible. La consulta de contenedor mide la caja SIN
 *   el padding: a 1280 px con la barra lateral son 956 px, y con 60 rem
 *   (960) la fila no salía nunca (medido 10-10).
 * - Siempre hay un botón «Accesos» con TODOS los que el rol ve; a 400 px es
 *   lo único que se ve (no amontona la cabecera). Desde ahí se eligen los de
 *   la barra («Elegir los de la barra»).
 * - Sin ningún acceso permitido (rol sin confirmar, o un rol que no ve
 *   ninguno), no se dibuja nada.
 * - Cada acceso abre su módulo EN UN MODAL sobre la pantalla actual
 *   (`AccesoEnModal`, Brandon 10-10): no se navega. El módulo se baja recién
 *   al abrirlo (`next/dynamic` dentro de `AccesoEnModal`).
 * - Cámaras lleva un contador de avisos de movimiento sin ver (la burbuja que
 *   mira en segundo plano, `use-avisos-camaras.ts`); abrir Cámaras los da por
 *   vistos. Si Cámaras no está a la vista, el contador va sobre «Accesos».
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LayoutGrid, Pin } from "@buleje/design-system/icons";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { cn } from "@/lib/utils";
import type { AccesoRapido } from "./accesos-rapidos";
import { useAccesosRapidos } from "./use-accesos-rapidos";
import { ContadorAvisos, FilaSilencioAvisos, TONO_CONTADOR } from "./AvisosCamarasUI";
import { marcarVistosAvisosCamaras, useAvisosCamaras } from "./use-avisos-camaras";

const AccesoEnModal = dynamic(() => import("./AccesoEnModal"), { ssr: false });

interface Props {
  /** Cabecera oscura propia (temas Buleje/Ejecutivo del sidebar), como la campana. */
  onDarkHeader?: boolean;
}

const BOTON =
  "grid h-12 w-12 shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
const CLARO =
  "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]";
// En celular la cabecera es SIEMPRE clara (AdminTopHeader): el tono oscuro sólo desde sm.
const OSCURO = cn(CLARO, "sm:text-white/70 sm:hover:bg-white/10 sm:hover:text-white");

export default function AccesosRapidos({ onDarkHeader = false }: Props) {
  const { permitidos, enLaBarra, anclados, alternarAnclado } = useAccesosRapidos();
  const [abierto, setAbierto] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [enModal, setEnModalCrudo] = useState<AccesoRapido | null>(null);
  const cerrarModal = useCallback(() => setEnModalCrudo(null), []);
  /* Abrir Cámaras = mirar: los avisos sin ver quedan vistos. */
  const setEnModal = useCallback((a: AccesoRapido) => {
    if (a.id === "camaras") marcarVistosAvisosCamaras();
    setEnModalCrudo(a);
  }, []);
  const camaras = permitidos.find((a) => a.id === "camaras") ?? null;
  const abrirCamaras = useCallback(() => {
    if (camaras) setEnModal(camaras);
  }, [camaras, setEnModal]);
  const avisos = useAvisosCamaras(camaras !== null, abrirCamaras);
  /* El contador va sobre «Accesos» si Cámaras no está en la barra, o la barra no entra (< 56 rem). */
  const camarasEnBarra = enLaBarra.some((a) => a.id === "camaras");
  const raizRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setAbierto(false);
      botonRef.current?.focus();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  if (permitidos.length === 0) return null;
  const tono = onDarkHeader ? OSCURO : CLARO;

  /* Desde el menú: el foco vuelve al botón «Accesos» ANTES de abrir, así el
     modal lo devuelve ahí al cerrar (el ítem del menú ya no existe). */
  const abrirDesdeMenu = (a: AccesoRapido) => {
    setAbierto(false);
    botonRef.current?.focus();
    setEnModal(a);
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      {enLaBarra.length > 0 && (
        <ul className="hidden items-center gap-1 @min-[56rem]:flex" aria-label="Accesos anclados">
          {enLaBarra.map((a) => {
            const n = a.id === "camaras" ? avisos.sinVer : 0;
            return (
              <li key={a.id}>
                <AdminTooltip
                  content={`${a.label} · ${n > 0 && avisos.resumen ? avisos.resumen : a.hint}`}
                  side="bottom"
                  className="text-sm"
                >
                  <button
                    type="button"
                    onClick={() => setEnModal(a)}
                    aria-label={n > 0 ? `${a.label}, ${n} ${n === 1 ? "aviso" : "avisos"} sin ver` : a.label}
                    aria-haspopup="dialog"
                    className={cn(BOTON, tono, "relative")}
                  >
                    <a.icon className="h-5 w-5" aria-hidden />
                    <ContadorAvisos n={n} />
                  </button>
                </AdminTooltip>
              </li>
            );
          })}
        </ul>
      )}

      {/* `max-sm:static`: en celular el menú se ancla a la cabecera entera (borde a borde), no al botón. */}
      <div ref={raizRef} className="relative max-sm:static">
        <AdminTooltip content="Accesos rápidos" side="bottom" className="text-sm">
          <button
            ref={botonRef}
            type="button"
            onClick={() => {
              setEligiendo(false);
              setAbierto((v) => !v);
            }}
            aria-haspopup="menu"
            aria-expanded={abierto}
            aria-label={
              avisos.sinVer > 0
                ? `Accesos rápidos, ${avisos.sinVer} ${avisos.sinVer === 1 ? "aviso" : "avisos"} de cámaras sin ver`
                : "Accesos rápidos"
            }
            className={cn(
              BOTON,
              "relative",
              abierto ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : tono,
              // En celular, el mismo lenguaje que la hamburguesa y la lupa.
              "max-sm:bg-primary/10 max-sm:text-[var(--accent-ink)] max-sm:ring-1 max-sm:ring-[var(--accent)]/20",
            )}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden />
            <ContadorAvisos n={avisos.sinVer} className={cn(camarasEnBarra && "@min-[56rem]:hidden")} />
          </button>
        </AdminTooltip>

        {abierto && (
          <div
            role="menu"
            aria-label="Accesos rápidos"
            className={cn(
              "absolute left-0 top-full z-50 mt-2 w-80 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]",
              "max-sm:left-3 max-sm:right-3 max-sm:w-auto",
            )}
          >
            <p className="px-2 pb-2 pt-1 text-sm font-bold text-[var(--text-primary)]">
              {eligiendo ? "Elige los de la barra" : "Accesos rápidos"}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {permitidos.map((a) => {
                const anclado = anclados.has(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    role={eligiendo ? "menuitemcheckbox" : "menuitem"}
                    aria-checked={eligiendo ? anclado : undefined}
                    title={a.hint}
                    onClick={() => (eligiendo ? alternarAnclado(a.id) : abrirDesdeMenu(a))}
                    className={cn(
                      "relative flex min-h-14 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-[var(--text-primary)] transition-colors",
                      "hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                      eligiendo &&
                        anclado &&
                        "bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/40",
                    )}
                  >
                    <a.icon
                      className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 leading-tight">{a.label}</span>
                    {a.id === "camaras" && !eligiendo && avisos.sinVer > 0 && (
                      <span className={cn("shrink-0 rounded-full px-1.5 text-sm font-bold tabular-nums", TONO_CONTADOR)}>
                        {avisos.sinVer > 9 ? "9+" : avisos.sinVer}
                        <span className="sr-only"> sin ver</span>
                      </span>
                    )}
                    {eligiendo ? (
                      <span
                        aria-hidden
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                          anclado
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-[var(--rule-strong)]",
                        )}
                      >
                        {anclado && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                    ) : (
                      anclado && (
                        <Pin
                          className="h-4 w-4 shrink-0 text-[var(--text-secondary)]"
                          aria-label="En la barra"
                        />
                      )
                    )}
                  </button>
                );
              })}
            </div>
            {camaras && !eligiendo && <FilaSilencioAvisos silencioHasta={avisos.silencioHasta} />}
            <button
              type="button"
              role="menuitem"
              onClick={() => setEligiendo((v) => !v)}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              {eligiendo ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Pin className="h-4 w-4" aria-hidden />
              )}
              {eligiendo ? "Listo" : "Elegir los de la barra"}
            </button>
          </div>
        )}
      </div>
      {enModal && <AccesoEnModal acceso={enModal} onCerrar={cerrarModal} />}
    </div>
  );
}
