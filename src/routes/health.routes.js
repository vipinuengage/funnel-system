import { Router } from "express";

import { healthController } from "../controllers/health.controllers.js";

const router = Router();

router.get("/api/health", healthController);

export { router as healthCheckRouter };