"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

// ── Schemas Zod (safeParse siempre) ──────────────────────────────────────────

const StoreConfigSchema = z.object({
  address: z.string().min(5, "Ingresa la dirección completa (mín. 5 caracteres)"),
  phone: z.string().min(7, "Ingresa un teléfono válido"),
  openTime: z.string().min(1, "Selecciona la hora de apertura"),
  closeTime: z.string().min(1, "Selecciona la hora de cierre"),
});

const FirstProductSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  price: z.number({ error: "Ingresa un precio válido" }).positive("El precio debe ser mayor a 0"),
  stock: z.number({ error: "Ingresa una cantidad válida" }).min(0, "El stock no puede ser negativo"),
  category: z.string().min(1, "Selecciona una categoría"),
});

const InviteCashierSchema = z.object({
  name: z.string().min(2, "Ingresa el nombre del cajero"),
  username: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(32)
    .regex(/^[a-z0-9_.]+$/i, "Solo letras, números, punto o guión bajo"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  role: z.enum(["cajero", "almacenero"]),
});

// ── Tipos ─────────────────────────────────────────────────────────────────────

type SetupStep = 1 | 2 | 3;

interface StoreConfigForm {
  address: string;
  phone: string;
  openTime: string;
  closeTime: string;
  logoPreview: string | null;
}

interface FirstProductForm {
  name: string;
  price: string;
  stock: string;
  category: string;
  imagePreview: string | null;
}

interface InviteCashierForm {
  name: string;
  username: string;
  password: string;
  role: "cajero" | "almacenero";
  skip: boolean;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const STEP_META: Record<SetupStep, { title: string; subtitle: string; icon: string }> = {
  1: {
    title: "Configura tu tienda",
    subtitle: "Cuéntanos dónde estás y en qué horario atiendes",
    icon: "🏪",
  },
  2: {
    title: "Agrega tu primer producto",
    subtitle: "Empieza con uno — puedes agregar más desde el panel",
    icon: "📦",
  },
  3: {
    title: "Invita a tu cajero",
    subtitle: "Tu equipo puede acceder desde cualquier dispositivo",
    icon: "👤",
  },
};

const PRODUCT_CATEGORIES = [
  "Abarrotes",
  "Bebidas",
  "Lacteos",
  "Panaderia",
  "Golosinas",
  "Limpieza",
  "Higiene personal",
  "Frutas y verduras",
  "Carnes",
  "Congelados",
  "Otros",
];

const HORARIOS = [
  "05:00", "06:00", "07:00", "08:00", "09:00", "10:00",
  "11:00", "12:00", "13:00", "14:00", "15:00", "16:00",
  "17:00", "18:00", "19:00", "20:00", "21:00", "22:00",
  "23:00", "00:00",
];

// ── Helpers UI ────────────────────────────────────────────────────────────────

function inputCls(hasError?: boolean) {
  return [
    "w-full px-3 py-3 text-sm rounded-xl border transition outline-none",
    "bg-white dark:bg-gray-800 dark:text-gray-100",
    hasError
      ? "border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500"
      : "border-gray-200 dark:border-gray-700 focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]",
  ].join(" ");
}

function selectCls(hasError?: boolean) {
  return inputCls(hasError) + " cursor-pointer";
}

// ── Animaciones Framer Motion ─────────────────────────────────────────────────

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
  }),
};

const slideTransition = { duration: 0.28, ease: [0.32, 0.72, 0, 1] as const };

// ── Confetti canvas (sin librería externa, canvas-confetti) ───────────────────

