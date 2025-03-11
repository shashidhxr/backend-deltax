import { WebSocketServer } from 'ws';
import pool from './db.js';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => {
        try {
            const { type, apiId } = JSON.parse(message);

            if (type === 'subscribe' && apiId) {
                console.log(`Subscribed to updates for API ID: ${apiId}`);
                
                // Fetch initial API config and send
                const result = await pool.query(
                    `SELECT * FROM apis WHERE id = $1`,
                    [apiId]
                );
                if (result.rows.length > 0) {
                    ws.send(JSON.stringify({ type: 'config_update', config: result.rows[0] }));
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

export default wss;
