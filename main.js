/**
 * Hong Kong Monthly Temperature Matrix (Last 10 Years)
 *
 * Matrix:
 *  - x: year
 *  - y: month
 *  - each cell: a year-month
 *
 * Encodings / Interactions:
 *  - cell background color encodes MONTHLY EXTREME temperature:
 *      Mode MAX: highest daily max in that month
 *      Mode MIN: lowest daily min in that month
 *    Click anywhere on the chart to toggle MAX/MIN background encoding.
 *
 *  - each cell contains TWO mini line charts (always shown):
 *      green: daily max temperatures
 *      cyan : daily min temperatures
 *
 *  - tooltip on hover shows:
 *      Date: YYYY-MM, max: __, min: __ (monthly extremes)
 *
 * Data:
 *  - data/temperature_daily.csv
 *  - columns: date (YYYY-MM-DD), max_temperature, min_temperature
 */

const DATA_PATH = "./data/temperature_daily.csv";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

// Layout constants
const margin = { top: 45, right: 60, bottom: 50, left: 90 };
const cellW = 92;
const cellH = 56;
const miniPad = 6;

let mode = "max"; // "max" or "min"
let appState = null;

const tooltip = d3.select("#tooltip");

// ----------------------- Helpers -----------------------
function parseRow(d) {
  const parse = d3.timeParse("%Y-%m-%d");
  const date = parse(d.date);
  if (!date) return null;

  return {
    date,
    year: date.getFullYear(),
    month: date.getMonth(), // 0-11
    day: date.getDate(),    // 1..31
    tmax: +d.max_temperature,
    tmin: +d.min_temperature
  };
}

function lastNDistinctYears(rows, n) {
  const years = Array.from(new Set(rows.map(r => r.year))).sort((a, b) => a - b);
  return years.slice(Math.max(0, years.length - n));
}

function formatYearMonth(y, m) {
  const mm = String(m + 1).padStart(2, "0");
  return `${y}-${mm}`;
}

function modeLabel() {
  return mode === "max" ? "MAX" : "MIN";
}

/**
 * Builds a full matrix year->month with:
 *  - monthlyMaxExtreme = max of daily max temps in that month
 *  - monthlyMinExtreme = min of daily min temps in that month
 *  - daily series arrays for both max and min
 */
function buildMatrix(rows, yearsWanted) {
  const yearSet = new Set(yearsWanted);
  const filtered = rows.filter(r => yearSet.has(r.year));

  const byYearMonth = d3.group(filtered, d => d.year, d => d.month);

  const matrix = new Map();

  yearsWanted.forEach(y => {
    const monthMap = new Map();

    for (let m = 0; m < 12; m++) {
      const arr = byYearMonth.get(y)?.get(m) ?? [];

      const dailyMax = arr
        .slice()
        .sort((a, b) => a.day - b.day)
        .map(r => ({ day: r.day, value: r.tmax }));

      const dailyMin = arr
        .slice()
        .sort((a, b) => a.day - b.day)
        .map(r => ({ day: r.day, value: r.tmin }));

      const monthlyMaxExtreme = arr.length ? d3.max(arr, r => r.tmax) : null;
      const monthlyMinExtreme = arr.length ? d3.min(arr, r => r.tmin) : null;

      monthMap.set(m, {
        year: y,
        month: m,
        monthlyMaxExtreme,
        monthlyMinExtreme,
        dailyMax,
        dailyMin
      });
    }

    matrix.set(y, monthMap);
  });

  return matrix;
}

function getBackgroundValue(cell) {
  return mode === "max" ? cell.monthlyMaxExtreme : cell.monthlyMinExtreme;
}

