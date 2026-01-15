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
 * Process Monitor - Deployed to agents to track running processes and browsers
 * This script runs ON THE AGENT at the configured interval
 */
module.exports = {
    id: 'os-process-monitor',
    platforms: ['win32', 'darwin', 'linux'],

    /**
     * This function is serialized and sent to the agent for execution
     * It runs in a sandboxed environment on the remote machine
     */
    script: function() {
        const os = require('os');
        const { execSync } = require('child_process');
        const platform = process.platform;

        // Browser patterns for detection
        const browserPatterns = [
            { name: 'Chrome', patterns: ['chrome.exe', 'Google Chrome', 'chrome', 'google-chrome', 'google-chrome-stable'] },
            { name: 'Firefox', patterns: ['firefox.exe', 'Firefox', 'firefox', 'firefox-esr'] },
            { name: 'Safari', patterns: ['Safari', 'safari'] },
            { name: 'Edge', patterns: ['msedge.exe', 'Microsoft Edge', 'edge', 'microsoft-edge'] },
            { name: 'Opera', patterns: ['opera.exe', 'Opera', 'opera'] },
            { name: 'Brave', patterns: ['brave.exe', 'Brave Browser', 'brave', 'brave-browser'] },
            { name: 'Vivaldi', patterns: ['vivaldi.exe', 'Vivaldi', 'vivaldi'] },
            { name: 'Chromium', patterns: ['chromium.exe', 'Chromium', 'chromium', 'chromium-browser'] }
        ];

        // Game patterns for categorization
        const gamePatterns = [
            'minecraft', 'fortnite', 'roblox', 'steam', 'epic',
            'game', 'gaming', 'play', 'league', 'valorant',
            'overwatch', 'apex', 'pubg', 'genshin'
        ];

        // Education patterns
        const eduPatterns = [
            'khan', 'duolingo', 'scratch', 'code.org',
            'classroom', 'zoom', 'teams', 'meet'
        ];

        // Productivity patterns
        const prodPatterns = [
            'word', 'excel', 'powerpoint', 'office',
            'notepad', 'calculator', 'sublime', 'vscode', 'code'
        ];

        /**
         * Get process list on Windows
         */
        function getWindowsProcesses() {
            const processes = [];
            try {
                // Use tasklist for faster results
                const output = execSync('tasklist /FO CSV /NH', {
                    encoding: 'utf8',
                    timeout: 10000,
                    maxBuffer: 10 * 1024 * 1024
                });

                const lines = output.split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;

                    // Parse CSV: "name.exe","12345","Console","1","123,456 K"
                    const match = line.match(/"([^"]+)","(\d+)"/);
                    if (match) {
                        processes.push({
                            name: match[1],
                            pid: parseInt(match[2])
                        });
                    }
                }
            } catch (error) {
                console.error('Error getting Windows processes:', error.message);
            }
            return processes;
        }

        /**
         * Get process list on macOS
         */
        function getMacOSProcesses() {
            const processes = [];
            try {
                const output = execSync('ps -axo pid,comm', {
                    encoding: 'utf8',
                    timeout: 10000,
                    maxBuffer: 10 * 1024 * 1024
                });

                const lines = output.split('\n').slice(1); // Skip header
                for (const line of lines) {
                    if (!line.trim()) continue;

                    const match = line.trim().match(/^(\d+)\s+(.+)$/);
                    if (match) {
                        const fullPath = match[2];
                        const name = fullPath.split('/').pop();
                        processes.push({
                            pid: parseInt(match[1]),
                            name: name,
                            path: fullPath
                        });
                    }
                }
            } catch (error) {
                console.error('Error getting macOS processes:', error.message);
            }
            return processes;
        }

        /**
         * Get process list on Linux
         */
        function getLinuxProcesses() {
            const processes = [];
            try {
                const output = execSync('ps -eo pid,comm --no-headers', {
                    encoding: 'utf8',
                    timeout: 10000,
                    maxBuffer: 10 * 1024 * 1024
                });

                const lines = output.split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;

                    const match = line.trim().match(/^(\d+)\s+(.+)$/);
                    if (match) {
                        processes.push({
                            pid: parseInt(match[1]),
                            name: match[2]
                        });
                    }
                }
            } catch (error) {
                console.error('Error getting Linux processes:', error.message);
            }
            return processes;
        }

        /**
         * Check if process is a browser
         */
        function detectBrowser(processName) {
            const nameLower = processName.toLowerCase();

            for (const browser of browserPatterns) {
                if (browser.patterns.some(p => nameLower.includes(p.toLowerCase()))) {
                    return {
                        isBrowser: true,
                        browserName: browser.name
                    };
                }
            }

            return { isBrowser: false };
        }

        /**
         * Categorize a process
         */
        function categorizeProcess(processName) {
            const nameLower = processName.toLowerCase();

            if (gamePatterns.some(p => nameLower.includes(p))) {
                return { type: 'game', category: 'games' };
            }

            if (eduPatterns.some(p => nameLower.includes(p))) {
                return { type: 'education', category: 'education' };
            }

            if (prodPatterns.some(p => nameLower.includes(p))) {
                return { type: 'productivity', category: 'productivity' };
            }

            return { type: 'unknown', category: 'other' };
        }

        // Main execution
        let rawProcesses = [];

        if (platform === 'win32') {
            rawProcesses = getWindowsProcesses();
        } else if (platform === 'darwin') {
            rawProcesses = getMacOSProcesses();
        } else if (platform === 'linux') {
            rawProcesses = getLinuxProcesses();
        }

        // Process and classify
        const processes = [];
        const browsers = [];

        for (const proc of rawProcesses) {
            const browserInfo = detectBrowser(proc.name);
            const categoryInfo = categorizeProcess(proc.name);

            const processInfo = {
                pid: proc.pid,
                name: proc.name,
                path: proc.path,
                type: browserInfo.isBrowser ? 'browser' : categoryInfo.type,
                category: browserInfo.isBrowser ? 'internet' : categoryInfo.category
            };

            if (browserInfo.isBrowser) {
                processInfo.browserName = browserInfo.browserName;
                browsers.push({
                    pid: proc.pid,
                    name: proc.name,
                    browserName: browserInfo.browserName
                });
            }

            processes.push(processInfo);
        }

        // Return process data
        return {
            timestamp: Date.now(),
            hostname: os.hostname(),
            platform: platform,
            processCount: processes.length,
            browsers: browsers,
            browserActive: browsers.length > 0,
            // Return only interesting processes (not system processes)
            // to reduce data transfer
            processes: processes.filter(p =>
                p.type !== 'unknown' ||
                p.name.toLowerCase().includes('game') ||
                p.category === 'internet'
            ).slice(0, 100), // Limit to 100 processes
            // Summary counts by category
            summary: {
                games: processes.filter(p => p.category === 'games').length,
                education: processes.filter(p => p.category === 'education').length,
                productivity: processes.filter(p => p.category === 'productivity').length,
                internet: browsers.length,
                other: processes.filter(p => p.category === 'other').length
            }
        };
    }
};
