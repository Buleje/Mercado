"use client";

/**
 * LothEspecieFueraModal — qué hacer con una especie censada que no está en el plan.
 *
 * El aviso ya existía y decía la verdad («talar una especie no autorizada es
 * infracción»), pero terminaba ahí: había que salir a buscar dónde arreglarlo.
 * Los dos caminos reales son estos, y ninguno de los dos es «ignorar».
 *
 * ⚠️ Cargar la especie acá NO la autoriza. Lo que autoriza es la resolución del
 * ARFFS; esta tabla es la copia local de ese papel. Por eso el formulario pide
 * el número de resolución de memoria y lo dice en la cara: si la especie no
 * figura en el documento aprobado, el camino es descartar los árboles, no
 * agregarla — «arreglarlo en el sistema» sería fabricar la autorización.
 */

import { useState } from "react";
import { AlertTriangle, Ban, Loader2, Plus, ShieldAlert } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { MODAL_BODY } from "@/components/admin/shared/AdminModal";

export interface LothEspecieFueraModalProps {
  planId: string;
  especie: string;
  /** Los árboles de esa especie que están en el censo. */
  arboles: { id: string; treeCode: string; volumenEstimadoM3: string | null; estado: string }[];
  /** Número de la resolución del plan, para nombrarla en el texto. */
  resolucion: string | null;
  /**
   * El plan es el registro de una plantación (ADR-459): ahí no hay resolución
   * que autorice ni censo; hay un registro y árboles marcados. Mismo acto,
   * otras palabras — las de bosque natural confunden a quien carga el registro.
   */
  plantacion?: boolean;
  onClose: () => void;
  /** Algo cambió: la vista tiene que releer el plan. */
  onResuelto: () => void;
}

/** Las palabras del aviso según el documento: resolución + censo, o registro + árboles marcados. */
const VOCES = {
  bosque: {
    titulo: "censada fuera del plan",
    tiene: "El censo tiene",
    dondeNoFigura: "entre las autorizadas",
    porDocumento: "por la resolución",
    enElPlan: "en el plan",
    siEsta: "Sí está en la resolución",
    siEstaAyuda: "La resolución la autoriza y faltaba cargarla acá. Se agrega a las especies del plan con su volumen.",
    noEsta: "No está autorizada",
    comoPrueba: "en el censo como prueba",
    cargarNoAutoriza: (e: string) =>
      `Cargarla acá no la autoriza: el volumen tiene que ser el que dice el documento aprobado. Si ${e} no figura en la resolución, vuelve y descarta los árboles.`,
    volumen: "Volumen autorizado (m³)",
    segun: "según la resolución",
    volumenCero: "El volumen autorizado tiene que ser mayor que cero — es el que dice la resolución.",
  },
  plantacion: {
    titulo: "marcada fuera del registro",
    tiene: "Los árboles marcados incluyen",
    dondeNoFigura: "entre las del registro de la plantación",
    porDocumento: "con el código",
    enElPlan: "en el registro",
    siEsta: "Sí está en el registro",
    siEstaAyuda: "La constancia del registro la incluye y faltaba cargarla acá. Se agrega con sus m³ registrados.",
    noEsta: "No está en el registro",
    comoPrueba: "entre los árboles marcados como prueba",
    cargarNoAutoriza: (e: string) =>
      `Cargarla acá no la registra: los m³ tienen que ser los de la constancia de inscripción. Si ${e} no figura en el registro, vuelve y descarta los árboles.`,
    volumen: "Volumen registrado (m³)",
    segun: "según la constancia",
    volumenCero: "El volumen registrado tiene que ser mayor que cero — es el que dice la constancia.",
  },
} as const;

