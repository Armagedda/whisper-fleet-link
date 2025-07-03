import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { ThemeProvider } from './components/ui/ThemeProvider';
import { SettingsModal } from './components/ui/SettingsModal';
import { useState } from 'react';
import { motion } from 'framer-motion';

const queryClient = new QueryClient();

const App = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [user, setUser] = useState({ name: 'User', avatar: '' });

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <motion.nav
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, type: 'spring' }}
          className="sticky top-0 z-30 w-full bg-gradient-to-br from-zinc-900/80 to-zinc-800/60 backdrop-blur-xl shadow-lg border-b border-border flex items-center justify-between px-6 py-3 gap-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary drop-shadow">VoiceLink</span>
            <span className="ml-2 px-3 py-1 rounded-full bg-secondary/60 text-xs font-semibold text-foreground/80 shadow">#general</span>
            <span className="ml-2 flex items-center gap-1 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />Connected</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="rounded-full p-2 bg-background/60 hover:bg-primary/20 transition shadow border border-border"
              aria-label="Open settings"
              onClick={() => setSettingsOpen(true)}
            >
              {user.avatar ? (
                <img src={user.avatar} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <span className="w-8 h-8 flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-lg font-bold text-white">{user.name.charAt(0).toUpperCase()}</span>
              )}
            </button>
          </div>
        </motion.nav>
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          user={user}
          onUpdateUser={setUser}
        />
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </div>
    </ThemeProvider>
  );
};

export default App;
