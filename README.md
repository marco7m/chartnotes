# Chart Notes

Visual charts for your notes **inside Obsidian Bases**.

Chart Notes adds a new **“Chart Notes” layout** to Bases so you can turn any Base
into bar, line, pie, scatter or Gantt charts – using your existing properties
(frontmatter or inline).

---

## Features

- Works as a **layout inside Bases** – no custom query language, you keep
  using Bases filters, sorts and groups.
- Multiple chart types:
  - **Bar** and **Stacked bar**
  - **Line** and **Stacked area**
  - **Pie**
  - **Scatter**
  - **Gantt** timeline
- Uses **note properties** as:
  - X axis / category
  - Y numeric value (or automatic count)
  - Series / color (status, project, priority…)
- **Date-aware X axis** on line/stacked-area charts:
  spacing is proportional to time and can be bucketed by day/week/month/etc.
- **Drilldown**: clicking a bar/point/slice opens a list of notes.
- **Interactive Gantt**:
  - Start / End / Due / Duration taken from properties
  - “Today” vertical line
  - Due markers on each bar
  - Tooltip with dates, estimate and key fields
  - Click a bar or label to edit dates & estimate in a small modal.
- Everything respects whatever **filters, sorts and groupings**
  you configured in the Base.

---

## Requirements

- Obsidian **1.10+**
- **Bases** feature enabled (currently requires Insider / Catalyst or any
  Obsidian version that ships Bases)
- This plugin is not yet in the community listing, so installation is manual /
  via BRAT.

---

## Installation

### Via BRAT (recommended for now)

1. Install the **BRAT** plugin in Obsidian.
2. In BRAT, add this repo as a beta plugin:

```
https://github.com/marco7m/chartnotes
````

3. Let BRAT install/update it.
4. Enable **Chart Notes** in *Settings → Community plugins*.

### Manual install from source

1. Clone the repo into your vault’s plugins folder:

```bash
cd path/to/your/vault/.obsidian/plugins
git clone https://github.com/marco7m/chartnotes.git
cd chartnotes
npm install
npm run build
````

2. Restart Obsidian and enable **Chart Notes** in the plugin settings.

---

## Quick start (Bases)

1. Open or create a **Base** with the notes you want to visualize.
2. At the top right of the Base, click **+ New** and choose
   **Layout → Chart Notes**.
3. The view will appear with a **“Configure view”** panel on the left.
4. Choose a **Chart type**.
5. Fill the relevant options (X property, Y property, series, etc.).
6. The chart updates automatically as you tweak the view or Base filters.

All chart data always comes from the **current Base**:
filters, search, group by, sorts… everything is reused.

---

## Common options

These options appear (or are reused) across several chart types.

* **Chart type**
  `Bar`, `Stacked bar`, `Line`, `Stacked area`, `Pie`, `Scatter`, `Gantt`.

* **X axis / category (bars & slices)**
  Property used for the X axis or categories.
  For pie charts it defines the slices.
  For line/stacked-area charts it is usually a **date** property.

* **Task label (Gantt)**
  Label shown on the left in the Gantt timeline.
  If empty, Chart Notes falls back to the note’s file name.

* **Y value (empty = count)**
  Numeric property used as the Y value.
  If left empty, Chart Notes simply **counts notes** for each X / series.

* **Series / color (optional)**
  Property used to split data into different series and colors
  (status, project, priority, assignee…).

* **X bucket (dates)** – **line/stacked-area only**
  How to group dates on the X axis:

  * `auto`
  * `none`
  * `day`
  * `week`
  * `month`
  * `quarter`
  * `year`

  When X is a date, the horizontal spacing is **proportional to time**; this
  setting controls how values are grouped together before plotting.

* **Value aggregation (Y)** – most charts
  How multiple rows with the same X/series are combined:

  * `Sum` – sum all Y values
  * `Count (ignore Y)` – ignore Y and just count notes
  * `Cumulative sum` – line/stacked-area only; turns the series into a running total.

* **Drilldown (click opens notes)**
  When enabled, clicking a point/bar/slice opens a side list of the notes
  behind that data point.

* **Title (optional)**
  Custom title. If empty, the Bases view name is used.

---

## Chart types

### Bar & Stacked bar

Use this for simple aggregations: how many notes per status, project, tag,
month, etc.

Recommended configuration:

* **Chart type:** `Bar` or `Stacked bar`
* **X axis / category:** your grouping field (`status`, `project`, `tag`…)
* **Y value:** numeric property to sum (for example `timeEstimate`)
  or leave empty to just count notes.
