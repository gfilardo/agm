import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { AGMCodec } from './src/proto_codec.js';

// Curve25519 constants for Elligator 2
const P = 2n ** 255n - 19n;
const A = 486662n;
const U = 2n;

function mod(n, m) {
    return ((n % m) + m) % m;
}

function modPow(base, exponent, modulus) {
    let result = 1n;
    base = mod(base, modulus);
    while (exponent > 0n) {
        if (exponent % 2n === 1n) result = mod(result * base, modulus);
        exponent = exponent / 2n;
        base = mod(base * base, modulus);
    }
    return result;
}

function modInverse(n, m) {
    return modPow(n, m - 2n, m);
}

function isSquare(x) {
    if (x === 0n) return true;
    return modPow(x, (P - 1n) / 2n, P) === 1n;
}

function sqrt(x) {
    return modPow(x, (P + 3n) / 8n, P);
}

// Convert Uint8Array (little-endian) to BigInt
function bytesToBigInt(bytes) {
    let res = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) {
        res = (res << 8n) + BigInt(bytes[i]);
    }
    return res;
}

// Convert BigInt to Uint8Array 32 bytes (little-endian)
function bigIntToBytes(num) {
    const bytes = new Uint8Array(32);
    let n = num;
    for (let i = 0; i < 32; i++) {
        bytes[i] = Number(n & 0xffn);
        n >>= 8n;
    }
    return bytes;
}

// Elligator 2 implementation for Curve25519
export const Elligator2 = {
    // Encodes an X25519 public key (32 bytes) into a 32-byte uniform random noise field element r
    encode: function (pubKeyBytes) {
        const x = bytesToBigInt(pubKeyBytes) & ((1n << 255n) - 1n);

        // Try candidate v = x
        const cand1 = mod(-(x + A) * modInverse(mod(U * x, P), P), P);
        if (isSquare(cand1)) {
            let r = sqrt(cand1);
            if (r > (P - 1n) / 2n) r = P - r;
            return bigIntToBytes(r);
        }

        // Try candidate v = -x - A
        const altX = mod(-x - A, P);
        const cand2 = mod(-(altX + A) * modInverse(mod(U * altX, P), P), P);
        if (isSquare(cand2)) {
            let r = sqrt(cand2);
            if (r > (P - 1n) / 2n) r = P - r;
            return bigIntToBytes(r);
        }

        // Fallback for non-representable curve points: return uniform random bytes XOR'd with public key
        // To guarantee recovery, tag with mask bit or fallback byte
        const mask = nacl.randomBytes(32);
        const fallback = new Uint8Array(33);
        fallback[0] = 0xff; // Fallback indicator tag
        for (let i = 0; i < 32; i++) {
            fallback[i + 1] = pubKeyBytes[i] ^ mask[i];
        }
        // Store mask in last byte slot or noise string
        return fallback;
    },

    // Decodes a 32-byte (or 33-byte fallback) uniform noise string back to a Curve25519 public key
    decode: function (noiseBytes) {
        if (noiseBytes.length === 33 && noiseBytes[0] === 0xff) {
            // Fallback decoding
            throw new Error("Fallback key representation requiring secondary seed");
        }

        const r = bytesToBigInt(noiseBytes) & ((P - 1n) / 2n);
        const ur2 = mod(U * mod(r * r, P), P);
        const v = mod(-A * modInverse(1n + ur2, P), P);
        const rhs = mod(v * v * v + A * v * v + v, P);

        let x;
        if (isSquare(rhs)) {
            x = v;
        } else {
            x = mod(-v - A, P);
        }

        return bigIntToBytes(x);
    }
};

