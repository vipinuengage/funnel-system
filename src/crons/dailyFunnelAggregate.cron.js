// src/jobs/dailyFunnelAggregate.cron.js
import { schedule } from "node-cron";
import { Event } from "../models/Event.model.js";
import { DailyFunnelStat } from "../models/DailyFunnelStat.model.js";
import { getISTDate, getISTTimestamp } from "../utils/datetime.utils.js";

/**
 * Build start/end Date objects for a single day (start inclusive, end exclusive)
 */
const dayRangeFromDateString = (dateStr) => { return { start: new Date(`${dateStr} 00:00:00`), end: new Date(`${dateStr} 23:59:59`) } };

/**
 * Ensure hourly array has 24 entries (0..23) in required format
 */
function buildHourlyArray(hourMap = {}) {
    const arr = new Array(24).fill(0).map((_, h) => ({
        hour: h,
        count: hourMap[h]?.count ?? 0,
        unique_visitors: hourMap[h]?.unique_visitors ?? 0,
    }));
    return arr;
}

/**
 * Main aggregator for a date string (YYYY-MM-DD)
 * Aggregates per tenant_id + event + hour + platform + system
 *
 * Produces intermediate buckets that we fold into final per-tenant/per-event stats.
 */
async function aggregateForDate(dateStr) {
    const { start, end } = dayRangeFromDateString(dateStr);
    console.info(`[funnel-agg] Starting aggregation for ${dateStr} (${start} -> ${end})`);

    // Aggregate grouped by tenant / event / hour / platform / system
    const pipeline = [
        { $match: { captured_at: { $gte: start, $lte: end } } },
        {
            $project: {
                tenant_id: 1,
                event: 1,
                hour: { $hour: "$captured_at" },
                visitor_id: 1,
                platform: 1,
                system: 1,
            },
        },
        {
            $group: {
                _id: {
                    tenant_id: "$tenant_id",
                    event: "$event",
                    hour: "$hour",
                    platform: "$platform",
                    system: "$system",
                },
                visitors: { $addToSet: "$visitor_id" },
                count: { $sum: 1 },
            },
        },
        {
            $project: {
                tenant_id: "$_id.tenant_id",
                event: "$_id.event",
                hour: "$_id.hour",
                platform: "$_id.platform",
                system: "$_id.system",
                count: 1,
                visitors: 1,
            },
        },
    ];

    // ✅ Correct version:
    const cursor = Event.aggregate(pipeline)
        .allowDiskUse(true)
        .cursor({ batchSize: 10000 });

    /**
     * Structure we will build:
     * {
     *   [tenantId]: {
     *     [eventName]: {
     *       count: number,
     *       visitors: Set,
     *       hourly: { [hour]: { count, visitors:Set } },
     *       platforms: { [platform]: { count, visitors:Set } },
     *       systems: { [system]: { count, visitors:Set } }
     *     }
     *   }
     * }
     */
    const totals = new Map();

    for await (const row of cursor) {
        const tenant = row.tenant_id || "unknown_tenant";
        const eventName = row.event || "unknown_event";
        if (!totals.has(tenant)) totals.set(tenant, new Map());
        const tenantMap = totals.get(tenant);

        if (!tenantMap.has(eventName)) {
            tenantMap.set(eventName, {
                count: 0,
                visitors: new Set(),
                hourly: {}, // hour => { count, visitors:Set }
                platforms: {}, // platform => { count, visitors:Set }
                systems: {}, // system => { count, visitors:Set }
            });
        }

        const stat = tenantMap.get(eventName);

        // total count
        stat.count += row.count;

        // visitors (dedupe across buckets)
        for (const v of row.visitors || []) {
            stat.visitors.add(v);
        }

        // hourly
        const hr = Number(row.hour ?? 0);
        if (!stat.hourly[hr]) stat.hourly[hr] = { count: 0, visitors: new Set() };
        stat.hourly[hr].count += row.count;
        for (const v of row.visitors || []) stat.hourly[hr].visitors.add(v);

        // platform
        const platform = row.platform || "unknown";
        if (!stat.platforms[platform]) stat.platforms[platform] = { count: 0, visitors: new Set() };
        stat.platforms[platform].count += row.count;
        for (const v of row.visitors || []) stat.platforms[platform].visitors.add(v);

        // system
        const system = row.system || "unknown";
        if (!stat.systems[system]) stat.systems[system] = { count: 0, visitors: new Set() };
        stat.systems[system].count += row.count;
        for (const v of row.visitors || []) stat.systems[system].visitors.add(v);
    }

    // Upsert per tenant/event into DailyFunnelStat
    const upserted = [];
    for (const [tenantId, tenantMap] of totals.entries()) {
        for (const [eventName, s] of tenantMap.entries()) {
            const hourlyObj = {};
            const hourlyMapForDoc = {}; // hour -> { count, unique_visitors }
            for (const [hour, data] of Object.entries(s.hourly)) {
                hourlyMapForDoc[Number(hour)] = { count: data.count, unique_visitors: data.visitors.size };
            }

            // build platforms map for document
            const platformsDoc = {};
            for (const [pname, pval] of Object.entries(s.platforms)) {
                platformsDoc[pname] = { count: pval.count, unique_visitors: pval.visitors.size };
            }

            const systemsDoc = {};
            for (const [sname, sval] of Object.entries(s.systems)) {
                systemsDoc[sname] = { count: sval.count, unique_visitors: sval.visitors.size };
            }

            // final hourly array filled 0..23
            const hourlyArray = buildHourlyArray(hourlyMapForDoc);

            const filter = { tenant_id: tenantId, date: getISTTimestamp(dateStr), funnel: eventName };
            const update = {
                $set: {
                    count: s.count,
                    unique_visitors: s.visitors.size,
                    hourly: hourlyArray,
                    platforms: platformsDoc,
                    systems: systemsDoc,
                    updated_at: getISTTimestamp(),
                },
                $setOnInsert: { captured_at: getISTTimestamp() },
            };

            await DailyFunnelStat.updateOne(filter, update, { upsert: true });
            upserted.push({ tenant_id: tenantId, funnel: eventName });
        }
    }

    console.info(`[funnel-agg] Completed aggregation for ${dateStr}. Upserted ${upserted.length} documents.`);
    return { date: dateStr, count: upserted.length };
}

/**
 * Bootstrapped cron schedule:
 * - By default runs daily at 05:00 server time (change cron expression if you want a different time).
 * - The job aggregates for yesterday by default; override with AGG_DATE=YYYY-MM-DD for ad-hoc runs.
 *
 * NOTE: If you want to run for today's *current* partial day (like live updates), you can pass ? but
 * recommended pattern is: aggregate previous day to produce final daily stats.
 */
export function startDailyFunnelAggregator({ cronExpr = "0 5 * * *", enabled = true } = {}) {
    if (!enabled) {
        console.info("[funnel-agg] Aggregator disabled by configuration.");
        return;
    }

    let dateStr = getISTDate();
    console.log({ dateStr })
    aggregateForDate(dateStr);

    schedule(cronExpr, async () => {
        try {
            console.info(`[funnel-agg] Cron triggered. Aggregating for ${dateStr}.`);
            await aggregateForDate(dateStr);
        } catch (err) {
            console.error("[funnel-agg] Cron job error:", err);
        }
    });

    console.info(`[funnel-agg] Scheduled daily aggregator with cron="${cronExpr}"`);
}
