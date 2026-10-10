"use client";

/**
 * Vista «Personas» de Cámaras (2026-10-08): las fotos que el detector LOCAL del
 * mosaico («Ver todas en vivo») guardó en el Drive, sin tener que entrar al
 * Drive. Un día a la vez (hoy por defecto), filtro por cámara, las barras de
 * personas por hora (tocar una filtra la grilla) y la foto en grande.
 *
 * Todo sale de `GET /api/admin/camaras/personas/fotos`: la pantalla no suma.
 * Las imágenes se piden a los endpoints del Drive, que chequean los permisos.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { FolderOpen, Loader2, Users } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { enlaceAlDrive } from "@/components/admin/forestal/plan-documentos/plan-documentos-api";
import { limaDateKey } from "@/lib/utils";
import GentePorHora from "./GentePorHora";
import GrillaPersonas, { type ChipCamara } from "./GrillaPersonas";
import ResumenPersonasHoy from "./ResumenPersonasHoy";
import VisitantesDelDia from "./VisitantesDelDia";
import SelectorDia from "./SelectorDia";
import VisorFotoPersona from "./VisorFotoPersona";
import { navegarEnElPanel } from "./navegar-panel";
import { useFotosPersonas } from "./use-fotos-personas";
import { useResumenPersonas } from "./use-resumen-personas";
import { BLOQUE, BTN, diaLegible } from "./camaras-ui";

const INFO_POR_HORA = {
  what: "Cada barra es la foto con MÁS personas de esa hora. Toca una barra para ver sólo esas fotos.",
  affects:
    "El detector toma una foto cuando aparece alguien y, si sigue en cuadro, una por minuto: es lo más que se vio junto, no un conteo de gente distinta.",
  example: "«3» a las 10 h: en la foto con más gente de las 10 había 3 personas.",
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

  return (
    <div className="space-y-4" data-testid="camaras-personas">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-1.5">
          <SectionTitle>
            Personas
            <span className="ml-2 text-sm font-normal text-[var(--text-tertiary)]">{diaLegible(dia)}</span>
          </SectionTitle>
          <InfoTip
            title="Personas"
            what="Las fotos que toma el detector de personas mientras tienes abierto «Ver todas en vivo»."
            affects="Se guardan solas en el Drive (Cámaras › Personas › cámara › día) y no pasan por la IA paga. Sólo las ven admin, dueño y almacenero."
            example="«Apareció alguien» a las 06:42 en el Portón: la primera persona del día."
          />
        </div>
        <SelectorDia fecha={dia} hoy={hoy} onCambiar={cambiarDia} etiqueta="Día de las fotos" />
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
          {r && (
            <p className="text-sm text-[var(--text-secondary)]" data-testid="personas-resumen">
              <b className="tabular-nums text-[var(--text-primary)]">{r.fotos}</b> {r.fotos === 1 ? "foto" : "fotos"}
              {r.primera && r.ultima && (
                <>
                  {" · "}
                  {r.primera === r.ultima ? "a las " : "de "}
                  <b className="tabular-nums text-[var(--text-primary)]">{r.primera}</b>
                  {r.primera !== r.ultima && (
                    <>
                      {" a "}
                      <b className="tabular-nums text-[var(--text-primary)]">{r.ultima}</b>
                    </>
                  )}
                </>
              )}
              {r.camaraTop && (
                <>
                  {" · más en "}
                  <b className="text-[var(--text-primary)]">{r.camaraTop.nombre}</b> ({r.camaraTop.fotos})
                </>
              )}
              {g.truncado && " · se muestran las 2000 más nuevas"}
              <span className="ml-2 align-middle">
                <ResumenPersonasHoy resumen={personas.resumen} esHoy={esHoy} />
              </span>
            </p>
          )}
          <GentePorHora
            filas={g.porHora}
            titulo="Personas por hora"
            info={INFO_POR_HORA}
            vacio="Esa cámara no tomó fotos de personas ese día."
            horaElegida={hora}
            onElegirHora={setHora}
            compacta
          />
          <VisitantesDelDia
            resumen={personas.resumen}
            error={personas.error}
            elegido={elegido?.clave ?? null}
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
