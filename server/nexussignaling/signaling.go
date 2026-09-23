package nexussignaling

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var defaultUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 64,
	WriteBufferSize: 1024 * 64,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow cross-origin WebSockets for flexible deployment
	},
}

// Hub coordinates rooms and client routing
type Hub struct {
	rooms      map[string]*Room
	Register   chan *Client
	Unregister chan *Client
	mtx        sync.RWMutex
	Upgrader   websocket.Upgrader
}

// NewHub initializes a signaling hub
func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*Room),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Upgrader:   defaultUpgrader,
	}
}

// Run starts the central event loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mtx.Lock()
			room, exists := h.rooms[client.RoomID]
			if !exists {
				room = NewRoom(client.RoomID)
				h.rooms[client.RoomID] = room
			}
			h.mtx.Unlock()

			isHost, existingPeers := room.AddClient(client)

			// 1. Send current room state to the newly joined client
			statePayload := RoomStatePayload{
				HostID: room.HostID,
				Peers:  existingPeers,
			}
			stateRaw, _ := json.Marshal(statePayload)
			welcomeMsg := &SignalMessage{
				Type:       TypeRoomState,
				RoomID:     client.RoomID,
				TargetID:   client.Info.ID,
				Payload:    stateRaw,
				Timestamp:  time.Now().UnixMilli(),
			}
			msgBytes, _ := json.Marshal(welcomeMsg)
			client.Send <- msgBytes

			// 2. Announce the new peer to all other clients in the room
			peerRaw, _ := json.Marshal(client.Info)
			announcement := &SignalMessage{
				Type:       TypePeerJoined,
				RoomID:     client.RoomID,
				SenderID:   client.Info.ID,
				SenderName: client.Info.Username,
				Payload:    peerRaw,
				Timestamp:  time.Now().UnixMilli(),
			}
			room.Broadcast(announcement, client.Info.ID)

		case client := <-h.Unregister:
			h.mtx.Lock()
			room, exists := h.rooms[client.RoomID]
			if exists {
				newHostID, count := room.RemoveClient(client.Info.ID)

				// Broadcast peer disconnection to remaining peers
				leavePayload, _ := json.Marshal(map[string]interface{}{
					"peerId":    client.Info.ID,
					"username":  client.Info.Username,
					"newHostId": newHostID,
				})
				room.Broadcast(&SignalMessage{
					Type:       TypePeerLeft,
					RoomID:     client.RoomID,
					SenderID:   client.Info.ID,
					SenderName: client.Info.Username,
					Payload:    leavePayload,
					Timestamp:  time.Now().UnixMilli(),
				}, "")

				if count == 0 {
					delete(h.rooms, client.RoomID)
					log.Printf("[NexusSignaling] Room '%s' cleaned up (0 clients)", client.RoomID)
				}
			}
			h.mtx.Unlock()
		}
	}
}

// RouteMessage handles routing for WebRTC signaling, bypasses, and global broadcasts
func (h *Hub) RouteMessage(sender *Client, msg *SignalMessage) {
	h.mtx.RLock()
	room, exists := h.rooms[sender.RoomID]
	h.mtx.RUnlock()

	if !exists {
		return
	}

	switch msg.Type {
	// Direct peer-to-peer WebRTC signaling (Host ⇄ Peer or Peer ⇄ Peer Direct Bypass)
	case TypeSignalOffer, TypeSignalAnswer, TypeSignalICE,
		TypeBypassOffer, TypeBypassAnswer, TypeBypassICE:
		if msg.TargetID != "" {
			room.SendDirect(msg.TargetID, msg)
		}

	// Global Network Event: broadcast to all connected clients so everyone's log sees it
	case TypeNetworkChat, TypeTransferStart, TypeTransferEnd:
		room.Broadcast(msg, "")

	// Private Call Announcements:
	// "private calls occurring between two users can also be seen here by everyone on the network"
	case TypePrivateCallStart, TypePrivateCallEnd:
		// Forward direct signaling to the recipient
		if msg.TargetID != "" {
			room.SendDirect(msg.TargetID, msg)
		}
		// Also broadcast the event metadata to ALL clients in the room for the Global Event Log!
		room.Broadcast(msg, "")

	case TypePing:
		pong := &SignalMessage{
			Type:      TypePong,
			Timestamp: time.Now().UnixMilli(),
		}
		raw, _ := json.Marshal(pong)
		sender.Send <- raw
	}
}

// Handler returns an http.HandlerFunc that can be mounted on any standard Go router
func (h *Hub) Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := h.Upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("[NexusSignaling] upgrade error: %v", err)
			return
		}

		query := r.URL.Query()
		roomID := query.Get("room")
		if roomID == "" {
			roomID = "nexus-main"
		}

		peerID := query.Get("peerId")
		if peerID == "" {
			peerID = r.RemoteAddr
		}

		username := query.Get("username")
		if username == "" {
			username = "Peer-" + peerID[:min(4, len(peerID))]
		}

		avatarColor := query.Get("color")
		if avatarColor == "" {
			avatarColor = "bg-accent"
		}

		info := PeerInfo{
			ID:          peerID,
			Username:    username,
			AvatarColor: avatarColor,
			JoinedAt:    time.Now().UnixMilli(),
		}

		client := NewClient(h, conn, info, roomID)
		h.Register <- client

		go client.WritePump()
		go client.ReadPump()
	}
}

// AttachToMux is a helper to mount the signaling handler on an http.ServeMux
func AttachToMux(mux *http.ServeMux, pattern string) *Hub {
	hub := NewHub()
	go hub.Run()
	mux.HandleFunc(pattern, hub.Handler())
	return hub
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
