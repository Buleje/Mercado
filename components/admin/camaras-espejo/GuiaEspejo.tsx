"use client";

/**
 * «La primera vez» del Espejo del celular: tres pasos de una línea, cada uno
 * con su ⓘ (el detalle va en el ⓘ, no en párrafos). Se hace una sola vez por
 * PC; después alcanza con abrir el lanzador y tocar «Mostrar mi celular aquí».
 */

import { CardTitle } from "@buleje/design-system";
import { Download, ExternalLink } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { LANZADOR_ESPEJO_CMD, NOMBRE_LANZADOR, TITULO_VENTANA_ESPEJO, URL_SCRCPY } from "@/lib/camaras/espejo-celular";

/** Baja el `.cmd` con CRLF tal cual (un `<a href>` a /scripts no existe: el repo no se sirve). */
function bajarLanzador() {
  const url = URL.createObjectURL(new Blob([LANZADOR_ESPEJO_CMD], { type: "application/octet-stream" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = NOMBRE_LANZADOR;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Paso {
  titulo: string;
  tip: React.ReactNode;
  accion?: React.ReactNode;
}

const ACCION = button({ variant: "secondary", className: "gap-1.5" });

const PASOS: Paso[] = [
  {
    titulo: "Baja scrcpy y descomprímelo",
    accion: (
      <a href={URL_SCRCPY} target="_blank" rel="noopener noreferrer" className={ACCION}>
        <ExternalLink className="h-4 w-4" aria-hidden /> Bajar scrcpy
      </a>
    ),
    tip: (
      <InfoTip
        title="scrcpy"
        side="left"
        what="Duplica tu celular en la PC. Es gratis y de código abierto; no se instala."
        affects="Elige el zip «scrcpy-win64-v…». Descomprímelo y deja la carpeta en C:\Users\<tú>\scrcpy (el lanzador también la busca en Descargas y en el Escritorio)."
      />
    ),
  },
  {
    titulo: "Activa la depuración USB y conecta el cable",
    tip: (
      <InfoTip
        title="Depuración USB"
        side="left"
        what="Ajustes › Acerca del teléfono › toca 7 veces «Número de compilación». Después Ajustes › Sistema › Opciones de desarrollador › Depuración USB."
        affects="Al conectar el cable, el celular pregunta «¿Permitir depuración USB?»: toca Permitir y marca «Siempre desde esta computadora»."
        example="Sin cable: con el cable puesto, abre el lanzador una vez desde una consola como «espejo-celular.cmd --tcpip» y desconéctalo; sigue por Wi-Fi hasta que reinicies el celular."
      />
    ),
  },
  {
    titulo: "Abre el lanzador",
    accion: (
      <button type="button" onClick={bajarLanzador} className={ACCION} data-testid="espejo-bajar-lanzador">
        <Download className="h-4 w-4" aria-hidden /> Bajar el lanzador
      </button>
    ),
    tip: (
      <InfoTip
        title="El lanzador"
        side="left"
        what={`Doble clic en ${NOMBRE_LANZADOR}: abre la ventana «${TITULO_VENTANA_ESPEJO}». Déjala abierta (no minimizada) y vuelve acá.`}
        affects="Si Windows avisa «Windows protegió tu PC»: Más información › Ejecutar de todas formas."
        example="Con la ventana de scrcpy al frente, Alt+O apaga la pantalla del celular y lo sigues viendo acá (ahorra batería)."
      />
    ),
  },
];

export default function GuiaEspejo() {
  return (
    <section
      aria-labelledby="espejo-guia-titulo"
      className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <div className="flex items-center gap-1.5">
        <CardTitle id="espejo-guia-titulo">La primera vez</CardTitle>
        <InfoTip
          title="Se hace una sola vez"
          side="left"
          what="Después de esto, cada vez: abre el lanzador y toca «Mostrar mi celular aquí»."
          affects="Funciona en la PC donde conectas el celular, con Chrome o Edge."
        />
      </div>
      <ol className="space-y-3">
        {PASOS.map((p, i) => (
          <li key={p.titulo} className="flex gap-3">
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-sm font-semibold text-[var(--text-primary)]"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start gap-1.5">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  <span className="sr-only">Paso {i + 1}: </span>
                  {p.titulo}
                </span>
                {p.tip}
              </div>
              {p.accion}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
