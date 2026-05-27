# Task Management

## Description

Overhaul the settings modal layout, build out the Tasks tab with live task monitoring and controls, add a stub Previews tab, wire up a task system on the backend with cancellation and progress tracking, and improve the Scan task with two-phase progress reporting.

---

## Settings Modal Layout

- Fixed height: `90vh`. Does **not** change size when switching tabs.
- Remove the Dialog title row ("Settings" heading + its container). Keep only the close X button, absolutely positioned at the top-right corner of the modal.
- Clicking outside the modal does **not** close it. Escape key still closes it.
- Each tab's content may render its own close button if desired (e.g. in a footer).
- Reduce vertical padding throughout (fieldsets, inputs, tab panels) — recover space lost by removing the header.

---

## New Tabs

Add two new tabs to the Settings modal:

1. **Tasks** — described in detail below.
2. **Previews** — stub only; display the text: _"Coming soon. Trigger preview generation tasks here."_

Tab order: Presets | Tasks | Previews

---

## Tasks Tab

### Trigger Buttons

Two buttons at the top: **Run Scan** and **Run Clean**.

- Each calls its respective `POST /api/tasks/scan` or `POST /api/tasks/clean`.
- If a `409 Conflict` is returned (task type already active or queued), show a brief inline message (e.g. "Scan already queued").
- Both buttons remain enabled regardless of task state — the backend enforces the duplicate rule.

### Active Task Section

Header: **Active Task**

When no task is active, show: _"No active task"_

When a task is active, show:
- Task type (e.g. "Scan", "Clean")
- Elapsed time in seconds (e.g. "12s"), computed client-side from `startedAt`
- Status string (e.g. `"150/200"` for Scan, `"3 purged"` for Clean)
- **Cancel** button — disabled when `cancelling: true`; while `cancelling` is true, show a `"cancelling…"` status string in place of the normal status

### Queue Section

Header: **Queue**

When queue is empty, show: _"Queue empty"_

When tasks are queued, render a list. Each item shows:
- Task type
- Time enqueued (derived from `enqueuedAt`)
- **Cancel** button

### Recent Tasks Section

Header: **Recent Tasks**

When no recent tasks exist, show: _"No recent tasks"_

Shows up to 5 tasks that finished (completed / cancelled / failed) within the last 2 minutes. Each item shows:
- Task type
- Outcome badge: completed / cancelled / failed
- Short message (e.g. `"scanned 5 files"`, `"removed 3 files"`, `"cancelled after 2 purged"`, `"failed after 10 files"`)
- `finishedAt` timestamp (relative, e.g. "30s ago")

### Polling

The Tasks tab polls `GET /api/tasks` every 1 second while the tab is visible. Stop polling when the modal closes or the tab changes away.

---

## API

### `GET /api/tasks`

Returns the current task system state in one response:

```ts
{
  active: {
    id: number,
    type: "scan" | "clean",
    status: string,       // live progress string
    startedAt: number,    // Unix ms
    cancelling: boolean
  } | null,
  queue: Array<{
    id: number,
    type: "scan" | "clean",
    enqueuedAt: number    // Unix ms
  }>,
  recent: Array<{
    id: number,
    type: "scan" | "clean",
    outcome: "completed" | "cancelled" | "failed",
    message: string,
    finishedAt: number    // Unix ms
  }>
}
```

### `POST /api/tasks/scan`

Enqueues or starts a Scan task.
- Returns `202 Accepted` with `{ id: number }` on success.
- Returns `409 Conflict` if a Scan is already active or queued.

### `POST /api/tasks/clean`

Enqueues or starts a Clean task.
- Returns `202 Accepted` with `{ id: number }` on success.
- Returns `409 Conflict` if a Clean is already active or queued.

### `POST /api/tasks/:id/cancel`

Cancels a task by ID — works whether the task is queued or active.
- Returns `200` with `{ ok: true }` if the task was found and cancelled/cancelling.
- Returns `404` if no task with that ID exists in active or queue.

---

## Backend — Task System

### Task IDs

A module-level incrementing integer counter assigns a unique ID to each task at creation time. IDs are stable — a queued task keeps its ID when promoted to active.

### In-Memory State

```
activeTask: ActiveTask | null
taskQueue: QueuedTask[]
recentTasks: RecentTask[]   // capped at 5, pruned to last 2 minutes on each write
```

### Task Runner

When `activeTask` is null and `taskQueue` is non-empty, dequeue the next task and start it via `Effect.forkDaemon`. Store the resulting `Fiber` reference alongside the active task record (not exposed via API).

On task completion (any outcome), move the task to `recentTasks`, prune entries older than 2 minutes, cap at 5, then attempt to dequeue the next task.

### Cancellation

`POST /api/tasks/:id/cancel`:
1. If the ID matches a queued task: remove it from the queue; add to `recentTasks` with outcome `"cancelled"` and an appropriate message.
2. If the ID matches the active task: set `cancelling: true` on the active task record, then call `Fiber.interrupt` on the stored fiber. The fiber's interruption handler is responsible for writing the final recent-task entry.

### Duplicate Prevention

For `POST /api/tasks/scan` and `POST /api/tasks/clean`: return `409` if any task of the same type exists in `activeTask` or `taskQueue`.

---

## Scan Task — Two-Phase Progress

### Phase 1 — Filesystem Walk

Walk the `/media` directory and collect all media file paths (same extensions as current). Set initial status to `"0/<total>"` where `<total>` is the count of discovered files. This phase is fast and happens before any ffprobe/image-size calls.

### Phase 2 — Process

For each file, attempt to extract metadata and insert into DB (INSERT OR IGNORE). After each file, increment the processed count and update status to `"<processed>/<total>"`.

### Completion Messages

- **Completed:** `"scanned <n> files"` where `n` = count of rows actually inserted (new files only, not skipped duplicates).
- **Cancelled:** `"cancelled after <n> files"` where `n` = files processed before interruption.
- **Failed:** `"failed after <n> files"` where `n` = files processed before failure.

---

## Clean Task — Progress & Messages

### Status String

While running: `"<n> purged"` where `n` is the count of DB records deleted so far.

### Completion Messages

- **Completed:** `"removed <n> files"` where `n` = total records deleted.
- **Cancelled:** `"cancelled after <n> purged"`.
- **Failed:** `"failed after <n> purged"`.

---

## Shared Types (`@repo/types`)

Add Effect Schemas for the `GET /api/tasks` response shape: `ActiveTask`, `QueuedTask`, `RecentTask`, and the top-level `TasksResponse`.

---

## Out of Scope

- Thumbnail-gen and Highlight-gen task triggers (Previews tab is a stub)
- Task persistence across server restarts
- Reordering the queue
- Duplicate-blocking for Thumbnail-gen / Highlight-gen (future concern)
- WebSocket / SSE push (polling is sufficient)
