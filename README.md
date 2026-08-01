# 페이 혜택 레이더

네이버페이와 토스의 커피/베이커리 결제 혜택을 매일 수집하고, 앱에서는 빠르게 개인화된 혜택만 보는 MVP입니다. 기본 목록에는 수집 기준일 현재 유효하거나 앞으로 시작되는 혜택만 노출합니다.

## 첫 버전 범위

- 공식 출처: 네이버페이 F&B 혜택, 토스피드 현재 월 프로모션
- 카테고리: 커피, 베이커리, 간식
- 개인화: 선호 페이, 자주 가는 브랜드, 카테고리, 만료 혜택 숨김
- 앱 데이터: 배치가 생성한 `public/data/benefits.json`
- 서버 API: `/api/benefits`가 R2의 공개 JSON을 서버 쪽에서 읽어 같은 도메인으로 응답
- 공개 JSON 서버: Cloudflare R2의 `benefits.json`
- 앱 저장소: 브라우저 로컬 저장소에 개인 필터 저장

## 데이터 모델

```ts
type Benefit = {
  provider: "naverpay" | "toss";
  brand: string;
  category: "coffee" | "bakery" | "snack";
  title: string;
  discountType: "instant_discount" | "point_reward" | "coupon";
  valueText: string;
  minSpend?: number;
  startsAt?: string;
  endsAt?: string;
  paymentMethod?: string;
  sourceUrl: string;
  sourceHash: string;
  collectedAt: string;
};
```

## 수집 파이프라인

1. 매일 오전 9시에 수집 작업 실행
2. 공식 페이지 다운로드
3. 페이지별 파서로 브랜드, 금액 조건, 할인율, 기간 추출
4. 출처별 고유 ID와 `sourceHash` 생성
5. 종료일이 지난 혜택은 제외
6. 앱용 `public/data/benefits.json`과 감사용 `data/benefits.snapshot.json` 저장
7. Cloudflare R2에 `benefits.json` 업로드
8. 변경분이 있으면 커밋

## Cloudflare R2 설정

1. Cloudflare에서 R2 버킷 생성
   - 추천 버킷 이름: `benefit-radar`
   - Standard storage 사용
2. R2 버킷의 Public access 설정
   - 개발용이면 `r2.dev` Public Development URL 사용 가능
   - 실제 앱용이면 custom domain 권장
3. Cloudflare API Token 생성
   - 권한: R2 Object Read & Write
   - 범위: 이 프로젝트용 R2 버킷 또는 계정
4. GitHub 저장소에 값 추가
   - Repository secret: `CLOUDFLARE_ACCOUNT_ID`
   - Repository secret: `CLOUDFLARE_API_TOKEN`
   - Repository variable: `R2_BUCKET` = `benefit-radar`
5. 수동 실행
   - GitHub Actions에서 `Update benefit JSON` 워크플로를 `workflow_dispatch`로 실행

현재 앱에서 사용하는 JSON URL:

```text
https://pub-56d7d48261244062821afb49268b2223.r2.dev/benefits.json
```

나중에 도메인을 붙이면 앱의 `NEXT_PUBLIC_BENEFITS_JSON_URL` 값을 다음처럼 바꾸면 됩니다.

```text
https://benefits.<your-domain>.com/benefits.json
```

## 퍼블릭 화면 배포

화면은 Cloudflare Workers에 배포합니다.

1. Cloudflare API Token 권한 확인
   - R2 업로드 권한
   - Workers 배포 권한
   - 대시보드에서 보이는 이름은 보통 `Workers Scripts: Edit` 또는 `Edit Cloudflare Workers`
2. GitHub 저장소의 `CLOUDFLARE_API_TOKEN`이 위 권한을 포함해야 함
3. `main` 브랜치에 push하면 `Deploy web app` 워크플로가 실행됨
4. 수동 배포는 GitHub Actions에서 `Deploy web app` 워크플로의 `Run workflow` 실행
5. 배포가 끝나면 Workers URL이 생성됨

```text
https://benefit-radar.<your-workers-subdomain>.workers.dev
```

앱 화면은 기본적으로 같은 도메인의 `/api/benefits`를 읽습니다. Worker가 R2의 공개 JSON을 서버 쪽에서 가져오므로 브라우저 CORS 설정에 덜 민감합니다. 순수 정적 배포로 바꾸고 싶을 때만 `NEXT_PUBLIC_BENEFITS_JSON_URL`에 R2 URL을 직접 넣으면 됩니다.

## 출처별 수집 방식

- 네이버페이: F&B 혜택 목록 API 응답을 정규화하고 종료일이 지난 항목은 제외
- 토스: `https://toss.im/tossfeed/article/tosspay-promotion` 현재 월 글에서 커피/베이커리 관련 현재/미래 혜택만 추출

## 다음 단계

- `npm run collect`로 JSON 스냅샷 생성
- `npm run upload:r2`로 `public/data/benefits.json`을 R2에 업로드
- `npm run deploy:web`으로 빌드된 화면을 Cloudflare Workers에 배포
- GitHub Actions의 `Update benefit JSON` 워크플로가 매일 00:00 UTC, 한국시간 09:00에 실행
- 앱은 같은 도메인의 `/api/benefits`를 호출하고, Worker가 R2의 공개 `benefits.json`을 읽어 반환
- 내 주변 매장, 혜택 종료 임박 알림, 브랜드별 최저가 랭킹 추가
