# AGENTS.md

localgrid is a client-side browser toolbox: a dashboard of small dev-utility widgets (Base64, JSON formatting, JWT tools, color conversion, hashing, etc.). React 19 + Vite + TypeScript + Tailwind v4 + Zustand. No backend, everything runs in the browser.

## Important instructions

- No em dash (—) or en dash (–) as punctuation. Use a comma, period, or parentheses instead.
- Avoid these words and phrases: delve, leverage, seamless, seamlessly, boilerplate, furthermore, moreover, "in today's world", "it's not just X, it's Y".
- No emoji unless the user explicitly asks for them.


## Commands

- `npm run dev` start the dev server
- `npm run build` typecheck (`tsc -b`) then build
- `npm run lint` eslint
- `npm run format` / `npm run format:check` prettier
- `npm test` run the full vitest suite once
- `npm run test:watch` vitest watch mode

After any code change, run `npx tsc -b --noEmit`, `npm run lint`, and `npm test`.

## Structure

- `src/widgets/<widget-id>/` one folder per widget: `definition.ts` (registry entry: id, name, category, icon, size, lazy import), `<Name>Widget.tsx` (the component), a matching `.test.tsx`, and any pure logic split into its own `.ts` file with its own `.test.ts`.
- `src/widgets/registry.ts` the single list every widget must be added to.
- `src/widgets/categories.ts` category labels and display order.
- `src/dashboard/` the grid, tabs, sharing.
- `src/components/` shared UI (`Field`, `CopyButton`, `SegmentedControl`, `CodeEditor`, `ui/*` primitives).
- `src/widgets/useWidgetState.ts` / `useWidgetDirty.ts` per-widget-instance state and "has unsaved content" tracking, used by nearly every widget.
- `src/widgets/widgetConfig.ts` `useWidgetConfig` and `sanitizeConfig`: persisted, shareable widget setup.
- `src/settings/` the Settings dialog (General, Share).
- `docs/widget-architecture.md` layout vs configuration vs state, lifecycle, persistence and share format.

## Conventions

- Widget component signature is always `({ instanceId, mode }: WidgetProps)`.
- Persist widget state with `useWidgetState(instanceId, field, initial)`, not plain `useState` it survives tab switches and remounts.
- Report dirtiness with `useWidgetDirty(instanceId, isDirty)`, comparing current state to the widget's own defaults. Never include config fields.
- Use `useWidgetConfig` (plus a `configSchema` in `definition.ts`) only for setup that is tedious to redo and then used passively, like World Clock cities; everything else stays on `useWidgetState`. See `docs/widget-architecture.md`.
- Use `cn` from `@/lib/utils` (not the deprecated `@/lib/cn`) for conditional class names.
- Reuse existing shared components (`Field`, `CopyButton`, `SegmentedControl`, `ErrorMessage`, `NumberField`) instead of hand-rolling equivalents.
- Colors come from the semantic tokens in `src/index.css` (`success`, `destructive`, `muted`, etc.), not raw Tailwind palette classes, unless a widget has a real reason to deviate.
- Async work (Web Crypto, etc.) goes through `useEffect` plus a `cancelled` flag, not a bare unhandled promise see HashGeneratorWidget.

## Commit and pull request

- Use conventional commit message pattern
- Do not commit or open pull requests without explicit instruction.
