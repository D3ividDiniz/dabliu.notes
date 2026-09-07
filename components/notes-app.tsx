"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ChevronDown, Command, Download, LogIn, LogOut, Plus, Search, Settings, Sparkles, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FIELD_LABELS, MODEL_COLORS, type FieldKey, type ModelColor, type Note, type NoteModel, type OrganizationMode, type ThemeMode, type VisualStyle } from "@/lib/types";

const ICONS = ["✦", "◒", "⌁", "▦", "◌", "♢", "☼", "⌂", "♡", "⚑", "☕", "✎"];
const DEFAULT_PLACEHOLDERS = ["Escreva antes que desapareça...", "O que você precisa lembrar?", "Joga aqui."];
const AI_MODELS = [
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { value: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-flash-latest", label: "Gemini Flash (mais recente)" },
] as const;

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
  const [aiModel, setAIModel] = useState("gemini-3.6-flash");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeModel = models.find((model) => model.id === activeModelId) ?? models[0];
  const visibleNotes = notes.filter((note) => !note.deleted_at && note.ai_status !== "pending" && (!activeModelId || view !== "capture" || note.model_id === activeModelId));
  const searchResults = notes.filter((note) => !note.deleted_at && note.ai_status !== "pending" && `${note.original_content} ${note.title ?? ""} ${note.description ?? ""} ${note.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));

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
      if (preferencesResult.data) { setTheme(preferencesResult.data.theme); setVisualStyle(preferencesResult.data.visual_style); setAIModel(preferencesResult.data.ai_model ?? "gemini-3.6-flash"); }
    });
  }, [supabase, user]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.visual = activeModel?.visual_style ?? visualStyle;
  }, [theme, visualStyle, activeModel?.visual_style]);

  useEffect(() => {
    if (!supabase || !user) return;
    void supabase.from("user_preferences").upsert({ user_id: user.id, theme, visual_style: visualStyle, ai_model: aiModel });
  }, [supabase, user, theme, visualStyle, aiModel]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setView("search"); } };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return setMessage("Add Supabase environment variables to enable sign in.");
    setMessage(""); const result = authMode === "signin" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    if (result.error) setMessage(result.error.message); else if (authMode === "signup") setMessage("Check your email to confirm your account.");
  }

  async function signInWithGoogle() {
    if (!supabase) return setMessage("Add Supabase environment variables to enable sign in.");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=/` } });
    if (error) setMessage(error.message);
  }

  async function capture(content: string) {
    if (!content.trim() || !supabase || !user || !activeModel) return;
    setSaving(true); setMessage("");
    const { data, error } = await supabase.from("notes").insert({ user_id: user.id, model_id: activeModel.id, original_content: content.trim(), ai_status: "pending" }).select().single();
    if (error) { setMessage(error.message); setSaving(false); return; }
    const note = data as Note; setMessage("Interpretando e separando suas tarefas..."); if (inputRef.current) inputRef.current.value = "";
    fetch("/api/ai/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelName: activeModel.name, context: activeModel.description ?? "", fields: activeModel.enabled_fields, content, aiModel }) }).then(async (response) => {
      if (!response.ok) throw new Error("AI indisponível"); const result = await response.json();
      const parsedNotes = Array.isArray(result.notes) ? result.notes : [result];
      const first = parsedNotes[0];
      const update: Partial<Note> = { title: first.title, description: first.description, note_date: first.date || null, tags: first.tags ?? [], value: first.value, number_value: first.number, status: first.status, ai_status: "complete", ai_metadata: { provider: "gemini", split_count: parsedNotes.length } };
      await supabase.from("notes").update(update).eq("id", note.id);
      const additional = parsedNotes.slice(1).map((parsed: { title?: string | null; description?: string | null; date?: string | null; tags?: string[]; value?: number | null; number?: number | null; status?: Note["status"] }) => ({ user_id: user.id, model_id: activeModel.id, original_content: content.trim(), title: parsed.title ?? null, description: parsed.description ?? null, note_date: parsed.date || null, tags: parsed.tags ?? [], value: parsed.value ?? null, number_value: parsed.number ?? null, status: parsed.status ?? null, ai_status: "complete", ai_metadata: { provider: "gemini", split_count: parsedNotes.length } }));
      const inserted = additional.length ? await supabase.from("notes").insert(additional).select() : { data: [] as Note[] };
      const completed = { ...note, ...update };
      setNotes((current) => [...(inserted.data as Note[] ?? []), completed, ...current]);
      if (parsedNotes.length > 1) setMessage(`${parsedNotes.length} tarefas criadas a partir do seu texto.`);
    }).catch(async () => { await supabase.from("notes").update({ ai_status: "failed" }).eq("id", note.id); setNotes((current) => [{ ...note, ai_status: "failed" }, ...current]); setMessage("Texto salvo. A interpretação por IA falhou, mas nada foi perdido."); }).finally(() => setSaving(false));
  }

  async function saveModel(form: NoteModel) {
    if (!supabase || !user) return;
    const payload = { name: form.name, icon: form.icon, color: form.color, description: form.description, enabled_fields: form.enabled_fields, organization_mode: form.organization_mode, placeholders: form.placeholders.filter(Boolean).slice(0, 5), visual_style: form.visual_style };
    const result = form.id ? await supabase.from("models").update(payload).eq("id", form.id).select().single() : await supabase.from("models").insert({ ...payload, user_id: user.id }).select().single();
    if (result.error) return setMessage(result.error.message);
    const saved = result.data as NoteModel; setModels((current) => form.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]); setActiveModelId(saved.id); setShowModelEditor(false); setEditingModel(null);
  }

  async function deleteModel(model: NoteModel) {
    if (!supabase || !window.confirm(`Delete ${model.name}? Existing notes will stay safe and become unassigned.`)) return;
    // Keep notes recoverable by removing the model only after the user confirms. The DB restricts deletion while notes exist.
    const { error } = await supabase.from("models").delete().eq("id", model.id);
    if (error) setMessage("This model still has notes. Delete or export those notes first."); else { setModels((current) => current.filter((item) => item.id !== model.id)); setActiveModelId(models.find((item) => item.id !== model.id)?.id ?? null); }
  }

  async function updateNote(note: Note, updates: Partial<Note>) {
    if (!supabase) return; const { error } = await supabase.from("notes").update(updates).eq("id", note.id); if (error) return setMessage(error.message); setNotes((current) => current.map((item) => item.id === note.id ? { ...item, ...updates } : item)); setSelectedNote({ ...note, ...updates });
  }

  async function deleteNote(note: Note) {
    if (!supabase || !window.confirm("Excluir esta tarefa? Ela poderá ser recuperada depois.")) return;
    const { error } = await supabase.from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", note.id);
    if (error) return setMessage(error.message);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    setSelectedNote(null);
    setMessage("Tarefa movida para a lixeira.");
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
      <nav className="model-nav" aria-label="Models">
        {models.map((model) => <button key={model.id} className={`model-chip color-${model.color} ${model.id === activeModel?.id ? "active" : ""}`} onClick={() => { setActiveModelId(model.id); setView("capture"); }} aria-label={model.name} aria-pressed={model.id === activeModel?.id}>{model.icon}</button>)}
        <button className="icon-button quiet" onClick={() => { setEditingModel(null); setShowModelEditor(true); }} aria-label="Create model"><Plus size={17} /></button>
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
        <div className="context-line"><span className={`status-dot color-${activeModel?.color ?? "gray"}`} /> {activeModel?.name ?? "Crie seu primeiro Model"}<span className="context-description">{activeModel?.description ?? "Um lugar tranquilo para suas ideias."}</span></div>
        {!activeModel ? <EmptyModels onCreate={() => setShowModelEditor(true)} /> : <>
          <form className="capture-form" onSubmit={(event) => { event.preventDefault(); void capture(inputRef.current?.value ?? ""); }}>
            <textarea ref={inputRef} autoFocus rows={3} placeholder={activeModel.placeholders?.[0] ?? DEFAULT_PLACEHOLDERS[0]} aria-label={`Capture a note in ${activeModel.name}`} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className="capture-hint"><span>shift + enter para uma nova linha</span><button className="save-button" disabled={saving} type="submit">{saving ? "Salvando" : "Salvar"}<span>↵</span></button></div>
          </form>
          <NoteFeed notes={visibleNotes.slice(0, 12)} models={models} onSelect={setSelectedNote} onOpenHistory={() => setView("history")} />
        </>}
      </>}
      {view === "history" && <HistoryView notes={visibleNotes} models={models} onFilter={(id) => { setActiveModelId(id); }} onSelect={setSelectedNote} />}
      {view === "search" && <SearchView query={query} setQuery={setQuery} results={searchResults} models={models} onSelect={setSelectedNote} />}
      {view === "settings" && <SettingsView theme={theme} setTheme={setTheme} visualStyle={visualStyle} setVisualStyle={setVisualStyle} aiModel={aiModel} setAIModel={setAIModel} models={models} onEdit={(model) => { setEditingModel(model); setShowModelEditor(true); }} onCreate={() => { setEditingModel(null); setShowModelEditor(true); }} onDelete={deleteModel} onExport={exportData} onSignOut={() => supabase?.auth.signOut()} email={user.email} />}
    </section>
    {selectedNote && <NoteEditor note={selectedNote} model={models.find((item) => item.id === selectedNote.model_id)} onClose={() => setSelectedNote(null)} onSave={updateNote} onDelete={deleteNote} />}
    {showModelEditor && <ModelEditor model={editingModel} onClose={() => { setShowModelEditor(false); setEditingModel(null); }} onSave={saveModel} />}
  </main>;
}

