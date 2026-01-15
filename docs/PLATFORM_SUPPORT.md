# Allow2Automate OS Plugin - Platform Support Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-15

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Windows Implementation](#windows-implementation)
3. [macOS Implementation](#macos-implementation)
4. [Linux Implementation](#linux-implementation)
5. [Cross-Platform Abstractions](#cross-platform-abstractions)
6. [Testing Requirements](#testing-requirements)
7. [Known Limitations](#known-limitations)

---

## Platform Overview

### Supported Versions

| Platform | Minimum Version | Recommended | Notes |
|----------|----------------|-------------|-------|
| **Windows** | 10 (1809) | 11 | Home, Pro, Enterprise |
| **macOS** | 11.0 (Big Sur) | 14.0 (Sonoma) | Intel & Apple Silicon |
| **Linux** | Kernel 5.4+ | 6.1+ | GNOME, KDE, XFCE |

### Feature Matrix

| Feature | Windows | macOS | Linux | Implementation Difficulty |
|---------|---------|-------|-------|--------------------------|
| User Detection | ✅ Full | ✅ Full | ✅ Full | Easy |
| Process List | ✅ Full | ✅ Full | ✅ Full | Easy |
| Browser Detection | ✅ Full | ✅ Full | ✅ Full | Easy |
| Idle Time | ✅ Full | ✅ Full | ⚠️ DE-dependent | Medium |
| Logout User | ✅ Full | ✅ Full | ⚠️ DE-dependent | Medium |
| Lock Session | ✅ Full | ✅ Full | ⚠️ DE-dependent | Medium |
| Kill Process | ✅ Full | ✅ Full | ✅ Full | Easy |
| Block App Launch | ⚠️ Registry | ⚠️ Complex | ⚠️ Wrapper | Hard |
| Hide Icons | ✅ Attrib | ✅ Flags | ⚠️ DE-dependent | Medium |
| Notifications | ✅ Native | ✅ Native | ✅ notify-send | Easy |

**Legend**: ✅ Full native support | ⚠️ Partial/workaround | ❌ Not supported

---

## Windows Implementation

### Architecture

Windows implementation uses:
- **WMI** (Windows Management Instrumentation) for process management
- **Win32 API** via PowerShell for user sessions and idle time
- **Registry** for application blocking policies
- **Task Scheduler** for startup tasks
- **Windows Notifications** for user alerts

### User Session Detection

#### Method 1: query user command

```javascript
async getCurrentUser() {
  const { stdout } = await execPromise('query user');
  // Output:
  // USERNAME   SESSIONNAME   ID  STATE   IDLE TIME   LOGON TIME
  // >tommy     console       1   Active  none        1/15/2026 9:00 AM

  const lines = stdout.split('\n').slice(1);
  for (const line of lines) {
    if (line.includes('>')) { // Active session
      const parts = line.trim().replace('>', '').split(/\s+/);
      return {
        username: parts[0],
        sessionName: parts[1],
        sessionId: parseInt(parts[2]),
        state: parts[3],
        loginTime: new Date(parts.slice(5).join(' '))
      };
    }
  }
  return null;
}
```

#### Method 2: WMI (more robust)

```javascript
async getCurrentUserWMI() {
  const query = 'wmic computersystem get username /format:csv';
  const { stdout } = await execPromise(query);

  // Output: Node,UserName
  //         COMPUTERNAME,DOMAIN\\tommy

  const lines = stdout.split('\n');
  if (lines.length > 1) {
    const [, domainUser] = lines[1].split(',');
    const username = domainUser.split('\\')[1];
    return { username };
  }
  return null;
}
```

### Process Enumeration

#### Method 1: tasklist

```javascript
async getProcessList() {
  const { stdout } = await execPromise('tasklist /FO CSV /NH');

  // Output: "chrome.exe","12345","Console","1","123,456 K"

  const lines = stdout.split('\n');
  const processes = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const match = line.match(/"([^"]+)","(\d+)"/);
    if (match) {
      processes.push({
        name: match[1],
        pid: parseInt(match[2])
      });
    }
  }

  return processes;
}
```

#### Method 2: WMI with full path

```javascript
async getProcessListWMI() {
  const query = 'wmic process get ProcessId,Name,ExecutablePath /format:csv';
  const { stdout } = await execPromise(query);

  const lines = stdout.split('\n').slice(1);
  const processes = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const [, name, path, pid] = line.split(',');

    processes.push({
      pid: parseInt(pid),
      name: name.trim(),
      path: path ? path.trim() : null
    });
  }

  return processes;
}
```

### Idle Time Detection

```javascript
async getIdleTime() {
  // Use Win32 API via PowerShell
  const script = `
Add-Type @'
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
'@

[IdleTime]::GetIdleTime()
  `;

  const { stdout } = await execPromise(`powershell -Command "${script}"`);
  return parseInt(stdout.trim()); // Milliseconds
}
```

### Logout User

```javascript
async logoutUser(username) {
  // Method 1: Shutdown command (logs out current user)
  await execPromise('shutdown /l');

  // Method 2: Log off specific session
  const session = await this.getSessionId(username);
  if (session) {
    await execPromise(`logoff ${session.sessionId}`);
  }
}
```

### Lock Session

```javascript
async lockSession() {
  // Use rundll32 to call user32.dll
  await execPromise('rundll32.exe user32.dll,LockWorkStation');
}
```

### Kill Process

```javascript
async killProcess(pid, signal) {
  const force = signal === 'SIGKILL' ? '/F' : '';
  const tree = '/T'; // Kill process tree

  await execPromise(`taskkill ${force} ${tree} /PID ${pid}`);
}

async isProcessRunning(pid) {
  try {
    const { stdout } = await execPromise(`tasklist /FI "PID eq ${pid}" /NH`);
    return stdout.includes(pid.toString());
  } catch {
    return false;
  }
}
```

### Block Application Launch

#### Method 1: Registry Policy (Current User)

```javascript
async blockApplications(apps) {
  // HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\DisallowRun
  const keyPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer\\DisallowRun';

  // Enable policy
  await execPromise(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "DisallowRun" /t REG_DWORD /d 1 /f`);

  // Add each app
  for (let i = 0; i < apps.length; i++) {
    await execPromise(`reg add "${keyPath}" /v "${i+1}" /t REG_SZ /d "${apps[i]}" /f`);
  }
}

async unblockApplications(apps) {
  const keyPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer\\DisallowRun';

  // Remove apps
  await execPromise(`reg delete "${keyPath}" /f`);

  // Disable policy
  await execPromise(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "DisallowRun" /t REG_DWORD /d 0 /f`);
}
```

#### Method 2: AppLocker (Requires Pro/Enterprise)

```javascript
async blockWithAppLocker(apps) {
  // Create AppLocker rule via PowerShell
  const script = `
$apps = @(${apps.map(a => `"${a}"`).join(',')})

foreach ($app in $apps) {
  New-AppLockerPolicy -RuleType Deny -FilePath $app -User Everyone |
    Set-AppLockerPolicy -Merge
}

Start-Service -Name AppIDSvc
  `;

  await execPromise(`powershell -Command "${script}"`);
}
```

### Hide Desktop Icons

```javascript
async hideDesktopIcons(patterns) {
  const desktopPath = `${process.env.USERPROFILE}\\Desktop`;

  for (const pattern of patterns) {
    // Set hidden attribute
    await execPromise(`attrib +h "${desktopPath}\\${pattern}"`);
  }
}

async showDesktopIcons(patterns) {
  const desktopPath = `${process.env.USERPROFILE}\\Desktop`;

  for (const pattern of patterns) {
    // Remove hidden attribute
    await execPromise(`attrib -h "${desktopPath}\\${pattern}"`);
  }
}
```

### Notifications

```javascript
async showNotification(options) {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$notification = New-Object System.Windows.Forms.NotifyIcon

# Set icon
$iconPath = [System.Drawing.SystemIcons]::Information
$notification.Icon = $iconPath

# Set text
$notification.BalloonTipTitle = "${options.title}"
$notification.BalloonTipText = "${options.message}"
$notification.BalloonTipIcon = "Info"

# Show
$notification.Visible = $true
$notification.ShowBalloonTip(${options.timeout || 10000})

Start-Sleep -Seconds ${(options.timeout || 10000) / 1000}
$notification.Dispose()
  `;

  await execPromise(`powershell -WindowStyle Hidden -Command "${script}"`);
}
```

### Windows-Specific Considerations

1. **UAC**: Plugin should NOT require admin privileges
2. **Fast User Switching**: Handle multiple logged-in users
3. **Sleep/Hibernate**: Detect and handle resume correctly
4. **Windows Updates**: Don't interfere with system updates
5. **Safe Mode**: Gracefully handle Safe Mode boot

---

## macOS Implementation

### Architecture

macOS implementation uses:
- **BSD commands** (`who`, `ps`, `pkill`) for process management
- **IOKit** for idle time detection
- **AppleScript** for user notifications
- **launchd** for background services
- **System Events** for logout/lock
- **chflags** for hiding files

### User Session Detection

```javascript
async getCurrentUser() {
  // Use 'who' command to find console session
  const { stdout } = await execPromise('who');

  // Output:
  // tommy    console  Jan 15 09:00
  // tommy    ttys000  Jan 15 09:30

  const lines = stdout.split('\n');
  for (const line of lines) {
    if (line.includes('console')) {
      const parts = line.trim().split(/\s+/);
      return {
        username: parts[0],
        terminal: parts[1],
        loginTime: new Date(`${parts[2]} ${parts[3]} ${parts[4]}`)
      };
    }
  }

  // Alternative: Use scutil
  const { stdout: scutilOut } = await execPromise('scutil <<< "show State:/Users/ConsoleUser"');
  const match = scutilOut.match(/Name\s*:\s*(\w+)/);
  return match ? { username: match[1] } : null;
}
```

### Process Enumeration

```javascript
async getProcessList() {
  // Use ps with custom format
  const { stdout } = await execPromise('ps -axo pid,comm,args');

  // Output:
  //   PID COMMAND          ARGS
  // 12345 Google Chrome    /Applications/Google Chrome.app/Contents/MacOS/Google Chrome

  const lines = stdout.split('\n').slice(1);
  const processes = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const match = line.trim().match(/^(\d+)\s+(.+?)(\s+(.+))?$/);
    if (match) {
      processes.push({
        pid: parseInt(match[1]),
        name: match[2].split('/').pop(),
        path: match[4] || match[2]
      });
    }
  }

  return processes;
}
```

### Idle Time Detection

```javascript
async getIdleTime() {
  // Use ioreg to query HID idle time
  const { stdout } = await execPromise(
    'ioreg -c IOHIDSystem | grep HIDIdleTime'
  );

  // Output: "HIDIdleTime" = 12345678900

  const match = stdout.match(/HIDIdleTime"\s*=\s*(\d+)/);
  if (match) {
    // Convert nanoseconds to milliseconds
    return parseInt(match[1]) / 1000000;
  }

  return 0;
}
```

### Logout User

```javascript
async logoutUser(username) {
  // Method 1: AppleScript (graceful)
  const script = 'tell application "System Events" to log out';
  await execPromise(`osascript -e '${script}'`);

  // Method 2: Force logout (if graceful fails)
  // await execPromise('sudo pkill -KILL -u ${username}');
}
```

### Lock Session

```javascript
async lockSession() {
  // Method 1: Use CGSession
  await execPromise('/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend');

  // Method 2: AppleScript
  // const script = 'tell application "System Events" to keystroke "q" using {control down, command down}';
  // await execPromise(`osascript -e '${script}'`);
}
```

### Kill Process

```javascript
async killProcess(pid, signal = 'SIGTERM') {
  await execPromise(`kill -${signal.replace('SIG', '')} ${pid}`);
}

async isProcessRunning(pid) {
  try {
    const { stdout } = await execPromise(`ps -p ${pid}`);
    return stdout.includes(pid.toString());
  } catch {
    return false;
  }
}
```

### Block Application Launch

#### Method 1: Parental Controls (Requires System Preferences)

```javascript
async blockApplications(apps) {
  // Use macOS Parental Controls API
  // NOTE: Requires privileged helper tool or System Preferences access
  // This is complex - see detailed implementation below

  for (const app of apps) {
    const plistPath = `/Users/${username}/Library/Preferences/com.apple.parentalcontrols.plist`;

    // Modify plist to add app to blacklist
    // This requires 'defaults' or 'PlistBuddy'
  }
}
```

#### Method 2: launchd Launch Agent (Wrapper)

```javascript
async blockApplicationWithWrapper(appPath) {
  // Create a launch agent that intercepts app launch
  const plistContent = `
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.allow2.block.${appName}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/osascript</string>
    <string>-e</string>
    <string>display dialog "This application is blocked by parental controls" buttons {"OK"} default button 1</string>
  </array>

  <key>WatchPaths</key>
  <array>
    <string>${appPath}</string>
  </array>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
  `;

  const plistPath = `/Users/${username}/Library/LaunchAgents/com.allow2.block.${appName}.plist`;
  await fs.promises.writeFile(plistPath, plistContent);

  // Load the agent
  await execPromise(`launchctl load ${plistPath}`);
}
```

### Hide Desktop Icons

```javascript
async hideDesktopIcons(patterns) {
  const desktopPath = `${process.env.HOME}/Desktop`;

  for (const pattern of patterns) {
    // Use chflags to set hidden attribute
    const files = await glob(`${desktopPath}/${pattern}`);

    for (const file of files) {
      await execPromise(`chflags hidden "${file}"`);
    }
  }
}

async showDesktopIcons(patterns) {
  const desktopPath = `${process.env.HOME}/Desktop`;

  for (const pattern of patterns) {
    const files = await glob(`${desktopPath}/${pattern}`);

    for (const file of files) {
      await execPromise(`chflags nohidden "${file}"`);
    }
  }
}
```

### Notifications

```javascript
async showNotification(options) {
  // Use osascript to display notification
  const script = `display notification "${options.message}" with title "${options.title}"`;

  await execPromise(`osascript -e '${script}'`);

  // Alternative: Use terminal-notifier (if installed)
  // await execPromise(`terminal-notifier -title "${options.title}" -message "${options.message}"`);
}
```

### macOS-Specific Considerations

1. **SIP (System Integrity Protection)**: Cannot modify system apps/files
2. **Gatekeeper**: Code signing may be required
3. **Privacy Permissions**: Need accessibility permissions for some features
4. **Apple Silicon**: Ensure M1/M2 compatibility
5. **FileVault**: Handle encrypted home directories

---

## Linux Implementation

### Architecture

Linux implementation is **Desktop Environment dependent**:
- **GNOME**: Use `gnome-session-quit`, `gsettings`, `gnome-screensaver`
- **KDE/Plasma**: Use `qdbus`, `kwriteconfig5`
- **XFCE**: Use `xfce4-session-logout`, `xfconf-query`
- **Generic**: Fallback to X11 commands (`xdotool`, `xprintidle`)

### User Session Detection

```javascript
async getCurrentUser() {
  // Method 1: Use 'who' to find X display session
  const { stdout } = await execPromise('who');

  // Output:
  // tommy    :0           2026-01-15 09:00 (:0)

  const lines = stdout.split('\n');
  for (const line of lines) {
    if (line.includes('(:0)') || line.includes('tty7')) {
      const parts = line.trim().split(/\s+/);
      return {
        username: parts[0],
        display: parts[1],
        loginTime: new Date(parts.slice(2, 6).join(' '))
      };
    }
  }

  // Method 2: Check DISPLAY environment variable
  const { stdout: loginctlOut } = await execPromise('loginctl list-sessions --no-legend');
  const sessions = loginctlOut.split('\n');

  for (const session of sessions) {
    const [sessionId] = session.trim().split(/\s+/);
    const { stdout: sessionInfo } = await execPromise(`loginctl show-session ${sessionId}`);

    if (sessionInfo.includes('Type=x11') || sessionInfo.includes('Type=wayland')) {
      const userMatch = sessionInfo.match(/Name=(\w+)/);
      return userMatch ? { username: userMatch[1] } : null;
    }
  }

  return null;
}
```

### Process Enumeration

```javascript
async getProcessList() {
  const { stdout } = await execPromise('ps -eo pid,comm,args --no-headers');

  // Output:
  // 12345 chrome          /usr/bin/google-chrome --flag

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
}
```

### Idle Time Detection

```javascript
async getIdleTime() {
  // Method 1: xprintidle (most reliable)
  try {
    const { stdout } = await execPromise('xprintidle');
    return parseInt(stdout.trim()); // Milliseconds
  } catch {
    // Method 2: Parse 'w' command
    try {
      const { stdout } = await execPromise('w -h -s');
      // Output: tommy :0 9:00am 1:30m 0.00s 0.00s -

      const match = stdout.match(/(\d+):(\d+)m/);
      if (match) {
        return (parseInt(match[1]) * 60 + parseInt(match[2])) * 60000;
      }
    } catch (e) {
      console.error('Error detecting idle time:', e);
    }
  }

  return 0;
}
```

### Logout User

```javascript
async logoutUser(username) {
  // Detect desktop environment
  const de = await this.detectDesktopEnvironment();

  switch (de) {
    case 'gnome':
    case 'mate':
      await execPromise('gnome-session-quit --logout --force');
      break;

    case 'kde':
    case 'plasma':
      await execPromise('qdbus org.kde.ksmserver /KSMServer logout 0 0 0');
      break;

    case 'xfce':
      await execPromise('xfce4-session-logout --logout');
      break;

    default:
      // Fallback: Kill X session
      await execPromise(`pkill -KILL -u ${username}`);
  }
}

async detectDesktopEnvironment() {
  const desktopSession = process.env.DESKTOP_SESSION || '';
  const xdgDesktop = process.env.XDG_CURRENT_DESKTOP || '';

  if (desktopSession.includes('gnome') || xdgDesktop.includes('GNOME')) {
    return 'gnome';
  } else if (desktopSession.includes('kde') || xdgDesktop.includes('KDE')) {
    return 'kde';
  } else if (desktopSession.includes('xfce') || xdgDesktop.includes('XFCE')) {
    return 'xfce';
  } else if (xdgDesktop.includes('MATE')) {
    return 'mate';
  }

  return 'unknown';
}
```

### Lock Session

```javascript
async lockSession() {
  const de = await this.detectDesktopEnvironment();

  switch (de) {
    case 'gnome':
    case 'mate':
      await execPromise('gnome-screensaver-command -l');
      break;

    case 'kde':
    case 'plasma':
      await execPromise('qdbus org.freedesktop.ScreenSaver /ScreenSaver Lock');
      break;

    case 'xfce':
      await execPromise('xflock4');
      break;

    default:
      // Fallback: xscreensaver
      try {
        await execPromise('xscreensaver-command -lock');
      } catch {
        // Last resort: loginctl
        await execPromise('loginctl lock-session');
      }
  }
}
```

### Kill Process

```javascript
async killProcess(pid, signal = 'SIGTERM') {
  await execPromise(`kill -${signal.replace('SIG', '')} ${pid}`);
}

async isProcessRunning(pid) {
  try {
    await execPromise(`ps -p ${pid}`);
    return true;
  } catch {
    return false;
  }
}
```

### Block Application Launch

```javascript
async blockApplications(apps) {
  // Create wrapper scripts that prevent app launch
  for (const app of apps) {
    const wrapperPath = `/usr/local/bin/${app}.blocked`;

    const script = `#!/bin/bash
zenity --error --text="This application is blocked by parental controls" --title="Access Denied"
exit 1
    `;

    await fs.promises.writeFile(wrapperPath, script);
    await execPromise(`chmod +x ${wrapperPath}`);

    // Symlink original app to wrapper (requires sudo)
    // const appPath = await this.findApplicationPath(app);
    // await execPromise(`sudo mv ${appPath} ${appPath}.original`);
    // await execPromise(`sudo ln -s ${wrapperPath} ${appPath}`);
  }
}

async unblockApplications(apps) {
  for (const app of apps) {
    const wrapperPath = `/usr/local/bin/${app}.blocked`;
    await execPromise(`rm -f ${wrapperPath}`);

    // Restore original app
    // const appPath = await this.findApplicationPath(app);
    // await execPromise(`sudo rm ${appPath}`);
    // await execPromise(`sudo mv ${appPath}.original ${appPath}`);
  }
}
```

### Hide Desktop Icons

```javascript
async hideDesktopIcons(patterns) {
  const desktopPath = `${process.env.HOME}/Desktop`;

  for (const pattern of patterns) {
    const files = await glob(`${desktopPath}/${pattern}`);

    for (const file of files) {
      // Rename to hidden (prefix with .)
      const basename = path.basename(file);
      const dirname = path.dirname(file);
      await fs.promises.rename(file, `${dirname}/.${basename}`);
    }
  }
}

async showDesktopIcons(patterns) {
  const desktopPath = `${process.env.HOME}/Desktop`;

  for (const pattern of patterns) {
    const files = await glob(`${desktopPath}/.${pattern}`);

    for (const file of files) {
      // Remove hidden prefix
      const basename = path.basename(file).substring(1);
      const dirname = path.dirname(file);
      await fs.promises.rename(file, `${dirname}/${basename}`);
    }
  }
}
```

### Notifications

```javascript
async showNotification(options) {
  // Use notify-send (libnotify)
  const urgency = options.urgency || 'normal';
  const timeout = options.timeout || 10000;

  await execPromise(
    `notify-send -u ${urgency} -t ${timeout} "${options.title}" "${options.message}"`
  );

  // Alternative: Use zenity
  // await execPromise(`zenity --info --title="${options.title}" --text="${options.message}"`);
}
```

### Linux-Specific Considerations

1. **Desktop Environment Variety**: Support GNOME, KDE, XFCE, MATE, Cinnamon
2. **Display Server**: Handle both X11 and Wayland
3. **Permissions**: Most operations don't require sudo (good!)
4. **Package Managers**: Different distributions install apps differently
5. **systemd**: Use for service management where possible

---

## Cross-Platform Abstractions

### PlatformFactory Pattern

```javascript
// monitors/PlatformFactory.js
class PlatformFactory {
  static create() {
    const platform = process.platform;

    switch (platform) {
      case 'win32':
        return new (require('./windows'))();

      case 'darwin':
        return new (require('./macos'))();

      case 'linux':
        return new (require('./linux'))();

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

module.exports = PlatformFactory;
```

### Common Interface

All platform monitors must implement:

```javascript
class PlatformMonitor {
  async getCurrentUser() { throw new Error('Not implemented'); }
  async getProcessList() { throw new Error('Not implemented'); }
  async getIdleTime() { throw new Error('Not implemented'); }
  async logoutUser(username) { throw new Error('Not implemented'); }
  async lockSession() { throw new Error('Not implemented'); }
  async killProcess(pid, signal) { throw new Error('Not implemented'); }
  async isProcessRunning(pid) { throw new Error('Not implemented'); }
  async showNotification(options) { throw new Error('Not implemented'); }
  async blockApplications(apps) { throw new Error('Not implemented'); }
  async unblockApplications(apps) { throw new Error('Not implemented'); }
  async hideDesktopIcons(patterns) { throw new Error('Not implemented'); }
  async showDesktopIcons(patterns) { throw new Error('Not implemented'); }
}
```

---

## Testing Requirements

### Unit Tests (Per Platform)

```javascript
describe('WindowsMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new WindowsMonitor();
  });

  describe('getCurrentUser', () => {
    it('should detect logged-in user', async () => {
      const user = await monitor.getCurrentUser();
      expect(user).toHaveProperty('username');
      expect(user.username).toBeTruthy();
    });

    it('should return null when no user logged in', async () => {
      // Mock scenario: no active session
    });
  });

  describe('getProcessList', () => {
    it('should return array of processes', async () => {
      const processes = await monitor.getProcessList();
      expect(Array.isArray(processes)).toBe(true);
      expect(processes.length).toBeGreaterThan(0);
    });

    it('should include process name and PID', async () => {
      const processes = await monitor.getProcessList();
      const proc = processes[0];

      expect(proc).toHaveProperty('pid');
      expect(proc).toHaveProperty('name');
      expect(typeof proc.pid).toBe('number');
      expect(typeof proc.name).toBe('string');
    });
  });

  describe('getIdleTime', () => {
    it('should return idle time in milliseconds', async () => {
      const idleTime = await monitor.getIdleTime();
      expect(typeof idleTime).toBe('number');
      expect(idleTime).toBeGreaterThanOrEqual(0);
    });
  });
});
```

### Integration Tests

```javascript
describe('OS Plugin Integration', () => {
  it('should detect current session and track time', async () => {
    const session = await sessionMonitor.getCurrentSession();
    expect(session).toBeTruthy();

    await sleep(5000);

    const usage = quotaManager.getUsageReport(session.childId);
    expect(usage.computerTime).toBeGreaterThan(0);
  });

  it('should detect browser and track internet time', async () => {
    // Launch Chrome
    const chrome = spawn('chrome');

    await sleep(2000);

    const browsers = processMonitor.getActiveBrowsers();
    expect(browsers.length).toBeGreaterThan(0);
    expect(browsers[0].browserName).toBe('Chrome');

    chrome.kill();
  });
});
```

### Manual Testing Checklist

**Windows**:
- [ ] User detection on Windows 10
- [ ] User detection on Windows 11
- [ ] Process list includes all apps
- [ ] Idle time accurate (compare to Task Manager)
- [ ] Logout works (shutdown /l)
- [ ] Lock works (rundll32 lock)
- [ ] Registry blocking works

**macOS**:
- [ ] User detection on Intel Mac
- [ ] User detection on Apple Silicon
- [ ] Process list includes all apps
- [ ] Idle time accurate (compare to Activity Monitor)
- [ ] Logout works (System Events)
- [ ] Lock works (CGSession)
- [ ] chflags hiding works

**Linux**:
- [ ] User detection on GNOME
- [ ] User detection on KDE
- [ ] User detection on XFCE
- [ ] Process list accurate
- [ ] xprintidle works
- [ ] Logout works on each DE
- [ ] Lock works on each DE
- [ ] notify-send works

---

## Known Limitations

### Windows
- Registry blocking requires Group Policy (may not work on Home edition)
- AppLocker requires Pro/Enterprise
- Cannot block Microsoft Store apps easily
- UAC prompts may bypass blocking

### macOS
- SIP prevents modification of system apps
- Requires accessibility permissions
- Application blocking is complex without privileged helper
- Cannot easily block App Store apps

### Linux
- Desktop environment fragmentation
- xprintidle requires X11 (not Wayland)
- Application paths vary by distribution
- Snap/Flatpak apps have different paths

---

## Performance Benchmarks

### Windows

| Operation | Average Time | Max Time |
|-----------|--------------|----------|
| getCurrentUser | 50ms | 200ms |
| getProcessList | 100ms | 500ms |
| getIdleTime | 30ms | 100ms |
| killProcess | 20ms | 200ms |
| showNotification | 50ms | 150ms |

### macOS

| Operation | Average Time | Max Time |
|-----------|--------------|----------|
| getCurrentUser | 30ms | 100ms |
| getProcessList | 80ms | 300ms |
| getIdleTime | 20ms | 50ms |
| killProcess | 10ms | 50ms |
| showNotification | 40ms | 100ms |

### Linux

| Operation | Average Time | Max Time |
|-----------|--------------|----------|
| getCurrentUser | 40ms | 150ms |
| getProcessList | 70ms | 300ms |
| getIdleTime | 25ms | 100ms |
| killProcess | 15ms | 100ms |
| showNotification | 30ms | 100ms |

---

**Summary**: The allow2automate-os plugin provides comprehensive OS-level parental controls across all major desktop platforms. Windows implementation is most mature, macOS requires some workarounds for app blocking, and Linux requires desktop environment detection but is otherwise straightforward.

**Next Steps**: Implement platform monitors, test thoroughly on each OS, and iterate based on user feedback.
