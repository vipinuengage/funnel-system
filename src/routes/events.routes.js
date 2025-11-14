// routes/events.routes.js
import { Router } from "express";
import { verifyTenantToken } from "../middlewares/verifyToken.js";
import { eventsIngestController } from "../controllers/events.controllers.js";

const router = Router();

router.post("/api/events", verifyTenantToken, eventsIngestController);

export { router as eventRouter };
