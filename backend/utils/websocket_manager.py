from fastapi import WebSocket
from typing import Dict, List, Any
import json
import asyncio
import traceback

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        """Connect a client WebSocket with a client ID"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"WebSocket client connected: {client_id}")

    def disconnect(self, client_id: str):
        """Disconnect a client"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            print(f"WebSocket client disconnected: {client_id}")

    async def send_personal_message(self, message: str, client_id: str):
        """Send a text message to a specific client"""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_text(message)
            except Exception as e:
                print(f"Error sending message to client {client_id}: {e}")
                print(traceback.format_exc())
                self.disconnect(client_id)

    async def send_personal_json(self, message: dict, client_id: str):
        """Send a JSON message to a specific client"""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
                print(f"Sent message to client {client_id}: {message.get('type', 'unknown')} - {message.get('message', '')[:50]}...")
            except Exception as e:
                print(f"Error sending JSON message to client {client_id}: {e}")
                print(traceback.format_exc())
                # Don't disconnect here, as it might be a temporary network issue
                # The client will try to reconnect if needed

    async def send_status_update(self, client_id: str, status: str, message: str):
        """Send a status update message to a specific client"""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_json({
                "type": "status",
                "status": status,
                "message": message,
                "timestamp": "__TIMESTAMP__"  # Will be replaced with actual timestamp by the client
            })

    async def send_network_update(self, client_id: str, network_data: dict):
        """Send network performance data to a specific client"""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_json({
                "type": "network",
                "data": network_data,
                "timestamp": "__TIMESTAMP__"  # Will be replaced by client
            })

    async def broadcast(self, message: str):
        """Broadcast a message to all connected clients"""
        for client_id, connection in self.active_connections.items():
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"Error broadcasting to client {client_id}: {e}")
                # Don't disconnect here to avoid modifying the dictionary during iteration

    async def broadcast_json(self, data: Any):
        """Send a JSON message to all connected clients"""
        for websocket in self.active_connections.values():
            await websocket.send_json(data)
