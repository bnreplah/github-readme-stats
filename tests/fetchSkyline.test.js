import { afterEach, describe, expect, it } from "@jest/globals";
import "@testing-library/jest-dom";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { fetchSkyline } from "../src/fetchers/skyline.js";
import { renderSkylineCard } from "../src/cards/skyline.js";

const mock = new MockAdapter(axios);

afterEach(() => {
  mock.reset();
  delete process.env.PAT_1;
  delete process.env.GITHUB_TOKEN;
});

describe("Test fetchSkyline", () => {
  const data = {
    name: "octocat",
    login: "octocat",
    totalContributions: 10,
    year: 2024,
    weeks: [
      {
        contributionDays: [
          { contributionCount: 1, date: "2024-01-01" },
          { contributionCount: 2, date: "2024-01-02" },
        ],
      },
    ],
  };

  it("should fetch contribution data from the public contributions page", async () => {
    const html = `
      <svg>
        <g>
          <rect data-count="1" data-date="2024-01-01"></rect>
          <rect data-count="2" data-date="2024-01-02"></rect>
        </g>
      </svg>
    `;

    mock.onGet(/\/users\/octocat\/contributions/).reply(200, html);

    const result = await fetchSkyline("octocat", 2024);

    expect(result).toStrictEqual({
      name: "octocat",
      login: "octocat",
      totalContributions: 3,
      year: 2024,
      weeks: [
        {
          contributionDays: [
            { contributionCount: 1, date: "2024-01-01" },
            { contributionCount: 2, date: "2024-01-02" },
          ],
        },
      ],
    });
  });

  it("should fallback to GraphQL when the public contributions page is unavailable and a PAT is configured", async () => {
    process.env.PAT_1 = "testPAT";

    mock.onGet(/\/users\/octocat\/contributions/).reply(403);
    mock.onPost("https://api.github.com/graphql").reply(200, {
      data: {
        user: {
          name: "The Octocat",
          login: "octocat",
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 5,
              weeks: [
                {
                  contributionDays: [
                    { contributionCount: 5, date: "2024-01-01" },
                  ],
                },
              ],
            },
          },
        },
      },
    });

    const result = await fetchSkyline("octocat", 2024);

    expect(result).toStrictEqual({
      name: "The Octocat",
      login: "octocat",
      totalContributions: 5,
      year: 2024,
      weeks: [
        {
          contributionDays: [{ contributionCount: 5, date: "2024-01-01" }],
        },
      ],
    });
  });

  it("should fallback to GraphQL when contribution parsing returns no days and a PAT is configured", async () => {
    process.env.PAT_1 = "testPAT";

    mock.onGet(/\/users\/octocat\/contributions/).reply(200, "<svg></svg>");
    mock.onPost("https://api.github.com/graphql").reply(200, {
      data: {
        user: {
          name: "The Octocat",
          login: "octocat",
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 0,
              weeks: [],
            },
          },
        },
      },
    });

    const result = await fetchSkyline("octocat", 2024);

    expect(result).toStrictEqual({
      name: "The Octocat",
      login: "octocat",
      totalContributions: 0,
      year: 2024,
      weeks: [],
    });
  });

  it("should render a valid SVG string for skyline card output", () => {
    const svg = renderSkylineCard(data, {});

    expect(typeof svg).toBe("string");
    expect(svg.trim().startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("should render the city skyline view when view=city is provided", () => {
    const svg = renderSkylineCard(data, { view: "city" });

    expect(svg).toContain("<path");
    expect(svg).toContain('opacity="0.88"');
  });

  it("should render the flat skyline view when view=flat is provided", () => {
    const svg = renderSkylineCard(data, { view: "flat" });

    expect(svg).toContain("<rect");
  });
});
