// src/models/Event.js
import moment from "moment";
import mongoose from "mongoose";

const EventSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true },
  tenant_token: { type: String, required: true },
  visitor_id: { type: String, required: true },
  user_id: { type: String },
  event: {
    type: String,
    enum: [
      // theobroma
      "visit",
      "send_otp",
      "login_success",
      "location_selected",
      "location_popup",
      "address_selected",
      "slot_select",
      "product_viewed",
      "add_to_cart",
      "couponApplied",
      "begin_checkout",
      "remove_from_cart",
      "add_payment_info",
      "conversion",

      // blossomfood
      "payment_method",
      "add_to_cart",
      "content_viewed",
      "begin_checkout",
      "search",
      "purchase",
      "send_otp",
      "truecaller_success",
      "truecaller_failure",
      "login_success",
      "add_shipping_info",
      "add_payment_info",
      "slot_select",
      "payment_failed",
      "AddToCart",
      "InitiateCheckout",
      "Purchase",
      "AddPaymentInfo",
      "ViewContent",
    ],
    required: true,
  },
  url: { type: String },
  platform: {
    type: String,
    enum: ["website", "application"],
    required: true,
  },
  system: {
    type: String,
    enum: ["unknown", "windows", "macos", "ios", "android", "linux"],
    required: true,
  },
  metadata: { type: mongoose.Schema.Types.Mixed },
  captured_at: { type: String, default: moment().format("YYYY-MM-DD HH:mm:ss"), index: true },
  inserted_at: { type: String, default: moment().format("YYYY-MM-DD HH:mm:ss") },
});

// Indexes
EventSchema.index({ tenant_id: 1, captured_at: -1 });
EventSchema.index({ tenant_id: 1, event: 1, captured_at: -1 });

const Event = mongoose.model("Event", EventSchema);
export { Event };
