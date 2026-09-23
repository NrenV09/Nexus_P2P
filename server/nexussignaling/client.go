package nexussignaling

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024 // 512 KB
)

// Client represents a connected peer websocket connection
type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	Info     PeerInfo
	RoomID   string
	closed   bool
	closeMtx sync.Mutex
}

// NewClient initializes a client instance
func NewClient(hub *Hub, conn *websocket.Conn, info PeerInfo, roomID string) *Client {
	return &Client{
		Hub:    hub,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		Info:   info,
		RoomID: roomID,
	}
}

// ReadPump listens for incoming messages from the websocket connection
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[NexusSignaling] client read error: %v", err)
			}
			break
		}

		var sigMsg SignalMessage
		if err := json.Unmarshal(message, &sigMsg); err != nil {
			log.Printf("[NexusSignaling] invalid json: %v", err)
			continue
		}

		sigMsg.SenderID = c.Info.ID
		sigMsg.SenderName = c.Info.Username
		sigMsg.RoomID = c.RoomID
		sigMsg.Timestamp = time.Now().UnixMilli()

		c.Hub.RouteMessage(c, &sigMsg)
	}
}

// WritePump pushes queued messages to the websocket client
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			// Drain queued messages
			n := len(c.Send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Close safely closes the client websocket and send channel
func (c *Client) Close() {
	c.closeMtx.Lock()
	defer c.closeMtx.Unlock()

	if !c.closed {
		c.closed = true
		_ = c.Conn.Close()
	}
}
