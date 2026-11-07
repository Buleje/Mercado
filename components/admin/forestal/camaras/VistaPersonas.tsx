"use client";

/**
 * Vista «Personas» de Cámaras (2026-10-08): las fotos que el detector LOCAL del
 * mosaico («Ver todas en vivo») guardó en el Drive, sin tener que entrar al
 * Drive. Un día a la vez (hoy por defecto), filtro por cámara, las barras de
 * personas por hora (tocar una filtra la grilla) y la foto en grande.
 *
 * Todo sale de `GET /api/admin/camaras/personas/fotos`: la pantalla no suma.
 * Las imágenes se piden a los endpoints del Drive, que chequean los permisos.
 *
 * 10-10 (Brandon: «compactar»): cabecera en UNA fila (el día, el Drive y los
 * Indicadores; el título es la pestaña). La línea «7 fotos · de… a… · más en…»
 * y la pastilla de personas distintas pasaron a Indicadores plegables; la
 * pastilla salió también de «Hoy en el patio», que repetía la misma cifra.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { StatCard } from "@buleje/design-system";
import { Camera, FolderOpen, Image as ImageIcon, Loader2, Users } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { enlaceAlDrive } from "@/components/admin/forestal/plan-documentos/plan-documentos-api";
import { limaDateKey } from "@/lib/utils";
import GentePorHora from "./GentePorHora";
import GrillaPersonas, { type ChipCamara } from "./GrillaPersonas";
import VisitantesDelDia from "./VisitantesDelDia";
import SelectorDia from "./SelectorDia";
import VisorFotoPersona from "./VisorFotoPersona";
import { navegarEnElPanel } from "./navegar-panel";
import { useFotosPersonas } from "./use-fotos-personas";
import { useResumenPersonas } from "./use-resumen-personas";
import { useKpisPlegables } from "../kpis-plegables";
import { BLOQUE, BTN, diaLegible } from "./camaras-ui";

const INFO_POR_HORA = {
  what: "Cada barra es la foto con MÁS personas de esa hora. Toca una barra para ver sólo esas fotos.",
  affects:
    "El detector toma una foto cuando aparece alguien y, si sigue en cuadro, una por minuto: es lo más que se vio junto, no un conteo de gente distinta.",
  example: "«3» a las 10 h: en la foto con más gente de las 10 había 3 personas. Al pasar el mouse por la barra, cuántas DISTINTAS hubo en la hora (aprox., por la ropa).",
};

interface Props {
  activo: boolean;
  /** Cambia con «Actualizar» de la cabecera: vuelve a pedir el día. */
  recarga: number;
  /** Las cámaras dadas de alta: el filtro las ofrece aunque ese día no tengan fotos. */
  camaras: ReadonlyArray<{ id: string; nombre: string }>;
}

