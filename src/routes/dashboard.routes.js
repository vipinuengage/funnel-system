// routes/dashboard.routes.js
import { Router } from "express";
import { dashboardController } from "../controllers/dashboard.controllers.js";

const router = Router();

router.get("/api/dashboard/:tenantId", dashboardController);



export { router as dashboardRouter };
