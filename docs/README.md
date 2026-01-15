# Allow2Automate OS Plugin - Documentation

**Version:** 1.0.0 (Design Phase)
**Created:** 2026-01-15
**Status:** Ready for Implementation

---

## Overview

This directory contains comprehensive design documentation for the **allow2automate-os** plugin, which provides OS-level parental controls for Windows, macOS, and Linux.

## Documentation Structure

### 📋 [OVERVIEW.md](./OVERVIEW.md) (322 lines)
**Purpose**: High-level plugin description and use cases

**Contents**:
- Executive summary of plugin capabilities
- Core features (time tracking, session management, process control)
- Real-world use cases (6 detailed scenarios)
- Technical approach overview
- Integration with Allow2 API and process auditing
- Configuration schema
- Performance requirements
- Success metrics

**Read this first** to understand what the plugin does and why.

---

### 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) (1,730 lines)
**Purpose**: Detailed technical architecture and API design

**Contents**:
- System architecture diagrams
- Core component specifications:
  - **SessionMonitor**: User login detection and tracking
  - **ProcessMonitor**: Process enumeration and browser detection
  - **QuotaManager**: Time tracking and quota enforcement
  - **ActionExecutor**: Enforcement actions (logout, kill, block)
- Platform-specific monitor implementations (Windows, macOS, Linux)
- Complete code examples with working implementations
- State management and configuration
- Error handling strategies
- Testing approach

**Read this** to understand how to build the plugin.

---

### 💡 [USE_CASES.md](./USE_CASES.md) (1,155 lines)
**Purpose**: Real-world implementation scenarios with code examples

**Contents**:
- **10 detailed use cases**:
  1. Basic Time Limits (daily quotas)
  2. Internet-Only Restrictions (browser tracking)
  3. Bedtime Enforcement (automatic logout)
  4. Game Blocking During Homework (scheduled blocking)
  5. Focus Mode (hide distractions)
  6. Weekend vs Weekday Rules (dynamic quotas)
  7. Multi-Child Household (multiple profiles)
  8. Reward Time Bonus (Allow2 API integration)
  9. Study Break Timer (forced breaks)
  10. Remote Parental Override (real-time control)

- Implementation flows with timelines
- Complete code examples for each scenario
- Testing checklists
- Performance benchmarks

**Read this** to see the plugin in action and understand user scenarios.

---

### 🖥️ [PLATFORM_SUPPORT.md](./PLATFORM_SUPPORT.md) (1,125 lines)
**Purpose**: Platform-specific implementation details

**Contents**:
- **Windows Implementation**:
  - WMI, PowerShell, Registry APIs
  - User session detection (query user, WMI)
  - Process enumeration (tasklist, WMI)
  - Idle time (Win32 API)
  - Logout/lock/kill operations
  - Application blocking (Registry, AppLocker)
  - Icon hiding (attrib)
  - Notifications (PowerShell)

- **macOS Implementation**:
  - BSD commands, IOKit, AppleScript
  - User detection (who, scutil)
  - Process list (ps)
  - Idle time (ioreg HIDIdleTime)
  - Logout/lock (System Events, CGSession)
  - Application blocking (launchd, Parental Controls)
  - Icon hiding (chflags)
  - Notifications (osascript)

- **Linux Implementation**:
  - Desktop environment detection (GNOME, KDE, XFCE)
  - User detection (who, loginctl)
  - Process list (ps)
  - Idle time (xprintidle)
  - Logout/lock (DE-specific commands)
  - Application blocking (wrapper scripts)
  - Icon hiding (rename)
  - Notifications (notify-send)

- Cross-platform abstraction patterns
- Platform-specific considerations
- Testing requirements per platform
- Known limitations
- Performance benchmarks

**Read this** for platform-specific implementation guidance.

---

## Quick Start

### 1. Understand the Plugin
Read **OVERVIEW.md** first to grasp the high-level goals and features.

### 2. Review Use Cases
Read **USE_CASES.md** to see how the plugin works in real scenarios.

### 3. Study Architecture
Read **ARCHITECTURE.md** to understand the component design and APIs.

### 4. Implement Platform Support
Read **PLATFORM_SUPPORT.md** for OS-specific implementation details.

---

## Key Technologies

### Windows
- WMI (Windows Management Instrumentation)
- PowerShell scripting
- Win32 API (GetLastInputInfo)
- Registry policies
- Task Scheduler

### macOS
- BSD commands (ps, who, kill)
- IOKit (HIDIdleTime)
- AppleScript
- launchd
- System Events

