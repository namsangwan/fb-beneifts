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

  return fetch(benefitsJsonUrl, {
    headers: { accept: "application/json" },
  });
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
      const response = await fetchBenefitsJson(request, env);

      if (!response.ok) {
        return Response.json(
          { error: "benefits_json_not_found" },
          { status: 503 },
        );
      }

      return new Response(response.body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=300, stale-while-revalidate=86400",
        },
      });
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
