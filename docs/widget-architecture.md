# Widget architecture

How a widget is defined, where its data lives, and what happens to that data when the user
reloads, clears, duplicates or shares. Read this before adding a widget or changing how one
stores anything.

```text
useDashboardStore  (persisted: localStorage "localgrid.dashboard")
  dashboards[]
    widgets[]: DashboardWidgetInstance
      instanceId, widgetId, x, y, w, h   <- layout
      config?: { field: value }          <- configuration (useWidgetConfig)

useWidgetStateStore  (in memory only)
  values["<instanceId>:<field>"]         <- state (useWidgetState)

useWidgetDirtyStore  (in memory only)
  dirtyByInstance, resetNonceByInstance  <- "has content that would be lost"
```

## 1. Anatomy of a widget

Each widget lives in `src/widgets/<widget-id>/`:

- `definition.ts`: the registry entry (`WidgetDefinition` in `src/widgets/types.ts`): `id`,
  `name`, `description`, `category`, `icon`, sizes, `keywords`, the lazy `component`, and an
  optional `configSchema`. Keep it light: it is loaded with the registry, so never import a
  heavy library here (the component is the lazy part).
- `<Name>Widget.tsx`: the component, always `({ instanceId, mode }: WidgetProps)`.
- Pure logic in its own `.ts` files, each with a `.test.ts`.

Every definition is listed once in `src/widgets/registry.ts`. The grid, the sidebar and the
command palette all read from it.

## 2. Three kinds of widget data

| Kind          | Hook              | Stored in             | Survives reload | Cleared by "Clear state" | In a share link                           |
| ------------- | ----------------- | --------------------- | --------------- | ------------------------ | ----------------------------------------- |
| Layout        | none (grid)       | instance `x/y/w/h`    | yes             | no                       | when "Include layout" is on               |
| Configuration | `useWidgetConfig` | instance `config`     | yes             | no                       | when "Include widget configuration" is on |
| State         | `useWidgetState`  | `useWidgetStateStore` | no              | yes                      | never                                     |

Both hooks have the same signature as `useState` plus `(instanceId, field)`, so moving a field
from state to configuration is a one-word change.

### When is something configuration?

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

Not configuration: anything quick to pick again (UUID version, hash algorithm, code-snippet
language or theme, duplicate-remover options), user input and results (text, files, tokens),
and view toggles (tabs, split ratio, map or timeline, encode or decode direction). When in
doubt, keep it state.

## 3. Instance lifecycle

| Event                                      | Layout                | Configuration                               | State                       |
| ------------------------------------------ | --------------------- | ------------------------------------------- | --------------------------- |
| Add widget                                 | new instance          | empty, widget defaults                      | empty                       |
| Reload                                     | kept                  | kept                                        | lost                        |
| Expand to overlay                          | same instance         | same (shared by instanceId)                 | same (shared by instanceId) |
| Ephemeral overlay (opened, not pinned)     | none                  | held in `useWidgetStateStore`               | in memory                   |
| Pin an ephemeral overlay                   | new instance, same id | copied into `config` (`pinInstance`)        | kept                        |
| Duplicate                                  | new instance below    | copied                                      | copied                      |
| "Clear state"                              | kept                  | kept                                        | cleared, widget remounts    |
| Reset configuration (title bar icon)       | kept                  | removed, widget falls back to defaults      | kept                        |
| Settings > Reset widget configuration      | kept                  | removed on every instance                   | kept                        |
| Remove widget / dashboard, Clean dashboard | removed               | removed with the instance                   | cleared                     |
| Accept a share link                        | replaced              | whatever the link carried, after validation | untouched                   |

## 4. Dirty tracking

`useWidgetDirty(instanceId, isDirty)` means "this widget holds content that would be lost". It
drives the border pulse and dot (`WidgetShell.tsx`), enables "Clear state" (`AppHeader.tsx`),
and the leave-page warning (`useUnsavedChangesGuard.ts`).

Configuration is persisted, so it never counts as dirty: leave config fields out of the
`isDirty` expression. A pinned widget with saved configuration shows a separate bookmark icon
in its title bar (`WidgetConfigIndicator.tsx`), which also offers "Reset configuration".

## 5. Persistence and sharing

localStorage keys, all prefixed `localgrid.`:

- `localgrid.dashboard`: dashboards, layout and configuration (zustand `persist`, versioned
  by `DASHBOARD_STORAGE_VERSION`).
- `localgrid.theme`, `localgrid.sidebar-collapsed`: preferences.

Settings > General lists them with their size and can erase them.

A share link puts a compact JSON payload, LZ-compressed, in the URL fragment
(`#layout=...`), so it never reaches a server. Wire format (`src/dashboard/layoutCodec.ts`):

```text
{ v: 1, a: activeDashboardId,
  d: [{ id, n: name, ws: [{ wid: widgetId, x, y, w, h, c?: config }] }] }
```

`c` is only written when the user turns on "Include widget configuration". Settings > Share
previews the exact `toWire` output before the user copies the link.

Validation boundary: the decoder (`decodeWorkspace` then `finalizeWorkspace`) drops unknown
widgets and runs `sanitizeConfig` on every config, which keeps only fields that match the
widget's `configSchema`. `useWidgetConfig` also checks each field on read, so a stored value
from an older version that no longer matches falls back to the widget's default.

Compatibility rules:

- Never rename a widget `id` or a config field name: both are stored and shared.
- Changing a field's shape is allowed. Old values fail the schema and fall back to the default.
- New wire keys must be optional so older links keep decoding.

## 6. Adding configuration to a widget

1. Check the rule in section 2. Most widgets should not have configuration.
2. Add `configSchema: v.object({ ... })` to `definition.ts`, one entry per field. Match the
   constraints the UI actually enforces (a schema stricter than the UI silently resets user
   values).
3. Swap `useWidgetState` for `useWidgetConfig` on those fields only.
4. Remove those fields from the widget's `useWidgetDirty` expression.
5. Test that the value lands on the pinned instance and survives a remount after
   `resetInstances` (see `WorldClockWidget.test.tsx`), and that bad values are stripped
   (`widgetConfig.test.ts`).
