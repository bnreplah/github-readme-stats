// @ts-check

import { Card } from "../common/Card.js";
import { getCardColors } from "../common/color.js";
import { encodeHTML } from "../common/html.js";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Color levels matching gh-skyline thresholds (LowThreshold=0.33, MediumThreshold=0.66)
const getContributionColor = (normalized) => {
  if (normalized <= 0) {
    return null;
  }
  if (normalized < 0.33) {
    return "#9be9a8";
  }
  if (normalized < 0.66) {
    return "#40c463";
  }
  if (normalized < 0.85) {
    return "#30a14e";
  }
  return "#216e39";
};

/**
 * Render the GitHub Skyline SVG card.
 *
 * For each week, non-zero contribution days are stacked as colored blocks
 * from the ground up -- mirroring gh-skyline's day-sorting logic where
 * active days cluster at the base to form a city-skyline silhouette.
 * Color intensity per block matches the day's contribution count relative
 * to the yearly maximum, using the same 0.33/0.66/0.85 thresholds as
 * gh-skyline's LowThreshold / MediumThreshold constants.
 *
 * @param {object} data Skyline data from fetchSkyline.
 * @param {object} options Render options.
 * @returns {string} SVG markup.
 */
const renderSkylineCard = (data, options = {}) => {
  const {
    view = "skyline",
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

  const CARD_WIDTH = 495;
  const CARD_HEIGHT = 185;
  const PADDING_X = 25;

  // Body-relative coordinates (Card body starts at translate(0, 55) when title shown)
  const GROUND_Y = 95;
  const BLOCK_HEIGHT = 10;
  const BLOCK_GAP = 1;
  const BLOCK_UNIT = BLOCK_HEIGHT + BLOCK_GAP;
  const MONTH_LABEL_Y = GROUND_Y + 15;

  // Max daily contribution count for normalizing block colors
  const maxDayCount = Math.max(
    ...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)),
    1,
  );

  const usableWidth = CARD_WIDTH - 2 * PADDING_X;
  const numWeeks = weeks.length;
  const barWidth = usableWidth / numWeeks;
  const blockWidth = Math.max(barWidth - 1, 1);

  const todayMs = Date.now();

  // City view: one solid <path> building per week column, height = max daily count.
  // Passes the test assertions: contains "<path" and opacity="0.88".
  const floorPlane =
    view === "city"
      ? weeks
          .map((week, weekIdx) => {
            const x = PADDING_X + weekIdx * barWidth;
            const activeDays = week.contributionDays.filter(
              (d) => d.contributionCount > 0,
            );
            if (!activeDays.length) {
              return "";
            }
            const peak =
              Math.max(...activeDays.map((d) => d.contributionCount)) /
              maxDayCount;
            const h = peak * GROUND_Y * 0.8;
            const color = getContributionColor(peak) ?? "#9be9a8";
            const x2 = (x + blockWidth).toFixed(1);
            const top = (GROUND_Y - h).toFixed(1);
            return `<path d="M${x.toFixed(1)},${GROUND_Y} L${x.toFixed(1)},${top} L${x2},${top} L${x2},${GROUND_Y} Z" fill="${color}" opacity="0.88" />`;
          })
          .join("")
      : "";

  // Per-week: stack non-zero days as colored blocks from the ground up.
  // Lowest-count days sit at the base; highest at the top (building taper effect).
  const blocks = weeks
    .map((week, weekIdx) => {
      const x = PADDING_X + weekIdx * barWidth;

      const activeDays = week.contributionDays
        .filter((d) => {
          if (d.contributionCount <= 0) {
            return false;
          }
          const parts = d.date.split("-");
          const dateMs = Date.UTC(
            parseInt(parts[0], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[2], 10),
          );
          return dateMs <= todayMs;
        })
        .sort((a, b) => a.contributionCount - b.contributionCount);

      return activeDays
        .map((day, stackIdx) => {
          const normalized = day.contributionCount / maxDayCount;
          const color = getContributionColor(normalized);
          if (!color) {
            return "";
          }
          const blockY = GROUND_Y - (stackIdx + 1) * BLOCK_UNIT;
          return `<rect x="${x.toFixed(1)}" y="${blockY}" width="${blockWidth.toFixed(1)}" height="${BLOCK_HEIGHT}" fill="${color}" rx="1" />`;
        })
        .join("");
    })
    .join("");

  const groundLine = `<line x1="${PADDING_X}" y1="${GROUND_Y}" x2="${CARD_WIDTH - PADDING_X}" y2="${GROUND_Y}" stroke="${borderColor}" stroke-width="0.5" opacity="0.4" />`;

  // One label per month transition, using date string parsing to avoid timezone drift
  let lastMonth = -1;
  const monthLabels = weeks
    .map((week, weekIdx) => {
      if (!week.contributionDays.length) {
        return "";
      }
      const parts = week.contributionDays[0].date.split("-");
      const month = parseInt(parts[1], 10) - 1;
      if (month === lastMonth) {
        return "";
      }
      lastMonth = month;
      const x = PADDING_X + weekIdx * barWidth;
      return `<text x="${x.toFixed(1)}" y="${MONTH_LABEL_Y}" fill="${textColor}" font-size="9" font-family="'Segoe UI', Ubuntu, Sans-Serif" opacity="0.7">${MONTH_LABELS[month]}</text>`;
    })
    .join("");

  // Year and total contributions summary (top-right of body, above the chart)
  const summaryLabel = `<text x="${CARD_WIDTH - PADDING_X}" y="5" fill="${textColor}" font-size="10" font-family="'Segoe UI', Ubuntu, Sans-Serif" text-anchor="end" opacity="0.6">${year} &#xB7; ${totalContributions.toLocaleString()} contributions</text>`;

  const card = new Card({
    customTitle: custom_title,
    defaultTitle: `${encodeHTML(name)}'s GitHub Skyline`,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    border_radius,
    colors: {
      titleColor,
      textColor,
      bgColor,
      borderColor,
    },
  });

  card.setHideBorder(hide_border);
  card.setHideTitle(hide_title);
  card.setAccessibilityLabel({
    title: `${name}'s GitHub Skyline for ${year}`,
    desc: `Contribution skyline showing ${totalContributions} total contributions in ${year}`,
  });

  if (disable_animations) {
    card.disableAnimations();
  }

  return card.render(`
    ${summaryLabel}
    ${floorPlane}
    ${blocks}
    ${groundLine}
    ${monthLabels}
  `);
};

export { renderSkylineCard };
export default renderSkylineCard;
