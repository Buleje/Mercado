"use client";

/**
 * Accesos directos de la cabecera, al lado del buscador (Brandon 2026-10-10;
 * barra recortada el 20-10: «quita los íconos de asistencia, caja y abierto
 * hace poco y solo pon el de cámara y de accesos directos»).
 *
 * - A la vista: Cámaras (si el rol la ve) y el botón «Accesos directos». Los
 *   demás anclados que la persona elija vuelven a la barra sólo con lugar
 *   (cabecera ≥ 56 rem: la consulta de contenedor mide la caja SIN el padding,
 *   956 px a 1280 con la barra lateral; medido 10-10).
 * - El botón abre un menú con TODOS los accesos del rol (`PanelAccesos`), las
 *   opciones de Cámaras cuando Cámaras no está en la barra, «Recientes» (lo que
 *   antes era el reloj suelto de la cabecera) y «Elegir los de la barra».
 * - Sin accesos ni recientes que mostrar (rol sin confirmar), no se dibuja nada.
 * - Cada acceso abre su módulo EN UN MODAL sobre la pantalla actual
 *   (`AccesoEnModal`, Brandon 10-10): no se navega. El módulo se baja recién
 *   al abrirlo (`next/dynamic` dentro de `AccesoEnModal`).
 * - Cámaras lleva un contador de avisos de movimiento sin ver (la burbuja que
 *   mira en segundo plano, `use-avisos-camaras.ts`); abrir Cámaras los da por
 *   vistos. Si Cámaras no está a la vista, el contador va sobre el botón.
 * - En la barra, Cámaras es un menú (`MenuCamaras`: ver todas en vivo,
 *   visitantes de hoy, sonido…).
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid } from "@buleje/design-system/icons";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { useRecientes } from "@/hooks/use-recientes-panel";
import { leerContadorDeUso } from "@/hooks/use-uso-de-pestanas";
import { masUsadas as calcularMasUsadas, recientesSinRepetidos } from "@/lib/admin/mas-usadas";
import { entradaDeUrl } from "@/lib/admin/recientes-panel";
import { cn } from "@/lib/utils";
import { etiquetaDeTab } from "@/components/admin/buscador/indice-modulos";
import type { AccesoRapido } from "./accesos-rapidos";
import { useAccesosRapidos } from "./use-accesos-rapidos";
import { ContadorAvisos } from "./AvisosCamarasUI";
import MenuCamaras from "./MenuCamaras";
import type { OpcionCamaras } from "./opciones-camaras";
import PanelAccesos from "./PanelAccesos";
import { marcarVistosAvisosCamaras } from "./use-avisos-camaras";
import { useCamarasCabecera } from "./use-camaras-cabecera";

const AccesoEnModal = dynamic(() => import("./AccesoEnModal"), { ssr: false });
const AjustesSonidoCamaras = dynamic(() => import("./AjustesSonidoCamaras"), { ssr: false });

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

/** El lugar donde estás, para no ofrecerlo entre los recientes. */
const lugarActual = () =>
  entradaDeUrl(window.location.pathname + window.location.search, etiquetaDeTab)?.href ?? null;

