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
- inspect a selected user's session summary;
- inspect a selected user's sessions;
- reset credentials for users they are allowed to manage;
- delete users they are allowed to manage;
- enable or disable session editing for individual users.

Root can additionally:

- approve pending admin registrations;
- lock or reopen new user registration;
- download a JSON application dump.

## API

Admin/root endpoints:

```text
GET    /api/admin/users
PATCH  /api/admin/users/:id/public-id
PATCH  /api/admin/users/:id/profile
PATCH  /api/admin/users/:id/edit-permission
POST   /api/admin/users/:id/reset-password
DELETE /api/admin/users/:id
GET    /api/admin/users/:id/summary
GET    /api/admin/users/:id/sessions
```

Root-only endpoints:

```text
POST   /api/admin/users/:id/approve-admin
GET    /api/admin/settings/registration
PATCH  /api/admin/settings/registration
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

Full restore is intentionally not implemented in the web UI yet. A safe restore flow should include:

- upload validation;
- preview of affected rows;
- transaction-level restore;
- audit log entry;
- active session revocation;
- clear rollback instructions.

Until that is implemented, restore should be handled as a controlled PostgreSQL operation by an operator.
