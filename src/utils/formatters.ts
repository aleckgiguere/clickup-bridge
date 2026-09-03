import { ClickUpTask } from '../types';

export interface DueDateStatus {
  label: string;
  isOverdue: boolean;
  isToday: boolean;
  isTomorrow: boolean;
  colorClass: string;
}

export function formatDueDate(dueDateMs: string | number | null | undefined): DueDateStatus {
  if (!dueDateMs) {
    return {
      label: '—',
      isOverdue: false,
      isToday: false,
      isTomorrow: false,
      colorClass: 'text-slate-500'
    };
  }

  const timestamp = typeof dueDateMs === 'string' ? parseInt(dueDateMs, 10) : dueDateMs;
  if (isNaN(timestamp)) {
    return {
      label: '—',
      isOverdue: false,
      isToday: false,
      isTomorrow: false,
      colorClass: 'text-slate-500'
    };
  }

  const dueDate = new Date(timestamp);
  const now = new Date();

  // Comparaison par jour (sans heures)
  const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const diffMs = dueMidnight - todayMidnight;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const daysAgo = Math.abs(diffDays);
    return {
      label: daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`,
      isOverdue: true,
      isToday: false,
      isTomorrow: false,
      colorClass: 'text-red-500 font-semibold'
    };
  }

  if (diffDays === 0) {
    return {
      label: 'Today',
      isOverdue: false,
      isToday: true,
      isTomorrow: false,
      colorClass: 'text-amber-400 font-bold'
    };
  }

  if (diffDays === 1) {
    return {
      label: 'Tomorrow',
      isOverdue: false,
      isToday: false,
      isTomorrow: true,
      colorClass: 'text-slate-200 font-semibold'
    };
  }

  if (diffDays <= 6) {
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      label: daysOfWeek[dueDate.getDay()],
      isOverdue: false,
      isToday: false,
      isTomorrow: false,
      colorClass: 'text-slate-300 font-medium'
    };
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    label: `${months[dueDate.getMonth()]} ${dueDate.getDate()}`,
    isOverdue: false,
    isToday: false,
    isTomorrow: false,
    colorClass: 'text-slate-400'
  };
}

export function formatTimeSpentOrEstimate(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;

  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

export function formatTimerClock(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export interface FormattedProjectDisplay {
  code: string | null;
  displayName: string;
  fullName: string;
}

/**
 * Nettoie et formate le code et le nom du projet pour éviter les doublons de mots dans la recherche et les listes.
 * Ex: "100_53_SYNAPTIK_DOCUMENTAIRES" -> code: "100_53", displayName: "SYNAPTIK DOCUMENTAIRES"
 */
export function formatProjectDisplay(rawName: string, rawCode?: string): FormattedProjectDisplay {
  const full = (rawName || '').trim();
  let code = (rawCode || '').trim();
  let displayName = full;

  // 1. Détection du pattern standard de code client et projet (ex: 179_254, 355_02, 100_53, PRJ-123)
  const prefixMatch = full.match(/^([0-9A-Za-z]+[_\-][0-9A-Za-z]+)(?:[_\-\s]+(.*))?$/);
  if (prefixMatch) {
    code = prefixMatch[1];
    if (prefixMatch[2]) {
      // Remplace les underscores par des espaces pour une lecture fluide et propre
      displayName = prefixMatch[2].replace(/_+/g, ' ').trim();
    } else {
      displayName = '';
    }
  } else {
    // 2. Détection de crochets [100_53] Nom du projet
    const bracketMatch = full.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (bracketMatch) {
      code = bracketMatch[1].trim();
      displayName = bracketMatch[2].trim();
    } else if (code && code !== full && full.toLowerCase().startsWith(code.toLowerCase())) {
      displayName = full.slice(code.length).replace(/^[_\-\s:]+/, '').replace(/_+/g, ' ').trim();
    }
  }

  // 3. Élimination si le code se répète au début du displayName
  if (code && displayName.toLowerCase().startsWith(code.toLowerCase())) {
    displayName = displayName.slice(code.length).replace(/^[_\-\s:]+/, '').trim();
  }

  // 4. Déduplication des mots consécutifs répétés (ex: "SYNAPTIK SYNAPTIK" -> "SYNAPTIK")
  const words = displayName.split(/\s+/);
  const deduplicatedWords: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const current = words[i];
    const prev = deduplicatedWords[deduplicatedWords.length - 1];
    if (!prev || current.toLowerCase() !== prev.toLowerCase()) {
      deduplicatedWords.push(current);
    }
  }
  displayName = deduplicatedWords.join(' ').trim();

  // Si displayName est identique au code, le vider pour éviter tout doublon
  if (code && displayName.toLowerCase() === code.toLowerCase()) {
    displayName = '';
  }

  return {
    code: code || null,
    displayName: displayName || (code ? '' : full),
    fullName: full
  };
}

/**
 * Recherche insensible à la casse et insensible aux tirets/underscores.
 * Permet de rechercher par numéro de projet (ex: 355_02, 355-02, 355 02, 100),
 * par mot-clé (ex: V01, montage, capsule), par nom de dossier, livrable ou parent.
 * Garanti 100% sans exception / sans plantage runtime (toutes les propriétés protégées).
 */
export function matchTaskSearch(task: ClickUpTask, query: string): boolean {
  if (!query || !query.trim()) return true;

  const rawQuery = query.trim().toLowerCase();
  // Découper la requête en mots pour supporter la recherche multi-termes
  const terms = rawQuery
    .replace(/[_\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return true;

  // Extraction sécurisée des champs sans risque de null / undefined
  const name = (task.name || '').toLowerCase();
  const parentName = (task.parentName || '').toLowerCase();
  const folderName = (task.folder?.name || '').toLowerCase();
  const listName = (task.list?.name || '').toLowerCase();
  const spaceName = (task.space?.name || '').toLowerCase();
  const customId = (task.custom_id || '').toLowerCase();
  const id = (task.id || '').toLowerCase();
  const projectCode = (task.projectCode || '').toLowerCase();

  // Extraction via formatProjectDisplay pour les dossiers et listes
  const folderDisplay = task.folder?.name ? formatProjectDisplay(task.folder.name) : null;
  const listDisplay = task.list?.name ? formatProjectDisplay(task.list.name) : null;
  const folderCode = (folderDisplay?.code || '').toLowerCase();
  const listCode = (listDisplay?.code || '').toLowerCase();
  const folderDisplayName = (folderDisplay?.displayName || '').toLowerCase();
  const listDisplayName = (listDisplay?.displayName || '').toLowerCase();

  // Champs personnalisés éventuels
  let customFieldsText = '';
  if (Array.isArray(task.custom_fields)) {
    for (const cf of task.custom_fields) {
      if (cf?.value !== undefined && cf?.value !== null) {
        if (typeof cf.value === 'string' || typeof cf.value === 'number') {
          customFieldsText += ' ' + String(cf.value).toLowerCase();
        }
      }
    }
  }

  const combinedRaw = [
    name,
    parentName,
    folderName,
    listName,
    spaceName,
    customId,
    id,
    projectCode,
    folderCode,
    listCode,
    folderDisplayName,
    listDisplayName,
    customFieldsText,
  ].join(' ');

  // Version normalisée où les underscores et tirets sont remplacés par des espaces
  const combinedNormalized = combinedRaw.replace(/[_\-]+/g, ' ');

  // Si l'utilisateur a tapé une chaîne avec underscore (ex: "355_02"), test direct prioritaire
  if (combinedRaw.includes(rawQuery) || combinedNormalized.includes(rawQuery.replace(/[_\-]+/g, ' '))) {
    return true;
  }

  // Chaque mot de la recherche doit correspondre (recherche AND)
  return terms.every(term => {
    return combinedRaw.includes(term) || combinedNormalized.includes(term);
  });
}

export interface ProjectTheme {
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  accentBar: string;
  dotBg: string;
}

const PROJECT_THEMES: ProjectTheme[] = [
  {
    badgeBg: 'bg-purple-950/80',
    badgeBorder: 'border-purple-600/70',
    badgeText: 'text-purple-200',
    accentBar: 'bg-purple-500',
    dotBg: 'bg-purple-400'
  },
  {
    badgeBg: 'bg-indigo-950/80',
    badgeBorder: 'border-indigo-600/70',
    badgeText: 'text-indigo-200',
    accentBar: 'bg-indigo-500',
    dotBg: 'bg-indigo-400'
  },
  {
    badgeBg: 'bg-emerald-950/80',
    badgeBorder: 'border-emerald-600/70',
    badgeText: 'text-emerald-200',
    accentBar: 'bg-emerald-500',
    dotBg: 'bg-emerald-400'
  },
  {
    badgeBg: 'bg-blue-950/80',
    badgeBorder: 'border-blue-600/70',
    badgeText: 'text-blue-200',
    accentBar: 'bg-blue-500',
    dotBg: 'bg-blue-400'
  },
  {
    badgeBg: 'bg-amber-950/80',
    badgeBorder: 'border-amber-600/70',
    badgeText: 'text-amber-200',
    accentBar: 'bg-amber-500',
    dotBg: 'bg-amber-400'
  },
  {
    badgeBg: 'bg-cyan-950/80',
    badgeBorder: 'border-cyan-600/70',
    badgeText: 'text-cyan-200',
    accentBar: 'bg-cyan-500',
    dotBg: 'bg-cyan-400'
  },
  {
    badgeBg: 'bg-rose-950/80',
    badgeBorder: 'border-rose-600/70',
    badgeText: 'text-rose-200',
    accentBar: 'bg-rose-500',
    dotBg: 'bg-rose-400'
  },
  {
    badgeBg: 'bg-teal-950/80',
    badgeBorder: 'border-teal-600/70',
    badgeText: 'text-teal-200',
    accentBar: 'bg-teal-500',
    dotBg: 'bg-teal-400'
  },
  {
    badgeBg: 'bg-orange-950/80',
    badgeBorder: 'border-orange-600/70',
    badgeText: 'text-orange-200',
    accentBar: 'bg-orange-500',
    dotBg: 'bg-orange-400'
  },
  {
    badgeBg: 'bg-fuchsia-950/80',
    badgeBorder: 'border-fuchsia-600/70',
    badgeText: 'text-fuchsia-200',
    accentBar: 'bg-fuchsia-500',
    dotBg: 'bg-fuchsia-400'
  }
];

export function getProjectTheme(identifier: string): ProjectTheme {
  if (!identifier) return PROJECT_THEMES[0];
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash << 5) - hash + identifier.charCodeAt(i);
    hash |= 0;
  }
  return PROJECT_THEMES[Math.abs(hash) % PROJECT_THEMES.length];
}


