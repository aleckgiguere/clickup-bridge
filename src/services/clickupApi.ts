import { 
  ClickUpFolder, 
  ClickUpList, 
  ClickUpProjectItem, 
  ClickUpSpace, 
  ClickUpTask, 
  ClickUpUser, 
  ClickUpWorkspace,
  ClickUpComment
} from '../types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class ClickUpService {
  private static parentTaskNameCache: Map<string, string> = new Map();
  private static isParentCacheLoadedFromStorage = false;

  private static loadParentCacheFromStorage() {
    if (this.isParentCacheLoadedFromStorage) return;
    try {
      const stored = localStorage.getItem('clickbridge_parent_cache_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.trim()) {
            this.parentTaskNameCache.set(String(k).trim(), v.trim());
          }
        }
      }
    } catch {
      // Ignore localStorage error
    }
    this.isParentCacheLoadedFromStorage = true;
  }

  private static saveParentCacheToStorage() {
    try {
      const obj: Record<string, string> = {};
      this.parentTaskNameCache.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem('clickbridge_parent_cache_v1', JSON.stringify(obj));
    } catch {
      // Ignore storage quota
    }
  }

  /**
   * Retourne le nom de la tâche parente depuis le cache s'il existe
   */
  static getParentName(parentId: string | null | undefined): string | null {
    if (!parentId) return null;
    this.loadParentCacheFromStorage();
    const cleanId = String(parentId).replace(/^#/, '').trim();
    return this.parentTaskNameCache.get(cleanId) || null;
  }

  private static projectsCache: Map<string, CacheEntry<ClickUpProjectItem[]>> = new Map();
  private static projectTasksCache: Map<string, CacheEntry<ClickUpTask[]>> = new Map();
  private static commentsCache: Map<string, CacheEntry<ClickUpComment[]>> = new Map();

  private static delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  private static async request(endpoint: string, apiKey: string, options: RequestInit = {}): Promise<any> {
    const cleanToken = apiKey.trim().replace(/^Bearer\s+/i, '');
    
    let retries = 2;
    let delayMs = 1000;

    while (retries >= 0) {
      try {
        const res = await fetch(`/api/clickup${endpoint}`, {
          ...options,
          headers: {
            'x-clickup-token': cleanToken,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
        });

        if (res.status === 429) {
          console.warn(`ClickUp 429 Rate Limit hit on ${endpoint}. Retrying in ${delayMs}ms...`);
          if (retries > 0) {
            retries--;
            await this.delay(delayMs);
            delayMs *= 1.5;
            continue;
          }
          // If all retries failed on 429, don't crash everything, throw friendly message
          throw new Error('Limite de requêtes ClickUp atteinte (429). Veuillez patienter quelques secondes avant de rafraîchir.');
        }

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const errMsg = errorData.err || errorData.error || `Erreur ClickUp (${res.status})`;
          throw new Error(errMsg);
        }

        return await res.json();
      } catch (err: any) {
        if (err.message && err.message.includes('429') && retries > 0) {
          retries--;
          await this.delay(delayMs);
          delayMs *= 1.5;
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Récupère le profil de l'utilisateur connecté
   */
  static async getConnectedUser(apiKey: string): Promise<ClickUpUser> {
    const data = await this.request('/user', apiKey);
    return data.user;
  }

  /**
   * Récupère les workspaces / équipes
   */
  static async getWorkspaces(apiKey: string): Promise<ClickUpWorkspace[]> {
    const data = await this.request('/team', apiKey);
    return data.teams || [];
  }

  /**
   * Résout et attache les noms réels des tâches parentes pour toutes les sous-tâches (ex: "Capsules ambassadeur")
   */
  static async resolveParentTaskNames(apiKey: string, tasks: ClickUpTask[]): Promise<ClickUpTask[]> {
    this.loadParentCacheFromStorage();

    // 1. Enregistrer toutes les tâches déjà présentes dans la liste dans le cache
    for (const t of tasks) {
      if (t.id && t.name) {
        const cleanId = String(t.id).replace(/^#/, '').trim();
        this.parentTaskNameCache.set(cleanId, t.name.trim());
      }
    }

    // 2. Extraire les IDs de parents manquants
    const missingParentIds = new Set<string>();

    for (const t of tasks) {
      let parentId: string | null = null;
      let directParentName: string | null = null;

      if (t.parent) {
        if (typeof t.parent === 'string') {
          parentId = t.parent.replace(/^#/, '').trim();
        } else if (typeof t.parent === 'object' && t.parent !== null) {
          if ((t.parent as any).name) {
            directParentName = (t.parent as any).name;
          }
          if ((t.parent as any).id) {
            parentId = String((t.parent as any).id).replace(/^#/, '').trim();
          }
        } else if (typeof t.parent === 'number') {
          parentId = String(t.parent);
        }
      }

      if (directParentName && parentId) {
        this.parentTaskNameCache.set(parentId, directParentName);
      } else if (parentId && !this.parentTaskNameCache.has(parentId)) {
        missingParentIds.add(parentId);
      }
    }

    // 3. Récupérer les parents manquants via l'API ClickUp par lots parallèles doux
    if (missingParentIds.size > 0) {
      const parentIdsArray = Array.from(missingParentIds);
      const batchSize = 6;
      for (let i = 0; i < parentIdsArray.length; i += batchSize) {
        const batch = parentIdsArray.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(async (parentId) => {
            if (this.parentTaskNameCache.has(parentId)) return;
            try {
              const parentData = await this.request(`/task/${parentId}`, apiKey);
              if (parentData && parentData.name) {
                this.parentTaskNameCache.set(parentId, parentData.name.trim());
              }
            } catch (err) {
              console.warn(`Could not resolve parent task ${parentId}:`, err);
            }
          })
        );
        if (i + batchSize < parentIdsArray.length) {
          await this.delay(80);
        }
      }
      this.saveParentCacheToStorage();
    }

    // 4. Attacher `parent` et `parentName` de façon garantie sur chaque tâche
    return tasks.map((t) => {
      let parentId: string | null = null;
      let parentName: string | null = null;

      if (t.parent) {
        if (typeof t.parent === 'string') {
          parentId = t.parent.replace(/^#/, '').trim();
        } else if (typeof t.parent === 'object' && t.parent !== null) {
          if ((t.parent as any).name) parentName = (t.parent as any).name;
          if ((t.parent as any).id) parentId = String((t.parent as any).id).replace(/^#/, '').trim();
        } else if (typeof t.parent === 'number') {
          parentId = String(t.parent);
        }
      }

      if (parentId) {
        parentName = parentName || this.parentTaskNameCache.get(parentId) || t.parentName || null;
      }

      return {
        ...t,
        parent: parentId || (typeof t.parent === 'string' ? t.parent : null),
        parentName: parentName || t.parentName || null,
      };
    });
  }

  /**
   * Récupère toutes les tâches assignées à l'utilisateur, triées exactement comme ClickUp
   */
  static async getMyAssignedTasks(apiKey: string, teamId: string, userId: number): Promise<ClickUpTask[]> {
    const query = new URLSearchParams({
      'subtasks': 'true',
      'include_closed': 'false',
      'order_by': 'due_date',
      'reverse': 'false',
    });
    query.append('assignees[]', userId.toString());

    const data = await this.request(`/team/${teamId}/task?${query.toString()}`, apiKey);
    let tasks: ClickUpTask[] = data.tasks || [];

    // Trier les tâches exactement comme la vue ClickUp (Due date ↑1, Priorité ↑2)
    tasks = tasks.sort((a, b) => {
      // 1. Due date ascending (overdue e.g. 5 days ago comes first, null due dates come last)
      const dueA = a.due_date ? Number(a.due_date) : Infinity;
      const dueB = b.due_date ? Number(b.due_date) : Infinity;
      if (dueA !== dueB) return dueA - dueB;

      // 2. Priority ascending orderindex (1: Urgent, 2: High, 3: Normal, 4: Low)
      const prioA = a.priority?.orderindex !== undefined ? Number(a.priority.orderindex) : 99;
      const prioB = b.priority?.orderindex !== undefined ? Number(b.priority.orderindex) : 99;
      if (prioA !== prioB) return prioA - prioB;

      // 3. Custom field priorité si présente
      const getCustomPrio = (t: ClickUpTask) => {
        if (!t.custom_fields) return 99;
        const cf = t.custom_fields.find(f => f.name && f.name.toLowerCase().includes('priorité'));
        if (cf && typeof cf.value === 'number') return cf.value;
        return 99;
      };
      const cfA = getCustomPrio(a);
      const cfB = getCustomPrio(b);
      if (cfA !== cfB) return cfA - cfB;

      // 4. Order index
      const ordA = a.orderindex ? Number(a.orderindex) : 0;
      const ordB = b.orderindex ? Number(b.orderindex) : 0;
      if (ordA !== ordB) return ordA - ordB;

      return a.name.localeCompare(b.name);
    });

    // Résoudre les tâches parentes
    return this.resolveParentTaskNames(apiKey, tasks);
  }

  /**
   * Récupère la liste de tous les projets (Dossiers et Listes) avec cache 3 minutes
   */
  static async getAllProjectsAndSpaces(
    apiKey: string, 
    teamId: string, 
    includeArchived: boolean = false, 
    forceRefresh: boolean = false
  ): Promise<ClickUpProjectItem[]> {
    const cacheKey = `${teamId}_${includeArchived}`;
    const cached = this.projectsCache.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < 3 * 60 * 1000)) {
      return cached.data;
    }

    const spacesData = await this.request(`/team/${teamId}/space?archived=${includeArchived}`, apiKey);
    const spaces: ClickUpSpace[] = spacesData.spaces || [];
    const items: ClickUpProjectItem[] = [];

    for (const space of spaces) {
      try {
        const foldersData = await this.request(`/space/${space.id}/folder?archived=${includeArchived}`, apiKey);
        const folders: ClickUpFolder[] = foldersData.folders || [];

        for (const folder of folders) {
          // Extract short code if folder name has prefix like "100_53", "111_43", "179_254", "PRJ-12", etc.
          const prefixMatch = folder.name.match(/^([0-9A-Za-z]+[_\-][0-9A-Za-z]+)(?:[_\-\s]|$)/);
          const code = prefixMatch ? prefixMatch[1] : (folder.name.match(/^([A-Za-z0-9]+)/)?.[1] || folder.name.slice(0, 8));
          items.push({
            id: folder.id,
            name: folder.name,
            code: code,
            type: 'folder',
            spaceName: space.name,
            isArchived: folder.archived || false,
            url: `https://app.clickup.com/v/f/${folder.id}`,
            taskCount: 0
          });
        }

        const listsData = await this.request(`/space/${space.id}/list?archived=${includeArchived}`, apiKey);
        const lists: ClickUpList[] = listsData.lists || [];

        for (const list of lists) {
          const prefixMatch = list.name.match(/^([0-9A-Za-z]+[_\-][0-9A-Za-z]+)(?:[_\-\s]|$)/);
          const code = prefixMatch ? prefixMatch[1] : (list.name.match(/^([A-Za-z0-9]+)/)?.[1] || list.name.slice(0, 8));
          items.push({
            id: list.id,
            name: list.name,
            code: code,
            type: 'list',
            spaceName: space.name,
            isArchived: list.archived || false,
            url: `https://app.clickup.com/v/l/${list.id}`,
            taskCount: 0
          });
        }

        // Small pause between spaces to respect rate limits
        await this.delay(120);
      } catch (err) {
        console.warn(`Could not load folders for space ${space.name}`, err);
      }
    }

    this.projectsCache.set(cacheKey, { data: items, timestamp: now });
    return items;
  }

  /**
   * Récupère les tâches d'un projet spécifique avec cache 1 minute
   */
  static async getTasksForProject(
    apiKey: string, 
    project: ClickUpProjectItem, 
    userId?: number,
    forceRefresh: boolean = false
  ): Promise<ClickUpTask[]> {
    const cacheKey = `${project.type}_${project.id}_${userId || 'all'}`;
    const cached = this.projectTasksCache.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < 60 * 1000)) {
      return cached.data;
    }

    let rawTasks: ClickUpTask[] = [];

    if (project.type === 'folder') {
      const listsData = await this.request(`/folder/${project.id}/list`, apiKey);
      const lists: ClickUpList[] = listsData.lists || [];
      
      const taskPromises = lists.map(async (list) => {
        try {
          const query = new URLSearchParams({
            'subtasks': 'true',
            'include_closed': 'false',
          });
          if (userId) query.append('assignees[]', userId.toString());
          const res = await this.request(`/list/${list.id}/task?${query.toString()}`, apiKey);
          return res.tasks || [];
        } catch {
          return [];
        }
      });

      const taskArrays = await Promise.all(taskPromises);
      rawTasks = taskArrays.flat();
    } else {
      const query = new URLSearchParams({
        'subtasks': 'true',
        'include_closed': 'false',
      });
      if (userId) query.append('assignees[]', userId.toString());
      const data = await this.request(`/list/${project.id}/task?${query.toString()}`, apiKey);
      rawTasks = data.tasks || [];
    }

    const sorted = rawTasks.sort((a, b) => {
      const dueA = a.due_date ? Number(a.due_date) : Infinity;
      const dueB = b.due_date ? Number(b.due_date) : Infinity;
      return dueA - dueB;
    });

    const resolved = await this.resolveParentTaskNames(apiKey, sorted);
    this.projectTasksCache.set(cacheKey, { data: resolved, timestamp: now });
    return resolved;
  }

  /**
   * Démarre le chrono en direct dans ClickUp
   */
  static async startLiveTimer(apiKey: string, teamId: string, taskId: string, description?: string, billable: boolean = true) {
    return this.request(`/team/${teamId}/time_entries/start`, apiKey, {
      method: 'POST',
      body: JSON.stringify({
        tid: taskId,
        description: description || '',
        billable: billable,
      }),
    });
  }

  /**
   * Arrête le chrono en direct dans ClickUp
   */
  static async stopLiveTimer(apiKey: string, teamId: string) {
    return this.request(`/team/${teamId}/time_entries/stop`, apiKey, {
      method: 'POST',
    });
  }

  /**
   * Récupère le chrono actif actuellement dans ClickUp (s'il tourne)
   */
  static async getRunningTimer(apiKey: string, teamId: string) {
    try {
      const data = await this.request(`/team/${teamId}/time_entries/current`, apiKey);
      return data.data;
    } catch {
      return null;
    }
  }

  /**
   * Enregistre un punch avec Heure de Début et Heure de Fin précises
   */
  static async addTimeEntryWithInterval(
    apiKey: string,
    teamId: string,
    taskId: string,
    startTimestampMs: number,
    endTimestampMs: number,
    description: string = '',
    billable: boolean = true
  ) {
    const durationMs = Math.max(0, endTimestampMs - startTimestampMs);

    return this.request(`/team/${teamId}/time_entries`, apiKey, {
      method: 'POST',
      body: JSON.stringify({
        tid: taskId,
        start: startTimestampMs,
        end: endTimestampMs,
        duration: durationMs,
        description: description,
        billable: billable,
      }),
    });
  }

  /**
   * Récupère les commentaires récents d'une tâche avec cache 30s
   */
  static async getTaskComments(apiKey: string, taskId: string, forceRefresh: boolean = false): Promise<ClickUpComment[]> {
    const cached = this.commentsCache.get(taskId);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < 30 * 1000)) {
      return cached.data;
    }

    try {
      const data = await this.request(`/task/${taskId}/comment`, apiKey);
      const comments = data.comments || [];
      const formatted = comments.map((c: any) => ({
        id: c.id,
        comment_text: typeof c.comment_text === 'string' ? c.comment_text : (c.comment ? c.comment.map((t: any) => t.text).join('') : ''),
        user: c.user,
        date: c.date,
        taskId: taskId,
      }));
      this.commentsCache.set(taskId, { data: formatted, timestamp: now });
      return formatted;
    } catch {
      return cached ? cached.data : [];
    }
  }

  /**
   * Envoie un commentaire/message sur une tâche ClickUp
   */
  static async postTaskComment(apiKey: string, taskId: string, text: string) {
    const res = await this.request(`/task/${taskId}/comment`, apiKey, {
      method: 'POST',
      body: JSON.stringify({
        comment_text: text,
        notify_all: true,
      }),
    });
    // Invalidate comment cache for this task
    this.commentsCache.delete(taskId);
    return res;
  }

  /**
   * Récupère les commentaires d'une liste (Canal ClickUp au niveau Liste)
   */
  static async getListComments(apiKey: string, listId: string, forceRefresh: boolean = false): Promise<ClickUpComment[]> {
    const cacheKey = `list_${listId}`;
    const cached = this.commentsCache.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < 30 * 1000)) {
      return cached.data;
    }

    try {
      const data = await this.request(`/list/${listId}/comment`, apiKey);
      const comments = data.comments || [];
      const formatted = comments.map((c: any) => ({
        id: c.id,
        comment_text: typeof c.comment_text === 'string' ? c.comment_text : (c.comment ? c.comment.map((t: any) => t.text).join('') : ''),
        user: c.user,
        date: c.date,
      }));
      this.commentsCache.set(cacheKey, { data: formatted, timestamp: now });
      return formatted;
    } catch {
      return cached ? cached.data : [];
    }
  }

  /**
   * Envoie un commentaire sur une liste (Canal Projet)
   */
  static async postListComment(apiKey: string, listId: string, text: string) {
    const res = await this.request(`/list/${listId}/comment`, apiKey, {
      method: 'POST',
      body: JSON.stringify({
        comment_text: text,
        notify_all: true,
      }),
    });
    this.commentsCache.delete(`list_${listId}`);
    return res;
  }

  /**
   * Cache des statuts possibles par liste ClickUp
   */
  private static listStatusesCache = new Map<string, { data: Array<{ status: string; color: string; type: string }>; timestamp: number }>();

  /**
   * Récupère les statuts configurés pour une liste ClickUp (ex: 'to do', 'in progress', 'review', 'complete')
   */
  static async getListStatuses(apiKey: string, listId: string): Promise<Array<{ status: string; color: string; type: string }>> {
    if (!listId) return [];
    const cached = this.listStatusesCache.get(listId);
    const now = Date.now();
    if (cached && (now - cached.timestamp < 10 * 60 * 1000)) {
      return cached.data;
    }

    try {
      const data = await this.request(`/list/${listId}`, apiKey);
      const statuses = data?.statuses || [];
      const formatted = statuses.map((s: any) => ({
        status: s.status,
        color: s.color || '#a855f7',
        type: s.type || 'custom',
      }));
      this.listStatusesCache.set(listId, { data: formatted, timestamp: now });
      return formatted;
    } catch {
      return cached ? cached.data : [];
    }
  }

  /**
   * Met à jour le statut d'une tâche dans ClickUp (ex: 'in progress', 'complete', 'ready to start', etc.)
   */
  static async updateTaskStatus(apiKey: string, taskId: string, status: string): Promise<any> {
    return this.request(`/task/${taskId}`, apiKey, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }
}

