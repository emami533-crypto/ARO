import { Router } from "express";
import {
  createSandboxSession,
  deleteSandboxSession,
  executeSandboxCommand,
  getSandboxLogs,
  getSandboxPreviewStatus,
  getSandboxStatus,
  installSandboxDependencies,
  startSandboxPreview,
  stopSandboxPreview,
  syncSandboxFiles,
  resetSandbox, 
  buildSandboxProject,
} from "./manager.js";

export function createSandboxRouter() {
  const router = Router();
  router.use((req, res, next) => {
    const address = String(req.socket?.remoteAddress || req.ip || "").toLowerCase();
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) {
      return res.status(403).json({ success: false, error: "Sandbox فقط از همین سیستم قابل دسترسی است." });
    }
    next();
  });
  const wrap = (handler) => async (req, res) => {
    try { res.json({ success: true, ...(await handler(req)) }); }
    catch (error) { res.status(400).json({ success: false, error: error.message || "Sandbox operation failed" }); }
  };

  router.get("/status", wrap(async () => ({ sandbox: await getSandboxStatus() })));
  router.post("/sessions", wrap(async (req) => createSandboxSession(req.body || {})));
  router.post("/sessions/:id/sync", wrap(async (req) => syncSandboxFiles(req.params.id, req.body?.files)));
  router.post("/sessions/:id/install", wrap(async (req) => installSandboxDependencies(req.params.id, req.body?.allowScripts === true)));
  router.post("/sessions/:id/exec", wrap(async (req) => executeSandboxCommand(req.params.id, req.body?.command, req.body?.timeoutMs)));
  router.post("/sessions/:id/start", wrap(async (req) => startSandboxPreview(req.params.id, req.body?.command)));
  router.post("/sessions/:id/stop", wrap(async (req) => stopSandboxPreview(req.params.id)));
  router.get("/sessions/:id/logs", wrap(async (req) => getSandboxLogs(req.params.id)));
  router.get("/sessions/:id/ready", wrap(async (req) => getSandboxPreviewStatus(req.params.id)));
  router.delete("/sessions/:id", wrap(async (req) => deleteSandboxSession(req.params.id)));
  router.post("/reset", wrap(async () => resetSandbox()));

  router.post("/sessions/:id/build", async (req, res) => {
    try {
      const result = await buildSandboxProject(req.params.id);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
      res.send(Buffer.from(result.zipBuffer));
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;

}
