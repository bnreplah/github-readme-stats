// @ts-check

import { Card } from "../common/Card.js";
import { getCardColors } from "../common/color.js";
import { encodeHTML } from "../common/html.js";

const CARD_W = 495;
const CARD_H = 200;
const PAD_X = 25;
const CHART_TOP = 14;
const CHART_BOT = 128;
const CHART_H = CHART_BOT - CHART_TOP; // 114
const USABLE_W = CARD_W - 2 * PAD_X; // 445

// ── Color helpers ─────────────────────────────────────────────────────────────

/**
 * @param {string} hex
 * @returns {[number, number, number]}
 */
const hexToRgb = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
const rgbToHex = (r, g, b) =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.min(255, Math.max(0, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

/**
 * @param {string} hex
 * @param {number} amt 0–1
 * @returns {string}
 */
const lightenHex = (hex, amt) => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amt,
    g + (255 - g) * amt,
    b + (255 - b) * amt,
  );
};

/**
 * @param {string} hex
 * @param {number} amt 0–1
 * @returns {string}
 */
const darkenHex = (hex, amt) => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
};

/**
 * Map a normalized 0–1 contribution count to a GitHub-style green level.
 * @param {number} norm Normalized contribution count (0–1).
 * @returns {string|null} CSS color string or null for zero contributions.
 */
const getColor = (norm) => {
  if (norm <= 0) {
    return null;
  }
  if (norm < 0.33) {
    return "#9be9a8";
  }
  if (norm < 0.66) {
    return "#40c463";
  }
  if (norm < 0.85) {
    return "#30a14e";
  }
  return "#216e39";
};

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @returns {Array<number>}
 */
const weekTotals = (weeks) =>
  weeks.map((w) =>
    w.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
  );

/**
 * @param {Array<number>} totals
 * @returns {number}
 */
const maxOfTotals = (totals) => Math.max(...totals, 1);

/**
 * @param {Array<object>} weeks
 * @returns {number}
 */
const maxDayCount = (weeks) =>
  Math.max(
    ...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)),
    1,
  );

/**
 * @param {string} borderColor
 * @returns {string}
 */
const groundLine = (borderColor) =>
  `<line x1="${PAD_X}" y1="${CHART_BOT}" x2="${CARD_W - PAD_X}" y2="${CHART_BOT}" stroke="${borderColor}" stroke-width="0.5" opacity="0.4" />`;

// ── Renderer: bars3d ──────────────────────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @param {string} borderColor
 * @returns {string}
 */
const renderBars3d = (weeks, borderColor) => {
  const totals = weekTotals(weeks);
  const maxT = maxOfTotals(totals);
  const nw = weeks.length;
  const barW = USABLE_W / nw;
  const blkW = Math.max(barW - 1, 1);
  const D = 3;

  const bars = totals
    .map((total, wi) => {
      if (total === 0) {
        return "";
      }
      const norm = total / maxT;
      const color = getColor(norm) ?? "#9be9a8";
      const topColor = lightenHex(color, 0.3);
      const sideColor = darkenHex(color, 0.3);
      const x = PAD_X + wi * barW;
      const bh = norm * CHART_H * 0.88;
      const ty = CHART_BOT - bh;
      const x2 = x + blkW;
      const xD = x + D;
      const x2D = x2 + D;
      const tyD = ty - D;
      const botD = CHART_BOT - D;
      const front = `<rect x="${x.toFixed(1)}" y="${ty.toFixed(1)}" width="${blkW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}" />`;
      const topFace = `<polygon points="${x.toFixed(1)},${ty.toFixed(1)} ${xD.toFixed(1)},${tyD.toFixed(1)} ${x2D.toFixed(1)},${tyD.toFixed(1)} ${x2.toFixed(1)},${ty.toFixed(1)}" fill="${topColor}" />`;
      const rightFace = `<polygon points="${x2.toFixed(1)},${ty.toFixed(1)} ${x2D.toFixed(1)},${tyD.toFixed(1)} ${x2D.toFixed(1)},${botD.toFixed(1)} ${x2.toFixed(1)},${CHART_BOT.toFixed(1)}" fill="${sideColor}" />`;
      return topFace + rightFace + front;
    })
    .join("");

  return bars + groundLine(borderColor);
};

