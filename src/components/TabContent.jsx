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

import React, { Component } from 'react';
import {
    Typography,
    Card,
    CardContent,
    CardHeader,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    Switch,
    Button,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Divider,
    Chip,
    Box,
    CircularProgress,
    IconButton,
    Tooltip,
    Grid,
    Tabs,
    Tab,
    Paper
} from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import {
    Computer as ComputerIcon,
    Refresh as RefreshIcon,
    Settings as SettingsIcon,
    Block as BlockIcon,
    CheckCircle as CheckCircleIcon,
    Info as InfoIcon,
    Lock as LockIcon,
    ExitToApp as LogoutIcon,
    Person as PersonIcon,
    AccessTime as TimeIcon,
    Warning as WarningIcon
} from '@material-ui/icons';

// Use props.ipc which has auto-prefixed channels, fallback to global for compatibility
// The host app passes ipc/ipcRenderer props with channels prefixed by plugin name

class TabContent extends Component {
    constructor(props) {
        super(props);

        this.state = {
            agents: [],
            violations: [],
            activities: [],
            settings: {
                monitorInterval: 30000,
                killOnViolation: true,
                notifyParent: true,
                warningTimes: [15, 5, 1],
                gracePeriod: 60,
                pauseOnIdle: true
            },
            status: null,
            loading: true,
            error: null,
            selectedChild: {},
            activeTab: 0
        };
    }

