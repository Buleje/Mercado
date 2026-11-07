"use client";

/**
 * «Registrar GTF preliminar» (Brandon 25-10): una guía hecha a mano que todavía
 * no se registra en SERFOR. Sólo el N.º de GTF, el N.º de LT vinculado, la
 * fecha (opcional) y el resumen por especie (trozas, m³ y bloque). Sirve para
 * anotarla y para corregirla.
 *
 * El servidor valida y calcula (`POST/PATCH /plan/preliminares`); acá sólo se
 * previsualiza «saldo si se registran» con las mismas funciones puras. Al
 * costado (abajo en el celular), el saldo del bloque elegido (25-10).
 */

import { useMemo, useState } from "react";
import { FileWarning } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { SIN_BLOQUES, type EspecieConUsos, type SaldoPorBloques } from "@/lib/forestal/loth-plan-bloques-saldo";
import {
  numeroConRegion,
  previsualizarGuia,
  type DatosPreliminar,
  type GtfPreliminarVista,
  type LineaPreliminar,
} from "@/lib/forestal/loth-plan-preliminares";
import { guardarPreliminarDelPlan } from "./hooks/plan-preliminares-api";
import LothPlanPreliminarFilas, { numeroEscrito, type FilaPreliminar } from "./LothPlanPreliminarFilas";
import LothPlanPreliminarLts from "./LothPlanPreliminarLts";
import LothPlanPreliminarPanelBloque from "./LothPlanPreliminarPanelBloque";
import LothPlanPreliminarRegion from "./LothPlanPreliminarRegion";
import { Btn, CampoGrid, Field, I } from "./ctp-shared";

let siguiente = 0;
const nuevaFila = (especie = ""): FilaPreliminar => ({ key: `f${++siguiente}`, especie, trozas: "", m3: "", bloque: "" });

function filasDe(guia: GtfPreliminarVista | null, especies: string[], bloques: string[]): FilaPreliminar[] {
  if (!guia) return [nuevaFila(especies.length === 1 ? especies[0] : "")];
  // Un bloque renombrado o borrado vuelve a «Elige el bloque…»: mandar el nombre viejo daba 400.
  return guia.lineas.map((l) => ({
    key: `f${++siguiente}`,
    especie: l.especie,
    trozas: String(l.trozas),
    m3: String(l.m3),
    bloque: l.bloque && bloques.includes(l.bloque) ? l.bloque : "",
  }));
}

/** Lo escrito → lo que va al servidor; `error` = la primera fila que no se entiende. */
function armar(filas: FilaPreliminar[], conBloque: boolean): { lineas: DatosPreliminar["lineas"]; error: string | null } {
  const lineas: DatosPreliminar["lineas"] = [];
  for (const [i, f] of filas.entries()) {
    const m3 = numeroEscrito(f.m3);
    const trozas = f.trozas.trim() ? numeroEscrito(f.trozas) : 0;
    if (!f.especie) return { lineas, error: `Fila ${i + 1}: elige la especie.` };
    if (trozas == null || !Number.isInteger(trozas) || trozas < 0) return { lineas, error: `Fila ${i + 1}: las trozas van en número entero.` };
    if (m3 == null || m3 <= 0) return { lineas, error: `Fila ${i + 1}: escribe los m³ (mayor que cero).` };
    if (conBloque && !f.bloque) return { lineas, error: `Fila ${i + 1}: elige el bloque.` };
    lineas.push({ especie: f.especie, trozas, m3, bloque: f.bloque || null });
  }
  return { lineas, error: null };
}

