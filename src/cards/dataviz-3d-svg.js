// @ts-check
/**
 * Server-side 3D perspective SVG renderer for GitHub contribution data.
 *
 * Ports the rotation matrices and perspective projection from the DataViz3D
 * canvas engine into static SVG output suitable for embedding in GitHub READMEs.
 * Uses the same rotX / rotY angles that the interactive canvas exposes so
 * captured view angles produce identical-looking static badges.
 */

import { Card } from "../common/Card.js";
import { getCardColors } from "../common/color.js";
import { encodeHTML } from "../common/html.js";

// ── SVG canvas geometry ───────────────────────────────────────────────────────

const CARD_W = 495;
const CARD_H = 200;
const CX = CARD_W / 2; // horizontal centre of card
const GROUND_Y = 118; // ground level in body-relative Y coords
const SCALE = 28; // 3-D world units → SVG pixels
const FOV = 380; // perspective distance
const MAX_BAR_H = 2.6; // max bar height in 3-D units
const X_SPREAD = 5; // week axis half-width
const Z_SPREAD = 1.5; // day axis half-depth

// ── Math ──────────────────────────────────────────────────────────────────────

const { cos, sin, max, min, round, sqrt, abs, PI } = Math;

/**
 * Apply X-axis rotation (pitch).
 * @param {[number, number, number]} p Input point.
 * @param {number} a Angle in radians.
 * @returns {[number, number, number]} Rotated point.
 */
const rotX = ([x, y, z], a) => [x, y * cos(a) - z * sin(a), y * sin(a) + z * cos(a)];

/**
 * Apply Y-axis rotation (yaw).
 * @param {[number, number, number]} p Input point.
 * @param {number} a Angle in radians.
 * @returns {[number, number, number]} Rotated point.
 */
const rotY = ([x, y, z], a) => [x * cos(a) + z * sin(a), y, -x * sin(a) + z * cos(a)];

/**
 * Project a rotated 3-D point to SVG body coordinates using perspective.
 * @param {[number, number, number]} p3 Rotated point [x, y, z].
 * @returns {{sx: number, sy: number, sz: number, ps: number}} Projected screen point.
 */
const project = ([x, y, z]) => {
  const d = FOV + z * SCALE;
  const ps = d > 0 ? FOV / d : 1;
  return { sx: CX + x * ps * SCALE, sy: GROUND_Y - y * ps * SCALE, sz: z, ps };
};

/**
 * Full pipeline: rotate then project a world-space point.
 * @param {[number, number, number]} p World point.
 * @param {number} rx Camera pitch (radians).
 * @param {number} ry Camera yaw (radians).
 * @returns {{sx: number, sy: number, sz: number, ps: number}} Screen point.
 */
const xform = (p, rx, ry) => project(rotY(rotX(p, rx), ry));

// ── Colour helpers ────────────────────────────────────────────────────────────

/**
 * @param {string} hex Hex colour string.
 * @returns {[number, number, number]} RGB triple.
 */
const hexToRgb = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * @param {number} r Red 0–255.
 * @param {number} g Green 0–255.
 * @param {number} b Blue 0–255.
 * @returns {string} Hex colour string.
 */
const rgbToHex = (r, g, b) =>
  "#" +
  [r, g, b]
    .map((v) => min(255, max(0, round(v))).toString(16).padStart(2, "0"))
    .join("");

/**
 * @param {string} hex Base colour.
 * @param {number} amt Amount to lighten (0–1).
 * @returns {string} Lightened hex colour.
 */
const lighten = (hex, amt) => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
};

/**
 * @param {string} hex Base colour.
 * @param {number} amt Amount to darken (0–1).
 * @returns {string} Darkened hex colour.
 */
const darken = (hex, amt) => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
};

/**
 * Map a normalised contribution value to a GitHub-style green.
 * @param {number} norm Normalised count (0–1).
 * @returns {string|null} CSS colour or null for zero.
 */
const getColor = (norm) => {
  if (norm <= 0) { return null; }
  if (norm < 0.33) { return "#9be9a8"; }
  if (norm < 0.66) { return "#40c463"; }
  if (norm < 0.85) { return "#30a14e"; }
  return "#216e39";
};

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * @param {Array<object>} weeks Contribution weeks.
 * @returns {number} Max single-day contribution count.
 */
