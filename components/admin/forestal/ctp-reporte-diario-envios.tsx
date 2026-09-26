"use client";

/**
 * Cómo le fue al último envío de un reporte diario (ADR-439), por canal, y el
 * historial corto. El error crudo de Meta/Resend se traduce a qué hacer
 * (`explicarFalloEnvio`): «401 Invalid OAuth access token» no le dice nada a
 * quien tiene que arreglarlo.
 */
import { CheckCircle2, Mail, MessageCircle, XCircle } from "@buleje/design-system/icons";
import { explicarFalloEnvio, type CanalReporte } from "@/lib/forestal/reporte-diario";
import { formatDateTimeShort } from "@/lib/format";
import type { EnvioDeReporte, ResultadoEnvio } from "./hooks/use-reportes-diarios";

const canalDe = (type: string): CanalReporte => (type.endsWith(":email") ? "email" : "whatsapp");
const NOMBRE: Record<CanalReporte, string> = { email: "Correo", whatsapp: "WhatsApp" };

function Estado({ ok, canal, destino, texto, cuando }: { ok: boolean; canal: CanalReporte; destino: string; texto: string; cuando?: string }) {
  const Icono = canal === "email" ? Mail : MessageCircle;
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-600)]" aria-label="Salió" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-600)]" aria-label="No salió" />
      )}
      <span className="min-w-0">
        <span className="font-semibold text-[var(--text-primary)]">{NOMBRE[canal]}</span>
        <span className="text-[var(--text-secondary)]"> · {destino}{cuando ? ` · ${cuando}` : ""}</span>
        <span className={`block ${ok ? "text-[var(--text-secondary)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"}`}>{texto}</span>
      </span>
    </li>
  );
}

/** El resultado de «Enviar ahora», recién vuelto del servidor. */
export function ResultadoDeEnvio({ resultados }: { resultados: ResultadoEnvio[] }) {
  if (resultados.length === 0) return <p className="text-sm text-[var(--text-secondary)]">No hay destinatarios en los canales prendidos.</p>;
  return (
    <ul className="space-y-1.5" aria-label="Resultado del envío">
      {resultados.map((r) => (
        <Estado key={`${r.canal}-${r.destino}`} ok={r.ok} canal={r.canal} destino={r.destino} texto={r.ok ? "Salió." : r.explicacion ?? "No salió."} />
      ))}
    </ul>
  );
}

/** El último intento de cada canal + los anteriores plegados. */
export default function ReporteDiarioEnvios({ envios }: { envios: EnvioDeReporte[] }) {
  if (envios.length === 0) return <p className="text-sm text-[var(--text-secondary)]">Todavía no salió ninguna vez.</p>;
  const ultimos = (["email", "whatsapp"] as const)
    .map((c) => envios.find((e) => canalDe(e.type) === c))
    .filter((e): e is EnvioDeReporte => Boolean(e));
  const texto = (e: EnvioDeReporte) => (e.status === "sent" ? "Salió." : explicarFalloEnvio(canalDe(e.type), e.message));
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5" aria-label="Último envío por canal">
        {ultimos.map((e) => (
          <Estado key={e.id} ok={e.status === "sent"} canal={canalDe(e.type)} destino={e.recipient} texto={texto(e)} cuando={formatDateTimeShort(e.createdAt)} />
        ))}
      </ul>
      {envios.length > ultimos.length && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-[var(--text-secondary)]">Historial ({envios.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {envios.map((e) => (
              <Estado key={e.id} ok={e.status === "sent"} canal={canalDe(e.type)} destino={e.recipient} texto={texto(e)} cuando={formatDateTimeShort(e.createdAt)} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
