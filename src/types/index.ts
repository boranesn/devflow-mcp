export interface PRFile {
  filename: string;
  additions: number;
  deletions: number;
  patch?: string;
  status: string;
}

export interface PRData {
  title: string;
  author: string;
  base_branch: string;
  head_branch: string;
  files_changed: number;
  lines_added: number;
  lines_removed: number;
  files: PRFile[];
}

export interface CommitData {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}
