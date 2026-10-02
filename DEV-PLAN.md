# ArxivJS Viewer — 개발 계획 (DEV-PLAN)

arxivjs 데이터 폴더를 **읽기 전용**으로 탐색하는 VS Code 확장의 개발 계획이다.

- 작성일: 2026-10-02
- 참조 데이터: `D:\dev\javascript\arxivjsdata` (실사용 중, **쓰기 금지**)

## 1. 목표와 범위

### 1.1 목표

1. 설정한 arxivjs 데이터 폴더의 **주제 목록**을 표시한다.
2. 주제를 선택하면 해당 주제의 **논문 목록과 메타 정보**(title, authors, year, url, abstract, citation, source)를 표시한다.
3. 논문을 선택하면 그 논문의 **마크다운 문서를 렌더링**해서 보여준다.

### 1.2 범위 밖 (Non-Goals)

- 데이터 폴더에 대한 모든 쓰기: 파일 생성, 수정, 삭제, 이름 변경, 이동.
  데이터 관리는 다른 앱이 맡는다.
- 논문 수집, 요약 생성, 메타 정보 편집.
- `.txt`, `.bak` 파일 처리.
- 데이터 폴더 변경의 자동 감지. 사용자가 필요할 때 **Reload 버튼**으로 다시 읽는다(§3.2).

### 1.3 핵심 제약: 읽기 전용 보장

이 제약은 기능보다 우선한다. 구현과 검증 방법은 §7에 정리했다.

## 2. 데이터 폴더 분석 결과

`D:\dev\javascript\arxivjsdata`를 읽기만 해서 조사한 결과다.

### 2.1 최상위 구조

```text
arxivjsdata/
├── .git/                    # git 저장소 → 무시
├── .gitignore               # *.txt, *.hlt, *.bak 무시 규칙
├── .markdownlint.json
├── run-lint.bat / .sh       # markdownlint --fix 스크립트
├── userprompt*.txt
├── AI_Healthcare/           # 주제 폴더 (총 108개)
├── Activation_Function/
├── Few-Shot_Learning/
└── ...
```

- 주제 폴더는 **108개**이고, 모두 1단계 깊이다. 주제 폴더 안에 하위 폴더는 없다.
- 최상위에는 폴더가 아닌 파일과 `.git` 같은 dot 폴더가 섞여 있다. 주제 목록에서는 **폴더만, dot으로 시작하지 않는 것만** 대상으로 한다.

### 2.2 주제 폴더 이름 규칙

주제 폴더 이름은 **영숫자, 언더스코어(`_`), 하이픈(`-`)**만 허용한다(`^[A-Za-z0-9_-]+$`). 실제 데이터에는 하이픈이 들어간 폴더가 11개 있으며, 모두 이 규칙에 맞는다.

```text
Few-Shot_Learning, In-context_Learning, Long_Short-Term_Memory, Meta-Learning,
Multi-Agent_System, Multi-Task_Learning, Retrieval-Augmented_Generation,
Self-Supervised_Learning, Semi-Supervised_Learning, U-Net, Zero-Shot_Learning
```

- 규칙에 맞지 않는 폴더는 주제 목록에서 제외하고, 출력 채널에 경고 로그를 남긴다.
- 표시 이름은 `_`를 공백으로 바꾸고, 하이픈은 그대로 둔다. 예: `Few-Shot_Learning` → `Few-Shot Learning`.

### 2.3 주제 폴더 내부 파일

| 확장자  |   개수 | 의미                   | 확장의 처리                            |
| ------- | -----: | ---------------------- | -------------------------------------- |
| `.json` |  4,606 | 논문 메타 정보         | **사용** (논문 목록의 기준)            |
| `.md`   |  4,426 | 논문 요약 문서(한국어) | **사용** (렌더링 대상)                 |
| `.txt`  | 약 860 | 원문 추출 텍스트       | 무시                                   |
| `.hlt`  |    113 | 하이라이트 정보(JSON)  | 1차 무시, 후속 단계에서 선택 지원 (§9) |
| `.bak`  |      5 | 백업                   | 무시                                   |

