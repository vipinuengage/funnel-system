
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function buildDateExpr(dateStr) {
    const start = `${dateStr} 00:00:00`;
    const end = `${dateStr} 23:59:59`;

    return {
        $and: [
            {
                $gte: [
                    { $dateFromString: { dateString: "$captured_at", timezone: "Asia/Kolkata" } },
                    { $dateFromString: { dateString: start, timezone: "Asia/Kolkata" } }
                ]
            },
            {
                $lte: [
                    { $dateFromString: { dateString: "$captured_at", timezone: "Asia/Kolkata" } },
                    { $dateFromString: { dateString: end, timezone: "Asia/Kolkata" } }
                ]
            }
        ]
    };
}


async function archiveAndDeleteEventsForDate(dateStr) {
    console.info(`[funnel-agg] Archiving & deleting events for ${dateStr}...`);

    const archiveDir = path.join(__dirname, "..", "archives", "events");
    fs.mkdirSync(archiveDir, { recursive: true });

    const filePath = path.join(archiveDir, `events-${dateStr}-${Date.now()}.njson`); // as you asked: .njson
    const writeStream = fs.createWriteStream(filePath, { flags: "w" });

    const filter = { $expr: buildDateExpr(dateStr) };

    const cursor = Event.find(filter).cursor();

    let written = 0;
    try {
        for await (const doc of cursor) {
            const plain = doc.toObject ? doc.toObject() : doc;
            writeStream.write(JSON.stringify(plain) + "\n");
            written++;
        }

        // Finish writing
        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
            writeStream.end();
        });

        // Now delete
        const { deletedCount } = await Event.deleteMany(filter);

        console.info(
            `[funnel-agg] Archived ${written} events to ${filePath} and deleted ${deletedCount} events from DB for ${dateStr}.`
        );

        return { filePath, archived: written, deleted: deletedCount };
    } catch (err) {
        console.error("[funnel-agg] Error while archiving/deleting:", err);
        // Make sure stream is closed on error
        writeStream.destroy();
        throw err;
    }
}


