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
  ImageIcon,
  LayoutGrid,
  Play,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Smartphone,
  Users,
  VolumeX,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { horaLima } from "@/lib/camaras/avisos-segundo-plano";
import { nombresDe, sinDeteccion } from "@/lib/camaras/movimientos-nube";
import { logger } from "@/lib/logger";
import type { CamarasCabecera } from "./use-camaras-cabecera";
import { reactivarAvisosCamaras, silenciarAlarmasCamaras, verCamaras } from "./use-avisos-camaras";
import {
  fijarAvisosNube,
  fijarMovimientoCelular,
  prenderDeteccion,
  silenciarCelular,
  verFotoUltimoMovimiento,
} from "./use-movimientos-nube";

const lanzarPrenderDeteccion = () => {
  prenderDeteccion().catch((err: unknown) =>
    logger.warn("[camaras] prender la detección desde la cabecera falló", { error: String(err) }),
  );
};

const lanzarCelular = (p: Promise<void>) => {
  p.catch((err: unknown) =>
    logger.warn("[camaras] cambiar el aviso al celular desde la cabecera falló", { error: String(err) }),
  );
};

/** «Llega a 2 celulares · también a la campana» / lo que falta para que llegue. */
function detalleCelular(c: NonNullable<CamarasCabecera["nube"]["celular"]>): string {
  if (!c.prendido) return "Apagado: no llega al celular ni a la campana";
  if (!c.conClaves) return "El servidor no tiene las claves de avisos: no sale";
  if (c.dispositivos === 0) return "Ningún celular lo recibe: prende «Avisarme en este celular» en la cámara";
  return `Llega a ${c.dispositivos === 1 ? "1 celular" : `${c.dispositivos} celulares`} · también a la campana`;
}

/** «Prendidos · revisado a las 07:30» / «Apagados: sólo avisa con el mosaico abierto». */
function detalleNube(n: CamarasCabecera["nube"]): string {
  if (!n.prendido) return "Apagados: sólo avisa con el mosaico abierto";
  if (n.aviso) return "La nube de las cámaras no contestó: reintenta sola";
  return n.consultadoAt > 0 ? `Prendidos · revisado a las ${horaLima(n.consultadoAt)}` : "Prendidos";
}

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
  const apagadas = cam.nube.prendido ? sinDeteccion(cam.nube.deteccion) : [];
  if (apagadas.length > 0) {
    lista.push({
      id: "prender-deteccion",
      icon: ShieldAlert,
      label: "Prender detección",
      detalle: cam.nube.puedeConfigurar
        ? `Apagada en ${nombresDe(apagadas)}: no avisa movimiento`
        : `Apagada en ${nombresDe(apagadas)}: la prende el dueño`,
      aviso: true,
      ocupado: cam.nube.prendiendo,
      accion: lanzarPrenderDeteccion,
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
  const ultimoNube = cam.nube.ultimo;
  if (ultimoNube?.conFoto) {
    lista.push({
      id: "foto-movimiento",
      icon: ImageIcon,
      label: "Foto del último movimiento",
      detalle: `${ultimoNube.nombre} · a las ${horaLima(ultimoNube.at)}`,
      accion: verFotoUltimoMovimiento,
    });
  }
  const silenciado = cam.silencioHasta > ahora;
  const movimientoCallado = cam.silencioMovimientoHasta > ahora;
  lista.push({
    id: "ajustes",
    icon: SlidersHorizontal,
    label: "Sonido y avisos",
    separar: true,
    abreVentana: true,
    accion: cam.abrirAjustes,
  });
  if (cam.nube.vinculado) {
    lista.push({
      id: "avisos-nube",
      icon: cam.nube.prendido ? ShieldCheck : ShieldOff,
      label: "Avisos de movimiento en segundo plano",
      detalle: detalleNube(cam.nube),
      accion: () => fijarAvisosNube(!cam.nube.prendido),
    });
  }
  const celular = cam.nube.vinculado ? cam.nube.celular : null;
  if (celular) {
    lista.push({
      id: "movimiento-celular",
      icon: Smartphone,
      label: celular.prendido ? "Aviso al celular: prendido" : "Aviso al celular: apagado",
      detalle: detalleCelular(celular),
      ocupado: cam.nube.cambiandoCelular,
      accion: () => lanzarCelular(fijarMovimientoCelular(!celular.prendido)),
    });
    if (celular.prendido && celular.dispositivos > 0) {
      const callado = celular.silencioHasta > ahora;
      lista.push({
        id: "silencio-celular",
        icon: callado ? BellRing : BellOff,
        label: callado ? "Reactivar mi celular" : "Silenciar mi celular 1 h",
        detalle: callado ? `Callado hasta las ${horaLima(celular.silencioHasta)}` : undefined,
        ocupado: cam.nube.cambiandoCelular,
        accion: () => lanzarCelular(silenciarCelular(!callado)),
      });
    }
  }
  lista.push(
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
