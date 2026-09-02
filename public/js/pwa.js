// ============================================================
// QUICKMED PWA INSTALL SYSTEM
// ============================================================

let deferredPrompt = null;
let installButton = null;
let installBanner = null;
let installBannerText = null;
let dismissButton = null;
let apkDownloadBtn = null;

// ------------------------------------------------------------
// ELEMENTS
// ------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    installButton = document.getElementById('installBtn');
    installBanner = document.getElementById('installBanner');
    installBannerText = document.getElementById('installBannerText');
    dismissButton = document.getElementById('installDismissBtn');
    apkDownloadBtn = document.getElementById('apkDownloadBtn');

    setupInstallSystem();
    setupApkButton();
});

// ------------------------------------------------------------
// SERVICE WORKER
// ------------------------------------------------------------

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('✅ QuickMed Service Worker registered:', registration.scope);
        } catch (error) {
            console.error('❌ QuickMed Service Worker registration failed:', error);
        }
    });
}

// ------------------------------------------------------------
// INSTALL SYSTEM
// ------------------------------------------------------------

function setupInstallSystem() {

    if (isAppInstalled()) {
        hideInstallBanner();
        console.log('✅ QuickMed is already installed.');
        return;
    }

    // CHROME / EDGE / SAMSUNG / OTHER CHROMIUM BROWSERS
    window.addEventListener('beforeinstallprompt', (event) => {
        console.log('✅ QuickMed installation is available.');
        event.preventDefault();
        deferredPrompt = event;
        showInstallBanner();
    });

    // INSTALL BUTTON
    if (installButton) {
        installButton.addEventListener('click', async () => {

            if (deferredPrompt) {
                try {
                    await deferredPrompt.prompt();
                    const result = await deferredPrompt.userChoice;
                    console.log('QuickMed installation result:', result.outcome);
                    if (result.outcome === 'accepted') {
                        console.log('✅ User accepted QuickMed installation.');
                        hideInstallBanner();
                    } else {
                        console.log('ℹ️ User cancelled QuickMed installation.');
                    }
                } catch (error) {
                    console.error('❌ Installation prompt error:', error);
                }
                deferredPrompt = null;
                return;
            }

            if (isIOS()) { showIOSInstructions(); return; }
            if (isFirefox()) { showFirefoxInstructions(); return; }
            showGenericInstructions();
        });
    }

    // NOT NOW BUTTON
    if (dismissButton) {
        dismissButton.addEventListener('click', () => {
            hideInstallBanner();
            localStorage.setItem('quickmed_install_dismissed', Date.now().toString());
        });
    }

    // APP INSTALLED EVENT
    window.addEventListener('appinstalled', () => {
        console.log('🎉 QuickMed successfully installed!');
        deferredPrompt = null;
        hideInstallBanner();
        localStorage.setItem('quickmed_installed', 'true');
        if (apkDownloadBtn) apkDownloadBtn.style.display = 'none';
    });

    // Don't wait forever for beforeinstallprompt — show our own banner
    // as a fallback if the browser hasn't fired it yet (or never will,
    // e.g. Firefox, Safari).
    setTimeout(() => {
        if (isAppInstalled()) return;
        showInstallBanner();
    }, 1200);
}

// ------------------------------------------------------------
// APK DOWNLOAD BUTTON (Android only — .apk can't install on iOS/PC)
// ------------------------------------------------------------

function setupApkButton() {
    if (!apkDownloadBtn) return;
    apkDownloadBtn.style.display = (isAndroid() && !isAppInstalled()) ? 'inline-flex' : 'none';
}

// ------------------------------------------------------------
// SHOW / HIDE BANNER
// ------------------------------------------------------------

function showInstallBanner() {
    if (!installBanner) return;
    if (isAppInstalled()) return;
    installBanner.classList.remove('hidden');
}

function hideInstallBanner() {
    if (!installBanner) return;
    installBanner.classList.add('hidden');
}

// ------------------------------------------------------------
// PLATFORM DETECTION
// ------------------------------------------------------------

function isAppInstalled() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = window.navigator.standalone === true;
    const savedInstalled = localStorage.getItem('quickmed_installed') === 'true';
    return standalone || iosStandalone || savedInstalled;
}

function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isFirefox() {
    return /firefox/i.test(navigator.userAgent);
}

function isAndroid() {
    return /android/i.test(navigator.userAgent);
}

// ------------------------------------------------------------
// PLATFORM-SPECIFIC INSTRUCTIONS
// ------------------------------------------------------------

function showIOSInstructions() {
    alert(
        '📱 Install QuickMed on iPhone/iPad:\n\n' +
        '1. Tap the Share button in your browser.\n' +
        '2. Select "Add to Home Screen".\n' +
        '3. Tap "Add".\n\n' +
        'QuickMed will then appear on your Home Screen like an app.'
    );
}

function showFirefoxInstructions() {
    alert(
        '📱 Install QuickMed:\n\n' +
        '1. Open the browser menu (⋮).\n' +
        '2. Tap "Install".\n' +
        '3. Add QuickMed to your Home Screen.'
    );
}

function showGenericInstructions() {
    alert(
        '📲 Install QuickMed:\n\n' +
        'Open your browser menu and look for:\n\n' +
        '"Install app"\n' +
        '"Add to Home Screen"\n' +
        'or\n' +
        '"Install QuickMed".'
    );
}