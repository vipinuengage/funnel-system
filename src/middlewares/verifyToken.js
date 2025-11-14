import { verifySignedToken } from "../utils/token.utils.js";

const verifyTenantToken = async (req, res, next) => {
    const tenantToken = req.body?.tenantToken || req.headers["x-tenant-token"];
    if (!tenantToken) return res.status(400).json({ error: "Tenant Token is required." });

    let result = verifySignedToken(tenantToken);
    if (result.valid) {
        req.tenant = { id: result.businessId, token: tenantToken }
        next();
    } else {
        res.status(400).json({ error: result.reason })
    }

}

export { verifyTenantToken }