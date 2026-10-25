// 서울 리전 중계의 핵심 규칙. Firebase와 무관한 순수 함수라 node:test로 검증한다.
//
// 요청 형식 (POST, JSON):
//   { "url": "https://…", "method": "GET" | "POST", "headers": { … }, "body": "…" }
// 응답: 원본의 상태 코드와 본문을 그대로 돌려준다. 원본 상태는 x-relay-upstream-status 헤더에도 담는다.
// 중계 자체의 오류(인증·허용 도메인 등)는 x-relay-error 헤더로 구분한다.

import { timingSafeEqual } from "node:crypto";

// 해외 IP를 막아 GitHub Actions에서 직접 받을 수 없는 출처만 허용한다.
export const ALLOWED_HOSTS = new Set([
  "mo.twosome.co.kr",
  "www.lguplus.com",
  "membership.kt.com",
]);

const ALLOWED_METHODS = new Set(["GET", "POST"]);
// 원본으로 넘겨도 되는 요청 헤더만 고른다. (host, cookie 등은 넘기지 않는다)
const FORWARDED_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "origin",
  "referer",
  "user-agent",
  "x-requested-with",
]);
const MAX_BODY_LENGTH = 10_000;

export function isAuthorized(authorizationHeader, token) {
  if (!token) return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader ?? "");
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * 중계 요청을 검사해 원본 요청으로 바꾼다.
 * @returns {{ ok: true, url: string, init: RequestInit } | { ok: false, status: number, error: string }}
 */
export function buildUpstreamRequest(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, status: 400, error: "invalid_payload" };

  let url;
  try {
    url = new URL(String(payload.url ?? ""));
  } catch {
    return { ok: false, status: 400, error: "invalid_url" };
  }
  if (url.protocol !== "https:") return { ok: false, status: 400, error: "https_only" };
  if (!ALLOWED_HOSTS.has(url.hostname) || url.port || url.username || url.password) {
    return { ok: false, status: 403, error: "host_not_allowed" };
  }

  const method = String(payload.method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) return { ok: false, status: 400, error: "method_not_allowed" };

  const headers = {};
  for (const [name, value] of Object.entries(payload.headers ?? {})) {
    const lower = name.toLowerCase();
    if (FORWARDED_HEADERS.has(lower) && typeof value === "string") headers[lower] = value;
  }

  const init = { method, headers, redirect: "follow" };
  if (method === "POST") {
    const body = payload.body == null ? "" : String(payload.body);
    if (body.length > MAX_BODY_LENGTH) return { ok: false, status: 413, error: "body_too_large" };
    init.body = body;
  }
  return { ok: true, url: url.href, init };
}

/** 리다이렉트로 허용 도메인 밖으로 나갔는지 확인한다. */
export function isAllowedFinalUrl(finalUrl) {
  try {
    const url = new URL(finalUrl);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
