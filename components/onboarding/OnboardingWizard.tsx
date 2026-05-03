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

const CONFETTI_COLORS = ['#00B4A6', '#f97316', '#e76f51', '#264653', '#2a9d8f', '#e9c46a', '#f72585', '#4361ee'];

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
    <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {showConfetti && <ConfettiEffect />}

      <div className="w-full max-w-lg mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 relative">
        {/* Back button */}
        {currentStep > 1 && (
          <button
            onClick={goPrev}
            className="absolute top-4 left-4 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex items-center gap-1 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Atrás
          </button>
        )}

        {/* Progress bar */}
        <div className="mt-6">
          <OnboardingProgressBar currentStep={currentStep} />
        </div>

        {/* Steps with animation */}
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

        {/* Skip link */}
        <div className="mt-6 text-center">
          <button
            onClick={handleSkipAll}
            disabled={isCompleting}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            Saltar configuración &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
