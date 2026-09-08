"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, BriefcaseBusiness, CircleDot, Command, Download, Film, FolderKanban, GraduationCap, Heart, House, Library, ListTodo, LogIn, LogOut, Plane, Plus, Search, Settings, ShoppingBag, Sparkles, Trash2, WalletCards, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GEMINI_MODEL_OPTIONS } from "@/lib/ai/models";
import { FIELD_LABELS, MODEL_COLORS, type FieldKey, type FontFamily, type ModelColor, type Note, type NoteModel, type OrganizationMode, type SwipeBehavior, type ThemeMode, type VisualStyle } from "@/lib/types";

const ICON_LIBRARY = [
  { value: "briefcase", label: "Trabalho", icon: BriefcaseBusiness },
  { value: "list", label: "Tarefas", icon: ListTodo },
  { value: "wallet", label: "Finanças", icon: WalletCards },
  { value: "heart", label: "Pessoal", icon: Heart },
  { value: "book", label: "Estudos", icon: Library },
  { value: "graduation", label: "Aprendizado", icon: GraduationCap },
  { value: "folder", label: "Projeto", icon: FolderKanban },
  { value: "house", label: "Casa", icon: House },
  { value: "plane", label: "Viagem", icon: Plane },
  { value: "shopping", label: "Compras", icon: ShoppingBag },
  { value: "film", label: "Filmes", icon: Film },
  { value: "dot", label: "Outro", icon: CircleDot },
] as const;
const ICONS = ICON_LIBRARY.map((item) => item.value);
const DEFAULT_PLACEHOLDERS = ["Escreva antes que desapareça...", "O que você precisa lembrar?", "Joga aqui."];
const FONT_OPTIONS: Array<{ value: FontFamily; label: string; sample: string }> = [
  { value: "mono", label: "Mono", sample: "Clássica e técnica" },
  { value: "sans", label: "Sans", sample: "Limpa e discreta" },
  { value: "serif", label: "Serif", sample: "Editorial e calma" },
  { value: "rounded", label: "Rounded", sample: "Leve e amigável" },
];

function IconGlyph({ name, size = 17 }: { name: string; size?: number }) {
  const option = ICON_LIBRARY.find((item) => item.value === name);
  if (!option) return <span aria-hidden="true">{name || "•"}</span>;
  const Icon = option.icon;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}

function formatNoteDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function normalizeNoteDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function getAIUsage(notes: Note[]) {
  return notes.reduce((total, note) => {
    const usage = note.ai_metadata?.usage;
    if (!usage || typeof usage !== "object") return total;
    const values = usage as Record<string, unknown>;
    return {
      requests: total.requests + 1,
      prompt: total.prompt + (typeof values.promptTokenCount === "number" ? values.promptTokenCount : 0),
      output: total.output + (typeof values.candidatesTokenCount === "number" ? values.candidatesTokenCount : 0),
      total: total.total + (typeof values.totalTokenCount === "number" ? values.totalTokenCount : 0),
    };
  }, { requests: 0, prompt: 0, output: 0, total: 0 });
}

function groupLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(date);
}