function useConfetti() {
  const fired = useRef(false);

  const fire = useCallback(async () => {
    if (fired.current) return;
    fired.current = true;
    try {
      const confetti = (await import("canvas-confetti")).default;
      const count = 200;
      const defaults = { origin: { y: 0.7 } };

      function fireConfetti(particleRatio: number, opts: Record<string, unknown>) {
        confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio),
        });
      }

      fireConfetti(0.25, { spread: 26, startVelocity: 55, colors: ["#2563EB", "#f4a261", "#fff"] });
      fireConfetti(0.2, { spread: 60, colors: ["#2563EB", "#f4a261"] });
      fireConfetti(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ["#2563EB", "#ffffff"] });
      fireConfetti(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2, colors: ["#f4a261"] });
      fireConfetti(0.1, { spread: 120, startVelocity: 45, colors: ["#2563EB", "#f4a261", "#fff"] });
    } catch {
      // confetti es decorativo — no bloquear
    }
  }, []);

  return { fire };
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const { fire: fireConfetti } = useConfetti();

  const [currentStep, setCurrentStep] = useState<SetupStep>(1);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // Step 1: configuración de tienda
  const [storeConfig, setStoreConfig] = useState<StoreConfigForm>({
    address: "",
    phone: "",
    openTime: "08:00",
    closeTime: "22:00",
    logoPreview: null,
  });

  // Step 2: primer producto
  const [firstProduct, setFirstProduct] = useState<FirstProductForm>({
    name: "",
    price: "",
    stock: "",
    category: "",
    imagePreview: null,
  });

  // Step 3: cajero
  const [cashier, setCashier] = useState<InviteCashierForm>({
    name: "",
    username: "",
    password: "",
    role: "cajero",
    skip: false,
  });

  // Errores por campo
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ── Logo upload (step 1) ────────────────────────────────────────────────────

  const logoInputRef = useRef<HTMLInputElement>(null);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toastError("El logo no puede superar 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setStoreConfig((p) => ({ ...p, logoPreview: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  }

  // ── Foto de producto (step 2) ───────────────────────────────────────────────

  const productImageRef = useRef<HTMLInputElement>(null);

  function handleProductImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toastError("La imagen no puede superar 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFirstProduct((p) => ({ ...p, imagePreview: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  }

  // ── Validaciones por paso ───────────────────────────────────────────────────

  function validateStep1(): boolean {
    const result = StoreConfigSchema.safeParse({
      address: storeConfig.address,
      phone: storeConfig.phone,
      openTime: storeConfig.openTime,
      closeTime: storeConfig.closeTime,
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((e) => {
        const f = e.path[0] as string;
        if (!errs[f]) errs[f] = e.message;
      });
      setFieldErrors(errs);
      return false;
    }
    setFieldErrors({});
    return true;
  }

  function validateStep2(): boolean {
    const priceNum = parseFloat(firstProduct.price);
    const stockNum = parseInt(firstProduct.stock, 10);
    const result = FirstProductSchema.safeParse({
      name: firstProduct.name,
      price: isNaN(priceNum) ? undefined : priceNum,
      stock: isNaN(stockNum) ? undefined : stockNum,
      category: firstProduct.category,
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((e) => {
        const f = e.path[0] as string;
        if (!errs[f]) errs[f] = e.message;
      });
      setFieldErrors(errs);
      return false;
    }
    setFieldErrors({});
    return true;
  }

  function validateStep3(): boolean {
    if (cashier.skip) return true;
    const result = InviteCashierSchema.safeParse({
      name: cashier.name,
      username: cashier.username,
      password: cashier.password,
      role: cashier.role,
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((e) => {
        const f = e.path[0] as string;
        if (!errs[f]) errs[f] = e.message;
      });
      setFieldErrors(errs);
      return false;
    }
    setFieldErrors({});
    return true;
  }

  // ── Guardar step 1 → PATCH /api/settings ───────────────────────────────────

  async function saveStep1(): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessAddress: storeConfig.address,
          businessPhone: storeConfig.phone,
          openTime: storeConfig.openTime,
          closeTime: storeConfig.closeTime,
        }),
      });
      if (!res.ok) {
        toastError("No se pudo guardar la configuración. Continúa e inténtalo desde el panel.");
        return true; // No bloqueamos el flujo
      }
      return true;
    } catch {
      toastError("Error de red al guardar. Continúa e inténtalo desde el panel.");
      return true; // Best-effort
    } finally {
      setSaving(false);
    }
  }

  // ── Guardar step 2 → POST /api/v1/products ─────────────────────────────────

  async function saveStep2(): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: firstProduct.name,
          price: parseFloat(firstProduct.price),
          stock: parseInt(firstProduct.stock, 10),
          category: firstProduct.category,
          image: firstProduct.imagePreview ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toastError(data.error ?? "No se pudo agregar el producto. Puedes agregarlo desde el panel.");
        return true; // Best-effort
      }
      toastSuccess("Producto agregado exitosamente");
      return true;
    } catch {
      toastError("Error de red al guardar el producto. Continúa e inténtalo desde el panel.");
      return true;
    } finally {
      setSaving(false);
    }
  }

  // ── Guardar step 3 → POST /api/admin-users ─────────────────────────────────

  async function saveStep3(): Promise<boolean> {
    if (cashier.skip) return true;
    setSaving(true);
    try {
      const res = await fetch("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cashier.name,
          username: cashier.username,
          password: cashier.password,
          role: cashier.role,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: unknown };
        const msg = typeof data.error === "string"
          ? data.error
          : "No se pudo crear el usuario. Puedes invitarlo desde el panel.";
        toastError(msg);
        return true; // Best-effort
      }
      toastSuccess(`${cashier.role === "cajero" ? "Cajero" : "Almacenero"} ${cashier.name} agregado exitosamente`);
      return true;
    } catch {
      toastError("Error de red. Puedes invitar al cajero desde el panel de admin.");
      return true;
    } finally {
      setSaving(false);
    }
  }

  // ── Completar onboarding → POST /api/onboarding/complete ───────────────────

  async function completeOnboarding(): Promise<void> {
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: {} }),
      });
    } catch {
      // Fire-and-forget: no bloquea el redirect
    }
  }

  // ── Navegación entre pasos ──────────────────────────────────────────────────

  async function handleNext() {
    if (currentStep === 1) {
      if (!validateStep1()) return;
      await saveStep1();
      goToStep(2);
    } else if (currentStep === 2) {
      if (!validateStep2()) return;
      await saveStep2();
      goToStep(3);
    } else if (currentStep === 3) {
      if (!validateStep3()) return;
      await saveStep3();
      await handleComplete();
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      goToStep((currentStep - 1) as SetupStep);
    }
    setFieldErrors({});
  }

  function goToStep(step: SetupStep) {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
    setFieldErrors({});
  }

  async function handleComplete() {
    setCompletingOnboarding(true);
    await completeOnboarding();
    setIsDone(true);
    await fireConfetti();
    setTimeout(() => {
      router.push("/admin");
    }, 3000);
  }

  const progress = ((currentStep - 1) / 3) * 100;
  const progressDone = isDone ? 100 : (currentStep / 3) * 100;

  // ── Pantalla de celebracion ───────────────────────────────────────────────

  if (isDone) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#e6f7f6] to-[#f0faf9] dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.3, 1] }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-7xl mb-4"
          >
            🎉
          </motion.div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Tu bodega esta lista
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm leading-relaxed">
            Todo configurado. En un momento te enviamos al panel de administrador
            donde podras empezar a vender.
          </p>
          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.8 }}
              className="h-full rounded-full"
              style={{ backgroundColor: "#2563EB" }}
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Redirigiendo al panel admin...
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            {[
              { icon: "📱", text: "Comparte tu tienda con clientes" },
              { icon: "💰", text: "Acepta Yape y Plin" },
              { icon: "🚚", text: "Activa delivery" },
              { icon: "📊", text: "Monitorea tus ventas" },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-start gap-2 bg-[#e6f7f6] dark:bg-[#2563EB]/10 rounded-xl p-3 text-left"
              >
                <span className="text-base">{item.icon}</span>
                <span className="text-xs text-gray-600 dark:text-gray-400">{item.text}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Render principal ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e6f7f6] to-[#f0faf9] dark:from-gray-900 dark:to-gray-950 flex flex-col items-center justify-start p-4 pt-8">

      {/* Encabezado */}
      <div className="w-full max-w-lg mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#2563EB" }}
          >
            <span className="text-white text-sm font-bold">B</span>
          </div>
          <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Buleje ERP</span>
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
            Paso {currentStep} de 3
          </span>
        </div>

        {/* Barra de progreso */}
        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
          <motion.div
            animate={{ width: `${progressDone}%` }}
            transition={{ duration: 0.4 }}
            className="h-full rounded-full"
            style={{ backgroundColor: "#2563EB" }}
          />
        </div>

        {/* Indicadores de paso */}
        <div className="flex justify-between mt-3">
          {([1, 2, 3] as SetupStep[]).map((s) => (
            <div
              key={s}
              className={[
                "flex items-center gap-1.5 text-xs font-medium transition-colors",
                s === currentStep
                  ? "text-[#2563EB]"
                  : s < currentStep
                    ? "text-gray-400 dark:text-gray-600"
                    : "text-gray-300 dark:text-gray-700",
              ].join(" ")}
            >
              <div
                className={[
                  "w-5 h-5 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold",
                  s < currentStep
                    ? "bg-[#2563EB] text-white"
                    : s === currentStep
                      ? "bg-[#2563EB] text-white ring-2 ring-[#2563EB]/30"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-400",
                ].join(" ")}
              >
                {s < currentStep ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s
                )}
              </div>
              <span className="hidden sm:inline">{STEP_META[s].title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tarjeta del wizard */}
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden">

        {/* Header de paso */}
        <div
          className="px-6 py-5 flex items-center gap-3"
          style={{ background: "linear-gradient(135deg, #2563EB 0%, #007a73 100%)" }}
        >
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
            {STEP_META[currentStep].icon}
          </div>
          <div>
            <h2 className="text-white font-semibold text-base">
              {STEP_META[currentStep].title}
            </h2>
            <p className="text-white/70 text-xs mt-0.5">
              {STEP_META[currentStep].subtitle}
            </p>
          </div>
        </div>

        {/* Contenido animado */}
        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
              className="px-6 py-6"
            >
              {/* STEP 1: Configurar tienda */}
              {currentStep === 1 && (
                <Step1StoreConfig
                  form={storeConfig}
                  setForm={setStoreConfig}
                  errors={fieldErrors}
                  logoInputRef={logoInputRef}
                  onLogoChange={handleLogoChange}
                />
              )}

              {/* STEP 2: Primer producto */}
              {currentStep === 2 && (
                <Step2FirstProduct
                  form={firstProduct}
                  setForm={setFirstProduct}
                  errors={fieldErrors}
                  imageRef={productImageRef}
                  onImageChange={handleProductImageChange}
                />
              )}

              {/* STEP 3: Invitar cajero */}
              {currentStep === 3 && (
                <Step3InviteCashier
                  form={cashier}
                  setForm={setCashier}
                  errors={fieldErrors}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Botones de navegación */}
        <div className="px-6 pb-6 flex gap-3">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={saving}
              className="min-h-[44px] flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition"
            >
              Atras
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleNext()}
            disabled={saving || completingOnboarding}
            className="min-h-[44px] flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition flex items-center justify-center gap-2"
            style={{ backgroundColor: "#2563EB" }}
          >
            {saving || completingOnboarding ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                {completingOnboarding ? "Finalizando..." : "Guardando..."}
              </>
            ) : currentStep < 3 ? (
              "Continuar"
            ) : cashier.skip ? (
              "Finalizar sin cajero"
            ) : (
              "Finalizar configuracion"
            )}
          </button>
        </div>

        {/* Omitir paso */}
        {currentStep === 3 && !cashier.skip && (
          <div className="px-6 pb-5 text-center">
            <button
              type="button"
              onClick={() => {
                setCashier((p) => ({ ...p, skip: true }));
                setFieldErrors({});
                toastInfo("Puedes invitar cajeros desde el panel de admin en cualquier momento.");
              }}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2 transition"
            >
              Omitir por ahora — invitare cajeros despues
            </button>
          </div>
        )}
        {currentStep === 3 && cashier.skip && (
          <div className="px-6 pb-5 text-center">
            <button
              type="button"
              onClick={() => {
                setCashier((p) => ({ ...p, skip: false }));
                setFieldErrors({});
              }}
              className="text-xs text-[#2563EB] hover:underline underline-offset-2 transition"
            >
              Agregar un cajero ahora
            </button>
          </div>
        )}
      </div>

      {/* Hint de progreso */}
      <p className="text-xs text-gray-400 dark:text-gray-600 mt-4 text-center">
        Puedes completar o editar cualquier dato despues desde el panel de admin
      </p>
    </div>
  );
}

