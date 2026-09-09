'use client';

import React, { useState } from 'react';
import MarBotTrigger from './MarBotTrigger';
import MarBotDrawer from './MarBotDrawer';

export default function MarBotWidget() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleDrawer = () => setIsOpen((prev) => !prev);
  const closeDrawer = () => setIsOpen(false);

  return (
    <>
      <MarBotTrigger isOpen={isOpen} onClick={toggleDrawer} />
      <MarBotDrawer isOpen={isOpen} onClose={closeDrawer} />
    </>
  );
}

export const ArsAIWidget = MarBotWidget;
