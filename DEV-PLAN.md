# ArxivJS VSCode Extension — 개발 계획 (DEV-PLAN)

arxivjs 데이터 폴더(arxivjsdata)를 VS Code에서 탐색하고, 사용자가 켜면 편집까지 하는 확장의 개발 계획이다.

- 작성일: 2026-10-02 (0.2.0까지 읽기 전용 뷰어)
- 개정일: 2026-10-19 (쓰기 기능 추가 계획, 0.3.0)
- 참조 데이터: `D:\dev\javascript\arxivjsdata` (실사용 중, 개발·테스트 중 **쓰기 금지**, §7.3)
- 데이터 형식 기준: arxivjs 저장소의 `docs/arxivjsdata-format-specification.md` v1.1 (이하 "형식 명세")

## 0. 개정 요약 (0.2.0 → 0.3.0)

| 항목           | 0.2.0까지                                    | 0.3.0부터                                                                       |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| 확장 이름      | ArxivJS Viewer                               | **ArxivJS VSCode Extension** (확장 ID `doosik71.arxivjs-viewer`는 그대로)       |
| 데이터 폴더    | 읽기 전용                                    | 기본은 읽기 전용. 설정 `arxivjs.enableWrite`를 켜면 쓰기 기능을 쓸 수 있다.     |
| 쓰기 기능      | 없음                                         | 토픽 관리, 논문 추가·편집·이동·삭제, AI 요약 생성·삭제                          |
| AI 요약        | 없음 (arxivjs 앱의 일)                       | Gemini 또는 Ollama를 확장이 직접 호출한다. arxivjs 앱이 없어도 동작한다.        |
| API 키         | —                                            | VS Code `SecretStorage`에 보관한다.                                             |
| 토픽 폴더 이름 | `^[A-Za-z0-9_-]+$`만 표시                    | 형식 명세 §6에 맞춰 한글, 괄호, 공백도 허용한다.                                |
| 요약 백업      | —                                            | `.bak`을 만들지 않는다. 기존 `.md`는 그대로 덮어쓴다.                           |

이 개정의 결정은 모두 사용자 결정(2026-10-19)이다.

## 1. 목표와 범위

### 1.1 목표

읽기 (0.2.0까지 완료):

1. 설정한 arxivjs 데이터 폴더의 **주제 목록**을 표시한다.
2. 주제를 선택하면 해당 주제의 **논문 목록과 메타 정보**(title, authors, year, url, abstract, citation, source)를 표시한다.
3. 논문을 선택하면 그 논문의 **마크다운 문서를 렌더링**해서 보여준다.

쓰기 (0.3.0, `arxivjs.enableWrite`가 켜져 있을 때만):

4. **토픽 관리**: 토픽을 만들고, 이름을 바꾸고, 빈 토픽을 지운다.
5. **논문 추가**: arXiv 검색, arXiv URL/ID, 메타 정보 직접 입력으로 논문을 추가한다.
6. **논문 관리**: 메타 정보를 고치고, 논문을 다른 토픽으로 옮기고, 지운다.
7. **AI 요약**: Gemini 또는 Ollama로 논문 요약(`.md`)을 만들거나 다시 만든다. 요약 문서가 없는 논문을 토픽 단위로 한꺼번에 요약한다.

### 1.2 범위 밖 (Non-Goals)

- **arxivjs 앱과의 연동.** 확장은 arxivjs 서버를 호출하지 않고 파일을 직접 다룬다. arxivjs 앱이 없어도 모든 기능이 동작해야 한다.
- 요약 백업(`.bak`) 생성. 기존 `.bak`, `.md.bak`은 읽지도 만들지도 않는다(§6.6의 이동 규칙 제외).
- 하이라이트(`.hlt`) 편집. 기존 `.hlt`는 그대로 둔다(§6.5).
- 논문 채팅, 초록 번역, 인용 수 자동 조회. 후속 후보로 둔다(§10).
- 데이터 폴더 변경의 자동 감지. 다른 앱이 바꾼 내용은 사용자가 **Reload 버튼**으로 다시 읽는다(§3.2). 확장이 직접 쓴 변경은 쓰기 직후 해당 범위를 자동으로 다시 읽는다.

### 1.3 핵심 제약: 쓰기는 사용자가 켤 때만

- `arxivjs.enableWrite`의 기본값은 `false`다. 이때 확장의 동작은 0.2.0과 같은 읽기 전용이다.
- 쓰기는 모두 단일 모듈(`src/data/dataWriter.ts`)을 거친다. 이 모듈은 설정이 꺼져 있으면 아무것도 쓰지 않는다.
- 쓰는 파일은 형식 명세의 작성기(writer) 규칙을 따른다. 명세와 다르게 하는 부분은 §2.8에 모두 적는다.

구현과 검증 방법은 §7에 정리했다.

## 2. 데이터 폴더 분석과 형식 규칙

`D:\dev\javascript\arxivjsdata`를 읽기만 해서 조사한 결과(2026-10-02)와, 형식 명세에서 가져온 쓰기 규칙이다.

### 2.1 최상위 구조

```text
arxivjsdata/
├── .git/                    # git 저장소 → 무시
├── .gitignore               # *.txt, *.hlt, *.bak 무시 규칙
├── .markdownlint.json
├── run-lint.bat / .sh       # markdownlint --fix 스크립트
├── userprompt.txt           # 요약 프롬프트 템플릿 ({context} 자리표시자)
├── userprompt-*.txt         # 사용자 보관용 → 무시
├── AI_Healthcare/           # 주제 폴더 (총 108개)
├── Activation_Function/
├── Few-Shot_Learning/
└── ...
```

- 주제 폴더는 **108개**이고, 모두 1단계 깊이다. 주제 폴더 안에 하위 폴더는 없다. 확장도 하위 폴더를 만들지 않는다.
- 최상위의 일반 파일 중 의미가 있는 것은 `userprompt.txt`뿐이다(§8.3). 나머지 파일과 `.`으로 시작하는 항목은 무시한다.

### 2.2 주제 폴더 이름 규칙 (0.3.0에서 변경)

형식 명세 §6을 따른다.

```ts
// 표시명 정규화: '_'를 공백으로, 연속 공백을 하나로, 앞뒤 공백 제거
normalizeTopicDisplayName(name) = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
// 표시명 → 폴더명
toTopicFolderName(name) = normalizeTopicDisplayName(name).replace(/\s+/g, '_')
// 폴더명 → 표시명
toTopicDisplayName(folderName) = normalizeTopicDisplayName(folderName)
```

- **허용 문자**: 정규화한 표시명이 `^[a-zA-Z0-9가-힣 ()-]+$`를 만족해야 한다. 영문, 숫자, 한글 완성형, 공백, `(`, `)`, `-`다.
- **읽기**: `.`으로 시작하지 않는 디렉터리 중, 표시명이 위 규칙을 만족하는 것을 주제로 삼는다. 폴더 이름에 공백이 그대로 들어 있어도(예: `AI Healthcare`) 주제로 표시한다. 규칙에 맞지 않는 폴더는 목록에서 빼고 출력 채널에 경고를 남긴다.
- **쓰기**: 새 폴더 이름은 반드시 `toTopicFolderName`으로 만든다. 그래서 확장이 만드는 폴더 이름에는 공백 대신 `_`가 들어간다(`AI Healthcare` → `AI_Healthcare`). arxivjs 앱이 같은 토픽을 찾으려면 이 변환이 필요하다.
- **중복 검사**: 만들거나 이름을 바꿀 때, 대소문자만 다른 폴더나 표시명이 같은 폴더가 이미 있으면 거부한다(Windows, macOS 파일 시스템은 대소문자를 구분하지 않는다).
- 표시명에서 `_`와 공백은 구분하지 않는다.

실제 데이터의 108개 폴더는 모두 기존 규칙(`^[A-Za-z0-9_-]+$`)에도 맞으므로, 이 변경으로 기존 표시가 달라지지는 않는다.

### 2.3 주제 폴더 내부 파일

| 확장자     |   개수 | 의미                   | 확장의 처리                                                                  |
| ---------- | -----: | ---------------------- | ---------------------------------------------------------------------------- |
| `.json`    |  4,606 | 논문 메타 정보         | 읽기·쓰기 (논문 목록의 기준)                                                 |
| `.md`      |  4,426 | 논문 요약 문서(한국어) | 읽기·쓰기 (렌더링 대상, AI 요약 결과)                                        |
| `.txt`     | 약 860 | 전문 텍스트 캐시       | 요약할 때 읽고, PDF에서 새로 뽑았을 때 쓴다(§8.3). 목록에는 쓰지 않는다.     |
| `.hlt`     |    113 | 하이라이트 정보(JSON)  | 읽지 않는다. 이동·삭제할 때만 번들로 함께 다룬다(§6.6).                      |
| `.bak`     |      5 | 요약 백업              | 읽지 않고 만들지 않는다. 이동할 때 원본 토픽의 것을 지운다(형식 명세 §9.3). |

- 파일명(stem)은 paperId다. 기존 논문의 paperId는 **`.json` 파일 이름**에서 얻고, 제목으로 다시 계산하지 않는다(레거시 paperId가 있다).
- 같은 stem을 공유하는 파일들이 논문 번들 하나를 이룬다.
- 주제당 논문 수는 최소 1편, 최대 275편이다(`Instance_Segmentation`). 전체는 4,608편이다(json 또는 md 기준).

### 2.4 json/md 짝이 맞지 않는 경우

