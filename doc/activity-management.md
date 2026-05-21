# Activity Management

emiTMachine exposes recorded work activities as editable `time_sessions`.

## Current Behavior

Activity editing is enabled by default for the authenticated owner of the session.

Users can:

- insert a manual activity from the `Activities` panel;
- view their latest recorded sessions in the `Activities` panel;
- edit start time, end time, timezones, tags, note, and correction reason;
- set a `No count` duration in hours and minutes when creating or editing an activity;
- delete a session permanently.

Critical actions are intentionally guarded in the UI. Clock-in and clock-out require a slide-to-confirm gesture after the user opens the confirmation dialog. Manual inserts, edits, deletes, administrative decisions, profile/security changes, imports, and other state-changing dashboard actions ask for explicit confirmation before the API call is sent.

Default tags:

- `Presence` is a protected default tag and is the initial selection for new manual or punch-in activities.
- `Smart working` is a protected default tag, but it is mutually exclusive with `Presence`.
- `Not billable` is a protected default tag and can be combined with either work mode.
- User-created tags can be deleted from the Tags panel. Protected default tags cannot be deleted. When deleting a custom tag, the user can either keep associated activities by removing only the tag link, or explicitly confirm deletion of all activities associated with that tag.

The backend rejects sessions that contain both `Presence` and `Smart working`, including manual activities, punch-in requests, and CSV imports.

Backend endpoints:

- `GET /api/reports/sessions`
- `POST /api/reports/sessions`
- `PATCH /api/reports/sessions/:id`
- `DELETE /api/reports/sessions/:id`
- `DELETE /api/tags/:id?deleteSessions=true|false`

Manual inserts create `time_sessions`, `session_tags`, and related `clock_in` / `clock_out` events. Updates keep those records aligned. Manual inserts and edits use `source = 'manual_edit'`; updates write event revisions to `time_event_revisions` when existing events are changed.

`time_sessions.no_count_minutes` stores minutes excluded from effective totals. Report, tag, admin, and overtime/time-bank calculations subtract this value from the raw interval duration and never return a negative duration.

Deletes currently remove the session physically. Because `time_events` and `session_tags` reference `time_sessions` with `ON DELETE CASCADE`, deleting a session also deletes its events and tag links.

## Future Admin-Controlled Permission

The database already has `users.role`, and authentication already loads `req.user.role`.

The next step should be a granular permission that allows an admin to enable activity editing per user. Suggested shape:

```sql
ALTER TABLE users
  ADD COLUMN can_edit_activities boolean NOT NULL DEFAULT false;
```

Then replace the current default allow check in `backend/src/routes/reports.ts` with a policy such as:

```ts
function assertActivityEditEnabled(actor, targetUser) {
  if (actor.id === targetUser.id && targetUser.can_edit_activities) return;
  if (actor.role === "admin") return;
  throw new HttpError(403, "Activity editing is not enabled for this user");
}
```

For admin edits on another user's data, keep these rules:

- `user_id` is the owner of the activity;
- `created_by_user_id` / revision actor fields identify the admin making the change;
- update/delete endpoints should accept an explicit target user only on admin-scoped routes;
- user-owned routes should continue to filter by `req.user.id`.

Recommended future endpoints:

- `GET /api/admin/users/:userId/reports/sessions`
- `PATCH /api/admin/users/:userId/reports/sessions/:id`
- `DELETE /api/admin/users/:userId/reports/sessions/:id`

Prefer soft-delete or cancellation before production admin rollout if audit retention is required.
