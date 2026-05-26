# Time Tools

The **Tools** tab in the main workspace provides a set of client-side time calculators. All calculations run in the browser; no data is sent to the server.

## Available Tools

### Elapsed Time

Calculates how many hours and minutes have passed between two times of day.

- **From** — the earlier time (HH:MM).
- **To** — the later time (HH:MM).

If **To** is earlier than **From** the calculator assumes the interval crosses midnight and adds 24 hours to the difference.

Result is displayed as `Xh YYm`.

---

### Target Time

Adds a fixed duration (hours + minutes) to a start time and shows the resulting clock time.

- **Start** — the base time (HH:MM).
- **+** hours and minutes to add.

If the result crosses midnight the display shows the target time plus a day offset, e.g. `06:30 (+1g)`.

---

### Shift End

Given a shift start time, work duration in hours, and break duration in minutes, calculates the expected end time of the shift and how much time remains until that moment.

- **Start** — when the shift begins (HH:MM).
- **Work** — total work hours (decimals accepted, e.g. `7.5`).
- **Break** — break minutes to add on top of work time.

The remaining-time counter updates every second while the page is open.

---

### Live Countdown

Shows a real-time countdown (hours, minutes, seconds) to any clock time today.

- **Target** — the time to count down to (HH:MM).

The counter updates every second. When the target time is reached the display shows `Adesso!`.

---

### Time Sum

Sums (or subtracts) an arbitrary list of durations and shows the total.

- Start with two duration rows; each row has an **hours** field and a **minutes** field.
- Click **Add** to insert additional rows (no upper limit).
- Rows after the first have a sign toggle button (**+** / **−**). Click it to switch between addition and subtraction for that row. The first row is always positive.
- Click **= Calculate** to compute the result.

Modifying any field resets the displayed result so it never shows a stale value.

Result format:
- `Xh YYm` for a positive total.
- `−Xh YYm` for a negative total (when subtractions exceed additions).

Extra rows can be removed with the **×** button that appears when more than two rows are present.
