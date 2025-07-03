import React, { useState } from 'react';
import { useTheme } from './ThemeProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { AnimatePresence, motion } from 'framer-motion';

const themes = [
  { name: 'Dark', value: 'dark' },
  { name: 'Synthwave', value: 'synthwave' },
  { name: 'Mono', value: 'mono' },
  { name: 'Solarized', value: 'solarized' },
];

export const SettingsModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { theme, setTheme, darkMode, setDarkMode, userSettings, setUserSettings } = useTheme();
  const [name, setName] = useState(userSettings.name);
  const [avatar, setAvatar] = useState(userSettings.avatar);
  const [dnd, setDnd] = useState(userSettings.dnd);
  const [audioSensitivity, setAudioSensitivity] = useState(userSettings.audioSensitivity);
  const [volume, setVolume] = useState(userSettings.volume);

  const handleSave = () => {
    setUserSettings({ name, avatar, dnd, audioSensitivity, volume });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <Dialog open={open} onOpenChange={onClose}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, type: 'spring' }}
          >
            <DialogContent className="max-w-md w-full mx-auto my-auto rounded-xl shadow-2xl bg-gradient-to-br from-zinc-800/80 to-zinc-900/90 backdrop-blur-xl border border-border p-6 flex flex-col gap-6 focus:outline-none">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-foreground">User Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-3xl font-bold text-white shadow-inner">
                    {avatar ? <img src={avatar} alt="avatar" className="w-full h-full rounded-full object-cover" /> : name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="name">Display Name</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} className="w-full" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="avatar">Avatar URL</Label>
                  <Input id="avatar" value={avatar} onChange={e => setAvatar(e.target.value)} className="w-full" />
                </div>
                <div className="flex items-center gap-4">
                  <Label>Theme</Label>
                  <div className="flex gap-2">
                    {themes.map(t => (
                      <Button
                        key={t.value}
                        variant={theme === t.value ? 'default' : 'outline'}
                        onClick={() => setTheme(t.value as any)}
                        className={`rounded-full px-4 py-1 ${theme === t.value ? 'ring-2 ring-primary' : ''}`}
                        aria-label={`Select ${t.name} theme`}
                      >
                        {t.name}
                      </Button>
                    ))}
                  </div>
                  <Switch checked={darkMode} onCheckedChange={setDarkMode} aria-label="Toggle dark mode" />
                  <span className="text-xs text-muted-foreground">Dark Mode</span>
                </div>
                <div className="flex items-center gap-4">
                  <Label>DND</Label>
                  <Switch checked={dnd} onCheckedChange={setDnd} aria-label="Do Not Disturb" />
                  <span className="text-xs text-muted-foreground">Mute all notifications</span>
                </div>
                <div className="space-y-2">
                  <Label>Audio Sensitivity</Label>
                  <Slider value={[audioSensitivity]} onValueChange={([v]) => setAudioSensitivity(v)} min={0} max={1} step={0.01} />
                </div>
                <div className="space-y-2">
                  <Label>Volume</Label>
                  <Slider value={[volume]} onValueChange={([v]) => setVolume(v)} min={0} max={1} step={0.01} />
                </div>
              </div>
              <DialogFooter className="flex gap-2 justify-end">
                <Button variant="outline" onClick={onClose} className="rounded-lg px-4 py-2">Cancel</Button>
                <Button onClick={handleSave} className="rounded-lg px-4 py-2">Save</Button>
              </DialogFooter>
            </DialogContent>
          </motion.div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}; 