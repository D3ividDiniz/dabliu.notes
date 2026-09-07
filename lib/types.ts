export const MODEL_COLORS = ["yellow", "blue", "pink", "white", "gray"] as const;
export type ModelColor = (typeof MODEL_COLORS)[number];
export type VisualStyle = "minimal" | "ambient";
export type OrganizationMode = "list" | "date" | "tags";
export type FieldKey = "title" | "description" | "date" | "tag" | "value" | "number" | "status";
export type ThemeMode = "system" | "light" | "dark";

export type NoteModel = {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: ModelColor;
  description: string | null;
  enabled_fields: FieldKey[];
  organization_mode: OrganizationMode;
  placeholders: string[];
  visual_style: VisualStyle;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  user_id: string;
  model_id: string;
  original_content: string;
  title: string | null;
  description: string | null;
  note_date: string | null;
  tags: string[];
  value: number | null;
  number_value: number | null;
  status: "pending" | "in_progress" | "completed" | null;
  ai_metadata: Record<string, unknown>;
  ai_status: "not_requested" | "pending" | "complete" | "failed";
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  title: "Title",
  description: "Description",
  date: "Date",
  tag: "Tag",
  value: "Value",
  number: "Number",
  status: "Status",
};
