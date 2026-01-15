# Allow2Automate OS Plugin - Technical Architecture

**Version:** 1.0.0
**Last Updated:** 2026-01-15

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Components](#core-components)
3. [Data Monitors](#data-monitors)
4. [Action Scripts](#action-scripts)
5. [Platform-Specific Implementations](#platform-specific-implementations)
6. [API Design](#api-design)
7. [State Management](#state-management)
8. [Error Handling](#error-handling)
9. [Testing Strategy](#testing-strategy)

---

## System Architecture

### High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    Electron Main Process                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              OS Plugin Entry Point (index.js)             │  │
│  │  • Plugin lifecycle management                            │  │
│  │  • IPC handler registration                               │  │
│  │  • Configuration management                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Core Controllers (controllers/)                 │  │
│  │                                                            │  │
│  │  ┌────────────────┐  ┌────────────────┐                 │  │
│  │  │ SessionMonitor │  │ ProcessMonitor │                 │  │
│  │  │                │  │                │                 │  │
│  │  │ • User detect  │  │ • Process list │                 │  │
│  │  │ • Login time   │  │ • Browser detect│                │  │
│  │  │ • Idle detect  │  │ • Category     │                 │  │
│  │  └────────────────┘  └────────────────┘                 │  │
│  │                                                            │  │
│  │  ┌────────────────┐  ┌────────────────┐                 │  │
│  │  │  QuotaManager  │  │ ActionExecutor │                 │  │
│  │  │                │  │                │                 │  │
│  │  │ • Track usage  │  │ • Logout       │                 │  │
│  │  │ • Check limits │  │ • Kill process │                 │  │
│  │  │ • Warnings     │  │ • Hide icons   │                 │  │
│  │  └────────────────┘  └────────────────┘                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │       Platform Adapters (monitors/windows|macos|linux/)   │  │
│  │                                                            │  │
│  │  • Native API wrappers                                    │  │
│  │  • OS-specific implementations                            │  │
│  │  • Platform detection and routing                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Allow2 API Client (lib/allow2-client.js)        │  │
│  │                                                            │  │
│  │  • Authentication                                          │  │
│  │  • Quota checks                                            │  │
│  │  • Activity logging                                        │  │
│  │  • Real-time updates (WebSocket)                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                     Operating System                            │
│                                                                 │
│  • User sessions                                               │
│  • Process table                                                │
│  • System APIs                                                  │
│  • Registry/Config files                                        │
└────────────────────────────────────────────────────────────────┘
```

### Plugin Lifecycle

```javascript
// 1. Plugin Discovery & Installation
npm install @allow2/allow2automate-os

// 2. Plugin Loading (Main Process)
const plugin = require('@allow2/allow2automate-os');
const pluginInstance = plugin.plugin({
  ipcMain,
  configurationUpdate,
  statusUpdate,
  services: { allow2Client }
});

// 3. Initialization
pluginInstance.onLoad(savedConfiguration);

// 4. Active Monitoring
setInterval(() => {
  sessionMonitor.check();
  processMonitor.scan();
  quotaManager.enforce();
}, 5000);

// 5. State Changes
pluginInstance.newState(updatedConfiguration);

// 6. Cleanup
pluginInstance.onUnload();
```

---

## Core Components

### 1. SessionMonitor

**Purpose**: Track logged-in users and session state

**Responsibilities**:
- Detect current logged-in user
- Map OS username to Allow2 child ID
- Track session start time
- Detect idle time
- Monitor multiple sessions

**API**:

```javascript
class SessionMonitor {
  constructor(platform, config) {
    this.platform = platform; // 'windows' | 'macos' | 'linux'
    this.config = config;
    this.currentSession = null;
  }

  /**
   * Get current active session
   * @returns {Object|null} Session object or null
   */
  async getCurrentSession() {
    const user = await this.platform.getCurrentUser();
    if (!user) return null;

    const childId = this.mapUserToChild(user.username);
    return {
      username: user.username,
      childId: childId,
      loginTime: user.loginTime,
      idleTime: await this.platform.getIdleTime(),
      isActive: user.idleTime < 300000, // 5 minutes
    };
  }

  /**
   * Map OS username to Allow2 child ID
   * @param {string} username - OS username
   * @returns {number|null} Child ID or null
   */
  mapUserToChild(username) {
    const mapping = this.config.userMappings || {};
    return mapping[username] || null;
  }

  /**
   * Check if user is parent account
   * @param {string} username
   * @returns {boolean}
   */
  isParentAccount(username) {
    const parentAccounts = this.config.parentAccounts || [];
    return parentAccounts.includes(username);
  }

  /**
   * Start session monitoring
   */
  start() {
    this.interval = setInterval(() => this.checkSession(), 5000);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  /**
   * Internal session check
   */
  async checkSession() {
    const session = await this.getCurrentSession();

    if (session && !this.currentSession) {
      // New login
      this.emit('session-started', session);
    } else if (!session && this.currentSession) {
      // Logout
      this.emit('session-ended', this.currentSession);
    } else if (session) {
      // Active session update
      this.emit('session-update', session);
    }

    this.currentSession = session;
  }
}
```

### 2. ProcessMonitor

**Purpose**: Track running processes and detect browsers/apps

**Responsibilities**:
- Enumerate running processes
- Detect browsers and categorize processes
- Monitor process start/stop events
- Calculate process duration
- Classify applications (games, education, productivity)

**API**:

```javascript
class ProcessMonitor {
  constructor(platform, config) {
    this.platform = platform;
    this.config = config;
    this.processes = new Map(); // pid -> ProcessInfo
    this.browserPatterns = this.initBrowserPatterns();
  }

  /**
   * Initialize browser detection patterns
   */
  initBrowserPatterns() {
    return [
      { name: 'Chrome', patterns: ['chrome.exe', 'Google Chrome', 'chrome'] },
      { name: 'Firefox', patterns: ['firefox.exe', 'Firefox', 'firefox'] },
      { name: 'Safari', patterns: ['Safari'] },
      { name: 'Edge', patterns: ['msedge.exe', 'Microsoft Edge', 'edge'] },
      { name: 'Opera', patterns: ['opera.exe', 'Opera'] },
      { name: 'Brave', patterns: ['brave.exe', 'Brave Browser', 'brave'] }
    ];
  }

  /**
   * Scan running processes
   * @returns {Array<ProcessInfo>}
   */
  async scanProcesses() {
    const rawProcesses = await this.platform.getProcessList();
    const processes = [];

    for (const proc of rawProcesses) {
      const info = this.classifyProcess(proc);
      processes.push(info);

      // Track new processes
      if (!this.processes.has(proc.pid)) {
        this.processes.set(proc.pid, {
          ...info,
          startTime: Date.now()
        });
        this.emit('process-started', info);
      }
    }

    // Detect terminated processes
    for (const [pid, info] of this.processes.entries()) {
      if (!rawProcesses.find(p => p.pid === pid)) {
        const duration = Date.now() - info.startTime;
        this.emit('process-ended', { ...info, duration });
        this.processes.delete(pid);
      }
    }

    return processes;
  }

  /**
   * Classify process type
   * @param {Object} proc - Raw process info
   * @returns {ProcessInfo}
   */
  classifyProcess(proc) {
    const name = proc.name.toLowerCase();

    // Check if browser
    const browser = this.browserPatterns.find(b =>
      b.patterns.some(p => name.includes(p.toLowerCase()))
    );

    if (browser) {
      return {
        pid: proc.pid,
        name: proc.name,
        type: 'browser',
        category: 'internet',
        browserName: browser.name,
        blocked: false
      };
    }

    // Check against blocked list
    const blocked = this.config.blockedProcesses || [];
    const isBlocked = blocked.some(b => name.includes(b.toLowerCase()));

    // Categorize
    const category = this.categorizeProcess(name);

    return {
      pid: proc.pid,
      name: proc.name,
      type: category.type,
      category: category.name,
      blocked: isBlocked
    };
  }

  /**
   * Categorize process
   * @param {string} name - Process name
   * @returns {Object}
   */
  categorizeProcess(name) {
    // Game patterns
    const gamePatterns = [
      'minecraft', 'fortnite', 'roblox', 'steam', 'epic',
      'game', 'gaming', 'play'
    ];

    // Education patterns
    const eduPatterns = [
      'khan', 'duolingo', 'scratch', 'code.org',
      'classroom', 'zoom', 'teams'
    ];

    // Productivity patterns
    const prodPatterns = [
      'word', 'excel', 'powerpoint', 'office',
      'notepad', 'calculator', 'sublime', 'vscode'
    ];

    if (gamePatterns.some(p => name.includes(p))) {
      return { type: 'game', name: 'games' };
    }

    if (eduPatterns.some(p => name.includes(p))) {
      return { type: 'education', name: 'education' };
    }

    if (prodPatterns.some(p => name.includes(p))) {
      return { type: 'productivity', name: 'productivity' };
    }

    return { type: 'unknown', name: 'other' };
  }

  /**
   * Check if any browser is running
   * @returns {boolean}
   */
  isBrowserActive() {
    const processes = Array.from(this.processes.values());
    return processes.some(p => p.type === 'browser');
  }

  /**
   * Get active browsers
   * @returns {Array<ProcessInfo>}
   */
  getActiveBrowsers() {
    const processes = Array.from(this.processes.values());
    return processes.filter(p => p.type === 'browser');
  }

  /**
   * Get blocked processes that are running
   * @returns {Array<ProcessInfo>}
   */
  getBlockedProcesses() {
    const processes = Array.from(this.processes.values());
    return processes.filter(p => p.blocked);
  }

  /**
   * Start monitoring
   */
  start() {
    this.interval = setInterval(() => this.scanProcesses(), 5000);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
}
```

### 3. QuotaManager

**Purpose**: Track time usage and enforce quotas

**Responsibilities**:
- Track computer time (session duration)
- Track internet time (browser active time)
- Compare against Allow2 quotas
- Trigger warnings when approaching limit
- Enforce quota exhaustion

**API**:

```javascript
class QuotaManager {
  constructor(config, allow2Client, sessionMonitor, processMonitor) {
    this.config = config;
    this.allow2Client = allow2Client;
    this.sessionMonitor = sessionMonitor;
    this.processMonitor = processMonitor;

    this.usage = new Map(); // childId -> UsageInfo
  }

  /**
   * Initialize usage tracking for a child
   * @param {number} childId
   */
  async initChild(childId) {
    const quota = await this.allow2Client.getQuota(childId);

    this.usage.set(childId, {
      computerTime: 0,
      internetTime: 0,
      lastUpdate: Date.now(),
      quota: quota,
      warnings: {
        computer: [],
        internet: []
      }
    });
  }

  /**
   * Update usage based on current state
   */
  async update() {
    const session = await this.sessionMonitor.getCurrentSession();
    if (!session || !session.childId) return;

    const childId = session.childId;
    const usage = this.usage.get(childId);
    if (!usage) {
      await this.initChild(childId);
      return;
    }

    const now = Date.now();
    const elapsed = now - usage.lastUpdate;

    // Update computer time (always counting when logged in)
    if (!session.isActive && this.config.pauseOnIdle) {
      // Don't count idle time
    } else {
      usage.computerTime += elapsed;
    }

    // Update internet time (only when browser active)
    if (this.processMonitor.isBrowserActive()) {
      usage.internetTime += elapsed;
    }

    usage.lastUpdate = now;

    // Check for quota violations
    await this.checkQuotas(childId, usage);
  }

  /**
   * Check quotas and trigger actions
   * @param {number} childId
   * @param {Object} usage
   */
  async checkQuotas(childId, usage) {
    const quota = usage.quota;

    // Computer time check
    const computerMinutes = usage.computerTime / 60000;
    const computerRemaining = quota.computerTimeDaily - computerMinutes;

    if (computerRemaining <= 0) {
      // Quota exhausted
      this.emit('quota-exhausted', {
        childId,
        type: 'computer',
        usage: computerMinutes,
        quota: quota.computerTimeDaily
      });
    } else if (computerRemaining <= 5 && !usage.warnings.computer.includes(5)) {
      // 5 minute warning
      this.emit('quota-warning', {
        childId,
        type: 'computer',
        remaining: computerRemaining
      });
      usage.warnings.computer.push(5);
    } else if (computerRemaining <= 15 && !usage.warnings.computer.includes(15)) {
      // 15 minute warning
      this.emit('quota-warning', {
        childId,
        type: 'computer',
        remaining: computerRemaining
      });
      usage.warnings.computer.push(15);
    }

    // Internet time check
    const internetMinutes = usage.internetTime / 60000;
    const internetRemaining = quota.internetTimeDaily - internetMinutes;

    if (internetRemaining <= 0) {
      // Internet quota exhausted
      this.emit('quota-exhausted', {
        childId,
        type: 'internet',
        usage: internetMinutes,
        quota: quota.internetTimeDaily
      });
    } else if (internetRemaining <= 5 && !usage.warnings.internet.includes(5)) {
      this.emit('quota-warning', {
        childId,
        type: 'internet',
        remaining: internetRemaining
      });
      usage.warnings.internet.push(5);
    }
  }

  /**
   * Check bedtime rules
   * @param {number} childId
   */
  checkBedtime(childId) {
    const rules = this.config.children[childId]?.bedtime;
    if (!rules || !rules.enabled) return;

    const now = new Date();
    const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];

    if (!rules.days.includes(dayName)) return;

    const [hour, minute] = rules.time.split(':').map(Number);
    const bedtime = new Date(now);
    bedtime.setHours(hour, minute, 0, 0);

    if (now >= bedtime) {
      this.emit('bedtime-reached', { childId, bedtime: rules.time });
    }

    // Warning 15 minutes before
    const warningTime = new Date(bedtime.getTime() - 15 * 60000);
    if (now >= warningTime && now < bedtime) {
      this.emit('bedtime-warning', {
        childId,
        minutes: Math.ceil((bedtime - now) / 60000)
      });
    }
  }

  /**
   * Get usage report
   * @param {number} childId
   * @returns {Object}
   */
  getUsageReport(childId) {
    const usage = this.usage.get(childId);
    if (!usage) return null;

    return {
      childId,
      computerTime: Math.round(usage.computerTime / 60000),
      internetTime: Math.round(usage.internetTime / 60000),
      quota: usage.quota,
      remaining: {
        computer: Math.max(0, usage.quota.computerTimeDaily - usage.computerTime / 60000),
        internet: Math.max(0, usage.quota.internetTimeDaily - usage.internetTime / 60000)
      }
    };
  }

  /**
   * Reset daily quotas
   */
  resetDaily() {
    for (const [childId, usage] of this.usage.entries()) {
      usage.computerTime = 0;
      usage.internetTime = 0;
      usage.warnings = { computer: [], internet: [] };
    }
  }

  /**
   * Start quota monitoring
   */
  start() {
    // Update every 5 seconds
    this.updateInterval = setInterval(() => this.update(), 5000);

    // Check quotas every 30 seconds
    this.checkInterval = setInterval(() => {
      for (const childId of this.usage.keys()) {
        const usage = this.usage.get(childId);
        this.checkQuotas(childId, usage);
        this.checkBedtime(childId);
      }
    }, 30000);

    // Reset at midnight
    this.resetInterval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        this.resetDaily();
      }
    }, 60000);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.resetInterval) clearInterval(this.resetInterval);
  }
}
```

### 4. ActionExecutor

**Purpose**: Execute enforcement actions (logout, kill process, etc.)

**Responsibilities**:
- Logout user (graceful and forced)
- Lock session
- Kill processes
- Show notifications
- Hide/show icons
- Block process launch

**API**:

```javascript
class ActionExecutor {
  constructor(platform, config) {
    this.platform = platform;
    this.config = config;
  }

  /**
   * Show notification to user
   * @param {Object} options
   */
  async showNotification(options) {
    const { title, message, urgency = 'normal' } = options;

    await this.platform.showNotification({
      title,
      message,
      urgency,
      timeout: urgency === 'critical' ? 0 : 10000
    });
  }

  /**
   * Logout user (graceful with warnings)
   * @param {string} username
   * @param {number} graceSeconds - Seconds before force logout
   */
  async logoutUser(username, graceSeconds = 60) {
    // Show final warning
    await this.showNotification({
      title: 'Time is up!',
      message: `Logging out in ${graceSeconds} seconds. Please save your work.`,
      urgency: 'critical'
    });

    // Give time to save
    await this.sleep(graceSeconds * 1000);

    // Execute logout
    await this.platform.logoutUser(username);
  }

  /**
   * Lock session
   * @param {string} username
   */
  async lockSession(username) {
    await this.showNotification({
      title: 'Session Locked',
      message: 'Your session has been locked. Ask a parent to unlock.',
      urgency: 'critical'
    });

    await this.platform.lockSession();
  }

  /**
   * Kill process
   * @param {number} pid
   * @param {boolean} graceful - Try graceful shutdown first
   */
  async killProcess(pid, graceful = true) {
    if (graceful) {
      // Try SIGTERM first
      await this.platform.killProcess(pid, 'SIGTERM');

      // Wait 5 seconds
      await this.sleep(5000);

      // Check if still running
      const running = await this.platform.isProcessRunning(pid);
      if (!running) return true;
    }

    // Force kill
    await this.platform.killProcess(pid, 'SIGKILL');
    return true;
  }

  /**
   * Block browsers from launching
   */
  async blockBrowsers() {
    await this.showNotification({
      title: 'Internet Time Exhausted',
      message: 'Browsers are now blocked. Internet time quota has been reached.',
      urgency: 'normal'
    });

    // Platform-specific blocking
    await this.platform.blockApplications([
      'chrome.exe', 'firefox.exe', 'msedge.exe',
      'Google Chrome', 'Firefox', 'Safari', 'Microsoft Edge'
    ]);
  }

  /**
   * Unblock browsers
   */
  async unblockBrowsers() {
    await this.platform.unblockApplications([
      'chrome.exe', 'firefox.exe', 'msedge.exe',
      'Google Chrome', 'Firefox', 'Safari', 'Microsoft Edge'
    ]);
  }

  /**
   * Hide desktop icons
   * @param {Array<string>} patterns - Icon name patterns
   */
  async hideIcons(patterns) {
    await this.platform.hideDesktopIcons(patterns);
  }

  /**
   * Show desktop icons
   * @param {Array<string>} patterns
   */
  async showIcons(patterns) {
    await this.platform.showDesktopIcons(patterns);
  }

  /**
   * Utility: Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Data Monitors

### Windows Monitor (`monitors/windows/index.js`)

```javascript
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class WindowsMonitor {
  /**
   * Get current logged-in user
   */
  async getCurrentUser() {
    try {
      const { stdout } = await execPromise('query user');
      const lines = stdout.split('\n').slice(1);

      for (const line of lines) {
        if (line.includes('>')) {
          // Active session
          const parts = line.trim().split(/\s+/);
          return {
            username: parts[0],
            sessionId: parts[2],
            loginTime: this.parseLoginTime(parts[5])
          };
        }
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }
    return null;
  }

  /**
   * Get process list
   */
  async getProcessList() {
    try {
      const { stdout } = await execPromise(
        'wmic process get ProcessId,Name,ExecutablePath /format:csv'
      );

      const lines = stdout.split('\n').slice(1);
      const processes = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const [, name, path, pid] = line.split(',');

        processes.push({
          pid: parseInt(pid),
          name: name.trim(),
          path: path ? path.trim() : ''
        });
      }

      return processes;
    } catch (error) {
      console.error('Error getting process list:', error);
      return [];
    }
  }

  /**
   * Get idle time in milliseconds
   */
  async getIdleTime() {
    // Use PowerShell to get idle time
    const script = `
      Add-Type @'
      using System;
      using System.Runtime.InteropServices;
      public class IdleTime {
        [DllImport("user32.dll")]
        public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
        public struct LASTINPUTINFO {
          public uint cbSize;
          public uint dwTime;
        }
      }
'@
      $lii = New-Object IdleTime+LASTINPUTINFO
      $lii.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($lii)
      [IdleTime]::GetLastInputInfo([ref]$lii)
      $idleTime = [Environment]::TickCount - $lii.dwTime
      Write-Output $idleTime
    `;

    try {
      const { stdout } = await execPromise(`powershell -Command "${script}"`);
      return parseInt(stdout.trim());
    } catch (error) {
      return 0;
    }
  }

  /**
   * Logout user
   */
  async logoutUser(username) {
    await execPromise(`shutdown /l`);
  }

  /**
   * Lock session
   */
  async lockSession() {
    await execPromise(`rundll32.exe user32.dll,LockWorkStation`);
  }

  /**
   * Kill process
   */
  async killProcess(pid, signal) {
    const force = signal === 'SIGKILL' ? '/F' : '';
    await execPromise(`taskkill ${force} /PID ${pid}`);
  }

  /**
   * Check if process is running
   */
  async isProcessRunning(pid) {
    try {
      const { stdout } = await execPromise(`tasklist /FI "PID eq ${pid}"`);
      return stdout.includes(pid.toString());
    } catch {
      return false;
    }
  }

  /**
   * Show notification
   */
  async showNotification(options) {
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      $notification = New-Object System.Windows.Forms.NotifyIcon
      $notification.Icon = [System.Drawing.SystemIcons]::Information
      $notification.BalloonTipTitle = "${options.title}"
      $notification.BalloonTipText = "${options.message}"
      $notification.Visible = $true
      $notification.ShowBalloonTip(${options.timeout || 10000})
    `;

    await execPromise(`powershell -Command "${script}"`);
  }

  /**
   * Block applications via registry
   */
  async blockApplications(apps) {
    // Use Windows AppLocker or registry policies
    for (const app of apps) {
      const keyPath = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer\\DisallowRun';
      await execPromise(`reg add "${keyPath}" /v "${app}" /t REG_SZ /d "${app}" /f`);
    }
  }

  /**
   * Unblock applications
   */
  async unblockApplications(apps) {
    for (const app of apps) {
      const keyPath = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer\\DisallowRun';
      await execPromise(`reg delete "${keyPath}" /v "${app}" /f`);
    }
  }

  /**
   * Hide desktop icons
   */
  async hideDesktopIcons(patterns) {
    // Hide icons by moving to hidden folder or using registry
    const desktopPath = `${os.homedir()}\\Desktop`;
    for (const pattern of patterns) {
      await execPromise(`attrib +h "${desktopPath}\\${pattern}*"`);
    }
  }

  /**
   * Show desktop icons
   */
  async showDesktopIcons(patterns) {
    const desktopPath = `${os.homedir()}\\Desktop`;
    for (const pattern of patterns) {
      await execPromise(`attrib -h "${desktopPath}\\${pattern}*"`);
    }
  }
}

module.exports = WindowsMonitor;
```

### macOS Monitor (`monitors/macos/index.js`)

```javascript
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class MacOSMonitor {
  /**
   * Get current logged-in user
   */
  async getCurrentUser() {
    try {
      const { stdout } = await execPromise('who | grep console');
      const parts = stdout.trim().split(/\s+/);

      return {
        username: parts[0],
        loginTime: this.parseLoginTime(parts.slice(2).join(' '))
      };
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Get process list
   */
  async getProcessList() {
    try {
      const { stdout } = await execPromise('ps -axo pid,comm');
      const lines = stdout.split('\n').slice(1);
      const processes = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        if (match) {
          processes.push({
            pid: parseInt(match[1]),
            name: match[2].split('/').pop(),
            path: match[2]
          });
        }
      }

      return processes;
    } catch (error) {
      console.error('Error getting process list:', error);
      return [];
    }
  }

  /**
   * Get idle time using ioreg
   */
  async getIdleTime() {
    try {
      const { stdout } = await execPromise(
        'ioreg -c IOHIDSystem | grep HIDIdleTime'
      );

      const match = stdout.match(/HIDIdleTime"\s*=\s*(\d+)/);
      if (match) {
        // Convert from nanoseconds to milliseconds
        return parseInt(match[1]) / 1000000;
      }
    } catch (error) {
      console.error('Error getting idle time:', error);
    }
    return 0;
  }

  /**
   * Logout user
   */
  async logoutUser(username) {
    await execPromise('osascript -e \'tell application "System Events" to log out\'');
  }

  /**
   * Lock session
   */
  async lockSession() {
    await execPromise('/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend');
  }

  /**
   * Kill process
   */
  async killProcess(pid, signal = 'SIGTERM') {
    await execPromise(`kill -${signal.replace('SIG', '')} ${pid}`);
  }

  /**
   * Check if process is running
   */
  async isProcessRunning(pid) {
    try {
      await execPromise(`ps -p ${pid}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Show notification using osascript
   */
  async showNotification(options) {
    const script = `display notification "${options.message}" with title "${options.title}"`;
    await execPromise(`osascript -e '${script}'`);
  }

  /**
   * Block applications
   */
  async blockApplications(apps) {
    // Use parental controls or launchd
    for (const app of apps) {
      // Disable app launch via launchd
      const plistPath = `/Library/LaunchAgents/com.allow2.block.${app}.plist`;
      // Create blocking plist
    }
  }

  /**
   * Unblock applications
   */
  async unblockApplications(apps) {
    for (const app of apps) {
      const plistPath = `/Library/LaunchAgents/com.allow2.block.${app}.plist`;
      await execPromise(`rm -f "${plistPath}"`);
    }
  }

  /**
   * Hide desktop icons
   */
  async hideDesktopIcons(patterns) {
    const desktopPath = `${process.env.HOME}/Desktop`;
    for (const pattern of patterns) {
      await execPromise(`chflags hidden "${desktopPath}"/${pattern}*`);
    }
  }

  /**
   * Show desktop icons
   */
  async showDesktopIcons(patterns) {
    const desktopPath = `${process.env.HOME}/Desktop`;
    for (const pattern of patterns) {
      await execPromise(`chflags nohidden "${desktopPath}"/${pattern}*`);
    }
  }
}

module.exports = MacOSMonitor;
```

### Linux Monitor (`monitors/linux/index.js`)

```javascript
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class LinuxMonitor {
  /**
   * Get current logged-in user
   */
  async getCurrentUser() {
    try {
      const { stdout } = await execPromise('who | grep "(:0)"');
      const parts = stdout.trim().split(/\s+/);

      return {
        username: parts[0],
        loginTime: this.parseLoginTime(parts.slice(2, 6).join(' '))
      };
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Get process list
   */
  async getProcessList() {
    try {
      const { stdout } = await execPromise('ps -eo pid,comm,args --no-headers');
      const lines = stdout.split('\n');
      const processes = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const match = line.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
        if (match) {
          processes.push({
            pid: parseInt(match[1]),
            name: match[2],
            path: match[3].split(' ')[0]
          });
        }
      }

      return processes;
    } catch (error) {
      console.error('Error getting process list:', error);
      return [];
    }
  }

  /**
   * Get idle time from X11
   */
  async getIdleTime() {
    try {
      const { stdout } = await execPromise('xprintidle');
      return parseInt(stdout.trim());
    } catch (error) {
      // Fallback: check last input
      try {
        const { stdout } = await execPromise('w -h -s');
        const match = stdout.match(/(\d+):(\d+)/);
        if (match) {
          return (parseInt(match[1]) * 60 + parseInt(match[2])) * 1000;
        }
      } catch (e) {
        console.error('Error getting idle time:', e);
      }
    }
    return 0;
  }

  /**
   * Logout user
   */
  async logoutUser(username) {
    // Depends on desktop environment
    try {
      // Try GNOME
      await execPromise('gnome-session-quit --logout --force');
    } catch {
      try {
        // Try KDE
        await execPromise('qdbus org.kde.ksmserver /KSMServer logout 0 0 0');
      } catch {
        // Fallback: kill X session
        await execPromise(`pkill -KILL -u ${username}`);
      }
    }
  }

  /**
   * Lock session
   */
  async lockSession() {
    try {
      // Try GNOME/MATE
      await execPromise('gnome-screensaver-command -l');
    } catch {
      try {
        // Try KDE
        await execPromise('qdbus org.freedesktop.ScreenSaver /ScreenSaver Lock');
      } catch {
        // Try xscreensaver
        await execPromise('xscreensaver-command -lock');
      }
    }
  }

  /**
   * Kill process
   */
  async killProcess(pid, signal = 'SIGTERM') {
    await execPromise(`kill -${signal.replace('SIG', '')} ${pid}`);
  }

  /**
   * Check if process is running
   */
  async isProcessRunning(pid) {
    try {
      await execPromise(`ps -p ${pid}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Show notification using notify-send
   */
  async showNotification(options) {
    const urgency = options.urgency || 'normal';
    await execPromise(
      `notify-send -u ${urgency} -t ${options.timeout || 10000} "${options.title}" "${options.message}"`
    );
  }

  /**
   * Block applications
   */
  async blockApplications(apps) {
    // Use systemd or create wrapper scripts
    for (const app of apps) {
      const wrapperPath = `/usr/local/bin/${app}.blocked`;
      const script = `#!/bin/bash\nzenity --error --text="This application is blocked by parental controls"\nexit 1`;
      await execPromise(`echo '${script}' > ${wrapperPath} && chmod +x ${wrapperPath}`);
    }
  }

  /**
   * Unblock applications
   */
  async unblockApplications(apps) {
    for (const app of apps) {
      const wrapperPath = `/usr/local/bin/${app}.blocked`;
      await execPromise(`rm -f ${wrapperPath}`);
    }
  }

  /**
   * Hide desktop icons
   */
  async hideDesktopIcons(patterns) {
    const desktopPath = `${process.env.HOME}/Desktop`;
    for (const pattern of patterns) {
      await execPromise(`mv "${desktopPath}"/${pattern}* "${desktopPath}"/.${pattern}*`);
    }
  }

  /**
   * Show desktop icons
   */
  async showDesktopIcons(patterns) {
    const desktopPath = `${process.env.HOME}/Desktop`;
    for (const pattern of patterns) {
      await execPromise(`mv "${desktopPath}"/.${pattern}* "${desktopPath}"/${pattern}*`);
    }
  }
}

module.exports = LinuxMonitor;
```

---

## API Design

### Plugin Entry Point (`index.js`)

```javascript
const EventEmitter = require('events');
const SessionMonitor = require('./controllers/SessionMonitor');
const ProcessMonitor = require('./controllers/ProcessMonitor');
const QuotaManager = require('./controllers/QuotaManager');
const ActionExecutor = require('./controllers/ActionExecutor');
const PlatformFactory = require('./monitors/PlatformFactory');

// Export plugin metadata
module.exports.requiresMainProcess = true;

/**
 * Plugin factory function
 * @param {Object} context - Plugin context from Allow2Automate
 */
module.exports.plugin = function(context) {
  const {
    ipcMain,
    configurationUpdate,
    statusUpdate,
    services
  } = context;

  // Detect platform
  const platform = PlatformFactory.create();

  // Initialize controllers
  const sessionMonitor = new SessionMonitor(platform, {});
  const processMonitor = new ProcessMonitor(platform, {});
  const quotaManager = new QuotaManager({}, services.allow2Client, sessionMonitor, processMonitor);
  const actionExecutor = new ActionExecutor(platform, {});

  // Event wiring
  quotaManager.on('quota-warning', async (data) => {
    await actionExecutor.showNotification({
      title: `${data.remaining} minutes remaining`,
      message: `You have ${data.remaining} minutes of ${data.type} time left.`,
      urgency: 'normal'
    });
  });

  quotaManager.on('quota-exhausted', async (data) => {
    if (data.type === 'computer') {
      // Logout user
      const session = await sessionMonitor.getCurrentSession();
      if (session) {
        await actionExecutor.logoutUser(session.username, 60);
      }
    } else if (data.type === 'internet') {
      // Block browsers
      await actionExecutor.blockBrowsers();
    }
  });

  quotaManager.on('bedtime-warning', async (data) => {
    await actionExecutor.showNotification({
      title: 'Bedtime Soon',
      message: `Computer will log out in ${data.minutes} minutes for bedtime.`,
      urgency: 'normal'
    });
  });

  quotaManager.on('bedtime-reached', async (data) => {
    const session = await sessionMonitor.getCurrentSession();
    if (session) {
      await actionExecutor.logoutUser(session.username, 60);
    }
  });

  // IPC Handlers
  ipcMain.handle('get-usage-report', async (event, childId) => {
    return quotaManager.getUsageReport(childId);
  });

  ipcMain.handle('get-active-processes', async () => {
    return Array.from(processMonitor.processes.values());
  });

  ipcMain.handle('trigger-focus-mode', async (event, enabled) => {
    if (enabled) {
      const config = quotaManager.config;
      await actionExecutor.hideIcons(config.focusMode.hideIcons);
      // Block distracting categories
    } else {
      await actionExecutor.showIcons(['*']);
    }
  });

  // Return plugin instance
  return {
    /**
     * Called when plugin loads
     */
    onLoad(savedState) {
      console.log('[OS Plugin] Loading with state:', savedState);

      // Apply saved configuration
      if (savedState) {
        sessionMonitor.config = savedState;
        processMonitor.config = savedState;
        quotaManager.config = savedState;
        actionExecutor.config = savedState;
      }

      // Start monitoring
      sessionMonitor.start();
      processMonitor.start();
      quotaManager.start();

      // Update status
      statusUpdate({
        status: 'connected',
        message: 'OS monitoring active'
      });
    },

    /**
     * Called when configuration changes
     */
    newState(newState) {
      console.log('[OS Plugin] State updated:', newState);

      // Update configurations
      sessionMonitor.config = newState;
      processMonitor.config = newState;
      quotaManager.config = newState;
      actionExecutor.config = newState;
    },

    /**
     * Called when plugin enabled/disabled
     */
    onSetEnabled(enabled) {
      console.log('[OS Plugin] Enabled:', enabled);

      if (enabled) {
        sessionMonitor.start();
        processMonitor.start();
        quotaManager.start();

        statusUpdate({
          status: 'connected',
          message: 'OS monitoring active'
        });
      } else {
        sessionMonitor.stop();
        processMonitor.stop();
        quotaManager.stop();

        statusUpdate({
          status: 'disconnected',
          message: 'OS monitoring paused'
        });
      }
    },

    /**
     * Called when plugin unloads
     */
    onUnload() {
      console.log('[OS Plugin] Unloading');

      sessionMonitor.stop();
      processMonitor.stop();
      quotaManager.stop();
    }
  };
};
```

---

## State Management

### Configuration Schema

```javascript
{
  // User mappings
  userMappings: {
    "tommy": 123,  // OS username -> Allow2 child ID
    "sarah": 456
  },

  // Parent accounts (never restricted)
  parentAccounts: ["dad", "mom", "administrator"],

  // Per-child settings
  children: {
    123: {
      // Quotas (minutes per day)
      computerTimeDaily: 120,
      internetTimeDaily: 60,

      // Bedtime rules
      bedtime: {
        enabled: true,
        time: "21:00",
        days: ["mon", "tue", "wed", "thu", "fri"]
      },

      // Process blocking
      blockedProcesses: [
        "minecraft.exe",
        "fortnite.exe",
        "roblox.exe"
      ],

      // Schedule-based rules
      schedules: [
        {
          name: "Homework Time",
          days: ["mon", "tue", "wed", "thu", "fri"],
          start: "15:00",
          end: "18:00",
          allowedCategories: ["education", "productivity"],
          blockedProcesses: ["*games*"]
        }
      ],

      // Focus mode settings
      focusMode: {
        hideIcons: ["*game*", "*minecraft*"],
        blockedCategories: ["games", "social", "video"]
      }
    }
  },

  // Global settings
  pauseOnIdle: true,
  idleThreshold: 300000,  // 5 minutes
  warningTimes: [15, 5, 1],  // Minutes before action
  gracePeriod: 60  // Seconds before forced action
}
```

---

## Error Handling

### Error Categories

1. **Platform Errors**: OS API failures, permission denied
2. **Network Errors**: Allow2 API unavailable
3. **Configuration Errors**: Invalid settings
4. **Action Errors**: Failed to logout/kill process

### Error Handling Strategy

```javascript
class ErrorHandler {
  constructor(statusUpdate) {
    this.statusUpdate = statusUpdate;
  }

  handle(error, context) {
    console.error(`[OS Plugin] Error in ${context}:`, error);

    // Categorize error
    if (error.code === 'EACCES') {
      this.statusUpdate({
        status: 'error',
        message: 'Permission denied - plugin may need elevated privileges',
        details: { error: error.message, context }
      });
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      this.statusUpdate({
        status: 'warning',
        message: 'Cannot connect to Allow2 API - will retry',
        details: { error: error.message, context }
      });
    } else {
      this.statusUpdate({
        status: 'error',
        message: `Error: ${error.message}`,
        details: { error: error.message, context }
      });
    }
  }
}
```

---

## Testing Strategy

### Unit Tests

- Platform monitor functions (mock OS APIs)
- Process classification
- Quota calculations
- Event handling

### Integration Tests

- End-to-end workflow: login → monitor → warn → enforce
- Allow2 API integration
- Multi-platform compatibility

### Manual Testing Checklist

- [ ] Login detection across platforms
- [ ] Browser detection (Chrome, Firefox, Safari, Edge)
- [ ] Quota warning notifications
- [ ] Automatic logout on quota exhaustion
- [ ] Bedtime enforcement
- [ ] Process blocking
- [ ] Icon hiding
- [ ] Focus mode activation
- [ ] Configuration persistence
- [ ] Multi-child support

---

## Performance Considerations

1. **Polling Intervals**: Balance responsiveness vs. CPU usage
2. **Process Caching**: Cache process list, only detect changes
3. **Idle Detection**: Skip quota updates when user idle
4. **Batch Operations**: Group API calls to reduce network overhead
5. **Memory Management**: Limit log retention, cleanup old entries

---

## Security Considerations

1. **No Elevated Privileges**: Plugin runs in user space
2. **Configuration Protection**: Store config in protected area
3. **Tamper Detection**: Monitor for clock changes, debuggers
4. **Privacy**: Log process names only, no sensitive data
5. **Child Account Isolation**: Cannot affect parent accounts

---

## Deployment

### Package Structure

```
@allow2/allow2automate-os/
├── package.json
├── index.js
├── README.md
├── LICENSE
├── controllers/
│   ├── SessionMonitor.js
│   ├── ProcessMonitor.js
│   ├── QuotaManager.js
│   └── ActionExecutor.js
├── monitors/
│   ├── windows/
│   │   └── index.js
│   ├── macos/
│   │   └── index.js
│   ├── linux/
│   │   └── index.js
│   └── PlatformFactory.js
├── lib/
│   ├── allow2-client.js
│   └── utils.js
└── tests/
    ├── unit/
    └── integration/
```

### Dependencies

```json
{
  "dependencies": {
    "node-fetch": "^2.6.0",
    "ws": "^8.0.0"
  },
  "optionalDependencies": {
    "node-notifier": "^10.0.0"
  }
}
```

---

**Next**: See USE_CASES.md for detailed implementation scenarios
**Next**: See PLATFORM_SUPPORT.md for platform-specific details