const maxDay = (weeks) =>
  max(...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)), 1);

/**
 * @param {Array<object>} weeks Contribution weeks.
 * @returns {Array<number>} Per-week totals.
 */
const weekTotals = (weeks) =>
  weeks.map((w) => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0));

/**
 * SVG polygon helper.
 * @param {Array<{sx: number, sy: number}>} verts Projected vertices.
 * @param {string} fill Fill colour.
 * @param {number} [opacity] Fill opacity.
 * @returns {string} SVG polygon element.
 */
const poly = (verts, fill, opacity = 1) => {
  const pts = verts.map((v) => `${v.sx.toFixed(1)},${v.sy.toFixed(1)}`).join(" ");
  const op = opacity < 1 ? ` fill-opacity="${opacity.toFixed(2)}"` : "";
  return `<polygon points="${pts}" fill="${fill}"${op} />`;
};

// ── Renderer: 3-D ground grid ─────────────────────────────────────────────────

/**
 * @param {number} rx Camera pitch.
 * @param {number} ry Camera yaw.
 * @param {string} borderColor Border/grid colour.
 * @returns {string} SVG grid lines.
 */
const renderGroundGrid = (rx, ry, borderColor) => {
  const lines = [];
  // Along X (week axis)
  for (let xi = -X_SPREAD; xi <= X_SPREAD; xi += 2) {
    const a = xform([xi, 0, -Z_SPREAD], rx, ry);
    const b = xform([xi, 0, Z_SPREAD], rx, ry);
    lines.push(
      `<line x1="${a.sx.toFixed(1)}" y1="${a.sy.toFixed(1)}" x2="${b.sx.toFixed(1)}" y2="${b.sy.toFixed(1)}" stroke="${borderColor}" stroke-width="0.4" opacity="0.2" />`,
    );
  }
  // Along Z (day axis)
  for (let zi = -Z_SPREAD; zi <= Z_SPREAD; zi += Z_SPREAD / 2) {
    const a = xform([-X_SPREAD, 0, zi], rx, ry);
    const b = xform([X_SPREAD, 0, zi], rx, ry);
    lines.push(
      `<line x1="${a.sx.toFixed(1)}" y1="${a.sy.toFixed(1)}" x2="${b.sx.toFixed(1)}" y2="${b.sy.toFixed(1)}" stroke="${borderColor}" stroke-width="0.4" opacity="0.2" />`,
    );
  }
  return lines.join("");
};

// ── Renderer: bars3d / voxels / terrain ───────────────────────────────────────

/**
 * Render each contribution day as a 3-D box with three visible faces
 * (top, front/back, left/right) determined by camera yaw.
 * @param {Array<object>} weeks Contribution weeks.
 * @param {number} rx Camera pitch.
 * @param {number} ry Camera yaw.
 * @param {string} borderColor Grid colour.
 * @returns {string} SVG elements.
 */
