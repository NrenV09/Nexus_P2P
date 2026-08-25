# Quantum Link 🌌

**Quantum Link** is an air-gapped, zero-server Peer-to-Peer (P2P) file transfer and secure communications station built entirely on modern web standards. It enables direct, encrypted device-to-device data exchange over WebRTC without requiring any central relay server, cloud storage, or intermediary backend.

---

## 🧠 Core Concepts & Architecture

### 1. Serverless WebRTC Signaling via Optical QR Codes
Traditional WebRTC applications require a centralized signaling server (WebSockets / HTTP) to exchange SDP (Session Description Protocol) offers and answers. **Quantum Link** replaces external signaling infrastructure with optical handshaking:
- **LZ-String Compression**: SDP session descriptions and ICE candidates are minified and compressed using LZ-String encoding to fit dense connection payloads into scannable QR codes.
- **Optical Air-Gap Exchange**: Devices establish connection simply by scanning each other's screens (Host Offer QR → Peer Scans & Generates Answer QR → Host Scans Answer QR).
- **Fallback Manual Sync**: For non-camera devices, compressed token strings can be copied and pasted directly.

### 2. Direct Peer-to-Peer Data Channels (`RTCDataChannel`)
Once the cryptographic handshake completes:
- Data flows directly between browsers over an encrypted SCTP/DTLS tunnel.
- Zero data packets pass through or touch a web server.
- Maximum possible local network speed (LAN/Wi-Fi) with low latency.

### 3. Chunked Binary Streaming & Memory-Safe Downloads
To transfer files of any size without causing browser crashes or memory leaks:
- **128 KB Chunk Slicing**: Outgoing files are partitioned into uniform 128KB binary chunks (`ArrayBuffer`) and streamed across the data channel with flow control.
- **Auto-Download & Direct Browser Prompt**: Incoming chunks are reconstructed as a binary `Blob` and immediately triggered through native browser download prompts (`URL.createObjectURL`), freeing memory buffers instantly.
- **In-Memory Payloads & Previews**: Users can toggle between automatic prompt downloading or viewing received files directly in the built-in media preview modal.

### 4. Single-File Standalone Portability (`vite-plugin-singlefile`)
- The entire application compiles into a single, self-contained HTML file (`finalwork.html` / `index.html` inside the `build/` directory).
- All CSS styles, React code, icons, font assets, and WebRTC logic are bundled inline.
- You can double-click and run the app straight from a USB stick, local disk, or offline air-gapped laptop in any modern web browser.

---

## ⚡ Key Modules & Features

| Module | Description |
| :--- | :--- |
| **P2P Transfer Station** | Drag-and-drop file uploader, real-time progress indicators, transfer cancellation, throughput monitoring, and auto-download controls. |
| **Secure Chat Node** | Ephemeral, end-to-end direct messaging between connected stations with timestamping and status telemetry. |
| **QR Utility Node** | Standalone tool to encode custom text into QR codes or scan arbitrary QR codes via webcam. |
| **Base64 Encoder/Decoder** | In-app converter to encode text/files into Base64 or decode raw Base64 strings. |
| **Identity & Profile Engine** | Local station identity with customizable cyber-themed usernames, avatar hues, and bios persisted in `localStorage`. |
| **Diagnostic HUD & Stream** | Live particle connection background, visual packet transfer animations, and a real-time event log terminal. |

---

## 📂 Build Artifacts & Standalone Distribution

Running the build process produces a self-contained offline distribution in the `build/` directory:

```
build/
├── index.html        # Standalone, single-file distribution (all assets inlined)
└── finalwork.html    # Standalone single-file HTML duplicate ready for distribution
```

To use it offline, open `build/finalwork.html` or `build/index.html` directly in Google Chrome, Mozilla Firefox, Apple Safari, or Microsoft Edge.

---

## 🚀 Getting Started & Development

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
```bash
npm install
```

### Start Development Server
```bash
npm run dev
```
The development server will boot on `http://0.0.0.0:3000`.

### Generate Standalone Single-File HTML
```bash
npm run build
```
This compiles the application and populates the `build/` folder with `finalwork.html` and `index.html`.

### Run Code Linter
```bash
npm run lint
```

---

## 🤝 Connection Workflow Step-by-Step

1. **Station A (Host)**:
   - Click **Host Station**.
   - A compressed Offer QR code will be generated on screen.
2. **Station B (Joiner)**:
   - Click **Join Station**.
   - Scan Station A's Offer QR (or paste the payload string).
   - Station B generates an Answer QR code.
3. **Station A (Finalize Handshake)**:
   - Station A scans Station B's Answer QR code (or pastes the payload).
   - Connection status transitions to **Network Secured** (Green).
4. **Transfer & Chat**:
   - Both nodes can now transmit files and chat directly.

---

## 🛡️ Privacy & Security Model

- **No Remote Telemetry**: No user analytics or tracking scripts.
- **Zero Third-Party Storage**: No files, messages, or metadata are ever stored on a remote server.
- **Local Client-Side Storage**: User preferences and identity profiles are stored locally in the browser's `localStorage`.

---

## 📜 License
MIT License.
