// ===== طبقة البيانات (Data Layer) =====
// تدعم Supabase ( production ) والوضع التجريبي ( localStorage )

(function () {
  const cfg = window.APP_CONFIG;
  const isDemo = !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT") ||
                 !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY");

  window.IS_DEMO = isDemo;

  // ---------- helpers ----------
  function uid() { return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function todayISO() { const d = new Date(); return d.toISOString().slice(0, 10); }
  function weekStart(dateStr) {
    // Monday as start of week
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay(); // 0 Sun .. 6 Sat
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  window.WeekUtils = { weekStart, addDays, todayISO };

  const EVALUATORS = [
    { key: "father",  name: "الأب" },
    { key: "brother", name: "الأخ" },
    { key: "doctor",  name: "الدكتورة" }
  ];
  window.EVALUATORS = EVALUATORS;

  // ============================================================
  // DEMO MODE (localStorage)
  // ============================================================
  const DemoStore = {
    _users: null,
    _session: null,
    init() {
      if (!localStorage.getItem("demo_users")) {
        localStorage.setItem("demo_users", JSON.stringify((cfg.DEMO_USERS || []).map(u => ({
          id: uid(), username: u.username, password: u.password,
          displayName: u.displayName, role: u.role, evaluatorKey: u.evaluatorKey,
          avatar: u.avatar || "👤", bio: "", settings: {}
        }))));
      }
      if (!localStorage.getItem("demo_evals")) localStorage.setItem("demo_evals", JSON.stringify([]));
      this._session = JSON.parse(localStorage.getItem("demo_session") || "null");
    },
    async signIn(username, password) {
      const users = JSON.parse(localStorage.getItem("demo_users"));
      const u = users.find(x => x.username === username && x.password === password);
      if (!u) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
      this._session = { user: { id: u.id } };
      localStorage.setItem("demo_session", JSON.stringify(this._session));
      localStorage.setItem("demo_current_user", JSON.stringify(u));
      return { user: this._session.user };
    },
    async signOut() {
      this._session = null;
      localStorage.removeItem("demo_session");
      localStorage.removeItem("demo_current_user");
    },
    async getSession() {
      this._session = JSON.parse(localStorage.getItem("demo_session") || "null");
      return this._session;
    },
    async getProfile() {
      const u = JSON.parse(localStorage.getItem("demo_current_user") || "null");
      if (!u) return null;
      u.bio = u.bio || "";
      u.avatar = u.avatar || "👤";
      u.settings = u.settings || {};
      u.displayName = u.displayName || u.username;
      return u;
    },
    async listProfiles() {
      return JSON.parse(localStorage.getItem("demo_users"));
    },
    async listEvaluations(filters) {
      let evals = JSON.parse(localStorage.getItem("demo_evals") || "[]");
      if (filters && filters.userId) evals = evals.filter(e => e.user_id === filters.userId);
      if (filters && filters.evaluatorKey) evals = evals.filter(e => e.evaluator_key === filters.evaluatorKey);
      if (filters && filters.weekStart) evals = evals.filter(e => WeekUtils.weekStart(e.eval_date) === filters.weekStart);
      if (filters && filters.from) evals = evals.filter(e => e.eval_date >= filters.from);
      if (filters && filters.to) evals = evals.filter(e => e.eval_date <= filters.to);
      return evals.sort((a,b) => b.eval_date.localeCompare(a.eval_date));
    },
    async getEvaluation(id) {
      const evals = JSON.parse(localStorage.getItem("demo_evals") || "[]");
      return evals.find(e => e.id === id) || null;
    },
    async upsertEvaluation(data) {
      const evals = JSON.parse(localStorage.getItem("demo_evals") || "[]");
      const now = new Date().toISOString();
      const rec = { id: uid(), ...data, created_at: now, updated_at: now };
      evals.push(rec);
      localStorage.setItem("demo_evals", JSON.stringify(evals));
      return rec;
    },
    async updateEvaluation(id, data) {
      const evals = JSON.parse(localStorage.getItem("demo_evals") || "[]");
      const idx = evals.findIndex(e => e.id === id);
      if (idx < 0) throw new Error("Evaluation not found");
      evals[idx] = { ...evals[idx], ...data, updated_at: new Date().toISOString() };
      localStorage.setItem("demo_evals", JSON.stringify(evals));
      return evals[idx];
    },
    async deleteEvaluation(id) {
      const evals = JSON.parse(localStorage.getItem("demo_evals") || "[]");
      localStorage.setItem("demo_evals", JSON.stringify(evals.filter(e => e.id !== id)));
    }
  };

  // ============================================================
  // SUPABASE MODE
  // ============================================================
  let sb = null;
  function mapProfile(d) {
    return {
      id: d.id, username: d.username, displayName: d.display_name,
      role: d.role, evaluatorKey: d.evaluator_key,
      bio: d.bio || "", avatar: d.avatar || "👤",
      settings: d.settings || {}
    };
  }
  const SupaStore = {
    async init() {
      if (!window.supabase) {
        // load script dynamically
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    },
    async signIn(username, password) {
      const email = username.toLowerCase() + "@example.com";
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
      return data;
    },
    async signOut() { await sb.auth.signOut(); },
    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    async getProfile() {
      const session = await this.getSession();
      if (!session) return null;
      const { data, error } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (error || !data) return null;
      return mapProfile(data);
    },
    async listProfiles() {
      const { data, error } = await sb.from("profiles").select("*");
      if (error) throw error;
      return (data || []).map(d => ({
        id: d.id, username: d.username, displayName: d.display_name,
        role: d.role, evaluatorKey: d.evaluator_key,
        bio: d.bio || "", avatar: d.avatar || "👤",
        settings: d.settings || {}
      }));
    },
    async listEvaluations(filters) {
      let q = sb.from("evaluations").select("*").order("eval_date", { ascending: false });
      if (filters && filters.userId) q = q.eq("user_id", filters.userId);
      if (filters && filters.evaluatorKey) q = q.eq("evaluator_key", filters.evaluatorKey);
      if (filters && filters.weekStart) {
        // filter by date range of that week
        const start = filters.weekStart;
        const end = WeekUtils.addDays(start, 6);
        q = q.gte("eval_date", start).lte("eval_date", end);
      }
      if (filters && filters.from) q = q.gte("eval_date", filters.from);
      if (filters && filters.to) q = q.lte("eval_date", filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(d => ({
        id: d.id, user_id: d.user_id, evaluator_key: d.evaluator_key,
        eval_date: d.eval_date, positives: d.positives, negatives: d.negatives,
        score: Number(d.score), tags: d.tags || [], created_at: d.created_at, updated_at: d.updated_at
      }));
    },
    async getEvaluation(id) {
      const { data, error } = await sb.from("evaluations").select("*").eq("id", id).single();
      if (error) return null;
      return { id: data.id, user_id: data.user_id, evaluator_key: data.evaluator_key,
        eval_date: data.eval_date, positives: data.positives, negatives: data.negatives,
        score: Number(data.score), created_at: data.created_at, updated_at: data.updated_at };
    },
    async upsertEvaluation(data) {
      const { data: ins, error } = await sb.from("evaluations").insert({
        user_id: data.user_id, evaluator_key: data.evaluator_key, eval_date: data.eval_date,
        positives: data.positives, negatives: data.negatives, score: data.score,
        tags: data.tags || []
      }).select().single();
      if (error) throw error;
      return { id: ins.id, user_id: ins.user_id, evaluator_key: ins.evaluator_key, eval_date: ins.eval_date,
        positives: ins.positives, negatives: ins.negatives, score: Number(ins.score), created_at: ins.created_at };
    },
    async updateEvaluation(id, data) {
      const { data: upd, error } = await sb.from("evaluations").update({
        positives: data.positives, negatives: data.negatives, score: data.score, evaluator_key: data.evaluator_key,
        tags: data.tags || [], eval_date: data.eval_date
      }).eq("id", id).select().single();
      if (error) throw error;
      return { id: upd.id, user_id: upd.user_id, evaluator_key: upd.evaluator_key, eval_date: upd.eval_date,
        positives: upd.positives, negatives: upd.negatives, score: Number(upd.score), updated_at: upd.updated_at };
    }
  };

  window.Store = isDemo ? DemoStore : SupaStore;
  window.IS_DEMO = isDemo;

  // ---------- signUp (مشترك) ----------
  const SPECIAL_EVALUATORS = {
    father:  { displayName: "الأب",         role: "evaluator", evaluatorKey: "father", avatar: "👨" },
    brother: { displayName: "الأخ",         role: "evaluator", evaluatorKey: "brother", avatar: "👦" },
    doctor:  { displayName: "الدكتورة",     role: "evaluator", evaluatorKey: "doctor", avatar: "👩‍⚕️" },
    me:      { displayName: "أنا (المشاهد)", role: "viewer",    evaluatorKey: null, avatar: "🙋" }
  };

  async function signUp(username, password, role, code) {
    const u = username.toLowerCase().trim();
    if (!/^[a-z0-9_]{2,20}$/.test(u)) throw new Error("اسم المستخدم: 2-20 حرفًا، أحرف/أرقام/underscore فقط");
    if (!password || password.length < 6) throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    const special = SPECIAL_EVALUATORS[u];
    const chosenRole = role === "evaluator" ? "evaluator" : "viewer";
    const displayName = special ? special.displayName : username.trim();
    const finalRole = special ? special.role : chosenRole;
    const evaluatorKey = special ? special.evaluatorKey : (finalRole === "evaluator" ? u : null);
    const avatar = special ? special.avatar : (finalRole === "evaluator" ? "👨‍💼" : "👤");

    // فقط الهويات الثلاث المعتمدة يمكنها التسجيل كمُقيّم.
    if (finalRole === "evaluator" && !["father", "brother", "doctor"].includes(evaluatorKey)) {
      throw new Error("اسم المستخدم للمُقيّم يجب أن يكون father أو brother أو doctor");
    }

    // رمز المشاهد يُتحقق منه على السيرفر (غير مخزّن في كود المتصفح).
    if (finalRole === "viewer") {
      if (window.IS_DEMO) {
        if (!code || code.length < 4) throw new Error("رمز المشاهد غير صحيح");
      } else {
        const { data: ok, error } = await sb.rpc("check_viewer_code", { p_code: code || "" });
        if (error || !ok) throw new Error("رمز المشاهد غير صحيح");
      }
    }

    if (window.IS_DEMO) {
      const users = JSON.parse(localStorage.getItem("demo_users"));
      if (users.find(x => x.username === u)) throw new Error("هذا الحساب موجود مسبقًا، سجّل الدخول");
      const nu = { id: uid(), username: u, password, displayName, role: finalRole, evaluatorKey, avatar,
        bio: "", settings: {} };
      users.push(nu);
      localStorage.setItem("demo_users", JSON.stringify(users));
      return { user: { id: nu.id } };
    } else {
      const email = u + "@example.com";
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: u,
            display_name: displayName,
            role: finalRole,
            evaluator_key: evaluatorKey,
            avatar,
            viewer_code: code || ""
          }
        }
      });
      if (error) throw new Error(error.message);
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error("هذا الحساب موجود مسبقًا، سجّل الدخول");
      }
      if (!data.session) {
        throw new Error("تم إنشاء الحساب، لكن يلزم تأكيد البريد الإلكتروني قبل الدخول.");
      }
      return data;
    }
  }
  window.signUp = signUp;

  // ---------- Comments ----------
  async function listComments(evaluationId) {
    if (window.IS_DEMO) {
      const all = JSON.parse(localStorage.getItem("demo_comments") || "[]");
      return all.filter(c => c.evaluation_id === evaluationId).sort((a,b) => a.created_at.localeCompare(b.created_at));
    } else {
      const { data, error } = await sb.from("comments").select("*").eq("evaluation_id", evaluationId).order("created_at");
      if (error) throw error;
      return (data || []).map(d => ({ id: d.id, evaluation_id: d.evaluation_id, user_id: d.user_id, content: d.content, created_at: d.created_at }));
    }
  }
  async function addComment(evaluationId, content) {
    if (!content.trim()) throw new Error("تعليق فارغ");
    if (window.IS_DEMO) {
      const all = JSON.parse(localStorage.getItem("demo_comments") || "[]");
      const profile = await Store.getProfile();
      const c = { id: uid(), evaluation_id: evaluationId, user_id: profile.id, content: content.trim(), created_at: new Date().toISOString(), author: profile.displayName, avatar: profile.avatar };
      all.push(c);
      localStorage.setItem("demo_comments", JSON.stringify(all));
      return c;
    } else {
      const profile = await Store.getProfile();
      const { data, error } = await sb.from("comments").insert({ evaluation_id: evaluationId, user_id: profile.id, content: content.trim() }).select().single();
      if (error) throw error;
      return { id: data.id, evaluation_id: data.evaluation_id, user_id: data.user_id, content: data.content, created_at: data.created_at, author: profile.displayName, avatar: profile.avatar };
    }
  }
  async function deleteComment(id) {
    if (window.IS_DEMO) {
      const all = JSON.parse(localStorage.getItem("demo_comments") || "[]");
      localStorage.setItem("demo_comments", JSON.stringify(all.filter(c => c.id !== id)));
      return true;
    } else {
      const { error } = await sb.from("comments").delete().eq("id", id);
      if (error) throw error;
      return true;
    }
  }
  window.listComments = listComments;
  window.addComment = addComment;
  window.deleteComment = deleteComment;

  // ---------- Goals ----------
  async function getGoal(weekStart) {
    if (window.IS_DEMO) {
      const all = JSON.parse(localStorage.getItem("demo_goals") || "[]");
      const profile = await Store.getProfile();
      return all.find(g => g.user_id === profile.id && g.week_start === weekStart) || null;
    } else {
      const profile = await Store.getProfile();
      const { data, error } = await sb.from("goals").select("*").eq("user_id", profile.id).eq("week_start", weekStart).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, user_id: data.user_id, target_score: Number(data.target_score), week_start: data.week_start } : null;
    }
  }
  async function setGoal(weekStart, targetScore) {
    if (window.IS_DEMO) {
      const all = JSON.parse(localStorage.getItem("demo_goals") || "[]");
      const profile = await Store.getProfile();
      const idx = all.findIndex(g => g.user_id === profile.id && g.week_start === weekStart);
      if (idx >= 0) all[idx].target_score = targetScore;
      else all.push({ id: uid(), user_id: profile.id, week_start: weekStart, target_score: targetScore, created_at: new Date().toISOString() });
      localStorage.setItem("demo_goals", JSON.stringify(all));
      return await getGoal(weekStart);
    } else {
      const profile = await Store.getProfile();
      // upsert
      const { data: existing } = await sb.from("goals").select("id").eq("user_id", profile.id).eq("week_start", weekStart).maybeSingle();
      if (existing) {
        const { error } = await sb.from("goals").update({ target_score: targetScore }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("goals").insert({ user_id: profile.id, week_start: weekStart, target_score: targetScore });
        if (error) throw error;
      }
      return await getGoal(weekStart);
    }
  }
  window.getGoal = getGoal;
  window.setGoal = setGoal;

  // ---------- Achievements (computed) ----------
  function computeAchievements(evals) {
    const badges = [];
    if (evals.length >= 1) badges.push({ icon: "🌱", name: "أول تقييم", desc: "أول تقييم مُسجّل" });
    if (evals.length >= 7) badges.push({ icon: "🔥", name: "7 تقييمات", desc: "7 تقييمات مُسجّلة" });
    if (evals.length >= 30) badges.push({ icon: "🏆", name: "30 تقييم", desc: "30 تقييم مُسجّل" });
    // streak
    const dates = [...new Set(evals.map(e => e.eval_date))].sort();
    let streak = 0, maxStreak = 0, prev = null;
    for (const d of dates) {
      if (prev) {
        const diff = (new Date(d) - new Date(prev)) / (1000*60*60*24);
        if (diff === 1) streak++; else streak = 1;
      } else streak = 1;
      maxStreak = Math.max(maxStreak, streak);
      prev = d;
    }
    if (maxStreak >= 3) badges.push({ icon: "⚡", name: "3 أيام متتالية", desc: "3 تقييمات متتالية" });
    if (maxStreak >= 7) badges.push({ icon: "🌟", name: "أسبوع كامل", desc: "7 تقييمات متتالية" });
    if (evals.some(e => Number(e.score) === 10)) badges.push({ icon: "💯", name: "درجة كاملة", desc: "حصلت على 10/10" });
    const avg = evals.length ? evals.reduce((a,b)=>a+Number(b.score),0)/evals.length : 0;
    if (avg >= 8) badges.push({ icon: "📈", name: "متوسط عالٍ", desc: "متوسط ≥ 8" });
    return badges;
  }
  window.computeAchievements = computeAchievements;

  // ---------- Export helpers ----------
  function exportCSV(evals, filename) {
    const header = ["التاريخ","المُقيّم","الدرجة","الإيجابيات","السلبيات","الوسوم"];
    const rows = evals.map(e => [
      e.eval_date,
      e.evaluator_key,
      e.score,
      (e.positives||"").replace(/"/g,'""'),
      (e.negatives||"").replace(/"/g,'""'),
      (e.tags||[]).join(";")
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename || "evaluations.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  window.exportCSV = exportCSV;

  // ---------- Notifications ----------
  async function requestNotificationPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission !== "denied") {
      const p = await Notification.requestPermission();
      return p;
    }
    return Notification.permission;
  }
  function notify(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-192.png" });
    }
  }
  window.requestNotificationPermission = requestNotificationPermission;
  window.notify = notify;

  // ---------- profile update / password change ----------
  async function updateProfile(data) {
    const profile = await Store.getProfile();
    const userId = profile.id;
    if (window.IS_DEMO) {
      const users = JSON.parse(localStorage.getItem("demo_users"));
      const idx = users.findIndex(u => u.id === userId);
      if (idx < 0) throw new Error("not found");
      users[idx] = { ...users[idx], ...data };
      if (data.displayName !== undefined) users[idx].displayName = data.displayName;
      if (data.avatar !== undefined) users[idx].avatar = data.avatar;
      if (data.bio !== undefined) users[idx].bio = data.bio;
      if (data.settings !== undefined) users[idx].settings = data.settings;
      localStorage.setItem("demo_users", JSON.stringify(users));
      const cur = JSON.parse(localStorage.getItem("demo_current_user") || "null");
      if (cur && cur.id === userId) localStorage.setItem("demo_current_user", JSON.stringify(users[idx]));
      return await Store.getProfile();
    } else {
      const { error } = await sb.from("profiles").update({
        display_name: data.displayName,
        bio: data.bio,
        avatar: data.avatar,
        settings: data.settings
      }).eq("id", userId);
      if (error) throw new Error(error.message);
      return await SupaStore.getProfile();
    }
  }
  window.updateProfile = updateProfile;



  async function changePassword(oldPw, newPw) {
    if (!newPw || newPw.length < 6) throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    const profile = await Store.getProfile();
    if (window.IS_DEMO) {
      const users = JSON.parse(localStorage.getItem("demo_users"));
      const idx = users.findIndex(u => u.id === profile.id);
      if (idx < 0) throw new Error("not found");
      if (users[idx].password !== oldPw) throw new Error("كلمة المرور الحالية غير صحيحة");
      users[idx].password = newPw;
      localStorage.setItem("demo_users", JSON.stringify(users));
      return true;
    } else {
      const email = profile.username + "@example.com";
      const { error: signInErr } = await sb.auth.signInWithPassword({ email, password: oldPw });
      if (signInErr) throw new Error("كلمة المرور الحالية غير صحيحة");
      const { error } = await sb.auth.updateUser({ password: newPw });
      if (error) throw new Error(error.message);
      return true;
    }
  }
  window.changePassword = changePassword;





  // initialize
  window.StoreReady = (async () => {
    DemoStore.init();
    if (!isDemo) await SupaStore.init();
  })();
})();