const render3dBars = (weeks, rx, ry, borderColor) => {
  const numWeeks = weeks.length;
  const maxC = maxDay(weeks);

  // Bar footprint in world units
  const barW = (2 * X_SPREAD / numWeeks) * 0.78;
  const barD = (2 * Z_SPREAD / 7) * 0.78;
  const hw = barW / 2;
  const hd = barD / 2;

  // Which faces face the camera
  const showFront = cos(ry) > 0; // Z- face
  const showRight = sin(ry) > 0; // X+ face

  // Collect all bars first so we can depth-sort
  const bars = [];
  weeks.forEach((week, wi) => {
    const wx =
      numWeeks > 1 ? ((wi / (numWeeks - 1)) * 2 - 1) * X_SPREAD : 0;
    week.contributionDays.forEach((day, di) => {
      if (day.contributionCount <= 0) {
        return;
      }
      const wz = ((di / 6) * 2 - 1) * Z_SPREAD;
      const norm = day.contributionCount / maxC;
      const h = norm * MAX_BAR_H;
      // Sort key: projected Z of bar centre
      const centre = xform([wx, h / 2, wz], rx, ry);
      bars.push({ wx, wz, h, norm, centerSz: centre.sz });
    });
  });

  // Back-to-front
  bars.sort((a, b) => b.centerSz - a.centerSz);

  const svgs = bars.map(({ wx, wz, h, norm }) => {
    const color = getColor(norm);
    if (!color) {
      return "";
    }
    const topColor = lighten(color, 0.28);
    const sideColor = darken(color, 0.3);

    // 8 box corners
    const c = [
      xform([wx - hw, 0, wz - hd], rx, ry), // 0 front-left-bot
      xform([wx + hw, 0, wz - hd], rx, ry), // 1 front-right-bot
      xform([wx + hw, h, wz - hd], rx, ry), // 2 front-right-top
      xform([wx - hw, h, wz - hd], rx, ry), // 3 front-left-top
      xform([wx - hw, 0, wz + hd], rx, ry), // 4 back-left-bot
      xform([wx + hw, 0, wz + hd], rx, ry), // 5 back-right-bot
      xform([wx + hw, h, wz + hd], rx, ry), // 6 back-right-top
      xform([wx - hw, h, wz + hd], rx, ry), // 7 back-left-top
    ];

    const parts = [];
    // Top face (always visible looking down)
    parts.push(poly([c[3], c[2], c[6], c[7]], topColor));
    // Front or back face
    parts.push(showFront ? poly([c[0], c[1], c[2], c[3]], color) : poly([c[4], c[5], c[6], c[7]], color));
    // Right or left face
    parts.push(showRight ? poly([c[1], c[5], c[6], c[2]], sideColor) : poly([c[0], c[4], c[7], c[3]], sideColor));
    return parts.join("");
  });

  return renderGroundGrid(rx, ry, borderColor) + svgs.join("");
};

// ── Renderer: scatter3d / particles / network ─────────────────────────────────

/**
 * Project each active contribution day as a depth-sorted circle.
 * @param {Array<object>} weeks Contribution weeks.
 * @param {number} rx Camera pitch.
 * @param {number} ry Camera yaw.
 * @returns {string} SVG elements.
 */
const render3dScatter = (weeks, rx, ry) => {
  const numWeeks = weeks.length;
  const maxC = maxDay(weeks);

  const projected = weeks
    .flatMap((week, wi) =>
      week.contributionDays
        .filter((d) => d.contributionCount > 0)
        .map((day, di) => {
          const x3 = numWeeks > 1 ? ((wi / (numWeeks - 1)) * 2 - 1) * X_SPREAD : 0;
          const y3 = (day.contributionCount / maxC) * MAX_BAR_H;
          const z3 = ((di / 6) * 2 - 1) * Z_SPREAD;
          const norm = day.contributionCount / maxC;
          return { pt: xform([x3, y3, z3], rx, ry), norm };
        }),
    )
    .sort((a, b) => b.pt.sz - a.pt.sz);

  return projected
    .map(({ pt, norm }) => {
      const color = getColor(norm) ?? "#9be9a8";
      const r = max(norm * 5.5 + 1.2, 1.2) * pt.ps;
      return `<circle cx="${pt.sx.toFixed(1)}" cy="${pt.sy.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="0.85" />`;
    })
    .join("");
};

// ── Renderer: helix / spiral ──────────────────────────────────────────────────

/**
 * Render a 3-D double helix with contribution-coloured dots on each strand.
 * @param {Array<object>} weeks Contribution weeks.
 * @param {number} rx Camera pitch.
 * @param {number} ry Camera yaw.
 * @returns {string} SVG elements.
 */
