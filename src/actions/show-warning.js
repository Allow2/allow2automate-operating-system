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
 * Show Warning Action - Deployed to agents to display notifications
 * This script runs ON THE AGENT when triggered by the parent
 */
module.exports = {
    id: 'show-warning',
    platforms: ['win32', 'darwin', 'linux'],

    /**
     * This function is serialized and sent to the agent for execution
     * @param {Object} args - Arguments from parent
     * @param {string} args.title - Notification title
     * @param {string} args.message - Notification message
     * @param {string} args.urgency - Urgency level: 'low', 'normal', 'critical'
     * @param {number} args.timeout - Display timeout in seconds (0 for persistent)
     * @param {string} args.icon - Icon name or path
     */
    script: function(args) {
        const { exec, execSync } = require('child_process');
        const platform = process.platform;
        const { title, message, urgency = 'normal', timeout = 10, icon } = args;

        // Escape special characters for shell commands
        function escapeShell(str) {
            return str.replace(/['"\\$`!]/g, '\\$&');
        }

        // Escape for PowerShell
        function escapePowerShell(str) {
            return str.replace(/'/g, "''").replace(/`/g, '``');
        }

        /**
         * Show notification on Windows using PowerShell
         */
        function showWindowsNotification() {
            try {
                // Try BurntToast module first (most feature-rich)
                const burntToastScript = `
                    Import-Module BurntToast -ErrorAction SilentlyContinue
                    if (Get-Module BurntToast) {
                        New-BurntToastNotification -Text '${escapePowerShell(title)}', '${escapePowerShell(message)}'
                    } else {
                        # Fallback to Windows Forms
                        Add-Type -AssemblyName System.Windows.Forms
                        $global:balloon = New-Object System.Windows.Forms.NotifyIcon
                        $path = (Get-Process -id $pid).Path
                        $balloon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
                        $balloon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::${urgency === 'critical' ? 'Error' : 'Info'}
                        $balloon.BalloonTipText = '${escapePowerShell(message)}'
                        $balloon.BalloonTipTitle = '${escapePowerShell(title)}'
                        $balloon.Visible = $true
                        $balloon.ShowBalloonTip(${timeout * 1000})
                        Start-Sleep -Seconds ${timeout}
                        $balloon.Dispose()
                    }
                `;

                execSync(`powershell -ExecutionPolicy Bypass -Command "${burntToastScript.replace(/\n/g, ' ')}"`, {
                    encoding: 'utf8',
                    timeout: 30000
                });

                return { success: true, method: 'powershell' };

            } catch (error) {
                // Fallback: Use msg command (shows popup instead of toast)
                try {
                    execSync(`msg * /TIME:${timeout} "${escapeShell(title)}: ${escapeShell(message)}"`, {
                        encoding: 'utf8',
                        timeout: 5000
                    });
                    return { success: true, method: 'msg' };
                } catch (e) {
                    return { success: false, error: error.message };
                }
            }
        }

        /**
         * Show notification on macOS using osascript
         */
        function showMacOSNotification() {
            try {
                // Use osascript to display notification
                const script = `display notification "${escapeShell(message)}" with title "${escapeShell(title)}"${urgency === 'critical' ? ' sound name "Basso"' : ''}`;

                execSync(`osascript -e '${script}'`, {
                    encoding: 'utf8',
                    timeout: 5000
                });

                return { success: true, method: 'osascript' };

            } catch (error) {
                // Fallback: Use terminal-notifier if available
                try {
                    const args = [
                        `-title "${escapeShell(title)}"`,
                        `-message "${escapeShell(message)}"`,
                        `-timeout ${timeout}`,
                        urgency === 'critical' ? '-sound Basso' : ''
                    ].filter(Boolean).join(' ');

                    exec(`terminal-notifier ${args}`);
                    return { success: true, method: 'terminal-notifier' };
                } catch (e) {
                    return { success: false, error: error.message };
                }
            }
        }

        /**
         * Show notification on Linux using notify-send
         */
        function showLinuxNotification() {
            try {
                // Map urgency to notify-send levels
                const urgencyMap = {
                    'low': 'low',
                    'normal': 'normal',
                    'critical': 'critical'
                };
                const notifyUrgency = urgencyMap[urgency] || 'normal';

                // Calculate timeout in milliseconds (0 for persistent)
                const timeoutMs = timeout > 0 ? timeout * 1000 : 0;

                // Build command
                const args = [
                    `--urgency=${notifyUrgency}`,
                    timeoutMs > 0 ? `--expire-time=${timeoutMs}` : '',
                    icon ? `--icon="${icon}"` : '',
                    `"${escapeShell(title)}"`,
                    `"${escapeShell(message)}"`
                ].filter(Boolean).join(' ');

                execSync(`notify-send ${args}`, {
                    encoding: 'utf8',
                    timeout: 5000,
                    env: { ...process.env, DISPLAY: ':0' }
                });

                return { success: true, method: 'notify-send' };

            } catch (error) {
                // Fallback 1: Try zenity
                try {
                    const isError = urgency === 'critical';
                    exec(`zenity --notification --text="${escapeShell(title)}: ${escapeShell(message)}"`, {
                        env: { ...process.env, DISPLAY: ':0' }
                    });
                    return { success: true, method: 'zenity' };
                } catch (e) {
                    // Continue to next fallback
                }

                // Fallback 2: Try kdialog (KDE)
                try {
                    exec(`kdialog --passivepopup "${escapeShell(message)}" ${timeout} --title "${escapeShell(title)}"`, {
                        env: { ...process.env, DISPLAY: ':0' }
                    });
                    return { success: true, method: 'kdialog' };
                } catch (e) {
                    // Continue to next fallback
                }

                // Fallback 3: Use xmessage (basic X11)
                try {
                    exec(`xmessage -timeout ${timeout} "${escapeShell(title)}: ${escapeShell(message)}"`, {
                        env: { ...process.env, DISPLAY: ':0' }
                    });
                    return { success: true, method: 'xmessage' };
                } catch (e) {
                    return { success: false, error: error.message };
                }
            }
        }

        // Execute based on platform
        let result;
        if (platform === 'win32') {
            result = showWindowsNotification();
        } else if (platform === 'darwin') {
            result = showMacOSNotification();
        } else {
            result = showLinuxNotification();
        }

        // Add metadata to result
        return {
            ...result,
            title,
            message,
            urgency,
            timeout,
            platform,
            timestamp: Date.now()
        };
    }
};
