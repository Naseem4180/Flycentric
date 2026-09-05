import { useCallback, useEffect, useState } from 'react';

// Simple light/dark theme toggle ("Day Mode" / "Night Mode" button seen in
// the admin + student shells). Persisted to localStorage and applied via a
// `data-theme` attribute on <html> so plain CSS variables can react to it.
export default function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('fc_theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fc_theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggle };
}
