'use client';

import { m as motion } from 'framer-motion';

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
      <div className="mt-3 flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2">
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-sm text-gray-400">Arroz, leche, gaseosa...</span>
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
        <div className="bg-[var(--accent)] text-white rounded-lg px-4 py-1.5 text-sm font-bold flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
        <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full px-4 py-1.5 text-sm font-bold flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
      <div className="text-center mb-2">
        <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">
          Así vas a cobrar
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
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
            className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center flex-shrink-0">
                {card.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--accent)] bg-[var(--accent)]/10 rounded-full w-5 h-5 flex items-center justify-center">
                    {i + 1}
                  </span>
                  <h3 className="font-bold text-gray-900 dark:text-white">{card.title}</h3>
                </div>
                {card.demo}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-bold hover:bg-[var(--accent-dark)] transition-colors shadow-md shadow-[var(--accent)]/20"
      >
        ¡Entendido, quiero vender! &rarr;
      </button>
    </div>
  );
}