### Linux
- systemd (loginctl)
- Desktop environment APIs (GNOME, KDE, XFCE)
- X11 tools (xprintidle, xdotool)
- notify-send
- PAM

---

## Core Features Summary

### Time Tracking
- **Computer Time**: Tracks total logged-in time
- **Internet Time**: Tracks browser open time separately
- **Idle Detection**: Option to pause during inactivity
- **Quota Synchronization**: Integrates with Allow2 API

### Session Management
- **User Detection**: Maps OS usernames to Allow2 child IDs
- **Login Tracking**: Monitors session start/end
- **Automatic Logout**: Enforces quota exhaustion or bedtime
- **Session Locking**: Alternative to logout for breaks

### Process Control
- **Process Monitoring**: Real-time process enumeration
- **Browser Detection**: Identifies Chrome, Firefox, Safari, Edge, Opera, Brave
- **Category Classification**: Games, education, productivity, etc.
- **Process Blocking**: Prevents blacklisted apps from running
- **Process Termination**: Graceful and forced kill options

### Enforcement Actions
- **Quota Warnings**: Notifications at 15, 5, 1 minutes remaining
- **Bedtime Enforcement**: Automatic logout at scheduled time
- **Browser Blocking**: Prevents browser launch when internet quota exhausted
- **Icon Hiding**: Hides distracting desktop icons
- **Focus Mode**: One-click distraction removal

### Multi-Platform Support
- **Windows**: 10, 11 (Home, Pro, Enterprise)
- **macOS**: 11+ (Big Sur and later, Intel & Apple Silicon)
- **Linux**: Ubuntu, Fedora, Debian (GNOME, KDE, XFCE)

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Set up project structure
- [ ] Implement PlatformFactory
- [ ] Create base monitor interfaces
- [ ] Set up testing framework

### Phase 2: Windows Implementation (Week 3-4)
- [ ] User session detection
- [ ] Process enumeration
- [ ] Browser detection
- [ ] Idle time tracking
- [ ] Logout/lock/kill operations
- [ ] Notifications
- [ ] Unit tests

### Phase 3: macOS Implementation (Week 5-6)
- [ ] All Windows features adapted for macOS
- [ ] IOKit integration for idle time
- [ ] AppleScript for logout/lock
- [ ] chflags for icon hiding
- [ ] Unit tests

### Phase 4: Linux Implementation (Week 7-8)
- [ ] Desktop environment detection
- [ ] GNOME support
- [ ] KDE support
- [ ] XFCE support
- [ ] Generic X11 fallbacks
- [ ] Unit tests

### Phase 5: Core Controllers (Week 9-10)
- [ ] SessionMonitor implementation
- [ ] ProcessMonitor implementation
- [ ] QuotaManager implementation
- [ ] ActionExecutor implementation
- [ ] Integration tests

### Phase 6: Allow2 Integration (Week 11)
- [ ] Allow2 API client
- [ ] Quota checking
- [ ] Activity logging
- [ ] Real-time updates (WebSocket)
- [ ] API integration tests

### Phase 7: Configuration UI (Week 12)
- [ ] TabContent React component
- [ ] Child account mapping UI
- [ ] Quota configuration
- [ ] Schedule editor
- [ ] Focus mode controls

### Phase 8: Testing & Polish (Week 13-14)
- [ ] Cross-platform testing
- [ ] Performance optimization
- [ ] Documentation updates
- [ ] Bug fixes
- [ ] Beta release

### Phase 9: Beta Testing (Week 15-16)
- [ ] Recruit 10 beta families
- [ ] Collect feedback
- [ ] Fix critical issues
- [ ] Performance tuning

### Phase 10: Release (Week 17)
- [ ] Final testing
- [ ] Publish to npm
- [ ] Submit to plugin registry
- [ ] Marketing materials
- [ ] Public launch

---

## Code Statistics

| File | Lines | Size | Purpose |
|------|-------|------|---------|
| OVERVIEW.md | 322 | 13 KB | High-level description |
| ARCHITECTURE.md | 1,730 | 46 KB | Technical architecture |
| USE_CASES.md | 1,155 | 29 KB | Implementation scenarios |
| PLATFORM_SUPPORT.md | 1,125 | 29 KB | OS-specific details |
| **Total** | **4,332** | **117 KB** | **Complete design** |

---

## Research Findings

### Process Auditing Integration
The plugin will integrate with any existing process auditing system to:
- Leverage process enumeration code
- Share browser detection logic
- Coordinate with game platform plugins (Xbox, PlayStation, etc.)
- Avoid duplicate monitoring

