"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import { CheckCircle, AlertTriangle, Loader2, X, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedCustomer = {
  nombre: string;
  telefono: string;
  email: string;
  _rowIndex: number;
  _errors: string[];
};

type ImportSummary = {
  imported: number;
  duplicates: number;
  errors: { row: number; nombre: string; error: string }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHONE_RE = /^[0-9+\s\-()]{6,20}$/;

function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, "").replace(/^(\+51|51)/, "").trim();
}

function parseCSV(text: string): ParsedCustomer[] {
  const sep = text.includes(";") ? ";" : ",";
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"(.*)"$/, "$1"));

  const guessIdx = (candidates: string[]) => {
    for (const c of candidates) {
      const idx = headers.findIndex((h) => h.includes(c));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const iNombre = guessIdx(["nombre", "name", "cliente"]);
  const iTelefono = guessIdx(["telefono", "phone", "celular", "movil", "tel"]);
  const iEmail = guessIdx(["email", "correo", "mail"]);

  const result: ParsedCustomer[] = [];
  const seenPhones = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    const nombre = (iNombre >= 0 ? cols[iNombre] : "") ?? "";
    const telefonoRaw = (iTelefono >= 0 ? cols[iTelefono] : "") ?? "";
    const email = (iEmail >= 0 ? cols[iEmail] : "") ?? "";

    const errors: string[] = [];
    if (!nombre.trim()) errors.push("Nombre vacio");

    const telNorm = normalizePhone(telefonoRaw);
    if (!telefonoRaw.trim()) {
      errors.push("Telefono vacio");
    } else if (!PHONE_RE.test(telefonoRaw)) {
      errors.push("Formato de telefono invalido");
    } else if (seenPhones.has(telNorm)) {
      errors.push("Duplicado en el archivo");
    } else {
      seenPhones.add(telNorm);
    }

    result.push({ nombre, telefono: telefonoRaw, email, _rowIndex: i + 1, _errors: errors });
  }

  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerImporter() {
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<ParsedCustomer[]>([]);
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState<"idle" | "preview" | "importing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      setParsed(rows);
      setStep("preview");
    };
    reader.readAsText(file, "utf-8");
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const runImport = async () => {
    const valid = parsed.filter((p) => p._errors.length === 0);
    setStep("importing");
    setProgress(0);

    let imported = 0;
    let duplicates = 0;
    const errors: ImportSummary["errors"] = [];

    for (let i = 0; i < valid.length; i++) {
      const c = valid[i];
      try {
        const res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: c.nombre,
            phone: normalizePhone(c.telefono),
            ...(c.email ? { email: c.email } : {}),
          }),
        });

        if (res.ok) {
          imported++;
        } else {
          const data = await res.json().catch(() => ({})) as { error?: string };
          if (res.status === 409 || data.error?.toLowerCase().includes("duplicado") || data.error?.toLowerCase().includes("unique")) {
            duplicates++;
          } else {
            errors.push({ row: c._rowIndex, nombre: c.nombre, error: data.error ?? "Error del servidor" });
          }
        }
      } catch {
        errors.push({ row: c._rowIndex, nombre: c.nombre, error: "Error de red" });
      }

      setProgress(Math.round(((i + 1) / valid.length) * 100));
    }

    setSummary({ imported, duplicates, errors });
    setStep("done");
  };

  const reset = () => {
    setStep("idle");
    setParsed([]);
    setFileName("");
    setSummary(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const valid = parsed.filter((p) => p._errors.length === 0);
  const invalid = parsed.filter((p) => p._errors.length > 0);
  const preview = parsed.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Importar clientes desde CSV
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Campos requeridos: nombre, telefono. Opcional: email
          </p>
        </div>
        {step !== "idle" && (
          <button onClick={reset} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
            Reiniciar
          </button>
        )}
      </div>

      {/* Drop zone */}
      {step === "idle" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 cursor-pointer transition-colors",
            dragging
              ? "border-[#00B4A6] bg-[#00B4A6]/5"
              : "border-[var(--rule-base)] hover:border-[#00B4A6]"
          )}
        >
          <Users className="h-10 w-10 text-gray-400" />
          <div className="text-center">
            <p className="font-medium text-gray-700 dark:text-gray-300">Arrastra el CSV de clientes</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">o haz clic para seleccionar</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFileChange} />
        </div>
      )}

      {/* Preview */}
      {step === "preview" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-gray-500">Archivo: <strong>{fileName}</strong></span>
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              {valid.length} validos
            </span>
            {invalid.length > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertTriangle className="h-4 w-4" />
                {invalid.length} con errores
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {["Fila", "Nombre", "Telefono", "Email", "Estado"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                {preview.map((c) => (
                  <tr
                    key={c._rowIndex}
                    className={cn(
                      c._errors.length > 0
                        ? "bg-red-50 dark:bg-red-900/10"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    )}
                  >
                    <td className="px-4 py-2 text-gray-500">{c._rowIndex}</td>
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                      {c.nombre || <span className="text-red-500 italic">vacio</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      {c.telefono || <span className="text-red-500 italic">vacio</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{c.email || "—"}</td>
                    <td className="px-4 py-2">
                      {c._errors.length === 0 ? (
                        <span className="text-green-600 dark:text-green-400 text-xs font-medium">OK</span>
                      ) : (
                        <span className="text-red-500 text-xs">{c._errors.join(", ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {parsed.length > 10 && (
            <p className="text-xs text-gray-500">Mostrando 10 de {parsed.length} filas.</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={runImport}
              disabled={valid.length === 0}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-colors",
                valid.length > 0
                  ? "bg-[#00B4A6] text-white hover:bg-[#235c43]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800"
              )}
            >
              Importar {valid.length} cliente{valid.length !== 1 ? "s" : ""}
            </button>
            <button onClick={reset} className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 border border-[var(--rule-base)] hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === "importing" && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-gray-900 p-8 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#00B4A6]" />
          <p className="font-medium text-gray-700 dark:text-gray-300">Importando clientes...</p>
          <div className="w-full max-w-sm bg-gray-100 dark:bg-gray-800 rounded-full h-3">
            <div className="bg-[#00B4A6] h-3 rounded-full transition-all duration-[var(--dur-base)]" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-gray-500">{progress}% completado</p>
        </div>
      )}

      {/* Done */}
      {step === "done" && summary && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-gray-900 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">Importacion completada</p>
              <p className="text-sm text-gray-500">
                {summary.imported} importados · {summary.duplicates} duplicados · {summary.errors.length} errores
              </p>
            </div>
          </div>

          {summary.duplicates > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {summary.duplicates} cliente{summary.duplicates !== 1 ? "s" : ""} ya existian en el sistema (no duplicados).
              </p>
            </div>
          )}

          {summary.errors.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/10 p-4 space-y-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Clientes no importados:</p>
              {summary.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400">
                  Fila {e.row} &mdash; {e.nombre}: {e.error}
                </p>
              ))}
            </div>
          )}

          <button onClick={reset} className="px-5 py-2 rounded-lg text-sm font-medium bg-[#00B4A6] text-white hover:bg-[#235c43] transition-colors">
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
