# 테스트 fixture

`sample-data/`는 실사용 데이터 폴더(`D:\dev\javascript\arxivjsdata`)에서 일부 파일을 **복사**하고, 경계 사례용 합성 파일을 더한 테스트 데이터다. 테스트는 항상 이 폴더만 대상으로 한다.

| 경로 | 사례 | 출처 |
| --- | --- | --- |
| `Cosine_Similarity/` | 일반 json·md 쌍, `.hlt` 하이라이트 | 실데이터 |
| `Few-Shot_Learning/` | 하이픈 폴더 이름, 표가 있는 md, json만 있는 논문(`domain_agnostic_…`) | 실데이터 |
| `Large_Language_Model/` | 본문에 `<think>` 등 HTML처럼 보이는 텍스트 | 실데이터 |
| `Surgical_Instrument_Segmentation/` | md만 있는 논문(base64 파일명) | 실데이터 |
| `Alzheimer_Detection/` | 원격 이미지, `source: "pdf"` | 실데이터 |
| `Agentic_Reasoning/` | `citation` 없음, md 없음 | 실데이터 |
| `Autoencoder/` | `source: "manual"` | 실데이터 |
| `Broken_Data/` | 깨진 JSON, 수식·`<think>` 샘플, 무시 대상(`.txt`, `.bak`, `.md.bak`) | 합성 |
| `Invalid Topic Name/` | 이름 규칙 위반 폴더 → 주제 목록에서 제외 | 합성 |
| `.hidden/` | dot 폴더 → 제외 | 합성 |
| `notes.txt` | 최상위 파일 → 제외 | 합성 |

구성은 `test/unit/fixtures.test.ts`로 검증한다.