function AuthScreen(props: { email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void; authMode: "signin" | "signup"; setAuthMode: (value: "signin" | "signup") => void; signIn: (event: React.FormEvent) => void; signInWithGoogle: () => void; message: string }) {
  return <main className="auth-screen"><div className="auth-card"><span className="wordmark">W</span><p className="eyebrow">Dabliu.notes</p><h1>Guarde a ideia.</h1><p className="muted">Um lugar simples para capturar o que importa, no seu contexto.</p><button className="google-button" onClick={props.signInWithGoogle}><LogIn size={16} /> Continuar com Google</button><div className="divider"><span>ou use seu e-mail</span></div><form onSubmit={props.signIn}><label>E-mail<input type="email" required value={props.email} onChange={(e) => props.setEmail(e.target.value)} /></label><label>Senha<input type="password" minLength={6} required value={props.password} onChange={(e) => props.setPassword(e.target.value)} /></label>{props.message && <p className="form-error">{props.message}</p>}<button className="primary-button" type="submit">{props.authMode === "signin" ? "Entrar" : "Criar conta"}</button></form><button className="text-button" onClick={() => props.setAuthMode(props.authMode === "signin" ? "signup" : "signin")}>{props.authMode === "signin" ? "Criar uma conta" : "Já tenho uma conta"}</button></div></main>;
}