- 파일명은 소문자 snake_case 제목에서 만든 stem이다. 예: `a_closer_look_at_few_shot_classification`.
- 같은 stem을 공유하는 `.json`과 `.md`가 한 쌍을 이룬다.
- 주제당 논문 수는 최소 1편, 최대 275편이다(`Instance_Segmentation`). 전체는 4,608편이다(json 또는 md 기준).

### 2.4 json/md 짝이 맞지 않는 경우

| 경우                  | 개수 | 처리                                                                               |
| --------------------- | ---: | ---------------------------------------------------------------------------------- |
| json은 있고 md가 없음 |  182 | 목록에 표시하되 "문서 없음" 상태로 둔다. 선택하면 메타 정보와 abstract만 보여준다. |
| md는 있고 json이 없음 |    2 | 목록에 표시한다. 제목은 md의 첫 `# H1`을 쓰고, 없으면 파일명을 쓴다.               |

md만 있는 2건은 파일명이 base64로 인코딩된 URL이다(예: `aHR0cDovL2FyeGl2...md`). 이 경우 base64를 디코딩해서 URL로 쓰는 것을 시도하고, 실패하면 URL 없이 둔다.

### 2.5 JSON 스키마 (실측)

```json
{
  "title": "A Closer Look at Few-shot Classification",
  "authors": "Wei-Yu Chen, Yen-Cheng Liu, Zsolt Kira, ...",
  "year": 2019,
  "url": "http://arxiv.org/abs/1904.04232v2",
  "abstract": "Few-shot classification aims to ...",
  "citation": 2737
}
```

| 필드       | 타입   | 존재율 | 비고                                                                                               |
| ---------- | ------ | ------ | -------------------------------------------------------------------------------------------------- |
| `title`    | string | 100%   |                                                                                                    |
| `authors`  | string | 100%   | 쉼표로 구분한 **단일 문자열**이다. 배열이 아니다.                                                  |
| `year`     | number | 100%   | 1993–2026                                                                                          |
| `url`      | string | 100%   | arXiv 외 URL도 있다(ieeexplore, mdpi, pmc 등).                                                     |
| `abstract` | string | 99.98% | 1건 누락. LaTeX 매크로가 남아 있을 수 있다(예: `\miniI`).                                          |
| `citation` | number | 98.4%  | 74건 누락. 정렬할 때 맨 뒤로 보낸다.                                                               |
| `source`   | string | 7.2%   | 메타 정보 필드로 지원한다. 값은 `arxiv`, `pdf`, `manual`. 배지로 표시하고, 없으면 표시하지 않는다. |

파싱 실패는 0건이었다. 그래도 다른 앱이 파일을 쓰는 도중에 읽을 수 있으므로, 파싱 실패와 필드 누락은 모두 방어적으로 처리한다(§6.3).

### 2.6 마크다운 문서 특성 (렌더링 요구사항)

| 특성                                                                    | 발견 수 (파일) | 요구사항                                                                                   |
| ----------------------------------------------------------------------- | -------------: | ------------------------------------------------------------------------------------------ |
| 인라인 수식 `$...$`                                                     |          4,278 | **KaTeX 필수**                                                                             |
| 블록 수식 `$$...$$`                                                     |          3,318 | **KaTeX 필수**                                                                             |
| 표(GFM table)                                                           |            241 | 표 렌더링                                                                                  |
| 원시 HTML처럼 보이는 텍스트 (`<think>`, `<kw>`, `<answer>`, `<UNK>` 등) |             42 | 태그가 아니라 본문 텍스트다. **HTML을 해석하지 말고 이스케이프해서** 글자 그대로 보여준다. |
| 이미지 `![..](https://...)`                                             |              9 | 원격 https 이미지만 있다. CSP에서 `img-src https:`를 허용한다.                             |
| 코드 블록                                                               |              6 | 기본 하이라이트                                                                            |
| mermaid                                                                 |              0 | 지원하지 않는다.                                                                           |

