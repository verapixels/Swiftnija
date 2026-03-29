// context/ThemeContext.tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Theme = "dark" | "light";
type ThemeContextType = { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void; };

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark", toggleTheme: () => {}, setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read localStorage synchronously on first render — no waiting, no flash
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("theme");
      return saved === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  // Apply to <html> data-theme attribute whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch { /* ignore */ }
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setThemeState(prev => prev === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);