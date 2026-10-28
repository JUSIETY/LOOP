# GitHub Pages 배포

이 프로젝트는 기존 서버 빌드와 GitHub Pages용 정적 빌드를 함께 제공합니다. 정적 진입점은 `pages-client/`, 빌드 설정은 `vite.pages.config.ts`입니다.

```sh
npm ci
npm run build:pages
```

생성된 `docs/` 폴더를 커밋한 뒤 GitHub 저장소의 **Settings → Pages → Deploy from a branch → main /docs**로 설정합니다. 기본 주소는 `https://JUSIETY.github.io/loop-ai-recycling/`입니다.

- 정적 화면, 카메라 퀴즈, AI 실험실, 모델 파일은 GitHub Pages에서 제공합니다.
- 행사 생성·참가, 점수·오답 공유는 기존 공개 API 서버(`https://loop-ai-recycling-20261021.dreamhun07.chatgpt.site`)를 사용합니다. 서버에서 Pages 출처에 대한 CORS를 허용해야 합니다.
- 연습 기록과 이미지 특징 데이터는 접속한 브라우저에 보관됩니다. 기존 사이트에 저장된 브라우저 데이터와 운영자 권한은 GitHub Pages로 자동 이전되지 않습니다.
- 서버의 개인 키나 운영자 토큰은 빌드에 넣지 않습니다. `VITE_`로 시작하는 값은 공개되는 설정입니다.

저장소 이름이나 API 주소를 바꾸면 다음처럼 다시 빌드합니다.

```sh
VITE_PAGES_BASE=/다른-저장소-이름/ VITE_API_BASE=https://공개-API-주소 npm run build:pages
```

로컬 정적 화면 확인:

```sh
npm run dev:pages -- --host 127.0.0.1
```

기존 서버 빌드(`npm run build`)와 개발 명령(`npm run dev`)은 그대로 사용할 수 있습니다.

불확실한 사진은 ChatGPT 웹사이트에서 사용자가 직접 확인합니다. 사진 복사 또는 PNG 저장 후 ChatGPT에 첨부하고, JSON 답변을 앱에 붙여넣어 품목 후보로 적용합니다. 유료 API 키는 필요하지 않지만 ChatGPT의 로그인·이용 한도가 적용될 수 있습니다. 사진을 직접 첨부하면 OpenAI로 전송됩니다.
