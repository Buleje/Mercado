'use client';

// Full `motion` (no `m`/LazyMotion): la ruta /onboarding NO está bajo el
// MotionProvider del route-group (onboarding), por lo que `m.div` quedaba
// stuck en initial opacity:0 → las 3 cards eran invisibles. Mismo fix que
// OnboardingWizard. Ver comentario en OnboardingWizard.tsx.
import { motion } from 'framer-motion';
import { OnboardingPrimaryButton } from './onboarding-ui';

interface Props {
  onNext: () => void;
}

const cards = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    title: 'Busca el producto',
    demo: (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2">
        <svg className="h-4 w-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-sm text-[var(--text-tertiary)]">Arroz, leche, gaseosa...</span>
      </div>
    ),
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
    ),
    title: 'Agrega al carrito',
    demo: (
      <div className="mt-3 flex justify-center">
        <div
          className="flex items-center gap-1 rounded-lg px-4 py-1.5 text-sm font-bold text-white shadow-[0_4px_14px_-4px_var(--accent-glow)]"
          style={{ backgroundImage: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Agregar
        </div>
      </div>
    ),
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Cobra y listo',
    demo: (
      <div className="mt-3 flex justify-center">
        <div className="flex items-center gap-1 rounded-full bg-[var(--data-success-50)] px-4 py-1.5 text-sm font-bold text-[var(--data-success-700)]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Pagado
        </div>
      </div>
    ),
  },
];

export default function OnboardingStep4POSDemo({ onNext }: Props) {
  return (
    <div className="space-y-6">
      <div className="mb-2 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Así vas a cobrar
        </h2>
        <p className="mt-2 text-[var(--text-secondary)]">
          3 pasos simples para cada venta
        </p>
      </div>

      <div className="space-y-4">
        {cards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.2, duration: 0.4, ease: 'easeOut' }}
            className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-5 transition-all duration-200 hover:border-[var(--accent)]/40 hover:shadow-[0_8px_24px_-12px_var(--accent-glow)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                {card.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                    {i + 1}
                  </span>
                  <h3 className="font-bold text-[var(--text-primary)]">{card.title}</h3>
                </div>
                {card.demo}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <OnboardingPrimaryButton onClick={onNext} withArrow>
        ¡Entendido, quiero vender!
      </OnboardingPrimaryButton>
    </div>
  );
}
