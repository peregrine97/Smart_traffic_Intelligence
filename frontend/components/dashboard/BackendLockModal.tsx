'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../lib/api';
import { Brain, CircleNotch } from '@phosphor-icons/react';

export default function BackendLockModal() {
  const [isReady, setIsReady] = useState<boolean>(true); // Assume true until proven false
  const [hasChecked, setHasChecked] = useState<boolean>(false);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let isChecking = false;

    const checkHealth = async () => {
      if (isChecking) return;
      isChecking = true;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const res = await fetch(`${API_BASE_URL}/`, {
          method: 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (res.ok) {
          setIsReady(true);
          setHasChecked(true);
        } else {
          setIsReady(false);
          setHasChecked(true);
        }
      } catch (err) {
        setIsReady(false);
        setHasChecked(true);
      } finally {
        isChecking = false;
      }
    };

    // Initial check
    checkHealth();

    // Poll every 3 seconds if not ready
    intervalId = setInterval(() => {
      // Only poll if we know it's not ready
      if (hasChecked && !isReady) {
        checkHealth();
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [isReady, hasChecked]);

  // If we haven't done the initial check, or if it is ready, don't show the modal
  if (!hasChecked || isReady) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-[100] bg-neo-bg/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="border-4 border-neo-border p-8 max-w-md w-full bg-white flex flex-col items-center text-center shadow-[8px_8px_0px_0px_rgba(22,51,0,1)] animate-in fade-in zoom-in duration-300">
        <div className="w-16 h-16 bg-neo-primary border-4 border-neo-border flex items-center justify-center mb-6 animate-pulse">
          <Brain weight="bold" className="w-8 h-8 text-neo-text" />
        </div>
        
        <h2 className="text-2xl font-black uppercase tracking-tight mb-3 text-neo-text">
          Waking up AI Engine
        </h2>
        
        <p className="font-mono text-sm text-gray-600 mb-6 border-l-4 border-neo-primary pl-3 text-left">
          The backend server is spinning up from a cold start on Render. This usually takes 30-50 seconds. Please wait...
        </p>

        <div className="w-full bg-neo-secondary border-3 border-neo-border h-4 mb-2 relative overflow-hidden">
           <div className="absolute top-0 left-0 h-full w-full bg-neo-primary origin-left animate-pulse"></div>
        </div>
        <div className="w-full flex justify-between font-mono text-[10px] uppercase font-bold text-gray-500">
           <span className="text-red-500">Status: Offline</span>
           <span className="flex items-center gap-1"><CircleNotch className="animate-spin" /> Polling Server</span>
        </div>
      </div>
    </div>
  );
}