export default function NotesApp() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [models, setModels] = useState<NoteModel[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [view, setView] = useState<"capture" | "history" | "search" | "settings">("capture");
  const [query, setQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showModelEditor, setShowModelEditor] = useState(false);
  const [editingModel, setEditingModel] = useState<NoteModel | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("minimal");
  const [fontFamily, setFontFamily] = useState<FontFamily>("mono");
  const [aiModel, setAIModel] = useState("gemini-3.6-flash");
  const [aiEnabled, setAIEnabled] = useState(true);
  const [swipeBehavior, setSwipeBehavior] = useState<SwipeBehavior>("archive");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiMode, setAIMode] = useState(false);
  const [aiAnswer, setAIAnswer] = useState("");
  const [askingAI, setAskingAI] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeModel = models.find((model) => model.id === activeModelId) ?? models[0];
  const visibleNotes = notes.filter((note) => !note.deleted_at && !note.archived_at && note.ai_status !== "pending" && (!activeModelId || view !== "capture" || note.model_id === activeModelId));
  const searchResults = notes.filter((note) => !note.deleted_at && !note.archived_at && note.ai_status !== "pending" && `${note.original_content} ${note.title ?? ""} ${note.description ?? ""} ${note.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const aiUsage = useMemo(() => getAIUsage(notes), [notes]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id, email: data.user.email } : null)).finally(() => setLoading(false));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ? { id: session.user.id, email: session.user.email } : null));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !user) return;
    Promise.all([
      supabase.from("models").select("*").order("created_at"),
      supabase.from("notes").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("user_preferences").select("*").maybeSingle(),
    ]).then(([modelsResult, notesResult, preferencesResult]) => {
      if (modelsResult.data) { setModels(modelsResult.data as NoteModel[]); setActiveModelId((current) => current ?? modelsResult.data[0]?.id ?? null); }
      if (notesResult.data) setNotes(notesResult.data as Note[]);
      if (preferencesResult.data) { setTheme(preferencesResult.data.theme); setVisualStyle(preferencesResult.data.visual_style); setFontFamily(preferencesResult.data.font_family ?? "mono"); setAIModel(preferencesResult.data.ai_model ?? "gemini-3.6-flash"); setAIEnabled(preferencesResult.data.ai_enabled ?? true); setSwipeBehavior(preferencesResult.data.swipe_behavior ?? "archive"); }
    });
  }, [supabase, user]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.visual = activeModel?.visual_style ?? visualStyle;
    document.documentElement.dataset.font = fontFamily;
  }, [theme, visualStyle, activeModel?.visual_style, fontFamily]);

  useEffect(() => {
    if (!supabase || !user) return;
    void supabase.from("user_preferences").upsert({ user_id: user.id, theme, visual_style: visualStyle, font_family: fontFamily, ai_model: aiModel, ai_enabled: aiEnabled, swipe_behavior: swipeBehavior });
  }, [supabase, user, theme, visualStyle, fontFamily, aiModel, aiEnabled, swipeBehavior]);

  useEffect(() => { if (!aiEnabled) setAIMode(false); }, [aiEnabled]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setView("search"); } };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    if (authError) setMessage(`Falha no login Google: ${authError}. Tente novamente em uma aba privada.`);
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return setMessage("Add Supabase environment variables to enable sign in.");
    setMessage(""); const result = authMode === "signin" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    if (result.error) setMessage(result.error.message); else if (authMode === "signup") setMessage("Check your email to confirm your account.");
  }

  async function signInWithGoogle() {
    if (!supabase) return setMessage("Add Supabase environment variables to enable sign in.");
    await supabase.auth.signOut({ scope: "local" });
    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, "");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${appOrigin}/auth/callback?next=/`, queryParams: { prompt: "select_account" } } });
    if (error) setMessage(error.message);
  }

  async function capture(content: string) {
    if (!content.trim() || !supabase || !user || !activeModel) return;
    const log = (entry: string) => setDebugLog((current) => [...current.slice(-5), `${new Date().toLocaleTimeString()} — ${entry}`]);
    setSaving(true); setMessage(""); log("salvando captura");
    const { data, error } = await supabase.from("notes").insert({ user_id: user.id, model_id: activeModel.id, original_content: content.trim(), ai_status: "pending" }).select().single();
    if (error) { setMessage(error.message); log(`erro ao salvar: ${error.message}`); setSaving(false); return; }
    const note = data as Note; setMessage("Interpretando e separando suas tarefas..."); log(`captura salva (${note.id.slice(0, 8)})`); if (inputRef.current) inputRef.current.value = "";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    log(`enviando para Gemini (${aiModel})`);
    fetch("/api/ai/parse", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ modelName: activeModel.name, context: activeModel.description ?? "", fields: activeModel.enabled_fields, content, aiModel }) }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? `Gemini respondeu HTTP ${response.status}`);
      const parsedNotes = Array.isArray(result) ? result : Array.isArray(result.notes) ? result.notes : [result];
      const usage = Array.isArray(result) ? null : result.usage ?? null;
      log(`Gemini respondeu com ${parsedNotes.length} tarefa(s)`);
      const first = parsedNotes[0];
      const update: Partial<Note> = { title: first.title, description: first.description, note_date: normalizeNoteDate(first.date), tags: first.tags ?? [], value: first.value, number_value: first.number, status: first.status, ai_status: "complete", ai_metadata: { provider: "gemini", split_count: parsedNotes.length, usage } };
      const updateResult = await supabase.from("notes").update(update).eq("id", note.id);
      if (updateResult.error) throw updateResult.error;
      const additional = parsedNotes.slice(1).map((parsed: { title?: string | null; description?: string | null; date?: string | null; tags?: string[]; value?: number | null; number?: number | null; status?: Note["status"] }) => ({ user_id: user.id, model_id: activeModel.id, original_content: content.trim(), title: parsed.title ?? null, description: parsed.description ?? null, note_date: normalizeNoteDate(parsed.date), tags: parsed.tags ?? [], value: parsed.value ?? null, number_value: parsed.number ?? null, status: parsed.status ?? null, ai_status: "complete", ai_metadata: { provider: "gemini", split_count: parsedNotes.length } }));
      const inserted = additional.length ? await supabase.from("notes").insert(additional).select() : { data: [] as Note[], error: null };
      if (inserted.error) throw inserted.error;
      const completed = { ...note, ...update };
      setNotes((current) => [...(inserted.data as Note[] ?? []), completed, ...current]);
      log(`salvas ${parsedNotes.length} tarefa(s)`);
      setMessage(`${parsedNotes.length} tarefa${parsedNotes.length === 1 ? "" : "s"} criada${parsedNotes.length === 1 ? "" : "s"}.`);
    }).catch(async (error: unknown) => { const detail = error instanceof DOMException && error.name === "AbortError" ? "timeout após 45s" : error instanceof Error ? error.message : "erro desconhecido"; await supabase.from("notes").update({ ai_status: "failed" }).eq("id", note.id); setNotes((current) => [{ ...note, ai_status: "failed" }, ...current]); log(`falha: ${detail}`); setMessage(`Texto salvo, mas a IA falhou: ${detail}.`); }).finally(() => { window.clearTimeout(timeout); setSaving(false); });
  }

  async function captureManually(content: string) {
    if (!content.trim() || !supabase || !user || !activeModel) return;
    setSaving(true); setMessage("");
    const { data, error } = await supabase.from("notes").insert({ user_id: user.id, model_id: activeModel.id, original_content: content.trim(), ai_status: "not_requested" }).select().single();
    if (error) { setMessage(error.message); setSaving(false); return; }
    const note = data as Note;
    if (inputRef.current) inputRef.current.value = "";
    setNotes((current) => [note, ...current]);
    setSelectedNote(note);
    setMessage("Texto salvo. Preencha os campos manualmente.");
    setSaving(false);
  }

  async function askAI(question: string) {
    if (!question.trim() || !supabase || !user) return;
    setAskingAI(true); setMessage(""); setAIAnswer("");
    try {
      const response = await fetch("/api/ai/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: question.trim(), aiModel }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? `IA respondeu HTTP ${response.status}`);
      setAIAnswer(result.answer ?? "A IA não encontrou uma resposta.");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível perguntar à IA agora.");
    } finally {
      setAskingAI(false);
    }
  }

  async function saveModel(form: NoteModel) {
    if (!supabase || !user) return;
    const payload = { name: form.name, icon: form.icon, color: form.color, description: form.description, enabled_fields: form.enabled_fields, organization_mode: form.organization_mode, placeholders: form.placeholders.filter(Boolean).slice(0, 5), visual_style: form.visual_style };
    const result = form.id ? await supabase.from("models").update(payload).eq("id", form.id).select().single() : await supabase.from("models").insert({ ...payload, user_id: user.id }).select().single();
    if (result.error) return setMessage(result.error.message);
    const saved = result.data as NoteModel; setModels((current) => form.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]); setActiveModelId(saved.id); setShowModelEditor(false); setEditingModel(null);
  }

  async function deleteModel(model: NoteModel) {
    if (!supabase || !window.confirm(`Excluir o módulo ${model.name}? As tarefas existentes serão preservadas.`)) return;
    // Keep notes recoverable by removing the model only after the user confirms. The DB restricts deletion while notes exist.
    const { error } = await supabase.from("models").delete().eq("id", model.id);
    if (error) setMessage(error.message); else { setModels((current) => current.filter((item) => item.id !== model.id)); setActiveModelId((current) => current === model.id ? models.find((item) => item.id !== model.id)?.id ?? null : current); }
  }

  async function updateNote(note: Note, updates: Partial<Note>) {
    if (!supabase) return; const { error } = await supabase.from("notes").update(updates).eq("id", note.id); if (error) return setMessage(error.message); setNotes((current) => current.map((item) => item.id === note.id ? { ...item, ...updates } : item)); setSelectedNote({ ...note, ...updates });
  }

  async function deleteNote(note: Note) {
    if (!supabase || !window.confirm("Excluir permanentemente esta tarefa? Esta ação não poderá ser desfeita.")) return;
    const { error } = await supabase.from("notes").delete().eq("id", note.id);
    if (error) return setMessage(error.message);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    setSelectedNote(null);
    setMessage("Tarefa excluída permanentemente.");
  }

  async function archiveNote(note: Note) {
    if (!supabase) return;
    const archivedAt = new Date().toISOString();
    const { error } = await supabase.from("notes").update({ archived_at: archivedAt }).eq("id", note.id);
    if (error) return setMessage(error.message);
    setNotes((current) => current.map((item) => item.id === note.id ? { ...item, archived_at: archivedAt } : item));
    setMessage("Tarefa arquivada. Ela continua disponível no histórico.");
  }

  async function exportData() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), models, notes }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "dabliu-notes-export.json"; link.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <main className="loading-screen"><span className="wordmark">W</span></main>;
  if (!user) return <AuthScreen {...{ email, setEmail, password, setPassword, authMode, setAuthMode, signIn, signInWithGoogle, message }} />;

  return <main className={`app-shell color-${activeModel?.color ?? "gray"}`}>
    <div className="ambient-lines" aria-hidden="true"><i /><i /><i /></div>
    <header className="topbar">
      <button className="wordmark" onClick={() => setView("capture")} aria-label="Go to capture">W</button>
      <nav className="model-nav" aria-label="Modules">
        {models.map((model) => <button key={model.id} className={`model-chip color-${model.color} ${model.id === activeModel?.id ? "active" : ""}`} onClick={() => { setActiveModelId(model.id); setView("capture"); }} aria-label={model.name} aria-pressed={model.id === activeModel?.id}><IconGlyph name={model.icon} /></button>)}
        <button className="icon-button quiet" onClick={() => { setEditingModel(null); setShowModelEditor(true); }} aria-label="Create module"><Plus size={17} /></button>
      </nav>
      <div className="secondary-nav">
        <button className={`icon-button ${view === "history" ? "selected" : ""}`} onClick={() => setView("history")} aria-label="History"><Archive size={17} /></button>
        <button className={`icon-button ${view === "search" ? "selected" : ""}`} onClick={() => setView("search")} aria-label="Search"><Search size={17} /></button>
        <button className={`icon-button ${view === "settings" ? "selected" : ""}`} onClick={() => setView("settings")} aria-label="Settings"><Settings size={17} /></button>
      </div>
    </header>

    <section className="content-column">
      {message && <div className="notice" role="status">{message}<button onClick={() => setMessage("")} aria-label="Dismiss"><X size={14} /></button></div>}
      {view === "capture" && <>
        <div className="context-line"><span className={`status-dot color-${activeModel?.color ?? "gray"}`} /> {activeModel?.name ?? "Crie seu primeiro módulo"}<span className="context-description">{activeModel?.description ?? "Um lugar tranquilo para suas ideias."}</span></div>
        {!activeModel ? <EmptyModels onCreate={() => setShowModelEditor(true)} /> : <>
          <div className="capture-mode"><span>Modo de captura</span><button type="button" disabled={!aiEnabled} className={`mode-toggle ${aiMode ? "active" : ""}`} role="switch" aria-checked={aiMode} onClick={() => { setAIMode((current) => !current); setAIAnswer(""); setMessage(""); }}><Sparkles size={14} /> {aiEnabled ? aiMode ? "IA ativa" : "Modo IA" : "IA desligada"}<span className="toggle-knob" /></button></div>
          <form className={`capture-form ${aiMode ? "ai-capture-form" : ""}`} onSubmit={(event) => { event.preventDefault(); const content = inputRef.current?.value ?? ""; void (aiMode && aiEnabled ? askAI(content) : aiEnabled ? capture(content) : captureManually(content)); }}>
            <textarea ref={inputRef} autoFocus rows={5} placeholder={aiMode ? "Pergunte sobre suas tarefas..." : activeModel.placeholders?.[0] ?? DEFAULT_PLACEHOLDERS[0]} aria-label={aiMode ? "Pergunte à IA sobre suas tarefas" : `Capture notes in ${activeModel.name}`} />
            <div className="capture-hint"><span>{aiMode && aiEnabled ? "A IA consulta suas tarefas e módulos" : aiEnabled ? "Enter cria uma nova linha" : "Modo manual · você preencherá os campos"}</span><button className="save-button" disabled={saving || askingAI} type="submit">{askingAI ? "Pensando..." : aiMode && aiEnabled ? "Perguntar" : saving ? "Salvando..." : "Salvar"}<span>↵</span></button></div>
          </form>
          {aiAnswer && <section className="ai-answer" aria-live="polite"><div className="ai-answer-heading"><Sparkles size={14} /><span>Resposta da IA</span><button type="button" className="text-button" onClick={() => setAIAnswer("")}>Limpar</button></div><p>{aiAnswer}</p></section>}
          {debugLog.length > 0 && <div className="debug-log" aria-live="polite"><span className="debug-label">DEV / IA</span>{debugLog.map((entry, index) => <div key={`${entry}-${index}`}>{entry}</div>)}</div>}
          <NoteFeed notes={visibleNotes.slice(0, 12)} models={models} swipeBehavior={swipeBehavior} onArchive={archiveNote} onDelete={deleteNote} onSelect={setSelectedNote} />
        </>}
      </>}
      {view === "history" && <HistoryView notes={notes.filter((note) => !note.deleted_at && note.ai_status !== "pending")} models={models} onFilter={(id) => { setActiveModelId(id); }} onArchive={archiveNote} onDelete={deleteNote} onSelect={setSelectedNote} />}
      {view === "search" && <SearchView query={query} setQuery={setQuery} results={searchResults} models={models} onSelect={setSelectedNote} />}
          {view === "settings" && <SettingsView theme={theme} setTheme={setTheme} visualStyle={visualStyle} setVisualStyle={setVisualStyle} fontFamily={fontFamily} setFontFamily={setFontFamily} aiModel={aiModel} setAIModel={setAIModel} aiEnabled={aiEnabled} setAIEnabled={setAIEnabled} aiUsage={aiUsage} swipeBehavior={swipeBehavior} setSwipeBehavior={setSwipeBehavior} models={models} onEdit={(model) => { setEditingModel(model); setShowModelEditor(true); }} onCreate={() => { setEditingModel(null); setShowModelEditor(true); }} onDelete={deleteModel} onExport={exportData} onSignOut={() => void supabase?.auth.signOut({ scope: "local" })} email={user.email} />}
    </section>
    {selectedNote && <NoteEditor note={selectedNote} model={models.find((item) => item.id === selectedNote.model_id)} onClose={() => setSelectedNote(null)} onSave={updateNote} onDelete={deleteNote} onArchive={archiveNote} />}
    {showModelEditor && <ModelEditor model={editingModel} onClose={() => { setShowModelEditor(false); setEditingModel(null); }} onSave={saveModel} />}
  </main>;
}

