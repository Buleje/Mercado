"use client";

/**
 * Cómo conectar el negocio desde otra app de IA, en 3-4 pasos cortos por app.
 * ChatGPT y Claude (web) sólo aceptan una dirección: va la que lleva la clave
 * adentro (`/api/mcp/t/<clave>`). Gemini CLI y Cursor aceptan encabezados: va
 * la dirección limpia + `Authorization: Bearer`.
 */
import { useState } from "react";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { BotonCopiar } from "./BotonCopiar";

type AppIa = "chatgpt" | "claude" | "gemini" | "cursor";

const OPCIONES: Array<{ value: AppIa; label: string }> = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "cursor", label: "Cursor" },
];

/** La dirección que lleva la clave adentro (para las apps que sólo piden una URL). */
export function urlConClave(urlMcp: string, clave: string): string {
  return `${urlMcp.replace(/\/+$/, "")}/t/${clave}`;
}

/** El `mcp.json` de Gemini CLI (`settings.json` › `mcpServers`) y de Cursor. */
export function jsonConexion(app: "gemini" | "cursor", urlMcp: string, clave: string): string {
  const servidor =
    app === "gemini"
      ? { httpUrl: urlMcp, headers: { Authorization: `Bearer ${clave}` } }
      : { url: urlMcp, headers: { Authorization: `Bearer ${clave}` } };
  return JSON.stringify({ mcpServers: { buleje: servidor } }, null, 2);
}

const PASOS: Record<AppIa, string[]> = {
  chatgpt: [
    "En ChatGPT entra a Configuración › Aplicaciones y conectores › Configuración avanzada y prende el «modo desarrollador».",
    "Vuelve a Aplicaciones y conectores y toca «Crear».",
    "Ponle de nombre «Buleje», pega la dirección de abajo y en autenticación elige «Sin autenticación» (la clave ya va en la dirección).",
    "En un chat nuevo, toca «+» › Más › modo desarrollador y elige Buleje.",
  ],
  claude: [
    "En Claude entra a Configuración › Conectores y toca «Agregar conector personalizado».",
    "Ponle de nombre «Buleje» y pega la dirección de abajo.",
    "En un chat, toca el botón de herramientas y prende Buleje.",
  ],
  gemini: [
    "Abre el archivo ~/.gemini/settings.json de tu computadora (si no existe, créalo).",
    "Pega lo de abajo (si ya tienes «mcpServers», agrega sólo «buleje» adentro).",
    "Abre Gemini CLI y escribe /mcp para ver que Buleje está conectado.",
  ],
  cursor: [
    "En Cursor entra a Settings › MCP › «Add new MCP server» (o abre .cursor/mcp.json).",
    "Pega lo de abajo y guarda.",
    "Prende Buleje en la lista de servidores y úsalo desde el chat.",
  ],
};

export function InstruccionesApps({ urlMcp, clave }: { urlMcp: string; clave: string | null }) {
  const [app, setApp] = useState<AppIa>("chatgpt");
  const marcador = clave ?? "TU_CLAVE";
  const soloUrl = app === "chatgpt" || app === "claude";
  const contenido = soloUrl ? urlConClave(urlMcp, marcador) : jsonConexion(app, urlMcp, marcador);

  return (
    <div className="space-y-3">
      <SegmentedControl value={app} onChange={setApp} options={OPCIONES} size="xl" label="App de IA" />
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--text-primary)]">
        {PASOS[app].map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
        <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-[var(--text-primary)]">{contenido}</pre>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <BotonCopiar texto={contenido} etiqueta={soloUrl ? "Copiar dirección" : "Copiar"} />
          {!clave && <span className="text-xs text-[var(--text-secondary)]">Cambia TU_CLAVE por la clave que te dimos al crear la conexión.</span>}
        </div>
      </div>
    </div>
  );
}
