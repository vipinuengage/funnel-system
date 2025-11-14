import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
    // Use constant-arrival-rate to achieve precise total request count over duration.
    scenarios: {
        const_rate: {
            executor: "constant-arrival-rate",
            rate: 300,              // requests per timeUnit (see explanation below)
            timeUnit: "1s",          // 300 requests per second
            duration: "5m",          // 300s => 300s * 300 = 90000 total requests
            preAllocatedVUs: 1000,   // reserve these VUs up-front (concurrency cap)
            maxVUs: 2000,            // absolute upper limit of VUs
            exec: "sendBatch",
        },
    },

    thresholds: {
        http_req_duration: ["p(95)<1000"], // 95% requests < 1000ms
        "http_req_failed": ["rate<0.05"],  // < 5% errors
    },
};

// Config (overrides via env)
const TARGET = __ENV.TARGET || "http://localhost:3000/api/events";
const TENANT_TOKEN = __ENV.TENANT_TOKEN || "FNT-10-1762776363756-5eb9c52e86e92a75";
const TENANT_ID = __ENV.TENANT_ID || "10";

// Utility to generate a pseudo-random visitor id
function genVisitorId() {
    return "v_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-4);
}

// Utility to randomly pick an event name
function pickEvent() {
    const events = ["visit", "login", "menu", "add_to_cart", "checkout", "payment_init", "payment_done"];
    return events[Math.floor(Math.random() * events.length)];
}

// The function that the scenario will call repeatedly.
export function sendBatch() {
    // Each iteration sends one POST (one request). Arrival rate controls how many iterations/sec happen.
    const visitorId = genVisitorId();

    // Build a batch of 1..6 events (randomized)
    const batchSize = Math.floor(Math.random() * 6) + 1;
    const events = [];
    for (let i = 0; i < batchSize; i++) {
        const evName = pickEvent();
        const ev = {
            event: evName,
            visitor_id: visitorId,
            user_id: evName === "login" ? "user_" + Math.random().toString(36).substring(2, 8) : null,
            url: "/some/path",
            captured_at: "2025-11-14 12:10:00",
            platform: "website",
            system: ["windows", "macos", "linux", "ios", "android"][Math.floor(Math.random() * 5)],
            metadata: { sample: true, step: i },
        };
        events.push(ev);
    }

    const payload = JSON.stringify({ tenantToken: TENANT_TOKEN, events });

    const params = {
        headers: {
            "Content-Type": "application/json",
            "x-tenant-token": TENANT_TOKEN,
        },
        tags: { endpoint: "events" },
    };

    const res = http.post(TARGET, payload, params);

    check(res, {
        "status is 2xx or 202": (r) => r.status >= 200 && r.status < 300,
    });

    // Very small sleep to yield, but arrivals are controlled by k6 executor.
    sleep(Math.random() * 0.05);
}
