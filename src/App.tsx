import React, { useState, useEffect, useCallback } from 'react';
import { ClickUpAuthScreen } from './components/ClickUpAuthScreen';
import { TopHeader } from './components/TopHeader';
import { AssignedTasksView } from './components/AssignedTasksView';
import { ProjectDetailView } from './components/ProjectDetailView';
import { DiscussionsView } from './components/DiscussionsView';
import { PunchTimeModal } from './components/PunchTimeModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClickUpService } from './services/clickupApi';
import { ClickUpProjectItem, ClickUpTask, ClickUpUser, ClickUpWorkspace } from './types';

const STORAGE_KEYS = {
  API_KEY: 'clickbridge_api_key',
  USER: 'clickbridge_user',
  TEAM: 'clickbridge_team',
};

export default function App() {
  // 1. Authentication & Workspace state
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.API_KEY) || '');
  const [user, setUser] = useState<ClickUpUser | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER);
    return saved ? JSON.parse(saved) : null;
  });
  const [selectedTeam, setSelectedTeam] = useState<ClickUpWorkspace | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TEAM);
    return saved ? JSON.parse(saved) : null;
  });

  // 2. Navigation & Views state
  const [activeView, setActiveView] = useState<'assigned' | 'discussions'>('assigned');
  const [assignedTasks, setAssignedTasks] = useState<ClickUpTask[]>([]);
  const [projects, setProjects] = useState<ClickUpProjectItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<ClickUpProjectItem | null>(null);
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 3. Punch & Live Chrono state
  const [activeTimer, setActiveTimer] = useState<{
    isRunning: boolean;
    taskId?: string;
    taskName: string;
    elapsedSeconds: number;
    startTime: number;
  } | null>(null);

  const [isPunchModalOpen, setIsPunchModalOpen] = useState<boolean>(false);
  const [selectedTaskForPunch, setSelectedTaskForPunch] = useState<ClickUpTask | null>(null);

  // 4. Discussions & Chat State
  const [selectedTaskForChat, setSelectedTaskForChat] = useState<ClickUpTask | null>(null);

  // Chrono interval ticker
  useEffect(() => {
    let interval: any = null;
    if (activeTimer?.isRunning) {
      interval = setInterval(() => {
        setActiveTimer((prev) => {
          if (!prev || !prev.isRunning) return prev;
          const currentElapsed = Math.floor((Date.now() - prev.startTime) / 1000);
          return {
            ...prev,
            elapsedSeconds: currentElapsed,
          };
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTimer?.isRunning, activeTimer?.startTime]);

  // Load Data from ClickUp
  const loadClickUpData = useCallback(async () => {
    if (!apiKey || !user || !selectedTeam) return;

    setIsLoading(true);
    setLoadError(null);
    try {
      // 1. Fetch assigned tasks
      const tasks = await ClickUpService.getMyAssignedTasks(apiKey, selectedTeam.id, user.id);
      setAssignedTasks(tasks);

      // 2. Fetch projects & spaces for rapid searching
      const allProjects = await ClickUpService.getAllProjectsAndSpaces(apiKey, selectedTeam.id, includeArchived);
      setProjects(allProjects);

      // 3. Check if a timer is currently running on ClickUp
      const runningEntry = await ClickUpService.getRunningTimer(apiKey, selectedTeam.id);
      if (runningEntry && runningEntry.task) {
        const startTimestamp = Number(runningEntry.start);
        const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
        setActiveTimer({
          isRunning: true,
          taskId: runningEntry.task.id,
          taskName: runningEntry.task.name,
          startTime: startTimestamp,
          elapsedSeconds: elapsed > 0 ? elapsed : 0,
        });
      }
    } catch (err: any) {
      console.warn('ClickUp load notice:', err.message || err);
      if (err.message && err.message.includes('429')) {
        setLoadError('Limite de requêtes ClickUp atteinte temporairement. Vos données précédentes restent disponibles. Veuillez patienter un instant.');
      } else {
        setLoadError(err.message || 'Impossible de synchroniser avec ClickUp');
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, user, selectedTeam, includeArchived]);

  useEffect(() => {
    if (apiKey && user && selectedTeam) {
      loadClickUpData();
    }
  }, [apiKey, user, selectedTeam, loadClickUpData]);

  // Connection Handler
  const handleConnected = (newApiKey: string, newUser: ClickUpUser, newTeam: ClickUpWorkspace) => {
    setApiKey(newApiKey);
    setUser(newUser);
    setSelectedTeam(newTeam);

    localStorage.setItem(STORAGE_KEYS.API_KEY, newApiKey);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));
    localStorage.setItem(STORAGE_KEYS.TEAM, JSON.stringify(newTeam));
  };

  // Disconnect Handler
  const handleDisconnect = () => {
    setApiKey('');
    setUser(null);
    setSelectedTeam(null);
    setAssignedTasks([]);
    setProjects([]);
    setSelectedProject(null);
    setActiveTimer(null);

    localStorage.removeItem(STORAGE_KEYS.API_KEY);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.TEAM);
  };

  // Live Timer Actions
  const handleStartLiveTimer = async (taskId: string, taskName: string, description?: string) => {
    if (!selectedTeam || !apiKey) return;
    await ClickUpService.startLiveTimer(apiKey, selectedTeam.id, taskId, description);
    setActiveTimer({
      isRunning: true,
      taskId,
      taskName,
      startTime: Date.now(),
      elapsedSeconds: 0,
    });
    // Refresh tasks to update time spent
    loadClickUpData();
  };

  const handleStopLiveTimer = async () => {
    if (!selectedTeam || !apiKey) return;
    await ClickUpService.stopLiveTimer(apiKey, selectedTeam.id);
    setActiveTimer(null);
    // Refresh tasks to update time spent
    loadClickUpData();
  };

  const handleToggleTimer = () => {
    if (activeTimer?.isRunning) {
      handleStopLiveTimer();
    } else {
      const targetTask = selectedTaskForPunch || assignedTasks[0] || null;
      if (targetTask) {
        setSelectedTaskForPunch(targetTask);
        setIsPunchModalOpen(true);
      } else {
        alert('Veuillez sélectionner une tâche pour démarrer le chrono.');
      }
    }
  };

  // Interval Punch (Start - End time)
  const handleAddIntervalPunch = async (
    taskId: string, 
    startMs: number, 
    endMs: number, 
    description?: string,
    billable?: boolean
  ) => {
    if (!selectedTeam || !apiKey) return;
    await ClickUpService.addTimeEntryWithInterval(
      apiKey, 
      selectedTeam.id, 
      taskId, 
      startMs, 
      endMs, 
      description,
      billable
    );
    // Refresh tasks to update time spent
    loadClickUpData();
  };

  const handleOpenPunchModal = (task: ClickUpTask) => {
    setSelectedTaskForPunch(task);
    setIsPunchModalOpen(true);
  };

  const handleOpenDiscussions = (task?: ClickUpTask) => {
    if (task) {
      setSelectedTaskForChat(task);
    } else if (assignedTasks.length > 0 && !selectedTaskForChat) {
      setSelectedTaskForChat(assignedTasks[0]);
    }
    setSelectedProject(null);
    setActiveView('discussions');
  };

  // Direct Task click from search bar
  const handleSelectTaskDirectly = (task: ClickUpTask) => {
    setSelectedTaskForPunch(task);
    setIsPunchModalOpen(true);
  };

  // Update task status from the circle icon
  const handleUpdateTaskStatus = async (taskId: string, newStatusName: string) => {
    if (!apiKey) return;
    
    // Optimistic local update of status
    setAssignedTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const isClosed = ['complete', 'closed', 'terminé', 'done'].includes(newStatusName.toLowerCase());
          return {
            ...t,
            status: {
              ...t.status,
              status: newStatusName,
              type: isClosed ? 'closed' : 'custom',
            },
          };
        }
        return t;
      })
    );

    try {
      await ClickUpService.updateTaskStatus(apiKey, taskId, newStatusName);
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour du statut:', err);
    }
  };

  // If not authenticated, show Clean API Token connection screen
  if (!apiKey || !user || !selectedTeam) {
    return <ClickUpAuthScreen onConnected={handleConnected} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-500 selection:text-white">
      
      {/* Top Navigation & Unified Search Header */}
      <TopHeader
        apiKey={apiKey}
        user={user}
        selectedTeam={selectedTeam}
        projects={projects}
        allTasks={assignedTasks}
        selectedProject={selectedProject}
        activeView={activeView}
        onSelectView={(v) => {
          setActiveView(v);
          setSelectedProject(null);
        }}
        onSelectProject={(proj) => {
          setSelectedProject(proj);
          if (proj) setActiveView('assigned');
        }}
        onSelectTaskDirectly={handleSelectTaskDirectly}
        activeTimer={activeTimer}
        onToggleTimer={handleToggleTimer}
        onOpenGlobalPunch={() => {
          const target = selectedTaskForPunch || assignedTasks[0] || null;
          if (target) {
            setSelectedTaskForPunch(target);
            setIsPunchModalOpen(true);
          }
        }}
        onOpenDiscussions={handleOpenDiscussions}
        onRefreshData={loadClickUpData}
        onDisconnect={handleDisconnect}
        isRefreshing={isLoading}
        includeArchived={includeArchived}
        onToggleArchived={setIncludeArchived}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      {/* Main View Area (Consistent max-w-7xl px-4 py-6 across all views) */}
      <main className="flex-1 pb-16">
        <ErrorBoundary>
          {loadError && (
            <div className="max-w-7xl mx-auto px-4 pt-4">
              <div className="p-3 bg-amber-950/80 border border-amber-600/40 rounded-xl text-amber-200 text-xs flex items-center justify-between shadow-md">
                <div className="flex items-center space-x-2">
                  <span className="font-bold">Info ClickUp:</span>
                  <span>{loadError}</span>
                </div>
                <button
                  onClick={() => setLoadError(null)}
                  className="px-2.5 py-1 bg-amber-900/60 hover:bg-amber-850 text-amber-200 rounded-lg text-[11px] font-semibold transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}

          {selectedProject ? (
            <ProjectDetailView
              apiKey={apiKey}
              project={selectedProject}
              currentUser={user}
              activeTimerTaskId={activeTimer?.isRunning ? activeTimer.taskId : undefined}
              onOpenPunchModal={handleOpenPunchModal}
              onStartLiveTimer={handleStartLiveTimer}
              onStopLiveTimer={handleStopLiveTimer}
              onBackToAssigned={() => setSelectedProject(null)}
            />
          ) : activeView === 'discussions' ? (
            <DiscussionsView
              apiKey={apiKey}
              currentUser={user}
              tasks={assignedTasks}
              projects={projects}
              selectedTaskForChat={selectedTaskForChat}
              onOpenTaskPunch={handleOpenPunchModal}
              onSelectProject={(proj) => {
                setSelectedProject(proj);
                setActiveView('assigned');
              }}
              onBackToLoad={() => setActiveView('assigned')}
            />
          ) : (
            <AssignedTasksView
              tasks={assignedTasks}
              isLoading={isLoading}
              apiKey={apiKey}
              searchFilter={searchQuery}
              onSearchFilterChange={setSearchQuery}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              activeTimerTaskId={activeTimer?.isRunning ? activeTimer.taskId : undefined}
              onOpenPunchModal={handleOpenPunchModal}
              onStartLiveTimer={handleStartLiveTimer}
              onStopLiveTimer={handleStopLiveTimer}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Miniature Contextual Punch & Chrono Window with AM/PM Start-End Picker */}
      <PunchTimeModal
        isOpen={isPunchModalOpen}
        onClose={() => {
          setIsPunchModalOpen(false);
          setSelectedTaskForPunch(null);
        }}
        task={selectedTaskForPunch}
        activeTimer={activeTimer}
        onStartLiveTimer={handleStartLiveTimer}
        onStopLiveTimer={handleStopLiveTimer}
        onAddIntervalPunch={handleAddIntervalPunch}
      />

    </div>
  );
}
