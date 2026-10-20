"use client";

/**
 * AvisoAgendaProgramado — el aviso en pantalla de la agenda (Brandon, 20-10):
 * vive en todo el panel y, sin tocar nada, abre «Lo que te falta hacer» cada
 * tanto. Cuándo toca lo dice `lib/agenda/aviso-pantalla.ts`; sólo sale si
 * falta algo.
 *
 * - Mira el reloj cada 30 s sin pedir nada; sólo cuando toca pide «Hoy»
 *   (`/api/admin/agenda/hoy`, que tiene caché en el servidor).
 * - Antes de pedir corre el reloj 2 min: otra pestaña del panel que mire en ese
 *   rato ya no avisa. Una pestaña escondida espera 1 min más que la que se ve.
 * - Con otra ventana abierta, o escribiendo en un campo, espera 2 min: no tapa
 *   un cobro ni un formulario a medias (al tercer intento ya no espera al campo).
 * - Con el panel escondido: aviso del sistema (si lo prendiste) y la ventana
 *   sale al volver.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { leerHoy } from "@/components/admin/administracion/agenda-api";
import { alPedirAbrirAviso, useConfigAviso } from "@/hooks/use-aviso-agenda";
import { diaLima, loQueFalta, proximoAviso, textoNotificacion, tocaMirar, type ModoAviso } from "@/lib/agenda/aviso-pantalla";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { logger } from "@/lib/logger";
import type { AdminRole } from "@/lib/session";
import { notificarAviso, sonarAviso } from "./aviso-navegador";

const AvisoAgendaModal = dynamic(() => import("./AvisoAgendaModal"), { ssr: false });
const ConfigAvisoModal = dynamic(() => import("./ConfigAvisoModal"), { ssr: false });

const CADA_MS = 30_000;
/** Deja que el panel termine de cargar antes de la primera mirada. */
const PRIMERA_MIRADA_MS = 5_000;
const RESERVA_MS = 2 * 60_000;
const ESPERA_ESCONDIDA_MS = 60_000;
const ESPERAS_AL_CAMPO = 3;

/** Se ve en la pantalla: el menú del celular vive siempre en la página como diálogo, corrido afuera. */
function seVe(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) return false;
  const estilo = window.getComputedStyle(el);
  return estilo.visibility !== "hidden" && estilo.opacity !== "0";
}