* **Series / color:** optional property to split bars (for example `priority`).

`Bar` draws one bar per (X, series) pair.
`Stacked bar` stacks series on top of each other.

---

### Line & Stacked Area

For metrics that evolve over time.

* **Chart type:** `Line` or `Stacked area`
* **X axis / category:** a **date** property (created, scheduled, startDate…)
* **Y value:** the numeric metric to plot (effort, value, count…)
* **Series / color:** optional, to split the lines (required for stacked area).

Chart Notes:

* Interprets X as dates and spaces points according to **real time distance**.
* Buckets dates using the **X bucket** setting (day/week/month…).
* Aggregates Y according to **Value aggregation (Y)**:

  * `Sum`: sum values in each bucket
  * `Count (ignore Y)`: just count notes
  * `Cumulative sum`: running total over time (line/stacked-area only).

---

### Pie

For simple distributions: “how many notes each status has”, etc.

* **Chart type:** `Pie`
* **X axis / category:** property that defines each slice
* **Y value:** ignored → always counts notes per category
* **Series / color:** ignored

Each slice’s size represents the **number of notes** with that X value.

---

### Scatter

When you want to compare two numeric properties.

* **Chart type:** `Scatter`
* **X axis / category:** numeric property (for example `estimate`)
* **Y value:** another numeric property (for example `actual`)
* **Series / color:** optional – categories for coloring points.

---

## Gantt chart

This is the most opinionated part of the plugin.

### Where the data comes from

Each row of the Base becomes a **task** in the Gantt chart.
You tell Chart Notes which properties mean:

* **Task label (Gantt)** – main label for the row
* **Start (Gantt)** – start date/datetime
* **End (Gantt)** – end date/datetime
* **Due (deadline, optional)** – deadline date (drawn as a vertical marker)
* **Duration in minutes (optional)** – numeric duration estimate
* **Series / color (optional)** – used for bar color

The **grouping/lanes** come from the **Base itself**:

* Use Bases’ “Group by” to group your tasks by project, status, assignee, etc.
* Chart Notes uses that group name for the left-hand lane headings.

If the Base is **not grouped**, all tasks appear in a single lane.

### How start/end are computed

Chart Notes tries to make a reasonable bar even when some fields are missing.

Given:

* `start` = Start (Gantt) property
* `end` = End (Gantt) property
* `due` = Due property
* `duration` = Duration in minutes (optional)
* default block = 60 minutes

The logic is:

1. If **both start and end** exist → use them as is.
2. If only **start + duration** → end = start + duration.
3. If only **end + duration** → start = end − duration.
4. If you only have **start** → create a short bar (start + default block).
5. If you only have **end** → short bar ending at end.
6. If you only have **due + duration** → bar ends at due, starts at due − duration.
7. If you only have **due** → very short bar around due.

Invalid or missing dates are skipped.

### Interaction

* **Tooltip**
  Hovering a bar or label shows:

  * Task title
  * Start → End range
  * `est: … min` (from Duration) or inferred duration
  * `due: …` if available
  * Extra fields such as `status` and `priority` (from properties).

* **Today line**
  A vertical dashed line marks “today”.

* **Due marker**
  If you configured a Due property, a small dashed line is drawn at the due
  date inside each bar.

* **Editing tasks**
  Click a bar or its label to open a small modal that lets you edit:

  * Start date
  * End date
  * Duration (minutes)
  * Due date

  The plugin writes these values back to the note’s **frontmatter** and
  reindexes the note, so the chart refreshes.

---

## Tips & recipes

* For **task management**:

  * Make a Base filtered to your open tasks.
  * Group by project.
  * Add a **Gantt** view using:

    * Task label: file name
    * Start: `startDate`
    * End: `scheduled`
    * Due: `due`
    * Duration in minutes: `timeEstimate`
    * Series / color: `status`
* For **workload charts**:

  * Same Base, but use a **Stacked bar**:

    * X axis: `status` or `project`
    * Y value: `timeEstimate`
    * Series / color: `file name` or `priority`.

---

## Development

Inside the repo:

```bash
npm install

# Build once
npm run build
```

The compiled plugin lives in the repo itself; Obsidian loads it from the
`manifest.json`, `main.js` and `styles.css` at the root.

---

## License

This project is released under a very permissive license
(see the [`LICENSE`](./LICENSE) file for the full text).
You can copy, modify and reuse the code in other projects, including closed
source ones, at your own risk.

Contributions, issues and ideas are welcome!
