// @ts-check

import { readFileSync } from "fs";
import { join } from "path";
import { fetchSkyline } from "../src/fetchers/skyline.js";
import { MissingParamError, retrieveSecondaryMessage } from "../src/common/error.js";
import { renderDatavizSvgCard } from "../src/cards/dataviz-svg.js";
import { renderDataviz3dSvgCard } from "../src/cards/dataviz-3d-svg.js";
import { renderError } from "../src/common/render.js";
import { parseBoolean } from "../src/common/ops.js";

const TEMPLATE_PATH = join(process.cwd(), "src/templates/dataviz.html");
const CONFIG_PLACEHOLDER = "const __CONFIG__ = null; /* __DATAVIZ_CONFIG__ */";

/**
 * Convert skyline contribution data into DataViz3D bar point objects.
 * @param {object} data - Skyline data from fetchSkyline.
 * @returns {Array<object>} DataViz3D-compatible point array.
 */
function buildPoints(data) {
  const { weeks } = data;
  const maxCount = Math.max(
    ...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)),
    1,
  );

  const numWeeks = weeks.length;
  const points = [];
  let idx = 0;

  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day, di) => {
      if (day.contributionCount <= 0) {
        idx++;
        return;
      }
      const x = numWeeks > 1 ? ((wi / (numWeeks - 1)) * 2 - 1) * 5 : 0;
      const z = ((di / 6) * 2 - 1) * 1.2;
      const h = day.contributionCount / maxCount;
      points.push({
        x,
        y: 0,
        z,
        h,
        v: h,
        i: idx,
        barBase: -0.5,
        animOffset: ((wi * 7 + di) * 0.618033) % (Math.PI * 2),
        animSpeed: 0.5 + (((wi * 7 + di) * 0.381966) % 1.5),
      });
      idx++;
    });
  });

  return points;
}

const VIZ_TYPES = new Set([
  "scatter3d",
  "bars3d",
  "surface",
  "helix",
  "network",
  "particles",
  "spiral",
  "terrain",
  "constellation",
  "voxels",
]);

/**
 * Serves GitHub contribution data as an interactive HTML page or a static SVG badge.
 *
 * Add `?format=svg` to receive an `image/svg+xml` response suitable for embedding
 * in GitHub READMEs via Markdown image syntax.  Without that parameter the response
 * is the full DataViz3D interactive Canvas application.
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<void>} Sends HTML or SVG response.
 */
// @ts-ignore
export default async (req, res) => {
  const {
    username,
    year,
    viz,
    format,
    mode,
    rx,
    ry,
    auto_rotate,
    title_color,
    text_color,
    bg_color,
    border_color,
    theme,
    hide_border,
    hide_title,
    custom_title,
    border_radius,
    disable_animations,
  } = req.query;

  const vizType = VIZ_TYPES.has(viz) ? viz : "bars3d";
  const isSvg = format === "svg";
  const is3d = isSvg && mode === "3d";

  // ── SVG badge path ──────────────────────────────────────────────────────────
  if (isSvg) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=1800, s-maxage=1800");

    if (!username) {
      const err = new MissingParamError(["username"]);
      return res.send(
        renderError({
          message: err.message,
          renderOptions: { title_color, text_color, bg_color, border_color, theme },
        }),
      );
    }

    let data;
    try {
      data = await fetchSkyline(username, year);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch contribution data.";
      return res.send(
        renderError({
          message: msg,
          secondaryMessage: retrieveSecondaryMessage(err),
          renderOptions: { title_color, text_color, bg_color, border_color, theme },
        }),
      );
    }

    const svgOpts = {
      viz: vizType,
      title_color,
      text_color,
      bg_color,
      border_color,
      theme,
      hide_border: parseBoolean(hide_border),
      hide_title: parseBoolean(hide_title),
      custom_title,
      border_radius,
      disable_animations: parseBoolean(disable_animations),
    };

    if (is3d) {
      return res.send(
        renderDataviz3dSvgCard(data, {
          ...svgOpts,
          rotX: rx !== undefined ? parseFloat(String(rx)) : 0.4,
          rotY: ry !== undefined ? parseFloat(String(ry)) : 0.3,
        }),
      );
    }

    return res.send(renderDatavizSvgCard(data, svgOpts));
  }

  // ── Interactive HTML path ───────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");

  if (!username) {
    const err = new MissingParamError(["username"]);
    return res.status(400).send(`
      <!DOCTYPE html><html><head><title>Error</title>
      <style>body{background:#050509;color:#f72585;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
      </head><body><div>${err.message}</div></body></html>
    `);
  }

  let html;
  try {
    html = readFileSync(TEMPLATE_PATH, "utf8");
  } catch {
    return res.status(500).send("Template not found.");
  }

  let data;
  try {
    data = await fetchSkyline(username, year);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to fetch contribution data.";
    return res.status(502).send(`
      <!DOCTYPE html><html><head><title>Error</title>
      <style>body{background:#050509;color:#f72585;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;}</style>
      </head><body><div>${msg}</div></body></html>
    `);
  }

  const points = buildPoints(data);
  const config = {
    vizType,
    title: `${data.name} / ${data.year} Contributions`,
    toastMsg: `${data.totalContributions.toLocaleString()} contributions in ${data.year}`,
    points,
    autoRotate: parseBoolean(auto_rotate),
    rotX: rx !== undefined ? parseFloat(String(rx)) : undefined,
    rotY: ry !== undefined ? parseFloat(String(ry)) : undefined,
  };

  const injected = html.replace(
    CONFIG_PLACEHOLDER,
    `const __CONFIG__ = ${JSON.stringify(config)};`,
  );

  return res.send(injected);
};
