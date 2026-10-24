/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  BENEFITS_JSON_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const DEFAULT_BENEFITS_JSON_URL =
  "https://pub-56d7d48261244062821afb49268b2223.r2.dev/benefits.json";
const APP_ADS_TXT = "google.com, pub-1118126864738967, DIRECT, f08c47fec0942fa0\n";

async function fetchBenefitsJson(request: Request, env: Env | undefined) {
  const benefitsJsonUrl = env?.BENEFITS_JSON_URL ?? DEFAULT_BENEFITS_JSON_URL;

  if (benefitsJsonUrl.startsWith("/")) {
    const assetUrl = new URL(benefitsJsonUrl, request.url);
    return env?.ASSETS ? env.ASSETS.fetch(new Request(assetUrl)) : fetch(assetUrl);
  }

  // R2 객체의 cache-control(stale-while-revalidate 1일) 때문에 Cloudflare가 Worker의 원본 요청을
  // 오래된 응답으로 계속 채우는 일이 있었다. 원본 요청은 엣지에 최대 60초만 캐시한다.
  const init: RequestInit & { cf?: { cacheTtl: number; cacheEverything: boolean } } = {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 60, cacheEverything: true },
  };
  return fetch(benefitsJsonUrl, init);
}

const BENEFITS_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=300, stale-while-revalidate=86400",
};
// 마지막으로 정상 확인한 응답을 이 키로 Cloudflare 캐시에 보관한다.
const LAST_GOOD_CACHE_KEY = "https://benefit-radar.internal/last-good-benefits.json";

type BenefitsCheck = { ok: true; body: string } | { ok: false; error: string };

function validateBenefitsBody(body: string): BenefitsCheck {
  try {
    const payload = JSON.parse(body) as { schemaVersion?: unknown; benefits?: unknown; asOfDate?: unknown };
    if (payload.schemaVersion !== 1 || !Array.isArray(payload.benefits) || typeof payload.asOfDate !== "string") {
      return { ok: false, error: "benefits_json_invalid" };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, error: "benefits_json_invalid" };
  }
}

function defaultCache(): Cache | null {
  const cacheStorage = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return cacheStorage?.default ?? null;
}

async function loadBenefits(request: Request, env: Env | undefined): Promise<BenefitsCheck> {
  try {
    const response = await fetchBenefitsJson(request, env);
    if (!response.ok) return { ok: false, error: "benefits_json_not_found" };
    return validateBenefitsBody(await response.text());
  } catch {
    return { ok: false, error: "benefits_json_unreachable" };
  }
}

async function handleBenefits(request: Request, env: Env | undefined, ctx: ExecutionContext) {
  const result = await loadBenefits(request, env);
  const cache = defaultCache();

  if (result.ok) {
    if (cache) {
      ctx.waitUntil(
        cache
          .put(
            LAST_GOOD_CACHE_KEY,
            new Response(result.body, { headers: { ...BENEFITS_HEADERS, "cache-control": "public, max-age=604800" } }),
          )
          .catch(() => undefined),
      );
    }
    return new Response(result.body, { status: 200, headers: BENEFITS_HEADERS });
  }

  // 원본이 일시적으로 없거나 깨졌으면 마지막 정상 응답을 대신 준다. 앱은 asOfDate로 오래된 정도를 판단한다.
  const lastGood = cache ? await cache.match(LAST_GOOD_CACHE_KEY).catch(() => undefined) : undefined;
  if (lastGood) {
    return new Response(lastGood.body, {
      status: 200,
      headers: { ...BENEFITS_HEADERS, "cache-control": "public, max-age=60", "x-benefits-fallback": result.error },
    });
  }

  return Response.json({ error: result.error }, { status: 503, headers: { "cache-control": "no-store" } });
}

const worker = {
  async fetch(request: Request, env: Env | undefined, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/app-ads.txt") {
      return new Response(APP_ADS_TXT, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    if (url.pathname === "/api/benefits") {
      return handleBenefits(request, env, ctx);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env as Env, ctx);
  },
};

export default worker;
