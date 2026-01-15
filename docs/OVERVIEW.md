# Allow2Automate OS Plugin - Overview

**Version:** 1.0.0
**Status:** Design Phase
**Target Platforms:** Windows, macOS, Linux

---

## Executive Summary

The **allow2automate-os** plugin provides comprehensive OS-level parental controls for the Allow2Automate platform. It enables parents to manage computer usage time, internet access, application blocking, and enforced bedtimes across all major desktop operating systems.

## Core Purpose

Unlike service-specific plugins (PlayStation, Xbox, etc.), this plugin operates at the operating system level to:

1. **Monitor and limit overall computer usage time** (logged-in time tracking)
2. **Track internet usage specifically** (browser activity detection)
3. **Enforce bedtime by automatically logging out users**
4. **Block or terminate processes** (games, applications)
5. **Hide desktop icons and shortcuts** (reduce distractions)
6. **Lock sessions or force screen savers** (break enforcement)
7. **Provide comprehensive activity reports** (what was used and when)

## Key Features

### 1. Time Tracking & Quotas

- **Computer Time Tracking**: Monitors time from login to logout
- **Internet Time Tracking**: Specifically tracks when browsers are open/active
- **Daily/Weekly Quotas**: Separate limits for computer vs. internet time
- **Grace Periods**: Warnings before automatic logout
- **Quota Synchronization**: Integrates with Allow2 platform quotas

### 2. Session Management

- **Logged-in User Detection**: Identifies which child account is active
- **Automatic Logout**: Forces logout when quota exhausted or at bedtime
- **Graceful vs. Forced Logout**: Warns user before terminating session
- **Session Locking**: Can lock workstation without logging out
- **Idle Time Tracking**: Option to pause quota during inactivity

### 3. Process Control

- **Process Blocking**: Prevents blacklisted applications from starting
- **Process Termination**: Kills running blocked processes
- **Warning System**: Notifies user before terminating processes
- **Save Prompts**: Attempts graceful shutdown with save opportunities
- **Whitelist Support**: Always-allowed essential applications

### 4. Internet Control

- **Browser Detection**: Identifies all major browsers (Chrome, Firefox, Safari, Edge, etc.)
- **Browser Time Tracking**: Counts time with browser open as internet time
- **Browser Blocking**: Prevents browsers from launching when quota exhausted
- **Network Monitoring**: Optional deeper network activity tracking

### 5. Focus Mode Features

- **Icon Hiding**: Hides desktop icons for distracting apps/games
- **Shortcut Management**: Removes start menu/dock shortcuts
- **Distraction Blocking**: Temporary blocking during study/homework time
- **Focus Profiles**: Pre-configured sets of restrictions

### 6. Activity Reporting

- **Detailed Logs**: Process names, start times, durations
- **Category Classification**: Games, education, entertainment, productivity
- **Screen Time Reports**: Daily/weekly summaries
- **Top Applications**: Most-used apps by duration
- **Export Capability**: CSV/JSON for external analysis

## Real-World Use Cases

### Use Case 1: Basic Computer Time Limits
**Scenario**: Parent allows 2 hours of computer time per weekday, 4 hours on weekends

**Implementation**:
- Plugin tracks time from login to logout
- Shows countdown timer notification
- 5-minute warning before quota exhausted
- Automatic logout when quota reached
- Quota resets at midnight

### Use Case 2: Internet-Only Restrictions
**Scenario**: Child can use computer for homework (unlimited), but internet is limited to 1 hour/day

**Implementation**:
- Computer time quota: Unlimited
- Internet time quota: 60 minutes
- Browser detection tracks Chrome, Firefox, Edge
- When browser opens, starts internet timer
- When browser closes, pauses internet timer
- Browser blocks launch when internet quota exhausted

### Use Case 3: Bedtime Enforcement
**Scenario**: Child must be off computer by 9 PM on school nights

**Implementation**:
- Bedtime rule: 21:00 Mon-Fri
- 15-minute warning at 20:45
- 5-minute warning at 20:55
- Automatic save prompts at 20:58
- Forced logout at 21:00
- Login blocked until 6:00 AM next day

### Use Case 4: Game Blocking During Homework Time
**Scenario**: Block games from 15:00-18:00 on weekdays

**Implementation**:
- Time-based rule: Block games 15:00-18:00 Mon-Fri
- Game processes monitored: minecraft.exe, fortnite.exe, roblox.exe
- Attempt to launch shows "Games not allowed during homework time"
- If game already running, 2-minute warning then auto-terminate
- Educational apps remain available

### Use Case 5: Focus Mode for Studying
**Scenario**: Parent activates "Homework Mode" that hides game icons and blocks distractions

**Implementation**:
- One-click "Focus Mode" activation
- Hides all game icons from desktop
- Removes game shortcuts from start menu/dock
- Blocks social media sites in browser
- Blocks messaging apps (Discord, Slack)
- Only productivity/educational apps available
- Parent can deactivate remotely

