# Quantum Link 🌌

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P_Data_%26_Media-FF6B6B?logo=webrtc&logoColor=white)](https://webrtc.org/)
[![Cloud Run Ready](https://img.shields.io/badge/Google_Cloud_Run-Production_Ready-4285F4?logo=google-cloud&logoColor=white)](https://cloud.google.com/run)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**Quantum Link** is an air-gapped, zero-server Peer-to-Peer (P2P) file transfer, voice/video calling, and encrypted communication station built with modern web primitives. It achieves direct, end-to-end encrypted device-to-device data exchange over **WebRTC** without relying on external relay servers, cloud databases, intermediate file storage, or centralized telemetry.

Designed for uncompromising privacy, low latency, and operational resilience, Quantum Link runs both as a **containerized cloud service** and as a **100% self-contained offline single-file HTML artifact** that functions seamlessly over air-gapped local area networks (LAN) and mobile hotspots.

---

## 📑 Table of Contents

- [Architectural Highlights](#-architectural-highlights)
- [Feature Matrix](#-feature-matrix)
- [How It Works (Zero-Server Optical Handshake)](#-how-it-works-zero-server-optical-handshake)
- [Bypass RAM Limits & Direct Disk Streaming](#-bypass-ram-limits--direct-disk-streaming)
- [Real-Time Calling & Screen Sharing](#-real-time-calling--screen-sharing)
- [Decentralized Failover & Topology HUD](#-decentralized-failover--topology-hud)
- [Quick Start & Local Development](#-quick-start--local-development)
- [Production Deployment & Containerization](#-production-deployment--containerization)
- [Standalone Offline HTML Artifacts](#-standalone-offline-html-artifacts)
- [Project Structure](#-project-structure)
- [Privacy & Threat Model](#-privacy--threat-model)
- [Browser Compatibility](#-browser-compatibility)
- [License](#-license)

---

## 🧠 Architectural Highlights

```
+-------------------------------------------------------------------------+
|                              QUANTUM LINK                               |
|                                                                         |
|  [ Station A (Host) ] <====== Encrypted SCTP / DTLS ======> [ Station B ]|
|          |                                                      |       |
|          |-- LZ-String Compressed SDP Offer (QR / Text) ------->|       |
|          |<-- LZ-String Compressed SDP Answer (QR / Text) ------|       |
|                                                                         |
|  * 100% Browser-to-Browser (P2P)            * Zero Backend Intermediary  |
|  * Streaming File System Access (RAM-Safe)  * Encrypted Audio/Video (SRTP) |
+-------------------------------------------------------------------------+
```

### 1. Serverless Optical Signaling
Traditional WebRTC applications mandate centralized signaling backends (WebSocket / HTTP servers) to negotiate Session Description Protocol (SDP) offers and answers. Quantum Link replaces remote infrastructure with **optical air-gapped handshaking**:
- **LZ-String Compression**: SDP session descriptions and ICE network candidates are compressed using LZ-String algorithms to fit dense WebRTC payloads directly into scannable QR codes.
- **Bi-Directional Optical Exchange**: Devices link simply by scanning screens (`Host Offer QR` -> `Peer Scans & Generates Answer QR` -> `Host Scans Answer QR`).
- **Cryptographic Token Fallback**: If cameras are unavailable, payloads can be shared across any local clipboard or messaging medium.

### 2. SCTP / DTLS Encrypted Data Channels
Once handshaking completes:
- All communications travel over encrypted SCTP protocols through Datagram Transport Layer Security (DTLS).
- Transferred bytes never touch a cloud database or relay server.
- File transfers saturate available local Wi-Fi or LAN line-speed with minimal overhead.

### 3. Native File System Streaming (RAM Bypass)
Large file transfers (1 GB to 5 GB+) are immune to browser tab crashes thanks to a dual-engine architecture:
- **Standard In-Memory Buffering**: Rapid assembly of lightweight files with in-app previews and instant blob downloads.
- **Direct Disk Streaming (`Bypass RAM Limits`)**: Pipes binary streams directly into native disk handles using the Chromium `FileSystemWritableFileStream` API, preventing memory bloat and bypassing drop-zone sandboxing.

---

## ⚡ Feature Matrix

| Module | Features & Capabilities |
| :--- | :--- |
| **P2P Transfer Engine** | 128KB chunk slicing, real-time throughput meter (MB/s), transfer progress bars, cancellation controls, auto-download hooks, and RAM-bypass direct disk writes. |
| **Direct Disk Streaming** | Interactive receiver authorization prompt, disk write streaming without intermediate memory allocation, and sender progress notification. |
| **Secure Chat Node** | End-to-end encrypted messaging, push-to-talk voice notes with audio waveform visualization, audio synthesis chime feedback, and station avatars. |
| **WebRTC Audio & Video Calling** | Hardware-accelerated camera/microphone streams, front/back camera toggling, microphone muting, real-time audio volume visualizer, screen sharing, and draggable picture-in-picture. |
| **Topology & Failover HUD** | Real-time swarm topology visualization, heartbeat monitoring, decentralized host election algorithms, and interactive failover simulation drills. |
| **Offline Utility Suite** | Standalone QR code generator/scanner, bi-directional Base64 encoder/decoder, and local diagnostic terminal with retro audio synthesis. |
| **In-App Manual (Light INFO)** | Interactive modal documenting connection workflows, manual SDP steps, RAM bypass behavior, and keyboard shortcuts. |
| **Theme & Atmosphere** | Responsive Dark/Light modes, customizable cyber-themed avatar colors, ambient WebGL/Canvas particle background, and audio-haptic feedback. |

---

## 🤝 How It Works (Zero-Server Optical Handshake)

Quantum Link requires no central account, login, or signaling server:

```
Step 1: Station A (Host)                   Step 2: Station B (Joiner)
+-----------------------+                  +-----------------------+
| Click "Host Station"  |                  | Click "Join Station"  |
| Generates Offer QR    | === (Scan) ====> | Scans Offer QR        |
+-----------------------+                  | Generates Answer QR   |
                                           +-----------------------+
                                                       |
Step 3: Station A (Finalize)                           |
+------------------------------------+                 |
| Scans Station B's Answer QR        | <=== (Scan) ====+
| Handshake completes: SECURED (P2P) |
+------------------------------------+
```

1. **Station A (Host)** selects **Host Station**. The app creates an `RTCPeerConnection`, bundles ICE candidates, and produces a compressed **Offer QR Code**.
2. **Station B (Joiner)** selects **Join Station** and scans Station A's screen using their camera (or pastes the token string).
3. Station B produces a compressed **Answer QR Code**.
4. Station A scans Station B's Answer QR Code. The P2P cryptographic handshake completes instantly.

---

## 💾 Bypass RAM Limits & Direct Disk Streaming

Browsers typically buffer received file chunks in JavaScript memory (`ArrayBuffer` / `Blob`), causing browser tabs to crash when receiving multi-gigabyte files. Quantum Link eliminates this limitation:

1. **Sender Activates "Download Bypass RAM Limits"**:
   - The file metadata signals the receiver that a direct disk stream is requested.
   - The sender UI transitions to an informative state: *"Waiting for receiver to click download..."*.
2. **Receiver Prompt**:
   - A modal immediately notifies the receiver with file details (name, size, sender).
   - When the receiver accepts, the browser invokes `showSaveFilePicker()` to request a physical destination on the user's hard drive.
3. **Pipelined Disk Streaming**:
   - Chunks stream over WebRTC data channels and write directly to the `FileSystemWritableFileStream`.
   - JavaScript heap memory stays constant (< 50MB) regardless of file size (tested up to 5GB+).
   - The file is saved directly to the user's hard drive without sandboxing in the temporary drop zone.

---

## 📞 Real-Time Calling & Screen Sharing

Quantum Link includes an encrypted, peer-to-peer audio/video calling suite:

- **HD Video & Audio**: Direct SRTP media stream negotiation with hardware-accelerated rendering.
- **Screen Sharing**: One-click display or window broadcasting with audio forwarding.
- **Live Visualizer**: Real-time microphone audio frequency spectrum display.
- **Controls**: Flip camera, mute microphone, toggle video, and expand to picture-in-picture.
- **Call Banners**: Incoming call notifications with Accept / Decline controls.

---

## 🛡️ Decentralized Failover & Topology HUD

Quantum Link features a decentralized peer registry and failover management engine:

- **Full-Mesh Relay**: When configured in group mode, the host relays data across interconnected peers while maintaining isolated peer channels.
- **Heartbeat & Latency Monitoring**: Connected stations maintain periodic keep-alive pings to track connection quality and link stability.
- **Automated Host Election**: If the active host disconnects, peers evaluate candidate priority metrics and initiate failover to elect a new primary node.
- **Interactive Drill Simulator**: Test network resilience and consensus mechanics without interrupting live file transfers.

---

## 🚀 Quick Start & Local Development

### Prerequisites
- **Node.js**: `v18.0.0` or higher
- **npm** or **bun** / **yarn** / **pnpm**
- Modern Web Browser with WebRTC support (Google Chrome, Microsoft Edge, Mozilla Firefox, Apple Safari)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/quantum-link.git
cd quantum-link

# Install dependencies
npm install
```

### Development Server

```bash
# Launches Vite with full-stack Express middleware on port 3000
npm run dev
```

Open your browser at `http://localhost:3000`.

### Code Validation

```bash
# Run TypeScript compilation and static verification
npm run lint
```

---

## 📦 Production Deployment & Containerization

The project is pre-configured for production environments, including **Google Cloud Run**, **Docker**, **Kubernetes**, or any standard VPS:

### Production Build

```bash
# Compiles frontend static assets and bundles the backend server
npm run build
```

This command executes:
1. `vite build` — Emits optimized client bundles into `dist/`.
2. `vite-plugin-singlefile` — Generates offline standalone HTML files into `FINAL NEXUS/` and `build/`.
3. `esbuild server.ts` — Bundles `server.ts` into a standalone CommonJS file at `dist/server.cjs`.

### Production Start

```bash
# Starts the compiled Node.js server
npm start
```

The production server:
- Binds to host `0.0.0.0` on port `3000` (or the environment-specified `PORT`).
- Serves optimized static assets and handles single-page routing (`dist/index.html`).
- Exposes health probes at `/api/health` and `/health` for Cloud Run and load balancer readiness checks.

---

## 🌐 Standalone Offline HTML Artifacts

For disaster-recovery, air-gapped field operations, or portable USB usage, Quantum Link compiles into a single, dependency-free HTML file:

```
FINAL NEXUS/
├── FinalNexus.html      # Standalone single-file HTML app (all JS, CSS & icons inlined)
└── index.html           # Identical portable distribution
```

**How to run offline:**
1. Copy `FINAL NEXUS/FinalNexus.html` to a USB drive or laptop.
2. Double-click to open in any modern browser—**no Node.js, internet connection, or server installation required**.
3. Connect two devices to the same local Wi-Fi router or smartphone hotspot to transfer files at maximum wireless speed.

---

## 📁 Project Structure

```
├── FINAL NEXUS/               # Pre-compiled standalone single-file distributions
│   ├── FinalNexus.html
│   └── index.html
├── build/                     # Secondary standalone release builds
├── public/                    # Static public assets and application icons
├── src/
│   ├── components/
│   │   ├── Base64Tool.tsx               # In-app Base64 conversion utility
│   │   ├── CallOverlay.tsx              # Audio/video call HUD with screen sharing
│   │   ├── DirectDownloadPromptModal.tsx# RAM bypass authorization modal
│   │   ├── EasterEggModal.tsx           # Retro diagnostic developer shell
│   │   ├── IncomingCallModal.tsx        # Incoming call alert dialog
│   │   ├── NetworkBackground.tsx        # Particle topology canvas background
│   │   ├── NexusFailoverHUD.tsx         # Decentralized mesh consensus panel
│   │   ├── NexusInfoModal.tsx           # Step-by-step user manual & reference guide
│   │   ├── PacketTransferAnimation.tsx  # Dynamic packet stream visualizer
│   │   ├── ProfileModal.tsx             # Local avatar & identity settings
│   │   └── QRScannerModal.tsx           # Camera-based optical QR code scanner
│   ├── lib/
│   │   └── nameGenerator.ts             # Random cyber identity generator
│   ├── App.tsx                          # Primary state coordinator & WebRTC engine
│   ├── main.tsx                         # Client application entry point
│   ├── types.ts                         # Core TypeScript interfaces & types
│   └── index.css                        # Tailwind CSS global styling
├── index.html                           # Root HTML template
├── metadata.json                        # Application descriptors & permissions
├── package.json                         # Project dependencies & build lifecycle scripts
├── server.ts                            # Express + Vite hybrid production server
├── tsconfig.json                        # TypeScript compiler configuration
└── vite.config.ts                       # Vite build & single-file inlining pipeline
```

---

## 🔒 Privacy & Threat Model

- **Zero Remote Logs**: No user activity, file hashes, IP addresses, or telemetry data are collected or transmitted.
- **End-to-End Encryption**: Data channels use WebRTC DTLS encryption (AES-128 / AES-256 GCM) with SCTP protocol safety. Audio and video streams utilize SRTP.
- **Direct Optical Handshaking**: Session signaling occurs via physical optical scanning; no intermediary server ever parses your SDP offers or network topology.
- **Client-Side Storage**: Identity preferences, usernames, and theme selections are stored exclusively in the browser's `localStorage` and never transmitted externally.

---

## 🌍 Browser Compatibility

| Browser | WebRTC DataChannel | Optical QR Scanning | Direct Disk Streaming (Bypass RAM) | Audio / Video Calling |
| :--- | :---: | :---: | :---: | :---: |
| **Google Chrome** (v88+) | ✅ Full | ✅ Full | ✅ File System Access API | ✅ Full |
| **Microsoft Edge** (v88+) | ✅ Full | ✅ Full | ✅ File System Access API | ✅ Full |
| **Brave / Chromium** | ✅ Full | ✅ Full | ✅ File System Access API | ✅ Full |
| **Mozilla Firefox** (v90+) | ✅ Full | ✅ Full | ⚠️ Instant Blob Fallback | ✅ Full |
| **Apple Safari** (iOS / macOS 14+) | ✅ Full | ✅ Full | ⚠️ Instant Blob Fallback | ✅ Full |

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.
