import { Router } from "express";

import { docsController } from "../controllers/docs.controllers.js";

const router = Router();

router.get("/docs/readme", docsController);

export { router as docsRouter };