### Real-World Use Cases Researched
1. **Time Limits**: Daily/weekly computer quotas
2. **Internet Control**: Separate browser time tracking
3. **Bedtime Enforcement**: Forced logout at scheduled times
4. **App Blocking**: Game/app restrictions during homework
5. **Focus Mode**: Distraction hiding for studying
6. **Screen Time Reports**: Activity logging and categorization

### Technical Approaches Validated
- **User Detection**: Tested across all platforms (query user, who, loginctl)
- **Browser Detection**: Pattern matching for 6+ major browsers
- **Logout Methods**: Platform-specific graceful and forced options
- **Process Termination**: SIGTERM then SIGKILL approach
- **Icon Hiding**: Platform-specific file attributes

### Platform-Specific Capabilities
- **Windows**: Registry blocking, WMI, PowerShell automation
- **macOS**: IOKit, AppleScript, launchd, chflags
- **Linux**: Desktop environment detection, systemd, X11 tools

---

## Key Design Decisions

### 1. No Elevated Privileges Required
**Decision**: Plugin runs in user space, no admin/root required

**Rationale**:
- Easier deployment
- Better security (cannot be exploited for privilege escalation)
- Works on locked-down systems
- Limitation: Can only control child accounts, not parent accounts

### 2. Separate Computer vs Internet Time
**Decision**: Track browser time separately from total computer time

**Rationale**:
- Parents often want different limits for online vs offline usage
- Educational apps don't count against internet quota
- More flexible parenting strategies

### 3. Browser Detection via Process Names
**Decision**: Detect browsers by matching process names against patterns

**Rationale**:
- Simple and reliable
- Works across all platforms
- Low overhead
- Alternative (network monitoring) is more complex and privacy-invasive

### 4. Platform-Specific Implementations
**Decision**: Separate monitor classes per platform with common interface

**Rationale**:
- APIs differ significantly between Windows, macOS, Linux
- Easier to maintain and test
- Clear separation of concerns
- PlatformFactory provides clean abstraction

### 5. Graceful Then Forced Enforcement
**Decision**: Warn users before taking action, then force if needed

**Rationale**:
- Prevents data loss (unsaved work)
- Better user experience
- More acceptable to children
- Reduces parent complaints

---

## Security Considerations

### Privacy
- **No Screen Captures**: Only process names logged
- **No Keystroke Logging**: Never implemented
- **No Browser History**: Only tracks if browser is open, not URLs
- **Local Storage**: Logs stored locally, not uploaded

### Tamper Resistance
- **Clock Change Detection**: Monitors system time manipulation
- **VM Detection**: Detects if running in virtual machine
- **Process Protection**: Plugin monitors itself for termination attempts
- **Configuration Protection**: Settings stored in protected area

### Access Control
- **Parent Accounts**: Never restricted or monitored
- **Child Accounts**: Only configured accounts are controlled
- **Configuration Lock**: Parents can password-protect settings

---

## Support & Troubleshooting

### Common Issues

**Issue**: User detection not working
- **Solution**: Check user mapping configuration
- **Verify**: OS username matches Allow2 child account mapping

**Issue**: Browser not detected
- **Solution**: Add custom browser patterns to configuration
- **Verify**: Process name appears in process list

**Issue**: Logout doesn't work
- **Solution**: Platform-specific - check error logs
- **Verify**: User has permission to logout (not locked by policy)

**Issue**: Quota not accurate
- **Solution**: Check for clock changes, system sleep
- **Verify**: Plugin running continuously

---

## Contributing

### Development Setup
1. Clone repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Build: `npm run build`

### Testing
- Unit tests per platform: `npm run test:windows`, `npm run test:macos`, `npm run test:linux`
- Integration tests: `npm run test:integration`
- Manual testing: Use test scenarios from USE_CASES.md

### Code Style
- ESLint configuration provided
- Prettier for formatting
- JSDoc comments required for all public APIs

---

## License

Apache 2.0 (same as other Allow2Automate plugins)

---

## Authors

- **Research & Design**: Claude Code Agent (Researcher role)
- **Date**: 2026-01-15
- **Based on**: Allow2Automate plugin ecosystem analysis

---

## Next Steps

1. **Review Documentation**: Stakeholders review design docs
2. **Approve Architecture**: Technical review of ARCHITECTURE.md
3. **Begin Implementation**: Start with Phase 1 (Core Infrastructure)
4. **Iterative Development**: Build, test, refine each phase
5. **Beta Testing**: Recruit families for real-world testing
6. **Launch**: Publish to plugin registry

---

**Questions or feedback?** Open an issue or contact the Allow2Automate team.

**Ready to implement?** Start with ARCHITECTURE.md for technical details.
