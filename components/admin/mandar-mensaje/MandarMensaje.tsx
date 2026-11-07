"use client";

/**
 * Crecimiento › Mandar mensaje (19-10): un solo lugar para escribirle a un
 * grupo de clientes, con dos modos en `?sub=`:
 *
 *  · «Uno por uno (WhatsApp)» — era Clientes › Mensajes masivos: cada «Abrir»
 *    deja el mensaje escrito en TU WhatsApp y lo mandas tú. Permiso de Clientes.
 *  · «Automático» — era Crecimiento › Campañas: lo manda el servidor, ahora o
 *    a una hora, y cuenta a cuántos llegó. Permiso de Campañas.
 *
 * Los dos comparten el «Para quién» (`GRUPOS_MENSAJE`), el editor con las
 * mismas plantillas y «Lo que ya mandaste» (lo abierto uno por uno se anota ahí
 * como envío del canal `manual`).
 */
import { useMemo, useState } from "react";
import { LoadingState, SectionTitle, StatCard } from "@buleje/design-system";
import { AlertTriangle, MoreHorizontal, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones } from "@/components/admin/shared/BarraDeSecciones";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useParamDeEntrada } from "@/hooks/use-param-de-entrada";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import {
  aTextoDelServidor,
  deTextoDelServidor,
  GRUPOS_MENSAJE,
  grupoDesdeParam,
  grupoMensaje,
  VARIABLES_AUTOMATICO,
  VARIABLES_UNO_POR_UNO,
} from "@/lib/admin/grupos-mensaje";
import { formatNumber } from "@/lib/format";
import { tenantCacheKey } from "@/lib/tenant-cache";
import { EditorMensaje } from "@/components/admin/mensajes-masivos/EditorMensaje";
import { VistaPreviaWhatsApp } from "@/components/admin/mensajes-masivos/VistaPreviaWhatsApp";
import { aplicarPlantilla, perteneceAlSegmento, PLANTILLAS, soloDigitos } from "@/components/admin/mensajes-masivos/shared";
import { useDestinatarios } from "@/components/admin/mensajes-masivos/use-destinatarios";
import { useCampanas } from "@/components/admin/crecimiento/campanas/use-campanas";
import { HistorialEnvios } from "./HistorialEnvios";
import { PanelAutomatico } from "./PanelAutomatico";
import { PanelUnoPorUno } from "./PanelUnoPorUno";
import { ParaQuien } from "./ParaQuien";
import { useModosMandarMensaje, type ModoMandarMensaje } from "./use-modos-mandar-mensaje";
import { useRegistroUnoPorUno } from "./use-registro-uno-por-uno";

const ID_PANEL = "mandar-mensaje-panel";
const ROTULO_MODO: Record<ModoMandarMensaje, string> = { "uno-por-uno": "Uno por uno (WhatsApp)", automatico: "Automático" };
/** «Ya mandados» del editor: los últimos textos distintos. */
const ANTERIORES_MAX = 4;

/** `vistaPedida`: la `?vista=` con la que se abrió el hub, leída por él antes de escribir la suya. */
export default function MandarMensaje({ vistaPedida = null }: { vistaPedida?: string | null } = {}) {
  const modos = useModosMandarMensaje(vistaPedida);
  if (!modos) return <LoadingState message="Cargando…" />;
  return <MandarMensajeConModos modos={modos} />;
}

