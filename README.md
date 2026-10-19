# ArxivJS VSCode Extension

arxivjs 데이터 폴더에 정리된 논문을 VS Code에서 열람하는 확장이다. 설정으로 쓰기 기능을 켜면 데이터 폴더를 편집할 수도 있다.

- 주제(폴더) 목록을 보여준다.
- 주제를 고르면 논문 목록과 메타 정보를 보여준다. 메타 정보는 제목, 저자, 연도, URL, 초록, 인용수, 출처다.
- 논문을 고르면 요약 마크다운 문서를 렌더링해서 보여준다. 수식과 표도 렌더링한다.

기본 설정에서는 데이터 폴더의 파일을 **수정하지 않는다.** 설정 `arxivjs.enableWrite`를 켜면 주제를 관리하고, arXiv에서 논문을 찾아 추가하고, 메타 정보를 고치고, 논문을 옮기거나 지울 수 있다([주제·논문 관리](#사용-방법) 참고). AI 요약은 다음 버전에서 추가할 예정이다.

데이터 폴더(arxivjsdata)는 [arxivjs](https://github.com/doosik71/arxivjs) 앱의 형식을 따른다. 지금은 요약 문서 생성과 하이라이트를 그 앱에서 한다. arxivjs 앱에서 바꾼 내용은 이 확장의 Reload 버튼을 눌러 반영한다.

> 현재 버전: 0.2.0. 설계와 개발 일정은 저장소의 `DEV-PLAN.md`를 참고한다. 바뀐 내용은 `CHANGELOG.md`에 적는다.

## 목차

- [ArxivJS VSCode Extension](#arxivjs-vscode-extension)
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
    - [성능 측정](#성능-측정)
    - [패키징 (.vsix 만들기)](#패키징-vsix-만들기)
    - [Marketplace에 확장 등록 (게시)](#marketplace에-확장-등록-게시)
      - [1단계. Azure DevOps 조직과 Personal Access Token(PAT) 만들기](#1단계-azure-devops-조직과-personal-access-tokenpat-만들기)
      - [2단계. 게시자(Publisher) 확인](#2단계-게시자publisher-확인)
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
2. `ArxivJS VSCode Extension`을 검색한다. 게시자는 [doosik71](https://marketplace.visualstudio.com/publishers/doosik71)이다.
3. **Install**을 누른다.

명령줄에서는 `code --install-extension doosik71.arxivjs-viewer`로 설치한다.

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

Extensions 뷰에서 `ArxivJS VSCode Extension`을 찾아 **Uninstall**을 누른다. 명령줄에서는 다음과 같이 한다.

```bash
code --uninstall-extension doosik71.arxivjs-viewer
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
└─ TOPICS          [🏠 홈] [⟳ Reload] [📂 폴더 선택] [⚙ 설정]
   ▸ AI Healthcare
   ▾ Few-Shot Learning    (87)    ← 펼치면 논문 목록과 논문 수
      A Closer Look at ...   2019 · 2,737
      Domain-Agnostic ...    2019 · 1 · 문서 없음
      ...
```

1. **주제 목록(홈)**
   - ArxivJS 뷰를 처음 열면 편집기 영역에 **홈** 페이지가 함께 열린다. 데이터 폴더의 모든 주제가 논문 수와 함께 나온다. 자동으로 열리지 않게 하려면 설정 `arxivjs.openHomeOnStartup`을 끈다.
   - 다시 열려면 TOPICS 제목줄의 `🏠` 버튼을 누르거나 `ArxivJS: 주제 목록(홈) 열기`를 실행한다.
   - **필터**: 검색 칸에 낱말을 입력하면 이름에 그 낱말이 모두 들어 있는 주제만 남는다. 표시 이름과 폴더 이름(`Large_Language_Model` 같은) 모두에서 찾는다.
     - `Enter`: 보이는 첫 주제를 연다.
     - `↓`: 첫 주제로 포커스를 옮긴다.
   - **정렬**: `이름순` 또는 `논문 수순`.
   - 주제를 누르면 Topic 패널이 열린다.
   - TOPICS 트리에서도 VS Code 기본 기능으로 찾을 수 있다. 트리를 클릭한 뒤 이름을 입력하거나 `Ctrl+Alt+F`를 누르면 된다.
2. **주제 보기**: TOPICS 뷰에 데이터 폴더의 주제가 나타난다. 폴더 이름의 `_`는 공백으로 표시한다(`Few-Shot_Learning` → `Few-Shot Learning`).
3. **논문 목록 보기**
   - 주제를 펼치면 논문 목록이 나온다. 각 논문 옆에는 `연도 · 인용수`가 표시된다. 요약 문서가 없는 논문에는 `문서 없음`이 붙는다.
   - 논문에 마우스를 올리면 저자, 연도, 인용수, 출처, URL, 초록 앞부분이 툴팁으로 나온다.
   - 메타 정보(json)를 읽지 못한 논문은 경고 아이콘으로 표시된다.
   - 주제를 클릭하면 **Topic 패널**이 열린다. 주제의 논문이 표(제목·저자, 연도, 인용수)로 나온다.
     - **정렬**: 열 머리글(제목, 연도, 인용)을 누른다. 같은 열을 다시 누르면 방향이 바뀐다. 처음 정렬 기준은 설정 `arxivjs.paperSort`를 따른다. 연도나 인용수가 없는 논문은 방향과 관계없이 맨 뒤로 간다.
     - **필터**: 검색 칸에 낱말을 입력하면 제목과 저자에 그 낱말이 모두 들어 있는 논문만 남는다. "요약 문서 있는 것만"을 켜면 `.md`가 없는 논문을 숨긴다.
     - **초록**: 행의 `초록` 버튼으로 펼치고 접는다. `원문` 버튼은 원문 URL을 브라우저로 연다.
     - 논문 제목을 누르면 Paper 패널이 열린다. 기본은 Topic 패널과 **같은 편집기 그룹의 새 탭**이다. 화면을 나눠 표와 논문을 함께 보려면 설정 `arxivjs.paperPanelLocation`을 `beside`로 바꾼다. 이때 논문은 오른쪽 그룹 하나에 모이고, 논문을 열 때마다 화면이 더 나뉘지는 않는다.
     - Reload 해도 정렬, 필터, 스크롤 위치, 펼친 초록은 그대로 유지된다.
4. **논문 읽기**
   - 논문을 클릭하면 **Paper 패널**이 열린다. 기본은 논문마다 새 탭이고, 이미 열린 논문은 그 탭으로 이동한다. 탭 하나를 재사용하려면 설정 `arxivjs.openInNewTab`을 끈다.
   - 위쪽에는 메타 정보(제목, 저자, 연도, 인용수, 출처, 원문 링크)가 나오고, 아래에는 렌더링된 요약 문서가 나온다.
   - 요약 문서가 없는 논문은 초록을 대신 보여준다.
5. **원문 열기, 로컬 문서 열기**
   - Paper 패널의 `원문 열기`를 누르면 외부 브라우저에서 논문 페이지가 열린다.
   - 그 오른쪽의 `로컬 문서 열기`를 누르면 데이터 폴더의 실제 `.md` 파일이 편집기에서 열린다. 이 버튼은 요약 문서가 있는 논문에만 나온다.
   - ⚠️ 이 편집기는 일반 편집기다. 고치고 저장하면 데이터 폴더의 파일이 바뀐다. 확장 자체는 아무것도 쓰지 않으며, 저장은 사용자가 직접 할 때만 일어난다. arxivjs 앱이 같은 파일을 다시 만들면 고친 내용이 덮어써질 수 있다.
   - 저장한 내용을 Paper 패널에 반영하려면 패널의 `⟳ Reload`를 누른다.
   - 탭 아이콘은 홈(집), Topic 패널(목록), Paper 패널(문서)이 서로 다르다.
6. **다시 읽기(Reload)**
   - 이 확장은 파일 변경을 자동으로 감지하지 않는다. 다른 앱에서 데이터를 추가하거나 고쳤다면 Reload 버튼을 눌러 다시 읽는다.
   - 버튼마다 다시 읽는 범위가 다르다.

| 버튼 위치         | 다시 읽는 범위                       |
| ----------------- | ------------------------------------ |
| TOPICS 제목줄 `⟳` | 전체(주제 목록과 펼쳐진 주제의 논문) |
| 홈 `⟳`            | 전체                                 |
| 주제 노드 옆 `⟳`  | 그 주제의 논문 목록                  |
| Topic 패널 `⟳`    | 그 주제의 논문 목록                  |
| Paper 패널 `⟳`    | 그 논문의 메타 정보와 문서           |

7. **주제·논문 관리 (쓰기 기능)**
   - 설정 `arxivjs.enableWrite`를 켜야 쓸 수 있다. 끄면 아래 메뉴와 버튼이 모두 사라지고, 확장은 데이터 폴더를 읽기만 한다.
   - 쓰기 기능은 arxivjs 앱 없이 동작한다. arXiv 조회만 인터넷(`export.arxiv.org`)을 쓴다.
   - **주제 추가**: TOPICS 제목줄의 `+` 버튼이나 홈의 `+ 주제 추가`를 누르고 이름을 입력한다. 이름에는 영문, 숫자, 한글, 공백, 괄호, 하이픈을 쓸 수 있다. 폴더 이름은 공백을 `_`로 바꿔 만든다(`강화 학습` → `강화_학습`). 입력 칸 아래에 만들어질 폴더 이름이 보인다.
   - **주제 이름 변경**: 주제 노드의 오른쪽 클릭 메뉴에서 고른다. 폴더 이름만 바뀌고 안의 파일 이름은 그대로다. 그 주제의 논문 탭은 닫힌다.
   - **주제 삭제**: 주제 노드의 오른쪽 클릭 메뉴에서 고른다. 폴더가 **완전히 비어 있을 때만** 지운다. 화면에 논문이 없어도 `.txt`, `.bak` 같은 파일이 남아 있으면 지우지 않고 남은 파일을 알려 준다.
   - 대소문자만 다른 이름이나 표시 이름이 같은 주제는 만들 수 없다.
   - **논문 추가**: 주제 노드의 오른쪽 클릭 메뉴나 Topic 패널의 `+ 논문 추가`를 누르고 방법을 고른다.
     - `arXiv 검색`: 검색어를 입력하면 낱말이 모두 들어 있는 논문을 관련도순으로 최대 50편 보여준다. 여러 편을 골라 한꺼번에 추가할 수 있다. 이 주제에 이미 있는 논문에는 `이미 있음`이 붙는다.
     - `arXiv URL·ID`: `2310.16485`나 `https://arxiv.org/abs/2310.16485` 같은 값을 넣는다.
     - `직접 입력`: 폼에 제목, 저자, 연도, URL, 초록, 인용 수, 출처를 넣는다. 제목에 영문이나 숫자가 하나도 없으면 파일 이름(a-z, 0-9, `_`)도 넣어야 한다.
     - 파일 이름은 제목으로 만든다(`Attention Is All You Need` → `attention_is_all_you_need.json`). 같은 이름의 논문이 이미 있으면 덮어쓸지 묻는다. 기본은 건너뛰기다.
   - **메타 정보 편집**: 논문 노드의 오른쪽 클릭 메뉴나 Paper 패널의 `메타 편집`. 바꾼 필드만 저장하고, 이 확장이 모르는 필드는 그대로 둔다. 제목을 바꿔도 파일 이름은 바뀌지 않는다.
   - **논문을 다른 주제로 이동**: 논문 노드의 오른쪽 클릭 메뉴. `.json`, `.md`, `.hlt`, `.txt`를 함께 옮긴다. 대상 주제에 같은 파일 이름의 논문이 있으면 먼저 알리고, arxivjs 앱과 같은 규칙으로 한쪽을 남긴다.
   - **논문 삭제**: 논문 노드의 오른쪽 클릭 메뉴. `.json`, `.md`, `.hlt`, `.txt`를 지운다. 되돌릴 수 없다.
   - **요약 삭제**: 논문 노드의 오른쪽 클릭 메뉴나 Paper 패널의 `요약 삭제`. `.md`와 `.hlt`를 지운다. arxivjs 앱과 달리 `.bak` 백업을 남기지 않는다. 데이터 폴더가 git 저장소라면 `.md`는 git으로 되살릴 수 있다.
   - 메타 정보(`.json`)가 없는 논문(요약 문서만 있는 논문)은 편집, 이동, 삭제할 수 없다.
   - ⚠️ arxivjs 앱이 같은 폴더를 쓰고 있을 때는 같은 주제나 논문을 동시에 고치지 않는다. 잠금 기능이 없어서 나중에 쓴 쪽이 남는다.

### 설정 항목

| 설정                         | 기본값      | 설명                                                                                                              |
| ---------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `arxivjs.dataFolder`         | `""`        | 데이터 폴더의 절대 경로                                                                                           |
| `arxivjs.paperSort`          | `citation`  | 논문 정렬 기준: `citation`(인용수), `year`(연도), `title`(제목)                                                   |
| `arxivjs.openInNewTab`       | `true`      | `true`이면 논문마다 새 탭을 연다. `false`이면 논문 탭 하나를 재사용한다.                                          |
| `arxivjs.paperPanelLocation` | `sameGroup` | 논문을 열 편집기 그룹. `sameGroup`은 논문 목록과 같은 그룹이라 화면을 나누지 않는다. `beside`는 목록 옆 그룹이다. |
| `arxivjs.openHomeOnStartup`  | `true`      | ArxivJS 뷰를 처음 열 때 주제 목록(홈)을 함께 연다.                                                                |
| `arxivjs.enableWrite`        | `false`     | 데이터 폴더 쓰기 기능을 켠다. 끄면 읽기만 한다.                                                                   |

### 명령 목록

Command Palette(`Ctrl+Shift+P`)에서 `ArxivJS`로 검색한다.

| 명령                        | 설명                                         |
| --------------------------- | -------------------------------------------- |
| `ArxivJS: 데이터 폴더 선택` | 데이터 폴더를 지정한다.                      |
| `ArxivJS: Reload`           | 모든 데이터를 다시 읽는다.                   |
| `ArxivJS: 설정 열기`        | 이 확장의 설정 화면을 연다.                  |
| `ArxivJS: 주제 열기`        | 주제를 검색해서 Topic 패널로 연다.           |
| `ArxivJS: 논문 열기`        | 주제를 고른 뒤 논문을 검색해서 연다.         |
| `ArxivJS: 원문 URL 열기`    | 선택한 논문의 URL을 브라우저로 연다.         |
| `ArxivJS: 논문 정보 복사`   | 제목, 저자, 연도, URL을 클립보드에 복사한다. |
| `ArxivJS: 주제 추가`        | 새 주제 폴더를 만든다. (쓰기 기능)           |
| `ArxivJS: 주제 이름 변경`   | 주제 폴더 이름을 바꾼다. (쓰기 기능)         |
| `ArxivJS: 주제 삭제`        | 빈 주제 폴더를 지운다. (쓰기 기능)           |
| `ArxivJS: 논문 추가`        | arXiv 검색, arXiv URL·ID, 직접 입력으로 논문을 추가한다. (쓰기 기능) |
| `ArxivJS: 메타 정보 편집`   | 논문의 메타 정보(.json)를 고친다. (쓰기 기능) |
| `ArxivJS: 논문을 다른 주제로 이동` | 논문 파일을 다른 주제로 옮긴다. (쓰기 기능) |
| `ArxivJS: 논문 삭제`        | 논문 파일을 지운다. (쓰기 기능)              |
| `ArxivJS: 요약 삭제`        | 요약 문서(.md)와 하이라이트를 지운다. (쓰기 기능) |

쓰기 기능 명령은 `arxivjs.enableWrite`가 켜져 있을 때만 보인다.

### 데이터 폴더 형식

데이터 폴더는 [arxivjs](https://github.com/doosik71/arxivjs) 앱이 만드는 형식을 따른다. 쓰기 기능이 꺼져 있으면 이 확장은 읽기만 한다. 예외는 `로컬 문서 열기`로 연 편집기에서 사용자가 직접 저장하는 경우뿐이다. 쓰기 기능을 켜면 확장이 arxivjs 형식 명세의 작성기 규칙에 따라 파일을 바꾼다.

```text
<데이터 폴더>/
├── Few-Shot_Learning/                 # 주제 폴더
│   ├── a_closer_look_at_few_shot_classification.json   # 메타 정보
│   ├── a_closer_look_at_few_shot_classification.md     # 요약 문서
│   └── ...
└── ...
```

- **주제 폴더 이름**은 영문자, 숫자, 한글, 공백, 언더스코어(`_`), 괄호(`(`, `)`), 하이픈(`-`)만 쓸 수 있다. 표시할 때는 `_`를 공백으로 바꾸고 연속 공백을 하나로 줄인다(`딥러닝_(Deep_Learning)` → `딥러닝 (Deep Learning)`). 이 규칙에 맞지 않는 폴더(예: `.git`, `a.b`)는 목록에 나오지 않는다.
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
git clone https://github.com/doosik71/arxivjs-extension.git
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
| `npm run test:integration` | VS Code 통합 테스트를 읽기 전용 검증과 함께 실행한다.         |
| `npm run bench`            | 성능을 측정하고 목표(DEV-PLAN §5.4)를 판정한다.               |
| `npm run icon`             | Marketplace 아이콘 `media/icon.png`를 다시 만든다.            |
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

- 테스트 데이터는 `test/fixtures/sample-data/`에 있다. 어떤 경계 사례가 들어 있는지는 `test/fixtures/README.md`에 정리되어 있다.
- 통합 테스트(`scripts/run-integration.mjs`)는 다음 순서로 **어떤 파일도 바뀌지 않았는지** 검증한다.
  1. fixture의 모든 파일 경로, 크기, mtime, SHA-256을 기록한다.
  2. fixture를 OS 수준 읽기 전용으로 바꾼다. 이때 기존 파일에 쓰면 `EPERM`으로 실패한다.
  3. 테스트를 실행한다.
  4. 읽기 전용을 되돌린다.
  5. 기록과 비교해서 파일이 생기거나, 사라지거나, 바뀌었으면 실패로 처리한다.
- 통합 테스트는 기본으로 최신 안정판 VS Code에서 실행한다. 최소 지원 버전에서 확인하려면 다음처럼 실행한다.

  ```bash
  VSCODE_TEST_VERSION=1.90.0 npm run test:integration
  ```

### 성능 측정

```bash
npm run bench                            # fixture
npm run bench -- D:\dev\javascript\arxivjsdata   # 실데이터 (읽기만 한다)
```

다음 목표를 판정하고, 하나라도 넘으면 종료 코드 1로 끝난다.

| 항목                   | 목표       |
| ---------------------- | ---------- |
| 주제 목록              | 100ms 이하 |
| 가장 큰 주제의 첫 로딩 | 500ms 이하 |
| 가장 큰 md 렌더링      | 200ms 이하 |

그 밖에 모든 md 문서를 한 번씩 렌더링해서 시간 분포(p50, p95, 최대)와 렌더링 예외 건수를 보여준다.

### 패키징 (.vsix 만들기)

```bash
npm run package
# 내부적으로: vsce package --no-dependencies
```

- `--no-dependencies`: 확장은 esbuild로 번들하므로 `node_modules`를 넣지 않는다.
- README의 상대 링크는 vsce가 `repository`(GitHub) 주소 기준의 절대 링크로 바꾼다. 패키지에 들어가지 않는 파일(`DEV-PLAN.md` 등)은 링크하지 않고 이름만 적는다.

이 명령을 실행하면 프로젝트 루트에 `arxivjs-viewer-<버전>.vsix`가 생긴다. 이 파일을 [방법 2](#방법-2-vsix-파일로-설치)로 설치하면 Marketplace 없이도 팀 내부에 배포할 수 있다.

`package.json`의 게시 관련 항목:

| 항목             | 값                                                  | 비고                                           |
| ---------------- | --------------------------------------------------- | ---------------------------------------------- |
| `name`           | `arxivjs-viewer`                                    | 소문자, 공백 없음                              |
| `displayName`    | `ArxivJS VSCode Extension`                          | Marketplace에 표시되는 이름                    |
| `publisher`      | `doosik71`                                          | 게시자 ID. 확장 ID는 `doosik71.arxivjs-viewer` |
| `version`        | `0.2.0`                                             | SemVer                                         |
| `engines.vscode` | `^1.90.0`                                           |                                                |
| `icon`           | `media/icon.png`                                    | 128×128 PNG (`npm run icon`)                   |
| `repository`     | `https://github.com/doosik71/arxivjs-extension.git` |                                                |
| `license`        | `MIT`                                               | 루트의 `LICENSE` 파일                          |

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

#### 2단계. 게시자(Publisher) 확인

이 확장의 게시자는 [doosik71](https://marketplace.visualstudio.com/publishers/doosik71)이다. 이미 만들어져 있고, `package.json`의 `publisher`에 적혀 있다.

다른 게시자로 배포하려면 다음과 같이 한다.

1. <https://marketplace.visualstudio.com/manage>에 같은 계정으로 로그인한다.
2. **Create publisher**를 누르고 ID와 이름을 입력한다. ID는 나중에 바꿀 수 없다.
3. 그 ID를 `package.json`의 `publisher`에 적는다.

#### 3단계. vsce 로그인

```bash
npx @vscode/vsce login doosik71
# 프롬프트에 1단계의 PAT를 붙여넣는다.
```

#### 4단계. 게시

```bash
npx @vscode/vsce publish
```

- 이미 만든 `.vsix`가 있으면 `npx @vscode/vsce publish --packagePath arxivjs-viewer-0.2.0.vsix`로 그 파일을 올릴 수 있다.
- 웹에서 올릴 수도 있다. <https://marketplace.visualstudio.com/manage>에서 게시자를 고르고 **New extension → Visual Studio Code**로 `.vsix`를 업로드한다.
- 게시 후 검증을 거쳐 몇 분 안에 Marketplace 검색에 나타난다. 확장 ID는 `doosik71.arxivjs-viewer`다.

> Azure DevOps의 PAT 정책은 바뀔 수 있다. 위 방법이 막히면 공식 문서 [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)를 확인한다. Microsoft Entra ID 인증을 쓰는 `vsce publish --azure-credential` 방식도 그 문서에 안내되어 있다.

### 버전 업데이트와 재게시

```bash
npx @vscode/vsce publish patch   # 0.2.0 → 0.2.1
npx @vscode/vsce publish minor   # 0.2.0 → 0.3.0
npx @vscode/vsce publish 1.0.0   # 버전 직접 지정
```

`publish patch|minor|major`는 `package.json`의 버전을 올리고 git 태그를 만든 뒤 게시한다. 게시 전에 `CHANGELOG.md`를 갱신한다.

Marketplace에서 확장을 내리려면 `npx @vscode/vsce unpublish doosik71.arxivjs-viewer`를 실행한다. 이 작업은 되돌릴 수 없다.

### Open VSX에 등록 (선택)

VSCodium, Cursor 같은 VS Code 호환 에디터 사용자에게도 배포하려면 [Open VSX](https://open-vsx.org/)에 게시한다.

1. <https://open-vsx.org>에 GitHub 계정으로 로그인하고, Eclipse Foundation Publisher Agreement에 동의한다.
2. 사용자 설정에서 Access Token을 만든다.
3. 다음 명령을 실행한다.

```bash
npx ovsx create-namespace doosik71 -p <token>   # 최초 1회
npx ovsx publish arxivjs-viewer-0.2.0.vsix -p <token>
```

### 개발 시 주의 사항

- **실사용 데이터 폴더에 쓰지 않는다.**
  - 실제 데이터 폴더(예: `D:\dev\javascript\arxivjsdata`)는 열람용으로만 지정한다. 그 폴더를 지정한 창에서는 `arxivjs.enableWrite`를 켜지 않는다.
  - 쓰기 기능을 손으로 확인할 때는 fixture나 실제 데이터의 **복사본**을 쓴다.
  - 테스트, 스크립트, `markdownlint --fix` 같은 자동 수정 도구가 그 경로를 대상으로 삼으면 안 된다.
  - 테스트는 항상 `test/fixtures/` 아래의 데이터로 한다. 쓰기 테스트는 그것을 OS 임시 폴더로 복사해서 한다(`test/unit/tempData.ts`).
- 데이터 폴더 읽기는 `src/data/readonlyFs.ts`, 쓰기는 `src/data/dataWriter.ts`를 거쳐서만 한다. ESLint가 다른 곳에서 `fs`를 쓰거나 쓰기 API를 호출하면 오류를 낸다. `dataWriter.ts`는 호출될 때마다 `arxivjs.enableWrite`를 다시 확인하고, 데이터 폴더 밖의 경로는 거부한다.
- 캐시나 사용자 상태는 `context.globalState`나 `context.globalStorageUri`에 저장한다. 데이터 폴더에는 형식 명세에 정의된 파일 말고는 아무것도 만들지 않는다.
- 설계 상세는 저장소의 `DEV-PLAN.md`를 따른다.
