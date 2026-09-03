import React, { useState, useEffect } from 'react';
import { ClickUpProjectItem, ClickUpTask, ClickUpUser } from '../types';
import { ClickUpService } from '../services/clickupApi';
import { TaskRow } from './TaskRow';
import { TaskCard } from './TaskCard';
import { formatProjectDisplay, matchTaskSearch } from '../utils/formatters';
import { 
  Folder, 
  ExternalLink, 
  CheckCircle2, 
  User, 
  Users, 
  RefreshCw, 
  ArrowLeft,
  Search,
  X,
  LayoutGrid,
  List
} from 'lucide-react';

interface ProjectDetailViewProps {
  apiKey: string;
  project: ClickUpProjectItem;
  currentUser: ClickUpUser | null;
  activeTimerTaskId?: string;
  onOpenPunchModal: (task: ClickUpTask) => void;
  onStartLiveTimer: (taskId: string, taskName: string) => void;
  onStopLiveTimer: () => void;
  onBackToAssigned: () => void;
}

const STORAGE_VIEW_MODE_KEY = 'clickbridge_tasks_view_mode';

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
  apiKey,
  project,
  currentUser,
  activeTimerTaskId,
  onOpenPunchModal,
  onStartLiveTimer,
  onStopLiveTimer,
  onBackToAssigned,
}) => {
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [onlyMyTasks, setOnlyMyTasks] = useState(true);
  const [taskFilterInput, setTaskFilterInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // View Mode: 'list' (default) or 'cards'
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    const saved = localStorage.getItem(STORAGE_VIEW_MODE_KEY);
    return saved === 'cards' ? 'cards' : 'list';
  });

  const handleSetViewMode = (mode: 'cards' | 'list') => {
    setViewMode(mode);
    localStorage.setItem(STORAGE_VIEW_MODE_KEY, mode);
  };

  const fetchProjectTasks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedTasks = await ClickUpService.getTasksForProject(
        apiKey,
        project,
        onlyMyTasks && currentUser ? currentUser.id : undefined
      );
      setTasks(fetchedTasks);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Impossible de charger les tâches de ce projet.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectTasks();
  }, [project.id, onlyMyTasks]);

  // Filter tasks with keyword query
  const filteredTasks = tasks.filter((t) => {
    return matchTaskSearch(t, taskFilterInput);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      
      {/* Back button & Breadcrumb header */}
      <div className="flex items-center space-x-2">
        <button
          onClick={onBackToAssigned}
          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>← Retour à Mon Load (Assignées)</span>
        </button>
      </div>

      {/* Project Header Banner */}
      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {(() => {
            const display = formatProjectDisplay(project.name, project.code);
            return (
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  {display.code && (
                    <span className="px-2 py-0.5 rounded-md bg-purple-950 text-purple-300 border border-purple-800/60 font-mono text-xs font-bold">
                      {display.code}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 font-medium">
                    {project.spaceName} / {project.type === 'folder' ? 'Dossier' : 'Liste'}
                  </span>
                </div>
                
                <h1 className="text-xl font-bold text-white flex items-center space-x-2">
                  <span>{display.displayName}</span>
                </h1>
              </div>
            );
          })()}

          {/* Actions & Filters */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Toggle Only My Tasks */}
            <button
              onClick={() => setOnlyMyTasks(!onlyMyTasks)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors border ${
                onlyMyTasks
                  ? 'bg-purple-950/60 border-purple-600 text-purple-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {onlyMyTasks ? <User className="w-3.5 h-3.5 text-purple-400" /> : <Users className="w-3.5 h-3.5" />}
              <span>{onlyMyTasks ? 'Mes tâches' : 'Toutes les tâches'}</span>
            </button>

            {/* ClickUp Link */}
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-purple-300 rounded-xl transition-colors"
              title="Ouvrir ce projet dans ClickUp"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            {/* Refresh */}
            <button
              onClick={fetchProjectTasks}
              className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
              title="Actualiser les tâches du projet"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
            </button>
          </div>

        </div>

        {/* Instant Task Filter inside this Project + View Mode Switcher */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="relative w-full max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrer une tâche dans ce projet (ex: V01, Capsule #1, Montage)..."
              value={taskFilterInput}
              onChange={(e) => setTaskFilterInput(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            {taskFilterInput && (
              <button
                onClick={() => setTaskFilterInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3 shrink-0 justify-between sm:justify-end">
            <div className="text-xs text-slate-400 font-mono">
              {filteredTasks.length} tâche{filteredTasks.length > 1 ? 's' : ''}
            </div>

            {/* View Switcher: Cases vs Liste */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-full border border-slate-800 shrink-0">
              <button
                onClick={() => handleSetViewMode('cards')}
                className={`px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1.5 transition-all ${
                  viewMode === 'cards'
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Affichage visuel en cases & bulles"
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

      {/* Table Headers (only in list mode) */}
      {viewMode === 'list' && (
        <div className="hidden md:flex items-center justify-between px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          <div>Tâche</div>
          <div className="flex items-center space-x-7">
            <div className="w-[85px] text-right">Livrable (Due date ⬆)</div>
            <div className="w-[80px] text-right">Temps punché</div>
            <div className="w-[70px] text-right">Estimation</div>
            <div className="w-6 text-center">Assigné</div>
            <div className="w-7 text-center">Chrono</div>
          </div>
        </div>
      )}

      {/* Task List */}
      {isLoading ? (
        <div className="p-12 text-center space-y-3 bg-slate-900/40 rounded-2xl border border-slate-800/60">
          <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Chargement des tâches du projet...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-red-950/30 border border-red-800/50 rounded-2xl text-red-300 text-xs">
          {error}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="p-12 text-center space-y-3 bg-slate-900/40 rounded-2xl border border-slate-800/60">
          <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto" />
          <div className="text-sm font-bold text-slate-200">
            {onlyMyTasks ? 'Aucune tâche ne vous est assignée sur ce projet' : 'Aucune tâche dans ce projet'}
          </div>
          {onlyMyTasks && (
            <button
              onClick={() => setOnlyMyTasks(false)}
              className="text-xs text-purple-400 hover:text-purple-300 underline mt-1 block mx-auto"
            >
              Afficher toutes les tâches du projet
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              apiKey={apiKey}
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
