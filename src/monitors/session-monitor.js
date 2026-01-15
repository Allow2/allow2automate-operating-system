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
 * Session Monitor - Deployed to agents to track OS user sessions
 * This script runs ON THE AGENT at the configured interval
 */
module.exports = {
    id: 'os-session-monitor',
    platforms: ['win32', 'darwin', 'linux'],

    /**
     * This function is serialized and sent to the agent for execution
     * It runs in a sandboxed environment on the remote machine
     */
    script: function() {
        const os = require('os');
        const { execSync } = require('child_process');
        const platform = process.platform;

        /**
         * Get current logged-in user on Windows
         */
        function getWindowsUser() {
            try {
                // Method 1: query user command
                const output = execSync('query user', { encoding: 'utf8', timeout: 5000 });
                const lines = output.split('\n').slice(1);

                for (const line of lines) {
                    if (line.includes('>')) {
                        // Active session marked with >
                        const parts = line.trim().replace('>', '').split(/\s+/);
                        return {
                            username: parts[0],
                            sessionName: parts[1],
                            sessionId: parseInt(parts[2]) || 0,
                            state: parts[3],
                            loginTime: parseLoginTime(parts.slice(5).join(' '))
                        };
                    }
                }
            } catch (error) {
                // Fallback: WMI
                try {
                    const output = execSync('wmic computersystem get username /format:csv', {
                        encoding: 'utf8',
                        timeout: 5000
                    });
                    const lines = output.split('\n');
                    if (lines.length > 1) {
                        const parts = lines[1].split(',');
                        if (parts.length > 1) {
                            const domainUser = parts[1].trim();
                            const username = domainUser.includes('\\')
                                ? domainUser.split('\\')[1]
                                : domainUser;
                            return { username };
                        }
                    }
                } catch (e) {
                    // Last resort: environment variable
                    return { username: process.env.USERNAME || os.userInfo().username };
                }
            }
            return null;
        }

        /**
         * Get current logged-in user on macOS
         */
        function getMacOSUser() {
            try {
                // Method 1: who command for console user
                const output = execSync('who', { encoding: 'utf8', timeout: 5000 });
                const lines = output.split('\n');

                for (const line of lines) {
                    if (line.includes('console')) {
                        const parts = line.trim().split(/\s+/);
                        return {
                            username: parts[0],
                            terminal: parts[1],
                            loginTime: parseLoginTime(parts.slice(2).join(' '))
                        };
                    }
                }

                // Method 2: scutil for console user
                const scutilOutput = execSync('scutil <<< "show State:/Users/ConsoleUser"', {
                    encoding: 'utf8',
                    timeout: 5000,
                    shell: '/bin/bash'
                });
                const match = scutilOutput.match(/Name\s*:\s*(\w+)/);
                if (match) {
                    return { username: match[1] };
                }
            } catch (error) {
                // Fallback
                return { username: os.userInfo().username };
            }
            return null;
        }

        /**
         * Get current logged-in user on Linux
         */
        function getLinuxUser() {
            try {
                // Method 1: who command for X display session
                const output = execSync('who', { encoding: 'utf8', timeout: 5000 });
                const lines = output.split('\n');

                for (const line of lines) {
                    if (line.includes('(:0)') || line.includes('tty7')) {
                        const parts = line.trim().split(/\s+/);
                        return {
                            username: parts[0],
                            display: parts[1],
                            loginTime: parseLoginTime(parts.slice(2).join(' '))
                        };
                    }
                }

                // Method 2: loginctl
                try {
                    const sessionsOutput = execSync('loginctl list-sessions --no-legend', {
                        encoding: 'utf8',
                        timeout: 5000
                    });
                    const sessions = sessionsOutput.split('\n').filter(s => s.trim());

                    for (const session of sessions) {
                        const sessionId = session.trim().split(/\s+/)[0];
                        const sessionInfo = execSync(`loginctl show-session ${sessionId}`, {
                            encoding: 'utf8',
                            timeout: 5000
                        });

                        if (sessionInfo.includes('Type=x11') || sessionInfo.includes('Type=wayland')) {
                            const userMatch = sessionInfo.match(/Name=(\w+)/);
                            if (userMatch) {
                                return { username: userMatch[1] };
                            }
                        }
                    }
                } catch (e) {
                    // Ignore loginctl errors
                }
            } catch (error) {
                // Fallback
                return { username: os.userInfo().username };
            }
            return null;
        }

        /**
         * Get idle time on Windows
         */
        function getWindowsIdleTime() {
            try {
                // PowerShell script to get idle time via Win32 API
                const script = `
                    Add-Type @"
                    using System;
                    using System.Runtime.InteropServices;
                    public class IdleTime {
                        [StructLayout(LayoutKind.Sequential)]
                        public struct LASTINPUTINFO {
                            public uint cbSize;
                            public uint dwTime;
                        }
                        [DllImport("user32.dll")]
                        public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
                        public static uint GetIdleTime() {
                            LASTINPUTINFO lii = new LASTINPUTINFO();
                            lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
                            if (GetLastInputInfo(ref lii)) {
                                return (uint)Environment.TickCount - lii.dwTime;
                            }
                            return 0;
                        }
                    }
"@
                    [IdleTime]::GetIdleTime()
                `;

                const output = execSync(
                    `powershell -Command "${script.replace(/\n/g, ' ')}"`,
                    { encoding: 'utf8', timeout: 10000 }
                );
                return parseInt(output.trim()) || 0;
            } catch (error) {
                return 0;
            }
        }

        /**
         * Get idle time on macOS
         */
        function getMacOSIdleTime() {
            try {
                const output = execSync('ioreg -c IOHIDSystem | grep HIDIdleTime', {
                    encoding: 'utf8',
                    timeout: 5000
                });
                const match = output.match(/HIDIdleTime"\s*=\s*(\d+)/);
                if (match) {
                    // Convert from nanoseconds to milliseconds
                    return Math.floor(parseInt(match[1]) / 1000000);
                }
            } catch (error) {
                // Ignore
            }
            return 0;
        }

        /**
         * Get idle time on Linux
         */
        function getLinuxIdleTime() {
            try {
                // Try xprintidle first (most reliable)
                const output = execSync('xprintidle', { encoding: 'utf8', timeout: 5000 });
                return parseInt(output.trim()) || 0;
            } catch (error) {
                // Fallback: parse 'w' command
                try {
                    const output = execSync('w -h -s', { encoding: 'utf8', timeout: 5000 });
                    const match = output.match(/(\d+):(\d+)m/);
                    if (match) {
                        return (parseInt(match[1]) * 60 + parseInt(match[2])) * 60000;
                    }
                } catch (e) {
                    // Ignore
                }
            }
            return 0;
        }

        /**
         * Parse login time string to timestamp
         */
        function parseLoginTime(timeStr) {
            try {
                const date = new Date(timeStr);
                if (!isNaN(date.getTime())) {
                    return date.getTime();
                }
            } catch (e) {
                // Ignore
            }
            return null;
        }

        // Main execution
        let userData = null;
        let idleTime = 0;

        if (platform === 'win32') {
            userData = getWindowsUser();
            idleTime = getWindowsIdleTime();
        } else if (platform === 'darwin') {
            userData = getMacOSUser();
            idleTime = getMacOSIdleTime();
        } else if (platform === 'linux') {
            userData = getLinuxUser();
            idleTime = getLinuxIdleTime();
        }

        // Return session data
        return {
            timestamp: Date.now(),
            hostname: os.hostname(),
            platform: platform,
            username: userData?.username || os.userInfo().username,
            sessionId: userData?.sessionId,
            sessionName: userData?.sessionName,
            loginTime: userData?.loginTime,
            idleTime: idleTime,
            isIdle: idleTime > 300000, // Consider idle after 5 minutes
            uptime: os.uptime() * 1000,
            systemUser: os.userInfo().username
        };
    }
};
