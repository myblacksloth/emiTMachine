# Countdowns

Countdowns are user-owned timers stored in the `countdowns` table.

## Current Behavior

Users can manage countdowns from the dashboard:

- create a countdown with a title and target date/time;
- optionally link it to the currently open work session;
- mark it as completed;
- remove it, which marks it as `cancelled`.

Backend endpoints:

- `GET /api/countdowns`
- `POST /api/countdowns`
- `PATCH /api/countdowns/:id`
- `DELETE /api/countdowns/:id`

The frontend reloads the dashboard after countdown changes, so active countdowns are refreshed together with reports and the current punch state.

## Notes

Only active countdowns are returned to the dashboard. Completed and cancelled countdowns remain stored for future audit/history views.

`target_at` is the canonical timestamp used by the UI. `target_time` and `target_timezone` preserve the local target context.
