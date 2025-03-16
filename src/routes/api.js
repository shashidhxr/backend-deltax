import express from "express";
import jwt from "jsonwebtoken";
import pool from "../../config/db.js";
import getWSS from "../../config/ws.js"
import WebSocket from "ws";

const apiRouter = express.Router();

// import { getWebSocketServer } from '../../config/websocket.js';

const authenticateToken = (req, res, next) => {
    const token = req.cookies.authToken;
    // console.log(token)

    if (!token) {
        return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Invalid token" });
        }
        req.user = user;
    });
        
    next();
};  

const initApiTables = async () => {
    try {
        // Main API table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS apis (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                name VARCHAR(255) NOT NULL,
                exposed_url VARCHAR(255) NOT NULL,
                target_url VARCHAR(255) NOT NULL,
                method VARCHAR(20) NOT NULL,
                authentication_type VARCHAR(50),
                rate_limit INTEGER,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                load_balancing_enabled BOOLEAN DEFAULT false,
                load_balancing_algorithm VARCHAR(50),
                security_cors BOOLEAN DEFAULT false,
                security_ssl BOOLEAN DEFAULT false,
                security_ip_whitelist TEXT
            );
        `);

        // Load balancing targets table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS api_load_balancing_targets (
                id SERIAL PRIMARY KEY,
                api_id INTEGER REFERENCES apis(id) ON DELETE CASCADE,
                target_url VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // API metrics table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS api_metrics (
                id SERIAL PRIMARY KEY,
                api_id INTEGER REFERENCES apis(id) ON DELETE CASCADE,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                requests INTEGER DEFAULT 0,
                successful_requests INTEGER DEFAULT 0,
                failed_requests INTEGER DEFAULT 0,
                avg_response_time FLOAT,
                source_ip VARCHAR(45),
                error_code INTEGER,
                error_message TEXT
            );
        `);

        console.log("API tables initialized successfully");
    } catch (error) {
        console.error("Error initializing API tables:", error);
    }
};

initApiTables();

// apiRouter.get("/clear", async (req, res) => {
//     try {
//         const result = await pool.query("DROP TABLE IF EXISTS apis CASCADE;");

//         res.status(200).json({
//             message: "Database apis dropped succesfully",
//             users: result.rows
//         });
//     } catch (error) {
//         console.error("Error fetching users:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// })

