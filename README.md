# Chart Notes

Visualize your Obsidian notes as charts — using only YAML.

Chart Notes reads properties from your notes (YAML frontmatter / properties) and lets you create:

- **Bar**, **stacked bar**, **line**, **area**, **pie**, **scatter**
- **Table** views
- An interactive **Gantt** with editing (start/end/estimate/due)

…all from simple ` ```chart ` code blocks.

> ⚠️ **Early alpha** – I use this in my own vault, but the DSL and options may still change.  
> If something breaks, please open an issue with the chart YAML you used.

---

## 1. Installation

### 1.1. Via BRAT (recommended for now)

1. Install the Obsidian community plugin **BRAT** (“Beta Reviewers Auto-update Tester”).
2. In BRAT settings, choose **Add beta plugin**.
3. Use this repo:

```text
   marco7m/chartnotes
````

4. Pick a version (latest release) and click **Add plugin**.
5. Enable **Chart Notes** in Obsidian → Settings → Community plugins.

---

## 2. Basic usage

Anywhere you can write Markdown, you can insert a `chart` code block:

```chart
type: bar
source:
  paths: ["TaskNotes/"]
encoding:
  x: status
  y: status
aggregate:
  y: count
options:
  title: "Tasks by status"
```

The plugin parses the YAML and renders a chart in place.

Your data comes from note properties, for example:

```yaml
---
status: open
priority: normal
scheduled: 2025-11-03
projects:
  - "[[Project ABC]]"
timeEstimate: 180
dateCreated: 2025-11-03T10:26:06.594-03:00
dateModified: 2025-11-03T10:29:31.540-03:00
tags:
  - tasknote
---
```

---

## 3. Chart block structure (DSL)

Every chart uses the same overall shape:

```yaml
type: bar | line | area | pie | scatter | stacked-bar | table | gantt

source:
  paths: ["TaskNotes/"]     # optional
  tags: ["tasknote"]        # optional
  where:
    - "status == 'open'"    # optional conditions

encoding:
  x: fieldName              # required for most types
  y: fieldName              # required for most types
  series: fieldName         # optional (colors / multiple series)

  # Gantt-specific:
  start: fieldName          # start date (optional)
  end: fieldName            # end date (required)
  duration: fieldName       # in minutes (optional)
  due: fieldName            # optional deadline
  group: fieldName          # group / project lane
  label: fieldName          # label on the left

aggregate:
  y: sum | avg | min | max | count
  cumulative: true          # optional (line/area)
  rolling: "7d"             # optional (line/area – moving average)

sort:
  x: asc | desc

options:
  title: "Chart title"
  background: "#ffffff"
  drilldown: true | false   # click to see notes
  editable: true | false    # Gantt: enable edit modal
  tableColumns: [...]       # table-specific
```

---

## 4. `source`: which notes are included

### 4.1. `paths`

Filter by file path (folder prefix):

```yaml
source:
  paths: ["TaskNotes/"]
```

* `"TaskNotes/"` → all notes inside that folder (recursively).
* You can pass multiple paths:

```yaml
source:
  paths:
    - "TaskNotes/"
    - "Projects/"
```

If `paths` is omitted, the plugin uses all indexed notes (or your default paths from settings, if configured).

### 4.2. `tags`

Filter by tags (without `#`):

```yaml
source:
  tags: ["tasknote"]
```

You can also combine `paths` and `tags`:

* If both are present, a note is included if it matches **at least one**
  (path **OR** tag).

### 4.3. `where`: conditions

`where` is a list of simple conditions written as strings.

#### Equality

```yaml
where:
  - "status == 'open'"
  - "priority == 'higher'"
```

#### Numeric comparison

```yaml
where:
  - "timeEstimate > 0"
  - "timeEstimate >= 60"
```

#### Date ranges: `between`

```yaml
where:
  - "dateCreated between -30d and today"
  - "scheduled between 2025-10-01 and 2025-10-31"
  - "scheduled between -14d and 0"
```

Supported date “literals”:

* Absolute dates: `2025-10-29`
* Relative:

  * `today` → today
  * `0` → today
  * `-7d` → 7 days ago
  * `+10d` → 10 days ahead
  * `-30d` → 30 days ago

`between A and B` includes the whole days for A and B.

You can combine multiple conditions; a note must satisfy **all** of them.

---

## 5. `encoding`: properties → axes / colors

### 5.1. Generic fields (bar / line / area / stacked-bar / pie / scatter)

* `x` – what goes on the X axis (date, status, priority, etc.)
* `y` – numeric value, or a field that will be **counted** if you use `count`
* `series` – splits data into multiple series / colors (status, priority, project…)

Examples:

