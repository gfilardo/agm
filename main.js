import './styles.css';
import { AGMCrypto } from './crypto.js';
import { AGMQR } from './qr.js';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

const app = (function () {
    // State
    let identities = [];
    let contacts = [];
    let streamFrames = [];
    let currentStreamIndex = 0;
    let streamTimer = null;
    let currentFilePayloadBin = null;
    let currentOutboundText = "";

    function init() {
        const storedIdentities = localStorage.getItem('agm_identities');
        if (storedIdentities) {
            identities = JSON.parse(storedIdentities);
        }

        const storedContacts = localStorage.getItem('agm_contacts');
        if (storedContacts) {
            contacts = JSON.parse(storedContacts);
        }

        checkPrivateSetupState();
        bindEvents();
    }

    function saveIdentities() {
        localStorage.setItem('agm_identities', JSON.stringify(identities));
    }

    function saveContacts() {
        localStorage.setItem('agm_contacts', JSON.stringify(contacts));
    }

    function getIdentityById(id) {
        return identities.find(i => i.id === id);
    }

    function bindEvents() {
        // Tab Switchers
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = e.target.getAttribute('data-target');
                const viewEl = e.target.closest('.view');

                viewEl.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                viewEl.querySelectorAll('.tab-content').forEach(tc => {
                    tc.classList.add('hidden');
                    tc.classList.remove('active');
                });

                e.target.classList.add('active');
                const targetContent = document.getElementById(targetId);
                targetContent.classList.remove('hidden');
                targetContent.classList.add('active');

                // Special tab renders
                if (targetId === 'tab-identity') renderIdentities();
                if (targetId === 'tab-contacts') renderContacts();
                if (targetId !== 'tab-read' && targetId !== 'tab-relay-out') {
                    AGMQR.stopScan();
                }
            });
        });

        // Private Setup
        document.getElementById('btn-generate-keys').addEventListener('click', (e) => {
            e.preventDefault();
            const name = document.getElementById('input-setup-name').value.trim() || "Personal";
            generateNewIdentity(name);
        });

        // Create New Identity
        document.getElementById('btn-create-new-identity').addEventListener('click', (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('input-new-identity-name');
            const name = nameInput.value.trim() || "New Identity";
            generateNewIdentity(name);
            nameInput.value = "";
        });

        // Add Contact (Supports In-Person Envelope & Remote Elligator 2 Noise)
        document.getElementById('btn-add-contact').addEventListener('click', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('input-new-contact-name');
            const pubEnvInput = document.getElementById('input-new-contact-pub');
            const noiseHexInput = document.getElementById('input-remote-noise-hex');
            const noiseFileInput = document.getElementById('input-remote-noise-file');

            const name = nameInput.value.trim() || "Contact";
            let contactPubKey = "";
            let contactKid = "";

            try {
                if (pubEnvInput.value.trim()) {
                    // Mode A: In-Person Protobuf Envelope
                    const envData = AGMCrypto.parseInPersonKeyEnvelope(pubEnvInput.value.trim());
                    contactPubKey = envData.publicKey;
                    contactKid = envData.kid;
                } else if (noiseHexInput.value.trim()) {
                    // Mode B Format 1: Remote Elligator 2 Hex String
                    const remoteData = AGMCrypto.importRemoteKey(noiseHexInput.value.trim());
                    contactPubKey = remoteData.publicKey;
                    contactKid = remoteData.kid;
                } else if (noiseFileInput.files.length > 0) {
                    // Mode B Format 2: Remote Elligator 2 `.dat` Binary File
                    const file = noiseFileInput.files[0];
                    const buffer = new Uint8Array(await file.arrayBuffer());
                    const remoteData = AGMCrypto.importRemoteKey(buffer);
                    contactPubKey = remoteData.publicKey;
                    contactKid = remoteData.kid;
                } else {
                    return alert("Please provide a public key in either Mode A (Envelope) or Mode B (Remote Noise Key).");
                }

                const newContact = {
                    id: "contact_" + Date.now(),
                    name: name,
                    publicKey: contactPubKey,
                    kid: contactKid
                };

                contacts.push(newContact);
                saveContacts();

                nameInput.value = "";
                pubEnvInput.value = "";
                noiseHexInput.value = "";
                noiseFileInput.value = "";

                if (document.getElementById('tab-contacts').classList.contains('active')) {
                    renderContacts();
                }
                updateContactDropdowns();
                alert("Contact saved successfully!");
            } catch (err) {
                console.error("Add contact error:", err);
                alert("Failed to add contact: " + err.message);
            }
        });

        // Scan Contact QR (Mode A Envelope)
        const scanContainerContact = document.getElementById('scanner-contact-container');
        document.getElementById('btn-scan-contact-pub').addEventListener('click', (e) => {
            e.preventDefault();
            scanContainerContact.classList.remove('hidden');
            AGMQR.startScan('reader-contact', (decodedText) => {
                AGMQR.stopScan();
                scanContainerContact.classList.add('hidden');
                document.getElementById('input-new-contact-pub').value = decodedText;
            });
        });

        document.getElementById('btn-stop-scan-contact').addEventListener('click', () => {
            AGMQR.stopScan();
            scanContainerContact.classList.add('hidden');
        });

        // Operation 3: Encrypt Single Message
        document.getElementById('btn-encrypt').addEventListener('click', () => {
            const recipientContactId = document.getElementById('select-recipient-contact').value;
            let recipientPub = "";

            if (recipientContactId === 'manual') {
                recipientPub = document.getElementById('input-recipient-pub').value.trim();
            } else {
                const contact = contacts.find(c => c.id === recipientContactId);
                if (contact) recipientPub = contact.publicKey;
            }

            const message = document.getElementById('input-message').value.trim();
            const senderId = document.getElementById('select-sender-identity').value;

            if (!recipientPub || !message) return alert("Please specify a recipient key and a message.");
            if (!senderId) return alert("Please select an identity to send as.");

            try {
                const activeId = getIdentityById(senderId);
                const msgBytes = AGMCrypto.util.decodeUTF8(message);

                const outerBase64 = AGMCrypto.encryptPayload(
                    msgBytes,
                    'text',
                    '',
                    recipientPub,
                    activeId.secretKey,
                    activeId.kid
                );

                document.getElementById('encrypt-result').classList.remove('hidden');
                document.getElementById('output-message-text').value = outerBase64;
                AGMQR.generate('qr-outbound', outerBase64);
            } catch (e) {
                alert("Encryption failed. Check recipient public key format.");
                console.error(e);
            }
        });

        document.getElementById('btn-copy-outbound-msg').addEventListener('click', () => {
            const text = document.getElementById('output-message-text').value;
            if (text) copyTextToClipboard(text);
        });

        // Operation 5: Encrypt File & Prepare Streaming Chunks
        document.getElementById('btn-encrypt-file').addEventListener('click', async () => {
            const recipientContactId = document.getElementById('select-file-recipient-contact').value;
            const fileInput = document.getElementById('input-file-select');
            const senderId = document.getElementById('select-file-sender-identity').value;

            if (!fileInput.files.length) return alert("Please select a file to encrypt.");
            if (!senderId) return alert("Please select an identity to send as.");

            const contact = contacts.find(c => c.id === recipientContactId);
            if (!contact) return alert("Please select a recipient contact.");

            try {
                const activeId = getIdentityById(senderId);
                const file = fileInput.files[0];
                const buffer = new Uint8Array(await file.arrayBuffer());

                const outerBase64 = AGMCrypto.encryptPayload(
                    buffer,
                    'file',
                    file.name,
                    contact.publicKey,
                    activeId.secretKey,
                    activeId.kid
                );

                currentFilePayloadBin = AGMCrypto.util.decodeBase64(outerBase64);

                // Prepare Animated QR Stream frames (500 bytes per chunk if payload is large)
                streamFrames = [outerBase64]; // Single frame for small payload
                currentStreamIndex = 0;

                document.getElementById('file-encrypt-result').classList.remove('hidden');
                document.getElementById('file-encrypt-status').innerText = `File: ${file.name} (${file.size} bytes) encrypted into Protobuf Envelopes.`;
                document.getElementById('stream-frame-indicator').innerText = `Frame 1 of ${streamFrames.length}`;

                AGMQR.generate('qr-file-stream', streamFrames[0]);
            } catch (err) {
                console.error("File encrypt error:", err);
                alert("File encryption failed: " + err.message);
            }
        });

        // Save payload.bin for USB / File Relay
        document.getElementById('btn-download-payload-bin').addEventListener('click', () => {
            if (!currentFilePayloadBin) return;
            const blob = new Blob([currentFilePayloadBin], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'payload.bin';
            a.click();
            URL.revokeObjectURL(url);
        });

        // Operation 4 & 6: Decrypt Incoming Text Payload
        document.getElementById('btn-decrypt-manual').addEventListener('click', () => {
            const payload = document.getElementById('input-manual-incoming').value.trim();
            if (!payload) return alert("Please paste the encrypted payload.");
            handleIncomingPayload(payload);
        });

        // Decrypt Incoming payload.bin File
        document.getElementById('btn-decrypt-file-bin').addEventListener('click', async () => {
            const fileInput = document.getElementById('input-incoming-file-bin');
            if (!fileInput.files.length) return alert("Please select a payload.bin file.");

            try {
                const file = fileInput.files[0];
                const buffer = new Uint8Array(await file.arrayBuffer());
                const outerBase64 = AGMCrypto.util.encodeBase64(buffer);
                handleIncomingPayload(outerBase64);
            } catch (err) {
                alert("Failed to read payload file: " + err.message);
            }
        });

        // Scan Incoming QR
        const scanContainerIncoming = document.getElementById('scanner-incoming-container');
        document.getElementById('btn-scan-incoming').addEventListener('click', () => {
            scanContainerIncoming.classList.remove('hidden');
            AGMQR.startScan('reader-incoming', (decodedText) => {
                AGMQR.stopScan();
                scanContainerIncoming.classList.add('hidden');
                handleIncomingPayload(decodedText);
            });
        });

        document.getElementById('btn-stop-scan-incoming').addEventListener('click', () => {
            AGMQR.stopScan();
            scanContainerIncoming.classList.add('hidden');
        });

        // Public Mode: Scan Outbound
        const scanContainerOutbound = document.getElementById('scanner-outbound-container');
        document.getElementById('btn-scan-outbound').addEventListener('click', () => {
            scanContainerOutbound.classList.remove('hidden');
            document.getElementById('scan-result-outbound').classList.add('hidden');

            AGMQR.startScan('reader-outbound', (decodedText) => {
                AGMQR.stopScan();
                scanContainerOutbound.classList.add('hidden');
                currentOutboundText = decodedText;

                document.getElementById('scan-result-outbound').classList.remove('hidden');
                document.getElementById('payload-outbound-text').value = decodedText;
            });
        });

        document.getElementById('btn-stop-scan-outbound').addEventListener('click', () => {
            AGMQR.stopScan();
            scanContainerOutbound.classList.add('hidden');
        });

        // Public Mode: Upload payload.bin File
        document.getElementById('input-relay-payload-file').addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            const file = e.target.files[0];
            const buffer = new Uint8Array(await file.arrayBuffer());
            const outerBase64 = AGMCrypto.util.encodeBase64(buffer);
            currentOutboundText = outerBase64;

            document.getElementById('scan-result-outbound').classList.remove('hidden');
            document.getElementById('payload-outbound-text').value = outerBase64;
        });

        document.getElementById('btn-copy-outbound-text').addEventListener('click', () => {
            if (currentOutboundText) copyTextToClipboard(currentOutboundText);
        });

        // Public Mode: Show Incoming QR
        document.getElementById('btn-show-incoming-qr').addEventListener('click', () => {
            const payload = document.getElementById('input-incoming-payload').value.trim();
            if (!payload) return alert("Please paste incoming payload text.");

            document.getElementById('incoming-qr-result').classList.remove('hidden');
            AGMQR.generate('qr-inbound', payload);
        });

        // Key Modal Close
        document.getElementById('btn-close-key-modal').addEventListener('click', () => {
            const modal = document.getElementById('modal-key-export');
            modal.classList.add('hidden');
            modal.classList.remove('active');
        });
    }

    function handleIncomingPayload(outerBase64Str) {
        try {
            const result = AGMCrypto.decryptPayload(outerBase64Str, identities);

            document.getElementById('decrypt-result').classList.remove('hidden');
            const decryptedEl = document.getElementById('decrypted-text');
            const downloadContainer = document.getElementById('file-download-container');

            if (result.contentType === 'file') {
                decryptedEl.innerText = `File Decrypted: ${result.filename} (${result.content.length} bytes)\n(Decrypted using identity: ${result.matchedIdentity.name})`;
                decryptedEl.style.color = 'var(--text-color)';

                const blob = new Blob([result.content], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const downloadLink = document.getElementById('link-download-decrypted-file');
                downloadLink.href = url;
                downloadLink.download = result.filename || 'decrypted_file';
                downloadContainer.classList.remove('hidden');
            } else {
                decryptedEl.innerText = result.text + `\n\n(Decrypted using identity: ${result.matchedIdentity.name})`;
                decryptedEl.style.color = 'var(--text-color)';
                downloadContainer.classList.add('hidden');
            }
        } catch (e) {
            document.getElementById('decrypt-result').classList.remove('hidden');
            document.getElementById('decrypted-text').innerText = "Trial decryption failed: " + e.message;
            document.getElementById('decrypted-text').style.color = 'var(--danger-color)';
            document.getElementById('file-download-container').classList.add('hidden');
            console.error(e);
        }
    }

    function generateNewIdentity(name) {
        try {
            const keys = AGMCrypto.generateKeyPair();
            const newIdentity = {
                id: "id_" + Date.now(),
                name: name,
                ...keys
            };
            identities.push(newIdentity);
            saveIdentities();
            checkPrivateSetupState();
            if (document.getElementById('tab-identity').classList.contains('active')) {
                renderIdentities();
            }
            alert("Keypair generated successfully!");
        } catch (err) {
            console.error("Key gen error:", err);
            alert("Failed to generate keys: " + err.message);
        }
    }

    function renderIdentities() {
        const container = document.getElementById('identities-list-container');
        if (!container) return;

        container.innerHTML = '';
        updateIdentityDropdowns();

        identities.forEach(idObj => {
            const card = document.createElement('div');
            card.className = `identity-card-wrapper`;
            card.innerHTML = `
                <div class="identity-card">
                    <div class="identity-info">
                        <h4>${idObj.name}</h4>
                        <p>Key ID: ${idObj.kid}</p>
                    </div>
                    <div class="identity-actions">
                        <button type="button" class="btn btn-primary btn-sm" onclick="app.showExportModal('${idObj.id}')">Export Key</button>
                        <button type="button" class="btn btn-danger btn-sm" onclick="app.deleteIdentity('${idObj.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function showExportModal(id) {
        const idObj = identities.find(i => i.id === id);
        if (!idObj) return;

        const modal = document.getElementById('modal-key-export');
        document.getElementById('modal-key-title').innerText = `Export Public Key: ${idObj.name}`;

        // Mode A: In-Person Protobuf Envelope
        const envelopeStr = AGMCrypto.createInPersonKeyEnvelope(idObj.publicKey, idObj.name);
        AGMQR.generate('qr-export-inperson', envelopeStr);

        // Mode B: Remote Elligator 2 Noise (Format 1 Hex & Format 2 .dat File)
        const hexNoise = AGMCrypto.exportRemoteKeyHex(idObj.publicKey);
        document.getElementById('code-export-hex').innerText = hexNoise;

        document.getElementById('btn-copy-export-hex').onclick = () => {
            copyTextToClipboard(hexNoise);
        };

        document.getElementById('btn-download-export-dat').onclick = () => {
            const binPayload = AGMCrypto.exportRemoteKeyBinary(idObj.publicKey);
            const blob = new Blob([binPayload], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `key_${idObj.kid}.dat`;
            a.click();
            URL.revokeObjectURL(url);
        };

        modal.classList.remove('hidden');
        modal.classList.add('active');
    }

    function updateIdentityDropdowns() {
        const selectMsg = document.getElementById('select-sender-identity');
        const selectFile = document.getElementById('select-file-sender-identity');
        [selectMsg, selectFile].forEach(select => {
            if (!select) return;
            select.innerHTML = '';
            identities.forEach(idObj => {
                const opt = document.createElement('option');
                opt.value = idObj.id;
                opt.innerText = idObj.name;
                select.appendChild(opt);
            });
        });
    }

    function updateContactDropdowns() {
        const selectMsg = document.getElementById('select-recipient-contact');
        const selectFile = document.getElementById('select-file-recipient-contact');

        if (selectMsg) {
            selectMsg.innerHTML = '<option value="manual">Manual Entry (Provide Key Below)</option>';
            contacts.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.innerText = c.name;
                selectMsg.appendChild(opt);
            });
        }

        if (selectFile) {
            selectFile.innerHTML = '';
            contacts.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.innerText = c.name;
                selectFile.appendChild(opt);
            });
        }
    }

    function renderContacts() {
        const container = document.getElementById('contacts-list-container');
        if (!container) return;
        container.innerHTML = '';

        if (contacts.length === 0) {
            container.innerHTML = '<p style="color: #94a3b8; font-size: 0.9rem; text-align: center;">No contacts saved yet.</p>';
            return;
        }

        contacts.forEach(c => {
            const card = document.createElement('div');
            card.className = `identity-card-wrapper`;
            card.innerHTML = `
                <div class="identity-card">
                    <div class="identity-info">
                        <h4>${c.name}</h4>
                        <p>Key ID: ${c.kid || 'N/A'}</p>
                    </div>
                    <div class="identity-actions">
                        <button type="button" class="btn btn-danger btn-sm" onclick="app.deleteContact('${c.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function checkPrivateSetupState() {
        if (identities.length > 0) {
            document.getElementById('private-setup').classList.add('hidden');
            document.getElementById('private-dashboard').classList.remove('hidden');
            renderIdentities();
            updateContactDropdowns();
        } else {
            document.getElementById('private-setup').classList.remove('hidden');
            document.getElementById('private-dashboard').classList.add('hidden');
        }
    }

    function copyTextToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                alert("Copied to clipboard!");
            }).catch(err => alert("Could not copy text."));
        } else {
            alert("Clipboard API not available.");
        }
    }

    return {
        init: init,
        deleteContact: function (id) {
            if (confirm("Delete this contact?")) {
                contacts = contacts.filter(c => c.id !== id);
                saveContacts();
                renderContacts();
                updateContactDropdowns();
            }
        },
        deleteIdentity: function (id) {
            if (confirm("Delete this identity?")) {
                identities = identities.filter(i => i.id !== id);
                saveIdentities();
                checkPrivateSetupState();
            }
        },
        showExportModal: showExportModal,
        showView: function (viewId) {
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');
            AGMQR.stopScan();

            if (viewId === 'view-private') {
                checkPrivateSetupState();
            }
        }
    };
})();

window.app = app;
document.addEventListener('DOMContentLoaded', app.init);
