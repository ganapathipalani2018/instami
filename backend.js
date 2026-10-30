// Minimal Supabase client using fetch (no external libraries). Active only when config.js has a URL and key.
(function () {
  const cfg = window.INSTAMI_CONFIG || {};
  const base = (cfg.supabaseUrl || "").replace(/\/+$/, "");
  const KEY = "instami.session.v1";
  const enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base) && Boolean(cfg.supabaseAnonKey);
  let session = null;
  try { session = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { session = null; }

  const save = (next) => {
    session = next;
    try { next ? localStorage.setItem(KEY, JSON.stringify(next)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  };
  const authValue = () => "Bearer " + ((session && session.access_token) || cfg.supabaseAnonKey);
  const headers = (extra = {}) => ({ apikey: cfg.supabaseAnonKey, Authorization: authValue(), "Content-Type": "application/json", ...extra });

  async function call(path, options = {}) {
    if (!enabled) throw new Error("Backend not configured");
    const response = await fetch(`${base}${path}`, { ...options, headers: headers(options.headers) });
    if (response.status === 401 && session && session.refresh_token && !options.retried) {
      await refresh();
      return call(path, { ...options, retried: true });
    }
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try { const body = await response.json(); message = body.msg || body.message || body.error_description || message; } catch { /* ignore */ }
      throw new Error(message);
    }
    return response.status === 204 ? null : response.json().catch(() => null);
  }

  async function refresh() {
    const data = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }), retried: true });
    save({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
  }

  const me = () => session && session.user && session.user.id;
  const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  window.InstamiBackend = {
    enabled,
    isSignedIn: () => Boolean(me()),
    userId: me,
    email: () => (session && session.user && session.user.email) || "",
    async sendCode(email) {
      await call("/auth/v1/otp", { method: "POST", body: JSON.stringify({ email, create_user: true }) });
    },
    async verifyCode(email, token) {
      const data = await call("/auth/v1/verify", { method: "POST", body: JSON.stringify({ type: "email", email, token }) });
      save({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
    },
    signOut() { save(null); },
    async getMyProfile() {
      const rows = await call(`/rest/v1/profiles?id=eq.${encodeURIComponent(me())}&select=*`);
      return rows && rows[0] ? rows[0] : null;
    },
    async saveMyProfile(profile) {
      const row = { id: me(), name: profile.name, age: profile.age, bio: profile.bio || "", job: profile.job || "", city: profile.city || "", interests: profile.interests || [], photos: profile.photos || [] };
      await call("/rest/v1/profiles?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
    },
    async uploadPhoto(blob) {
      const name = `${me()}/${crypto.randomUUID()}.jpg`;
      const response = await fetch(`${base}/storage/v1/object/photos/${name}`, { method: "POST", headers: { apikey: cfg.supabaseAnonKey, Authorization: authValue(), "Content-Type": blob.type || "image/jpeg", "x-upsert": "false" }, body: blob });
      if (!response.ok) throw new Error("Photo upload failed");
      return `${base}/storage/v1/object/public/photos/${name}`;
    },
    // People I have not swiped on yet (RLS already hides blocked users).
    async discover(limit = 30) {
      const swiped = await call(`/rest/v1/swipes?select=target&swiper=eq.${me()}`);
      const skip = [me(), ...(swiped || []).map((s) => s.target)].filter(isUuid);
      return call(`/rest/v1/profiles?select=*&id=not.in.(${skip.join(",")})&limit=${limit}`);
    },
    async swipe(targetId, action) {
      if (!isUuid(targetId)) throw new Error("Invalid profile");
      await call("/rest/v1/swipes?on_conflict=swiper,target", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ swiper: me(), target: targetId, action }) });
      // The database trigger creates the match; check if one now exists.
      const [a, b] = [me(), targetId].sort();
      const rows = await call(`/rest/v1/matches?select=id&user_a=eq.${a}&user_b=eq.${b}`);
      return Boolean(rows && rows.length);
    },
    async profilesByIds(ids) {
      const clean = ids.filter(isUuid);
      if (!clean.length) return [];
      return call(`/rest/v1/profiles?select=*&id=in.(${clean.join(",")})`);
    },
    async matches() {
      return call("/rest/v1/matches?select=id,user_a,user_b,created_at&order=created_at.desc");
    },
    async messages(matchId) {
      return call(`/rest/v1/messages?select=id,sender,body,created_at&match_id=eq.${encodeURIComponent(matchId)}&order=created_at.asc`);
    },
    async sendMessage(matchId, body) {
      await call("/rest/v1/messages", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ match_id: matchId, sender: me(), body }) });
    },
    async block(targetId, reason = "") {
      await call("/rest/v1/blocks", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ blocker: me(), blocked: targetId, reason }) });
    },
    async deleteAccountData() {
      await call(`/rest/v1/profiles?id=eq.${me()}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      save(null);
    }
  };
})();
