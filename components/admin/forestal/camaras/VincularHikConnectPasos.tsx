/**
 * Los pasos para sacar la AppKey y la SecretKey de Hik-Connect for Teams
 * (ADR-471). Cada paso es una acción con su enlace; las fuentes están en
 * `hik-connect-teams.ts`. Los nombres de menú van como los muestra el portal
 * (en inglés): así se encuentran.
 */

import { ExternalLink } from "@buleje/design-system/icons";
import { ENLACES_TEAMS } from "./hik-connect-teams";

const ENLACE =
  "inline-flex items-center gap-1 font-bold text-[var(--accent-ink)] underline underline-offset-2";

function Enlace({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={ENLACE}>
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}

export default function VincularHikConnectPasos() {
  return (
    <ol className="space-y-2 text-sm text-[var(--text-secondary)]">
      <li className="flex gap-2">
        <Paso n={1} />
        <span>
          Entra al <Enlace href={ENLACES_TEAMS.portal}>portal de Hik-Connect</Enlace> con la MISMA
          cuenta de la app de tu celular y pásala a{" "}
          <b className="text-[var(--text-primary)]">Team Mode</b> (modo equipo).
        </span>
      </li>
      <li className="flex gap-2">
        <Paso n={2} />
        <span>
          Pasa la cámara al equipo:{" "}
          <b className="text-[var(--text-primary)]">
            Dispositivo → Agregar dispositivo → Importar dispositivo personal
          </b>
          , elígela e «Importar» (tiene que estar en línea). O agrégala con su número de serie y el{" "}
          <b className="text-[var(--text-primary)]">código de verificación</b> (6 letras de la
          etiqueta).
        </span>
      </li>
      <li className="flex gap-2">
        <Paso n={3} />
        <span>
          En el portal:{" "}
          <b className="text-[var(--text-primary)]">
            Team Management → Team Configuration → API Integration
          </b>
          . Copia el <i>API Key</i> (AppKey) y el <i>API Secret</i> (SecretKey). Si esa opción no
          aparece, pídela gratis con tu correo de Hik-Connect en el{" "}
          <Enlace href={ENLACES_TEAMS.tpp}>portal de socios de Hikvision</Enlace>.
        </span>
      </li>
      <li className="flex gap-2">
        <Paso n={4} />
        <span>
          Pégalas acá abajo y toca «Vincular»: el panel las prueba con Hikvision antes de
          guardarlas.
        </span>
      </li>
    </ol>
  );
}

function Paso({ n }: { n: number }) {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent-ink)]">
      {n}
    </span>
  );
}
