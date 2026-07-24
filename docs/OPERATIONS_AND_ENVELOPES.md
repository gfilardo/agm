# Air-Gapped Messenger (AGM) - Operations & Envelope Rules

This document presents the formal sequence of operations in AGM and details the exact **Outer Envelope** and **Inner Envelope** rules for each operation.

---

## Operations Overview & Envelope Matrix

| # | Operation | Outer Envelope Required? | Inner Envelope Required? | Envelope Rationale & Notes |
| :-: | :--- | :-: | :-: | :--- |
| **1** | **Identity Creation** | **No** | **No** | Local keypair generation (X25519/Ed25519) on Private Device. No transmission occurs. |
| **2A**| **Public Key Exchange (Out-Of-Band In-Person)** | **YES** (`KEY_EXCHANGE`) | **No** | Direct physical QR scan between air-gapped cameras. Outer Envelope provides protocol typing, CRC32 checksum, and display name metadata. Zero network footprint. |
| **2B**| **Public Key Exchange (Remote Relay)** | **STRICTLY PROHIBITED** | **No** | Transmitted over Signal/WhatsApp. **Omits all envelopes & headers**. Uses Elligator 2 uniform noise (Format 1 Hex / Format 2 `.dat` file) to guarantee 100% plausible deniability. |
| **3** | **Single Message Exchange (Airgap $\rightarrow$ Relay)** | **YES** (`ENCRYPTED_MESSAGE`)| **YES** | Encrypts text into zero-metadata Inner Envelope (trial decryptable), wrapped in Outer Envelope for camera scan to Public Relay. |
| **4** | **Single Message Exchange (Relay $\rightarrow$ Airgap Receiver)**| **YES** (`ENCRYPTED_MESSAGE`)| **YES** | Public Relay converts incoming ciphertext into Outer Envelope QR. Airgap receiver scans, peels Outer framing, and trial-decrypts Inner Envelope. |
| **5** | **File Exchange (Airgap $\rightarrow$ Relay)** | **YES** (`FILE_CHUNK`) | **YES** | Encrypts file binary into Inner Envelope, then slices into Outer Envelope chunks (`chunkIndex`, `totalChunks`, `streamId`). Streamed via animated QR sequence or USB `.bin`. |
| **6** | **File Exchange (Relay Receiver $\rightarrow$ Airgap Receiver)**| **YES** (`FILE_CHUNK`) | **YES** | Public Relay regenerates Outer Envelope chunk sequence as an animated QR stream on screen. Airgap receiver scans animation, reassembles chunks, and trial-decrypts Inner Envelope. |
| **7** | **Contact Management & Import** | N/A | N/A | Handles importing contacts from both In-Person Protobuf Envelopes (2A) and Remote Elligator 2 Noise Blobs (2B). |
| **8** | **Multi-Frame Optical Reassembly** | **YES** (`FILE_CHUNK`) | **YES** | Camera scanner state machine tracking missing chunk indices until 100% reassembled. |

---

## Detailed Sequence of Operations

### Operation 1: Identity Creation
1. **Context:** Private Device (Offline).
2. **Action:** User generates a new cryptographic identity.
3. **Execution:**
   - App calls `AGMCrypto.generateKeyPair()`.
   - Generates X25519 encryption keypair (`publicKey`, `secretKey`).
   - Computes `keyId` (first 8 bytes of SHA-512 over `publicKey`).
   - Stores keypair in encrypted local browser storage (`localStorage`).
4. **Envelope Status:** None.

---

