"use client";

/**
 * «Medir por foto» (Brandon 16-10: «tomar foto a la cara de los troncos, sacar
 * de cada tronco su diámetro, asignar código según el correlativo y hacer
 * tabla; luego pasar eso a la GTF»). F1, semiautomática: la foto propone, el
 * operador confirma.
 *
 * Se abre desde «Anotar a mano» del despacho con guía (ventana encima de otra:
 * `aboveModals`). Foto → medidor (worker con OpenCV) → foto con las testas +
 * tabla → «Pasar a la guía» agrega las filas a «Anotar a mano» por el mismo
 * camino que el alta a mano (`agregarVarias`) y deja las fotos (original y
 * anotada, de cada cara) para subir a los papeles de la guía AL REGISTRAR.
 * Antes de registrar no se escribe nada en la base. F2: la foto de la otra
 * cara da D2 (`LothTrozasPorFotoCaras`).
 */
import { useMemo, useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, Printer, RotateCcw } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { imprimirHojasDeEscala } from "@/lib/camaras/imprimir-marcadores";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { TROZAS_POR_GUIA_MAX } from "@/lib/forestal/loth-trozas-a-mano";
import { hojaChica, type CampoQueFalta } from "@/lib/forestal/testas-medicion";
import { logger } from "@/lib/logger";
import { fotoAnotada } from "./camaras/anotar-carga";
import type { CatalogoUI } from "./ctp-especie-campo";
import { Btn } from "./ctp-shared";
import type { DespachoParaMedir } from "./LothMedirCargaMonteModal";
import { useEspecieFijada } from "./hooks/use-especie-fijada";
import { fotoEnJpeg } from "./hooks/use-placa-foto";
import { useTrozasPorFoto, type TrozasPorFoto } from "./hooks/use-trozas-por-foto";
import LothTrozasPorFotoCaras, { ParejaDeLaElegida } from "./LothTrozasPorFotoCaras";
import LothTrozasPorFotoLienzo from "./LothTrozasPorFotoLienzo";
import LothTrozasPorFotoTabla from "./LothTrozasPorFotoTabla";

const ELEGIR = "inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold focus-within:ring-2 focus-within:ring-[var(--accent)]/40";
const ALERTA = "text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const CUAL: Record<CampoQueFalta, string> = { d1: "el D1", d2: "el D2", largo: "el largo", especie: "la especie" };

/** Original + anotada de una cara, para los papeles de la guía. */
async function fotosDe(cara: TrozasPorFoto["atras"], codigos: readonly string[]) {
  if (!cara.foto || !cara.medida) return null;
  const [original, anotada] = await Promise.all([fotoEnJpeg(cara.foto, 2560), fotoAnotada(cara.medida.enderezada, cara.testas, codigos)]);
  return { original: original.blob, anotada };
}

