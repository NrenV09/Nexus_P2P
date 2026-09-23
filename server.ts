import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";

interface PeerClient {
  ws: WebSocket;
  id: string;
  username: string;
  avatarColor: string;
  room: string;
  isHost: boolean;
  joinedAt: number;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // In-memory rooms for WebSocket WebRTC signaling
  const rooms = new Map<string, Map<string, PeerClient>>();

  const wss = new WebSocketServer({ server, path: "/ws/nexus" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const roomId = url.searchParams.get("room") || "nexus-main";
    const peerId = url.searchParams.get("peerId") || Math.random().toString(36).substring(2, 9);
    const username = url.searchParams.get("username") || `Peer-${peerId.substring(0, 4)}`;
    const avatarColor = url.searchParams.get("color") || "bg-accent";

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }
    const room = rooms.get(roomId)!;

    // First node to connect becomes host
    const isHost = room.size === 0;

    const client: PeerClient = {
      ws,
      id: peerId,
      username,
      avatarColor,
      room: roomId,
      isHost,
      joinedAt: Date.now()
    };

    // Collect existing peers
    const existingPeers = Array.from(room.values()).map(p => ({
      id: p.id,
      username: p.username,
      avatarColor: p.avatarColor,
      isHost: p.isHost,
      joinedAt: p.joinedAt
    }));

    let hostId = isHost ? peerId : (Array.from(room.values()).find(p => p.isHost)?.id || "");

    room.set(peerId, client);

    // 1. Send room state to the newly joined peer
    ws.send(JSON.stringify({
      type: "room-state",
      roomId,
      targetId: peerId,
      payload: {
        hostId,
        peers: existingPeers
      },
      timestamp: Date.now()
    }));

    // 2. Announce peer to everyone else in the room
    const announceMsg = JSON.stringify({
      type: "peer-joined",
      roomId,
      senderId: peerId,
      senderName: username,
      payload: {
        id: peerId,
        username,
        avatarColor,
        isHost,
        joinedAt: client.joinedAt
      },
      timestamp: Date.now()
    });

    room.forEach(peer => {
      if (peer.id !== peerId && peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(announceMsg);
      }
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        msg.senderId = peerId;
        msg.senderName = username;
        msg.roomId = roomId;
        msg.timestamp = Date.now();

        const raw = JSON.stringify(msg);

        switch (msg.type) {
          // Direct WebRTC signaling (Host ⇄ Peer or Peer ⇄ Peer direct bypass)
          case "signal-offer":
          case "signal-answer":
          case "signal-ice":
          case "bypass-offer":
          case "bypass-answer":
          case "bypass-ice": {
            if (msg.targetId && room.has(msg.targetId)) {
              const target = room.get(msg.targetId);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(raw);
              }
            }
            break;
          }

          // Private call start/end: forward direct to target, AND broadcast to everyone for the Global Event Log
          case "private-call-start":
          case "private-call-end": {
            if (msg.targetId && room.has(msg.targetId)) {
              const target = room.get(msg.targetId);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(raw);
              }
            }
            // Broadcast to the whole room so everyone sees "Private call occurring between user X and Y"
            room.forEach(peer => {
              if (peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(raw);
              }
            });
            break;
          }

          // Group Video Call room-wide broadcasts: notify all peers immediately
          case "group-call-start":
          case "group-call-end":
          case "group-call-join":
          case "group-call-signal": {
            room.forEach(peer => {
              if (peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(raw);
              }
            });
            break;
          }

          // Network chat and transfer alerts: broadcast to all connected clients
          case "network-chat":
          case "transfer-start":
          case "transfer-end": {
            room.forEach(peer => {
              if (peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(raw);
              }
            });
            break;
          }

          case "ping": {
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            break;
          }
        }
      } catch (err) {
        console.error("Signaling parse error:", err);
      }
    });

    ws.on("close", () => {
      room.delete(peerId);

      let newHostId = "";
      // If host disconnected, promote first remaining peer
      if (client.isHost && room.size > 0) {
        const nextHost = Array.from(room.values())[0];
        nextHost.isHost = true;
        newHostId = nextHost.id;
      }

      const leaveMsg = JSON.stringify({
        type: "peer-left",
        roomId,
        senderId: peerId,
        senderName: username,
        payload: {
          peerId,
          username,
          newHostId
        },
        timestamp: Date.now()
      });

      room.forEach(peer => {
        if (peer.ws.readyState === WebSocket.OPEN) {
          peer.ws.send(leaveMsg);
        }
      });

      if (room.size === 0) {
        rooms.delete(roomId);
      }
    });
  });

  // Health check routes for Cloud Run / load balancers
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Support direct offline single-file download in production
  app.get("/QuantumLink.html", (_req, res) => {
    const filePath = path.join(process.cwd(), "dist", "index.html");
    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Disposition", "attachment; filename=QuantumLink.html");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.sendFile(filePath);
    }
    return res.status(404).send("File not found");
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server & WebSocket signaling running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
