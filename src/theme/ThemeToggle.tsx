import type { ReactNode } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Button } from '@/components/ui/button'
import { useThemeStore, type Theme } from './useThemeStore'

const OPTIONS: { label: ReactNode; value: Theme; ariaLabel: string }[] = [
  {
    label: <Monitor className="size-3.5" />,
    value: 'system',
    ariaLabel: 'Use system theme',
  },
  {
    label: <Sun className="size-3.5" />,
    value: 'light',
    ariaLabel: 'Use light theme',
  },
  {
    label: <Moon className="size-3.5" />,
    value: 'dark',
    ariaLabel: 'Use dark theme',
  },
]

/** Full three-way switch from `sm` up. Below that there's no room for three
 * segments in the header, so it collapses to one button showing the current
 * theme that steps to the next option (system, light, dark) on each tap. */
export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)

  const currentIndex = OPTIONS.findIndex((option) => option.value === theme)
  const current = OPTIONS[currentIndex]
  const next = OPTIONS[(currentIndex + 1) % OPTIONS.length]

  return (
    <>
      <SegmentedControl value={theme} onChange={setTheme} options={OPTIONS} className="hidden sm:inline-flex" />
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => setTheme(next.value)}
        aria-label={`Theme: ${current.value}, switch to ${next.value}`}
        title={`Switch to ${next.value} theme`}
        className="sm:hidden"
      >
        {current.label}
      </Button>
    </>
  )
}
