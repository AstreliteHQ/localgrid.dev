import { icons, type LucideIcon } from 'lucide-react'

/** Every Lucide icon, keyed by its PascalCase export name (`ArrowDown`).
 *
 * This module is the only place that imports the whole `icons` namespace,
 * and IconPickerWidget loads it with a dynamic import, so the full set
 * (most of the widget's weight) lands in its own chunk, fetched the first
 * time the widget is shown and never by the rest of the app. Icons other
 * widgets import by name stay in the chunks that already use them. */
export const ICONS: Readonly<Record<string, LucideIcon>> = icons

export const ICON_KEYS: readonly string[] = Object.keys(icons).sort((a, b) => a.localeCompare(b))
