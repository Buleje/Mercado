/**
 * Las opciones de Cámaras de la cabecera, en UN lugar: las dibuja el menú que
 * se abre al pasar el mouse (`MenuCamaras`) y las filas del panel «Accesos»
 * en celular. Primero lo que pide acción (sonido bloqueado, cámaras en pausa),
 * después lo de siempre, al final los ajustes.
 */
import {
  BellOff,
  BellRing,
  Camera,
  LayoutGrid,
  Play,
  SlidersHorizontal,
  Users,
  VolumeX,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { horaLima } from "@/lib/camaras/avisos-segundo-plano";
import type { CamarasCabecera } from "./use-camaras-cabecera";
import { reactivarAvisosCamaras, silenciarAlarmasCamaras, verCamaras } from "./use-avisos-camaras";

export interface OpcionCamaras {
  id: string;
  icon: LucideIcon;
  label: string;
  /** Una línea corta debajo (sólo en las que piden acción o traen un dato). */
  detalle?: string;
  /** Pide acción: va en tono de advertencia. */
  aviso?: boolean;
  ocupado?: boolean;
  /** Raya antes de esta opción (separa los ajustes). */
  separar?: boolean;
  /** Abre una ventana (para `aria-haspopup`). */
  abreVentana?: boolean;
  accion: () => void;
}

export function opcionesCamaras(cam: CamarasCabecera, ahora = Date.now()): OpcionCamaras[] {
  const lista: OpcionCamaras[] = [];
  if (cam.estadoAudio === "bloqueado") {
    lista.push({
      id: "activar-sonido",
      icon: VolumeX,
      label: "Activa el sonido",
      detalle: "Las alarmas están mudas",
      aviso: true,
      accion: cam.activarSonido,
    });
  }
  if (cam.pausado) {
    lista.push({
      id: "seguir",
      icon: Play,
      label: "Seguir vigilando",
      detalle: "Las cámaras se pausaron",
      aviso: true,
      accion: cam.seguirVigilando,
    });
  }
  lista.push(
    { id: "en-vivo", icon: LayoutGrid, label: "Ver todas en vivo", ocupado: cam.abriendoMosaico, accion: cam.verTodas },
    { id: "visitantes", icon: Users, label: "Visitantes de hoy", abreVentana: true, accion: cam.visitantes },
    { id: "abrir", icon: Camera, label: "Abrir Cámaras", abreVentana: true, accion: cam.abrir },
  );
  if (cam.sinVer > 0) {
    const ultimo = cam.resumen?.split(" · ")[1];
    lista.push({
      id: "sin-ver",
      icon: BellRing,
      label: cam.sinVer === 1 ? "1 aviso sin ver" : `${cam.sinVer} avisos sin ver`,
      detalle: ultimo ? ultimo.charAt(0).toUpperCase() + ultimo.slice(1) : undefined,
      accion: verCamaras,
    });
  }
  const silenciado = cam.silencioHasta > ahora;
  const movimientoCallado = cam.silencioMovimientoHasta > ahora;
  lista.push(
    {
      id: "ajustes",
      icon: SlidersHorizontal,
      label: "Sonido y avisos",
      separar: true,
      abreVentana: true,
      accion: cam.abrirAjustes,
    },
    silenciado
      ? {
          id: "silencio",
          icon: BellRing,
          label: "Reactivar alarmas",
          detalle: `Todas en silencio hasta las ${horaLima(cam.silencioHasta)}`,
          accion: reactivarAvisosCamaras,
        }
      : {
          id: "silencio",
          icon: BellOff,
          /* Calla TODO (también personas): lo dice. El del mensaje de movimiento calla sólo eso. */
          label: "Silenciar alarmas 1 h",
          detalle: movimientoCallado ? `Movimiento ya callado hasta las ${horaLima(cam.silencioMovimientoHasta)}` : undefined,
          accion: () => silenciarAlarmasCamaras(),
        },
  );
  return lista;
}