// ----------------------- Rendering -----------------------
function render(matrix, years) {
  const width = margin.left + margin.right + years.length * cellW;
  const height = margin.top + margin.bottom + 12 * cellH + 80;

  d3.select("#chart").selectAll("*").remove();

  const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("cursor", "pointer");

  svg.on("click", () => {
    mode = (mode === "max") ? "min" : "max";
    d3.select("#modeText").text(modeLabel());
    update();
  });

  const x = d3.scaleBand()
    .domain(years)
    .range([margin.left, margin.left + years.length * cellW])
    .paddingInner(0.22)
    .paddingOuter(0.05);

  const y = d3.scaleBand()
    .domain(d3.range(12))
    .range([margin.top, margin.top + 12 * cellH])
    .paddingInner(0.22)
    .paddingOuter(0.05);

  // Extents
  const monthlyMaxValues = [];
  const monthlyMinValues = [];
  const dailyAll = [];

  years.forEach(yy => {
    for (let m = 0; m < 12; m++) {
      const c = matrix.get(yy).get(m);
      if (c.monthlyMaxExtreme != null) monthlyMaxValues.push(c.monthlyMaxExtreme);
      if (c.monthlyMinExtreme != null) monthlyMinValues.push(c.monthlyMinExtreme);
      c.dailyMax.forEach(d => dailyAll.push(d.value));
      c.dailyMin.forEach(d => dailyAll.push(d.value));
    }
  });
  const monthlyAllValues = monthlyMaxValues.concat(monthlyMinValues);

  appState = {
    svg,
    matrix,
    years,
    x,
    y,
    ranges: {
      monthlyMax: d3.extent(monthlyMaxValues),
      monthlyMin: d3.extent(monthlyMinValues),
      monthlyAll: d3.extent(monthlyAllValues), // <-- fixed legend domain
      dailyAll: d3.extent(dailyAll)
    }
  };

  // Axes
  const xAxis = g => g
    .attr("class", "axis")
    .attr("transform", `translate(0, ${margin.top - 12})`)
    .call(d3.axisTop(x).tickSizeOuter(0))
    .call(g => g.select(".domain").remove());

  const yAxis = g => g
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left - 12}, 0)`)
    .call(d3.axisLeft(y).tickFormat(m => MONTHS[m]).tickSizeOuter(0))
    .call(g => g.select(".domain").remove());

  svg.append("g").call(xAxis);
  svg.append("g").call(yAxis);

  update();
}

function update() {
  const { svg, matrix, years, x, y, ranges } = appState;

  // Use true band sizes (prevents overflow)
  const bw = x.bandwidth();
  const bh = y.bandwidth();
  const miniWLocal = Math.max(0, bw - miniPad * 2);
  const miniHLocal = Math.max(0, bh - miniPad * 2);

  // Background color scale depends on mode
  const bgExtent = ranges.monthlyAll; // fixed legend domain for both modes

  const color = d3.scaleSequential()
  .domain(bgExtent)               // low -> high
  .interpolator(d3.interpolateTurbo); // blue -> green -> yellow -> red

  // Mini chart scales (shared across all cells, both lines)
  const miniX = d3.scaleLinear()
    .domain([1, 31])
    .range([miniPad, miniPad + miniWLocal]);

  const miniY = d3.scaleLinear()
    .domain(ranges.dailyAll)
    .range([miniHLocal, 0])
    .nice();

  const line = d3.line()
    .x(d => miniX(d.day))
    .y(d => miniPad + miniY(d.value))
    .curve(d3.curveMonotoneX);

  // Clear layers
  svg.selectAll(".cell-layer").remove();
  svg.selectAll(".legend-layer").remove();
  svg.select("defs#legend-defs").remove();

  // ---- Cell Layer ----
  const layer = svg.append("g").attr("class", "cell-layer");

  const cells = [];
  years.forEach(yy => {
    for (let m = 0; m < 12; m++) cells.push(matrix.get(yy).get(m));
  });

  const cellG = layer.selectAll("g.cell")
    .data(cells, d => `${d.year}-${d.month}`)
    .join("g")
    .attr("class", "cell")
    .attr("transform", d => `translate(${x(d.year)}, ${y(d.month)})`);

  // background rect
  cellG.append("rect")
    .attr("width", bw)
    .attr("height", bh)
    .attr("rx", 8)
    .attr("ry", 8)
    .attr("fill", d => {
      const v = getBackgroundValue(d);
      return v == null ? "rgba(255,255,255,0.10)" : color(v);
    })
    .attr("stroke", "rgba(0,0,0,0.18)")
    .attr("stroke-width", 1)
    .on("mousemove", (event, d) => {
      const ym = formatYearMonth(d.year, d.month);
      const maxV = d.monthlyMaxExtreme;
      const minV = d.monthlyMinExtreme;

      tooltip
        .style("display", "block")
        .style("left", (event.clientX + 14) + "px")
        .style("top", (event.clientY + 14) + "px")
        .html(`
          <div><b>Date: ${ym}</b></div>
          <div>max: <b>${maxV == null ? "N/A" : maxV.toFixed(0)}</b> °C</div>
          <div>min: <b>${minV == null ? "N/A" : minV.toFixed(0)}</b> °C</div>
          <div style="opacity:.75;margin-top:6px;">
            Background encodes: ${modeLabel()}
          </div>
        `);
    })
    .on("mouseleave", () => tooltip.style("display", "none"));

  // ---- Clip paths so mini lines stay inside the cell ----
  // Put clipPaths in defs so IDs are unique and valid
  const defs = svg.append("defs").attr("id", "legend-defs"); // reuse the same defs container
  defs.selectAll("clipPath.cell-clip")
    .data(cells, d => `clip-${d.year}-${d.month}`)
    .join("clipPath")
    .attr("class", "cell-clip")
    .attr("id", d => `clip-${d.year}-${d.month}`)
    .append("rect")
    .attr("x", miniPad)
    .attr("y", miniPad)
    .attr("width", miniWLocal)
    .attr("height", miniHLocal);

  // Mini chart: daily max line (always) - clipped
  cellG.append("path")
    .attr("clip-path", d => `url(#clip-${d.year}-${d.month})`)
    .attr("d", d => d.dailyMax.length ? line(d.dailyMax) : null)
    .attr("fill", "none")
    .attr("stroke", "rgba(0, 230, 120, 0.95)")
    .attr("stroke-width", 1.4);

  // Mini chart: daily min line (always) - clipped
  cellG.append("path")
    .attr("clip-path", d => `url(#clip-${d.year}-${d.month})`)
    .attr("d", d => d.dailyMin.length ? line(d.dailyMin) : null)
    .attr("fill", "none")
    .attr("stroke", "rgba(120, 220, 255, 0.95)")
    .attr("stroke-width", 1.4);

  // ---- Legend ----
  const legendLayer = svg.append("g").attr("class", "legend-layer");

  const legendTop = margin.top;
  const legendH = 240;
  const legendW = 16;

  // place legend at right, inside the SVG
  const safeLegendX = (margin.left + years.length * cellW + 10);

  legendLayer.append("text")
    .attr("class", "legend-title")
    .attr("x", safeLegendX)
    .attr("y", legendTop - 12)
    .text(`${modeLabel()} (°C)`);

  // Vertical gradient (create new unique id each render so it always updates correctly)
  const gradId = `legendGradientV-${mode}`;
  const grad = defs.append("linearGradient")
    .attr("id", gradId)
    .attr("x1", "0%").attr("x2", "0%")
    .attr("y1", "0%").attr("y2", "100%");

  const stops = d3.range(0, 1.00001, 0.05);
  grad.selectAll("stop")
    .data(stops)
    .join("stop")
    .attr("offset", d => `${d * 100}%`)
    .attr("stop-color", d => {
      const t = bgExtent[1] - d * (bgExtent[1] - bgExtent[0]);
      return color(t);
    });

  legendLayer.append("rect")
    .attr("x", safeLegendX)
    .attr("y", legendTop)
    .attr("width", legendW)
    .attr("height", legendH)
    .attr("fill", `url(#${gradId})`)
    .attr("stroke", "rgba(255,255,255,0.25)");

  const legendScale = d3.scaleLinear()
    .domain(bgExtent)
    .range([legendTop + legendH, legendTop]);

  // Force numeric tick labels (integers)
  legendLayer.append("g")
    .attr("class", "axis legend-axis")
    .attr("transform", `translate(${safeLegendX + legendW + 6}, 0)`)
    .call(d3.axisRight(legendScale).ticks(6).tickFormat(d3.format(".0f")))
    .call(g => g.select(".domain").remove());

  d3.select("#modeText").text(modeLabel());
}

// ----------------------- Boot -----------------------
(async function init() {
  try {
    const raw = await d3.csv(DATA_PATH);
    const rows = raw
      .map(parseRow)
      .filter(r => r && r.date && Number.isFinite(r.tmax) && Number.isFinite(r.tmin));

    const years = lastNDistinctYears(rows, 10);
    const matrix = buildMatrix(rows, years);

    render(matrix, years);
  } catch (err) {
    console.error(err);
    d3.select("#chart")
      .append("div")
      .style("color", "white")
      .style("padding", "10px")
      .text("Error loading/processing data. Open DevTools console for details.");
  }
})();