function EmptyModels({ onCreate }: { onCreate: () => void }) { return <div className="empty-state"><Sparkles size={18} /><h2>Crie seu primeiro Model.</h2><p>Escolha um contexto para organizar o que você quer lembrar.</p><button className="primary-button" onClick={onCreate}><Plus size={16} /> Novo Model</button></div>; }

function NoteFeed({ notes, models, onSelect, onOpenHistory }: { notes: Note[]; models: NoteModel[]; onSelect: (note: Note) => void; onOpenHistory: () => void }) { return <section className="feed"><div className="section-heading"><span>Recentes</span><button className="text-button" onClick={onOpenHistory}>Ver histórico <ChevronDown size={14} /></button></div>{notes.length === 0 ? <p className="empty-copy">Nada por aqui ainda.</p> : notes.map((note) => <NoteRow key={note.id} note={note} model={models.find((item) => item.id === note.model_id)} onClick={() => onSelect(note)} />)}</section>; }

function NoteRow({ note, model, onClick }: { note: Note; model?: NoteModel; onClick: () => void }) { return <button className="note-row" onClick={onClick}><span className={`note-icon color-${model?.color ?? "gray"}`}>{model?.icon ?? "·"}</span><span className="note-copy"><strong>{note.title || note.original_content.slice(0, 72)}</strong><span>{note.description || note.original_content}</span></span><time>{groupLabel(note.created_at)}</time></button>; }

