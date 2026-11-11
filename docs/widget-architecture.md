# Widget architecture

How a widget is defined, where its data lives, and what happens to that data when the user
reloads, clears, duplicates or shares. Read this before adding a widget or changing how one
stores anything.

```text
useDashboardStore  (persisted: localStorage "localgrid.dashboard")
  dashboards[]
    widgets[]: DashboardWidgetInstance
      instanceId, widgetId, x, y, w, h   <- layout
      data?: { field: value }            <- widget data (useWidgetData)

useWidgetStateStore  (in memory only)
  values["<instanceId>:<field>"]         <- state (useWidgetState)

useWidgetDirtyStore  (in memory only)
  dirtyByInstance, resetNonceByInstance  <- "has content that would be lost"
```

## 1. Anatomy of a widget

Each widget lives in `src/widgets/<widget-id>/`:

- `definition.ts`: the registry entry (`WidgetDefinition` in `src/widgets/types.ts`): `id`,
  `name`, `description`, `category`, `icon`, sizes, `keywords`, the lazy `component`, and an
  optional `dataSchema`. Keep it light: it is loaded with the registry, so never import a
  heavy library here (the component is the lazy part).
- `<Name>Widget.tsx`: the component, always `({ instanceId, mode }: WidgetProps)`.
- Pure logic in its own `.ts` files, each with a `.test.ts`.

Every definition is listed once in `src/widgets/registry.ts`. The grid, the sidebar and the
command palette all read from it.

## 2. Three kinds of widget data

| Kind        | Hook             | Stored in             | Survives reload | Cleared by "Clear state" | In a share link                  |
| ----------- | ---------------- | --------------------- | --------------- | ------------------------ | -------------------------------- |
| Layout      | none (grid)      | instance `x/y/w/h`    | yes             | no                       | when "Include layout" is on      |
| Widget data | `useWidgetData`  | instance `data`       | yes             | no                       | when "Include widget data" is on |
| State       | `useWidgetState` | `useWidgetStateStore` | no              | yes                      | never                            |

Both hooks have the same signature as `useState` plus `(instanceId, field)`, so moving a field
from state to widget data is a one-word change.

### When is something widget data?

Only when both are true:

1. **It is tedious to set up again.** The user would really want a dashboard to open with it
   already in place.
2. **The widget is then used passively.** It is looked at, or reused as is, rather than
   re-entered each time.

Reference examples:

- **World Clock** `selectedIds`: picking a team's cities one by one is slow, and the clock is
  then just glanced at.
- **Watermark** `text`, `opacity`, `color`, `fontSize`, `position`: a brand or
  confidentiality stamp reused on every file. The file itself stays state.
- **Timer** `cdHours`, `cdMinutes`, `cdSeconds`: the countdown preset (standup, pomodoro).
  The running countdown and the stopwatch stay state.
- **To-Do List** `remember`, `savedItems`: an opt-in exception for user input. Items are
  state until the user ticks "Remember tasks", which moves them into widget data (and
  unticking moves them back and drops the widget data).

Not widget data: anything quick to pick again (UUID version, hash algorithm, code-snippet
language or theme, duplicate-remover options), user input and results (text, files, tokens),
and view toggles (tabs, split ratio, map or timeline, encode or decode direction). When in
doubt, keep it state.

## 3. Instance lifecycle

| Event                                      | Layout                | Widget data                                 | State                       |
| ------------------------------------------ | --------------------- | ------------------------------------------- | --------------------------- |
| Add widget                                 | new instance          | empty, widget defaults                      | empty                       |
| Reload                                     | kept                  | kept                                        | lost                        |
| Expand to overlay                          | same instance         | same (shared by instanceId)                 | same (shared by instanceId) |
| Ephemeral overlay (opened, not pinned)     | none                  | held in `useWidgetStateStore`               | in memory                   |
| Pin an ephemeral overlay                   | new instance, same id | copied into `data` (`pinInstance`)          | kept                        |
| Duplicate                                  | new instance below    | copied                                      | copied                      |
| "Clear state"                              | kept                  | kept                                        | cleared, widget remounts    |
| Reset data (title bar icon)                | kept                  | removed, widget falls back to defaults      | kept                        |
| Settings > Reset widget data               | kept                  | removed on every instance                   | kept                        |
| Remove widget / dashboard, Clean dashboard | removed               | removed with the instance                   | cleared                     |
| Accept a share link                        | replaced              | whatever the link carried, after validation | untouched                   |

## 4. Dirty tracking

`useWidgetDirty(instanceId, isDirty)` means "this widget holds content that would be lost". It
drives the border pulse and dot (`WidgetShell.tsx`), enables "Clear state" (`AppHeader.tsx`),
and the leave-page warning (`useUnsavedChangesGuard.ts`).

