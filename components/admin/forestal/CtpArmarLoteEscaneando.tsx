"use client";

/**
 * Armar lotes de aserrío pasando la pistola por la pila (Brandon, 2026-09-26:
 * «escanear para escoger las trozas para consumo y hacer lote de varias
 * especies, y esos lotes se distribuyan en lotes separados por especies para
 * poder producir»).
 *
 * La pila del patio está mezclada y se escanea de corrido. La pantalla la
 * reparte a la vista en un grupo por especie + permiso —lo que el servidor
 * exige igual dentro de un lote (L-A1, ADR-393)— y al guardar cada grupo es un
 * lote: nuevo o sumado a uno abierto que lo acepte. Qué entra y cómo se
 * reparte lo dice `lote-por-escaneo.ts`; el servidor vuelve a mirar todo y lo
 * que rechace se muestra pieza por pieza.
 *
 * Los grupos se guardan uno por uno: si uno falla, los demás siguen, los
 * guardados salen de la pila y el que falló se queda con su motivo. La pila
 * vive también en el equipo (`usePilaEscaneada`): un recargo no la borra.
 *
 * Lo usan el patio (pantalla entera), la pestaña Lotes (modal) y la ficha de
 * una troza (modal, con esa troza ya en la pila).
 */

import { useEffect, useMemo, useState } from "react";
import { Layers, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import {
  claveDeGrupo,
  gruposDeLaPila,
  lotesQueAceptan,
  motivoFueraDeLaPila,
  pedidoDeLote,
  resumenDeLaPila,
  textoDelBoton,
  textoDelReparto,
} from "@/lib/forestal/lote-por-escaneo";
import { LoteCreadoSinPiezasError, type EstadoLotesAserrio } from "./hooks/use-lotes-aserrio";
import { usePilaEscaneada } from "./hooks/use-pila-escaneada";
import EscanerTrozas, { nombreDeTroza } from "./EscanerTrozas";
import {
  AvisoSacadas,
  CAMPO,
  codigoDeTroza,
  GrupoDeLaPilaCard,
  plural,
  type LoteArmado,
  type TrozaSacada,
} from "./armar-lote-escaneo-partes";

export { AvisoLotesArmados, type LoteArmado } from "./armar-lote-escaneo-partes";

export default function CtpArmarLoteEscaneando({
  estado,
  onArmado,
  inicial,
  sinSenal = false,
}: {
  estado: Pick<
    EstadoLotesAserrio,
    "lotes" | "trozas" | "cargando" | "error" | "crearConTrozas" | "agregarTrozas" | "deshacer"
  >;
  /** Se guardó al menos un grupo: la pantalla ofrece qué hacer con cada lote. */
  onArmado: (lotes: LoteArmado[]) => void;
  /** Trozas que arrancan en la pila (la ficha desde la que se abrió). */
  inicial?: readonly string[];
  /** Sin señal no se puede crear: el botón lo dice en vez de fallar grupo por grupo. */
  sinSenal?: boolean;
}) {
  /** Las escaneadas, la última primero: es la que se acaba de tocar. */
  const [pila, setPila] = usePilaEscaneada(inicial);
  /** A qué lote va cada grupo, por su clave. Sin entrada = lote nuevo. */
  const [destinos, setDestinos] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [sacadas, setSacadas] = useState<TrozaSacada[]>([]);

  const porId = useMemo(() => new Map(estado.trozas.map((t) => [t.id, t])), [estado.trozas]);
  const piezas = useMemo(
    () => pila.map((id) => porId.get(id)).filter((t): t is TrozaConsumible => t != null),
    [pila, porId],
  );
  /* Los grupos se arman en el orden en que se escaneó: la PRIMERA pieza de
     cada especie fija el lugar de su tarjeta, que no salta con cada lectura. */
  const grupos = useMemo(() => gruposDeLaPila([...piezas].reverse()), [piezas]);
  const resumen = resumenDeLaPila(piezas);
  /* Un lote abierto es destino de UN grupo: dos grupos de la misma especie
     (permisos distintos) sumados al mismo lote sin permiso lo dejaban mezclado. */
  const aceptan = useMemo(
    () =>
      new Map(
        grupos.map((g) => {
          const tomados = new Set(
            Object.entries(destinos).filter(([clave]) => clave !== g.clave).map(([, id]) => id),
          );
          return [g.clave, lotesQueAceptan(estado.lotes, g).filter((l) => !tomados.has(l.id))];
        }),
      ),
    [grupos, estado.lotes, destinos],
  );
  const loteDe = (clave: string) =>
    aceptan.get(clave)?.find((l) => l.id === destinos[clave]) ?? null;
  const sumas = grupos.filter((g) => loteDe(g.clave)).length;
  const nuevos = grupos.length - sumas;
  const elegidas = useMemo(() => new Set(pila), [pila]);
  const reciente = piezas[0] ? claveDeGrupo(piezas[0]) : null;

  /* Lo guardado que ya no está libre sale solo, diciendo por qué: otra tablet
     la metió en un lote, se aserró, o el recargo la encontró fuera del patio.
     Nunca en medio de un guardado: ahí las recién guardadas se ven «ya en el
     lote» por un instante antes de salir de la pila. */
  useEffect(() => {
    if (guardando || estado.cargando || estado.error) return;
    const fuera: TrozaSacada[] = [];
    for (const id of pila) {
      const t = porId.get(id);
      const motivo = t ? motivoFueraDeLaPila(t) : "Ya no está en el patio";
      if (motivo) fuera.push({ id, codigo: t ? codigoDeTroza(t) : null, motivo });
    }
    if (fuera.length === 0) return;
    const ids = new Set(fuera.map((s) => s.id));
    setPila((p) => p.filter((id) => !ids.has(id)));
    setSacadas(fuera);
  }, [pila, porId, guardando, estado.cargando, estado.error, setPila]);

  async function guardar() {
    if (grupos.length === 0 || guardando) return;
    setGuardando(true);
    setErrores({});
    const hechos: LoteArmado[] = [];
    const fallas: Record<string, string> = {};
    try {
      /* En serie y no en paralelo: cada guardado recarga el patio, y el
         correlativo LA-AAAA-NNN del servidor se toma de a uno. */
      for (const g of grupos) {
        const ids = g.trozas.map((t) => t.id);
        const lote = loteDe(g.clave);
        try {
          const r = lote
            ? await estado.agregarTrozas(lote.id, ids)
            : await estado.crearConTrozas({ ...pedidoDeLote(g, notas), trozaIds: ids });
          /* El servidor no aceptó ninguna: un lote nuevo vacío no sirve y
             confunde. Se deshace y el grupo queda en la pila con el porqué. */
          if (!lote && r.agregadas === 0) {
            await estado.deshacer(r.loteId).catch((err: unknown) => {
              fallas[g.clave] = `Quedó abierto el lote ${r.code ?? ""} vacío (${err instanceof Error ? err.message : String(err)}): deshazlo en Lotes. `;
            });
            fallas[g.clave] = `${fallas[g.clave] ?? ""}Ninguna troza entró: ${r.rechazadas.map((x) => `${x.codigo ?? x.id.slice(-6)} ${x.motivo}`).join(" · ") || "el servidor las rechazó"}`;
            continue;
          }
          hechos.push({
            ...r,
            code: lote ? lote.code : r.code,
            nuevo: !lote,
            especie: g.especie,
            permiso: g.permiso,
          });
          const salen = new Set(ids);
          setPila((p) => p.filter((id) => !salen.has(id)));
        } catch (e) {
          if (e instanceof LoteCreadoSinPiezasError) {
            /* El lote se abrió y las piezas no entraron: el reintento las suma
               a ESE lote, no abre otro. */
            setDestinos((prev) => ({ ...prev, [g.clave]: e.loteId }));
            fallas[g.clave] = `Se abrió el lote ${e.code} pero las trozas no entraron (${e.message}). Vuelve a guardar: se suman a ${e.code}.`;
          } else {
            fallas[g.clave] = e instanceof Error ? e.message : String(e);
          }
        }
      }
    } finally {
      setErrores(fallas);
      if (Object.keys(fallas).length === 0) {
        setNotas("");
        setDestinos({});
      }
      setGuardando(false);
      if (hechos.length > 0) onArmado(hechos);
    }
  }

  const textoBoton = textoDelBoton({
    grupos: grupos.length,
    piezas: resumen.piezas,
    sumas,
    loteUnico: grupos.length === 1 ? (loteDe(grupos[0].clave)?.code ?? null) : null,
  });

  return (
    <div className="space-y-3" data-armar-lote>
      <EscanerTrozas
        trozas={estado.trozas}
        yaElegidas={elegidas}
        bloqueo={motivoFueraDeLaPila}
        accion="a la pila"
        mostrarCuenta={false}
        onTroza={(t) => setPila((p) => [t.id, ...p])}
        /* Con el patio sin leer, «ninguna troza con ese código» es falso: la
           pieza existe, todavía no llegó la lista (medido en dev: las 3
           primeras lecturas del primer segundo caían ahí). */
        onDesconocido={() =>
          estado.trozas.length === 0 && estado.error
            ? "No se pudo leer el patio (¿sin señal?): lo ya escaneado sigue guardado en este equipo."
            : estado.cargando && estado.trozas.length === 0
              ? "Todavía se está leyendo el patio: vuelve a escanear en un momento."
              : undefined
        }
        /* Cuando la pieza abre un grupo nuevo se dice: el operador tiene que
           saber que esa troza va a OTRO lote sin mirar la pantalla. */
        avisoAlTomar={(t) => {
          if (grupos.length === 0 || grupos.some((g) => g.clave === claveDeGrupo(t))) return null;
          const otroPermiso = grupos.some(
            (g) => claveEspecie(g.especie) === claveEspecie(t.especieComun),
          );
          return {
            tono: "ok",
            mensaje: `Troza ${nombreDeTroza(t)} a la pila: ${otroPermiso ? "es de otro permiso, " : ""}va en otro lote (${grupos.length + 1} lotes).`,
          };
        }}
      />
      {estado.cargando && estado.trozas.length === 0 && (
        <p className="flex items-center gap-2 text-base text-[var(--text-tertiary)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Leyendo el patio…
        </p>
      )}
      {estado.error && (
        <p
          role="alert"
          className="rounded-xl bg-[var(--data-error-500)]/10 px-3 py-2 text-base font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]"
        >
          No se pudo leer el patio: {estado.error}
        </p>
      )}
      {sacadas.length > 0 && <AvisoSacadas sacadas={sacadas} onCerrar={() => setSacadas([])} />}

      {grupos.length === 0 ? (
        <p className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-5 text-center text-base text-[var(--text-secondary)]">
          {/* Sin el patio leído (cargando o sin señal) la pila guardada no se
              puede mostrar, pero sigue ahí: decirlo evita que se escanee todo
              de nuevo. */}
          {pila.length > 0 && (estado.cargando || estado.error)
            ? `La pila guardada tiene ${plural(pila.length, "troza", "trozas")}: aparecen al leer el patio.`
            : "Escanea la primera troza: la pila se reparte en un lote por especie y permiso."}
        </p>
      ) : (
        <section aria-label="La pila" className="space-y-3">
          <div className="flex items-start gap-1.5">
            <p className="text-base font-bold text-[var(--text-primary)]" aria-live="polite">
              {plural(resumen.piezas, "troza", "trozas")} · {fmtM3(resumen.m3)} m³ ·{" "}
              {plural(resumen.especies, "especie", "especies")} → {textoDelReparto(nuevos, sumas)}
            </p>
            <InfoTip
              title="Un lote por especie y permiso"
              what="Escaneas la pila mezclada y al guardar se reparte: cada tarjeta de abajo es un lote."
              affects="Un lote no mezcla especies ni permisos (el libro lo exige para producir): la misma especie de dos permisos son dos lotes, y las trozas sin permiso van aparte."
              example="8 Tornillo + 3 Copaiba de un permiso + 2 Copaiba de otro → «Crear 3 lotes (13 trozas)»."
              side="left"
            />
          </div>

          {grupos.map((g) => (
            <GrupoDeLaPilaCard
              key={g.clave}
              grupo={g}
              lotes={aceptan.get(g.clave) ?? []}
              destino={destinos[g.clave] ?? "nuevo"}
              onDestino={(d) => setDestinos((prev) => ({ ...prev, [g.clave]: d }))}
              onQuitar={(id) => setPila((p) => p.filter((x) => x !== id))}
              guardando={guardando}
              error={errores[g.clave] ?? null}
              reciente={grupos.length > 1 && g.clave === reciente}
            />
          ))}

          {nuevos > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-bold text-[var(--text-secondary)]">
                Nota {nuevos === 1 ? "del lote nuevo" : "de los lotes nuevos"} (opcional)
              </span>
              <input
                type="text"
                value={notas}
                maxLength={500}
                onChange={(e) => setNotas(e.target.value)}
                disabled={guardando}
                placeholder="ej: pila junto al carro 2"
                className={CAMPO}
              />
            </label>
          )}

          {/* Fija abajo: con una pila de 30 trozas en 5 grupos, «Crear» quedaba
              debajo de todo y había que bajar hasta el final para guardar. */}
          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap justify-end gap-2 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-1 py-2">
            <button
              type="button"
              onClick={() => {
                setPila([]);
                setErrores({});
              }}
              disabled={guardando}
              className="inline-flex h-12 items-center rounded-xl border border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              Vaciar la pila
            </button>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={guardando || sinSenal}
              title={sinSenal ? "Sin señal: guárdala cuando vuelva la conexión" : undefined}
              className="inline-flex h-12 grow items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-base font-bold text-white hover:bg-[var(--accent-600)] disabled:opacity-50 sm:grow-0"
            >
              {guardando ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Layers className="h-5 w-5" aria-hidden />
              )}
              {textoBoton}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
