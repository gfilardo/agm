# Air-Gapped Messenger (AGM) - Concept & User Guide

## 1. Executive Summary & Vision

**Air-Gapped Messenger (AGM)** is an asymmetric, ultra-secure communication system designed to eliminate operating-system, memory-scraping, and network-based attack vectors. It operates by strictly isolating cryptographic key generation, payload encryption, and decryption on a physical device permanently disconnected from the internet (*the Air-Gapped Private Device*).

AGM leverages existing commercial messaging networks (e.g., Signal, WhatsApp, Telegram) as blind data transport relays ("postmen") for encrypted, anonymized payloads via optical QR scanning, file transfer, and clipboard orchestration.

---

## 2. Core Execution Contexts

AGM splits operations across two physical device contexts running the web application:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PRIVATE DEVICE CONTEXT (Air-Gapped / Offline Terminal)                   │
│ • Network State: Permanent Airplane Mode / Offline APK                   │
│ • Role: Key custodian, encryption & decryption engine                   │
│ • Capabilities: Holds private keys; zero network access                 │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Optical Scanning (QR) / USB File
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PUBLIC RELAY CONTEXT (Online Courier / Postman)                         │
│ • Network State: Connected to Internet (Wi-Fi / Cellular)               │
│ • Role: Blind data courier between user and commercial chat networks    │
│ • Capabilities: Zero knowledge of private keys or unencrypted data      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. User Guide & Getting Started

### 3.1 Initial Hydration & Offline Deployment

#### Option A: Native Standalone APK (Recommended for Android)
1. Download `agm-offline-terminal.apk` from the official release page.
2. Transfer the `.apk` file to your target offline Android device via USB.
3. Install the APK. It runs as a native application with permanent camera permissions and zero network access.

#### Option B: Persistent Web Browser Service Worker
1. While connected to HTTPS (e.g. `https://your-domain.github.io/agm`), open the web app on your target device.
2. The Service Worker automatically caches all application code, assets, and WASM/JS modules.
3. Enable **Airplane Mode** (disconnect Wi-Fi, Bluetooth, Cellular).
4. Refresh or reopen the browser page offline. The browser treats the HTTPS origin as a **Secure Context**, allowing full camera access while completely offline.

---

## 4. Operational Workflows Guide

### Operation 1: Generating an Identity
1. Open the **Private Device** view.
2. Navigate to **Identities** tab.
3. Enter an identity label (e.g., "Personal Airgap") and tap **Generate Keypair**.
4. Your private key is stored exclusively in your offline browser's encrypted local storage.

### Operation 2A: In-Person Public Key Exchange (Out-Of-Band)
*Use this when meeting a contact physically in person.*
1. On your Private Device, go to **Identities** $\rightarrow$ **In-Person Key QR**.
2. Have your contact open their Private Device, go to **Contacts** $\rightarrow$ **Scan Contact QR**.
3. Point their camera at your screen to instantly save your contact profile.

### Operation 2B: Remote Public Key Exchange (Plausibly Deniable)
*Use this when sharing your public key over WhatsApp, Signal, or Email.*
1. On your Private Device, go to **Identities** $\rightarrow$ **Remote Plausible Key**.
2. Select your transport format:
   - **Format 1 (Raw Hex Text):** Copy the 64-character noise string and paste it into Signal/WhatsApp.
   - **Format 2 (Generic Binary File):** Download `key_data.dat` and send it as a file attachment.
3. When your contact receives the text/file, they paste or import it into their Private Device under **Contacts** $\rightarrow$ **Import Noise Key**. The app decodes the key and saves the contact.

### Operation 3 & 4: Exchanging Encrypted Messages
1. **Compose (Airgap Sender):** In Private Mode, select recipient, type message, and click **Encrypt to QR/Payload**.
2. **Relay Out (Public Relay Sender):** Scan the outgoing QR code with your online phone. Auto-copy payload to clipboard and paste into Signal/WhatsApp chat.
3. **Relay In (Public Relay Receiver):** Copy incoming text/QR from Signal/WhatsApp into Public Relay Mode $\rightarrow$ **Receive**. Display generated QR on screen.
4. **Decrypt (Airgap Receiver):** In Private Mode $\rightarrow$ **Read**, point camera at Public Relay screen. The air-gapped device uses **Header-Only Trial Decryption** across your stored identities to decrypt and print the message.

### Operation 5 & 6: Exchanging Files & Documents
1. **Encrypt & Chunk (Airgap Sender):** Go to Private Mode $\rightarrow$ **Send File**. Select file (photo, PDF, document). The app encrypts the file into an Inner Envelope and slices it into Outer Envelope chunks.
2. **Optical Stream or File Export:**
   - **Small Files:** Play the **Animated QR Stream** on screen and scan with Public Relay.
   - **Large Files:** Export `payload.bin` and copy to Public Relay via USB/Share Sheet.
3. **Dispatch:** Send `payload.bin` or copied text via Signal/WhatsApp.
4. **Receive & Reassemble (Airgap Receiver):** Recipient imports `payload.bin` or scans the Animated QR stream from their Public Relay. The offline device reassembles the chunks, trial-decrypts the Inner Envelope, and restores the original file.
