# ArxivJS VSCode Extension

A VS Code extension for browsing papers organized in an arxivjs data folder. If you turn on write support in the settings, you can also edit the data folder.

- Shows the list of topics (folders).
- When you select a topic, shows its papers and their metadata: title, authors, year, URL, abstract, citation count, and source.
- When you select a paper, renders its summary Markdown document, including math and tables.

With the default settings, the extension **does not modify** any file in the data folder. If you turn on `arxivjs.enableWrite`, you can manage topics, search arXiv and add papers, edit metadata, and move or delete papers. It can also generate paper summaries with Gemini or Ollama (see [Topic and paper management](#usage) and [AI summaries](#usage)).

The data folder (arxivjsdata) follows the format of the [arxivjs](https://github.com/doosik71/arxivjs) app. Write support works without the arxivjs app. Highlights are still edited in that app. To pick up changes made in the arxivjs app, press this extension's Reload button.

> Current version: 0.3.1. For design and development schedule, see `DEV-PLAN.md` in the repository. Changes are recorded in `CHANGELOG.md`.

## Table of Contents

- [ArxivJS VSCode Extension](#arxivjs-vscode-extension)
  - [Table of Contents](#table-of-contents)
  - [User Guide](#user-guide)
    - [Requirements](#requirements)
    - [Installation](#installation)
      - [Option 1. Install from the Marketplace](#option-1-install-from-the-marketplace)
      - [Option 2. Install from a `.vsix` file](#option-2-install-from-a-vsix-file)
      - [Option 3. Uninstall](#option-3-uninstall)
    - [Data Folder Setup](#data-folder-setup)
    - [Usage](#usage)
    - [Settings](#settings)
    - [Commands](#commands)
    - [Data Folder Format](#data-folder-format)
    - [Write Support and Data Protection](#write-support-and-data-protection)
    - [Troubleshooting](#troubleshooting)
  - [Developer Guide](#developer-guide)
    - [Development Environment Setup](#development-environment-setup)
    - [Running and Debugging Locally](#running-and-debugging-locally)
    - [Testing](#testing)
    - [Performance Benchmarks](#performance-benchmarks)
    - [Packaging (Building a .vsix)](#packaging-building-a-vsix)
    - [Publishing to the Marketplace](#publishing-to-the-marketplace)
      - [Step 1. Create an Azure DevOps Organization and a Personal Access Token (PAT)](#step-1-create-an-azure-devops-organization-and-a-personal-access-token-pat)
      - [Step 2. Verify the Publisher](#step-2-verify-the-publisher)
      - [Step 3. Log In with vsce](#step-3-log-in-with-vsce)
      - [Step 4. Publish](#step-4-publish)
    - [Updating the Version and Republishing](#updating-the-version-and-republishing)
    - [Publishing to Open VSX (Optional)](#publishing-to-open-vsx-optional)
    - [Development Notes](#development-notes)

## User Guide

### Requirements

- VS Code **1.90** or later
- An arxivjs data folder. See [Data Folder Format](#data-folder-format) for the format.

### Installation

Use one of the following three options.

#### Option 1. Install from the Marketplace

1. Open **Extensions** (`Ctrl+Shift+X`) from the Activity Bar on the left side of VS Code.
2. Search for `ArxivJS VSCode Extension`. The publisher is [doosik71](https://marketplace.visualstudio.com/publishers/doosik71).
3. Click **Install**.

From the command line, install it with `code --install-extension doosik71.arxivjs-viewer`.

#### Option 2. Install from a `.vsix` file

Use this when you have a distributed `arxivjs-viewer-<version>.vsix` file.

1. Open the Extensions view.
2. Choose **Install from VSIX...** from the `…` menu at the top right.
3. Select the `.vsix` file.

You can also install it from the command line.

```bash
code --install-extension arxivjs-viewer-0.3.1.vsix
```

#### Option 3. Uninstall

Find `ArxivJS VSCode Extension` in the Extensions view and click **Uninstall**. From the command line:

```bash
code --uninstall-extension doosik71.arxivjs-viewer
```

Uninstalling the extension does not affect the data folder.

### Data Folder Setup

On first run, clicking the **ArxivJS** icon in the Activity Bar shows a "Select Data Folder" button.

1. Click the **Select Data Folder** button. You can also run `ArxivJS: Select Data Folder` from the Command Palette (`Ctrl+Shift+P`).
2. Choose your arxivjs data folder.

You can also set it directly in `settings.json`.

```json
{
  "arxivjs.dataFolder": "<absolute path to the arxivjs data folder>"
}
```

### Usage

```text
ArxivJS (Activity Bar)
└─ TOPICS          [🏠 Home] [⟳ Reload] [📂 Select Folder] [⚙ Settings]
   ▸ AI Healthcare
   ▾ Few-Shot Learning    (87)    ← expand to see papers and paper count
      A Closer Look at ...   2019 · 2,737
      Domain-Agnostic ...    2019 · 1 · No document
      ...
```

1. **Topic list (Home)**
   - When you first open the ArxivJS view, the **Home** page also opens in the editor area. It lists every topic in the data folder with its paper count. To stop it from opening automatically, turn off `arxivjs.openHomeOnStartup`.
   - To open it again, click the `🏠` button in the TOPICS title bar or run `ArxivJS: Open Topic List (Home)`.
   - **Filter**: Type words in the search box to keep only topics whose names contain all of them. Both the display name and the folder name (such as `Large_Language_Model`) are searched.
     - `Enter`: opens the first visible topic.
     - `↓`: moves focus to the first topic.
   - **Sort**: `By name` or `By paper count`.
   - Clicking a topic opens the Topic panel.
   - You can also search the TOPICS tree with VS Code's built-in feature: click the tree and start typing, or press `Ctrl+Alt+F`.
2. **Browsing topics**: The TOPICS view shows the topics in the data folder. Underscores (`_`) in folder names are shown as spaces (`Few-Shot_Learning` → `Few-Shot Learning`).
3. **Browsing the paper list**
   - Expanding a topic shows its papers. Each paper shows `year · citation count`. Papers without a summary document are marked `No document`.
   - Hovering over a paper shows a tooltip with authors, year, citation count, source, URL, and the beginning of the abstract.
   - Papers whose metadata (json) could not be read are shown with a warning icon.
   - Clicking a topic opens the **Topic panel**, which shows the topic's papers in a table (title/authors, year, citations).
     - **Sort**: Click a column header (Title, Year, Citations). Click the same column again to reverse the order. The initial sort order follows `arxivjs.paperSort`. Papers without a year or citation count always go last, regardless of direction.
     - **Filter**: Type words in the search box to keep only papers whose title and authors contain all of them. Turn on "With summary only" to hide papers without an `.md` file.
     - **Abstract**: The `Abstract` button on a row expands and collapses the abstract. The `Original` button opens the original URL in a browser.
     - Clicking a paper title opens the Paper panel. By default it opens as a **new tab in the same editor group** as the Topic panel. To view the table and the paper side by side, set `arxivjs.paperPanelLocation` to `beside`. Papers then gather in a single group on the right, and opening another paper does not split the screen further.
     - Sort order, filters, scroll position, and expanded abstracts are kept across Reload.
4. **Reading a paper**
   - Clicking a paper opens the **Paper panel**. By default each paper opens in its own tab, and a paper that is already open is brought to front. To reuse a single tab, turn off `arxivjs.openInNewTab`.
   - The top shows metadata (title, authors, year, citation count, source, original link), and below it the rendered summary document.
   - For papers without a summary document, the abstract is shown instead.
5. **Opening the original and the local document**
   - `Open Original` in the Paper panel opens the paper's page in an external browser.
   - `Open Local Document`, to its right, opens the actual `.md` file from the data folder in an editor. This button appears only for papers that have a summary document.
   - ⚠️ This is a regular editor. If you edit and save, the file in the data folder changes. The extension itself writes nothing; saving happens only when you do it yourself. If the arxivjs app regenerates the same file, your edits may be overwritten.
   - To show saved changes in the Paper panel, click the panel's `⟳ Reload`.
   - Tab icons differ for Home (house), the Topic panel (list), and the Paper panel (document).
6. **Reload**
   - This extension does not detect file changes automatically. If you added or changed data in another app, press a Reload button to read it again.
   - Each button reloads a different scope.

| Button location             | Reload scope                                      |
| --------------------------- | ------------------------------------------------- |
| TOPICS title bar `⟳`        | Everything (topic list and papers of expanded topics) |
| Home `⟳`                    | Everything                                        |
| `⟳` next to a topic node    | That topic's paper list                           |
| Topic panel `⟳`             | That topic's paper list                           |
| Paper panel `⟳`             | That paper's metadata and document                |

7. **Topic and paper management (write support)**
   - Requires `arxivjs.enableWrite` to be on. When it is off, all of the menus and buttons below disappear and the extension only reads the data folder.
   - Write support works without the arxivjs app. Only arXiv lookups use the internet (`export.arxiv.org`).
   - **Add topic**: Click the `+` button in the TOPICS title bar or `+ Add Topic` on Home, then enter a name. Names may contain English letters, digits, Hangul (Korean), spaces, parentheses, and hyphens. The folder name is created by replacing spaces with `_` (`Reinforcement Learning` → `Reinforcement_Learning`). The resulting folder name is shown below the input box.
   - **Rename topic**: Choose it from the topic node's context menu. Only the folder name changes; file names inside stay the same. Paper tabs from that topic are closed.
   - **Delete topic**: Choose it from the topic node's context menu. The folder is deleted **only if it is completely empty**. Even if no papers are shown, if files such as `.txt` or `.bak` remain, it is not deleted and the remaining files are reported.
   - You cannot create a topic whose name differs from an existing one only in case, or that has the same display name.
   - **Add paper**: Click the topic node's context menu or `+ Add Paper` in the Topic panel, then choose a method.
     - `Search arXiv`: Enter a query to see up to 50 papers containing all the words, sorted by relevance. You can select several papers and add them at once. Papers already in this topic are marked `Already added`.
     - `arXiv URL/ID`: Enter a value such as `2310.16485` or `https://arxiv.org/abs/2310.16485`.
     - `Manual Entry`: Fill in a form with title, authors, year, URL, abstract, citation count, and source. If the title contains no English letters or digits, you must also enter a file name (a-z, 0-9, `_`).
     - The file name is derived from the title (`Attention Is All You Need` → `attention_is_all_you_need.json`). If a paper with the same name already exists, you are asked whether to overwrite it. The default is to skip.
   - **Edit metadata**: From the paper node's context menu or `Edit Metadata` in the Paper panel. Only changed fields are saved, and fields unknown to this extension are kept. Changing the title does not rename the file.
   - **Move paper to another topic**: From the paper node's context menu. `.json`, `.md`, `.hlt`, and `.txt` are moved together. If the target topic has a paper with the same file name, you are told first, and one side is kept following the same rules as the arxivjs app.
   - **Delete paper**: From the paper node's context menu. Deletes `.json`, `.md`, `.hlt`, and `.txt`. This cannot be undone.
   - **Delete summary**: From the paper node's context menu or `Delete Summary` in the Paper panel. Deletes `.md` and `.hlt`. Unlike the arxivjs app, no `.bak` backup is kept. If the data folder is a git repository, the `.md` can be restored with git.
   - Papers without metadata (`.json`), i.e. papers with only a summary document, cannot be edited, moved, or deleted.
   - ⚠️ When the arxivjs app is using the same folder, do not edit the same topic or paper in both at the same time. There is no locking, so the last write wins.
8. **AI summaries (write support)**
   - **Setup**
     1. The data folder must contain `userprompt.txt`. This is the same file the arxivjs app uses. Put `{context}` where the paper text should go (only the first occurrence is replaced).
     2. Choose an engine (`arxivjs.llm.engine`).
        - **Gemini**: Enter your key with the `ArxivJS: Set Gemini API Key` command. The key is stored in the OS credential store (SecretStorage), not in `settings.json`. The model is `arxivjs.gemini.model` (default `gemini-2.5-flash`).
        - **Ollama**: Set `arxivjs.ollama.url` (default `http://localhost:11434`) and `arxivjs.ollama.model` (e.g. `gemma4:31b`). If Ollama's default context length is short, the latter part of long papers is cut off before summarization, so increase `num_ctx` in your Modelfile or Ollama settings.
   - **Generate summary**: From the paper node's context menu or `Generate Summary` in the Paper panel (`Regenerate Summary` if a summary already exists).
     - For the full text, `<paper>.txt` is used if it exists. Otherwise the PDF is downloaded, its text is extracted, and saved as `.txt`. For arXiv papers the abs URL is converted to the pdf URL; for `source: pdf` the URL is used as is. Manually added papers (`manual`) require a `.txt` file.
     - The progress notification shows the number of characters received. Clicking `Cancel` leaves the summary document unchanged.
     - The `.md` is saved only after the response completes. An existing summary is replaced without a backup (you are asked to confirm before regenerating).
   - **Summarize all papers without summaries**: From the topic node's context menu. Papers without an `.md` are summarized one at a time. After each PDF download it waits 3 seconds (arXiv request interval). Failed papers are skipped and the results are reported at the end. Failure reasons are in the `ArxivJS` output channel.

### Settings

| Setting                      | Default     | Description                                                                                                       |
| ---------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `arxivjs.dataFolder`         | `""`        | Absolute path to the data folder                                                                                  |
| `arxivjs.language`           | `en`        | Display language of messages, the tree, and panels: `en` (English), `ko` (Korean), `auto` (follows the VS Code display language). Reload the window to apply a change. |
| `arxivjs.paperSort`          | `citation`  | Paper sort order: `citation` (citation count), `year` (year), `title` (title)                                     |
| `arxivjs.openInNewTab`       | `true`      | If `true`, opens a new tab for each paper. If `false`, reuses a single paper tab.                                 |
| `arxivjs.paperPanelLocation` | `sameGroup` | Editor group in which to open papers. `sameGroup` uses the same group as the paper list, so the screen is not split. `beside` uses the group next to the list. |
| `arxivjs.openHomeOnStartup`  | `true`      | Opens the topic list (Home) when the ArxivJS view is first opened.                                                |
| `arxivjs.enableWrite`        | `false`     | Enables writing to the data folder. When off, the extension only reads.                                           |
| `arxivjs.llm.engine`         | `gemini`    | AI summary engine: `gemini`, `ollama`                                                                             |
| `arxivjs.gemini.model`       | `gemini-2.5-flash` | Gemini model. Set the API key with the `ArxivJS: Set Gemini API Key` command (SecretStorage).              |
| `arxivjs.ollama.url`         | `http://localhost:11434` | Ollama server URL                                                                                    |
| `arxivjs.ollama.model`       | `""`        | Ollama model (e.g. `gemma4:31b`)                                                                                  |

The UI is in English by default. To see messages, the tree, and panels in Korean, set `arxivjs.language` to `ko` and reload the window. Command titles and setting descriptions are always shown in English.

### Commands

Search for `ArxivJS` in the Command Palette (`Ctrl+Shift+P`).

| Command                                         | Description                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `ArxivJS: Select Data Folder`                   | Sets the data folder.                                               |
| `ArxivJS: Reload`                               | Reloads all data.                                                   |
| `ArxivJS: Open Settings`                        | Opens this extension's settings.                                    |
| `ArxivJS: Open Topic`                           | Searches for a topic and opens it in the Topic panel.              |
| `ArxivJS: Open Paper`                           | Selects a topic, then searches for a paper and opens it.            |
| `ArxivJS: Open Original URL`                    | Opens the selected paper's URL in a browser.                        |
| `ArxivJS: Copy Paper Info`                      | Copies the title, authors, year, and URL to the clipboard.          |
| `ArxivJS: Add Topic`                            | Creates a new topic folder. (write support)                         |
| `ArxivJS: Rename Topic`                         | Renames a topic folder. (write support)                             |
| `ArxivJS: Delete Topic`                         | Deletes an empty topic folder. (write support)                      |
| `ArxivJS: Add Paper`                            | Adds papers via arXiv search, arXiv URL/ID, or manual entry. (write support) |
| `ArxivJS: Edit Metadata`                        | Edits a paper's metadata (.json). (write support)                   |
| `ArxivJS: Move Paper to Another Topic`          | Moves paper files to another topic. (write support)                 |
| `ArxivJS: Delete Paper`                         | Deletes paper files. (write support)                                |
| `ArxivJS: Delete Summary`                       | Deletes the summary document (.md) and highlights. (write support)  |
| `ArxivJS: Generate Summary`                     | Creates a paper summary (.md) with Gemini or Ollama. (write support) |
| `ArxivJS: Summarize All Papers Without Summaries` | Summarizes papers without summaries in a topic, one by one. (write support) |
| `ArxivJS: Set Gemini API Key`                   | Stores the Gemini API key in SecretStorage.                         |
| `ArxivJS: Delete Gemini API Key`                | Deletes the stored Gemini API key.                                  |

Write-support commands appear only when `arxivjs.enableWrite` is on.

### Data Folder Format

The data folder follows the format produced by the [arxivjs](https://github.com/doosik71/arxivjs) app. With write support off, this extension only reads. The only exception is when you save yourself in an editor opened with `Open Local Document`. With write support on, the extension changes files following the writer rules of the arxivjs format specification.

```text
<data folder>/
├── Few-Shot_Learning/                 # topic folder
│   ├── a_closer_look_at_few_shot_classification.json   # metadata
│   ├── a_closer_look_at_few_shot_classification.md     # summary document
│   └── ...
└── ...
```

- **Topic folder names** may contain only English letters, digits, Hangul (Korean), spaces, underscores (`_`), parentheses (`(`, `)`), and hyphens (`-`). For display, `_` is replaced with a space and consecutive spaces are collapsed into one (`딥러닝_(Deep_Learning)` → `딥러닝 (Deep Learning)`). Folders that do not follow this rule (e.g. `.git`, `a.b`) are not listed.
- Each paper consists of a pair of `.json` and `.md` files with the same name.
- Other files such as `.txt`, `.hlt`, and `.bak` are ignored.

Example `.json` metadata:

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

| Field      | Required | Description                                               |
| ---------- | -------- | --------------------------------------------------------- |
| `title`    | ✔        | Paper title                                               |
| `authors`  | ✔        | Authors, as a comma-separated string                      |
| `year`     | ✔        | Publication year                                          |
| `url`      | ✔        | Original URL                                              |
| `abstract` |          | Abstract                                                  |
| `citation` |          | Citation count. If missing, the paper goes last when sorting. |
| `source`   |          | Source: `arxiv`, `pdf`, `manual`                          |

### Write Support and Data Protection

Write support (`arxivjs.enableWrite`) is off by default. Before turning it on, note the following.

- **Files the extension changes**: topic folders, papers' `.json`, `.md`, and `.txt`, plus `.hlt` and `.bak` when moving or deleting. It follows the writer rules of the arxivjs format specification. Files are written to a temporary file (`.<name>.tmp`) and then swapped in, so other apps never see a partially written file.
- **Concurrent editing**: The data folder has no locking. If the arxivjs app or another VS Code window edits the same paper at the same time, the last write wins. Do not edit the same paper in two places at once.
- **Irreversible operations**: Deleting a paper, deleting a summary, and regenerating a summary keep no backup, so they go through a confirmation dialog. If you manage the data folder as a git repository, `.json` and `.md` can be restored with git. Note that the default `.gitignore` does not track `.txt`, `.hlt`, or `.bak`.
- **AI summaries and privacy**: Summarizing sends the full paper text and `userprompt.txt` to the selected engine. With Gemini, they are sent to Google's servers. Summarize documents that must not leave your machine with a local Ollama. The Gemini API key is stored only in the OS credential store (SecretStorage) and never written to logs or settings files.
- **Differences from the arxivjs app**
  - No `.bak` backup is created when regenerating or deleting a summary. The arxivjs app moves `.md` to `.bak` when deleting a summary.
  - Entries with only an `.md` and no `.json` are listed, but cannot be edited, moved, or deleted.
  - Editing highlights (`.hlt`), looking up citation counts, chatting with papers, and uploading PDFs are still done in the arxivjs app.

### Troubleshooting

| Symptom                                    | Solution                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| TOPICS is empty                            | Check that the `arxivjs.dataFolder` path is correct. Also check that topic folder names follow the naming rules. |
| Newly added papers do not appear           | Press the Reload `⟳` button. This extension does not detect changes automatically.      |
| A paper shows "No document"                | That paper has no `.md` file yet. Only metadata and the abstract are shown.             |
| Some math appears as raw source            | The LaTeX syntax is not supported by KaTeX. Only that formula is shown as raw source.   |
| Write menus and buttons do not appear      | Turn on `arxivjs.enableWrite`.                                                          |
| Summarization fails with a "userprompt.txt" error | Create `userprompt.txt` in the data folder and put `{context}` where the paper text should go. |
| Summarization fails with a PDF error       | Check the paper's URL and `source`. Scanned image PDFs have no text and cannot be summarized. Manually added papers (`manual`) require a `.txt` file. |
| Ollama summaries cover only the beginning  | Ollama's context length (`num_ctx`) is too short. Increase it in your Modelfile or Ollama settings. |
| Other errors                               | Check the logs in the `ArxivJS` output channel under **View → Output**.                 |

## Developer Guide

### Development Environment Setup

Required tools:

- [Node.js](https://nodejs.org/) 20 LTS or later
- [VS Code](https://code.visualstudio.com/) 1.90 or later
- Git

Clone the repository and install dependencies with the following commands.

```bash
git clone https://github.com/doosik71/arxivjs-extension.git
cd arxivjs-extension
npm install
```

Main npm scripts:

| Script                     | Description                                                   |
| -------------------------- | ------------------------------------------------------------- |
| `npm run build`            | Bundles `dist/extension.js` and the PDF extraction worker `dist/pdfWorker.js` with esbuild. |
| `npm run watch`            | Rebundles when sources change.                                |
| `npm run typecheck`        | Runs TypeScript type checking only (no output files).         |
| `npm run lint`             | Runs ESLint, including the rules that forbid write APIs.      |
| `npm test`                 | Runs unit tests (vitest).                                     |
| `npm run check`            | Runs `typecheck` → `lint` → `test` in order.                  |
| `npm run test:integration` | Runs VS Code integration tests with read-only verification.   |
| `npm run bench`            | Measures performance and checks the targets (DEV-PLAN §5.4).  |
| `npm run icon`             | Regenerates the Marketplace icon `media/icon.png`.            |
| `npm run package`          | Builds a `.vsix` file.                                        |

### Running and Debugging Locally

1. Open the project folder in VS Code.
2. Press `F5` or choose `Run Extension` in **Run and Debug**. A new **Extension Development Host** window opens with the extension loaded.
3. In the new window, set a test data folder with `ArxivJS: Select Data Folder`. The default is `test/fixtures/sample-data`.
4. After changing code, press `Ctrl+R` (Developer: Reload Window) in the Extension Development Host window to apply the changes.

To debug webviews, run `Developer: Open Webview Developer Tools` in the Extension Development Host window.

### Testing

```bash
npm run lint
npm test
npm run test:integration
```

- Test data is in `test/fixtures/sample-data/`. The edge cases it covers are listed in `test/fixtures/README.md`.
- The integration tests (`scripts/run-integration.mjs`) verify that **no file was changed** in the following order.
  1. Record the path, size, mtime, and SHA-256 of every fixture file.
  2. Make the fixtures read-only at the OS level. Writing to an existing file then fails with `EPERM`.
  3. Run the tests.
  4. Restore write permission.
  5. Compare against the record and fail if any file was created, removed, or changed.
- Write-support tests copy the fixtures to an OS temporary folder and write to that copy.
  - `test/unit/tempData.ts` makes the copy for unit tests, and `test/integration/tempData.ts` for integration tests. ESLint allows file writes in test code only in these two files.
  - The integration test `writeFlow.test.ts` replaces the input box, QuickPick, and confirmation dialog functions with functions that return predefined answers, replaces the global `fetch` with fake arXiv, PDF, and Ollama responses, and then runs the actual commands. No network is used.
- Integration tests run on the latest stable VS Code by default. To check against the minimum supported version, run:

  ```bash
  VSCODE_TEST_VERSION=1.90.0 npm run test:integration
  ```

### Performance Benchmarks

```bash
npm run bench                            # fixtures
npm run bench -- <data folder>           # real data (read-only)
```

The following targets are checked; if any is exceeded, the script exits with code 1.

| Item                             | Target    |
| -------------------------------- | --------- |
| Topic list                       | ≤ 100 ms  |
| First load of the largest topic  | ≤ 500 ms  |
| Rendering the largest md         | ≤ 200 ms  |

It also renders every md document once and reports the time distribution (p50, p95, max) and the number of rendering exceptions.

### Packaging (Building a .vsix)

```bash
npm run package
# internally: vsce package --no-dependencies
```

- `--no-dependencies`: The extension is bundled with esbuild, so `node_modules` is not included.
- vsce rewrites relative links in the README to absolute links based on the `repository` (GitHub) URL. Files not included in the package (such as `DEV-PLAN.md`) are mentioned by name only, without links.

This command creates `arxivjs-viewer-<version>.vsix` in the project root. Installing this file with [Option 2](#option-2-install-from-a-vsix-file) lets you distribute it within a team without the Marketplace.

Publishing-related fields in `package.json`:

| Field            | Value                                               | Notes                                          |
| ---------------- | --------------------------------------------------- | ---------------------------------------------- |
| `name`           | `arxivjs-viewer`                                    | Lowercase, no spaces                           |
| `displayName`    | `ArxivJS VSCode Extension`                          | Name shown in the Marketplace                  |
| `publisher`      | `doosik71`                                          | Publisher ID. The extension ID is `doosik71.arxivjs-viewer` |
| `version`        | `0.3.1`                                             | SemVer                                         |
| `engines.vscode` | `^1.90.0`                                           |                                                |
| `icon`           | `media/icon.png`                                    | 128×128 PNG (`npm run icon`)                   |
| `repository`     | `https://github.com/doosik71/arxivjs-extension.git` |                                                |
| `license`        | `MIT`                                               | `LICENSE` file in the root                     |

Files that do not need to be in the distribution package (`src/`, `test/`, `node_modules/`, etc.) are listed in `.vscodeignore`.

### Publishing to the Marketplace

This is the procedure for publishing to the [Visual Studio Marketplace](https://marketplace.visualstudio.com/vscode) for the first time. Steps 1–3 are needed only once.

#### Step 1. Create an Azure DevOps Organization and a Personal Access Token (PAT)

1. Sign in to <https://dev.azure.com> with a Microsoft account. Create an organization if you do not have one.
2. Click **User settings → Personal access tokens → New Token** at the top right.
3. Configure it as follows.
   - **Organization**: `All accessible organizations`
   - **Scopes**: `Custom defined` → **Show all scopes** → check **Marketplace → Manage**
   - **Expiration**: any period you like
4. Copy the token somewhere safe. You cannot see it again after closing this window.

#### Step 2. Verify the Publisher

The publisher of this extension is [doosik71](https://marketplace.visualstudio.com/publishers/doosik71). It already exists and is set in `publisher` in `package.json`.

To publish under a different publisher:

1. Sign in to <https://marketplace.visualstudio.com/manage> with the same account.
2. Click **Create publisher** and enter an ID and a name. The ID cannot be changed later.
3. Put that ID in `publisher` in `package.json`.

#### Step 3. Log In with vsce

```bash
npx @vscode/vsce login doosik71
# Paste the PAT from Step 1 at the prompt.
```

#### Step 4. Publish

```bash
npx @vscode/vsce publish
```

- If you already have a `.vsix`, you can upload that file with `npx @vscode/vsce publish --packagePath arxivjs-viewer-0.3.1.vsix`.
- You can also upload on the web. At <https://marketplace.visualstudio.com/manage>, choose the publisher and upload the `.vsix` via **New extension → Visual Studio Code**.
- After publishing, the extension goes through validation and appears in Marketplace search within a few minutes. The extension ID is `doosik71.arxivjs-viewer`.

> Azure DevOps PAT policies may change. If the method above is blocked, check the official documentation, [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension). That document also describes `vsce publish --azure-credential`, which uses Microsoft Entra ID authentication.

### Updating the Version and Republishing

```bash
npx @vscode/vsce publish patch   # 0.3.1 → 0.3.2
npx @vscode/vsce publish minor   # 0.3.1 → 0.4.0
npx @vscode/vsce publish 1.0.0   # set the version explicitly
```

`publish patch|minor|major` bumps the version in `package.json`, creates a git tag, and then publishes. Update `CHANGELOG.md` before publishing.

To remove the extension from the Marketplace, run `npx @vscode/vsce unpublish doosik71.arxivjs-viewer`. This cannot be undone.

### Publishing to Open VSX (Optional)

To distribute to users of VS Code–compatible editors such as VSCodium and Cursor, publish to [Open VSX](https://open-vsx.org/).

1. Sign in to <https://open-vsx.org> with a GitHub account and accept the Eclipse Foundation Publisher Agreement.
2. Create an Access Token in your user settings.
3. Run the following commands.

```bash
npx ovsx create-namespace doosik71 -p <token>   # first time only
npx ovsx publish arxivjs-viewer-0.3.1.vsix -p <token>
```

### Development Notes

- **Do not write to a real data folder.**
  - Point to your real data folder only for browsing. Do not turn on `arxivjs.enableWrite` in a window that uses that folder.
  - When checking write support by hand, use a **copy** of the fixtures or of real data.
  - Tests, scripts, and auto-fix tools such as `markdownlint --fix` must never target that path.
  - Always test with the data under `test/fixtures/`. Write tests copy it to an OS temporary folder first (`test/unit/tempData.ts`).
- Read the data folder only through `src/data/readonlyFs.ts`, and write only through `src/data/dataWriter.ts`. ESLint reports an error if `fs` is used elsewhere or a write API is called. `dataWriter.ts` re-checks `arxivjs.enableWrite` on every call and rejects paths outside the data folder.
- Store caches and user state in `context.globalState` or `context.globalStorageUri`. Create nothing in the data folder other than the files defined in the format specification.
- Follow `DEV-PLAN.md` in the repository for design details.
