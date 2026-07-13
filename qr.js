import QRCode from 'qrcode';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

export const AGWMQR = (function() {
    let currentScanner = null;

    return {
        generate: async function(elementId, text) {
            const container = document.getElementById(elementId);
            if (!container) return;
            
            container.innerHTML = ''; // clear previous
            const canvas = document.createElement('canvas');
            container.appendChild(canvas);
            
            try {
                await QRCode.toCanvas(canvas, text, {
                    width: 256,
                    color: {
                        dark: '#000000ff',
                        light: '#ffffffff'
                    },
                    errorCorrectionLevel: 'L'
                });
            } catch (err) {
                console.error("QR Generation error", err);
            }
        },

        startScan: async function(elementId, onScanSuccess) {
            if (currentScanner) {
                await this.stopScan();
            }

            const html5QrCode = new Html5Qrcode(elementId);
            currentScanner = html5QrCode;

            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            
            try {
                await html5QrCode.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText, decodedResult) => {
                        // Pause on success to prevent multiple rapid scans
                        if(currentScanner) {
                            html5QrCode.pause();
                            onScanSuccess(decodedText);
                        }
                    },
                    (errorMessage) => {
                        // ignore background errors
                    }
                );
            } catch (err) {
                console.error("QR Scan Error:", err);
                alert("Could not start camera. Please ensure permissions are granted.");
            }
        },

        stopScan: async function() {
            if (currentScanner) {
                try {
                    // Html5QrcodeScannerState enum is missing in some older exports, fallback to string if needed
                    const state = typeof Html5QrcodeScannerState !== 'undefined' 
                        ? Html5QrcodeScannerState.PAUSED : 2; 
                        
                    if (currentScanner.getState() === state) {
                        currentScanner.resume();
                    }
                    await currentScanner.stop();
                } catch (e) {
                    console.error("Stop scan error", e);
                }
                currentScanner = null;
                
                // Also clear the container element content just to be safe
                document.getElementById('reader-incoming').innerHTML = '';
                document.getElementById('reader-outbound').innerHTML = '';
            }
        },
        
        resumeScan: function() {
            if (currentScanner) {
                 const state = typeof Html5QrcodeScannerState !== 'undefined' 
                        ? Html5QrcodeScannerState.PAUSED : 2;
                if (currentScanner.getState() === state) {
                    currentScanner.resume();
                }
            }
        }
    };
})();
