import { Event } from "../models/Event.model.js";
import { redisClient } from "../services/redis.service.js";
import { getISTDate, getISTTimestamp } from "../utils/datetime.utils.js";

const eventsIngestController = async (req, res) => {
    try {
        const payload = req.body;
        const tenantId = req.tenant.id;
        const tenantToken = req.tenant.token;
        const events = Array.isArray(payload) ? payload : payload.events || [];

        if (!tenantToken || !events.length) return res.status(400).json({ error: "Missing tenant creds or events" });


        const now = getISTTimestamp();
        // Normalize
        const processed = events.map((ev) => ({
            ...ev,
            tenant_id: tenantId,
            tenant_token: tenantToken,
            captured_at: ev.captured_at || now,
            inserted_at: now,
        }));

        // 1) Persist raw events to Mongo once (bulk)
        await Event.insertMany(processed);

        // 2) Build Redis pipeline for counters, PFADD, hourly counters, and visitor->user SETs
        const today = getISTDate();
        const pipeline = redisClient.multi();

        // collect optional backfill promises (we will run them async, not blocking the pipeline)
        const backfillPromises = [];

        for (const ev of processed) {
            const baseKey = `funnel:${tenantId}:${today}:${ev.event}`;

            // increment counts
            pipeline.incr(`${baseKey}:count`);

            // PFADD unique visitor if visitor_id exists
            if (ev.visitor_id) {
                // Some redis clients expose pfAdd; to be portable we call raw command if needed.
                // Try pipeline.pfAdd if available, else use .addCommand / .sendCommand style.
                if (typeof pipeline.pfAdd === "function") {
                    pipeline.pfAdd(`${baseKey}:uv`, ev.visitor_id);
                } else {
                    pipeline.addCommand(["PFADD", `${baseKey}:uv`, ev.visitor_id]);
                }
            }

            // platform counters
            const platform = ev.platform || "web";
            pipeline.incr(`${baseKey}:platform:${platform}:count`);
            if (ev.visitor_id) {
                if (typeof pipeline.pfAdd === "function") {
                    pipeline.pfAdd(`${baseKey}:platform:${platform}:uv`, ev.visitor_id);
                } else {
                    pipeline.addCommand(["PFADD", `${baseKey}:platform:${platform}:uv`, ev.visitor_id]);
                }
            }

            // system counters
            const system = ev.system || "unknown";
            pipeline.incr(`${baseKey}:system:${system}:count`);
            if (ev.visitor_id) {
                if (typeof pipeline.pfAdd === "function") {
                    pipeline.pfAdd(`${baseKey}:system:${system}:uv`, ev.visitor_id);
                } else {
                    pipeline.addCommand(["PFADD", `${baseKey}:system:${system}:uv`, ev.visitor_id]);
                }
            }

            // hourly count
            const hour = new Date(ev.captured_at).getHours();
            pipeline.incr(`${baseKey}:hour:${hour}:count`);

            if (ev.visitor_id) {
                if (typeof pipeline.pfAdd === "function") {
                    pipeline.pfAdd(`${baseKey}:hour:${hour}:uv`, ev.visitor_id);
                } else {
                    pipeline.addCommand(["PFADD", `${baseKey}:hour:${hour}:uv`, ev.visitor_id]);
                }
            }

            // Handle login special-case:
            if (ev.event === "login" && ev.user_id && ev.visitor_id) {
                // 2.a Save visitor -> user mapping in Redis (fast enrichment for future events)
                // Use SET with expire (7 days). We add this as part of the same pipeline for efficiency.
                // Note: some clients allow pipeline.set; if not, use addCommand.
                try {
                    if (typeof pipeline.set === "function") {
                        pipeline.set(`visitor_to_user:${tenantId}:${ev.visitor_id}`, ev.user_id, { EX: 7 * 24 * 3600 });
                    } else {
                        pipeline.addCommand(["SET", `visitor_to_user:${tenantId}:${ev.visitor_id}`, ev.user_id, "EX", String(7 * 24 * 3600)]);
                    }
                } catch (err) {
                    // ignore pipeline.set absence — alternative addCommand handled above
                }

                // 2.b Backfill older events in Mongo: non-blocking. In production prefer to push this to a worker/queue.
                const backfillPromise = Event.updateMany(
                    { tenant_id: tenantId, visitor_id: ev.visitor_id, user_id: null },
                    { $set: { user_id: ev.user_id } }
                ).catch((err) => {
                    console.error("backfill updateMany error (tenant, visitor):", tenantId, ev.visitor_id, err);
                });

                // don't await here; collect to optionally await later or let it run in background
                backfillPromises.push(backfillPromise);
            }
        }

        // Execute pipeline atomically (multi)
        await pipeline.exec();

        // Option: await backfills with Promise.allSettled to observe failures but don't block response too long
        // I recommend NOT awaiting for large numbers; you can await small number or log and monitor.
        void Promise.allSettled(backfillPromises).then((results) => {
            const failures = results.filter((r) => r.status === "rejected");
            if (failures.length) console.error("some backfill updates failed:", failures.length);
        });

        return res.status(202).json({ success: true, processed: processed.length });
    } catch (err) {
        console.error("POST /api/events error:", err);

        // fallback: try to persist to Mongo if Redis down (best-effort)
        try {
            const eventsFallback = Array.isArray(payload) ? payload : payload.events || [];
            if (eventsFallback.length) {
                const now = getISTTimestamp();
                const docs = eventsFallback.map((ev) => ({
                    ...ev,
                    tenant_id: req.tenant.id,
                    tenant_token: req.tenant.token,
                    captured_at: ev.captured_at || now,
                    inserted_at: now,
                }));
                Event.insertMany(docs).catch((e) => console.error("fallback Event.insertMany failed:", e));
                return res.status(202).json({ accepted: true, fallback: "mongo", queued: docs.length });
            }
        } catch (fbErr) {
            console.error("fallback write error:", fbErr);
        }

        return res.status(500).json({ error: "Internal server error" });
    }
}

export { eventsIngestController }