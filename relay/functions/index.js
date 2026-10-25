// 카페할인 모아 수집 중계 (Firebase Cloud Functions 2세대, 서울 리전)
//
// 컴포즈커피·투썸플레이스·LG U+·KT 멤버십은 해외(GitHub Actions) IP를 막는다.
// 수집기는 이 4곳 요청만 이 함수로 보내고, 함수가 서울에서 대신 받아 돌려준다.
// 규칙은 relay-core.js, 배포·설정 방법은 ../README.md를 본다.

import { gzipSync } from "node:zlib";

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

import { buildUpstreamRequest, isAllowedFinalUrl, isAuthorized } from "./relay-core.js";

const RELAY_TOKEN = defineSecret("RELAY_TOKEN");
const UPSTREAM_TIMEOUT_MS = 25_000;

export const relay = onRequest(
  {
    region: "asia-northeast3",
    // KT 상세 페이지처럼 한 번에 여러 요청이 오므로 인스턴스 하나가 동시에 여러 요청을 처리하게 한다.
    // (vCPU가 1보다 작으면 동시 처리 1건으로 고정된다)
    cpu: 1,
    memory: "512MiB",
    concurrency: 20,
    timeoutSeconds: 60,
    maxInstances: 2,
    secrets: [RELAY_TOKEN],
    // 함수 주소는 공개지만, 토큰이 없으면 401만 돌려준다.
    invoker: "public",
  },
  async (request, response) => {
    const fail = (status, error) => {
      response.set("x-relay-error", error);
      response.status(status).json({ error });
    };

    if (request.method !== "POST") return fail(405, "post_only");
    if (!isAuthorized(request.get("authorization"), RELAY_TOKEN.value())) return fail(401, "unauthorized");

    const upstream = buildUpstreamRequest(request.body);
    if (!upstream.ok) return fail(upstream.status, upstream.error);

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(upstream.url, {
        ...upstream.init,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error?.name === "TimeoutError" ? "upstream_timeout" : "upstream_unreachable";
      logger.warn("relay upstream failed", { url: upstream.url, reason, cause: error?.cause?.code });
      return fail(502, reason);
    }
    if (!isAllowedFinalUrl(upstreamResponse.url)) return fail(502, "redirect_not_allowed");

    const body = Buffer.from(await upstreamResponse.arrayBuffer());
    logger.info("relay", { url: upstream.url, status: upstreamResponse.status, bytes: body.length });

    response.set("x-relay-upstream-status", String(upstreamResponse.status));
    response.set("content-type", upstreamResponse.headers.get("content-type") ?? "application/octet-stream");
    response.set("cache-control", "no-store");
    // 서울에서 나가는 전송량(과금 대상)을 줄이려고 압축해서 보낸다.
    if (/\bgzip\b/.test(request.get("accept-encoding") ?? "") && body.length > 1024) {
      response.set("content-encoding", "gzip");
      response.status(upstreamResponse.status).send(gzipSync(body));
    } else {
      response.status(upstreamResponse.status).send(body);
    }
  },
);
