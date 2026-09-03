import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ClickUpTask } from '../types';
import { TaskRow } from './TaskRow';
import { TaskCard } from './TaskCard';
import { 
  matchTaskSearch 
} from '../utils/formatters';
import { 
  Search, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  Filter, 
  Sparkles, 
  EyeOff, 
  Eye, 
  ChevronDown, 
  Check, 
  X,
  SlidersHorizontal,
  LayoutGrid,
  List
} from 'lucide-react';

interface AssignedTasksViewProps {
  tasks: ClickUpTask[];
  isLoading: boolean;
  apiKey?: string;
  activeTimerTaskId?: string;
  searchFilter?: string;
  onSearchFilterChange?: (text: string) => void;
  onUpdateTaskStatus?: (taskId: string, newStatus: string) => Promise<void> | void;
  onOpenPunchModal: (task: ClickUpTask) => void;
  onStartLiveTimer: (taskId: string, taskName: string) => void;
  onStopLiveTimer: () => void;
}

const STORAGE_FILTER_KEY = 'clickbridge_status_filter_state';
const STORAGE_VIEW_MODE_KEY = 'clickbridge_tasks_view_mode';

export const AssignedTasksView: React.FC<AssignedTasksViewProps> = ({
  tasks,
  isLoading,
  apiKey,
  activeTimerTaskId,
  searchFilter,
  onSearchFilterChange,
  onUpdateTaskStatus,
  onOpenPunchModal,
  onStartLiveTimer,
  onStopLiveTimer,
}) => {
  const [internalFilterText, setInternalFilterText] = useState('');
  const activeSearchQuery = searchFilter !== undefined ? searchFilter : internalFilterText;

  // View Mode: 'list' (default as requested) or 'cards'
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    const saved = localStorage.getItem(STORAGE_VIEW_MODE_KEY);
    return saved === 'cards' ? 'cards' : 'list';
  });

  const handleSetViewMode = (mode: 'cards' | 'list') => {
    setViewMode(mode);
    localStorage.setItem(STORAGE_VIEW_MODE_KEY, mode);
  };

  const handleSearchChange = (text: string) => {
    setInternalFilterText(text);
    if (onSearchFilterChange) {
      onSearchFilterChange(text);
    }
  };

  const [dateFilter, setDateFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  
  // Status filter state: 'hide_closed' (default), 'all', or 'custom'
  const [statusMode, setStatusMode] = useState<'hide_closed' | 'all' | 'custom'>(() => {
    const saved = localStorage.getItem(STORAGE_FILTER_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.statusMode) return parsed.statusMode;
      } catch {}
    }
    return 'hide_closed'; // Par défaut, on masque les tâches terminées comme dans ClickUp
  });

  // Array of status names specifically enabled when in 'custom' mode
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_FILTER_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.selectedStatuses)) return parsed.selectedStatuses;
      } catch {}
    }
    return [];
  });

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save status filter preference to localStorage
  useEffect(() => {
    localStorage.setItem(
      STORAGE_FILTER_KEY,
      JSON.stringify({ statusMode, selectedStatuses })
    );
  }, [statusMode, selectedStatuses]);

  // Helper to check if a status is considered "done" / "closed" / "completed"
  const isClosedStatus = (task: ClickUpTask) => {
    const statusType = task.status?.type?.toLowerCase() || '';
    const statusName = task.status?.status?.toLowerCase() || '';
    return (
      statusType === 'closed' ||
      statusType === 'done' ||
      statusName.includes('closed') ||
      statusName.includes('complete') ||
      statusName.includes('terminé') ||
      statusName.includes('fini') ||
      statusName.includes('done')
    );
  };

  // Extract all unique statuses from tasks with task counts and colors
  const availableStatuses = useMemo(() => {
    const map = new Map<string, { status: string; color: string; type: string; count: number; isClosed: boolean }>();
    tasks.forEach((t) => {
      const sName = t.status?.status || 'Ouvert';
      const sColor = t.status?.color || '#a855f7';
      const sType = t.status?.type || 'open';
      const closed = isClosedStatus(t);

      if (map.has(sName)) {
        map.get(sName)!.count += 1;
      } else {
        map.set(sName, {
          status: sName,
          color: sColor,
          type: sType,
          count: 1,
          isClosed: closed,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
      return b.count - a.count;
    });
  }, [tasks]);

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Filter tasks based on text, dates, and statuses
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // 1. Text Search Filter (Numéro de projet ou mot-clé)
      if (activeSearchQuery.trim()) {
        if (!matchTaskSearch(t, activeSearchQuery)) {
          return false;
        }
      }

      // 2. Status Filter
      if (statusMode === 'hide_closed') {
        if (isClosedStatus(t)) return false;
      } else if (statusMode === 'custom') {
        const sName = t.status?.status || 'Ouvert';
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(sName)) {
          return false;
        }
      }

      // 3. Date Filter
      if (dateFilter === 'overdue') {
        if (!t.due_date) return false;
        const due = Number(t.due_date);
        return due < todayMidnight;
      }
      if (dateFilter === 'today') {
        if (!t.due_date) return false;
        const due = Number(t.due_date);
        const endOfToday = todayMidnight + 24 * 3600 * 1000;
        return due >= todayMidnight && due < endOfToday;
      }
      if (dateFilter === 'upcoming') {
        if (!t.due_date) return true;
        return Number(t.due_date) >= todayMidnight;
      }

      return true;
    });
  }, [tasks, activeSearchQuery, statusMode, selectedStatuses, dateFilter, todayMidnight]);

  // Counts
  const overdueCount = tasks.filter(t => !isClosedStatus(t) && t.due_date && Number(t.due_date) < todayMidnight).length;
  const todayCount = tasks.filter(t => {
    if (isClosedStatus(t) || !t.due_date) return false;
    const due = Number(t.due_date);
    return due >= todayMidnight && due < todayMidnight + 24 * 3600 * 1000;
  }).length;
  const closedCount = tasks.filter(t => isClosedStatus(t)).length;
  const activeCount = tasks.length - closedCount;

  // Toggle specific status in custom selection
  const handleToggleStatus = (statusName: string) => {
    setStatusMode('custom');
    setSelectedStatuses((prev) => {
      if (prev.includes(statusName)) {
        const next = prev.filter((s) => s !== statusName);
        return next;
      } else {
        return [...prev, statusName];
      }
    });
  };

  const handleSelectOnlyThisStatus = (statusName: string) => {
    setStatusMode('custom');
    setSelectedStatuses([statusName]);
    setIsStatusDropdownOpen(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      
      {/* Top Banner / Summary Header & Filters */}
      <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-md space-y-3.5">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white">Mes Tâches Assignées (Mon Load)</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/60 font-mono font-bold">
                {filteredTasks.length} / {tasks.length}
              </span>
              {activeSearchQuery.trim() && (
                <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-purple-900/60 border border-purple-500/50 text-[11px] text-purple-200">
                  <span>Recherche : <strong>« {activeSearchQuery.trim()} »</strong></span>
                  <button
                    onClick={() => handleSearchChange('')}
                    className="p-0.5 hover:text-white text-purple-300"
                    title="Effacer le filtre"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Classées exactement comme ClickUp (par date de livraison <strong>Due date ⬆</strong> & priorité).
            </p>
          </div>

          {/* Quick Search bar */}
          <div className="relative min-w-[240px] lg:max-w-xs w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={activeSearchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Numéro de projet (ex: 355_02, 100) ou mot-clé..."
              className="w-full pl-8 pr-8 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all"
            />
            {activeSearchQuery && (
              <button 
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                title="Effacer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Row: Status Modes, Date Pills & View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800/70 text-xs">
          
          {/* Status Filter Section */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1 mr-1">
              <Filter className="w-3 h-3 text-purple-400" />
              <span>Statuts :</span>
            </span>

            {/* Quick Button: Hide Closed (Active only) */}
            <button
              onClick={() => {
                setStatusMode('hide_closed');
                setSelectedStatuses([]);
              }}
              className={`px-3 py-1.5 rounded-full font-semibold transition-all flex items-center space-x-1.5 ${
                statusMode === 'hide_closed'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
              title="Masquer les tâches dont le statut est Terminé / Closed / Done"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>Actives ({activeCount})</span>
            </button>

            {/* Quick Button: Show All (including closed) */}
            <button
              onClick={() => {
                setStatusMode('all');
                setSelectedStatuses([]);
              }}
              className={`px-3 py-1.5 rounded-full font-semibold transition-all flex items-center space-x-1.5 ${
                statusMode === 'all'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
              title="Afficher toutes les tâches sans masquer les terminées"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Tous ({tasks.length})</span>
            </button>

            {/* Dropdown: Custom Statuses Multi-Select */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                className={`px-3 py-1.5 rounded-full font-semibold transition-all flex items-center space-x-1.5 border ${
                  statusMode === 'custom'
                    ? 'bg-purple-950/80 border-purple-500 text-purple-200'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
                <span>
                  {statusMode === 'custom' && selectedStatuses.length > 0
                    ? `Statuts (${selectedStatuses.length})`
                    : 'Filtrer statuts...'}
                </span>
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {/* Status Dropdown Menu */}
              {isStatusDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-40 p-3 space-y-2.5 animate-fadeIn text-slate-200">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Filtrer par statut ClickUp
                    </span>
                    <button
                      onClick={() => {
                        setStatusMode('all');
                        setSelectedStatuses([]);
                      }}
                      className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold"
                    >
                      Tout cocher
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                    {availableStatuses.map((st) => {
                      const isChecked =
                        statusMode === 'all' ||
                        (statusMode === 'hide_closed' && !st.isClosed) ||
                        (statusMode === 'custom' && selectedStatuses.includes(st.status));

                      return (
                        <div
                          key={st.status}
                          className="flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-800/80 transition-colors group cursor-pointer"
                          onClick={() => handleToggleStatus(st.status)}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <div
                              className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                                isChecked
                                  ? 'bg-purple-600 border-purple-500 text-white'
                                  : 'border-slate-700 bg-slate-950'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>

                            {/* Color circle */}
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: st.color }}
                            />

                            <span className="text-xs truncate font-medium text-slate-200">
                              {st.status}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1.5 shrink-0 pl-2">
                            <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-1.5 py-0.5 rounded-md border border-slate-800">
                              {st.count}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectOnlyThisStatus(st.status);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-purple-400 hover:underline px-1"
                              title="Ne voir que ce statut"
                            >
                              Seul
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {closedCount > 0 && (
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                      <button
                        onClick={() => {
                          setStatusMode('hide_closed');
                          setSelectedStatuses([]);
                          setIsStatusDropdownOpen(false);
                        }}
                        className="text-purple-400 hover:text-purple-300 font-semibold"
                      >
                        🚫 Masquer terminées ({closedCount})
                      </button>
                      <button
                        onClick={() => setIsStatusDropdownOpen(false)}
                        className="text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800"
                      >
                        Fermer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Group: Date Filter Pills + View Mode Switcher */}
          <div className="flex items-center flex-wrap gap-2">
            
            {/* Date Filter Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              <button
                onClick={() => setDateFilter('all')}
                className={`px-2.5 py-1 rounded-full font-semibold transition-colors ${
                  dateFilter === 'all'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Toutes dates
              </button>

              {overdueCount > 0 && (
                <button
                  onClick={() => setDateFilter('overdue')}
                  className={`px-2.5 py-1 rounded-full font-semibold transition-colors flex items-center space-x-1.5 ${
                    dateFilter === 'overdue'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-red-950/40 text-red-400 hover:bg-red-950/70 border border-red-800/50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span>En retard ({overdueCount})</span>
                </button>
              )}

              {todayCount > 0 && (
                <button
                  onClick={() => setDateFilter('today')}
                  className={`px-2.5 py-1 rounded-full font-semibold transition-colors flex items-center space-x-1.5 ${
                    dateFilter === 'today'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-amber-950/40 text-amber-300 hover:bg-amber-950/70 border border-amber-800/50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Aujourd'hui ({todayCount})</span>
                </button>
              )}
            </div>

            {/* View Mode Switcher: Cases / Bulles vs Liste */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-full border border-slate-800 shrink-0">
              <button
                onClick={() => handleSetViewMode('cards')}
                className={`px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1.5 transition-all ${
                  viewMode === 'cards'
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Affichage visuel en cases & bulles (optimisé mobile et tactile)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cases</span>
              </button>
              <button
                onClick={() => handleSetViewMode('list')}
                className={`px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1.5 transition-all ${
                  viewMode === 'list'
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Affichage en liste compacte"
              >
                <List className="w-3.5 h-3.5" />
                <span>Liste</span>
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* Table Headers only when in 'list' mode */}
      {viewMode === 'list' && (
        <div className="hidden lg:flex items-center justify-between px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          <div>Projet, Tâche & Livrable</div>
          <div className="flex items-center space-x-5">
            <div className="w-[105px] text-center">Échéance ⬆</div>
            <div className="w-[85px] text-center">Temps punché</div>
            <div className="w-[70px] text-center">Estimation</div>
            <div className="w-7 text-center">Assigné</div>
            <div className="w-16 text-center">Chrono</div>
          </div>
        </div>
      )}

      {/* Task List Content */}
      {isLoading ? (
        <div className="p-12 text-center space-y-3 bg-slate-900/40 rounded-2xl border border-slate-800/60">
          <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Chargement de votre load depuis ClickUp...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="p-12 text-center space-y-3 bg-slate-900/40 rounded-2xl border border-slate-800/60">
          {activeSearchQuery.trim() ? (
            <div className="space-y-3">
              <Search className="w-8 h-8 text-purple-400 mx-auto" />
              <div className="text-sm font-bold text-slate-200">
                Aucune tâche trouvée pour « {activeSearchQuery} »
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Aucun élément dans votre load ne correspond à ce numéro de projet ou mot-clé. Vérifiez l'orthographe ou le code projet (ex: 355_02, 100, etc.).
              </p>
              <button
                onClick={() => handleSearchChange('')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/30 inline-flex items-center space-x-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Effacer le filtre de recherche</span>
              </button>
            </div>
          ) : (
            <>
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <div className="text-sm font-bold text-slate-200">Aucune tâche pour ce filtre de statut</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {statusMode === 'hide_closed' && closedCount > 0
                  ? `Toutes vos tâches actuelles sont terminées (${closedCount} terminées masquées). Cliquez sur « Tous les statuts » ci-dessus pour les afficher.`
                  : 'Aucune tâche ne correspond à vos filtres sélectionnés.'}
              </p>
              {statusMode === 'hide_closed' && closedCount > 0 && (
                <button
                  onClick={() => setStatusMode('all')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/30"
                >
                  Afficher les {closedCount} tâches terminées
                </button>
              )}
            </>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              apiKey={apiKey}
              availableStatuses={availableStatuses}
              onUpdateTaskStatus={onUpdateTaskStatus}
              activeTimerTaskId={activeTimerTaskId}
              onOpenPunchModal={onOpenPunchModal}
              onStartLiveTimer={onStartLiveTimer}
              onStopLiveTimer={onStopLiveTimer}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2.5 sm:space-y-3">
          {filteredTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              apiKey={apiKey}
              availableStatuses={availableStatuses}
              onUpdateTaskStatus={onUpdateTaskStatus}
              activeTimerTaskId={activeTimerTaskId}
              onOpenPunchModal={onOpenPunchModal}
              onStartLiveTimer={onStartLiveTimer}
              onStopLiveTimer={onStopLiveTimer}
            />
          ))}
        </div>
      )}

    </div>
  );
};