- 인코딩은 UTF-8이고 BOM은 없다. 가장 큰 파일은 약 118K자다.
- 문서 구조는 `# 제목` → `저자 (연도)` → `## 🧩 Problem to Solve`, `## ✨ Key Contributions` 등 이모지가 붙은 H2 섹션으로 되어 있다. 따라서 H2 목차를 만들기 좋다.

### 2.7 기타

- **같은 논문이 여러 주제에 있다.** URL 기준 155건, 파일명 기준 162건이다. 주제별로 보는 데는 문제가 없다. 전체 검색 기능을 만들 때는 중복을 정리해야 한다.
- 다른 앱(arxivjs)이 파일을 추가하거나 수정한다. 확장은 이를 자동으로 감지하지 않고, 사용자가 **Reload 버튼**을 눌렀을 때 다시 읽는다.

## 3. UX 설계

### 3.1 화면 구성

```text
┌─ Activity Bar: "ArxivJS" ─────────────┐   ┌─ Editor 영역 ─────────────────────────┐
│ TOPICS (TreeView)          [⟳] [⚙]   │   │ [Topic 패널]  Few-Shot Learning (87) [⟳]│
│ ▸ AI Healthcare            (34)       │   │  정렬: citation ▾   필터: [______]    │
│ ▾ Few-Shot Learning        (87)       │   │  ┌──────────────────────────────────┐ │
│    A Closer Look at ...  2019 · 2737  │──▶│  │ Title / Authors / Year / Cite   │ │
│    Prototypical Net...   2017 · 9xxx  │   │  │ ▸ abstract (펼치기)              │ │
│ ▸ GPT                      (12)       │   │  └──────────────────────────────────┘ │
│ ...                                   │   ├───────────────────────────────────────┤
└───────────────────────────────────────┘   │ [Paper 패널] 메타 헤더 + 렌더링된 md [⟳]│
                                            │  목차(H2) | 본문(KaTeX, 표)            │
                                            └───────────────────────────────────────┘
```

### 3.2 상호작용

| 동작                                          | 결과                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 주제 노드 펼치기                              | 그 주제의 논문을 지연 로딩해서 자식 노드로 표시한다.                                                             |
| 주제 노드 클릭                                | **Topic 패널**(Webview)을 연다. 논문 표를 보여주고, 정렬·필터와 abstract 펼치기를 지원한다.                      |
| 논문 노드 클릭, 또는 Topic 패널에서 논문 클릭 | **Paper 패널**(Webview)을 연다. 메타 헤더(제목, 저자, 연도, 인용수, source, 원문 링크)와 렌더링된 md를 보여준다. |
| 논문 노드에 마우스 올리기                     | 툴팁에 저자, 연도, 인용수, abstract 앞부분을 보여준다.                                                           |
| 원문 링크 클릭                                | 외부 브라우저로 연다(`vscode.env.openExternal`).                                                                 |
| TOPICS 제목줄 Reload `[⟳]`                    | 캐시를 모두 비우고 주제 목록을 다시 읽는다. 펼쳐져 있던 주제는 논문 목록도 다시 읽는다.                          |
| 주제 노드 인라인 Reload                       | 그 주제의 논문 목록만 다시 읽는다.                                                                               |
| Topic 패널 Reload `[⟳]`                       | 그 주제의 논문 목록을 다시 읽고 표를 갱신한다. 트리의 해당 노드도 함께 갱신된다.                                 |
| Paper 패널 Reload `[⟳]`                       | 그 논문의 json과 md를 다시 읽고 다시 렌더링한다.                                                                 |