### Operation 2A: Public Key Exchange - Out-Of-Band (In-Person QR)
1. **Context:** Airgap Device A $\rightarrow$ Airgap Device B (Direct physical camera scan).
2. **Rationale for Envelope:** Because the light channel between two physical cameras is 100% local and private, there is zero risk of network eavesdropping. The Outer Envelope provides self-describing protocol typing (so Device B's camera knows to open "Add Contact"), framing checksums, and display alias metadata.
3. **Payload Structure:**
   - **Outer Envelope:** `version = 1`, `type = PacketType.KEY_EXCHANGE`, `payload = Protobuf(PublicKeyPayload)`.
   - **Inner Envelope:** Omitted (cannot encrypt for unknown peer).
4. **Execution:** Device A renders Protobuf Outer Envelope as QR. Device B scans QR, verifies CRC32 checksum, extracts `displayName` and `publicKey`, and saves contact.

---

### Operation 2B: Public Key Exchange - Remote Relay (Plausibly Deniable)
1. **Context:** Airgap Device A $\rightarrow$ Public Relay A $\rightarrow$ Network $\rightarrow$ Public Relay B $\rightarrow$ Airgap Device B.
2. **Rationale for NO Envelope:** Explicit headers or `KEY_EXCHANGE` tags sent over Signal/WhatsApp reveal key exchange intent and compromise plausible deniability.
3. **Payload Formats:**
   - **Format 1 (Raw Hex Text):** Elligator 2 encodes the 32-byte public key into 32 bytes of uniform random noise, formatted as a 64-character hex string (`e3b0c44298fc1c1...`).
   - **Format 2 (Generic Binary File):** Elligator 2 noise bytes padded with random bytes and saved as `key_data.dat`.
4. **Metadata Privacy Mechanics:** Because 100% of all 32-byte strings decode to a valid curve point under Elligator 2, network analytics filters obtain zero evidence that $r$ was intended as a key rather than uniform random noise (see [Technical Specification Section 2.3](TECHNICAL_SPECIFICATION.md#23-mathematical-basis-of-unobtrusive-privacy-in-elligator-2)).
5. **Execution:** Sender pastes/sends hex string or `.dat` file via chat network. Recipient pastes string or imports file into Airgap Device B, which executes `Elligator2.decode()` to recover the public key and save the contact.

---

### Operation 3: Single Message Exchange (Airgap Sender $\rightarrow$ Relay)
1. **Context:** Airgap Sender $\rightarrow$ Public Relay Sender.
2. **Execution:**
   - Sender selects recipient public key and enters plaintext text message.
   - App creates **InnerPayload** (`senderKeyId`, `timestamp`, `contentType="text"`, `content=messageBytes`).
   - App generates ephemeral X25519 keypair and creates fixed **80-byte InnerEnvelopeHeader** (`ephemeralPublicKey`, `headerMac`, `encryptedSymKey`).
   - App encrypts InnerPayload using symmetric key $K_{payload}$ into `InnerEnvelope.ciphertext`.
   - App wraps InnerEnvelope into **OuterEnvelope** (`type=PacketType.ENCRYPTED_MESSAGE`).
   - Renders OuterEnvelope as QR code or text payload.
3. **Relay Action:** Public Relay scans QR, extracts payload string, and auto-copies to clipboard for pasting into Signal/WhatsApp.

---

### Operation 4: Single Message Exchange (Relay Receiver $\rightarrow$ Airgap Receiver)
1. **Context:** Public Relay Receiver $\rightarrow$ Airgap Receiver.
2. **Execution:**
   - User pastes incoming Signal/WhatsApp text into Public Relay app.
   - Public Relay renders payload as a full-screen QR code.
   - Airgap Receiver scans QR code and extracts OuterEnvelope payload.
   - Airgap Receiver executes **Header-Only Trial Decryption** across stored identity keyrings on the 80-byte InnerEnvelopeHeader.
   - Upon MAC verification success, decrypts payload key $K_{payload}$, decrypts `ciphertext`, and prints decrypted plaintext message.

---

### Operation 5: File Exchange (Airgap Sender $\rightarrow$ Relay)
1. **Context:** Airgap Sender $\rightarrow$ Public Relay Sender.
2. **Execution:**
   - User selects file (photo, document, archive) on Airgap device.
   - App encrypts entire file binary into an **InnerEnvelope** (with 80-byte trial decryption header).
   - If payload exceeds single QR capacity (~1.5 KB), app slices InnerEnvelope bytes into chunks of size $N$ bytes (e.g. 500 bytes/chunk).
   - Each chunk is wrapped in an **OuterEnvelope** (`type=PacketType.FILE_CHUNK`, `chunkIndex=i`, `totalChunks=T`, `streamId=UUID`, `checksum=CRC32`).
3. **Output:**
   - **Option A (Animated QR Stream):** Plays animated sequence of QR codes at selectable FPS.
   - **Option B (Single Payload File):** Exports complete payload as `payload.bin` for transfer via USB/SD card to Public Relay.

---

### Operation 6: File Exchange (Relay Receiver $\rightarrow$ Airgap Receiver)
1. **Context:** Public Relay Receiver $\rightarrow$ Airgap Receiver.
2. **Execution:**
   - Public Relay imports `payload.bin` or receives network stream.
   - If displaying to Airgap camera, Public Relay renders **Animated QR Stream** of OuterEnvelope chunks.
   - Airgap Receiver camera scans animated sequence. Frame reassembler state machine tracks received `chunkIndex` bits until 100% of chunks are collected.
   - Reassembles OuterEnvelope chunks into complete InnerEnvelope blob.
   - Performs Header Trial Decryption, decrypts file binary, and triggers browser file download.