// ── Step 1: Configuración de tienda ──────────────────────────────────────────

function Step1StoreConfig({
  form,
  setForm,
  errors,
  logoInputRef,
  onLogoChange,
}: {
  form: StoreConfigForm;
  setForm: React.Dispatch<React.SetStateAction<StoreConfigForm>>;
  errors: Record<string, string>;
  logoInputRef: React.RefObject<HTMLInputElement | null>;
  onLogoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Logo upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Logo de tu tienda (opcional)
        </label>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-[#2563EB] transition shrink-0"
            onClick={() => logoInputRef.current?.click()}
          >
            {form.logoPreview ? (
              <Image
                src={form.logoPreview}
                alt="Logo preview"
                width={64}
                height={64}
                unoptimized
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center">
                <svg className="w-6 h-6 text-gray-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="text-sm text-[#2563EB] hover:underline font-medium"
            >
              {form.logoPreview ? "Cambiar logo" : "Subir logo"}
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">PNG, JPG hasta 2 MB</p>
            {form.logoPreview && (
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, logoPreview: null }))}
                className="text-xs text-red-400 hover:underline mt-0.5 block"
              >
                Quitar logo
              </button>
            )}
          </div>
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onLogoChange}
        />
      </div>

      {/* Dirección */}
      <FormFieldSimple label="Dirección de tu bodega" error={errors.address} required>
        <input
          type="text"
          placeholder="Jr. 28 de Julio 147, Pucallpa"
          value={form.address}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
          className={inputCls(!!errors.address)}
        />
      </FormFieldSimple>

      {/* Teléfono */}
      <FormFieldSimple label="Teléfono / WhatsApp" error={errors.phone} required>
        <input
          type="tel"
          placeholder="+51 961 234 567"
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          className={inputCls(!!errors.phone)}
        />
      </FormFieldSimple>

      {/* Horario */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Horario de atención <span className="text-red-400">*</span>
        </label>
        <div className="flex items-center gap-2">
          <select
            value={form.openTime}
            onChange={(e) => setForm((p) => ({ ...p, openTime: e.target.value }))}
            className={selectCls(!!errors.openTime) + " flex-1"}
          >
            {HORARIOS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <span className="text-gray-400 text-sm shrink-0">hasta</span>
          <select
            value={form.closeTime}
            onChange={(e) => setForm((p) => ({ ...p, closeTime: e.target.value }))}
            className={selectCls(!!errors.closeTime) + " flex-1"}
          >
            {HORARIOS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
        {(errors.openTime || errors.closeTime) && (
          <p className="text-xs text-red-500 mt-1">{errors.openTime || errors.closeTime}</p>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Primer producto ───────────────────────────────────────────────────

function Step2FirstProduct({
  form,
  setForm,
  errors,
  imageRef,
  onImageChange,
}: {
  form: FirstProductForm;
  setForm: React.Dispatch<React.SetStateAction<FirstProductForm>>;
  errors: Record<string, string>;
  imageRef: React.RefObject<HTMLInputElement | null>;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Foto del producto */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Foto del producto (opcional)
        </label>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-[#2563EB] transition shrink-0 bg-gray-50 dark:bg-gray-800"
            onClick={() => imageRef.current?.click()}
          >
            {form.imagePreview ? (
              <Image
                src={form.imagePreview}
                alt="Producto"
                width={64}
                height={64}
                unoptimized
                className="w-full h-full object-cover"
              />
            ) : (
              <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => imageRef.current?.click()}
              className="text-sm text-[#2563EB] hover:underline font-medium"
            >
              {form.imagePreview ? "Cambiar foto" : "Subir foto"}
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">PNG, JPG hasta 2 MB</p>
          </div>
        </div>
        <input
          ref={imageRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onImageChange}
        />
      </div>

      {/* Nombre del producto */}
      <FormFieldSimple label="Nombre del producto" error={errors.name} required>
        <input
          type="text"
          placeholder="Ej: Arroz Costeño 1 kg"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          className={inputCls(!!errors.name)}
        />
      </FormFieldSimple>

      {/* Categoría */}
      <FormFieldSimple label="Categoría" error={errors.category} required>
        <select
          value={form.category}
          onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
          className={selectCls(!!errors.category)}
        >
          <option value="">Selecciona una categoría</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </FormFieldSimple>

      {/* Precio y stock */}
      <div className="grid grid-cols-2 gap-3">
        <FormFieldSimple label="Precio (S/)" error={errors.price} required>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
              S/
            </span>
            <input
              type="number"
              min="0"
              step="0.10"
              placeholder="0.00"
              value={form.price}
              onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              className={inputCls(!!errors.price) + " pl-8"}
            />
          </div>
        </FormFieldSimple>

        <FormFieldSimple label="Stock inicial" error={errors.stock} required>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={form.stock}
            onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))}
            className={inputCls(!!errors.stock)}
          />
        </FormFieldSimple>
      </div>

      <div className="bg-[#e6f7f6] dark:bg-[#2563EB]/10 rounded-xl p-3 text-xs text-[#007a73] dark:text-[#2563EB]">
        Puedes agregar todos tus productos despues desde{" "}
        <strong>Admin → Productos</strong>. Tambien puedes importar desde un
        archivo Excel.
      </div>
    </div>
  );
}

// ── Step 3: Invitar cajero ────────────────────────────────────────────────────

function Step3InviteCashier({
  form,
  setForm,
  errors,
}: {
  form: InviteCashierForm;
  setForm: React.Dispatch<React.SetStateAction<InviteCashierForm>>;
  errors: Record<string, string>;
}) {
  if (form.skip) {
    return (
      <div className="text-center py-4 space-y-3">
        <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto text-3xl">
          👤
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Sin problema. Podras invitar cajeros y almaceneros desde{" "}
          <strong>Admin → Equipo</strong> en cualquier momento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rol */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Rol del nuevo usuario
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(["cajero", "almacenero"] as const).map((rol) => (
            <button
              key={rol}
              type="button"
              onClick={() => setForm((p) => ({ ...p, role: rol }))}
              className={[
                "py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all text-left",
                form.role === rol
                  ? "border-[#2563EB] bg-[#e6f7f6] dark:bg-[#2563EB]/10 text-[#2563EB]"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#2563EB]/40",
              ].join(" ")}
            >
              <div className="font-semibold capitalize">{rol}</div>
              <div className="text-xs mt-0.5 font-normal opacity-70">
                {rol === "cajero"
                  ? "Maneja caja y ventas"
                  : "Maneja inventario y stock"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Nombre */}
      <FormFieldSimple label="Nombre completo" error={errors.name} required>
        <input
          type="text"
          placeholder="Maria Garcia"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          className={inputCls(!!errors.name)}
          autoComplete="off"
        />
      </FormFieldSimple>

      {/* Usuario */}
      <FormFieldSimple label="Usuario de acceso" error={errors.username} required>
        <input
          type="text"
          placeholder="maria.garcia"
          value={form.username}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""),
            }))
          }
          className={inputCls(!!errors.username)}
          autoComplete="off"
        />
      </FormFieldSimple>

      {/* Contraseña */}
      <FormFieldSimple
        label="Contrasena temporal"
        error={errors.password}
        required
        hint="El cajero podra cambiarla despues"
      >
        <input
          type="password"
          placeholder="Min. 6 caracteres"
          value={form.password}
          onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
          className={inputCls(!!errors.password)}
          autoComplete="new-password"
        />
      </FormFieldSimple>
    </div>
  );
}

// ── Sub-componente FormFieldSimple ────────────────────────────────────────────

function FormFieldSimple({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</p>
      )}
      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}
