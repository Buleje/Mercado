"use client";

/**
 * «Medir una carga» en el celular del monte (16-10, F3). Mide con el MISMO
 * «Medir por foto» del despacho (`LothTrozasPorFoto`, sin tocarlo) y, en vez
 * de pasar las trozas a una guía, GUARDA la carga: sus filas en KV
 * (`/api/admin/forestal/loth/medicion-carga`) y sus fotos en el Drive (carpeta
 * del permiso › «Cargas medidas»). La oficina la recoge al armar la guía.
 *
 * `LothTrozasPorFoto` pide un despacho (`DespachoGuiaLoth`); acá le damos un
 * despacho chico con lo que usa: trozas a mano, especies del permiso, fotos y
 * el N° que sigue. El test `forestal-medir-carga-monte` vigila que no use más.
 */
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Camera } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { piezasAMano, trozasDelLibroAMano } from "@/lib/forestal/loth-trozas-a-mano";
import { MAX_FOTOS_POR_CARGA, correlativosConCargas, etiquetaPermiso, type CargaMedida, type TipoFotoCarga } from "@/lib/forestal/medicion-carga";
import { useEspeciesConCatalogo } from "./ctp-especie-campo";
import { Btn, I } from "./ctp-shared";
import type { CargasMedidas } from "./hooks/use-cargas-medidas";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { useEspeciesAMano } from "./hooks/use-especies-a-mano";
import { useFotosDeLaCarga } from "./hooks/use-fotos-de-la-carga";
import { useTrozasAMano } from "./hooks/use-trozas-a-mano";
import LothCargasMedidasTarjeta from "./LothCargasMedidasTarjeta";
import LothMedirCargaMonteFilas, { filasDeLaCarga } from "./LothMedirCargaMonteFilas";

const LothTrozasPorFoto = dynamic(() => import("./LothTrozasPorFoto"), { ssr: false });

/** Lo que `LothTrozasPorFoto` lee del despacho (vigilado por el test). */
export type DespachoParaMedir = Pick<
  DespachoGuiaLoth,
  "aMano" | "especiesAMano" | "fotosCarga" | "piezas" | "piezasManuales" | "planId" | "siguienteCorrelativo"
> & { arbolesAMano: Pick<DespachoGuiaLoth["arbolesAMano"], "porId"> };

/** En el monte no se elige árbol: las trozas van con número. */
const SIN_ARBOLES: DespachoGuiaLoth["arbolesAMano"]["porId"] = new Map();

interface FotoPorSubir {
  tipo: TipoFotoCarga;
  blob: Blob;
}

