// "Acta Diurna" stats card: yearly total, current streak, longest streak and a
// 12-week activity graph, rendered as greyscale SVG. No dependencies; Node 18+.
//
//   GITHUB_TOKEN=... node acta.mjs <user> <outDir>
//   node acta.mjs --sample <outDir>      (random data, for local previews)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [, , userArg, outDir = "dist"] = process.argv;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function fetchDays(user) {
  const query = `query($u:String!){user(login:$u){contributionsCollection{contributionCalendar{
    weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { u: user } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));
}

function sampleDays() {
  const today = new Date();
  return Array.from({ length: 365 }, (_, i) => {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - (364 - i));
    return { date: d.toISOString().slice(0, 10), count: Math.random() < 0.35 ? 0 : Math.floor(Math.random() ** 2 * 14) };
  });
}

function stats(days) {
  const total = days.reduce((s, d) => s + d.count, 0);
  let longest = 0, run = 0;
  for (const d of days) { run = d.count ? run + 1 : 0; longest = Math.max(longest, run); }
  // Current streak may still be alive if today has no contributions yet.
  let i = days.length - 1, current = 0;
  if (i >= 0 && !days[i].count) i--;
  while (i >= 0 && days[i].count) { current++; i--; }
  return { total, current, longest, from: days[0]?.date, to: days.at(-1)?.date };
}

// Reuse the embedded Cinzel / Cormorant fonts from the banner so the card matches it.
function fonts() {
  try {
    const banner = readFileSync(join(ROOT, "assets", "banner.svg"), "utf8");
    return [...banner.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]).join("\n");
  } catch { return ""; }
}

const PALETTES = {
  dark: { bg: "#0a0a0a", border: "#262626", big: "#f5f5f5", label: "#a3a3a3", faint: "#5c5c5c",
          rule: "#262626", line: "#e5e5e5", area: "#ffffff", dot: "#ffffff" },
  light: { bg: "#ffffff", border: "#d4d4d4", big: "#111111", label: "#525252", faint: "#8f8f8f",
           rule: "#e5e5e5", line: "#1f1f1f", area: "#000000", dot: "#000000" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (iso) => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

function roman(n) {
  if (n <= 0 || n >= 4000) return "";
  const t = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
  let s = ""; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
}

function render(days, p, fontCss) {
  const W = 1200, H = 430;
  const s = stats(days);
  const recent = days.slice(-84);
  const gx0 = 70, gx1 = W - 50, gy0 = 222, gy1 = 372;
  const max = Math.max(4, ...recent.map((d) => d.count));
  const pts = recent.map((d, i) => [gx0 + (gx1 - gx0) * i / (recent.length - 1), gy1 - (gy1 - gy0) * d.count / max]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${gx1} ${gy1} L${gx0} ${gy1} Z`;
  const len = pts.reduce((a, [x, y], i) => i ? a + Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]) : 0, 0);

  const grid = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = gy1 - (gy1 - gy0) * f;
    return `<line x1="${gx0}" y1="${y}" x2="${gx1}" y2="${y}" stroke="${p.rule}" stroke-dasharray="2 6"/>` +
      `<text x="${gx0 - 12}" y="${y + 4}" text-anchor="end" class="cz" font-size="11" fill="${p.faint}">${Math.round(max * f)}</text>`;
  }).join("");
  const ticks = recent.map((d, i) => [d, pts[i][0]]).filter(([d], i) => i % 14 === 0 || i === recent.length - 1)
    .map(([d, x]) => `<text x="${x}" y="${gy1 + 24}" text-anchor="middle" class="cz" font-size="11" letter-spacing="1" fill="${p.faint}">${fmt(d.date).slice(0, -5).toUpperCase()}</text>`).join("");
  const dots = pts.map(([x, y], i) => recent[i].count
    ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${p.dot}" class="dot" style="animation-delay:${(0.8 + i * 0.012).toFixed(2)}s"/>` : "").join("");

  const stat = (x, value, label, sub, delay) => `
  <g class="rise" style="animation-delay:${delay}s">
    <text x="${x}" y="92" text-anchor="middle" class="cz" font-size="54" font-weight="700" fill="${p.big}">${value}</text>
    <text x="${x}" y="124" text-anchor="middle" class="cz" font-size="13" letter-spacing="5" fill="${p.label}">${label}</text>
    <text x="${x}" y="150" text-anchor="middle" class="it" font-size="17" fill="${p.faint}">${sub}</text>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
${fontCss}
.cz { font-family: 'Cinzel', 'Trajan Pro', 'Times New Roman', serif; }
.it { font-family: 'Corm', 'Cormorant Garamond', Georgia, serif; font-style: italic; }
.rise { opacity: 0; animation: rise .9s cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.trace { stroke-dasharray: ${len.toFixed(0)}; stroke-dashoffset: ${len.toFixed(0)}; animation: draw 2.2s ease-out .6s forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.fill { opacity: 0; animation: show 1.2s ease-out 1.6s forwards; }
.dot { opacity: 0; animation: show .4s ease-out forwards; }
@keyframes show { to { opacity: 1; } }
</style>
<defs>
  <linearGradient id="areaFade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.area}" stop-opacity=".22"/><stop offset="1" stop-color="${p.area}" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="${p.bg}" stroke="${p.border}"/>
${stat(W / 6, s.total, "CONTRIBUTIONS", s.from ? `${fmt(s.from)} — ${fmt(s.to)}` : "", 0.1)}
${stat(W / 2, s.current, "CURRENT STREAK", s.current ? `${roman(s.current)} dies in a row` : "the march begins today", 0.3)}
${stat(W * 5 / 6, s.longest, "LONGEST STREAK", s.longest ? `${roman(s.longest)} dies unbroken` : "yet to be written", 0.5)}
<line x1="${W / 3}" y1="50" x2="${W / 3}" y2="150" stroke="${p.rule}"/>
<line x1="${W * 2 / 3}" y1="50" x2="${W * 2 / 3}" y2="150" stroke="${p.rule}"/>
<text x="${gx0}" y="200" class="cz" font-size="12" letter-spacing="5" fill="${p.label}">LAST XII WEEKS</text>
${grid}
<line x1="${gx0}" y1="${gy1}" x2="${gx1}" y2="${gy1}" stroke="${p.faint}"/>
<path class="fill" d="${area}" fill="url(#areaFade)"/>
<path class="trace" d="${line}" fill="none" stroke="${p.line}" stroke-width="2" stroke-linejoin="round"/>
${dots}
${ticks}
</svg>
`;
}

const days = userArg === "--sample" ? sampleDays() : await fetchDays(userArg);
const fontCss = fonts();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "acta-dark.svg"), render(days, PALETTES.dark, fontCss));
writeFileSync(join(outDir, "acta.svg"), render(days, PALETTES.light, fontCss));
console.log(`wrote acta cards for ${days.length} days to ${outDir}`, stats(days));
