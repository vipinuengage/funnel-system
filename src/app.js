import cors from "cors";
import express from "express";

import config from "./configs/index.js";

import { docsRouter } from "./routes/docs.routes.js";
import { eventRouter } from "./routes/events.routes.js";
import { funnelTokenRouter } from "./routes/tokens.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { healthCheckRouter } from "./routes/health.routes.js";


const app = express();

// Middleware
app.use(cors(config.corsOptions));
app.use(express.json());
app.use("/public", express.static("public"));


// Routes
app.get("/", (req, res) => res.send("uEngage | FUNNEL 360 service is running..."));

app.use(docsRouter)
app.use(eventRouter);
app.use(funnelTokenRouter);
app.use(dashboardRouter);
app.use(healthCheckRouter)

// 
app.use(async (err, req, res, next) => {
    if (err) {
        console.log({ err })
        return res.status(500).json({ error: `Internal Server Error: ${err?.message}` });
    }
    next();
})

export { app }