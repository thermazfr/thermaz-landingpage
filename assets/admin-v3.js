/* Thermaz, espace admin (v2, pensée pour le téléphone).
   Les données ne sont jamais dans ce fichier : elles viennent de l'API Apps Script,
   qui refuse toute demande sans jeton de session valide.
   Tout est affiché avec textContent (jamais innerHTML avec des données) pour bloquer les injections. */
(() => {
  "use strict";

  // URL /exec de l'API admin (projet Apps Script « Thermaz Admin API »).
  const API_URL = "https://script.google.com/macros/s/AKfycbxePxnHl8FiHMrCn6O8SJbn3LiGjTtBUezzQGw8p3IvoVlFAWyJTKAKblQ2iOuzql6H/exec";
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // Mode démo (données fictives) seulement sur l'ordinateur d'Andy, jamais sur thermaz.fr.
  const DEMO = LOCAL && (!API_URL || new URLSearchParams(location.search).has("demo"));
  const TK = "thz_admin_token";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get() { try { return localStorage.getItem(TK) || ""; } catch (e) { return ""; } },
    set(v) { try { v ? localStorage.setItem(TK, v) : localStorage.removeItem(TK); } catch (e) {} }
  };
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "style") n.style.cssText = v; // par le script : accepté par la règle de sécurité de la page (pas d'attribut style écrit en dur)
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  }
  function icon(id, size = 18) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("width", size); s.setAttribute("height", size); s.setAttribute("aria-hidden", "true");
    const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
    u.setAttribute("href", "#i-" + id); s.append(u);
    return s;
  }
  const euro = n => (Math.round(Number(n) || 0)).toLocaleString("fr-FR") + " €";
  const show = id => { for (const v of ["v-load", "v-login", "v-setup", "v-app"]) $("#" + v).hidden = v !== id; };
  const msg = (id, t, ok) => { const m = $("#" + id); m.textContent = t || ""; m.classList.toggle("ok", !!ok); };
  let toastT;
  function toast(t) {
    let n = $(".ad-toast"); if (!n) { n = el("div", { class: "ad-toast", role: "status" }); document.body.append(n); }
    n.textContent = t; n.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { n.hidden = true; }, 2600);
  }

  const ERR = {
    bad: "Identifiant ou mot de passe incorrect.",
    code: "Code incorrect ou expiré.",
    expired: "La demande a expiré, recommence la connexion.",
    locked: "Trop d'essais : l'accès est bloqué 15 minutes. Une alerte t'a été envoyée.",
    wait: "Attends une minute avant de redemander un code.",
    no_setup: "Aucun accès n'existe encore : crée-le d'abord.",
    id_court: "Identifiant trop court (3 caractères minimum).",
    mdp_court: "Mot de passe trop court (10 caractères minimum).",
    conflit: "La ligne a changé dans le CRM entre-temps. Actualise puis recommence.",
    statut: "Cette étape n'existe pas dans le CRM.",
    nom: "Indique au moins un nom.",
    unknown_action: "Cette action n'est pas encore active sur le serveur.",
    network: "Pas de connexion au serveur. Vérifie ton réseau.",
    server: "Erreur du serveur. Réessaie dans un instant."
  };
  const err = r => ERR[r && r.error] || (r && r.detail) || ERR.server;

  /* ---------------- Appels à l'API ---------------- */
  async function api(action, data = {}) {
    if (DEMO) return demo(action, data);
    let r;
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...data, action, token: store.get() }),
        credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
      });
      r = await res.json();
    } catch (e) { return { ok: false, error: "network" }; }
    if (r && r.error === "auth") { store.set(""); state.data = null; startLogin(); }
    return r || { ok: false, error: "server" };
  }

  /* ---------------- État et étapes ---------------- */
  const state = { view: "today", data: null, today: null, q: "", cq: "", etape: "", statuts: [], current: null, pend: null, nonce: "", site: null, sitePeriode: 7 };
  const FLOW = ["Nouveau", "Rappelé", "Visite prévue", "Devis envoyé", "Signé", "Acompte reçu", "Posé", "Soldé"];
  const SIDE = ["Perdu", "Hors cible"];
  const RAISONS_PERTE = ["Trop cher", "A choisi un autre artisan", "Projet repoussé", "Plus de réponse", "Hors zone ou pas faisable", "Autre"];
  const COURT = { "Visite prévue": "Visite", "Devis envoyé": "Devis", "Acompte reçu": "Acompte" };
  const GAGNES = ["Signé", "Acompte reçu", "Posé", "Soldé"];
  const GROUPES = [
    { t: "Nouveaux, à rappeler", f: s => s === "" || s === "Nouveau", open: true },
    { t: "En cours", f: s => s === "Rappelé" || s === "Visite prévue", open: true },
    { t: "Devis envoyés", f: s => s === "Devis envoyé", open: true },
    { t: "Gagnés", f: s => GAGNES.includes(s), open: false },
    { t: "Perdus", f: s => s === "Perdu", open: false }
  ];

  const pad = n => String(n).padStart(2, "0");
  const ddmm = d => pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
  function dateDans(t) {
    const m = String(t || "").match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (!m) return null;
    const now = new Date(); let y = m[3] ? Number(m[3]) : now.getFullYear(); if (y < 100) y += 2000;
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
  const debutJour = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  function quand(t) {
    const d = dateDans(t); if (!d) return null;
    const diff = Math.round((debutJour(d) - debutJour()) / 864e5);
    return { diff, label: diff < 0 ? "en retard de " + (-diff) + " j" : diff === 0 ? "aujourd'hui" : diff === 1 ? "demain" : "dans " + diff + " j" };
  }

  /* ---------------- Connexion ---------------- */
  function startLogin() {
    show("v-login");
    $("#f-login").hidden = false; $("#f-code").hidden = true;
    msg("m-login", ""); msg("m-code", "");
    setTimeout(() => $("#l-id").focus(), 50);
  }
  function device() {
    const ua = navigator.userAgent;
    const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Appareil";
    const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "navigateur";
    return os + " · " + nav;
  }
  async function busy(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } finally { if (btn) btn.disabled = false; } }

  $("#f-login").addEventListener("submit", e => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const r = await api("login", { id: $("#l-id").value, pwd: $("#l-mdp").value });
      if (!r.ok) return msg("m-login", err(r));
      state.nonce = r.nonce; $("#l-mdp").value = "";
      $("#f-login").hidden = true; $("#f-code").hidden = false; $("#l-code").focus();
    });
  });
  $("#f-code").addEventListener("submit", e => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const r = await api("loginCode", { nonce: state.nonce, code: $("#l-code").value, device: device() });
      if (!r.ok) return msg("m-code", err(r));
      store.set(r.token); $("#l-code").value = ""; openApp();
    });
  });
  $("#b-setup").addEventListener("click", () => { show("v-setup"); msg("m-setup", ""); });
  $("#b-retour").addEventListener("click", startLogin);
  $("#b-sendcode").addEventListener("click", e => busy(e.currentTarget, async () => {
    const r = await api("sendSetupCode");
    msg("m-setup", r.ok ? "Code envoyé. Regarde ta boîte mail Thermaz." : err(r), r.ok);
  }));
  $("#f-setup").addEventListener("submit", e => {
    e.preventDefault();
    if ($("#s-mdp").value !== $("#s-mdp2").value) return msg("m-setup", "Les deux mots de passe ne sont pas identiques.");
    busy(e.submitter, async () => {
      const r = await api("setup", { code: $("#s-code").value, id: $("#s-id").value, pwd: $("#s-mdp").value });
      if (!r.ok) return msg("m-setup", err(r));
      $("#s-mdp").value = $("#s-mdp2").value = $("#s-code").value = "";
      store.set(""); startLogin(); msg("m-login", "Accès enregistré. Connecte-toi.", true);
    });
  });

  /* ---------------- Application ---------------- */
  async function openApp() {
    show("v-app"); $("#demo").hidden = !DEMO; await refresh(true);
    // Lien direct vers une section : admin.html#site, #demandes, #clients, #argent.
    const h = location.hash.slice(1); if (state.data && TITRES[h] && h !== "today") go(h);
  }
  async function refresh(silent) {
    const b = $("#b-refresh"); b.classList.add("spin");
    const [t, d, tr] = await Promise.all([api("today"), api("demandes"), api("traces", { jours: 1 })]);
    b.classList.remove("spin");
    if (!t.ok || !d.ok) { if (t.error !== "auth" && d.error !== "auth") toast(err(t.ok ? d : t)); return; }
    // Les demandes « Hors cible » (appels poubelle, mises en service refusées…) restent dans le Google Sheet
    // pour mesurer la pub, mais n'encombrent pas l'espace admin (choix d'Andy, 07/11).
    state.today = t; state.data = (d.rows || []).filter(r => r.statut !== "Hors cible"); state.statuts = d.statuts || FLOW.concat(SIDE);
    if (tr && tr.ok) state.traces = tr.rows;
    render();
    api("depenses").then(x => { if (x && x.ok) { state.depenses = x.rows; if (state.view === "argent") render(); } });
    api("pubRoi").then(x => { if (x && x.ok) state.pub = x; else state.pubErr = x && x.error === "unknown_action" ? "Pas encore branché sur le serveur." : "Chiffres de la pub indisponibles."; if (state.view === "argent") render(); });
    if (!silent) toast("À jour");
  }
  $("#b-refresh").addEventListener("click", () => refresh());

  const TITRES = { today: "Aujourd'hui", demandes: "Demandes", clients: "Clients", argent: "Argent", site: "Visiteurs du site", plus: "Réglages" };
  $$(".ad-nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.v)));
  $("#b-plus").addEventListener("click", () => go(state.view === "plus" ? "today" : "plus"));
  // Changement de section : fondu court quand le navigateur le permet (jamais si l'utilisateur a réduit les animations).
  const doux = fn => (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) ? document.startViewTransition(fn) : fn();
  function go(v) {
    if (v !== "demandes") state.etape = "";
    doux(() => {
      state.view = v;
      $$(".ad-nav button").forEach(b => b.dataset.v === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
      $("#b-plus").setAttribute("aria-pressed", String(v === "plus"));
      $("#b-new").hidden = v === "site" || v === "plus";
      $$("[data-s]").forEach(s => s.hidden = s.dataset.s !== v);
      $("#titre").textContent = TITRES[v];
      render(); window.scrollTo(0, 0);
    });
  }
  function render() {
    if (!state.data) return;
    $("#dot-today").hidden = !resteAFaire().length;
    ({ today: renderToday, demandes: renderDemandes, clients: renderClients, argent: renderArgent, site: renderSite, plus: renderPlus })[state.view]();
  }

  /* ----- Question ou montant : une feuille de l'appli à la place des fenêtres du navigateur ----- */
  // Rend le montant saisi (nombre), true pour une simple confirmation, ou null si annulé.
  function demander({ titre, sous, champ, defaut, oui, danger }) {
    return new Promise(done => {
      const d = $("#ask"), inp = $("#ask-val");
      $("#ask-titre").textContent = titre; $("#ask-sous").textContent = sous || ""; $("#ask-sous").hidden = !sous;
      $("#ask-champ").hidden = !champ; $("#ask-lab").textContent = champ || ""; inp.value = defaut === undefined || defaut === null ? "" : String(defaut);
      $("#ask-oui").textContent = oui || "Valider"; $("#ask-oui").classList.toggle("ad-btn--warm", !!danger);
      msg("m-ask", "");
      let rendu = false;
      const fin = v => { if (rendu) return; rendu = true; $("#f-ask").onsubmit = null; $("#ask-non").onclick = null; d.onclose = null; if (d.open) d.close(); done(v); };
      $("#f-ask").onsubmit = e => {
        e.preventDefault();
        if (!champ) return fin(true);
        const m = lireMontant(String(inp.value).replace(/\s/g, ""));
        if (!(m > 0)) return msg("m-ask", "Montant invalide.");
        fin(m);
      };
      $("#ask-non").onclick = () => fin(null);
      d.onclose = () => fin(null);
      d.showModal();
      if (champ) setTimeout(() => { inp.focus(); inp.select(); }, 60);
    });
  }

  /* ----- Cartes ----- */
  const tel = t => { const d = String(t || "").replace(/[^\d+]/g, ""); return d.startsWith("0") ? "+33" + d.slice(1) : d; };
  // Note du prospect (A, B ou C), lue dans la colonne « Qualité » du CRM : « C : compare pour l'instant, hors zone ».
  function noteDe(r) {
    const m = String((r && r.qualite) || "").trim().match(/^([ABC])(?:\s*:\s*(.*))?$/);
    return m ? { note: m[1], raison: (m[2] || "").trim() } : null;
  }
  const NOTE_MOT = { A: "bon prospect, à rappeler dans l'heure", B: "à rappeler aujourd'hui", C: "réponse par message, pas de déplacement avant photos" };
  const pastille = n => el("span", { class: "ad-note", "data-n": n.note, title: "Prospect " + n.note + " : " + NOTE_MOT[n.note], "aria-label": "Prospect " + n.note, text: n.note });
  // Tri : les A d'abord, puis les B (et les demandes sans note), puis les C. L'ordre d'origine est gardé à note égale.
  const rangNote = r => { const n = noteDe(r); return n ? { A: 0, B: 1, C: 2 }[n.note] : 1; };
  function carte(r, ligne) {
    const t = tel(r.tel), q = quand(r.action), n = noteDe(r);
    return el("article", { class: "ad-item" },
      el("button", { class: "ad-item-main", type: "button", onclick: () => openFiche(r) },
        el("span", { class: "ad-item-top" }, el("span", { class: "ad-item-nom" }, n ? pastille(n) : null, el("b", { text: r.nom || "(sans nom)" })), el("span", { class: "ad-badge", "data-s": r.statut || "", text: r.statut || "Nouveau" })),
        el("small", { text: [r.commune, r.prestation, r.montantNum ? euro(r.montantNum) : ""].filter(Boolean).join(" · ") }),
        n && n.raison ? el("small", { class: "ad-raison", text: "Prospect " + n.note + " : " + n.raison }) : null,
        ligne !== false && r.action ? el("span", { class: "ad-next" + (q && q.diff < 0 ? " late" : ""), text: "→ " + r.action + (q ? " (" + q.label + ")" : "") })
          : el("small", { text: "Reçue le " + r.recu })),
      el("div", { class: "ad-item-acts" },
        t ? el("a", { href: "tel:" + t }, icon("phone", 16), "Appeler") : null,
        t ? el("a", { href: "https://wa.me/" + t.replace("+", ""), target: "_blank", rel: "noopener noreferrer" }, icon("chat", 16), "WhatsApp") : null,
        el("button", { type: "button", onclick: () => openFiche(r) }, "Ouvrir")));
  }

  /* ----- Aujourd'hui ----- */
  // Devis sans nouvelles : « Devis envoyé », aucune relance datée à venir, rien de noté depuis 5 jours.
  const FROID_J = 5;
  function derniereActivite(r) {
    const auj = debutJour(), dates = [];
    const recu = String(r.recu || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (recu) dates.push(new Date(Number(recu[3]), Number(recu[2]) - 1, Number(recu[1])));
    for (const m of String(r.notes || "").matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g)) {
      let y = m[3] ? Number(m[3]) : auj.getFullYear(); if (y < 100) y += 2000;
      let d = new Date(y, Number(m[2]) - 1, Number(m[1]));
      if (!m[3] && d > auj) d = new Date(y - 1, Number(m[2]) - 1, Number(m[1]));
      if (d <= auj && Number(m[2]) <= 12) dates.push(d);
    }
    return dates.length ? new Date(Math.max(...dates)) : null;
  }
  function joursSansNouvelles(r) {
    if (r.statut !== "Devis envoyé") return null;
    const a = dateDans(r.action); if (a && debutJour(a) > debutJour()) return null;
    const d = derniereActivite(r); if (!d) return null;
    const n = Math.round((debutJour() - debutJour(d)) / 864e5);
    return n >= FROID_J ? n : null;
  }
  function aFaire() {
    const t = state.today; if (!t) return [];
    const vus = new Set(), l = [];
    const froids = (state.data || []).filter(r => joursSansNouvelles(r) !== null);
    for (const r of [...t.nouveaux, ...t.relances, ...froids]) if (!vus.has(r.row)) { vus.add(r.row); l.push(state.data.find(x => x.row === r.row) || r); }
    return l;
  }

  /* ----- Fenêtre de choix ----- */
  function choisir(titre, sous, options) {
    $("#ch-titre").textContent = titre; $("#ch-sous").textContent = sous || "";
    $("#ch-liste").replaceChildren(...options.map((o, i) => el("button", { type: "button", class: "ad-btn" + (i === 0 ? " ad-btn--main" : ""), onclick: () => { $("#choix").close(); o.fn(); } },
      el("span", { text: o.t }), o.s ? el("small", { text: o.s }) : null)));
    $("#choix").showModal();
  }
  const dansJours = n => { const d = new Date(); d.setDate(d.getDate() + n); return ddmm(d); };
  // L'écran change tout de suite ; le CRM est mis à jour derrière. En cas d'échec, on recharge l'état réel.
  async function majFiche(r, fields, ok) {
    const loc = (state.data || []).find(x => x.row === r.row);
    if (loc) {
      if (fields.statut !== undefined) loc.statut = fields.statut;
      if (fields.action !== undefined) loc.action = fields.action;
      if (fields.montant !== undefined) { loc.montant = fields.montant; loc.montantNum = lireMontant(fields.montant); }
      if (fields.noteAjout) loc.notes = (loc.notes ? loc.notes + "\n" : "") + "[" + ddmm(new Date()) + "] " + fields.noteAjout;
      render();
    }
    toast(ok || "Enregistré dans le CRM");
    const res = await api("update", { row: r.row, nom: r.nom, fields });
    if (!res.ok) toast(err(res));
    await refresh(true);
  }
  function faitAvecSuite(r) {
    const quoi = r.action || (r.statut === "Nouveau" || !r.statut ? "premier appel" : "tâche");
    const st = !r.statut || r.statut === "Nouveau" ? { statut: "Rappelé" } : {};
    const tr = suite => tracer("Fait", (r.nom || "?") + " · " + quoi + " · " + suite, r.row);
    choisir("C'est fait. Et ensuite ?", r.nom + " · " + quoi, [
      { t: "Relancer dans 3 jours", s: "Revient le " + dansJours(3), fn: () => { tr("relance le " + dansJours(3)); majFiche(r, { ...st, action: "Relancer le " + dansJours(3), noteAjout: "Fait : " + quoi }, "Noté, relance le " + dansJours(3)); } },
      { t: "Relancer dans 1 semaine", s: "Revient le " + dansJours(7), fn: () => { tr("relance le " + dansJours(7)); majFiche(r, { ...st, action: "Relancer le " + dansJours(7), noteAjout: "Fait : " + quoi }, "Noté, relance le " + dansJours(7)); } },
      { t: "Plus rien à faire", s: "La prochaine action est effacée", fn: () => { tr("terminé"); majFiche(r, { ...st, action: "", noteAjout: "Fait : " + quoi }, "Noté dans le CRM"); } },
      { t: "Juste cocher", s: "Sans rien changer dans le CRM (sur cet appareil)", fn: () => basculerFait(r) }
    ]);
  }

  /* ----- Relancer un devis ----- */
  const prenom = n => String(n || "").trim().split(/\s+/)[0] || "";
  function texteRelance(r) {
    return "Bonjour " + prenom(r.nom) + ",\n\nJe reviens vers vous pour le devis de climatisation que je vous ai envoyé. Avez-vous pu le regarder ?\n\nSi vous avez une question ou souhaitez un ajustement, je reste disponible.\n\nBonne journée,\nAndy – Thermaz\n06 51 10 64 35";
  }
  function relancer(r) {
    const t = tel(r.tel), txt = texteRelance(r), suite = dansJours(4);
    const noter = canal => (tracer("Relance envoyée", (r.nom || "?") + " · par " + canal, r.row), majFiche(r, { action: "Rappeler le " + suite + " (relance envoyée le " + dansJours(0) + ")", noteAjout: "Relance envoyée par " + canal }, "Relance notée, rappel le " + suite));
    const opts = [{ t: "Message écrit par l'agent commercial", s: "Il lit la fiche et le devis, tu relis et tu envoies", fn: () => agentRelance(r) }];
    if (t) opts.push({ t: "WhatsApp", s: "Message prêt, tu n'as qu'à l'envoyer", fn: () => { window.open("https://wa.me/" + t.replace("+", "") + "?text=" + encodeURIComponent(txt), "_blank", "noopener"); noter("WhatsApp"); } });
    if (r.email) opts.push({ t: "E-mail", s: "Mail prêt dans ton appli mail", fn: () => { location.href = "mailto:" + r.email + "?subject=" + encodeURIComponent("Votre devis climatisation – Thermaz") + "&body=" + encodeURIComponent(txt); noter("e-mail"); } });
    if (t) opts.push({ t: "SMS", s: "Message prêt dans tes SMS", fn: () => { location.href = "sms:" + t + "?&body=" + encodeURIComponent(txt); noter("SMS"); } });
    if (t) opts.push({ t: "Appeler", s: "Puis note le résultat avec « Fait »", fn: () => { location.href = "tel:" + t; } });
    if (!opts.length) return toast("Ni téléphone ni e-mail sur cette fiche.");
    choisir("Relancer " + prenom(r.nom), "Devis " + (r.montantNum ? euro(r.montantNum) : "") + " · rappel noté pour le " + suite, opts);
  }
  /* ----- Agent commercial : il propose le message, Andy relit, corrige et envoie lui-même ----- */
  async function agentRelance(r, consigne) {
    const box = $("#dv-body"), t = tel(r.tel), suite = dansJours(4);
    $("#dv-titre").textContent = "Relance · " + (r.nom || "");
    box.replaceChildren(el("div", { class: "ad-skel", "aria-hidden": "true" }), el("p", { class: "ad-muted", text: "L'agent commercial lit la fiche et le devis…" }));
    if (!$("#devis").open) $("#devis").showModal();
    const res = await api("commercial", { row: r.row, nom: r.nom, type: "relance", consigne: consigne || "" });
    if (!res.ok) return box.replaceChildren(el("p", { class: "ad-msg", text: err(res) }), el("button", { type: "button", class: "ad-btn", text: "Fermer", onclick: () => $("#devis").close() }));
    const court = el("textarea", { class: "ad-input", rows: "7", "aria-label": "Message court" }); court.value = res.court || "";
    const mail = el("textarea", { class: "ad-input", rows: "9", "aria-label": "Texte du mail" }); mail.value = res.mail || "";
    const cons = el("input", { placeholder: "Ex. : propose l'option moins chère", autocomplete: "off", value: consigne || "" });
    const statut = el("p", { class: "ad-msg", role: "status" });
    const garder = el("input", { type: "checkbox" });
    const noter = (canal, texte) => { if (res.id && texte) api("commercialEnvoye", { id: res.id, row: r.row, texte, canal }); tracer("Relance envoyée", (r.nom || "?") + " · par " + canal + " (agent commercial)", r.row); majFiche(r, { action: "Rappeler le " + suite + " (relance envoyée le " + dansJours(0) + ")", noteAjout: "Relance envoyée par " + canal }, "Relance notée, rappel le " + suite); };
    box.replaceChildren(...[
      res.conseil ? el("div", { class: "ad-conseil" }, el("b", { text: "Ce que l'agent a compris" }), el("p", { text: res.conseil })) : null,
      el("label", {}, "Message court (WhatsApp ou SMS), à corriger si besoin", court),
      el("div", { class: "ad-row2" },
        t ? el("button", { type: "button", class: "ad-btn ad-btn--main", onclick: () => { window.open("https://wa.me/" + t.replace("+", "") + "?text=" + encodeURIComponent(court.value), "_blank", "noopener"); noter("WhatsApp", court.value); } }, icon("chat", 16), "WhatsApp") : null,
        t ? el("button", { type: "button", class: "ad-btn", onclick: () => { location.href = "sms:" + t + "?&body=" + encodeURIComponent(court.value); noter("SMS", court.value); } }, "SMS") : null),
      r.email ? el("label", {}, "Mail : " + (res.objet || "Votre devis climatisation"), mail) : null,
      r.email ? el("button", { type: "button", class: "ad-btn", onclick: e => busy(e.currentTarget, async () => {
        statut.textContent = "Création du brouillon…";
        const out = await api("repondreClient", { row: r.row, nom: r.nom, texte: mail.value.trim(), objet: res.objet || "Votre devis climatisation – Thermaz", envoyer: false });
        statut.textContent = out.ok ? "Brouillon prêt dans Gmail : relis-le puis envoie." : err(out);
        if (out.ok) noter("e-mail", mail.value.trim());
      }) }, icon("mail", 16), "Mettre le mail en brouillon Gmail") : null,
      statut,
      el("label", {}, "Pas convaincu ? Donne une consigne à l'agent", cons),
      el("label", { class: "ad-check" }, garder, "Retenir cette consigne pour tous les prochains messages"),
      el("button", { type: "button", class: "ad-btn", text: "Refaire le message", onclick: async () => { const c = cons.value.trim(); if (garder.checked && c) { await api("commercialRegles", { ajouter: c }); toast("Consigne retenue par l'agent"); } agentRelance(r, c); } }),
      el("button", { type: "button", class: "ad-btn", text: "Fermer", onclick: () => $("#devis").close() })
    ].filter(Boolean));
  }

  // Tâches cochées « Fait » : gardées sur cet appareil, 30 jours.
  // La clé suit la ligne ET son contenu : si le statut ou la prochaine action change, la tâche redevient à faire.
  const FK = "thz_admin_faits";
  const faitCle = r => [r.row, r.nom, r.statut, r.action].map(x => String(x || "")).join("|");
  function faits() {
    let f = {}; try { f = JSON.parse(localStorage.getItem(FK) || "{}") || {}; } catch (e) {}
    const lim = Date.now() - 30 * 864e5;
    for (const k of Object.keys(f)) if (!(f[k] > lim)) delete f[k];
    return f;
  }
  const estFait = r => { const e = etatTrace(faitCle(r)); return e === null ? !!faits()[faitCle(r)] : e; };
  function basculerFait(r) {
    const f = faits(), k = faitCle(r), etait = !!f[k];
    if (etait) delete f[k]; else f[k] = Date.now();
    try { localStorage.setItem(FK, JSON.stringify(f)); } catch (e) {}
    tracer(etait ? "Remis à faire" : "Fait", (r.nom || "?") + " · " + (r.action || "premier appel"), r.row, k);
    render();
  }
  const resteAFaire = () => aFaire().filter(r => !estFait(r));
  /* ----- Journal de ce qui a été fait (onglet « Journal » du CRM, visible sur tous les appareils) ----- */
  const aujFr = () => new Date().toLocaleDateString("fr-FR");
  function tracer(type, quoi, ligne, cle) {
    const now = new Date();
    (state.traces = state.traces || []).push({ date: aujFr(), heure: pad(now.getHours()) + ":" + pad(now.getMinutes()), source: "Admin", type, quoi, ligne: ligne || "", cle: cle || "" });
    api("trace", { type, quoi, ligne, cle }).then(r => { if (r && !r.ok && r.error !== "auth") toast("Trace non enregistrée : " + err(r)); });
  }
  // Dernier état connu d'un élément d'après le journal : true (fait), false (remis), null (rien).
  function etatTrace(cle) {
    let e = null;
    for (const t of state.traces || []) if (t.cle === cle && t.date === aujFr()) e = !/remis/i.test(t.type);
    return e;
  }

  // Rendez-vous cochés « Fait » : ils descendent en bas, grisés. Gardé dans le journal (et sur l'appareil).
  const rdvCle = ev => "rdv|" + ev.titre + "|" + ev.debut;
  const rdvFait = ev => { const e = etatTrace(rdvCle(ev)); return (e === null ? !!faits()[rdvCle(ev)] : e) ? 1 : 0; };
  function basculerRdv(ev) {
    const f = faits(), k = rdvCle(ev), etait = !!rdvFait(ev);
    if (etait) delete f[k]; else f[k] = Date.now();
    try { localStorage.setItem(FK, JSON.stringify(f)); } catch (e) {}
    tracer(etait ? "RDV remis à faire" : "RDV fait", ev.titre, "", k);
    render();
    if (!etait && /visite/i.test(ev.titre || "")) {
      const r = ficheDuRdv(ev);
      choisir("Visite faite. On prépare le devis ?", (r ? r.nom + " · " : "") + ev.titre, [
        { t: "Préparer le devis", s: "Prix du site + 2-3 questions, puis brouillon Gmail et SMS", fn: () => ouvrirDevis(r) },
        { t: "Plus tard", s: "Bouton « Devis » dans la fiche du client", fn: () => {} }
      ]);
    }
  }
  function carteRdv(ev) {
    const fait = !!rdvFait(ev);
    return el("article", { class: "ad-item" + (fait ? " fait" : "") },
      el("div", { class: "ad-item-main" },
        el("span", { class: "ad-item-top" }, el("b", { text: ev.titre })),
        el("small", { text: ev.journee ? "Toute la journée" : new Date(ev.debut).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" }) }),
        ev.lieu ? el("small", { text: ev.lieu }) : null),
      el("div", { class: "ad-item-acts" },
        el("button", { type: "button", class: "ad-fait", "aria-pressed": fait ? "true" : "false", onclick: () => basculerRdv(ev) }, icon(fait ? "refresh" : "check", 16), fait ? "Remettre" : "Fait"),
        ev.lieu ? el("a", { href: "https://waze.com/ul?navigate=yes&q=" + encodeURIComponent(ev.lieu), target: "_blank", rel: "noopener noreferrer" }, icon("map", 16), "Waze") : null));
  }
  function carteTache(r) {
    const fait = estFait(r), c = carte(r), froid = joursSansNouvelles(r), acts = c.querySelector(".ad-item-acts");
    if (fait) c.classList.add("fait");
    if (froid !== null) c.querySelector(".ad-item-main").append(el("span", { class: "ad-froid", text: "Devis sans nouvelles depuis " + froid + " jours" }));
    const bFait = el("button", { type: "button", class: "ad-fait", "aria-pressed": fait ? "true" : "false", onclick: () => fait ? basculerFait(r) : faitAvecSuite(r) }, icon(fait ? "refresh" : "check", 16), fait ? "Remettre" : "Fait");
    if (froid !== null && !fait) acts.replaceChildren(bFait, el("button", { type: "button", onclick: () => relancer(r) }, icon("chat", 16), "Relancer"), el("button", { type: "button", onclick: () => openFiche(r) }, "Ouvrir"));
    else acts.prepend(bFait);
    return c;
  }
  // Le fil des chantiers : combien de demandes à chaque étape, du premier contact au paiement.
  function filDesChantiers() {
    const flow = FLOW.filter(s => !state.statuts.length || state.statuts.includes(s));
    const nb = s => (state.data || []).filter(r => (r.statut || "Nouveau") === s).length;
    return el("div", { class: "ad-pipe", role: "list", "aria-label": "Demandes par étape" }, flow.map(s => {
      const n = nb(s);
      return el("button", { type: "button", role: "listitem", class: n ? null : "vide", "aria-label": s + " : " + n, onclick: () => { state.etape = s; state.q = ""; $("#d-q").value = ""; go("demandes"); } },
        el("b", { text: n }), el("span", { text: COURT[s] || s }));
    }));
  }
  function renderToday() {
    const t = state.today, c = t.chiffres, s = $("#s-today"), tout = aFaire(), finis = tout.filter(estFait);
    // « À faire maintenant » : les prospects A passent avant les B, puis les C.
    const todo = tout.filter(r => !estFait(r)).sort((x, y) => rangNote(x) - rangNote(y));
    const h = new Date().getHours();
    const att = enAttentePaiement(), aEnc = att.reduce((x, r) => x + reste(r), 0);
    const avenir = (t.rdv || []).filter(ev => !rdvFait(ev)).sort((a, b) => new Date(a.debut) - new Date(b.debut))[0];
    s.replaceChildren(...[
      el("div", { class: "ad-hero" },
        el("p", { class: "ad-hero-date", text: new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) }),
        el("p", { class: "ad-hello", text: (h < 18 ? "Bonjour Andy" : "Bonsoir Andy") }),
        el("p", { class: "ad-hero-tache", text: todo.length ? todo.length + (todo.length > 1 ? " choses à faire aujourd'hui" : " chose à faire aujourd'hui") : "Rien d'urgent aujourd'hui" }),
        avenir ? el("p", { class: "ad-hero-rdv" }, icon("map", 16), (avenir.journee ? "Toute la journée" : new Date(avenir.debut).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })) + " : " + avenir.titre) : null,
        el("div", { class: "ad-kpis" },
          el("button", { type: "button", onclick: () => { state.etape = "Devis envoyé"; go("demandes"); } }, el("b", { text: euro(c.attenteMontant) }), el("span", { text: c.attenteNb + " devis en attente" })),
          el("button", { type: "button", onclick: () => go("clients") }, el("b", { text: euro(aEnc) }), el("span", { text: "à encaisser" })),
          el("button", { type: "button", onclick: () => go("argent") }, el("b", { text: euro(c.signesMontant) }), el("span", { text: c.signesNb + (c.signesNb > 1 ? " devis signés" : " devis signé") })))),
      el("h2", { class: "ad-h2", text: "Où en sont les demandes" }),
      filDesChantiers(),
      el("h2", { class: "ad-h2", text: "Rendez-vous aujourd'hui et demain" }),
      t.rdv.length ? el("div", { class: "ad-list" }, [...t.rdv].sort((a, b) => rdvFait(a) - rdvFait(b)).map(carteRdv))
        : el("p", { class: "ad-empty", text: "Aucun rendez-vous dans l'agenda." }),
      el("h2", { class: "ad-h2" }, "À faire maintenant", todo.length ? el("b", { text: todo.length }) : null),
      todo.length ? el("div", { class: "ad-list" }, todo.map(carteTache))
        : el("p", { class: "ad-empty", text: finis.length ? "Tout est fait pour aujourd'hui. Bravo." : "Personne à rappeler et aucune relance pour aujourd'hui. Profite." }),
      finis.length ? el("h2", { class: "ad-h2 ad-h2--fait" }, "Fait", el("b", { text: finis.length })) : null,
      finis.length ? el("div", { class: "ad-list" }, finis.map(carteTache)) : null,
      journalDuJour()].filter(Boolean));
  }
  // « Fait aujourd'hui » : tout ce qui a été noté dans le journal aujourd'hui, ici et par le bot Telegram.
  function journalDuJour() {
    const l = (state.traces || []).filter(x => x.date === aujFr()).slice().reverse();
    const box = el("details", { class: "ad-group ad-journal", open: new Date().getHours() >= 17 || null },
      el("summary", {}, el("span", { class: "ad-h2" }, "Fait aujourd'hui", el("b", { text: l.length }))));
    box.append(l.length ? el("div", { class: "ad-panel" }, l.map(x => el("div", { class: "ad-row" },
        el("span", {}, el("b", { text: x.type }), " · " + x.quoi + (x.source === "Telegram" ? " (bot)" : "")),
        el("b", { text: x.heure }))))
      : el("p", { class: "ad-empty", text: "Rien de noté pour l'instant. Chaque « Fait », paiement, relance ou ajout du bot s'affichera ici." }));
    return box;
  }

  /* ----- Demandes ----- */
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function cherche(r) {
    const q = norm(state.q); if (!q) return true;
    const qd = q.replace(/\D/g, "");
    return norm([r.nom, r.commune, r.prestation, r.details, r.email, r.action].join(" ")).includes(q) || (qd.length >= 4 && r.tel.replace(/\D/g, "").includes(qd));
  }
  function renderDemandes() {
    const flow = FLOW.filter(s => !state.statuts.length || state.statuts.includes(s));
    $("#d-etapes").replaceChildren(...[["", "Toutes"], ...flow.map(s => [s, COURT[s] || s]), ["Perdu", "Perdus"]].map(([v, t]) =>
      el("button", { type: "button", "aria-pressed": String(state.etape === v), text: t, onclick: () => { state.etape = v; renderDemandes(); } })));
    const rows = state.data.filter(cherche).filter(r => !state.etape || (r.statut || "Nouveau") === state.etape).slice().reverse();
    const box = $("#d-liste");
    if (!rows.length) return box.replaceChildren(el("p", { class: "ad-empty", text: "Aucune demande ne correspond." }));
    box.replaceChildren(...GROUPES.map(g => {
      const l = rows.filter(r => g.f(r.statut || ""));
      if (!l.length) return null;
      return el("details", { class: "ad-group", open: g.open || !!state.q || !!state.etape },
        el("summary", {}, el("span", { class: "ad-h2" }, g.t, el("b", { text: l.length }))),
        el("div", { class: "ad-list" }, l.map(r => carte(r))));
    }).filter(Boolean));
  }
  $("#d-q").addEventListener("input", e => { state.q = e.target.value; renderDemandes(); });

  /* ----- Fiche ----- */
  // Adresse pour Waze : celle notée dans les détails (« Adresse : … ») sinon la commune.
  function adresseDe(r) {
    const m = String(r.details || "").match(/adresse\s*:\s*([^.\n]{6,160})/i);
    return m ? m[1].trim() : r.commune + ", France";
  }
  function openFiche(r) {
    state.current = r; state.pend = { statut: r.statut || "Nouveau" };
    $("#fi-nom").textContent = r.nom || "(sans nom)";
    $("#fi-sous").textContent = [r.prestation, r.commune, "reçue le " + r.recu].filter(Boolean).join(" · ");
    const t = tel(r.tel);
    const quick = (ok, attrs, ic, txt) => el("a", { class: ok ? null : "off", ...(ok ? attrs : {}), "aria-disabled": ok ? null : "true" }, icon(ic, 20), txt);
    $("#fi-actions").replaceChildren(
      quick(!!t, { href: "tel:" + t }, "phone", "Appeler"),
      quick(!!t, { href: "https://wa.me/" + t.replace("+", ""), target: "_blank", rel: "noopener noreferrer" }, "chat", "WhatsApp"),
      quick(!!r.email, { href: "#", onclick: e => { e.preventDefault(); $("#fiche").close(); ouvrirMails(r); } }, "mail", "Mails"),
      quick(!!r.commune, { href: "https://waze.com/ul?navigate=yes&q=" + encodeURIComponent(adresseDe(r)), target: "_blank", rel: "noopener noreferrer" }, "map", "Waze"),
      quick(true, { href: "#", onclick: e => { e.preventDefault(); $("#fiche").close(); ouvrirDevis(r); } }, "euro", "Devis"),
      quick(GAGNES.includes(r.statut), { href: "#", onclick: e => { e.preventDefault(); $("#fiche").close(); facturer(r); } }, "list", "Facture"));
    drawSteps();
    $("#fi-action").value = r.action || "";
    $("#fi-dates").replaceChildren(...[["Aujourd'hui", 0], ["Demain", 1], ["Dans 3 jours", 3], ["Dans 1 semaine", 7], ["Effacer", null]].map(([t2, n]) => el("button", { type: "button", text: t2, onclick: () => setDate(n) })));
    $("#fi-note").value = "";
    $("#fi-notes-rapides").replaceChildren(...["Pas de réponse", "Message laissé", "Rappelé", "Visite fixée", "Devis envoyé", "Attend l'accord", "Trop cher"].map(t2 => el("button", { type: "button", text: t2, onclick: () => { const n = $("#fi-note"); n.value = (n.value ? n.value.replace(/\s*$/, "") + ". " : "") + t2; } })));
    $("#fi-notes").textContent = r.notes || "";
    $("#fi-montant").value = r.montantNum || "";
    const nq = noteDe(r);
    const infos = [["Note du prospect", nq ? nq.note + " : " + (nq.raison ? nq.raison + " (" + NOTE_MOT[nq.note] + ")" : NOTE_MOT[nq.note]) : ""], ["Téléphone", r.tel], ["E-mail", r.email], ["Détails", r.details], ["Message", r.message], ["Estimation", r.estimation], ["Origine", [r.source, r.connu].filter(Boolean).join(" · ")], ["Ligne du CRM", String(r.row)]];
    $("#fi-infos").replaceChildren(...infos.filter(i => i[1]).flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]));
    msg("m-fiche", "");
    $("#fiche").showModal();
  }
  function drawSteps() {
    const all = state.statuts.length ? state.statuts : FLOW.concat(SIDE);
    const flow = FLOW.filter(s => all.includes(s));
    const autres = all.filter(s => !flow.includes(s));
    const cur = state.pend.statut, idx = flow.indexOf(cur);
    $("#fi-steps").replaceChildren(...flow.map((s, i) => el("li", { class: i === idx ? "cur" : i < idx ? "done" : null },
      el("button", { type: "button", "aria-pressed": String(i === idx), text: COURT[s] || s, title: s, onclick: () => { state.pend.statut = s; drawSteps(); } }))));
    $("#fi-side").replaceChildren(...autres.map(s => el("button", { type: "button", "aria-pressed": String(s === cur), text: s, onclick: () => { state.pend.statut = s; drawSteps(); } })));
  }
  function setDate(n) {
    const inp = $("#fi-action");
    if (n === null) { inp.value = ""; return; }
    const d = new Date(); d.setDate(d.getDate() + n);
    const v = inp.value.trim(), re = /\d{1,2}\/\d{1,2}(\/\d{2,4})?/;
    inp.value = re.test(v) ? v.replace(re, ddmm(d)) : v ? v + " le " + ddmm(d) : "Rappeler le " + ddmm(d);
  }
  $$("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));
  $("#fi-save").addEventListener("click", e => busy(e.currentTarget, async () => {
    const r = state.current, f = {};
    const st = state.pend.statut, ac = $("#fi-action").value.trim(), mo = $("#fi-montant").value.trim(), no = $("#fi-note").value.trim();
    if (st !== (r.statut || "") ) f.statut = st;
    if (ac !== (r.action || "")) f.action = ac;
    if (mo !== String(r.montantNum || "")) f.montant = mo;
    if (no) f.noteAjout = no;
    if (!Object.keys(f).length) { $("#fiche").close(); return; }
    const enregistrer = async f => {
      const res = await api("update", { row: r.row, nom: r.nom, fields: f });
      if (!res.ok) return msg("m-fiche", err(res));
      tracer("Fiche modifiée", (r.nom || "?") + (f.statut ? " → " + f.statut : "") + (f.noteAjout ? " · " + f.noteAjout.slice(0, 80) : ""), r.row);
      $("#fiche").close(); toast("Enregistré dans le CRM");
      await refresh(true);
    };
    // Devis perdu : on note pourquoi (lu par le rapport du lundi pour savoir si le problème vient du prix, de l'offre ou du suivi).
    if (f.statut === "Perdu") {
      const raison = t => enregistrer({ ...f, noteAjout: "Raison de la perte : " + t + (no ? " · " + no : "") });
      return choisir("Pourquoi c'est perdu ?", r.nom || "", RAISONS_PERTE.map(t => ({ t, fn: () => raison(t) })));
    }
    await enregistrer(f);
  }));

  /* ----- Note du prospect : copie fidèle de la règle du serveur -----
     Le bloc ci-dessous est le MÊME que dans les deux scripts Google (CRM-THERMAZ/Code.gs et admin-api/Code.gs).
     Il sert au verdict en direct du guide d'appel et au mode démo. La note enregistrée reste celle calculée par le serveur :
     si la règle change là-bas, recopie le bloc ici, sinon le guide d'appel et le CRM ne diront plus la même chose. */
/* --- NOTE PROSPECT : début du bloc commun --- */

// Zones du site (data/devis-rapide.json > ent.zones, recopiées le 22/11/2026) et nouvelle zone sud.
const NP_ZONES = [
  { z: 1, communes: ['Salon-de-Provence', 'Pélissanne', 'Grans', 'La Barben', 'Lamanon'] },
  { z: 2, communes: ['Lançon-Provence', 'Cornillon-Confoux', 'Eyguières', 'Sénas', 'Saint-Chamas', 'Miramas', 'La Fare-les-Oliviers', 'Lambesc', 'Mallemort', 'Aurons', 'Vernègues', 'Alleins'] },
  { z: 3, communes: ['Istres', 'Saint-Cannat', 'Coudoux', 'Velaux', 'Éguilles', 'Charleval'] },
  { z: 4, communes: ['Aix-en-Provence', 'Ventabren'] }, // la plus éloignée (27 à 37 km) : jamais A
  { z: 'sud', communes: ['Vitrolles', 'Marignane', 'Martigues', 'Carry-le-Rouet', 'Sausset-les-Pins', 'Rognac', 'Berre-l\'Étang', 'Saint-Victoret', 'Châteauneuf-les-Martigues', 'Gignac-la-Nerthe', 'Ensuès-la-Redonne'] }
];
// Noms courts que les gens écrivent souvent à la place du nom complet.
const NP_ALIAS = { 'salon': 1, 'lancon': 2, 'lancon de provence': 2, 'la fare': 2, 'aix': 4, 'berre': 'sud', 'carry': 'sud', 'sausset': 'sud', 'ensues': 'sud' };

// Nom lisible des questions du site. Sert à écrire la colonne « Détails » et à relire une ligne du CRM.
const NP_LIBELLES = {
  deja_clim: 'Déjà une clim', occupant: 'Occupant', delai: 'Délai', budget: 'Budget',
  appareil: 'Appareil', poseur: 'Posée par', age_clim: 'Âge de la clim', diagnostic_89: 'Diagnostic à 89 €',
  prix_ok: 'Réaction au prix' // guide d'appel de l'espace admin : « Ça lui va », « Il hésite », « Trop cher pour lui »
};

// Première chose à faire selon la note.
const NP_ACTIONS = {
  A: 'Rappeler dans l\'heure',
  B: 'Rappeler aujourd\'hui',
  C: 'Répondre par message, pas de déplacement avant photos'
};

/** Texte simplifié pour comparer : sans majuscules, sans accents, sans tirets ni ponctuation. */
function npTexte(s) {
  return String(s === undefined || s === null ? '' : s).toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Valeur d'une question : le champ lui-même, sinon la ligne « Délai : … » relue dans les détails. */
function npChamp(f, cle) {
  if (f[cle] !== undefined && f[cle] !== null && String(f[cle]).trim()) return String(f[cle]).trim();
  const noms = [npTexte(cle), npTexte(NP_LIBELLES[cle])];
  const lignes = String(f.details === undefined || f.details === null ? '' : f.details).split('\n');
  for (let i = 0; i < lignes.length; i++) {
    const p = lignes[i].indexOf(':');
    if (p > 0 && noms.indexOf(npTexte(lignes[i].slice(0, p))) >= 0) return lignes[i].slice(p + 1).trim();
  }
  return '';
}

/** Zone d'une commune : 1, 2, 3, 4, 'sud', 'hors' (commune connue nulle part) ou '' (commune non donnée). */
function npZone(commune) {
  const c = (' ' + npTexte(commune).replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim() + ' ')
    .replace(/ st /g, ' saint ').replace(/ ste /g, ' sainte ');
  if (!c.trim()) return '';
  let zone = 'hors', long = 0;
  const essai = function (nom, z) {
    const n = npTexte(nom);
    if (n.length > long && c.indexOf(' ' + n + ' ') >= 0) { zone = z; long = n.length; }
  };
  NP_ZONES.forEach(function (x) { x.communes.forEach(function (nom) { essai(nom, x.z); }); });
  Object.keys(NP_ALIAS).forEach(function (nom) { essai(nom, NP_ALIAS[nom]); });
  return zone;
}

/** Les nombres d'un texte (« 1 500 à 3 000 € » rend [1500, 3000]). */
function npNombres(s) {
  const t = String(s === undefined || s === null ? '' : s).replace(/[   ]/g, ' ');
  const liste = [];
  (t.match(/\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g) || []).forEach(function (m) {
    const milliers = /^\d{1,3}(?:[ .]\d{3})+/.test(m);
    const n = parseFloat((milliers ? m.replace(/[ .]/g, '') : m).replace(',', '.'));
    if (!isNaN(n)) liste.push(n);
  });
  return liste;
}

/** Vrai si on parle d'une clim monobloc ou mobile (et pas d'un téléphone mobile ou d'un mobil-home). */
function npMobile(appareil, texte) {
  if (/monobloc|mobile/.test(appareil) || /monobloc/.test(texte)) return true;
  const t = (' ' + texte + ' ')
    .replace(/ mobil ?e? ?home /g, ' ')
    .replace(/ (numero|telephone|tel|ligne|portable|application|appli|version|forfait) (de |du )?mobile /g, ' ')
    .replace(/ (sur|par|mon|au) (le |mon )?mobile /g, ' ');
  return / mobile /.test(t);
}

/**
 * Note d'une demande. f = les champs en texte (tous facultatifs) :
 * prestation, commune, telephone (ou tel), email, message, details, estimation, source, connu,
 * deja_clim, occupant, delai, budget, appareil, poseur, age_clim, diagnostic_89, prix_ok,
 * et appel (true quand la demande est notée pendant un appel, avec le guide d'appel de l'espace admin).
 * Rend { note: 'A' | 'B' | 'C', raisons: ['…'] }. Un champ absent ne donne jamais un C (sauf le téléphone).
 */
function noteProspect(f) {
  f = f || {};
  const texte = npTexte([f.details, f.message].join(' '));
  const origine = npTexte([f.source, f.connu].join(' '));
  const presta = npTexte(f.prestation);
  const delai = npTexte(npChamp(f, 'delai'));
  const occupant = npTexte(npChamp(f, 'occupant'));
  const prix = npTexte(npChamp(f, 'prix_ok'));
  const zone = npZone(f.commune);
  const appel = f.appel === true || /\bappel\b/.test(origine);

  // 1. Un seul de ces signaux suffit pour un C.
  const c = [];
  if (delai.indexOf('compare') >= 0) c.push('compare pour l\'instant');
  if (occupant.indexOf('pas encore d accord') >= 0) c.push('locataire sans accord du propriétaire');
  if (npMobile(npTexte(npChamp(f, 'appareil')), texte)) c.push('clim monobloc ou mobile');
  if (npTexte(npChamp(f, 'poseur')).indexOf('moi ou un proche') >= 0 || /\bkit\b|grande surface|pret a poser/.test(texte)) c.push('clim posée soi-même ou en kit');
  // Pas de téléphone = C, sauf pour un appel (le numéro est alors dans le téléphone d'Andy).
  if (String(f.telephone || f.tel || '').replace(/\D/g, '').length < 8 && !appel) c.push('pas de téléphone');
  if (zone === 'hors') c.push('hors zone');
  // Budget nettement sous le prix estimé : le haut de la tranche choisie est sous 85 % de l'estimation.
  const budget = npChamp(f, 'budget');
  const tranche = /plus de|ne sais pas/.test(npTexte(budget)) ? [] : npNombres(budget).filter(function (n) { return n >= 100; });
  const estime = npNombres(f.estimation).filter(function (n) { return n >= 100; })[0];
  if (tranche.length && estime && Math.max.apply(null, tranche) < 0.85 * estime) {
    c.push('budget sous l\'estimation (' + Math.max.apply(null, tranche) + ' € pour ' + Math.round(estime) + ' €)');
  }
  if (prix.indexOf('trop cher') >= 0) c.push('trop cher pour lui');
  if (c.length) return { note: 'C', raisons: c };

  // 2. Les signaux d'un bon prospect.
  const a = [];
  const remplacement = presta.indexOf('remplacement') >= 0 || npTexte(npChamp(f, 'deja_clim')).indexOf('je la remplace') >= 0;
  // Un appel compte comme bon signe seulement quand rien n'a été coché : avec le guide d'appel, ce sont les réponses qui décident.
  const guide = !!(delai || occupant || prix);
  if (appel && !guide) a.push('appel téléphonique');
  if (/bouche a oreille|recommand/.test(origine)) a.push('bouche-à-oreille');
  if (/client existant|deja client|ancien client/.test(origine)) a.push('client existant');
  if (remplacement) a.push('remplacement');
  if (presta.indexOf('entretien') >= 0) a.push('entretien');
  const proche = zone === 1 || zone === 2 || zone === 3, presse = delai.indexOf('des que possible') >= 0;
  if (proche && occupant.indexOf('proprietaire') === 0 && presse) a.push('propriétaire pressé en zone proche');
  // Au téléphone : pressé, en zone proche, et le prix annoncé lui va (propriétaire ou locataire avec accord).
  else if (appel && proche && presse && prix.indexOf('ca lui va') >= 0) a.push('pressé en zone proche, prix accepté');

  // 3. Ce qui empêche d'être A : la zone la plus éloignée, la zone sud (sauf appel ou remplacement), une hésitation sur le prix.
  const frein = [];
  if (zone === 4) frein.push('zone éloignée (27 à 37 km)');
  if (zone === 'sud' && !appel && !remplacement) frein.push('zone sud');
  if (prix.indexOf('hesite') >= 0) frein.push('hésite sur le prix');
  if (delai.indexOf('1 a 3 mois') >= 0 && presta.indexOf('entretien') < 0) frein.push('projet dans 1 à 3 mois');
  if (frein.length) return { note: 'B', raisons: frein.concat(a) };
  const plus = (zone === 'sud' ? ['zone sud'] : []).concat(prix.indexOf('ca lui va') >= 0 ? ['prix accepté'] : []);
  if (a.length) return { note: 'A', raisons: a.concat(plus) };

  // 4. Tout le reste : B.
  const b = [];
  if (occupant.indexOf('locataire') === 0) b.push('locataire avec accord');
  return { note: 'B', raisons: b.concat(plus) };
}

/** Texte écrit dans la colonne « Qualité » : « C : compare pour l'instant, hors zone ». */
function npTexteNote(n) {
  return n.note + (n.raisons && n.raisons.length ? ' : ' + n.raisons.join(', ') : '');
}

/* --- NOTE PROSPECT : fin du bloc commun --- */

  /* ----- Nouvelle demande ----- */
  const PRESTA = ["Installation", "Entretien", "Dépannage", "Remplacement", "Mise en service", "Autre"];
  const SOURCES = { "Appel Google Ads": ["Appel Google Ads", ""], "Appel direct": ["Autre", "Appel direct"], "Bouche-à-oreille": ["Autre", "Bouche-à-oreille"], "Facebook / Instagram": ["Autre", "Facebook / Instagram"], "Client existant": ["Autre", "Client existant"], "Autre": ["Autre", ""] };
  const pick = { presta: "", source: "", occupant: "", delai: "", prix: "", decision: "" };
  // apres (facultatif) : fonction appelée après chaque puce cochée ou décochée.
  function chipsPick(box, list, key, apres) {
    box.replaceChildren(...list.map(v => el("button", { type: "button", "aria-pressed": String(pick[key] === v), text: v, onclick: () => { pick[key] = pick[key] === v ? "" : v; chipsPick(box, list, key, apres); if (apres) apres(); } })));
  }

  /* ----- Guide d'appel : les questions à poser dans l'ordre, et le verdict en direct (visite ou pas) -----
     Les réponses sont les mêmes mots que sur le site : la note est donc calculée de la même façon partout. */
  const OCCUPANTS = ["Propriétaire", "Locataire, avec l'accord du propriétaire", "Locataire, pas encore d'accord"];
  const DELAIS = ["Dès que possible, sous 1 mois", "Dans 1 à 3 mois", "Plus tard, je compare pour l'instant"];
  const PRIX_OK = ["Ça lui va", "Il hésite", "Trop cher pour lui"];
  // Quoi faire selon la note (affiché dans l'encadré de verdict).
  const VERDICT = {
    A: "Propose la visite : donne-lui deux créneaux.",
    B: "Pas de visite tout de suite : demande 3 photos (le mur, l'emplacement dehors, le tableau électrique), puis rappelle avec un prix.",
    C: "Pas de visite. Envoie une fourchette par message et laisse-le revenir."
  };
  // La phrase à dire pour finir l'appel, selon la note.
  const SUITE = {
    A: "« Le plus simple, c'est que je passe voir sur place pour vous donner un prix ferme. Je peux passer … ou …, qu'est-ce qui vous arrange ? »",
    B: "« Pour vous donner un prix ferme sans vous faire perdre de temps, envoyez-moi 3 photos par message : le mur prévu pour l'unité intérieure, l'endroit dehors pour le groupe et votre tableau électrique. Je vous rappelle avec un prix dès que je les ai. »",
    C: "« Je vous envoie une fourchette de prix par message, comme ça vous avez tout sous les yeux. Et quand votre projet est décidé, vous me rappelez. »"
  };
  // Ce qu'Andy a vraiment décidé à la fin de l'appel (le serveur reçoit le mot court : visite, photos ou rien).
  const DECISIONS = { "J'ai proposé la visite": "visite", "J'ai demandé des photos": "photos", "Pas de suite pour l'instant": "rien" };
  // État du guide : la façon de saisir, la commune retenue pour le verdict, la fourchette affichée, l'heure d'ouverture.
  const guide = { mode: "appel", commune: "", fourchette: "", debut: 0 };
  // Les réponses notées pendant l'appel, sous la forme attendue par noteProspect (et par le serveur).
  function reponsesAppel() {
    const src = SOURCES[pick.source] || ["", ""];
    return { prestation: pick.presta, commune: guide.commune, telephone: $("#nv-tel").value, details: $("#nv-details").value, source: src[0], connu: src[1], occupant: pick.occupant, delai: pick.delai, prix_ok: pick.prix, appel: true };
  }
  function majVerdict() {
    if (guide.mode !== "appel") return;
    const box = $("#nv-verdict"), suite = $("#nv-suite");
    if (!pick.presta && !guide.commune && !pick.occupant && !pick.delai && !pick.prix) {
      box.dataset.n = "";
      box.replaceChildren(el("p", { class: "ad-verdict-txt" }, el("b", { text: "Pose les questions dans l'ordre." }), el("small", { text: "Le verdict (visite ou pas) s'affiche ici dès la première réponse." })));
      suite.classList.add("vide"); suite.textContent = "Le verdict te dira quoi lui proposer.";
      return;
    }
    const n = noteProspect(reponsesAppel());
    const reste = [[pick.presta && guide.commune, "le besoin"], [pick.occupant, "le logement"], [pick.delai, "le délai"], [pick.prix, "le prix"]].filter(x => !x[0]).map(x => x[1]);
    box.dataset.n = n.note;
    box.replaceChildren(
      el("span", { class: "ad-note ad-note--xl", "data-n": n.note, "aria-label": "Prospect " + n.note, text: n.note }),
      el("p", { class: "ad-verdict-txt" },
        el("b", { text: VERDICT[n.note] }),
        n.raisons.length ? el("small", { text: n.raisons.join(", ") }) : null,
        // Un C est définitif (un seul signal suffit). Un A ou un B peut encore changer tant qu'il reste des questions.
        reste.length && n.note !== "C" ? el("small", { class: "ad-verdict-reste", text: "Verdict provisoire, il reste : " + reste.join(", ") + "." }) : null));
    suite.classList.remove("vide"); suite.textContent = SUITE[n.note];
  }
  // Phrase du prix : fourchette lue dans le catalogue du site (clim murale une pièce, et bi-split). Sans catalogue : pas de chiffres.
  function majDirePrix() {
    const p = $("#nv-dire-prix"), aide = $("#nv-prix-aide");
    guide.fourchette = ""; // notée avec l'appel seulement quand des chiffres sont affichés
    if (["Entretien", "Dépannage", "Mise en service", "Autre"].includes(pick.presta)) {
      p.textContent = "« Je vous donne mon tarif pour vous situer. Ça correspond à ce que vous aviez prévu ? »";
      aide.textContent = "Ce n'est pas une pose : donne ton tarif habituel, puis note sa réaction."; aide.hidden = false;
      return;
    }
    const prix = (u, mural) => (CAT || []).filter(c => Number(c.u) === u && (!mural || c.t === "mural") && Number(c.p) > 0).map(c => Number(c.p));
    const mono = prix(1, true), bi = prix(2, false);
    const rond = n => (Math.round(n / 10) * 10).toLocaleString("fr-FR");
    if (mono.length && bi.length) {
      p.textContent = "« Pour vous situer : une pièce posée, c'est de " + rond(Math.min(...mono)) + " à " + rond(Math.max(...mono)) + " € chez moi, deux pièces à partir de " + rond(Math.min(...bi)) + " €. Ça correspond à ce que vous aviez prévu ? »";
      guide.fourchette = "une pièce : " + rond(Math.min(...mono)) + " à " + rond(Math.max(...mono)) + " € ; deux pièces : dès " + rond(Math.min(...bi)) + " €";
      aide.hidden = true;
    } else {
      p.textContent = "« Pour vous situer, je vous donne une fourchette de prix. Ça correspond à ce que vous aviez prévu ? »";
      aide.textContent = "Les prix du site n'ont pas pu être chargés : donne ta fourchette de tête."; aide.hidden = false;
    }
  }
  // Bascule entre le guide d'appel et le formulaire simple (les mêmes champs servent aux deux).
  function modeDemande(m) {
    guide.mode = m;
    const f = $("#f-new");
    $$("#nv-mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    $$("[data-appel]", f).forEach(n => { n.hidden = m !== "appel"; });
    $$("[data-simple]", f).forEach(n => { n.hidden = m === "appel"; });
    f.classList.toggle("ad-appel", m === "appel");
    // Guide d'appel : le besoin avant la commune (l'ordre de la phrase). Formulaire simple : l'ordre d'avant.
    const c = $("#nv-commune-l"), p = $("#nv-presta-b");
    if (m === "appel") c.before(p); else p.before(c);
    $("#nv-presta").classList.toggle("ad-chips--gros", m === "appel");
    // Pendant un appel, l'origine est « Appel direct » tant qu'Andy n'en choisit pas une autre.
    if (m === "appel" && !pick.source) { pick.source = "Appel direct"; chipsPick($("#nv-source"), Object.keys(SOURCES), "source", majVerdict); }
    majVerdict();
  }
  $$("#nv-mode button").forEach(b => b.addEventListener("click", () => { modeDemande(b.dataset.mode); if (b.dataset.mode === "simple") $("#nv-nom").focus(); }));
  $("#nv-communes").replaceChildren(...NP_ZONES.flatMap(z => z.communes).map(c => el("option", { value: c })));
  // Commune : le verdict attend un nom reconnu (ou la sortie du champ) pour ne pas afficher « hors zone » au milieu de la frappe.
  $("#nv-commune").addEventListener("input", e => { const v = e.target.value.trim(); if (!v || npZone(v) !== "hors") { guide.commune = v; majVerdict(); } });
  $("#nv-commune").addEventListener("change", e => { guide.commune = e.target.value.trim(); majVerdict(); });
  $("#nv-details").addEventListener("input", majVerdict);

  function nouvelleDemande() {
    $("#f-new").reset(); pick.presta = pick.source = pick.occupant = pick.delai = pick.prix = pick.decision = ""; guide.commune = ""; msg("m-new", "");
    guide.debut = Date.now(); // pour la durée de l'appel : de l'ouverture du guide à l'enregistrement
    chipsPick($("#nv-presta"), PRESTA, "presta", () => { majDirePrix(); majVerdict(); }); chipsPick($("#nv-source"), Object.keys(SOURCES), "source", majVerdict);
    chipsPick($("#nv-occupant"), OCCUPANTS, "occupant", majVerdict); chipsPick($("#nv-delai"), DELAIS, "delai", majVerdict); chipsPick($("#nv-prix"), PRIX_OK, "prix", majVerdict);
    chipsPick($("#nv-decision"), Object.keys(DECISIONS), "decision");
    modeDemande("appel"); // le guide d'appel est proposé en premier
    majDirePrix(); chargerCatalogue().then(majDirePrix);
    $("#nouveau").showModal(); $("#nouveau").scrollTop = 0;
  }
  $("#b-new").addEventListener("click", () => choisir("Ajouter", "", [
    { t: "Devis sur place", s: "Chez le client : tu fais le devis et il signe sur ton téléphone", fn: () => ouvrirDevis(null, true) },
    { t: "Nouvelle demande", s: "Un appel en cours (avec le guide) ou un contact reçu en direct", fn: nouvelleDemande }
  ]));
  $("#f-new").addEventListener("submit", e => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const src = SOURCES[pick.source] || ["", ""];
      const fields = { nom: $("#nv-nom").value.trim(), tel: $("#nv-tel").value.trim(), commune: $("#nv-commune").value.trim(), prestation: pick.presta, details: $("#nv-details").value.trim(), source: src[0], connu: src[1] };
      // Guide d'appel : les réponses partent avec la demande. Le serveur les écrit dans les détails et calcule la note.
      // Il note aussi l'appel dans l'onglet « Appels » : fourchette annoncée, décision d'Andy, remarque, durée.
      if (guide.mode === "appel") Object.assign(fields, {
        occupant: pick.occupant, delai: pick.delai, prix_ok: pick.prix, appel: true,
        fourchette: pick.prix ? guide.fourchette : "", decision: DECISIONS[pick.decision] || "", remarque: $("#nv-remarque").value.trim(),
        duree: guide.debut ? Math.round((Date.now() - guide.debut) / 1000) : ""
      });
      const res = await api("add", { fields });
      if (!res.ok) return msg("m-new", err(res));
      tracer("Client ajouté", $("#nv-nom").value.trim() + ($("#nv-commune").value.trim() ? " (" + $("#nv-commune").value.trim() + ")" : ""), res.row);
      $("#nouveau").close(); toast("Demande créée dans le CRM" + (noteDe(res) ? " · prospect " + noteDe(res).note : ""));
      await refresh(true);
      const n = state.data.find(x => x.row === res.row); if (n) openFiche(n);
    });
  });

  /* ----- Clients ----- */
  function clients() {
    const map = new Map();
    for (const r of state.data || []) {
      const k = r.tel.replace(/\D/g, "").slice(-9) || norm(r.email) || norm(r.nom);
      if (!k) continue;
      const c = map.get(k) || { nom: r.nom, commune: r.commune, tel: r.tel, rows: [] };
      c.rows.push(r); if (r.commune) c.commune = r.commune;
      map.set(k, c);
    }
    return [...map.values()].map(c => ({ ...c, gagne: c.rows.filter(r => GAGNES.includes(r.statut)).reduce((t, r) => t + r.montantNum, 0) }));
  }
  // Paiements : un chantier signé, avec acompte ou posé attend son paiement ; « Soldé » = encaissé.
  const A_ENCAISSER = ["Signé", "Acompte reçu", "Posé"];
  const enAttentePaiement = () => (state.data || []).filter(r => A_ENCAISSER.includes(r.statut));
  const payes = () => (state.data || []).filter(r => r.statut === "Soldé");
  // Les acomptes sont notés dans les notes du CRM : « Acompte reçu : 1 200 € ».
  const lireMontant = s => Number(String(s).replace(/[^\d,.]/g, "").replace(",", ".")) || 0;
  function acomptes(r) { let t = 0; for (const m of String(r.notes || "").matchAll(/Acompte reçu : ([\d\s.,]+?) ?€/g)) t += lireMontant(m[1]); return t; }
  const reste = r => Math.max(0, r.montantNum - acomptes(r));
  const encaisse = r => r.statut === "Soldé" ? Math.max(r.montantNum, acomptes(r)) : acomptes(r);
  const saisirMontant = (titre, sous, def) => demander({ titre, sous, champ: "Montant reçu (€)", defaut: def || "", oui: "Valider" });
  async function validerAcompte(r) {
    if (!state.statuts.includes("Acompte reçu")) return toast("L'étape « Acompte reçu » manque dans le CRM.");
    const m = await saisirMontant("Acompte reçu", (r.nom || "Ce client") + (r.montantNum ? " · devis de " + euro(r.montantNum) : ""), r.montantNum ? Math.round(r.montantNum * 0.4) : "");
    if (m === null) return;
    const f = { noteAjout: "Acompte reçu : " + euro(m) + " (avant : " + r.statut + ")" };
    if (r.statut === "Signé") f.statut = "Acompte reçu";
    tracer("Acompte reçu", (r.nom || "?") + " · " + euro(m), r.row);
    busy(null, () => majFiche(r, f, "Acompte de " + euro(m) + " noté"));
  }
  async function validerPaiement(r) {
    if (!state.statuts.includes("Soldé")) return toast("L'étape « Soldé » manque dans le CRM.");
    const m = await saisirMontant("Paiement reçu", (r.nom || "Ce client") + (acomptes(r) ? " · acompte déjà reçu " + euro(acomptes(r)) : ""), reste(r) || r.montantNum);
    if (m === null) return;
    const f = { statut: "Soldé", noteAjout: "Paiement validé : " + euro(m) + " encaissés (avant : " + r.statut + ")" };
    if (!r.montantNum) f.montant = String(m);
    tracer("Paiement reçu", (r.nom || "?") + " · " + euro(m), r.row);
    busy(null, async () => {
      await majFiche(r, f, euro(m) + " encaissés");
      const maj = (state.data || []).find(x => x.row === r.row) || r;
      if (maj.statut === "Soldé") facturer(maj);
    });
  }
  async function annulerPaiement(r) {
    const m = String(r.notes || "").match(/\(avant : ([^)]+)\)(?![\s\S]*\(avant : )/);
    const avant = m && A_ENCAISSER.includes(m[1]) ? m[1] : "Signé";
    if (!await demander({ titre: "Annuler ce paiement ?", sous: (r.nom || "Ce client") + " repasse en attente de paiement (« " + avant + " »).", oui: "Remettre en attente", danger: true })) return;
    busy(null, async () => {
      tracer("Paiement annulé", (r.nom || "?") + " · remis en " + avant, r.row);
      const res = await api("update", { row: r.row, nom: r.nom, fields: { statut: avant, noteAjout: "Paiement annulé, remis en « " + avant + " »" } });
      if (!res.ok) return toast(err(res));
      toast("Remis en attente de paiement");
      await refresh(true);
    });
  }
  function cartePaiement(r, paye) {
    const c = carte(r, false), a = acomptes(r), acts = c.querySelector(".ad-item-acts");
    if (paye) {
      c.classList.add("fait");
      acts.prepend(el("button", { type: "button", class: "ad-fait", "aria-pressed": "true", onclick: () => annulerPaiement(r) }, icon("refresh", 16), "Annuler"));
      return c;
    }
    if (a) c.querySelector(".ad-item-main").append(el("span", { class: "ad-reste", text: "Acompte reçu " + euro(a) + " · reste " + euro(reste(r)) }));
    acts.replaceChildren(
      el("button", { type: "button", onclick: () => validerAcompte(r) }, icon("euro", 16), "Acompte"),
      el("button", { type: "button", class: "ad-fait", onclick: () => validerPaiement(r) }, icon("check", 16), a ? "Solde reçu" : "Paiement reçu"),
      el("button", { type: "button", onclick: () => openFiche(r) }, "Ouvrir"));
    return c;
  }
  function renderPaiements() {
    const att = enAttentePaiement(), ok = payes();
    const total = l => l.reduce((t, r) => t + r.montantNum, 0);
    const resteTotal = att.reduce((t, r) => t + reste(r), 0), acTotal = att.reduce((t, r) => t + acomptes(r), 0);
    $("#c-paiements").replaceChildren(...[
      el("h2", { class: "ad-h2" }, "En attente de paiement", att.length ? el("b", { text: att.length }) : null),
      att.length ? el("p", { class: "ad-muted", text: euro(resteTotal) + " à encaisser" + (acTotal ? " (acomptes déjà reçus : " + euro(acTotal) + ")" : "") }) : null,
      att.length ? el("div", { class: "ad-list" }, att.map(r => cartePaiement(r, false))) : el("p", { class: "ad-empty", text: "Aucun paiement en attente." }),
      ok.length ? el("details", { class: "ad-group" },
        el("summary", {}, el("span", { class: "ad-h2 ad-h2--fait" }, "Payés", el("b", { text: ok.length }), el("span", { class: "ad-muted", text: euro(total(ok)) + " encaissés" }))),
        el("div", { class: "ad-list" }, ok.map(r => cartePaiement(r, true)))) : null].filter(Boolean));
  }
  function renderClients() {
    renderPaiements();
    const q = norm(state.cq);
    const list = clients().filter(c => !q || norm(c.nom + " " + c.commune).includes(q)).sort((a, b) => b.gagne - a.gagne || a.nom.localeCompare(b.nom));
    $("#c-liste").replaceChildren(...(list.length ? list.map(c => {
      const t = tel(c.tel);
      return el("article", { class: "ad-item" },
        el("button", { class: "ad-item-main", type: "button", onclick: () => { state.q = c.nom; $("#d-q").value = c.nom; go("demandes"); } },
          el("span", { class: "ad-item-top" }, el("b", { text: c.nom || "(sans nom)" }), c.gagne ? el("span", { class: "ad-badge", "data-s": "Signé", text: euro(c.gagne) }) : null),
          el("small", { text: [c.commune, c.rows.length + (c.rows.length > 1 ? " demandes" : " demande"), [...new Set(c.rows.map(r => r.prestation).filter(Boolean))].join(", ")].filter(Boolean).join(" · ") })),
        t ? el("div", { class: "ad-item-acts" }, el("a", { href: "tel:" + t }, icon("phone", 16), "Appeler"), el("a", { href: "https://wa.me/" + t.replace("+", ""), target: "_blank", rel: "noopener noreferrer" }, icon("chat", 16), "WhatsApp")) : null);
    }) : [el("p", { class: "ad-empty", text: "Aucun client." })]));
  }
  $("#c-q").addEventListener("input", e => { state.cq = e.target.value; renderClients(); });

  /* ----- Devis après la visite : prix de la grille du site + questions de la visite ----- */
  let CAT = null;
  async function chargerCatalogue() {
    if (CAT && CAT.length) return CAT;
    try { CAT = await (await fetch("/data/catalogue.json", { cache: "no-store" })).json(); } catch (e) { CAT = []; }
    return CAT;
  }
  const TYPES = [[1, "Mono-split"], [2, "Bi-split"], [3, "Tri-split"], [4, "Quadri-split"]];
  const SUP_UNITE = 200; // liaisons de 5 à 10 m, pompe de relevage : par unité
  const dv = {};
  const sommeKw = s => (String(s).match(/\d+(,\d+)?/g) || []).reduce((t, x) => t + Number(x.replace(",", ".")), 0);
  const kwPossibles = (marque, u) => [...new Set(CAT.filter(c => c.b === marque && Number(c.u) === u).map(c => String(c.kw)))].sort((a, b) => sommeKw(a) - sommeKw(b));
  const prixSys = (marque, gamme, s) => { const c = CAT.find(c => c.b === marque && c.g === gamme && Number(c.u) === s.u && String(c.kw) === s.kw); return c ? Number(c.p) : null; };
  function gammesPossibles(marque) {
    const g = [...new Set(CAT.filter(c => c.b === marque).map(c => c.g))];
    const ok = g.filter(x => dv.systemes.every(s => s.kw && prixSys(marque, x, s) !== null));
    const tot = x => dv.systemes.reduce((t, s) => t + (prixSys(marque, x, s) || 0), 0);
    return ok.sort((a, b) => tot(a) - tot(b));
  }
  function supplementsDevis() {
    const l = [];
    if (dv.liaisons > 0) l.push({ libelle: "Liaisons de 5 à 10 m (" + dv.liaisons + (dv.liaisons > 1 ? " unités)" : " unité)"), montant: dv.liaisons * SUP_UNITE });
    if (dv.pompe > 0) l.push({ libelle: "Pompe de relevage des condensats" + (dv.pompe > 1 ? " (× " + dv.pompe + ")" : ""), montant: dv.pompe * SUP_UNITE });
    if (dv.depose > 0) l.push({ libelle: "Dépose de l'ancienne climatisation", detail: "Récupération du fluide frigorigène, démontage de l'unité intérieure et du groupe extérieur, évacuation de l'ancien matériel en filière de recyclage", montant: dv.depose });
    if (dv.hauteur > 0) l.push({ libelle: "Travail en hauteur / nacelle", montant: dv.hauteur });
    if (dv.autreL.trim() && dv.autreM > 0) l.push({ libelle: dv.autreL.trim(), montant: dv.autreM });
    return l;
  }
  const totalSup = () => supplementsDevis().reduce((x, y) => x + y.montant, 0);
  // « Mon prix » : le total tout compris tapé par Andy. Les suppléments en sont déduits et le reste est
  // réparti sur les systèmes (au prorata des prix du site), pour que le total du devis tombe juste.
  function systemesAuPrix() {
    const reste = dv.monPrix - totalSup(), n = dv.systemes.length;
    const cat = dv.systemes.map(s => prixSys(dv.marque, dv.gamme, s) || 0), tot = cat.reduce((a, b) => a + b, 0);
    let pris = 0;
    return dv.systemes.map((s, i) => {
      const p = i === n - 1 ? reste - pris : Math.round(reste * (tot ? cat[i] / tot : 1 / n));
      pris += p;
      return { u: s.u, kw: s.kw, prix: p };
    });
  }
  function totalOption(gamme) {
    if (!gamme) return null;
    if (dv.monPrix > 0 && gamme === dv.gamme) {
      return systemesAuPrix().some(s => !(s.prix > 0)) ? { err: "Ton prix doit dépasser les suppléments (" + euro(totalSup()) + ")." } : { t: dv.monPrix, perso: true };
    }
    let t = 0;
    for (const s of dv.systemes) { const p = prixSys(dv.marque, gamme, s); if (p === null) return { err: "Pas de prix sur le site pour " + dv.marque + " " + gamme + " " + s.kw }; t += p; }
    return { t: t + totalSup() };
  }
  function kwDefaut(u) { const l = kwPossibles(dv.marque, u); return l.find(k => (u === 1 ? k === "3,5" : u === 2 ? k === "2 kW + 2 kW" : false)) || l[0] || ""; }
  function majGammes() {
    const g = gammesPossibles(dv.marque);
    if (!g.includes(dv.gamme)) dv.gamme = g[0] || "";
    if (dv.gamme2 !== "aucune" && (!g.includes(dv.gamme2) || dv.gamme2 === dv.gamme)) dv.gamme2 = g.find(x => x !== dv.gamme) || "aucune";
    return g;
  }
  function clientDevis() { return (state.data || []).find(r => r.row === dv.row); }
  // Retrouve la fiche du client d'après le titre du rendez-vous (« Visite clim – Bérard (Salon) »).
  function ficheDuRdv(ev) {
    const t = norm(ev.titre);
    const l = (state.data || []).filter(r => !SIDE.includes(r.statut) && r.statut !== "Soldé" && r.nom && norm(r.nom).split(/\s+/).some(m => m.length > 2 && t.includes(m)));
    return l.length ? l[l.length - 1] : null;
  }
  // Demande notée « Remplacement » dans le CRM : la case est cochée d'office, Andy peut la décocher.
  const estRemplacement = r => !!r && /remplacement/i.test(r.prestation || "");
  async function ouvrirDevis(r, surPlace) {
    await chargerCatalogue();
    if (!CAT.length) return toast("Catalogue du site introuvable.");
    Object.assign(dv, { surPlace: !!surPlace, neuf: !r && !!surPlace, nNom: "", nTel: "", nCommune: "", row: r ? r.row : null, civilite: "", marque: "Daikin", gamme: "", gamme2: "aucune", systemes: [], liaisons: 0, pompe: 0, depose: 0, hauteur: 0, autreL: "", autreM: 0, copro: false, monPrix: 0, acompte: true, deuxFois: false, remplacement: estRemplacement(r), remarques: "", email: "", fait: null });
    dv.systemes = [{ u: 1, kw: kwDefaut(1) }];
    $("#dv-titre").textContent = dv.surPlace ? "Devis sur place" : "Préparer le devis";
    rendreDevis();
    $("#devis").showModal();
  }
  const nombre = v => Math.max(0, Number(String(v).replace(",", ".")) || 0);
  function rendreDevis() {
    const box = $("#dv-body");
    if (dv.fait) return rendreDevisFait(box);
    const gammes = majGammes();
    const sel = (vals, cur, onch, aria) => { const s = el("select", { "aria-label": aria, onchange: e => onch(e.target.value) }); for (const [v, t] of vals) { const o = el("option", { value: v, text: t }); if (String(v) === String(cur)) o.selected = true; s.append(o); } return s; };
    const champ = (lab, val, onin, attrs) => el("label", {}, lab, el("input", { value: val || "", inputmode: "decimal", ...(attrs || {}), oninput: e => { onin(e.target.value); majTotaux(); } }));
    const clients = (state.data || []).filter(r => !SIDE.includes(r.statut) && r.statut !== "Soldé").slice().reverse();
    const texte = (lab, cle, attrs) => el("label", {}, lab, el("input", { value: dv[cle] || "", autocomplete: "off", ...(attrs || {}), oninput: e => { dv[cle] = e.target.value; } }));
    box.replaceChildren(...[
      el("div", { class: "ad-chips ad-chips--pick", role: "group", "aria-label": "Client" },
        el("button", { type: "button", "aria-pressed": String(!dv.neuf), text: "Client déjà dans la liste", onclick: () => { dv.neuf = false; rendreDevis(); } }),
        el("button", { type: "button", "aria-pressed": String(dv.neuf), text: "Nouveau client", onclick: () => { dv.neuf = true; dv.row = null; rendreDevis(); } })),
      dv.neuf ? el("div", { class: "ad-neuf" },
        texte("Nom", "nNom", { maxlength: "80" }),
        el("div", { class: "ad-ligne2" }, texte("Téléphone", "nTel", { inputmode: "tel", maxlength: "30" }), texte("Commune", "nCommune", { maxlength: "60" })),
        el("label", {}, "E-mail (pour lui envoyer le devis signé)", el("input", { type: "email", inputmode: "email", autocomplete: "off", value: dv.email || "", oninput: e => { dv.email = e.target.value.trim(); } })))
        : el("label", {}, "Client", sel([["", "Choisir…"], ...clients.map(r => [r.row, r.nom.replace(/\([^)]*\)?/g, " ").replace(/\s+/g, " ").trim() + (r.commune ? " · " + r.commune : "")])], dv.row || "", v => { dv.row = Number(v) || null; dv.remplacement = estRemplacement(clientDevis()); rendreDevis(); }, "Client")),
      !dv.neuf && clientDevis() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clientDevis().email || "")
        ? el("label", {}, "E-mail du client (pas sur la fiche : pour lui envoyer le devis en 1 clic)", el("input", { type: "email", inputmode: "email", autocomplete: "off", value: dv.email || "", oninput: e => { dv.email = e.target.value.trim(); } }))
        : null,
      el("div", { class: "ad-chips" }, ...["Monsieur", "Madame"].map(c => el("button", { type: "button", "aria-pressed": String(dv.civilite === c), text: c, onclick: () => { dv.civilite = dv.civilite === c ? "" : c; rendreDevis(); } }))),
      el("label", {}, "Marque", sel([...new Set(CAT.map(c => c.b))].map(b => [b, b]), dv.marque, v => { dv.marque = v; dv.systemes = dv.systemes.map(s => ({ u: s.u, kw: kwPossibles(v, s.u).includes(s.kw) ? s.kw : kwDefaut(s.u) })); rendreDevis(); }, "Marque")),
      el("h3", { class: "ad-h2", text: "Systèmes à poser" }),
      ...dv.systemes.map((s, i) => el("div", { class: "ad-sys" },
        el("label", {}, "Type", sel(TYPES, s.u, v => { s.u = Number(v); s.kw = kwDefaut(s.u); rendreDevis(); }, "Type")),
        el("label", {}, "Puissance", sel(kwPossibles(dv.marque, s.u).map(k => [k, k.includes("kW") ? k : k + " kW"]), s.kw, v => { s.kw = v; rendreDevis(); }, "Puissance")),
        el("button", { type: "button", "aria-label": "Retirer", text: "×", onclick: () => { if (dv.systemes.length > 1) { dv.systemes.splice(i, 1); rendreDevis(); } } }))),
      el("button", { type: "button", class: "ad-btn", onclick: () => { dv.systemes.push({ u: 1, kw: kwDefaut(1) }); rendreDevis(); } }, icon("plus", 16), "Ajouter un système"),
      gammes.length ? el("div", { class: "ad-ligne2" },
        el("label", {}, "Option 1", sel(gammes.map(g => [g, g]), dv.gamme, v => { dv.gamme = v; rendreDevis(); }, "Option 1")),
        el("label", {}, "Option 2 (si trop cher)", sel([["aucune", "Aucune"], ...gammes.filter(g => g !== dv.gamme).map(g => [g, g])], dv.gamme2, v => { dv.gamme2 = v; rendreDevis(); }, "Option 2")))
        : el("p", { class: "ad-total err", text: "Aucune gamme " + dv.marque + " n'a de prix sur le site pour cette combinaison." }),
      el("h3", { class: "ad-h2", text: "Questions de la visite" }),
      el("div", { class: "ad-ligne2" },
        champ("Liaisons de 5 à 10 m : nb d'unités (+200 € chacune)", dv.liaisons || "", v => dv.liaisons = nombre(v)),
        champ("Pompes de relevage (+200 € chacune)", dv.pompe || "", v => dv.pompe = nombre(v))),
      el("div", { class: "ad-ligne2" },
        champ("Dépose ancienne clim (€)", dv.depose || "", v => dv.depose = nombre(v)),
        champ("Hauteur / nacelle (€)", dv.hauteur || "", v => dv.hauteur = nombre(v))),
      el("div", { class: "ad-ligne2" },
        champ("Autre supplément", dv.autreL, v => dv.autreL = v, { inputmode: "text" }),
        champ("Montant (€)", dv.autreM || "", v => dv.autreM = nombre(v))),
      el("label", { class: "ad-check" }, el("input", { type: "checkbox", checked: dv.copro || null, onchange: e => { dv.copro = e.target.checked; } }), "Copropriété (accord du syndic à demander)"),
      el("label", { class: "ad-check" }, el("input", { type: "checkbox", checked: dv.remplacement || null, onchange: e => { dv.remplacement = e.target.checked; } }), "Remplacement : on garde les liaisons et goulottes en place"),
      el("h3", { class: "ad-h2", text: "Prix et règlement" }),
      champ("Mon prix total TTC, tout compris (vide = prix du site)", dv.monPrix || "", v => dv.monPrix = nombre(v)),
      el("label", { class: "ad-check" }, el("input", { type: "checkbox", checked: dv.acompte || null, onchange: e => { dv.acompte = e.target.checked; } }), "Acompte de 40 % écrit sur le devis"),
      el("label", { class: "ad-check" }, el("input", { type: "checkbox", checked: dv.deuxFois || null, onchange: e => { dv.deuxFois = e.target.checked; } }), "Proposer dans le mail de régler en deux fois"),
      el("label", {}, "Remarque pour le client (facultatif)", el("textarea", { rows: "2", oninput: e => { dv.remarques = e.target.value; } }, dv.remarques)),
      el("div", { class: "ad-totaux", id: "dv-tot" }),
      el("p", { class: "ad-msg", id: "m-devis" }),
      el("button", { type: "button", class: "ad-btn ad-btn--main", id: "dv-go", onclick: e => envoyerDevis(e.currentTarget) }, "Préparer le devis")
    ].filter(Boolean));
    majTotaux();
  }
  function majTotaux() {
    const t = $("#dv-tot"); if (!t) return;
    const lignes = [];
    const perso = dv.monPrix > 0;
    for (const [i, g] of [[1, dv.gamme], [2, perso || dv.gamme2 === "aucune" ? "" : dv.gamme2]]) {
      const r = totalOption(g); if (!r) continue;
      lignes.push(r.err ? el("div", { class: "ad-total err", text: r.err }) : el("div", { class: "ad-total" }, el("span", { text: (r.perso ? "Mon prix · " : "Option " + i + " · ") + dv.marque + " " + g }), el("span", { text: euro(r.t) })));
    }
    if (perso && dv.gamme2 !== "aucune") lignes.push(el("p", { class: "ad-muted", text: "Avec ton propre prix, le devis part avec une seule option (" + dv.gamme + ")." }));
    const sup = supplementsDevis();
    if (sup.length) lignes.push(el("p", { class: "ad-muted", text: "Suppléments compris : " + sup.map(s => s.libelle + " " + euro(s.montant)).join(" · ") }));
    t.replaceChildren(...lignes);
  }
  async function envoyerDevis(btn) {
    let r = dv.neuf ? null : clientDevis();
    if (dv.neuf && !dv.nNom.trim()) return msg("m-devis", "Indique le nom du client.");
    if (!dv.neuf && !r) return msg("m-devis", "Choisis le client.");
    if (!dv.gamme) return msg("m-devis", "Il manque une gamme avec un prix sur le site.");
    if (dv.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dv.email)) return msg("m-devis", "L'adresse e-mail n'est pas valide.");
    const perso = dv.monPrix > 0, t1 = totalOption(dv.gamme);
    if (t1 && t1.err) return msg("m-devis", t1.err);
    busy(btn, async () => {
      // Nouveau client rencontré sur place : sa fiche est créée dans le CRM avant le devis.
      if (dv.neuf) {
        msg("m-devis", "Création de la fiche du client…", true);
        const add = await api("add", { fields: { nom: dv.nNom.trim(), tel: dv.nTel.trim(), commune: dv.nCommune.trim(), prestation: dv.remplacement ? "Remplacement" : "Installation", details: "Devis fait sur place", source: "Autre", connu: "Visite sur place" } });
        if (!add.ok) return msg("m-devis", err(add));
        tracer("Client ajouté", dv.nNom.trim() + (dv.nCommune.trim() ? " (" + dv.nCommune.trim() + ")" : ""), add.row);
        r = { row: add.row, nom: dv.nNom.trim() }; dv.row = add.row; dv.neuf = false;
      }
      msg("m-devis", "Préparation du devis…", true);
      const res = await api("devis", {
        row: r.row, nom: r.nom, civilite: dv.civilite, marque: dv.marque, gamme: dv.gamme, gamme2: perso || dv.gamme2 === "aucune" ? "" : dv.gamme2,
        systemes: perso ? systemesAuPrix() : dv.systemes.map(s => ({ u: s.u, kw: s.kw })), supplements: supplementsDevis(), remarques: dv.remarques.trim(), copro: dv.copro, email: dv.email || "",
        sansAcompte: !dv.acompte, deuxFois: dv.deuxFois, remplacement: dv.remplacement
      });
      if (!res.ok) return msg("m-devis", err(res));
      dv.fait = { ...res, nom: r.nom, row: r.row };
      rendreDevis();
      refresh(true);
    });
  }
  function rendreDevisFait(box) {
    const f = dv.fait, t = tel(f.tel);
    box.replaceChildren(...[
      el("div", { class: "ad-done" },
        el("b", { text: "Devis " + f.numero + " prêt" }),
        el("p", { text: f.options.map(o => o.marque + " " + o.gamme + " : " + euro(o.total)).join(" · ") }),
        el("p", { class: "ad-muted", text: f.envoye ? "Envoyé à " + f.envoye + " : message, PDF et lien de signature. La fiche est passée en « Devis envoyé »."
          : f.brouillon ? "Mail prêt pour " + (f.mail || "le client") + " : message, PDF joint et lien de signature. Vérifie le PDF puis envoie en 1 clic."
          : "Pas d'e-mail sur la fiche : le PDF est dans Drive, envoie le lien de signature par SMS." })),
      // Sur place : le client lit le devis et signe sur le téléphone d'Andy, sans attendre le mail.
      f.lien && /^https:\/\//.test(f.lien) ? el("a", { class: "ad-btn" + (dv.surPlace ? " ad-btn--main" : ""), href: f.lien, target: "_blank", rel: "noopener noreferrer", onclick: () => tracer("Signature sur place", (f.nom || "?") + " · devis " + f.numero, f.row) }, icon("pen", 16), "Faire signer maintenant, sur cet appareil") : null,
      f.brouillon && !f.envoye ? el("button", { type: "button", class: "ad-btn" + (dv.surPlace ? "" : " ad-btn--main"), onclick: e => envoyerDevisMail(e.currentTarget) }, icon("mail", 16), "Envoyer le devis par mail") : null,
      el("p", { class: "ad-msg", id: "m-envoi" }),
      f.pdf && /^https:\/\/(drive|docs)\.google\.com\//.test(f.pdf) ? el("a", { class: "ad-btn", href: f.pdf, target: "_blank", rel: "noopener noreferrer" }, "Voir le PDF") : null,
      f.brouillon && !f.envoye ? el("a", { class: "ad-btn", href: "https://mail.google.com/mail/?authuser=thermaz.fr@gmail.com#drafts", target: "_blank", rel: "noopener noreferrer" }, icon("mail", 16), "Modifier le mail dans Gmail") : null,
      t ? el("a", { class: "ad-btn" + (f.brouillon ? "" : " ad-btn--main"), href: "sms:" + t + "?&body=" + encodeURIComponent(f.sms) }, icon("chat", 16), "Envoyer le SMS au client") : null,
      f.lien ? el("p", { class: "ad-muted", text: "Le mail et le SMS contiennent le lien pour signer en ligne. Quand il signe : fiche en « Signé », alerte Telegram, mail " + (dv.acompte ? "d'acompte " : "") + "avec 3 dates de pose prêt en brouillon." }) : null,
      f.lien ? el("button", { type: "button", class: "ad-btn", text: "Copier le lien de signature", onclick: () => navigator.clipboard.writeText(f.lien).then(() => toast("Lien copié"), () => toast(f.lien)) }) : null,
      el("button", { type: "button", class: "ad-btn", text: "Fermer", onclick: () => $("#devis").close() })
    ].filter(Boolean));
  }

  async function envoyerDevisMail(btn) {
    const f = dv.fait;
    if (!await demander({ titre: "Envoyer le devis ?", sous: "Devis n° " + f.numero + " pour " + (f.mail || "ce client") + ". Le mail part tout de suite.", oui: "Envoyer" })) return;
    busy(btn, async () => {
      msg("m-envoi", "Envoi…", true);
      const res = await api("envoyerDevis", { numero: f.numero, row: f.row, nom: f.nom });
      if (!res.ok) return msg("m-envoi", err(res));
      f.envoye = res.a || f.mail || "le client";
      rendreDevis();
      refresh(true);
      toast("Devis envoyé");
    });
  }

  /* ----- Mails du client : lire et répondre sans ouvrir Gmail ----- */
  async function ouvrirMails(r) {
    const box = $("#dv-body");
    $("#dv-titre").textContent = "Mails · " + (r.nom || "");
    box.replaceChildren(el("p", { class: "ad-muted", text: "Chargement des mails…" }));
    $("#devis").showModal();
    const res = await api("mailsClient", { row: r.row });
    if (!res.ok) return box.replaceChildren(el("p", { class: "ad-msg", text: err(res) }));
    const prenom = String(r.nom || "").split(/\s+/)[0];
    let fil = (res.fils || []).find(f => f.deClient) || null, propId = 0;
    const zone = el("textarea", { class: "ad-input", rows: "9", "aria-label": "Ta réponse" });
    zone.value = "Bonjour " + prenom + ",\n\n\n\nBien cordialement,\n\nAndy\nThermaz\n06 51 10 64 35";
    const statut = el("p", { class: "ad-msg", role: "status" });
    const cible = el("p", { class: "ad-muted" });
    const majCible = () => { cible.textContent = fil ? "Réponse dans la conversation « " + fil.objet + " »" : "Nouveau mail à " + res.email; };
    const envoyer = (vraiment, btn) => busy(btn, async () => {
      const texte = zone.value.trim();
      if (texte.length < 10) { statut.textContent = "Écris ta réponse d'abord."; return; }
      if (vraiment && !await demander({ titre: "Envoyer ce mail ?", sous: "Il part tout de suite à " + res.email + ".", oui: "Envoyer" })) return;
      statut.textContent = vraiment ? "Envoi…" : "Création du brouillon…";
      const out = await api("repondreClient", { row: r.row, nom: r.nom, texte, thread: fil ? fil.id : "", envoyer: vraiment });
      if (!out.ok) { statut.textContent = err(out); return; }
      tracer(vraiment ? "Mail envoyé" : "Brouillon mail", r.nom || "?", r.row);
      if (propId) { api("commercialEnvoye", { id: propId, row: r.row, texte, canal: vraiment ? "e-mail" : "brouillon" }); propId = 0; }
      statut.textContent = vraiment ? "Mail envoyé." : "Brouillon prêt dans Gmail.";
      if (vraiment) zone.value = "";
    });
    const liste = (res.fils || []).map(f => {
      const item = el("button", { type: "button", class: "ad-mail" + (f === fil ? " on" : ""), onclick: () => { fil = f; $$(".ad-mail", box).forEach(b => b.classList.remove("on")); item.classList.add("on"); majCible(); } },
        el("span", { class: "ad-mail-h" }, el("b", { text: f.objet || "(sans objet)" }), el("small", { text: f.date + (f.deClient ? " · du client" : " · de toi") + (f.nb > 1 ? " · " + f.nb + " messages" : "") })),
        el("span", { class: "ad-mail-x", text: f.extrait }));
      return item;
    });
    majCible();
    box.replaceChildren(...[
      res.email ? null : el("p", { class: "ad-msg", text: "Pas d'e-mail sur cette fiche." }),
      liste.length ? el("p", { class: "ad-muted", text: "Touche un mail pour y répondre. Sinon, un nouveau mail part à " + res.email + "." }) : el("p", { class: "ad-muted", text: "Aucun échange trouvé avec " + res.email + "." }),
      ...liste,
      cible,
      el("button", { type: "button", class: "ad-btn", onclick: e => busy(e.currentTarget, async () => {
        statut.textContent = "L'agent commercial lit l'échange…";
        const p = await api("commercial", { row: r.row, nom: r.nom, type: "reponse", thread: fil ? fil.id : "" });
        if (!p.ok) { statut.textContent = err(p); return; }
        zone.value = p.mail || p.court || zone.value; propId = p.id || 0;
        statut.textContent = p.conseil ? "Conseil de l'agent : " + p.conseil : "Réponse proposée : relis-la avant d'envoyer.";
      }) }, icon("pen", 16), "Proposer une réponse (agent commercial)"),
      zone,
      el("div", { class: "ad-row2" },
        el("button", { type: "button", class: "ad-btn", text: "Brouillon", onclick: e => envoyer(false, e.currentTarget) }),
        el("button", { type: "button", class: "ad-btn ad-btn--main", text: "Envoyer", onclick: e => envoyer(true, e.currentTarget) })),
      statut,
      el("button", { type: "button", class: "ad-btn", text: "Fermer", onclick: () => $("#devis").close() })
    ].filter(Boolean));
  }

  /* ----- Facture (fin de chantier) ----- */
  function facturer(r) {
    if (!r) return;
    const civ = dv.row === r.row ? dv.civilite : "";
    choisir("Faire la facture de " + (r.nom || "ce client") + " ?", "D'après le dernier devis, acomptes déduits. Le mail part en brouillon.", [
      { t: "Préparer la facture", s: "PDF + brouillon Gmail + livre des recettes", fn: () => busy(null, async () => {
        toast("Préparation de la facture…");
        const res = await api("facture", { row: r.row, nom: r.nom, civilite: civ });
        if (!res.ok) return toast(err(res));
        const box = $("#dv-body");
        $("#dv-titre").textContent = "Facture";
        box.replaceChildren(...[
          el("div", { class: "ad-done" },
            el("b", { text: "Facture " + res.numero + " prête" }),
            el("p", { text: "Total " + euro(res.total) + (res.reste > 0 ? " · reste à payer " + euro(res.reste) : " · acquittée") }),
            el("p", { class: "ad-muted", text: res.brouillon ? "Le mail est en brouillon dans Gmail, facture jointe. Relis-le et envoie-le." : "Pas d'e-mail sur la fiche : la facture est dans Drive." })),
          res.pdf && /^https:\/\/(drive|docs)\.google\.com\//.test(res.pdf) ? el("a", { class: "ad-btn", href: res.pdf, target: "_blank", rel: "noopener noreferrer" }, "Voir la facture") : null,
          res.brouillon ? el("a", { class: "ad-btn ad-btn--main", href: "https://mail.google.com/mail/?authuser=thermaz.fr@gmail.com#drafts", target: "_blank", rel: "noopener noreferrer" }, icon("mail", 16), "Ouvrir les brouillons Gmail") : null,
          el("button", { type: "button", class: "ad-btn", text: "Fermer", onclick: () => { $("#devis").close(); $("#dv-titre").textContent = "Préparer le devis"; } })
        ].filter(Boolean));
        $("#devis").showModal();
        refresh(true);
      }) },
      { t: "Plus tard", s: "Bouton « Facture » dans la fiche du client", fn: () => {} }
    ]);
  }

  /* ----- Dépenses (envoyées en photo au bot Telegram) ----- */
  function depensesPanel() {
    const p = el("div", { class: "ad-panel" }, el("h3", { text: "Dépenses" }));
    const d = state.depenses;
    if (!d) { p.append(el("p", { class: "ad-muted", text: "Envoie la photo d'un ticket au bot Telegram avec le nom du chantier : la dépense s'affichera ici." })); return p; }
    const now = new Date(), mois = pad(now.getMonth() + 1) + "/" + now.getFullYear();
    const duMois = d.filter(x => String(x.date).slice(3) === mois), somme = l => l.reduce((t, x) => t + (Number(x.montant) || 0), 0);
    p.append(el("div", { class: "ad-row" }, el("span", { text: "Ce mois-ci" }), el("b", { text: euro(somme(duMois)) + " (" + duMois.length + ")" })),
      el("div", { class: "ad-row" }, el("span", { text: "Depuis le début" }), el("b", { text: euro(somme(d)) + " (" + d.length + ")" })));
    const parLigne = new Map();
    for (const x of d) if (x.ligne) parLigne.set(Number(x.ligne), (parLigne.get(Number(x.ligne)) || 0) + (Number(x.montant) || 0));
    const chantiers = [...parLigne.entries()].map(([row, dep]) => ({ r: (state.data || []).find(y => y.row === row), dep })).filter(x => x.r && x.r.montantNum);
    if (chantiers.length) p.append(el("p", { class: "ad-muted", text: "Marge par chantier (devis moins dépenses notées)" }),
      ...chantiers.map(x => el("div", { class: "ad-row" }, el("span", { text: x.r.nom + " · " + euro(x.r.montantNum) + " − " + euro(x.dep) }), el("b", { text: euro(x.r.montantNum - x.dep) }))));
    if (d.length) p.append(el("p", { class: "ad-muted", text: "Dernières dépenses" }),
      ...d.slice(-6).reverse().map(x => el("div", { class: "ad-row" },
        el("span", {}, (x.date || "") + " · " + (x.fournisseur || x.categorie || "Dépense") + (x.chantier ? " · " + x.chantier : ""),
          /^https:\/\/(drive|docs)\.google\.com\//.test(x.lien || "") ? el("a", { href: x.lien, target: "_blank", rel: "noopener noreferrer", text: " (ticket)" }) : null),
        el("b", { text: euro(x.montant) }))));
    return p;
  }

  /* ----- Publicité Google : ce qu'elle coûte par demande et par chantier signé ----- */
  function pubPanel() {
    const p = el("div", { class: "ad-panel" }, el("h3", { text: "Publicité Google" }));
    const d = state.pub;
    if (!d) { p.append(el("p", { class: "ad-muted", text: state.pubErr || "Chargement…" })); return p; }
    const ligne = (a, b) => el("div", { class: "ad-row" }, el("span", { text: a }), el("b", { text: b }));
    p.append(
      el("div", { class: "ad-pub" },
        el("div", {}, el("b", { text: d.coutParSigne === null ? "—" : euro(d.coutParSigne) }), el("span", { text: "de pub par chantier signé" })),
        el("div", {}, el("b", { text: d.coutParDemande === null ? "—" : euro(d.coutParDemande) }), el("span", { text: "de pub par vraie demande" }))),
      ligne("Dépensé depuis le début", euro(d.depense)),
      ligne("Demandes venues de la pub", d.vraies + (d.demandes !== d.vraies ? " (+ " + (d.demandes - d.vraies) + " hors cible)" : "")),
      ligne("Chantiers signés venus de la pub", d.signes + " · " + euro(d.signesMontant)),
      d.retour !== null ? ligne("Pour 1 € de pub", String(d.retour).replace(".", ",") + " € signés") : null,
      d.attente ? ligne("Devis encore en attente", String(d.attente)) : null,
      d.sept ? ligne("7 derniers jours (relevé du " + String(d.sept.le || "").slice(0, 5) + ")", euro(d.sept.cout) + " · " + (d.sept.clics || 0) + " clics") : null,
      el("p", { class: "ad-muted", text: "La dépense vient de l'onglet « Pub ROI » du CRM" + (d.note ? " (" + d.note + ")" : "") + ". Le coût du matériel n'est pas déduit." }));
    return p;
  }

  /* ----- Argent (phase 2) ----- */
  function soon(items) { return el("ul", { class: "ad-soon" }, items.map(([b, s]) => el("li", {}, el("b", { text: b }), el("span", { text: s })))); }
  function renderArgent() {
    const c = state.today.chiffres, att = enAttentePaiement(), ok = payes();
    const total = l => l.reduce((t, r) => t + r.montantNum, 0);
    const aEnc = att.reduce((t, r) => t + reste(r), 0), enc = [...att, ...ok].reduce((t, r) => t + encaisse(r), 0);
    $("#s-argent").replaceChildren(
      el("div", { class: "ad-tiles" },
        el("button", { class: "ad-tile", type: "button", onclick: () => go("clients") }, el("b", { text: euro(aEnc) }), el("span", { text: "à encaisser (" + att.length + ")" })),
        el("button", { class: "ad-tile ad-tile--ok", type: "button", onclick: () => go("clients") }, el("b", { text: euro(enc) }), el("span", { text: "encaissé, acomptes compris" }))),
      el("div", { class: "ad-panel" }, el("h3", { text: "Ce qui est déjà suivi" }),
        el("div", { class: "ad-row" }, el("span", { text: "Devis en attente" }), el("b", { text: euro(c.attenteMontant) + " (" + c.attenteNb + ")" })),
        el("div", { class: "ad-row" }, el("span", { text: "Devis signés, total" }), el("b", { text: euro(c.signesMontant) + " (" + c.signesNb + ")" })),
        el("div", { class: "ad-row" }, el("span", { text: "Chantiers à encaisser" }), el("b", { text: euro(aEnc) + " (" + att.length + ")" })),
        el("div", { class: "ad-row" }, el("span", { text: "Chantiers soldés" }), el("b", { text: euro(total(ok)) + " (" + ok.length + ")" }))),
      pubPanel(),
      depensesPanel(),
      el("h2", { class: "ad-h2", text: "Arrive à la prochaine étape" }),
      soon([["Livre des recettes", "Tenu automatiquement, obligatoire en micro-entreprise"], ["Factures et avoirs", "Numérotation continue, HT, TVA, TTC, payée ou en retard"], ["Encaissements", "Acomptes et soldes, par virement, chèque, espèces ou carte"], ["Dépenses et justificatifs", "Matériel par chantier, carburant, Google Ads, assurances, photo du ticket"], ["Marge par chantier", "Devis moins matériel et déplacement"], ["Compteurs", "Seuil de TVA, plafond micro, argent à mettre de côté pour l'URSSAF"], ["Export comptable", "Un tableur par mois pour le comptable"]]));
  }

  /* ----- Visiteurs du site : combien viennent, par où ils passent, où ils s'arrêtent ----- */
  const pct = (n, t) => t > 0 ? Math.round(100 * n / t) : 0;
  const nbFr = n => (Number(n) || 0).toLocaleString("fr-FR");
  // Barres horizontales d'une seule couleur : le libellé et le chiffre sont toujours écrits, la barre ne fait qu'aider l'œil.
  function barres(lignes, total, unite) {
    const max = Math.max(1, ...lignes.map(l => l.n));
    return el("div", { class: "ad-bars" }, lignes.map(l => el("div", { class: "ad-bar", title: l.nom + " : " + nbFr(l.n) + " " + unite },
      el("span", { class: "ad-bar-nom", text: l.nom }),
      el("span", { class: "ad-bar-val", text: nbFr(l.n) + (total ? " (" + pct(l.n, total) + " %)" : "") }),
      el("span", { class: "ad-bar-trait", "aria-hidden": "true" }, el("i", { style: "width:" + Math.max(2, Math.round(100 * l.n / max)) + "%" })))));
  }
  function parcours(etapes) {
    const depart = etapes.length ? etapes[0].n : 0;
    let pire = -1, perte = 0;
    etapes.forEach((e, i) => { if (i && etapes[i - 1].n - e.n > perte) { perte = etapes[i - 1].n - e.n; pire = i; } });
    return el("ol", { class: "ad-funnel" }, etapes.map((e, i) => {
      const partis = i ? etapes[i - 1].n - e.n : 0;
      return el("li", { class: i === pire ? "pire" : null, title: e.nom + " : " + nbFr(e.n) + " visiteurs" },
        i ? el("p", { class: "ad-funnel-perte", text: nbFr(partis) + (partis > 1 ? " s'arrêtent ici" : " s'arrête ici") + (i === pire ? " : le plus gros arrêt" : "") }) : null,
        el("div", { class: "ad-funnel-ligne" }, el("span", { text: e.nom }), el("b", { text: nbFr(e.n) }), el("small", { text: pct(e.n, depart) + " %" })),
        el("span", { class: "ad-bar-trait", "aria-hidden": "true" }, el("i", { style: "width:" + Math.max(2, pct(e.n, depart)) + "%" })));
    }));
  }
  function joursBarres(jours) {
    const max = Math.max(1, ...jours.map(j => j.n));
    return el("div", { class: "ad-days", role: "img", "aria-label": "Visiteurs par jour : " + jours.map(j => j.d + " " + j.n).join(", ") },
      jours.map(j => el("div", { class: "ad-day", title: j.d + " : " + nbFr(j.n) + " visiteurs" },
        el("b", { text: jours.length <= 10 ? nbFr(j.n) : "" }),
        el("i", { style: "height:" + Math.max(3, Math.round(100 * j.n / max)) + "%" }),
        el("span", { text: jours.length <= 10 ? j.d.slice(0, 5) : (j.d.slice(0, 2) === "01" || j === jours[0] || j === jours[jours.length - 1] ? j.d.slice(0, 5) : "") }))));
  }
  async function renderSite() {
    const s = $("#s-site"), p = state.sitePeriode;
    const choix = el("div", { class: "ad-chips ad-chips--pick", role: "group", "aria-label": "Période" }, [[7, "7 jours"], [30, "30 jours"]].map(([n, t]) =>
      el("button", { type: "button", "aria-pressed": String(p === n), text: t, onclick: () => { state.sitePeriode = n; state.site = null; renderSite(); } })));
    if (!state.site || state.site.periode !== p) {
      s.replaceChildren(choix, el("div", { class: "ad-skel", "aria-hidden": "true" }), el("div", { class: "ad-skel ad-skel--haut", "aria-hidden": "true" }));
      const r = await api("visiteurs", { jours: p });
      if (state.view !== "site" || state.sitePeriode !== p) return;
      if (!r.ok) {
        return s.replaceChildren(choix, el("div", { class: "ad-panel" },
          el("h3", { text: r.error === "unknown_action" ? "Le compteur de visiteurs n'est pas encore branché" : "Impossible de lire les visiteurs" }),
          el("p", { class: "ad-muted", text: r.error === "unknown_action" ? "Cet écran est prêt. Il manque le petit compteur à poser sur le site : il note les étapes de chaque visite, sans nom ni adresse." : err(r) })));
      }
      state.site = { ...r, periode: p };
    }
    const d = state.site, diff = d.avant ? Math.round(100 * (d.total - d.avant) / d.avant) : null;
    const contacts = (d.demandes || 0) + (d.appels || 0);
    s.replaceChildren(...[
      choix,
      el("div", { class: "ad-hero ad-hero--site" },
        el("p", { class: "ad-hero-date", text: "Visiteurs sur " + p + " jours" }),
        el("p", { class: "ad-hero-nb", text: nbFr(d.total) }),
        diff !== null ? el("p", { class: "ad-hero-tache", text: (diff >= 0 ? "+" : "−") + Math.abs(diff) + " % par rapport aux " + p + " jours d'avant (" + nbFr(d.avant) + ")" }) : null,
        el("div", { class: "ad-kpis" },
          el("div", {}, el("b", { text: nbFr(d.demandes || 0) }), el("span", { text: "demandes envoyées" })),
          el("div", {}, el("b", { text: nbFr(d.appels || 0) }), el("span", { text: "clics sur « Appeler »" })),
          el("div", {}, el("b", { text: (d.total ? (100 * contacts / d.total).toFixed(1).replace(".", ",") : "0") + " %" }), el("span", { text: "des visiteurs te contactent" })))),
      el("h2", { class: "ad-h2", text: "Visiteurs par jour" }),
      el("div", { class: "ad-panel" }, joursBarres(d.jours || [])),
      el("h2", { class: "ad-h2", text: "Où ils s'arrêtent" }),
      el("div", { class: "ad-panel" },
        el("p", { class: "ad-muted", text: "Chaque ligne compte les visiteurs encore là à cette étape. Entre deux lignes : ceux qui sont partis." }),
        parcours(d.etapes || [])),
      el("h2", { class: "ad-h2", text: "D'où ils viennent" }),
      el("div", { class: "ad-panel" }, barres(d.sources || [], d.total, "visiteurs")),
      el("h2", { class: "ad-h2", text: "Pages les plus vues" }),
      el("div", { class: "ad-panel" }, barres(d.pages || [], 0, "visites")),
      el("h2", { class: "ad-h2", text: "Sur quel appareil" }),
      el("div", { class: "ad-panel" }, barres(d.appareils || [], d.total, "visiteurs")),
      el("p", { class: "ad-muted", text: "Compteur anonyme : pas de nom, pas d'adresse, rien qui permette de reconnaître quelqu'un." })
    ].filter(Boolean));
  }

  /* ----- Plus ----- */
  async function renderPlus() {
    const s = $("#s-plus");
    s.replaceChildren(el("p", { class: "ad-muted", text: "Chargement…" }));
    const r = await api("security");
    const secu = el("div", { class: "ad-panel" }, el("h3", { text: "Sécurité" }));
    if (r.ok) {
      secu.append(el("p", { class: "ad-muted", text: "Appareils connectés" }),
        ...r.sessions.map(x => el("div", { class: "ad-row" }, el("span", { text: x.device + (x.current ? " (celui-ci)" : "") }), el("b", { text: new Date(x.last).toLocaleDateString("fr-FR") }))),
        el("p", { class: "ad-muted", text: "Dernières activités" }),
        ...r.journal.slice(0, 8).map(j => el("div", { class: "ad-row" }, el("span", { text: j.msg }), el("b", { text: new Date(j.t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) }))));
    }
    secu.append(
      el("button", { class: "ad-btn", type: "button", text: "Se déconnecter", onclick: async () => { await api("logout"); store.set(""); startLogin(); } }),
      el("button", { class: "ad-btn ad-btn--danger", type: "button", text: "Déconnecter tous les appareils", onclick: async () => { if (!await demander({ titre: "Déconnecter tous les appareils ?", sous: "Y compris celui-ci. Il faudra te reconnecter avec le code reçu par mail.", oui: "Tout déconnecter", danger: true })) return; await api("logoutAll"); store.set(""); startLogin(); } }));
    // Agent commercial : ce qu'il a retenu, et à quel point ses messages partent sans retouche.
    const ag = await api("commercialRegles", {});
    const agent = el("div", { class: "ad-panel" }, el("h3", { text: "Agent commercial" }));
    if (ag.ok) {
      agent.append(
        el("div", { class: "ad-row" }, el("span", { text: "Messages proposés" }), el("b", { text: String(ag.proposes) })),
        el("div", { class: "ad-row" }, el("span", { text: "Envoyés par toi" }), el("b", { text: String(ag.envoyes) })),
        el("div", { class: "ad-row" }, el("span", { text: "Envoyés sans retouche" }), el("b", { text: ag.envoyes ? ag.sansRetouche + " sur " + ag.envoyes + " (" + pct(ag.sansRetouche, ag.envoyes) + " %)" : "pas encore de mesure" })),
        el("p", { class: "ad-muted", text: "Il apprend de trois façons : tes consignes retenues ci-dessous, tes corrections avant envoi, et tes derniers messages qu'il relit comme modèles. Quand presque tout partira sans retouche, on pourra le laisser répondre seul." }),
        el("p", { class: "ad-muted", text: ag.regles.length ? "Consignes retenues" : "Aucune consigne retenue pour l'instant. Coche « Retenir cette consigne » quand tu lui demandes de refaire un message." }),
        ...ag.regles.map(x => el("div", { class: "ad-row" }, el("span", { text: x.texte }), el("button", { type: "button", class: "ad-link", text: "Retirer", onclick: async () => { await api("commercialRegles", { retirer: x.n }); renderPlus(); } }))));
    } else agent.append(el("p", { class: "ad-muted", text: ag.error === "unknown_action" ? "Pas encore branché sur le serveur." : err(ag) }));
    s.replaceChildren(secu, agent,
      el("h2", { class: "ad-h2", text: "Sections à venir" }),
      soon([["Chantiers", "Date de pose, matériel commandé ou reçu, acompte, solde, mise en service"], ["Entretiens et contrats", "Contrats, prochains entretiens, rappels de printemps"], ["Statistiques", "Demandes par origine, taux de transformation, coût d'un client Google Ads"], ["Prix et catalogue", "Barème d'entretien, zones, matériel avec prix d'achat et marge"], ["Conformité", "Attestation fluides, décennale, RC pro, registre des fluides, alertes d'expiration"], ["Secrétaire", "Journal de l'agent qui tourne toutes les heures"], ["Banque (plus tard, à part)", "Lecture seule après l'ouverture du compte pro, jamais affichée en détail ici"]]));
  }

  /* ---------------- Démarrage ---------------- */
  async function start() {
    if (DEMO) return openApp();
    if (!API_URL) { startLogin(); $("#f-login button").disabled = true; return msg("m-login", "L'espace admin n'est pas encore branché."); }
    if (!store.get()) return startLogin();
    show("v-load");
    const r = await api("today");
    if (r.ok) openApp(); else if (r.error !== "auth") { startLogin(); msg("m-login", err(r)); }
  }

  /* ---------------- Données de démonstration (fictives) ---------------- */
  const D = (() => {
    const j = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("fr-FR"); };
    const jm = n => j(n).slice(0, 5);
    const rows = [
      ["Signé", "Client Démo A", "06 00 00 00 01", "", "Salon-de-Provence", "Entretien", "Nettoyage 1 unité", "", "", "Autre", "Bouche-à-oreille", "", "130", ""],
      ["Devis envoyé", "Client Démo B", "06 00 00 00 02", "demo.b@exemple.fr", "Istres", "Remplacement", "Tri-split, sinistre", "", "", "Appel Google Ads", "", "Relancer le " + jm(0), "4900", "[" + jm(-5) + " 10:12] Devis envoyé", "A : appel téléphonique, remplacement"],
      ["Devis envoyé", "Client Démo C", "06 00 00 00 03", "demo.c@exemple.fr", "Aix-en-Provence", "Installation", "Bi-split 2 pièces", "", "dès 3 618 €", "Site - Google Ads", "", "Envoyer les autres modèles le " + jm(-1), "3640", "", "B : zone éloignée (27 à 37 km)"],
      ["Rappelé", "Client Démo D", "06 00 00 00 04", "", "Saint-Chamas", "Dépannage", "Clim en panne après la pluie", "", "", "Autre", "", "Diagnostic le " + jm(1) + " à 16h", "", ""],
      ["", "Client Démo E", "06 00 00 00 05", "demo.e@exemple.fr", "Pélissanne", "Entretien", "2 unités", "Bonjour, je voudrais un entretien", "293 €", "Site - Google Ads", "", "", "", "", "A : entretien"],
      ["Hors cible", "Client Démo F", "", "demo.f@exemple.fr", "Salon-de-Provence", "Installation", "Pièce 38 m²", "", "", "Site - Google Ads", "", "", "", ""],
      // Notes de prospect de démonstration (15e valeur) : un C et un B arrivés avant un A, pour voir le tri « A, puis B, puis C ».
      ["", "Client Démo G", "06 00 00 00 07", "demo.g@exemple.fr", "Avignon", "Installation", "Délai : Plus tard, je compare pour l'instant\nBudget : Moins de 1 500 €", "", "dès 1 305 €", "Site - naturel", "", "Répondre par message, pas de déplacement avant photos", "", "", "C : compare pour l'instant, hors zone"],
      ["", "Client Démo H", "06 00 00 00 08", "", "Vitrolles", "Installation", "Délai : Dans 1 à 3 mois\nOccupant : Propriétaire", "", "dès 1 361 €", "Site - Google Ads", "", "Rappeler aujourd'hui", "", "", "B : zone sud"],
      ["", "Client Démo I", "06 00 00 00 09", "demo.i@exemple.fr", "Grans", "Installation", "Délai : Dès que possible, sous 1 mois\nOccupant : Propriétaire\nBudget : 1 500 à 3 000 €", "", "dès 1 361 €", "Site - Google Ads", "", "Rappeler dans l'heure", "", "", "A : propriétaire pressé en zone proche"]
    ];
    return {
      rows: rows.map((v, i) => ({ row: i + 2, recu: j(-12 + i * 2), statut: v[0], nom: v[1], tel: v[2], email: v[3], commune: v[4], prestation: v[5], details: v[6], message: v[7], estimation: v[8], source: v[9], connu: v[10], action: v[11], montant: v[12], montantNum: Number(v[12]) || 0, notes: v[13], qualite: v[14] || "" })),
      journal: [{ t: new Date().toISOString(), msg: "Connexion réussie : Windows · Chrome (démo)" }]
    };
  })();
  function demo(action, data) {
    const rows = D.rows;
    const today = () => {
      const auj = new Date(); auj.setHours(23, 59, 0, 0);
      const att = rows.filter(r => r.statut === "Devis envoyé"), sig = rows.filter(r => GAGNES.includes(r.statut));
      return { ok: true, nouveaux: rows.filter(r => !r.statut || r.statut === "Nouveau"), relances: rows.filter(r => !GAGNES.concat(SIDE).includes(r.statut) && dateDans(r.action) && dateDans(r.action) <= auj),
        rdv: [{ titre: "Entretien (démo)", debut: new Date(Date.now() + 36e5).toISOString(), lieu: "Saint-Martin-de-Crau", journee: false }],
        chiffres: { attenteNb: att.length, attenteMontant: att.reduce((t, r) => t + r.montantNum, 0), signesNb: sig.length, signesMontant: sig.reduce((t, r) => t + r.montantNum, 0), demandesNb: rows.length } };
    };
    switch (action) {
      case "today": return today();
      case "demandes": return { ok: true, rows: rows.map(r => ({ ...r })), statuts: FLOW.concat(SIDE) };
      case "add": {
        const f = data.fields; if (!f.nom) return { ok: false, error: "nom" };
        const row = rows.length + 2;
        // Comme le serveur : les réponses du guide d'appel en tête des détails, puis la note du prospect.
        const details = ["occupant", "delai", "prix_ok"].filter(k => f[k]).map(k => NP_LIBELLES[k] + " : " + f[k]).concat(f.details ? [f.details] : []).join("\n");
        const qualite = npTexteNote(noteProspect({ prestation: f.prestation, commune: f.commune, telephone: f.tel, details, source: f.source, connu: f.connu, occupant: f.occupant, delai: f.delai, prix_ok: f.prix_ok, appel: f.appel === true }));
        rows.push({ row, recu: new Date().toLocaleDateString("fr-FR"), statut: "Nouveau", nom: f.nom, tel: f.tel, email: "", commune: f.commune, prestation: f.prestation, details, message: "", estimation: "", source: f.source, connu: f.connu, action: "", montant: "", montantNum: 0, notes: "", qualite });
        // Guide d'appel : en démo, l'appel est gardé en mémoire (le vrai serveur l'écrit dans l'onglet « Appels » du CRM).
        if (f.appel === true) (D.appels = D.appels || []).push({ ligne: row, client: f.nom, commune: f.commune, besoin: f.prestation, occupant: f.occupant, delai: f.delai, prix_ok: f.prix_ok, fourchette: f.fourchette, note: qualite, decision: f.decision, remarque: f.remarque, duree: f.duree });
        return { ok: true, row, qualite, appelNote: f.appel === true };
      }
      case "update": {
        const r = rows.find(x => x.row === data.row); if (!r) return { ok: false, error: "ligne" };
        const f = data.fields;
        if (f.statut !== undefined) r.statut = f.statut;
        if (f.action !== undefined) r.action = f.action;
        if (f.montant !== undefined) { r.montantNum = Number(String(f.montant).replace(",", ".")) || 0; r.montant = f.montant; }
        if (f.noteAjout) r.notes = (r.notes ? r.notes + "\n" : "") + "[" + new Date().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "") + "] " + f.noteAjout;
        D.journal.unshift({ t: new Date().toISOString(), msg: "Modifié ligne " + r.row + " (" + r.nom + ")" });
        return { ok: true };
      }
      case "trace": return { ok: true };
      case "facture": return { ok: true, numero: "F-2026-DEMO", total: 130, reste: 0, pdf: "", brouillon: true };
      case "envoyerDevis": return { ok: true, a: "client@exemple.fr" };
      case "devis": return { ok: true, numero: "D-2026-DEMO", brouillon: true, mail: data.email || "client@exemple.fr", lien: "https://thermaz.fr/signer.html?d=D-2026-DEMO", pdf: "", tel: "06 00 00 00 01", sms: "Bonjour, c'est Andy de Thermaz. Je viens de vous envoyer le devis par mail (démo).", options: [{ marque: data.marque, gamme: data.gamme, total: 5209 }].concat(data.gamme2 ? [{ marque: data.marque, gamme: data.gamme2, total: 6252 }] : []) };
      case "traces": return { ok: true, rows: (state.traces || []).slice() };
      case "mailsClient": return { ok: true, email: "client@exemple.fr", fils: [
        { id: "t1", objet: "Re: Votre devis climatisation n° D-2026-004 – Thermaz", nb: 3, date: "07/11 18:42", deClient: true, extrait: "Bonjour Andy, merci pour le devis. Est-ce qu'on peut mettre l'unité extérieure côté jardin plutôt que sur la façade ? Bonne soirée." },
        { id: "t2", objet: "Votre demande – Thermaz", nb: 1, date: "03/11 09:15", deClient: false, extrait: "Bonjour, merci pour votre demande, je l'ai bien reçue…" }] };
      case "repondreClient": return { ok: true, envoye: !!data.envoyer };
      case "depenses": return { ok: true, rows: [
        { date: new Date(Date.now() - 3 * 864e5).toLocaleDateString("fr-FR"), montant: 412.5, fournisseur: "Grossiste clim (démo)", categorie: "Matériel", chantier: "Client Démo A", ligne: 2, description: "Liaisons frigo", lien: "" },
        { date: new Date(Date.now() - 864e5).toLocaleDateString("fr-FR"), montant: 68, fournisseur: "Station (démo)", categorie: "Carburant", chantier: "", ligne: "", description: "", lien: "" }] };
      case "pubRoi": return { ok: true, depense: 649.82, mois: [], note: "chiffres de démonstration", demandes: 8, vraies: 6, signes: 2, signesMontant: 10380, attente: 2, coutParDemande: 108, coutParSigne: 325, retour: 16, sept: { le: new Date().toLocaleDateString("fr-FR"), cout: 131.2, clics: 88, conv: 3 } };
      case "commercialEnvoye": return { ok: true };
      case "commercialRegles": {
        D.regles = D.regles || [{ n: 2, texte: "Ne jamais écrire plus de 5 phrases dans un SMS (exemple de démonstration)" }];
        if (data.ajouter) D.regles.push({ n: D.regles.length + 2, texte: data.ajouter });
        if (data.retirer) D.regles = D.regles.filter(x => x.n !== data.retirer);
        return { ok: true, regles: D.regles, proposes: 14, envoyes: 11, sansRetouche: 6 };
      }
      case "commercial": return { ok: true, id: 2, conseil: "Devis envoyé il y a 8 jours, aucune réponse. Elle comparait avec un autre artisan : rappeler ce qui est compris plutôt que parler du prix. (Texte de démonstration.)",
        court: "Bonjour Madame, c'est Andy de Thermaz. Avez-vous pu regarder le devis pour votre bi-split ? Le prix comprend le matériel, la pose et la mise en service, et c'est moi qui pose. Si un point vous fait hésiter, dites-le-moi : je peux vous rappeler ce soir ou demain matin, comme vous préférez.\nAndy – Thermaz, 06 51 10 64 35",
        objet: "Votre devis climatisation",
        mail: "Bonjour Madame,\n\nJe reviens vers vous au sujet du devis que je vous ai envoyé pour votre bi-split.\n\nLe prix comprend le matériel, la pose complète et la mise en service. C'est moi qui viens poser, et la pose est garantie 2 ans.\n\nSi un point vous fait hésiter, dites-le-moi simplement : je préfère y répondre que vous laisser avec un doute. Je peux vous appeler ce soir ou demain matin, comme vous préférez.\n\nBien cordialement,\nAndy – Thermaz\n06 51 10 64 35" };
      case "visiteurs": {
        // Chiffres inventés, pour montrer l'écran.
        const n = data.jours === 30 ? 30 : 7, base = [31, 26, 34, 29, 38, 22, 19];
        const jours = Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return { d: d.toLocaleDateString("fr-FR"), n: base[d.getDay()] + ((i * 7) % 9) - 4 }; });
        const total = jours.reduce((t, j) => t + j.n, 0), part = x => Math.round(total * x);
        return { ok: true, total, avant: Math.round(total * 0.88), demandes: part(0.022), appels: part(0.041), jours,
          etapes: [["Arrivent sur le site", 1], ["Font défiler la page", 0.66], ["Voient les prix", 0.41], ["Ouvrent le simulateur", 0.19], ["Choisissent le type de clim", 0.15], ["Indiquent les pièces", 0.09], ["Arrivent aux coordonnées", 0.045], ["Envoient la demande", 0.022]].map(([nom, x]) => ({ nom, n: part(x) })),
          sources: [["Google Ads", 0.56], ["Recherche Google", 0.27], ["Accès direct", 0.11], ["Autre", 0.06]].map(([nom, x]) => ({ nom, n: part(x) })),
          pages: [["Installation", 0.52], ["Accueil", 0.31], ["Entretien", 0.14], ["Dépannage", 0.11], ["Devis en ligne", 0.09]].map(([nom, x]) => ({ nom, n: part(x) })),
          appareils: [["Téléphone", 0.71], ["Ordinateur", 0.29]].map(([nom, x]) => ({ nom, n: part(x) })) };
      }
      case "security": return { ok: true, sessions: [{ device: "Windows · Chrome", created: Date.now(), last: Date.now(), current: true }], journal: D.journal };
      default: return { ok: true };
    }
  }

  start();
})();
