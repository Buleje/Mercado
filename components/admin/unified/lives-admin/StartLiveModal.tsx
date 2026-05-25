"use client";

/**
 * StartLiveModal — Setup previo a iniciar transmisión.
 *
 * Checklist de cámara, audio, productos y conexión antes de salir al aire.
 */

import { useState } from "react";
import {
  Radio,
  Camera,
  Mic,
  Package,
  Wifi,
  CheckCircle,
  AlertCircle,
  Play,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModal from "@/components/admin/shared/AdminModal";

interface CheckItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: "pendiente" | "ok" | "error";
  description: string;
}

interface Props {
  onClose: () => void;
  onStart: () => void;
}

export function StartLiveModal({ onClose, onStart }: Props) {
  const [title, setTitle] = useState("");
  const [checks, setChecks] = useState<CheckItem[]>([
    {
      id: "camera",
      label: "Cámara",
      icon: <Camera className="h-4 w-4" />,
      status: "pendiente",
      description: "Verifica que la cámara se vea clara y con buena luz",
    },
    {
      id: "mic",
      label: "Audio",
      icon: <Mic className="h-4 w-4" />,
      status: "pendiente",
      description: "Asegura audio claro sin ecos ni ruido de fondo",
    },
    {
      id: "products",
      label: "Productos listos",
      icon: <Package className="h-4 w-4" />,
      status: "pendiente",
      description: "Prepara los productos físicos a mostrar en cámara",
    },
    {
      id: "connection",
      label: "Conexión a internet",
      icon: <Wifi className="h-4 w-4" />,
      status: "pendiente",
      description: "Velocidad de subida mínima: 5 Mbps recomendados",
    },
  ]);

  const toggleCheck = (id: string) => {
    setChecks((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (c.status === "ok") return { ...c, status: "pendiente" as const };
        return { ...c, status: "ok" as const };
      })
    );
  };

  const allChecksOk = checks.every((c) => c.status === "ok");
  const canStart = allChecksOk && title.trim().length > 0;

  const handleStart = () => {
    if (!canStart) return;
    onStart();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Iniciar transmisión"
      description="Verifica todo antes de salir al aire"
      variant="default"
    >
      <div className="p-5 space-y-5">
        {/* Título */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[var(--text-secondary)]">Título de la transmisión *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Ofertas del día"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            autoFocus
          />
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Checklist pre-transmisión</p>
          <div className="space-y-2">
            {checks.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleCheck(c.id)}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-colors",
                  c.status === "ok"
                    ? "border-[var(--data-success-500)] bg-[var(--data-success-50)]"
                    : "border-gray-200 bg-white dark:bg-[var(--color-card)] hover:border-gray-300"
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                  c.status === "ok"
                    ? "bg-[var(--data-success-100)] text-[var(--data-success-500)]"
                    : "bg-gray-100 text-[var(--text-secondary)]"
                )}>
                  {c.status === "ok" ? <CheckCircle className="h-4 w-4" /> : c.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[var(--text-primary)] text-sm">{c.label}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{c.description}</p>
                </div>
                <span className={cn(
                  "text-xs font-bold shrink-0",
                  c.status === "ok" ? "text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]"
                )}>
                  {c.status === "ok" ? "Listo" : "Verificar"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Warning */}
        {!allChecksOk && (
          <div className="flex items-start gap-2 p-3 bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] rounded-xl text-xs text-[var(--data-warning-500)]">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>Marca cada item del checklist cuando esté listo antes de iniciar la transmisión.</p>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-colors",
              canStart ? "bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)]" : "bg-gray-300 cursor-not-allowed"
            )}
          >
            <Play className="h-4 w-4" />
            Salir al aire
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
