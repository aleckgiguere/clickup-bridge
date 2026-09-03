import React, { useState, useEffect, useMemo } from 'react';
import { 
  MessageSquare, 
  Send, 
  RefreshCw, 
  ExternalLink, 
  Search, 
  Hash, 
  Clock, 
  Layers, 
  Check, 
  ArrowLeft,
  Folder,
  ChevronRight,
  Sparkles,
  Users,
  Play,
  CornerDownRight,
  ArrowUpRight
} from 'lucide-react';
import { ClickUpTask, ClickUpComment, ClickUpProjectItem, ClickUpUser } from '../types';
import { ClickUpService } from '../services/clickupApi';
import { formatDueDate, formatTimeSpentOrEstimate, formatProjectDisplay } from '../utils/formatters';

interface DiscussionsViewProps {
  apiKey: string;
  currentUser: ClickUpUser | null;
  tasks: ClickUpTask[];
  projects: ClickUpProjectItem[];
  selectedTaskForChat?: ClickUpTask | null;
  onOpenTaskPunch?: (task: ClickUpTask) => void;
  onSelectProject?: (project: ClickUpProjectItem) => void;
  onBackToLoad: () => void;
}

const STORAGE_CHANNELS_ACTIVITY_KEY = 'clickbridge_channels_last_activity_map';