| 경우                  | 개수 | 처리                                                                               |
| --------------------- | ---: | ---------------------------------------------------------------------------------- |
| json은 있고 md가 없음 |  182 | 목록에 표시하되 "문서 없음" 상태로 둔다. 선택하면 메타 정보와 abstract만 보여준다. |
| md는 있고 json이 없음 |    2 | 목록에 표시한다. 제목은 md의 첫 `# H1`을 쓰고, 없으면 파일명을 쓴다.               |

md만 있는 2건은 파일명이 base64로 인코딩된 URL이다(예: `aHR0cDovL2FyeGl2...md`). 이 경우 base64를 디코딩해서 URL로 쓰는 것을 시도하고, 실패하면 URL 없이 둔다.

json이 없는 항목에는 쓰기 기능(요약, 편집, 이동)을 제공하지 않는다. 형식 명세는 이런 고아 파일을 무시하라고 하지만, 0.2.0 동작을 유지한다(§11 R7).

### 2.5 JSON 스키마

```json
{
  "title": "A Closer Look at Few-shot Classification",
  "authors": "Wei-Yu Chen, Yen-Cheng Liu, Zsolt Kira, ...",
  "year": 2019,
  "url": "http://arxiv.org/abs/1904.04232v2",
  "abstract": "Few-shot classification aims to ...",
  "citation": 2737,
  "source": "arxiv"
}
```

| 필드       | 타입   | 존재율 (실측) | 비고                                                                                   |
| ---------- | ------ | ------------- | -------------------------------------------------------------------------------------- |
| `title`    | string | 100%          | 필수. 공백을 정리한 값(`replace(/\s+/g, ' ').trim()`)                                  |
| `authors`  | string | 100%          | 필수. 쉼표로 구분한 **단일 문자열**이다. 배열이 아니다. 공백 정리는 `title`과 같다.    |
| `year`     | number | 100%          | 필수. 1993–2026. 정수로 저장한다.                                                      |
| `url`      | string | 100%          | arXiv 외 URL도 있다(ieeexplore, mdpi, pmc 등). `source`에 따라 의미가 다르다(§8.3).    |
| `abstract` | string | 99.98%        | 1건 누락. LaTeX 매크로가 남아 있을 수 있다(예: `\miniI`).                              |
| `citation` | number | 98.4%         | 74건 누락. 없으면 "모름"이고 `0`과 다르다. 정렬할 때 맨 뒤로 보낸다.                   |
| `source`   | string | 7.2%          | `arxiv`, `pdf`, `manual`. 없으면 `arxiv`로 해석한다. 새로 저장할 때는 반드시 넣는다.   |

파싱 실패는 0건이었다. 그래도 다른 앱이 파일을 쓰는 도중에 읽을 수 있으므로, 파싱 실패와 필드 누락은 모두 방어적으로 처리한다(§6.3).

`.json` 쓰기 규칙 (형식 명세 §8.1):

- `JSON.stringify(obj, null, 2)` 서식, UTF-8(BOM 없음), 끝 줄바꿈 없음.
- 기존 파일을 고칠 때는 쓰기 직전에 다시 읽고(read-modify-write), 확장이 모르는 필드도 그대로 남긴다.
- `id`, `hasSummary`, `hasHighlights`는 저장하지 않는다.
- 확장 전용 필드가 필요하면 `x_arxivjs_vscode_` 접두사를 쓴다. 0.3.0에서는 추가하지 않는다.

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
- 문서 구조는 `# 제목` → `저자 (연도)` → `## 🧩 Problem to Solve`, `## ✨ Key Contributions` 등 이모지가 붙은 H2 섹션으로 되어 있다. 이 구조는 `userprompt.txt`가 정한다. 따라서 H2 목차를 만들기 좋다.

### 2.7 기타

- **같은 논문이 여러 주제에 있다.** URL 기준 155건, 파일명 기준 162건이다. 형식 명세에서도 각 사본은 독립된 논문이다.
- 다른 앱(arxivjs)이 같은 폴더를 동시에 쓸 수 있다. 잠금은 없다(§6.7).

### 2.8 형식 명세와 다르게 하는 부분

| 형식 명세                                                        | 이 확장                                           | 근거                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| §8.2, §9.2: 요약을 다시 만들 때 기존 `.md`를 `.bak`으로 복사 (SHOULD) | 백업 없이 덮어쓴다                                | 사용자 결정. 권장(SHOULD) 항목이라 명세 위반은 아니다.                           |
| §9.5: 요약 삭제는 `.md`를 `.bak`으로 이름 변경                   | `.md`와 `.hlt`를 지운다. 확인 대화상자를 띄운다. | 사용자 결정(백업 불필요). arxivjs 앱의 요약 삭제와 결과가 다르다(`.bak`이 남지 않음). |
| §11: 판독기는 json 없는 고아 파일을 무시 (MUST)                   | md만 있는 항목도 목록에 표시 (0.2.0 동작 유지)   | §2.4. 쓰기 기능은 제공하지 않는다.                                               |

## 3. UX 설계

### 3.1 화면 구성

```text
┌─ Activity Bar: "ArxivJS" ─────────────┐   ┌─ Editor 영역 ─────────────────────────┐
│ TOPICS (TreeView)   [+][🏠][⟳][📂][⚙] │   │ [Topic 패널]  Few-Shot Learning (87) [⟳][+]│
│ ▸ AI Healthcare            (34)       │   │  정렬: citation ▾   필터: [______]    │
│ ▾ Few-Shot Learning        (87)       │   │  ┌──────────────────────────────────┐ │
│    A Closer Look at ...  2019 · 2737  │──▶│  │ Title / Authors / Year / Cite   │ │
│    Prototypical Net...   2017 · 9xxx  │   │  │ ▸ abstract (펼치기)              │ │
│ ▸ GPT                      (12)       │   │  └──────────────────────────────────┘ │
│ ...                                   │   ├───────────────────────────────────────┤
└───────────────────────────────────────┘   │ [Paper 패널] 메타 헤더 + 렌더링된 md     │
                                            │  [⟳][원문][로컬 문서][요약 생성][편집]  │
                                            │  목차(H2) | 본문(KaTeX, 표)            │
                                            └───────────────────────────────────────┘
```

`[+]`, `[요약 생성]`, `[편집]` 같은 쓰기 버튼은 `arxivjs.enableWrite`가 켜져 있을 때만 보인다.

### 3.2 상호작용 (읽기)

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

**Reload 정책:** 파일 변경을 자동으로 감지하지 않는다(`FileSystemWatcher`를 쓰지 않는다). 한 번 읽은 데이터는 Reload 전까지 캐시를 그대로 쓴다. 예외로, 확장이 직접 쓴 뒤에는 그 범위(전체·주제·논문)를 자동으로 다시 읽는다.

- 논문 노드의 `description`에는 `연도 · 인용수`를 표시한다. md가 없으면 아이콘을 다르게 표시한다.
- 패널 재사용: 홈과 Topic 패널은 각각 1개만 유지하고 내용만 바꾼다.
- Paper 패널은 기본으로 논문마다 새 탭을 연다(`arxivjs.openInNewTab`, 기본 `true`). 같은 논문을 다시 열면 기존 탭으로 간다. 설정을 끄면 탭 하나를 재사용한다.
- Paper 패널을 열 편집기 그룹(`arxivjs.paperPanelLocation`):
  - `sameGroup`(기본): 논문 목록(Topic 패널)과 같은 그룹에 탭으로 연다. 화면이 좁은 모니터를 고려해 기본값으로 정했다.
  - `beside`: 목록 오른쪽 그룹에 연다. 논문은 그 그룹 하나에 모인다.
  - `ViewColumn.Active`와 `ViewColumn.Beside`는 쓰지 않는다. 둘 다 그때의 활성 그룹을 기준으로 하는데, 논문을 열면 포커스가 논문 쪽으로 옮겨 가서 `beside`일 때 클릭할 때마다 화면이 계속 나뉜다. 그래서 그룹 번호를 직접 정한다.

### 3.2.1 홈 (주제 목록 페이지)

- ArxivJS 뷰를 처음 열 때 편집기 영역에 홈을 연다. 설정 `arxivjs.openHomeOnStartup`(기본 `true`)으로 끌 수 있다. TOPICS 제목줄의 `[🏠]` 버튼이나 명령 `arxivjs.openHome`으로 다시 연다.
- 모든 주제를 카드 목록으로 보여준다. 각 카드에는 논문 수가 붙는다.
  - 첫 화면은 주제 목록(최상위 `readdir` 1회)만으로 바로 그린다.
  - 논문 수는 그 뒤에 비동기로 센다. 폴더 목록만 읽는 `PaperRepository.count`를 동시에 16개씩 돌리고, 결과를 50ms마다 묶어 webview로 보낸다.
  - webview는 도착한 수를 채운다. "논문 수순" 정렬일 때만 잠깐 모았다가 다시 정렬한다.
  - webview가 준비되기 전에 보낸 메시지는 사라질 수 있다. 그래서 webview가 `ready`를 보내면 지금까지 센 수를 한 번에 다시 보낸다.
  - Reload나 데이터 폴더 변경으로 다시 그리면, 진행 중이던 개수 세기는 버린다.
- 필터는 표시 이름과 폴더 이름에서 찾는다. 모든 낱말이 들어 있어야 하고, 대소문자는 무시한다.
  - `Enter`: 보이는 첫 주제를 연다.
  - `↓`: 첫 주제로 포커스를 옮긴다.
- 정렬은 이름순과 논문 수순 두 가지다. 주제를 누르면 Topic 패널이 열린다.
- Reload(전체·주제·논문)와 데이터 폴더 변경을 모두 반영한다. 데이터 폴더가 바뀌어도 홈은 닫지 않고 새 폴더로 다시 그린다.
- 쓰기가 켜져 있으면 홈에 `+ 주제 추가` 버튼을 둔다.

