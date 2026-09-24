# JS-Portable-Queue

A portable, browser-based queue management application built with JavaScript. It provides queue issuing, counter calling, authentication, administration, public display, and audit logging for local queueing operations.

This project currently uses browser `localStorage` and browser storage events, making it usable on a local machine or through a live server. It is also designed as a template for future migration into a LAN-based queueing appliance using Node.js, SQLite, and Socket.IO.

> **Important:** The current version stores its application data in the browser's `localStorage`. This means that data is tied to the browser profile and device, even when the application is accessed through port forwarding. **Port forwarding does not make browser `localStorage` shared between users or devices.**
> **What changed from the original:** everything under "Migration Objective" in the original README has been implemented to [JS-Portable-Queue-LAN](https://github.com/paoradox/JS-Portable-Queue-LAN).

## Features

- User login and authentication.
- User creation and password reset.
- Counter assignment.
- Queue number issuing.
- Queue number calling.
- Regular, PWD, and escalation queue pools.
- Public display board.
- Current queue and counter status.
- Recent queue activity.
- Audit logging.
- Administrative queue reset.
- Live updates through browser storage events.
- Audio notifications for queue calls.
- Portable frontend that can run through a local live server.
- Designed for future LAN and desktop deployment.

## Queue Pools

The application currently supports the following queue pools:

| Queue Pool | Prefix |
| --- | --- |
| Regular Queue | Numeric |
| PWD Queue | `P` |
| Escalation Queue | `E` |

Queue numbering behavior should remain consistent during future migrations.

## Counters

The supported counters are:

- `C1`
- `C2`
- `C3`
- `C4`
- `C5`
- `C6`
- `PWD`
- `ESCAL`

## Application Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Main display |
| `encoder.html` | Set-up login on first launch, queue encoder and queue issuing screen |
| `admin.html` | Set-up login on first launch, administrative controls, users, counters, and queue management |

When running the project through a VS Code Live Server or another local web server, open the appropriate page according to the role of the user.

For example:

```text
http://127.0.0.1:5500/index.html
http://127.0.0.1:5500/encoder.html
http://127.0.0.1:5500/admin.html
```

The exact port may be different depending on the live server or equivalent development server being used.

## Running the Application

### Using VS Code Live Server

1. Clone or download this repository.
2. Open the project folder in Visual Studio Code.
3. Install the Live Server extension if it is not already installed.
4. Start Live Server from the project directory.
5. Open `index.html` through the generated local server URL.
6. Open `encoder.html` for queue issuing and counter operations.
7. Open `admin.html` for administrative operations.
8. Open the display page or supported public display interface for queue announcements and queue status.

Each browser tab or device should use the same application origin when shared browser storage is required.

### Using Another Local Server

The project may also be served using any equivalent static web server. The server must serve the project files over HTTP instead of opening the HTML files directly with the `file://` protocol.

Example:

```bash
python -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/index.html
```

## Current Storage Architecture

The current implementation uses browser `localStorage` keys:

```text
jsq.queue
jsq.users
jsq.session
jsq.log
jsq.loginAttempts
```

The current synchronization mechanism uses:

```text
localStorage
window.storage events
JSQ_Queue.onChange()
```

This architecture is suitable for a local browser-based prototype, but it does not provide centralized storage across separate devices. Browser storage remains local to the browser profile where the application is running.

## Current Modules

The main JavaScript modules include:

| Module | Responsibility |
| --- | --- |
| `auth.js` | Authentication, users, sessions, passwords, and login attempts |
| `queue.js` | Queue pools, counters, queue actions, numbering, and queue state |
| `admin.js` | Administrative controls and management operations |
| `display.js` | Public display board and live queue rendering |
| `ui.js` | Shared interface behavior and user interface helpers |

The frontend should preserve the current queueing, counter, display, authentication, audit log, and user-management behavior during future refactoring.

## Migration Objective

The long-term objective is to convert this application into a LAN-based queueing appliance.

The frontend should continue functioning almost exactly as it does today. The primary change should be replacing the persistence and synchronization layer.

### Current Persistence Layer

```text
Browser localStorage
+
window.storage events
+
JSQ_Queue.onChange()
```

### Target Persistence Layer

```text
Node.js API
+
SQLite
+
Socket.IO
```

The migration should not remove or change the existing queueing behavior. It should replace how data is stored and synchronized.

## Target Architecture

```text
JS-Portable-Queue
├─ frontend/
│  ├─ existing HTML files
│  ├─ existing CSS files
│  └─ existing JS files
│
├─ server/
│  ├─ Express
│  ├─ Socket.IO
│  ├─ SQLite
│  └─ REST API
│
├─ electron/
│  └─ desktop wrapper
│
└─ database/
   └─ queue.db
```

## Refactoring Strategy

The frontend should not directly call `localStorage` after migration.

Instead, create service functions that abstract persistence:

```javascript
getQueueState()
saveQueueState()
getUsers()
saveUsers()
getLogs()
appendLog()
getSession()
saveSession()
```

Existing modules should call these service functions rather than accessing a storage implementation directly. This allows the backend implementation to change later without modifying the application's business logic.

## Authentication Migration

Authentication data should be moved from browser storage into SQLite.

The migrated authentication system should include:

- Users.
- Sessions.
- Login attempts.
- Password changes.
- Logout operations.
- Password reset operations.

Passwords must never be stored as plaintext. The target backend should use `bcrypt` or an equivalent secure password-hashing implementation.

Suggested REST endpoints:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
POST /api/auth/change-password
```

The API should return structures compatible with the existing frontend wherever possible.

## Queue API

The target backend should provide queue endpoints such as:

```text
GET  /api/queue/state
POST /api/queue/issue
POST /api/queue/call
POST /api/queue/update
POST /api/queue/reset
GET  /api/queue/logs
```

The queue API must preserve:

- Existing queue behavior.
- Existing counter behavior.
- Existing numbering behavior.
- Regular queue numbering.
- PWD numbering with the `P` prefix.
- Escalation numbering with the `E` prefix.
- Counter mapping for `C1` through `C6`, `PWD`, and `ESCAL`.
- Audit log behavior.
- Administrative reset behavior.

## Real-Time Updates

The current implementation relies on browser storage events and `JSQ_Queue.onChange()`.

The target implementation should use Socket.IO:

```text
Server emits:
queueUpdated

Frontend receives:
queueUpdated
```

When queue data changes:

- Connected clients should receive the update immediately.
- Existing rendering functions should refresh.
- The public display board should update without a page refresh.
- No polling should be required.
- No browser reload should be required.
- Audio notification behavior should remain available.

The display board should automatically execute its rendering logic when a queue update is received:

```javascript
renderBoard()
```

## Display Board

The display board should retain the existing rendering behavior while replacing browser storage subscriptions with Socket.IO subscriptions.

It should continue to show:

- Current queue number.
- Assigned counter.
- Recent activity.
- Queue pool information.
- Announcements, if implemented.
- Audio notifications for newly called queue numbers.

The display board must update immediately for all connected clients on the local network.

## Database Design

The target application should use SQLite and automatically create its database on first launch.

Suggested tables:

```text
users
sessions
queue_pools
queue_counters
queue_logs
settings
login_attempts
```

The database should persist:

- Queue data.
- User accounts.
- Sessions.
- Audit logs.
- Login attempts.
- Counter assignments.
- Application settings.

## Electron Wrapper

A future Electron wrapper may package the application as a portable desktop application:

```text
Portable Queue.exe
```

When launched, the desktop application should:

1. Start the Express server.
2. Start the Socket.IO service.
3. Open the local application window.
4. Detect the host computer's LAN IP address.
5. Display the connection URL.
6. Provide shortcuts to the display screen and admin panel.

Example:

```text
Queue Server Running

Access from other devices:
http://192.168.1.100:3000
```

The wrapper should provide controls such as:

- Copy URL.
- Open Display Screen.
- Open Admin Panel.

## Network Requirements

The target LAN-based application should operate entirely on a local network.

Required environment:

- One running host computer.
- The same Wi-Fi network or Ethernet network.
- A local server running on the host computer.

The application should not require:

- Internet access.
- Cloud services.
- Firebase.
- Supabase.
- AWS.
- Azure.
- Port forwarding.
- Router configuration.

Other devices should connect using the host computer's local network address.

## Data Persistence

After migration, application data should survive:

- Browser restarts.
- Application restarts.
- Host computer reboots.
- Client device reconnections.

The following data should be stored in SQLite:

- Queue state.
- User accounts.
- Password hashes.
- Sessions.
- Audit logs.
- Login attempts.
- Counter assignments.
- Application settings.

Browser `localStorage` should not contain critical application data after migration. It may only be used for non-critical interface preferences.

## Project Direction

This project is intended to serve as a maintainable queueing template that can evolve from a browser-based localStorage application into a portable LAN-based queueing appliance.

The most important migration rule is:

> Replace persistence and synchronization without changing the existing queueing experience.

The following behaviors must remain intact:

- Authentication.
- User management.
- Password handling.
- Queue issuing.
- Queue calling.
- Counter assignment.
- Queue numbering.
- Public display updates.
- Audio notifications.
- Audit logs.
- Administrative resets.
- Existing queue pools and counter mappings.

## License

Apache License 2.0
