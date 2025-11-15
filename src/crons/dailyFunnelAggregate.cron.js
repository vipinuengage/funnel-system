import moment from "moment";
import { schedule } from "node-cron";
import { Event } from "../models/Event.model.js";
import { DailyFunnelStat } from "../models/DailyFunnelStat.model.js";

function buildHourlyArray(hourMap = {}) {
    const arr = new Array(24).fill(0).map((_, h) => ({
        hour: h,
        count: hourMap[h]?.count ?? 0,
        unique_visitors: hourMap[h]?.unique_visitors ?? 0,
    }));
    return arr;
}

async function aggregateForDate(dateStr) {
    const start = `${dateStr} 00:00:00`;
    const end = `${dateStr} 23:59:59`;

    console.info(`[funnel-agg] Starting aggregation for ${dateStr} (${start} -> ${end})`);

    const pipeline = [
        {
            $match: {
                $expr: {
                    $and: [
                        {
                            $gte: [
                                { $dateFromString: { dateString: "$captured_at", timezone: "Asia/Kolkata" } },
                                { $dateFromString: { dateString: start, timezone: "Asia/Kolkata" } }
                            ]
                        },
                        {
                            $lt: [
                                { $dateFromString: { dateString: "$captured_at", timezone: "Asia/Kolkata" } },
                                { $dateFromString: { dateString: end, timezone: "Asia/Kolkata" } }
                            ]
                        }
                    ]
                }
            }
        },

        {
            $addFields: {
                captured_date: {
                    $dateFromString: {
                        dateString: "$captured_at",
                        timezone: "Asia/Kolkata"
                    }
                }
            }
        },

        {
            $project: {
                tenant_id: 1,
                event: 1,
                hour: {
                    $hour: {
                        date: "$captured_date",
                        timezone: "Asia/Kolkata"
                    }
                },
                visitor_id: 1,
                platform: 1,
                system: 1
            }
        },

        {
            $group: {
                _id: {
                    tenant_id: "$tenant_id",
                    event: "$event",
                    hour: "$hour",
                    platform: "$platform",
                    system: "$system"
                },
                visitors: { $addToSet: "$visitor_id" },
                count: { $sum: 1 }
            }
        },

        {
            $project: {
                tenant_id: "$_id.tenant_id",
                event: "$_id.event",
                hour: "$_id.hour",
                platform: "$_id.platform",
                system: "$_id.system",
                count: 1,
                visitors: 1
            }
        }
    ];



    const cursor = Event.aggregate(pipeline)
        .allowDiskUse(true)
        .cursor({ batchSize: 10000 });

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

            const filter = { tenant_id: tenantId, date: dateStr, funnel: eventName };
            const update = {
                $set: {
                    count: s.count,
                    unique_visitors: s.visitors.size,
                    hourly: hourlyArray,
                    platforms: platformsDoc,
                    systems: systemsDoc,
                    updated_at: moment().format("YYYY-MM-DD")
                },
                $setOnInsert: {
                    created_at: moment().format("YYYY-MM-DD"),
                },
            };

            await DailyFunnelStat.updateOne(filter, update, { upsert: true });
            upserted.push({ tenant_id: tenantId, funnel: eventName });
        }
    }

    console.info(`[funnel-agg] Completed aggregation for ${dateStr}. Upserted ${upserted.length} documents.`);
    return { date: dateStr, count: upserted.length };
}


export function startDailyFunnelAggregator({ cronExpr = "0 5 * * *", enabled = true } = {}) {
    if (!enabled) {
        console.info("[funnel-agg] Aggregator disabled by configuration.");
        return;
    }

    const initialDateStr = moment().format("YYYY-MM-DD");
    console.info(`[funnel-agg] Initial run for today IST: ${initialDateStr}`);
    aggregateForDate(initialDateStr).catch(err => {
        console.error("[funnel-agg] Initial run error:", err);
    });

    schedule(cronExpr, async () => {
        try {
            const dateStr = moment().subtract(1, "days").format("YYYY-MM-DD");
            console.info(`[funnel-agg] Cron triggered. Aggregating for IST-yesterday: ${dateStr}.`);
            await aggregateForDate(dateStr);
        } catch (err) {
            console.error("[funnel-agg] Cron job error:", err);
        }
    });

    console.info(`[funnel-agg] Scheduled daily aggregator with cron="${cronExpr}"`);
}

