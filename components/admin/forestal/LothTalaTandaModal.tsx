"use client";

/**
 * «Talar varios árboles» — la jornada de tala en un solo guardado.
 *
 * Pedido de Brandon (28-09): «marcas en “Ver censo” los árboles que tumbaste y
 * llenas sus medidas en una sola planilla, con los datos del censo ya puestos.
 * La jornada de 8 árboles entra en un solo guardado». Antes cada tala era abrir
 * el formulario, elegir el árbol y tipear fecha, motosierrista y hora otra vez
 * (el 28-09 fueron 4, una por una).
 *
 * Una línea de tala por fila, por la MISMA ruta del libro que la tala de a una:
 * T3 (ya talado), T8 (bajo el DMC) y el mes cerrado se validan igual. Si una
 * fila falla, las demás entran y la fallida queda marcada con su motivo; al
 * terminar ofrece «Trozar estos árboles».
 *
 * En una PLANTACIÓN (ADR-459, Brandon 02-10) la planilla también se llena
 * desde el registro: «Bolaina × N» son N filas de esa especie con los códigos
 * propuestos, y el saldo registrado − talado − la planilla baja mientras se
 * mide. T7 (especie fuera del registro) cae en SU fila, como T3 y T8.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, ShieldAlert, TreePine } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { especieDeLinea, saldoDeLaPlanilla, type EspecieDelRegistro } from "@/lib/forestal/loth-tala-plantacion";
import { codigosDeLaPlanilla, pideJustificacion, type FilaTala } from "@/lib/forestal/loth-tala-tanda";
import { useCensoDeTala } from "./hooks/use-censo-de-tala";
import { useRegistroPlantacion } from "./hooks/use-registro-plantacion";
import { useMotosierristas, usePlanDeLaTanda, useTalaEnTanda, type TandaTalaInicial } from "./hooks/use-tala-en-tanda";
import LothCensoElegirModal from "./LothCensoElegirModal";
import LothTalaTandaComunes from "./LothTalaTandaComunes";
import LothTalaTandaPie from "./LothTalaTandaPie";
import LothTalaTandaPlanilla from "./LothTalaTandaPlanilla";
import LothTalaTandaRegistro from "./LothTalaTandaRegistro";

export default function LothTalaTandaModal({
  inicial,
  caratulaId,
  onClose,
  onGuardadas,
  onTrozar,
}: {
  inicial: TandaTalaInicial;
  caratulaId: string | null;
  onClose: () => void;
  /** Recargar el libro después de asentar. */
  onGuardadas: () => Promise<void> | void;
  /** «Trozar estos árboles»: los códigos que entraron. */
  onTrozar: (codigos: string[]) => void;
}) {
  const censo = useCensoDeTala(inicial.planId, true);
  const recargarCenso = censo.recargar;
  const alGuardar = useCallback(async () => {
    await onGuardadas();
    recargarCenso();
  }, [onGuardadas, recargarCenso]);
  const t = useTalaEnTanda({ inicial, caratulaId, onGuardadas: alGuardar });
  const motosierristas = useMotosierristas();
  /* Plantación (ADR-459): el registro se lee UNA vez al abrir. Las filas ya
     guardadas siguen descontando desde la planilla (releerlo las restaría dos veces). */
  const planTanda = usePlanDeLaTanda(inicial);
  const registro = useRegistroPlantacion(planTanda.plan, true, planTanda.especiesDelPlan);
  const plantacion = registro.esPlantacion;
  const conRegistro = plantacion && registro.especies.length > 0;
  const agregarDelRegistro = t.agregarDelRegistro;
  const codigosPara = registro.codigosPara;
  const agregarEspecie = useCallback(
    (e: EspecieDelRegistro, n: number, ya: readonly string[]) => {
      const codigos = codigosPara(e.especie, n, ya);
      agregarDelRegistro({ especie: e.especie, cientifico: e.cientifico, cites: e.cites }, codigos);
      return codigos;
    },
    [codigosPara, agregarDelRegistro],
  );
  /* «Bolaina × N» desde la lista de la tala: las filas entran cuando el
     registro respondió (los códigos necesitan las talas del plan y del negocio). */
  const sembradoRef = useRef(false);
  /** Para pintar: el ref guarda contra el doble efecto, el estado avisa que ya está. */
  const [sembrado, setSembrado] = useState(false);
  const listoRegistro = plantacion && !registro.cargando && registro.error == null && registro.listoPara === inicial.planId;
  useEffect(() => {
    if (sembradoRef.current || !listoRegistro || !inicial.porEspecie?.length) return;
    sembradoRef.current = true;
    setSembrado(true);
    const ya = codigosDeLaPlanilla(t.filas);
    for (const { especie, n } of inicial.porEspecie) {
      const e = registro.especie(especie);
      if (e) ya.push(...agregarEspecie(e, n, ya));
    }
    // Una vez por planilla: lo que se agregue después va por «Agregar por especie».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listoRegistro]);
  const sembrando = Boolean(inicial.porEspecie?.length) && !sembrado && registro.error == null && (!planTanda.listo || plantacion);
  const idLista = useId();
  const guardarRef = useRef<HTMLButtonElement>(null);
  const [agregando, setAgregando] = useState(false);
  /** Lo que se abrió o cerró a mano; si no, se abre sola la que tiene algo que corregir. */
  const [abiertas, setAbiertas] = useState<ReadonlyMap<string, boolean>>(new Map());
  const guardando = t.avance != null;

  const abiertaDe = (f: FilaTala) => abiertas.get(f.id) ?? (f.resultado?.estado === "fallida" || (pideJustificacion(f) && f.resultado?.estado !== "guardada"));
  const alternar = (id: string) => {
    const f = t.filas.find((x) => x.id === id);
    if (!f) return;
    setAbiertas((m) => new Map(m).set(id, !abiertaDe(f)));
  };

  /** Los que el regente (o el DMC) dice que no se tumban y todavía no entraron. */
  const conReparo = useMemo(
    () => t.filas.filter((f) => f.arbol.reparo?.nivel === "infraccion" && f.resultado?.estado !== "guardada"),
    [t.filas],
  );
  const enPlanilla = useMemo(() => new Set(t.filas.map((f) => f.id)), [t.filas]);
  /** registrado − talado − la planilla, por especie del registro (vista previa: el libro descuenta lo suyo). */
  const saldo = useMemo(
    () =>
      saldoDeLaPlanilla(
        conRegistro ? registro.especies : [],
        conRegistro ? t.filas.map((f, i) => ({ especie: f.arbol.speciesCommon, cientifico: f.arbol.speciesScientific, volumenM3: t.calc[i].volumenM3 })) : [],
      ),
    [conRegistro, registro.especies, t.filas, t.calc],
  );
  const fueraDelRegistro = useCallback(
    (f: FilaTala) => conRegistro && especieDeLinea(registro.especies, f.arbol.speciesCommon, f.arbol.speciesScientific) == null,
    [conRegistro, registro.especies],
  );
  /** Una plantación sin árboles marcados no tiene censo que ofrecer. */
  const sinMarcados = plantacion && !censo.cargando && censo.arboles.length === 0;
  // Recortado: el servidor guarda el código sin espacios y «Trozar estos árboles» lo busca así.
  const guardadas = t.filas.filter((f) => f.resultado?.estado === "guardada").map((f) => f.arbol.treeCode.trim());

  const guardar = async () => {
    await t.guardar();
    // Se abrió sola la que falló: llevarla a la vista para corregirla.
    requestAnimationFrame(() => document.querySelector('[data-fila-tala] [role="alert"]')?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="wide"
      icon={TreePine}
      title="Talar varios árboles"
      description={inicial.planLabel ?? "Sección 1 · Tala"}
      claveVentana="loth-tala-tanda"
      // La planilla pide ancho: árbol, fecha, 3 a 5 medidas y el resultado en
      // una fila. Debajo de lg cada árbol es una tarjeta.
      className="sm:max-w-[44rem] lg:max-w-[66rem]"
      footer={
        <LothTalaTandaPie
          ref={guardarRef}
          totales={t.totales}
          avance={t.avance}
          recargando={t.recargando}
          onCerrar={onClose}
          onGuardar={() => void guardar()}
          onTrozar={guardadas.length > 0 ? () => onTrozar(guardadas) : null}
          registro={conRegistro ? saldo.porEspecie : null}
        />
      }
    >
      <div className="space-y-4 px-5 py-4 sm:px-6">
        <LothTalaTandaComunes
          comunes={t.comunes}
          onComunes={t.setComunes}
          forma={t.forma}
          onForma={t.elegirForma}
          motosierristas={motosierristas}
          idLista={idLista}
          bloqueada={guardando}
        />

        {conReparo.length > 0 && (
          <div role="note" className="flex flex-wrap items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)]/60 bg-[var(--data-error-50)] px-3 py-2.5 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1">
              <b>{conReparo.length === 1 ? "Un árbol no se debería talar" : `${conReparo.length} árboles no se deberían talar`}:</b>{" "}
              {conReparo.map((f) => `${f.arbol.treeCode} (${f.arbol.reparo?.titulo.toLowerCase()})`).join(" · ")}.
            </p>
            <button
              type="button"
              disabled={guardando}
              onClick={() => conReparo.forEach((f) => t.quitar(f.id))}
              className="inline-flex h-9 items-center rounded-lg border-2 border-current px-3 text-sm font-bold disabled:opacity-50"
            >
              {conReparo.length === 1 ? "Quitarlo" : "Quitarlos"}
            </button>
          </div>
        )}

        {plantacion && (
          <LothTalaTandaRegistro
            especies={registro.especies}
            cargando={registro.cargando}
            error={registro.error}
            onReintentar={registro.recargar}
            saldo={saldo}
            bloqueada={guardando}
            onAgregar={(e, n) => agregarEspecie(e, n, codigosDeLaPlanilla(t.filas))}
          />
        )}

        {sembrando && t.filas.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-4 text-center text-sm text-[var(--text-secondary)]">
            Preparando la planilla con {inicial.porEspecie?.map((x) => `${x.especie} × ${x.n}`).join(" · ")}…
          </p>
        )}

        <LothTalaTandaPlanilla
          filas={t.filas}
          calc={t.calc}
          forma={t.forma}
          comunes={t.comunes}
          abiertaDe={abiertaDe}
          onAbrir={alternar}
          bloqueada={guardando}
          motosierristas={motosierristas}
          idLista={idLista}
          onEditar={t.editar}
          onCodigo={t.cambiarCodigo}
          fueraDelRegistro={fueraDelRegistro}
          onQuitar={t.quitar}
          alTerminar={() => {
            const b = guardarRef.current;
            if (!b || b.disabled) return false;
            b.focus();
            return true;
          }}
        />

        {!sinMarcados && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            disabled={guardando || !inicial.planId}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:opacity-50 dark:hover:text-[var(--accent)]"
          >
            <Plus className="h-4 w-4" /> {plantacion ? "Agregar árboles marcados" : "Agregar del censo"}
          </button>
        )}
      </div>

      {motosierristas.length > 0 && (
        <datalist id={idLista}>
          {motosierristas.map((c) => (
            <option key={c.id} value={c.nombre}>
              {c.puesto?.nombre ?? ""}
            </option>
          ))}
        </datalist>
      )}

      <LothCensoElegirModal
        open={agregando}
        onClose={() => setAgregando(false)}
        censo={censo}
        planLabel={inicial.planLabel}
        plantacion={plantacion}
        elegido=""
        posicion={null}
        enPlanilla={enPlanilla}
        onElegir={(a) => {
          t.agregar([a]);
          setAgregando(false);
        }}
        onElegirVarios={{
          etiqueta: (n) => `Agregar ${n === 1 ? "1 árbol" : `${n} árboles`} a la planilla`,
          onElegir: (arboles) => {
            t.agregar(arboles);
            setAgregando(false);
          },
        }}
      />
    </AdminModal>
  );
}
