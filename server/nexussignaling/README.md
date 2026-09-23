# Nexus WebRTC WebSocket Signaling Package (Go)

This isolated Go package (`nexussignaling`) implements real-time room discovery, host designation, WebRTC SDP/ICE exchange, dynamic peer-to-peer bypass routing, and network-wide event broadcasts.

## Features
- **Dynamic Peer Discovery**: First peer becomes the central Host; subsequent peers join as spoke nodes.
- **Failover**: If the host drops, the hub designates the next peer as Host and notifies all clients.
- **WebRTC SDP & ICE Routing**: Direct routing between host and peers, or direct bypass signaling between two non-host peers.
- **Network-Wide Event Broadcasts**: Chat messages, transfer activity, and private call announcements are broadcasted to all connected clients so everyone's Global Event Log reflects the live network state.
- **Thread-safe**: Goroutine-safe Hub and Room management with lock primitives.

## Quick Integration into Existing Go Server

```go
package main

import (
	"log"
	"net/http"

	"yourmodule/server/nexussignaling"
)

func main() {
	mux := http.NewServeMux()

	// 1. Initialize hub and attach to router
	hub := nexussignaling.NewHub()
	go hub.Run()

	// 2. Register WebSocket endpoint
	mux.HandleFunc("/ws/nexus", hub.Handler())

	// Or use the one-line helper:
	// nexussignaling.AttachToMux(mux, "/ws/nexus")

	log.Println("Signaling server running on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
```
