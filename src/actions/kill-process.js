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
 * Kill Process Action - Deployed to agents to terminate processes
 * This script runs ON THE AGENT when triggered by the parent
 */
module.exports = {
    id: 'kill-process',
    platforms: ['win32', 'darwin', 'linux'],

    /**
     * This function is serialized and sent to the agent for execution
     * @param {Object} args - Arguments from parent
     * @param {number} args.pid - Process ID to kill
     * @param {string} args.processName - Process name (fallback)
     * @param {boolean} args.force - Force kill (default: true)
     * @param {string} args.reason - Reason for killing (for logging)
     */
    script: function(args) {
        const { execSync } = require('child_process');
        const platform = process.platform;
        const { pid, processName, force = true, reason } = args;

        /**
         * Kill process on Windows
         */
        function killWindows() {
            try {
                if (pid) {
                    // Kill by PID
                    const cmd = force
                        ? `taskkill /PID ${pid} /F`
                        : `taskkill /PID ${pid}`;
                    execSync(cmd, { encoding: 'utf8', timeout: 10000 });
                    return { success: true, method: 'pid' };
                }

                if (processName) {
                    // Kill by name
                    const cmd = force
                        ? `taskkill /IM "${processName}" /F`
                        : `taskkill /IM "${processName}"`;
                    execSync(cmd, { encoding: 'utf8', timeout: 10000 });
                    return { success: true, method: 'name' };
                }

                return { success: false, error: 'No pid or processName provided' };
            } catch (error) {
                // Check if process was already terminated
                if (error.message.includes('not found') ||
                    error.message.includes('not running')) {
                    return { success: true, alreadyTerminated: true };
                }
                return { success: false, error: error.message };
            }
        }

        /**
         * Kill process on macOS/Linux
         */
        function killUnix() {
            try {
                if (pid) {
                    // Kill by PID
                    const signal = force ? '-9' : '-15';
                    execSync(`kill ${signal} ${pid}`, { encoding: 'utf8', timeout: 5000 });
                    return { success: true, method: 'pid' };
                }

                if (processName) {
                    // Kill by name
                    const signal = force ? '-9' : '-15';
                    try {
                        execSync(`pkill ${signal} -f "${processName}"`, {
                            encoding: 'utf8',
                            timeout: 5000
                        });
                        return { success: true, method: 'pkill' };
                    } catch (pkillError) {
                        // pkill might not find any processes
                        // Try killall as fallback
                        execSync(`killall ${signal} "${processName}"`, {
                            encoding: 'utf8',
                            timeout: 5000
                        });
                        return { success: true, method: 'killall' };
                    }
                }

                return { success: false, error: 'No pid or processName provided' };
            } catch (error) {
                // Check if process was already terminated
                if (error.message.includes('No such process') ||
                    error.message.includes('no process found')) {
                    return { success: true, alreadyTerminated: true };
                }
                return { success: false, error: error.message };
            }
        }

        // Execute based on platform
        let result;
        if (platform === 'win32') {
            result = killWindows();
        } else {
            result = killUnix();
        }

        // Add metadata to result
        return {
            ...result,
            pid,
            processName,
            force,
            reason,
            platform,
            timestamp: Date.now()
        };
    }
};
