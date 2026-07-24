# Air-Gapped Messenger (AGM)

An asymmetric, ultra-secure messaging system that eliminates operating-system, memory-scraping, and network-based attack vectors by isolating cryptographic key generation, message encryption, and decryption on a device physically disconnected from the internet (*air-gapped*).

AGM utilizes existing commercial messaging networks (e.g., Signal, WhatsApp, Telegram) as blind data transport relays ("postmen") for encrypted, anonymized payloads via optical QR scanning, file attachments, and clipboard orchestration.

---

## Documentation Directory

The project documentation has been modularized into focused technical specifications and guides:

* 📖 **[Concept & User Guide](docs/CONCEPT_AND_USAGE.md):** Architectural vision, device roles, initial offline hydration (Service Worker / Native APK), and step-by-step user workflows.
* 🛠️ **[Technical Specification](docs/TECHNICAL_SPECIFICATION.md):** Cryptographic primitives (X25519, XSalsa20, Poly1305, Elligator 2), Zero-Metadata Trial Decryption, Protobuf schemas, browser sandbox mitigations, and hardware compatibility.
* ✉️ **[Operations & Envelopes Matrix](docs/OPERATIONS_AND_ENVELOPES.md):** Detailed step-by-step operational sequence (Operations 1 through 8), specifying explicit Outer and Inner Envelope requirements, dual key exchange modes (In-Person vs Remote Elligator 2), and multi-frame optical QR streaming.

---

## Security Principles at a Glance

1. **Absolute Private Key Isolation:** Private keys are generated and stored exclusively on the air-gapped device and **never** exfiltrated.
2. **Device-Enclosed Cryptography:** All encryption, decryption, and MAC verification occur on the air-gapped terminal. Relays act solely as blind couriers.
3. **Zero-Metadata & Plausible Deniability:** Ciphertexts contain zero magic bytes, zero plaintext headers, and zero key IDs (`kid`). Payloads are mathematically indistinguishable from random noise.
4. **Header-Only Trial Decryption:** Payloads feature a fixed 80-byte header block that allows the air-gapped recipient to verify ownership in $<0.05$ ms without decrypting multi-megabyte payloads.
5. **Dense Protobuf Serialization:** Protocol Buffers are used to achieve maximum serialization density per QR frame.

---

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Start HTTPS local development server (with basic-ssl)
npm run dev

# Build production bundle / single-file release
npm run build
```

See [docs/CONCEPT_AND_USAGE.md](docs/CONCEPT_AND_USAGE.md) for full instructions on running the offline terminal on Android or Linux.
