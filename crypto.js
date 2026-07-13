import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

// Helper: generate Key_ID via SHA-512 (using NaCl)
function computeKeyId(publicKeyUint8) {
    const hashArray = nacl.hash(publicKeyUint8);
    // Take first 8 bytes and convert to hex
    const hex = Array.from(hashArray.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex;
}

export const AGWMCrypto = {
    generateKeyPair: function() {
        const keyPair = nacl.box.keyPair();
        const kid = computeKeyId(keyPair.publicKey);
        return {
            publicKey: util.encodeBase64(keyPair.publicKey),
            secretKey: util.encodeBase64(keyPair.secretKey),
            kid: kid
        };
    },

    // Encrypt message for recipient
    encryptMessage: function(messageStr, recipientPublicKeyBase64, senderSecretKeyBase64) {
        const recipientPub = util.decodeBase64(recipientPublicKeyBase64);
        const senderSec = util.decodeBase64(senderSecretKeyBase64);
        
        const nonce = nacl.randomBytes(nacl.box.nonceLength);
        const messageUint8 = util.decodeUTF8(messageStr);
        
        const encrypted = nacl.box(messageUint8, nonce, recipientPub, senderSec);
        
        // Payload format: nonce (24 bytes) + ciphertext
        const payload = new Uint8Array(nonce.length + encrypted.length);
        payload.set(nonce);
        payload.set(encrypted, nonce.length);
        
        return util.encodeBase64(payload);
    },

    // Decrypt message from sender
    decryptMessage: function(payloadBase64, senderPublicKeyBase64, mySecretKeyBase64) {
        try {
            const payload = util.decodeBase64(payloadBase64);
            const senderPub = util.decodeBase64(senderPublicKeyBase64);
            const mySec = util.decodeBase64(mySecretKeyBase64);

            const nonce = payload.slice(0, nacl.box.nonceLength);
            const ciphertext = payload.slice(nacl.box.nonceLength);

            const decrypted = nacl.box.open(ciphertext, nonce, senderPub, mySec);
            if (!decrypted) {
                throw new Error("Decryption failed (invalid key or tampered payload).");
            }
            
            return util.encodeUTF8(decrypted);
        } catch (err) {
            console.error("Decryption error:", err);
            return null;
        }
    },

    util: {
        encodeBase64: util.encodeBase64,
        decodeBase64: util.decodeBase64,
        encodeUTF8: util.encodeUTF8,
        decodeUTF8: util.decodeUTF8
    }
};