// Create new API endpoint
apiRouter.post("/", authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            name,
            exposedUrl,
            targetUrl,
            method,
            authType,
            rateLimit,
            loadBalancing = {
                enabled: false,
                algorithm: "",
                targets: [],
            },
            security = {
                cors: false,
                ssl: false,
                ipWhitelist: "",
            }
        } = req.body;

        // Insert main API record
        const apiResult = await client.query(
            `INSERT INTO apis 
            (user_id, name, exposed_url, target_url, method, authentication_type, 
             rate_limit, load_balancing_enabled, load_balancing_algorithm,
             security_cors, security_ssl, security_ip_whitelist)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                req.user.userId,
                name,
                exposedUrl,
                targetUrl,
                method,
                authType,
                rateLimit,
                loadBalancing.enabled? loadBalancing.algorithm: null,
                loadBalancing.algorithm,
                security.cors,
                security.ssl,
                security.ipWhitelist
            ]
        );

        const api = apiResult.rows[0];

        // Insert load balancing targets if enabled
        if (loadBalancing.enabled && loadBalancing.targets.length > 0) {
            for (const target of loadBalancing.targets) {
                await client.query(
                    `INSERT INTO api_load_balancing_targets (api_id, target_url)
                     VALUES ($1, $2)`,
                    [api.id, target]
                );
            }
        }

        await client.query('COMMIT');

        // wss.clients.forEach(client => {
        //     if (client.readyState === client.OPEN) {
        //         client.send(JSON.stringify({ type: 'config_update', config: api }));
        //     }
        // });


        const wss = getWSS()
        if(!wss) {
            console.error("WSS not found")
        }
        
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'config_update',
                    operation: 'create',
                    apiId: api.id
                }));
            }
        });
        
        res.status(201).json({
            message: "API created successfully",
            api
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error creating API:", error);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        client.release();
    }
});

// Get all APIs for a user with basic stats
apiRouter.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                a.*,
                COUNT(DISTINCT m.id) as total_requests,
                ROUND(AVG(m.avg_response_time)::numeric, 2) as avg_response_time,
                ROUND((SUM(m.successful_requests)::float / NULLIF(SUM(m.requests), 0) * 100)::numeric, 2) as success_rate,
                ROUND((SUM(m.failed_requests)::float / NULLIF(SUM(m.requests), 0) * 100)::numeric, 2) as error_rate
            FROM apis a
            LEFT JOIN api_metrics m ON a.id = m.api_id
            WHERE a.user_id = $1
            GROUP BY a.id
            ORDER BY a.created_at DESC
        `, [req.user.userId]);

        res.json({
            apis: result.rows
        });
    } catch (error) {
        console.error("Error fetching APIs:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get specific API with detailed analytics
apiRouter.get("/:id", authenticateToken, async (req, res) => {
    try {
        // Get API details including load balancing targets
        const apiResult = await pool.query(`
            SELECT a.*, 
                json_agg(DISTINCT t.target_url) as load_balancing_targets
            FROM apis a
            LEFT JOIN api_load_balancing_targets t ON a.id = t.api_id
            WHERE a.id = $1 AND a.user_id = $2
            GROUP BY a.id
        `, [req.params.id, req.user.userId]);

        if (apiResult.rows.length === 0) {
            return res.status(404).json({ error: "API not found" });
        }

        const api = apiResult.rows[0];

        // Get API stats
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_requests,
                ROUND(AVG(avg_response_time)::numeric, 2) as avg_response_time,
                ROUND((SUM(successful_requests)::float / NULLIF(SUM(requests), 0) * 100)::numeric, 2) as success_rate,
                ROUND((SUM(failed_requests)::float / NULLIF(SUM(requests), 0) * 100)::numeric, 2) as error_rate
            FROM api_metrics
            WHERE api_id = $1
        `, [req.params.id]);

        // Combine and return the data
        res.json({
            api: {
                ...api,
                stats: statsResult.rows[0]
            }
        });
    } catch (error) {
        console.error("Error fetching API:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get API analytics
apiRouter.get("/:id/analytics", authenticateToken, async (req, res) => {
    const { timeRange } = req.query;
    const timeFilter = timeRange === '24h' ? 'INTERVAL \'1 day\'' :
                      timeRange === '7d' ? 'INTERVAL \'7 days\'' :
                      'INTERVAL \'30 days\'';

    try {
        // Get traffic data
        const trafficResult = await pool.query(`
            SELECT  
                date_trunc('hour', timestamp) as timestamp,
                SUM(requests) as requests
            FROM api_metrics
            WHERE api_id = $1 
            AND timestamp > NOW() - ${timeFilter}
            GROUP BY date_trunc('hour', timestamp)
            ORDER BY timestamp
        `, [req.params.id]);

        // Get top sources
        const sourcesResult = await pool.query(`
            SELECT 
                source_ip as name,
                COUNT(*) as requests
            FROM api_metrics
            WHERE api_id = $1
            AND timestamp > NOW() - ${timeFilter}
            GROUP BY source_ip
            ORDER BY requests DESC
            LIMIT 5
        `, [req.params.id]);

        // Get recent errors
        const errorsResult = await pool.query(`
            SELECT 
                error_code as code,
                error_message as message,
                timestamp
            FROM api_metrics
            WHERE api_id = $1 
            AND error_code IS NOT NULL
            AND timestamp > NOW() - ${timeFilter}
            ORDER BY timestamp DESC
            LIMIT 5
        `, [req.params.id]);

        res.json({
            traffic: trafficResult.rows,
            sources: sourcesResult.rows,
            errors: errorsResult.rows
        });
    } catch (error) {
        console.error("Error fetching API analytics:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Update API
apiRouter.put("/:id", authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            name,
            exposedUrl,
            targetUrl,
            method,
            authType,
            rateLimit,
            loadBalancing,
            security,
            status
        } = req.body;

        // Update main API record
        const apiResult = await client.query(
            `UPDATE apis 
             SET name = $1, exposed_url = $2, target_url = $3, method = $4,
                 authentication_type = $5, rate_limit = $6, 
                 load_balancing_enabled = $7, load_balancing_algorithm = $8,
                 security_cors = $9, security_ssl = $10, 
                 security_ip_whitelist = $11, status = $12,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $13 AND user_id = $14
             RETURNING *`,
            [
                name,
                exposedUrl,
                targetUrl,
                method,
                authType,
                rateLimit,
                loadBalancing.enabled,
                loadBalancing.algorithm,
                security.cors,
                security.ssl,
                security.ipWhitelist,
                status,
                req.params.id,
                req.user.userId
            ]
        );

        if (apiResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "API not found" });
        }

        // Update load balancing targets
        if (loadBalancing.enabled) {
            // Delete existing targets
            await client.query(
                'DELETE FROM api_load_balancing_targets WHERE api_id = $1',
                [req.params.id]
            );

            // Insert new targets
            for (const target of loadBalancing.targets) {
                await client.query(
                    `INSERT INTO api_load_balancing_targets (api_id, target_url)
                     VALUES ($1, $2)`,
                    [req.params.id, target]
                );
            }
        }

        await client.query('COMMIT');

        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'config_update',
                    operation: 'update',
                    apiId: req.params.id
                }));
            }
        });

        res.json({
            message: "API updated successfully",
            api: apiResult.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error updating API:", error);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        client.release();
    }
});

apiRouter.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            "DELETE FROM apis WHERE id = $1 AND user_id = $2 RETURNING id",
            [req.params.id, req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "API not found" });
        }

        // Notify connected clients
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'config_update',
                    operation: 'delete',
                    apiId: req.params.id
                }));
            }
        });

        res.json({ message: "API deleted successfully" });
    } catch (error) {
        console.error("Error deleting API:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default apiRouter;