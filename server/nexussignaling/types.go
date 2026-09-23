package nexussignaling

import (
	"encoding/json"
	"time"
)

// MessageType defines the signaling message protocol
type MessageType string

const (
	// Room & Presence
	TypeJoinRoom   MessageType = "join-room"
	TypePeerJoined MessageType = "peer-joined"
	TypePeerLeft   MessageType = "peer-left"
	TypeRoomState  MessageType = "room-state"
	TypePing       MessageType = "ping"
	TypePong       MessageType = "pong"

	// WebRTC Signaling
	TypeSignalOffer     MessageType = "signal-offer"
	TypeSignalAnswer    MessageType = "signal-answer"
	TypeSignalICE       MessageType = "signal-ice"
	TypeBypassOffer     MessageType = "bypass-offer"
	TypeBypassAnswer    MessageType = "bypass-answer"
	TypeBypassICE       MessageType = "bypass-ice"

	// Network Events & Global Log Broadcasts
	TypeNetworkChat    MessageType = "network-chat"
	TypeTransferStart  MessageType = "transfer-start"
	TypeTransferEnd    MessageType = "transfer-end"
	TypePrivateCallStart MessageType = "private-call-start"
	TypePrivateCallEnd   MessageType = "private-call-end"
)

// SignalMessage represents the envelope for all WebSocket messages
type SignalMessage struct {
	Type        MessageType     `json:"type"`
	RoomID      string          `json:"roomId,omitempty"`
	SenderID    string          `json:"senderId,omitempty"`
	SenderName  string          `json:"senderName,omitempty"`
	TargetID    string          `json:"targetId,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty"`
	Timestamp   int64           `json:"timestamp,omitempty"`
}

// PeerInfo holds public metadata of a connected client
type PeerInfo struct {
	ID          string   `json:"id"`
	Username    string   `json:"username"`
	AvatarColor string   `json:"avatarColor"`
	IsHost      bool     `json:"isHost"`
	JoinedAt    int64    `json:"joinedAt"`
	BypassPeers []string `json:"bypassPeers,omitempty"`
}

// RoomStatePayload is sent to new clients upon joining
type RoomStatePayload struct {
	HostID string     `json:"hostId"`
	Peers  []PeerInfo `json:"peers"`
}

// CallBroadcastPayload announces private calls to the entire network
type CallBroadcastPayload struct {
	CallerID   string `json:"callerId"`
	CallerName string `json:"callerName"`
	TargetID   string `json:"targetId"`
	TargetName string `json:"targetName"`
	CallType   string `json:"callType"` // "audio" | "video"
	CallID     string `json:"callId"`
}

// NewSignalMessage creates a message with a current timestamp
func NewSignalMessage(msgType MessageType, senderID, targetID string, payload interface{}) (*SignalMessage, error) {
	var raw json.RawMessage
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		raw = b
	}

	return &SignalMessage{
		Type:      msgType,
		SenderID:  senderID,
		TargetID:  targetID,
		Payload:   raw,
		Timestamp: time.Now().UnixMilli(),
	}, nil
}
