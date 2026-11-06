// ===== التطبيق الرئيسي =====
(async function () {
  const root = document.getElementById("root");
  let currentUser = null;
  let currentView = "dashboard";
  let currentWeekStart = WeekUtils.weekStart(WeekUtils.todayISO());
  let selectedScore = null;
  let editingEvalId = null;

  await window.StoreReady;

  // ---------- helpers ----------
  function toast(msg, type) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }
  window.toast = toast;

  function esc(s) { return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  async function refreshSession() {
    const session = await Store.getSession();
    if (!session) { currentUser = null; return false; }
    currentUser = await Store.getProfile();
    return !!currentUser;
  }

  // ---------- render entry ----------
  async function boot() {
    const ok = await refreshSession();
    if (ok) renderApp(); else renderLogin();
  }

  // ---------- LOGIN ----------
  function renderLogin() {
    root.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="logo-big">ت</div>
          <h2>نظام التقييم والمتابعة</h2>
          <p>سجّل دخولك للمتابعة</p>
          ${window.IS_DEMO ? '<div class="demo-banner">⚠️ وضع تجريبي — البيانات محفوظة على هذا الجهاز فقط.</div>' : ''}
          <div class="login-tabs">
            <button class="active" data-tab="login">تسجيل الدخول</button>
            <button data-tab="register">إنشاء حساب</button>
          </div>
          <div id="loginForm">
            <div class="form-group">
              <label>اسم المستخدم</label>
              <input class="form-control" id="lu" placeholder="اسم المستخدم" />
            </div>
            <div class="form-group">
              <label>كلمة المرور</label>
              <input class="form-control" id="lp" type="password" />
            </div>
            <button class="btn btn-primary btn-block" id="btnLogin">دخول</button>
            ${window.IS_DEMO ? '' : '<p style="margin-top:12px;font-size:12px;color:var(--muted);text-align:center;">أنشئ حسابك أولاً عبر "إنشاء حساب" (مرة واحدة).</p>'}
          </div>
          <div id="registerForm" style="display:none;">
            <div class="form-group">
              <label>اسم المستخدم (2-20 حرف، أحرف/أرقام/_)</label>
              <input class="form-control" id="ru" />
            </div>
            <div class="form-group">
              <label>كلمة المرور (6+ أحرف)</label>
              <input class="form-control" id="rp" type="password" />
            </div>
            <div class="form-group">
              <label>نوع الحساب</label>
              <select class="form-control" id="rr">
                <option value="viewer">مشاهد</option>
                <option value="evaluator">مُقيّم</option>
              </select>
            </div>
            <div class="form-group" id="codeGroup">
              <label>رمز المشاهد</label>
              <input class="form-control" id="rc" type="password" placeholder="أدخل الرمز" />
            </div>
            <button class="btn btn-accent btn-block" id="btnRegister">إنشاء حساب</button>
          </div>
        </div>
      </div>
    `;
    document.querySelectorAll(".login-tabs button").forEach(b => {
      b.addEventListener("click", () => {
        document.querySelectorAll(".login-tabs button").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        const tab = b.dataset.tab;
        document.getElementById("loginForm").style.display = tab === "login" ? "" : "none";
        document.getElementById("registerForm").style.display = tab === "register" ? "" : "none";
      });
    });
    document.getElementById("btnLogin").addEventListener("click", async () => {
      const u = document.getElementById("lu").value.trim();
      const p = document.getElementById("lp").value;
      try {
        await Store.signIn(u, p);
        const ok = await refreshSession();
        if (ok) { renderApp(); toast("مرحبًا " + currentUser.displayName); }
        else toast("تعذّر جلب الملف الشخصي");
      } catch (e) { toast(e.message || "فشل تسجيل الدخول", "err"); }
    });
    document.getElementById("btnRegister").addEventListener("click", async () => {
      const u = document.getElementById("ru").value.trim();
      const p = document.getElementById("rp").value;
      const role = document.getElementById("rr").value;
      const code = document.getElementById("rc").value.trim();
      try {
        await window.signUp(u, p, role, code);
        toast("تم إنشاء الحساب، سجّل الدخول الآن");
        document.querySelector('.login-tabs button[data-tab="login"]').click();
      } catch (e) { toast(e.message || "فشل إنشاء الحساب"); }
    });
    // toggle code field based on role
    const rr = document.getElementById("rr");
    const cg = document.getElementById("codeGroup");
    if (rr && cg) {
      const toggle = () => { cg.style.display = rr.value === "viewer" ? "" : "none"; };
      rr.addEventListener("change", toggle);
      toggle();
    }
  }

  // ---------- APP SHELL ----------
  function renderApp() {
    const isViewer = currentUser.role === "viewer";
    root.innerHTML = `
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <div class="brand">
            <div class="logo">ت</div>
            <div>
              <h1>${esc(window.APP_CONFIG.APP_NAME)}</h1>
              <small>متابعة وتقييم</small>
            </div>
          </div>
          <nav class="nav">
            <a href="#dashboard" data-view="dashboard"><span class="icon">📊</span> لوحة التحكم</a>
            <a href="#evaluate" data-view="evaluate"><span class="icon">📝</span> تقييم اليوم</a>
            ${currentUser.role === "viewer" ? '<a href="#weekly" data-view="weekly"><span class="icon">📅</span> تقرير الأسبوع</a>' : ''}
            ${currentUser.role === "viewer" ? '<a href="#analytics" data-view="analytics"><span class="icon">📈</span> تحليلات</a>' : ''}
            <a href="#history" data-view="history"><span class="icon">🗂️</span> سجل الأسابيع</a>
            <a href="#profile" data-view="profile"><span class="icon">👤</span> الملف الشخصي</a>
            <a href="#settings" data-view="settings"><span class="icon">⚙️</span> التخصيصات</a>
          </nav>
          <div class="sidebar-footer">
            <div class="user-chip">
              <div class="avatar">${esc(currentUser.avatar || (currentUser.displayName || "?")[0])}</div>
              <div class="info">
                <div class="name">${esc(currentUser.displayName)}</div>
                <div class="role">${currentUser.role === "viewer" ? "مشاهد (أنا)" : "مُقيّم"}</div>
              </div>
            </div>
            <button class="btn btn-ghost btn-block" style="margin-top:10px;color:#fff;border-color:rgba(255,255,255,0.15);" id="btnLogout">تسجيل الخروج</button>
          </div>
        </aside>
        <main class="main">
          <div class="topbar">
            <div style="display:flex;align-items:center;gap:12px;">
              <button class="menu-toggle" id="menuToggle">☰</button>
              <h2 id="pageTitle">لوحة التحكم</h2>
            </div>
            <div class="actions">
              ${window.IS_DEMO ? '<span class="tag tag-view">وضع تجريبي</span>' : ''}
            </div>
          </div>
          <div id="content"></div>
        </main>
      </div>
    `;
    document.getElementById("btnLogout").addEventListener("click", async () => {
      await Store.signOut();
      currentUser = null;
      renderLogin();
    });
    document.getElementById("menuToggle").addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("sidebar").classList.toggle("open");
    });
    // close sidebar on outside click (mobile)
    document.addEventListener("click", (e) => {
      const sb = document.getElementById("sidebar");
      if (sb && sb.classList.contains("open") && !sb.contains(e.target)) {
        sb.classList.remove("open");
      }
    });
    document.querySelectorAll(".nav a").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const v = a.dataset.view;
        navigate(v);
        document.getElementById("sidebar").classList.remove("open");
      });
    });
    navigate("dashboard");
    applySettings(currentUser.settings || {});
  }

  function navigate(view, params) {
    currentView = view;
    document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("active", a.dataset.view === view));
    const titles = { dashboard: "لوحة التحكم", evaluate: "تقييم اليوم", weekly: "تقرير الأسبوع", history: "سجل الأسابيع", weekDetail: "تفاصيل الأسبوع", profile: "الملف الشخصي", settings: "التخصيصات", analytics: "تحليلات" };
    document.getElementById("pageTitle").textContent = titles[view] || view;
    const content = document.getElementById("content");
    content.innerHTML = "";
    if (view === "dashboard") renderDashboard(content);
    else if (view === "evaluate") renderEvaluate(content);
    else if (view === "weekly") renderWeekly(content);
    else if (view === "history") renderHistory(content);
    else if (view === "weekDetail") renderWeekDetail(content, params);
    else if (view === "profile") renderProfile(content);
    else if (view === "settings") renderSettings(content);
    else if (view === "analytics") renderAnalytics(content);
  }

  // ---------- DASHBOARD ----------
  async function renderDashboard(container) {
    container.innerHTML = `<div class="empty"><div class="icon">⏳</div>جاري التحميل...</div>`;
    try {
      const isViewer = currentUser.role === "viewer";
      const ws = WeekUtils.weekStart(WeekUtils.todayISO());
      // fetch evals for current week
      let filters = { weekStart: ws };
      if (!isViewer) filters.userId = currentUser.id;
      const evals = await Store.listEvaluations(filters);

      // For non-viewers, show a minimal dashboard (weekly evaluation/report is viewer-only).
      if (!isViewer) {
        try {
          const today = WeekUtils.todayISO();
          const hasToday = evals.some(e => e.eval_date === today);
          if (!hasToday) notify("تذكير", "لم تكتب تقييم اليوم بعد");
        } catch (e) {}
        container.innerHTML = `
        ${window.IS_DEMO ? '<div class="demo-banner">⚠️ وضع تجريبي.</div>' : ''}
        <div class="card" style="margin-bottom:16px;">
          <h3 style="margin-bottom:8px;">مرحبًا ${esc(currentUser.displayName)}</h3>
          <p style="color:var(--muted);">يمكنك كتابة تقييمك اليومي. التقارير الأسبوعية متاحة للمشاهد فقط.</p>
          <button class="btn btn-primary" style="margin-top:12px;" onclick="navigate('evaluate')">📝 تقييم اليوم</button>
        </div>
        <div class="card">
          <h3 style="margin-bottom:12px;">تقييماتي (الأحدث)</h3>
          ${evals.length === 0 ? '<div class="empty"><div class="icon">📭</div>لا توجد تقييمات</div>' :
            evals.slice(0,10).map(e => renderEvalCard(e, true)).join("")}
        </div>
      `;
        return;
      }

      // per-evaluator averages for current week
      const perEval = {};
      for (const ev of EVALUATORS) {
        const e = evals.filter(x => x.evaluator_key === ev.key);
        perEval[ev.key] = e.length ? (e.reduce((a,b)=>a+b.score,0)/e.length) : null;
      }
      // overall
      const vals = EVALUATORS.map(ev => perEval[ev.key]).filter(v => v !== null);
      const overall = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : null;

      // all evals for chart (last 8 weeks) - for viewer all, for evaluator own
      let chartFilters = {};
      if (!isViewer) chartFilters.userId = currentUser.id;
      const allEvals = await Store.listEvaluations(chartFilters);
      // group by week
      const weeksMap = {};
      for (const e of allEvals) {
        const w = WeekUtils.weekStart(e.eval_date);
        if (!weeksMap[w]) weeksMap[w] = {};
        if (!weeksMap[w][e.evaluator_key]) weeksMap[w][e.evaluator_key] = [];
        weeksMap[w][e.evaluator_key].push(e.score);
      }
      const weekKeys = Object.keys(weeksMap).sort().slice(-8);

      container.innerHTML = `
        ${window.IS_DEMO ? '<div class="demo-banner">⚠️ وضع تجريبي.</div>' : ''}
        <div class="grid grid-4" style="margin-bottom:16px;">
          <div class="card stat-card">
            <div class="stat-icon" style="background:#dbeafe;color:#1d4ed8;">📅</div>
            <div><div class="stat-value">${evals.length}</div><div class="stat-label">تقييمات هذا الأسبوع</div></div>
          </div>
          <div class="card stat-card">
            <div class="stat-icon" style="background:#d1fae5;color:#059669;">⭐</div>
            <div><div class="stat-value">${overall !== null ? overall.toFixed(2) : "—"}</div><div class="stat-label">المتوسط العام (الأسبوع)</div></div>
          </div>
          <div class="card stat-card">
            <div class="stat-icon" style="background:#fef3c7;color:#92400e;">📈</div>
            <div><div class="stat-value">${allEvals.length}</div><div class="stat-label">إجمالي التقييمات</div></div>
          </div>
          <div class="card stat-card">
            <div class="stat-icon" style="background:#fce7f3;color:#be185d;">🗓️</div>
            <div><div class="stat-value">${weekKeys.length}</div><div class="stat-label">أسابيع مُسجّلة</div></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;" id="goalCard">
          <h3 style="margin-bottom:8px;">🎯 هدف الأسبوع</h3>
          <div id="goalBody">جاري التحميل...</div>
        </div>

        <div class="grid grid-2" style="margin-bottom:16px;">
          <div class="card">
            <h3 style="margin-bottom:12px;">تقييم هذا الأسبوع (${ws})</h3>
            ${EVALUATORS.map(ev => {
              const v = perEval[ev.key];
              const cnt = evals.filter(x=>x.evaluator_key===ev.key).length;
              return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
                <span style="font-weight:600;">${ev.name}</span>
                <span>${v !== null ? v.toFixed(2)+"/10" : "لا توجد تقييمات"} <small style="color:var(--muted);">(${cnt} يوم)</small></span>
              </div>`;
            }).join("")}
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;font-weight:700;">
              <span>المتوسط العام</span>
              <span style="color:var(--primary);">${overall !== null ? overall.toFixed(2)+"/10" : "—"}</span>
            </div>
          </div>
          <div class="card">
            <h3 style="margin-bottom:12px;">تطور التقييم (آخر 8 أسابيع)</h3>
            <div class="chart-box"><canvas id="dashChart"></canvas></div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:12px;">تقييمات هذا الأسبوع (تفصيل)</h3>
          ${evals.length === 0 ? '<div class="empty"><div class="icon">📭</div>لا توجد تقييمات لهذا الأسبوع</div>' :
            evals.slice(0,10).map(e => renderEvalCard(e, false)).join("")}
        </div>
      `;

      hydrateComments(container);

      // chart
      // load goal
      try {
        const goal = await getGoal(ws);
        const target = goal ? goal.target_score : null;
        const current = overall !== null ? overall : 0;
        const pct = target ? Math.min(100, (current / target) * 100) : 0;
        const body = document.getElementById("goalBody");
        if (body) {
          body.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <span>الهدف: <strong>${target !== null ? target + "/10" : "غير محدد"}</strong></span>
              <span>الحالي: <strong>${overall !== null ? overall.toFixed(2) : "—"}</strong></span>
              ${target !== null ? `<div style="flex:1;min-width:120px;height:10px;background:var(--border);border-radius:5px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:var(--accent);"></div></div>` : ""}
              <button class="btn btn-ghost btn-sm" id="btnSetGoal">تحديد/تعديل الهدف</button>
            </div>
          `;
          const btn = document.getElementById("btnSetGoal");
          if (btn) btn.addEventListener("click", async () => {
            const val = prompt("أدخل الهدف (0-10):", target !== null ? target : "8");
            if (val === null) return;
            const n = parseFloat(val);
            if (isNaN(n) || n < 0 || n > 10) { toast("قيمة غير صالحة"); return; }
            try {
              await setGoal(ws, n);
              toast("تم حفظ الهدف");
              renderDashboard(container);
            } catch (e) { toast(e.message); }
          });
        }
      } catch (e) {}

      const ctx = document.getElementById("dashChart");
      if (ctx) {
        const labels = weekKeys.map(w => w.slice(5));
        const datasets = isViewer
          ? EVALUATORS.map((ev, i) => ({
              label: ev.name,
              data: weekKeys.map(w => {
                const arr = (weeksMap[w] && weeksMap[w][ev.key]) ? weeksMap[w][ev.key] : [];
                return arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
              }),
              borderColor: ["#2563eb","#10b981","#f59e0b"][i],
              tension: 0.3, spanGaps: true
            }))
          : [{
              label: "تقييمي",
              data: weekKeys.map(w => {
                const arr = Object.values(weeksMap[w] || {}).flat();
                return arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
              }),
              borderColor: "#2563eb", tension: 0.3, spanGaps: true
            }];
        new Chart(ctx, {
          type: "line",
          data: { labels, datasets },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 10 } } }
        });
      }
    } catch (e) {
      container.innerHTML = `<div class="card">خطأ: ${esc(e.message)}</div>`;
    }
  }

  async function hydrateComments(root) {
    const secs = (root || document).querySelectorAll(".comments-section");
    for (const sec of secs) {
      const eid = sec.dataset.cid;
      const list = sec.querySelector(".comments-list");
      try {
        const comments = await listComments(eid);
        list.innerHTML = comments.map(c => `
          <div style="display:flex;gap:8px;margin-bottom:6px;align-items:flex-start;">
            <span style="font-size:18px;">${esc(c.avatar||"👤")}</span>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:13px;">${esc(c.author||"مستخدم")} <span style="color:var(--muted);font-weight:400;font-size:11px;">${esc(c.created_at.slice(0,10))}</span></div>
              <div style="font-size:14px;">${esc(c.content)}</div>
            </div>
            ${currentUser && currentUser.id === c.user_id ? `<button class="btn btn-ghost btn-sm" data-cdel="${c.id}" data-ceid="${eid}" style="padding:2px 6px;">×</button>` : ""}
          </div>
        `).join("") || `<div style="color:var(--muted);font-size:12px;">لا توجد تعليقات</div>`;
      } catch (e) { list.innerHTML = ""; }
    }
  }

  // event delegation for comments
  document.addEventListener("click", async (e) => {
    const addBtn = e.target.closest("[data-cadd]");
    if (addBtn) {
      const eid = addBtn.dataset.cadd;
      const input = document.querySelector(`[data-cinput="${eid}"]`);
      const content = input ? input.value.trim() : "";
      if (!content) return;
      try {
        await addComment(eid, content);
        if (input) input.value = "";
        const card = document.querySelector(`.comments-section[data-cid="${eid}"]`);
        if (card) await hydrateComments(card.parentElement || document);
      } catch (err) { toast(err.message); }
    }
    const delBtn = e.target.closest("[data-cdel]");
    if (delBtn) {
      try {
        await deleteComment(delBtn.dataset.cdel);
        const eid = delBtn.dataset.ceid;
        const card = document.querySelector(`.comments-section[data-cid="${eid}"]`);
        if (card) await hydrateComments(card.parentElement || document);
      } catch (err) { toast(err.message); }
    }
  });

  function renderEvalCard(e, showActions) {
    const isOwner = currentUser && currentUser.id === e.user_id;
    const canEdit = isOwner;
    const evName = (EVALUATORS.find(x=>x.key===e.evaluator_key) || {}).name || e.evaluator_key;
    const tags = (e.tags||[]).map(t => `<span class="tag" style="background:#e0e7ff;color:#3730a3;margin:2px;">${esc(t)}</span>`).join(" ");
    return `
      <div class="eval-card" data-evalid="${e.id}">
        <div class="ec-head">
          <div>
            <span class="ec-name">${esc(evName)}</span>
            <span class="ec-date"> · ${esc(e.eval_date)}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="ec-score">${Number(e.score).toFixed(1)}/10</span>
            ${canEdit ? `<button class="btn btn-ghost btn-sm" data-edit="${e.id}">تعديل</button>` : ""}
          </div>
        </div>
        ${tags ? `<div style="margin-bottom:8px;">${tags}</div>` : ""}
        <div class="ec-section">
          <h4>✅ الإيجابيات</h4>
          <p>${esc(e.positives) || "—"}</p>
        </div>
        <div class="ec-section">
          <h4>⚠️ السلبيات</h4>
          <p>${esc(e.negatives) || "—"}</p>
        </div>
        <div class="comments-section" data-cid="${e.id}" style="margin-top:12px;border-top:1px dashed var(--border);padding-top:8px;">
          <div class="comments-list"></div>
          ${currentUser && currentUser.role === "viewer" ? `<div style="display:flex;gap:8px;margin-top:6px;">
            <input class="form-control" style="flex:1;" placeholder="تعليق..." data-cinput="${e.id}" />
            <button class="btn btn-ghost btn-sm" data-cadd="${e.id}">إرسال</button>
          </div>` : ""}
        </div>
      </div>
    `;
  }

  // ---------- EVALUATE ----------
  async function renderEvaluate(container) {
    if (currentUser.role !== "evaluator") {
      container.innerHTML = `<div class="card empty"><div class="icon">🔒</div>هذا القسم مخصص للمُقيّمين (الأب، الأخ، الدكتورة).</div>`;
      return;
    }
    const today = WeekUtils.todayISO();
    // support editing a specific evaluation passed via window._editingEval
    let editingEval = null;
    if (window._editingEval) {
      editingEval = window._editingEval;
      window._editingEval = null;
    }
    if (editingEval) { editingEvalId = editingEval.id; selectedScore = editingEval.score; }
    else { editingEvalId = null; selectedScore = null; }

    container.innerHTML = `
      <div class="card" style="max-width:720px;">
        <h3 style="margin-bottom:16px;">${editingEvalId ? "تعديل تقييم" : "تقييم اليوم"} — ${today}</h3>
        <div class="form-group">
          <label>✅ الإيجابيات (التصرفات الجيدة)</label>
          <textarea class="form-control" id="pos" placeholder="اكتب جميع الأشياء الجيدة...">${editingEval ? esc(editingEval.positives) : ""}</textarea>
        </div>
        <div class="form-group">
          <label>⚠️ السلبيات (ما يحتاج تحسين)</label>
          <textarea class="form-control" id="neg" placeholder="اكتب التصرفات التي تحتاج تحسين...">${editingEval ? esc(editingEval.negatives) : ""}</textarea>
        </div>
        <div class="form-group">
          <label>🏷️ وسوم (Tags) — مفصولة بفواصل</label>
          <input class="form-control" id="tags" placeholder="دراسة, صحة, اجتماعي..." value="${editingEval ? esc((editingEval.tags||[]).join(', ')) : ''}" />
        </div>
        <div class="form-group">
          <label>⭐ تقييم اليوم (من 10)</label>
          <div class="score-picker" id="scorePicker">
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button type="button" class="score-btn ${selectedScore===n?'selected':''}" data-score="${n}">${n}</button>`).join("")}
          </div>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-primary" id="btnSaveEval">حفظ التقييم</button>
          ${editingEvalId ? '<button class="btn btn-ghost" id="btnCancelEdit">إلغاء</button>' : ''}
        </div>
      </div>
    `;
    document.querySelectorAll("#scorePicker .score-btn").forEach(b => {
      b.addEventListener("click", () => {
        selectedScore = Number(b.dataset.score);
        document.querySelectorAll("#scorePicker .score-btn").forEach(x => x.classList.remove("selected"));
        b.classList.add("selected");
      });
    });
    document.getElementById("btnSaveEval").addEventListener("click", async () => {
      const pos = document.getElementById("pos").value.trim();
      const neg = document.getElementById("neg").value.trim();
      if (selectedScore === null) { toast("اختر درجة من 10"); return; }
      const payload = {
        user_id: currentUser.id,
        evaluator_key: currentUser.evaluatorKey,
        eval_date: today,
        positives: pos,
        negatives: neg,
        score: selectedScore,
        tags: (document.getElementById("tags").value || "").split(",").map(t=>t.trim()).filter(Boolean)
      };
      try {
        if (editingEvalId) {
          await Store.updateEvaluation(editingEvalId, payload);
          toast("تم تحديث التقييم");
        } else {
          await Store.upsertEvaluation(payload);
          toast("تم حفظ التقييم");
        }
        editingEvalId = null;
        selectedScore = null;
        navigate("dashboard");
      } catch (e) { toast(e.message || "فشل الحفظ"); }
    });
    const cb = document.getElementById("btnCancelEdit");
    if (cb) cb.addEventListener("click", () => navigate("dashboard"));
  }

  // edit from dashboard/history via data-edit
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit]");
    if (btn) {
      const id = btn.dataset.edit;
      // load eval then navigate to evaluate with editing
      Store.getEvaluation(id).then(ev => {
        if (ev) {
          editingEvalId = ev.id;
          selectedScore = ev.score;
          // store current editing eval globally
          window._editingEval = ev;
          navigate("evaluate");
        }
      });
    }
  });

  // Need evaluate to read window._editingEval. Patch renderEvaluate to use it.
  // We'll handle by overriding: in renderEvaluate, if window._editingEval and date matches, use it.
  // Actually simpler: modify renderEvaluate to check window._editingEval first.
  // Let's monkeypatch: wrap original renderEvaluate? Instead, adjust: at start of renderEvaluate, if window._editingEval, use its date? 
  // We'll just rely on today's eval lookup which already covers editing today. For past edits, evaluate page is today-only by design.
  // So data-edit on past evals: redirect to a simple edit modal instead. To keep scope, allow editing any eval by opening evaluate for that date? 
  // Simpler: show edit modal.
  
  // ---------- WEEKLY REPORT ----------
  async function renderWeekly(container) {
    container.innerHTML = `<div class="empty"><div class="icon">⏳</div>جاري التحميل...</div>`;
    try {
      const ws = currentWeekStart;
      const isViewer = currentUser.role === "viewer";
      let filters = { weekStart: ws };
      if (!isViewer) filters.userId = currentUser.id;
      const evals = await Store.listEvaluations(filters);

      const perEvalData = {};
      const perEvalAvg = {};
      for (const ev of EVALUATORS) {
        const e = evals.filter(x => x.evaluator_key === ev.key);
        perEvalData[ev.key] = e.sort((a,b) => a.eval_date.localeCompare(b.eval_date));
        perEvalAvg[ev.key] = e.length ? (e.reduce((a,b) => a + b.score, 0) / e.length) : null;
      }
      const vals = EVALUATORS.map(ev => perEvalAvg[ev.key]).filter(v => v !== null);
      const overall = vals.length ? (vals.reduce((a,b) => a + b, 0) / vals.length) : null;

      const allPos = evals.map(e => e.positives).filter(Boolean).join("\n• ");
      const allNeg = evals.map(e => e.negatives).filter(Boolean).join("\n• ");

      let statCardsHtml = "";
      if (isViewer) {
        statCardsHtml = `
        <div class="grid grid-4" style="margin-bottom:16px;">
          ${EVALUATORS.map(ev => {
            const v = perEvalAvg[ev.key];
            const cnt = perEvalData[ev.key].length;
            return `<div class="card stat-card">
              <div class="stat-icon" style="background:#dbeafe;color:#1d4ed8;">👤</div>
              <div><div class="stat-value">${v !== null ? v.toFixed(2) : "—"}</div><div class="stat-label">${ev.name} (${cnt} يوم)</div></div>
            </div>`;
          }).join("")}
          <div class="card stat-card">
            <div class="stat-icon" style="background:#d1fae5;color:#059669;">⭐</div>
            <div><div class="stat-value">${overall !== null ? overall.toFixed(2) : "—"}</div><div class="stat-label">المتوسط العام (${vals.length} من 3)</div></div>
          </div>
        </div>`;
      } else {
        const ev = EVALUATORS.find(e => e.key === currentUser.evaluatorKey);
        const v = perEvalAvg[currentUser.evaluatorKey];
        const cnt = perEvalData[currentUser.evaluatorKey].length;
        statCardsHtml = `
        <div class="grid grid-2" style="margin-bottom:16px;">
          <div class="card stat-card">
            <div class="stat-icon" style="background:#dbeafe;color:#1d4ed8;">⭐</div>
            <div><div class="stat-value">${v !== null ? v.toFixed(2) : "—"}</div><div class="stat-label">${ev.name} — متوسط الأسبوع (${cnt} يوم)</div></div>
          </div>
        </div>`;
      }

      let detailCardsHtml = "";
      if (isViewer) {
        detailCardsHtml = EVALUATORS.map(ev => {
          const data = perEvalData[ev.key];
          if (data.length === 0) return `<div class="card" style="margin-bottom:14px;"><h3>${ev.name}</h3><div class="empty">لا توجد تقييمات هذا الأسبوع</div></div>`;
          return `<div class="card" style="margin-bottom:14px;">
            <h3 style="margin-bottom:12px;">${ev.name} — ${data.length} تقييم</h3>
            <div style="margin-bottom:8px;color:var(--muted);font-size:13px;">المتوسط: ${perEvalAvg[ev.key].toFixed(2)}/10</div>
            ${data.map(e => renderEvalCard(e, currentUser.id === e.user_id)).join("")}
          </div>`;
        }).join("");
      } else {
        const ev = EVALUATORS.find(e => e.key === currentUser.evaluatorKey);
        const data = perEvalData[currentUser.evaluatorKey];
        if (data.length === 0) {
          detailCardsHtml = `<div class="card" style="margin-bottom:14px;"><h3>${ev.name}</h3><div class="empty">لا توجد تقييمات هذا الأسبوع</div></div>`;
        } else {
          detailCardsHtml = `<div class="card" style="margin-bottom:14px;">
            <h3 style="margin-bottom:12px;">${ev.name} — ${data.length} تقييم</h3>
            <div style="margin-bottom:8px;color:var(--muted);font-size:13px;">المتوسط: ${perEvalAvg[currentUser.evaluatorKey].toFixed(2)}/10</div>
            ${data.map(e => renderEvalCard(e, true)).join("")}
          </div>`;
        }
      }

      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="prevWeek">‹ الأسبوع السابق</button>
          <span style="font-weight:700;font-size:16px;">أسبوع: ${ws} → ${WeekUtils.addDays(ws,6)}</span>
          <button class="btn btn-ghost btn-sm" id="nextWeek">الأسبوع التالي ›</button>
          <button class="btn btn-ghost btn-sm" id="thisWeek">هذا الأسبوع</button>
        </div>

        ${statCardsHtml}

        ${detailCardsHtml}

        <div class="card" style="margin-bottom:14px;">
          <h3 style="margin-bottom:12px;">أبرز نقاط القوة (إجمالي الإيجابيات)</h3>
          <p style="white-space:pre-wrap;line-height:1.7;">${allPos ? "• " + allPos : "لا توجد"}</p>
        </div>
        <div class="card" style="margin-bottom:14px;">
          <h3 style="margin-bottom:12px;">أهم الأشياء التي تحتاج إلى تحسين (إجمالي السلبيات)</h3>
          <p style="white-space:pre-wrap;line-height:1.7;">${allNeg ? "• " + allNeg : "لا توجد"}</p>
        </div>
      `;

      hydrateComments(container);

      document.getElementById("prevWeek").addEventListener("click", () => { currentWeekStart = WeekUtils.addDays(currentWeekStart, -7); renderWeekly(container); });
      document.getElementById("nextWeek").addEventListener("click", () => { currentWeekStart = WeekUtils.addDays(currentWeekStart, 7); renderWeekly(container); });
      document.getElementById("thisWeek").addEventListener("click", () => { currentWeekStart = WeekUtils.weekStart(WeekUtils.todayISO()); renderWeekly(container); });
    } catch (e) {
      container.innerHTML = `<div class="card">خطأ: ${esc(e.message)}</div>`;
    }
  }

  // ---------- PROFILE ----------
  async function renderProfile(container) {
    const p = currentUser;
    container.innerHTML = `<div class="empty"><div class="icon">⏳</div>جاري التحميل...</div>`;
    try {
      const avatarOptions = ["👤","👨","👩","👦","👧","🙋","👨‍⚕️","👩‍⚕️","🧑‍🎓","🌟","⭐","🎯","🏆","💡","📚","🎨"];
      container.innerHTML = `
        <div class="grid grid-2">
          <div class="card">
            <h3 style="margin-bottom:16px;">الملف الشخصي</h3>
            <div style="text-align:center;margin-bottom:16px;">
              <div style="font-size:64px;line-height:1;" id="avatarPreview">${esc(p.avatar || "👤")}</div>
            </div>
            <div class="form-group">
              <label>الاسم المعروض</label>
              <input class="form-control" id="pfName" value="${esc(p.displayName || "")}" />
            </div>
            <div class="form-group">
              <label>نبذة (Bio)</label>
              <textarea class="form-control" id="pfBio" rows="3">${esc(p.bio || "")}</textarea>
            </div>
            <div class="form-group">
              <label>الصورة الرمزية (Avatar)</label>
              <div style="display:flex;flex-wrap:wrap;gap:6px;" id="avatarPicker">
                ${avatarOptions.map(a => `<button type="button" class="btn btn-ghost btn-sm" data-av="${a}" style="font-size:20px;padding:6px 10px;">${a}</button>`).join("")}
              </div>
            </div>
            <button class="btn btn-primary" id="btnSaveProfile">حفظ التعديلات</button>
            <span id="pfMsg" style="margin-right:10px;color:var(--accent);"></span>
          </div>
          <div class="card" style="margin-top:16px;">
            <h3 style="margin-bottom:12px;">الإنجازات (Badges)</h3>
            <div id="badgesBox" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
          </div>
          <div class="card">
            <h3 style="margin-bottom:16px;">تغيير كلمة المرور</h3>
            <div class="form-group">
              <label>كلمة المرور الحالية</label>
              <input class="form-control" id="pwOld" type="password" />
            </div>
            <div class="form-group">
              <label>كلمة المرور الجديدة (6+)</label>
              <input class="form-control" id="pwNew" type="password" />
            </div>
            <div class="form-group">
              <label>تأكيد كلمة المرور</label>
              <input class="form-control" id="pwNew2" type="password" />
            </div>
            <button class="btn btn-accent" id="btnChangePw">تغيير</button>
            <span id="pwMsg" style="margin-right:10px;"></span>
          </div>
        </div>

      `;
      let selectedAvatar = p.avatar || "👤";
      document.querySelectorAll("#avatarPicker button").forEach(b => {
        b.addEventListener("click", () => {
          selectedAvatar = b.dataset.av;
          document.getElementById("avatarPreview").textContent = selectedAvatar;
        });
      });
      document.getElementById("btnSaveProfile").addEventListener("click", async () => {
        const name = document.getElementById("pfName").value.trim();
        const bio = document.getElementById("pfBio").value.trim();
        try {
          const updated = await updateProfile({ displayName: name || currentUser.username, bio, avatar: selectedAvatar });
          currentUser = updated;
          document.getElementById("pfMsg").textContent = "✅ تم الحفظ";
          const chip = document.querySelector(".user-chip .avatar");
          if (chip) chip.textContent = (currentUser.avatar || (currentUser.displayName||"?")[0]);
          const nameEl = document.querySelector(".user-chip .name");
          if (nameEl) nameEl.textContent = currentUser.displayName;
        } catch (e) { document.getElementById("pfMsg").textContent = "❌ " + e.message; }
      });
      // populate badges
      try {
        const allE = await Store.listEvaluations(currentUser.role === "viewer" ? {} : { userId: currentUser.id });
        const badges = computeAchievements(allE);
        const box = document.getElementById("badgesBox");
        if (box) box.innerHTML = badges.length ? badges.map(b => `<span class="tag" style="background:#fef3c7;color:#92400e;padding:6px 12px;font-size:13px;" title="${esc(b.desc)}">${b.icon} ${esc(b.name)}</span>`).join(" ") : '<div style="color:var(--muted);">لا توجد إنجازات بعد</div>';
      } catch (e) {}

      document.getElementById("btnChangePw").addEventListener("click", async () => {
        const oldP = document.getElementById("pwOld").value;
        const n1 = document.getElementById("pwNew").value;
        const n2 = document.getElementById("pwNew2").value;
        const msg = document.getElementById("pwMsg");
        if (n1 !== n2) { msg.textContent = "❌ كلمتا المرور غير متطابقتين"; msg.style.color = "var(--danger)"; return; }
        try {
          await changePassword(oldP, n1);
          msg.textContent = "✅ تم تغيير كلمة المرور";
          msg.style.color = "var(--accent)";
        } catch (e) { msg.textContent = "❌ " + e.message; msg.style.color = "var(--danger)"; }
      });
    } catch (e) {
      container.innerHTML = `<div class="card">خطأ: ${esc(e.message)}</div>`;
    }
  }

  // ---------- SETTINGS / CUSTOMIZATION ----------
  const THEME_PRESETS = {
    blue:   { primary: "#2563eb", accent: "#10b981" },
    purple: { primary: "#7c3aed", accent: "#ec4899" },
    teal:   { primary: "#0d9488", accent: "#f59e0b" },
    rose:   { primary: "#e11d48", accent: "#8b5cf6" },
    amber:  { primary: "#d97706", accent: "#2563eb" },
    slate:  { primary: "#475569", accent: "#0ea5e9" }
  };

  function applySettings(s) {
    s = s || {};
    const root = document.documentElement;
    const preset = THEME_PRESETS[s.colorPreset] || THEME_PRESETS.blue;
    const primary = s.customPrimary || preset.primary;
    const accent = s.customAccent || preset.accent;
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--primary-dark", shade(primary, -15));
    root.style.setProperty("--primary-light", shade(primary, 85));
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-dark", shade(accent, -15));
    // font size
    const fs = s.fontSize === "small" ? "14px" : s.fontSize === "large" ? "18px" : "16px";
    root.style.fontSize = fs;
    // dark mode
    const dark = s.theme === "dark" || (s.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.body.classList.toggle("dark-mode", dark);
    // sidebar position
    document.body.classList.toggle("sidebar-left", s.sidebarPosition === "left");
    // compact
    document.body.classList.toggle("compact", !!s.compactMode);
    // animations
    document.body.classList.toggle("no-animations", s.animations === false);
    // card radius
    const rad = s.cardRadius === "small" ? "8px" : s.cardRadius === "large" ? "20px" : "14px";
    root.style.setProperty("--radius", rad);
    // shadow intensity
    const sh = s.shadowIntensity === "none" ? "none" : s.shadowIntensity === "strong" ? "0 10px 30px rgba(0,0,0,0.15)" : "0 4px 12px rgba(0,0,0,0.06)";
    root.style.setProperty("--shadow", sh);
  }

  function shade(hex, percent) {
    // percent: positive lighten, negative darken
    const num = parseInt(hex.replace("#",""),16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent)/100;
    r = Math.round((t - r) * p) + r;
    g = Math.round((t - g) * p) + g;
    b = Math.round((t - b) * p) + b;
    return "#" + ((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
  }

  async function renderSettings(container) {
    const s = currentUser.settings || {};
    const colorPresets = Object.keys(THEME_PRESETS);
    container.innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <h3 style="margin-bottom:16px;">المظهر</h3>
          <div class="form-group">
            <label>السمة (Theme)</label>
            <select class="form-control" id="stTheme">
              <option value="light" ${s.theme==="light"?"selected":""}>فاتح</option>
              <option value="dark" ${s.theme==="dark"?"selected":""}>داكن</option>
              <option value="auto" ${s.theme==="auto"||!s.theme?"selected":""}>تلقائي (حسب النظام)</option>
            </select>
          </div>
          <div class="form-group">
            <label>لوحة الألوان</label>
            <select class="form-control" id="stPreset">
              ${colorPresets.map(k => `<option value="${k}" ${s.colorPreset===k||( !s.colorPreset && k==="blue")?"selected":""}>${k}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label>لون أساسي مخصص (اختياري)</label>
            <input class="form-control" id="stPrimary" type="color" value="${s.customPrimary || "#2563eb"}" />
          </div>
          <div class="form-group">
            <label>لون تمييز مخصص (اختياري)</label>
            <input class="form-control" id="stAccent" type="color" value="${s.customAccent || "#10b981"}" />
          </div>
          <div class="form-group">
            <label>حجم الخط</label>
            <select class="form-control" id="stFont">
              <option value="small" ${s.fontSize==="small"?"selected":""}>صغير</option>
              <option value="medium" ${!s.fontSize||s.fontSize==="medium"?"selected":""}>متوسط</option>
              <option value="large" ${s.fontSize==="large"?"selected":""}>كبير</option>
            </select>
          </div>
        </div>
        <div class="card">
          <h3 style="margin-bottom:16px;">التخطيط والتأثيرات</h3>
          <div class="form-group">
            <label>موضع القائمة الجانبية</label>
            <select class="form-control" id="stSidebar">
              <option value="right" ${s.sidebarPosition!=="left"?"selected":""}>يمين (RTL)</option>
              <option value="left" ${s.sidebarPosition==="left"?"selected":""}>يسار</option>
            </select>
          </div>
          <div class="form-group">
            <label>استدارة البطاقات</label>
            <select class="form-control" id="stRadius">
              <option value="small" ${s.cardRadius==="small"?"selected":""}>صغيرة</option>
              <option value="medium" ${!s.cardRadius||s.cardRadius==="medium"?"selected":""}>متوسطة</option>
              <option value="large" ${s.cardRadius==="large"?"selected":""}>كبيرة</option>
            </select>
          </div>
          <div class="form-group">
            <label>شدة الظل</label>
            <select class="form-control" id="stShadow">
              <option value="none" ${s.shadowIntensity==="none"?"selected":""}>بدون</option>
              <option value="medium" ${!s.shadowIntensity||s.shadowIntensity==="medium"?"selected":""}>متوسط</option>
              <option value="strong" ${s.shadowIntensity==="strong"?"selected":""}>قوي</option>
            </select>
          </div>
          <div class="form-group">
            <label><input type="checkbox" id="stCompact" ${s.compactMode?"checked":""} /> وضع مضغوط (Compact)</label>
          </div>
          <div class="form-group">
            <label><input type="checkbox" id="stAnim" ${s.animations!==false?"checked":""} /> تفعيل الحركات/الانتقالات</label>
          </div>
          <div class="form-group" style="margin-top:8px;">
            <label>الإشعارات (تذكير بكتابة التقييم)</label>
            <button class="btn btn-ghost btn-sm" id="btnNotif">تفعيل الإشعارات</button>
            <span id="notifMsg" style="margin-right:8px;color:var(--muted);font-size:12px;"></span>
          </div>
          <button class="btn btn-primary" id="btnSaveSettings">حفظ التخصيصات</button>
          <button class="btn btn-ghost" id="btnResetSettings" style="margin-right:8px;">إعادة تعيين</button>
          <span id="stMsg" style="margin-right:10px;color:var(--accent);"></span>
        </div>
      </div>
      <div class="card" style="margin-top:16px;">
        <h3 style="margin-bottom:12px;">معاينة</h3>
        <div class="grid grid-3">
          <div class="card"><div class="stat-value" style="color:var(--primary);">123</div><div class="stat-label">لون أساسي</div></div>
          <div class="card"><div class="stat-value" style="color:var(--accent);">456</div><div class="stat-label">لون تمييز</div></div>
          <div class="card"><p>نص تجريبي للخط والبطاقة.</p></div>
        </div>
      </div>
    `;
    document.getElementById("btnSaveSettings").addEventListener("click", async () => {
      const newS = {
        theme: document.getElementById("stTheme").value,
        colorPreset: document.getElementById("stPreset").value,
        customPrimary: document.getElementById("stPrimary").value,
        customAccent: document.getElementById("stAccent").value,
        fontSize: document.getElementById("stFont").value,
        sidebarPosition: document.getElementById("stSidebar").value,
        cardRadius: document.getElementById("stRadius").value,
        shadowIntensity: document.getElementById("stShadow").value,
        compactMode: document.getElementById("stCompact").checked,
        animations: document.getElementById("stAnim").checked
      };
      try {
        const updated = await updateProfile({ settings: newS });
        currentUser = updated;
        applySettings(newS);
        document.getElementById("stMsg").textContent = "✅ تم الحفظ";
      } catch (e) { document.getElementById("stMsg").textContent = "❌ " + e.message; }
    });
    document.getElementById("btnResetSettings").addEventListener("click", async () => {
      try {
        await updateProfile({ settings: {} });
        applySettings({});
        renderSettings(container);
      } catch (e) { document.getElementById("stMsg").textContent = "❌ " + e.message; }
    });
  }

  // apply settings on load (called in renderApp)
  // ---------- ANALYTICS ----------
  async function renderAnalytics(container) {
    container.innerHTML = `<div class="empty"><div class="icon">⏳</div>جاري التحميل...</div>`;
    try {
      const allEvals = await Store.listEvaluations({});
      const weekMap = {};
      for (const e of allEvals) {
        const w = WeekUtils.weekStart(e.eval_date);
        if (!weekMap[w]) weekMap[w] = [];
        weekMap[w].push(e);
      }
      const weeks = Object.keys(weekMap).sort();
      // per-evaluator weekly averages over time
      const evalKeys = ["father","brother","doctor"];
      const evalNames = {"father":"الأب","brother":"الأخ","doctor":"الدكتورة"};
      const perEvalSeries = {};
      for (const k of evalKeys) {
        perEvalSeries[k] = weeks.map(w => {
          const arr = weekMap[w].filter(e => e.evaluator_key === k);
          return arr.length ? (arr.reduce((a,b)=>a+Number(b.score),0)/arr.length) : null;
        });
      }
      const overallSeries = weeks.map(w => {
        const vals = evalKeys.map(k => {
          const arr = weekMap[w].filter(e => e.evaluator_key === k);
          return arr.length ? (arr.reduce((a,b)=>a+Number(b.score),0)/arr.length) : null;
        }).filter(v=>v!==null);
        return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : null;
      });

      // best/worst days
      const sorted = [...allEvals].sort((a,b) => Number(b.score)-Number(a.score));
      const best = sorted.slice(0,5);
      const worst = sorted.slice(-5).reverse();

      // tag counts
      const tagCount = {};
      for (const e of allEvals) for (const t of (e.tags||[])) tagCount[t] = (tagCount[t]||0)+1;
      const topTags = Object.entries(tagCount).sort((a,b)=>b[1]-a[1]).slice(0,10);

      // monthly aggregation
      const monthMap = {};
      for (const e of allEvals) {
        const m = e.eval_date.slice(0,7);
        if (!monthMap[m]) monthMap[m] = [];
        monthMap[m].push(e);
      }
      const months = Object.keys(monthMap).sort();

      container.innerHTML = `
        <div class="grid grid-4" style="margin-bottom:16px;">
          <div class="card stat-card">
            <div class="stat-icon" style="background:#dbeafe;color:#1d4ed8;">📅</div>
            <div><div class="stat-value">${weeks.length}</div><div class="stat-label">أسابيع</div></div>
          </div>
          <div class="card stat-card">
            <div class="stat-icon" style="background:#d1fae5;color:#059669;">📝</div>
            <div><div class="stat-value">${allEvals.length}</div><div class="stat-label">تقييمات</div></div>
          </div>
          <div class="card stat-card">
            <div class="stat-icon" style="background:#fef3c7;color:#92400e;">⭐</div>
            <div><div class="stat-value">${allEvals.length ? (allEvals.reduce((a,b)=>a+Number(b.score),0)/allEvals.length).toFixed(2) : "—"}</div><div class="stat-label">المتوسط العام</div></div>
          </div>
          <div class="card stat-card">
            <div class="stat-icon" style="background:#fce7f3;color:#be185d;">🏷️</div>
            <div><div class="stat-value">${Object.keys(tagCount).length}</div><div class="stat-label">وسوم</div></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <h3 style="margin-bottom:12px;">تطور التقييم (أسبوعي)</h3>
          <div class="chart-box"><canvas id="anChart1"></canvas></div>
        </div>

        <div class="grid grid-2" style="margin-bottom:16px;">
          <div class="card">
            <h3 style="margin-bottom:12px;">أفضل 5 تقييمات</h3>
            ${best.map(e => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
              <span>${esc(evalNames[e.evaluator_key]||e.evaluator_key)} · ${esc(e.eval_date)}</span>
              <span style="color:var(--accent);font-weight:700;">${Number(e.score).toFixed(1)}</span>
            </div>`).join("") || '<div class="empty">لا توجد</div>'}
          </div>
          <div class="card">
            <h3 style="margin-bottom:12px;">أسوأ 5 تقييمات</h3>
            ${worst.map(e => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
              <span>${esc(evalNames[e.evaluator_key]||e.evaluator_key)} · ${esc(e.eval_date)}</span>
              <span style="color:var(--danger);font-weight:700;">${Number(e.score).toFixed(1)}</span>
            </div>`).join("") || '<div class="empty">لا توجد</div>'}
          </div>
        </div>

        <div class="grid grid-2" style="margin-bottom:16px;">
          <div class="card">
            <h3 style="margin-bottom:12px;">الوسوم الأكثر استخدامًا</h3>
            ${topTags.length === 0 ? '<div class="empty">لا توجد وسوم</div>' :
              topTags.map(([t,n]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
                <span>${esc(t)}</span><span style="font-weight:700;">${n}</span>
              </div>`).join("")}
          </div>
          <div class="card">
            <h3 style="margin-bottom:12px;">متوسط شهري</h3>
            ${months.map(m => {
              const arr = monthMap[m];
              const avg = arr.reduce((a,b)=>a+Number(b.score),0)/arr.length;
              return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
                <span>${esc(m)}</span><span style="font-weight:700;">${avg.toFixed(2)} (${arr.length})</span>
              </div>`;
            }).join("") || '<div class="empty">لا توجد</div>'}
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:12px;">تصدير</h3>
          <button class="btn btn-primary" id="btnExportCSV">تصدير CSV (جميع التقييمات)</button>
          <button class="btn btn-ghost" id="btnPrint" style="margin-right:8px;">طباعة / PDF</button>
        </div>
      `;

      const ctx = document.getElementById("anChart1");
      if (ctx) {
        new Chart(ctx, {
          type: "line",
          data: {
            labels: weeks.map(w => w.slice(5)),
            datasets: evalKeys.map((k,i) => ({
              label: evalNames[k],
              data: perEvalSeries[k],
              borderColor: ["#2563eb","#10b981","#f59e0b"][i],
              tension: 0.3, spanGaps: true
            })).concat([{
              label: "المتوسط العام",
              data: overallSeries,
              borderColor: "#ef4444",
              borderDash: [5,5],
              tension: 0.3, spanGaps: true
            }])
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 10 } } }
        });
      }
      document.getElementById("btnExportCSV").addEventListener("click", () => exportCSV(allEvals, "evaluations.csv"));
      document.getElementById("btnPrint").addEventListener("click", () => window.print());
    } catch (e) {
      container.innerHTML = `<div class="card">خطأ: ${esc(e.message)}</div>`;
    }
  }
  // ---------- HISTORY ----------
  async function renderHistory(container) {
    container.innerHTML = `<div class="empty"><div class="icon">⏳</div>جاري التحميل...</div>`;
    try {
      const isViewer = currentUser.role === "viewer";
      let filters = {};
      if (!isViewer) filters.userId = currentUser.id;
      const allEvals = await Store.listEvaluations(filters);
      // group by week
      const weeksMap = {};
      for (const e of allEvals) {
        const w = WeekUtils.weekStart(e.eval_date);
        if (!weeksMap[w]) weeksMap[w] = [];
        weeksMap[w].push(e);
      }
      const weekKeys = Object.keys(weeksMap).sort().reverse();

      container.innerHTML = `
        <div class="card">
          <h3 style="margin-bottom:16px;">سجل الأسابيع (${weekKeys.length})</h3>
          ${weekKeys.length === 0 ? '<div class="empty"><div class="icon">📭</div>لا توجد أسابيع مُسجّلة</div>' :
            weekKeys.map(w => {
              const evs = weeksMap[w];
              // per evaluator avg
              const perAvg = EVALUATORS.map(ev => {
                const e = evs.filter(x=>x.evaluator_key===ev.key);
                return e.length ? (e.reduce((a,b)=>a+b.score,0)/e.length) : null;
              });
              const vals = perAvg.filter(v=>v!==null);
              const overall = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : null;
              return `<div class="week-item" data-week="${w}">
                <div>
                  <div class="wi-title">أسبوع ${w}</div>
                  <div class="wi-sub">${evs.length} تقييم · ${WeekUtils.addDays(w,6)}</div>
                </div>
                <div style="text-align:left;">
                  <div class="wi-score">${overall !== null ? overall.toFixed(2) : "—"} /10</div>
                  <div style="font-size:11px;color:var(--muted);">${EVALUATORS.map((ev,i)=> ev.name+":"+ (perAvg[i]!==null?perAvg[i].toFixed(1):"—")).join(" · ")}</div>
                </div>
              </div>`;
            }).join("")}
        </div>
      `;
      container.querySelectorAll(".week-item").forEach(item => {
        item.addEventListener("click", () => {
          currentWeekStart = item.dataset.week;
          navigate("weekDetail", { weekStart: item.dataset.week });
        });
      });
    } catch (e) {
      container.innerHTML = `<div class="card">خطأ: ${esc(e.message)}</div>`;
    }
  }

  // ---------- WEEK DETAIL ----------
  async function renderWeekDetail(container, params) {
    const ws = (params && params.weekStart) || currentWeekStart;
    currentWeekStart = ws;
    container.innerHTML = `<div class="empty"><div class="icon">⏳</div>جاري التحميل...</div>`;
    // reuse weekly render but with fixed week; set currentWeekStart and call renderWeekly logic by navigating? 
    // We'll just render weekly view content by calling renderWeekly with currentWeekStart set.
    currentWeekStart = ws;
    await renderWeekly(container);
    // add back button
    const back = document.createElement("button");
    back.className = "btn btn-ghost btn-sm";
    back.style.marginBottom = "12px";
    back.textContent = "← العودة للسجل";
    back.addEventListener("click", () => navigate("history"));
    container.insertBefore(back, container.firstChild);
  }

  // ---------- edit modal for past evals ----------
  // override data-edit handling: open a modal
  // We'll implement simple modal by reusing evaluate? Instead, add global click handler already calls Store.getEvaluation and sets window._editingEval.
  // Modify renderEvaluate to use window._editingEval if present and not today.
  const originalRenderEvaluate = renderEvaluate;
  // redefine renderEvaluate to support editing arbitrary eval
  async function renderEvaluate2(container) {
    if (currentUser.role !== "evaluator") {
      container.innerHTML = `<div class="card empty"><div class="icon">🔒</div>هذا القسم مخصص للمُقيّمين.</div>`;
      return;
    }
    // if editing a specific past eval
    const editing = window._editingEval;
    if (editing && editing.user_id === currentUser.id) {
      const ev = editing;
      window._editingEval = null;
      selectedScore = ev.score;
      container.innerHTML = `
        <div class="card" style="max-width:720px;">
          <h3 style="margin-bottom:16px;">تعديل تقييم — ${ev.eval_date}</h3>
          <div class="form-group">
            <label>✅ الإيجابيات</label>
            <textarea class="form-control" id="pos">${esc(ev.positives)}</textarea>
          </div>
          <div class="form-group">
            <label>⚠️ السلبيات</label>
            <textarea class="form-control" id="neg">${esc(ev.negatives)}</textarea>
          </div>
          <div class="form-group">
            <label>🏷️ وسوم (Tags)</label>
            <input class="form-control" id="tags" value="${esc((ev.tags||[]).join(', '))}" />
          </div>
          <div class="form-group">
            <label>⭐ تقييم (من 10)</label>
            <div class="score-picker" id="scorePicker">
              ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button type="button" class="score-btn ${selectedScore===n?'selected':''}" data-score="${n}">${n}</button>`).join("")}
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary" id="btnSaveEval">حفظ</button>
            <button class="btn btn-ghost" id="btnCancelEdit">إلغاء</button>
          </div>
        </div>
      `;
      document.querySelectorAll("#scorePicker .score-btn").forEach(b => {
        b.addEventListener("click", () => {
          selectedScore = Number(b.dataset.score);
          document.querySelectorAll("#scorePicker .score-btn").forEach(x => x.classList.remove("selected"));
          b.classList.add("selected");
        });
      });
      document.getElementById("btnSaveEval").addEventListener("click", async () => {
        const pos = document.getElementById("pos").value.trim();
        const neg = document.getElementById("neg").value.trim();
        if (selectedScore === null) { toast("اختر درجة من 10"); return; }
        try {
          await Store.updateEvaluation(ev.id, {
            user_id: currentUser.id,
            evaluator_key: currentUser.evaluatorKey,
            eval_date: ev.eval_date,
            positives: pos,
            negatives: neg,
            score: selectedScore,
            tags: (document.getElementById("tags").value || "").split(",").map(t=>t.trim()).filter(Boolean)
          });
          toast("تم حفظ التعديل");
          navigate("dashboard");
        } catch (e) { toast(e.message || "فشل الحفظ"); }
      });
      document.getElementById("btnCancelEdit").addEventListener("click", () => navigate("dashboard"));
      return;
    }
    // default today flow
    await originalRenderEvaluate(container);
  }

  // replace navigate's call: use renderEvaluate2
  // We'll monkeypatch by reassigning renderEvaluate reference used in navigate? navigate calls renderEvaluate. 
  // Redefine renderEvaluate in scope:
  // (can't redeclare const function easily) -> use window
  window.renderEvaluateImpl = renderEvaluate2;

  // Patch navigate: redefine to use renderEvaluate2 and guard weekly for non-viewers
  function navigate2(view, params) {
    if (view === "weekly" && currentUser.role !== "viewer") { view = "dashboard"; }
    if (view === "analytics" && currentUser.role !== "viewer") { view = "dashboard"; }
    currentView = view;
    document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("active", a.dataset.view === view));
    const titles = { dashboard: "لوحة التحكم", evaluate: "تقييم اليوم", weekly: "تقرير الأسبوع", history: "سجل الأسابيع", weekDetail: "تفاصيل الأسبوع", profile: "الملف الشخصي", settings: "التخصيصات", analytics: "تحليلات" };
    document.getElementById("pageTitle").textContent = titles[view] || view;
    const content = document.getElementById("content");
    content.innerHTML = "";
    if (view === "dashboard") renderDashboard(content);
    else if (view === "evaluate") renderEvaluate2(content);
    else if (view === "weekly") renderWeekly(content);
    else if (view === "history") renderHistory(content);
    else if (view === "weekDetail") renderWeekDetail(content, params);
    else if (view === "profile") renderProfile(content);
    else if (view === "settings") renderSettings(content);
    else if (view === "analytics") renderAnalytics(content);
  }
  window.navigate = navigate2;
  navigate = navigate2;

  // ---------- modal edit for data-edit: already sets window._editingEval and calls navigate('evaluate') ----------
  // ensure click handler uses navigate (now navigate2)
  
  // register service worker (PWA) - only on http(s)
  if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  } else if ("serviceWorker" in navigator) {
    // unregister any stale SW on file:// to avoid console errors
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(()=>{});
  }

  boot();
})();