// ── Renderer: scatter3d ───────────────────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @param {string} borderColor
 * @returns {string}
 */
const renderScatter = (weeks, borderColor) => {
  const nw = weeks.length;
  const maxC = maxDayCount(weeks);

  const grid = [0.25, 0.5, 0.75, 1]
    .map((v) => {
      const y = CHART_BOT - v * CHART_H * 0.88;
      return `<line x1="${PAD_X}" y1="${y.toFixed(1)}" x2="${CARD_W - PAD_X}" y2="${y.toFixed(1)}" stroke="${borderColor}" stroke-width="0.5" opacity="0.2" stroke-dasharray="3,3" />`;
    })
    .join("");

  const dots = weeks
    .flatMap((week, wi) =>
      week.contributionDays
        .filter((d) => d.contributionCount > 0)
        .map((d) => {
          const norm = d.contributionCount / maxC;
          const color = getColor(norm) ?? "#9be9a8";
          const x = PAD_X + (wi / Math.max(nw - 1, 1)) * USABLE_W;
          const y = CHART_BOT - norm * CHART_H * 0.88;
          const r = Math.max(norm * 5 + 1, 1.5);
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="0.8" />`;
        }),
    )
    .join("");

  return grid + dots + groundLine(borderColor);
};

// ── Renderer: surface (area chart) ───────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @param {string} borderColor
 * @returns {string}
 */
const renderSurface = (weeks, borderColor) => {
  const totals = weekTotals(weeks);
  const maxT = maxOfTotals(totals);
  const nw = weeks.length;

  const pts = totals.map((t, wi) => [
    PAD_X + (wi / Math.max(nw - 1, 1)) * USABLE_W,
    CHART_BOT - (t / maxT) * CHART_H * 0.88,
  ]);

  let dSmooth = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cpx = (x0 + x1) / 2;
    dSmooth += ` C${cpx.toFixed(1)},${y0.toFixed(1)} ${cpx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const dFill =
    dSmooth +
    ` L${(CARD_W - PAD_X).toFixed(1)},${CHART_BOT} L${PAD_X},${CHART_BOT} Z`;

  const area = `<path d="${dFill}" fill="#40c463" fill-opacity="0.15" />`;
  const line = `<path d="${dSmooth}" fill="none" stroke="#40c463" stroke-width="1.5" opacity="0.9" />`;

  // Secondary smoothed line at 60 % amplitude for depth effect
  let dSmooth2 = `M${pts[0][0].toFixed(1)},${(CHART_BOT - ((CHART_BOT - pts[0][1]) * 0.6)).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cpx = (x0 + x1) / 2;
    const sy0 = CHART_BOT - (CHART_BOT - y0) * 0.6;
    const sy1 = CHART_BOT - (CHART_BOT - y1) * 0.6;
    dSmooth2 += ` C${cpx.toFixed(1)},${sy0.toFixed(1)} ${cpx.toFixed(1)},${sy1.toFixed(1)} ${x1.toFixed(1)},${sy1.toFixed(1)}`;
  }
  const line2 = `<path d="${dSmooth2}" fill="none" stroke="#30a14e" stroke-width="0.8" opacity="0.5" />`;

  return area + line2 + line + groundLine(borderColor);
};

// ── Renderer: helix (double helix) ────────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @param {string} borderColor
 * @returns {string}
 */
const renderHelix = (weeks, borderColor) => {
  const totals = weekTotals(weeks);
  const maxT = maxOfTotals(totals);
  const nw = weeks.length;
  const cy = CHART_TOP + CHART_H / 2;
  const amp = CHART_H * 0.28;
  const period = 13;

  const pts1 = totals.map((t, wi) => {
    const x = PAD_X + (wi / Math.max(nw - 1, 1)) * USABLE_W;
    const theta = (2 * Math.PI * wi) / period;
    return [x, cy + amp * Math.sin(theta), t];
  });

  const pts2 = totals.map((t, wi) => {
    const x = PAD_X + (wi / Math.max(nw - 1, 1)) * USABLE_W;
    const theta = (2 * Math.PI * wi) / period;
    return [x, cy - amp * Math.sin(theta), t];
  });

  const polyline = (pts, color) =>
    `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="1" opacity="0.45" />`;

  const renderDots = (pts) =>
    pts
      .map(([x, y, t]) => {
        if (t === 0) {
          return "";
        }
        const norm = t / maxT;
        const color = getColor(norm) ?? "#9be9a8";
        const r = Math.max(norm * 5 + 1.5, 1.5);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" />`;
      })
      .join("");

  return (
    polyline(pts1, "#40c463") +
    polyline(pts2, "#30a14e") +
    renderDots(pts2) +
    renderDots(pts1) +
    groundLine(borderColor)
  );
};

// ── Renderer: network ─────────────────────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @param {string} borderColor
 * @returns {string}
 */
const renderNetwork = (weeks, borderColor) => {
  const totals = weekTotals(weeks);
  const maxT = maxOfTotals(totals);
  const nw = weeks.length;
  const cy = CHART_TOP + CHART_H / 2;

  const nodes = totals.map((t, wi) => ({
    x: PAD_X + (wi / Math.max(nw - 1, 1)) * USABLE_W,
    y: cy + Math.sin((Math.PI * wi) / nw) * (CHART_H * 0.22),
    norm: t / maxT,
  }));

  const edges = nodes
    .map((node, i) => {
      let out = "";
      if (i + 1 < nodes.length) {
        const n2 = nodes[i + 1];
        const op = Math.max(0.08, (node.norm + n2.norm) / 2) * 0.4;
        out += `<line x1="${node.x.toFixed(1)}" y1="${node.y.toFixed(1)}" x2="${n2.x.toFixed(1)}" y2="${n2.y.toFixed(1)}" stroke="${borderColor}" stroke-width="0.6" opacity="${op.toFixed(2)}" />`;
      }
      if (i + 3 < nodes.length) {
        const n3 = nodes[i + 3];
        if (node.norm > 0.4 && n3.norm > 0.4) {
          const op = Math.min(node.norm, n3.norm) * 0.15;
          out += `<line x1="${node.x.toFixed(1)}" y1="${node.y.toFixed(1)}" x2="${n3.x.toFixed(1)}" y2="${n3.y.toFixed(1)}" stroke="${borderColor}" stroke-width="0.4" opacity="${op.toFixed(2)}" />`;
        }
      }
      return out;
    })
    .join("");

  const circles = nodes
    .map(({ x, y, norm }) => {
      if (norm <= 0) {
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1" fill="${borderColor}" opacity="0.3" />`;
      }
      const color = getColor(norm) ?? "#9be9a8";
      const r = Math.max(norm * 8 + 1.5, 1.5);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="0.85" />`;
    })
    .join("");

  return edges + circles;
};

// ── Renderer: particles (heatmap grid) ────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @param {string} borderColor
 * @returns {string}
 */
const renderParticles = (weeks, borderColor) => {
  const maxC = maxDayCount(weeks);
  const SZ = 7;
  const GAP = 1;
  const UNIT = SZ + GAP;
  const gridW = weeks.length * UNIT;
  const startX = PAD_X + Math.max((USABLE_W - gridW) / 2, 0);
  const startY = CHART_TOP + (CHART_H - 7 * UNIT) / 2;

  const cells = weeks
    .flatMap((week, wi) =>
      week.contributionDays.map((day, di) => {
        const x = startX + wi * UNIT;
        const y = startY + di * UNIT;
        if (day.contributionCount <= 0) {
          return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${SZ}" height="${SZ}" fill="${borderColor}" opacity="0.15" rx="1" />`;
        }
        const norm = day.contributionCount / maxC;
        const color = getColor(norm) ?? "#9be9a8";
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${SZ}" height="${SZ}" fill="${color}" rx="1" />`;
      }),
    )
    .join("");

  return cells;
};

