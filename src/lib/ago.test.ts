import { expect, it } from "bun:test";
import { formatAgo } from "./ago.ts";

it("says how long ago in one unit", () => {
  expect([-5_000, 0, 59_999, 60_000, 3_599_999, 3_600_000, 47 * 3_600_000, 48 * 3_600_000].map(formatAgo))
    .toEqual(["0s", "0s", "59s", "1m", "59m", "1h", "47h", "2d"]);
});
