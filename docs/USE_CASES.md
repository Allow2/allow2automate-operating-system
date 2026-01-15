# Allow2Automate OS Plugin - Use Cases & Implementation Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-15

---

## Table of Contents

1. [Basic Time Limits](#use-case-1-basic-time-limits)
2. [Internet-Only Restrictions](#use-case-2-internet-only-restrictions)
3. [Bedtime Enforcement](#use-case-3-bedtime-enforcement)
4. [Game Blocking During Homework](#use-case-4-game-blocking-during-homework)
5. [Focus Mode](#use-case-5-focus-mode)
6. [Weekend vs Weekday Rules](#use-case-6-weekend-vs-weekday-rules)
7. [Multi-Child Household](#use-case-7-multi-child-household)
8. [Reward Time Bonus](#use-case-8-reward-time-bonus)
9. [Study Break Timer](#use-case-9-study-break-timer)
10. [Remote Parental Override](#use-case-10-remote-parental-override)

---

## Use Case 1: Basic Time Limits

### Scenario

**Parent Goal**: Limit child to 2 hours of computer time per weekday, 4 hours on weekends

**Child Profile**:
- Name: Tommy (10 years old)
- OS Account: `tommy`
- Allow2 Child ID: `123`

### Configuration

```javascript
{
  userMappings: {
    "tommy": 123
  },

  children: {
    123: {
      // Quota varies by day
      computerTimeDaily: function() {
        const day = new Date().getDay();
        return (day === 0 || day === 6) ? 240 : 120; // Weekend=4h, Weekday=2h
      },

      // No separate internet limit
      internetTimeDaily: null,

      // Warnings at 15, 5, and 1 minute remaining
      warningTimes: [15, 5, 1]
    }
  }
}
```

### Implementation Flow

```
09:00 - Tommy logs in
      → SessionMonitor detects login
      → QuotaManager starts tracking (0/120 minutes used)

09:30 - 30 minutes elapsed
      → QuotaManager update: 30/120 minutes used
      → Allow2 API sync: Report 30 minutes usage

10:45 - 105 minutes elapsed (15 minutes remaining)
      → QuotaManager triggers warning
      → Notification: "15 minutes of computer time remaining"

10:55 - 115 minutes elapsed (5 minutes remaining)
      → QuotaManager triggers warning
      → Notification: "5 minutes remaining - please save your work"

10:59 - 119 minutes elapsed (1 minute remaining)
      → QuotaManager triggers final warning
      → Notification: "1 minute remaining - logging out soon!"

11:00 - 120 minutes elapsed (quota exhausted)
      → QuotaManager triggers enforcement
      → ActionExecutor shows save prompt
      → 60-second grace period
      → Force logout at 11:01
```

### Code Example

```javascript
// In QuotaManager
async checkComputerQuota(childId) {
  const usage = this.usage.get(childId);
  const child = this.config.children[childId];

  // Get daily quota (function or static value)
  const dailyQuota = typeof child.computerTimeDaily === 'function'
    ? child.computerTimeDaily()
    : child.computerTimeDaily;

  const minutesUsed = usage.computerTime / 60000;
  const remaining = dailyQuota - minutesUsed;

  // Check warnings
  for (const warningTime of child.warningTimes || [15, 5, 1]) {
    if (remaining <= warningTime && remaining > warningTime - 0.1) {
      this.emit('quota-warning', {
        childId,
        type: 'computer',
        remaining
      });
    }
  }

  // Check exhaustion
  if (remaining <= 0) {
    this.emit('quota-exhausted', {
      childId,
      type: 'computer',
      usage: minutesUsed,
      quota: dailyQuota
    });
  }
}
```

### Testing Checklist

- [ ] Detects Tommy's login correctly
- [ ] Tracks time accurately (within 5 seconds)
- [ ] Shows warnings at correct times
- [ ] Logout occurs at quota exhaustion
- [ ] Quota resets at midnight
- [ ] Weekend quota is 4 hours, weekday is 2 hours

---

## Use Case 2: Internet-Only Restrictions

### Scenario

**Parent Goal**: Unlimited computer time for homework, but limit internet to 1 hour/day

**Child Profile**:
- Name: Sarah (14 years old)
- OS Account: `sarah`
- Allow2 Child ID: `456`

### Configuration

```javascript
{
  userMappings: {
    "sarah": 456
  },

  children: {
    456: {
      // Unlimited computer time
      computerTimeDaily: null,

      // 1 hour internet time
      internetTimeDaily: 60,

      // Pause internet timer when browser closed
      pauseInternetOnBrowserClose: true
    }
  }
}
```

### Implementation Flow

```
15:00 - Sarah logs in
      → SessionMonitor detects login
      → QuotaManager starts tracking
      → Computer time: unlimited
      → Internet time: 0/60 minutes

15:30 - Sarah opens Chrome for research
      → ProcessMonitor detects browser: Chrome
      → QuotaManager starts internet timer
      → Internet time tracking begins

15:45 - 15 minutes of browser use
      → Internet time: 15/60 minutes used
      → Computer time: 45 minutes (not counted toward quota)

16:00 - Sarah closes Chrome to write essay
      → ProcessMonitor detects browser closed
      → QuotaManager pauses internet timer
      → Internet time: 15/60 minutes (paused)

16:30 - Still writing in Word (no browser)
      → Internet time: Still 15/60 minutes (paused)
      → Computer time: 90 minutes (not limited)

17:00 - Sarah opens Firefox for YouTube
      → ProcessMonitor detects browser: Firefox
      → QuotaManager resumes internet timer
      → Internet time tracking continues

17:45 - 45 more minutes of browser use (60 total)
      → Internet time: 60/60 minutes (exhausted!)
      → QuotaManager triggers enforcement
      → ActionExecutor blocks all browsers
      → Notification: "Internet time exhausted - browsers blocked"
      → Sarah can continue using Word/Excel
```

### Code Example

```javascript
// In ProcessMonitor
isBrowserActive() {
  const browsers = Array.from(this.processes.values())
    .filter(p => p.type === 'browser');

  return browsers.length > 0;
}

// In QuotaManager update loop
async updateInternetTime() {
  const session = await this.sessionMonitor.getCurrentSession();
  if (!session || !session.childId) return;

  const childId = session.childId;
  const child = this.config.children[childId];
  const usage = this.usage.get(childId);

  // Only count internet time when browser is active
  if (this.processMonitor.isBrowserActive()) {
    const now = Date.now();
    const elapsed = now - usage.lastUpdate;
    usage.internetTime += elapsed;
    usage.lastUpdate = now;

    // Check quota
    const minutesUsed = usage.internetTime / 60000;
    if (child.internetTimeDaily && minutesUsed >= child.internetTimeDaily) {
      this.emit('quota-exhausted', {
        childId,
        type: 'internet',
        usage: minutesUsed,
        quota: child.internetTimeDaily
      });
    }
  } else {
    // Browser closed - update timestamp but don't count time
    usage.lastUpdate = Date.now();
  }
}

// In ActionExecutor
async blockBrowsers() {
  await this.showNotification({
    title: 'Internet Time Exhausted',
    message: 'Browsers are now blocked. You can continue using other apps.',
    urgency: 'critical'
  });

  // Get all active browsers
  const browsers = this.processMonitor.getActiveBrowsers();

  // Kill them gracefully
  for (const browser of browsers) {
    await this.killProcess(browser.pid, true);
  }

  // Block future launches
  const browserApps = [
    'chrome.exe', 'firefox.exe', 'msedge.exe', 'safari',
    'Google Chrome', 'Firefox', 'Microsoft Edge', 'Safari'
  ];

  await this.platform.blockApplications(browserApps);
}
```

### Testing Checklist

- [ ] Detects Chrome, Firefox, Safari, Edge, Opera, Brave
- [ ] Internet timer only runs when browser open
- [ ] Internet timer pauses when browser closed
- [ ] Computer time unlimited
- [ ] Browsers blocked when internet quota exhausted
- [ ] Other apps (Word, Excel, etc.) still work

---

## Use Case 3: Bedtime Enforcement

### Scenario

**Parent Goal**: Force child off computer by 9 PM on school nights (Mon-Fri)

**Child Profile**:
- Name: Jake (12 years old)
- OS Account: `jake`
- Allow2 Child ID: `789`

### Configuration

```javascript
{
  userMappings: {
    "jake": 789
  },

  children: {
    789: {
      bedtime: {
        enabled: true,
        time: "21:00",
        days: ["mon", "tue", "wed", "thu", "fri"],
        warningMinutes: [15, 5, 1],
        gracePeriodSeconds: 60
      }
    }
  }
}
```

### Implementation Flow

```
20:30 - Jake is using computer (Friday night, 8:30 PM)
      → QuotaManager checks bedtime rules
      → Bedtime at 21:00, currently 20:30 (30 min before)
      → No action yet

20:45 - 15 minutes before bedtime
      → QuotaManager detects warning time
      → Notification: "Bedtime in 15 minutes - computer will log out at 9:00 PM"

20:55 - 5 minutes before bedtime
      → Notification: "Bedtime in 5 minutes - please save your work"
      → OS shows save dialogs for unsaved documents

20:59 - 1 minute before bedtime
      → Notification: "Bedtime in 1 minute - logging out soon!"

21:00 - Bedtime reached
      → QuotaManager triggers enforcement
      → ActionExecutor starts 60-second grace period
      → Final warning: "Logging out in 60 seconds"
      → Attempts to save all open documents
      → Shows countdown timer

21:01 - Grace period expired
      → ActionExecutor force logout
      → Session ends
      → Login blocked until morning (configurable)
```

### Code Example

```javascript
// In QuotaManager
checkBedtime(childId) {
  const child = this.config.children[childId];
  const bedtime = child.bedtime;

  if (!bedtime || !bedtime.enabled) return;

  const now = new Date();
  const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];

  // Check if today is a bedtime day
  if (!bedtime.days.includes(dayName)) return;

  // Parse bedtime
  const [hour, minute] = bedtime.time.split(':').map(Number);
  const bedtimeDate = new Date(now);
  bedtimeDate.setHours(hour, minute, 0, 0);

  // Calculate minutes until bedtime
  const minutesUntil = (bedtimeDate - now) / 60000;

  // Check warnings
  for (const warningTime of bedtime.warningMinutes || [15, 5, 1]) {
    if (minutesUntil <= warningTime && minutesUntil > warningTime - 0.5) {
      this.emit('bedtime-warning', {
        childId,
        minutes: Math.ceil(minutesUntil)
      });
    }
  }

  // Check if bedtime reached
  if (minutesUntil <= 0) {
    this.emit('bedtime-reached', {
      childId,
      bedtime: bedtime.time
    });
  }
}

// In ActionExecutor
async logoutUser(username, graceSeconds = 60) {
  // Final warning with countdown
  for (let i = graceSeconds; i > 0; i -= 10) {
    await this.showNotification({
      title: 'Logging out',
      message: `Bedtime - logging out in ${i} seconds. Save your work!`,
      urgency: 'critical'
    });

    if (i === graceSeconds) {
      // Try to save all documents
      await this.attemptAutoSave();
    }

    await this.sleep(10000);
  }

  // Execute logout
  await this.platform.logoutUser(username);

  // Optional: Block login until morning
  if (this.config.blockLoginUntilMorning) {
    await this.blockLoginUntil(username, '06:00');
  }
}

async attemptAutoSave() {
  // Platform-specific auto-save attempts
  // Windows: Send Ctrl+S to all windows
  // macOS: Use AppleScript to save documents
  // Linux: Use xdotool to send save commands
}
```

### Testing Checklist

- [ ] Bedtime only enforces on school nights (Mon-Fri)
- [ ] Warnings at 15, 5, 1 minutes before bedtime
- [ ] Grace period allows time to save
- [ ] Force logout at exact bedtime + grace
- [ ] Optional: Login blocked until morning
- [ ] Does not affect weekends (Sat-Sun)

---

## Use Case 4: Game Blocking During Homework

### Scenario

**Parent Goal**: Block games from 3-6 PM on weekdays (homework time)

**Child Profile**:
- Name: Emma (11 years old)
- OS Account: `emma`
- Allow2 Child ID: `321`

### Configuration

```javascript
{
  userMappings: {
    "emma": 321
  },

  children: {
    321: {
      schedules: [
        {
          name: "Homework Time",
          days: ["mon", "tue", "wed", "thu", "fri"],
          start: "15:00",
          end: "18:00",
          blockedProcesses: [
            "minecraft.exe",
            "Minecraft",
            "fortnite.exe",
            "Fortnite",
            "roblox.exe",
            "Roblox",
            "*game*"
          ],
          allowedCategories: ["education", "productivity"],
          message: "Games are not allowed during homework time (3-6 PM)"
        }
      ]
    }
  }
}
```

### Implementation Flow

```
14:50 - Emma is playing Minecraft
      → Game is allowed (before homework time)

15:00 - Homework time begins
      → QuotaManager detects schedule start
      → ProcessMonitor finds Minecraft running
      → ActionExecutor sends warning
      → Notification: "Homework time has started - closing games in 2 minutes"

15:02 - Warning period expired
      → ActionExecutor kills Minecraft process
      → Notification: "Minecraft closed - please start homework"
      → Application launch monitoring activated

15:15 - Emma tries to launch Fortnite
      → ProcessMonitor detects Fortnite.exe starting
      → ActionExecutor immediately blocks
      → Process killed before window appears
      → Notification: "Games are not allowed during homework time (3-6 PM)"

15:30 - Emma opens Google Docs (education category)
      → ProcessMonitor classifies as education
      → Application allowed
      → No action taken

18:00 - Homework time ends
      → QuotaManager detects schedule end
      → Application blocking deactivated
      → Notification: "Homework time over - games are now allowed"

18:05 - Emma launches Minecraft
      → Application allowed
      → Game plays normally
```

### Code Example

```javascript
// In QuotaManager
checkSchedules(childId) {
  const child = this.config.children[childId];
  const schedules = child.schedules || [];

  const now = new Date();
  const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
  const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  for (const schedule of schedules) {
    // Check if today is in schedule
    if (!schedule.days.includes(dayName)) continue;

    // Check if current time is within schedule
    if (timeString >= schedule.start && timeString < schedule.end) {
      // Schedule is active
      this.emit('schedule-active', {
        childId,
        schedule: schedule.name,
        blockedProcesses: schedule.blockedProcesses,
        allowedCategories: schedule.allowedCategories
      });
    }
  }
}

// In ProcessMonitor
async scanProcesses() {
  const rawProcesses = await this.platform.getProcessList();

  for (const proc of rawProcesses) {
    const info = this.classifyProcess(proc);

    // Check if process is blocked by active schedule
    if (this.isProcessBlockedBySchedule(info)) {
      this.emit('blocked-process-detected', info);
    }

    // Track process
    if (!this.processes.has(proc.pid)) {
      this.processes.set(proc.pid, {
        ...info,
        startTime: Date.now()
      });

      // New process started
      this.emit('process-started', info);

      // If blocked, kill immediately
      if (info.blocked) {
        this.emit('blocked-process-started', info);
      }
    }
  }
}

isProcessBlockedBySchedule(processInfo) {
  const activeSchedule = this.currentSchedule;
  if (!activeSchedule) return false;

  // Check if process name matches blocked list
  const processName = processInfo.name.toLowerCase();

  for (const pattern of activeSchedule.blockedProcesses) {
    if (pattern === '*' || processName.includes(pattern.toLowerCase().replace('*', ''))) {
      // Check if category is allowed
      if (activeSchedule.allowedCategories &&
          activeSchedule.allowedCategories.includes(processInfo.category)) {
        return false; // Category is allowed
      }
      return true; // Process is blocked
    }
  }

  return false;
}

// In ActionExecutor
async enforceScheduleBlock(schedule, blockedProcess) {
  // Show message
  await this.showNotification({
    title: `${schedule.name}`,
    message: schedule.message || `${blockedProcess.name} is not allowed right now`,
    urgency: 'normal'
  });

  // Kill process immediately
  await this.killProcess(blockedProcess.pid, false);
}
```

### Testing Checklist

- [ ] Schedule activates at 3:00 PM on weekdays
- [ ] Running games are warned then killed
- [ ] New game launches are blocked immediately
- [ ] Educational apps still work during schedule
- [ ] Schedule deactivates at 6:00 PM
- [ ] Games work normally after 6:00 PM
- [ ] Does not activate on weekends

---

## Use Case 5: Focus Mode

### Scenario

**Parent Goal**: One-click "Focus Mode" that hides game icons and blocks distractions

**Child Profile**:
- Name: Alex (13 years old)
- OS Account: `alex`
- Allow2 Child ID: `654`

### Configuration

```javascript
{
  userMappings: {
    "alex": 654
  },

  children: {
    654: {
      focusMode: {
        // Desktop icons to hide
        hideIcons: [
          "*minecraft*",
          "*fortnite*",
          "*roblox*",
          "*steam*",
          "*game*"
        ],

        // Applications to block
        blockedApps: [
          "Discord",
          "Slack",
          "Telegram",
          "WhatsApp",
          "TikTok"
        ],

        // Categories to block
        blockedCategories: ["games", "social", "video"],

        // Optional: Block browser sites
        blockedSites: [
          "youtube.com",
          "twitch.tv",
          "facebook.com",
          "instagram.com",
          "twitter.com"
        ]
      }
    }
  }
}
```

### Implementation Flow

```
16:00 - Parent activates Focus Mode from phone app
      → Allow2 API sends command to plugin
      → IPC handler receives 'trigger-focus-mode' event

16:00:05 - Plugin starts Focus Mode enforcement
      → ActionExecutor hides desktop icons
      → Desktop: Minecraft icon hidden
      → Desktop: Fortnite icon hidden
      → Desktop: Steam icon hidden

      → ActionExecutor blocks applications
      → Discord closed if running
      → Discord blocked from launching

      → ProcessMonitor updates allowed categories
      → Only education/productivity allowed

      → Notification: "Focus Mode activated - games and social apps are hidden"

16:15 - Alex tries to launch Minecraft from Start Menu
      → ProcessMonitor detects Minecraft.exe
      → Blocked by Focus Mode
      → Process killed immediately
      → Notification: "Minecraft is not available in Focus Mode"

16:30 - Alex opens Chrome
      → Browser is allowed
      → Alex visits youtube.com
      → (Optional) Browser extension blocks site
      → Shows: "This site is blocked during Focus Mode"

18:00 - Parent deactivates Focus Mode
      → Allow2 API sends deactivate command
      → ActionExecutor restores desktop icons
      → ActionExecutor unblocks applications
      → Notification: "Focus Mode deactivated - all apps are now available"
```

### Code Example

```javascript
// In plugin index.js IPC handlers
ipcMain.handle('trigger-focus-mode', async (event, childId, enabled) => {
  const child = config.children[childId];
  if (!child || !child.focusMode) {
    return { success: false, error: 'Focus mode not configured' };
  }

  if (enabled) {
    // Activate focus mode
    await actionExecutor.activateFocusMode(child.focusMode);

    // Update process monitor
    processMonitor.setFocusMode(true, child.focusMode);

    statusUpdate({
      status: 'connected',
      message: 'Focus Mode activated',
      details: { childId, mode: 'focus' }
    });
  } else {
    // Deactivate focus mode
    await actionExecutor.deactivateFocusMode(child.focusMode);

    // Update process monitor
    processMonitor.setFocusMode(false);

    statusUpdate({
      status: 'connected',
      message: 'Focus Mode deactivated',
      details: { childId, mode: 'normal' }
    });
  }

  return { success: true };
});

// In ActionExecutor
async activateFocusMode(focusConfig) {
  // Show notification
  await this.showNotification({
    title: 'Focus Mode Activated',
    message: 'Games and distractions are now hidden. Focus on your work!',
    urgency: 'normal'
  });

  // Hide desktop icons
  if (focusConfig.hideIcons) {
    await this.hideIcons(focusConfig.hideIcons);
  }

  // Block applications
  if (focusConfig.blockedApps) {
    // Kill if running
    const processes = await this.platform.getProcessList();
    for (const app of focusConfig.blockedApps) {
      const runningProc = processes.find(p =>
        p.name.toLowerCase().includes(app.toLowerCase())
      );

      if (runningProc) {
        await this.killProcess(runningProc.pid, true);
      }
    }

    // Block future launches
    await this.platform.blockApplications(focusConfig.blockedApps);
  }
}

async deactivateFocusMode(focusConfig) {
  // Show notification
  await this.showNotification({
    title: 'Focus Mode Deactivated',
    message: 'All apps and games are now available again.',
    urgency: 'normal'
  });

  // Restore desktop icons
  if (focusConfig.hideIcons) {
    await this.showIcons(focusConfig.hideIcons);
  }

  // Unblock applications
  if (focusConfig.blockedApps) {
    await this.platform.unblockApplications(focusConfig.blockedApps);
  }
}

// In ProcessMonitor
setFocusMode(enabled, focusConfig) {
  this.focusModeActive = enabled;
  this.focusConfig = focusConfig;

  // Update classification to respect focus mode
  if (enabled) {
    this.blockedCategories = focusConfig.blockedCategories || [];
  } else {
    this.blockedCategories = [];
  }
}

classifyProcess(proc) {
  const info = /* ... normal classification ... */;

  // Check focus mode
  if (this.focusModeActive) {
    if (this.blockedCategories.includes(info.category)) {
      info.blocked = true;
      info.blockReason = 'focus-mode';
    }

    const appName = info.name.toLowerCase();
    if (this.focusConfig.blockedApps.some(app =>
        appName.includes(app.toLowerCase()))) {
      info.blocked = true;
      info.blockReason = 'focus-mode';
    }
  }

  return info;
}
```

### Testing Checklist

- [ ] Focus mode activates via IPC command
- [ ] Desktop icons are hidden
- [ ] Blocked apps are closed
- [ ] Blocked apps cannot launch
- [ ] Only allowed categories work
- [ ] Focus mode deactivates on command
- [ ] Icons and apps restored after deactivation

---

## Use Case 6: Weekend vs Weekday Rules

### Scenario

**Parent Goal**: Different rules for school days vs weekends

**Weekdays**: 2h computer, 1h internet, bedtime 9 PM
**Weekends**: 4h computer, 2h internet, bedtime 10 PM

### Configuration

```javascript
{
  children: {
    123: {
      // Dynamic quota based on day
      getComputerTimeDaily: () => {
        const day = new Date().getDay();
        const isWeekend = day === 0 || day === 6;
        return isWeekend ? 240 : 120;
      },

      getInternetTimeDaily: () => {
        const day = new Date().getDay();
        const isWeekend = day === 0 || day === 6;
        return isWeekend ? 120 : 60;
      },

      bedtime: [
        {
          name: "School Night",
          days: ["mon", "tue", "wed", "thu", "fri"],
          time: "21:00"
        },
        {
          name: "Weekend Night",
          days: ["sat", "sun"],
          time: "22:00"
        }
      ]
    }
  }
}
```

---

## Use Case 7: Multi-Child Household

### Scenario

**Family**: 3 children, different ages, different rules

**Tommy (10)**: Strict limits, early bedtime
**Sarah (14)**: More freedom, later bedtime
**Alex (16)**: Minimal restrictions, focus on screen time awareness

### Configuration

```javascript
{
  userMappings: {
    "tommy": 123,
    "sarah": 456,
    "alex": 789
  },

  parentAccounts: ["dad", "mom"],

  children: {
    // Tommy - Age 10
    123: {
      computerTimeDaily: 120,
      internetTimeDaily: 60,
      bedtime: {
        enabled: true,
        time: "20:30",
        days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
      },
      blockedProcesses: [
        "minecraft.exe",
        "fortnite.exe",
        "roblox.exe"
      ],
      schedules: [
        {
          name: "Homework Time",
          days: ["mon", "tue", "wed", "thu", "fri"],
          start: "15:00",
          end: "17:00",
          allowedCategories: ["education"]
        }
      ]
    },

    // Sarah - Age 14
    456: {
      computerTimeDaily: 180,
      internetTimeDaily: 120,
      bedtime: {
        enabled: true,
        time: "21:30",
        days: ["mon", "tue", "wed", "thu", "fri"]
      },
      focusMode: {
        hideIcons: ["*game*"],
        blockedCategories: ["games"]
      }
    },

    // Alex - Age 16
    789: {
      computerTimeDaily: null, // Unlimited
      internetTimeDaily: null, // Unlimited
      bedtime: {
        enabled: true,
        time: "23:00",
        days: ["mon", "tue", "wed", "thu"]
      },
      reportOnly: true // Only track, don't enforce
    }
  }
}
```

### Implementation

The plugin monitors all three children simultaneously, applying different rules per child based on who is logged in.

---

## Use Case 8: Reward Time Bonus

### Scenario

**Parent Goal**: Child can earn extra computer time by completing chores

**Implementation**: Parent adds bonus time via Allow2 API, plugin respects updated quota

### Flow

```
10:00 - Tommy checks quota via tray icon
      → Shows: "2 hours remaining today"

11:00 - Tommy completes chores
      → Parent approves in Allow2 app
      → Allow2 API updates quota: +30 minutes bonus

11:05 - Plugin syncs with Allow2 API
      → QuotaManager fetches updated quota
      → Shows notification: "You earned 30 bonus minutes! 2h 30m remaining"

12:00 - Tommy uses computer
      → Quota includes bonus: 0/150 minutes used
      → Normal enforcement with extended time
```

---

## Use Case 9: Study Break Timer

### Scenario

**Parent Goal**: Enforce 10-minute break every hour of computer use

### Configuration

```javascript
{
  children: {
    123: {
      breakTimer: {
        enabled: true,
        workDuration: 60, // 60 minutes work
        breakDuration: 10, // 10 minutes break
        lockDuringBreak: true
      }
    }
  }
}
```

### Flow

```
15:00 - Child starts using computer
      → QuotaManager tracks work time

16:00 - 60 minutes of work
      → QuotaManager triggers break
      → ActionExecutor locks session
      → Notification: "Time for a 10-minute break! Stretch and rest your eyes."
      → Session locked for 10 minutes

16:10 - Break over
      → Session auto-unlocks
      → Notification: "Break over - you can resume work now"
```

---

## Use Case 10: Remote Parental Override

### Scenario

**Parent Goal**: Adjust quotas or force logout remotely from phone

### Implementation

**Parent Phone App → Allow2 API → Plugin IPC**

```javascript
// Plugin receives real-time updates via WebSocket
allow2Client.on('quota-updated', (childId, newQuota) => {
  quotaManager.updateQuota(childId, newQuota);

  const session = await sessionMonitor.getCurrentSession();
  if (session && session.childId === childId) {
    // Notify child of change
    actionExecutor.showNotification({
      title: 'Quota Updated',
      message: `Your quota has been adjusted to ${newQuota.computerTimeDaily} minutes`,
      urgency: 'normal'
    });
  }
});

allow2Client.on('force-logout', (childId) => {
  const session = await sessionMonitor.getCurrentSession();
  if (session && session.childId === childId) {
    actionExecutor.logoutUser(session.username, 30);
  }
});

allow2Client.on('pause-restrictions', (childId, duration) => {
  quotaManager.pauseRestrictions(childId, duration);

  actionExecutor.showNotification({
    title: 'Restrictions Paused',
    message: `Parent has paused restrictions for ${duration} minutes`,
    urgency: 'normal'
  });
});
```

---

## Testing Matrix

| Use Case | Windows | macOS | Linux | Priority |
|----------|---------|-------|-------|----------|
| 1. Basic Time Limits | ✅ | ✅ | ✅ | High |
| 2. Internet Only | ✅ | ✅ | ✅ | High |
| 3. Bedtime | ✅ | ✅ | ✅ | High |
| 4. Game Blocking | ✅ | ✅ | ⚠️ | High |
| 5. Focus Mode | ✅ | ✅ | ⚠️ | Medium |
| 6. Weekend Rules | ✅ | ✅ | ✅ | Medium |
| 7. Multi-Child | ✅ | ✅ | ✅ | High |
| 8. Reward Time | ✅ | ✅ | ✅ | Medium |
| 9. Study Breaks | ✅ | ✅ | ✅ | Low |
| 10. Remote Override | ✅ | ✅ | ✅ | High |

**Legend**: ✅ Full support | ⚠️ Partial support | ❌ Not supported

---

## Performance Benchmarks

| Metric | Target | Acceptable | Unacceptable |
|--------|--------|------------|--------------|
| Session detection | < 1s | < 3s | > 5s |
| Process scan | < 500ms | < 1s | > 2s |
| Browser detection | 100% | 95% | < 90% |
| Quota accuracy | ±5s | ±15s | > 30s |
| Warning timing | ±10s | ±30s | > 60s |
| CPU usage (idle) | < 1% | < 2% | > 5% |
| CPU usage (active) | < 3% | < 5% | > 10% |
| Memory usage | < 30MB | < 50MB | > 100MB |

---

**Next**: See PLATFORM_SUPPORT.md for platform-specific implementation details
