export interface Source {
  id: number;
  name: string;
  url: string;
  created_at: Date;
}

export interface CreateSourceInput {
  name: string;
  url: string;
}
