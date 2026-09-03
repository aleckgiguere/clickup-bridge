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
import { formatDueDate, formatTimeSpentOrEstimate, formatProjectDisplay, getProjectTheme } from '../utils/formatters';

interface TaskCardProps {
  task: ClickUpTask;
  activeTimerTaskId?: string;
  apiKey?: string;
  availableStatuses?: Array<{ status: string; color: string; type: string }>;
  onUpdateTaskStatus?: (taskId: string, newStatus: string) => Promise<void> | void;
  onOpenPunchModal: (task: ClickUpTask) => void;
  onStartLiveTimer: (taskId: string, taskName: string) => void;
  onStopLiveTimer: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
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

  useEffect(() => {
    setCurrentStatus(task.status);
  }, [task.status]);

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

  useEffect(() => {
    if (!isStatusPickerOpen || !apiKey || !task.list?.id) return;
    let isMounted = true;
    ClickUpService.getListStatuses(apiKey, task.list.id).then((statuses) => {
      if (isMounted && statuses && statuses.length > 0) {
        setListStatuses(statuses);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [isStatusPickerOpen, apiKey, task.list?.id]);

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

  // Determine Project Code & Project Name & distinct theme
  const rawProjectName = task.folder?.name || task.list?.name || '';
  const projectFormatted = formatProjectDisplay(rawProjectName, task.projectCode);
  const projectIdentifier = projectFormatted.code || projectFormatted.displayName || rawProjectName || 'PROJET';
  const projectTheme = getProjectTheme(projectIdentifier);
  const parentName = task.parentName || (task.parent ? ClickUpService.getParentName(typeof task.parent === 'string' ? task.parent : (task.parent as any)?.id) : null);

  return (
    <div 
      className={`relative flex flex-col justify-between rounded-2xl p-4 transition-all duration-200 border shadow-md hover:shadow-xl group backdrop-blur-sm ${
        isRunning
          ? 'bg-purple-950/40 border-purple-500/80 ring-2 ring-purple-500/60 shadow-purple-950/40'
          : 'bg-slate-900/85 hover:bg-slate-900 border-slate-800/90 hover:border-purple-500/40'
      }`}
    >
      {/* Top glowing line if active timer */}
      {isRunning && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-600 rounded-t-2xl animate-pulse" />
      )}

      {/* Top Header: Unified Colored Project Bubble + ClickUp Direct Link */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          
          <div 
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border shadow-sm max-w-[85%] ${projectTheme.badgeBg} ${projectTheme.badgeBorder} ${projectTheme.badgeText}`}
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
              <span className="font-semibold tracking-tight truncate">
                {projectFormatted.displayName}
              </span>
            )}
            {!projectFormatted.code && !projectFormatted.displayName && (
              <span className="font-bold tracking-tight">Projet</span>
            )}
          </div>

          {/* Direct ClickUp Open Link */}
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-purple-300 transition-colors shrink-0"
            title="Ouvrir directement dans ClickUp"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Task Title + Compact Status Circle */}
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

            {/* Status Dropdown Picker */}
            {isStatusPickerOpen && (
              <div className="absolute left-0 top-full mt-2 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5 space-y-1 ring-1 ring-white/10 animate-fadeIn">
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
                <div className="max-h-52 overflow-y-auto space-y-0.5">
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

          <div className="min-w-0 flex-1">
            <h3 
              onClick={() => onOpenPunchModal(task)}
              className="font-bold text-[15px] sm:text-[16px] text-white group-hover:text-purple-200 transition-colors leading-snug cursor-pointer tracking-tight line-clamp-2"
              title={task.name}
            >
              {task.name}
            </h3>

            {/* Parent Deliverable (if subtask) */}
            {parentName && (
              <div className="mt-1.5 inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-slate-950/90 border border-slate-800/80 text-xs text-slate-300 max-w-full">
                <CornerDownRight className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="text-slate-400 text-[11px] shrink-0 font-mono">Livrable :</span>
                <span className="font-semibold text-purple-200 truncate">{parentName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Visual Pill Badges Row: Date | Temps | Estimation */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {/* Due Date Bulle */}
          {task.due_date ? (
            <span 
              className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center space-x-1.5 border ${
                dueDateInfo.isOverdue
                  ? 'bg-red-950/60 text-red-300 border-red-800/60'
                  : dueDateInfo.isToday
                  ? 'bg-amber-950/60 text-amber-300 border-amber-800/60 font-bold'
                  : 'bg-slate-950/80 text-slate-300 border-slate-800'
              }`}
              title="Date de livraison (Due Date)"
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
            <span className="px-2 py-0.5 rounded-full bg-slate-950/60 border border-slate-800/60 text-[11px] text-slate-500">
              Sans date
            </span>
          )}

          {/* Time spent pill */}
          {timeSpentFormatted && (
            <span className="px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-800 text-xs font-mono font-medium text-slate-300 inline-flex items-center space-x-1">
              <Clock className="w-3 h-3 text-purple-400" />
              <span>{timeSpentFormatted}</span>
            </span>
          )}

          {/* Time estimate pill */}
          {timeEstimateFormatted && (
            <span className="px-2 py-0.5 rounded-full bg-slate-950/60 border border-slate-800 text-[11px] font-mono text-slate-400 inline-flex items-center space-x-1">
              <Hourglass className="w-2.5 h-2.5 text-slate-500" />
              <span>Est. {timeEstimateFormatted}</span>
            </span>
          )}
        </div>
      </div>

      {/* Bottom Footer: Touch-Friendly Mobile Action Bar */}
      <div className="pt-3.5 mt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
        
        {/* Assignee Avatar */}
        <div className="shrink-0 flex items-center space-x-1.5">
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
          {task.assignees && task.assignees[0] && (
            <span className="text-xs text-slate-400 truncate max-w-[80px] hidden xs:inline font-medium">
              {task.assignees[0].username.split(' ')[0]}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-1.5">
          
          {/* Quick Punch Modal Button */}
          <button
            onClick={() => onOpenPunchModal(task)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-colors flex items-center space-x-1"
            title="Puncher des heures ou ajuster l'horaire"
          >
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Puncher</span>
          </button>

          {/* Start / Stop Live Chrono Button */}
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
                <span>Chrono</span>
              </>
            )}
          </button>

        </div>

      </div>

    </div>
  );
};
