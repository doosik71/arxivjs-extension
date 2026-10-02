# ArxivJS Viewer

arxivjs 데이터 폴더에 정리된 논문을 VS Code에서 **읽기 전용**으로 열람하는 확장이다.

- 주제(폴더) 목록을 보여준다.
- 주제를 고르면 논문 목록과 메타 정보를 보여준다. 메타 정보는 제목, 저자, 연도, URL, 초록, 인용수, 출처다.
- 논문을 고르면 요약 마크다운 문서를 렌더링해서 보여준다. 수식과 표도 렌더링한다.

이 확장은 데이터 폴더의 파일을 **절대 수정하지 않는다.** 데이터 추가와 관리는 다른 앱(arxivjs)이 맡는다.

> 상태: 개발 중. 설계와 일정은 [DEV-PLAN.md](DEV-PLAN.md)를 참고한다.

## 목차

- [ArxivJS Viewer](#arxivjs-viewer)
  - [목차](#목차)
  - [사용자 가이드](#사용자-가이드)
    - [요구 사항](#요구-사항)
    - [설치](#설치)
      - [방법 1. Marketplace에서 설치](#방법-1-marketplace에서-설치)
      - [방법 2. `.vsix` 파일로 설치](#방법-2-vsix-파일로-설치)
      - [방법 3. 제거](#방법-3-제거)
    - [데이터 폴더 설정](#데이터-폴더-설정)
    - [사용 방법](#사용-방법)
    - [설정 항목](#설정-항목)
    - [명령 목록](#명령-목록)
    - [데이터 폴더 형식](#데이터-폴더-형식)
    - [문제 해결](#문제-해결)
  - [개발자 가이드](#개발자-가이드)
    - [개발 환경 준비](#개발-환경-준비)
    - [로컬에서 실행과 디버깅](#로컬에서-실행과-디버깅)
    - [테스트](#테스트)
    - [패키징 (.vsix 만들기)](#패키징-vsix-만들기)
    - [Marketplace에 확장 등록 (게시)](#marketplace에-확장-등록-게시)
      - [1단계. Azure DevOps 조직과 Personal Access Token(PAT) 만들기](#1단계-azure-devops-조직과-personal-access-tokenpat-만들기)
      - [2단계. 게시자(Publisher) 만들기](#2단계-게시자publisher-만들기)
      - [3단계. vsce 로그인](#3단계-vsce-로그인)
      - [4단계. 게시](#4단계-게시)
    - [버전 업데이트와 재게시](#버전-업데이트와-재게시)
    - [Open VSX에 등록 (선택)](#open-vsx에-등록-선택)
    - [개발 시 주의 사항](#개발-시-주의-사항)

## 사용자 가이드

### 요구 사항

- VS Code **1.90** 이상
- arxivjs 데이터 폴더. 형식은 [데이터 폴더 형식](#데이터-폴더-형식)을 참고한다.

### 설치

다음 세 가지 방법 중 하나를 쓴다.

#### 방법 1. Marketplace에서 설치

1. VS Code 왼쪽 Activity Bar에서 **Extensions**(`Ctrl+Shift+X`)를 연다.
2. `ArxivJS Viewer`를 검색한다.
3. **Install**을 누른다.

#### 방법 2. `.vsix` 파일로 설치

배포받은 `arxivjs-viewer-<버전>.vsix` 파일이 있을 때 쓴다.

1. Extensions 뷰를 연다.
2. 오른쪽 위 `…` 메뉴에서 **Install from VSIX...**를 선택한다.
3. `.vsix` 파일을 고른다.

명령줄에서 설치할 수도 있다.

```bash
code --install-extension arxivjs-viewer-0.1.0.vsix
```

#### 방법 3. 제거

Extensions 뷰에서 `ArxivJS Viewer`를 찾아 **Uninstall**을 누른다. 명령줄에서는 다음과 같이 한다.

```bash
code --uninstall-extension <publisher>.arxivjs-viewer
```

확장을 제거해도 데이터 폴더에는 아무 영향이 없다.

### 데이터 폴더 설정

처음 실행하면 Activity Bar의 **ArxivJS** 아이콘을 눌렀을 때 "데이터 폴더 선택" 버튼이 보인다.

1. **데이터 폴더 선택** 버튼을 누른다. Command Palette(`Ctrl+Shift+P`)에서 `ArxivJS: 데이터 폴더 선택`을 실행해도 된다.
2. arxivjs 데이터 폴더(예: `D:\dev\javascript\arxivjsdata`)를 고른다.

`settings.json`에 직접 적을 수도 있다.

```json
{
  "arxivjs.dataFolder": "D:\\dev\\javascript\\arxivjsdata"
}
```

### 사용 방법

```text
ArxivJS (Activity Bar)
└─ TOPICS                    [⟳ Reload] [📂 폴더 선택] [⚙ 설정]
   ▸ AI Healthcare
   ▾ Few-Shot Learning    (87)    ← 펼치면 논문 목록과 논문 수
      A Closer Look at ...   2019 · 2,737
      Domain-Agnostic ...    2019 · 1 · 문서 없음
      ...
```

1. **주제 보기**: TOPICS 뷰에 데이터 폴더의 주제가 나타난다. 폴더 이름의 `_`는 공백으로 표시한다(`Few-Shot_Learning` → `Few-Shot Learning`).
2. **논문 목록 보기**
   - 주제를 펼치면 논문 목록이 나온다. 각 논문 옆에는 `연도 · 인용수`가 표시된다. 요약 문서가 없는 논문에는 `문서 없음`이 붙는다.
   - 논문에 마우스를 올리면 저자, 연도, 인용수, 출처, URL, 초록 앞부분이 툴팁으로 나온다.
   - 메타 정보(json)를 읽지 못한 논문은 경고 아이콘으로 표시된다.
   - 주제를 클릭하면 **Topic 패널**이 열린다. 여기서 논문 표를 정렬하고 필터링할 수 있고, 초록을 펼쳐 볼 수 있다.
3. **논문 읽기**
   - 논문을 클릭하면 **Paper 패널**이 열린다.
   - 위쪽에는 메타 정보(제목, 저자, 연도, 인용수, 출처, 원문 링크)가 나오고, 아래에는 렌더링된 요약 문서가 나온다.
   - 요약 문서가 없는 논문은 초록을 대신 보여준다.
4. **원문 열기**: Paper 패널의 원문 링크를 누르면 외부 브라우저에서 논문 페이지가 열린다.
5. **다시 읽기(Reload)**
   - 이 확장은 파일 변경을 자동으로 감지하지 않는다. 다른 앱에서 데이터를 추가하거나 고쳤다면 Reload 버튼을 눌러 다시 읽는다.
   - 버튼마다 다시 읽는 범위가 다르다.

| 버튼 위치         | 다시 읽는 범위                       |
| ----------------- | ------------------------------------ |
| TOPICS 제목줄 `⟳` | 전체(주제 목록과 펼쳐진 주제의 논문) |
| 주제 노드 옆 `⟳`  | 그 주제의 논문 목록                  |
| Topic 패널 `⟳`    | 그 주제의 논문 목록                  |
| Paper 패널 `⟳`    | 그 논문의 메타 정보와 문서           |

### 설정 항목

| 설정                   | 기본값     | 설명                                                                  |
| ---------------------- | ---------- | --------------------------------------------------------------------- |
| `arxivjs.dataFolder`   | `""`       | 데이터 폴더의 절대 경로                                               |
| `arxivjs.paperSort`    | `citation` | 논문 정렬 기준: `citation`(인용수), `year`(연도), `title`(제목)       |
| `arxivjs.openInNewTab` | `false`    | `true`이면 논문마다 새 탭을 연다. `false`이면 패널 하나를 재사용한다. |

### 명령 목록

Command Palette(`Ctrl+Shift+P`)에서 `ArxivJS`로 검색한다.

| 명령                        | 설명                                         |
| --------------------------- | -------------------------------------------- |
| `ArxivJS: 데이터 폴더 선택` | 데이터 폴더를 지정한다.                      |
| `ArxivJS: Reload`           | 모든 데이터를 다시 읽는다.                   |
| `ArxivJS: 설정 열기`        | 이 확장의 설정 화면을 연다.                  |
| `ArxivJS: 주제 열기`        | 주제를 빠르게 검색해서 연다.                 |
| `ArxivJS: 논문 열기`        | 현재 주제의 논문을 검색해서 연다.            |
| `ArxivJS: 원문 URL 열기`    | 선택한 논문의 URL을 브라우저로 연다.         |
| `ArxivJS: 논문 정보 복사`   | 제목, 저자, 연도, URL을 클립보드에 복사한다. |

### 데이터 폴더 형식

```text
<데이터 폴더>/
├── Few-Shot_Learning/                 # 주제 폴더
│   ├── a_closer_look_at_few_shot_classification.json   # 메타 정보
│   ├── a_closer_look_at_few_shot_classification.md     # 요약 문서
│   └── ...
└── ...
```

- **주제 폴더 이름**은 영문자, 숫자, 언더스코어(`_`), 하이픈(`-`)만 쓸 수 있다. 이 규칙에 맞지 않는 폴더(예: `.git`)는 목록에 나오지 않는다.
- 논문마다 이름이 같은 `.json`과 `.md` 파일이 한 쌍을 이룬다.
- `.txt`, `.hlt`, `.bak` 등 다른 파일은 무시한다.

`.json` 메타 정보의 예:

```json
{
  "title": "A Closer Look at Few-shot Classification",
  "authors": "Wei-Yu Chen, Yen-Cheng Liu, Zsolt Kira, Yu-Chiang Frank Wang, Jia-Bin Huang",
  "year": 2019,
  "url": "http://arxiv.org/abs/1904.04232v2",
  "abstract": "Few-shot classification aims to ...",
  "citation": 2737,
  "source": "arxiv"
}
```

| 필드       | 필수 | 설명                                   |
| ---------- | ---- | -------------------------------------- |
| `title`    | ✔    | 논문 제목                              |
| `authors`  | ✔    | 저자. 쉼표로 구분한 문자열이다.        |
| `year`     | ✔    | 출판 연도                              |
| `url`      | ✔    | 원문 URL                               |
| `abstract` |      | 초록                                   |
| `citation` |      | 인용수. 없으면 정렬할 때 맨 뒤로 간다. |
| `source`   |      | 출처: `arxiv`, `pdf`, `manual`         |

### 문제 해결

| 증상                           | 해결                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| TOPICS가 비어 있다             | `arxivjs.dataFolder` 경로가 맞는지 확인한다. 주제 폴더 이름이 규칙에 맞는지도 확인한다. |
| 새로 추가한 논문이 안 보인다   | Reload `⟳` 버튼을 누른다. 이 확장은 자동으로 감지하지 않는다.                           |
| 논문에 "문서 없음"이 표시된다  | 그 논문의 `.md` 파일이 아직 없다. 메타 정보와 초록만 보여준다.                          |
| 수식 일부가 원문 그대로 보인다 | KaTeX가 지원하지 않는 LaTeX 문법이다. 해당 수식만 원문으로 표시된다.                    |
| 그 밖의 오류                   | **View → Output**에서 출력 채널 `ArxivJS`의 로그를 확인한다.                            |

## 개발자 가이드

### 개발 환경 준비

필요한 도구:

- [Node.js](https://nodejs.org/) 20 LTS 이상
- [VS Code](https://code.visualstudio.com/) 1.90 이상
- Git

다음 명령으로 저장소를 받고 의존성을 설치한다.

```bash
git clone <repository-url> arxivjs-extension
cd arxivjs-extension
npm install
```

주요 npm 스크립트:

| 스크립트                   | 설명                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `npm run build`            | esbuild로 `dist/extension.js`를 번들한다.                     |
| `npm run watch`            | 소스가 바뀌면 다시 번들한다.                                  |
| `npm run typecheck`        | TypeScript 타입 검사만 한다(출력 파일 없음).                  |
| `npm run lint`             | ESLint를 실행한다. 쓰기 API 사용 금지 규칙도 여기서 검사한다. |
| `npm test`                 | 단위 테스트(vitest)를 실행한다.                               |
| `npm run check`            | `typecheck` → `lint` → `test`를 차례로 실행한다.              |
| `npm run test:integration` | VS Code 통합 테스트(`@vscode/test-electron`)를 실행한다.      |
| `npm run package`          | `.vsix` 파일을 만든다.                                        |

### 로컬에서 실행과 디버깅

1. VS Code에서 프로젝트 폴더를 연다.
2. `F5`를 누르거나 **Run and Debug**에서 `Run Extension`을 선택한다. 그러면 확장이 로드된 **Extension Development Host** 창이 새로 열린다.
3. 새 창에서 `ArxivJS: 데이터 폴더 선택`으로 테스트 데이터 폴더를 지정한다. 기본은 `test/fixtures/sample-data`다.
4. 코드를 고친 뒤 Extension Development Host 창에서 `Ctrl+R`(Developer: Reload Window)을 누르면 바뀐 내용이 반영된다.

Webview를 디버깅하려면 Extension Development Host 창에서 `Developer: Open Webview Developer Tools`를 실행한다.

### 테스트

```bash
npm run lint
npm test
npm run test:integration
```

- 테스트 데이터는 `test/fixtures/sample-data/`에 있다.
- 통합 테스트는 fixture 폴더를 읽기 전용으로 설정한 뒤 실행한다. 실행 전후로 파일 해시를 비교해서 **어떤 파일도 바뀌지 않았는지** 검증한다.

### 패키징 (.vsix 만들기)

```bash
npm run package
# 내부적으로: npx @vscode/vsce package
```

이 명령을 실행하면 프로젝트 루트에 `arxivjs-viewer-<버전>.vsix`가 생긴다. 이 파일을 [방법 2](#방법-2-vsix-파일로-설치)로 설치하면 Marketplace 없이도 팀 내부에 배포할 수 있다.

패키징 전에 `package.json`에서 다음 항목을 확인한다.

| 항목             | 예                                | 비고                                |
| ---------------- | --------------------------------- | ----------------------------------- |
| `name`           | `arxivjs-viewer`                  | 소문자, 공백 없음                   |
| `displayName`    | `ArxivJS Viewer`                  | Marketplace에 표시되는 이름         |
| `publisher`      | `<publisher-id>`                  | 아래에서 만드는 게시자 ID           |
| `version`        | `0.1.0`                           | SemVer                              |
| `engines.vscode` | `^1.90.0`                         |                                     |
| `icon`           | `media/icon.png`                  | 128×128 이상 PNG. SVG는 쓸 수 없다. |
| `repository`     | `{ "type": "git", "url": "..." }` | 없으면 경고가 난다.                 |
| `license`        | `MIT` 등                          | 루트에 `LICENSE` 파일도 둔다.       |

배포 패키지에 들어갈 필요가 없는 파일(`src/`, `test/`, `node_modules/` 등)은 `.vscodeignore`에 등록한다.

### Marketplace에 확장 등록 (게시)

[Visual Studio Marketplace](https://marketplace.visualstudio.com/vscode)에 처음 게시하는 절차다. 최초 1회만 1~3단계를 거치면 된다.

#### 1단계. Azure DevOps 조직과 Personal Access Token(PAT) 만들기

1. <https://dev.azure.com>에 Microsoft 계정으로 로그인한다. 조직이 없으면 새로 만든다.
2. 오른쪽 위 **User settings → Personal access tokens → New Token**을 누른다.
3. 다음과 같이 설정한다.
   - **Organization**: `All accessible organizations`
   - **Scopes**: `Custom defined` → **Show all scopes** → **Marketplace → Manage** 체크
   - **Expiration**: 원하는 기간
4. 만든 토큰을 안전한 곳에 복사해 둔다. 이 창을 닫으면 다시 볼 수 없다.

#### 2단계. 게시자(Publisher) 만들기

1. <https://marketplace.visualstudio.com/manage>에 같은 계정으로 로그인한다.
2. **Create publisher**를 누르고 ID와 이름을 입력한다. ID는 나중에 바꿀 수 없다.
3. 만든 게시자 ID를 `package.json`의 `publisher`에 적는다.

#### 3단계. vsce 로그인

```bash
npx @vscode/vsce login <publisher-id>
# 프롬프트에 1단계의 PAT를 붙여넣는다.
```

#### 4단계. 게시

```bash
npx @vscode/vsce publish
```

- 이미 만든 `.vsix`가 있으면 `npx @vscode/vsce publish --packagePath arxivjs-viewer-0.1.0.vsix`로 그 파일을 올릴 수 있다.
- 웹에서 올릴 수도 있다. <https://marketplace.visualstudio.com/manage>에서 게시자를 고르고 **New extension → Visual Studio Code**로 `.vsix`를 업로드한다.
- 게시 후 검증을 거쳐 몇 분 안에 Marketplace 검색에 나타난다. 확장 ID는 `<publisher-id>.arxivjs-viewer`가 된다.

> Azure DevOps의 PAT 정책은 바뀔 수 있다. 위 방법이 막히면 공식 문서 [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)를 확인한다. Microsoft Entra ID 인증을 쓰는 `vsce publish --azure-credential` 방식도 그 문서에 안내되어 있다.

### 버전 업데이트와 재게시

```bash
npx @vscode/vsce publish patch   # 0.1.0 → 0.1.1
npx @vscode/vsce publish minor   # 0.1.0 → 0.2.0
npx @vscode/vsce publish 1.0.0   # 버전 직접 지정
```

`publish patch|minor|major`는 `package.json`의 버전을 올리고 git 태그를 만든 뒤 게시한다. 게시 전에 `CHANGELOG.md`를 갱신한다.

Marketplace에서 확장을 내리려면 `npx @vscode/vsce unpublish <publisher-id>.arxivjs-viewer`를 실행한다. 이 작업은 되돌릴 수 없다.

### Open VSX에 등록 (선택)

VSCodium, Cursor 같은 VS Code 호환 에디터 사용자에게도 배포하려면 [Open VSX](https://open-vsx.org/)에 게시한다.

1. <https://open-vsx.org>에 GitHub 계정으로 로그인하고, Eclipse Foundation Publisher Agreement에 동의한다.
2. 사용자 설정에서 Access Token을 만든다.
3. 다음 명령을 실행한다.

```bash
npx ovsx create-namespace <publisher-id> -p <token>   # 최초 1회
npx ovsx publish arxivjs-viewer-0.1.0.vsix -p <token>
```

### 개발 시 주의 사항

- **실사용 데이터 폴더에 쓰지 않는다.**
  - 실제 데이터 폴더(예: `D:\dev\javascript\arxivjsdata`)는 열람용으로만 지정한다.
  - 테스트, 스크립트, `markdownlint --fix` 같은 자동 수정 도구가 그 경로를 대상으로 삼으면 안 된다.
  - 테스트는 항상 `test/fixtures/` 아래의 복사본으로 한다.
- 데이터 폴더 접근은 `src/data/readonlyFs.ts`를 거쳐서만 한다. 이 모듈은 읽기 API만 노출한다. ESLint가 다른 곳에서 `fs`를 쓰거나 쓰기 API를 호출하면 오류를 낸다.
- 캐시나 사용자 상태는 `context.globalState`나 `context.globalStorageUri`에 저장한다. 데이터 폴더에는 아무 파일도 만들지 않는다.
- 설계 상세는 [DEV-PLAN.md](DEV-PLAN.md)를 따른다.
