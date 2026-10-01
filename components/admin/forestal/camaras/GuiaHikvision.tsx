"use client";

/**
 * Cómo se conecta la cámara Hikvision, campo por campo. Vive en la pantalla y no
 * en un manual aparte: la persona que configura la cámara la tiene abierta. Los
 * nombres de menú son los de Hikvision; un firmware puede traducirlos distinto.
 */

import { HelpCircle } from "@buleje/design-system/icons";

export default function GuiaHikvision() {
  return (
    <details className="mt-3 rounded-xl border border-[var(--rule-base)] px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
        <HelpCircle className="h-4 w-4 shrink-0" aria-hidden /> Cómo conectar la cámara Hikvision
        (paso a paso)
      </summary>
      <div className="mt-2 space-y-3 text-sm text-[var(--text-secondary)]">
        <p>
          La cámara tiene que <b>mandar</b> la foto: con SIM 4G no se la puede ir a buscar (está
          detrás de la red del operador). Hik-Connect en el celular sólo avisa <i>a ti</i>; lo que
          manda fotos <i>al sistema</i> se configura en la <b>cámara misma</b>: desde una PC en la
          misma red, abre la dirección IP de la cámara en el navegador (usuario <code>admin</code> y
          la clave que le pusiste), o desde la app iVMS-4200. Los nombres de menú pueden variar por
          firmware — busca el que se parezca.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <b>Que dispare por persona o vehículo, no por cualquier movimiento.</b>{" "}
            <code>Configuración → Evento → Evento inteligente → Detección de intrusión</code> (o
            «Cruce de línea»), activa <i>Detección de objetivo: humano / vehículo</i>. Con
            «Detección de movimiento» a secas la cámara manda ramas y perros; el sistema igual
            filtra con la IA, pero gasta datos.
          </li>
          <li>
            <b>Que mande la foto a esta dirección.</b>{" "}
            <code>Configuración → Red → Config. avanzada → Servidor de alarma</code> (en algunos
            firmwares «HTTP Listening» o «Notificar a centro de vigilancia»). Pega la dirección que
            copiaste arriba en <i>URL de destino</i>, protocolo <b>HTTP/HTTPS</b>, método{" "}
            <b>POST</b>. En el evento del paso 1, en <i>Método de enlace</i>, tilda{" "}
            <b>Notificar al servidor de alarma</b> y <b>Capturar imagen</b>. Si el firmware no trae
            esa opción, la alternativa es <b>Subir a FTP</b> → todavía no lo recibimos: avísame y lo
            armo.
          </li>
          <li>
            <b>Prueba.</b> Camina delante de la cámara. En menos de un minuto la foto aparece en la
            pestaña «Fotos», con su hora. Si no aparece: (a) la dirección copiada a mano suele tener
            un carácter de menos — vuelve a copiarla del botón; (b) revisa que la SIM tenga datos
            (Hik-Connect en el celular muestra la cámara «en línea»); (c) en esta PC, que el túnel
            esté abierto (el aviso verde de arriba); (d) la hora de la cámara no importa, el sistema
            pone la suya.
          </li>
          <li>
            <b>Que te avise.</b> Ponle tu WhatsApp en «Avisar al WhatsApp» y elige «sólo de noche»:
            cuando la IA vea a alguien te llega un mensaje con la hora, qué vio y el enlace a la
            foto.
          </li>
        </ol>
        <p className="text-xs text-[var(--text-tertiary)]">
          Mientras no esté conectada, «Más → Subir una foto a mano» (en cada cámara) mete una foto
          del celular por la misma puerta: sirve para ver cómo queda el historial y probar la
          lectura de la IA hoy mismo.
        </p>
      </div>
    </details>
  );
}