Widget data is persisted, so it never counts as dirty: leave its fields out of the
`isDirty` expression. A pinned widget with saved widget data shows a separate database icon
over a ring of four emerald arcs that light up in turn in its title bar (`WidgetDataIndicator.tsx`), which also offers
"Reset data".

### Turning widget data off

Settings > Widget data has a global switch (`useWidgetDataSettings`, on by default). When it
is off, `useWidgetData` behaves like `useWidgetState` on every instance: widgets start from
their defaults, edits stay in memory, and pinning an overlay saves nothing. Saved data is kept
but paused, the title bar icon is hidden, and "Include widget data" can't be shared. A second option there stops the icon's ring animation. The same
section lists every widget holding data, shows what each one holds and can reset it.

## 5. Persistence and sharing

localStorage keys, all prefixed `localgrid.`:

- `localgrid.dashboard`: dashboards, layout and widget data (zustand `persist`, versioned
  by `DASHBOARD_STORAGE_VERSION`).
- `localgrid.settings`: everything set in the Settings dialog, one section per feature
  (`theme`, `flow`, `widgetData`). Each owner validates its section on read
  (`src/settings/settingsStorage.ts`). A theme saved under the old `localgrid.theme` key is
  moved in on first load.
- `localgrid.flow`: links between widgets.
- `localgrid.sidebar-collapsed`: whether the sidebar is collapsed.

Settings > General lists them with their size and can erase them.

A share link puts a compact JSON payload, LZ-compressed, in the URL fragment
(`#layout=...`), so it never reaches a server. Wire format (`src/dashboard/layoutCodec.ts`):

```text
{ v: 1, a: activeDashboardId,
  d: [{ id, n: name, ws: [{ wid: widgetId, x, y, w, h, c?: data }],
        l?: [[fromIndex, toIndex, input]] }] }
```

`c` is only written when the user turns on "Include widget data". `l` (links,
indexes into `ws` since instance ids don't travel) only with "Include flow". Settings > Share
previews the exact `toWire` output before the user copies the link.

Validation boundary: the decoder (`decodeWorkspace` then `finalizeWorkspace`) drops unknown
widgets and runs `sanitizeWidgetData` on every widget data object, which keeps only fields that match the
widget's `dataSchema`. `useWidgetData` also checks each field on read, so a stored value
from an older version that no longer matches falls back to the widget's default.

Compatibility rules:

- Never rename a widget `id` or a widget data field name: both are stored and shared.
- Changing a field's shape is allowed. Old values fail the schema and fall back to the default.
- New wire keys must be optional so older links keep decoding.

## 6. Adding widget data to a widget

1. Check the rule in section 2. Most widgets should not have widget data.
2. Add `dataSchema: v.object({ ... })` to `definition.ts`, one entry per field. Match the
   constraints the UI actually enforces (a schema stricter than the UI silently resets user
   values).
3. Swap `useWidgetState` for `useWidgetData` on those fields only.
4. Remove those fields from the widget's `useWidgetDirty` expression.
5. Test that the value lands on the pinned instance and survives a remount after
   `resetInstances` (see `WorldClockWidget.test.tsx`), and that bad values are stripped
   (`widgetData.test.ts`).

## 7. Flow

Widgets can be wired together on the dashboard grid: one widget's output feeds another
widget's input. A widget opts in declaratively; the framework (`src/flow/`) owns the
wiring, drag and drop, routing, loop prevention and every flow visual. How it works and
the rules it follows: [flow.md](flow.md).

1. Declare the inputs and output in `definition.ts`:

   ```ts
   flow: {
     inputs: [
       { field: 'original', label: 'Original' },
       { field: 'changed', label: 'Changed' },
     ],
     output: { label: 'Result' }, // omit for a widget that only receives
   }
   ```

   Each input `field` is an existing `useWidgetState` field. Incoming values are written
   straight into it, so the widget code reading it does not change. The field must render
   its state (a controlled input): a value written from outside has to show up.
   Never rename a declared `field`, saved links refer to it.

2. If there is an output, publish it with one line: `useWidgetOutput(instanceId, output)`.

3. Optionally wrap the matching UI in `<InputSlot input="original">` and `<OutputSlot>`
   (`@/flow/FlowSlots`). Slots show the source of a connected input, the drop
   zone while a wire is dragged, and an outline while a wire is hovered. Without children,
   a slot marks a region over part of another element (see `TextDiffWidget`). Without
   slots, the widget still connects through its header IN tab.

4. Run `src/flow/flowWidgets.test.tsx`. It covers every widget declaring
   `flow`: a value wired into each visible input must show up in its field, and a
   declared output must be published. Nothing to add per widget.

Values are strings. Links live in `localgrid.flow`, at most one per input, and a link
that would close a loop is refused. They travel in a share link only with "Include
flow", and are checked against the declared inputs on the way in. Settings >
Flow can turn the feature off (links are kept but paused), change the conveyor colors
and animation, or remove every link.
