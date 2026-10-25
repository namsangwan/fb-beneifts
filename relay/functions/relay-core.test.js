import assert from "node:assert/strict";
import test from "node:test";

import { buildUpstreamRequest, isAllowedFinalUrl, isAuthorized } from "./relay-core.js";

test("토큰이 정확히 같을 때만 허용한다", () => {
  assert.equal(isAuthorized("Bearer abc123", "abc123"), true);
  assert.equal(isAuthorized("bearer abc123", "abc123"), true);
  assert.equal(isAuthorized("Bearer abc124", "abc123"), false);
  assert.equal(isAuthorized("Bearer abc", "abc123"), false);
  assert.equal(isAuthorized(undefined, "abc123"), false);
  assert.equal(isAuthorized("Bearer abc123", ""), false);
});

test("허용한 4개 도메인의 https만 중계한다", () => {
  assert.equal(buildUpstreamRequest({ url: "https://theventi.co.kr/new2022/news/event.html" }).ok, true);
  assert.equal(buildUpstreamRequest({ url: "https://www.lguplus.com/benefit-event/ongoing" }).ok, true);
  // 컴포즈커피는 서울 리전 IP도 막아 허용 목록에서 뺐다.
  assert.equal(buildUpstreamRequest({ url: "https://composecoffee.com/event" }).error, "host_not_allowed");
  assert.equal(buildUpstreamRequest({ url: "https://membership.kt.com/a" }).ok, true);
  assert.deepEqual(buildUpstreamRequest({ url: "https://example.com/" }), {
    ok: false,
    status: 403,
    error: "host_not_allowed",
  });
  assert.equal(buildUpstreamRequest({ url: "http://www.lguplus.com/event" }).error, "https_only");
  assert.equal(buildUpstreamRequest({ url: "https://www.lguplus.com:8443/" }).error, "host_not_allowed");
  assert.equal(buildUpstreamRequest({ url: "https://user@www.lguplus.com/" }).error, "host_not_allowed");
  assert.equal(buildUpstreamRequest({ url: "https://evil.www.lguplus.com.example/" }).error, "host_not_allowed");
  assert.equal(buildUpstreamRequest({ url: "not a url" }).error, "invalid_url");
  assert.equal(buildUpstreamRequest(null).error, "invalid_payload");
});

test("허용한 메서드와 헤더만 넘긴다", () => {
  const request = buildUpstreamRequest({
    url: "https://mo.twosome.co.kr/ev/eventListAjax.json",
    method: "post",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "secret", Host: "x" },
    body: "eventDiv=progress",
  });
  assert.equal(request.ok, true);
  assert.equal(request.init.method, "POST");
  assert.deepEqual(request.init.headers, { "content-type": "application/x-www-form-urlencoded" });
  assert.equal(request.init.body, "eventDiv=progress");
  assert.equal(buildUpstreamRequest({ url: "https://www.lguplus.com/", method: "DELETE" }).error, "method_not_allowed");
  assert.equal(
    buildUpstreamRequest({ url: "https://www.lguplus.com/", method: "POST", body: "x".repeat(10_001) }).error,
    "body_too_large",
  );
});

test("리다이렉트로 허용 도메인 밖으로 나가면 막는다", () => {
  assert.equal(isAllowedFinalUrl("https://www.lguplus.com/benefit-event/ongoing"), true);
  assert.equal(isAllowedFinalUrl("https://login.example.com/"), false);
  assert.equal(isAllowedFinalUrl("http://www.lguplus.com/"), false);
});