**Reload 정책:** 파일 변경을 자동으로 감지하지 않는다(`FileSystemWatcher`를 쓰지 않는다). 한 번 읽은 데이터는 Reload 전까지 캐시를 그대로 쓴다. 데이터를 다시 읽는 시점은 사용자가 Reload를 누를 때뿐이다.

- 논문 노드의 `description`에는 `연도 · 인용수`를 표시한다. md가 없으면 아이콘을 다르게 표시한다.
- 패널 재사용: Topic 패널과 Paper 패널은 기본적으로 각각 1개만 유지하고 내용만 바꾼다(preview 모드). 설정 `arxivjs.openInNewTab`을 켜면 논문마다 새 탭을 연다.

### 3.3 명령 (Command Palette)

| ID                         | 제목                                                      |
| -------------------------- | --------------------------------------------------------- |
| `arxivjs.selectDataFolder` | ArxivJS: 데이터 폴더 선택                                 |
| `arxivjs.reload`           | ArxivJS: Reload (전체 다시 읽기)                          |
| `arxivjs.reloadTopic`      | ArxivJS: Reload Topic (주제 노드 인라인 버튼, Topic 패널) |
| `arxivjs.reloadPaper`      | ArxivJS: Reload Paper (Paper 패널)                        |
| `arxivjs.openSettings`     | ArxivJS: 설정 열기 (TOPICS 제목줄 `[⚙]`)                  |
| `arxivjs.openTopic`        | ArxivJS: 주제 열기 (QuickPick)                            |
| `arxivjs.openPaper`        | ArxivJS: 논문 열기 (QuickPick, 현재 주제)                 |
| `arxivjs.openExternal`     | ArxivJS: 원문 URL 열기                                    |
| `arxivjs.copyCitationInfo` | ArxivJS: 논문 정보 복사 (클립보드)                        |

### 3.4 설정 (`contributes.configuration`)

| 키                     | 타입    | 기본값     | 설명                                     |
| ---------------------- | ------- | ---------- | ---------------------------------------- |
| `arxivjs.dataFolder`   | string  | `""`       | 데이터 폴더 절대 경로. `scope: machine`. |
| `arxivjs.paperSort`    | enum    | `citation` | `citation` \| `year` \| `title`          |
| `arxivjs.openInNewTab` | boolean | `false`    | 논문마다 새 탭을 연다.                   |

`dataFolder`가 비어 있거나 경로가 없으면 TreeView에 **Welcome View**를 보여준다. 여기에 "데이터 폴더 선택" 버튼을 둔다.

## 4. 기술 스택

| 영역         | 선택                                                | 이유                                                                               |
| ------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 언어         | TypeScript (strict)                                 | VS Code 확장의 표준 언어                                                           |
| 번들러       | esbuild                                             | 빠르고 설정이 단순하다.                                                            |
| 최소 VS Code | `^1.90.0`                                           | 최신 Webview·TreeView API                                                          |
| 마크다운     | `markdown-it` (`html: false`, `linkify: true`)      | 원시 HTML을 이스케이프하는 것이 기본 옵션이다(§2.6).                               |
| 수식         | `@vscode/markdown-it-katex` + `katex` CSS/폰트 번들 | VS Code 내장 Markdown 미리보기와 같은 계열이다. 확장 호스트에서 HTML로 렌더링한다. |
| 앵커/목차    | `markdown-it-anchor`                                | H2 목차와 이모지 헤더 slug                                                         |
| 테스트       | `vitest`(순수 로직) + `@vscode/test-electron`(통합) |                                                                                    |
| 린트         | ESLint + `no-restricted-syntax` 규칙                | 쓰기 API를 정적으로 차단한다(§7).                                                  |
| 패키징       | `@vscode/vsce`                                      | `.vsix` 배포                                                                       |

**내장 Markdown 미리보기(`markdown.showPreview`)를 쓰지 않는 이유**

