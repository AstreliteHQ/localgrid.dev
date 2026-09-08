<div align="center">

![localgrid.dev](./docs/localgrid-banner.png)

**A browser-based dashboard for everyday developer tools.**

Base64, JSON, JWTs, hashing, colors, regex, and more, pinned side by side on one
customizable, shareable screen instead of scattered across two dozen browser tabs.

[**Live demo**](https://dropsnorz.github.io/localgrid.dev/) · [Report a bug](https://github.com/DropSnorz/localgrid.dev/issues)

[![Deploy](https://img.shields.io/github/actions/workflow/status/DropSnorz/localgrid.dev/pages.yml?branch=main&label=deploy)](https://github.com/DropSnorz/localgrid.dev/actions/workflows/pages.yml)
![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646cff?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-65a1fe)

</div>

---

## Why localgrid

Plenty of good developer-utility sites already exist, covering Base64, JSON, colors,
timestamps, JWTs, and everything else on this list. What none of them solve is context
switching: opening a new tool means a new tab, losing your place, and finding your way back
to what you were doing. Those small interruptions and context switching add up when you are debugging.

localgrid instead treats tools as widgets on a persistent dashboard. Pin the five or six you
reach for constantly, arrange them however fits your screen, and keep working across all of
them at once without losing state or hunting for the next tab.

## Features

### Client-side, offline, installable

No backend, no account, nothing you paste ever leaves your browser. localgrid installs as a
PWA and keeps working without a connection.

### A layout that's actually yours

Widgets live on a resizable, snap-to-grid dashboard. Drag and resize on desktop or tablet;
phones get a clean read-only stacked view instead.

### Expand without losing your place

Any pinned widget can fill the screen for focused work, and switching back leaves everything
you typed exactly where it was. Need a tool that isn't on your dashboard at all? Launch it
from the tool browser or the command palette (`Cmd/Ctrl+K`) without pinning it.

### Save and share

Layouts persist to `localStorage` automatically, and can be shared with a teammate through a
URL or QR code. Only the layout travels, not live widget content, and opening a shared link
always asks before it touches your local dashboard.

## Widgets

33 tools across 10 categories, and growing.

| Category   | Widgets                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Generators | UUID Generator                                                                                            |
| Formatting | Cron Expression, JSON Formatter, Timestamp Converter, XML Formatter, YAML ↔ JSON Converter                |
| Encoding   | Base64, JWT Encoder, LZ-String, URL Encoder                                                               |
| Security   | Certificate Viewer, Hash Generator, JWK Viewer, Password Generator                                        |
| Text       | Content Type Detector, Emoji Picker, Log Viewer, Notes, Regex Tester, Text Case Converter, Text Diff      |
| Math       | Expression Evaluator, Number Base Converter, Percentage Calculator, Statistics Calculator, Unit Converter |
| AI / LLM   | Invisible Character Cleaner, Token Counter                                                                |
| Color      | Color Converter, WCAG Contrast Checker                                                                    |
| Network    | Subnet Calculator                                                                                         |
| Time       | Timeline Builder, Timer, World Clock                                                                      |

## How it compares

There are already plenty of great developer utility tools out there, covering everything from Base64 and JSON to colors, timestamps, JWTs, and more. Many are recent developments from the AI-coding boom, and it shows: most feel like variations on the same template rather than a considered design choice. But as the table below shows, differentiation was never really the problem we cared about most. **Context switching** between tools means losing focus, finding the next tool, and getting back into what you were doing. These small interruptions add up and make simple tasks feel more complicated than they need to be. We wanted a simpler experience: **keep several tools open at once, move naturally between them, and keep the context of your work in one place.**

This dashboard-first approach won't be for everyone. It's a deliberate attempt to stand apart from the alternatives below.

_Worth a look before building a new one 👀_

| Tool                                                         | Local first | Offline App | Web app | Multi-tools single page | Persistent workspace | License        |
| ------------------------------------------------------------ | :---------: | :---------: | :-----: | :---------------------: | :------------------: | -------------- |
| ⭐ **Localgrid**                                             |     🟢      |     🟢      |   🟢    |           🟢            |          🟢          | **TBD**        |
| [DevToys](https://devtoys.app/)                              |     🟢      |     🟢      |   🔴    |           🔴            |          🔴          | 🟢 MIT         |
| [DevUtils](https://devutils.com/)                            |     🟢      |     🟢      |   🔴    |           🔴            |          🔴          | 🔴 Proprietary |
| [devutils.sh](https://devutils.sh/)                          |     🟢      |     🟢      |   🟢    |           🔴            |          🔴          | ❓             |
| [NextDevTools](https://www.nextdevtools.com/)                |     🟢      |     🔴      |   🟢    |           🟡            |          🔴          | ❓             |
| [SafeUtils](https://safeutils.com/)                          |     🟢      |     🟢      |   🔴    |           🔴            |          🔴          | 🔴 Proprietary |
| [Boop](https://github.com/IvanMathy/Boop)                    |     🟢      |     🟢      |   🔴    |           🔴            |          🟡          | 🟢 MIT         |
| [Devly](https://devly.techfixpro.net/)                       |     🟢      |     🟢      |   🔴    |           🟡            |          🔴          | 🔴 Proprietary |
| [DevToolGrid](https://devtoolgrid.com/)                      |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | ❓             |
| [devdeck.ir](https://devdeck.ir/)                            |     🟢      |     ❓      |   🟢    |           🔴            |          🔴          | ❓             |
| [IT-Tools](https://it-tools.tech/)                           |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | 🟢 GPL-3.0     |
| [CyberChef](https://gchq.github.io/CyberChef/)               |     🟢      |     🟡      |   🟢    |           🟡            |          🟡          | 🟢 Apache-2.0  |
| [DevTools-X](https://github.com/fosslife/devtools-x)         |     🟢      |     🟢      |   🔴    |           🔴            |          🔴          | 🟢 MIT         |
| [Open Dev](https://github.com/Jamalianpour/open-dev)         |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | 🟢 MIT         |
| [DevTools Daily](https://www.devtoolsdaily.com/)             |     🟢      |     🔴      |   🟢    |           🔴            |          🟡          | ❓             |
| [devtools.tools](https://www.devtools.tools)                 |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | ❓             |
| [TrueDevTools](https://truedevtools.com/)                    |     🟢      |     🟢      |   🟢    |           🔴            |          🔴          | 🟢 MIT         |
| [DevSnap.net](https://devsnap.net/)                          |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | 🔴 Proprietary |
| [developers.do](https://github.com/hminaya/devtools)         |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | 🟡 CC BY-NC-SA |
| [JamDev](https://github.com/jamdotdev/jam-dev-utilities)     |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | 🟢 GPL-3.0     |
| [Online Web Dev Tools](https://onlinewebdevtools.com/)       |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | ❓             |
| [DevToolbox](https://tools-dev.com)                          |     🟡      |     🔴      |   🟢    |           🔴            |          🔴          | ❓             |
| [GameParticles](https://gameparticles.com/)                  |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | 🔴 Proprietary |
| [devs-forge](https://github.com/chinmaygirkar786/devs-forge) |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | ❓             |
| [CodersTool](https://www.coderstool.com/)                    |     🟡      |     🔴      |   🟢    |           🔴            |          🔴          | 🔴 Proprietary |
| [OpenReplay Tools](https://openreplay.com/tools/)            |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | 🔴 Proprietary |
| [ToolFlic](https://toolflic.com/)                            |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | 🔴 Proprietary |
| [Universal Dev Tools](https://universaldevtools.in/)         |     🔴      |     🔴      |   🟢    |           🔴            |          ❓          | ❓             |
| [WebDev-Tools](https://webdev-tools.info/)                   |     🟢      |     🔴      |   🟢    |           🔴            |          🔴          | 🟢 MIT         |

## Development

Requires Node 20 or newer.

```sh
npm install
npm run dev
```

Or just use the [live demo](https://dropsnorz.github.io/localgrid.dev/), nothing to install.

### Available scripts

| Script                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the Vite dev server                |
| `npm run build`        | Type-check and build for production      |
| `npm run preview`      | Preview the production build locally     |
| `npm run lint`         | Lint the codebase with ESLint            |
| `npm run format`       | Format the codebase with Prettier        |
| `npm run format:check` | Check formatting without writing changes |
| `npm run test`         | Run the test suite once                  |
| `npm run test:watch`   | Run the test suite in watch mode         |

## Architecture

```text
src/
  dashboard/       grid, toolbar, Zustand store, localStorage persistence, share/QR flow
  widgets/          one folder per widget: definition.ts (registry metadata) + <Name>Widget.tsx
  widget-shell/      chrome every widget renders inside: title bar, expand/remove,
                       error boundary, keyboard move/resize dialog
  overlay/           fullscreen expand target and its store
  sidebar/            searchable catalog of every widget
  command-palette/    Cmd/Ctrl+K launcher
  components/, lib/, hooks/, theme/, types/
```

The widget registry (`src/widgets/registry.ts`) is the single source of truth every other
piece of UI reads from: the dashboard grid, the sidebar catalog, and the command palette
never duplicate widget metadata. Each widget's component is `React.lazy`-loaded, so adding
a widget never bloats another widget's bundle.

Expanding a widget to fullscreen doesn't move any DOM around. A pinned widget's grid cell
and the fullscreen overlay each mount their own independent copy of the same component; both
read and write the same entry in a shared, instanceId-keyed store (`useWidgetState`), so
switching between the two is just two mounts of the same state rather than a portal carrying
one DOM tree between them. See `src/overlay/WidgetOverlay.tsx`.

## Testing

Vitest and React Testing Library, with tests colocated next to the code they cover
(`*.test.ts` / `*.test.tsx`). Coverage spans the widget registry, the dashboard store, the
share-link codec, error isolation, and per-widget behavior.

## License

TBD.
