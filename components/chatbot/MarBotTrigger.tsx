'use client';

import React from 'react';
import styles from './MarBotTrigger.module.css';

interface MarBotTriggerProps {
  isOpen: boolean;
  onClick: () => void;
}

export function MarBotIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.03 2 11c0 2.87 1.5 5.42 3.84 7.02l-1.02 3.06a.75.75 0 0 0 .96.95l3.52-1.41C10.23 20.84 11.1 21 12 21c5.52 0 10-4.03 10-9s-4.48-9-10-9zm-3.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
    </svg>
  );
}

export const MarBotAsteriskIcon = MarBotIcon;
export const ArsAIIcon = MarBotIcon;
export const ArsAISparkleIcon = MarBotIcon;

export default function MarBotTrigger({ isOpen, onClick }: MarBotTriggerProps) {
  return (
    <button
      type="button"
      className={styles.trigger}
      onClick={onClick}
      aria-label={isOpen ? 'Tutup ArsAI' : 'Buka ArsAI Assistant'}
      title="Tanya ArsAI Arsalynk"
      aria-expanded={isOpen}
    >
      <MarBotIcon className={styles.icon} />
      <span className={styles.tooltip}>Tanya ArsAI</span>
    </button>
  );
}

export const ArsAITrigger = MarBotTrigger;