Count notes by status:

```yaml
encoding:
  x: status
  y: status
aggregate:
  y: count
```

Sum of time per scheduled day:

```yaml
encoding:
  x: scheduled
  y: timeEstimate
aggregate:
  y: sum
```

Same, but split by status (series):

```yaml
encoding:
  x: scheduled
  y: timeEstimate
  series: status
aggregate:
  y: sum
```

### 5.2. Gantt encoding

Gantt uses special fields:

```yaml
encoding:
  end: scheduled         # planned finish date (required)
  duration: timeEstimate # minutes (optional)
  start: startDate       # explicit start (optional)
  due: due               # deadline (optional)
  group: projects        # group / swimlane (project, context...)
  label: name            # label on the left (if array, first element)
  series: status         # bar color
```

Rules:

* `end` is the only required field.
* If `start` exists:

  * `start` + `end` define the bar.
  * `duration` is ignored for the geometry.
* If `start` is missing but `duration` is present:

  * `start = end - duration (minutes)`.
* `due` draws a vertical deadline line.
* `group` groups tasks visually under a header (typically projects).
* `label` is the task label on the left.
* `series` controls the bar color (e.g. by `status`).

### 5.3. Table encoding

Table uses `source` to find notes and renders a table.

You can suggest columns with `options.tableColumns`:

```yaml
type: table
source:
  paths: ["TaskNotes/"]
  where:
    - "scheduled between -5d and -1d"
encoding:
  x: status
  y: priority
options:
  title: "Last few days"
  tableColumns: ["status","priority","scheduled","projects"]
```

---

## 6. `aggregate`: grouping and math

### 6.1. `aggregate.y`

Available aggregations:

* `sum` – sum of values
* `avg` – average
* `min` – minimum
* `max` – maximum
* `count` – number of notes

Count by status:

```yaml
encoding:
  x: status
  y: status
aggregate:
  y: count
```

Sum of estimates per day:

```yaml
encoding:
  x: scheduled
  y: timeEstimate
aggregate:
  y: sum
```

### 6.2. Cumulative line / area

For `type: line` or `type: area`:

```yaml
aggregate:
  y: count
  cumulative: true
```

Meaning:

> Instead of “value per day”, show
> “sum of all values up to this day” (running total).

Example:

```yaml
type: line
source:
  paths: ["TaskNotes/"]
  where:
    - "dateCreated between -30d and today"
encoding:
  x: dateCreated
  y: dateCreated
aggregate:
  y: count
  cumulative: true
sort:
  x: asc
options:
  title: "Tasks created (30 days, cumulative)"
  background: "#ffffff"
```

> 💡 The cumulative sum uses the order defined by `sort.x`.

### 6.3. Rolling / moving average

Still for `line` / `area`:

```yaml
aggregate:
  y: sum
  rolling: "7d"   # or 7
```

Meaning:

> For each point, use the average of the last N points (per series).
> This is useful to smooth noisy daily data.

Example:

```yaml
type: line
source:
  paths: ["TaskNotes/"]
encoding:
  x: scheduled
  y: timeEstimate
  series: status
aggregate:
  y: sum
  rolling: "7d"
options:
  title: "Estimated time (7-day moving average by status)"
  background: "#ffffff"
```

---

## 7. `sort`: ordering

Currently:

```yaml
sort:
  x: asc   # or desc
```

* Affects the order of X values.
* For cumulative / rolling charts, the order also defines how the cumulative or rolling value is computed.

---

## 8. `options`: look & behavior

Main fields:

```yaml
options:
  title: "Chart title"
  background: "#ffffff"
  drilldown: true        # on click, show notes list
  editable: true         # Gantt: enable edit modal
  tableColumns: [...]    # Table only
```

* `title` – text above the chart.
* `background` – background color; set to `"#ffffff"` for light charts on a dark theme.
* `drilldown` – if `true`, clicking a bar / point opens a list of notes below.
* `editable` (Gantt) – if `true`, clicking a bar opens a modal to edit start/end/estimate/due.

---

## 9. Interaction

### 9.1. All charts (bar, stacked-bar, line, area, pie, scatter, table)

* **Hover**: shows a tooltip with:

  * label (category / date / series)
  * value
  * number of notes
* **Click on bar/point/segment**:

  * Opens a details panel listing all note paths for that point.
  * Clicking a note opens it in Obsidian.

### 9.2. Gantt

* **Hover bar or task name**:

  * Tooltip with:

    * full note title
    * start → end dates
    * estimate (if available) or duration
    * due date
    * extra fields (status, priority, etc.)
