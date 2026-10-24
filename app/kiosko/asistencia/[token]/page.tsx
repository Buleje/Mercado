import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "@buleje/design-system/icons";
import KioskoAsistencia from "@/components/rrhh/kiosko/KioskoAsistencia";
import { AvisoKiosko } from "@/components/rrhh/kiosko/KioskoPartes";
import { KioskoAsistenciaDB } from "@/lib/db/rrhh-kiosko.db";
import { secretoCoincide } from "@/lib/rrhh/kiosko-token.server";
import { partirToken, revisarEnlace, type RechazoToken } from "@/lib/rrhh/kiosko";

/**
 * Kiosko de asistencia (`lib/rrhh/kiosko.ts`): la página que se deja abierta
 * en la tablet del local. Pública, sin sesión: la abre el enlace que genera
 * el dueño en Equipo › Asistencia. El enlace se revisa acá para mostrar un
 * aviso claro; la pantalla ata el enlace a ESTA tablet (`/api/kiosko/emparejar`)
 * y cada marca vuelve a revisar enlace + tablet (`/api/kiosko/asistencia`).
 * El secreto de la ruta se tacha antes de salir a la analítica
 * (`lib/telemetry/secretos-en-url.ts`).
 */
export const metadata: Metadata = {
  title: "Kiosko de asistencia",
  /* Pisa el robots del root a propósito: esta página no se indexa. */
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }> };

export default function KioskoAsistenciaPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-[var(--surface-canvas)]">
          <Loader2 className="h-12 w-12 animate-spin text-[var(--text-tertiary)]" aria-label="Abriendo el kiosko" />
        </main>
      }
    >
      <Contenido params={params} />
    </Suspense>
  );
}

const AVISO: Record<RechazoToken, string> = {
  apagado: "La marcación en el kiosko está apagada. El encargado la enciende en Equipo › Asistencia.",
  vencido: "Este enlace del kiosko venció. Pídele al encargado uno nuevo.",
  sin_enlace: "Este enlace del kiosko ya no sirve. Pídele al encargado uno nuevo.",
  no_coincide: "Este enlace del kiosko ya no sirve. Pídele al encargado uno nuevo.",
};

async function Contenido({ params }: Props) {
  const { token: crudo } = await params;
  const token = decodeURIComponent(crudo);
  const partes = partirToken(token);
  let motivo: RechazoToken | null = "no_coincide";
  if (partes) {
    const config = await KioskoAsistenciaDB.config(partes.tenantId);
    const r = revisarEnlace(config, secretoCoincide(partes.secreto, config.tokenHash), new Date());
    motivo = r.ok ? null : r.motivo;
  }
  if (!motivo) return <KioskoAsistencia token={token} />;
  return <AvisoKiosko mensaje={AVISO[motivo]} />;
}
