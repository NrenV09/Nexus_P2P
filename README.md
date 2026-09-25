# Quantum Link 🌌

[![Deploy to GitHub Pages](https://github.com/namanv2703/quantum-link/actions/workflows/deploy.yml/badge.svg)](https://github.com/namanv2703/quantum-link/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![WebRTC](https://img.shields.io/badge/WebRTC-DTLS_%2F_SCTP_E2EE-FF6B6B?logo=webrtc&logoColor=white)](https://webrtc.org/)
[![GitHub Pages Ready](https://img.shields.io/badge/GitHub_Pages-Automated_Deploy-22C55E?logo=github&logoColor=white)](https://pages.github.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Quantum Link** (Nexus RTC Suite) is an air-gapped, zero-server Peer-to-Peer (P2P) file transfer station, encrypted voice/video calling suite, and decentralized swarm communication node built exclusively on modern web standards.

It facilitates direct, end-to-end encrypted device-to-device communication across **WebRTC** without relying on intermediary cloud databases, tracking telemetry, centralized storage, or mandatory external signaling infrastructure.

Quantum Link runs seamlessly as:
1. **A GitHub Pages Web App**: Hosted statically with automated GitHub Actions continuous deployment.
2. **A Portable Single-File HTML Artifact**: Distributed as a 100% self-contained, zero-dependency offline HTML file (`FINAL NEXUS/FinalNexus.html`) that executes directly from a USB stick over air-gapped local networks (LAN) or mobile hotspots.
3. **A Containerized Full-Stack Cloud Service**: Backed by a high-throughput Node.js / Express WebSocket signaling server and an optional standalone Go signaling engine (`server/nexussignaling/`).

---

## 📑 Table of Contents

- [Architectural Highlights](#-architectural-highlights)
- [System Architecture Diagram](#-system-architecture-diagram)
- [Core Feature Matrix](#-core-feature-matrix)
- [Dual Signaling Engines (Optical vs WebSocket Mesh)](#-dual-signaling-engines)
- [Bypass RAM Limits: Native Disk Streaming](#-bypass-ram-limits-native-disk-streaming)
- [Push-to-Talk Voice Notes & Calling Suite](#-push-to-talk-voice-notes--calling-suite)
- [Decentralized Swarm Topology & Failover HUD](#-decentralized-swarm-topology--failover-hud)
- [Offline Single-File Distribution (`FINAL NEXUS`)](#-offline-single-file-distribution-final-nexus)
- [Project File Structure](#-project-file-structure)
- [GitHub Pages Deployment Guide](#-github-pages-deployment-guide)
- [Quick Start & Local Development](#-quick-start--local-development)
- [Production Deployment](#-production-deployment)
- [Privacy, Threat Model & Legal Compliance](#-privacy-threat-model--legal-compliance)
- [Browser Compatibility](#-browser-compatibility)
- [License](#-license)

---

## 🧠 Architectural Highlights

- **Air-Gapped Optical Handshaking**: Generates and parses LZ-String compressed WebRTC SDP offer/answer tokens encoded directly into high-density QR codes. Devices link by aiming cameras at each other's screens—zero internet packets required during session negotiation.
- **WebSocket Room Discovery & Mesh Signaling**: Optional hybrid signaling fallback via `/ws/nexus` for rapid multi-peer room joining, peer announcement, and decentralized mesh synchronization.
- **Zero Memory Bloat Disk Streaming**: Slices large files (tested 5GB+) into 64KB chunks below the WebRTC SCTP limit and streams directly to native disk via the Chromium `FileSystemWritableFileStream` API (`showSaveFilePicker()`), keeping browser heap memory under 50MB.
- **Flow Control & Backpressure Management**: Real-time SCTP buffer monitoring (`bufferedAmount < 512KB`) prevents socket packet drops and stalls across asynchronous transmission channels.
- **Hardware-Accelerated Audio & Video Calling**: Peer-to-peer SRTP audio/video negotiation with camera flip, mute controls, real-time volume visualizers, draggable Picture-in-Picture (PiP), and full-screen display sharing.
- **Voice Message Notes**: In-browser audio capture and waveform playback with retro-cyber acoustic synthesized chimes.
- **Decentralized Swarm Failover**: Dynamic heartbeat health-checking, automated host election algorithms, and interactive network-split drill simulations.
- **Persistent Sandbox Storage**: CacheStorage integration for local file staging, instant media previews, and drag-and-drop file re-sharing.
- **Legal & Privacy Hub**: Built-in 4-tab user manual featuring a connection guide, cyber-terminology dictionary, offline handbook, and full compliance disclosures.

---

## 📐 System Architecture Diagram

```text
+---------------------------------------------------------------------------------------+
|                                    QUANTUM LINK                                       |
|                                                                                       |
|   +-------------------+                                       +-------------------+   |
|   | Station A (Host)  |                                       | Station B (Peer)  |   |
|   |-------------------|                                       |-------------------|   |
|   | - React 19 UI     |      1. Optical QR Exchange (Air-Gap) | - React 19 UI     |   |
|   | - WebRTC Node     | <===================================> | - WebRTC Node     |   |
|   | - Disk Streamer   |      or 2. WebSocket Fallback (/ws)   | - Disk Streamer   |   |
|   +-------------------+                                       +-------------------+   |
|             \                                                           /             |
|              \                                                         /              |
|               ======= [ Direct P2P SCTP / DTLS Data Channel ] ========                |
|                      | - 64KB Chunk Slicing + Backpressure     |                      |
|                      | - Direct Hard Drive File Writes         |                      |
|                      | - End-to-End Encrypted Secure Chat      |                      |
|                      | - Push-to-Talk Voice Notes              |                      |
|                                                                                       |
|               ======= [ Direct P2P SRTP Media Stream ] ===============                |
|                      | - HD Video & Audio Calling              |                      |
|                      | - Low-Latency Screen Sharing            |                      |
|                      | - Hardware-Accelerated Rendering        |                      |
+---------------------------------------------------------------------------------------+
```

---

## ⚡ Core Feature Matrix

| Station Module | Key Capabilities |
| :--- | :--- |
| **P2P Transceiver** | Slices files into 64KB segments, tracks real-time MB/s throughput, displays dynamic progress bars, and enables instant cancel and re-transfer. |
| **Direct Disk Streaming (RAM Bypass)** | Uses the File System Access API to stream multi-gigabyte files directly to the receiver's disk, bypassing browser memory allocation. |
| **Persistent Sandbox Cache** | Stores received files in `CacheStorage` for immediate in-app media preview (images, audio, video, text) and re-downloading across sessions. |
| **Secure Chat Node** | End-to-end encrypted messaging, push-to-talk voice recording with waveform visualization, avatar color indicators, and bandwidth optimization. |
| **WebRTC Audio & Video Calling** | HD video, microphone mute, front/back camera toggling, screen broadcasting, live volume spectrum meters, and PiP background mode. |
| **Nexus Failover HUD & Topology** | Visualizes swarm node topology, tracks heartbeat latency, executes host election algorithms, and simulates network dropouts. |
| **Standalone QR Utility** | High-density QR code generator with LZ-String compression and camera-based optical scanner with instant clipboard support. |
| **Base64 Converter** | Standalone UTF-8 and binary Base64 encoder and decoder utility with one-click copy and character counters. |
| **Info & Compliance Hub** | 4-tab interactive manual: Step-by-Step Connection Guide, Cyber Glossary, Air-Gapped Offline Guide, and Legal/Privacy Hub. |
| **Cyber Atmosphere & Themes** | Dark/Light theme switching, ambient particle network canvas, audio-haptic feedback, and retro diagnostic shell. |

---

## 🔄 Dual Signaling Engines

Quantum Link supports two distinct connection workflows depending on network conditions and operational security requirements:

### 1. Zero-Server Optical Air-Gapped Handshaking
For high-security, air-gapped, or isolated local network environments:
1. **Station A (Host)** generates a local WebRTC Session Description Protocol (SDP) offer.
2. The SDP and ICE candidates are compressed via **LZ-String** and rendered into a high-density QR code on Station A's screen.
3. **Station B (Joiner)** opens the optical QR scanner and scans Station A's screen.
4. Station B calculates an SDP Answer, compresses it, and displays an **Answer QR Code**.
5. Station A scans Station B's Answer QR Code.
6. The cryptographic DTLS/SCTP tunnel initializes immediately. **No internet packets or external servers were contacted.**

### 2. WebSocket Mesh Signaling Fallback
When devices are on different networks or screen scanning is impractical:
- Stations connect to `/ws/nexus` on the local or hosted server.
- The first station to connect becomes the room Host; subsequent stations join as peers.
- WebRTC SDP and ICE candidates are routed over lightweight WebSocket envelopes.
- Once connected, media and data channels transition to direct peer-to-peer communication.

---

## 💾 Bypass RAM Limits: Native Disk Streaming

Standard browsers crash or terminate tabs when buffering multi-gigabyte files in JavaScript heap memory (`ArrayBuffer` / `Blob`). Quantum Link bypasses this bottleneck:

1. **Sender Activation**: The sender marks **"Download Bypass RAM Limits"** before initiating a transfer.
2. **Receiver Notification**: The receiver receives a modal prompt detailing the filename, file size, and sender identity.
3. **Save File Picker**: Upon acceptance, the receiver's browser invokes `window.showSaveFilePicker()` to request a physical destination on their hard drive.
4. **Pipelined Streaming**: As 64KB WebRTC data chunks arrive across SCTP channels, they are written directly to the `FileSystemWritableFileStream`.
5. **Constant Memory Footprint**: Heap allocation remains stable (< 50MB) even when receiving 5GB+ files.
6. **Fallback**: On platforms lacking File System Access API support (Firefox, Safari iOS), Quantum Link automatically falls back to indexed memory streaming and blob downloads.

---

## 🎙️ Push-to-Talk Voice Notes & Calling Suite

Quantum Link includes an integrated encrypted communications center:

- **Push-to-Talk Voice Notes**: Record voice memos with real-time waveform visualization, compress the audio data, and transmit over the encrypted data channel with synthetic chime confirmation.
- **Peer-to-Peer Calling**: One-click audio and HD video calls negotiated directly via WebRTC SRTP.
- **Picture-in-Picture (PiP)**: Keep video calls active in an unobtrusive floating window while browsing the P2P Transceiver or sending files.
- **Screen Sharing**: Broadcast your monitor, application window, or browser tab with full audio pass-through.
- **Bandwidth Optimization Mode**: Toggle low-bandwidth audio-only mode to preserve connection stability on unstable networks.

---

## 🛡️ Decentralized Swarm Topology & Failover HUD

Quantum Link incorporates a peer coordinator designed for mesh and star networks:

- **Interactive Network Map**: Real-time canvas visualization of connected nodes, link latencies, and roles (Host vs Peer).
- **Heartbeat & Latency Tracking**: Periodic ping/pong packets measure round-trip link health.
- **Host Migration**: If the designated Host station leaves or drops connection, connected nodes trigger an automated consensus election to promote the next candidate node.
- **Failover Simulation Drills**: Test split-brain scenarios, graceful host departure, and node reconnection without interrupting active file transfers.

---

## 🌐 Offline Single-File Distribution (`FINAL NEXUS`)

Quantum Link can be compiled into a single, self-contained HTML file where all JavaScript, CSS stylesheets, and icons are inlined:

```text
FINAL NEXUS/
├── FinalNexus.html     # Completely offline single-file executable web application
└── index.html          # Secondary portable single-file distribution
```

### Running 100% Offline:
1. Download or copy `FINAL NEXUS/FinalNexus.html` to a USB drive or local disk.
2. Double-click the file to open it in Chrome, Edge, Safari, Brave, or Firefox.
3. **No Node.js, internet connection, or external dependencies are required.**
4. Connect multiple devices to the same local Wi-Fi router or mobile hotspot to transfer files at full line-speed.

---

## 📁 Project File Structure

```text
.
├── .github/
│   └── workflows/
│       └── deploy.yml              # Automated GitHub Pages CI/CD workflow
├── FINAL NEXUS/                    # Portable single-file HTML distributions
│   ├── FinalNexus.html             # Zero-dependency self-contained offline application
│   └── index.html                  # Duplicate portable deployment file
├── public/                         # Public static assets & favicon
├── server/
│   └── nexussignaling/             # High-performance Go WebSocket signaling package
│       ├── README.md               # Go package documentation & usage guide
│       ├── client.go               # Goroutine-safe client connection handler
│       ├── room.go                 # Swarm room coordinator & host election logic
│       ├── signaling.go            # Hub dispatcher and WebSocket routing
│       └── types.go                # WebRTC message & signaling protocol definitions
├── src/
│   ├── components/                 # UI components and station modules
│   │   ├── Base64ToolNode.tsx      # Standalone Base64 text & binary encoder/decoder
│   │   ├── CallOverlay.tsx         # Full-screen / PiP audio & video call interface
│   │   ├── CookieConsentBanner.tsx # Local privacy & cookie consent disclosure
│   │   ├── DataStream.tsx          # Real-time WebRTC packet throughput monitor
│   │   ├── DirectDownloadPromptModal.tsx # RAM-bypass receiver authorization dialog
│   │   ├── EasterEggModal.tsx      # Retro diagnostic terminal & audio synthesis shell
│   │   ├── FilePreview.tsx         # Media previewer (images, video, audio, text)
│   │   ├── IncomingCallModal.tsx   # Audio/video incoming call notification with ringtone
│   │   ├── LegalComplianceView.tsx # Terms of Service & Privacy Policy modal view
│   │   ├── NetworkBackground.tsx   # Canvas-based ambient particle network background
│   │   ├── NexusFailoverHUD.tsx    # Swarm consensus dashboard & failover drill controls
│   │   ├── NexusInfoModal.tsx      # Multi-tab connection manual, glossary & legal hub
│   │   ├── NexusNetworkMap.tsx     # Dynamic node topology visualization canvas
│   │   ├── PacketTransferAnimation.tsx # Visual packet animation along transfer vectors
│   │   ├── ProfileModal.tsx        # Local identity, avatar color, and username editor
│   │   ├── QRScanner.tsx           # Camera-based optical QR reader using html5-qrcode
│   │   ├── QRUtilityNode.tsx       # Standalone QR code generator and optical scanner tab
│   │   ├── SecureChatNode.tsx      # Encrypted chat, voice note recorder & call triggers
│   │   ├── ViewProfileModal.tsx    # Peer profile inspector with bio and connection stats
│   │   └── VoiceMessagePlayer.tsx  # Push-to-talk voice note playback with waveform bar
│   ├── data/
│   │   └── legalPolicies.ts        # Comprehensive Terms, Privacy & Compliance copy
│   ├── lib/
│   │   ├── NexusNetworkNode.ts     # P2P mesh coordinator & WebSocket node client
│   │   ├── cacheStorage.ts         # Persistent browser CacheStorage sandbox management
│   │   ├── diskStreamer.ts         # Direct-to-disk streaming & File System Access API
│   │   ├── nameGenerator.ts        # Random cyberpunk callsign & station name generator
│   │   ├── nexusFailover.ts        # Decentralized host priority & failover consensus engine
│   │   └── utils.ts                # Styling utilities (tailwind-merge, clsx, formatBytes)
│   ├── nexus/                      # Modular swarm architecture & multi-peer state
│   │   ├── BatchTransferManager.ts # Multi-file batch transfer queue and chunk scheduler
│   │   ├── GlobalLog.tsx           # Synchronized network-wide audit event log
│   │   ├── NetworkMap.tsx          # Swarm node layout and connection link renderer
│   │   ├── NexusContainer.tsx      # Unified multi-peer workspace container
│   │   ├── NexusContext.tsx        # React Context providing global swarm state
│   │   ├── UnifiedVideoGrid.tsx    # Responsive grid layout for multi-peer video feeds
│   │   ├── index.ts                # Barrel export for modular Nexus subsystem
│   │   ├── syntheticMedia.ts       # Canvas-generated test patterns for call simulation
│   │   ├── types.ts                # Nexus swarm interfaces and event signatures
│   │   └── useNexusRTC.ts          # Custom hook orchestrating WebRTC swarm mesh
│   ├── transfer/                   # Dedicated lightweight transfer client bundle
│   │   ├── TransferApp.tsx         # Standalone file transfer focused interface
│   │   ├── main.tsx                # Transfer applet mounting entry point
│   │   ├── motion-mock.tsx         # Lightweight animation fallback for reduced overhead
│   │   └── transfer.html           # Dedicated HTML entry point for transfer client
│   ├── App.tsx                     # Main application coordinator & WebRTC engine
│   ├── index.css                   # Tailwind CSS v4 design tokens and theme styling
│   ├── main.tsx                    # React DOM root entry point
│   └── types.ts                    # Core TypeScript definitions (payloads, roles, logs)
├── index.html                      # Root HTML template with meta headers & CSP
├── metadata.json                   # Applet manifest & hardware permissions
├── package.json                    # Dependencies, scripts & build configuration
├── server.ts                       # Express + Vite development & production server
├── tsconfig.json                   # TypeScript project configuration
├── vite.config.ts                  # Vite build pipeline with single-file HTML plugin
└── vite.transfer.config.ts         # Secondary build configuration for transfer client
```

---

## 🚀 GitHub Pages Deployment Guide

This repository includes a pre-configured GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds and deploys Quantum Link automatically upon pushing to the `main` or `master` branch.

### Enabling GitHub Pages on your Repository:
1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "Deploy Quantum Link with updated structure"
   git push origin main
   ```
2. Navigate to your repository on GitHub: **Settings** > **Pages**.
3. Under **Build and deployment**:
   - Set **Source** to **GitHub Actions**.
4. The workflow in `.github/workflows/deploy.yml` will trigger, run the production build, package `./dist`, and publish your application.
5. Your live app will be accessible at:
   ```text
   https://<your-username>.github.io/<repository-name>/
   ```

---

## 🛠️ Quick Start & Local Development

### Prerequisites
- **Node.js**: `v18.0.0` or higher (Node 22 recommended)
- **npm**, **pnpm**, or **bun**
- Modern Web Browser with WebRTC support

### 1. Installation
```bash
git clone https://github.com/namanv2703/quantum-link.git
cd quantum-link
npm install
```

### 2. Start Local Development Server
```bash
# Launches Express server + Vite HMR on port 3000
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in two separate browser windows (or on separate devices on the same Wi-Fi) to test P2P connections.

### 3. Type Checking & Code Validation
```bash
npm run lint
```

---

## 📦 Production Deployment

### 1. Build Production Artifacts
```bash
npm run build
```
This single command executes:
- `vite build` — Compiles and optimizes assets into `dist/`.
- `vite-plugin-singlefile` — Packages self-contained single-file HTML builds into `FINAL NEXUS/` and `build/`.
- `esbuild server.ts` — Bundles the hybrid Node.js/WebSocket backend into `dist/server.cjs`.

### 2. Start Production Server
```bash
npm start
```
The server binds to `0.0.0.0:3000` (or the environment-specified `$PORT`), serves static assets, provides WebSocket signaling at `/ws/nexus`, and exposes health checks at `/api/health` and `/health` for container orchestrators like Google Cloud Run, Docker, and Kubernetes.

---

## 🔒 Privacy, Threat Model & Legal Compliance

- **Zero Cloud Storage**: Transferred files stream directly between peers and are never cached or stored on any remote cloud server.
- **End-to-End Cryptography**:
  - WebRTC DataChannels utilize **DTLS 1.2/1.3** and **SCTP** encryption (AES-128 / AES-256 GCM).
  - Media streams (audio, video, screen share) utilize **SRTP**.
- **No Centralized Telemetry**: No trackers, analytics SDKs, user fingerprinting, or external logging tools are embedded.
- **Local Sovereignty**: User profile information, avatars, custom usernames, and temporary file caches are stored exclusively in the browser's `localStorage` and `CacheStorage`.
- **Integrated Legal Hub**: Complete Terms of Service, Privacy Disclosures, Cookie Explanations, and Air-Gapped Security compliance documentation are directly accessible within the application via the **(i)** Info menu.

---

## 🌍 Browser Compatibility

| Browser | WebRTC DataChannels | Optical QR Scanning | Direct Disk Streaming (Bypass RAM) | Audio / Video Calling |
| :--- | :---: | :---: | :---: | :---: |
| **Google Chrome** (v88+) | ✅ Full | ✅ Full | ✅ Native File System Access API | ✅ Full |
| **Microsoft Edge** (v88+) | ✅ Full | ✅ Full | ✅ Native File System Access API | ✅ Full |
| **Brave / Chromium** | ✅ Full | ✅ Full | ✅ Native File System Access API | ✅ Full |
| **Mozilla Firefox** (v90+) | ✅ Full | ✅ Full | ⚠️ Instant Blob Fallback | ✅ Full |
| **Apple Safari** (macOS 14+) | ✅ Full | ✅ Full | ⚠️ Instant Blob Fallback | ✅ Full |
| **Apple Safari** (iOS 15+) | ✅ Full | ✅ Full | ⚠️ Instant Blob Fallback | ✅ Full |

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.