function AuthScreen(props: { email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void; authMode: "signin" | "signup"; setAuthMode: (value: "signin" | "signup") => void; signIn: (event: React.FormEvent) => void; signInWithGoogle: () => void; message: string }) {
  return <main className="auth-screen"><div className="auth-card"><span className="wordmark">W</span><p className="eyebrow">Dabliu.notes</p><h1>Guarde a ideia.</h1><p className="muted">Um lugar simples para capturar o que importa, no seu contexto.</p><button className="google-button" onClick={props.signInWithGoogle}><LogIn size={16} /> Continuar com Google</button><div className="divider"><span>ou use seu e-mail</span></div><form onSubmit={props.signIn}><label>E-mail<input type="email" required value={props.email} onChange={(e) => props.setEmail(e.target.value)} /></label><label>Senha<input type="password" minLength={6} required value={props.password} onChange={(e) => props.setPassword(e.target.value)} /></label>{props.message && <p className="form-error">{props.message}</p>}<button className="primary-button" type="submit">{props.authMode === "signin" ? "Entrar" : "Criar conta"}</button></form><button className="text-button" onClick={() => props.setAuthMode(props.authMode === "signin" ? "signup" : "signin")}>{props.authMode === "signin" ? "Criar uma conta" : "Já tenho uma conta"}</button></div></main>;
}

