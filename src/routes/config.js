import express from 'express'
import pool from '../../config/db.js';


const configRouter = express.Router()

// Get all active APIs for gateway configuration
configRouter.get("/gateway/config", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, user_id, exposed_url, target_url, method, authentication_type,
                rate_limit, load_balancing_enabled, load_balancing_algorithm,
                security_cors, security_ssl, security_ip_whitelist, status
            FROM apis
            WHERE status = 'active'
            ORDER BY id ASC
        `);

        // For APIs with load balancing enabled, fetch their targets
        const apis = result.rows;
        for (const api of apis) {
            if (api.load_balancing_enabled) {
                const targetsResult = await pool.query(
                    `SELECT target_url FROM api_load_balancing_targets WHERE api_id = $1`,
                    [api.id]
                );
                api.load_balancing_targets = targetsResult.rows.map(row => row.target_url);
            }
        }

        res.json({
            apis: apis
        });
    } catch (error) {
        console.error("Error fetching gateway config:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default configRouter