function HistoryView({ notes, models, onFilter, onSelect }: { notes: Note[]; models: NoteModel[]; onFilter: (id: string | null) => void; onSelect: (note: Note) => void }) { const [filter, setFilter] = useState<string | null>(null); const shown = filter ? notes.filter((note) => note.model_id === filter) : notes; return <div className="view-panel"><div className="view-heading"><div><p className="eyebrow">Tudo o que você anotou</p><h1>Histórico</h1></div><select value={filter ?? "all"} onChange={(e) => { const value = e.target.value === "all" ? null : e.target.value; setFilter(value); onFilter(value); }} aria-label="Filtrar histórico por Model"><option value="all">Todos os Models</option>{models.map((model) => <option value={model.id} key={model.id}>{model.icon} {model.name}</option>)}</select></div><div className="history-list">{shown.length ? shown.map((note) => <NoteRow key={note.id} note={note} model={models.find((item) => item.id === note.model_id)} onClick={() => onSelect(note)} />) : <p className="empty-copy">Nada por aqui ainda.</p>}</div></div>; }

function SearchView({ query, setQuery, results, models, onSelect }: { query: string; setQuery: (value: string) => void; results: Note[]; models: NoteModel[]; onSelect: (note: Note) => void }) { return <div className="view-panel"><div className="search-box"><Search size={18} /><input autoFocus placeholder="Buscar suas notas" value={query} onChange={(e) => setQuery(e.target.value)} /><kbd><Command size={12} /> K</kbd></div><p className="result-count">{query ? `${results.length} resultado${results.length === 1 ? "" : "s"}` : "Busque em todas as suas notas"}</p>{query && (results.length ? results.map((note) => <NoteRow key={note.id} note={note} model={models.find((item) => item.id === note.model_id)} onClick={() => onSelect(note)} />) : <p className="empty-copy">Nenhuma nota encontrada.</p>)}</div>; }

function NoteEditor({ note, model, onClose, onSave, onDelete }: { note: Note; model?: NoteModel; onClose: () => void; onSave: (note: Note, updates: Partial<Note>) => void; onDelete: (note: Note) => void }) { const [title, setTitle] = useState(note.title ?? ""); const [description, setDescription] = useState(note.description ?? ""); const [status, setStatus] = useState<NonNullable<Note["status"]>>(note.status ?? "pending"); return <div className="overlay"><section className="editor-panel" role="dialog" aria-modal="true" aria-label="Editar tarefa"><div className="panel-header"><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button><span>{model?.icon} {model?.name}</span><button className="save-link" onClick={() => onSave(note, { title: title || null, description: description || null, status })}>Salvar</button></div><label>Título<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>{model?.enabled_fields.includes("description") && <label>Descrição<textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></label>}{model?.enabled_fields.includes("status") && <label>Status<select value={status} onChange={(e) => setStatus(e.target.value as NonNullable<Note["status"]>)}><option value="pending">Pendente</option><option value="in_progress">Em andamento</option><option value="completed">Concluída</option></select></label>}<div className="original-note"><span className="eyebrow">Texto original</span><p>“{note.original_content}”</p></div><button className="danger-button" onClick={() => onDelete(note)}><Trash2 size={15} /> Excluir tarefa</button></section></div>; }

