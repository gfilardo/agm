import './styles.css';
import { AGMCrypto } from './crypto.js';
import { AGMQR } from './qr.js';

const app = (function () {
    // State
    let identities = [];
    let contacts = [];

    function init() {
        const storedIdentities = localStorage.getItem('agm_identities');
        const storedLegacy = localStorage.getItem('agm_identity');

        if (storedIdentities) {
            identities = JSON.parse(storedIdentities);
        } else if (storedLegacy) {
            const legacyId = JSON.parse(storedLegacy);
            legacyId.name = "Default";
            legacyId.id = "id_" + Date.now();
            identities = [legacyId];
            saveIdentities();
            localStorage.removeItem('_identity');
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
        // Tabs
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

                // Special handling per tab
                if (targetId === 'tab-identity') renderIdentities();
                if (targetId === 'tab-contacts') renderContacts();
                if (targetId !== 'tab-read' && targetId !== 'tab-relay-out') {
                    AGMQR.stopScan(); // stop camera if switching away
                }
            });
        });

        // Private Mode: Setup
        document.getElementById('btn-generate-keys').addEventListener('click', (e) => {
            e.preventDefault();
            const name = document.getElementById('input-setup-name').value.trim() || "Personal";
            generateNewIdentity(name);
        });

        // Private Mode: Create New Identity
        document.getElementById('btn-create-new-identity').addEventListener('click', (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('input-new-identity-name');
            const name = nameInput.value.trim() || "New Identity";
            generateNewIdentity(name);
            nameInput.value = "";
        });

        // Private Mode: Create New Contact
        document.getElementById('btn-add-contact').addEventListener('click', (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('input-new-contact-name');
            const pubInput = document.getElementById('input-new-contact-pub');
            const name = nameInput.value.trim();
            const pubKey = pubInput.value.trim();

            if (!name || !pubKey) return alert("Please enter both a name and a public key.");

            try {
                // Validate base64 format by decoding
                AGMCrypto.util.decodeBase64(pubKey);
            } catch (err) {
                return alert("Invalid public key format. It must be valid Base64.");
            }

            const newContact = { id: "contact_" + Date.now(), name, publicKey: pubKey };
            contacts.push(newContact);
            saveContacts();

            nameInput.value = "";
            pubInput.value = "";
            if (document.getElementById('tab-contacts').classList.contains('active')) {
                renderContacts();
            }
            updateContactDropdown();
            alert("Contact saved successfully!");
        });

        // Private Mode: Scan Contact QR
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

        // Compose: Recipient dropdown change
        document.getElementById('select-recipient-contact').addEventListener('change', (e) => {
            const groupPub = document.getElementById('group-recipient-pub');
            if (e.target.value === 'manual') {
                groupPub.classList.remove('hidden');
            } else {
                groupPub.classList.add('hidden');
            }
        });

        // Private Mode: Compose
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
                const ciphertext = AGMCrypto.encryptMessage(message, recipientPub, activeId.secretKey);

                const payloadObj = {
                    meta: {
                        v: "1.0",
                        kid: activeId.kid,
                        spub: activeId.publicKey // Sender pub key included for stateless decrypt
                    },
                    pay: ciphertext
                };

                const jsonStr = JSON.stringify(payloadObj);

                document.getElementById('encrypt-result').classList.remove('hidden');
                AGMQR.generate('qr-outbound', jsonStr);
            } catch (e) {
                alert("Encryption failed. Check recipient public key format.");
                console.error(e);
            }
        });

        // Private Mode: Read (Scan Incoming)
        const scanContainerIncoming = document.getElementById('scanner-incoming-container');
        document.getElementById('btn-scan-incoming').addEventListener('click', () => {
            scanContainerIncoming.classList.remove('hidden');
            AGMQR.startScan('reader-incoming', (decodedText) => {
                AGMQR.stopScan();
                scanContainerIncoming.classList.add('hidden');
                handleIncomingScan(decodedText);
            });
        });

        document.getElementById('btn-stop-scan-incoming').addEventListener('click', () => {
            AGMQR.stopScan();
            scanContainerIncoming.classList.add('hidden');
        });

        // Private Mode: Read (Manual Input)
        document.getElementById('btn-decrypt-manual').addEventListener('click', () => {
            const payload = document.getElementById('input-manual-incoming').value.trim();
            if (!payload) return alert("Please paste the encrypted payload.");
            handleIncomingScan(payload);
        });

        // Public Mode: Scan Outbound
        const scanContainerOutbound = document.getElementById('scanner-outbound-container');
        let currentOutboundCanvas = null;
        let currentOutboundText = "";

        document.getElementById('btn-scan-outbound').addEventListener('click', () => {
            scanContainerOutbound.classList.remove('hidden');
            document.getElementById('scan-result-outbound').classList.add('hidden');
            document.getElementById('outbound-auto-copy-msg').classList.add('hidden');
            
            AGMQR.startScan('reader-outbound', async (decodedText) => {
                AGMQR.stopScan();
                scanContainerOutbound.classList.add('hidden');
                currentOutboundText = decodedText;
                
                // Show result box
                document.getElementById('scan-result-outbound').classList.remove('hidden');
                document.getElementById('payload-outbound-text').value = decodedText;
                
                // Generate QR Code
                currentOutboundCanvas = await AGMQR.generate('qr-outbound-relay', decodedText);
                
                // Auto-copy based on toggle
                const format = document.querySelector('input[name="relay-format"]:checked').value;
                if (format === 'qr' && currentOutboundCanvas) {
                    copyCanvasToClipboard(currentOutboundCanvas);
                } else {
                    copyTextToClipboard(decodedText);
                }
            });
        });

        document.getElementById('btn-stop-scan-outbound').addEventListener('click', () => {
            AGMQR.stopScan();
            scanContainerOutbound.classList.add('hidden');
        });

        document.getElementById('btn-copy-outbound-qr').addEventListener('click', () => {
            if (currentOutboundCanvas) copyCanvasToClipboard(currentOutboundCanvas);
        });

        document.getElementById('btn-copy-outbound-text').addEventListener('click', () => {
            if (currentOutboundText) copyTextToClipboard(currentOutboundText);
        });

        document.getElementById('btn-share-outbound').addEventListener('click', () => {
            if (!navigator.share) {
                alert("Native sharing is not supported on this device/browser.");
                return;
            }
            
            const format = document.querySelector('input[name="relay-format"]:checked').value;
            
            if (format === 'qr' && currentOutboundCanvas) {
                currentOutboundCanvas.toBlob((blob) => {
                    const file = new File([blob], "agm-payload.png", { type: "image/png" });
                    navigator.share({
                        title: "AGM Payload",
                        files: [file]
                    }).catch(console.error);
                });
            } else {
                navigator.share({
                    title: "AGM Payload",
                    text: currentOutboundText
                }).catch(console.error);
            }
        });

        function copyTextToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                const msg = document.getElementById('outbound-auto-copy-msg');
                msg.innerHTML = '<i class="fa-solid fa-check-circle"></i> Text copied!';
                msg.classList.remove('hidden');
            }).catch(err => alert("Could not copy text."));
        }

        function copyCanvasToClipboard(canvas) {
            canvas.toBlob((blob) => {
                if (!navigator.clipboard || !navigator.clipboard.write) {
                    alert("Image copying is not supported by your browser. Please use the Share button.");
                    return;
                }
                const item = new ClipboardItem({ "image/png": blob });
                navigator.clipboard.write([item]).then(() => {
                    const msg = document.getElementById('outbound-auto-copy-msg');
                    msg.innerHTML = '<i class="fa-solid fa-check-circle"></i> QR Image copied!';
                    msg.classList.remove('hidden');
                }).catch(err => {
                    console.error("Clipboard write failed", err);
                    alert("Image copy blocked by browser. Please use the Share button instead.");
                });
            });
        }

        // Public Mode: Show Incoming
        document.getElementById('btn-show-incoming-qr').addEventListener('click', () => {
            const payload = document.getElementById('input-incoming-payload').value.trim();
            if (!payload) return;

            document.getElementById('incoming-qr-result').classList.remove('hidden');
            AGMQR.generate('qr-inbound', payload);
        });
    }

    function handleIncomingScan(jsonStr) {
        try {
            const data = JSON.parse(jsonStr);
            if (!data.pay || !data.meta || !data.meta.spub) throw new Error("Invalid payload format. Missing 'pay' or 'meta.spub'.");

            let decrypted = null;
            let decryptedWith = null;

            for (const idObj of identities) {
                decrypted = AGMCrypto.decryptMessage(data.pay, data.meta.spub, idObj.secretKey);
                if (decrypted) {
                    decryptedWith = idObj;
                    break;
                }
            }

            document.getElementById('decrypt-result').classList.remove('hidden');
            if (decrypted) {
                document.getElementById('decrypted-text').innerText = decrypted + `\n\n(Decrypted using identity: ${decryptedWith.name})`;
                document.getElementById('decrypted-text').style.color = 'var(--text-color)';
            } else {
                document.getElementById('decrypted-text').innerText = "Failed to decrypt. No matching identities found or corrupted payload.";
                document.getElementById('decrypted-text').style.color = 'var(--danger-color)';
            }
        } catch (e) {
            alert("Could not parse incoming data.");
            console.error(e);
        }
    }

    function checkPrivateSetupState() {
        if (identities.length > 0) {
            document.getElementById('private-setup').classList.add('hidden');
            document.getElementById('private-dashboard').classList.remove('hidden');
            renderIdentities();
            updateContactDropdown();
        } else {
            document.getElementById('private-setup').classList.remove('hidden');
            document.getElementById('private-dashboard').classList.add('hidden');
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
        const select = document.getElementById('select-sender-identity');

        container.innerHTML = '';
        if (select) select.innerHTML = '';

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
                        <button type="button" class="btn btn-primary btn-sm" onclick="app.toggleIdentityDetails('${idObj.id}')">Details</button>
                        <button type="button" class="btn btn-danger btn-sm" onclick="app.deleteIdentity('${idObj.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div id="details-${idObj.id}" class="identity-details">
                    <div class="info-group mt-2">
                        <label>Public Key</label>
                        <code class="code-block" style="word-break: break-all;">${idObj.publicKey}</code>
                    </div>
                    <div class="qr-wrapper">
                        <p>Share this QR to receive messages:</p>
                        <div id="qr-my-identity-${idObj.id}" class="qr-container"></div>
                    </div>
                </div>
            `;
            container.appendChild(card);

            if (select) {
                const option = document.createElement('option');
                option.value = idObj.id;
                option.innerText = idObj.name;
                select.appendChild(option);
            }
        });
    }

    function toggleIdentityDetails(id) {
        const idObj = identities.find(i => i.id === id);
        if (!idObj) return;

        const detailsEl = document.getElementById(`details-${id}`);
        const isCurrentlyOpen = detailsEl.classList.contains('open');

        // Close all others
        document.querySelectorAll('.identity-details').forEach(el => el.classList.remove('open'));

        if (!isCurrentlyOpen) {
            detailsEl.classList.add('open');
            const qrContainer = document.getElementById(`qr-my-identity-${id}`);
            if (qrContainer.innerHTML === '') {
                AGMQR.generate(`qr-my-identity-${id}`, idObj.publicKey);
            }
        }
    }

    function deleteIdentity(id) {
        if (confirm("Are you sure you want to delete this identity?")) {
            identities = identities.filter(i => i.id !== id);
            saveIdentities();
            checkPrivateSetupState();
        }
    }

    function updateContactDropdown() {
        const select = document.getElementById('select-recipient-contact');
        if (!select) return;

        const currentVal = select.value;

        select.innerHTML = '<option value="manual">Manual Entry (Provide Key Below)</option>';
        contacts.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            option.innerText = c.name;
            select.appendChild(option);
        });

        if (currentVal === 'manual' || contacts.find(c => c.id === currentVal)) {
            select.value = currentVal;
        }

        const groupPub = document.getElementById('group-recipient-pub');
        if (select.value === 'manual') {
            groupPub.classList.remove('hidden');
        } else {
            groupPub.classList.add('hidden');
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
                        <p>Key: ${c.publicKey.substring(0, 16)}...</p>
                    </div>
                    <div class="identity-actions">
                        <button type="button" class="btn btn-danger btn-sm" onclick="app.deleteContact('${c.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function deleteContact(id) {
        if (confirm("Are you sure you want to delete this contact?")) {
            contacts = contacts.filter(c => c.id !== id);
            saveContacts();
            renderContacts();
            updateContactDropdown();
        }
    }

    return {
        init: init,
        deleteContact: deleteContact,
        toggleIdentityDetails: toggleIdentityDetails,
        deleteIdentity: deleteIdentity,
        showView: function (viewId) {
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');
            AGMQR.stopScan(); // Ensure cameras are stopped

            if (viewId === 'view-private') {
                checkPrivateSetupState();
            }
        }
    };
})();

// Expose app globally for HTML onclick handlers
window.app = app;

document.addEventListener('DOMContentLoaded', app.init);
