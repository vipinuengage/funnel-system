import { FunnelToken } from "../models/FunnelToken.model.js";
import { generateSignedToken } from "../utils/token.utils.js"

const tokenIngestionController = async (req, res) => {
    if (!req.body.tenantId || !req.body.tenantName) return res.status(400).json({ error: "Tenant ID and Name are required." });

    let tt = generateSignedToken(req.body.tenantId);
    let ft = await FunnelToken.create({ tenant_id: req.body.tenantId, tenant_token: tt, tenant_name: req.body.tenantName });
    res.status(201).json({ message: "FNT Generated Successfully", data: ft })
}

export { tokenIngestionController }