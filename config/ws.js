import { WebSocketServer } from 'ws';

export default function initWS(server) {
    const wss = new WebSocketServer({ server });
    
    wss.on('connection', (ws) => {
        console.log('Gateway connected to WebSocket');
        
        // Send initial connection message
        ws.send(JSON.stringify({ type: 'connection_success' }));
        
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
        
        ws.on('close', () => {
            console.log('Gateway disconnected from WebSocket');
        });
    });
    
}