export default function LothEspecieFueraModal({
  planId, especie, arboles, resolucion, plantacion = false, onClose, onResuelto,
}: LothEspecieFueraModalProps) {
  const v = plantacion ? VOCES.plantacion : VOCES.bosque;
  const [modo, setModo] = useState<"elegir" | "agregar" | "descartar">("elegir");
  const [vol, setVol] = useState("");
  const [narb, setNarb] = useState(String(arboles.length));
  const [cites, setCites] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enPie = arboles.filter((a) => a.estado === "en_pie");
  const m3 = arboles.reduce((a, t) => a + Number(t.volumenEstimadoM3 ?? 0), 0);

  const agregarAlPlan = async () => {
    const m3Pedido = Number(vol);
    if (!(m3Pedido > 0)) { setError(v.volumenCero); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/plan/species", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({
          planId, speciesCommon: especie, volumenAutorizadoM3: m3Pedido,
          arbolesAutorizados: Number(narb) > 0 ? Number(narb) : null,
          cites,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      onResuelto();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const descartar = async () => {
    setBusy(true); setError(null);
    try {
      /* Uno por uno porque el endpoint es single. De a tandas para no abrir
         treinta conexiones de golpe contra el pooler. */
      const fallos: string[] = [];
      for (let i = 0; i < enPie.length; i += 8) {
        const tanda = enPie.slice(i, i + 8);
        const res = await Promise.all(
          tanda.map((a) =>
            fetch("/api/admin/forestal/plan/census", {
              method: "PATCH",
              credentials: "include",
              headers: { "content-type": "application/json", ...csrfHeaders() },
              body: JSON.stringify({ id: a.id, estado: "descartado" }),
            }).then((r) => ({ ok: r.ok, code: a.treeCode })),
          ),
        );
        fallos.push(...res.filter((x) => !x.ok).map((x) => x.code));
      }
      if (fallos.length > 0) throw new Error(`No se pudieron descartar: ${fallos.slice(0, 5).join(", ")}${fallos.length > 5 ? "…" : ""}`);
      onResuelto();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`${especie}: ${v.titulo}`}
      description={`${arboles.length} ${arboles.length === 1 ? "árbol" : "árboles"} · ${fmtM3(m3)} m³`}
      icon={ShieldAlert}
      className="max-w-2xl"
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        {error && (
          <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        <p className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
          {v.tiene} {arboles.length} {arboles.length === 1 ? "árbol" : "árboles"} de <b className="text-[var(--text-primary)]">{especie}</b>,
          y esa especie no figura {v.dondeNoFigura}
          {resolucion ? <> {v.porDocumento} <span className="font-mono">{resolucion}</span></> : ` ${v.enElPlan}`}.
          Tumbarlos o movilizarlos sería aprovechamiento no autorizado.
        </p>

        {modo === "elegir" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setModo("agregar")}
              className="rounded-xl border border-[var(--rule-base)] p-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Plus className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" />
                {v.siEsta}
              </span>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                {v.siEstaAyuda}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setModo("descartar")}
              className="rounded-xl border border-[var(--rule-base)] p-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Ban className="h-4 w-4 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" />
                {v.noEsta}
              </span>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                {enPie.length === 1 ? "El que está" : `Los ${enPie.length}`} en pie {enPie.length === 1 ? "pasa" : "pasan"} a «descartado»: {enPie.length === 1 ? "queda" : "quedan"} {v.comoPrueba}, pero fuera de todo cálculo.
              </span>
            </button>
          </div>
        )}

        {modo === "agregar" && (
          <div className="space-y-3">
            <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 p-3 text-sm font-bold text-[var(--text-primary)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />
              {v.cargarNoAutoriza(especie)}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">{v.volumen} *</span>
                <input
                  type="number" step="0.0001" value={vol} onChange={(e) => setVol(e.target.value)}
                  placeholder={v.segun}
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- el modal se abre para escribir el volumen autorizado de inmediato
                  autoFocus
                  className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">N° de árboles</span>
                <input
                  type="number" value={narb} onChange={(e) => setNarb(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none"
                />
              </label>
              <label className="flex items-end gap-2 pb-3">
                <input type="checkbox" checked={cites} onChange={(e) => setCites(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                <span className="text-sm font-bold text-[var(--text-primary)]">Es CITES</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModo("elegir")} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Volver</button>
              <button
                type="button" onClick={() => void agregarAlPlan()} disabled={busy}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar al plan
              </button>
            </div>
          </div>
        )}

        {modo === "descartar" && (
          <div className="space-y-3">
            <p className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
              Se {enPie.length === 1 ? "marca" : "marcan"} <b className="text-[var(--text-primary)]">{enPie.length}</b> {enPie.length === 1 ? "árbol" : "árboles"} como {enPie.length === 1 ? "descartado" : "descartados"}. No se borran: el censo
              es prueba de lo que se levantó en campo, y un censo retocable no probaría nada. Dejan de contar como aprovechables
              y el libro va a bloquear su tala.
              {enPie.length < arboles.length && (
                <> Los otros {arboles.length - enPie.length} ya no están en pie y no se tocan.</>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModo("elegir")} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Volver</button>
              <button
                type="button" onClick={() => void descartar()} disabled={busy || enPie.length === 0}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-error-700)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Descartar {enPie.length}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
