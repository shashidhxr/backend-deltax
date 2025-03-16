import { WebSocketServer } from 'ws';

let wss = null

export function initWS(server) {
    wss = new WebSocketServer({ server });
    
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

export default function getWSS(){
    return wss
}
