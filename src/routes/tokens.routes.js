// routes/events.routes.js
import { Router } from "express";

import { tokenIngestionController } from "../controllers/tokens.controllers.js";

const router = Router();

router.post("/api/token", tokenIngestionController);

export { router as funnelTokenRouter };
