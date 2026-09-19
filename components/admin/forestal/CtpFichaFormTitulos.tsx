"use client";

/**
 * CtpFichaFormTitulos — títulos habilitantes (origen legal de la materia prima)
 * y permisos CITES de las especies protegidas que procesa el centro.
 *
 * El PRIMER título es el que cada guía de salida propone (`tituloDeGuia`), así
 * que reordenar es la forma de elegir cuál declara la GTF. Los permisos CITES
 * nunca restan puntos: tener una especie CITES es legal CON el permiso, y un
 * indicador que castiga lo incorregible enseña a ignorarlo.
 */

import {
  AlertTriangle,
  ArrowUp,
  FileText,
  Plus,
  ShieldCheck,
  Trash2,
} from "@buleje/design-system/icons";
import { I } from "./ctp-shared";
import { type CamposFichaProps } from "./ctp-ficha-form";
import {
  CTP_TITULO_TIPOS,
  estadoVencimiento,
  fechaCortaUTC,
  type CtpCitesPermiso,
  type CtpTituloHabilitante,
} from "@/lib/forestal/ctp-ficha-types";

/** Aviso de vigencia mientras se edita: un título vencido invalida el origen
 *  de toda la madera que ampara, y verlo recién al guardar es tarde. */
function AvisoVigencia({ vencimiento }: { vencimiento: string }) {
  const estado = estadoVencimiento(vencimiento);
  if (estado !== "vencido" && estado !== "por_vencer") return null;
  return (
    <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {estado === "vencido"
        ? `Venció el ${fechaCortaUTC(vencimiento)}: mientras esté vencido no ampara el origen de la madera.`
        : `Vence el ${fechaCortaUTC(vencimiento)}. La renovación ante la ARFFS no es inmediata.`}
    </p>
  );
}

function BotonAgregar({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden /> {children}
    </button>
  );
}

