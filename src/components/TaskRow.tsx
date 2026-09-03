import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, 
  Square, 
  Clock, 
  Hourglass, 
  ExternalLink, 
  CornerDownRight, 
  Check, 
  Loader2,
  Calendar,
  AlertTriangle,
  Flame,
  ChevronDown
} from 'lucide-react';
import { ClickUpTask } from '../types';
import { ClickUpService } from '../services/clickupApi';
import { 
  formatDueDate, 
  formatTimeSpentOrEstimate, 
  formatProjectDisplay, 
  getProjectTheme 
} from '../utils/formatters';

interface TaskRowProps {
  task: ClickUpTask;
  activeTimerTaskId?: string;
  apiKey?: string;
  availableStatuses?: Array<{ status: string; color: string; type: string }>;
  onUpdateTaskStatus?: (taskId: string, newStatus: string) => Promise<void> | void;
  onOpenPunchModal: (task: ClickUpTask) => void;
  onStartLiveTimer: (taskId: string, taskName: string) => void;
  onStopLiveTimer: () => void;
}

export const TaskRow: React.FC<TaskRowProps> = ({
  task,
  activeTimerTaskId,
  apiKey,
  availableStatuses = [],
  onUpdateTaskStatus,
  onOpenPunchModal,
  onStartLiveTimer,
  onStopLiveTimer,
}) => {
  const isRunning = activeTimerTaskId === task.id;
  const dueDateInfo = formatDueDate(task.due_date);
  const timeSpentFormatted = formatTimeSpentOrEstimate(task.time_spent);
  const timeEstimateFormatted = formatTimeSpentOrEstimate(task.time_estimate);

  // Status state with optimistic updates
  const [currentStatus, setCurrentStatus] = useState(task.status);
  const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [listStatuses, setListStatuses] = useState<Array<{ status: string; color: string; type: string }>>([]);
  const statusPickerRef = useRef<HTMLDivElement>(null);

  // Sync if task prop changes externally
  useEffect(() => {
    setCurrentStatus(task.status);
  }, [task.status]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isStatusPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (statusPickerRef.current && !statusPickerRef.current.contains(e.target as Node)) {
        setIsStatusPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isStatusPickerOpen]);

  // Load configured statuses for the task's list when status picker opens
  useEffect(() => {
    if (!isStatusPickerOpen || !apiKey || !task.list?.id) return;

    let isMounted = true;
    ClickUpService.getListStatuses(apiKey, task.list.id).then((statuses) => {
      if (isMounted && statuses && statuses.length > 0) {
        setListStatuses(statuses);
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [isStatusPickerOpen, apiKey, task.list?.id]);

  // Status color or default
  const statusColor = currentStatus?.color || '#a855f7';
  const statusName = currentStatus?.status?.toLowerCase() || '';
  const isClosed = 
    currentStatus?.type === 'closed' || 
    statusName === 'closed' || 
    statusName === 'complete' || 
    statusName === 'terminé' || 
    statusName === 'done';

  const statusesToShow = useMemo(() => {
    if (listStatuses.length > 0) return listStatuses;
    if (availableStatuses.length > 0) {
      return availableStatuses.map(s => ({ status: s.status, color: s.color, type: s.type }));
    }
    return [
      { status: 'to do', color: '#87909e', type: 'open' },
      { status: 'in progress', color: '#a855f7', type: 'custom' },
      { status: 'review', color: '#f59e0b', type: 'custom' },
      { status: 'complete', color: '#10b981', type: 'closed' },
      { status: 'closed', color: '#6b7280', type: 'closed' },
    ];
  }, [listStatuses, availableStatuses]);

  const handleSelectStatus = async (statusItem: { status: string; color: string; type: string }) => {
    if (isUpdatingStatus) return;
    
    setIsStatusPickerOpen(false);
    const prevStatus = currentStatus;
    setCurrentStatus({
      status: statusItem.status,
      color: statusItem.color,
      type: statusItem.type,
    });
    setIsUpdatingStatus(true);

    try {
      if (onUpdateTaskStatus) {
        await onUpdateTaskStatus(task.id, statusItem.status);
      } else if (apiKey) {
        await ClickUpService.updateTaskStatus(apiKey, task.id, statusItem.status);
      }
    } catch (err) {
      console.error('Erreur lors du changement de statut:', err);
      setCurrentStatus(prevStatus);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Extract project information prominently
  const rawProjectName = task.folder?.name || task.list?.name || '';
  const projectFormatted = formatProjectDisplay(rawProjectName, task.projectCode);
  const projectIdentifier = projectFormatted.code || projectFormatted.displayName || rawProjectName || 'PROJET';
  const projectTheme = getProjectTheme(projectIdentifier);

  // Parent deliverable name if subtask
  const parentName = task.parentName || (task.parent ? ClickUpService.getParentName(typeof task.parent === 'string' ? task.parent : (task.parent as any)?.id) : null);

  return (
    <div className={`group relative flex flex-col lg:flex-row lg:items-center justify-between p-3.5 sm:p-4 rounded-2xl border transition-all duration-150 overflow-hidden shadow-sm hover:shadow-md ${
      isRunning
        ? 'bg-purple-950/40 border-purple-500/80 shadow-purple-950/40 ring-1 ring-purple-500/50'
        : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800/90 hover:border-slate-700'
    }`}>
      
      {/* Left colored vertical indicator strip linked to project theme */}
      <div 
        className={`absolute left-0 top-0 bottom-0 w-1 sm:w-1.5 ${isRunning ? 'bg-purple-500 animate-pulse' : projectTheme.accentBar}`} 
        title={`Projet : ${projectFormatted.fullName || projectIdentifier}`}
      />

      {/* Main Content Area: Project Badge (Glanceable) + Task Title + Parent Deliverable + Status */}
      <div className="flex-1 min-w-0 pl-2 sm:pl-2.5 space-y-2">
        
        {/* ROW 1: UNIFIED COLORED PROJECT BUBBLE (Distinct color per project, client & project number + project name inside) */}
        <div className="flex items-center flex-wrap gap-2">
          
          <div 
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-xl text-xs font-semibold border shadow-sm max-w-full ${projectTheme.badgeBg} ${projectTheme.badgeBorder} ${projectTheme.badgeText}`}
            title={`Projet : ${projectFormatted.fullName || projectIdentifier}`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${projectTheme.dotBg}`} />
            {projectFormatted.code && (
              <span className="font-mono font-bold tracking-wider shrink-0">
                {projectFormatted.code}
              </span>
            )}
            {projectFormatted.code && projectFormatted.displayName && (
              <span className="opacity-40 select-none shrink-0">•</span>
            )}
            {projectFormatted.displayName && (
              <span className="font-semibold tracking-tight truncate max-w-[260px] sm:max-w-md lg:max-w-xl">
                {projectFormatted.displayName}
              </span>
            )}
            {!projectFormatted.code && !projectFormatted.displayName && (
              <span className="font-bold tracking-tight">Projet</span>
            )}
          </div>

          {/* ClickUp External Direct Link */}
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded-lg text-slate-500 hover:text-purple-300 hover:bg-slate-800 transition-colors ml-auto lg:ml-0 shrink-0"
            title="Ouvrir directement dans ClickUp"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* ROW 2: TASK TITLE (HERO) + COMPACT COLORED STATUS CIRCLE */}
        <div className="flex items-start gap-2.5 pt-0.5">
          
          {/* Status Colored Circle (Click to view or change status) */}
          <div className="relative shrink-0 pt-1" ref={statusPickerRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsStatusPickerOpen((prev) => !prev);
              }}
              disabled={isUpdatingStatus}
              className="relative w-4 h-4 rounded-full flex items-center justify-center transition-all hover:scale-125 active:scale-95 focus:outline-none focus:ring-2 focus:ring-purple-400/50 shadow-sm"
              style={{
                backgroundColor: isClosed ? statusColor : `${statusColor}28`,
                borderColor: statusColor,
                borderWidth: '2px',
                borderStyle: 'solid',
              }}
              title={`Statut : ${currentStatus?.status || 'Ouvert'} (Cliquer pour afficher ou changer)`}
            >
              {isUpdatingStatus ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin text-white" />
              ) : isClosed ? (
                <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3.5]" />
              ) : (
                <span 
                  className="w-1.5 h-1.5 rounded-full" 
                  style={{ backgroundColor: statusColor }}
                />
              )}
            </button>

            {/* Status Dropdown Menu */}
            {isStatusPickerOpen && (
              <div className="absolute left-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5 space-y-1 ring-1 ring-white/10 animate-fadeIn">
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between">
                  <span>Statut</span>
                  <span 
                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase border"
                    style={{
                      backgroundColor: `${statusColor}20`,
                      borderColor: `${statusColor}60`,
                      color: statusColor,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                    <span>{currentStatus?.status || 'Statut'}</span>
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {statusesToShow.map((st) => {
                    const isCurrent = currentStatus?.status?.toLowerCase() === st.status.toLowerCase();
                    return (
                      <button
                        key={st.status}
                        type="button"
                        onClick={() => handleSelectStatus(st)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors text-left ${
                          isCurrent
                            ? 'bg-purple-950/80 text-purple-200 border border-purple-800/60'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0 border" 
                            style={{ 
                              backgroundColor: st.color || '#a855f7',
                              borderColor: `${st.color || '#a855f7'}aa` 
                            }} 
                          />
                          <span className="truncate uppercase text-[11px] tracking-wide font-medium">
                            {st.status}
                          </span>
                        </div>
                        {isCurrent && (
                          <Check className="w-3.5 h-3.5 text-purple-400 shrink-0 ml-1.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Task Name (Bold, High Contrast, Clickable to punch) */}
          <div className="min-w-0 flex-1">
            <h3 
              onClick={() => onOpenPunchModal(task)}
              className="font-bold text-[15px] sm:text-[16px] text-white hover:text-purple-300 transition-colors tracking-tight leading-snug cursor-pointer"
              title="Cliquer pour voir les détails ou puncher du temps"
            >
              {task.name}
            </h3>

            {/* ROW 3: PARENT DELIVERABLE (Subtle, clear branch) */}
            {parentName && (
              <div className="mt-1 inline-flex items-center space-x-1.5 text-xs text-slate-400 font-normal">
                <CornerDownRight className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-slate-500 font-mono text-[11px]">Livrable :</span>
                <span className="text-purple-200 font-medium truncate max-w-sm sm:max-w-md">
                  {parentName}
                </span>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Right side / Bottom Bar on mobile: Due Date | Time Tracked | Time Estimate | Assignee | Action */}
      <div className="flex items-center justify-between lg:justify-end gap-3 sm:gap-4 lg:gap-5 mt-3 lg:mt-0 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-slate-800/70 pl-2 lg:pl-4 shrink-0">
        
        {/* Due date column with clear visual pill */}
        <div className="shrink-0">
          {task.due_date ? (
            <span 
              className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center space-x-1.5 border ${
                dueDateInfo.isOverdue
                  ? 'bg-red-950/70 text-red-300 border-red-800/70'
                  : dueDateInfo.isToday
                  ? 'bg-amber-950/70 text-amber-300 border-amber-800/70 font-bold'
                  : 'bg-slate-950/90 text-slate-300 border-slate-800'
              }`}
              title="Date d'échéance de livraison"
            >
              {dueDateInfo.isOverdue ? (
                <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
              ) : dueDateInfo.isToday ? (
                <Flame className="w-3 h-3 text-amber-400 shrink-0" />
              ) : (
                <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
              )}
              <span>{dueDateInfo.label}</span>
            </span>
          ) : (
            <span className="text-xs text-slate-500 font-mono">
              Sans date
            </span>
          )}
        </div>

        {/* Time Tracked */}
        <div className="text-right shrink-0">
          <button
            onClick={() => onOpenPunchModal(task)}
            className={`inline-flex items-center space-x-1.5 text-xs py-1 px-2.5 rounded-xl border transition-colors ${
              isRunning
                ? 'bg-purple-600 text-white font-bold animate-pulse border-purple-500 shadow-md shadow-purple-600/30'
                : timeSpentFormatted
                ? 'bg-slate-950/90 text-slate-200 hover:text-purple-300 border-slate-800 hover:border-slate-700'
                : 'bg-slate-950/60 text-slate-400 hover:text-purple-300 border-slate-800/80 hover:border-slate-700'
            }`}
            title="Temps punché - Cliquez pour ajuster ou puncher"
          >
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-mono font-medium">{timeSpentFormatted || '0m'}</span>
          </button>
        </div>

        {/* Time Estimate */}
        <div className="text-right hidden sm:block shrink-0">
          {timeEstimateFormatted ? (
            <div className="inline-flex items-center space-x-1 text-xs text-slate-400 font-mono px-2 py-0.5 rounded-lg bg-slate-950/60 border border-slate-800/60" title="Temps estimé">
              <Hourglass className="w-3 h-3 text-slate-500" />
              <span>{timeEstimateFormatted}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-600 font-mono">—</span>
          )}
        </div>

        {/* Assignee Avatar */}
        <div className="shrink-0">
          {task.assignees && task.assignees[0] ? (
            task.assignees[0].profilePicture ? (
              <img
                src={task.assignees[0].profilePicture}
                alt={task.assignees[0].username}
                className="w-7 h-7 rounded-full border border-slate-700 object-cover shadow-sm"
                title={`Assigné à : ${task.assignees[0].username}`}
              />
            ) : (
              <div 
                className="w-7 h-7 rounded-full bg-purple-900 border border-purple-700 text-purple-200 text-xs font-bold flex items-center justify-center shadow-sm"
                title={`Assigné à : ${task.assignees[0].username}`}
              >
                {task.assignees[0].initials || task.assignees[0].username?.slice(0, 2).toUpperCase() || 'U'}
              </div>
            )
          ) : (
            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-slate-500 text-xs flex items-center justify-center">
              —
            </div>
          )}
        </div>

        {/* Start / Stop Live Chrono Button */}
        <div className="shrink-0">
          <button
            onClick={() => {
              if (isRunning) {
                onStopLiveTimer();
              } else {
                onStartLiveTimer(task.id, task.name);
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-md active:scale-95 ${
              isRunning
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 animate-pulse'
                : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30'
            }`}
            title={isRunning ? 'Arrêter le chrono en cours' : 'Démarrer le chrono en temps réel'}
          >
            {isRunning ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="hidden sm:inline">Chrono</span>
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
};