### 3.2.2 쓰기 상호작용 (0.3.0, `arxivjs.enableWrite` 켜짐)

UI 문구는 기존 화면과 같이 "주제"를 쓴다(이 문서의 "토픽"과 같은 뜻). 입력은 VS Code 기본 UI(`showInputBox`, `showQuickPick`, 확인 대화상자)를 우선 쓴다. 여러 필드를 한꺼번에 입력해야 하는 메타 정보 편집만 Webview 폼을 쓴다.

| 위치                         | 동작                    | 결과                                                                                                                       |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| TOPICS 제목줄 `[+]`, 홈      | 주제 추가               | InputBox로 표시명을 받는다. 허용 문자와 중복을 입력 중에 검사한다(§2.2). 폴더를 만든다.                                    |
| 주제 노드 컨텍스트 메뉴      | 주제 이름 변경          | InputBox(현재 표시명이 기본값). 대상이 있으면 거부한다. 폴더 이름만 바뀌고 안의 파일 이름은 그대로다.                      |
| 주제 노드 컨텍스트 메뉴      | 주제 삭제               | 폴더가 **완전히 비어 있을 때만** 지운다. 파일이 남아 있으면(`.txt`, `.bak` 포함) 확인 대화상자 전에 남은 파일을 알리고 지우지 않는다. |
| 주제 노드 메뉴, Topic 패널 `[+]` | 논문 추가               | QuickPick: `arXiv 검색` / `arXiv URL·ID` / `직접 입력` (§6.6.2)                                                            |
| 주제 노드 컨텍스트 메뉴      | 요약 없는 논문 일괄 요약 | 그 주제에서 `.md`가 없는 논문을 차례로 요약한다. 진행률 알림에 취소 버튼을 둔다(§8.4).                                     |
| 논문 노드 메뉴, Paper 패널   | 요약 생성 / 다시 생성   | 요약이 있으면 덮어쓸지 확인한다. 진행률 알림에서 취소할 수 있다. 끝나면 Paper 패널을 다시 그린다.                          |
| 논문 노드 메뉴, Paper 패널   | 메타 정보 편집          | Webview 폼(title, authors, year, url, abstract, citation, source). 저장하면 read-modify-write로 `.json`을 고친다.          |
| 논문 노드 메뉴               | 다른 주제로 이동        | QuickPick으로 대상 주제를 고른다. 번들 단위로 옮긴다(§6.6.4).                                                             |
| 논문 노드 메뉴               | 논문 삭제               | 모달 확인 후 번들을 지운다(§6.6.5).                                                                                        |
| 논문 노드 메뉴, Paper 패널   | 요약 삭제               | 모달 확인 후 `.md`와 `.hlt`를 지운다(§2.8). 되돌릴 수 없다고 안내한다.                                                     |

- 삭제, 덮어쓰기처럼 되돌릴 수 없는 작업은 모두 모달 확인을 거친다.
- 쓰기 명령은 `when: config.arxivjs.enableWrite`로 메뉴와 Command Palette에서 숨긴다. Webview 버튼도 같은 조건으로 그린다.
- 설정이 바뀌면 열린 패널을 다시 그려 버튼을 보이거나 숨긴다.

### 3.3 명령 (Command Palette)

읽기 (0.2.0):

| ID                         | 제목                                                      |
| -------------------------- | --------------------------------------------------------- |
| `arxivjs.openHome`         | ArxivJS: 주제 목록(홈) 열기 (TOPICS 제목줄 `[🏠]`)         |
| `arxivjs.selectDataFolder` | ArxivJS: 데이터 폴더 선택                                 |
| `arxivjs.reload`           | ArxivJS: Reload (전체 다시 읽기)                          |
| `arxivjs.reloadTopic`      | ArxivJS: Reload Topic (주제 노드 인라인 버튼, Topic 패널) |
| `arxivjs.reloadPaper`      | ArxivJS: Reload Paper (Paper 패널)                        |
| `arxivjs.openSettings`     | ArxivJS: 설정 열기 (TOPICS 제목줄 `[⚙]`)                  |
| `arxivjs.openTopic`        | ArxivJS: 주제 열기 (QuickPick)                            |
| `arxivjs.openPaper`        | ArxivJS: 논문 열기 (QuickPick: 주제 → 논문)               |
| `arxivjs.openExternal`     | ArxivJS: 원문 URL 열기                                    |
| `arxivjs.copyCitationInfo` | ArxivJS: 논문 정보 복사 (클립보드)                        |

쓰기 (0.3.0, `enableWrite`가 켜져 있을 때만 보임):

| ID                            | 제목                                  |
| ----------------------------- | ------------------------------------- |
| `arxivjs.createTopic`         | ArxivJS: 주제 추가                    |
| `arxivjs.renameTopic`         | ArxivJS: 주제 이름 변경               |
| `arxivjs.deleteTopic`         | ArxivJS: 주제 삭제                    |
| `arxivjs.addPaper`            | ArxivJS: 논문 추가                    |
| `arxivjs.editPaperMeta`       | ArxivJS: 메타 정보 편집               |
| `arxivjs.movePaper`           | ArxivJS: 논문을 다른 주제로 이동      |
| `arxivjs.deletePaper`         | ArxivJS: 논문 삭제                    |
| `arxivjs.summarizePaper`      | ArxivJS: 요약 생성                    |
| `arxivjs.summarizeTopic`      | ArxivJS: 요약 없는 논문 일괄 요약     |
| `arxivjs.deleteSummary`       | ArxivJS: 요약 삭제                    |

항상 보임:

| ID                          | 제목                        |
| --------------------------- | --------------------------- |
| `arxivjs.setGeminiApiKey`   | ArxivJS: Gemini API 키 설정 |
| `arxivjs.clearGeminiApiKey` | ArxivJS: Gemini API 키 삭제 |

### 3.4 설정 (`contributes.configuration`)

| 키                           | 타입    | 기본값                   | 설명                                                                 |
| ---------------------------- | ------- | ------------------------ | -------------------------------------------------------------------- |
| `arxivjs.dataFolder`         | string  | `""`                     | 데이터 폴더 절대 경로. `scope: machine`.                             |
| `arxivjs.enableWrite`        | boolean | `false`                  | **데이터 폴더 쓰기 기능을 켠다.** 끄면 0.2.0과 같은 읽기 전용이다.   |
| `arxivjs.paperSort`          | enum    | `citation`               | `citation` \| `year` \| `title`                                      |
| `arxivjs.openInNewTab`       | boolean | `true`                   | 논문마다 새 탭을 연다.                                               |
| `arxivjs.paperPanelLocation` | enum    | `sameGroup`              | `sameGroup` \| `beside` (§3.2)                                       |
| `arxivjs.openHomeOnStartup`  | boolean | `true`                   | ArxivJS 뷰를 처음 열 때 홈을 연다 (§3.2.1)                           |
| `arxivjs.llm.engine`         | enum    | `gemini`                 | 요약에 쓸 엔진: `gemini` \| `ollama`                                 |
| `arxivjs.gemini.model`       | string  | `gemini-2.5-flash`       | Gemini 모델 이름 (arxivjs 기본값과 같다)                             |
| `arxivjs.ollama.url`         | string  | `http://localhost:11434` | Ollama 서버 주소. `scope: machine`.                                  |
| `arxivjs.ollama.model`       | string  | `""`                     | Ollama 모델 이름 (예: `gemma4:31b`)                                  |

- API 키는 설정에 두지 않는다. Gemini API 키는 `SecretStorage`(키 이름 `arxivjs.gemini.apiKey`)에만 저장한다(§8.2).
- `dataFolder`가 비어 있거나 경로가 없으면 TreeView에 **Welcome View**를 보여준다. 여기에 "데이터 폴더 선택" 버튼을 둔다. 안내 문구는 쓰기 설정 상태에 맞게 바꾼다("이 확장은 데이터 폴더를 읽기만 합니다" 문구 삭제).

## 4. 기술 스택

| 영역         | 선택                                                | 이유                                                                               |
| ------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 언어         | TypeScript (strict)                                 | VS Code 확장의 표준 언어                                                           |
| 번들러       | esbuild                                             | 빠르고 설정이 단순하다.                                                            |
| 최소 VS Code | `^1.90.0`                                           | 최신 Webview·TreeView API. 확장 호스트 Node에 전역 `fetch`가 있다.                 |
| 마크다운     | `markdown-it` (`html: false`, `linkify: true`)      | 원시 HTML을 이스케이프하는 것이 기본 옵션이다(§2.6).                               |
| 수식         | `@vscode/markdown-it-katex` + `katex` CSS/폰트 번들 | VS Code 내장 Markdown 미리보기와 같은 계열이다. 확장 호스트에서 HTML로 렌더링한다. |
| 앵커/목차    | `markdown-it-anchor`                                | H2 목차와 이모지 헤더 slug                                                         |
| HTTP         | 전역 `fetch`                                        | arXiv API, PDF 다운로드, Gemini/Ollama REST. 추가 의존성 없음.                     |
| LLM          | Gemini REST(`streamGenerateContent`), Ollama REST(`/api/generate`) | SDK 없이 REST를 직접 호출한다. 의존성을 늘리지 않고, 테스트에서 `fetch`를 주입하기 쉽다. |
| arXiv 응답   | 직접 작성한 작은 Atom 파서 (`src/sources/arxiv.ts`) | (P8에서 결정) 필요한 필드가 `<entry>`의 id, title, summary, published, author/name뿐이다. 후보였던 `fast-xml-parser` 5.x는 하위 의존성 6개, 1.3MB라 쓰지 않았다. 실제 arXiv 응답으로 확인했다. |
| PDF 텍스트   | `unpdf` 1.8.1 (MIT, 의존성 없음, 최신 pdf.js 내장)   | (P9에서 결정) `pdf-parse` 2.x는 네이티브 모듈(`@napi-rs/canvas`)이 필요하고 21MB다. 1.x(arxivjs)는 2018년 pdf.js라 CVE-2024-4367 범위다. `pdfjs-dist`는 35MB, ESM 전용이다. unpdf의 pdf.js 빌드에는 글꼴 eval 경로가 없다. 공개된 지 두 달이 넘은 1.8.1로 고정했다. |
| 테스트       | `vitest`(순수 로직) + `@vscode/test-electron`(통합) |                                                                                    |
| 린트         | ESLint + `no-restricted-syntax` 규칙                | 쓰기 API를 `dataWriter.ts` 밖에서 쓰지 못하게 막는다(§7).                          |
| 패키징       | `@vscode/vsce`                                      | `.vsix` 배포                                                                       |

