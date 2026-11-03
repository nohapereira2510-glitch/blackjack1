// Google sign-in via Supabase Auth.
(() => {
  "use strict";

  // The publishable key is meant to be public: it identifies the project to Supabase
  // and only allows what the project's Auth settings and Row Level Security permit.
  const SUPABASE_URL = "https://yptcidtlziiumivuzoei.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_yd4x5mE2O4R_ESk0n_BgbQ_i-uGkumm";

  const $ = (id) => document.getElementById(id);
  const el = {
    googleBtn: $("google-btn"),
    loginError: $("login-error"),
    userChip: $("user-chip"),
    avatar: $("user-avatar"),
    initials: $("user-initials"),
    name: $("user-name"),
    signOut: $("signout-btn"),
  };

  function showError(text) {
    el.loginError.textContent = text;
    el.loginError.hidden = !text;
  }

  if (!window.supabase) {
    showError("Couldn't load the sign-in service. Check your connection and refresh.");
    el.googleBtn.disabled = true;
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
  });

  // Errors from the OAuth redirect come back in the URL (query or hash).
  const params = new URLSearchParams(location.search + "&" + location.hash.slice(1));
  const redirectError = params.get("error_description") || params.get("error");
  if (redirectError) {
    showError(`Sign-in failed: ${redirectError.replace(/\+/g, " ")}`);
    history.replaceState(null, "", location.pathname);
  }

  function displayName(user) {
    const m = user.user_metadata || {};
    const full = m.full_name || m.name || "";
    return full.split(" ")[0] || (user.email || "player").split("@")[0];
  }

  function initialsFor(user) {
    const m = user.user_metadata || {};
    const full = (m.full_name || m.name || user.email || "?").trim();
    const parts = full.split(/\s+/);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  function showUser(user) {
    if (!user) {
      document.body.classList.add("signed-out");
      el.userChip.hidden = true;
      el.googleBtn.disabled = false;
      return;
    }
    const m = user.user_metadata || {};
    const picture = m.avatar_url || m.picture;

    el.name.textContent = displayName(user);
    el.initials.textContent = initialsFor(user);
    el.initials.hidden = false;
    el.avatar.hidden = true;
    if (picture) {
      el.avatar.onload = () => { el.avatar.hidden = false; el.initials.hidden = true; };
      el.avatar.onerror = () => { el.avatar.hidden = true; el.initials.hidden = false; };
      el.avatar.src = picture;
      el.avatar.alt = `${displayName(user)}'s profile picture`;
    }
    el.userChip.hidden = false;
    document.body.classList.remove("signed-out");
    showError("");
  }

  el.googleBtn.addEventListener("click", async () => {
    el.googleBtn.disabled = true;
    showError("");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) {
      showError(`Sign-in failed: ${error.message}`);
      el.googleBtn.disabled = false;
    }
  });

  el.signOut.addEventListener("click", async () => {
    el.signOut.disabled = true;
    await client.auth.signOut();
    el.signOut.disabled = false;
  });

  client.auth.onAuthStateChange((_event, session) => showUser(session ? session.user : null));
  client.auth.getSession().then(({ data }) => showUser(data.session ? data.session.user : null));
})();
