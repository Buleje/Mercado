"use client";

/**
 * WhatsAppAnotarPanel — habilitar tu propio WhatsApp para anotar.
 *
 * Lo mismo que resuelve Telegram —emparejar un canal con el negocio— pero con
 * un riesgo que Telegram no tiene: acá el número YA atiende clientes. Por eso
 * el ⓘ dice qué cambia para quién: los teléfonos de esta lista hablan con el
 * bot que escribe en los libros; todos los demás siguen con la tienda.
 *
 * El código dura 15 minutos y se quema al usarse: quien lo tenga puede
 * enganchar SU teléfono y anotar plata.
 *
 * El número del negocio NO se conecta acá: es el de Mensajes › Bot WhatsApp
 * (un enlace, no una copia de ese panel).
 */

import { Link2, Loader2, MessageCircle } from "@buleje/design-system/icons";
import { WarningAlert } from "@buleje/design-system";
import Plegable from "@/components/admin/shared/Plegable";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDateShort } from "@/lib/format";
import { BandaCodigo, FilaVinculada, LineaAviso, principal48, SinDato } from "./piezas-canal";
import { masReciente, useCopiar, useCuentaRegresiva, usoDe, type Canal } from "./shared";
import type { EstadoWhatsApp } from "./tipos";

const BOT_DEL_NUMERO = "/admin?tab=whatsapp-inbox&vista=bot";

/**
 * Un teléfono se muestra agrupado, no como un chorro de dígitos: la lista se
 * lee para reconocer «ese es el mío» de un vistazo.
 */
export function telefonoLegible(d: string): string {
  if (d.length <= 6) return d;
  const pais = d.slice(0, d.length - 9);
  const resto = d.slice(-9);
  return `${pais ? `+${pais} ` : ""}${resto.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}`;
}

/** El estado del canal en una línea, para verlo plegado. */
export function resumenWhatsApp(c: Canal<EstadoWhatsApp>): string | null {
  if (c.cargando) return null;
  if (!c.dato) return "No se pudo leer el estado";
  if (!c.dato.activo) return "Sin número del negocio conectado";
  const n = c.dato.duenos.length;
  if (n === 0) return "Sin teléfonos habilitados";
  const uso = masReciente(c.dato.duenos.map((d) => d.ultimoUso));
  return `${n} ${n === 1 ? "teléfono" : "teléfonos"} · ${usoDe(uso)}`;
}

function Cuerpo({ canal }: { canal: Canal<EstadoWhatsApp> }) {
  const { confirm } = useConfirm();
  const { copiado, copiar } = useCopiar();
  const { dato, error, ocupado, accion, cargadoEn } = canal;
  const quedan = useCuentaRegresiva(dato?.codigo, cargadoEn);

  if (!dato) return <SinDato cargando={canal.cargando} error={error} />;

  if (!dato.activo) {
    return (
      <div className="space-y-3">
        {error && <WarningAlert>{error}</WarningAlert>}
        <LineaAviso
          titulo="Número del negocio"
          ayuda="Para anotar por WhatsApp, el negocio necesita su número conectado. Conéctalo y vuelve acá para habilitar tu teléfono."
        >
          Falta conectar el número del negocio en{" "}
          <EnlacePanel href={BOT_DEL_NUMERO}>Mensajes › Bot WhatsApp</EnlacePanel>
        </LineaAviso>
      </div>
    );
  }

  const codigo = dato.codigo && quedan > 0 ? dato.codigo.codigo : null;
  const frase = codigo ? `vincular ${codigo}` : "";

  return (
    <div className="space-y-3">
      {error && <WarningAlert>{error}</WarningAlert>}
      {codigo ? (
        <BandaCodigo
          rotulo="Manda esto al WhatsApp del negocio:"
          texto={frase}
          quedan={quedan}
          copiado={copiado === "codigo"}
          onCopiar={() => copiar(frase, "codigo")}
          extra=" · desde el teléfono que va a anotar"
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
            Habilitar un teléfono
          </button>
          <p className="text-sm text-[var(--text-secondary)]">
            {dato.duenos.length === 0 && "Ningún teléfono anota todavía. "}
            El número del negocio{dato.comoSeLlama ? ` (${dato.comoSeLlama})` : ""} se conecta en{" "}
            <EnlacePanel href={BOT_DEL_NUMERO}>Mensajes › Bot WhatsApp</EnlacePanel>.
          </p>
        </div>
      )}

      {dato.duenos.length > 0 && (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {dato.duenos.map((d) => (
            <FilaVinculada
              key={d.telefono}
              titulo={telefonoLegible(d.telefono)}
              detalle={`${d.nombre} · desde ${formatDateShort(d.vinculadoEn)} · ${usoDe(d.ultimoUso ?? null)}`}
              etiquetaQuitar={`Quitar ${telefonoLegible(d.telefono)}`}
              onQuitar={async () => {
                if (!(await confirm({
                  title: `¿Quitar ${telefonoLegible(d.telefono)}?`,
                  description: "Deja de poder anotar al instante y vuelve a ser atendido como cliente.",
                  intent: "danger",
                  confirmLabel: "Sí, quitar",
                }))) return;
                void accion({ telefono: d.telefono }, "DELETE");
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WhatsAppAnotarPanel({ canal }: { canal: Canal<EstadoWhatsApp> }) {
  return (
    <Plegable
      clave="asistente-ia:automatizaciones:whatsapp"
      titulo={
        <span className="inline-flex items-center gap-2">
          <MessageCircle aria-hidden="true" className="h-4 w-4 text-[var(--text-secondary)]" />
          WhatsApp
        </span>
      }
      resumen={<span className="text-sm">{resumenWhatsApp(canal) ?? "Leyendo el estado…"}</span>}
      acciones={
        <InfoTip
          title="Anotar por WhatsApp"
          what="Le escribes al mismo número del negocio, con texto o una nota de voz, y te muestra qué va a anotar con Confirmar y Cancelar. Recién cuando tocas Confirmar queda en los libros."
          affects="Sólo los teléfonos de esta lista hablan con el bot que anota. Cualquier otro número sigue siendo atendido por la tienda, igual que hoy."
          example="Mandas un audio: «gasté 25 soles en flete». Te contesta con el resumen y los botones; tocas Confirmar y queda anotado."
          side="left"
        />
      }
    >
      <Cuerpo canal={canal} />
    </Plegable>
  );
}
