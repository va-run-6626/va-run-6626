// Renders the contribution grid with a Corinthian helmet that marches through it,
// conquering (clearing) each day it passes. No dependencies; Node 18+.
//
//   GITHUB_TOKEN=... node legionary.mjs <user> <outDir>
//   node legionary.mjs --sample <outDir>      (random grid, for local previews)

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , userArg, outDir = "dist"] = process.argv;

const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function fetchWeeks(user) {
  const query = `query($u:String!){user(login:$u){contributionsCollection{contributionCalendar{
    weeks{contributionDays{contributionLevel weekday}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { u: user } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data.user.contributionsCollection.contributionCalendar.weeks.map((w) =>
    w.contributionDays.map((d) => ({ weekday: d.weekday, level: LEVELS[d.contributionLevel] ?? 0 })));
}

function sampleWeeks() {
  return Array.from({ length: 53 }, (_, w) =>
    Array.from({ length: w === 52 ? 3 : 7 }, (_, d) => {
      const r = Math.random();
      return { weekday: d, level: r < 0.45 ? 0 : r < 0.65 ? 1 : r < 0.8 ? 2 : r < 0.92 ? 3 : 4 };
    }));
}

const PALETTES = {
  dark: {
    bg: "#0a0a0a", cells: ["#161616", "#2e2e2e", "#525252", "#8a8a8a", "#d4d4d4"],
    flash: "#ffffff", steel: ["#ffffff", "#bdbdbd", "#6b6b6b"], slit: "#050505",
    crest: "#e5e5e5", crestLine: "#7a7a7a", eye: "#ffffff",
  },
  light: {
    bg: "#ffffff", cells: ["#efefef", "#c4c4c4", "#8f8f8f", "#5a5a5a", "#262626"],
    flash: "#000000", steel: ["#8a8a8a", "#3a3a3a", "#111111"], slit: "#f5f5f5",
    crest: "#262626", crestLine: "#8f8f8f", eye: "#000000",
  },
};

const CELL = 11, GAP = 3, STEP = CELL + GAP, PAD_X = 22, PAD_TOP = 30, PAD_BOTTOM = 22;
const SECONDS_PER_DAY = 0.085, MARCH = 0.93; // last 7% of the loop: helmet rests, grid regrows

// Corinthian helmet, front view, centred on (0,0), ~26px tall.
function helmet(p) {
  const plume = Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI * (0.08 + 0.84 * (i / 12));
    const x = -Math.cos(a) * 15, y = -6 - Math.sin(a) * 11;
    return `<line x1="${(x * 0.45).toFixed(1)}" y1="${(-6 - Math.sin(a) * 4).toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join("");
  return `
  <g id="helmet">
    <path d="M-15.5 -7 A15.5 11.5 0 0 1 15.5 -7 L11 -6 A11 6 0 0 0 -11 -6 Z" fill="${p.crest}"/>
    <g stroke="${p.crestLine}" stroke-width=".9" stroke-linecap="round">${plume}</g>
    <path d="M-10 -1 C-10 -9 10 -9 10 -1 L10 8 C10 12 7 14 3.2 14.5 L3.2 6 L-3.2 6 L-3.2 14.5 C-7 14 -10 12 -10 8 Z"
      fill="url(#steel)" stroke="${p.steel[2]}" stroke-width=".8"/>
    <path d="M-8 -0.5 Q-4.5 -2.2 -1.4 -0.6 L-1.4 2.2 Q-4.5 1.2 -8 2.6 Z" fill="${p.slit}"/>
    <path d="M8 -0.5 Q4.5 -2.2 1.4 -0.6 L1.4 2.2 Q4.5 1.2 8 2.6 Z" fill="${p.slit}"/>
    <rect x="-1.4" y="-4" width="2.8" height="9" rx=".8" fill="url(#steel)"/>
    <circle class="eye" cx="-4.4" cy="0.6" r=".9" fill="${p.eye}"/>
    <circle class="eye" cx="4.4" cy="0.6" r=".9" fill="${p.eye}"/>
    <path d="M-9 -4.5 Q0 -8.5 9 -4.5" fill="none" stroke="${p.steel[0]}" stroke-opacity=".6" stroke-width=".8"/>
  </g>`;
}

function render(weeks, p) {
  const days = [];
  weeks.forEach((week, w) => {
    const ordered = w % 2 === 0 ? week : [...week].reverse(); // serpentine: down, up, down...
    for (const d of ordered) days.push({ x: PAD_X + w * STEP, y: PAD_TOP + d.weekday * STEP, level: d.level });
  });
  const width = PAD_X * 2 + weeks.length * STEP - GAP;
  const height = PAD_TOP + 7 * STEP - GAP + PAD_BOTTOM;
  const total = days.length * SECONDS_PER_DAY / MARCH;
  const last = days.length - 1;

  const cells = days.map((d, i) => {
    const base = `<rect x="${d.x}" y="${d.y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${p.cells[0]}"/>`;
    if (!d.level) return base;
    const t = (MARCH * i / last);
    const k = [0, t, Math.min(t + 0.006, MARCH), Math.min(t + 0.02, MARCH + 0.001), 0.965, 1]
      .map((v, j, a) => (j && v <= a[j - 1] ? a[j - 1] + 0.0001 : v)).map((v) => Math.min(v, 1).toFixed(4));
    k[k.length - 1] = "1";
    return base + `<rect x="${d.x}" y="${d.y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${p.cells[d.level]}">` +
      `<animate attributeName="fill" values="${p.cells[d.level]};${p.cells[d.level]};${p.flash};${p.cells[0]};${p.cells[0]};${p.cells[d.level]}" ` +
      `keyTimes="${k.join(";")}" dur="${total.toFixed(2)}s" repeatCount="indefinite"/></rect>`;
  }).join("\n");

  const c = CELL / 2;
  const path = "M" + days.map((d) => `${d.x + c} ${d.y + c}`).join(" L");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<style>
  .eye { animation: glow 2.4s ease-in-out infinite; }
  @keyframes glow { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
</style>
<defs>
  <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${p.steel[0]}"/><stop offset=".55" stop-color="${p.steel[1]}"/><stop offset="1" stop-color="${p.steel[2]}"/>
  </linearGradient>
  <radialGradient id="aura"><stop offset="0" stop-color="${p.flash}" stop-opacity=".22"/><stop offset="1" stop-color="${p.flash}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${width}" height="${height}" fill="${p.bg}"/>
${cells}
<g>
  <animateMotion path="${path}" keyPoints="0;1;1" keyTimes="0;${MARCH};1" calcMode="linear"
    dur="${total.toFixed(2)}s" repeatCount="indefinite"/>
  <circle r="20" fill="url(#aura)"/>
  <g transform="translate(0 -2)">${helmet(p)}
    <animateTransform attributeName="transform" type="translate" values="0 -2;0 -3.2;0 -2" dur=".5s" repeatCount="indefinite"/>
  </g>
</g>
</svg>
`;
}

const weeks = userArg === "--sample" ? sampleWeeks() : await fetchWeeks(userArg);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "legionary-dark.svg"), render(weeks, PALETTES.dark));
writeFileSync(join(outDir, "legionary.svg"), render(weeks, PALETTES.light));
console.log(`wrote ${weeks.length} weeks to ${outDir}`);
