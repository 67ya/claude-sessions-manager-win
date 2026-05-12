import { Router, Request, Response } from "express";
import { getUsageSummary } from "../services/usage";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    res.json(await getUsageSummary());
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to load usage" });
  }
});

export default router;