async function aggregateForDate(dateStr) {
    const start = `${dateStr} 00:00:00`;
    const end = `${dateStr} 23:59:59`;

    console.info(`[funnel-agg] Starting aggregation for ${dateStr} (${start} -> ${end})`);

    const pipeline = [
        {
            $match: {
                $expr: buildDateExpr(dateStr)
            }
        },

        {
            // NOTE: both captured_date and normalized transaction id must be inside $addFields
            $addFields: {
                captured_date: {
                    $dateFromString: {
                        dateString: "$captured_at",
                        timezone: "Asia/Kolkata"
                    }
                },
                _transaction_id_str: {
                    $cond: [
                        { $ifNull: ["$metadata.transaction_id", false] },
                        { $toString: "$metadata.transaction_id" },
                        null
                    ]
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
                system: 1,
                _transaction_id_str: 1
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
                transactions: { $addToSet: "$_transaction_id_str" }, // <-- correct field name
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
                visitors: 1,
                transactions: 1
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
                transactions: new Set(),
                hourly: {}, // hour => { count, visitors:Set, transactions:Set }
                platforms: {}, // platform => { count, visitors:Set, transactions:Set }
                systems: {}, // system => { count, visitors:Set, transactions:Set }
            });
        }

        const stat = tenantMap.get(eventName);

        // total count (raw events)
        stat.count += row.count || 0;

        // visitors (dedupe across buckets)
        for (const v of row.visitors || []) {
            if (v != null) stat.visitors.add(String(v));
        }

        // transactions (dedupe across buckets) - filter nulls
        for (const t of row.transactions || []) {
            if (t != null) stat.transactions.add(String(t));
        }

        // hourly
        const hr = Number(row.hour ?? 0);
        if (!stat.hourly[hr]) stat.hourly[hr] = { count: 0, visitors: new Set(), transactions: new Set() };
        stat.hourly[hr].count += row.count || 0;
        for (const v of row.visitors || []) if (v != null) stat.hourly[hr].visitors.add(String(v));
        for (const t of row.transactions || []) if (t != null) stat.hourly[hr].transactions.add(String(t));

        // platform
        const platform = row.platform || "unknown";
        if (!stat.platforms[platform]) stat.platforms[platform] = { count: 0, visitors: new Set(), transactions: new Set() };
        stat.platforms[platform].count += row.count || 0;
        for (const v of row.visitors || []) if (v != null) stat.platforms[platform].visitors.add(String(v));
        for (const t of row.transactions || []) if (t != null) stat.platforms[platform].transactions.add(String(t));

        // system
        const system = row.system || "unknown";
        if (!stat.systems[system]) stat.systems[system] = { count: 0, visitors: new Set(), transactions: new Set() };
        stat.systems[system].count += row.count || 0;
        for (const v of row.visitors || []) if (v != null) stat.systems[system].visitors.add(String(v));
        for (const t of row.transactions || []) if (t != null) stat.systems[system].transactions.add(String(t));
    }

    // Upsert per tenant/event into DailyFunnelStat
    const upserted = [];
    for (const [tenantId, tenantMap] of totals.entries()) {
        for (const [eventName, s] of tenantMap.entries()) {
            // build hourly map and final hourly array
            const hourlyMapForDoc = {}; // hour -> { count, unique_visitors }
            for (const [hour, data] of Object.entries(s.hourly)) {
                // for conversion prefer unique transactions (if present) else visitors
                const isConversion = eventName === "conversion";
                const unique_uv = isConversion
                    ? (data.transactions.size > 0 ? data.transactions.size : data.visitors.size)
                    : data.visitors.size;

                hourlyMapForDoc[Number(hour)] = { count: data.count, unique_visitors: unique_uv };
            }

            const hourlyArray = buildHourlyArray(hourlyMapForDoc); // final 0..23 array

            // platforms
            const platformsDoc = {};
            for (const [pname, pval] of Object.entries(s.platforms)) {
                const isConversion = eventName === "conversion";
                const uv = isConversion
                    ? (pval.transactions.size > 0 ? pval.transactions.size : pval.visitors.size)
                    : pval.visitors.size;
                platformsDoc[pname] = { count: pval.count, unique_visitors: uv };
            }

            // systems
            const systemsDoc = {};
            for (const [sname, sval] of Object.entries(s.systems)) {
                const isConversion = eventName === "conversion";
                const uv = isConversion
                    ? (sval.transactions.size > 0 ? sval.transactions.size : sval.visitors.size)
                    : sval.visitors.size;
                systemsDoc[sname] = { count: sval.count, unique_visitors: uv };
            }

            // top-level unique_visitors: prefer transactions for conversion
            const topUniqueVisitors = (eventName === "conversion")
                ? (s.transactions.size > 0 ? s.transactions.size : s.visitors.size)
                : s.visitors.size;

            const filter = { tenant_id: tenantId, date: dateStr, funnel: eventName };
            const update = {
                $set: {
                    count: s.count,
                    unique_visitors: topUniqueVisitors,
                    hourly: hourlyArray,
                    platforms: platformsDoc,
                    systems: systemsDoc,
                    updated_at: moment().format("YYYY-MM-DD HH:mm:ss")
                },
                $setOnInsert: {
                    created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
                },
            };

            await DailyFunnelStat.updateOne(filter, update, { upsert: true });
            upserted.push({ tenant_id: tenantId, funnel: eventName });
        }
    }

    // 🔽 NEW: archive then delete
    const archiveInfo = await archiveAndDeleteEventsForDate(dateStr);

    return {
        date: dateStr,
        upserted: upserted.length,
        archived: archiveInfo.archived,
        deleted: archiveInfo.deleted,
        filePath: archiveInfo.filePath,
    };
}


export function startDailyFunnelAggregator({ cronExpr = "0 5 * * *", enabled = true } = {}) {
    if (!enabled) {
        console.info("[funnel-agg] Aggregator disabled by configuration.");
        return;
    }

    // const initialDateStr = moment().format("YYYY-MM-DD");
    // console.info(`[funnel-agg] Initial run for today IST: ${initialDateStr}`);
    // aggregateForDate(initialDateStr).catch(err => {
    //     console.error("[funnel-agg] Initial run error:", err);
    // });

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

