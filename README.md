# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.


## Docker Sandbox (local development)

The project workspace includes an optional Docker-based runtime for previewing HTML projects and React/Vite projects. Start Docker Desktop and the backend, then use the **اجرا** button in the Preview panel. The default runtime image is `node:22-alpine`.

Sandbox API:

- `GET /api/sandbox/status`
- `POST /api/sandbox/sessions` — create an isolated workspace from project files
- `POST /api/sandbox/sessions/:id/sync` — sync editor files
- `POST /api/sandbox/sessions/:id/install` — temporarily enable network access to install npm dependencies
- `POST /api/sandbox/sessions/:id/exec` — run a terminal command
- `POST /api/sandbox/sessions/:id/start` — start the preview server
- `GET /api/sandbox/sessions/:id/ready`
- `GET /api/sandbox/sessions/:id/logs`
- `POST /api/sandbox/sessions/:id/stop`
- `DELETE /api/sandbox/sessions/:id`

Configure limits with `AI_SANDBOX_MEMORY_MB`, `AI_SANDBOX_CPUS`, and `AI_SANDBOX_MAX_SESSIONS`. See `SECURITY.md` before running code you do not trust.
