"use client";

import { useMemo, useState } from "react";
import { Link2, Copy, Check, Loader2, MessageCircle, Lock, Share2, RotateCcw } from "@buleje/design-system/icons";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { rolesDeLaCadena, type CarpetaConRoles } from "@/lib/documents/doc-access";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { Casilla } from "@/components/ui-system/Casilla";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  armarEnlaceVariasCarpetas,
  fechaConDiaCorta,
  mensajeEnlaceCarpetas,
  MAX_CARPETAS_POR_ENLACE,
} from "@/lib/documentos/enlace-varias-carpetas";
import { crearEnlacesDeCarpetas } from "./crear-enlaces-carpetas";

/**
 * Un solo enlace con varias esenciales (23-10, Brandon: «al contador le mandas
 * licencias, contratos y SUNAT de una vez»). Por dentro es un enlace de
 * carpeta de siempre por cada una, con los mismos días y la misma clave; la URL
 * los junta (`/c/<t1>?mas=<t2>,<t3>`). Revocar uno en «Enlaces compartidos»
 * saca esa carpeta del enlace sin tocar las demás.
 */

type Dias = "7" | "30" | "90";
const OPCIONES_DIAS: { value: Dias; label: string }[] = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
];

type Listo = { enlace: string; vence: string; nombres: string[] };

const CAJA = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3";
const ETIQUETA =
  "mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]";

