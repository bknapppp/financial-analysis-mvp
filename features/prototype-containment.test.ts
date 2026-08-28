import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const planning = await readFile(
  new URL("./planning/planning-view-model.ts", import.meta.url),
  "utf8"
);
const requests = await readFile(
  new URL("./information-request/information-request-view-model.ts", import.meta.url),
  "utf8"
);

assert.match(planning, /baseModel\(data\.company, true\)/);
assert.match(planning, /illustrative and are not persisted/);
assert.match(planning, /progressIsPreview: isPreview/);

assert.match(requests, /baseModel\(data\.company, true, mapDocuments\(data\.documents\)\)/);
assert.match(requests, /illustrative and session-only/);
assert.match(requests, /persisted Source Data are authoritative/);
assert.match(requests, /progressIsPreview: isPreview/);

console.log("prototype containment tests passed");
