// Copyright [2025] [Allow2 Pty Ltd]
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

/**
 * Lock Session Action - Deployed to agents to lock the screen
 * This script runs ON THE AGENT when triggered by the parent
 */
module.exports = {
    id: 'lock-session',
    platforms: ['win32', 'darwin', 'linux'],

    /**
     * This function is serialized and sent to the agent for execution
     * @param {Object} args - Arguments from parent
     * @param {string} args.reason - Reason for locking (for logging)
     */
    script: function(args) {
        const { execSync, exec } = require('child_process');
        const platform = process.platform;
        const { reason } = args || {};

        /**
         * Lock session on Windows
         */
        function lockWindows() {
            try {
                // Use rundll32 to call LockWorkStation
                execSync('rundll32.exe user32.dll,LockWorkStation', {
                    encoding: 'utf8',
                    timeout: 5000
                });
                return { success: true, method: 'rundll32' };
            } catch (error) {
                // Fallback: Use PowerShell
                try {
                    execSync('powershell -Command "[void][System.Runtime.InteropServices.Marshal]::PrelinkAll([System.Type]::GetType(\\"System.Runtime.InteropServices.RuntimeEnvironment\\"));Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public class Lock{[DllImport(\\"user32.dll\\")]public static extern void LockWorkStation();}\';[Lock]::LockWorkStation()"', {
                        encoding: 'utf8',
                        timeout: 10000
                    });
                    return { success: true, method: 'powershell' };
                } catch (e) {
                    return { success: false, error: error.message };
                }
            }
        }

        /**
         * Lock session on macOS
         */
        function lockMacOS() {
            try {
                // Method 1: Use pmset to put display to sleep with password required
                // This effectively locks the screen
                execSync('/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend', {
                    encoding: 'utf8',
                    timeout: 5000
                });
                return { success: true, method: 'CGSession' };
            } catch (error) {
                // Fallback 1: Use osascript with screensaver
                try {
                    exec('osascript -e \'tell application "System Events" to start current screen saver\'');
                    return { success: true, method: 'screensaver' };
                } catch (e) {
                    // Continue
                }

                // Fallback 2: Use Keychain Access to lock
                try {
                    execSync('open -a ScreenSaverEngine', {
                        encoding: 'utf8',
                        timeout: 5000
                    });
                    return { success: true, method: 'ScreenSaverEngine' };
                } catch (e) {
                    return { success: false, error: error.message };
                }
            }
        }

        /**
         * Lock session on Linux
         */
        function lockLinux() {
            // Try multiple methods for different desktop environments

            // Method 1: loginctl (systemd, works across most modern distros)
            try {
                execSync('loginctl lock-session', {
                    encoding: 'utf8',
                    timeout: 5000
                });
                return { success: true, method: 'loginctl' };
            } catch (e) {
                // Continue
            }

            // Method 2: xdg-screensaver (should work on most DEs)
            try {
                execSync('xdg-screensaver lock', {
                    encoding: 'utf8',
                    timeout: 5000,
                    env: { ...process.env, DISPLAY: ':0' }
                });
                return { success: true, method: 'xdg-screensaver' };
            } catch (e) {
                // Continue
            }

            // Method 3: GNOME screensaver
            try {
                execSync('gnome-screensaver-command --lock', {
                    encoding: 'utf8',
                    timeout: 5000,
                    env: { ...process.env, DISPLAY: ':0' }
                });
                return { success: true, method: 'gnome-screensaver' };
            } catch (e) {
                // Continue
            }

            // Method 4: GNOME 3 / GNOME Shell
            try {
                execSync('dbus-send --type=method_call --dest=org.gnome.ScreenSaver /org/gnome/ScreenSaver org.gnome.ScreenSaver.Lock', {
                    encoding: 'utf8',
                    timeout: 5000,
                    env: { ...process.env, DISPLAY: ':0' }
                });
                return { success: true, method: 'gnome-dbus' };
            } catch (e) {
                // Continue
            }

            // Method 5: KDE Plasma
            try {
                execSync('qdbus org.freedesktop.ScreenSaver /ScreenSaver Lock', {
                    encoding: 'utf8',
                    timeout: 5000,
                    env: { ...process.env, DISPLAY: ':0' }
                });
                return { success: true, method: 'kde-qdbus' };
            } catch (e) {
                // Continue
            }

            // Method 6: Cinnamon
            try {
                execSync('cinnamon-screensaver-command --lock', {
                    encoding: 'utf8',
                    timeout: 5000,
                    env: { ...process.env, DISPLAY: ':0' }
                });
                return { success: true, method: 'cinnamon' };
            } catch (e) {
                // Continue
            }

            // Method 7: MATE
            try {
                execSync('mate-screensaver-command --lock', {
                    encoding: 'utf8',
                    timeout: 5000,
                    env: { ...process.env, DISPLAY: ':0' }
                });
                return { success: true, method: 'mate' };
            } catch (e) {
                // Continue
            }

            // Method 8: XFCE
            try {
                execSync('xflock4', {
                    encoding: 'utf8',
                    timeout: 5000,
                    env: { ...process.env, DISPLAY: ':0' }
                });
                return { success: true, method: 'xflock4' };
            } catch (e) {
                // Continue
            }

            // Method 9: i3lock (i3 window manager)
            try {
                exec('i3lock -c 000000', {
                    env: { ...process.env, DISPLAY: ':0' }
                });
                return { success: true, method: 'i3lock' };
            } catch (e) {
                // Continue
            }

            // Method 10: slock (suckless)
            try {
                exec('slock', {
                    env: { ...process.env, DISPLAY: ':0' }
                });
                return { success: true, method: 'slock' };
            } catch (e) {
                // Continue
            }

            return { success: false, error: 'No suitable lock method found' };
        }

        // Execute based on platform
        let result;
        if (platform === 'win32') {
            result = lockWindows();
        } else if (platform === 'darwin') {
            result = lockMacOS();
        } else {
            result = lockLinux();
        }

        // Add metadata to result
        return {
            ...result,
            reason,
            platform,
            timestamp: Date.now()
        };
    }
};
