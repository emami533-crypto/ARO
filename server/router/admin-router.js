// server/router/admin-router.js
import express from "express";
import { readRouterConfig, writeRouterConfig, validateRouterConfigPatch } from "./config.js";
import { VALID_STRATEGIES } from "./strategies.js";

export function createRouterAdminRouter() {
  const router = express.Router();

  router.get("/config", async (_req, res) => {
    try {
      const config = await readRouterConfig();
      res.json({ success: true, config, strategies: VALID_STRATEGIES });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put("/config", async (req, res) => {
    const { errors, data } = validateRouterConfigPatch(req.body || {});
    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }
    try {
      const current = await readRouterConfig();
      const merged = {
        ...current,
        ...data,
        weights: { ...current.weights, ...(data.weights || {}) },
      };
      const saved = await writeRouterConfig(merged);
      res.json({ success: true, config: saved, strategies: VALID_STRATEGIES });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}