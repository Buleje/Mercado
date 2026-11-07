"use client";

/**
 * N8nPanel — el puente con n8n, en las dos direcciones.
 *
 * Arriba: la credencial para que n8n (y por n8n, WhatsApp o Telegram) pueda
 * ANOTAR operaciones en Buleje (`TokenN8n`). Abajo: los flujos de n8n que el
 * asistente puede DISPARAR desde el chat (`FlujoN8nFila` + `AltaFlujoN8n`).
 */

import { useCallback, useState } from "react";
import { Webhook } from "@buleje/design-system/icons";
import { WarningAlert } from "@buleje/design-system";
import Plegable from "@/components/admin/shared/Plegable";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import AltaFlujoN8n, { type NuevoFlujo } from "./AltaFlujoN8n";
import FlujoN8nFila, { type ResultadoPrueba } from "./FlujoN8nFila";
import TokenN8n from "./TokenN8n";
import { SinDato } from "./piezas-canal";
import { enviarA, haceCuanto, masReciente, useCopiar, type Canal } from "./shared";
import { API_N8N, type ConfigN8n } from "./tipos";

/** El estado del canal en una línea, para verlo plegado. */
export function resumenN8n(c: Canal<ConfigN8n>): string | null {
  if (c.cargando) return null;
  if (!c.dato) return "No se pudo leer el estado";
  const token = c.dato.token ? "Token listo" : "Sin token";
  const n = c.dato.flujos.length;
  if (n === 0) return `${token} · 0 flujos`;
  const activos = c.dato.flujos.filter((f) => f.activo).length;
  const ultimo = masReciente(c.dato.flujos.map((f) => f.ultimoDisparo?.fecha));
  return `${token} · ${activos} de ${n} ${n === 1 ? "flujo activo" : "flujos activos"}${
    ultimo ? ` · disparado ${haceCuanto(ultimo)}` : ""
  }`;
}

function Cuerpo({ canal }: { canal: Canal<ConfigN8n> }) {
  const { confirm } = useConfirm();
  const { copiado, copiar } = useCopiar();
  const { dato: config, error, setError, recargar } = canal;
  const [probando, setProbando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPrueba | null>(null);

  const agregar = useCallback(
    async (f: NuevoFlujo) => {
      setError(null);
      try {
        await enviarA(API_N8N, { ...f, activo: true });
        await recargar();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [recargar, setError],
  );

  const probar = useCallback(
    async (id: string) => {
      setProbando(id);
      setResultado(null);
      try {
        const json = await enviarA(API_N8N, { accion: "probar", id });
        const res = json.resultado as { ok: boolean; status?: number; error?: string; respuesta?: string };
        setResultado({
          id,
          ok: res.ok,
          texto: res.ok
            ? `Contestó ${res.status}. ${res.respuesta ? `Dijo: ${res.respuesta.slice(0, 120)}` : "Sin cuerpo."}`
            : (res.error ?? `Falló con ${res.status}`),
        });
        await recargar();
      } catch (e) {
        setResultado({ id, ok: false, texto: e instanceof Error ? e.message : String(e) });
      } finally {
        setProbando(null);
      }
    },
    [recargar],
  );

  const otra = useCallback(
    (body: unknown, metodo: "POST" | "DELETE" = "POST") =>
      void enviarA(API_N8N, body, metodo)
        .then(recargar)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))),
    [recargar, setError],
  );

  const rotarToken = useCallback(async () => {
    if (!(await confirm({
      title: "¿Rotar el token?",
      description: "El token viejo deja de funcionar al instante y hay que pegarlo de nuevo en n8n.",
      intent: "warning",
      confirmLabel: "Sí, rotar",
    }))) return;
    otra({ accion: "rotar-token" });
  }, [confirm, otra]);

  if (!config) return <SinDato cargando={canal.cargando} error={error} />;

  const ejemploCurl = config.token
    ? `curl -X POST "${typeof window !== "undefined" ? window.location.origin : ""}${config.urlEntrante}" \\
  -H "Authorization: Bearer ${config.token}" \\
  -H "X-Buleje-Tenant: <tu-slug>" \\
  -H "Content-Type: application/json" \\
  -d '{"texto":"25 galones de petróleo para el camión N12 a 27 el galón"}'`
    : "";

  return (
    <div className="space-y-4">
      {error && <WarningAlert>{error}</WarningAlert>}

      <TokenN8n
        token={config.token}
        ejemploCurl={ejemploCurl}
        copiado={copiado}
        onCopiar={copiar}
        onRotar={() => void rotarToken()}
      />

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
          <Webhook aria-hidden="true" className="h-4 w-4" />
          Flujos que el asistente puede disparar
          <InfoTip
            title="Flujos de n8n"
            what="Crea un flujo en n8n con un nodo Webhook, copia su URL de producción y pégala acá. La descripción es lo que lee el asistente para elegir cuál disparar."
            affects={
              config.redLocalHabilitada
                ? "En este entorno se aceptan también URLs de tu propia red (N8N_ALLOW_LOCAL=1)."
                : "Sólo se aceptan URLs públicas (https). Un n8n en tu propia máquina queda bloqueado por seguridad; en desarrollo se habilita con N8N_ALLOW_LOCAL=1."
            }
            example="Le dices al asistente «manda esto al contador» y dispara el flujo «Avisar al contador»."
            side="bottom"
          />
        </p>
        {config.flujos.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Todavía no hay flujos: pega abajo la URL de un webhook de n8n.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {config.flujos.map((f) => (
              <FlujoN8nFila
                key={f.id}
                flujo={f}
                probando={probando === f.id}
                resultado={resultado?.id === f.id ? resultado : null}
                onProbar={() => void probar(f.id)}
                onActivar={() => otra({ accion: "activar", id: f.id, activo: !f.activo })}
                onBorrar={async () => {
                  if (!(await confirm({
                    title: `¿Borrar el flujo "${f.nombre}"?`,
                    description: "El flujo sigue existiendo en n8n; sólo se borra el acceso desde acá.",
                    intent: "danger",
                    confirmLabel: "Sí, borrar",
                  }))) return;
                  otra({ id: f.id }, "DELETE");
                }}
              />
            ))}
          </ul>
        )}
        <AltaFlujoN8n onAgregar={agregar} />
      </div>
    </div>
  );
}

export default function N8nPanel({ canal }: { canal: Canal<ConfigN8n> }) {
  return (
    <Plegable
      clave="asistente-ia:automatizaciones:n8n"
      titulo={
        <span className="inline-flex items-center gap-2">
          <Webhook aria-hidden="true" className="h-4 w-4 text-[var(--text-secondary)]" />
          n8n
        </span>
      }
      resumen={<span className="text-sm">{resumenN8n(canal) ?? "Leyendo el estado…"}</span>}
      acciones={
        <InfoTip
          title="n8n"
          what="Para lo que WhatsApp y Telegram no cubren: un correo, una planilla. En las dos direcciones: n8n anota acá con el token, y el asistente dispara tus flujos desde el chat."
          affects="Lo que n8n anota pasa por la misma confirmación que los otros canales."
          side="left"
        />
      }
    >
      <Cuerpo canal={canal} />
    </Plegable>
  );
}
