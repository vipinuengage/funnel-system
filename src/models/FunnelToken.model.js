// src/models/DailyFunnelStat.js
import mongoose from "mongoose";

import { getISTTimestamp } from "../utils/datetime.utils.js";

const FunnelTokenSchema = new mongoose.Schema({
    tenant_id: { type: String, required: true, unique: true },
    tenant_token: { type: String, required: true, index: true, unique: true },
    tenant_name: { type: String, required: true, unique: true },
    created_at: { type: Date, default: () => getISTTimestamp() },
    updated_at: { type: Date, default: () => getISTTimestamp() },
});

FunnelTokenSchema.index({ tenant_id: 1, created_at: 1, funnel: 1 }, { unique: true });

const FunnelToken = mongoose.model("FunnelToken", FunnelTokenSchema);

export { FunnelToken };
