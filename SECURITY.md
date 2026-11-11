# Security hardening notes

## Required first-run setup

1. Copy `.env.example` to `.env`.
2. Generate a unique admin token (at least 32 characters):
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
3. Put the generated value in `.env` as `AI_ADMIN_TOKEN=...`.
4. Restart the backend. The Provider Manager and Usage Dashboard ask for this token on first use and retain it only for the current browser session.
5. Put provider credentials in the Provider Manager API-key field or directly in `.env`. The backend writes credentials to `.env`; `providers.json` never stores raw keys.

## Security changes

- `/api/admin/*` and `/api/test-all-models` require `X-Admin-Token`.
- Admin token comparison uses constant-time comparison.
- Provider endpoints must use HTTPS and cannot target localhost or common private/link-local IP ranges.
- Provider registry writes strip any `apiKey` property as a final safeguard.
- `.env`, usage logs, backups, and ZIP archives are excluded by `.gitignore`.
- The backend default bind remains `127.0.0.1`.

## Credential incident

The currently reviewed `Backup-6` provider registry contains provider definitions but no raw API keys. Keep all real credentials in `.env` or the Provider Manager. If any earlier backup shared outside your machine contained real keys, rotate those keys at their provider dashboards.

Do not expose the backend on a LAN or public network without adding a proper user authentication/session system, HTTPS termination, and deployment-specific access controls.


## Docker Sandbox (development preview)

- Sandbox routes are limited to loopback clients and are rate-limited.
- Each project gets a dedicated Docker container and named volume; no host project directory or Docker socket is mounted.
- Containers run non-root, with all Linux capabilities dropped, `no-new-privileges`, a read-only root filesystem, a 512 MB default memory limit, 1 CPU, and a 128-process limit.
- Project files are capped at 20 MB total / 5 MB per file. `.env*`, `.git`, `node_modules`, `.next`, SSH keys, and credential files are excluded from upload; `dist` and `build` are retained when they are part of an imported project.
- Containers use a dedicated Docker `--internal` network by default, so project code has no outbound internet access while running. During dependency installation only, the container is temporarily connected to a dedicated, per-session egress bridge network and disconnected afterward. Package lifecycle scripts are disabled by default; enabling the UI's “اسکریپت نصب” option runs them inside the container while that temporary network is active. Do not enable this for untrusted dependencies. Published preview ports are allocated dynamically and bound to `127.0.0.1` only; the backend checks readiness before loading the preview iframe. A strict egress policy is still required before multi-user/public deployment.
- Sandbox containers, volumes, and networks are removed when the backend next starts; inactive sessions also expire after two hours, and users can delete a session from the UI.
- This is a local development runtime, not a security boundary for hostile multi-tenant workloads.


## Design references

- [Piston](https://github.com/engineer-man/piston): reference for disabling outbound networking by default and applying process, memory, and execution limits to code execution.
- [OpenHands Sandbox Server](https://github.com/OpenHands/sandbox-server): reference for separating the sandbox control plane from the project workspace and managing Docker-backed sessions.
- [Docker networking](https://docs.docker.com/engine/network/): the project uses an internal network for runtime and a temporary bridge attachment only during dependency installation.
