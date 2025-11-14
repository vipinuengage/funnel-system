import crypto from "crypto";
import config from "../configs/index.js";

const SECRET = config.fntSecret;

function generateSignedToken(tenantId) {
    const timestamp = Date.now();
    const data = `${tenantId}:${timestamp}`;
    const signature = crypto
        .createHmac("sha256", SECRET)
        .update(data)
        .digest("hex")
        .slice(0, 16);
    return `FNT-${tenantId}-${timestamp}-${signature}`;
}

function verifySignedToken(token) {
    try {
        // Expect format: FN-<businessId>-<timestamp>-<signature>
        const parts = token.split("-");
        if (parts.length !== 4 || parts[0] !== "FNT") return { valid: false, reason: "Invalid format" };

        const [_, businessId, timestamp, signature] = parts;

        // Recompute signature
        const data = `${businessId}:${timestamp}`;
        const expectedSignature = crypto
            .createHmac("sha256", SECRET)
            .update(data)
            .digest("hex")
            .slice(0, 16);

        // Compare
        const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
        if (!valid) return { valid: false, reason: "Invalid signature" };

        // Optional: Check expiry (e.g., valid for 1 year)
        const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;
        if (Date.now() - parseInt(timestamp) > ONE_YEAR)
            return { valid: false, reason: "Token expired" };

        return { valid: true, businessId };
    } catch (err) {
        return { valid: false, reason: "Verification error" };
    }
}

export { generateSignedToken, verifySignedToken }
