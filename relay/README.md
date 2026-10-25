# 서울 리전 수집 중계 (Firebase)

투썸플레이스, LG U+, KT 멤버십은 해외 IP에서 오는 요청을 막는다. 더벤티는 해외 요청에 상태 200으로 사람 확인 페이지를 준다.
GitHub Actions(해외)에서는 403이나 시간 초과가 나지만, 국내 IP에서는 같은 요청이 200으로 열린다(2026-10-25 확인).

컴포즈커피 공식 이벤트도 해외 IP를 막는데, 서울 리전(Google Cloud) IP까지 403으로 막아서 수집 대상에서 뺐다.
컴포즈 혜택은 네이버페이·통신사 출처에 올라오면 그쪽으로는 계속 잡힌다.

그래서 수집기는 이 4곳 요청만 서울 리전(`asia-northeast3`)의 Firebase 함수 `relay`로 보낸다.
나머지 출처, 테스트, R2 업로드, JSON 커밋, 수집 상태 이슈는 지금처럼 GitHub Actions에서 처리한다.

```
GitHub Actions ──(4곳만)──▶ relay (서울) ──▶ 투썸·LG U+·KT·더벤티
```

## 안전장치

- `Authorization: Bearer <RELAY_TOKEN>` 헤더가 없으면 401을 돌려준다.
- 위 4개 도메인의 https 주소만 요청한다. 리다이렉트로 밖으로 나가면 막는다.
- GET·POST만 허용하고, 원본에 넘기는 헤더도 정해진 것만 고른다(쿠키 등은 넘기지 않음).
- 인스턴스는 최대 2개다.

## 비용

하루 4번 × 15건 안팎이라 Cloud Run 무료 한도의 몇 % 수준이다. 서울에서 GitHub로 보내는 전송량만 과금되는데,
응답을 gzip으로 압축해서 월 수십 원 수준이다. 다만 Cloud Functions 2세대는 **Blaze(종량제) 요금제**가 필요하다.

## 배포 (처음 한 번)

맥 터미널에서 `benefit-radar-server/relay` 폴더 기준으로 실행한다.

1. Firebase 콘솔에서 쓸 프로젝트를 고르고 **Blaze 요금제**로 바꾼다.
   이어서 Google Cloud 콘솔 → 결제 → 예산 및 알림에서 **월 1,000원 예산 알림**을 만들어 둔다.
2. Firebase CLI를 설치하고 로그인한다.
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
3. 프로젝트를 연결한다. 목록에서 프로젝트를 고르고, 별칭은 `default`로 둔다.
   ```bash
   cd relay
   firebase use --add
   ```
4. 중계 토큰을 만들어 Firebase 비밀값으로 저장한다. 출력된 토큰은 6단계에서 다시 쓰니 잠시 복사해 둔다.
   ```bash
   openssl rand -hex 32
   firebase functions:secrets:set RELAY_TOKEN    # 위에서 만든 값을 붙여 넣기
   ```
5. 배포한다. 필요한 Google Cloud API를 켤지 물으면 `Y`를 누른다.
   컨테이너 이미지 정리 정책을 물으면 1일로 둔다.
   ```bash
   (cd functions && npm ci)
   firebase deploy --only functions:relay:relay
   ```
   끝에 출력되는 **Function URL**(`https://relay-….a.run.app` 형태)을 복사한다.
6. 서울에서 4곳에 실제로 접속되는지 확인한다. 실행 위치와 상관없이 실제 요청은 서울의 함수가 보낸다.
   ```bash
   cd ..   # benefit-radar-server
   RELAY_URL="<Function URL>" RELAY_TOKEN="<토큰>" npm run check:relay
   ```
   네 줄 모두 `OK`면 된다. `(사람 확인 페이지)`가 붙으면 서울 IP에도 확인 페이지가 나오는 것이므로 그 출처는 수집하지 못한다. `status=403`이 나오면 그 사이트가 Google Cloud IP도 막는 것이다. 이 경우 수집기에 연결하지 말고 다른 방법을 정한다.
7. GitHub 저장소 → Settings → Secrets and variables → Actions에 다음을 추가한다.
   - **Variables**: `RELAY_URL` = Function URL
   - **Secrets**: `RELAY_TOKEN` = 토큰
8. Actions → **Update benefit JSON** → Run workflow로 한 번 돌린다.
   `npm run check:health`나 "수집 상태" 이슈에서 twosome·lguplus·kt·theventi 실패가 사라졌는지 확인한다.

`RELAY_URL`이나 `RELAY_TOKEN`을 지우면 수집기는 예전처럼 직접 요청한다.

## 수정·재배포

- 허용 도메인을 바꾸려면 `functions/relay-core.js`의 `ALLOWED_HOSTS`와
  수집기 `scripts/collect-benefits.mjs`의 `RELAYED_HOSTS`를 함께 고친다.
- 테스트: `cd functions && npm test`
- 재배포: `firebase deploy --only functions:relay:relay`
- 토큰 교체: 새 값으로 `firebase functions:secrets:set RELAY_TOKEN` → 재배포 → GitHub Secret도 교체
- 로그: Firebase 콘솔 → Functions → relay → 로그. 요청마다 원본 주소, 상태, 바이트 수를 남긴다.
