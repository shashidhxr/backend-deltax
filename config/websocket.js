import { WebSocketServer } from 'ws';

let wss;

export function setupWebSocket(server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        console.log('Gateway connected to WebSocket');
        ws.send(JSON.stringify({ type: 'connection_success' }));

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        ws.on('close', () => {
            console.log('Gateway disconnected from WebSocket');
        });
    });

    return wss;
}

export default wss;
