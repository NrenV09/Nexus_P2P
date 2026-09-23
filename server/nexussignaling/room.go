package nexussignaling

import (
	"encoding/json"
	"log"
	"sync"
)

// Room maintains the collection of connected peers in a specific room
type Room struct {
	ID       string
	HostID   string
	clients  map[string]*Client
	mtx      sync.RWMutex
}

// NewRoom creates a new room instance
func NewRoom(id string) *Room {
	return &Room{
		ID:      id,
		clients: make(map[string]*Client),
	}
}

// AddClient adds a peer to the room and designates the first peer as Host
func (r *Room) AddClient(c *Client) (isHost bool, existingPeers []PeerInfo) {
	r.mtx.Lock()
	defer r.mtx.Unlock()

	// First peer becomes the central Host
	if len(r.clients) == 0 || r.HostID == "" {
		r.HostID = c.Info.ID
		c.Info.IsHost = true
		isHost = true
	} else {
		c.Info.IsHost = false
		isHost = false
	}

	for _, existing := range r.clients {
		existingPeers = append(existingPeers, existing.Info)
	}

	r.clients[c.Info.ID] = c
	log.Printf("[NexusSignaling] Peer joined room '%s': %s (%s, isHost: %v). Total: %d",
		r.ID, c.Info.Username, c.Info.ID, isHost, len(r.clients))
	return isHost, existingPeers
}

// RemoveClient removes a peer from the room and re-elects a Host if needed
func (r *Room) RemoveClient(clientID string) (newHostID string, remainingCount int) {
	r.mtx.Lock()
	defer r.mtx.Unlock()

	delete(r.clients, clientID)
	remainingCount = len(r.clients)

	if r.HostID == clientID {
		r.HostID = ""
		// Failover / designate the earliest connected peer as new Host
		for id, client := range r.clients {
			r.HostID = id
			client.Info.IsHost = true
			newHostID = id
			log.Printf("[NexusSignaling] Host failover in room '%s': new host is %s (%s)", r.ID, client.Info.Username, id)
			break
		}
	}

	return newHostID, remainingCount
}

// Broadcast sends a message to all clients in the room (optionally excluding sender)
func (r *Room) Broadcast(msg *SignalMessage, excludeID string) {
	r.mtx.RLock()
	defer r.mtx.RUnlock()

	raw, err := json.Marshal(msg)
	if err != nil {
		return
	}

	for id, client := range r.clients {
		if excludeID != "" && id == excludeID {
			continue
		}
		select {
		case client.Send <- raw:
		default:
			log.Printf("[NexusSignaling] Client %s send buffer full, dropping message", id)
		}
	}
}

// SendDirect sends a targeted message to a specific peer in the room
func (r *Room) SendDirect(targetID string, msg *SignalMessage) bool {
	r.mtx.RLock()
	defer r.mtx.RUnlock()

	client, exists := r.clients[targetID]
	if !exists {
		return false
	}

	raw, err := json.Marshal(msg)
	if err != nil {
		return false
	}

	select {
	case client.Send <- raw:
		return true
	default:
		return false
	}
}