/** Hay otra ventana abierta o alguien escribe: mejor no tapar. */
function ocupado(conCampo: boolean): boolean {
  if ([...document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"]')].some(seVe)) return true;
  const foco = document.activeElement;
  return conCampo && foco instanceof HTMLElement && (foco.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName));
}

export default function AvisoAgendaProgramado({ rol }: { rol: AdminRole }) {
  const puede = puedePedir("/api/admin/agenda/hoy", rol);
  const { config, listo, guardar, leerReloj, escribirReloj } = useConfigAviso();
  /** En qué forma está abierto (`null` = cerrado). */
  const [abierto, setAbierto] = useState<ModoAviso | null>(null);
  const [minimizado, setMinimizado] = useState(false);
  /** Ancho de la barra del costado (este navegador); `null` = de fábrica. */
  const [ancho, setAncho] = useState<number | null>(null);
  const [configurando, setConfigurando] = useState(false);
  /** Ya se leyó si el panel fijo quedó abierto: recién ahí se guarda lo que cambie. */
  const [restaurado, setRestaurado] = useState(false);
  const estado = useRef({ abierto, minimizado, configurando });
  estado.current = { abierto, minimizado, configurando };
  const mirando = useRef(false);
  const alVolver = useRef(false);
  const esperas = useRef(0);

  const abrir = useCallback(
    (conSonido: boolean, modo?: ModoAviso) => {
      if (conSonido && config.sonido) sonarAviso();
      setMinimizado(false);
      /* El panel fijo ya abierto no se cambia por un aviso: sólo se despliega. */
      setAbierto((actual) => (actual === "fija" && !modo ? "fija" : (modo ?? config.modo)));
    },
    [config.sonido, config.modo],
  );

  const mirar = useCallback(async () => {
    const { abierto: forma, minimizado: chico, configurando: editando } = estado.current;
    /* Con la ventana o el costado suelto abiertos no hay nada que avisar; el fijo minimizado sí se despliega. */
    if (mirando.current || editando || (forma !== null && !(forma === "fija" && chico))) return;
    const ahora = Date.now();
    const escondida = document.visibilityState !== "visible";
    const reloj = leerReloj();
    if (!tocaMirar(config, { ...reloj, proximo: reloj.proximo + (escondida ? ESPERA_ESCONDIDA_MS : 0) }, ahora)) return;
    escribirReloj({ ...reloj, proximo: ahora + RESERVA_MS });
    if (!escondida && forma === null && ocupado(esperas.current < ESPERAS_AL_CAMPO)) {
      esperas.current += 1;
      return;
    }
    esperas.current = 0;

    mirando.current = true;
    const r = await leerHoy();
    mirando.current = false;
    if (!r.ok) {
      logger.warn("[agenda] el aviso no pudo leer Hoy; reintenta en 2 min", { status: r.status });
      return;
    }
    const falta = loQueFalta(r.data, config);
    escribirReloj({ ...leerReloj(), proximo: proximoAviso(config, Date.now(), falta.hoy) });
    if (falta.hoy.length + falta.atrasadas.length === 0) return;
    if (document.visibilityState === "visible") return abrir(true);
    alVolver.current = true;
    if (config.notificacion) {
      const t = textoNotificacion(falta);
      notificarAviso(t.titulo, t.cuerpo, () => {
        alVolver.current = false;
        abrir(false);
      });
    }
  }, [config, leerReloj, escribirReloj, abrir]);

  useEffect(() => {
    if (!puede || !listo || !config.activo) return;
    const primera = setTimeout(() => void mirar(), PRIMERA_MIRADA_MS);
    const reloj = setInterval(() => void mirar(), CADA_MS);
    const alVer = () => {
      if (document.visibilityState !== "visible") return;
      if (!alVolver.current) return void mirar();
      alVolver.current = false;
      abrir(true);
    };
    document.addEventListener("visibilitychange", alVer);
    return () => {
      clearTimeout(primera);
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVer);
    };
  }, [puede, listo, config.activo, mirar, abrir]);

  /* El panel fijo vuelve al recargar, como lo dejaste (abierto o en burbuja). */
  useEffect(() => {
    if (!listo || restaurado) return;
    const r = leerReloj();
    setAncho(r.ancho);
    if (puede && r.fijaAbierta) {
      setAbierto("fija");
      setMinimizado(r.minimizado);
    }
    setRestaurado(true);
  }, [listo, restaurado, puede, leerReloj]);

  useEffect(() => {
    if (!restaurado) return;
    const r = leerReloj();
    const fijaAbierta = abierto === "fija";
    const chico = fijaAbierta && minimizado;
    if (r.fijaAbierta !== fijaAbierta || r.minimizado !== chico) escribirReloj({ ...r, fijaAbierta, minimizado: chico });
  }, [restaurado, abierto, minimizado, leerReloj, escribirReloj]);

  /* «Probar ahora», «Ver el aviso» y «Al costado» de Hoy lo abren aunque esté apagado. */
  useEffect(() => (puede ? alPedirAbrirAviso((modo) => abrir(false, modo)) : undefined), [puede, abrir]);

  const guardarAncho = (px: number | null) => {
    setAncho(px);
    escribirReloj({ ...leerReloj(), ancho: px });
  };
  const cerrar = () => {
    setAbierto(null);
    setMinimizado(false);
  };
  const recordarEn = (min: number) => {
    escribirReloj({ ...leerReloj(), proximo: Date.now() + min * 60_000 });
    cerrar();
  };
  const noMasHoy = () => {
    escribirReloj({ ...leerReloj(), silencioDia: diaLima(Date.now()) });
    cerrar();
  };
  /* La forma que eliges queda como la tuya: el próximo aviso sale igual. */
  const cambiarModo = (modo: ModoAviso) => {
    setAbierto(modo);
    setMinimizado(false);
    if (modo !== config.modo) guardar({ ...config, modo });
  };

  return (
    <>
      {abierto && (
        <AvisoAgendaModal
          config={config}
          modo={abierto}
          proximo={leerReloj().proximo}
          minimizado={minimizado}
          onMinimizar={setMinimizado}
          ancho={ancho}
          onAncho={guardarAncho}
          onCambiarModo={cambiarModo}
          onCerrar={cerrar}
          onRecordarEn={recordarEn}
          onNoMasHoy={noMasHoy}
          onConfigurar={() => {
            if (abierto !== "fija") cerrar();
            setConfigurando(true);
          }}
        />
      )}
      {configurando && <ConfigAvisoModal onCerrar={() => setConfigurando(false)} />}
    </>
  );
}
