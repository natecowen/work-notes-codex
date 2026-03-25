# Setup And Run Modes

This project supports three ways to run the CLI. Mode A is the recommended default.

## Run Modes
1. Mode A: project-local commands through `npm run dev -- ...`
2. Mode B: global `worklog` command available in your terminal
3. Mode C: Docker development container

## Mode A: Project-Local
Use this mode when you want the simplest setup with no PATH changes.

- Run commands through `npm run dev -- <command>`
- Examples:
  - `npm run dev -- validate`
  - `npm run dev -- generate dailies --friday 2026-02-20`

## Mode B: Global `worklog` Command
Build and link once from the repo root:

```bash
npm run build
npm link
worklog --help
```

If `worklog` is not found after `npm link`, add npm's global executable location to `PATH`.

### macOS (zsh)
1. Find the npm global prefix:
   - `npm config get prefix`
2. Add the prefix `bin` folder to `~/.zshrc`:
   - `export PATH="$PATH:$(npm config get prefix)/bin"`
3. Reload your shell:
   - `source ~/.zshrc`
4. Verify:
   - `worklog --help`

### Windows (PowerShell)
1. Find the npm global prefix:
   - `npm config get prefix`
2. The returned path should contain `worklog.cmd` after `npm link`.
3. Add that folder to your user `PATH` if needed:
   - `$prefix = npm config get prefix`
   - `[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$prefix", "User")`
4. Open a new terminal and verify:
   - `worklog --help`

## Mode C: Docker Development Container
Use this mode when you want a consistent environment or do not want Node/npm installed on the host.

Included files:

- `Dockerfile.dev`
- `compose.yaml`
- `.devcontainer/devcontainer.json`

Start the container:

```bash
docker compose up -d --build
```

Run commands inside the container:

```bash
docker compose exec worklog npm run dev -- validate
docker compose exec worklog npm run dev -- generate dailies --friday 2026-02-20
docker compose exec worklog npm run dev -- generate weekly --friday 2026-02-20
```

Run one-off commands without attaching to the long-lived container:

```bash
docker compose run --rm worklog npm run dev -- validate
```

Stop the container:

```bash
docker compose down
```

Ollama note:

- `compose.yaml` sets `WORKLOG_OLLAMA_ENDPOINT=http://host.docker.internal:11434/api/generate` so the container can talk to an Ollama instance running on the host.
- If your Ollama endpoint differs, update the environment value in `compose.yaml`.

## Development Setup
1. Install Node 20+.
2. Install and run Ollama locally.
3. Pull your preferred model, for example `ollama pull llama3.1:8b`.
4. Install dependencies:

```bash
npm install
```

5. Validate config and notes:

```bash
npm run dev -- validate
```

This parses daily files and writes `cache/index.json`.

6. Rebuild the index only:

```bash
npm run dev -- index
```

7. Build the voice profile from sample summaries:

```bash
npm run dev -- voice profile
```

8. Generate daily files:

```bash
npm run dev -- generate daily --date 2026-02-18
npm run dev -- generate dailies --friday 2026-02-20
```

9. Generate a weekly draft:

```bash
npm run dev -- generate weekly --friday 2026-02-20
```

10. Export a weekly prompt package for another LLM:

```bash
npm run dev -- generate weekly --friday 2026-02-20 --export-prompt
```

11. Generate a monthly draft:

```bash
npm run dev -- generate monthly --month 2026-02
```

12. Export a monthly prompt package:

```bash
npm run dev -- generate monthly --month 2026-02 --export-prompt
```

13. Generate attendance reports:

```bash
npm run dev -- report attendance --week 2026-02-20
npm run dev -- report attendance --month 2026-02
npm run dev -- report attendance --from 2026-02-01 --to 2026-02-20
```

14. Approve drafts:

```bash
npm run dev -- approve weekly --friday 2026-02-20
npm run dev -- approve monthly --month 2026-02
```

If you are using Docker mode instead of a local Node install, replace `npm run dev -- ...` with `docker compose exec worklog npm run dev -- ...`.
