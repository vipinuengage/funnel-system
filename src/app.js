import express from "express";

import { eventRouter } from "./routes/events.routes.js";
import { funnelTokenRouter } from "./routes/tokens.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";

const app = express();

// Middleware
// app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Routes
app.use(eventRouter);
app.use(funnelTokenRouter);
app.use(dashboardRouter);

// 
app.use(async (err, req, res, next) => {
    if (err) {
        console.log({ err })
        return res.status(500).json({ error: `Internal Server Error: ${err?.message}` });
    }
    next();
})

export { app }