### Use Case 6: Screen Time Reporting
**Scenario**: Parent wants to see what child did on computer this week

**Implementation**:
- Plugin logs all process activity
- Categorizes by type: Education, Games, Video, Social
- Generates weekly report:
  - Total time: 14 hours
  - Top apps: Minecraft (4h), YouTube (3h), Google Docs (2h)
  - Internet time: 8 hours
  - Offline time: 6 hours
- Export to PDF for review

## Technical Approach

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Allow2Automate Application                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              OS Plugin (Main Process)                  │  │
│  │  • Session Monitor                                     │  │
│  │  • Process Monitor                                     │  │
│  │  • Quota Enforcer                                      │  │
│  │  • Browser Detector                                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    OS-Specific Monitors                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Windows    │  │    macOS     │  │    Linux     │     │
│  │              │  │              │  │              │     │
│  │ • WMI        │  │ • IOKit      │  │ • systemd    │     │
│  │ • Registry   │  │ • launchd    │  │ • PAM        │     │
│  │ • Tasks      │  │ • Users API  │  │ • who        │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Action Executors                         │
│  • Logout/Lock                                              │
│  • Process Kill                                             │
│  • Icon Hide/Show                                           │
│  • Registry/Config Modify                                   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Monitor Loop** (every 5 seconds):
   - Check logged-in user
   - List running processes
   - Detect active browsers
   - Calculate quota usage

2. **Quota Check** (every 30 seconds):
   - Query Allow2 API for current quotas
   - Compare usage vs. allowed time
   - Calculate remaining time
   - Trigger warnings if needed

3. **Enforcement** (on quota exhaustion or schedule):
   - Show user notification
   - Save open documents (attempt)
   - Execute logout/lock/process kill
   - Report action to Allow2 API

## Integration with Existing Systems

### Allow2 API Integration

- **Quota Checks**: `GET /children/{childId}/quota?activity=1` (Computer time)
- **Activity Reporting**: `POST /log` (Report usage)
- **Child Identification**: Map OS user account to Allow2 child ID
- **Real-time Updates**: WebSocket for quota changes

### Process Auditing System

The OS plugin will integrate with the existing process auditing system (if available) to:

- Leverage existing process enumeration code
- Share browser detection logic
- Reuse process classification (games vs. productivity)
- Coordinate with other plugins (e.g., game platform plugins)

## Security Considerations

1. **No Elevated Privileges Required**: Runs in user space, cannot control other users
2. **Child Account Restrictions**: Only monitors/controls child accounts, not parent accounts
3. **Tamper Resistance**: Configuration stored in protected area
4. **Bypass Detection**: Monitors for clock changes, VM detection
5. **Privacy**: Logs process names only, no screen captures or keystroke logging

## Configuration Options

### Per-Child Settings

```javascript
{
  childId: 123,
  osUsername: "tommy",

  // Time quotas
  computerTimeDaily: 120,  // minutes
  internetTimeDaily: 60,   // minutes

  // Bedtime rules
  bedtime: {
    enabled: true,
    time: "21:00",
    days: ["mon", "tue", "wed", "thu", "fri"]
  },

  // Process control
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
      allowedCategories: ["education", "productivity"]
    }
  ],

  // Focus mode
  focusMode: {
    hideIcons: true,
    blockedCategories: ["games", "social", "video"]
  }
}
```

## Performance Requirements

- **CPU Usage**: < 2% average
- **Memory**: < 50 MB
- **Disk I/O**: Minimal (log writes every 5 minutes)
- **Network**: API calls every 30-60 seconds
- **Startup Time**: < 3 seconds to initialize

## Compatibility

### Supported OS Versions

- **Windows**: 10, 11 (Home, Pro, Enterprise)
- **macOS**: 11 (Big Sur) and later
- **Linux**: Ubuntu 20.04+, Fedora 35+, Debian 11+

### Multi-User Support

- Single plugin installation per system
- Monitors all configured child accounts
- Separate quotas per child
- Parent accounts never restricted

## Future Enhancements

1. **AI-Powered Classification**: Auto-categorize unknown applications
2. **Web Filtering Integration**: Block specific websites in browser
3. **Remote Control**: Parent can adjust quotas from phone app
4. **Homework Mode API**: Integrate with school systems
5. **Reward System**: Earn extra time by completing tasks
6. **Parental Override**: Temporary quota extension via PIN

## Success Metrics

- **Adoption**: 1000+ active installations in first year
- **Reliability**: < 1% crash rate
- **Accuracy**: 95%+ correct browser detection
- **Performance**: < 5% CPU usage under load
- **User Satisfaction**: 4.5+ star rating

---

## Next Steps

1. Review architecture design document
2. Implement platform-specific monitors
3. Develop action scripts for enforcement
4. Create comprehensive test suite
5. Build configuration UI
6. Beta test with 10 families
7. Publish to plugin registry
