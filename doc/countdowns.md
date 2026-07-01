# Countdowns

Countdowns are user-owned timers stored in the `countdowns` table.

## Current Behavior

Users can manage countdowns from the dashboard:

- create a countdown with a title and target date/time;
- optionally link it to the currently open work session;
- mark it as completed;
- remove it, which marks it as `cancelled`.
- allow browser notifications when the web app opens to receive countdown expiry alerts.

Backend endpoints:

- `GET /api/countdowns`
- `POST /api/countdowns`
- `PATCH /api/countdowns/:id`
- `DELETE /api/countdowns/:id`

The frontend reloads the dashboard after countdown changes, so active countdowns are refreshed together with reports and the current punch state.

## PWA Notifications

When the authenticated web app opens, emiTMachine asks the browser for notification permission if the permission is still undecided. Users do not need to open the Countdowns tab or press a dedicated notification button.

When permission is granted, the authenticated frontend watches active countdowns once per second while the PWA is open. When a countdown reaches `target_at`, the frontend sends a notification through the registered service worker. Tapping the notification focuses the existing emiTMachine window when possible and opens the Countdowns tab.

The notification is tagged with the countdown id, so the same countdown is not repeatedly displayed by the browser. Countdowns that are already overdue when the page first loads are seeded as already seen to avoid noisy alerts after login or refresh.

These are local web notifications, not push notifications. They do not require backend changes or a push subscription, but they also cannot wake a fully closed browser in a guaranteed way. Android and desktop browsers may pause timers when the PWA is backgrounded for a long time.

Some browsers may delay or suppress automatic permission prompts unless the page was opened from a user gesture. If the user blocks notifications, they must re-enable them from the browser or Android app settings.

## Notes

Only active countdowns are returned to the dashboard. Completed and cancelled countdowns remain stored for future audit/history views.

`target_at` is the canonical timestamp used by the UI. `target_time` and `target_timezone` preserve the local target context.
