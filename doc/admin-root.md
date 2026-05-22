# Root And Admin Management

emiTMachine supports three roles:

- `root`
- `admin`
- `user`

Role hierarchy is `root > admin > user`.

## Root User

Fresh database initialization creates a root account:

```text
username: root
password: goodlife
```

The root password can be changed from the profile area after signing in.

Important: `backend/db/init.sql` runs only when the PostgreSQL volume is empty. Existing installations need a migration or a recreated local volume to receive the root seed and schema changes.

## Admin Approval

Users can request an admin account during registration.

Admin registrations are created with:

```text
role = admin
admin_approved = false
```

Pending admins cannot sign in with password or passkey until root approves them from the Admin dashboard.

## Admin Dashboard

Admins and root users see an `Admin` tab in the main workspace.

Admins/root can:

- list all users;
- update the application-level User ID for users they are allowed to manage;
- update name and email for users they are allowed to manage;
- assign users to approved admin responsibles according to the responsibility rules;
- review administrative requests for users they are responsible for;
- inspect a selected user's session summary;
- inspect a selected user's sessions;
- reset credentials for users they are allowed to manage;
- delete users they are allowed to manage;
- enable or disable session editing for individual users.

Root can additionally:

- approve pending admin registrations;
- lock or reopen new user registration;
- download a JSON application dump;
- clean administrative requests that ended before the current month.

## Responsibles

Users can have one or more responsible admins. A responsible can only be an approved `admin` user, not a standard user or root.

Responsible assignments form a hierarchy. The hierarchy can include admins under other admins, for example:

```text
root
├─ admin1
│  ├─ user1
│  ├─ user2
│  └─ user3
├─ admin2
│  └─ admin3
│     ├─ user4
│     └─ user5
└─ admin4
```

The `root` user is not stored in `user_managers`; root is implicitly above every user and can always manage every administrative request.

Top-level admins are approved admin users with no assigned responsible admin above them. Top-level admins can review their own administrative requests because root has delegated them as first-level administrators. In the example above, `admin1`, `admin2`, and `admin4` can self-review their own administrative requests.

Nested admins are admin users assigned to another admin. Nested admins cannot review their own administrative requests. Their own requests must be reviewed by one of their responsible admins above them in the hierarchy. In the example above, `admin3` cannot approve or revoke `admin3` requests; `admin2` or root must review them.

Review permission is recursive. An admin can review administrative requests for every direct and indirect descendant in their responsibility subtree:

- `admin1` can review `user1`, `user2`, and `user3`;
- `admin2` can review `admin3`, `user4`, and `user5`;
- `admin3` can review `user4` and `user5`;
- root can review everyone.

Deeper hierarchies follow the same rule:

```text
root
└─ admin1
   └─ admin2
      └─ admin3
         ├─ user1
         ├─ user2
         └─ user3
```

In that hierarchy, `admin1` can review `admin2`, `admin3`, `user1`, `user2`, and `user3`; `admin2` can review `admin3`, `user1`, `user2`, and `user3`; `admin3` can review `user1`, `user2`, and `user3`.

Root can assign or remove any user/responsible association. Admins can assign or remove responsible associations only for users already inside their direct or indirect managed subtree. The backend rejects cycles, so an assignment cannot make an admin responsible for one of their own ancestors.

Users see their assigned responsibles from their profile area when at least one responsible is configured.

## Administrative Request Review Hierarchy

Administrative request review uses the responsible hierarchy described above.

The `/api/administrative-requests/review` endpoint returns:

- every request for root;
- every direct and indirect descendant request for admins;
- the admin's own requests only when that admin has no assigned responsible admin.

The `PATCH /api/administrative-requests/:id/status` endpoint applies the same permission check before approving or revoking a request. Deleted requests cannot be reviewed again.

## API

Admin/root endpoints:

```text
GET    /api/admin/users
PATCH  /api/admin/users/:id/public-id
PATCH  /api/admin/users/:id/profile
PATCH  /api/admin/users/:id/edit-permission
GET    /api/admin/manager-assignments
POST   /api/admin/users/:managerId/managed-users
DELETE /api/admin/users/:managerId/managed-users/:userId
POST   /api/admin/users/:id/reset-password
DELETE /api/admin/users/:id
GET    /api/admin/users/:id/summary
GET    /api/admin/users/:id/sessions
GET    /api/admin/users/:id/export
POST   /api/admin/users/:id/import
GET    /api/profile/managers
GET    /api/administrative-requests
POST   /api/administrative-requests
DELETE /api/administrative-requests/:id
GET    /api/administrative-requests/review
PATCH  /api/administrative-requests/:id/status
```

Root-only endpoints:

```text
POST   /api/admin/users/:id/approve-admin
GET    /api/admin/settings/registration
PATCH  /api/admin/settings/registration
DELETE /api/admin/administrative-requests/cleanup
GET    /api/admin/dump
GET    /api/admin/dump/users.csv
```

## Registration Lock

Root can set `system_settings.registration_enabled` to `false`.

When registration is locked, `POST /api/auth/register` returns `403`.

## Session Editing Permission

The `users.can_edit_sessions` flag controls whether standard users can manually create, modify, or delete their own sessions.

Admins and root users always keep correction access.

## Dump And Restore

Root can download an application-level JSON dump from:

```text
GET /api/admin/dump
```

The JSON dump includes the current operational tables, including users, responsible assignments, administrative requests, tags, work sessions, session tags, time events, countdowns, overtime payments, recovery code metadata, and passkeys.

Full application restore is intentionally not implemented in the web UI yet. A safe restore flow should include:

- upload validation;
- preview of affected rows;
- transaction-level restore;
- audit log entry;
- active session revocation;
- clear rollback instructions.

Admins and root can export and reimport data for a single selected user from the Admin dashboard:

```text
GET  /api/admin/users/:id/export
POST /api/admin/users/:id/import
```

Root can export/import any non-root account. Admins can export/import standard user accounts only.

The per-user JSON export includes the selected user's operational data: tags, work sessions, session tags, time events, countdowns, overtime payment statuses, and administrative requests. It does not include passwords, passkeys, login sessions, recovery codes, or other credentials.

The per-user import is a replacement restore. After explicit confirmation in the UI, the backend runs a transaction that removes the selected user's current operational data and imports the JSON data into that same user account. Imported records are reassigned to the selected user, so the import does not create or replace the user account itself.

Until that is implemented, restore should be handled as a controlled PostgreSQL operation by an operator.

## Administrative Request Cleanup

Root can remove old administrative requests from the Admin dashboard after an explicit browser confirmation.

The cleanup endpoint deletes only requests whose `ended_at` timestamp is before the first day of the current month:

```text
DELETE /api/admin/administrative-requests/cleanup
```

Requests that overlap or belong to the current month are kept.