export default function VistaPersonas({ activo, recarga, camaras }: Props) {
  const hoy = limaDateKey();
  const [dia, setDia] = useState(hoy);
  const [camara, setCamara] = useState<string | null>(null);
  const [hora, setHora] = useState<number | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  /**
   * `clave` del grupo elegido (no la etiqueta: «Visitante A» puede correrse al
   * actualizar). La grilla muestra sólo sus fotos (su carpeta del día).
   */
  const [visitante, setVisitante] = useState<string | null>(null);
  const { galeria: g, cargando, error, recargar } = useFotosPersonas(dia, camara, activo);
  const personas = useResumenPersonas(dia, activo);
  const recargarPersonas = personas.recargar;

  const recargaVista = useRef(recarga);
  useEffect(() => {
    if (recargaVista.current === recarga) return;
    recargaVista.current = recarga;
    if (!activo) return;
    void recargar();
    void recargarPersonas();
  }, [recarga, activo, recargar, recargarPersonas]);

  const cambiarDia = (d: string) => {
    setDia(d);
    setHora(null);
    setAbierta(null);
    setVisitante(null);
  };
  const cambiarCamara = (c: string | null) => {
    setCamara(c);
    setHora(null);
  };

  /* Las que tomaron fotos ese día y, en 0, las demás dadas de alta (y la elegida aunque no tenga). */
  const chips = useMemo<ChipCamara[]>(() => {
    const lista = [...(g?.camaras ?? [])];
    for (const c of camaras) {
      if (!lista.some((x) => x.clave === c.id)) lista.push({ clave: c.id, nombre: c.nombre, fotos: 0 });
    }
    return lista;
  }, [g?.camaras, camaras]);
  const anterior = g?.anteriorConFotos ?? null;
  /* Si tras «Actualizar» ese grupo ya no está (se borró su primera foto), la elección queda limpia. */
  const elegido = useMemo(
    () => (visitante ? (personas.resumen?.grupos.find((x) => x.clave === visitante) ?? null) : null),
    [visitante, personas.resumen],
  );
  const delVisitante = useMemo(() => (elegido ? new Set(elegido.fotos.map((f) => f.docId)) : null), [elegido]);
  const fotos = useMemo(
    () =>
      (g?.fotos ?? []).filter(
        (f) => (hora === null || Number(f.hora.slice(0, 2)) === hora) && (!delVisitante || delVisitante.has(f.id)),
      ),
    [g, hora, delVisitante],
  );

  const esHoy = dia === hoy;
  const hrefDrive = enlaceAlDrive(g?.carpetaAbrir ?? null);
  const r = g?.resumen;
  const p = personas.resumen && personas.resumen.fotosConCajas > 0 ? personas.resumen : null;
  const hayFotos = Boolean(r && g && g.totalDia > 0);

  /* Las cifras del día, plegables (como «Hoy en el patio»). Sin fotos, no hay panel. */
  const kpis = useKpisPlegables({
    claveMemoria: "camaras-personas",
    alto: "md",
    compactoEnMovil: true,
    resumen: r && hayFotos
      ? `${r.fotos} ${r.fotos === 1 ? "foto" : "fotos"}${p ? ` · ${p.personas} ${p.personas === 1 ? "persona" : "personas"}` : ""}`
      : undefined,
    tarjetas: r && hayFotos ? [
      <StatCard
        key="fotos"
        label="Fotos"
        value={r.fotos}
        icon={ImageIcon}
        subValue={[
          r.primera && r.ultima ? (r.primera === r.ultima ? `a las ${r.primera}` : `de ${r.primera} a ${r.ultima}`) : null,
          g?.truncado ? "se muestran las 2000 más nuevas" : null,
        ].filter(Boolean).join(" · ") || undefined}
      />,
      ...(p ? [
        <StatCard
          key="personas"
          label="Personas distintas"
          value={p.personas}
          icon={Users}
          subValue={`${p.conChaleco} con chaleco · aprox.${p.sinAgrupar > 0 ? ` · ${p.sinAgrupar} lejos sin agrupar` : ""}`}
        />,
      ] : []),
      ...(r.camaraTop ? [
        <StatCard key="camara" label="Más fotos en" value={r.camaraTop.nombre} icon={Camera} subValue={`${r.camaraTop.fotos} ${r.camaraTop.fotos === 1 ? "foto" : "fotos"}`} />,
      ] : []),
    ] : [],
  });

  return (
    <div className="space-y-4" data-testid="camaras-personas">
      {/* Una fila: el día · ⓘ · Drive · Indicadores. El título visible es la pestaña. */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="sr-only">Personas del {diaLegible(dia)}</h2>
        <SelectorDia fecha={dia} hoy={hoy} onCambiar={cambiarDia} etiqueta="Día de las fotos" />
        {/* El día y su ⓘ viajan juntos: a 400 px el ⓘ quedaba solo al comienzo de otra fila. */}
        <span className="inline-flex items-center gap-1.5">
          <span className="text-sm font-bold text-[var(--text-secondary)]">{diaLegible(dia)}</span>
          <InfoTip
            title="Personas"
            what="Las fotos que toma el detector de personas mientras tienes abierto «Ver todas en vivo». Se guardan solas en el Drive (Cámaras › Personas › cámara › día) y no pasan por la IA paga."
            affects="«Personas distintas» junta las fotos por el color de la ropa, nunca por la cara: es aprox. Ropa parecida junta a dos personas; con el chaleco tapado, alguien del personal cuenta como visita. Sólo las ven admin, dueño y almacenero."
            example="«7 fotos · 3 personas»: el detector tomó 7 fotos y en ellas había 3 personas distintas."
          />
        </span>
        {g?.carpetaId && (
          <a
            href={hrefDrive}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) return;
              e.preventDefault();
              navegarEnElPanel(hrefDrive);
            }}
            className={BTN}
            title="Abrir en el Drive"
          >
            <FolderOpen className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Abrir en el Drive</span>
          </a>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-2">{kpis.boton}</div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-ink)]"
        >
          No se pudieron leer las fotos: {error}
        </p>
      ) : !g ? (
        <p className="flex items-center gap-2 px-1 py-8 text-sm text-[var(--text-tertiary)]" aria-busy>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las fotos del día…
        </p>
      ) : g.totalDia === 0 ? (
        <div className={`${BLOQUE} flex flex-col items-center gap-3 py-10 text-center`}>
          <Users className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-base font-bold text-[var(--text-primary)]">
            {!g.carpetaId
              ? "Todavía no hay fotos de personas: se toman solas con «Ver todas en vivo» abierto."
              : esHoy
                ? "Hoy el detector todavía no vio a nadie."
                : "Ese día el detector no vio a nadie."}
          </p>
          {anterior && (
            <button type="button" onClick={() => cambiarDia(anterior)} className={BTN}>
              Ver el último día con fotos ({diaLegible(anterior)})
            </button>
          )}
        </div>
      ) : (
        <div className={cargando ? "space-y-4 opacity-60" : "space-y-4"} aria-busy={cargando}>
          {kpis.panel}
          <GentePorHora
            filas={g.porHora}
            titulo="Personas por hora"
            info={INFO_POR_HORA}
            vacio="Esa cámara no tomó fotos de personas ese día."
            horaElegida={hora}
            onElegirHora={setHora}
            compacta
            distintas={p ? new Map(p.porHora.map((x) => [x.hora, x.personas])) : undefined}
          />
          <VisitantesDelDia
            resumen={personas.resumen}
            error={personas.error}
            elegido={elegido?.clave ?? null}
            /* Unir o separar visitantes en su ficha: el conteo de Indicadores y la grilla se releen. */
            onCambio={() => void recargarPersonas()}
            onElegir={(v) => {
              setVisitante(v);
              setAbierta(null);
            }}
          />
          <section className={BLOQUE} aria-label={elegido ? `Fotos de ${elegido.etiqueta}` : "Fotos de personas"}>
            <GrillaPersonas
              key={`${dia}|${camara ?? ""}|${hora ?? ""}|${elegido?.clave ?? ""}`}
              fotos={fotos}
              camaras={chips}
              totalDelDia={g.totalDia}
              camara={camara}
              onCamara={cambiarCamara}
              hora={hora}
              onQuitarHora={() => setHora(null)}
              onAbrir={setAbierta}
            />
          </section>
        </div>
      )}

      {abierta !== null && fotos[abierta] && (
        <VisorFotoPersona
          fotos={fotos}
          indice={abierta}
          dia={dia}
          onIndice={setAbierta}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  );
}
