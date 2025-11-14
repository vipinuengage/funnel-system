// src/models/DailyFunnelStat.js
import mongoose from "mongoose";

import { getISTTimestamp } from "../utils/datetime.utils.js";

const DailyFunnelSchema = new mongoose.Schema({
    tenant_id: { type: String, required: true },
    date: { type: Date, required: true },
    funnel: { type: String, required: true },
    count: { type: Number, default: 0 }, // total daily events
    unique_visitors: { type: Number, default: 0 }, // total daily unique visitors
    hourly: [
        new mongoose.Schema(
            {
                hour: { type: Number, min: 0, max: 23 },
                count: { type: Number, default: 0 },
                unique_visitors: { type: Number, default: 0 },
            },
            { _id: false }
        ),
    ],
    platforms: {
        type: Map,
        of: new mongoose.Schema(
            {
                count: { type: Number, default: 0 },
                unique_visitors: { type: Number, default: 0 },
            },
            { _id: false }
        ),
        default: {},
    },
    systems: {
        type: Map,
        of: new mongoose.Schema(
            {
                count: { type: Number, default: 0 },
                unique_visitors: { type: Number, default: 0 },
            },
            { _id: false }
        ),
        default: {},
    },
    created_at: { type: Date, default: () => getISTTimestamp() },
    updated_at: { type: Date, default: () => getISTTimestamp() },
});

DailyFunnelSchema.index({ tenant_id: 1, date: 1, funnel: 1 }, { unique: true });

const DailyFunnelStat = mongoose.model("DailyFunnelStat", DailyFunnelSchema);
export { DailyFunnelStat };
