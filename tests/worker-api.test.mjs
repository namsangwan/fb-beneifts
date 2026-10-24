// /api/benefits 장애 처리 테스트. 빌드된 Worker(dist/server/index.js)를 대상으로 한다.
import assert from "node:assert/strict";
import test from "node:test";

const validBody = JSON.stringify({ schemaVersion: 1, asOfDate: "2026-10-24", benefits: [{ id: "a" }] });

function memoryCache() {
  const store = new Map();
  return {
    async put(key, response) {
      store.set(String(key), await response.text());
    },
    async match(key) {
      const body = store.get(String(key));
      return body === undefined ? undefined : new Response(body);
    },
  };
}

async function callApi(assetFetch, cache) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  const previous = globalThis.caches;
  globalThis.caches = cache ? { default: cache } : undefined;
  const pending = [];
  try {
    const response = await worker.fetch(
      new Request("http://localhost/api/benefits"),
      { ASSETS: { fetch: assetFetch }, BENEFITS_JSON_URL: "/data/benefits.json" },
      { waitUntil: (promise) => pending.push(promise), passThroughOnException() {} },
    );
    await Promise.all(pending);
    return response;
  } finally {
    globalThis.caches = previous;
  }
}

test("원본이 없으면 503을 돌려준다", async () => {
  const response = await callApi(async () => new Response("no", { status: 404 }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "benefits_json_not_found" });
});

test("원본 요청이 예외로 끝나도 503 JSON을 돌려준다", async () => {
  const response = await callApi(async () => {
    throw new TypeError("network down");
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "benefits_json_unreachable" });
});

test("깨진 JSON은 전달하지 않는다", async () => {
  const response = await callApi(async () => new Response("{ broken"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "benefits_json_invalid" });
});

test("원본이 실패하면 마지막 정상 응답을 대신 준다", async () => {
  const cache = memoryCache();
  const ok = await callApi(async () => new Response(validBody), cache);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), validBody);

  const fallback = await callApi(async () => new Response("down", { status: 500 }), cache);
  assert.equal(fallback.status, 200);
  assert.equal(fallback.headers.get("x-benefits-fallback"), "benefits_json_not_found");
  assert.equal(await fallback.text(), validBody);
});
