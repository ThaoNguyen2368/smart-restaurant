# websocket/manager.py — WebSocket Connection Manager
# backend.rule.md Section 6.1

import json
from typing import Any

from fastapi import WebSocket

from app.websocket.events import WSEvent


class ConnectionManager:
    """Manages WebSocket connections per channel.
    Channels: "orders:{session_id}", "staff", "kitchen", "cashier"
    """

    def __init__(self):
        self.channels: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str) -> None:
        """Accept and register a WebSocket connection to a channel."""
        await websocket.accept()
        if channel not in self.channels:
            self.channels[channel] = set()
        self.channels[channel].add(websocket)

    async def disconnect(self, websocket: WebSocket, channel: str) -> None:
        """Remove a WebSocket connection from a channel."""
        if channel in self.channels:
            self.channels[channel].discard(websocket)
            if not self.channels[channel]:
                del self.channels[channel]

    async def broadcast(self, channel: str, event: WSEvent) -> None:
        """Broadcast an event to all connections on a channel.
        IMPORTANT: Only call AFTER DB transaction commits (backend.rule.md Section 5.3).
        """
        clients = self.channels.get(channel, set())
        print(f"[WS BROADCAST] Channel: {channel}, Event: {event.event}, Active Clients: {len(clients)}", flush=True)
        if channel not in self.channels:
            return

        message = event.model_dump_json()
        dead_connections: list[WebSocket] = []

        for ws in self.channels[channel]:
            try:
                await ws.send_text(message)
            except Exception:
                dead_connections.append(ws)

        # Clean up dead connections
        for ws in dead_connections:
            self.channels[channel].discard(ws)

    async def send_personal(self, websocket: WebSocket, event: WSEvent) -> None:
        """Send an event to a specific WebSocket connection."""
        await websocket.send_text(event.model_dump_json())

    async def broadcast_to_prefix(self, prefix: str, event: WSEvent) -> None:
        """Broadcast an event to all channels matching a prefix."""
        import asyncio
        tasks = []
        for channel in list(self.channels.keys()):
            if channel.startswith(prefix):
                tasks.append(self.broadcast(channel, event))
        if tasks:
            await asyncio.gather(*tasks)


# Singleton instance
ws_manager = ConnectionManager()