export const DiscussionsView: React.FC<DiscussionsViewProps> = ({
  apiKey,
  currentUser,
  tasks,
  projects,
  selectedTaskForChat,
  onOpenTaskPunch,
  onSelectProject,
  onBackToLoad,
}) => {
  // Map of project ID -> latest message/activity timestamp (in ms)
  const [projectActivityMap, setProjectActivityMap] = useState<Record<string, { timestamp: number; snippet?: string }>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CHANNELS_ACTIVITY_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // Calculate base activity from tasks' date_updated (ClickUp updates task date_updated on comments)
  const getProjectTaskLatestUpdate = (projectId: string, projectCode: string, projectName: string): number => {
    let latest = 0;
    for (const t of tasks) {
      const matchFolder = t.folder?.id === projectId || t.folder?.name === projectName;
      const matchList = t.list?.id === projectId || t.list?.name === projectName;
      const matchCode = projectCode && (t.folder?.name?.includes(projectCode) || t.list?.name?.includes(projectCode));
      
      if (matchFolder || matchList || matchCode) {
        const updateTs = Number(t.date_updated || t.date_created || 0);
        if (updateTs > latest) latest = updateTs;
      }
    }
    return latest;
  };

  // Selected project channel
  const [selectedProject, setSelectedProject] = useState<ClickUpProjectItem | null>(() => {
    if (selectedTaskForChat) {
      const p = projects.find(
        proj => proj.id === selectedTaskForChat.folder?.id || proj.id === selectedTaskForChat.list?.id || proj.name === selectedTaskForChat.folder?.name
      );
      if (p) return p;
    }
    return projects[0] || null;
  });

  const [selectedSubThreadTask, setSelectedSubThreadTask] = useState<ClickUpTask | null>(selectedTaskForChat || null);
  const [projectTasks, setProjectTasks] = useState<ClickUpTask[]>([]);
  const [comments, setComments] = useState<ClickUpComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  // Sync when prop changes
  useEffect(() => {
    if (selectedTaskForChat) {
      const matchProj = projects.find(
        p => p.id === selectedTaskForChat.folder?.id || p.id === selectedTaskForChat.list?.id || p.name === selectedTaskForChat.folder?.name
      );
      if (matchProj) {
        setSelectedProject(matchProj);
      }
      setSelectedSubThreadTask(selectedTaskForChat);
      setIsMobileChatOpen(true);
    } else if (!selectedProject && projects.length > 0) {
      setSelectedProject(projects[0]);
    }
  }, [selectedTaskForChat, projects]);

  // Load project tasks and comments when selected project changes
  useEffect(() => {
    if (!selectedProject || !apiKey) return;

    let isMounted = true;
    setIsLoadingComments(true);

    const fetchChannelData = async () => {
      try {
        // 1. Fetch tasks for this project to display sub-threads / deliverable discussions
        const fetchedTasks = await ClickUpService.getTasksForProject(apiKey, selectedProject);
        if (!isMounted) return;
        setProjectTasks(fetchedTasks);

        // 2. Fetch comments: if a sub-task is selected, fetch its comments. Else fetch comments from the project's primary list/tasks
        let fetchedComments: ClickUpComment[] = [];

        if (selectedSubThreadTask) {
          fetchedComments = await ClickUpService.getTaskComments(apiKey, selectedSubThreadTask.id);
        } else if (fetchedTasks.length > 0) {
          // Fetch comments from the top tasks of this project channel
          const commentsPromises = fetchedTasks.slice(0, 5).map(async (t) => {
            try {
              const cList = await ClickUpService.getTaskComments(apiKey, t.id);
              return cList.map(c => ({
                ...c,
                taskName: t.name,
                parentName: t.parentName || (t.parent ? ClickUpService.getParentName(typeof t.parent === 'string' ? t.parent : (t.parent as any)?.id) : undefined)
              }));
            } catch {
              return [];
            }
          });

          const results = await Promise.all(commentsPromises);
          fetchedComments = results.flat().sort((a, b) => Number(a.date) - Number(b.date));
        }

        if (isMounted) {
          setComments(fetchedComments);

          // Update channel latest message timestamp if comments found
          if (fetchedComments.length > 0) {
            const lastComment = fetchedComments[fetchedComments.length - 1];
            const lastTs = Number(lastComment.date);
            if (lastTs > 0) {
              setProjectActivityMap((prev) => {
                const next = {
                  ...prev,
                  [selectedProject.id]: {
                    timestamp: lastTs,
                    snippet: lastComment.comment_text?.slice(0, 60),
                  },
                };
                try {
                  localStorage.setItem(STORAGE_CHANNELS_ACTIVITY_KEY, JSON.stringify(next));
                } catch {}
                return next;
              });
            }
          }
        }
      } catch (err) {
        console.warn('Error loading channel discussion:', err);
      } finally {
        if (isMounted) {
          setIsLoadingComments(false);
        }
      }
    };

    fetchChannelData();

    return () => {
      isMounted = false;
    };
  }, [selectedProject?.id, selectedSubThreadTask?.id, apiKey]);

  // Send a comment to the project channel or subtask
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || isSending || !selectedProject) return;

    setIsSending(true);
    const textToSend = newCommentText.trim();
    const nowTs = Date.now();

    try {
      // Determine target task to attach comment
      const targetTask = selectedSubThreadTask || projectTasks[0] || tasks.find(t => t.folder?.id === selectedProject.id || t.list?.id === selectedProject.id);

      if (targetTask) {
        await ClickUpService.postTaskComment(apiKey, targetTask.id, textToSend);
      } else if (selectedProject.type === 'list') {
        await ClickUpService.postListComment(apiKey, selectedProject.id, textToSend);
      }

      // Optimistic addition to feed
      const newComment: ClickUpComment = {
        id: 'opt_' + nowTs,
        comment_text: textToSend,
        user: currentUser || { id: 0, username: 'Moi', email: '' },
        date: nowTs,
        taskId: targetTask?.id,
        taskName: targetTask?.name,
      };

      setComments(prev => [...prev, newComment]);
      setNewCommentText('');
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2000);

      // Instantly bump project to the very top of discussions channels
      setProjectActivityMap((prev) => {
        const next = {
          ...prev,
          [selectedProject.id]: {
            timestamp: nowTs,
            snippet: textToSend.slice(0, 60),
          },
        };
        try {
          localStorage.setItem(STORAGE_CHANNELS_ACTIVITY_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (err) {
      console.error('Failed to post comment to channel:', err);
      alert('Impossible d\'envoyer le message sur ClickUp. Veuillez vérifier votre connexion.');
    } finally {
      setIsSending(false);
    }
  };

  // SORT CHANNELS EXACTLY LIKE CLICKUP:
  // Channels with the latest messages/comments received are displayed first at the top!
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const aMapTs = projectActivityMap[a.id]?.timestamp || 0;
      const bMapTs = projectActivityMap[b.id]?.timestamp || 0;
      const aTaskTs = getProjectTaskLatestUpdate(a.id, a.code, a.name);
      const bTaskTs = getProjectTaskLatestUpdate(b.id, b.code, b.name);

      const aActivity = Math.max(aMapTs, aTaskTs);
      const bActivity = Math.max(bMapTs, bTaskTs);

      if (bActivity !== aActivity) {
        return bActivity - aActivity; // Descending: latest messages first
      }
      return a.name.localeCompare(b.name);
    });
  }, [projects, projectActivityMap, tasks]);

  // Filter channels based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return sortedProjects;
    const q = searchQuery.toLowerCase();
    return sortedProjects.filter((p) => {
      const display = formatProjectDisplay(p.name, p.code);
      const name = (p.name || '').toLowerCase();
      const code = (p.code || '').toLowerCase();
      const spaceName = (p.spaceName || '').toLowerCase();
      const displayName = (display?.displayName || '').toLowerCase();
      return (
        name.includes(q) ||
        code.includes(q) ||
        spaceName.includes(q) ||
        displayName.includes(q)
      );
    });
  }, [sortedProjects, searchQuery]);

  // Format relative timestamp for messages
  const formatCommentDate = (dateVal: string | number) => {
    if (!dateVal) return '';
    const ts = Number(dateVal);
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');

    if (isToday) {
      return `Aujourd'hui à ${hours}:${mins}`;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Hier à ${hours}:${mins}`;
    }

    return `${date.getDate()} ${date.toLocaleString('fr-FR', { month: 'short' })} à ${hours}:${mins}`;
  };

  // Format concise timestamp for sidebar channel item (matching ClickUp Chat sidebar)
  const formatSidebarDate = (ts?: number) => {
    if (!ts || ts <= 0) return '';
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - ts;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'À l\'instant';
    if (diffMin < 60) return `${diffMin}m`;
    
    if (date.toDateString() === now.toDateString()) {
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Hier';
    }

    return `${date.getDate()} ${date.toLocaleString('fr-FR', { month: 'short' })}`;
  };

  // Folder color hash for visual variety matching ClickUp's colorful folder icons
  const getFolderColorClass = (code: string) => {
    const colors = [
      'text-emerald-400 border-emerald-800/60 bg-emerald-950/40',
      'text-blue-400 border-blue-800/60 bg-blue-950/40',
      'text-purple-400 border-purple-800/60 bg-purple-950/40',
      'text-red-400 border-red-800/60 bg-red-950/40',
      'text-amber-400 border-amber-800/60 bg-amber-950/40',
      'text-cyan-400 border-cyan-800/60 bg-cyan-950/40',
    ];
    let hash = 0;
    for (let i = 0; i < code.length; i++) hash += code.charCodeAt(i);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
      
      {/* Top Banner Navigation */}
      <div className="flex items-center justify-between bg-slate-900/80 p-3.5 px-4 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToLoad}
            className="p-2 text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors flex items-center space-x-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Retour à Mon Load</span>
          </button>
          
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-purple-400" />
              <span>Discussions des Projets (Canaux ClickUp)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Canaux triés par derniers messages reçus en haut, comme dans ClickUp.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Quick Access to Project in 1 Click */}
          {selectedProject && onSelectProject && (
            <button
              onClick={() => onSelectProject(selectedProject)}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/25 flex items-center space-x-1.5"
              title="Accéder aux tâches et livrables de ce projet en un seul clic"
            >
              <Folder className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Accéder au projet</span>
            </button>
          )}

          <button
            onClick={() => {
              if (selectedProject) {
                // Reload current project
                setIsLoadingComments(true);
                ClickUpService.getTasksForProject(apiKey, selectedProject, undefined, true).then((tList) => {
                  setProjectTasks(tList);
                  setIsLoadingComments(false);
                });
              }
            }}
            disabled={isLoadingComments}
            className="p-2 text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
            title="Rafraîchir les messages du canal"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingComments ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Layout: Left = Project Channels List | Right = Channel Chat Feed */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[calc(100vh-210px)] min-h-[550px]">
        
        {/* Left Column: Channels (Projets) Sidebar - Sorted by latest messages received */}
        <div className={`md:col-span-4 lg:col-span-4 flex flex-col bg-slate-900/90 rounded-2xl border border-slate-800 shadow-md overflow-hidden ${
          isMobileChatOpen ? 'hidden md:flex' : 'flex'
        }`}>
          
          {/* Channels Header & Search */}
          <div className="p-3.5 border-b border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                <Hash className="w-3.5 h-3.5 text-purple-400" />
                <span>Canaux ({filteredProjects.length})</span>
              </span>
              <span className="text-[10px] text-purple-300 bg-purple-950/70 border border-purple-800/40 px-1.5 py-0.5 rounded font-mono">
                Derniers messages en haut
              </span>
            </div>

            {/* Quick search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrer les canaux de projet..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all"
              />
            </div>
          </div>

          {/* Project Channels List (matching ClickUp's sidebar, latest messages on top) */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 p-2 space-y-1">
            {filteredProjects.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <Folder className="w-6 h-6 mx-auto text-slate-600 opacity-60" />
                <p>Aucun canal trouvé pour cette recherche.</p>
              </div>
            ) : (
              filteredProjects.map((project) => {
                const isSelected = selectedProject?.id === project.id;
                const colorBadge = getFolderColorClass(project.code);
                const display = formatProjectDisplay(project.name, project.code);

                const aMapTs = projectActivityMap[project.id]?.timestamp || 0;
                const aTaskTs = getProjectTaskLatestUpdate(project.id, project.code, project.name);
                const latestTs = Math.max(aMapTs, aTaskTs);
                const timeStr = formatSidebarDate(latestTs);

                return (
                  <div
                    key={project.id}
                    onClick={() => {
                      setSelectedProject(project);
                      setSelectedSubThreadTask(null);
                      setIsMobileChatOpen(true);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start space-x-2.5 group cursor-pointer relative ${
                      isSelected
                        ? 'bg-purple-950/60 border border-purple-800/70 text-purple-200 shadow-sm'
                        : 'hover:bg-slate-800/60 border border-transparent text-slate-300'
                    }`}
                  >
                    {/* Project Folder Icon with # indicator */}
                    <div className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${colorBadge}`}>
                      <Hash className="w-3.5 h-3.5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`font-bold text-xs truncate ${
                          isSelected ? 'text-white' : 'group-hover:text-white'
                        }`}>
                          #{display.displayName}
                        </span>

                        {/* Relative time of last message received */}
                        {timeStr && (
                          <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                            {timeStr}
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-400 truncate flex items-center space-x-1.5 mt-0.5">
                        <span className="font-semibold text-slate-500 truncate">{project.spaceName}</span>
                        {display.code && (
                          <>
                            <span>•</span>
                            <span className="text-purple-400 font-mono shrink-0">{display.code}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Quick Access to Project in 1 Click */}
                    {onSelectProject && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProject(project);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-purple-300 hover:bg-slate-800 rounded-lg transition-all shrink-0"
                        title="Accéder directement à ce projet"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                      isSelected ? 'text-purple-400 translate-x-0.5' : 'text-slate-600 group-hover:text-slate-400'
                    }`} />
                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* Right Column: Selected Project Channel Chat Panel */}
        <div className={`md:col-span-8 lg:col-span-8 flex flex-col bg-slate-900/90 rounded-2xl border border-slate-800 shadow-md overflow-hidden ${
          !isMobileChatOpen ? 'hidden md:flex' : 'flex'
        }`}>
          
          {selectedProject ? (
            <>
              {/* Channel Top Header with 1-Click Project Access */}
              {(() => {
                const display = formatProjectDisplay(selectedProject.name, selectedProject.code);
                return (
                  <div className="p-3.5 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                    
                    <div className="flex items-center space-x-3 min-w-0">
                      {/* Mobile Back Button */}
                      <button
                        onClick={() => setIsMobileChatOpen(false)}
                        className="md:hidden p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>

                      <div className={`p-2 rounded-xl border shrink-0 ${getFolderColorClass(selectedProject.code)}`}>
                        <Hash className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-white truncate flex items-center space-x-2">
                          <span>#{display.displayName}</span>
                        </h3>
                        <div className="text-[11px] text-slate-400 truncate flex items-center space-x-1.5">
                          <span>{selectedProject.spaceName}</span>
                          {display.code && (
                            <>
                              <span>•</span>
                              <span className="text-purple-300 font-mono font-bold">{display.code}</span>
                            </>
                          )}
                          {selectedSubThreadTask && (
                            <>
                              <span>•</span>
                              <span className="text-purple-400 font-semibold truncate">
                                Fil : {selectedSubThreadTask.name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions: 1-Click Project Access + ClickUp Link */}
                    <div className="flex items-center space-x-2 shrink-0">
                      {onSelectProject && (
                        <button
                          onClick={() => onSelectProject(selectedProject)}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/25 flex items-center space-x-1.5 shrink-0"
                          title="Accéder directement à toutes les tâches de ce projet"
                        >
                          <Folder className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Accéder au projet</span>
                        </button>
                      )}

                      <a
                        href={selectedProject.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-slate-400 hover:text-purple-300 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors text-xs font-semibold flex items-center space-x-1"
                        title="Ouvrir ce projet dans ClickUp"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline text-[11px]">ClickUp</span>
                      </a>
                    </div>

                  </div>
                );
              })()}

              {/* Sub-threads & Deliverables Pill Bar (if project has tasks) */}
              {projectTasks.length > 0 && (
                <div className="px-4 py-2 border-b border-slate-800/70 bg-slate-950/30 flex items-center space-x-2 overflow-x-auto text-xs">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider shrink-0 flex items-center space-x-1">
                    <Layers className="w-3 h-3 text-purple-400" />
                    <span>Livrables :</span>
                  </span>

                  <button
                    onClick={() => setSelectedSubThreadTask(null)}
                    className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors ${
                      selectedSubThreadTask === null
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    Tout le canal
                  </button>

                  {projectTasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedSubThreadTask(t)}
                      className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors truncate max-w-[200px] flex items-center space-x-1 ${
                        selectedSubThreadTask?.id === t.id
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                      title={t.name}
                    >
                      {t.parent && <CornerDownRight className="w-2.5 h-2.5 text-purple-300 shrink-0" />}
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Chat Message Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoadingComments ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-400">
                    <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs">Chargement de la discussion...</p>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-500 p-8 text-center">
                    <div className="p-3 bg-purple-950/30 rounded-2xl border border-purple-800/40 text-purple-400">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-slate-300">Aucun message pour le moment</div>
                      <p className="text-xs max-w-sm text-slate-400">
                        Soyez le premier à envoyer un message ou une note dans le canal <span className="text-purple-300 font-mono">#{selectedProject.name}</span>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {comments.map((comment) => {
                      const isMe = currentUser && (comment.user?.id === currentUser.id || comment.user?.username === currentUser.username);
                      const authorName = comment.user?.username || 'Utilisateur';

                      return (
                        <div
                          key={comment.id}
                          className={`flex items-start space-x-3 ${isMe ? 'flex-row-reverse space-x-reverse' : ''}`}
                        >
                          {/* User Avatar */}
                          <div className="shrink-0">
                            {comment.user?.profilePicture ? (
                              <img
                                src={comment.user.profilePicture}
                                alt={authorName}
                                className="w-8 h-8 rounded-full border border-slate-700 object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-purple-900 border border-purple-700 text-purple-200 text-xs font-bold flex items-center justify-center">
                                {authorName.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>

                          {/* Message Content Bubble */}
                          <div className={`max-w-[80%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                            
                            {/* Author Name + Time + Task Badge if any */}
                            <div className={`flex items-center space-x-2 text-[11px] ${isMe ? 'justify-end' : 'justify-start'}`}>
                              <span className="font-bold text-slate-300">{authorName}</span>
                              <span className="text-slate-500 font-mono">{formatCommentDate(comment.date)}</span>
                            </div>

                            {/* Task Context Tag if message belonged to a specific deliverable */}
                            {comment.taskName && (
                              <div className="text-[10px] text-purple-300 font-semibold flex items-center space-x-1 bg-purple-950/50 px-2 py-0.5 rounded-md border border-purple-800/40 w-fit">
                                <Layers className="w-2.5 h-2.5 text-purple-400" />
                                <span>{comment.taskName}</span>
                              </div>
                            )}

                            {/* Text Body */}
                            <div className={`p-3 rounded-2xl text-xs leading-relaxed break-words ${
                              isMe
                                ? 'bg-purple-600 text-white rounded-tr-none shadow-md shadow-purple-950/30'
                                : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700/60 shadow-sm'
                            }`}>
                              {comment.comment_text}
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Message Composer Footer */}
              <div className="p-3 bg-slate-950/70 border-t border-slate-800">
                <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder={`Envoyer un message dans #${selectedProject.name}...`}
                    className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all"
                    disabled={isSending}
                  />

                  <button
                    type="submit"
                    disabled={!newCommentText.trim() || isSending}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/30 flex items-center space-x-1.5 shrink-0"
                  >
                    {isSending ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : sendSuccess ? (
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Envoyer</span>
                  </button>
                </form>
              </div>

            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
              <Folder className="w-10 h-10 text-slate-600" />
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-slate-300">Sélectionnez un canal de projet</h4>
                <p className="text-xs">Choisissez un projet dans la colonne de gauche pour afficher les discussions.</p>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