function ModelEditor({ model, onClose, onSave }: { model: NoteModel | null; onClose: () => void; onSave: (model: NoteModel) => void }) { const [form, setForm] = useState<NoteModel>(model ?? ({ id: "", user_id: "", name: "", icon: "✦", color: "blue", description: "", enabled_fields: ["title", "description", "date", "tag"], organization_mode: "list", placeholders: DEFAULT_PLACEHOLDERS, visual_style: "minimal", created_at: "", updated_at: "" } as NoteModel)); const toggleField = (field: FieldKey) => setForm({ ...form, enabled_fields: form.enabled_fields.includes(field) ? form.enabled_fields.filter((item) => item !== field) : [...form.enabled_fields, field] }); return <div className="overlay"><section className="editor-panel model-panel" role="dialog" aria-modal="true" aria-label="Model editor"><div className="panel-header"><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button><span>{model ? "Edit Model" : "New Model"}</span><button className="save-link" disabled={!form.name.trim()} onClick={() => onSave(form)}>Save</button></div><label>Name<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Work, Personal..." /></label><div className="form-grid"><label>Icon<div className="icon-picker">{ICONS.map((icon) => <button type="button" className={form.icon === icon ? "picked" : ""} key={icon} onClick={() => setForm({ ...form, icon })}>{icon}</button>)}</div></label><label>Color<div className="color-picker">{MODEL_COLORS.map((color) => <button type="button" key={color} className={`color-swatch color-${color} ${form.color === color ? "picked" : ""}`} onClick={() => setForm({ ...form, color: color as ModelColor })} aria-label={color} />)}</div></label></div><label>Description / context<textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What belongs here? What should the assistant know?" /></label><fieldset><legend>Fields</legend><div className="check-grid">{Object.entries(FIELD_LABELS).map(([field, label]) => <label key={field} className="check-item"><input type="checkbox" checked={form.enabled_fields.includes(field as FieldKey)} onChange={() => toggleField(field as FieldKey)} /><span>{label}</span></label>)}</div></fieldset><label>Organization<select value={form.organization_mode} onChange={(e) => setForm({ ...form, organization_mode: e.target.value as OrganizationMode })}><option value="list">List</option><option value="date">Date</option><option value="tags">Tags</option></select></label><label>Placeholders <span className="muted">up to 5</span>{form.placeholders.map((placeholder, index) => <input key={index} value={placeholder} onChange={(e) => setForm({ ...form, placeholders: form.placeholders.map((item, itemIndex) => itemIndex === index ? e.target.value : item) })} />)}{form.placeholders.length < 5 && <button className="text-button add-line" onClick={() => setForm({ ...form, placeholders: [...form.placeholders, ""] })}><Plus size={14} /> Add placeholder</button>}</label><fieldset><legend>Visual style</legend><div className="segmented"><button type="button" className={form.visual_style === "minimal" ? "selected" : ""} onClick={() => setForm({ ...form, visual_style: "minimal" })}>Minimal</button><button type="button" className={form.visual_style === "ambient" ? "selected" : ""} onClick={() => setForm({ ...form, visual_style: "ambient" })}>Ambient</button></div></fieldset></section></div>; }

function SettingsView({ theme, setTheme, visualStyle, setVisualStyle, aiModel, setAIModel, models, onEdit, onCreate, onDelete, onExport, onSignOut, email }: { theme: ThemeMode; setTheme: (theme: ThemeMode) => void; visualStyle: VisualStyle; setVisualStyle: (style: VisualStyle) => void; aiModel: string; setAIModel: (model: string) => void; models: NoteModel[]; onEdit: (model: NoteModel) => void; onCreate: () => void; onDelete: (model: NoteModel) => void; onExport: () => void; onSignOut: () => void; email?: string }) {
  return <div className="view-panel settings-panel"><div className="view-heading"><div><p className="eyebrow">Simples de propósito</p><h1>Configurações</h1></div></div><div className="settings-section"><h2>Aparência</h2><div className="segmented full"><button className={theme === "system" ? "selected" : ""} onClick={() => setTheme("system")}>Sistema</button><button className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")}>Claro</button><button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")}>Escuro</button></div><div className="segmented full"><button className={visualStyle === "minimal" ? "selected" : ""} onClick={() => setVisualStyle("minimal")}>Minimal</button><button className={visualStyle === "ambient" ? "selected" : ""} onClick={() => setVisualStyle("ambient")}>Ambiente</button></div></div><div className="settings-section"><h2>Inteligência artificial</h2><label>Modelo Gemini<select value={aiModel} onChange={(event) => setAIModel(event.target.value)}>{AI_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</select></label><p className="muted">A IA interpreta suas capturas no servidor. Sua chave nunca vai para o navegador.</p></div><div className="settings-section"><div className="section-heading"><h2>Models</h2><button className="text-button" onClick={onCreate}><Plus size={14} /> Novo</button></div>{models.map((model) => <div className="model-setting" key={model.id}><span className={`note-icon color-${model.color}`}>{model.icon}</span><span>{model.name}</span><button className="text-button" onClick={() => onEdit(model)}>Editar</button><button className="icon-button quiet" onClick={() => onDelete(model)} aria-label={`Excluir ${model.name}`}><Trash2 size={15} /></button></div>)}</div><div className="settings-section"><h2>Dados</h2><button className="setting-action" onClick={onExport}><Download size={16} /> Exportar JSON</button></div><div className="settings-section account"><h2>Conta</h2><p className="muted">{email}</p><button className="setting-action" onClick={onSignOut}><LogOut size={16} /> Sair</button></div></div>;
}
