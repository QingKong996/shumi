import { useLayoutEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'shumi:theme'
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

function getInitialTheme(): Theme {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

  if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
    return storedTheme
  }

  return 'system'
}

function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === 'system') {
    return prefersDark ? 'dark' : 'light'
  }

  return theme
}

function applyTheme(resolvedTheme: ResolvedTheme): void {
  const root = document.documentElement

  root.classList.toggle('dark', resolvedTheme === 'dark')
  root.style.colorScheme = resolvedTheme
}

export function useTheme(): {
  theme: Theme
  setTheme: (theme: Theme) => void
} {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useLayoutEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)

    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY)
    applyTheme(resolveTheme(theme, mediaQuery.matches))

    if (theme !== 'system') {
      return
    }

    const handleChange = (event: MediaQueryListEvent): void => {
      applyTheme(resolveTheme('system', event.matches))
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  return {
    theme,
    setTheme
  }
}
