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

// Import UI components
import TabContent from './components/TabContent';

// Import monitor and action definitions
const sessionMonitor = require('./monitors/session-monitor');
const processMonitor = require('./monitors/process-monitor');
const killProcessAction = require('./actions/kill-process');
const logoutUserAction = require('./actions/logout-user');
const showWarningAction = require('./actions/show-warning');
const lockSessionAction = require('./actions/lock-session');

// Export that this plugin requires main process execution
module.exports.requiresMainProcess = true;

/**
 * OS Plugin Factory
 * Monitors OS sessions, processes, and enforces computer/internet time quotas
 * via the Agent system - deploys monitors and actions TO remote agents
 *
 * @param {Object} context - Allow2Automate plugin context
 */
function plugin(context) {
    const {
        ipcMain,
        configurationUpdate,
        statusUpdate,
        services
    } = context;

    let state = null;
    let agentService = null;

    // Track scheduled shutdown timers per agent
    const shutdownTimers = new Map();
    // Track usage per agent/child
    const usageTracking = new Map();

    const osPlugin = {};

    /**
     * onLoad - Initialize plugin when Allow2Automate starts
     * @param {Object} loadState - Persisted state from previous session
     */
    osPlugin.onLoad = async function(loadState) {
        console.log('[OS Plugin] Loading...', loadState);

        // Restore persisted state or initialize defaults
        state = loadState || {
            // Agent configurations
            agents: {},               // agentId -> { childId, enabled, lastSeen, platform }

            // User to child mappings (per agent)
            userMappings: {},         // agentId -> { osUsername -> childId }

            // Parent accounts (per agent) - never restricted
            parentAccounts: {},       // agentId -> [username, ...]

            // Per-child settings
            children: {},             // childId -> { quotas, bedtime, blockedProcesses, schedules, focusMode }

            // Global settings
            settings: {
                pauseOnIdle: true,
                idleThreshold: 300000,   // 5 minutes in ms
                warningTimes: [15, 5, 1], // Minutes before action
                gracePeriod: 60,          // Seconds before forced action
                monitorInterval: 30000,   // How often agents report (30 seconds)
                killOnViolation: true,
                notifyParent: true
            },

            // Activity log
            violations: [],
            activityLog: [],

            // Last sync timestamps
            lastSync: null
        };

        // Get agent service from context
        agentService = context.services?.agent;
        if (!agentService) {
            console.error('[OS Plugin] Agent service not available - plugin will not function');
            statusUpdate({
                status: 'error',
                message: 'Agent service not available',
                timestamp: Date.now()
            });
            return;
        }

        try {
            // Deploy monitors and actions to all agents
            const agents = await agentService.listAgents();
            console.log(`[OS Plugin] Found ${agents.length} agents`);

            for (const agent of agents) {
                await deployToAgent(agent);
            }

            // Setup event listeners
            setupEventListeners();

            // Setup IPC handlers for renderer communication
            setupIPCHandlers();

            console.log('[OS Plugin] Loaded successfully');
            statusUpdate({
                status: 'connected',
                message: 'OS monitoring active',
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('[OS Plugin] Error during initialization:', error);
            statusUpdate({
                status: 'error',
                message: `Initialization error: ${error.message}`,
                timestamp: Date.now()
            });
        }
    };

    /**
     * Deploy monitors and actions to an agent
     */
    async function deployToAgent(agent) {
        console.log(`[OS Plugin] Deploying to agent: ${agent.hostname} (${agent.platform})`);

        try {
            // Deploy session monitor
            await agentService.deployMonitor(agent.id, {
                pluginId: 'allow2automate-operating-system',
                monitorId: sessionMonitor.id,
                script: sessionMonitor.script.toString(),
                interval: state.settings.monitorInterval,
                platforms: sessionMonitor.platforms
            });

            // Deploy process monitor
            await agentService.deployMonitor(agent.id, {
                pluginId: 'allow2automate-operating-system',
                monitorId: processMonitor.id,
                script: processMonitor.script.toString(),
                interval: state.settings.monitorInterval,
                platforms: processMonitor.platforms
            });

            // Deploy action scripts
            const actions = [killProcessAction, logoutUserAction, showWarningAction, lockSessionAction];
            for (const action of actions) {
                await agentService.deployAction(agent.id, {
                    pluginId: 'allow2automate-operating-system',
                    actionId: action.id,
                    script: action.script.toString(),
                    platforms: action.platforms
                });
            }

            // Update agent state
            state.agents[agent.id] = {
                id: agent.id,
                hostname: agent.hostname,
                platform: agent.platform,
                enabled: true,
                childId: state.agents[agent.id]?.childId || null,
                lastSeen: Date.now()
            };

            configurationUpdate(state);
            console.log(`[OS Plugin] Successfully deployed to ${agent.hostname}`);

        } catch (error) {
            console.error(`[OS Plugin] Error deploying to ${agent.hostname}:`, error);
        }
    }

    /**
     * Setup event listeners for agent events
     */
    function setupEventListeners() {
        // Listen for new agents
        agentService.on('agentDiscovered', async (agent) => {
            console.log(`[OS Plugin] New agent discovered: ${agent.hostname}`);
            await deployToAgent(agent);
        });

        // Listen for plugin data from agents (monitor results)
        agentService.on('pluginData', (data) => {
            if (data.pluginId !== 'allow2automate-operating-system') return;

            const { agentId, monitorId, result } = data;

            if (monitorId === 'os-session-monitor') {
                handleSessionData(agentId, result);
            } else if (monitorId === 'os-process-monitor') {
                handleProcessData(agentId, result);
            }
        });

        // Listen for action responses
        agentService.on('actionResponse', (data) => {
            if (data.pluginId !== 'allow2automate-operating-system') return;

            console.log(`[OS Plugin] Action response from ${data.agentId}:`, data);

            if (data.actionId === 'kill-process' && data.success) {
                logViolation({
                    type: 'process_killed',
                    agentId: data.agentId,
                    processName: data.args?.processName,
                    reason: data.args?.reason || 'quota_enforcement',
                    timestamp: Date.now()
                });
            }
        });

        // Listen for Allow2 state changes
        if (context.allow2) {
            context.allow2.on('stateChange', async (childId, newState) => {
                console.log(`[OS Plugin] Allow2 state change for child ${childId}`, newState);
                await handleAllow2StateChange(childId, newState);
            });
        }
    }

    /**
     * Handle session data from agent
     */
    async function handleSessionData(agentId, data) {
        const agent = state.agents[agentId];
        if (!agent) return;

        agent.lastSeen = Date.now();
        agent.currentSession = data;

        // Map OS username to child ID
        const userMappings = state.userMappings[agentId] || {};
        const childId = userMappings[data.username];

        if (childId) {
            agent.childId = childId;

            // Check if this is a parent account
            const parentAccounts = state.parentAccounts[agentId] || [];
            if (parentAccounts.includes(data.username)) {
                // Parent accounts are never restricted
                console.log(`[OS Plugin] Parent account logged in on ${agent.hostname}`);
                return;
            }

            // Track session time
            updateUsageTracking(agentId, childId, 'computer', data);

            // Check quotas and bedtime with Allow2
            await checkQuotasAndEnforce(agentId, childId, data);
        }

        // Notify renderer
        if (context.sendToRenderer) {
            context.sendToRenderer('osSessionUpdate', { agentId, session: data });
        }

        configurationUpdate(state);
    }

    /**
     * Handle process data from agent
     */
    async function handleProcessData(agentId, data) {
        const agent = state.agents[agentId];
        if (!agent || !agent.childId) return;

        const childId = agent.childId;
        const childConfig = state.children[childId] || {};

        // Check for browsers (internet time tracking)
        if (data.browsers && data.browsers.length > 0) {
            updateUsageTracking(agentId, childId, 'internet', data);
        }

        // Check for blocked processes
        const blockedProcesses = childConfig.blockedProcesses || [];
        for (const proc of data.processes || []) {
            const procName = proc.name.toLowerCase();
            const isBlocked = blockedProcesses.some(bp =>
                procName.includes(bp.toLowerCase())
            );

            if (isBlocked) {
                console.log(`[OS Plugin] Blocked process detected on ${agent.hostname}: ${proc.name}`);

                // Kill the blocked process
                if (state.settings.killOnViolation) {
                    await agentService.triggerAction(agentId, {
                        pluginId: 'allow2automate-operating-system',
                        actionId: 'kill-process',
                        args: {
                            pid: proc.pid,
                            processName: proc.name,
                            reason: 'blocked_process'
                        }
                    });
                }

                // Show warning on agent
                await agentService.triggerAction(agentId, {
                    pluginId: 'allow2automate-operating-system',
                    actionId: 'show-warning',
                    args: {
                        title: 'Application Blocked',
                        message: `${proc.name} is not allowed right now`,
                        urgency: 'normal'
                    }
                });

                // Log violation
                logViolation({
                    type: 'blocked_process',
                    agentId,
                    processName: proc.name,
                    reason: 'blocked_list',
                    timestamp: Date.now()
                });

                // Notify renderer
                if (context.sendToRenderer) {
                    context.sendToRenderer('osBlockedProcessDetected', {
                        agentId,
                        hostname: agent.hostname,
                        processName: proc.name
                    });
                }
            }
        }
    }

    /**
     * Update usage tracking
     */
    function updateUsageTracking(agentId, childId, type, data) {
        const key = `${agentId}:${childId}:${type}`;
        const tracking = usageTracking.get(key) || {
            startTime: Date.now(),
            lastUpdate: Date.now(),
            totalSeconds: 0
        };

        const now = Date.now();
        const elapsed = (now - tracking.lastUpdate) / 1000;

        // Only count if activity is present
        if (type === 'internet' && data.browsers?.length > 0) {
            tracking.totalSeconds += elapsed;
        } else if (type === 'computer' && !data.isIdle) {
            tracking.totalSeconds += elapsed;
        } else if (type === 'computer' && data.isIdle && !state.settings.pauseOnIdle) {
            tracking.totalSeconds += elapsed;
        }

        tracking.lastUpdate = now;
        usageTracking.set(key, tracking);
    }

    /**
     * Check quotas with Allow2 and enforce if needed
     */
    async function checkQuotasAndEnforce(agentId, childId, sessionData) {
        const allow2Client = services?.allow2Client;
        if (!allow2Client) return;

        const agent = state.agents[agentId];
        if (!agent) return;

        try {
            // Check computer time allowance (without logging - just checking)
            const computerAllowance = await allow2Client.checkActivity({
                child_id: childId,
                activity_type: 'computer',
                log_usage: false,
                check_only: true,
                device_id: agentId
            });

            // Check internet time if browsers are active
            let internetAllowance = null;
            if (agent.currentProcessData?.browsers?.length > 0) {
                internetAllowance = await allow2Client.checkActivity({
                    child_id: childId,
                    activity_type: 'internet',
                    log_usage: false,
                    check_only: true,
                    device_id: agentId
                });
            }

            // Process warnings
            const warnings = [];

            if (computerAllowance) {
                // Check for bans
                if (computerAllowance.is_banned || computerAllowance.is_activity_blocked || !computerAllowance.allowed) {
                    await enforceLogout(agentId, childId, 'Computer access blocked');
                    return;
                }

                // Check remaining time
                const remainingMinutes = computerAllowance.remaining_seconds / 60;
                for (const warningTime of state.settings.warningTimes) {
                    if (remainingMinutes <= warningTime && remainingMinutes > warningTime - 1) {
                        await showTimeWarning(agentId, 'computer', remainingMinutes);
                    }
                }

                if (computerAllowance.remaining_seconds <= 0) {
                    await enforceLogout(agentId, childId, 'Computer time exhausted');
                    return;
                }

                // Schedule shutdown based on remaining time
                scheduleShutdown(agentId, childId, computerAllowance.remaining_seconds);
            }

            if (internetAllowance && !internetAllowance.allowed) {
                await blockBrowsers(agentId, childId);
            }

            // Check bedtime
            await checkBedtime(agentId, childId);

        } catch (error) {
            console.error(`[OS Plugin] Error checking quotas for ${agentId}:`, error);
        }
    }

    /**
     * Handle Allow2 state changes (from external changes like mobile app)
     */
    async function handleAllow2StateChange(childId, newState) {
        // Find all agents with this child
        for (const [agentId, agentData] of Object.entries(state.agents)) {
            if (agentData.childId === childId) {
                // Re-check quotas for this agent
                await checkQuotasAndEnforce(agentId, childId, agentData.currentSession || {});
            }
        }
    }

    /**
     * Schedule shutdown for an agent
     */
    function scheduleShutdown(agentId, childId, remainingSeconds) {
        // Clear existing timer
        const existingTimer = shutdownTimers.get(agentId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Don't schedule if more than 1 hour remaining
        if (remainingSeconds > 3600) return;

        const shutdownTime = Date.now() + (remainingSeconds * 1000);

        // Schedule warning intervals
        for (const warningMinutes of state.settings.warningTimes) {
            const warningSeconds = warningMinutes * 60;
            if (remainingSeconds > warningSeconds) {
                const warningDelay = (remainingSeconds - warningSeconds) * 1000;
                setTimeout(() => {
                    showTimeWarning(agentId, 'computer', warningMinutes);
                }, warningDelay);
            }
        }

        // Schedule actual shutdown
        const timer = setTimeout(async () => {
            await enforceLogout(agentId, childId, 'Computer time exhausted');
        }, remainingSeconds * 1000);

        shutdownTimers.set(agentId, timer);
        console.log(`[OS Plugin] Scheduled shutdown for ${agentId} in ${remainingSeconds} seconds`);
    }

    /**
     * Show time warning on agent
     */
    async function showTimeWarning(agentId, type, minutesRemaining) {
        const agent = state.agents[agentId];
        if (!agent) return;

        await agentService.triggerAction(agentId, {
            pluginId: 'allow2automate-operating-system',
            actionId: 'show-warning',
            args: {
                title: `${Math.round(minutesRemaining)} minutes remaining`,
                message: `You have ${Math.round(minutesRemaining)} minutes of ${type} time left.`,
                urgency: minutesRemaining <= 5 ? 'critical' : 'normal'
            }
        });

        // Notify renderer
        if (context.sendToRenderer) {
            context.sendToRenderer('osQuotaWarning', {
                agentId,
                type,
                remaining: minutesRemaining
            });
        }
    }

    /**
     * Enforce logout on agent
     */
    async function enforceLogout(agentId, childId, reason) {
        const agent = state.agents[agentId];
        if (!agent) return;

        console.log(`[OS Plugin] Enforcing logout on ${agent.hostname}: ${reason}`);

        // Show final warning
        await agentService.triggerAction(agentId, {
            pluginId: 'allow2automate-operating-system',
            actionId: 'show-warning',
            args: {
                title: 'Time is up!',
                message: `Logging out in ${state.settings.gracePeriod} seconds. Please save your work.`,
                urgency: 'critical'
            }
        });

        // Schedule logout after grace period
        setTimeout(async () => {
            await agentService.triggerAction(agentId, {
                pluginId: 'allow2automate-operating-system',
                actionId: 'logout-user',
                args: {
                    username: agent.currentSession?.username,
                    reason
                }
            });
        }, state.settings.gracePeriod * 1000);

        // Log violation
        logViolation({
            type: 'quota_exhausted',
            agentId,
            hostname: agent.hostname,
            reason,
            timestamp: Date.now()
        });

        // Notify renderer
        if (context.sendToRenderer) {
            context.sendToRenderer('osQuotaExhausted', {
                agentId,
                hostname: agent.hostname,
                type: 'computer',
                reason
            });
        }
    }

    /**
     * Block browsers on agent
     */
    async function blockBrowsers(agentId, childId) {
        const agent = state.agents[agentId];
        if (!agent) return;

        const browserProcesses = agent.currentProcessData?.browsers || [];

        for (const browser of browserProcesses) {
            await agentService.triggerAction(agentId, {
                pluginId: 'allow2automate-operating-system',
                actionId: 'kill-process',
                args: {
                    pid: browser.pid,
                    processName: browser.name,
                    reason: 'internet_quota_exhausted'
                }
            });
        }

        await agentService.triggerAction(agentId, {
            pluginId: 'allow2automate-operating-system',
            actionId: 'show-warning',
            args: {
                title: 'Internet Time Exhausted',
                message: 'Browsers are now blocked. Internet time quota has been reached.',
                urgency: 'normal'
            }
        });
    }

    /**
     * Check bedtime for an agent
     */
    async function checkBedtime(agentId, childId) {
        const childConfig = state.children[childId];
        if (!childConfig?.bedtime?.enabled) return;

        const rules = childConfig.bedtime;
        const now = new Date();
        const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];

        if (!rules.days.includes(dayName)) return;

        const [hour, minute] = rules.time.split(':').map(Number);
        const bedtime = new Date(now);
        bedtime.setHours(hour, minute, 0, 0);

        const minutesUntilBedtime = (bedtime - now) / 60000;

        if (minutesUntilBedtime <= 0) {
            // Bedtime reached - logout
            await enforceLogout(agentId, childId, 'Bedtime reached');
        } else if (minutesUntilBedtime <= 15) {
            // Warning
            await agentService.triggerAction(agentId, {
                pluginId: 'allow2automate-operating-system',
                actionId: 'show-warning',
                args: {
                    title: 'Bedtime Soon',
                    message: `Computer will log out in ${Math.ceil(minutesUntilBedtime)} minutes for bedtime.`,
                    urgency: minutesUntilBedtime <= 5 ? 'critical' : 'normal'
                }
            });

            if (context.sendToRenderer) {
                context.sendToRenderer('osBedtimeWarning', {
                    agentId,
                    minutes: Math.ceil(minutesUntilBedtime)
                });
            }
        }
    }

    /**
     * Setup IPC handlers for renderer communication
     */
    function setupIPCHandlers() {
        // Get current status
        ipcMain.handle('os:getStatus', async () => {
            try {
                const agents = await agentService.listAgents();
                const onlineAgents = agents.filter(a => a.online);
                const monitoredChildren = Object.values(state.agents).filter(a => a.childId).length;

                return [null, {
                    agentCount: agents.length,
                    activeAgents: onlineAgents.length,
                    monitoredChildren,
                    agents: agents.map(a => ({
                        id: a.id,
                        hostname: a.hostname,
                        platform: a.platform,
                        online: a.online,
                        childId: state.agents[a.id]?.childId,
                        enabled: state.agents[a.id]?.enabled
                    })),
                    recentViolations: state.violations.slice(0, 10),
                    settings: state.settings,
                    lastSync: state.lastSync
                }];
            } catch (error) {
                return [error];
            }
        });

        // Get agents
        ipcMain.handle('os:getAgents', async () => {
            try {
                const agents = await agentService.listAgents();
                return [null, {
                    agents: agents.map(a => ({
                        id: a.id,
                        hostname: a.hostname,
                        platform: a.platform,
                        online: a.online,
                        childId: state.agents[a.id]?.childId,
                        enabled: state.agents[a.id]?.enabled,
                        currentSession: state.agents[a.id]?.currentSession
                    }))
                }];
            } catch (error) {
                return [error];
            }
        });

        // Link agent to child
        ipcMain.handle('os:linkAgent', async (event, { agentId, childId }) => {
            try {
                if (!state.agents[agentId]) {
                    state.agents[agentId] = { id: agentId };
                }

                state.agents[agentId].childId = childId;
                state.agents[agentId].enabled = true;

                configurationUpdate(state);
                return [null, { success: true }];
            } catch (error) {
                return [error];
            }
        });

        // Unlink agent
        ipcMain.handle('os:unlinkAgent', async (event, { agentId }) => {
            try {
                if (state.agents[agentId]) {
                    state.agents[agentId].childId = null;
                    state.agents[agentId].enabled = false;
                }

                // Clear any scheduled shutdown
                const timer = shutdownTimers.get(agentId);
                if (timer) {
                    clearTimeout(timer);
                    shutdownTimers.delete(agentId);
                }

                configurationUpdate(state);
                return [null, { success: true }];
            } catch (error) {
                return [error];
            }
        });

        // Set user mapping for an agent
        ipcMain.handle('os:setUserMapping', async (event, { agentId, username, childId }) => {
            try {
                if (!state.userMappings[agentId]) {
                    state.userMappings[agentId] = {};
                }

                if (childId) {
                    state.userMappings[agentId][username] = childId;
                } else {
                    delete state.userMappings[agentId][username];
                }

                configurationUpdate(state);
                return [null, { success: true }];
            } catch (error) {
                return [error];
            }
        });

        // Set parent accounts for an agent
        ipcMain.handle('os:setParentAccounts', async (event, { agentId, accounts }) => {
            try {
                state.parentAccounts[agentId] = accounts || [];
                configurationUpdate(state);
                return [null, { success: true }];
            } catch (error) {
                return [error];
            }
        });

        // Update child settings
        ipcMain.handle('os:updateChildSettings', async (event, { childId, settings }) => {
            try {
                state.children[childId] = {
                    ...state.children[childId],
                    ...settings
                };

                configurationUpdate(state);
                return [null, { success: true }];
            } catch (error) {
                return [error];
            }
        });

        // Get violations
        ipcMain.handle('os:getViolations', async (event, { limit = 50 }) => {
            try {
                return [null, { violations: state.violations.slice(0, limit) }];
            } catch (error) {
                return [error];
            }
        });

        // Clear violations
        ipcMain.handle('os:clearViolations', async () => {
            try {
                state.violations = [];
                configurationUpdate(state);
                return [null, { success: true }];
            } catch (error) {
                return [error];
            }
        });

        // Get activity log
        ipcMain.handle('os:getActivityLog', async (event, { limit = 100 }) => {
            try {
                return [null, { activities: state.activityLog.slice(0, limit) }];
            } catch (error) {
                return [error];
            }
        });

        // Get settings
        ipcMain.handle('os:getSettings', async () => {
            try {
                return [null, { settings: state.settings }];
            } catch (error) {
                return [error];
            }
        });

        // Update settings
        ipcMain.handle('os:updateSettings', async (event, { settings }) => {
            try {
                state.settings = { ...state.settings, ...settings };

                // Update monitor intervals on agents if changed
                if (settings.monitorInterval) {
                    const agents = await agentService.listAgents();
                    for (const agent of agents) {
                        await agentService.updateMonitor(agent.id, {
                            pluginId: 'allow2automate-operating-system',
                            monitorId: sessionMonitor.id,
                            interval: settings.monitorInterval
                        });
                        await agentService.updateMonitor(agent.id, {
                            pluginId: 'allow2automate-operating-system',
                            monitorId: processMonitor.id,
                            interval: settings.monitorInterval
                        });
                    }
                }

                configurationUpdate(state);
                return [null, { success: true }];
            } catch (error) {
                return [error];
            }
        });

        // Force logout on agent
        ipcMain.handle('os:forceLogout', async (event, { agentId, graceSeconds }) => {
            try {
                const agent = state.agents[agentId];
                if (!agent) {
                    return [new Error('Agent not found')];
                }

                await enforceLogout(agentId, agent.childId, 'Manual logout by parent');
                return [null, { success: true }];
            } catch (error) {
                return [error];
            }
        });

        // Lock session on agent
        ipcMain.handle('os:lockSession', async (event, { agentId }) => {
            try {
                await agentService.triggerAction(agentId, {
                    pluginId: 'allow2automate-operating-system',
                    actionId: 'lock-session',
                    args: {}
                });
                return [null, { success: true }];
            } catch (error) {
                return [error];
            }
        });

        // Trigger focus mode
        ipcMain.handle('os:triggerFocusMode', async (event, { agentId, enabled, childId }) => {
            try {
                const childConfig = state.children[childId];
                if (!childConfig?.focusMode) {
                    return [new Error('Focus mode not configured for this child')];
                }

                // Focus mode would hide icons and block distracting processes
                // This would require additional action scripts deployed to agents
                // For now, we track the state and can block processes via the process monitor

                if (!state.agents[agentId]) {
                    state.agents[agentId] = { id: agentId };
                }
                state.agents[agentId].focusModeActive = enabled;

                configurationUpdate(state);
                return [null, { success: true, focusModeActive: enabled }];
            } catch (error) {
                return [error];
            }
        });
    }

    /**
     * Log a violation
     */
    function logViolation(violation) {
        state.violations.unshift(violation);
        if (state.violations.length > 200) {
            state.violations = state.violations.slice(0, 200);
        }

        // Log to activity feed
        logActivity({
            type: violation.type,
            message: `${violation.type}: ${violation.reason || violation.processName || ''}`,
            agentId: violation.agentId,
            timestamp: violation.timestamp
        });

        // Notify parent via renderer
        if (state.settings.notifyParent && context.sendToRenderer) {
            context.sendToRenderer('osViolation', violation);
        }

        configurationUpdate(state);
    }

    /**
     * Log an activity
     */
    function logActivity(activity) {
        state.activityLog.unshift(activity);
        if (state.activityLog.length > 500) {
            state.activityLog = state.activityLog.slice(0, 500);
        }
    }

    /**
     * newState - Handle configuration updates from renderer
     * @param {Object} newState - Updated state
     */
    osPlugin.newState = function(newState) {
        console.log('[OS Plugin] State updated:', newState);
        state = newState;
    };

    /**
     * onSetEnabled - Start/stop monitoring when plugin enabled/disabled
     * @param {boolean} enabled - Plugin enabled state
     */
    osPlugin.onSetEnabled = async function(enabled) {
        console.log(`[OS Plugin] ${enabled ? 'enabled' : 'disabled'}`);

        if (enabled) {
            statusUpdate({
                status: 'connected',
                message: 'OS monitoring active',
                timestamp: Date.now()
            });
        } else {
            // Clear all scheduled shutdowns
            for (const timer of shutdownTimers.values()) {
                clearTimeout(timer);
            }
            shutdownTimers.clear();

            statusUpdate({
                status: 'disconnected',
                message: 'OS monitoring paused',
                timestamp: Date.now()
            });
        }

        configurationUpdate(state);
    };

    /**
     * onUnload - Cleanup when plugin is removed
     * @param {Function} callback - Completion callback
     */
    osPlugin.onUnload = async function(callback) {
        console.log('[OS Plugin] Unloading...');

        // Clear all scheduled shutdowns
        for (const timer of shutdownTimers.values()) {
            clearTimeout(timer);
        }
        shutdownTimers.clear();

        // Remove monitors and actions from agents
        try {
            const agents = await agentService.listAgents();
            for (const agent of agents) {
                await agentService.removeMonitor(agent.id, {
                    pluginId: 'allow2automate-operating-system',
                    monitorId: sessionMonitor.id
                });
                await agentService.removeMonitor(agent.id, {
                    pluginId: 'allow2automate-operating-system',
                    monitorId: processMonitor.id
                });
            }
        } catch (error) {
            console.error('[OS Plugin] Error during cleanup:', error);
        }

        console.log('[OS Plugin] Unloaded successfully');
        callback(null);
    };

    return osPlugin;
}

module.exports = {
    plugin,
    TabContent,
    requiresMainProcess: true
};
