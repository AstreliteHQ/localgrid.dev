# Connectors

Connectors let one widget's output feed another widget's input on the dashboard grid: Base64
encode into a hash, two converters into Text Diff. This page explains how the feature is put
together and the rules it relies on. For the short "make my widget connectable" checklist, see
section 7 of [widget-architecture.md](widget-architecture.md).

Everything lives in `src/connectors/`, apart from a few hooks into the grid, the settings
dialog and the share codec (see [File map](#file-map)).

## Principles

1. **Widgets declare, the framework does the rest.** A widget lists its inputs and output in
   `definition.ts`. Drag and drop, routing, loop prevention, value delivery and every
   connector visual belong to `src/connectors/`. A widget never handles a connection itself.
2. **A connection writes into normal widget state.** An input is an existing
   `useWidgetState` field. Delivering a value means writing that field, exactly as typing
   would, so the widget's reading code does not change.
3. **The graph never loops.** Links that would close a loop are refused when they are made,
   and again when they are loaded from storage or a share link.
4. **Connectors are optional and easy to switch off.** A widget without slots still
   connects. Users can turn the whole feature off.
5. **Nothing is measured from the page.** Wire routes are computed from the grid layout,
   not by reading element positions every frame.

## Model

```text
Connection { from: instanceId, to: instanceId, input: field }

base64 (output) ──► hash-generator.input
url-encoder (output) ──► text-diff.original
base64 (output) ──► text-diff.changed
```

- **One output per widget, any number of inputs.** An output can feed many inputs (fan-out).
  An input takes at most one connection. A new link into a connected input replaces the
  old one. A connection is identified by `connectionKey` = `"<to>:<input>"`.
- **Ends are instance ids**, which are unique across dashboards. Wires can only be drawn
  between widgets on the visible dashboard.
- **Values are strings.** Number or structured values are not supported.

A widget declares its side in `definition.ts`:

```ts
connectors: {
  inputs: [{ field: 'original', label: 'Original' }, { field: 'changed', label: 'Changed' }],
  output: { label: 'Result' }, // omitted for a widget that only receives
}
```

`field` names are stored in saved and shared connections: never rename them.

## Data flow

```text
widget renders ──► useWidgetOutput(instanceId, value)
                       │
                       ▼
              useConnectionStore.publish(from, value)
                       │  remembers the value in `outputs`, then for each link from `from`:
                       ▼
              push(link, value)
                       │  skipped if connectors are off, or the target already holds it
                       ▼
              useWidgetStateStore.setValue("<to>:<input>", value)
                       │
                       ▼
              target re-renders with the new state, publishes its own output, and so on
```

- **The widget doesn't have to be on screen.** Values go into `useWidgetStateStore`, which
  is independent of what is mounted. A chain only moves forward while its middle widgets
  are mounted, because a widget publishes from its own render.
- **New links fill straight away.** `connect` pushes the source's last published value from
  `outputs` as soon as the link exists.
- **Contract for widgets: every connectable field shows its state.** A field that only reads
  its value when it first appears never displays wired-in values. `MergeDiffView` (Text Diff,
  Line mode) is the reference fix: when the prop differs from the editor document, it writes
  the prop into the editor.
- **A connected input stays editable.** The source overwrites it on its next change. The
  source label on the field explains why.

## Guardrails

| Rule                                                                  | Where                                            | What it prevents                               |
| --------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| No self link, no duplicate                                            | `canConnect`                                     | Trivial loops, double delivery                 |
| No path from `to` back to `from`                                      | `canConnect` (depth-first search over widgets)   | Loops of any length, whatever the inputs       |
| One link per input                                                    | `connect`, `sanitizeConnections`                 | Two sources fighting over one field            |
| Equal value is not rewritten                                          | `push`                                           | Ping-pong between widgets, needless renders    |
| Rate limit: over 50 writes per second into one input cuts that link   | `push` (`BURST_LIMIT`, `BURST_WINDOW_MS`)        | A runaway chain, as a last resort              |
| Stored and shared links are rebuilt one by one through the same rules | `sanitizeConnections`, `finalizeConnections`     | Loops or junk from storage or a crafted link   |
| Removed widgets drop their links                                      | `removeInstances`, called by the dashboard store | Links pointing at widgets that no longer exist |

Loops are checked between widgets, not between fields. `a → b.left` plus `b → a.input` is
refused even though the two fields differ.

## UI

| Element                          | Component                                     | Behavior                                                                                                                                                                                    |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IN / OUT tabs on the header edge | `ConnectorPort`, rendered by `WidgetGridItem` | Drag from OUT to connect. On a widget with one input, clicking a connected IN disconnects it. With several inputs, it opens the input list. Always visible, outside the widget's own scroll |
| Field markers                    | `InputSlot`, `OutputSlot`                     | Purely visual. Show the source ("← Base64") or a dot, a labeled drop zone while a wire is dragged, and an outline while the wire is hovered                                                 |
| Wires                            | `ConnectionLayer`                             | A conveyor band with `>` chevrons pointing from output to input. Drawn below the widgets so the tabs sit on top of the wire ends                                                            |
| Input menu                       | `InputMenu`                                   | Picks the input when a drop is ambiguous, or lists inputs with a disconnect button each                                                                                                     |

Where a drop lands decides the input (`resolveDrop`):

1. On a slot's drop zone: that input.
2. Anywhere else on the widget: its only input, or its only free input.
3. Otherwise: the input menu opens at the drop point.

Slots without children mark a region over part of another element. Text Diff uses two of them,
one over each half of its single merge editor.

`ConnectorInstanceContext` carries the instance id, and is set only inside the editable grid
while connectors are enabled. Every connector component renders nothing outside it, so the
expanded overlay and the mobile stack show no connectors.

Hover is computed, not taken from pointer events. The wires sit below the widgets, so
`ConnectionLayer` measures the distance from the pointer to each route (`distanceToRoute`)
and stores the hovered key in `useConnectionStore.hovered`. The tabs and slots read that key
to highlight themselves.

## Routing

Wires run along the gaps between widgets and never cross one (`connectionRouting.ts`).

- **The gaps form a lattice.** Every column and row boundary is a line through the middle of
  a 16px gap. A piece of a line is blocked when a widget spans across it.
- **Shortest path with a turn penalty.** A shortest-path search (Dijkstra) over
  (lattice point, direction of arrival) costs pixel length plus `TURN_PENALTY` per change of
  direction, which favors few, long straight runs.
- **Header anchors.** A wire leaves at the source header's right edge and enters at the
  target header's left edge, `HEADER_ANCHOR_Y` (18px) below the widget top. The IN / OUT tabs
  use the same constant, so they line up by construction.
- **Shortcut:** two widgets facing each other across one clear gap get a direct vertical run.
- **The line above the first row is never used**, because it sits under the app header.
- **Lanes:** each wire is shifted by -2, 0 or +2px so wires sharing a gap stay apart.
  Overlap is still possible in a busy gap.
- **Source of positions:** the layout the grid displays (`renderedLayout` in `GridLayout`),
  updated live during drags and after the grid compacts on its own, for example after a
  removal. It is never written back to the store.

Cost: a few hundred lattice points per route, recomputed only when the layout, links or
width change. This routing depends on react-grid-layout's spacing, the 16px gap and the
header height. Changing any of them needs a matching change here.

## Settings

Settings > Connectors, stored as the `connectors` section of `localgrid.settings`
(`useConnectorSettings`):

- **Enable connectors** (default on). Off hides every tab, slot and wire, and **pauses**
  delivery so nothing changes invisibly. Links are kept, and turning it back on pushes every
  source's current output through again.
- **Conveyor animation**: on hover, always, or off. Always off under reduced motion.
- **Show the source on connected fields**: a label, or a dot only.
- **Colors**: six user colors, one per source widget (`connectionColor` hashes the source id).
  Text on colored labels switches between dark and white for contrast
  (`readableTextColor`).
- **Remove all connections.**

## Storage and sharing

- **Saved links** live in `localgrid.connections` (zustand `persist`) and are checked
  through `sanitizeConnections` on load. Links saved before inputs were declared map to the
  `input` field.
- **Share links** carry connections only with "Include connectors". Instance ids don't
  travel, so each dashboard gets an optional `l: [[fromIndex, toIndex, input]]` that indexes
  into its widget list `ws`. On decode (`finalizeConnections`), a link is kept only if:
  - both widgets survived,
  - the source declares an output,
  - the target declares that input,
  - and it passes the usual one-per-input and no-loop rules.
- **Loading a shared workspace replaces local connections**, and clears them when the link
  has none, since the old ones pointed at widgets the import removes.

## File map

| File                       | Role                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| `connectionGraph.ts`       | `Connection` type, `canConnect`, `sanitizeConnections`, colors           |
| `useConnectionStore.ts`    | Links, last outputs, delivery and guardrails, drag, hover and menu state |
| `useConnectorSettings.ts`  | User settings and the `useConnectorColor` hook                           |
| `useWidgetOutput.ts`       | The one hook a widget with an output calls                               |
| `ConnectorSlots.tsx`       | `InputSlot` and `OutputSlot`                                             |
| `ConnectorPort.tsx`        | Header IN / OUT tabs                                                     |
| `ConnectionLayer.tsx`      | Wires, drag preview, drop resolution, hover                              |
| `InputMenu.tsx`            | Input chooser and list                                                   |
| `connectionRouting.ts`     | Gap routing, anchors, rounded paths, hover distance                      |
| `useInstanceDefinition.ts` | Instance id to widget definition (labels, source names)                  |
| `connectorsContext.ts`     | `ConnectorInstanceContext`                                               |

Outside the folder:

- `GridLayout.tsx`: mounts the layer and tracks the displayed layout.
- `WidgetGridItem.tsx`: provides the context and renders the tabs.
- `useDashboardStore.ts`: removes links of removed widgets, and handles connections on import.
- `layoutCodec.ts`, `shareUrl.ts`, `ShareSection.tsx`, `ShareLoadPrompt.tsx`: sharing.
- `ConnectorsSection.tsx`: the settings section.