/** `destino`: «guia» (despacho: pasa a «Anotar a mano») o «carga» (monte: se guarda la carga medida para la oficina). */
export default function LothTrozasPorFoto({
  g, catalogo, onClose, destino = "guia",
}: { g: DespachoParaMedir; catalogo: CatalogoUI; onClose: () => void; destino?: "guia" | "carga" }) {
  const fijacion = useEspecieFijada("loth-guia-a-mano");
  const delPermiso = g.especiesAMano.delPermiso;
  const nDelLibro = g.piezas.length - g.piezasManuales.length;
  const ocupados = useMemo(() => g.piezas.slice(0, nDelLibro).map((x) => x.codigo), [g.piezas, nDelLibro]);
  const p = useTrozasPorFoto({
    previas: g.aMano.filas,
    ocupados,
    arboles: g.arbolesAMano.porId,
    desdeInicial: g.aMano.desde > 1 ? g.aMano.desde : (g.siguienteCorrelativo[g.planId ?? "sin_permiso"] ?? 1),
    especieInicial: fijacion.fijada ?? (delPermiso?.length === 1 ? delPermiso[0] : ""),
  });
  const [intentado, setIntentado] = useState(false);
  const [pasando, setPasando] = useState(false);

  const { listas, faltan } = p.paraLaGuia;
  const restantes = TROZAS_POR_GUIA_MAX - g.piezas.length;
  const problema = p.especie.trim() ? g.especiesAMano.problemaDe(p.especie) : null;
  const sinLargo = p.largo.trim() === "" && faltan.some((f) => f.campo === "largo");
  const primera = faltan.find((f) => f.campo !== "especie");
  const motivo =
    p.atras.testas.length === 0
      ? "No hay trozas marcadas en la foto."
      : p.atras.testas.length > restantes
        ? `La guía lleva hasta ${TROZAS_POR_GUIA_MAX} trozas: quedan ${Math.max(0, restantes)}.`
        : !p.especie.trim()
          ? "Elige la especie de la carga."
          : problema
            ? problema.tipo === "catalogo"
              ? problema.motivo
              : `${p.especie.trim()} no está en el permiso de esta guía: elige una «Del permiso».`
            : sinLargo
              ? "Anota el largo de la carga."
              : primera
                ? `Revisa ${CUAL[primera.campo]} de la troza ${primera.codigo}.`
                : null;
  const faltanSet = useMemo(() => new Set(intentado ? faltan.map((f) => `${f.codigo}:${f.campo}`) : []), [faltan, intentado]);

  function alElegir(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void p.elegir(file);
  }

  async function pasar() {
    setIntentado(true);
    if (motivo || !p.atras.medida || !p.foto || listas.length === 0) return;
    setPasando(true);
    try {
      /* Adelante, cada punta con el N° de su troza de atrás: las dos fotos dicen lo mismo. */
      const caras = await Promise.all([fotosDe(p.atras, p.codigosAtras), p.adelante.fase === "listo" ? fotosDe(p.adelante, p.codigosAdelante) : null]);
      for (const f of caras) if (f) g.fotosCarga.agregar({ ...f, trozas: listas.length });
    } catch (err) {
      /* Las trozas pasan igual: la foto es respaldo, no el dato. */
      logger.warn("[trozas-por-foto] la foto no se preparó para la guía", { error: String(err) });
    }
    if (p.desde !== g.aMano.desde) g.aMano.setDesde(p.desde);
    g.aMano.agregarVarias(listas);
    setPasando(false);
    onClose();
  }

  const elegirFoto = (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className={`${ELEGIR} bg-[var(--accent-dark)] text-white`}>
        <Camera className="h-5 w-5" aria-hidden="true" /> Tomar la foto
        <input type="file" accept="image/*" capture="environment" onChange={alElegir} data-qa="foto-carga" className="sr-only" />
      </label>
      <label className={`${ELEGIR} border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]`}>
        <ImagePlus className="h-5 w-5" aria-hidden="true" /> Elegir de la galería
        <input type="file" accept="image/*" onChange={alElegir} data-qa="foto-galeria" className="sr-only" />
      </label>
    </div>
  );

  return (
    <AdminModal
      open
      onClose={onClose}
      aboveModals
      size="xl"
      title="Medir por foto"
      ayuda={
        <InfoTip
          title="Medir las trozas por foto"
          what="Pega la hoja de escala en la cara de la carga y toma la foto de frente. El sistema marca cada testa, saca su Ø con corteza (promedio de los dos ejes, hasta el borde de afuera de la corteza; la troza descortezada, hasta la madera) y le pone el N° que llevará en la guía. Con la foto de la otra cara saca también el D2. Tú revisas: corriges, quitas o agregas."
          affects={
            destino === "carga"
              ? "Al guardar, la carga queda con sus fotos para que la oficina la use al armar la guía («Cargas medidas»), con D1 la punta mayor y D2 la menor."
              : "Al pasar a la guía, las trozas quedan en «Anotar a mano» marcadas «Foto», con D1 la punta mayor y D2 la menor. Nada se guarda hasta registrar el despacho; ahí las fotos van a los papeles de la guía."
          }
          example="14 testas · Tornillo · largo 3,20 → N° 24 a 37, 3,412 m³"
          ariaLabel="Cómo se mide por foto"
        />
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {p.fase === "listo" && (
            <span className="mr-auto text-sm font-bold text-[var(--text-primary)]" data-qa="resumen-por-foto">
              {p.resumen.trozas} {p.resumen.trozas === 1 ? "troza" : "trozas"} · {fmtM3(p.resumen.volumenM3)} m³
            </span>
          )}
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" onClick={pasar} disabled={p.fase !== "listo" || pasando} data-qa="pasar-a-la-guia">
            {destino === "carga"
              ? pasando ? "Guardando…" : `Guardar ${listas.length || ""} ${listas.length === 1 ? "troza" : "trozas"} en la carga`.replace(/\s+/g, " ")
              : pasando ? "Pasando…" : listas.length ? `Pasar ${listas.length} ${listas.length === 1 ? "troza" : "trozas"} a la guía` : "Pasar a la guía"}
          </Btn>
        </div>
      }
    >
      <div className={`${MODAL_BODY} space-y-3`}>
        {p.fase === "inicio" && (
          <>
            {elegirFoto}
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
              <span className="flex items-center gap-1">
                Con la hoja de escala pegada en la carga.
                <InfoTip
                  title="Cómo tomar la foto"
                  what="Imprime las dos hojas en A4 al 100 % (el cuadrado negro mide 18 cm). Pega una en cada extremo de la cara de la carga, planas sobre las testas, y toma la foto de frente a 3-5 m, con todas las testas y las dos hojas enteras."
                  affects="Sin la hoja no hay medida: la foto no sabe cuántos cm es cada píxel."
                  example="Carga de 3 m de ancho → hojas en las esquinas de abajo"
                  ariaLabel="Cómo tomar la foto"
                />
              </span>
              <Btn variant="ghost" onClick={imprimirHojasDeEscala} className="ml-auto">
                <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir la hoja de escala
              </Btn>
            </div>
            {p.motor === "cargando" && <p className="text-sm text-[var(--text-tertiary)]">Preparando el medidor…</p>}
            {p.motor === "error" && <p className={ALERTA}>El medidor no cargó: revisa la señal y vuelve a abrir esta ventana.</p>}
          </>
        )}

        {p.fase === "midiendo" && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3" role="status">
            <LoadingSpinner size={40} />
            <span className="text-sm font-semibold text-[var(--text-secondary)]">Midiendo las trozas de la foto…</span>
          </div>
        )}

        {(p.fase === "sin_hoja" || p.fase === "error") && (
          <div className="space-y-3">
            <p role="alert" className={`${ALERTA} flex items-center gap-1`}>
              {p.fase === "sin_hoja" ? "No encontré la hoja de escala en la foto." : (p.error ?? "No se pudo medir la foto.")}
              {p.fase === "sin_hoja" && (
                <InfoTip
                  title="La hoja no se ve"
                  what="La hoja tiene que salir entera, plana, sin brillo ni sombra encima y no muy chica: acércate o usa el zoom de la cámara (no el digital)."
                  ariaLabel="Por qué no se encontró la hoja"
                />
              )}
            </p>
            {elegirFoto}
          </div>
        )}

        {p.fase === "listo" && p.medida && (
          <>
            {hojaChica(p.medida.cara) && (
              <p role="status" className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                La hoja salió chica en la foto: el Ø puede salir ~1 cm corto. Revisa o acércate.
              </p>
            )}
            <LothTrozasPorFotoCaras p={p} />
            <LothTrozasPorFotoLienzo p={p} />
            <ParejaDeLaElegida p={p} />
            <LothTrozasPorFotoTabla
              p={p}
              catalogo={catalogo}
              fijacion={fijacion}
              delPermiso={delPermiso ?? null}
              faltan={faltanSet}
              especieInvalida={intentado && (!p.especie.trim() || Boolean(problema))}
            />
            <div className="flex flex-wrap items-center gap-2">
              {intentado && motivo && (
                <p role="alert" className={`${ALERTA} mr-auto`}>
                  {motivo}
                </p>
              )}
              <Btn variant="ghost" onClick={p.otraFoto} className="ml-auto">
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Otra foto
              </Btn>
            </div>
          </>
        )}
      </div>
    </AdminModal>
  );
}