export default function LothMedirCargaMonteModal({ cm, onClose }: { cm: CargasMedidas; onClose: () => void }) {
  const planes = useMemo(() => cm.datos?.planes ?? [], [cm.datos?.planes]);
  const [planId, setPlanId] = useState<string | null>(() => (planes.find((p) => p.isActive) ?? planes[0])?.id ?? null);
  const plan = planes.find((p) => p.id === planId) ?? null;
  const catalogo = useEspeciesConCatalogo();
  const aMano = useTrozasAMano();
  const especiesAMano = useEspeciesAMano({ catalogo, planId, plan, filas: aMano.filas });
  const fotosCarga = useFotosDeLaCarga();
  const siguienteCorrelativo = useMemo(
    () => correlativosConCargas(cm.datos?.siguienteCorrelativo ?? {}, cm.datos?.cargas ?? []),
    [cm.datos?.siguienteCorrelativo, cm.datos?.cargas],
  );
  const piezas = useMemo(() => piezasAMano(aMano.filas, [], SIN_ARBOLES, aMano.desde), [aMano.filas, aMano.desde]);
  const comoLibro = useMemo(() => trozasDelLibroAMano(piezas, planId), [piezas, planId]);
  const g: DespachoParaMedir = {
    aMano,
    especiesAMano,
    arbolesAMano: { porId: SIN_ARBOLES },
    fotosCarga,
    piezas: comoLibro,
    piezasManuales: comoLibro,
    planId,
    siguienteCorrelativo,
  };

  const [porFoto, setPorFoto] = useState(false);
  const [nota, setNota] = useState("");
  const [guardada, setGuardada] = useState<CargaMedida | null>(null);
  const [pendientes, setPendientes] = useState<FotoPorSubir[]>([]);
  const [ocupado, setOcupado] = useState<"guardando" | "subiendo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisoCierre, setAvisoCierre] = useState(false);

  const volumen = piezas.reduce((s, p) => s + p.volumeM3, 0);
  const hayTrozas = piezas.length > 0;
  const guardadaVista = guardada ? (cm.datos?.cargas.find((c) => c.id === guardada.id) ?? guardada) : null;

  async function subirFotos(cargaId: string, cola: readonly FotoPorSubir[]) {
    setOcupado("subiendo");
    const quedan: FotoPorSubir[] = [];
    let motivo: string | null = null;
    for (const f of cola) {
      const r = await cm.subirFoto(cargaId, f.tipo, f.blob);
      if (!r.ok) {
        quedan.push(f);
        motivo = r.mensaje;
      }
    }
    setOcupado(null);
    setPendientes(quedan);
    if (quedan.length === 0) {
      toast.success(cola.length ? "Carga guardada con sus fotos: la oficina ya la ve en «Cargas medidas»." : "Carga guardada: la oficina ya la ve en «Cargas medidas».");
      onClose();
      return;
    }
    setError(`La carga quedó guardada, pero ${quedan.length === 1 ? "1 foto no subió" : `${quedan.length} fotos no subieron`}: ${motivo ?? "error"}`);
  }

  async function guardar() {
    if (!hayTrozas || ocupado) return;
    setError(null);
    setAvisoCierre(false);
    const cola: FotoPorSubir[] = fotosCarga.fotos
      .flatMap((f): FotoPorSubir[] => [{ tipo: "original", blob: f.original }, ...(f.anotada ? [{ tipo: "anotada" as const, blob: f.anotada }] : [])])
      .slice(0, MAX_FOTOS_POR_CARGA);
    setOcupado("guardando");
    const r = await cm.guardar({ planId, desde: aMano.desde, fotosEsperadas: cola.length, nota: nota.trim() || null, filas: filasDeLaCarga(aMano.filas, piezas) });
    setOcupado(null);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setGuardada(r.valor);
    await subirFotos(r.valor.id, cola);
  }

  /** Con trozas sin guardar o fotos sin subir, primero se avisa: cerrar las pierde. */
  function cerrar() {
    if (ocupado) return;
    if ((!guardada && hayTrozas) || pendientes.length > 0) setAvisoCierre(true);
    else onClose();
  }

  const nPend = pendientes.length;
  return (
    <>
      <AdminModal
        open
        onClose={cerrar}
        size="lg"
        title="Medir una carga"
        ayuda={
          <InfoTip
            title="Medir una carga en el monte"
            what="Elige el permiso, mide la cara de la carga por foto y guárdala. La carga queda guardada con sus fotos aunque nadie arme la guía todavía."
            affects="La oficina la ve en el despacho con guía › «Cargas medidas» y la usa en la guía. Al registrar la guía, la carga queda «usada» con su N°."
            example="Permiso PO-2026-001 · 14 trozas · N° 24 a 37 · 3,412 m³"
            ariaLabel="Cómo se mide una carga en el monte"
          />
        }
        footer={
          <ModalFooter
            error={error}
            nota={avisoCierre ? undefined : hayTrozas ? `${piezas.length} ${piezas.length === 1 ? "troza" : "trozas"} · ${fmtM3(volumen)} m³` : undefined}
          >
            {avisoCierre ? (
              <>
                <span className="mr-auto text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" role="alert">
                  {nPend > 0 ? `${nPend} ${nPend === 1 ? "foto queda" : "fotos quedan"} sin subir.` : "La carga no está guardada."}
                </span>
                <Btn onClick={() => setAvisoCierre(false)}>Seguir</Btn>
                <Btn variant="danger" onClick={onClose} data-qa="cerrar-sin-guardar">
                  Cerrar igual
                </Btn>
              </>
            ) : guardada ? (
              <>
                <Btn onClick={cerrar}>Cerrar</Btn>
                <Btn variant="primary" onClick={() => void subirFotos(guardada.id, pendientes)} disabled={!!ocupado || nPend === 0} data-qa="reintentar-fotos">
                  {ocupado === "subiendo" ? "Subiendo fotos…" : "Reintentar las fotos"}
                </Btn>
              </>
            ) : (
              <>
                <Btn onClick={cerrar}>Cancelar</Btn>
                {hayTrozas && (
                  <Btn onClick={() => setPorFoto(true)} disabled={!!ocupado} data-qa="medir-otra-foto">
                    <Camera className="h-4 w-4" aria-hidden="true" /> Otra foto
                  </Btn>
                )}
                {hayTrozas ? (
                  <Btn variant="primary" onClick={() => void guardar()} disabled={!!ocupado} data-qa="guardar-carga">
                    {ocupado === "guardando" ? "Guardando…" : ocupado === "subiendo" ? "Subiendo fotos…" : "Guardar la carga"}
                  </Btn>
                ) : (
                  <Btn variant="primary" onClick={() => setPorFoto(true)} data-qa="medir-por-foto-monte">
                    <Camera className="h-4 w-4" aria-hidden="true" /> Medir por foto
                  </Btn>
                )}
              </>
            )}
          </ModalFooter>
        }
      >
        <div className="space-y-4" data-qa="medir-carga-monte-modal">
          {guardadaVista ? (
            <LothCargasMedidasTarjeta c={guardadaVista} permiso={etiquetaPermiso(plan)} />
          ) : (
            <>
              <label className="block space-y-1">
                <span className="text-sm font-bold text-[var(--text-secondary)]">Permiso</span>
                <select
                  className={I}
                  value={planId ?? ""}
                  onChange={(e) => setPlanId(e.target.value || null)}
                  disabled={hayTrozas}
                  data-qa="permiso-carga"
                >
                  {planes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {etiquetaPermiso(p) ?? p.planType ?? "Permiso"}
                      {p.isActive ? "" : " (cerrado)"}
                    </option>
                  ))}
                  <option value="">Sin permiso</option>
                </select>
              </label>
              {hayTrozas ? (
                <>
                  <LothMedirCargaMonteFilas filas={aMano.filas} piezas={piezas} />
                  <label className="block space-y-1">
                    <span className="text-sm font-bold text-[var(--text-secondary)]">Nota (opcional)</span>
                    <input className={I} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Camión, chofer, cancha…" data-qa="nota-carga" />
                  </label>
                </>
              ) : (
                <p className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
                  Pega la hoja de escala en la cara de la carga y toca «Medir por foto».
                </p>
              )}
            </>
          )}
        </div>
      </AdminModal>
      {porFoto && <LothTrozasPorFoto g={g} destino="carga" catalogo={catalogo} onClose={() => setPorFoto(false)} />}
      {catalogo.modal}
    </>
  );
}