- 문서 앞에 메타 헤더를 붙일 수 없다.
- `<think>` 같은 텍스트를 HTML로 해석해서 사라지게 한다.
- 원본 파일이 편집 가능한 문서로 열릴 위험이 있다.

따라서 직접 만든 Webview를 쓴다.

## 5. 아키텍처

### 5.1 모듈 구조

```text
arxivjs-extension/
├── package.json                 # contributes: viewsContainers, views, commands, configuration
├── esbuild.mjs
├── src/
│   ├── extension.ts             # activate/deactivate, 의존성 연결
│   ├── config.ts                # 설정 읽기, 변경 이벤트
│   ├── data/
│   │   ├── readonlyFs.ts        # ★ 유일한 파일 시스템 접근 지점 (read/stat/readdir만)
│   │   ├── topicRepository.ts   # 주제 스캔, 표시 이름 변환
│   │   ├── paperRepository.ts   # json/md 짝 맞추기, 캐시, reload, 재시도
│   │   ├── paperMeta.ts         # json 파싱, md 헤더 추출, base64 파일 이름 → URL
│   │   ├── paperSort.ts         # 정렬 (citation / year / title)
│   │   ├── errors.ts            # DataError (notFound / notDirectory / io)
│   │   └── models.ts            # Topic, Paper, PaperMeta 타입
│   ├── views/
│   │   ├── topicTreeProvider.ts # TreeDataProvider<Topic | Paper>
│   │   ├── topicPanel.ts        # Topic Webview (논문 표, 초록 지연 렌더링)
│   │   ├── paperPanel.ts        # Paper Webview (메타 + md)
│   │   └── format.ts            # 표시 문자열 (vscode 비의존)
│   ├── render/
│   │   ├── markdown.ts          # markdown-it + katex, 제목 id·목차, 렌더 캐시
│   │   ├── html.ts              # Paper 템플릿, CSP, nonce, 이스케이프 유틸
│   │   └── topicHtml.ts         # Topic 템플릿, 표 데이터(JSON) 삽입
│   └── util/
│       ├── displayName.ts       # 이름 규칙 검사, "_" → " "
│       ├── logger.ts            # Logger 인터페이스 (vscode 비의존)
│       ├── mapLimit.ts          # 동시성 제한 병렬 처리
│       └── log.ts               # OutputChannel "ArxivJS"
├── media/                       # webview 리소스
│   ├── common.css               # 패널 공통 (테마 변수, 버튼, 안내, 배지)
│   ├── paper.css / paper.js     # Paper 패널
│   ├── topic.css / topic.js     # Topic 패널 (표 그리기, 이벤트)
│   └── topicModel.js            # 표 정렬·필터 규칙 (webview와 단위 테스트가 함께 씀)
├── dist/katex/                  # 빌드 때 복사하는 KaTeX CSS·woff2 폰트
└── test/
    ├── fixtures/sample-data/    # 실데이터를 축약 복사한 테스트 데이터 (아래 설명 참고)
    ├── unit/
    └── integration/
```

`test/fixtures/sample-data/`에는 실제 데이터 폴더의 일부를 복사해 둔다. 하이픈 폴더, md 누락, json 누락, `<think>` 텍스트, 수식이 든 사례를 포함한다.

### 5.2 데이터 모델

데이터 계층(`src/data/`)은 `vscode` 모듈에 의존하지 않는다. 그래서 vitest로 바로 테스트할 수 있다. 경로는 문자열(절대 경로)로 다루고, `vscode.Uri`로 바꾸는 일은 뷰 계층에서 한다.

