// @ts-check

import axios from "axios";
import { retryer } from "../common/retryer.js";
import { request } from "../common/http.js";
//import { CustomError, MissingParamError } from "../common/error.js";
import { CustomError, MissingParamError } from "../common/error.js";
import { fetchSkyline as fetchSkylineWithToken } from "./old.skyline.js";

// ---------------------------------------------------------------------------
// GraphQL path (used when PAT_1 is configured — optional, never required)
// ---------------------------------------------------------------------------

const CONTRIBUTION_CALENDAR_QUERY = `
  query ContributionGraph($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      name
      login
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }
`;

const graphqlFetcher = (variables, token) =>
  request(
    { query: CONTRIBUTION_CALENDAR_QUERY, variables },
    { Authorization: `bearer ${token}` },
  );

const fetchViaGraphQL = async (username, targetYear) => {
  const res = await retryer(graphqlFetcher, {
    username,
    from: `${targetYear}-01-01T00:00:00Z`,
    to: `${targetYear}-12-31T23:59:59Z`,
  });

  if (res.data.errors) {
    const err = res.data.errors[0];
    throw new CustomError(
      err.message || "GraphQL error fetching contribution data.",
      err.type === "NOT_FOUND" ? CustomError.USER_NOT_FOUND : CustomError.GRAPHQL_ERROR,
    );
  }

  const user = res.data.data.user;
  const cal = user.contributionsCollection.contributionCalendar;

  return {
    name: user.name || user.login,
    login: user.login,
    totalContributions: cal.totalContributions,
    weeks: cal.weeks,
    year: targetYear,
  };
};


const hasApiToken = () =>
  Boolean(process.env.PAT_1 || process.env.GITHUB_TOKEN);

/**
 * Parse contribution days from GitHub's public contribution graph HTML.
 * Handles both attribute orderings GitHub has used over time:
 *   data-count="N" ... data-date="YYYY-MM-DD"
 *   data-date="YYYY-MM-DD" ... data-count="N"
 *
 * @param {string} html GitHub contributions page HTML.
 * @returns {{contributionCount: number, date: string}[]} Contribution day records.
 */
const parseContributionDays = (html) => {
  const days = [];

  // Pattern A: <rect data-count="N" ... data-date="YYYY-MM-DD" .../>
  // Pattern B: <td  data-date="YYYY-MM-DD" ... data-count="N" ...>
  const pattern =
    /data-count="(\d+)"[^>]*?data-date="(\d{4}-\d{2}-\d{2})"|data-date="(\d{4}-\d{2}-\d{2})"[^>]*?data-count="(\d+)"/g;

  let m;
  while ((m = pattern.exec(html)) !== null) {
    days.push({
      contributionCount: parseInt(m[1] ?? m[4], 10),
      date: m[2] ?? m[3],
    });
  }

  // Fallback: newer GitHub uses aria-label="N contributions on <date>"
  if (days.length === 0) {
    const ariaPattern =
      /data-date="(\d{4}-\d{2}-\d{2})"[^>]*aria-label="(\d+) contributions? on/g;
    while ((m = ariaPattern.exec(html)) !== null) {
      days.push({ date: m[1], contributionCount: parseInt(m[2], 10) });
    }
  }

  return days;
};

/**
 * Group sorted contribution days into Sun-Sat weeks,
 * matching GitHub's own contribution calendar column layout.
 *
 * @param {{contributionCount: number, date: string}[]} days Sorted contribution days.
 * @returns {{contributionDays: {contributionCount: number, date: string}[]}[]} Contribution weeks.
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

const fetchViaScraping = async (username, targetYear) => {
  let res;
  try {
    res = await axios.get(
      `https://github.com/users/${encodeURIComponent(username)}/contributions`,
      {
        params: { from: `${targetYear}-01-01`, to: `${targetYear}-12-31` },
        headers: {
          // Use a browser-like UA so GitHub doesn't treat this as a bot request
          "User-Agent":
            "Mozilla/5.0 (compatible; github-readme-stats; +https://github.com/anuraghazra/github-readme-stats)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          // Tell GitHub to return just the calendar fragment
          "X-Requested-With": "XMLHttpRequest",
        },
        timeout: 10000,
        maxRedirects: 5,
      },
    );
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) {
      throw new CustomError(
        `User "${username}" not found.`,
        CustomError.USER_NOT_FOUND,
      );
    }
    throw new CustomError(
      `Failed to reach GitHub. Please try again later; GitHub returned HTTP ${status ?? "network error"} for ${username}'s contributions. Try adding a PAT_1 env var to use the authenticated API instead.`,
      CustomError.GRAPHQL_ERROR,
    );
  }

  const days = parseContributionDays(res.data);

  if (days.length === 0) {
    if (hasApiToken()) {
      return fetchSkylineWithToken(username, year);
    }
    throw new CustomError(
      `No contribution data found for "${username}" in ${targetYear}.`,
      CustomError.USER_NOT_FOUND,
    );
  }

  days.sort((a, b) => a.date.localeCompare(b.date));

  return {
    name: username,
    login: username,
    totalContributions: days.reduce((s, d) => s + d.contributionCount, 0),
    weeks: groupIntoWeeks(days),
    year: targetYear,
  };
};

  
  
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch GitHub contribution calendar for the skyline card.
 *
 * Strategy:
 *   1. If PAT_1 is set in the environment, use the authenticated GraphQL API
 *      (most reliable, returns the user's display name).
 *   2. Otherwise fall back to scraping GitHub's public contribution page —
 *      no token required, nothing expires.
 *
 * @param {string} username GitHub username.
 * @param {string|number|undefined} year Year to display (defaults to current year).
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

  // Prefer the authenticated GraphQL path when a token is available
  if (process.env.PAT_1) {
    return fetchViaGraphQL(username, targetYear);
  }

  return fetchViaScraping(username, targetYear);
};

export { fetchSkyline };
export default fetchSkyline;