const render3dHelix = (weeks, rx, ry) => {
  const totals = weekTotals(weeks);
  const maxT = max(...totals, 1);
  const nw = weeks.length;
  const period = 13;
  const amp = 1.3;

  const buildStrand = (phaseOffset) =>
    totals.map((t, wi) => {
      const theta = (wi / period) * 2 * PI + phaseOffset;
      const xPos = nw > 1 ? ((wi / (nw - 1)) * 2 - 1) * X_SPREAD : 0;
      return { pt: xform([xPos, amp * sin(theta), amp * cos(theta)], rx, ry), norm: t / maxT };
    });

  const strand1 = buildStrand(0);
  const strand2 = buildStrand(PI);

  const all = [...strand1, ...strand2].sort((a, b) => b.pt.sz - a.pt.sz);

  return all
    .map(({ pt, norm }) => {
      if (norm <= 0) {
        return "";
      }
      const color = getColor(norm) ?? "#9be9a8";
      const r = max(norm * 5 + 1.5, 1.5) * pt.ps;
      return `<circle cx="${pt.sx.toFixed(1)}" cy="${pt.sy.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="0.9" />`;
    })
    .join("");
};

// ── Renderer: spiral ──────────────────────────────────────────────────────────

/**
 * Render contribution days as a 3-D Archimedean spiral coil.
 * @param {Array<object>} weeks Contribution weeks.
 * @param {number} rx Camera pitch.
 * @param {number} ry Camera yaw.
 * @returns {string} SVG elements.
 */
const render3dSpiral = (weeks, rx, ry) => {
  const maxC = maxDay(weeks);
  const allDays = weeks.flatMap((w) => w.contributionDays);
  const total = allDays.length;
  const revolutions = 3;
  const rMin = 0.4;
  const rMax = 2.2;

  const projected = allDays
    .map((day, i) => {
      const theta = (i / total) * 2 * PI * revolutions;
      const r = rMin + (i / total) * (rMax - rMin);
      // Lay spiral on XZ plane, height = contribution
      const x3 = r * cos(theta);
      const z3 = r * sin(theta);
      const y3 = (day.contributionCount / maxC) * (MAX_BAR_H * 0.5);
      const norm = day.contributionCount / maxC;
      return { pt: xform([x3, y3, z3], rx, ry), norm, count: day.contributionCount };
    })
    .sort((a, b) => b.pt.sz - a.pt.sz);

  return projected
    .map(({ pt, norm, count }) => {
      if (count <= 0) {
        return `<circle cx="${pt.sx.toFixed(1)}" cy="${pt.sy.toFixed(1)}" r="0.7" fill="#ffffff" opacity="0.07" />`;
      }
      const color = getColor(norm) ?? "#9be9a8";
      const r = max(norm * 4.5 + 0.8, 0.8) * pt.ps;
      return `<circle cx="${pt.sx.toFixed(1)}" cy="${pt.sy.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="0.9" />`;
    })
    .join("");
};

// ── Renderer: constellation ───────────────────────────────────────────────────

/**
 * Render contribution days as a 3-D star field with edges between nearby bright days.
 * @param {Array<object>} weeks Contribution weeks.
 * @param {number} rx Camera pitch.
 * @param {number} ry Camera yaw.
 * @returns {string} SVG elements.
 */
const render3dConstellation = (weeks, rx, ry) => {
  const numWeeks = weeks.length;
  const maxC = maxDay(weeks);
  const threshold = maxC * 0.45;

  const pts = weeks.flatMap((week, wi) =>
    week.contributionDays.map((day, di) => {
      const x3 = numWeeks > 1 ? ((wi / (numWeeks - 1)) * 2 - 1) * X_SPREAD : 0;
      const y3 = (day.contributionCount / maxC) * MAX_BAR_H;
      const z3 = ((di / 6) * 2 - 1) * Z_SPREAD;
      return {
        pt: xform([x3, y3, z3], rx, ry),
        norm: day.contributionCount / maxC,
        count: day.contributionCount,
      };
    }),
  );

  const bright = pts.filter((p) => p.count >= threshold);

  const lines = bright
    .flatMap((a, i) =>
      bright.slice(i + 1).flatMap((b) => {
        const dx = b.pt.sx - a.pt.sx;
        const dy = b.pt.sy - a.pt.sy;
        if (sqrt(dx * dx + dy * dy) > 55) {
          return [];
        }
        const op = (min(a.norm, b.norm) * 0.38).toFixed(2);
        return [
          `<line x1="${a.pt.sx.toFixed(1)}" y1="${a.pt.sy.toFixed(1)}" x2="${b.pt.sx.toFixed(1)}" y2="${b.pt.sy.toFixed(1)}" stroke="#40c463" stroke-width="0.5" opacity="${op}" />`,
        ];
      }),
    )
    .join("");

  const sorted = [...pts].sort((a, b) => b.pt.sz - a.pt.sz);

  const dots = sorted
    .map(({ pt, norm, count }) => {
      if (count <= 0) {
        return `<circle cx="${pt.sx.toFixed(1)}" cy="${pt.sy.toFixed(1)}" r="0.8" fill="#ffffff" opacity="0.07" />`;
      }
      const color = getColor(norm) ?? "#9be9a8";
      const r = max(norm * 5 + 0.8, 0.8) * pt.ps;
      return `<circle cx="${pt.sx.toFixed(1)}" cy="${pt.sy.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="0.9" />`;
    })
    .join("");

  return lines + dots;
};