* **Click bar or task name**:

  * Opens a **modal** for that task:

    * Full note title (clickable → open note)
    * Inputs for:

      * start date
      * end date
      * estimate (minutes)
      * due date (if configured)
  * Saving updates the note’s YAML and refreshes the chart (after Obsidian re-renders the block).
* **Zoom / fit controls** (for Gantt):

  * `Fit / 100% / 150% / 200%` to adjust horizontal scale.
  * A “fullscreen” button opens the chart in a big modal.

---

## 10. Examples (“recipes”)

Below are some ready-to-use charts.
They assume your tasks live under `TaskNotes/` and use properties like `status`, `priority`, `scheduled`, `timeEstimate`, `dateCreated`, etc.

### 10.1. Tasks by status

```chart
type: bar
source:
  paths: ["TaskNotes/"]
encoding:
  x: status
  y: status
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks by status"
```

### 10.2. Tasks by priority

```chart
type: bar
source:
  paths: ["TaskNotes/"]
encoding:
  x: priority
  y: priority
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks by priority"
```

### 10.3. Open tasks by priority

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "status == 'open'"
encoding:
  x: priority
  y: priority
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Open tasks by priority"
```

### 10.4. Estimated minutes per day

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "timeEstimate > 0"
encoding:
  x: scheduled
  y: timeEstimate
aggregate:
  y: sum
sort:
  x: asc
options:
  title: "Estimated minutes per day"
```

### 10.5. Tasks created over time

```chart
type: line
source:
  paths: ["TaskNotes/"]
encoding:
  x: dateCreated
  y: dateCreated
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks created over time"
  background: "#ffffff"
```

### 10.6. Estimated time (open) by priority

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "status == 'open'"
    - "timeEstimate > 0"
encoding:
  x: priority
  y: timeEstimate
aggregate:
  y: sum
sort:
  x: asc
options:
  title: "Estimated time (open) by priority"
```

### 10.7. Tasks on a specific date

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "scheduled == '2025-10-29'"
encoding:
  x: status
  y: status
aggregate:
  y: count
options:
  title: "Tasks on 2025-10-29 by status"
```

### 10.8. Total estimated time by status

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "timeEstimate > 0"
encoding:
  x: status
  y: timeEstimate
aggregate:
  y: sum
options:
  title: "Total estimated time by status"
```

### 10.9. Status distribution (last 30 days)

```chart
type: pie
source:
  paths: ["TaskNotes/"]
  where:
    - "scheduled between -30d and 0"
encoding:
  x: status
  y: status
aggregate:
  y: count
options:
  title: "Status distribution (30 days)"
  background: "#ffffff"
```

### 10.10. Stacked: priority by status (14 days)

```chart
type: stacked-bar
source:
  tags: ["tasknote"]
  where:
    - "scheduled between -14d and 0"
encoding:
  x: status
  y: priority
  series: priority
aggregate:
  y: count
options:
  title: "Stacked: priority by status (14 days)"
  background: "#ffffff"
```

### 10.11. Scatter: estimate vs date (30 days)

```chart
type: scatter
source:
  paths: ["TaskNotes/"]
  where:
    - "dateCreated between -30d and 0"
encoding:
  x: dateCreated   # becomes timestamp
  y: timeEstimate  # must be numeric
options:
  title: "Scatter: estimate vs date (30 days)"
  background: "#ffffff"
```

### 10.12. Area: tasks created (30 days)

```chart
type: area
source:
  tags: ["tasknote"]
  where:
    - "dateCreated between -30d and 0"
encoding:
  x: dateCreated
  y: dateCreated
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks created (30 days)"
  background: "#ffffff"
```

### 10.13. Table: last few days

```chart
type: table
source:
  paths: ["TaskNotes/"]
  where:
    - "scheduled between -5d and -1d"
encoding:
  x: status
  y: priority
options:
  title: "Last few days (table)"
  tableColumns: ["status","priority","scheduled","projects"]
```

### 10.14. Gantt: tasks (7 days)

```chart
type: gantt
source:
  tags: ["tasknote"]
  where:
    - "scheduled > -7d"
encoding:
  end: scheduled         # planned finish date
  duration: timeEstimate # duration in minutes
  due: due               # optional deadline
  group: projects
  start: startDate
  label: name
  series: status         # color
options:
  title: "Gantt – tasks (7 days)"
  background: "#ffffff"
  editable: true
```

---

## 11. Status / feedback

* This plugin is **early alpha**, used mainly in my personal workflow.
* The YAML DSL might change as I refine it.
* If you hit a bug:

  * Open an issue with:

    * your chart YAML
    * a sample note frontmatter (anonymized if needed)
    * screenshot if it helps.

Suggestions and ideas are very welcome 🙂



