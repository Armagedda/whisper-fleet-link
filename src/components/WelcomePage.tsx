import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';
import { useTheme } from './ui/ThemeProvider';

const steps = [
  {
    title: 'Welcome to VoiceLink!',
    description: 'A modern, real-time voice platform for seamless communication. Let's get you started!',
    icon: (
      <motion.span animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="inline-block">🎤</motion.span>
    ),
    illustration: (
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="40" cy="40" rx="36" ry="36" fill="url(#grad1)" />
        <rect x="30" y="20" width="20" height="40" rx="10" fill="#fff" opacity="0.8" />
        <rect x="36" y="60" width="8" height="10" rx="4" fill="#fff" />
        <defs>
          <radialGradient id="grad1" cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.5">
            <stop offset="0%" stopColor="#a5b4fc" />
            <stop offset="100%" stopColor="#6366f1" />
          </radialGradient>
        </defs>
      </svg>
    ),
  },
  {
    title: 'Join Channels',
    description: 'Browse or create channels to join conversations. Click a channel to enter and see who's online.',
    icon: (
      <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="inline-block">💬</motion.span>
    ),
    illustration: (
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="40" cy="40" rx="36" ry="36" fill="url(#grad2)" />
        <rect x="20" y="30" width="40" height="20" rx="10" fill="#fff" opacity="0.8" />
        <rect x="30" y="50" width="20" height="8" rx="4" fill="#fff" />
        <defs>
          <radialGradient id="grad2" cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.5">
            <stop offset="0%" stopColor="#fcd34d" />
            <stop offset="100%" stopColor="#f59e42" />
          </radialGradient>
        </defs>
      </svg>
    ),
  },
  {
    title: 'Use Voice Chat',
    description: 'Press the mic button to talk, see who's speaking, and adjust your audio settings for the best experience.',
    icon: (
      <motion.span animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="inline-block">🔊</motion.span>
    ),
    illustration: (
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="40" cy="40" rx="36" ry="36" fill="url(#grad3)" />
        <rect x="35" y="25" width="10" height="30" rx="5" fill="#fff" opacity="0.8" />
        <rect x="30" y="55" width="20" height="8" rx="4" fill="#fff" />
        <defs>
          <radialGradient id="grad3" cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.5">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="100%" stopColor="#10b981" />
          </radialGradient>
        </defs>
      </svg>
    ),
  },
  {
    title: 'Customize Settings',
    description: 'Open the settings menu to change your name, avatar, theme, and audio preferences. Make VoiceLink yours!',
    icon: (
      <motion.span animate={{ rotate: [0, 20, -20, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="inline-block">⚙️</motion.span>
    ),
    illustration: (
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="40" cy="40" rx="36" ry="36" fill="url(#grad4)" />
        <rect x="30" y="30" width="20" height="20" rx="10" fill="#fff" opacity="0.8" />
        <rect x="36" y="50" width="8" height="8" rx="4" fill="#fff" />
        <defs>
          <radialGradient id="grad4" cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.5">
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#be185d" />
          </radialGradient>
        </defs>
      </svg>
    ),
  },
  {
    title: "You're ready!",
    description: 'Click below to enter VoiceLink and start connecting.',
    icon: (
      <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="inline-block">🚀</motion.span>
    ),
    illustration: (
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="40" cy="40" rx="36" ry="36" fill="url(#grad5)" />
        <rect x="36" y="20" width="8" height="40" rx="4" fill="#fff" opacity="0.8" />
        <rect x="36" y="60" width="8" height="10" rx="4" fill="#fff" />
        <defs>
          <radialGradient id="grad5" cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.5">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e42" />
          </radialGradient>
        </defs>
      </svg>
    ),
  },
];

export const WelcomePage: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [step, setStep] = React.useState(0);
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (step < steps.length - 1) setStep(s => s + 1);
      } else if (e.key === 'ArrowLeft') {
        if (step > 0) setStep(s => s - 1);
      } else if (e.key === 'Escape') {
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [step]);

  // Play sound effect on finish
  const playFinishSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.frequency.linearRampToValueAtTime(1760, ctx.currentTime + 0.18);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.22);
      o.stop(ctx.currentTime + 0.22);
      setTimeout(() => ctx.close(), 300);
    } catch {}
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem('onboardingComplete', 'true');
      playFinishSound();
      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSkip = () => {
    localStorage.setItem('onboardingComplete', 'true');
    onComplete();
  };

  const handleEnter = () => {
    localStorage.setItem('onboardingComplete', 'true');
    playFinishSound();
    onComplete();
  };

  // Focus trap
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, [step]);

  // Subtle animated background particles
  const particles = Array.from({ length: 18 }, (_, i) => (
    <motion.div
      key={i}
      className="absolute rounded-full opacity-30 pointer-events-none"
      style={{
        width: `${16 + (i % 4) * 8}px`,
        height: `${16 + (i % 4) * 8}px`,
        top: `${Math.random() * 90}%`,
        left: `${Math.random() * 90}%`,
        background: `linear-gradient(135deg, var(--primary), var(--secondary))`,
        filter: 'blur(2px)',
      }}
      animate={{
        y: [0, (i % 2 === 0 ? 10 : -10)],
        opacity: [0.2, 0.4, 0.2],
      }}
      transition={{ duration: 3 + (i % 4), repeat: Infinity, repeatType: 'reverse', delay: i * 0.2 }}
    />
  ));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-background/80 to-secondary/80 backdrop-blur-xl">
      <div className="absolute inset-0 overflow-hidden -z-10">{particles}</div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          ref={containerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Onboarding"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="w-full max-w-md mx-auto rounded-2xl shadow-2xl bg-gradient-to-br from-zinc-900/80 to-zinc-800/90 border border-border p-8 flex flex-col items-center gap-6 text-center focus:outline-none"
        >
          {/* Progress bar */}
          <div className="w-full h-2 bg-border rounded-full mb-4 overflow-hidden">
            <motion.div
              className="h-2 bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="mb-2">{steps[step].illustration}</div>
            <div className="text-5xl mb-2" aria-hidden>{steps[step].icon}</div>
          </div>
          <div aria-live="polite" className="sr-only">
            {steps[step].title} {steps[step].description}
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{steps[step].title}</h2>
          <p className="text-base text-muted-foreground mb-4">{steps[step].description}</p>
          <div className="flex gap-2 w-full justify-center mt-4">
            {step < steps.length - 1 && <Button variant="outline" onClick={handleSkip} className="rounded-lg px-4 py-2">Skip</Button>}
            {step < steps.length - 1 && <Button onClick={handleBack} className="rounded-lg px-4 py-2" disabled={step === 0}>Back</Button>}
            {step < steps.length - 2 && <Button onClick={handleNext} className="rounded-lg px-4 py-2">Next</Button>}
            {step === steps.length - 2 && <Button onClick={handleNext} className="rounded-lg px-4 py-2">Next</Button>}
            {step === steps.length - 1 && (
              <Button
                onClick={handleEnter}
                className="rounded-lg px-8 py-3 text-xl font-bold animate-pulse bg-primary text-white shadow-lg hover:scale-105 transition-transform"
                autoFocus
              >
                Enter VoiceLink
              </Button>
            )}
          </div>
          <div className="flex gap-1 justify-center mt-4" aria-label="Progress steps">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${i === step ? 'bg-primary' : 'bg-border'}`}
                aria-current={i === step ? 'step' : undefined}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}; 