/** localStorage key the dashboard's zustand store persists under. Shared
 * with the share/URL flow, which reads/writes the same store.
 *
 * Version 2 moved from a single flat widget list to multiple named
 * dashboards. Version 3 renamed each instance's `config` to `data`. See
 * `migrateDashboardState`, which upgrades older stored values in place. */
export const DASHBOARD_STORAGE_KEY = 'localgrid.dashboard'
export const DASHBOARD_STORAGE_VERSION = 3