**내장 Markdown 미리보기(`markdown.showPreview`)를 쓰지 않는 이유**

- 문서 앞에 메타 헤더를 붙일 수 없다.
- `<think>` 같은 텍스트를 HTML로 해석해서 사라지게 한다.
- 원본 파일이 편집 가능한 문서로 열릴 위험이 있다.

따라서 직접 만든 Webview를 쓴다.

## 5. 아키텍처

### 5.1 모듈 구조

`★`는 0.3.0에서 새로 만들거나 크게 바꾸는 모듈이다.

```text
arxivjs-extension/
├── package.json                 # contributes: viewsContainers, views, commands, menus, configuration
├── esbuild.mjs
├── src/
│   ├── extension.ts             # activate/deactivate, 의존성 연결
│   ├── config.ts                # 설정 읽기, 변경 이벤트 (★ enableWrite, LLM 설정 추가)
│   ├── data/
│   │   ├── readonlyFs.ts        # 읽기 전용 파일 시스템 접근 (read/stat/readdir)
│   │   ├── dataWriter.ts        # ★ 유일한 쓰기 지점. 원자적 쓰기, mkdir, rename, 삭제. enableWrite 검사
│   │   ├── topicRepository.ts   # 주제 스캔, 표시 이름 변환 (★ 이름 규칙 변경)
│   │   ├── paperRepository.ts   # json/md 짝 맞추기, 캐시, reload, 재시도
│   │   ├── paperMeta.ts         # json 파싱, md 헤더 추출, base64 파일 이름 → URL
│   │   ├── paperSort.ts         # 정렬 (citation / year / title)
│   │   ├── topicOps.ts          # ★ 토픽 생성·이름 변경·삭제 (형식 명세 §6.3)
│   │   ├── paperOps.ts          # ★ 논문 저장·메타 수정·이동·삭제·요약 삭제 (형식 명세 §9)
│   │   ├── metaForm.ts          # ★ 메타 정보 입력 폼 값 검사, 바꾼 필드만 고르는 patch
│   │   ├── paperId.ts           # ★ slugifyPaperTitle, 제목·저자 정리
│   │   ├── errors.ts            # DataError (notFound / notDirectory / io / ★ conflict / writeDisabled)
│   │   └── models.ts            # Topic, Paper, PaperMeta 타입
│   ├── sources/                 # ★ 외부 데이터 (vscode 비의존, fetch 주입)
│   │   ├── arxiv.ts             # arXiv 검색, ID/URL 조회, Atom 파싱
│   │   ├── fullText.ts          # .txt 캐시 → PDF 다운로드 → 텍스트 추출 → .txt 저장
│   │   ├── pdfText.ts           # unpdf로 PDF → 텍스트
│   │   ├── pdfWorker.ts         # 작업자 진입점 (dist/pdfWorker.js로 따로 번들)
│   │   └── pdfWorkerClient.ts   # 추출할 때마다 작업자를 띄우는 PdfTextExtractor
│   ├── llm/                     # ★ (vscode 비의존, fetch 주입)
│   │   ├── common.ts            # LlmError, 스트림 줄 읽기(SSE·NDJSON), 오류 응답 해석
│   │   ├── engine.ts            # LlmSettings, 설정 검사, 엔진 선택
│   │   ├── gemini.ts            # Gemini REST
│   │   ├── ollama.ts            # Ollama REST
│   │   └── summarize.ts         # userprompt.txt + 전문 → LLM → .md 저장
│   ├── views/
│   │   ├── topicTreeProvider.ts # TreeDataProvider<Topic | Paper> (★ contextValue로 쓰기 메뉴 구분)
│   │   ├── topicPanel.ts        # Topic Webview (논문 표, 초록 지연 렌더링)
│   │   ├── paperPanel.ts        # Paper Webview (메타 + md, ★ 쓰기 버튼)
│   │   ├── metaEditPanel.ts     # ★ 메타 정보 편집 폼 (추가의 "직접 입력"과 같이 씀)
│   │   └── format.ts            # 표시 문자열 (vscode 비의존)
│   ├── commands/
│   │   ├── writeCommands.ts     # ★ 쓰기 명령 등록(주제), 공용 도우미, 확인 대화상자, 쓰기 후 reload
│   │   └── paperCommands.ts     # ★ 논문 쓰기 명령 (추가, 메타 편집, 이동, 삭제, 요약 삭제)
│   ├── render/
│   │   ├── markdown.ts          # markdown-it + katex, 제목 id·목차, 렌더 캐시
│   │   ├── html.ts              # Paper 템플릿, CSP, nonce, 이스케이프 유틸
│   │   └── topicHtml.ts         # Topic 템플릿, 표 데이터(JSON) 삽입
│   └── util/
│       ├── displayName.ts       # 이름 규칙 검사, 표시명 ↔ 폴더명 (★ 형식 명세 §6)
│       ├── logger.ts            # Logger 인터페이스 (vscode 비의존)
│       ├── mapLimit.ts          # 동시성 제한 병렬 처리
│       └── log.ts               # OutputChannel "ArxivJS"
├── media/                       # webview 리소스
├── dist/katex/                  # 빌드 때 복사하는 KaTeX CSS·woff2 폰트
└── test/
    ├── fixtures/sample-data/    # 실데이터를 축약 복사한 테스트 데이터 (읽기 테스트용, 수정 금지)
    ├── unit/
    └── integration/
```

`test/fixtures/sample-data/`에는 실제 데이터 폴더의 일부를 복사해 둔다. 하이픈 폴더, md 누락, json 누락, `<think>` 텍스트, 수식이 든 사례를 포함한다. 0.3.0에서 한글·괄호·공백이 든 토픽 폴더 사례를 추가한다. 쓰기 테스트는 이 폴더를 임시 디렉터리로 복사해서 한다(§7.2).

### 5.2 데이터 모델

데이터 계층(`src/data/`), `src/sources/`, `src/llm/`은 `vscode` 모듈에 의존하지 않는다. 그래서 vitest로 바로 테스트할 수 있다. 경로는 문자열(절대 경로)로 다루고, `vscode.Uri`로 바꾸는 일은 뷰 계층에서 한다. 네트워크 접근은 `fetch` 함수를 주입받아서 테스트에서 가짜로 바꿀 수 있게 한다.

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
  stem: string; // 파일명 (확장자 제외) = paperId
  meta: PaperMeta;
  jsonPath?: string;
  mdPath?: string;
  metaError?: string; // JSON 파싱 실패 사유
}
```

데이터 계층의 공개 API:

| 모듈                 | API                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `readonlyFs.ts`      | `ReadonlyFileSystem { readText, readDir, stat }`, `nodeReadonlyFs`. 오류는 `DataError(kind: notFound \| notDirectory \| io)`로 바꿔 던진다. |
| `dataWriter.ts` ★    | `DataWriter { writeTextAtomic, makeDirectory, move, removeFile, removeEmptyDirectory }`, `createDataWriter({ root, isEnabled })`. 대상이 데이터 폴더의 주제 폴더나 그 안의 파일인지 검사한다(아니면 `invalidPath`). 쓰기가 꺼져 있으면 `writeDisabled`. 대상이 있거나 폴더가 비어 있지 않으면 `conflict`. 메서드 이름은 ESLint가 금지하는 fs API 이름과 겹치지 않게 지었다. |
| `topicRepository.ts` | `list()`, `get(id)`, `reload()`                                                                                                             |
| `paperRepository.ts` | `list(topic)`, `isLoaded(topicId)`, `reloadTopic(topicId)`, `reloadAll()`, `reloadPaper(topic, stem)`, `readMarkdown(paper)`                |
| `topicOps.ts` ★      | `checkTopicName(displayName, existingNames, currentFolder?)`, `createTopic(ctx, displayName)`, `renameTopic(ctx, topicId, newDisplayName)`, `deleteTopic(ctx, topicId)`, `summarizeEntries(names)`. `ctx`는 `Library.ops`(`{ root, fs, writer }`) |
| `paperOps.ts` ★      | `savePaper(ctx, topic, paper, { paperId?, overwrite? })`, `paperExists(ctx, topic, paperId)`, `readPaperMeta(ctx, paper)`, `updateMeta(ctx, paper, patch)`, `movePaper(ctx, paper, from, to)` → `moved \| replaced \| keptTarget`, `deletePaper(ctx, paper, topic)`, `deleteSummary(ctx, paper, topic)`, `resolvePaperId(title, requested?)`. `writeSummary`는 P9에서 더한다. |
| `metaForm.ts` ★      | `parseMetaForm(values, mode)`, `toFormValues(meta)`, `toMetaPatch(initial, submitted, paper)` — 편집할 때는 사용자가 바꾼 필드만 저장해서 불필요한 diff를 만들지 않는다. |
| `sources/arxiv.ts` ★ | `parseArxivId(input)`, `searchArxiv(keywords, { fetch, maxResults?, signal? })`, `fetchArxivById(id, { fetch, signal? })`, `parseArxivFeed(xml)` |
| `paperMeta.ts`       | `parseMetaJson`, `parseMarkdownHeader`(md의 H1과 "저자 (연도)" 줄), `decodeStemUrl`(base64 파일 이름 → URL), `fallbackMeta`                 |
| `paperSort.ts`       | `sortPapers(papers, mode)`                                                                                                                  |

### 5.3 데이터 흐름

```text
읽기
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

