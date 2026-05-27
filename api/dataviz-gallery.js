// @ts-check

import { readFileSync } from "fs";
import { join } from "path";

const TEMPLATE_PATH = join(process.cwd(), "src/templates/dataviz-gallery.html");

// @ts-ignore
export default (_req, res) => {
  let html;
  try {
    html = readFileSync(TEMPLATE_PATH, "utf8");
  } catch {
    return res.status(500).send("Template not found.");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return res.send(html);
};