```ts
interface Topic {
  id: string; // 폴더명 (예: "Few-Shot_Learning")
  label: string; // 표시명 (예: "Few-Shot Learning")
  path: string; // 폴더 절대 경로
}

interface PaperMeta {
  title: string;
  authors: string; // 원본 문자열 유지
  year?: number;
  url?: string;
  abstract?: string;
  citation?: number;
  source?: string; // 'arxiv' | 'pdf' | 'manual' (알 수 없는 값도 그대로 표시)
}

interface Paper {
  id: string; // `${topicId}/${stem}`
  topicId: string;
  stem: string; // 파일명 (확장자 제외)
  meta: PaperMeta;
  jsonPath?: string;
  mdPath?: string;
  metaError?: string; // JSON 파싱 실패 사유
}
```

데이터 계층의 공개 API (P1 구현):

| 모듈 | API |
| --- | --- |
| `readonlyFs.ts` | `ReadonlyFileSystem { readText, readDir, stat }`, `nodeReadonlyFs`. 오류는 `DataError(kind: notFound \| notDirectory \| io)`로 바꿔 던진다. |
| `topicRepository.ts` | `list()`, `get(id)`, `reload()` |
| `paperRepository.ts` | `list(topic)`, `isLoaded(topicId)`, `reloadTopic(topicId)`, `reloadAll()`, `reloadPaper(topic, stem)`, `readMarkdown(paper)` |
| `paperMeta.ts` | `parseMetaJson`, `parseMarkdownHeader`(md의 H1과 "저자 (연도)" 줄), `decodeStemUrl`(base64 파일 이름 → URL), `fallbackMeta` |
| `paperSort.ts` | `sortPapers(papers, mode)` |

### 5.3 데이터 흐름

```text
설정(dataFolder)
   │
   ▼
TopicRepository.list() ── readdir(root) → 폴더만, 이름 규칙 검사 → Topic[]  (캐시)
   │  주제 선택/펼치기
   ▼
PaperRepository.list(topic) ── readdir(topic) → stem별 그룹화
   │                          → json 병렬 읽기(동시성 제한 16) → Paper[]  (주제별 캐시)
   ▼
PaperPanel.show(paper) ── readFile(md) → markdown-it 렌더링(확장 호스트) → HTML → webview.html

Reload 버튼(사용자) ── 범위(전체 / 주제 / 논문)의 캐시 무효화 → 다시 읽기 → Tree 갱신 이벤트
                                        → 열린 패널이 그 범위를 보고 있으면 다시 렌더링
```

### 5.4 성능 기준

- 시작할 때 읽는 것은 최상위 `readdir` 1회뿐이다. 주제 108개는 즉시 표시된다.
- 주제를 처음 열면 json을 최대 275개 읽는다. 목표는 **500ms 이하**다(동시성 제한 병렬 읽기, 결과 캐시).
- md 렌더링 목표는 120K자 기준 **200ms 이하**다. 렌더링 결과는 LRU 캐시(20개)에 두고, Reload 시 해당 항목을 비운다.
- 확장은 `onView:arxivjs.topics`와 명령 실행 시에만 활성화한다. `*` 활성화는 쓰지 않는다.

## 6. 상세 동작 규칙

### 6.1 주제 목록

1. 기준 경로가 존재하는 디렉터리가 아니면 Welcome View와 오류 안내를 보여준다.
2. 하위 항목 중 디렉터리이고 이름이 `^[A-Za-z0-9_-]+$`에 맞는 것만 주제로 삼는다. `.git` 같은 dot 폴더는 이 규칙으로 자연히 제외된다.
3. 표시명은 `name.replace(/_/g, ' ')`다.
4. 정렬은 표시명 기준 대소문자를 무시한 사전순(`localeCompare`, `sensitivity: 'base'`)이다.
5. 각 주제 옆 개수 `(N)`은 주제를 펼친 뒤에만 계산한다. 시작 시 전체를 스캔하지 않기 위해서다.

### 6.2 논문 목록