export default function LothPlanPreliminarModal({
  planId,
  guia,
  especies,
  bloques,
  porBloque,
  saldo,
  guias,
  onClose,
  onGuardado,
}: {
  planId: string;
  /** `null` = nueva. */
  guia: GtfPreliminarVista | null;
  especies: string[];
  bloques: string[];
  /** El saldo por bloque del servidor (su reparto sirve para previsualizar). */
  porBloque?: SaldoPorBloques;
  /** Las especies del saldo (lo que mide el freno) con sus guías, para la vista previa. */
  saldo: readonly EspecieConUsos[];
  /** Las preliminares del plan (las pendientes ya descuentan en la vista previa). */
  guias: readonly GtfPreliminarVista[];
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const [numeroGtf, setNumeroGtf] = useState(guia?.numeroGtf ?? "");
  const [lts, setLts] = useState<string[]>(() => (guia?.numerosLt.length ? [...guia.numerosLt] : [""]));
  const [fecha, setFecha] = useState(guia?.fecha ?? "");
  const [nota, setNota] = useState(guia?.nota ?? "");
  const [filas, setFilas] = useState<FilaPreliminar[]>(() => filasDe(guia, especies, bloques));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conBloque = bloques.length > 1;
  /* La región fijada vive en este equipo; `null` = todavía no se tocó: manda la fijada. */
  const [regionFija, setRegionFija] = useLocalStorage<string>("loth-preliminar-region-fija", "");
  const [regionElegida, setRegionElegida] = useState<string | null>(null);
  const region = regionElegida ?? regionFija;
  const gtfFinal = numeroConRegion(numeroGtf, region);
  const ltsFinales = lts.map((l) => numeroConRegion(l, region)).filter(Boolean);

  /* La vista previa: sólo con las filas que ya se entienden. */
  const lineasEscritas = useMemo(
    () =>
      filas.flatMap((f): LineaPreliminar[] => {
        const m3 = numeroEscrito(f.m3);
        return f.especie && m3 != null && m3 > 0 ? [{ especie: f.especie, trozas: numeroEscrito(f.trozas) ?? 0, m3, bloque: f.bloque || null }] : [];
      }),
    [filas],
  );
  const previa = useMemo(() => previsualizarGuia(saldo, guias, lineasEscritas, guia?.id, gtfFinal), [saldo, guias, lineasEscritas, guia?.id, gtfFinal]);

  const guardar = async () => {
    setError(null);
    if (!numeroGtf.trim()) return setError("Escribe el N.º de la GTF.");
    if (ltsFinales.length === 0) return setError("Escribe el N.º de la LT vinculada.");
    const { lineas, error: e } = armar(filas, conBloque);
    if (e) return setError(e);
    const repetidas = new Set<string>();
    for (const l of lineas) {
      const k = `${claveEspecie(l.especie)}|${l.bloque ?? ""}`;
      if (repetidas.has(k)) return setError(`${l.especie}${l.bloque ? ` (${l.bloque})` : ""} está dos veces: deja una sola fila y suma ahí.`);
      repetidas.add(k);
    }
    setBusy(true);
    const r = await guardarPreliminarDelPlan(
      planId,
      { numeroGtf: gtfFinal, numerosLt: ltsFinales, fecha: fecha || null, lineas, nota: nota.trim() || null },
      guia?.id,
    );
    setBusy(false);
    if (!r.ok) return setError(r.mensaje);
    onGuardado(r.mensaje ?? (guia ? `GTF ${r.guia.numeroGtf} corregida.` : `GTF ${r.guia.numeroGtf} anotada: queda pendiente de registrar en SERFOR.`));
  };

  return (
    <AdminModal
      open
      size="xl"
      onClose={busy ? () => undefined : onClose}
      title={guia ? `Corregir la GTF preliminar ${guia.numeroGtf}` : "Registrar GTF preliminar"}
      description="Guía hecha a mano, por enviar a SERFOR. Queda pendiente hasta que la registres."
      icon={FileWarning}
      claveVentana="loth-plan-preliminar"
      footer={
        <ModalFooter error={error}>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Btn>
          <Btn variant="primary" onClick={() => void guardar()} disabled={busy} data-testid="guardar-preliminar">
            {busy ? "Guardando…" : guia ? "Guardar cambios" : "Registrar preliminar"}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]`}>
        <div className="min-w-0 space-y-4">
          <CampoGrid>
            <Field label="Región" span={6}>
              <LothPlanPreliminarRegion
                region={region}
                fija={region !== "" && region === regionFija}
                onRegion={setRegionElegida}
                onFijar={() => setRegionFija(region !== "" && region === regionFija ? "" : region)}
              />
            </Field>
            <Field label="Fecha" span={6}>
              <input type="date" className={I} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="N.º de GTF *" span={6} hint={gtfFinal && gtfFinal !== numeroGtf.trim() ? `Se guarda como ${gtfFinal}` : undefined}>
              <input className={I} value={numeroGtf} onChange={(e) => setNumeroGtf(e.target.value)} placeholder={region ? "15" : "19-000015"} inputMode={region ? "numeric" : undefined} data-testid="preliminar-gtf" />
            </Field>
            <Field label={lts.length > 1 ? `Listas de trozas vinculadas (${lts.length}) *` : "N.º de LT vinculado *"} span={6}>
              <LothPlanPreliminarLts
                lts={lts}
                region={region}
                onCambiar={(i, v) => setLts((xs) => xs.map((x, j) => (j === i ? v : x)))}
                onAgregar={() => setLts((xs) => [...xs, ""])}
                onQuitar={(i) => setLts((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : xs))}
              />
            </Field>
          </CampoGrid>
          {especies.length === 0 ? (
            <p className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              Este plan no tiene especies cargadas: cárgalas primero en «Especies».
            </p>
          ) : (
            <>
              {bloques.length === 1 && <p className="text-sm text-[var(--text-secondary)]">Todo va al bloque {bloques[0]} (el plan tiene uno solo).</p>}
              <LothPlanPreliminarFilas
                filas={filas}
                especies={especies}
                bloques={bloques}
                previa={previa}
                onCambiar={(key, cambio) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...cambio } : f)))}
                onAgregar={() => setFilas((fs) => [...fs, nuevaFila()])}
                onQuitar={(key) => setFilas((fs) => (fs.length > 1 ? fs.filter((f) => f.key !== key) : fs))}
              />
            </>
          )}
          <Field label="Nota" span={12}>
            <input className={I} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: falta firmar el regente" maxLength={500} />
          </Field>
        </div>
        <LothPlanPreliminarPanelBloque
          porBloque={porBloque ?? SIN_BLOQUES}
          saldo={saldo}
          guias={guias}
          lineas={lineasEscritas}
          elegidos={filas.map((f) => f.bloque)}
          numeroGtf={gtfFinal}
          numerosLt={ltsFinales}
          exceptoId={guia?.id}
        />
      </div>
    </AdminModal>
  );
}