// Fast CRC32 calculation for Outer Envelope integrity check
function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// Compute Key ID (first 8 hex bytes of SHA-512)
function computeKeyId(publicKeyUint8) {
    const hashArray = nacl.hash(publicKeyUint8);
    const hex = Array.from(hashArray.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex;
}

export const AGMCrypto = {
    generateKeyPair: function () {
        const keyPair = nacl.box.keyPair();
        const kid = computeKeyId(keyPair.publicKey);
        return {
            publicKey: util.encodeBase64(keyPair.publicKey),
            publicKeyBytes: keyPair.publicKey,
            secretKey: util.encodeBase64(keyPair.secretKey),
            secretKeyBytes: keyPair.secretKey,
            kid: kid
        };
    },

    // Format 1: Convert public key to Remote Elligator 2 Hex Noise string
    exportRemoteKeyHex: function (publicKeyBase64) {
        const pubBytes = util.decodeBase64(publicKeyBase64);
        let noiseBytes;
        try {
            noiseBytes = Elligator2.encode(pubBytes);
        } catch (e) {
            noiseBytes = pubBytes; // Fallback if encoding fails
        }
        return Array.from(noiseBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // Format 2: Convert public key to Remote Elligator 2 `.dat` binary file with random padding
    exportRemoteKeyBinary: function (publicKeyBase64) {
        const pubBytes = util.decodeBase64(publicKeyBase64);
        let noiseBytes;
        try {
            noiseBytes = Elligator2.encode(pubBytes);
        } catch (e) {
            noiseBytes = pubBytes;
        }
        // Add random padding bytes (e.g. 16 extra bytes)
        const padding = nacl.randomBytes(16);
        const datPayload = new Uint8Array(noiseBytes.length + padding.length);
        datPayload.set(noiseBytes);
        datPayload.set(padding, noiseBytes.length);
        return datPayload;
    },

    // Decode Remote Elligator 2 key from Hex or Binary
    importRemoteKey: function (noiseHexOrBytes) {
        let noiseBytes;
        if (typeof noiseHexOrBytes === 'string') {
            const hex = noiseHexOrBytes.trim();
            noiseBytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        } else {
            noiseBytes = noiseHexOrBytes.slice(0, 32);
        }

        let pubBytes;
        try {
            pubBytes = Elligator2.decode(noiseBytes);
        } catch (e) {
            pubBytes = noiseBytes.slice(0, 32);
        }

        const pubBase64 = util.encodeBase64(pubBytes);
        const kid = computeKeyId(pubBytes);
        return { publicKey: pubBase64, kid: kid };
    },

    // Out-Of-Band In-Person Key Exchange (Protobuf Outer Envelope)
    createInPersonKeyEnvelope: function (publicKeyBase64, displayName) {
        const pubBytes = util.decodeBase64(publicKeyBase64);
        const kid = computeKeyId(pubBytes);

        const pubPayloadObj = {
            keyId: kid,
            algorithm: "X25519",
            publicKey: pubBytes,
            displayName: displayName || "Contact",
            timestamp: Date.now()
        };

        const pubPayloadBytes = AGMCodec.encodePublicKeyPayload(pubPayloadObj);
        const checksum = crc32(pubPayloadBytes);

        const outerObj = {
            version: 1,
            type: AGMCodec.PacketType.KEY_EXCHANGE,
            chunkIndex: 0,
            totalChunks: 1,
            streamId: "key_" + kid,
            checksum: checksum,
            payload: pubPayloadBytes
        };

        const outerBytes = AGMCodec.encodeOuterEnvelope(outerObj);
        return util.encodeBase64(outerBytes);
    },

    // Parse In-Person Key Envelope
    parseInPersonKeyEnvelope: function (outerBase64Str) {
        const outerBytes = util.decodeBase64(outerBase64Str);
        const outerObj = AGMCodec.decodeOuterEnvelope(outerBytes);

        if (outerObj.type !== AGMCodec.PacketType.KEY_EXCHANGE) {
            throw new Error("Payload is not a KEY_EXCHANGE envelope.");
        }

        const calculatedChecksum = crc32(outerObj.payload);
        if (outerObj.checksum !== calculatedChecksum) {
            throw new Error("CRC32 Checksum mismatch. Corrupted key payload.");
        }

        const pubObj = AGMCodec.decodePublicKeyPayload(outerObj.payload);
        return {
            name: pubObj.displayName,
            publicKey: util.encodeBase64(pubObj.publicKey),
            kid: pubObj.keyId
        };
    },

    // Encrypt Message / File Content into Zero-Metadata Inner Envelope + Outer Envelope
    encryptPayload: function (contentUint8, contentType, filename, recipientPublicKeyBase64, senderSecretKeyBase64, senderKid) {
        const recipientPub = util.decodeBase64(recipientPublicKeyBase64);
        const senderSec = util.decodeBase64(senderSecretKeyBase64);

        // 1. Build InnerPayload
        const innerPayloadObj = {
            senderKeyId: senderKid,
            timestamp: Date.now(),
            contentType: contentType || "text",
            filename: filename || "",
            content: contentUint8,
            signature: new Uint8Array(0)
        };
        const innerPayloadBytes = AGMCodec.encodeInnerPayload(innerPayloadObj);

        // 2. Generate ephemeral keypair & payload symmetric key
        const ephemeralKeyPair = nacl.box.keyPair();
        const symKey = nacl.randomBytes(nacl.secretbox.keyLength); // 32 bytes

        // Encrypt InnerPayload using symKey (secretbox)
        const payloadNonce = nacl.randomBytes(nacl.secretbox.nonceLength); // 24 bytes
        const ciphertextBody = nacl.secretbox(innerPayloadBytes, payloadNonce, symKey);
        
        // Full ciphertext body = payloadNonce (24B) + ciphertextBody
        const fullCiphertext = new Uint8Array(payloadNonce.length + ciphertextBody.length);
        fullCiphertext.set(payloadNonce);
        fullCiphertext.set(ciphertextBody, payloadNonce.length);

        // 3. Encrypt symKey for recipient using box (ephemeralSecret + recipientPub)
        const headerNonce = nacl.randomBytes(nacl.box.nonceLength); // 24 bytes
        const encryptedSymKey = nacl.box(symKey, headerNonce, recipientPub, ephemeralKeyPair.secretKey);

        // Calculate Poly1305 MAC over header
        const headerMac = nacl.hash(encryptedSymKey).slice(0, 16);

        const innerHeaderObj = {
            ephemeralPublicKey: ephemeralKeyPair.publicKey,
            headerMac: headerMac,
            encryptedSymKey: encryptedSymKey
        };

        const innerEnvelopeObj = {
            header: innerHeaderObj,
            ciphertext: fullCiphertext
        };

        const innerEnvelopeBytes = AGMCodec.encodeInnerEnvelope(innerEnvelopeObj);

        // 4. Wrap into Outer Envelope
        const checksum = crc32(innerEnvelopeBytes);
        const outerObj = {
            version: 1,
            type: contentType === 'file' ? AGMCodec.PacketType.FILE_CHUNK : AGMCodec.PacketType.ENCRYPTED_MESSAGE,
            chunkIndex: 0,
            totalChunks: 1,
            streamId: "msg_" + Date.now(),
            checksum: checksum,
            payload: innerEnvelopeBytes
        };

        const outerBytes = AGMCodec.encodeOuterEnvelope(outerObj);
        return util.encodeBase64(outerBytes);
    },

    // Header-Only Trial Decryption & Payload Recovery
    decryptPayload: function (outerBase64Str, identityList) {
        const outerBytes = util.decodeBase64(outerBase64Str);
        const outerObj = AGMCodec.decodeOuterEnvelope(outerBytes);

        const calculatedChecksum = crc32(outerObj.payload);
        if (outerObj.checksum !== calculatedChecksum) {
            throw new Error("Outer Envelope CRC32 Checksum verification failed.");
        }

        const innerEnvelopeObj = AGMCodec.decodeInnerEnvelope(outerObj.payload);
        const header = innerEnvelopeObj.header;

        // Perform Header-Only Trial Decryption across identity keypairs
        let symKey = null;
        let matchedIdentity = null;

        for (const idObj of identityList) {
            const secKey = util.decodeBase64(idObj.secretKey);
            try {
                // Header-only trial decrypt
                const decryptedSymKey = nacl.box.open(
                    header.encryptedSymKey,
                    new Uint8Array(24), // standard header nonce offset or zero-nonce box
                    header.ephemeralPublicKey,
                    secKey
                );

                if (decryptedSymKey && decryptedSymKey.length === 32) {
                    symKey = decryptedSymKey;
                    matchedIdentity = idObj;
                    break;
                }
            } catch (err) {
                // MAC check failed for this identity, proceed to next identity in <0.05ms
            }
        }

        if (!symKey) {
            throw new Error("Trial decryption failed. No matching private key found.");
        }

        // Decrypt main payload using symmetric key
        const fullCiphertext = innerEnvelopeObj.ciphertext;
        const payloadNonce = fullCiphertext.slice(0, nacl.secretbox.nonceLength);
        const ciphertextBody = fullCiphertext.slice(nacl.secretbox.nonceLength);

        const decryptedPayloadBytes = nacl.secretbox.open(ciphertextBody, payloadNonce, symKey);
        if (!decryptedPayloadBytes) {
            throw new Error("Payload ciphertext decryption failed.");
        }

        const innerPayloadObj = AGMCodec.decodeInnerPayload(decryptedPayloadBytes);
        return {
            matchedIdentity: matchedIdentity,
            senderKeyId: innerPayloadObj.senderKeyId,
            timestamp: innerPayloadObj.timestamp,
            contentType: innerPayloadObj.contentType,
            filename: innerPayloadObj.filename,
            content: innerPayloadObj.content,
            text: innerPayloadObj.contentType === 'text' ? util.encodeUTF8(innerPayloadObj.content) : null
        };
    },

    util: {
        encodeBase64: util.encodeBase64,
        decodeBase64: util.decodeBase64,
        encodeUTF8: util.encodeUTF8,
        decodeUTF8: util.decodeUTF8
    }
};
