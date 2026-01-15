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
 * Logout User Action - Deployed to agents to log out the current user
 * This script runs ON THE AGENT when triggered by the parent
 */
module.exports = {
    id: 'logout-user',
    platforms: ['win32', 'darwin', 'linux'],

    /**
     * This function is serialized and sent to the agent for execution
     * @param {Object} args - Arguments from parent
     * @param {string} args.username - Username to log out (optional, defaults to current)
     * @param {boolean} args.force - Force logout without saving (default: false)
     * @param {string} args.reason - Reason for logout (for logging)
     */
    script: function(args) {
        const { execSync, exec } = require('child_process');
        const os = require('os');
        const platform = process.platform;
        const { username, force = false, reason } = args;

        /**
         * Logout on Windows
         */
        function logoutWindows() {
            try {
                // Method 1: logoff command
                // First get session ID for the user
                const queryOutput = execSync('query session', { encoding: 'utf8', timeout: 5000 });
                const lines = queryOutput.split('\n');

                let sessionId = null;

                for (const line of lines) {
                    if ((username && line.toLowerCase().includes(username.toLowerCase())) ||
                        (!username && line.includes('>console'))) {
                        const match = line.match(/\s+(\d+)\s+/);
                        if (match) {
                            sessionId = match[1];
                            break;
                        }
                    }
                }

                if (sessionId) {
                    execSync(`logoff ${sessionId}`, { encoding: 'utf8', timeout: 10000 });
                    return { success: true, method: 'logoff', sessionId };
                }

                // Fallback: shutdown /l (logs off current user)
                execSync('shutdown /l', { encoding: 'utf8', timeout: 10000 });
                return { success: true, method: 'shutdown' };

            } catch (error) {
                // Try alternative: force sign out via query user
                try {
                    const queryUser = execSync('query user', { encoding: 'utf8', timeout: 5000 });
                    const lines = queryUser.split('\n');

                    for (const line of lines) {
                        if (line.includes('>') || (username && line.toLowerCase().includes(username.toLowerCase()))) {
                            const match = line.match(/\s+(\d+)\s+/);
                            if (match) {
                                execSync(`logoff ${match[1]}`, { encoding: 'utf8', timeout: 10000 });
                                return { success: true, method: 'logoff-fallback' };
                            }
                        }
                    }
                } catch (e) {
                    return { success: false, error: e.message };
                }
                return { success: false, error: error.message };
            }
        }

        /**
         * Logout on macOS
         */
        function logoutMacOS() {
            try {
                if (username && username !== os.userInfo().username) {
                    // Logout specific user
                    // Note: This requires admin privileges
                    execSync(`sudo launchctl bootout user/$(id -u ${username})`, {
                        encoding: 'utf8',
                        timeout: 10000
                    });
                    return { success: true, method: 'launchctl', username };
                }

                // Logout current user via AppleScript
                const script = `osascript -e 'tell application "System Events" to log out'`;
                exec(script);
                return { success: true, method: 'osascript' };

            } catch (error) {
                // Fallback: Use loginwindow
                try {
                    execSync(`osascript -e 'tell application "loginwindow" to «event aevtrlgo»'`, {
                        encoding: 'utf8',
                        timeout: 10000
                    });
                    return { success: true, method: 'loginwindow' };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        }

        /**
         * Logout on Linux
         */
        function logoutLinux() {
            try {
                // Method 1: loginctl (systemd)
                try {
                    // Get user's session
                    const sessionsOutput = execSync('loginctl list-sessions --no-legend', {
                        encoding: 'utf8',
                        timeout: 5000
                    });

                    const sessions = sessionsOutput.split('\n').filter(s => s.trim());

                    for (const session of sessions) {
                        const parts = session.trim().split(/\s+/);
                        const sessionId = parts[0];
                        const sessionUser = parts[2];

                        if ((username && sessionUser === username) ||
                            (!username && sessionUser === os.userInfo().username)) {
                            execSync(`loginctl terminate-session ${sessionId}`, {
                                encoding: 'utf8',
                                timeout: 10000
                            });
                            return { success: true, method: 'loginctl', sessionId };
                        }
                    }
                } catch (e) {
                    // Continue to other methods
                }

                // Method 2: Kill user's processes (more aggressive)
                const targetUser = username || os.userInfo().username;
                try {
                    execSync(`pkill -KILL -u ${targetUser}`, {
                        encoding: 'utf8',
                        timeout: 10000
                    });
                    return { success: true, method: 'pkill' };
                } catch (e) {
                    // Might fail if no processes found
                }

                // Method 3: Use gnome-session-quit (for GNOME)
                try {
                    exec('gnome-session-quit --force');
                    return { success: true, method: 'gnome-session' };
                } catch (e) {
                    // Continue
                }

                // Method 4: Use kde-logout (for KDE)
                try {
                    exec('qdbus org.kde.ksmserver /KSMServer logout 0 0 0');
                    return { success: true, method: 'kde-logout' };
                } catch (e) {
                    // Continue
                }

                return { success: false, error: 'No suitable logout method found' };

            } catch (error) {
                return { success: false, error: error.message };
            }
        }

        // Execute based on platform
        let result;
        if (platform === 'win32') {
            result = logoutWindows();
        } else if (platform === 'darwin') {
            result = logoutMacOS();
        } else {
            result = logoutLinux();
        }

        // Add metadata to result
        return {
            ...result,
            username: username || os.userInfo().username,
            force,
            reason,
            platform,
            timestamp: Date.now()
        };
    }
};
