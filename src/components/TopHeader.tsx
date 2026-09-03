import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Play, 
  Square, 
  Clock, 
  X, 
  ChevronDown, 
  RefreshCw, 
  LogOut, 
  MessageSquare,
  Layers, 
  CornerDownRight,
  Folder,
  Sparkles
} from 'lucide-react';
import { ClickUpProjectItem, ClickUpTask, ClickUpUser, ClickUpWorkspace } from '../types';
import { formatTimerClock, formatProjectDisplay } from '../utils/formatters';
import { ClickUpService } from '../services/clickupApi';

interface TopHeaderProps {
  apiKey: string;
  user: ClickUpUser | null;
  selectedTeam: ClickUpWorkspace | null;
  projects: ClickUpProjectItem[];
  allTasks: ClickUpTask[];
  selectedProject: ClickUpProjectItem | null;
  activeView: 'assigned' | 'discussions';
  onSelectView: (view: 'assigned' | 'discussions') => void;
  onSelectProject: (project: ClickUpProjectItem | null) => void;
  onSelectTaskDirectly: (task: ClickUpTask) => void;
  activeTimer: {
    isRunning: boolean;
    taskId?: string;
    taskName: string;
    elapsedSeconds: number;
  } | null;
  onToggleTimer: () => void;
  onOpenGlobalPunch: () => void;
  onOpenDiscussions: (task?: ClickUpTask) => void;
  onRefreshData: () => void;
  onDisconnect: () => void;
  isRefreshing: boolean;
  includeArchived: boolean;
  onToggleArchived: (val: boolean) => void;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  apiKey,
  user,
  selectedTeam,
  projects,
  allTasks,
  selectedProject,
  activeView,
  onSelectView,
  onSelectProject,
  onSelectTaskDirectly,
  activeTimer,
  onToggleTimer,
  onOpenGlobalPunch,
  onOpenDiscussions,
  onRefreshData,
  onDisconnect,
  isRefreshing,
  includeArchived,
  onToggleArchived,
  searchQuery,
  onSearchQueryChange,
}) => {
  const [searchInput, setSearchInput] = useState(() => searchQuery || '');
  const [taskKeyword, setTaskKeyword] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (searchQuery !== undefined && searchQuery !== searchInput) {
      setSearchInput(searchQuery);
    }
  }, [searchQuery]);
  const [projectTasksCache, setProjectTasksCache] = useState<Record<string, ClickUpTask[]>>({});
  const [isLoadingProjectTasks, setIsLoadingProjectTasks] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter projects by main search query (e.g. "DMV", "355_02")
  const projectQuery = searchInput.trim().toLowerCase();

  const matchedProjects = projects.filter((p) => {
    if (!includeArchived && p.isArchived) return false;
    if (!projectQuery) return true;
    const name = (p.name || '').toLowerCase();
    const code = (p.code || '').toLowerCase();
    const spaceName = (p.spaceName || '').toLowerCase();
    return (
      name.includes(projectQuery) ||
      code.includes(projectQuery) ||
      spaceName.includes(projectQuery)
    );
  });

  // Fetch tasks for top matched projects on the fly with 400ms debounce
  useEffect(() => {
    if (!projectQuery.trim() || matchedProjects.length === 0 || !apiKey) return;

    const topProjectsToFetch = matchedProjects.slice(0, 2); // Fetch top 2 matched projects max
    const missingProjects = topProjectsToFetch.filter(p => !projectTasksCache[p.id]);

    if (missingProjects.length === 0) return;

    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsLoadingProjectTasks(true);

      try {
        const results = await Promise.all(
          missingProjects.map(async (p) => {
            try {
              const tasks = await ClickUpService.getTasksForProject(apiKey, p);
              return { projectId: p.id, tasks };
            } catch {
              return { projectId: p.id, tasks: [] };
            }
          })
        );

        if (isMounted) {
          setProjectTasksCache((prev) => {
            const next = { ...prev };
            for (const res of results) {
              next[res.projectId] = res.tasks;
            }
            return next;
          });
        }
      } finally {
        if (isMounted) setIsLoadingProjectTasks(false);
      }
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [projectQuery, matchedProjects, apiKey, user]);

  // Aggregate tasks from matched projects (from cache + allTasks)
  const matchedProjectIds = new Set(matchedProjects.map(p => p.id));
  const matchedProjectCodes = new Set(
    matchedProjects
      .map(p => (p.code || '').toLowerCase())
      .filter(Boolean)
  );

  // 1. From allTasks that match the project
  const taskMap = new Map<string, ClickUpTask>();

  for (const t of allTasks || []) {
    const listId = t.list?.id;
    const folderId = t.folder?.id;
    const folderName = (t.folder?.name || '').toLowerCase();
    const listName = (t.list?.name || '').toLowerCase();

    const belongsToProject = 
      (listId && matchedProjectIds.has(listId)) ||
      (folderId && matchedProjectIds.has(folderId)) ||
      Array.from(matchedProjectCodes).some(code => code && (folderName.includes(code) || listName.includes(code)));

    if (belongsToProject) {
      taskMap.set(t.id, t);
    }
  }

  // 2. From fetched project cache
  for (const p of matchedProjects.slice(0, 4)) {
    const cached = projectTasksCache[p.id] || [];
    for (const t of cached) {
      if (!taskMap.has(t.id)) {
        taskMap.set(t.id, t);
      }
    }
  }

  const allAvailableTasksInMatchedProjects = Array.from(taskMap.values());

  // 3. Filter by 2nd task keyword (e.g. "V01")
  const taskQueryClean = taskKeyword.trim().toLowerCase();
  const filteredTasksByKeyword = taskQueryClean
    ? allAvailableTasksInMatchedProjects.filter((t) => {
        const name = (t.name || '').toLowerCase();
        const parentName = (t.parentName || '').toLowerCase();
        return name.includes(taskQueryClean) || parentName.includes(taskQueryClean);
      })
    : [];

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-xl">
      
      {/* Top Main Bar: Single responsive row with stretched search bar */}
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
        
        {/* Search Bar: Takes all available space */}
        <div className="flex-1 min-w-0 relative" ref={searchContainerRef}>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher un projet (ex: 355_02, 179_254) ou une tâche (ex: V01, Capsule)..."
              value={searchInput}
              onChange={(e) => {
                const val = e.target.value;
                setSearchInput(val);
                if (onSearchQueryChange) onSearchQueryChange(val);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl pl-9 pr-8 py-1.5 sm:py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  if (onSearchQueryChange) onSearchQueryChange('');
                  setIsDropdownOpen(false);
                }}
                className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-200"
                title="Effacer la recherche"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Dropdown with Projects and Direct Tasks */}
          {isDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-96 overflow-y-auto ring-1 ring-white/10 animate-fadeIn">
              
              {/* Top bar with quick status */}
              <div className="p-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-semibold uppercase tracking-wider">
                  {matchedProjects.length} projet{matchedProjects.length > 1 ? 's' : ''} trouvé{matchedProjects.length > 1 ? 's' : ''}
                </span>
                <label className="flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(e) => onToggleArchived(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-purple-600 focus:ring-0"
                  />
                  <span>Inclure archivés</span>
                </label>
              </div>

              {/* 2nd Search Bar: Appears when project search is active */}
              {projectQuery && matchedProjects.length > 0 && (
                <div className="p-2.5 bg-gradient-to-r from-purple-950/60 to-slate-900 border-b border-purple-900/40 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-purple-300 flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Recherche de tâche dans {matchedProjects.length === 1 ? 'ce projet' : `ces ${matchedProjects.length} projets`} :</span>
                    </span>
                    {isLoadingProjectTasks && (
                      <span className="text-[10px] text-purple-400 flex items-center space-x-1 font-mono">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        <span>Chargement...</span>
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-purple-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Mot-clé de la tâche (ex: V01, Montage, Capsule #1)..."
                      value={taskKeyword}
                      onChange={(e) => setTaskKeyword(e.target.value)}
                      className="w-full bg-slate-950 border border-purple-500/50 focus:border-purple-400 rounded-xl pl-8 pr-7 py-1.5 text-xs text-purple-100 placeholder-purple-400/50 focus:outline-none ring-1 ring-purple-500/20"
                    />
                    {taskKeyword && (
                      <button
                        onClick={() => setTaskKeyword('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-purple-400 hover:text-white"
                        title="Effacer le mot-clé de tâche"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Filtered Tasks by 2nd Keyword in Matched Projects */}
              {taskQueryClean && (
                <div className="p-2 bg-purple-950/25 border-b border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-purple-300 mb-1 px-1 flex items-center justify-between">
                    <span className="flex items-center space-x-1">
                      <Layers className="w-3 h-3 text-purple-400" />
                      <span>Tâches correspondantes « {taskKeyword} » ({filteredTasksByKeyword.length})</span>
                    </span>
                  </div>

                  {filteredTasksByKeyword.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      {isLoadingProjectTasks ? 'Recherche des tâches en cours...' : `Aucune tâche trouvée pour « ${taskKeyword} » dans les projets correspondants.`}
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {filteredTasksByKeyword.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => {
                            onSelectTaskDirectly(task);
                            setIsDropdownOpen(false);
                            setSearchInput('');
                            setTaskKeyword('');
                          }}
                          className="w-full p-2 hover:bg-purple-900/40 rounded-xl flex items-center justify-between text-left transition-colors group border border-purple-800/30 bg-slate-900/60"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center space-x-1.5">
                              {task.parent && <CornerDownRight className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                              <span className="text-xs font-bold text-slate-100 group-hover:text-purple-300 truncate">
                                {task.name}
                              </span>
                            </div>
                            {task.parent && (
                              <div className="text-[11px] text-purple-300 truncate font-semibold flex items-center space-x-1">
                                <Layers className="w-3 h-3 text-purple-400 shrink-0" />
                                <span>↳ Tâche parente : <strong className="text-purple-200">{task.parentName || ClickUpService.getParentName(typeof task.parent === 'string' ? task.parent : (task.parent as any)?.id) || 'Livrable parent'}</strong></span>
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 truncate">
                              {task.folder?.name ? `${task.folder.name} / ` : ''}{task.list?.name || ''}
                            </div>
                          </div>
                          <div className="text-[10px] text-purple-300 font-bold px-2 py-1 bg-purple-950 hover:bg-purple-900 rounded-lg border border-purple-700/50 shrink-0 ml-2 shadow-sm">
                            Puncher
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Projects Section */}
              <div className="p-2">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 px-1 flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <Folder className="w-3 h-3 text-slate-500" />
                    <span>Suggestions de Projets ({matchedProjects.length})</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal">Cliquez pour ouvrir un projet</span>
                </div>

                {matchedProjects.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    Aucun projet correspondant trouvé.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {matchedProjects.slice(0, 20).map((project) => {
                      const display = formatProjectDisplay(project.name, project.code);
                      return (
                        <button
                          key={project.id}
                          onClick={() => {
                            onSelectProject(project);
                            setIsDropdownOpen(false);
                            setSearchInput(display.code ? `[${display.code}] ${display.displayName}` : display.displayName);
                            setTaskKeyword('');
                          }}
                          className="w-full p-2 hover:bg-slate-800/80 rounded-xl flex items-center justify-between text-left transition-colors group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                              {display.code && (
                                <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60 font-mono text-[10px] font-bold shrink-0">
                                  {display.code}
                                </span>
                              )}
                              <span className="text-xs font-bold text-slate-200 group-hover:text-purple-300 truncate">
                                {display.displayName}
                              </span>
                              {project.isArchived && (
                                <span className="text-[10px] text-amber-400/80 bg-amber-950/40 px-1 rounded shrink-0">Archivé</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                              {project.spaceName} • {project.type === 'folder' ? 'Dossier' : 'Liste'}
                            </div>
                          </div>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-600 group-hover:text-purple-400 -rotate-90 shrink-0 ml-2" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Right: View Switcher (Mon Load / Discussions) + Live Timer + Refresh + Disconnect */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          
          {/* Mon Load Tab Button */}
          <button
            onClick={() => {
              onSelectProject(null);
              onSelectView('assigned');
            }}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5 shrink-0 ${
              activeView === 'assigned' && !selectedProject
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800'
            }`}
            title="Mon Load (Tâches & livrables assignés)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Mon Load</span>
          </button>

          {/* Canaux de Discussions Button - Juste l'icône de bulle */}
          <button
            onClick={() => {
              onSelectProject(null);
              onSelectView('discussions');
            }}
            className={`p-2 rounded-xl text-xs font-bold flex items-center justify-center transition-all shadow-sm shrink-0 ${
              activeView === 'discussions'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-slate-950 hover:bg-purple-950/60 border border-slate-800 text-purple-300 hover:text-purple-200'
            }`}
            title="Discussions"
            aria-label="Discussions"
          >
            <div className="relative">
              <MessageSquare className="w-4 h-4" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5 ring-2 ring-slate-950" />
            </div>
          </button>

          {/* Top Live Chrono & Punch Button */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              onClick={onToggleTimer}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
                activeTimer?.isRunning
                  ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-md shadow-red-600/30'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30'
              }`}
              title={activeTimer?.isRunning ? 'Arrêter le chrono en cours' : 'Démarrer / Puncher du temps'}
            >
              {activeTimer?.isRunning ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span className="font-mono">{formatTimerClock(activeTimer.elapsedSeconds)}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden sm:inline">Punch</span>
                </>
              )}
            </button>

            <button
              onClick={onOpenGlobalPunch}
              className="p-1.5 text-slate-400 hover:text-purple-300 hover:bg-slate-800 rounded-lg transition-colors"
              title="Ajouter du temps manuel (Début / Fin)"
            >
              <Clock className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh Data */}
          <button
            onClick={onRefreshData}
            disabled={isRefreshing}
            className="p-2 text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors shrink-0"
            title="Rafraîchir les tâches ClickUp"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-purple-400' : ''}`} />
          </button>

          {/* Disconnect */}
          <button
            onClick={onDisconnect}
            className="p-2 text-slate-400 hover:text-red-400 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors shrink-0"
            title="Changer de compte / Déconnexion"
          >
            <LogOut className="w-4 h-4" />
          </button>

        </div>

      </div>

    </header>
  );
};