    async componentDidMount() {
        await this.loadData();

        // Setup event listeners
        this.props.ipc.on('osViolation', (event, data) => {
            this.handleViolation(data);
        });

        this.props.ipc.on('osSessionUpdate', (event, data) => {
            this.handleSessionUpdate(data);
        });

        this.props.ipc.on('osQuotaWarning', (event, data) => {
            this.handleQuotaWarning(data);
        });

        this.props.ipc.on('osQuotaExhausted', (event, data) => {
            this.handleQuotaExhausted(data);
        });

        // Refresh data every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.loadData(false);
        }, 30000);
    }

    componentWillUnmount() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        this.props.ipc.removeAllListeners && this.props.ipc.removeAllListeners('osViolation');
        this.props.ipc.removeAllListeners && this.props.ipc.removeAllListeners('osSessionUpdate');
        this.props.ipc.removeAllListeners && this.props.ipc.removeAllListeners('osQuotaWarning');
        this.props.ipc.removeAllListeners && this.props.ipc.removeAllListeners('osQuotaExhausted');
    }

    async loadData(showLoading = true) {
        if (showLoading) {
            this.setState({ loading: true, error: null });
        }

        try {
            // Get status
            const [statusError, statusResult] = await this.props.ipc.invoke('os:getStatus');
            if (statusError) throw statusError;

            // Get agents
            const [agentsError, agentsResult] = await this.props.ipc.invoke('os:getAgents');
            if (agentsError) throw agentsError;

            // Get violations
            const [violationsError, violationsResult] = await this.props.ipc.invoke('os:getViolations', { limit: 50 });
            if (violationsError) throw violationsError;

            // Get activity log
            const [activitiesError, activitiesResult] = await this.props.ipc.invoke('os:getActivityLog', { limit: 50 });
            if (activitiesError) throw activitiesError;

            // Get settings
            const [settingsError, settingsResult] = await this.props.ipc.invoke('os:getSettings');
            if (settingsError) throw settingsError;

            this.setState({
                agents: agentsResult.agents || [],
                violations: violationsResult.violations || [],
                activities: activitiesResult.activities || [],
                settings: settingsResult.settings || this.state.settings,
                status: statusResult,
                loading: false
            });
        } catch (error) {
            console.error('[OS Settings] Error loading data:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    handleViolation(data) {
        this.setState(prevState => ({
            violations: [data, ...prevState.violations].slice(0, 50)
        }));
    }

    handleSessionUpdate(data) {
        this.setState(prevState => ({
            agents: prevState.agents.map(a =>
                a.id === data.agentId
                    ? { ...a, currentSession: data.session }
                    : a
            )
        }));
    }

    handleQuotaWarning(data) {
        console.log('[OS Settings] Quota warning:', data);
    }

    handleQuotaExhausted(data) {
        console.log('[OS Settings] Quota exhausted:', data);
    }

    async handleLinkAgent(agentId, childId) {
        try {
            const [error] = await this.props.ipc.invoke('os:linkAgent', { agentId, childId });
            if (error) throw error;

            await this.loadData(false);
        } catch (error) {
            console.error('[OS Settings] Error linking agent:', error);
            this.setState({ error: error.message });
        }
    }

    async handleUnlinkAgent(agentId) {
        try {
            const [error] = await this.props.ipc.invoke('os:unlinkAgent', { agentId });
            if (error) throw error;

            await this.loadData(false);
        } catch (error) {
            console.error('[OS Settings] Error unlinking agent:', error);
            this.setState({ error: error.message });
        }
    }

    async handleUpdateSettings(newSettings) {
        try {
            const [error] = await this.props.ipc.invoke('os:updateSettings', { settings: newSettings });
            if (error) throw error;

            this.setState({ settings: { ...this.state.settings, ...newSettings } });
        } catch (error) {
            console.error('[OS Settings] Error updating settings:', error);
            this.setState({ error: error.message });
        }
    }

    async handleForceLogout(agentId) {
        try {
            const [error] = await this.props.ipc.invoke('os:forceLogout', { agentId });
            if (error) throw error;
        } catch (error) {
            console.error('[OS Settings] Error forcing logout:', error);
            this.setState({ error: error.message });
        }
    }

    async handleLockSession(agentId) {
        try {
            const [error] = await this.props.ipc.invoke('os:lockSession', { agentId });
            if (error) throw error;
        } catch (error) {
            console.error('[OS Settings] Error locking session:', error);
            this.setState({ error: error.message });
        }
    }

    async handleClearViolations() {
        try {
            const [error] = await this.props.ipc.invoke('os:clearViolations');
            if (error) throw error;

            this.setState({ violations: [] });
        } catch (error) {
            console.error('[OS Settings] Error clearing violations:', error);
            this.setState({ error: error.message });
        }
    }

    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    formatIdleTime(ms) {
        if (!ms) return 'Active';
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s idle`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m idle`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m idle`;
    }

    getPlatformIcon(platform) {
        const icons = {
            'win32': 'Windows',
            'darwin': 'macOS',
            'linux': 'Linux'
        };
        return icons[platform] || platform;
    }

    handleTabChange = (event, newValue) => {
        this.setState({ activeTab: newValue });
    };

    renderAgentsList() {
        const { agents, selectedChild } = this.state;
        const { allow2Children } = this.props;

        return (
            <Card style={{ marginBottom: '20px' }}>
                <CardHeader
                    title="Agent Devices"
                    subheader="Computers being monitored via Allow2 Agent"
                    action={
                        <IconButton onClick={() => this.loadData(true)}>
                            <RefreshIcon />
                        </IconButton>
                    }
                />
                <CardContent>
                    {agents.length === 0 ? (
                        <Alert severity="info">
                            No agent devices found. Install and run Allow2 Agent on devices to monitor OS sessions.
                        </Alert>
                    ) : (
                        <List>
                            {agents.map(agent => (
                                <React.Fragment key={agent.id}>
                                    <ListItem>
                                        <Box display="flex" alignItems="center" width="100%">
                                            <ComputerIcon style={{ marginRight: '10px' }} />
                                            <Box flexGrow={1}>
                                                <Typography variant="subtitle1">
                                                    {agent.hostname}
                                                    <Chip
                                                        size="small"
                                                        label={this.getPlatformIcon(agent.platform)}
                                                        style={{ marginLeft: '8px' }}
                                                    />
                                                    <Chip
                                                        size="small"
                                                        label={agent.online ? 'Online' : 'Offline'}
                                                        color={agent.online ? 'primary' : 'default'}
                                                        style={{ marginLeft: '4px' }}
                                                    />
                                                </Typography>
                                                {agent.currentSession && (
                                                    <Typography variant="body2" color="textSecondary">
                                                        <PersonIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                                        {agent.currentSession.username}
                                                        {' - '}
                                                        {this.formatIdleTime(agent.currentSession.idleTime)}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <Box display="flex" alignItems="center" gap={1}>
                                                {agent.childId ? (
                                                    <>
                                                        <Chip
                                                            icon={<PersonIcon />}
                                                            label={allow2Children?.find(c => c.id === agent.childId)?.name || agent.childId}
                                                            color="secondary"
                                                            size="small"
                                                        />
                                                        <Button
                                                            size="small"
                                                            onClick={() => this.handleUnlinkAgent(agent.id)}
                                                        >
                                                            Unlink
                                                        </Button>
                                                        <Tooltip title="Lock Screen">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => this.handleLockSession(agent.id)}
                                                            >
                                                                <LockIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Force Logout">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => this.handleForceLogout(agent.id)}
                                                                color="secondary"
                                                            >
                                                                <LogoutIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </>
                                                ) : (
                                                    <FormControl size="small" style={{ minWidth: 150 }}>
                                                        <Select
                                                            value={selectedChild[agent.id] || ''}
                                                            onChange={(e) => {
                                                                const childId = e.target.value;
                                                                this.setState({
                                                                    selectedChild: { ...selectedChild, [agent.id]: childId }
                                                                });
                                                                if (childId) {
                                                                    this.handleLinkAgent(agent.id, childId);
                                                                }
                                                            }}
                                                            displayEmpty
                                                        >
                                                            <MenuItem value="">Link to child...</MenuItem>
                                                            {allow2Children?.map(child => (
                                                                <MenuItem key={child.id} value={child.id}>
                                                                    {child.name}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                )}
                                            </Box>
                                        </Box>
                                    </ListItem>
                                    <Divider />
                                </React.Fragment>
                            ))}
                        </List>
                    )}
                </CardContent>
            </Card>
        );
    }

    renderSettings() {
        const { settings } = this.state;

        return (
            <Card style={{ marginBottom: '20px' }}>
                <CardHeader title="Monitoring Settings" avatar={<SettingsIcon />} />
                <CardContent>
                    <Grid container spacing={3}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Check Interval (ms)"
                                type="number"
                                value={settings.monitorInterval}
                                onChange={(e) => this.handleUpdateSettings({ monitorInterval: parseInt(e.target.value) })}
                                helperText="How often agents report (default: 30000ms = 30 seconds)"
                                fullWidth
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Grace Period (seconds)"
                                type="number"
                                value={settings.gracePeriod}
                                onChange={(e) => this.handleUpdateSettings({ gracePeriod: parseInt(e.target.value) })}
                                helperText="Warning time before forced logout"
                                fullWidth
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                                <Typography>Kill Blocked Processes</Typography>
                                <Switch
                                    checked={settings.killOnViolation}
                                    onChange={(e) => this.handleUpdateSettings({ killOnViolation: e.target.checked })}
                                />
                            </Box>
                            <Typography variant="caption" color="textSecondary">
                                Automatically terminate blocked applications
                            </Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                                <Typography>Notify Parent</Typography>
                                <Switch
                                    checked={settings.notifyParent}
                                    onChange={(e) => this.handleUpdateSettings({ notifyParent: e.target.checked })}
                                />
                            </Box>
                            <Typography variant="caption" color="textSecondary">
                                Send notifications for violations
                            </Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                                <Typography>Pause on Idle</Typography>
                                <Switch
                                    checked={settings.pauseOnIdle}
                                    onChange={(e) => this.handleUpdateSettings({ pauseOnIdle: e.target.checked })}
                                />
                            </Box>
                            <Typography variant="caption" color="textSecondary">
                                Stop counting time when user is idle
                            </Typography>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>
        );
    }

    renderViolations() {
        const { violations } = this.state;

        return (
            <Card style={{ marginBottom: '20px' }}>
                <CardHeader
                    title="Violations Log"
                    avatar={<WarningIcon />}
                    action={
                        violations.length > 0 && (
                            <Button size="small" onClick={() => this.handleClearViolations()}>
                                Clear
                            </Button>
                        )
                    }
                />
                <CardContent>
                    {violations.length === 0 ? (
                        <Alert severity="success" icon={<CheckCircleIcon />}>
                            No violations recorded
                        </Alert>
                    ) : (
                        <List dense>
                            {violations.map((violation, index) => (
                                <React.Fragment key={index}>
                                    <ListItem>
                                        <ListItemText
                                            primary={
                                                <>
                                                    <Chip
                                                        size="small"
                                                        label={violation.type}
                                                        color={violation.type === 'quota_exhausted' ? 'secondary' : 'default'}
                                                        style={{ marginRight: '8px' }}
                                                    />
                                                    {violation.hostname || violation.agentId}
                                                    {violation.processName && ` - ${violation.processName}`}
                                                </>
                                            }
                                            secondary={
                                                <>
                                                    {this.formatTimestamp(violation.timestamp)}
                                                    {violation.reason && ` - ${violation.reason}`}
                                                </>
                                            }
                                        />
                                    </ListItem>
                                    {index < violations.length - 1 && <Divider />}
                                </React.Fragment>
                            ))}
                        </List>
                    )}
                </CardContent>
            </Card>
        );
    }

    renderActivityLog() {
        const { activities } = this.state;

        return (
            <Card style={{ marginBottom: '20px' }}>
                <CardHeader title="Activity Log" avatar={<TimeIcon />} />
                <CardContent>
                    {activities.length === 0 ? (
                        <Alert severity="info">No activity recorded yet</Alert>
                    ) : (
                        <List dense>
                            {activities.slice(0, 20).map((activity, index) => (
                                <React.Fragment key={index}>
                                    <ListItem>
                                        <ListItemText
                                            primary={activity.message}
                                            secondary={this.formatTimestamp(activity.timestamp)}
                                        />
                                    </ListItem>
                                    {index < Math.min(activities.length, 20) - 1 && <Divider />}
                                </React.Fragment>
                            ))}
                        </List>
                    )}
                </CardContent>
            </Card>
        );
    }

    render() {
        const { status, loading, error, activeTab } = this.state;

        if (loading) {
            return (
                <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                    <CircularProgress />
                </Box>
            );
        }

        return (
            <div style={{ padding: '20px' }}>
                <Typography variant="h5" gutterBottom>
                    Operating System Parental Controls
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                    Monitor computer sessions, enforce time quotas, and control application usage across all agent devices.
                </Typography>

                {error && (
                    <Alert severity="error" style={{ marginBottom: '20px' }}>
                        {error}
                    </Alert>
                )}

                {/* Status Overview */}
                {status && (
                    <Card style={{ marginBottom: '20px' }}>
                        <CardHeader title="Status Overview" />
                        <CardContent>
                            <Box display="flex" gap={2} flexWrap="wrap">
                                <Chip
                                    icon={<ComputerIcon />}
                                    label={`${status.activeAgents}/${status.agentCount} Agents Online`}
                                    color="primary"
                                />
                                <Chip
                                    icon={<PersonIcon />}
                                    label={`${status.monitoredChildren} Children Monitored`}
                                    color="secondary"
                                />
                                <Chip
                                    icon={<BlockIcon />}
                                    label={`${status.recentViolations?.length || 0} Recent Violations`}
                                    color={status.recentViolations?.length > 0 ? "default" : "primary"}
                                />
                            </Box>
                        </CardContent>
                    </Card>
                )}

                {/* Tabs */}
                <Paper style={{ marginBottom: '20px' }}>
                    <Tabs
                        value={activeTab}
                        onChange={this.handleTabChange}
                        indicatorColor="primary"
                        textColor="primary"
                    >
                        <Tab label="Agents" />
                        <Tab label="Settings" />
                        <Tab label="Violations" />
                        <Tab label="Activity" />
                    </Tabs>
                </Paper>

                {/* Tab Content */}
                {activeTab === 0 && this.renderAgentsList()}
                {activeTab === 1 && this.renderSettings()}
                {activeTab === 2 && this.renderViolations()}
                {activeTab === 3 && this.renderActivityLog()}

                <Box marginTop={2}>
                    <Alert severity="info" icon={<InfoIcon />}>
                        <strong>How it works:</strong> This plugin deploys monitoring scripts to agent devices.
                        Session time, process usage, and browser activity are tracked and sent to the parent app.
                        When Allow2 quotas are exceeded or blocked applications are detected, enforcement actions
                        are triggered on the agent device (warnings, process termination, logout).
                    </Alert>
                </Box>
            </div>
        );
    }
}

export default TabContent;