export default function AccesosRapidos({ onDarkHeader = false }: Props) {
  const { permitidos, enLaBarra, anclados, alternarAnclado } = useAccesosRapidos();
  const { recientes, listo, borrar } = useRecientes();
  const [abierto, setAbierto] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [aca, setAca] = useState<string | null>(null);
  const [enModal, setEnModalCrudo] = useState<AccesoRapido | null>(null);
  const cerrarModal = useCallback(() => setEnModalCrudo(null), []);
  /* Abrir Cámaras = mirar: los avisos sin ver quedan vistos. */
  const setEnModal = useCallback((a: AccesoRapido) => {
    if (a.id === "camaras") marcarVistosAvisosCamaras();
    setEnModalCrudo(a);
  }, []);
  /* Se lee al abrir (no mientras clicas): el contador vive en el navegador. */
  const usadas = useMemo(
    () => (abierto ? calcularMasUsadas(leerContadorDeUso(), etiquetaDeTab, [aca]) : []),
    [abierto, aca],
  );
  const camaras = permitidos.find((a) => a.id === "camaras") ?? null;
  const cam = useCamarasCabecera(camaras, setEnModal);
  /* Cámaras va a la vista en todo ancho: si está en la barra, el contador es suyo. */
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

  if (permitidos.length === 0 && !listo) return null;
  const tono = onDarkHeader ? OSCURO : CLARO;

  /* Desde el menú: el foco vuelve al botón ANTES de abrir, así el modal lo
     devuelve ahí al cerrar (el ítem del menú ya no existe). */
  const cerrarMenu = () => {
    setAbierto(false);
    botonRef.current?.focus();
  };
  const abrirDesdeMenu = (a: AccesoRapido) => {
    cerrarMenu();
    setEnModal(a);
  };
  const elegirDeCamaras = (o: OpcionCamaras) => {
    cerrarMenu();
    o.accion();
  };
  /* Volver sin recargar: la pantalla de donde sales conserva su búsqueda y filtros. */
  const volverA = (href: string) => {
    setAbierto(false);
    irAEnlace(href);
  };
  const borrarRecientes = () => {
    borrar();
    cerrarMenu();
  };
  const etiqueta =
    cam.sinVer > 0 && !camarasEnBarra
      ? `Accesos directos, ${cam.sinVer} ${cam.sinVer === 1 ? "aviso" : "avisos"} de cámaras sin ver`
      : "Accesos directos";

  return (
    <div className="flex shrink-0 items-center gap-1">
      {enLaBarra.length > 0 && (
        <ul className="flex items-center gap-1" aria-label="Accesos anclados">
          {enLaBarra.map((a) =>
            a.id === "camaras" ? (
              <li key={a.id}>
                <MenuCamaras acceso={a} cam={cam} className={BOTON} tono={tono} />
              </li>
            ) : (
              <li key={a.id} className="hidden @min-[56rem]:block">
                <AdminTooltip content={`${a.label} · ${a.hint}`} side="bottom" className="text-sm">
                  <button
                    type="button"
                    onClick={() => setEnModal(a)}
                    aria-label={a.label}
                    aria-haspopup="dialog"
                    className={cn(BOTON, tono)}
                  >
                    <a.icon className="h-5 w-5" aria-hidden />
                  </button>
                </AdminTooltip>
              </li>
            ),
          )}
        </ul>
      )}

      {/* `max-sm:static`: en celular el menú se ancla a la cabecera entera (borde a borde), no al botón. */}
      <div ref={raizRef} className="relative max-sm:static">
        <AdminTooltip content="Accesos directos" side="bottom" className="text-sm">
          <button
            ref={botonRef}
            type="button"
            onClick={() => {
              setEligiendo(false);
              if (!abierto) setAca(lugarActual());
              setAbierto((v) => !v);
            }}
            aria-haspopup="menu"
            aria-expanded={abierto}
            aria-label={etiqueta}
            className={cn(
              BOTON,
              "relative",
              abierto ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : tono,
              // En celular, el mismo lenguaje que la hamburguesa y la lupa.
              "max-sm:bg-primary/10 max-sm:text-[var(--accent-ink)] max-sm:ring-1 max-sm:ring-[var(--accent)]/20",
            )}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden />
            {!camarasEnBarra && <ContadorAvisos n={cam.sinVer} />}
          </button>
        </AdminTooltip>

        {abierto && (
          <PanelAccesos
            permitidos={permitidos}
            anclados={anclados}
            eligiendo={eligiendo}
            onAlternarEligiendo={() => setEligiendo((v) => !v)}
            onAlternarAnclado={alternarAnclado}
            onAbrir={abrirDesdeMenu}
            cam={cam}
            opcionesDeCamaras={camaras !== null && !camarasEnBarra}
            onElegirDeCamaras={elegirDeCamaras}
            recientes={
              listo ? { lista: recientesSinRepetidos(recientes.filter((r) => r.href !== aca), usadas), hayGuardados: recientes.length > 0 } : null
            }
            masUsadas={usadas}
            onVolverA={volverA}
            onBorrarRecientes={borrarRecientes}
          />
        )}
      </div>
      {enModal && <AccesoEnModal acceso={enModal} onCerrar={cerrarModal} />}
      {cam.ajustesAbiertos && (
        <AjustesSonidoCamaras
          open
          onClose={cam.cerrarAjustes}
          silencioHasta={cam.silencioHasta}
          silencioMovimientoHasta={cam.silencioMovimientoHasta}
        />
      )}
    </div>
  );
}
