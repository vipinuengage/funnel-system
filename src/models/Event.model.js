// src/models/Event.js
import mongoose from "mongoose";

const EventSchema = new mongoose.Schema({
    tenant_id: { type: String, required: true },
    tenant_token: { type: String, required: true },
    visitor_id: { type: String, required: true },
    user_id: { type: String },
    event: { type: String, required: true },
    url: { type: String, required: true },
    platform: {
        type: String,
        enum: ["website", "application"],
        required: true
    },
    system: {
        type: String,
        enum: ["unknown", "windows", "macos", "ios", "android", "linux"],
        required: true
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    captured_at: { type: Date, default: new Date() },
    inserted_at: { type: Date, default: new Date() },
});

// Indexes
EventSchema.index({ tenant_id: 1, captured_at: -1 });
EventSchema.index({ tenant_id: 1, event: 1, captured_at: -1 });
EventSchema.index({ tenant_id: 1, visitor_id: 1, user_id: 1 })


const Event = mongoose.model("Event", EventSchema);
export { Event };
