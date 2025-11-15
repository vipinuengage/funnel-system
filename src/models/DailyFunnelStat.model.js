// src/models/DailyFunnelStat.js
import moment from "moment";
import mongoose from "mongoose";

const DailyFunnelSchema = new mongoose.Schema({
    tenant_id: { type: String, required: true },
    date: { type: String, required: true, default: moment().format("YYYY-MM-DD") },
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
    created_at: { type: "String", default: moment().format("YYYY-MM-DD HH:mm:ss"), index: true },
    updated_at: { type: "String", default: moment().format("YYYY-MM-DD HH:mm:ss") },
});

DailyFunnelSchema.index({ tenant_id: 1, date: 1, funnel: 1 }, { unique: true });

const DailyFunnelStat = mongoose.model("DailyFunnelStat", DailyFunnelSchema);
export { DailyFunnelStat };