export default function CompartirEsencialesModal({
  carpetas,
  todas,
  onClose,
}: {
  /** Las esenciales, en el orden en que se muestran. */
  carpetas: DbDocumentFolder[];
  /** Todas las carpetas del Archivo: para saber si una esencial tiene candado en su cadena. */
  todas: DbDocumentFolder[];
  onClose: () => void;
}) {
  /* Con candado en la carpeta o en su cadena, el enlace (`sc…`) no la sirve: no se ofrece
     (seguridad 24-10: su nombre iba en el WhatsApp y «N carpetas» prometía una que no abre). */
  const cerradas = useMemo(() => {
    const porId = new Map<string, CarpetaConRoles>(
      todas.map((c) => [c.id, { parentId: c.parentId ?? null, allowedRoles: c.allowedRoles ?? [] }]),
    );
    return new Set(carpetas.filter((c) => rolesDeLaCadena(c.id, porId).length > 0).map((c) => c.id));
  }, [carpetas, todas]);
  const [elegidas, setElegidas] = useState<Set<string>>(
    () => new Set(carpetas.filter((c) => !cerradas.has(c.id)).slice(0, MAX_CARPETAS_POR_ENLACE).map((c) => c.id)),
  );
  const [dias, setDias] = useState<Dias>("30");
  const [conClave, setConClave] = useState(false);
  const [clave, setClave] = useState("");
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<Listo | null>(null);
  const [copiado, setCopiado] = useState(false);

  const enOrden = carpetas.filter((c) => elegidas.has(c.id));
  const lleno = elegidas.size >= MAX_CARPETAS_POR_ENLACE;
  const claveLimpia = clave.trim();
  const faltaClave = conClave && claveLimpia.length < 4;
  const puedeCrear = !avance && !listo && enOrden.length > 0 && !faltaClave;

  const alternar = (id: string) => {
    setError(null);
    setElegidas((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else if (sig.size < MAX_CARPETAS_POR_ENLACE) sig.add(id);
      return sig;
    });
  };

  async function crear() {
    if (!puedeCrear) return;
    setError(null);
    setAvance({ hechas: 0, total: enOrden.length });
    const r = await crearEnlacesDeCarpetas(
      enOrden.map((c) => ({ id: c.id, name: c.name })),
      { dias: Number(dias), clave: conClave ? claveLimpia : undefined },
      (hechas) => setAvance({ hechas, total: enOrden.length }),
    );
    setAvance(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setListo({
      enlace: armarEnlaceVariasCarpetas(window.location.origin, r.tokens),
      vence: r.vence,
      nombres: enOrden.map((c) => c.name),
    });
  }

  const copiar = async () => {
    if (!listo) return;
    try {
      await navigator.clipboard.writeText(listo.enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setError("Tu navegador no dejó copiar: selecciona el enlace y cópialo a mano.");
    }
  };

  const whatsapp = () => {
    if (!listo) return;
    const texto = mensajeEnlaceCarpetas(listo.nombres, listo.enlace, listo.vence);
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };

  const otro = () => {
    setListo(null);
    setError(null);
    setCopiado(false);
  };

  const nota = listo
    ? `${listo.nombres.length} carpeta${listo.nombres.length === 1 ? "" : "s"} · vence el ${fechaConDiaCorta(listo.vence)}`
    : `${enOrden.length} de ${Math.min(carpetas.length, MAX_CARPETAS_POR_ENLACE)} carpetas`;

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Compartir esenciales"
      description="Un solo enlace con varias carpetas"
      icon={Share2}
      size="md"
      claveVentana="compartir-esenciales"
      footer={
        <ModalFooter error={error} nota={nota}>
          <button onClick={onClose} className={button({ variant: "secondary" })}>
            Cerrar
          </button>
          {listo ? (
            <>
              <button onClick={otro} className={button({ variant: "secondary" })}>
                <RotateCcw className="h-4 w-4" /> Hacer otro
              </button>
              <button onClick={whatsapp} className={button({ variant: "primary" })}>
                <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
              </button>
            </>
          ) : (
            <button onClick={crear} disabled={!puedeCrear} className={button({ variant: "primary" })}>
              {avance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {avance ? `Creando ${avance.hechas + 1} de ${avance.total}…` : "Crear enlace"}
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <fieldset disabled={!!listo || !!avance} className="space-y-4 disabled:opacity-70">
          <div className={CAJA}>
            <div className={ETIQUETA}>
              Qué carpetas van
              <InfoTip
                what="Quien abra el enlace ve y descarga los papeles de cada carpeta marcada (sin sus subcarpetas). Los que tienen candado nunca salen, aunque tú los veas."
                example={`Al contador: licencias, contratos y SUNAT de una vez. Máximo ${MAX_CARPETAS_POR_ENLACE} por enlace.`}
              />
            </div>
            {carpetas.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Todavía no marcaste carpetas como esenciales.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {carpetas.map((c) => {
                  const marcada = elegidas.has(c.id);
                  const id = `esencial-compartir-${c.id}`;
                  return (
                    <li key={c.id}>
                      <label
                        htmlFor={id}
                        className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
                      >
                        <Casilla id={id} checked={marcada} disabled={cerradas.has(c.id) || (!marcada && lleno)} onChange={() => alternar(c.id)} />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        {cerradas.has(c.id) && (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--text-tertiary)]">
                            <Lock className="h-4 w-4" aria-hidden /> con candado, no va
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={CAJA}>
            <div className={ETIQUETA}>Vence en</div>
            <SegmentedControl<Dias> value={dias} onChange={setDias} options={OPCIONES_DIAS} size="xl" label="Días que dura el enlace" />
          </div>

          <div className={CAJA}>
            <label htmlFor="esenciales-con-clave" className="flex cursor-pointer items-center gap-2.5 text-sm font-bold text-[var(--text-primary)]">
              <Casilla
                id="esenciales-con-clave"
                checked={conClave}
                onChange={(e) => {
                  setConClave(e.target.checked);
                  setClave("");
                }}
              />
              <Lock className="h-4 w-4" /> Pedir una clave para abrirlas
            </label>
            {conClave && (
              <input
                type="text"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Clave (mínimo 4 caracteres)"
                aria-label="Clave del enlace"
                autoComplete="off"
                className="mt-2.5 h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />
            )}
            {conClave && (
              <p className="mt-1.5 text-xs text-[var(--text-secondary)]">Pásale la clave por otro lado, no en el mismo mensaje.</p>
            )}
          </div>
        </fieldset>

        {listo && (
          <div className={CAJA} data-qa="enlace-esenciales">
            <div className={ETIQUETA}>
              <Link2 className="h-3.5 w-3.5" /> Enlace listo
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-[var(--surface-raised)] px-2 py-2 text-xs text-[var(--text-secondary)]">
                {listo.enlace}
              </code>
              <button onClick={copiar} className={button({ variant: "secondary", size: "md" })}>
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
