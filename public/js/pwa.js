
let deferredPrompt = null;
let installButton = null;
let installBanner = null;
let dismissButton = null;




document.addEventListener('DOMContentLoaded', () => {
    installButton = document.getElementById('installBtn');
    installBanner = document.getElementById('installBanner');
    dismissButton = document.getElementById('installDismissBtn');

    setupInstallSystem();
});


if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');

            console.log(
                '✅ QuickMed Service Worker registered:',
                registration.scope
            );
        } catch (error) {
            console.error(
                '❌ QuickMed Service Worker registration failed:',
                error
            );
        }
    });
}



function setupInstallSystem() {

    // If already running as an installed PWA,
    // don't show the installation banner.
    if (isAppInstalled()) {
        hideInstallBanner();
        console.log('✅ QuickMed is already installed.');
        return;
    }


    // --------------------------------------------------------
    // CHROME / EDGE / SAMSUNG / OTHER CHROMIUM BROWSERS
    // --------------------------------------------------------

    window.addEventListener('beforeinstallprompt', (event) => {

        console.log('✅ QuickMed installation is available.');

        // Stop browser's default prompt.
        event.preventDefault();

        // Save the installation event.
        deferredPrompt = event;

        // Show OUR install popup immediately.
        showInstallBanner();

    });


    // --------------------------------------------------------
    // INSTALL BUTTON
    // --------------------------------------------------------

    if (installButton) {

        installButton.addEventListener('click', async () => {

            // Chromium installation prompt available
            if (deferredPrompt) {

                try {

                    // Show native browser installation dialog.
                    await deferredPrompt.prompt();

                    const result = await deferredPrompt.userChoice;

                    console.log(
                        'QuickMed installation result:',
                        result.outcome
                    );

                    if (result.outcome === 'accepted') {

                        console.log(
                            '✅ User accepted QuickMed installation.'
                        );

                        hideInstallBanner();

                    } else {

                        console.log(
                            'ℹ️ User cancelled QuickMed installation.'
                        );

                    }

                } catch (error) {

                    console.error(
                        '❌ Installation prompt error:',
                        error
                    );

                }

                // A BeforeInstallPromptEvent can only be used once.
                deferredPrompt = null;

                return;
            }


            // ------------------------------------------------
            // iPHONE / iPAD
            // ------------------------------------------------

            if (isIOS()) {

                showIOSInstructions();

                return;
            }


            // ------------------------------------------------
            // FIREFOX
            // ------------------------------------------------

            if (isFirefox()) {

                showFirefoxInstructions();

                return;
            }


            // ------------------------------------------------
            // OTHER BROWSERS
            // ------------------------------------------------

            showGenericInstructions();

        });
    }


    // --------------------------------------------------------
    // NOT NOW BUTTON
    // --------------------------------------------------------

    if (dismissButton) {

        dismissButton.addEventListener('click', () => {

            hideInstallBanner();

            // Remember that the user dismissed it.
            // It will not immediately annoy them again.
            localStorage.setItem(
                'quickmed_install_dismissed',
                Date.now().toString()
            );

        });
    }


    // --------------------------------------------------------
    // APP INSTALLED EVENT
    // --------------------------------------------------------

    window.addEventListener('appinstalled', () => {

        console.log('🎉 QuickMed successfully installed!');

        deferredPrompt = null;

        hideInstallBanner();

        localStorage.setItem(
            'quickmed_installed',
            'true'
        );

    });


    // --------------------------------------------------------
    // SHOW INSTALL POPUP FOR UNSUPPORTED BROWSERS
    // --------------------------------------------------------

    setTimeout(() => {

        if (isAppInstalled()) {
            return;
        }

        // Don't wait forever for beforeinstallprompt.
        //
        // If the browser hasn't provided it yet,
        // show our own installation information.
        showInstallBanner();

    }, 1200);
}


// ------------------------------------------------------------
// SHOW BANNER
// ------------------------------------------------------------

function showInstallBanner() {

    if (!installBanner) return;

    if (isAppInstalled()) {
        return;
    }

    installBanner.classList.remove('hidden');
}


// ------------------------------------------------------------
// HIDE BANNER
// ------------------------------------------------------------

function hideInstallBanner() {

    if (!installBanner) return;

    installBanner.classList.add('hidden');
}


// ------------------------------------------------------------
// DETECT INSTALLED PWA
// ------------------------------------------------------------

function isAppInstalled() {

    // Android / Chrome / Edge / desktop
    const standalone =
        window.matchMedia('(display-mode: standalone)').matches;

    // iOS Safari
    const iosStandalone =
        window.navigator.standalone === true;

    // Our own saved state
    const savedInstalled =
        localStorage.getItem('quickmed_installed') === 'true';

    return standalone || iosStandalone || savedInstalled;
}


// ------------------------------------------------------------
// iOS DETECTION
// ------------------------------------------------------------

function isIOS() {

    return /iphone|ipad|ipod/i.test(
        navigator.userAgent
    );
}


// ------------------------------------------------------------
// FIREFOX DETECTION
// ------------------------------------------------------------

function isFirefox() {

    return /firefox/i.test(
        navigator.userAgent
    );
}


// ------------------------------------------------------------
// iOS INSTRUCTIONS
// ------------------------------------------------------------

function showIOSInstructions() {

    alert(
        '📱 Install QuickMed on iPhone/iPad:\\n\\n' +
        '1. Tap the Share button in your browser.\\n' +
        '2. Select "Add to Home Screen".\\n' +
        '3. Tap "Add".\\n\\n' +
        'QuickMed will then appear on your Home Screen like an app.'
    );
}


// ------------------------------------------------------------
// FIREFOX INSTRUCTIONS
// ------------------------------------------------------------

function showFirefoxInstructions() {

    alert(
        '📱 Install QuickMed:\\n\\n' +
        '1. Open the browser menu (⋮).\\n' +
        '2. Tap "Install".\\n' +
        '3. Add QuickMed to your Home Screen.\\n\\n' +
        'Firefox Android supports installing web apps from its menu.'
    );
}


// ------------------------------------------------------------
// GENERIC INSTRUCTIONS
// ------------------------------------------------------------

function showGenericInstructions() {

    alert(
        '📲 Install QuickMed:\\n\\n' +
        'Open your browser menu and look for:\\n\\n' +
        '"Install app"\\n' +
        '"Add to Home Screen"\\n' +
        'or\\n' +
        '"Install QuickMed".'
    );
}

