// @ts-check

import axios from "axios";
import { CustomError, MissingParamError } from "../common/error.js";

/**
 * Parse contribution days from GitHub's public contribution graph HTML.
 * Handles both attribute orderings GitHub has used over time:
 *   data-count="N" ... data-date="YYYY-MM-DD"
 *   data-date="YYYY-MM-DD" ... data-count="N"
 */
const parseContributionDays = (html) => {
  const days = [];
  const pattern =
    /data-count="(\d+)"[^>]*data-date="(\d{4}-\d{2}-\d{2})"|data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-count="(\d+)"/g;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    days.push({
      contributionCount: parseInt(m[1] ?? m[4], 10),
      date: m[2] ?? m[3],
    });
  }
  return days;
};

/**
 * Group sorted contribution days into Sun-Sat weeks,
 * matching GitHub's own contribution calendar column layout.
 */
const groupIntoWeeks = (days) => {
  const weeks = [];
  let week = [];

  for (const day of days) {
    const [y, mo, d] = day.date.split("-").map(Number);
    const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0=Sun … 6=Sat

    if (week.length > 0 && dow === 0) {
      weeks.push({ contributionDays: week });
      week = [];
    }

    week.push(day);

    if (dow === 6) {
      weeks.push({ contributionDays: week });
      week = [];
    }
  }

  if (week.length > 0) weeks.push({ contributionDays: week });

  return weeks;
};

/**
 * Fetch GitHub contribution calendar data for the skyline card.
 *
 * Uses GitHub's public contributions page — no PAT or OAuth token required.
 *
 * @param {string} username GitHub username.
 * @param {string|number|undefined} year Year to fetch (defaults to current year).
 * @returns {Promise<object>} Skyline data.
 */
const fetchSkyline = async (username, year) => {
  if (!username) throw new MissingParamError(["username"]);

  const targetYear = parseInt(String(year), 10) || new Date().getFullYear();

  if (targetYear < 2008) {
    throw new CustomError(
      "Year cannot be before GitHub's launch (2008).",
      CustomError.GRAPHQL_ERROR,
    );
  }

  let res;
  try {
    res = await axios.get(
      `<https://github.com/users/${encodeURIComponent(username)}/contributions`>,
      {
        params: { from: `${targetYear}-01-01`, to: `${targetYear}-12-31` },
        headers: { "X-Requested-With": "XMLHttpRequest" },
        timeout: 8000,
      },
    );
  } catch (err) {
    if (err.response?.status === 404) {
      throw new CustomError(
        `User "${username}" not found.`,
        CustomError.USER_NOT_FOUND,
      );
    }
    throw new CustomError(
      "Failed to reach GitHub. Please try again later.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  const days = parseContributionDays(res.data);

  if (days.length === 0) {
    throw new CustomError(
      `No contribution data found for "${username}" in ${targetYear}.`,
      CustomError.USER_NOT_FOUND,
    );
  }

  days.sort((a, b) => a.date.localeCompare(b.date));

  const totalContributions = days.reduce((s, d) => s + d.contributionCount, 0);
  const weeks = groupIntoWeeks(days);

  return {
    name: username,
    login: username,
    totalContributions,
    weeks,
    year: targetYear,
  };
};

export { fetchSkyline };
export default fetchSkyline;
