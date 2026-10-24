import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicJsonUrl = new URL("../public/data/benefits.json", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: path === "/api/benefits" ? "application/json" : "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/data/benefits.json") {
            return new Response(await readFile(publicJsonUrl), {
              headers: { "content-type": "application/json; charset=utf-8" },
            });
          }
          return new Response("Not found", { status: 404 });
        },
      },
      BENEFITS_JSON_URL: "/data/benefits.json",
      IMAGES: {
        input() {
          throw new Error("image optimization is not used in this test");
        },
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the benefit radar shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>카페할인 모아<\/title>/i);
  assert.match(html, /카페할인 모아/);
  assert.doesNotMatch(html, /카카오페이|굿딜/);
});

test("serves the generated benefit JSON through the API", async () => {
  const response = await render("/api/benefits");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);

  const payload = await response.json();
  assert.equal(payload.schemaVersion, 1);
  assert.ok(Array.isArray(payload.benefits));
  assert.ok(payload.benefits.length > 0);
  assert.ok(
    payload.benefits.every((benefit) =>
      ["naverpay", "toss", "brand", "skt", "kt", "lguplus"].includes(benefit.provider),
    ),
  );
  assert.ok(
    payload.benefits.every((benefit) => ["커피", "베이커리", "간식", "기타"].includes(benefit.category)),
  );
  // M포인트 표시 규칙은 tests/collector-rules.test.mjs의 고정 입력으로 검증한다.
  // 여기서는 저장된 JSON에 특정 혜택이 있는지에 기대지 않고 계약만 확인한다.
  assert.equal(new Set(payload.benefits.map((benefit) => benefit.id)).size, payload.benefits.length);
  assert.ok(
    payload.benefits.every(
      (benefit) =>
        typeof benefit.title === "string" &&
        typeof benefit.source === "string" &&
        (benefit.validUntil == null || /^\d{4}-\d{2}-\d{2}$/.test(benefit.validUntil)),
    ),
  );
  assert.ok(
    payload.benefits.every(
      (benefit) => !/배달의민족|배민/.test(`${benefit.brand} ${benefit.title} ${benefit.valueText}`),
    ),
  );
  assert.doesNotMatch(JSON.stringify(payload.sources), /배달의민족|배민/);
  assert.ok(payload.benefits.every((benefit) => !("raw" in benefit)));
  assert.ok(payload.benefits.every((benefit) => !("sourceHash" in benefit) && !("collectedAt" in benefit)));
});

test("serves AdMob app-ads.txt at the root", async () => {
  const response = await render("/app-ads.txt");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/plain\b/i);
  assert.equal(
    await response.text(),
    "google.com, pub-1118126864738967, DIRECT, f08c47fec0942fa0\n",
  );
});