function MandarMensajeConModos({ modos }: { modos: ModoMandarMensaje[] }) {
  const veUno = modos.includes("uno-por-uno");
  const veAuto = modos.includes("automatico");
  const { vista: pedido, irA } = useSubvistaModulo<ModoMandarMensaje>(
    tenantCacheKey("mandar-mensaje"),
    // Sólo los suyos: un modo recordado de otra sesión (otro rol, un enlace) no se abre.
    modos,
    veAuto ? "automatico" : "uno-por-uno",
  );
  /* Un modo que no le toca (link viejo, memoria de otro rol) cae en el que sí. */
  const modo: ModoMandarMensaje = modos.includes(pedido) ? pedido : modos[0];
  const uno = modo === "uno-por-uno";

  const dest = useDestinatarios();
  const c = useCampanas(veAuto);

  const [grupoId, setGrupoId] = useState("todos");
  const grupo = grupoMensaje(grupoId) ?? GRUPOS_MENSAJE[0];
  /* Mis clientes manda `?grupo=` con el segmento filtrado (un solo grupo). */
  useParamDeEntrada("grupo", (v) => {
    const g = grupoDesdeParam(v);
    if (g) setGrupoId(g.id);
  }, (p) => p.get("tab") === "campanas");
  const [busqueda, setBusqueda] = useState("");
  const [texto, setTexto] = useState<string>(PLANTILLAS[0].texto);
  const [clave, setClave] = useState<string>(PLANTILLAS[0].clave);
  const [telefonoEjemplo, setTelefonoEjemplo] = useState("");

  const ahora = useMemo(() => Date.now(), [dest.clientes]);
  const cuentas = useMemo(
    () => new Map(GRUPOS_MENSAJE.map((g) => [g.id, dest.clientes.filter((x) => perteneceAlSegmento(x, g.uno, null, ahora)).length])),
    [dest.clientes, ahora],
  );
  const delGrupo = useMemo(() => dest.clientes.filter((x) => perteneceAlSegmento(x, grupo.uno, null, ahora)), [dest.clientes, grupo.uno, ahora]);
  const q = uno ? busqueda.trim().toLowerCase() : "";
  const destinatarios = useMemo(
    () => (q ? delGrupo.filter((x) => x.name.toLowerCase().includes(q) || x.phone.includes(q)) : delGrupo),
    [delGrupo, q],
  );
  const conNumero = destinatarios.filter((x) => soloDigitos(x.phone)).length;
  const ejemplo = destinatarios.find((x) => x.phone === telefonoEjemplo) ?? destinatarios[0] ?? null;
  const textoVista = ejemplo ? aplicarPlantilla(texto, ejemplo) : texto;
  const rotuloPlantilla = PLANTILLAS.find((p) => p.clave === clave)?.rotulo;
  const nombrePorDefecto = `${rotuloPlantilla ?? "Mensaje"} · ${grupo.rotulo}`;

  const registro = useRegistroUnoPorUno({
    activo: veAuto,
    campanas: c,
    alta: {
      name: `${nombrePorDefecto} (uno por uno)`.slice(0, 200),
      message: aTextoDelServidor(texto.trim()),
      segment: grupo.id,
      totalAudience: delGrupo.filter((x) => soloDigitos(x.phone)).length,
    },
  });

  const anteriores = useMemo(() => {
    const vistos = new Set<string>();
    const lista: { id: string; rotulo: string; texto: string }[] = [];
    for (const x of c.campaigns) {
      const t = deTextoDelServidor(x.message);
      if (vistos.has(t)) continue;
      vistos.add(t);
      lista.push({ id: x.id, rotulo: x.name, texto: t });
      if (lista.length === ANTERIORES_MAX) break;
    }
    return lista;
  }, [c.campaigns]);

  const programadas = c.campaigns.filter((x) => x.status === "programada").length;
  const enviadas = c.campaigns.filter((x) => x.status === "completada").length;
  const alcanzados = c.campaigns.reduce((s, x) => s + (x.delivered || 0), 0);
  const kpis = useKpisPlegables({
    claveMemoria: "crecimiento-campanas",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: c.loading && c.campaigns.length === 0,
    resumen: `${programadas} programado${programadas === 1 ? "" : "s"}`,
    tarjetas: [
      <StatCard key="t" density="compact" label="Envíos" value={String(c.campaigns.length)} />,
      <StatCard key="p" density="compact" label="Programados" value={String(programadas)} />,
      <StatCard key="e" density="compact" label="Enviados" value={String(enviadas)} />,
      <StatCard key="a" density="compact" label="Clientes alcanzados" value={formatNumber(alcanzados)} />,
    ],
  });

  const acciones: MenuAccion[] = [
    {
      id: "actualizar",
      label: "Actualizar",
      hint: "Vuelve a leer tus clientes y lo que ya mandaste",
      icon: RefreshCw,
      onSelect: () => {
        void dest.recargar();
        if (veAuto) void c.recargar();
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Mandar mensaje</SectionTitle>
          <InfoTip
            title="Mandar mensaje"
            what="Un mensaje a un grupo de clientes, con su nombre en cada uno. Uno por uno: lo mandas tú desde tu WhatsApp. Automático: sale solo del WhatsApp del negocio (o la app), ahora o a la hora que elijas."
            affects="Los dos usan el mismo «Para quién» y las mismas plantillas. Automático sólo llega a quienes aceptaron promociones (Ley 29733) y sólo cambia {nombre}."
            example="«No compran hace más de 30 días» + «Te extrañamos», uno por uno; o «Hola {nombre}, hoy 20% en arroz» programado para el sábado 9:00."
          />
        </div>
        {modos.length > 1 && (
          <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">
            <BarraDeSecciones
              secciones={modos.map((m) => ({ clave: m, rotulo: ROTULO_MODO[m] }))}
              activa={modo}
              onCambiar={irA}
              etiqueta="Cómo lo mandas"
              idPanel={ID_PANEL}
            />
          </div>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {veAuto && kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Actualizar" />
        </div>
      </div>
      {veAuto && kpis.panel}

      <div role="tabpanel" id={ID_PANEL} className="space-y-4">
        {uno && dest.cargando ? (
          <LoadingState message="Cargando tus clientes…" />
        ) : uno && dest.error ? (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" aria-hidden />
            <p className="text-sm text-[var(--data-error-ink)]">No pudimos cargar tus clientes. Revisa tu conexión e inténtalo otra vez.</p>
            <button type="button" onClick={() => void dest.recargar()} className={button({ variant: "ghost", className: "rounded-xl px-4 text-sm" })}>Reintentar</button>
          </div>
        ) : (
          <>
            <ParaQuien
              modo={modo}
              grupo={grupo}
              onGrupo={setGrupoId}
              cuentaUno={(g) => cuentas.get(g.id) ?? 0}
              conteosAuto={c.conteos}
              busqueda={busqueda}
              onBusqueda={setBusqueda}
              alcanceUno={{ conNumero, total: dest.clientes.length, sinNumero: destinatarios.length - conNumero }}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <EditorMensaje
                plantilla={texto}
                claveElegida={clave}
                variables={uno ? VARIABLES_UNO_POR_UNO : VARIABLES_AUTOMATICO}
                anteriores={anteriores}
                onTexto={(t) => {
                  setTexto(t);
                  setClave("");
                }}
                onElegirPlantilla={(k, t) => {
                  setClave(k);
                  setTexto(t);
                }}
              />
              <VistaPreviaWhatsApp ejemplos={destinatarios.slice(0, 10)} elegido={ejemplo} onElegir={setTelefonoEjemplo} texto={textoVista} />
            </div>
            {uno ? (
              <PanelUnoPorUno
                destinatarios={destinatarios}
                plantilla={texto}
                abiertos={registro.abiertos}
                onAbrir={registro.abrir}
                estado={registro.estado}
                anota={veAuto}
              />
            ) : (
              <PanelAutomatico
                grupo={grupo}
                texto={texto}
                nombrePorDefecto={nombrePorDefecto}
                alcance={grupo.auto ? c.conteos[grupo.auto] : null}
                crear={c.crear}
                onUnoPorUno={veUno ? () => irA("uno-por-uno") : undefined}
              />
            )}
          </>
        )}
        {veAuto && <HistorialEnvios c={c} />}
      </div>
    </div>
  );
}
