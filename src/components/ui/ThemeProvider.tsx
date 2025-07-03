import React, { createContext, useContext, useEffect, useState } from 'react';

const themes = ['dark', 'synthwave', 'mono', 'solarized'] as const;
type Theme = typeof themes[number];

interface UserSettings {
  name: string;
  avatar: string;
  dnd: boolean;
  audioSensitivity: number;
  volume: number;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  userSettings: UserSettings;
  setUserSettings: (settings: UserSettings) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [darkMode, setDarkModeState] = useState(true);
  const [userSettings, setUserSettingsState] = useState<UserSettings>({
    name: 'User',
    avatar: '',
    dnd: false,
    audioSensitivity: 0.5,
    volume: 0.8,
  });

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    const storedDark = localStorage.getItem('darkMode');
    const storedUser = localStorage.getItem('userSettings');
    if (storedTheme && themes.includes(storedTheme)) setThemeState(storedTheme);
    if (storedDark) setDarkModeState(storedDark === 'true');
    if (storedUser) setUserSettingsState(JSON.parse(storedUser));
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('darkMode', darkMode ? 'true' : 'false');
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.dataset.theme = theme;
  }, [theme, darkMode, userSettings]);

  const setTheme = (t: Theme) => setThemeState(t);
  const setDarkMode = (d: boolean) => setDarkModeState(d);
  const setUserSettings = (s: UserSettings) => setUserSettingsState(s);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, darkMode, setDarkMode, userSettings, setUserSettings }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
} 