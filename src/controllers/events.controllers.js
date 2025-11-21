import moment from "moment";
import momentTZ from "moment-timezone";
import { Event } from "../models/Event.model.js";
import { redisClient } from "../services/redis.service.js";

const eventsIngestController = async (req, res) => {
    try {
        const payload = req.body;
        const tenantId = req.tenant.id;
        const tenantToken = req.tenant.token;
        const events = Array.isArray(payload) ? payload : payload.events || [];

        if (!tenantToken || !events.length) return res.status(400).json({ error: "Missing tenant creds or events" });

        const now = moment().format("YYYY-MM-DD HH:mm:ss");

        // Normalize
        const processed = events.map((ev) => {
            let captured_at = momentTZ((ev?.captured_at || "").trim()).tz("Asia/Kolkata").format('YYYY-MM-DD HH:mm:ss');
            return {
                ...ev,
                tenant_id: tenantId,
                tenant_token: tenantToken,
                captured_at: (!captured_at || captured_at === "Invalid date") ? now : captured_at,
                inserted_at: now,
            }
        });

        // 1) Persist raw events to Mongo once (bulk)
        await Event.insertMany(processed);

        // Decide whether we have Redis available
        const useRedis = !!redisClient && typeof redisClient.multi === "function";
        const today = moment().format("YYYY-MM-DD HH:mm:ss");

        // If redis is available, create pipeline; otherwise skip redis writes.
        const pipeline = useRedis ? redisClient.multi() : null;

        // collect optional backfill promises (non-blocking)
        const backfillPromises = [];

        for (const ev of processed) {
            // Only touch Redis if available
            if (useRedis) {
                const baseKey = `funnel:${tenantId}:${today}:${ev.event}`;

                // increment counts
                pipeline.incr(`${baseKey}:count`);

                // PFADD unique visitor if visitor_id exists
                if (ev.visitor_id) {
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
                const hour = moment(dateString, "YYYY-MM-DD HH:mm:ss").format("HH");
                pipeline.incr(`${baseKey}:hour:${hour}:count`);

                if (ev.visitor_id) {
                    if (typeof pipeline.pfAdd === "function") {
                        pipeline.pfAdd(`${baseKey}:hour:${hour}:uv`, ev.visitor_id);
                    } else {
                        pipeline.addCommand(["PFADD", `${baseKey}:hour:${hour}:uv`, ev.visitor_id]);
                    }
                }

                // Handle login special-case: set visitor->user mapping in redis pipeline (7 days)
                if (ev.event === "login" && ev.user_id && ev.visitor_id) {
                    try {
                        if (typeof pipeline.set === "function") {
                            pipeline.set(`visitor_to_user:${tenantId}:${ev.visitor_id}`, ev.user_id, { EX: 7 * 24 * 3600 });
                        } else {
                            pipeline.addCommand(["SET", `visitor_to_user:${tenantId}:${ev.visitor_id}`, ev.user_id, "EX", String(7 * 24 * 3600)]);
                        }
                    } catch (err) {
                        // ignore — we've already handled alternative addCommand usage above
                    }
                }
            } // end useRedis

            // Always ensure login backfill in Mongo (non-blocking), whether Redis exists or not.
            if (ev.event === "login" && ev.user_id && ev.visitor_id) {
                const backfillPromise = Event.updateMany(
                    { tenant_id: tenantId, visitor_id: ev.visitor_id, user_id: null },
                    { $set: { user_id: ev.user_id } }
                ).catch((err) => {
                    console.error("backfill updateMany error (tenant, visitor):", tenantId, ev.visitor_id, err);
                });

                backfillPromises.push(backfillPromise);
            }
        } // end for processed

        // Execute Redis pipeline if used
        if (useRedis) {
            try {
                await pipeline.exec();
            } catch (err) {
                // If Redis pipeline fails, log and continue — Mongo already has raw events.
                console.error("Redis pipeline exec error:", err);
            }
        }

        // Fire-and-forget aggregated backfills; log failures asynchronously.
        void Promise.allSettled(backfillPromises).then((results) => {
            const failures = results.filter((r) => r.status === "rejected");
            if (failures.length) console.error("some backfill updates failed:", failures.length);
        });

        return res.status(202).json({ success: true, processed: processed.length, redis: useRedis });
    } catch (err) {
        console.error("POST /api/events error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export { eventsIngestController };
