# Chart Notes

> Transform your Obsidian notes into beautiful, interactive charts directly inside Bases.

Chart Notes is a powerful Obsidian plugin that adds a **Chart Notes layout** to Bases, allowing you to visualize your note properties as bar charts, line graphs, pie charts, scatter plots, and Gantt timelines. No custom query language needed—it works seamlessly with your existing Bases filters, sorts, and groups.

![Obsidian](https://img.shields.io/badge/Obsidian-1.10%2B-7C3AED?logo=obsidian)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

### 📊 Multiple Chart Types
- **Bar Charts** – Grouped and stacked bars for categorical data
- **Line Charts** – Time series with date-aware X-axis
- **Stacked Area Charts** – Cumulative data visualization over time
- **Pie Charts** – Distribution and proportion visualization
- **Scatter Plots** – Compare two numeric properties
- **Gantt Timelines** – Interactive project management with task scheduling

### 🎯 Key Capabilities
- **Seamless Bases Integration** – Works with all Bases features (filters, sorts, groups)
- **Property-Based** – Uses your existing frontmatter and inline properties
- **Date-Aware** – Intelligent date handling with automatic bucketing (day/week/month/year)
- **Interactive** – Click any element to drill down into underlying notes
- **Cumulative Sum** – Running totals for time series data
- **Real-Time Updates** – Charts refresh automatically as you modify notes or filters

### 🎨 Gantt Chart Features
- Visual timeline with start/end dates
- Due date markers
- Duration estimates
- Interactive editing (click to modify dates)
- Group by project, status, or any property
- "Today" indicator line

---

## 📋 Requirements

- **Obsidian** version 1.10.0 or higher
- **Bases** feature enabled (available in Insider/Catalyst builds or Obsidian versions that include Bases)
- This plugin is currently in beta and not yet in the community listing

---

## 🚀 Installation

### Option 1: Via BRAT (Recommended)

1. Install the **[BRAT](https://github.com/TfTHacker/obsidian42-brat)** plugin in Obsidian
2. Open **Settings → Community plugins → BRAT**
3. Click **"Add Beta Plugin"** and paste:
```
https://github.com/marco7m/chartnotes
   ```
4. BRAT will install the plugin automatically
5. Enable **Chart Notes** in **Settings → Community plugins**

### Option 2: Manual Installation

1. Clone this repository into your vault's plugins folder:
```bash
cd path/to/your/vault/.obsidian/plugins
git clone https://github.com/marco7m/chartnotes.git
cd chartnotes
   ```

2. Install dependencies and build:
   ```bash
npm install
npm run build
   ```

3. Restart Obsidian and enable **Chart Notes** in **Settings → Community plugins**

---

## 🎓 Quick Start

1. **Open or create a Base** with the notes you want to visualize
2. Click **+ New** in the top right of the Base
3. Select **Layout → Chart Notes**
4. Configure your chart:
   - Choose a **Chart type**
   - Select **X axis / category** property
   - Optionally set **Y value** property (or leave empty to count notes)
   - Add **Series / color** for multi-series charts
5. The chart updates automatically as you adjust settings or Base filters

> 💡 **Tip**: All chart data comes from the current Base. Filters, search, grouping, and sorting are all respected automatically.

---

## 📖 Chart Types Guide

### Bar & Stacked Bar

Perfect for aggregations and comparisons.

**Use cases:**
- Count notes by status, project, or tag
- Sum numeric values (e.g., `timeEstimate`) by category
- Compare values across different groups

**Configuration:**
- **Chart type:** `Bar` or `Stacked bar`
- **X axis / category:** Your grouping field (`status`, `project`, `tag`, etc.)
- **Y value:** Numeric property to sum (e.g., `timeEstimate`) or leave empty to count notes
- **Series / color:** Optional property to split bars (e.g., `priority`, `assignee`)

**Difference:**
- `Bar` draws separate bars for each (X, series) combination
- `Stacked bar` stacks series vertically, showing total and individual contributions

---

### Line & Stacked Area

Ideal for time series and trends.

**Use cases:**
- Track metrics over time (effort, value, completion rate)
- Visualize cumulative progress
- Monitor trends and patterns

**Configuration:**
- **Chart type:** `Line` or `Stacked area`
- **X axis / category:** A **date** property (`created`, `scheduled`, `startDate`, etc.)
- **Y value:** The numeric metric to plot (`effort`, `value`, `count`, etc.)
- **Series / color:** Optional for line charts, **required** for stacked area
- **X bucket:** How to group dates (`auto`, `day`, `week`, `month`, `quarter`, `year`)
- **Value aggregation:** 
  - `Sum` – Sum values in each time bucket
  - `Count (ignore Y)` – Count notes per bucket
  - `Cumulative sum` – Running total over time (monotonic, never decreases)

**Features:**
- **Date-aware spacing** – Points are spaced proportionally to real time distance
- **Automatic bucketing** – Group dates by day/week/month for cleaner visualization
- **Cumulative sum** – Perfect for tracking running totals (e.g., total effort over time)

---

### Pie Chart

Great for distributions and proportions.

**Use cases:**
- "How many notes have each status?"
- "What's the distribution of projects?"
- "Which tags are most common?"

**Configuration:**
- **Chart type:** `Pie`
- **X axis / category:** Property that defines each slice (`status`, `project`, `tag`, etc.)
- **Y value:** Ignored (always counts notes)
- **Series / color:** Ignored

Each slice's size represents the **number of notes** with that category value.

---

### Scatter Plot

Compare two numeric properties.

**Use cases:**
- Estimate vs. actual time
- Value vs. effort
- Any two numeric comparisons

**Configuration:**
- **Chart type:** `Scatter`
- **X axis / category:** First numeric property (e.g., `estimate`)
- **Y value:** Second numeric property (e.g., `actual`)
- **Series / color:** Optional – categories for coloring points (e.g., `status`, `priority`)

---

### Gantt Chart

Interactive project timeline visualization.

**Use cases:**
- Project planning and scheduling
- Task management with dates
- Resource allocation over time

**Configuration:**
- **Chart type:** `Gantt`
- **Task label:** Property for row labels (defaults to file name)
- **Start (Gantt):** Start date/datetime property
- **End (Gantt):** End date/datetime property
- **Due (deadline, optional):** Deadline date property
- **Duration in minutes (optional):** Numeric duration estimate
- **Series / color:** Optional – used for bar color

**Grouping:**
- Use Bases' **"Group by"** feature to create lanes
- Tasks are grouped by the selected property (project, status, assignee, etc.)
- If not grouped, all tasks appear in a single lane

**Smart Date Logic:**
Chart Notes intelligently computes start/end dates even when some fields are missing:

1. **Both start and end** → Use as-is
2. **Start + duration** → End = start + duration
3. **End + duration** → Start = end − duration
4. **Only start** → Create short bar (start + 60 minutes)
5. **Only end** → Short bar ending at end
6. **Due + duration** → Bar ends at due, starts at due − duration
7. **Only due** → Very short bar around due

**Interactions:**
- **Hover** – See tooltip with dates, duration, and key properties
- **Click bar or label** – Edit start, end, duration, and due dates in a modal
- **Today line** – Vertical dashed line marks current date
- **Due markers** – Small dashed lines show deadlines within bars

---

## ⚙️ Common Options

These options appear across multiple chart types:

### Chart Type
Choose from: `Bar`, `Stacked bar`, `Line`, `Stacked area`, `Pie`, `Scatter`, `Gantt`

### X Axis / Category
Property used for the X axis or categories. For pie charts, this defines the slices. For line/stacked-area charts, this is usually a **date** property.

### Y Value (empty = count)
Numeric property used as the Y value. If left empty, Chart Notes simply **counts notes** for each X/series combination.

### Series / Color (optional)
Property used to split data into different series and colors. Useful for:
- Status (`open`, `in-progress`, `done`)
- Project names
- Priority levels
- Assignees
- Any categorical property

### X Bucket (dates) – Line/Stacked Area Only
How to group dates on the X axis:
- `auto` – Automatically choose best bucket size
- `none` – No bucketing, use raw dates
- `day` – Group by day
- `week` – Group by week
- `month` – Group by month
- `quarter` – Group by quarter
- `year` – Group by year

When X is a date, horizontal spacing is **proportional to time**. This setting controls how values are grouped before plotting.

### Value Aggregation (Y)
How multiple notes with the same X/series are combined:
- `Sum` – Sum all Y values
- `Count (ignore Y)` – Ignore Y and just count notes
- `Cumulative sum` – Line/stacked-area only; running total over time (monotonic)

### Drilldown (click opens notes)
When enabled, clicking a point/bar/slice opens a side panel listing all notes behind that data point.

### Title (optional)
Custom chart title. If empty, the Bases view name is used.

---

## 💡 Use Cases & Examples

### Task Management Dashboard

**Setup:**
1. Create a Base filtered to your open tasks
2. Group by `project`
3. Add a **Gantt** view:
   - Task label: `file.name`
   - Start: `startDate`
   - End: `scheduled`
   - Due: `due`
   - Duration: `timeEstimate` (in minutes)
   - Series: `status`

**Result:** Visual timeline of all tasks with deadlines and estimates.

---

### Workload Analysis

**Setup:**
1. Same Base as above
2. Add a **Stacked bar** view:
   - X axis: `status` or `project`
   - Y value: `timeEstimate`
   - Series: `priority` or `assignee`

**Result:** See total effort broken down by category and series.

---

### Progress Tracking

**Setup:**
1. Base with tasks that have `completed` dates
2. Add a **Stacked area** view:
   - Chart type: `Stacked area`
   - X axis: `completed` (date)
   - Y value: `timeEstimate`
   - Series: `project`
   - Value aggregation: `Cumulative sum`

**Result:** Running total of completed work over time, stacked by project.

---

### Status Distribution

**Setup:**
1. Any Base with a `status` property
2. Add a **Pie** view:
   - X axis: `status`

**Result:** Visual breakdown of how many notes are in each status.

---

## 🛠️ Development

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm

### Setup
```bash
# Clone the repository
git clone https://github.com/marco7m/chartnotes.git
cd chartnotes

# Install dependencies
npm install

# Build the plugin
npm run build
```

The compiled plugin files (`main.js`, `manifest.json`, `styles.css`) are generated in the repository root. Obsidian loads the plugin from these files.

### Development Mode
```bash
# Watch mode (rebuilds on file changes)
npm run dev
```

### Testing

Chart Notes includes a comprehensive test suite using **Vitest**.

```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

**Test Coverage:**
- Utility functions (date parsing, path matching, tag matching)
- Query and aggregation functions
- Cumulative sum logic
- Stacking calculations
- Date normalization

See [`tests/README.md`](./tests/README.md) for detailed testing documentation and examples.

### Project Structure
```
chartnotes/
├── src/
│   ├── bases-view.ts      # Bases view integration
│   ├── indexer.ts          # Note indexing
│   ├── query.ts            # Data querying
│   ├── renderer.ts         # Chart rendering
│   ├── renderer/
│   │   ├── bar.ts          # Bar chart renderer
│   │   ├── line.ts         # Line/area chart renderer
│   │   ├── pie.ts          # Pie chart renderer
│   │   ├── scatter.ts      # Scatter plot renderer
│   │   └── gantt.ts        # Gantt chart renderer
│   └── types.ts            # TypeScript types
├── tests/                  # Unit tests
│   ├── utils.test.ts       # Utility function tests
│   ├── query.test.ts       # Query function tests
│   ├── stacking.test.ts    # Stacking logic tests
│   └── README.md           # Testing guide
├── main.ts                 # Plugin entry point
├── manifest.json           # Plugin manifest
└── package.json            # Dependencies
```

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Report bugs** – Open an issue describing the problem
2. **Suggest features** – Share your ideas for improvements
3. **Submit pull requests** – Fix bugs or add features
4. **Improve documentation** – Help make the README and docs better
5. **Share examples** – Show how you're using Chart Notes

### Contribution Guidelines

- Fork the repository
- Create a feature branch (`git checkout -b feature/amazing-feature`)
- Make your changes
- Test thoroughly
- Submit a pull request with a clear description

---

## 📝 License

This project is licensed under the **MIT License** – see the [LICENSE](./LICENSE) file for details.

You are free to:
- ✅ Use the plugin commercially
- ✅ Modify the code
- ✅ Distribute the code
- ✅ Use privately

---

## 🙏 Acknowledgments

- Built for the Obsidian community
- Powered by the Obsidian Bases API
- Inspired by the need for better data visualization in note-taking

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/marco7m/chartnotes/issues)
- **Discussions:** [GitHub Discussions](https://github.com/marco7m/chartnotes/discussions)

---

**Made with ❤️ for the Obsidian community**
