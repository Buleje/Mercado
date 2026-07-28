"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Check, X, Copy, MessageCircle, PenTool } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import type { DbContract, DbContractSigner, SignerRol } from "@/lib/types/contracts";

/**
 * Quién firma el contrato y cómo se le hace llegar.
 *
 * El link se manda por WhatsApp porque es el canal donde el trabajador o el
 * proveedor efectivamente está: pedirle que entre a un panel con usuario y
 * clave sería pedirle que no firme.
 */

type FirmanteConLink = DbContractSigner & { link: string | null };

interface Props {
  contrato: DbContract;
  onCambio?: () => void;
}

interface Borrador {
  nombre: string;
  documento: string;
  telefono: string;
  rol: SignerRol;
}

/** Normaliza a formato peruano: 9 dígitos sueltos son un celular local. */
function normalizarTelefono(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.length === 9) return `51${digitos}`;
  return digitos;
}

const ESTADO_TEXTO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  FIRMADO: "Firmó",
  RECHAZADO: "No aceptó",
};

export default function PanelFirmantes({ contrato, onCambio }: Props) {
  const [firmantes, setFirmantes] = useState<FirmanteConLink[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [borradores, setBorradores] = useState<Borrador[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/contratos/${contrato.id}/firmantes`);
      if (!res.ok) throw new Error("No se pudieron cargar los firmantes");
      const json = await res.json();
      setFirmantes(json.firmantes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, [contrato.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirEdicion = () => {
    setError(null);
    setBorradores(
      firmantes.length > 0
        ? firmantes.map(f => ({ nombre: f.nombre, documento: f.documento, telefono: f.telefono, rol: f.rol }))
        : [
            // Arranca precargado con las dos partes que el contrato ya conoce.
            { nombre: "", documento: "", telefono: "", rol: "EMISOR" as SignerRol },
            {
              nombre: contrato.clienteNombre,
              documento: contrato.clienteDoc,
              telefono: "",
              rol: "CONTRAPARTE" as SignerRol,
            },
          ],
    );
    setEditando(true);
  };

  const guardar = async () => {
    const limpios = borradores
      .map(b => ({ ...b, nombre: b.nombre.trim(), telefono: normalizarTelefono(b.telefono) }))
      .filter(b => b.nombre.length >= 2);

    if (limpios.length === 0) {
      setError("Cargá al menos un firmante con nombre.");
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/contratos/${contrato.id}/firmantes`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ firmantes: limpios }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "No se pudo guardar");
      }
      setFirmantes(json.firmantes ?? []);
      setEditando(false);
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const copiarLink = async (f: FirmanteConLink) => {
    if (!f.link) return;
    try {
      await navigator.clipboard.writeText(f.link);
      setCopiado(f.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch (err) {
      console.warn("[contratos] no se pudo copiar el link", err);
    }
  };

  const mandarPorWhatsApp = (f: FirmanteConLink) => {
    if (!f.link) return;
    const texto = [
      `Hola ${f.nombre}, te comparto el contrato ${contrato.numero} para que lo revises y lo firmes.`,
      "",
      "Podés leerlo completo y firmarlo desde el celular acá:",
      f.link,
    ].join("\n");
    const destino = f.telefono ? `${normalizarTelefono(f.telefono)}` : "";
    window.open(`https://wa.me/${destino}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };

  const yaHayFirmas = firmantes.some(f => f.estado === "FIRMADO");

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
          <PenTool className="h-4 w-4" /> Quiénes firman
        </h4>
        {!editando && !yaHayFirmas && (
          <button
            onClick={abrirEdicion}
            className="text-xs font-bold text-primary hover:underline"
          >
            {firmantes.length > 0 ? "Cambiar" : "Definir firmantes"}
          </button>
        )}
      </div>

      {cargando && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />}

      {!cargando && !editando && firmantes.length === 0 && (
        <p className="text-xs text-[var(--text-secondary)]">
          Nadie fue invitado a firmar todavía. Un contrato sin firmas es un borrador.
        </p>
      )}

      {!editando && firmantes.length > 0 && (
        <ol className="space-y-2">
          {firmantes.map(f => (
            <li
              key={f.id}
              className="p-2.5 rounded-xl bg-[var(--surface-alt)] dark:bg-white/5 border border-[var(--rule-soft)] dark:border-white/10"
            >
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 shrink-0 rounded-full bg-[var(--surface-sunken)] dark:bg-white/10 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] flex items-center justify-center">
                  {f.orden}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{f.nombre}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    {f.rol === "EMISOR" ? "Tu lado" : f.rol === "TESTIGO" ? "Testigo" : "Contraparte"}
                    {f.documento ? ` · ${f.documento}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-lg shrink-0",
                    f.estado === "FIRMADO"
                      ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                      : f.estado === "RECHAZADO"
                        ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/25 text-[var(--data-error-500)]"
                        : "bg-[var(--surface-sunken)] dark:bg-white/10 text-[var(--text-secondary)]",
                  )}
                >
                  {ESTADO_TEXTO[f.estado] ?? f.estado}
                </span>
              </div>

              {f.motivoRechazo && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] mt-1.5 pl-8">
                  Motivo: {f.motivoRechazo}
                </p>
              )}

              {f.link && f.estado === "PENDIENTE" && (
                <div className="flex items-center gap-1.5 mt-2 pl-8">
                  <button
                    onClick={() => mandarPorWhatsApp(f)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[length:var(--ts-2xs)] font-bold text-white bg-[var(--data-success-500)] hover:opacity-90 transition-opacity"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Mandar por WhatsApp
                  </button>
                  <button
                    onClick={() => copiarLink(f)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] dark:bg-white/5 hover:bg-[var(--rule-soft)] transition-colors"
                  >
                    {copiado === f.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiado === f.id ? "Copiado" : "Copiar link"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {editando && (
        <div className="space-y-2">
          {borradores.map((b, i) => (
            <div
              key={i}
              className="p-2.5 rounded-xl border border-[var(--rule-base)] dark:border-white/10 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                  Firma {i + 1}
                </span>
                <select
                  value={b.rol}
                  onChange={e =>
                    setBorradores(prev =>
                      prev.map((x, j) => (j === i ? { ...x, rol: e.target.value as SignerRol } : x)),
                    )
                  }
                  className="text-xs px-2 py-1 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-[var(--text-primary)]"
                >
                  <option value="EMISOR">Tu lado</option>
                  <option value="CONTRAPARTE">Contraparte</option>
                  <option value="TESTIGO">Testigo</option>
                </select>
                <button
                  onClick={() => setBorradores(prev => prev.filter((_, j) => j !== i))}
                  className="ml-auto text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
                  aria-label={`Quitar firmante ${i + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                value={b.nombre}
                onChange={e =>
                  setBorradores(prev => prev.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))
                }
                placeholder="Nombre completo"
                className="w-full px-2.5 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  value={b.documento}
                  onChange={e =>
                    setBorradores(prev =>
                      prev.map((x, j) => (j === i ? { ...x, documento: e.target.value } : x)),
                    )
                  }
                  placeholder="DNI o RUC"
                  className="px-2.5 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
                />
                <input
                  value={b.telefono}
                  onChange={e =>
                    setBorradores(prev =>
                      prev.map((x, j) => (j === i ? { ...x, telefono: e.target.value } : x)),
                    )
                  }
                  placeholder="WhatsApp (9 dígitos)"
                  inputMode="tel"
                  className="px-2.5 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
                />
              </div>
            </div>
          ))}

          <button
            onClick={() =>
              setBorradores(prev => [...prev, { nombre: "", documento: "", telefono: "", rol: "TESTIGO" }])
            }
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[var(--text-secondary)] border border-dashed border-[var(--rule-base)] dark:border-white/15 hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar otro firmante
          </button>

          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Firman en este orden: cada uno recibe su link cuando le toca.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-60"
            >
              {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Guardar y generar links
            </button>
            <button
              onClick={() => { setEditando(false); setError(null); }}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] dark:bg-white/5 hover:bg-[var(--rule-soft)] transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-[var(--data-error-500)] mt-2">{error}</p>}
    </div>
  );
}