// ── Renderer: surface (3-D mesh) ──────────────────────────────────────────────

/**
 * Render contribution data as a 3-D wireframe + filled quad surface.
 * @param {Array<object>} weeks Contribution weeks.
 * @param {number} rx Camera pitch.
 * @param {number} ry Camera yaw.
 * @param {string} borderColor Wireframe edge colour.
 * @returns {string} SVG elements.
 */
const render3dSurface = (weeks, rx, ry, borderColor) => {
  const totals = weekTotals(weeks);
  const maxT = max(...totals, 1);
  const nw = weeks.length;

  // Project the weekly total as a height-mapped point on the ground plane
  const pts = totals.map((t, wi) => {
    const x3 = nw > 1 ? ((wi / (nw - 1)) * 2 - 1) * X_SPREAD : 0;
    const y3 = (t / maxT) * MAX_BAR_H;
    const norm = t / maxT;
    return { pt: xform([x3, y3, 0], rx, ry), norm };
  });

  // Draw filled quads between consecutive columns
  const quads = pts
    .slice(0, -1)
    .map((a, i) => {
      const b = pts[i + 1];
      const bot_a = xform([nw > 1 ? ((i / (nw - 1)) * 2 - 1) * X_SPREAD : 0, 0, 0], rx, ry);
      const bot_b = xform([nw > 1 ? (((i + 1) / (nw - 1)) * 2 - 1) * X_SPREAD : 0, 0, 0], rx, ry);
      const avg = (a.norm + b.norm) / 2;
      const color = getColor(avg) ?? "#9be9a8";
      return poly([bot_a, bot_b, b.pt, a.pt], color, 0.7);
    })
    .join("");

  // Draw line on top
  const pathPts = pts.map((p) => `${p.pt.sx.toFixed(1)},${p.pt.sy.toFixed(1)}`).join(" ");
  const line = `<polyline points="${pathPts}" fill="none" stroke="#40c463" stroke-width="1.2" opacity="0.85" />`;

  return quads + line;
};

// ── Dispatch table ────────────────────────────────────────────────────────────

