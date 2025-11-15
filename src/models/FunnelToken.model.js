// src/models/DailyFunnelStat.js
import moment from "moment";
import mongoose from "mongoose";

const FunnelTokenSchema = new mongoose.Schema({
    tenant_id: { type: String, required: true, unique: true },
    tenant_token: { type: String, required: true, index: true, unique: true },
    tenant_name: { type: String, required: true, unique: true },
    created_at: { type: String, default: moment().format("YYYY-MM-DD HH:mm:ss") },
    updated_at: { type: String, default: moment().format("YYYY-MM-DD HH:mm:ss") },
});

FunnelTokenSchema.index({ tenant_id: 1, created_at: 1, funnel: 1 }, { unique: true });

const FunnelToken = mongoose.model("FunnelToken", FunnelTokenSchema);

export { FunnelToken };
