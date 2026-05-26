// @ts-check

import { readFileSync } from "fs";
import { join } from "path";
import { fetchSkyline } from "../src/fetchers/skyline.js";
import { MissingParamError } from "../src/common/error.js";

const TEMPLATE_PATH = join(process.cwd(), "src/templates/dataviz.html");
const CONFIG_PLACEHOLDER = "const __CONFIG__ = null; /* __DATAVIZ_CONFIG__ */";

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
        animSpeed: 0.5 + ((wi * 7 + di) * 0.381966) % 1.5,
      });
      idx++;
    });
  });

  return points;
}

// @ts-ignore
export default async (req, res) => {
  const { username, year, viz } = req.query;

  const VIZ_TYPES = new Set([
    "scatter3d", "bars3d", "surface", "helix", "network",
    "particles", "spiral", "terrain", "constellation", "voxels",
  ]);
  const vizType = VIZ_TYPES.has(viz) ? viz : "bars3d";

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
    const msg = err instanceof Error ? err.message : "Failed to fetch contribution data.";
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
  };

  const injected = html.replace(
    CONFIG_PLACEHOLDER,
    `const __CONFIG__ = ${JSON.stringify(config)};`,
  );

  return res.send(injected);
};
