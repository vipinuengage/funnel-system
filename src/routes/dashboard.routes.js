// routes/dashboard.routes.js
import { Router } from "express";
import { DailyFunnelStat } from "../models/DailyFunnelStat.model.js";
import { Event } from "../models/Event.model.js";
import { redisClient } from "../services/redis.service.js";
import { getISTDate } from "../utils/datetime.utils.js";

const router = Router();

router.get("/api/dashboard/:tenantId", async (req, res) => {
    try {
        const tenantId = req.params.tenantId;
        const dateQuery = req.query.date || getISTDate();

        const todayIST = getISTDate();
        const isToday = dateQuery === todayIST;

        const toStartEnd = (yyyyMMdd) => {
            const date = new Date(yyyyMMdd + "T00:00:00+05:30"); // create as IST
            const start = new Date(date);
            const end = new Date(date);
            end.setDate(end.getDate() + 1);
            return { start, end };
        };

        // Redis helper: tries multiple key shapes and PFCOUNT/SCARD fallbacks
        async function getEventStatsFromRedis(baseKeyPrefix) {
            // baseKeyPrefix examples:
            //  - funnel:tenantId:2025-11-20:eventName
            //  - funnel:2025-11-20:eventName
            const result = {};
            // find event names by scanning keys matching `${baseKeyPrefix}:*` where baseKeyPrefix is `funnel:${tenantId}:${date}:`
            const pattern = baseKeyPrefix.endsWith(":") ? `${baseKeyPrefix}*` : `${baseKeyPrefix}:*`;
            const keys = [];
            try {
                // try keys (simpler). If not present in client, fall back to scanIterator if available.
                if (typeof redisClient.keys === "function") {
                    const found = await redisClient.keys(pattern);
                    keys.push(...found);
                } else if (typeof redisClient.scanIterator === "function") {
                    for await (const k of redisClient.scanIterator({ MATCH: pattern })) keys.push(k);
                } else {
                    // last-resort: send raw SCAN (node-redis v4 supports sendCommand)
                    const scanCmd = ["SCAN", "0", "MATCH", pattern, "COUNT", "1000"];
                    const [cursor, found] = await redisClient.sendCommand(scanCmd);
                    if (Array.isArray(found)) keys.push(...found);
                }
            } catch (err) {
                // Redis might be down or client not supporting keys; bubble error to let caller decide fallback
                throw new Error("redis-scan-failed:" + err.message);
            }

            // find distinct event names from keys like funnel:...:EVENT:count or funnel:...:EVENT:platform:...
            const eventNamesSet = new Set();
            for (const k of keys) {
                // pattern: funnel:...:DATE:EVENT:...
                const parts = k.split(":");
                // try last parts to isolate event
                // find index of date segment (yyyy-mm-dd) in parts
                const datePartIdx = parts.findIndex((p) => /^\d{4}-\d{2}-\d{2}$/.test(p));
                if (datePartIdx >= 0 && parts.length > datePartIdx + 1) {
                    const evt = parts[datePartIdx + 1];
                    if (evt) eventNamesSet.add(evt);
                } else if (parts.length >= 2) {
                    // fallback heuristic: the 3rd segment often is event
                    eventNamesSet.add(parts[parts.length - 2] || parts[parts.length - 3]);
                }
            }

            // for each event, read count, uv (PFCOUNT or SCARD), hourly, platform and system
            for (const ev of eventNamesSet) {
                const base = baseKeyPrefix.endsWith(":") ? `${baseKeyPrefix}${ev}` : `${baseKeyPrefix}:${ev}`;
                const evObj = { count: 0, unique_visitors: 0, hourly: [], platforms: {}, systems: {} };

                // total count
                try {
                    const c = await (typeof redisClient.get === "function" ? redisClient.get(`${base}:count`) : redisClient.sendCommand(["GET", `${base}:count`]));
                    evObj.count = c ? Number(c) : 0;
                } catch (e) {
                    evObj.count = 0;
                }

                // unique visitors: try PFCOUNT then SCARD
                try {
                    if (typeof redisClient.sendCommand === "function") {
                        // try PFCOUNT
                        const pfCount = await redisClient.sendCommand(["PFCOUNT", `${base}:uv`]).catch(() => null);
                        if (pfCount !== null && pfCount !== undefined) {
                            evObj.unique_visitors = Number(pfCount) || 0;
                        } else {
                            const sc = await redisClient.sendCommand(["SCARD", `uv:${base.split(":").slice(-2).join(":")}`]).catch(() => null);
                            evObj.unique_visitors = Number(sc) || 0;
                        }
                    } else if (typeof redisClient.pfCount === "function") {
                        const pf = await redisClient.pfCount(`${base}:uv`);
                        evObj.unique_visitors = Number(pf) || 0;
                    } else {
                        evObj.unique_visitors = 0;
                    }
                } catch (e) {
                    evObj.unique_visitors = 0;
                }

                // hourly: look for keys like `${base}:hour:<h>:count`
                try {
                    const hourPattern = `${base}:hour:*:count`;
                    let hourKeys = [];
                    if (typeof redisClient.keys === "function") {
                        hourKeys = await redisClient.keys(hourPattern);
                    } else if (typeof redisClient.scanIterator === "function") {
                        for await (const k of redisClient.scanIterator({ MATCH: hourPattern })) hourKeys.push(k);
                    }
                    for (const hk of hourKeys) {
                        const m = hk.match(/:hour:(\d{1,2}):count$/);
                        if (!m) continue;
                        const hour = Number(m[1]);
                        const val = await (typeof redisClient.get === "function" ? redisClient.get(hk) : redisClient.sendCommand(["GET", hk]));
                        // try to get unique visitors for this hour too: `${base}:hour:${hour}:uv`
                        let uv = 0;
                        try {
                            const pf = await redisClient.sendCommand(["PFCOUNT", `${base}:hour:${hour}:uv`]).catch(() => null);
                            if (pf !== null && pf !== undefined) uv = Number(pf) || 0;
                            else {
                                const sc = await redisClient.sendCommand(["SCARD", `${base}:hour:${hour}:uv`]).catch(() => null);
                                uv = Number(sc) || 0;
                            }
                        } catch {
                            uv = 0;
                        }
                        evObj.hourly.push({ hour, count: Number(val || 0), unique_visitors: uv });
                    }
                } catch (e) {
                    // ignore hourly errors
                }

                // platform and system breakdowns
                try {
                    const platformPattern = `${base}:platform:*:count`;
                    let pkeys = [];
                    if (typeof redisClient.keys === "function") {
                        pkeys = await redisClient.keys(platformPattern);
                    } else if (typeof redisClient.scanIterator === "function") {
                        for await (const k of redisClient.scanIterator({ MATCH: platformPattern })) pkeys.push(k);
                    }
                    for (const pk of pkeys) {
                        const m = pk.match(/:platform:([^:]+):count$/);
                        if (!m) continue;
                        const platform = m[1];
                        const val = await (typeof redisClient.get === "function" ? redisClient.get(pk) : redisClient.sendCommand(["GET", pk]));
                        // platform unique visitors at `${base}:platform:${platform}:uv`
                        let puv = 0;
                        try {
                            const pf = await redisClient.sendCommand(["PFCOUNT", `${base}:platform:${platform}:uv`]).catch(() => null);
                            if (pf !== null && pf !== undefined) puv = Number(pf) || 0;
                            else {
                                const sc = await redisClient.sendCommand(["SCARD", `${base}:platform:${platform}:uv`]).catch(() => null);
                                puv = Number(sc) || 0;
                            }
                        } catch {
                            puv = 0;
                        }
                        evObj.platforms[platform] = { count: Number(val || 0), unique_visitors: puv };
                    }
                } catch (e) {
                    // ignore platform errors
                }

                try {
                    const systemPattern = `${base}:system:*:count`;
                    let skeys = [];
                    if (typeof redisClient.keys === "function") {
                        skeys = await redisClient.keys(systemPattern);
                    } else if (typeof redisClient.scanIterator === "function") {
                        for await (const k of redisClient.scanIterator({ MATCH: systemPattern })) skeys.push(k);
                    }
                    for (const sk of skeys) {
                        const m = sk.match(/:system:([^:]+):count$/);
                        if (!m) continue;
                        const system = m[1];
                        const val = await (typeof redisClient.get === "function" ? redisClient.get(sk) : redisClient.sendCommand(["GET", sk]));
                        let suv = 0;
                        try {
                            const pf = await redisClient.sendCommand(["PFCOUNT", `${base}:system:${system}:uv`]).catch(() => null);
                            if (pf !== null && pf !== undefined) suv = Number(pf) || 0;
                            else {
                                const sc = await redisClient.sendCommand(["SCARD", `${base}:system:${system}:uv`]).catch(() => null);
                                suv = Number(sc) || 0;
                            }
                        } catch {
                            suv = 0;
                        }
                        evObj.systems[system] = { count: Number(val || 0), unique_visitors: suv };
                    }
                } catch (e) {
                    // ignore system errors
                }

                result[ev] = evObj;
            }

            return result;
        }

        // -------------- If not today => read DailyFunnelStat --------------
        if (!isToday) {
            const { start } = toStartEnd(dateQuery);
            // DailyFunnelStat schema in your project stores date and funnel. ETL writes per-event docs. We'll query by date (and tenant if you have tenant stored).
            // If your DailyFunnelStat includes tenant_id, we filter by tenantId; if not, the query still works by date.
            const query = { date: start };
            // attempt to include tenant if stored
            query.$or = [{ tenant_id: tenantId }, { tenant_id: { $exists: false } }];

            const docs = await DailyFunnelStat.find(query).lean().exec();
            // transform to expected response shape
            const funnels = {};
            for (const d of docs) {
                funnels[d.funnel] = {
                    count: d.count || 0,
                    unique_visitors: d.unique_visitors || 0,
                    hourly: d.hourly || [],
                    platforms: d.platforms ? Object.fromEntries(Object.entries(d.platforms)) : {},
                    systems: d.systems ? Object.fromEntries(Object.entries(d.systems)) : {},
                };
            }
            return res.status(200).json({ date: dateQuery, tenant_id: tenantId, source: "daily", funnels });
        }

        // -------------- For today => try Redis, else fallback to Event aggregation --------------
        // Try Redis-derived keys. try with tenant-included pattern first, fall back to non-tenant pattern
        const dateStr = dateQuery;
        const tenantPatternPrefix = `funnel:${tenantId}:${dateStr}:`;
        const globalPatternPrefix = `funnel:${dateStr}:`;

        try {
            // attempt tenant-scoped redis
            let funnels = {};
            try {
                funnels = await getEventStatsFromRedis(tenantPatternPrefix);
                // if no funnels found, try global pattern
                if (!Object.keys(funnels).length) funnels = await getEventStatsFromRedis(globalPatternPrefix);

            } catch (redisErr) {
                // if redis scanning failed, treat as redis down and fallthrough to mongo fallback
                throw redisErr;
            }

            // if no redis data found (empty object) treat as no-redis-data and fallback to events
            if (Object.keys(funnels).length) {
                return res.status(200).json({ date: dateQuery, tenant_id: tenantId, source: "redis", funnels });
            }
        } catch (redisScanErr) {
            // log and fallthrough to Event aggregation
            console.error("Redis read failed or empty keys - falling back to Event collection:", redisScanErr.message || redisScanErr);
        }

        // -------------- Mongo fallback for today's data --------------
        const { start, end } = toStartEnd(dateQuery);

        // Aggregate similar to ETL: group by event / hour / platform / system and compute counts and unique visitors
        const match = { tenant_id: tenantId, captured_at: { $gte: start, $lt: end } };

        const agg = await Event.aggregate([
            { $match: match },
            {
                $project: {
                    event: 1,
                    hour: { $hour: "$captured_at" },
                    visitor_id: 1,
                    platform: 1,
                    system: 1,
                },
            },
            {
                $group: {
                    _id: { event: "$event", hour: "$hour", platform: "$platform", system: "$system" },
                    visitors: { $addToSet: "$visitor_id" },
                    count: { $sum: 1 },
                },
            },
        ]).allowDiskUse(true).exec();

        const dailyTotals = {};
        for (const r of agg) {
            const ev = r._id.event;
            if (!dailyTotals[ev]) {
                dailyTotals[ev] = { visitors: new Set(), count: 0, hourly: {}, platforms: {}, systems: {} };
            }
            dailyTotals[ev].count += r.count;
            (r.visitors || []).forEach((v) => dailyTotals[ev].visitors.add(v));

            // hourly
            const hr = r._id.hour != null ? r._id.hour : 0;
            if (!dailyTotals[ev].hourly[hr]) dailyTotals[ev].hourly[hr] = { visitors: new Set(), count: 0 };
            (r.visitors || []).forEach((v) => dailyTotals[ev].hourly[hr].visitors.add(v));
            dailyTotals[ev].hourly[hr].count += r.count;

            // platform
            const plat = r._id.platform || "unknown";
            if (!dailyTotals[ev].platforms[plat]) dailyTotals[ev].platforms[plat] = { visitors: new Set(), count: 0 };
            (r.visitors || []).forEach((v) => dailyTotals[ev].platforms[plat].visitors.add(v));
            dailyTotals[ev].platforms[plat].count += r.count;

            // system
            const sys = r._id.system || "unknown";
            if (!dailyTotals[ev].systems[sys]) dailyTotals[ev].systems[sys] = { visitors: new Set(), count: 0 };
            (r.visitors || []).forEach((v) => dailyTotals[ev].systems[sys].visitors.add(v));
            dailyTotals[ev].systems[sys].count += r.count;
        }

        // serialize
        const funnels = {};
        for (const [ev, stats] of Object.entries(dailyTotals)) {
            funnels[ev] = {
                count: stats.count,
                unique_visitors: stats.visitors.size,
                hourly: Object.entries(stats.hourly).map(([hour, d]) => ({ hour: Number(hour), count: d.count, unique_visitors: d.visitors.size })),
                platforms: Object.fromEntries(Object.entries(stats.platforms).map(([p, d]) => [p, { count: d.count, unique_visitors: d.visitors.size }])),
                systems: Object.fromEntries(Object.entries(stats.systems).map(([s, d]) => [s, { count: d.count, unique_visitors: d.visitors.size }])),
            };
        }

        return res.status(200).json({ date: dateQuery, tenant_id: tenantId, source: "events", funnels });
    } catch (err) {
        console.error("GET /api/dashboard error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});



export { router as dashboardRouter };
