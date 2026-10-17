"use client";

/**
 * TelegramPanel — enganchar el bot que anota por chat.
 *
 * Lo que resuelve es un emparejamiento: el bot vive en Telegram y el negocio
 * vive acá, y algo tiene que decir «este chat es de este negocio». Se resuelve
 * con un código de 15 minutos que se tipea en el chat —como el código de un
 * cajero— y no con un token permanente: un código que se ve en la pantalla
 * del celular y se reenvía sin pensar no puede valer para siempre.
 */

import { Link2, Loader2, RefreshCw, Send } from "@buleje/design-system/icons";
import { WarningAlert } from "@buleje/design-system";
import Plegable from "@/components/admin/shared/Plegable";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { CLASE_ENLACE_PANEL } from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDateShort } from "@/lib/format";
import { accion48, BandaCodigo, FilaVinculada, LineaAviso, principal48, SinDato } from "./piezas-canal";
import { masReciente, useCopiar, useCuentaRegresiva, usoDe, type Canal } from "./shared";
import type { EstadoTelegram } from "./tipos";

/** El estado del canal en una línea, para verlo plegado. */
export function resumenTelegram(c: Canal<EstadoTelegram>): string | null {
  if (c.cargando) return null;
  if (!c.dato) return "No se pudo leer el estado";
  if (!c.dato.configurado) return "Sin bot configurado";
  const bot = c.dato.bot?.username ? `@${c.dato.bot.username}` : "Bot listo";
  if (!c.dato.webhook?.url) return `${bot} · conexión sin registrar`;
  if (c.dato.webhook.last_error_message) return `${bot} · la conexión falla`;
  const n = c.dato.chats.length;
  if (n === 0) return `${bot} · sin vincular`;
  return `${n} ${n === 1 ? "chat" : "chats"} · ${usoDe(masReciente(c.dato.chats.map((x) => x.ultimoUso)))}`;
}

function Conexion({ canal }: { canal: Canal<EstadoTelegram> }) {
  const { dato, ocupado, accion } = canal;
  if (!dato) return null;
  return (
    <Plegable
      clave="asistente-ia:automatizaciones:telegram:conexion"
      variante="franja"
      titulo="Conexión con Telegram"
      resumen={dato.webhook?.url ? "Registrada" : "Sin registrar"}
      acciones={
        <InfoTip
          title="Conexión con Telegram"
          what="Telegram tiene que poder alcanzar este servidor. En producción es el dominio; en desarrollo hace falta un túnel público (ngrok, cloudflared): Telegram no llega a localhost."
          side="left"
        />
      }
    >
      <div className="space-y-2">
        <code className="block truncate rounded-lg bg-[var(--surface-sunken)] px-3 py-2 font-mono text-sm text-[var(--text-secondary)]">
          {dato.webhook?.url || "(sin registrar)"}
        </code>
        {dato.webhook?.last_error_message && (
          <LineaAviso tono="error">Último error de Telegram: {dato.webhook.last_error_message}</LineaAviso>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void accion({ accion: "webhook", url: dato.urlWebhookSugerida })}
            className={accion48}
          >
            <RefreshCw className="h-4 w-4" />
            Registrar en {new URL(dato.urlWebhookSugerida).host}
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void accion({ accion: "webhook", url: null })}
            className={accion48}
          >
            Desconectar
          </button>
        </div>
      </div>
    </Plegable>
  );
}

function Cuerpo({ canal }: { canal: Canal<EstadoTelegram> }) {
  const { confirm } = useConfirm();
  const { copiado, copiar } = useCopiar();
  const { dato, error, ocupado, accion, cargadoEn } = canal;
  const quedan = useCuentaRegresiva(dato?.codigo, cargadoEn);

  if (!dato) return <SinDato cargando={canal.cargando} error={error} />;

  if (!dato.configurado) {
    return (
      <div className="space-y-3">
        {error && <WarningAlert>{error}</WarningAlert>}
        <LineaAviso
          titulo="Crear el bot"
          ayuda="Escríbele a @BotFather en Telegram, mándale /newbot y pega el token que te da en TELEGRAM_BOT_TOKEN del .env. Después recarga esta pantalla."
        >
          Falta el bot de Telegram.
        </LineaAviso>
      </div>
    );
  }

  const codigo = dato.codigo && quedan > 0 ? dato.codigo.codigo : null;
  const comando = codigo ? `/vincular ${codigo}` : "";
  const enlaceBot = dato.bot?.username ? `https://t.me/${dato.bot.username}` : null;
  const abrirBot = enlaceBot && (
    <a href={enlaceBot} target="_blank" rel="noreferrer" className={CLASE_ENLACE_PANEL}>
      abrir @{dato.bot?.username}
    </a>
  );

  return (
    <div className="space-y-3">
      {error && <WarningAlert>{error}</WarningAlert>}
      {codigo ? (
        <BandaCodigo
          rotulo="Mándale esto al bot:"
          texto={comando}
          quedan={quedan}
          copiado={copiado === "codigo"}
          onCopiar={() => copiar(comando, "codigo")}
          extra={abrirBot && <> · {abrirBot}</>}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void accion({ accion: "codigo" })}
            className={principal48}
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Vincular Telegram
          </button>
          {dato.chats.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Ningún chat anota todavía.</p>}
          {abrirBot && <span className="text-sm">{abrirBot}</span>}
        </div>
      )}

      {dato.chats.length > 0 && (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {dato.chats.map((c) => (
            <FilaVinculada
              key={c.chatId}
              titulo={c.nombre}
              detalle={`Desde ${formatDateShort(c.vinculadoEn)} · ${usoDe(c.ultimoUso ?? null)}`}
              etiquetaQuitar={`Desvincular ${c.nombre}`}
              onQuitar={async () => {
                if (!(await confirm({
                  title: `¿Desvincular el chat de ${c.nombre}?`,
                  description: "Deja de poder anotar al instante.",
                  intent: "danger",
                  confirmLabel: "Sí, desvincular",
                }))) return;
                void accion({ chatId: c.chatId }, "DELETE");
              }}
            />
          ))}
        </ul>
      )}

      <Conexion canal={canal} />
    </div>
  );
}

export default function TelegramPanel({ canal }: { canal: Canal<EstadoTelegram> }) {
  return (
    <Plegable
      clave="asistente-ia:automatizaciones:telegram"
      titulo={
        <span className="inline-flex items-center gap-2">
          <Send aria-hidden="true" className="h-4 w-4 text-[var(--text-secondary)]" />
          Telegram
        </span>
      }
      resumen={<span className="text-sm">{resumenTelegram(canal) ?? "Leyendo el estado…"}</span>}
      acciones={
        <InfoTip
          title="Anotar por Telegram"
          what="Le hablas al bot, escribiendo o con un audio, y te muestra qué va a anotar con Confirmar y Cancelar. Recién cuando tocas Confirmar queda en los libros."
          affects="Sólo los chats vinculados con un código de esta pantalla pueden anotar. El código dura 15 minutos y se usa una vez."
          side="left"
        />
      }
    >
      <Cuerpo canal={canal} />
    </Plegable>
  );
}
