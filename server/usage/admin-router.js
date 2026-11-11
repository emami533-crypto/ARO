// server/usage/admin-router.js
import express from "express";
import { computeSummary, groupBy, recentRecords } from "./aggregator.js";

export function createUsageAdminRouter() {
  const router = express.Router();

  function parseSince(req) {
    const hoursParam = Number.parseInt(String(req.query.hours || ""), 10);
    if (Number.isFinite(hoursParam) && hoursParam > 0 && hoursParam <= 24 * 90) {
      return hoursParam * 60 * 60 * 1000;
    }
    return 24 * 60 * 60 * 1000;
  }

  router.get("/summary", async (req, res) => {
    try {
      const summary = await computeSummary(parseSince(req));
      res.json({ success: true, summary });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/by-provider", async (req, res) => {
    try {
      const providers = await groupBy("provider", parseSince(req));
      res.json({ success: true, providers });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/by-model", async (req, res) => {
    try {
      const models = await groupBy("model", parseSince(req));
      res.json({ success: true, models });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
    router.get("/by-tier", async (req, res) => {
    try {
      const tiers = await groupBy("complexityTier", parseSince(req));
      res.json({ success: true, tiers });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/recent", async (req, res) => {
    try {
      const limitParam = Number.parseInt(String(req.query.limit || ""), 10);
      const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 500 ? limitParam : 50;
      const records = await recentRecords(limit);
      res.json({ success: true, records });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}