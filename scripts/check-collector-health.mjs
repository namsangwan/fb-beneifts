// 수집 결과(public/data/benefits.json)를 읽어 출처별 상태를 요약한다.
// GitHub Actions에서 이 요약으로 "수집 상태" 이슈를 열고, 갱신하고, 정상화되면 닫는다.
//
// 사용법: node scripts/check-collector-health.mjs [--json]
//   기본 출력은 이슈 본문용 Markdown이다.
//   --json 은 { unhealthy, failed, empty, counts } 를 출력한다.
import { readFile } from "node:fs/promises";

const payload = JSON.parse(await readFile("public/data/benefits.json", "utf8"));
const warnings = payload.warnings ?? [];
const kindOf = (warning) => warning.kind ?? (/no current benefits/.test(warning.reason) ? "empty" : "failed");
const failed = warnings.filter((warning) => kindOf(warning) === "failed");
const empty = warnings.filter((warning) => kindOf(warning) === "empty");

const counts = {};
for (const benefit of payload.benefits ?? []) counts[benefit.provider] = (counts[benefit.provider] ?? 0) + 1;

// 네이버페이는 핵심 출처라 0건이면 실패로 본다.
const criticalEmpty = ["naverpay"].filter((provider) => !counts[provider]);
const unhealthy = failed.length > 0 || criticalEmpty.length > 0;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ unhealthy, failed, empty, counts, criticalEmpty }));
} else {
  const lines = [
    `마지막 수집: ${payload.asOfLabel} (총 ${payload.benefits?.length ?? 0}건)`,
    "",
    "이 이슈는 수집 workflow가 자동으로 갱신합니다. 모든 출처가 정상으로 돌아오면 자동으로 닫힙니다.",
    "",
  ];
  if (failed.length || criticalEmpty.length) {
    lines.push("### 수집 실패", "", "| 출처 | 이유 | 이전 데이터로 유지 |", "|---|---|---|");
    for (const warning of failed) {
      lines.push(`| ${warning.source} | ${String(warning.reason).replaceAll("|", "\\|")} | ${warning.fallbackCount}건 |`);
    }
    for (const provider of criticalEmpty) lines.push(`| ${provider} | 0건 수집 | - |`);
    lines.push("");
  }
  if (empty.length) {
    lines.push("### 0건 (참고)", "", "| 출처 | 이전 데이터로 유지 |", "|---|---|");
    for (const warning of empty) lines.push(`| ${warning.source} | ${warning.fallbackCount}건 |`);
    lines.push("");
  }
  lines.push(
    "### 출처별 건수",
    "",
    Object.entries(counts)
      .map(([provider, count]) => `${provider} ${count}`)
      .join(" · ") || "없음",
  );
  console.log(lines.join("\n"));
}