쓰기 (enableWrite)
명령(메뉴·패널 버튼) ── 입력 UI·확인 ── topicOps / paperOps ── DataWriter(원자적 쓰기)
                                                                   │
                                     범위 캐시 무효화 + 다시 읽기 ◀──┘ (Reload와 같은 경로)

요약
summarizePaper ── 전문: .txt 캐시 → 없으면 PDF 다운로드·추출 → .txt 저장
              ── userprompt.txt의 {context} 치환 → LlmEngine 스트리밍(취소 가능)
              ── 응답 완료 시에만 paperOps.writeSummary(.md 덮어쓰기) → 논문 reload
```

### 5.4 성능 기준

- 시작할 때 읽는 것은 최상위 `readdir` 1회뿐이다. 주제 108개는 즉시 표시된다.
- 주제를 처음 열면 json을 최대 275개 읽는다. 목표는 **500ms 이하**다(동시성 제한 병렬 읽기, 결과 캐시).
- md 렌더링 목표는 120K자 기준 **200ms 이하**다. 렌더링 결과는 LRU 캐시(20개)에 두고, Reload 시 해당 항목을 비운다.
- 확장은 `onView:arxivjs.topics`와 명령 실행 시에만 활성화한다. `*` 활성화는 쓰지 않는다.
- 쓰기 기능은 읽기 성능 기준에 영향을 주지 않아야 한다. `npm run bench` 목표는 그대로 둔다. arXiv XML 파서와 PDF 라이브러리는 쓰는 시점에 불러와(lazy import) 활성화 시간을 늘리지 않는다.

## 6. 상세 동작 규칙

### 6.1 주제 목록

1. 기준 경로가 존재하는 디렉터리가 아니면 Welcome View와 오류 안내를 보여준다.
2. 하위 항목 중 디렉터리이고, 이름이 `.`으로 시작하지 않고, 표시명이 `^[a-zA-Z0-9가-힣 ()-]+$`에 맞는 것만 주제로 삼는다(§2.2).
3. 표시명은 `toTopicDisplayName(folderName)`이다(`_` → 공백, 연속 공백 정리, 앞뒤 공백 제거).
4. 정렬은 표시명 기준 대소문자를 무시한 사전순(`localeCompare`, `sensitivity: 'base'`)이다.
5. 각 주제 옆 개수 `(N)`은 주제를 펼친 뒤에만 계산한다. 시작 시 전체를 스캔하지 않기 위해서다.

### 6.2 논문 목록

1. `*.json`, `*.md`를 stem 기준으로 묶는다. `*.bak`, `*.md.bak`, `*.txt`, `*.hlt`는 제외한다.
2. 정렬 기준은 `paperSort` 설정을 따른다. 기본은 citation 내림차순이고, 값이 없으면 맨 뒤로 보낸다. 같으면 year 내림차순, 그다음 title 순이다.
3. json이 없는 항목은 md의 첫 H1을 제목으로 쓰고, 없으면 stem을 쓴다.

### 6.3 오류와 경합 처리 (읽기)

다른 앱이 쓰는 도중의 파일을 읽을 수 있다.

- JSON 파싱에 실패하면 1회 지연 재시도한다(200ms). 그래도 실패하면 `metaError`를 표시하고 목록에는 남긴다.
- 열려는 파일이 그사이 사라졌으면(ENOENT) "파일이 없습니다. Reload 하세요"라고 안내한다.
- 모든 오류는 OutputChannel "ArxivJS"에 기록한다. 사용자 알림은 데이터 폴더 자체에 접근할 수 없을 때만 띄운다.

### 6.4 Paper 패널 렌더링

- 메타 헤더에는 제목, 저자, 연도, 인용수, source 배지, 원문 링크 버튼, 주제 이동 링크, Reload 버튼을 표시한다.
- 쓰기가 켜져 있으면 `요약 생성`(요약이 있으면 `요약 다시 생성`, P9), `메타 편집`, `요약 삭제` 버튼을 더한다. `.json`이 없거나 깨진 논문에는 `메타 편집`을 보이지 않는다.
- 패널 버튼은 nonce가 붙은 최소 스크립트에서 `postMessage`로 확장에 요청한다. 확장은 메시지를 받으면 `enableWrite`를 다시 검사한다.
- md 본문은 `markdown-it`(`html:false`)과 KaTeX로 렌더링한다. 수식 렌더링 오류는 해당 수식만 원문으로 보여준다(`throwOnError:false`).
- 목차는 H2를 기준으로 만들고, 왼쪽 또는 상단에 접을 수 있게 둔다.
- md가 없으면 abstract를 본문 대신 보여주고 "요약 문서 없음"이라고 안내한다.
- 테마는 `--vscode-*` CSS 변수를 써서 라이트, 다크, 고대비 테마를 모두 따른다.

### 6.5 쓰기 공통 규칙

1. **원자적 쓰기**: 같은 디렉터리에 `.<파일이름>.tmp`로 쓴 뒤 `rename`으로 바꿔치기한다. `.`으로 시작하므로 다른 판독기는 읽지 않는다. 실패하면 임시 파일을 지운다.
2. **경로 검사**: `DataWriter`는 모든 대상 경로를 정규화해서 데이터 폴더 바로 아래 또는 토픽 폴더 바로 아래인지 확인한다. 그 밖의 경로는 거부한다.
3. **서식**: UTF-8(BOM 없음). `.json`은 `JSON.stringify(obj, null, 2)`, 끝 줄바꿈 없음. 확장자는 소문자.
4. **read-modify-write**: `.json`을 고칠 때는 쓰기 직전에 디스크에서 다시 읽고, 바꾸는 필드만 덮어쓴다. 캐시에 든 객체를 그대로 쓰지 않는다.
5. **저장 금지 필드**: `id`, `hasSummary`, `hasHighlights`는 쓰기 전에 뺀다.
6. **쓰기 후 갱신**: 작업이 끝나면 영향을 받은 범위(토픽 목록, 토픽, 논문)를 다시 읽고 트리와 열린 패널을 갱신한다.
7. **`.hlt`**: 요약을 다시 만들거나 메타를 고쳐도 `.hlt`는 건드리지 않는다. 맞지 않는 하이라이트는 arxivjs 앱이 다음에 읽을 때 정리한다(형식 명세 §8.2, §8.4).
8. **로그**: 모든 쓰기(경로, 작업 종류)를 OutputChannel에 기록한다.

### 6.6 작업별 파일 시스템 동작

형식 명세 §6.3, §9를 따른다. 차이는 §2.8에 적은 것뿐이다.

#### 6.6.1 토픽

| 작업      | 동작                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| 생성      | `mkdir <toTopicFolderName(표시명)>`. 같은 폴더나 대소문자만 다른 폴더가 있으면 실패                        |
| 이름 변경 | `rename <이전 폴더명> <새 폴더명>`. 대상이 있으면 실패. 대소문자만 바꾸는 경우는 임시 이름을 거쳐 두 번 바꾼다. 열린 Topic·Paper 패널은 새 이름으로 다시 연결한다 |
| 삭제      | 폴더가 **완전히 비어 있을 때만** `rmdir`. 비어 있지 않으면 남은 파일 종류와 개수를 알린다                 |

#### 6.6.2 논문 추가

1. 메타 정보를 얻는다.
   - **arXiv 검색**: 검색어의 낱말마다 `all:`을 붙여 AND로 이은 `search_query`로 `export.arxiv.org/api/query`를 부른다(관련도순, 최대 50편). 결과를 QuickPick(제목, 연도·arXiv ID, 저자)으로 보여주고, 이 주제에 이미 있는 논문은 "이미 있음"으로 표시한다. 여러 개를 고를 수 있다. 조회는 진행률 알림에서 취소할 수 있다.
   - **arXiv URL·ID**: `2310.16485`, `arxiv.org/abs/...`, `arxiv.org/pdf/...` 형식을 받아 `id_list`로 조회한다.
   - **직접 입력**: 메타 편집 폼을 빈 상태로 연다. `source`는 `pdf`(PDF URL이 있을 때) 또는 `manual`로 고른다.
   - arXiv에서 얻은 논문은 `source: "arxiv"`, `url`은 abs URL이다. `citation`은 넣지 않는다("모름").
2. `title`, `authors` 공백을 정리하고 `year`를 정수로 만든다.
3. paperId = `slugifyPaperTitle(title)`. 결과가 빈 문자열이면(영문·숫자가 없는 제목) 사용자에게 slug 형식의 paperId를 받는다(`slugify(id) === id`, 비어 있지 않음).
4. 같은 토픽에 같은 paperId의 `.json`이 이미 있으면 덮어쓸지 묻는다. 여러 편이면 한 번에 묻고, 기본은 건너뛰기다. 직접 입력은 덮어쓰지 않고 기존 논문의 메타 편집을 안내한다.
5. `<topic>/<paperId>.json`을 원자적으로 쓴다.

#### 6.6.3 메타 정보 편집

- 폼에서 바꾼 필드만 read-modify-write로 저장한다. 모르는 필드는 남는다.
- `title`이 바뀌어도 **paperId(파일 이름)는 바꾸지 않는다**(형식 명세 §7.2). 그래서 부속 파일과의 연결이 유지된다.
- 검증: `title`·`authors` 비어 있으면 안 됨, `year`는 정수, `citation`은 비우거나 0 이상의 정수, `source`는 세 값 중 하나. `source`가 `pdf`이면 `url`이 필수다.

#### 6.6.4 논문 이동 (토픽 A → 토픽 B)

형식 명세 §9.3을 그대로 구현한다.

- B에 같은 paperId의 `.json`이 없으면 `.json`, `.md`, `.hlt`, `.txt`를 이름 그대로 옮긴다.
- 있으면 두 `.json`의 `dateAdded`(없으면 `date`, 둘 다 없으면 epoch)를 비교한다. 그 뒤 처리는 명세 §9.3의 표를 따른다. 실제 데이터에는 이 필드가 없으므로 대부분 "대상 유지" 쪽으로 간다. 그래서 충돌이 있으면 먼저 사용자에게 알리고 계속할지 묻는다.
- 어느 경우든 A의 `<paperId>.bak`, `<paperId>.md.bak`은 지운다. 이동이 끝나면 A에는 그 paperId의 파일이 남지 않는다.
- `manual` 논문의 `.txt`는 유일한 전문이므로 반드시 함께 옮긴다.

#### 6.6.5 논문 삭제

`<paperId>.json`, `.md`, `.hlt`, `.txt`를 지운다. 없는 파일은 무시한다. 기존 백업 파일은 남는다(형식 명세 §9.4). `manual` 논문이면 확인 대화상자에 "전문 텍스트도 함께 지워지며 다시 만들 수 없다"고 적는다.

#### 6.6.6 요약 저장과 삭제

- 저장: `<paperId>.md`를 원자적으로 쓴다. 기존 파일은 백업 없이 덮어쓴다(§2.8). 응답이 중간에 실패하거나 취소되면 `.md`를 바꾸지 않는다.
- 삭제: `<paperId>.md`와 `<paperId>.hlt`를 지운다. `.json`과 `.txt`는 그대로 둔다(§2.8).

### 6.7 쓰기 경합 처리

`arxivjsdata`에는 잠금이 없다. arxivjs 앱, `update_summary.js`, 이 확장이 같은 폴더를 동시에 쓸 수 있다.

- 원자적 쓰기(§6.5)로 반쯤 쓴 파일이 보이지 않게 한다.
- `.json`은 쓰기 직전에 다시 읽는다. 일괄 요약처럼 오래 걸리는 작업도 논문마다 저장 직전에 대상 `.json`이 아직 있는지 확인한다. 없어졌으면 그 논문은 건너뛰고 로그를 남긴다.
- 대상이 사라졌거나(ENOENT) 이미 있는(EEXIST) 경우는 `DataError(conflict)`로 바꿔 사용자에게 "다른 앱이 바꿨을 수 있습니다. Reload 후 다시 시도하세요"라고 안내한다.
- 두 앱이 같은 파일을 거의 동시에 쓰면 나중에 쓴 쪽이 남는다. 이 위험은 없앨 수 없으므로 README에 적는다(§11 R6).

## 7. 데이터 보호 전략

0.2.0의 "읽기 전용 보장"을 "쓰기는 한 곳에서, 켜졌을 때만"으로 바꾼다.

### 7.1 계층별 조치

| 계층               | 조치                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **설정**           | `arxivjs.enableWrite` 기본값 `false`. 꺼져 있으면 쓰기 명령, 메뉴, 패널 버튼이 보이지 않는다.                                                                                                                                                                              |
| **설계**           | 읽기는 `src/data/readonlyFs.ts`, 쓰기는 `src/data/dataWriter.ts` 한 곳으로만 한다. `DataWriter`는 호출될 때마다 `enableWrite`를 다시 확인하고, 꺼져 있으면 `writeDisabled` 오류를 던진다(메뉴 숨김과 별개의 이중 방어). 대상 경로가 데이터 폴더 안인지 검사한다(§6.5). |
| **정적 검사**      | ESLint 규칙을 유지하되 예외를 둔다. `fs` import는 `readonlyFs.ts`와 `dataWriter.ts`에서만, 쓰기 API(`writeFile`, `rename`, `mkdir`, `rm`, `unlink` 등)는 `dataWriter.ts`에서만 허용한다. `vscode.workspace.fs` 쓰기와 `WorkspaceEdit`는 계속 전역 금지다.              |
| **편집 경로**      | 확장 코드는 `openTextDocument`나 `WorkspaceEdit`로 데이터 파일을 다루지 않는다(린트로 금지). "로컬 문서 열기"(0.2.0)는 그대로 둔다. 이 경로의 저장은 사용자의 직접 동작이다.                                                                                               |
| **부수 파일 금지** | 캐시와 인덱스는 메모리에 둔다. 영속 상태는 `context.globalState`/`globalStorageUri`, API 키는 `SecretStorage`에 둔다. 데이터 폴더에는 형식 명세에 정의된 파일(`.json`, `.md`, `.txt`)과 원자적 쓰기용 임시 파일 외에는 만들지 않는다.                                    |

### 7.2 테스트

- **읽기 무변경 검증 유지**: 기존 통합 테스트(`scripts/run-integration.mjs`)는 `enableWrite=false`로 fixture를 OS 수준 읽기 전용으로 만든 뒤 돌리고, 전후 해시를 비교한다. 쓰기가 꺼져 있으면 아무것도 바뀌지 않는다는 것을 계속 검증한다.
- **쓰기 단위 테스트**: `topicOps`, `paperOps`, `dataWriter`는 fixture를 OS 임시 디렉터리로 복사한 뒤 그 복사본에서 테스트한다. 복사와 정리는 `test/unit/tempData.ts`만 하며, ESLint는 테스트 코드 중 이 파일에서만 fs 쓰기를 허용한다. 결과 파일의 내용·서식·남은 파일 목록을 형식 명세와 비교한다.
- **쓰기 통합 테스트**: 별도 스위트로, 임시 복사본을 데이터 폴더로 지정하고 `enableWrite=true`에서 명령을 실행한다. 원본 fixture의 해시가 바뀌지 않았는지도 확인한다.
- **네트워크 없는 테스트**: arXiv, PDF 다운로드, Gemini, Ollama는 주입한 가짜 `fetch`로 테스트한다. 실제 API 호출은 자동 테스트에 넣지 않는다.

### 7.3 개발 규칙

- 개발 중 실제 데이터 폴더(`D:\dev\javascript\arxivjsdata`)는 `dataFolder` 설정으로 **열람만** 한다. 실제 데이터를 지정한 창에서는 `enableWrite`를 켜지 않는다.
- 테스트, 스크립트, 린트 자동 수정(`markdownlint --fix` 등)은 절대 그 경로를 대상으로 하지 않는다.
- 쓰기 기능을 손으로 확인할 때는 fixture나 실제 데이터의 **복사본**을 쓴다.

## 8. API 키와 LLM

### 8.1 엔진

| 엔진   | 호출                                                                                    | 필요한 값                                   |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| Gemini | `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?alt=sse` | API 키(`SecretStorage`), `arxivjs.gemini.model` |
| Ollama | `POST <arxivjs.ollama.url>/api/generate` (`stream: true`, NDJSON)                       | `arxivjs.ollama.url`, `arxivjs.ollama.model` |

- 엔진은 `arxivjs.llm.engine`으로 고른다. 필요한 값이 없으면 요약을 시작하지 않고, 설정이나 키 입력으로 바로 가는 버튼이 있는 알림을 띄운다.
- 요청은 `AbortController`로 취소할 수 있다. 진행률 알림의 취소 버튼이 이것을 부른다.
- 응답은 스트리밍으로 받아 모은다. 진행률 알림에 받은 글자 수를 보여준다. 응답이 정상으로 끝났을 때만 저장한다.

### 8.2 API 키 보관

- Gemini API 키는 `context.secrets`(`SecretStorage`)에 `arxivjs.gemini.apiKey`라는 이름으로 저장한다. OS 자격 증명 저장소에 들어가며, `settings.json`이나 데이터 폴더에는 남지 않는다.
- `ArxivJS: Gemini API 키 설정` 명령은 `password: true`인 InputBox로 키를 받는다. `ArxivJS: Gemini API 키 삭제`로 지운다.
- 키는 로그, 오류 메시지, Webview에 내보내지 않는다. 요청 URL에 키를 넣지 않고 `x-goog-api-key` 헤더로 보낸다.
- Ollama는 키를 쓰지 않는다.

### 8.3 요약 생성 절차

형식 명세 §9.2를 따르되 백업을 하지 않는다.

1. **프롬프트**: 데이터 루트의 `userprompt.txt`를 읽는다. 없거나 `{context}`가 없으면 요약을 시작하지 않고 안내한다(확장이 기본 프롬프트를 만들지 않는다). 첫 번째 `{context}`만 전문으로 바꾼다. 본문의 `$&` 같은 문자열이 치환 패턴으로 해석되지 않게 함수로 바꾼다.
2. **전문 텍스트**:
   - `<paperId>.txt`가 있고 비어 있지 않으면 그것을 쓴다.
   - 없으면 `source`에 따라 PDF를 내려받는다. `arxiv`(또는 `source` 없음)는 `url`의 `/abs/`를 `/pdf/`로 바꾼다. `pdf`는 `url`을 그대로 쓴다. 텍스트를 뽑아 `<paperId>.txt`로 저장한다.
   - `manual`인데 `.txt`가 없으면 요약할 수 없다고 알린다.
   - PDF 원본은 저장하지 않는다. 받은 파일이 `%PDF-`로 시작하지 않거나 100MB를 넘으면 거부한다. 다운로드 제한 시간은 120초다.
   - **추출은 worker thread에서 한다** (`dist/pdfWorker.js`). pdf.js(unpdf)는 `navigator`, `DOMMatrix` 같은 전역을 고치는데, 확장 호스트의 전역은 다른 확장과 함께 쓰고 `navigator`는 읽기 전용이라 그대로 실행하면 실패한다(통합 테스트로 확인). 작업자는 추출 한 번마다 만들고 끝나면 종료한다. 무거운 해석이 확장 호스트를 막지 않는 효과도 있다.
   - 텍스트가 비면(스캔한 이미지 PDF) 요약하지 않는다.
3. **LLM 호출**: 선택한 엔진에 스트리밍으로 보낸다.
4. **저장**: 응답이 끝나면 `<paperId>.md`를 원자적으로 덮어쓴다. 실패하거나 취소되면 `.md`를 바꾸지 않는다(`.txt`는 이미 저장됐을 수 있다).

### 8.4 일괄 요약

- 대상은 선택한 토픽에서 `.json`은 있고 `.md`는 없는 논문이다. 시작 전에 개수를 보여주고 확인을 받는다.
- 한 번에 한 편씩 차례로 처리한다(LLM, arXiv 부하 제한). arXiv PDF 다운로드 사이에는 짧은 간격(3초)을 둔다.
- 한 편이 실패하면 로그를 남기고 다음 논문으로 넘어간다. 끝나면 성공·실패·건너뜀 수를 알린다.
- 취소하면 진행 중인 논문까지 버리고 멈춘다. 이미 저장한 요약은 남는다.

## 9. 단계별 개발 일정

### 9.1 완료 (0.1.0–0.2.0)

| 단계                | 내용                                                                                                        | 산출물 / 완료 조건                                                                                   | 예상  |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----- |
| **P0. 스캐폴딩**    | `yo code`(TS) 생성, esbuild·ESLint(읽기 전용 규칙 포함)·vitest 설정, fixture 데이터 구성                    | `F5`로 빈 확장이 실행된다. 린트와 테스트 파이프라인이 통과한다.                                      | 0.5일 |
| **P1. 데이터 계층** | `readonlyFs`, `TopicRepository`, `PaperRepository`, 모델, 오류 처리                                         | §6.1–6.3을 단위 테스트로 검증한다(하이픈 폴더, 누락 파일, 파싱 실패, 정렬).                          | 1.5일 |
| **P2. 주제 트리**   | Activity Bar 컨테이너, TreeView, Welcome View, `selectDataFolder`, Reload 버튼(전체·주제), 툴팁·description | 실데이터로 주제 108개가 표시된다. 주제를 펼치면 논문 목록이 나온다. Reload 하면 다시 읽는다.         | 1일   |
| **P3. 논문 렌더링** | Paper 패널, markdown-it + KaTeX, CSP·nonce, 메타 헤더, 목차, 외부 링크                                      | 수식·표·`<think>` 텍스트·원격 이미지가 들어간 샘플 문서가 올바르게 표시된다.                         | 1.5일 |
| **P4. 주제 패널**   | Topic 패널(표, 정렬, 필터, abstract 펼치기, Reload) 및 Paper 패널 연동·Reload                               | 275개 논문 주제에서 정렬과 필터가 끊김 없이 동작한다. fixture 복사본을 바꾼 뒤 각 Reload로 반영된다. | 1일   |
| **P5. 품질·배포**   | 통합 테스트(읽기 전용 검증 포함), 성능 측정(§5.4), README, 아이콘, `vsce package`                           | `.vsix`가 생성된다. 모든 테스트와 성능 기준을 통과한다.                                              | 1일   |

### 9.2 계획 (0.3.0 쓰기 기능)

| 단계                       | 내용                                                                                                                                                       | 산출물 / 완료 조건                                                                                                                                                  | 예상  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **P6. 이름·규칙 정리**     | 확장 표시 이름을 ArxivJS VSCode Extension으로 변경(`package.json` `displayName`·`description`, README, Welcome View 문구). 토픽 이름 규칙을 형식 명세 §6으로 변경(§2.2). fixture에 한글·괄호·공백 토픽 추가 | 확장 ID는 `doosik71.arxivjs-viewer` 그대로다. 한글·괄호·공백 토픽이 표시되고, 규칙에 맞지 않는 폴더는 빠진다. 기존 테스트가 모두 통과한다.                        | 0.5일 |
| **P7. 쓰기 기반·토픽 관리** | `enableWrite` 설정, `DataWriter`(원자적 쓰기, 경로 검사, 이중 방어), ESLint 예외 조정, 쓰기 후 reload 연결, 토픽 생성·이름 변경·삭제 UI                    | 설정이 꺼져 있으면 쓰기 UI가 없고 `DataWriter`가 거부한다. 임시 복사본에서 토픽 작업이 형식 명세 §6.3대로 동작한다. 읽기 무변경 통합 테스트가 통과한다.             | 1.5일 |
| **P8. 논문 관리**          | `paperId.ts`, `paperOps`(저장·메타 수정·이동·삭제·요약 삭제), arXiv 검색·ID 조회, 메타 편집 폼, 트리·패널 메뉴                                              | 형식 명세 §9.1, §9.3, §9.4와 §2.8대로 파일이 바뀐다(단위 테스트). slug가 빈 제목, 같은 paperId 충돌, 이동 충돌, 모르는 필드 보존을 테스트한다.                       | 2.5일 |
| **P9. AI 요약**            | `SecretStorage` 키 명령, LLM 설정, Gemini/Ollama REST 스트리밍, 전문 텍스트(`.txt` 캐시, PDF 다운로드·추출), 단건·일괄 요약, 진행률·취소                   | 가짜 `fetch`로 성공·실패·취소 경로를 테스트한다. 실패·취소 시 `.md`가 바뀌지 않는다. 복사본 데이터에서 실제 Gemini와 Ollama로 한 편씩 요약이 만들어진다(수동 확인). | 2.5일 |
| **P10. 품질·배포**         | 쓰기 통합 테스트, README·CHANGELOG(데이터 보호, 경합 주의, 형식 명세와 다른 점), `npm audit`, 번들 크기 확인, 0.3.0 `vsce package`                          | `.vsix`가 생성된다. 모든 테스트와 성능 기준을 통과한다. 쓰기가 꺼진 상태의 동작이 0.2.0과 같다.                                                                    | 1일   |

**합계: 약 8일** (1인 기준)

## 10. 후속 기능 후보 (Backlog)

1. **전체 검색**: 모든 주제를 가로질러 제목, 저자, abstract를 검색한다. URL 기준으로 중복 논문을 묶고 "소속 주제: A, B"로 보여준다.
2. **하이라이트 표시·편집**: `.hlt`를 읽어서 렌더링된 본문에 배경색을 칠한다. 편집은 형식 명세 §8.4의 정리 규칙을 함께 구현해야 한다.
3. **PDF 업로드·텍스트 붙여넣기로 논문 추가**: 로컬 PDF나 붙여넣은 텍스트로 `manual` 논문을 만들고 `.txt`를 함께 저장한다(형식 명세 §9.1의 5).
4. **인용 수 조회**: Semantic Scholar/OpenAlex로 `citation`을 채운다(형식 명세 §9.6).
5. **논문 채팅, 초록 번역**: arxivjs 앱의 `/chat`, `/translate`에 해당한다.
6. **통계 뷰**: 주제별 논문 수, 연도 분포.
7. **즐겨찾기 / 최근 본 논문**: 확장의 `globalState`에만 저장하고 데이터 폴더에는 쓰지 않는다.
8. **다중 데이터 폴더**: `dataFolder`를 배열로 확장한다.

## 11. 리스크와 미결 사항

| #   | 항목                                                                                         | 대응                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| R1  | 다른 앱이 쓰는 도중에 읽어서 파싱이 실패할 수 있다.                                          | 재시도와 오류 상태 표시(§6.3), 사용자가 Reload로 다시 읽을 수 있다.                                                          |
| R2  | 자동 감지가 없으므로 화면이 디스크보다 오래된 내용을 보여줄 수 있다.                         | Reload 버튼을 트리·패널마다 눈에 띄게 둔다. 확장이 쓴 변경은 자동으로 다시 읽는다.                                           |
| R3  | 수식 문법이 다양하다(`\begin{...}`, 매크로 미정의 등).                                       | KaTeX `throwOnError:false`, 필요하면 `macros` 설정 추가                                                                      |
| R4  | md가 없는 논문 182건, json이 없는 md 2건(base64 파일명)                                      | §2.4의 처리 방식. 데이터 앱 쪽에서 정리할지 확인이 필요하다.                                                                 |
| R5  | 원격 이미지를 불러오면 외부 네트워크 요청이 생긴다.                                          | CSP `img-src https:`로 허용한다. 필요하면 설정으로 차단할 수 있게 하는 것을 검토한다.                                        |
| R6  | **쓰기 경합**: arxivjs 앱과 동시에 같은 파일을 쓰면 나중에 쓴 쪽이 남는다.                   | 원자적 쓰기, 쓰기 직전 재확인(§6.7). README에 "두 앱으로 같은 논문을 동시에 편집하지 말 것"을 적는다.                        |
| R7  | json 없는 md를 표시하는 것은 형식 명세(고아 파일 무시)와 다르다.                             | 0.2.0 동작 유지, 쓰기 기능 제외(§2.4). 명세에 맞출지는 추후 결정한다.                                                        |
| R8  | PDF 텍스트 추출 라이브러리의 번들 문제. `pdf-parse` 1.x는 모듈 진입점에서 테스트 파일을 읽는 코드가 있다. | (P9에서 해결) `unpdf`를 worker용 별도 번들(`dist/pdfWorker.js`, 2.3MB)로 만들었다. 메인 번들 크기는 그대로다(§4, §8.3). |
| R13 | Ollama의 기본 문맥 길이(num_ctx)가 짧으면 긴 논문의 뒷부분이 잘린 채 요약된다. arxivjs도 같다.                | 확장은 num_ctx를 지정하지 않는다. README에 Modelfile이나 Ollama 설정으로 문맥 길이를 늘리라고 안내한다.                       |
| R9  | 요약 덮어쓰기와 요약 삭제는 되돌릴 수 없다(`.bak` 없음).                                     | 모달 확인. 데이터 루트가 git 저장소이면 `.md`는 git으로 되돌릴 수 있다고 README에 안내한다.                                  |
| R10 | arXiv API 이용 제한(요청 간격 3초 권고).                                                     | 검색은 사용자 동작 단위로만 호출하고, 일괄 요약은 PDF 다운로드 사이에 간격을 둔다(§8.4).                                     |
| R11 | 확장 표시 이름은 바뀌지만 ID(`arxivjs-viewer`)와 `.vsix` 파일 이름은 "viewer"로 남는다.      | 사용자 결정. 기존 설치와의 연결을 유지하기 위해서다. README에 함께 적는다.                                                   |
| R12 | 토픽 이름 변경 중 열린 패널이 이전 경로를 가리킬 수 있다.                                    | (P7에서 결정) 이름을 바꾸면 그 주제의 Paper 패널은 닫고, 그 주제를 보던 Topic 패널은 새 주제로 다시 연다. 주제를 지우면 두 패널 모두 닫는다. |

## 12. 진행 현황 (2026-10-20 기준)

P0–P5를 모두 마쳤다(0.2.0). 0.2.0에서 홈(주제 목록), 논문 탭 위치 설정, 긴 저자 목록 생략, "로컬 문서 열기"를 더했다. 0.3.0(P6–P10)도 모두 마쳤다. `arxivjs-viewer-0.3.0.vsix`를 만들었고, 게시는 하지 않았다.

게시 정보는 다음과 같다.

- 라이선스: MIT (`LICENSE`)
- 저장소: <https://github.com/doosik71/arxivjs-extension>
- 게시자: [doosik71](https://marketplace.visualstudio.com/publishers/doosik71)
- 확장 ID: `doosik71.arxivjs-viewer` (0.3.0에서도 유지)

| 단계                 | 상태 | 결과                                                          |
| -------------------- | ---- | ------------------------------------------------------------- |
| P0 스캐폴딩          | 완료 | esbuild, ESLint(읽기 전용 규칙), vitest, fixture              |
| P1 데이터 계층       | 완료 | `readonlyFs`, 저장소, 메타 파싱, 정렬, 재시도                 |
| P2 주제 트리         | 완료 | TreeView, Welcome View, Reload(전체·주제), 툴팁               |
| P3 논문 렌더링       | 완료 | Paper 패널, KaTeX, CSP·nonce, 메타 헤더, 목차                 |
| P4 주제 패널         | 완료 | Topic 패널(정렬, 필터, 초록), 패널 간 Reload 연동             |
| P5 품질·배포         | 완료 | 읽기 전용 검증 통합 테스트, 성능 측정, 아이콘, `vsce package` |
| P6 이름·규칙 정리    | 완료 | 표시 이름 변경, 형식 명세 §6 토픽 이름 규칙, fixture 경계 사례 |
| P7 쓰기 기반·토픽    | 완료 | `enableWrite`, `DataWriter`, ESLint 쓰기 지점 예외, 주제 추가·이름 변경·삭제 |
| P8 논문 관리         | 완료 | arXiv 검색·ID 조회, 직접 입력, 메타 편집 폼, 이동·삭제·요약 삭제 |
| P9 AI 요약           | 완료 | SecretStorage 키, Gemini/Ollama REST 스트리밍, PDF 작업자, 단건·일괄 요약 |
| P10 품질·배포        | 완료 | 쓰기 흐름 통합 테스트, README·CHANGELOG, 0.3.0 `vsce package` |

### 0.3.0 검증 결과

- 단위 테스트 330건(vitest), 통합 테스트 60건(VS Code 최신 안정판)이 모두 통과한다. 읽기 전용 가드(fixture 무변경)도 통과한다.
- 쓰기 흐름 통합 테스트(`writeFlow.test.ts`)는 fixture의 임시 복사본에서 실제 명령을 실행한다.
  - 주제 추가·이름 변경·삭제(비어 있지 않으면 거부)
  - arXiv ID로 추가, 중복은 건너뛰기, 직접 입력 폼(검사 실패 포함)
  - 메타 편집(바꾼 필드만, 모르는 필드 보존)
  - 요약 생성(PDF → 작업자 추출 → .txt → Ollama → .md), 요약 삭제
  - 충돌이 있는 논문 이동(§9.3), 논문 삭제(백업 유지), 쓰기를 끈 뒤 차단
  - 입력 창·QuickPick·확인 대화상자는 `vscode.window` 함수를 바꿔 끼우고, 네트워크는 전역 `fetch`를 바꿔 끼운다.
- 쓰기가 꺼진 상태는 0.2.0과 같다. 기존 읽기 전용 통합 테스트가 그대로 통과한다.
- 실제 네트워크로 확인한 것: arXiv ID 조회·검색, arXiv PDF 다운로드와 텍스트 추출(개발 빌드, 프로덕션 압축 빌드 모두).
- 패키지: `arxivjs-viewer-0.3.0.vsix` 47개 파일, 937KB. 프로덕션 `dist/extension.js` 450KB, `dist/pdfWorker.js` 1.6MB.
  - `AGENTS.md`, `PROMPTS.md`(개인 프롬프트 메모)가 패키지에 들어가던 것을 `.vscodeignore`로 뺐다.
- 성능(fixture): 모든 목표를 통과한다. 실데이터(`D:\dev\javascript\arxivjsdata`)는 이 환경에 없어 다시 재지 못했다. 읽기 경로는 바뀌지 않았다.
- `npm audit --omit=dev`: low 2건. katex의 prototype pollution 권고(GHSA-238p-pmpm-9mq7, 수정 버전 없음)로, 0.2.0 이후 새로 공개된 권고다. `unpdf`는 새 취약점을 더하지 않았다.

### 0.2.0 검증 결과

- 단위 테스트(vitest)와 통합 테스트(VS Code 최신 안정판)가 모두 통과한다.
- 통합 테스트는 fixture를 OS 수준 읽기 전용으로 바꾼 뒤 실행한다. 테스트 전후 fixture의 경로, 크기, mtime, SHA-256이 같다.
- 가드 자체도 검증했다.
  - 기존 파일에 쓰려고 하면 `EPERM`으로 막힌다.
  - 새 파일이 생기면 비교에서 잡혀 종료 코드 2로 실패한다.
- 실데이터 성능 (`npm run bench -- <실데이터>`, 읽기만 함):

| 항목                          | 측정                                  | 목표       |
| ----------------------------- | ------------------------------------- | ---------- |
| 주제 목록 (108개)             | 1.9ms                                 | 100ms 이하 |
| 가장 큰 주제 첫 로딩 (275편)  | 9.2ms                                 | 500ms 이하 |
| 가장 큰 md 렌더링 (118,766자) | 3.5ms                                 | 200ms 이하 |
| md 4,427개 전체 렌더링        | p50 0.9ms, p95 2.6ms, 렌더링 예외 0건 | —          |

- 렌더링 결과로 KaTeX 옵션을 하나 바꿨다. 기본 `strict: 'warn'`은 수식 안의 한글마다 콘솔 경고를 냈다(실데이터 686건). 그래서 `strict: 'ignore'`로 바꿨다.
- 배포에 들어가는 의존성의 `npm audit` 결과는 취약점 0건이다.

### 남은 확인 사항

| 항목           | 현재                                               | 필요한 결정                                                                         |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 최소 버전 검증 | 1.90.0 다운로드가 이 환경에서 네트워크 오류로 실패 | `VSCODE_TEST_VERSION=1.90.0 npm run test:integration`을 네트워크가 되는 곳에서 실행 |
| 화면 확인      | 테스트는 HTML 문자열까지만 검증한다                | `F5`로 실제 화면(KaTeX 폰트, 고정 헤더, 다크 테마, 메타 정보 폼)을 확인           |
| 실제 LLM       | 이 환경에 Gemini 키와 Ollama 서버가 없다           | 데이터 폴더 복사본에서 Gemini와 Ollama로 한 편씩 요약해 본다                        |
| 실데이터 성능  | 실데이터 폴더가 이 환경에 없다                     | `npm run bench -- <실데이터>`로 다시 잰다 (읽기만 한다)                            |
| katex 권고     | GHSA-238p-pmpm-9mq7 (low, 수정 버전 없음)          | katex 새 버전이 나오면 올린다                                                       |
