// @ts-check

import { renderSkylineCard } from "../src/cards/skyline.js";
import { guardAccess } from "../src/common/access.js";
import {
  CACHE_TTL,
  resolveCacheSeconds,
  setCacheHeaders,
  setErrorCacheHeaders,
} from "../src/common/cache.js";
import {
  MissingParamError,
  retrieveSecondaryMessage,
} from "../src/common/error.js";
import { parseBoolean } from "../src/common/ops.js";
import { renderError } from "../src/common/render.js";
import { fetchSkyline } from "../src/fetchers/skyline.js";

// @ts-ignore
export default async (req, res) => {
  const {
    username,
    year,
    title_color,
    text_color,
    bg_color,
    border_color,
    theme,
    cache_seconds,
    hide_border,
    hide_title,
    custom_title,
    border_radius,
    disable_animations,
  } = req.query;

  res.setHeader("Content-Type", "image/svg+xml");

  const access = guardAccess({
    res,
    id: username,
    type: "username",
    colors: { title_color, text_color, bg_color, border_color, theme },
  });
  if (!access.isPassed) return access.result;

  try {
    const data = await fetchSkyline(username, year);

    const cacheSeconds = resolveCacheSeconds({
      requested: parseInt(cache_seconds, 10),
      def: CACHE_TTL.STATS_CARD.DEFAULT,
      min: CACHE_TTL.STATS_CARD.MIN,
      max: CACHE_TTL.STATS_CARD.MAX,
    });
    setCacheHeaders(res, cacheSeconds);

    return res.send(
      renderSkylineCard(data, {
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
        year: data.year,
      }),
    );
  } catch (err) {
    setErrorCacheHeaders(res);
    if (err instanceof Error) {
      return res.send(
        renderError({
          message: err.message,
          secondaryMessage: retrieveSecondaryMessage(err),
          renderOptions: {
            title_color, text_color, bg_color, border_color, theme,
            show_repo_link: !(err instanceof MissingParamError),
          },
        }),
      );
    }
    return res.send(
      renderError({
        message: "An unknown error occurred",
        renderOptions: { title_color, text_color, bg_color, border_color, theme },
      }),
    );
  }
};