export default function CtpFichaFormTitulos({
  draft,
  set,
}: Pick<CamposFichaProps, "draft" | "set">) {
  const setTitulo = (i: number, patch: Partial<CtpTituloHabilitante>) =>
    set(
      "titulos",
      draft.titulos.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    );
  const addTitulo = () =>
    set("titulos", [
      ...draft.titulos,
      { tipo: "concesion", codigo: "", resolucion: "", planManejo: "", vencimiento: "" },
    ]);
  const removeTitulo = (i: number) =>
    set(
      "titulos",
      draft.titulos.filter((_, j) => j !== i),
    );
  /** Sube un título un lugar. El primero es el que se imprime en la GTF: antes
   *  eso era invisible y siempre salía el que se había cargado primero. */
  const subirTitulo = (i: number) => {
    if (i <= 0) return;
    const titulos = [...draft.titulos];
    [titulos[i - 1], titulos[i]] = [titulos[i], titulos[i - 1]];
    set("titulos", titulos);
  };

  const setCites = (i: number, patch: Partial<CtpCitesPermiso>) =>
    set(
      "citesPermisos",
      draft.citesPermisos.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    );
  const addCites = () =>
    set("citesPermisos", [...draft.citesPermisos, { especie: "", numero: "", vencimiento: "" }]);
  const removeCites = (i: number) =>
    set(
      "citesPermisos",
      draft.citesPermisos.filter((_, j) => j !== i),
    );

  return (
    <>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <ShieldCheck className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            Títulos habilitantes (origen de la materia prima)
          </span>
          <BotonAgregar onClick={addTitulo}>Agregar</BotonAgregar>
        </div>
        <div className="space-y-2">
          {draft.titulos.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)]">
              Sin títulos cargados. Agrega las concesiones/permisos que abastecen el CTP.
            </p>
          )}
          {draft.titulos.length > 1 && (
            <p className="text-sm text-[var(--text-tertiary)]">
              El <strong className="text-[var(--text-secondary)]">primero</strong> es el que cada
              guía de salida propone (casilleros 5, 6, 8 y 9); en el formulario de la guía se puede
              elegir otro. Usa <ArrowUp className="inline h-3.5 w-3.5" aria-hidden /> para cambiar el
              predeterminado.
            </p>
          )}
          {draft.titulos.map((t, i) => (
            <div
              key={i}
              className={`rounded-xl border-2 p-2 ${i === 0 ? "border-[var(--accent)] bg-[var(--accent-soft)] dark:bg-[var(--accent)]/10" : "border-[var(--rule-base)]"}`}
            >
              {i === 0 && (
                <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-[length:var(--ts-xs)] font-bold text-[var(--accent-dark)] dark:bg-[var(--accent)]/15 dark:text-[var(--accent)]">
                  <FileText className="h-3.5 w-3.5" aria-hidden /> Predeterminado en la GTF
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Tipo del título ${i + 1}`}
                  className={`${I} max-w-[13rem]`}
                  value={t.tipo}
                  onChange={(e) => setTitulo(i, { tipo: e.target.value })}
                  title="Tipo de título — es también el casillero (5) de la GTF"
                >
                  {CTP_TITULO_TIPOS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  className={`${I} min-w-[10rem] flex-1`}
                  value={t.codigo}
                  onChange={(e) => setTitulo(i, { codigo: e.target.value })}
                  placeholder="N° del título habilitante — casillero (6)"
                />
                <input
                  aria-label={`Vencimiento del título ${i + 1}`}
                  type="date"
                  className={`${I} max-w-[10rem]`}
                  value={t.vencimiento}
                  onChange={(e) => setTitulo(i, { vencimiento: e.target.value })}
                  title="Vencimiento"
                />
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => subirTitulo(i)}
                    title="Subir — el primero es el que declara la GTF"
                    aria-label="Subir este título"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeTitulo(i)}
                  aria-label="Quitar este título"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--rule-base)] text-[var(--data-error-600)] hover:bg-[var(--data-error-50)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {/* (8) y (9): los pide la GTF y no vivían en ningún lado, así
                  que esos dos casilleros salían vacíos en cada guía. */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className={`${I} min-w-[14rem] flex-1`}
                  value={t.resolucion}
                  onChange={(e) => setTitulo(i, { resolucion: e.target.value })}
                  placeholder="N° de resolución que lo aprobó — casillero (8)"
                />
                <input
                  className={`${I} min-w-[10rem] max-w-[16rem] flex-1`}
                  value={t.planManejo}
                  onChange={(e) => setTitulo(i, { planManejo: e.target.value })}
                  placeholder="Plan de manejo: DEMA, PMFI, POA… — casillero (9)"
                  list="planes-manejo"
                />
              </div>
              <AvisoVigencia vencimiento={t.vencimiento} />
            </div>
          ))}
          {/* Sugerencias, no un enum: la nomenclatura cambia por región y
              por tipo de título, y una lista cerrada rechazaría un plan
              válido. */}
          <datalist id="planes-manejo">
            <option value="Declaración de Manejo (DEMA)" />
            <option value="Plan de Manejo Forestal Intermedio (PMFI)" />
            <option value="Plan General de Manejo Forestal (PGMF)" />
            <option value="Plan Operativo Anual (POA)" />
            <option value="Plan de Manejo Consolidado" />
          </datalist>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <ShieldCheck className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            Permisos CITES (especies protegidas)
          </span>
          <BotonAgregar onClick={addCites}>Agregar</BotonAgregar>
        </div>
        <div className="space-y-2">
          {draft.citesPermisos.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)]">
              Sin permisos CITES. Si procesas caoba, cedro, shihuahuaco u otra especie CITES, carga
              su permiso para tenerlo a mano ante un fiscalizador.
            </p>
          )}
          {draft.citesPermisos.map((p, i) => (
            <div key={i}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`${I} min-w-[9rem] flex-1`}
                  value={p.especie}
                  onChange={(e) => setCites(i, { especie: e.target.value })}
                  placeholder="Especie (ej. Shihuahuaco)"
                />
                <input
                  className={`${I} min-w-[9rem] flex-1`}
                  value={p.numero}
                  onChange={(e) => setCites(i, { numero: e.target.value })}
                  placeholder="N° de permiso CITES"
                />
                <input
                  aria-label={`Vencimiento del permiso CITES ${i + 1}`}
                  type="date"
                  className={`${I} max-w-[10rem]`}
                  value={p.vencimiento}
                  onChange={(e) => setCites(i, { vencimiento: e.target.value })}
                  title="Vencimiento"
                />
                <button
                  aria-label="Eliminar"
                  type="button"
                  onClick={() => removeCites(i)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--rule-base)] text-[var(--data-error-600)] hover:bg-[var(--data-error-50)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <AvisoVigencia vencimiento={p.vencimiento} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
