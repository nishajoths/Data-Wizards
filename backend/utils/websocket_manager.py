from fastapi import WebSocket
from typing import Dict, List, Any
import json
import asyncio

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"Client #{client_id} connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            print(f"Client #{client_id} removed. Total connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, client_id: str):
        """Send a text message to a specific client"""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_text(message)

    async def send_personal_json(self, data: Any, client_id: str):
        """Send a JSON message to a specific client"""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_json(data)
    
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
        """Send a text message to all connected clients"""
        for websocket in self.active_connections.values():
            await websocket.send_text(message)
    
    async def broadcast_json(self, data: Any):
        """Send a JSON message to all connected clients"""
        for websocket in self.active_connections.values():
            await websocket.send_json(data)
