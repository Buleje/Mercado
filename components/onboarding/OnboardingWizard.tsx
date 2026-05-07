'use client';

import { useState, useCallback } from 'react';
// Audit P14: usar `motion` completo en lugar de `m` (LazyMotion). La page
// /onboarding NO está dentro de MarketplaceLayout / LazyMotion provider,
// entonces `m.div` quedaba con opacity:0 stuck (initial="enter") y el
// modal aparecía en blanco. Switch a motion full evita el provider missing.
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboarding } from './useOnboarding';
import OnboardingProgressBar from './OnboardingProgressBar';
import OnboardingStep1Brand from './OnboardingStep1Brand';
import OnboardingStep2Product from './OnboardingStep2Product';
import OnboardingStep3Client from './OnboardingStep3Client';
import OnboardingStep4POSDemo from './OnboardingStep4POSDemo';
import OnboardingStep5Finish from './OnboardingStep5Finish';

const CONFETTI_COLORS = ['var(--accent)', '#f97316', '#e76f51', '#264653', '#2a9d8f', '#e9c46a', '#f72585', '#4361ee'];

function generatePieces() {
  return Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + Math.random() * 6,
    rotation: Math.random() * 360,
  }));
}

function ConfettiEffect() {
  const [pieces] = useState(generatePieces);

  return (
    <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: 0,
            width: `${p.size}px`,
            height: `${p.size * 1.5}px`,
            backgroundColor: p.color,
            borderRadius: '2px',
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

export default function OnboardingWizard() {
  const { currentStep, stepData, isCompleting, updateStep, goNext, goPrev, complete } = useOnboarding();
  const [showConfetti, setShowConfetti] = useState(false);

  const handleComplete = useCallback(async () => {
    const success = await complete();
    if (success) {
      setShowConfetti(true);
      setTimeout(() => {
        window.location.href = '/admin';
      }, 2000);
    }
  }, [complete]);

  const handleSkipAll = useCallback(async () => {
    const success = await complete();
    if (success) {
      window.location.href = '/admin';
    }
  }, [complete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, var(--accent-soft) 0%, transparent 55%), radial-gradient(120% 80% at 100% 100%, var(--accent-muted) 0%, transparent 55%), var(--surface-canvas)",
      }}
    >
      {showConfetti && <ConfettiEffect />}

      {/* Card compacto: 480px hardcoded para escapar del override de
          --container-lg (1200px) que tiene este proyecto en Tailwind v4.
          Animación de entrada suave (sin opacity stuck). */}
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[480px] mx-auto bg-[var(--surface-raised)] rounded-3xl border border-[var(--rule-base)] overflow-hidden"
        style={{ boxShadow: "0 24px 60px -12px rgba(0,0,0,0.18), 0 8px 16px -8px rgba(0,0,0,0.08)" }}
      >
        {/* Header con progress + back button */}
        <div className="px-6 pt-6 pb-5 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40">
          {currentStep > 1 && (
            <button
              onClick={goPrev}
              aria-label="Volver al paso anterior"
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded px-1 -ml-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Atrás
            </button>
          )}
          <OnboardingProgressBar currentStep={currentStep} />
        </div>

        {/* Body con steps */}
        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              {currentStep === 1 && (
                <OnboardingStep1Brand
                  data={stepData.brand}
                  onChange={data => updateStep('brand', data)}
                  onNext={goNext}
                />
              )}

              {currentStep === 2 && (
                <OnboardingStep2Product
                  data={stepData.product}
                  onChange={data => updateStep('product', data)}
                  onNext={goNext}
                />
              )}

              {currentStep === 3 && (
                <OnboardingStep3Client
                  data={stepData.client}
                  onChange={data => updateStep('client', data)}
                  onNext={goNext}
                />
              )}

              {currentStep === 4 && (
                <OnboardingStep4POSDemo onNext={goNext} />
              )}

              {currentStep === 5 && (
                <OnboardingStep5Finish
                  data={stepData.preferences}
                  defaultPhone={stepData.brand.telefono}
                  onChange={data => updateStep('preferences', data)}
                  onComplete={handleComplete}
                  isCompleting={isCompleting}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer skip */}
        <div className="px-6 py-3 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40 text-center">
          <button
            onClick={handleSkipAll}
            disabled={isCompleting}
            className="text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded px-2 py-1"
          >
            Saltar configuración →
          </button>
        </div>
      </motion.div>
    </div>
  );
}
