# LazyShare — Phase 1 Build Prompt: Discovery, Connection & Transfer

## Goal
Build the real, working core of a mobile-to-mobile file-share app in Expo (React Native): two phones on the same Wi-Fi network discover each other, establish a direct connection, and transfer a file — no internet, no third-party server. This phase must work reliably and fast. All deliberate slowness/friction is a separate phase 2 layered on top later — do not add any artificial delay, gating, or friction in this phase.

## Platform constraints (read first)
- **Expo Dev Client / EAS build required.** Raw TCP sockets and mDNS/Zeroconf need native modules that plain Expo Go does not support. Set up `expo-dev-client` and a custom development build from the start.
- Both devices must be on the same local Wi-Fi network/subnet.
- iOS 14+ requires the **Local Network** permission prompt (`NSLocalNetworkUsageDescription`) and, for Bonjour, an `NSBonjourServices` entry in `Info.plist` declaring the service type.
- Android requires the network state / Wi-Fi access permissions and, on Android 12+, nearby-device permission handling if using Wi-Fi Aware — **skip Wi-Fi Aware for phase 1**, use standard mDNS over the LAN instead for simplicity.

## Roles
- **Receiver**: advertises itself on the network and hosts a lightweight TCP listener.
- **Sender**: browses for receivers, connects, and pushes the file.

## Recommended stack
| Concern | Library |
|---|---|
| Service advertise/discover (mDNS/Bonjour) | `react-native-zeroconf` |
| TCP socket (client + server) | `react-native-tcp-socket` |
| File access | `expo-file-system` |
| Checksums | `expo-crypto` (SHA-256) |
| Dev build tooling | `expo-dev-client`, EAS Build |

## Features (concise spec per item)

### 1. Service advertisement (receiver)
- On "Receive" screen mount, register a Bonjour/mDNS service via `react-native-zeroconf`: type `_lazyshare._tcp.`, a random `instanceName` (device name + short id), and a free TCP port.
- Simultaneously start a TCP server on that port via `react-native-tcp-socket`.
- Unregister/stop server on unmount or when a transfer completes.

### 2. Discovery (sender)
- On "Send" screen mount, start Zeroconf browsing for `_lazyshare._tcp.`.
- Render discovered receivers as a live list (name, resolved IP, port). Update on `resolved`/`remove` events.
- Handle "no devices found" and "scanning" states explicitly.

### 3. Connection handshake
- Sender picks a receiver from the list, opens a TCP socket to `ip:port`.
- First message (JSON, newline-delimited): `{ type: "handshake", deviceName, fileName, fileSize, mimeType, checksum }`.
- Receiver replies `{ type: "accept" }` or `{ type: "reject", reason }`. Sender must wait for `accept` before streaming file bytes.

### 4. File selection & metadata
- Sender picks a file via `expo-document-picker` (or `expo-image-picker` for media).
- Compute SHA-256 checksum with `expo-crypto` before sending; include in handshake.

### 5. Transfer protocol
- After `accept`, sender streams the file as length-prefixed binary chunks over the same TCP socket: `[4-byte chunk length][chunk bytes]`, repeated, then a final zero-length chunk to signal EOF.
- Chunk size: 16–64 KB (tune for throughput).
- Receiver writes incoming chunks directly to disk via `expo-file-system` (streaming write, not buffering the whole file in memory).

### 6. Progress reporting
- Both sides track bytes transferred vs. `fileSize` from the handshake and expose a progress value (0–1) to the UI via a simple event emitter or state callback per chunk.

### 7. Completion & verification
- After EOF, receiver computes SHA-256 of the written file and compares to the handshake checksum.
- Receiver sends `{ type: "complete", verified: true|false }` back over the socket, then both sides close the connection.
- Surface verification failure clearly in the UI (do not silently accept a corrupted file).

### 8. Error handling
- Socket errors, timeouts (e.g., no handshake response in 10s), and permission denials must all produce a distinct, user-visible state — not a silent hang.
- If the receiver rejects or the connection drops mid-transfer, clean up the partial file on the receiver's side.

## Data flow (sequence)
1. Receiver: advertise service → start TCP listener → wait.
2. Sender: browse → list devices → user selects one.
3. Sender: pick file → compute checksum → open TCP connection.
4. Sender → Receiver: handshake (metadata + checksum).
5. Receiver → Sender: accept/reject.
6. Sender → Receiver: chunked file stream → EOF marker.
7. Receiver: verify checksum → send complete/failure.
8. Both: close socket, update UI to "Transfer complete" or error state.

## Explicitly out of scope for phase 1
Anything from the "lazy" concept — artificial delays, distance-based pausing, CAPTCHAs, shake gates, queue tickets, fake progress. Build this phase as a straightforward, fast, working transfer; the friction layer gets bolted on afterward as phase 2 without touching this core protocol.
