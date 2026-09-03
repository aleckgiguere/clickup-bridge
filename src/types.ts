export interface ClickUpUser {
  id: number;
  username: string;
  email: string;
  color?: string;
  profilePicture?: string;
  initials?: string;
}

export interface ClickUpWorkspace {
  id: string;
  name: string;
  color?: string;
  avatar?: string;
  members?: Array<{ user: ClickUpUser }>;
}

export interface ClickUpSpace {
  id: string;
  name: string;
  color?: string;
  private: boolean;
  archived?: boolean;
}

export interface ClickUpFolder {
  id: string;
  name: string;
  archived?: boolean;
  space: { id: string; name: string };
  lists?: ClickUpList[];
}

export interface ClickUpList {
  id: string;
  name: string;
  archived?: boolean;
  folder?: { id: string; name: string; hidden?: boolean };
  space: { id: string; name: string };
}

export interface ClickUpTask {
  id: string;
  custom_id?: string;
  name: string;
  text_content?: string;
  status: {
    status: string;
    color: string;
    type: string;
    orderindex?: number;
  };
  orderindex?: string;
  date_created?: string;
  date_updated?: string;
  date_closed?: string | null;
  date_done?: string | null;
  archived?: boolean;
  creator?: ClickUpUser;
  assignees: ClickUpUser[];
  priority?: {
    id?: string;
    priority: string;
    color: string;
    orderindex?: string;
  } | null;
  custom_fields?: Array<{ name?: string; value?: any }>;
  due_date?: string | null; // Timestamp en millisecondes string/number
  start_date?: string | null;
  time_estimate?: number | null; // ms
  time_spent?: number | null; // ms
  parent?: string | null; // Parent task ID if subtask
  parentName?: string | null; // Resolved parent task name (e.g. "Capsule #1")
  list: {
    id: string;
    name: string;
    access?: boolean;
  };
  folder?: {
    id: string;
    name: string;
    hidden?: boolean;
    access?: boolean;
  };
  space: {
    id: string;
    name: string;
    access?: boolean;
  };
  url: string;
  projectCode?: string;
}

export interface ClickUpProjectItem {
  id: string;
  name: string;
  code: string; // Ex: "179_254" ou "355_02"
  type: 'folder' | 'list' | 'space';
  spaceName: string;
  folderName?: string;
  isArchived: boolean;
  url: string;
  taskCount?: number;
}

export interface ClickUpComment {
  id: string;
  comment_text: string;
  user: ClickUpUser;
  date: string | number;
  taskId?: string;
  taskName?: string;
  projectName?: string;
}

export interface ProjectDiscussionChannel {
  id: string;
  name: string;
  type: 'project' | 'task' | 'list';
  projectCode?: string;
  taskId?: string;
  lastMessage?: string;
  lastMessageDate?: number;
  unreadCount?: number;
  comments: ClickUpComment[];
}

export interface ActiveTimerState {
  isRunning: boolean;
  taskId?: string;
  taskName: string;
  projectId?: string;
  projectName: string;
  projectCode?: string;
  startTime: number;
  elapsedSeconds: number;
  description: string;
  isBillable: boolean;
}
