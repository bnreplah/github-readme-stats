// @ts-check

import { retryer } from "../common/retryer.js";
import { CustomError, MissingParamError } from "../common/error.js";
import { request } from "../common/http.js";

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

const fetcher = (variables, token) => {
  return request(
    { query: CONTRIBUTION_CALENDAR_QUERY, variables },
    { Authorization: `bearer ${token}` },
  );
};

const fetchSkyline = async (username, year) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  const targetYear = parseInt(String(year), 10) || new Date().getFullYear();

  if (targetYear < 2008) {
    throw new CustomError(
      "Year cannot be before GitHub's launch (2008).",
      CustomError.GRAPHQL_ERROR,
    );
  }

  const variables = {
    username,
    from: `${targetYear}-01-01T00:00:00Z`,
    to: `${targetYear}-12-31T23:59:59Z`,
  };

  const res = await retryer(fetcher, variables);

  if (res.data.errors) {
    if (res.data.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        res.data.errors[0].message || "Could not fetch user.",
        CustomError.USER_NOT_FOUND,
      );
    }
    throw new CustomError(
      "Something went wrong while fetching skyline data.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  const user = res.data.data.user;
  const calendar = user.contributionsCollection.contributionCalendar;

  return {
    name: user.name || user.login,
    login: user.login,
    totalContributions: calendar.totalContributions,
    weeks: calendar.weeks,
    year: targetYear,
  };
};

export { fetchSkyline };
export default fetchSkyline;
