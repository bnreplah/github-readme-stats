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

/**
 * @param {number} normalized Normalized contribution intensity.
 * @returns {string} Contribution block color.
 */
const getContributionColor = (normalized) => {
  if (normalized <= 0) {
    return "#ebedf0";
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
 * @param {{
 *   name: string,
 *   login: string,
 *   totalContributions: number,
 *   weeks: Array<{ contributionDays: Array<{ contributionCount: number, date: string }> }>,
 *   year: number,
 * }} data Skyline data.
 * @param {{
 *   view?: "skyline" | "city" | "flat",
 *   title_color?: string,
 *   text_color?: string,
 *   bg_color?: string,
 *   border_color?: string,
 *   theme?: string,
 *   hide_border?: boolean,
 *   hide_title?: boolean,
 *   border_radius?: number,
 *   custom_title?: string,
 *   disable_animations?: boolean,
 * }=} options Card rendering options.
 * @returns {string} Rendered SVG.
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
  const GROUND_Y = 95;
  const MONTH_LABEL_Y = GROUND_Y + 15;

  const weekTotals = weeks.map((week) =>
    week.contributionDays.reduce(
      /**
       * @param {number} sum Accumulated contribution total.
       * @param {{ contributionCount: number }} day Contribution day object.
       * @returns {number} New accumulated total.
       */
      (sum, day) => sum + day.contributionCount,
      0,
    ),
  );
  const maxWeekTotal = Math.max(...weekTotals, 1);

  const usableWidth = CARD_WIDTH - 2 * PADDING_X;
  const numWeeks = Math.max(weeks.length, 1);
  const barWidth = usableWidth / numWeeks;
  const blockWidth = Math.max(barWidth - 1, 1);
  const depth = Math.min(14, blockWidth * 0.6);

  /**
   * @param {number} normalized Normalized contribution intensity.
   * @returns {string} Side-face color.
   */
  const getSkylineSideColor = (normalized) => {
    if (normalized <= 0) {
      return "#dfe4e8";
    }
    if (normalized < 0.33) {
      return "#77d787";
    }
    if (normalized < 0.66) {
      return "#2d9d43";
    }
    if (normalized < 0.85) {
      return "#24823f";
    }
    return "#1d5931";
  };

  const selectedView = view?.toString().toLowerCase() ?? "skyline";
  const isFlatView = selectedView === "flat";
  const isCityView = selectedView === "city";

  const maxDayCount = Math.max(
    ...weeks.flatMap((week) =>
      week.contributionDays.map((day) => day.contributionCount),
    ),
    1,
  );

  const renderFlatView = () => {
    const cellSize = Math.max(Math.min(barWidth - 1, 10), 3);
    const cellGap = 1.5;
    const topOffset = 35;

    return weeks
      .map((week, weekIdx) => {
        const x = PADDING_X + weekIdx * barWidth;
        return week.contributionDays
          .map((day, dayIdx) => {
            const color = getContributionColor(
              day.contributionCount / maxDayCount,
            );
            const y = topOffset + dayIdx * (cellSize + cellGap);
            return `
              <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cellSize.toFixed(
                1,
              )}" height="${cellSize.toFixed(1)}" rx="2" ry="2" fill="${color}" />`;
          })
          .join("");
      })
      .join("");
  };

  const renderSkylineView = () =>
    weeks
      .map((week, weekIdx) => {
        const x = PADDING_X + weekIdx * barWidth;
        const total = weekTotals[weekIdx];
        const normalized = total / maxWeekTotal;
        const color = getContributionColor(normalized);
        const sideColor = getSkylineSideColor(normalized);
        const height = Math.max(normalized * 70, 4);
        const y = GROUND_Y - height;
        const topY = y - depth * 0.35;
        const xOffset = depth;

        const topFace = `
          <path d="M${x.toFixed(1)} ${y.toFixed(1)} L${(x + blockWidth).toFixed(
            1,
          )} ${y.toFixed(1)} L${(x + blockWidth + xOffset).toFixed(
            1,
          )} ${topY.toFixed(1)} L${(x + xOffset).toFixed(1)} ${topY.toFixed(1)} Z" fill="${color}" />`;

        const rightFace = `
          <path d="M${(x + blockWidth).toFixed(1)} ${y.toFixed(1)} L${(
            x +
            blockWidth +
            xOffset
          ).toFixed(1)} ${topY.toFixed(1)} L${(
            x +
            blockWidth +
            xOffset
          ).toFixed(1)} ${(GROUND_Y - depth * 0.35).toFixed(1)} L${(
            x + blockWidth
          ).toFixed(
            1,
          )} ${GROUND_Y.toFixed(1)} Z" fill="${sideColor}" opacity="0.92" />`;

        const frontFace = `
          <path d="M${x.toFixed(1)} ${y.toFixed(1)} L${(x + blockWidth).toFixed(
            1,
          )} ${y.toFixed(1)} L${(x + blockWidth).toFixed(
            1,
          )} ${GROUND_Y.toFixed(1)} L${x.toFixed(1)} ${GROUND_Y.toFixed(1)} Z" fill="${color}" opacity="0.96" />`;

        return `${topFace}${rightFace}${frontFace}`;
      })
      .join("");

  const renderCityView = () =>
    weeks
      .map((week, weekIdx) => {
        const x = PADDING_X + weekIdx * barWidth;
        const total = weekTotals[weekIdx];
        const normalized = total / maxWeekTotal;
        const color = getContributionColor(normalized);
        const sideColor = getSkylineSideColor(normalized);
        const height = Math.max(normalized * 90, 6);
        const y = GROUND_Y - height;
        const topY = y - depth * 0.45;
        const xOffset = Math.max(depth * 1.4, 16);

        const topFace = `
          <path d="M${x.toFixed(1)} ${y.toFixed(1)} L${(x + blockWidth).toFixed(
            1,
          )} ${y.toFixed(1)} L${(x + blockWidth + xOffset).toFixed(
            1,
          )} ${topY.toFixed(1)} L${(x + xOffset).toFixed(1)} ${topY.toFixed(1)} Z" fill="${color}" opacity="0.95" />`;

        const rightFace = `
          <path d="M${(x + blockWidth).toFixed(1)} ${y.toFixed(1)} L${(
            x +
            blockWidth +
            xOffset
          ).toFixed(1)} ${topY.toFixed(1)} L${(
            x +
            blockWidth +
            xOffset
          ).toFixed(1)} ${(GROUND_Y - xOffset * 0.35).toFixed(1)} L${(
            x + blockWidth
          ).toFixed(
            1,
          )} ${GROUND_Y.toFixed(1)} Z" fill="${sideColor}" opacity="0.88" />`;

        const frontFace = `
          <path d="M${x.toFixed(1)} ${y.toFixed(1)} L${(x + blockWidth).toFixed(
            1,
          )} ${y.toFixed(1)} L${(x + blockWidth).toFixed(
            1,
          )} ${GROUND_Y.toFixed(1)} L${x.toFixed(1)} ${GROUND_Y.toFixed(1)} Z" fill="${color}" opacity="0.92" />`;

        return `${topFace}${rightFace}${frontFace}`;
      })
      .join("");

  const blocks = isFlatView
    ? renderFlatView()
    : isCityView
      ? renderCityView()
      : renderSkylineView();

  const floorPlane = isFlatView
    ? ""
    : `<path d="M${PADDING_X} ${GROUND_Y} L${PADDING_X + depth} ${(
        GROUND_Y -
        depth * 0.35
      ).toFixed(1)} L${(CARD_WIDTH - PADDING_X + depth).toFixed(1)} ${(
        GROUND_Y -
        depth * 0.35
      ).toFixed(
        1,
      )} L${CARD_WIDTH - PADDING_X} ${GROUND_Y} Z" fill="${borderColor}" opacity="0.08" />`;

  const groundLine = isFlatView
    ? ""
    : `<line x1="${PADDING_X}" y1="${GROUND_Y}" x2="${CARD_WIDTH - PADDING_X}" y2="${GROUND_Y}" stroke="${borderColor}" stroke-width="0.5" opacity="0.4" />`;

  let lastMonth = -1;
  const monthLabels = weeks
    .map((week, weekIdx) => {
      if (!week.contributionDays.length) {
        ("");
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

  const summaryLabel = `<text x="${CARD_WIDTH - PADDING_X}" y="5" fill="${textColor}" font-size="10" font-family="'Segoe UI', Ubuntu, Sans-Serif" text-anchor="end" opacity="0.6">${year} &#xB7; ${totalContributions.toLocaleString()} contributions</text>`;

  const card = new Card({
    customTitle: custom_title,
    defaultTitle: `${encodeHTML(name)}'s GitHub Skyline`,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    border_radius,
    colors: { titleColor, textColor, bgColor, borderColor },
  });
  //return
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