const VIZ3D = {
  /**
   * @param {Array<object>} w Weeks.
   * @param {number} rx Pitch.
   * @param {number} ry Yaw.
   * @param {string} _tc Text colour (unused).
   * @param {string} bc Border colour.
   * @returns {string} SVG.
   */
  bars3d: (w, rx, ry, _tc, bc) => render3dBars(w, rx, ry, bc),
  /**
   * @param {Array<object>} w Weeks.
   * @param {number} rx Pitch.
   * @param {number} ry Yaw.
   * @param {string} _tc Text colour (unused).
   * @param {string} bc Border colour.
   * @returns {string} SVG.
   */
  voxels: (w, rx, ry, _tc, bc) => render3dBars(w, rx, ry, bc),
  /**
   * @param {Array<object>} w Weeks.
   * @param {number} rx Pitch.
   * @param {number} ry Yaw.
   * @param {string} _tc Text colour (unused).
   * @param {string} bc Border colour.
   * @returns {string} SVG.
   */
  terrain: (w, rx, ry, _tc, bc) => render3dBars(w, rx, ry, bc),
  /**
   * @param {Array<object>} w Weeks.
   * @param {number} rx Pitch.
   * @param {number} ry Yaw.
   * @returns {string} SVG.
   */
  scatter3d: (w, rx, ry) => render3dScatter(w, rx, ry),
  /**
   * @param {Array<object>} w Weeks.
   * @param {number} rx Pitch.
   * @param {number} ry Yaw.
   * @returns {string} SVG.
   */
  particles: (w, rx, ry) => render3dScatter(w, rx, ry),
  /**
   * @param {Array<object>} w Weeks.
   * @param {number} rx Pitch.
   * @param {number} ry Yaw.
   * @returns {string} SVG.
   */
  network: (w, rx, ry) => render3dScatter(w, rx, ry),
  /**
   * @param {Array<object>} w Weeks.
   * @param {number} rx Pitch.
   * @param {number} ry Yaw.
   * @returns {string} SVG.
   */
  helix: (w, rx, ry) => render3dHelix(w, rx, ry),
  /**
   * @param {Array<object>} w Weeks.
   * @param {number} rx Pitch.
   * @param {number} ry Yaw.
   * @returns {string} SVG.
   */
  spiral: (w, rx, ry) => render3dSpiral(w, rx, ry),
  /**
   * @param {Array<object>} w Weeks.
   * @param {number} rx Pitch.
   * @param {number} ry Yaw.
   * @returns {string} SVG.
   */
  constellation: (w, rx, ry) => render3dConstellation(w, rx, ry),
  /**
   * @param {Array<object>} w Weeks.
   * @param {number} rx Pitch.
   * @param {number} ry Yaw.
   * @param {string} _tc Text colour (unused).
   * @param {string} bc Border colour.
   * @returns {string} SVG.
   */
  surface: (w, rx, ry, _tc, bc) => render3dSurface(w, rx, ry, bc),
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render a static 3-D perspective SVG card for a GitHub contribution data set.
 *
 * The rotX / rotY angles are the same values exposed by the DataViz3D canvas
 * (`DataViz3D.state.rotX` / `.rotY`), so a view captured via the gallery's
 * "Capture View" button will look identical to the corresponding canvas frame.
 *
 * @param {object} data Skyline data from fetchSkyline.
 * @param {object} options Render options.
 * @param {string}  [options.viz] Visualization type.
 * @param {number}  [options.rotX] Camera pitch in radians (default 0.4).
 * @param {number}  [options.rotY] Camera yaw in radians (default 0.3).
 * @param {string}  [options.title_color] Card title colour override.
 * @param {string}  [options.text_color] Card text colour override.
 * @param {string}  [options.bg_color] Card background colour override.
 * @param {string}  [options.border_color] Card border colour override.
 * @param {string}  [options.theme] Theme name.
 * @param {boolean} [options.hide_border] Hide card border.
 * @param {boolean} [options.hide_title] Hide card title.
 * @param {string}  [options.border_radius] Border radius override.
 * @param {string}  [options.custom_title] Custom title text.
 * @param {boolean} [options.disable_animations] Disable SVG animations.
 * @returns {string} SVG markup.
 */
const renderDataviz3dSvgCard = (data, options = {}) => {
  const {
    viz = "bars3d",
    rotX: rx = 0.4,
    rotY: ry = 0.3,
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

  const vizType = Object.hasOwn(VIZ3D, viz) ? viz : "bars3d";
  const renderer = VIZ3D[vizType];
  const vizBody = renderer(weeks, Number(rx), Number(ry), textColor, borderColor);

  const summaryLabel = `<text x="${CARD_W - 25}" y="5" fill="${textColor}" font-size="10" font-family="'Segoe UI', Ubuntu, Sans-Serif" text-anchor="end" opacity="0.6">${year} · ${totalContributions.toLocaleString()} contributions</text>`;

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
    desc: `3D ${vizType} perspective chart showing ${totalContributions} total contributions in ${year}`,
  });

  if (disable_animations) {
    card.disableAnimations();
  }

  return card.render(`${summaryLabel}${vizBody}`);
};

export { renderDataviz3dSvgCard };
export default renderDataviz3dSvgCard;