// ── Renderer: spiral ──────────────────────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @param {string} borderColor
 * @returns {string}
 */
const renderSpiral = (weeks, borderColor) => {
  const maxC = maxDayCount(weeks);
  const cx = CARD_W / 2;
  const cy = CHART_TOP + CHART_H / 2;
  const rMax = Math.min(CHART_H / 2, USABLE_W / 2) - 5;
  const rMin = 6;
  const revolutions = 2.5;
  const allDays = weeks.flatMap((w) => w.contributionDays);
  const total = allDays.length;

  const dots = allDays
    .map((day, i) => {
      const theta = (i / total) * 2 * Math.PI * revolutions;
      const r = rMin + (i / total) * (rMax - rMin);
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      if (day.contributionCount <= 0) {
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.7" fill="${borderColor}" opacity="0.18" />`;
      }
      const norm = day.contributionCount / maxC;
      const color = getColor(norm) ?? "#9be9a8";
      const dotR = Math.max(norm * 4 + 0.8, 0.8);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${color}" fill-opacity="0.9" />`;
    })
    .join("");

  return dots;
};

// ── Renderer: terrain (ridge plot) ────────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @param {string} borderColor
 * @returns {string}
 */
const renderTerrain = (weeks, borderColor) => {
  const totals = weekTotals(weeks);
  const nw = weeks.length;
  const ridges = 5;
  const ridgeH = (CHART_H / ridges) * 0.9;
  const ridgeSpacing = CHART_H / ridges;
  const colors = ["#216e39", "#30a14e", "#40c463", "#56d473", "#9be9a8"];

  const paths = Array.from({ length: ridges }, (_, ri) => {
    const sliceStart = Math.floor((ri * nw) / ridges);
    const sliceEnd = Math.floor(((ri + 1) * nw) / ridges);
    const slice = totals.slice(sliceStart, sliceEnd);
    const maxS = Math.max(...slice, 1);
    const baseY = CHART_BOT - ri * ridgeSpacing;
    const sliceN = slice.length;
    if (sliceN === 0) {
      return "";
    }

    let d = `M${PAD_X},${baseY}`;
    slice.forEach((t, si) => {
      const x = PAD_X + ((sliceStart + si) / Math.max(nw - 1, 1)) * USABLE_W;
      const y = baseY - (t / maxS) * ridgeH;
      d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const lastX =
      PAD_X + ((sliceStart + sliceN - 1) / Math.max(nw - 1, 1)) * USABLE_W;
    d += ` L${lastX.toFixed(1)},${baseY} Z`;

    return `<path d="${d}" fill="${colors[ri]}" fill-opacity="${(0.35 + ri * 0.08).toFixed(2)}" stroke="${colors[ri]}" stroke-width="0.8" stroke-opacity="0.9" />`;
  });

  return paths.join("") + groundLine(borderColor);
};

// ── Renderer: constellation ───────────────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @param {string} borderColor
 * @returns {string}
 */
const renderConstellation = (weeks, borderColor) => {
  const maxC = maxDayCount(weeks);
  const nw = weeks.length;
  const threshold = maxC * 0.5;

  const positions = weeks.flatMap((week, wi) =>
    week.contributionDays.map((day, di) => ({
      x: PAD_X + (wi / Math.max(nw - 1, 1)) * USABLE_W,
      y: CHART_TOP + 5 + (di / 6) * (CHART_H - 10),
      count: day.contributionCount,
      norm: day.contributionCount / maxC,
    })),
  );

  const bright = positions.filter((p) => p.count >= threshold);

  const lines = bright
    .flatMap((p, i) =>
      bright.slice(i + 1).flatMap((q) => {
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        if (Math.sqrt(dx * dx + dy * dy) >= 50) {
          return [];
        }
        const op = (Math.min(p.norm, q.norm) * 0.4).toFixed(2);
        return [
          `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="#40c463" stroke-width="0.4" opacity="${op}" />`,
        ];
      }),
    )
    .join("");

  const dots = positions
    .map(({ x, y, count, norm }) => {
      if (count <= 0) {
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.8" fill="${borderColor}" opacity="0.14" />`;
      }
      const color = getColor(norm) ?? "#9be9a8";
      const r = Math.max(norm * 5 + 0.8, 0.8);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="0.9" />`;
    })
    .join("");

  return lines + dots;
};

// ── Renderer: voxels (isometric cubes) ────────────────────────────────────────

/**
 * @param {Array<object>} weeks
 * @param {string} borderColor
 * @returns {string}
 */
const renderVoxels = (weeks, borderColor) => {
  const totals = weekTotals(weeks);
  const maxT = maxOfTotals(totals);
  const nw = weeks.length;
  const barW = USABLE_W / nw;
  const blkW = Math.max(barW - 2, 1);
  const CZ = 3;
  const cubeH = blkW * 0.45;
  const maxStack = Math.max(1, Math.floor((CHART_H * 0.88) / (cubeH + 1)));

  const voxels = totals
    .map((total, wi) => {
      if (total === 0) {
        return "";
      }
      const norm = total / maxT;
      const stackH = Math.max(1, Math.round(norm * maxStack));
      const color = getColor(norm) ?? "#9be9a8";
      const lightC = lightenHex(color, 0.25);
      const darkC = darkenHex(color, 0.35);
      const x = PAD_X + wi * barW;
      const x2 = x + blkW;

      return Array.from({ length: stackH }, (_, si) => {
        const baseY = CHART_BOT - si * (cubeH + 1);
        const topY = baseY - cubeH;
        const topYD = topY - CZ;
        const x2D = x2 + CZ;
        const xD = x + CZ;
        const front = `<polygon points="${x.toFixed(1)},${topY.toFixed(1)} ${x2.toFixed(1)},${topY.toFixed(1)} ${x2.toFixed(1)},${baseY.toFixed(1)} ${x.toFixed(1)},${baseY.toFixed(1)}" fill="${color}" />`;
        const top = `<polygon points="${x.toFixed(1)},${topY.toFixed(1)} ${xD.toFixed(1)},${topYD.toFixed(1)} ${x2D.toFixed(1)},${topYD.toFixed(1)} ${x2.toFixed(1)},${topY.toFixed(1)}" fill="${lightC}" />`;
        const right = `<polygon points="${x2.toFixed(1)},${topY.toFixed(1)} ${x2D.toFixed(1)},${topYD.toFixed(1)} ${x2D.toFixed(1)},${(baseY - CZ).toFixed(1)} ${x2.toFixed(1)},${baseY.toFixed(1)}" fill="${darkC}" />`;
        return top + right + front;
      }).join("");
    })
    .join("");

  return voxels + groundLine(borderColor);
};

// ── Dispatch table ────────────────────────────────────────────────────────────

const VIZ_RENDERERS = {
  /**
   * @param {Array<object>} w
   * @param {string} _tc
   * @param {string} bc
   * @returns {string}
   */
  bars3d: (w, _tc, bc) => renderBars3d(w, bc),
  /**
   * @param {Array<object>} w
   * @param {string} _tc
   * @param {string} bc
   * @returns {string}
   */
  scatter3d: (w, _tc, bc) => renderScatter(w, bc),
  /**
   * @param {Array<object>} w
   * @param {string} _tc
   * @param {string} bc
   * @returns {string}
   */
  surface: (w, _tc, bc) => renderSurface(w, bc),
  /**
   * @param {Array<object>} w
   * @param {string} _tc
   * @param {string} bc
   * @returns {string}
   */
  helix: (w, _tc, bc) => renderHelix(w, bc),
  /**
   * @param {Array<object>} w
   * @param {string} _tc
   * @param {string} bc
   * @returns {string}
   */
  network: (w, _tc, bc) => renderNetwork(w, bc),
  /**
   * @param {Array<object>} w
   * @param {string} _tc
   * @param {string} bc
   * @returns {string}
   */
  particles: (w, _tc, bc) => renderParticles(w, bc),
  /**
   * @param {Array<object>} w
   * @param {string} _tc
   * @param {string} bc
   * @returns {string}
   */
  spiral: (w, _tc, bc) => renderSpiral(w, bc),
  /**
   * @param {Array<object>} w
   * @param {string} _tc
   * @param {string} bc
   * @returns {string}
   */
  terrain: (w, _tc, bc) => renderTerrain(w, bc),
  /**
   * @param {Array<object>} w
   * @param {string} _tc
   * @param {string} bc
   * @returns {string}
   */
  constellation: (w, _tc, bc) => renderConstellation(w, bc),
  /**
   * @param {Array<object>} w
   * @param {string} _tc
   * @param {string} bc
   * @returns {string}
   */
  voxels: (w, _tc, bc) => renderVoxels(w, bc),
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render a static SVG card visualizing GitHub contribution data.
 *
 * Supports all DataViz3D viz types as 2D SVG analogues that can be embedded
 * directly in GitHub READMEs via `<img>` or Markdown image syntax.
 *
 * @param {object} data Skyline data from fetchSkyline.
 * @param {object} options Render options.
 * @param {string} [options.viz] Visualization type (bars3d, scatter3d, surface, etc.).
 * @param {string} [options.title_color] Card title color override.
 * @param {string} [options.text_color] Card text color override.
 * @param {string} [options.bg_color] Card background color override.
 * @param {string} [options.border_color] Card border color override.
 * @param {string} [options.theme] Theme name.
 * @param {boolean} [options.hide_border] Hide the card border.
 * @param {boolean} [options.hide_title] Hide the card title.
 * @param {string} [options.border_radius] Card border radius override.
 * @param {string} [options.custom_title] Custom title text.
 * @param {boolean} [options.disable_animations] Disable SVG animations.
 * @returns {string} SVG markup.
 */
const renderDatavizSvgCard = (data, options = {}) => {
  const {
    viz = "bars3d",
    title_color,
    text_color,
    bg_color,
    border_color,
    theme = "default",
    hide_border = false,
    hide_title = false,
    border_radius,
    custom_title,
    disable_animations = false,
  } = options;

  const { titleColor, textColor, bgColor, borderColor } = getCardColors({
    title_color,
    text_color,
    icon_color: "",
    bg_color,
    border_color,
    ring_color: "",
    theme,
  });

  const { name, totalContributions, weeks, year } = data;

  const vizType = Object.hasOwn(VIZ_RENDERERS, viz) ? viz : "bars3d";
  const renderer = VIZ_RENDERERS[vizType];

  const summaryLabel = `<text x="${CARD_W - PAD_X}" y="5" fill="${textColor}" font-size="10" font-family="'Segoe UI', Ubuntu, Sans-Serif" text-anchor="end" opacity="0.6">${year} · ${totalContributions.toLocaleString()} contributions</text>`;

  const vizBody = renderer(weeks, textColor, borderColor);

  const card = new Card({
    customTitle: custom_title,
    defaultTitle: `${encodeHTML(name)}'s Contributions`,
    width: CARD_W,
    height: CARD_H,
    border_radius,
    colors: { titleColor, textColor, bgColor, borderColor },
  });

  card.setHideBorder(hide_border);
  card.setHideTitle(hide_title);
  card.setAccessibilityLabel({
    title: `${name}'s GitHub contributions for ${year}`,
    desc: `${vizType} chart showing ${totalContributions} total contributions in ${year}`,
  });

  if (disable_animations) {
    card.disableAnimations();
  }

  return card.render(`${summaryLabel}${vizBody}`);
};

export { renderDatavizSvgCard };
export default renderDatavizSvgCard;