1. `*.json`, `*.md`를 stem 기준으로 묶는다. `*.md.bak`, `*.txt`, `*.hlt`는 제외한다.
2. 정렬 기준은 `paperSort` 설정을 따른다. 기본은 citation 내림차순이고, 값이 없으면 맨 뒤로 보낸다. 같으면 year 내림차순, 그다음 title 순이다.
3. json이 없는 항목은 md의 첫 H1을 제목으로 쓰고, 없으면 stem을 쓴다.

### 6.3 오류와 경합 처리

다른 앱이 쓰는 도중의 파일을 읽을 수 있다.

- JSON 파싱에 실패하면 1회 지연 재시도한다(200ms). 그래도 실패하면 `metaError`를 표시하고 목록에는 남긴다.
- 열려는 파일이 그사이 사라졌으면(ENOENT) "파일이 없습니다. Reload 하세요"라고 안내한다.
- 모든 오류는 OutputChannel "ArxivJS"에 기록한다. 사용자 알림은 데이터 폴더 자체에 접근할 수 없을 때만 띄운다.

### 6.4 Paper 패널 렌더링

- 메타 헤더에는 제목, 저자, 연도, 인용수, source 배지, 원문 링크 버튼, 주제 이동 링크, Reload 버튼을 표시한다.
- 패널 버튼(Reload, 원문 열기)은 nonce가 붙은 최소 스크립트에서 `postMessage`로 확장에 요청한다.
- md 본문은 `markdown-it`(`html:false`)과 KaTeX로 렌더링한다. 수식 렌더링 오류는 해당 수식만 원문으로 보여준다(`throwOnError:false`).
- 목차는 H2를 기준으로 만들고, 왼쪽 또는 상단에 접을 수 있게 둔다.
- md가 없으면 abstract를 본문 대신 보여주고 "요약 문서 없음"이라고 안내한다.
- 테마는 `--vscode-*` CSS 변수를 써서 라이트, 다크, 고대비 테마를 모두 따른다.

## 7. 읽기 전용 보장 전략

| 계층               | 조치                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **설계**           | 데이터 폴더 접근은 `src/data/readonlyFs.ts` 한 곳으로만 한다. 이 모듈은 `readFile`, `readDirectory`, `stat`만 노출한다.                                                                                                                                                                                       |
| **정적 검사**      | ESLint로 `src/data/readonlyFs.ts` 밖에서 `fs`와 `vscode.workspace.fs`를 import하거나 접근하지 못하게 막는다. 전 범위에서 `writeFile`, `delete`, `rename`, `copy`, `createDirectory`, `mkdir`, `rm`, `unlink`, `appendFile`, `WorkspaceEdit` 사용을 금지한다(`no-restricted-syntax`, `no-restricted-imports`). |
| **편집 경로 차단** | md와 json을 `TextDocument` 에디터로 열지 않는다(`openTextDocument` 사용 금지). "원본 보기" 기능이 필요하면 `isReadonly: true`인 커스텀 `FileSystemProvider`(scheme `arxivjs-ro`)로만 연다.                                                                                                                    |
| **부수 파일 금지** | 캐시와 인덱스는 메모리에 둔다. 영속 캐시가 필요하면 `context.globalStorageUri`에 저장하고, 데이터 폴더에는 아무것도 만들지 않는다.                                                                                                                                                                            |
| **테스트**         | 통합 테스트는 fixture 폴더를 OS 수준 읽기 전용으로 설정한 뒤 돌린다(Windows `attrib +R /S`). 테스트 전후로 파일 해시와 mtime 스냅샷을 비교해서 하나도 바뀌지 않았는지 확인한다.                                                                                                                               |
| **개발 규칙**      | 개발 중 실제 데이터 폴더(`D:\dev\javascript\arxivjsdata`)는 `dataFolder` 설정으로 **열람만** 한다. 테스트, 스크립트, 린트 자동 수정(`markdownlint --fix` 등)은 절대 그 경로를 대상으로 하지 않는다.                                                                                                           |

## 8. 단계별 개발 일정

