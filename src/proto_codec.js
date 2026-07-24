import protobuf from 'protobufjs/light';

// Statically compiled Protobuf JSON Root for 100% offline bundling & zero network fetches
const rootJson = {
  nested: {
    agm: {
      nested: {
        PacketType: {
          values: {
            UNKNOWN: 0,
            KEY_EXCHANGE: 1,
            ENCRYPTED_MESSAGE: 2,
            FILE_CHUNK: 3
          }
        },
        OuterEnvelope: {
          fields: {
            version: { type: "uint32", id: 1 },
            type: { type: "PacketType", id: 2 },
            chunkIndex: { type: "uint32", id: 3 },
            totalChunks: { type: "uint32", id: 4 },
            streamId: { type: "string", id: 5 },
            checksum: { type: "uint32", id: 6 },
            payload: { type: "bytes", id: 7 }
          }
        },
        InnerEnvelopeHeader: {
          fields: {
            ephemeralPublicKey: { type: "bytes", id: 1 },
            headerMac: { type: "bytes", id: 2 },
            encryptedSymKey: { type: "bytes", id: 3 }
          }
        },
        InnerEnvelope: {
          fields: {
            header: { type: "InnerEnvelopeHeader", id: 1 },
            ciphertext: { type: "bytes", id: 2 }
          }
        },
        InnerPayload: {
          fields: {
            senderKeyId: { type: "string", id: 1 },
            timestamp: { type: "uint64", id: 2 },
            contentType: { type: "string", id: 3 },
            filename: { type: "string", id: 4 },
            content: { type: "bytes", id: 5 },
            signature: { type: "bytes", id: 6 }
          }
        },
        PublicKeyPayload: {
          fields: {
            keyId: { type: "string", id: 1 },
            algorithm: { type: "string", id: 2 },
            publicKey: { type: "bytes", id: 3 },
            displayName: { type: "string", id: 4 },
            timestamp: { type: "uint64", id: 5 },
            signature: { type: "bytes", id: 6 }
          }
        }
      }
    }
  }
};

const root = protobuf.Root.fromJSON(rootJson);

const OuterEnvelope = root.lookupType("agm.OuterEnvelope");
const InnerEnvelope = root.lookupType("agm.InnerEnvelope");
const InnerEnvelopeHeader = root.lookupType("agm.InnerEnvelopeHeader");
const InnerPayload = root.lookupType("agm.InnerPayload");
const PublicKeyPayload = root.lookupType("agm.PublicKeyPayload");

export const AGMCodec = {
  PacketType: {
    UNKNOWN: 0,
    KEY_EXCHANGE: 1,
    ENCRYPTED_MESSAGE: 2,
    FILE_CHUNK: 3
  },

  // Outer Envelope
  encodeOuterEnvelope: function (object) {
    const errMsg = OuterEnvelope.verify(object);
    if (errMsg) throw Error("OuterEnvelope validation failed: " + errMsg);
    const message = OuterEnvelope.create(object);
    return OuterEnvelope.encode(message).finish();
  },

  decodeOuterEnvelope: function (buffer) {
    const message = OuterEnvelope.decode(buffer);
    return OuterEnvelope.toObject(message, { defaults: true });
  },

  // Inner Envelope
  encodeInnerEnvelope: function (object) {
    const errMsg = InnerEnvelope.verify(object);
    if (errMsg) throw Error("InnerEnvelope validation failed: " + errMsg);
    const message = InnerEnvelope.create(object);
    return InnerEnvelope.encode(message).finish();
  },

  decodeInnerEnvelope: function (buffer) {
    const message = InnerEnvelope.decode(buffer);
    return InnerEnvelope.toObject(message, { defaults: true });
  },

  // Inner Payload
  encodeInnerPayload: function (object) {
    const errMsg = InnerPayload.verify(object);
    if (errMsg) throw Error("InnerPayload validation failed: " + errMsg);
    const message = InnerPayload.create(object);
    return InnerPayload.encode(message).finish();
  },

  decodeInnerPayload: function (buffer) {
    const message = InnerPayload.decode(buffer);
    return InnerPayload.toObject(message, { defaults: true });
  },

  // Public Key Payload
  encodePublicKeyPayload: function (object) {
    const errMsg = PublicKeyPayload.verify(object);
    if (errMsg) throw Error("PublicKeyPayload validation failed: " + errMsg);
    const message = PublicKeyPayload.create(object);
    return PublicKeyPayload.encode(message).finish();
  },

  decodePublicKeyPayload: function (buffer) {
    const message = PublicKeyPayload.decode(buffer);
    return PublicKeyPayload.toObject(message, { defaults: true });
  }
};