function EmptyModels({ onCreate }: { onCreate: () => void }) { return <div className="empty-state"><Sparkles size={18} /><h2>Crie seu primeiro módulo.</h2><p>Escolha um contexto para organizar o que você quer lembrar.</p><button className="primary-button" onClick={onCreate}><Plus size={16} /> Novo módulo</button></div>; }

function NoteFeed({ notes, models, swipeBehavior, onArchive, onDelete, onSelect }: { notes: Note[]; models: NoteModel[]; swipeBehavior: SwipeBehavior; onArchive: (note: Note) => void; onDelete: (note: Note) => void; onSelect: (note: Note) => void }) { return <section className="feed"><div className="section-heading"><span>Recentes</span></div>{notes.length === 0 ? <p className="empty-copy">Nada por aqui ainda.</p> : notes.map((note) => <NoteRow key={note.id} note={note} model={models.find((item) => item.id === note.model_id)} swipeBehavior={swipeBehavior} onArchive={onArchive} onDelete={onDelete} onClick={() => onSelect(note)} />)}</section>; }

function NoteRow({ note, model, swipeBehavior, onArchive, onDelete, onClick }: { note: Note; model?: NoteModel; swipeBehavior?: SwipeBehavior; onArchive?: (note: Note) => void; onDelete?: (note: Note) => void; onClick: () => void }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const moved = useRef(false);
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => { if (event.pointerType === "mouse") return; startX.current = event.clientX; moved.current = false; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => { if (startX.current === null) return; const delta = Math.max(0, Math.min(92, event.clientX - startX.current)); if (delta > 8) moved.current = true; setOffset(delta); };
  const handlePointerUp = () => { if (startX.current === null) return; setDragging(false); if (offset > 64 && swipeBehavior === "archive" && onArchive) void onArchive(note); else if (offset > 48 && swipeBehavior === "reveal_delete") setOffset(82); else setOffset(0); startX.current = null; };
  return <div className={`note-swipe ${dragging ? "dragging" : ""}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}><div className="swipe-action" aria-hidden="true"><Archive size={15} /> {swipeBehavior === "reveal_delete" ? "Excluir" : "Arquivar"}</div><button className="note-row" style={{ transform: `translateX(${offset}px)` }} onClick={(event) => { if (moved.current) { event.preventDefault(); return; } onClick(); }}><span className={`note-icon color-${model?.color ?? "gray"}`}><IconGlyph name={model?.icon ?? "dot"} size={16} /></span><span className="note-copy"><strong>{note.title || note.original_content.slice(0, 72)}</strong><span>{note.description || note.original_content}</span>{note.tags.length > 0 && <small className="note-tags">#{note.tags.join(" #")}</small>}</span><time>{note.note_date ? formatNoteDate(note.note_date) : groupLabel(note.created_at)}</time></button>{offset > 48 && swipeBehavior === "reveal_delete" && onDelete && <button className="swipe-delete" onClick={() => void onDelete(note)} aria-label="Excluir tarefa"><Trash2 size={15} /></button>}</div>;
}

function HistoryView({ notes, models, onFilter, onArchive, onDelete, onSelect }: { notes: Note[]; models: NoteModel[]; onFilter: (id: string | null) => void; onArchive: (note: Note) => void; onDelete: (note: Note) => void; onSelect: (note: Note) => void }) { const [filter, setFilter] = useState<string | null>(null); const shown = filter ? notes.filter((note) => note.model_id === filter) : notes; return <div className="view-panel"><div className="view-heading"><div><p className="eyebrow">Tudo o que você anotou</p><h1>Histórico</h1></div><select value={filter ?? "all"} onChange={(e) => { const value = e.target.value === "all" ? null : e.target.value; setFilter(value); onFilter(value); }} aria-label="Filtrar histórico por módulo"><option value="all">Todos os módulos</option>{models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div><div className="history-list">{shown.length ? shown.map((note) => <NoteRow key={note.id} note={note} model={models.find((item) => item.id === note.model_id)} swipeBehavior="archive" onArchive={onArchive} onDelete={onDelete} onClick={() => onSelect(note)} />) : <p className="empty-copy">Nada por aqui ainda.</p>}</div></div>; }

function SearchView({ query, setQuery, results, models, onSelect }: { query: string; setQuery: (value: string) => void; results: Note[]; models: NoteModel[]; onSelect: (note: Note) => void }) { return <div className="view-panel"><div className="search-box"><Search size={18} /><input autoFocus placeholder="Buscar suas notas" value={query} onChange={(e) => setQuery(e.target.value)} /><kbd><Command size={12} /> K</kbd></div><p className="result-count">{query ? `${results.length} resultado${results.length === 1 ? "" : "s"}` : "Busque em todas as suas notas"}</p>{query && (results.length ? results.map((note) => <NoteRow key={note.id} note={note} model={models.find((item) => item.id === note.model_id)} onClick={() => onSelect(note)} />) : <p className="empty-copy">Nenhuma nota encontrada.</p>)}</div>; }

function NoteEditor({ note, model, onClose, onSave, onDelete, onArchive }: { note: Note; model?: NoteModel; onClose: () => void; onSave: (note: Note, updates: Partial<Note>) => void; onDelete: (note: Note) => void; onArchive: (note: Note) => void }) { const [title, setTitle] = useState(note.title ?? ""); const [description, setDescription] = useState(note.description ?? ""); const [date, setDate] = useState(note.note_date ?? ""); const [tags, setTags] = useState(note.tags.join(", ")); const [status, setStatus] = useState<NonNullable<Note["status"]>>(note.status ?? "pending"); const save = () => onSave(note, { title: title || null, description: description || null, note_date: date || null, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), status }); return <div className="overlay"><section className="editor-panel" role="dialog" aria-modal="true" aria-label="Editar tarefa"><div className="panel-header"><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button><span><IconGlyph name={model?.icon ?? "dot"} size={15} /> {model?.name}</span><button className="save-link" onClick={save}>Salvar</button></div><label>Título<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>{model?.enabled_fields.includes("description") && <label>Descrição<textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></label>}{model?.enabled_fields.includes("date") && <label>Data<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}{model?.enabled_fields.includes("tag") && <label>Tags <span className="muted">separadas por vírgula</span><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="reunião, urgente" /></label>}{model?.enabled_fields.includes("status") && <label>Status<select value={status} onChange={(e) => setStatus(e.target.value as NonNullable<Note["status"]>)}><option value="pending">Pendente</option><option value="in_progress">Em andamento</option><option value="completed">Concluída</option></select></label>}<div className="original-note"><span className="eyebrow">Texto original</span><p>“{note.original_content}”</p></div>{note.archived_at ? <button className="setting-action" onClick={() => onSave(note, { archived_at: null })}><Archive size={15} /> Restaurar tarefa</button> : <button className="setting-action" onClick={() => onArchive(note)}><Archive size={15} /> Arquivar tarefa</button>}<button className="danger-button" onClick={() => onDelete(note)}><Trash2 size={15} /> Excluir permanentemente</button></section></div>; }

function ModelEditor({ model, onClose, onSave }: { model: NoteModel | null; onClose: () => void; onSave: (model: NoteModel) => void }) {
  const [form, setForm] = useState<NoteModel>(model ?? ({ id: "", user_id: "", name: "", icon: "dot", color: "blue", description: "", enabled_fields: ["title", "description", "date", "tag"], organization_mode: "list", placeholders: DEFAULT_PLACEHOLDERS, visual_style: "minimal", created_at: "", updated_at: "" } as NoteModel));
  const toggleField = (field: FieldKey) => setForm({ ...form, enabled_fields: form.enabled_fields.includes(field) ? form.enabled_fields.filter((item) => item !== field) : [...form.enabled_fields, field] });
  return <div className="overlay"><section className="editor-panel model-panel" role="dialog" aria-modal="true" aria-label="Editor de módulo"><div className="panel-header"><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button><span>{model ? "Editar módulo" : "Novo módulo"}</span><button className="save-link" disabled={!form.name.trim()} onClick={() => onSave(form)}>Salvar</button></div><label>Nome<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Trabalho, Pessoal..." /></label><div className="form-grid"><label>Ícone<div className="icon-picker">{ICONS.map((icon) => <button type="button" aria-label={ICONS.find((item) => item === icon) ?? icon} className={form.icon === icon ? "picked" : ""} key={icon} onClick={() => setForm({ ...form, icon })}><IconGlyph name={icon} size={18} /></button>)}</div></label><label>Cor<div className="color-picker">{MODEL_COLORS.map((color) => <button type="button" key={color} className={`color-swatch color-${color} ${form.color === color ? "picked" : ""}`} onClick={() => setForm({ ...form, color: color as ModelColor })} aria-label={color} />)}</div></label></div><label>Descrição / contexto<textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="O que pertence aqui? O que a IA deve saber?" /></label><fieldset><legend>Campos</legend><div className="check-grid">{Object.entries(FIELD_LABELS).map(([field, label]) => <label key={field} className="check-item"><input type="checkbox" checked={form.enabled_fields.includes(field as FieldKey)} onChange={() => toggleField(field as FieldKey)} /><span>{label}</span></label>)}</div></fieldset><label>Organização<select value={form.organization_mode} onChange={(e) => setForm({ ...form, organization_mode: e.target.value as OrganizationMode })}><option value="list">Lista</option><option value="date">Data</option><option value="tags">Tags</option></select></label><label>Placeholders <span className="muted">até 5</span>{form.placeholders.map((placeholder, index) => <input key={index} value={placeholder} onChange={(e) => setForm({ ...form, placeholders: form.placeholders.map((item, itemIndex) => itemIndex === index ? e.target.value : item) })} />)}{form.placeholders.length < 5 && <button className="text-button add-line" onClick={() => setForm({ ...form, placeholders: [...form.placeholders, ""] })}><Plus size={14} /> Adicionar placeholder</button>}</label><fieldset><legend>Estilo visual</legend><div className="segmented"><button type="button" className={form.visual_style === "minimal" ? "selected" : ""} onClick={() => setForm({ ...form, visual_style: "minimal" })}>Minimalist</button><button type="button" className={form.visual_style === "ambient" ? "selected" : ""} onClick={() => setForm({ ...form, visual_style: "ambient" })}>Beauty</button></div></fieldset></section></div>;
}

function SettingsView({ theme, setTheme, visualStyle, setVisualStyle, fontFamily, setFontFamily, aiModel, setAIModel, aiEnabled, setAIEnabled, aiUsage, swipeBehavior, setSwipeBehavior, models, onEdit, onCreate, onDelete, onExport, onSignOut, email }: { theme: ThemeMode; setTheme: (theme: ThemeMode) => void; visualStyle: VisualStyle; setVisualStyle: (style: VisualStyle) => void; fontFamily: FontFamily; setFontFamily: (font: FontFamily) => void; aiModel: string; setAIModel: (model: string) => void; aiEnabled: boolean; setAIEnabled: (enabled: boolean) => void; aiUsage: { requests: number; prompt: number; output: number; total: number }; swipeBehavior: SwipeBehavior; setSwipeBehavior: (behavior: SwipeBehavior) => void; models: NoteModel[]; onEdit: (model: NoteModel) => void; onCreate: () => void; onDelete: (model: NoteModel) => void; onExport: () => void; onSignOut: () => void; email?: string }) {
  return <div className="view-panel settings-panel"><div className="view-heading"><div><p className="eyebrow">Simples de propósito</p><h1>Configurações</h1></div></div><div className="settings-section"><h2>Aparência</h2><div className="segmented full"><button className={theme === "system" ? "selected" : ""} onClick={() => setTheme("system")}>Sistema</button><button className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")}>Claro</button><button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")}>Escuro</button></div><div className="segmented full"><button className={visualStyle === "minimal" ? "selected" : ""} onClick={() => setVisualStyle("minimal")}>Minimalist</button><button className={visualStyle === "ambient" ? "selected" : ""} onClick={() => setVisualStyle("ambient")}>Beauty</button></div></div><div className="settings-section"><h2>Fonte</h2><div className="font-options">{FONT_OPTIONS.map((font) => <button key={font.value} className={`font-option ${fontFamily === font.value ? "selected" : ""}`} onClick={() => setFontFamily(font.value)}><strong>{font.label}</strong><span>{font.sample}</span></button>)}</div></div><div className="settings-section"><h2>Inteligência artificial</h2><div className="segmented full"><button className={aiEnabled ? "selected" : ""} onClick={() => setAIEnabled(true)}>IA ligada</button><button className={!aiEnabled ? "selected" : ""} onClick={() => setAIEnabled(false)}>IA desligada</button></div><p className="muted">Desligada, a IA não consome créditos. Ao salvar, o texto abre no editor para você preencher os campos manualmente.</p><label>Modelo Gemini<select disabled={!aiEnabled} value={aiModel} onChange={(event) => setAIModel(event.target.value)}>{GEMINI_MODEL_OPTIONS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</select></label><div className="usage-card"><span className="eyebrow">Uso registrado</span><strong>{aiUsage.total.toLocaleString("pt-BR")} tokens</strong><span className="muted">{aiUsage.requests} captura{aiUsage.requests === 1 ? "" : "s"} processada{aiUsage.requests === 1 ? "" : "s"}. O custo exato depende da tabela atual do Google.</span></div><p className="muted">A IA interpreta suas capturas no servidor. Sua chave nunca vai para o navegador.</p></div><div className="settings-section"><h2>Deslizar tarefas</h2><div className="segmented full"><button className={swipeBehavior === "archive" ? "selected" : ""} onClick={() => setSwipeBehavior("archive")}>Deslizar arquiva</button><button className={swipeBehavior === "reveal_delete" ? "selected" : ""} onClick={() => setSwipeBehavior("reveal_delete")}>Revelar ação</button></div><p className="muted">Arquivar remove da lista ativa, mas preserva a tarefa no histórico.</p></div><div className="settings-section"><div className="section-heading"><h2>Módulos</h2><button className="text-button" onClick={onCreate}><Plus size={14} /> Novo</button></div>{models.map((model) => <div className="model-setting" key={model.id}><span className={`note-icon color-${model.color}`}><IconGlyph name={model.icon} /></span><span>{model.name}</span><button className="text-button" onClick={() => onEdit(model)}>Editar</button><button className="icon-button quiet" onClick={() => onDelete(model)} aria-label={`Excluir ${model.name}`}><Trash2 size={15} /></button></div>)}</div><div className="settings-section"><h2>Dados</h2><button className="setting-action" onClick={onExport}><Download size={16} /> Exportar JSON</button></div><div className="settings-section account"><h2>Conta</h2><p className="muted">{email}</p><button className="setting-action" onClick={onSignOut}><LogOut size={16} /> Sair</button></div></div>;
}