| 단계                | 내용                                                                                                        | 산출물 / 완료 조건                                                                                   | 예상  |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----- |
| **P0. 스캐폴딩**    | `yo code`(TS) 생성, esbuild·ESLint(읽기 전용 규칙 포함)·vitest 설정, fixture 데이터 구성                    | `F5`로 빈 확장이 실행된다. 린트와 테스트 파이프라인이 통과한다.                                      | 0.5일 |
| **P1. 데이터 계층** | `readonlyFs`, `TopicRepository`, `PaperRepository`, 모델, 오류 처리                                         | §6.1–6.3을 단위 테스트로 검증한다(하이픈 폴더, 누락 파일, 파싱 실패, 정렬).                          | 1.5일 |
| **P2. 주제 트리**   | Activity Bar 컨테이너, TreeView, Welcome View, `selectDataFolder`, Reload 버튼(전체·주제), 툴팁·description | 실데이터로 주제 108개가 표시된다. 주제를 펼치면 논문 목록이 나온다. Reload 하면 다시 읽는다.         | 1일   |
| **P3. 논문 렌더링** | Paper 패널, markdown-it + KaTeX, CSP·nonce, 메타 헤더, 목차, 외부 링크                                      | 수식·표·`<think>` 텍스트·원격 이미지가 들어간 샘플 문서가 올바르게 표시된다.                         | 1.5일 |
| **P4. 주제 패널**   | Topic 패널(표, 정렬, 필터, abstract 펼치기, Reload) 및 Paper 패널 연동·Reload                               | 275개 논문 주제에서 정렬과 필터가 끊김 없이 동작한다. fixture 복사본을 바꾼 뒤 각 Reload로 반영된다. | 1일   |
| **P5. 품질·배포**   | 통합 테스트(읽기 전용 검증 포함), 성능 측정(§5.4), README, 아이콘, `vsce package`                           | `.vsix`가 생성된다. 모든 테스트와 성능 기준을 통과한다.                                              | 1일   |

**합계: 약 6.5일** (1인 기준)

## 9. 후속 기능 후보 (Backlog)

1. **전체 검색**: 모든 주제를 가로질러 제목, 저자, abstract를 검색한다. URL 기준으로 중복 논문을 묶고 "소속 주제: A, B"로 보여준다.
2. **하이라이트 표시**: `.hlt`(`{version, highlights:[{text, color}]}`)를 읽어서 렌더링된 본문의 해당 텍스트에 배경색을 칠한다. 읽기 전용이다.
3. **통계 뷰**: 주제별 논문 수, 연도 분포.
4. **즐겨찾기 / 최근 본 논문**: 확장의 `globalState`에만 저장하고 데이터 폴더에는 쓰지 않는다.
5. **다중 데이터 폴더**: `dataFolder`를 배열로 확장한다.

## 10. 리스크와 미결 사항

| #   | 항목                                                                 | 대응                                                                                  |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| R1  | 다른 앱이 쓰는 도중에 읽어서 파싱이 실패할 수 있다.                  | 재시도와 오류 상태 표시(§6.3), 사용자가 Reload로 다시 읽을 수 있다.                   |
| R2  | 자동 감지가 없으므로 화면이 디스크보다 오래된 내용을 보여줄 수 있다. | Reload 버튼을 트리·패널마다 눈에 띄게 둔다.                                           |
| R3  | 수식 문법이 다양하다(`\begin{...}`, 매크로 미정의 등).               | KaTeX `throwOnError:false`, 필요하면 `macros` 설정 추가                               |
| R4  | md가 없는 논문 182건, json이 없는 md 2건(base64 파일명)              | §2.4의 처리 방식. 데이터 앱 쪽에서 정리할지 확인이 필요하다.                          |
| R5  | 원격 이미지를 불러오면 외부 네트워크 요청이 생긴다.                  | CSP `img-src https:`로 허용한다. 필요하면 설정으로 차단할 수 있게 하는 것을 검토한다. |
