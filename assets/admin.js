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
  const state = { view: "today", data: null, today: null, q: "", cq: "", statuts: [], current: null, pend: null, nonce: "" };
  const FLOW = ["Nouveau", "Rappelé", "Visite prévue", "Devis envoyé", "Signé", "Acompte reçu", "Posé", "Soldé"];
  const SIDE = ["Perdu", "Hors cible"];
  const COURT = { "Visite prévue": "Visite", "Devis envoyé": "Devis", "Acompte reçu": "Acompte" };
  const GAGNES = ["Signé", "Acompte reçu", "Posé", "Soldé"];
  const GROUPES = [
    { t: "Nouveaux, à rappeler", f: s => s === "" || s === "Nouveau", open: true },
    { t: "En cours", f: s => s === "Rappelé" || s === "Visite prévue", open: true },
    { t: "Devis envoyés", f: s => s === "Devis envoyé", open: true },
    { t: "Gagnés", f: s => GAGNES.includes(s), open: false },
    { t: "Perdus et hors cible", f: s => SIDE.includes(s), open: false }
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
  async function openApp() { show("v-app"); $("#demo").hidden = !DEMO; await refresh(true); }
  async function refresh(silent) {
    const b = $("#b-refresh"); b.classList.add("spin");
    const [t, d, tr] = await Promise.all([api("today"), api("demandes"), api("traces", { jours: 1 })]);
    b.classList.remove("spin");
    if (!t.ok || !d.ok) { if (t.error !== "auth" && d.error !== "auth") toast(err(t.ok ? d : t)); return; }
    state.today = t; state.data = d.rows; state.statuts = d.statuts || FLOW.concat(SIDE);
    if (tr && tr.ok) state.traces = tr.rows;
    render();
    api("depenses").then(x => { if (x && x.ok) { state.depenses = x.rows; if (state.view === "argent") render(); } });
    if (!silent) toast("À jour");
  }
  $("#b-refresh").addEventListener("click", () => refresh());

  const TITRES = { today: "Aujourd'hui", demandes: "Demandes", clients: "Clients", argent: "Argent", plus: "Plus" };
  $$(".ad-nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.v)));
  function go(v) {
    state.view = v;
    $$(".ad-nav button").forEach(b => b.dataset.v === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
    $$("[data-s]").forEach(s => s.hidden = s.dataset.s !== v);
    $("#titre").textContent = TITRES[v];
    render(); window.scrollTo(0, 0);
  }
  function render() {
    if (!state.data) return;
    $("#dot-today").hidden = !resteAFaire().length;
    ({ today: renderToday, demandes: renderDemandes, clients: renderClients, argent: renderArgent, plus: renderPlus })[state.view]();
  }

  /* ----- Cartes ----- */
  const tel = t => { const d = String(t || "").replace(/[^\d+]/g, ""); return d.startsWith("0") ? "+33" + d.slice(1) : d; };
  function carte(r, ligne) {
    const t = tel(r.tel), q = quand(r.action);
    return el("article", { class: "ad-item" },
      el("button", { class: "ad-item-main", type: "button", onclick: () => openFiche(r) },
        el("span", { class: "ad-item-top" }, el("b", { text: r.nom || "(sans nom)" }), el("span", { class: "ad-badge", "data-s": r.statut || "", text: r.statut || "Nouveau" })),
        el("small", { text: [r.commune, r.prestation, r.montantNum ? euro(r.montantNum) : ""].filter(Boolean).join(" · ") }),
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
  async function majFiche(r, fields, ok) {
    const res = await api("update", { row: r.row, nom: r.nom, fields });
    if (!res.ok) return toast(err(res));
    toast(ok || "Enregistré dans le CRM");
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
    const opts = [];
    if (t) opts.push({ t: "WhatsApp", s: "Message prêt, tu n'as qu'à l'envoyer", fn: () => { window.open("https://wa.me/" + t.replace("+", "") + "?text=" + encodeURIComponent(txt), "_blank", "noopener"); noter("WhatsApp"); } });
    if (r.email) opts.push({ t: "E-mail", s: "Mail prêt dans ton appli mail", fn: () => { location.href = "mailto:" + r.email + "?subject=" + encodeURIComponent("Votre devis climatisation – Thermaz") + "&body=" + encodeURIComponent(txt); noter("e-mail"); } });
    if (t) opts.push({ t: "SMS", s: "Message prêt dans tes SMS", fn: () => { location.href = "sms:" + t + "?&body=" + encodeURIComponent(txt); noter("SMS"); } });
    if (t) opts.push({ t: "Appeler", s: "Puis note le résultat avec « Fait »", fn: () => { location.href = "tel:" + t; } });
    if (!opts.length) return toast("Ni téléphone ni e-mail sur cette fiche.");
    choisir("Relancer " + prenom(r.nom), "Devis " + (r.montantNum ? euro(r.montantNum) : "") + " · rappel noté pour le " + suite, opts);
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
  function renderToday() {
    const t = state.today, c = t.chiffres, s = $("#s-today"), tout = aFaire(), todo = tout.filter(r => !estFait(r)), finis = tout.filter(estFait);
    const h = new Date().getHours();
    s.replaceChildren(...[
      el("div", {}, el("p", { class: "ad-hello", text: (h < 18 ? "Bonjour Andy" : "Bonsoir Andy") }),
        el("p", { class: "ad-muted", text: new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + " · " + (todo.length ? todo.length + (todo.length > 1 ? " choses à faire" : " chose à faire") : "rien d'urgent") })),
      el("h2", { class: "ad-h2", text: "En un coup d'œil" }),
      el("div", { class: "ad-tiles" },
        el("button", { class: "ad-tile", type: "button", onclick: () => go("demandes") }, el("b", { text: euro(c.attenteMontant) }), el("span", { text: c.attenteNb + " devis en attente" })),
        el("button", { class: "ad-tile", type: "button", onclick: () => go("demandes") }, el("b", { text: euro(c.signesMontant) }), el("span", { text: c.signesNb + (c.signesNb > 1 ? " devis signés" : " devis signé") })),
        el("button", { class: "ad-tile", type: "button", onclick: () => go("demandes") }, el("b", { text: c.demandesNb }), el("span", { text: "demandes au total" })),
        el("button", { class: "ad-tile", type: "button", onclick: () => go("clients") }, el("b", { text: clients().length }), el("span", { text: "clients" }))),
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
    const rows = state.data.filter(cherche).slice().reverse();
    const box = $("#d-liste");
    if (!rows.length) return box.replaceChildren(el("p", { class: "ad-empty", text: "Aucune demande ne correspond." }));
    box.replaceChildren(...GROUPES.map(g => {
      const l = rows.filter(r => g.f(r.statut || ""));
      if (!l.length) return null;
      return el("details", { class: "ad-group", open: g.open || !!state.q },
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
      quick(!!r.email, { href: "mailto:" + r.email }, "mail", "E-mail"),
      quick(!!r.commune, { href: "https://waze.com/ul?navigate=yes&q=" + encodeURIComponent(adresseDe(r)), target: "_blank", rel: "noopener noreferrer" }, "map", "Waze"));
    drawSteps();
    $("#fi-action").value = r.action || "";
    $("#fi-dates").replaceChildren(...[["Aujourd'hui", 0], ["Demain", 1], ["Dans 3 jours", 3], ["Dans 1 semaine", 7], ["Effacer", null]].map(([t2, n]) => el("button", { type: "button", text: t2, onclick: () => setDate(n) })));
    $("#fi-note").value = "";
    $("#fi-notes-rapides").replaceChildren(...["Pas de réponse", "Message laissé", "Rappelé", "Visite fixée", "Devis envoyé", "Attend l'accord", "Trop cher"].map(t2 => el("button", { type: "button", text: t2, onclick: () => { const n = $("#fi-note"); n.value = (n.value ? n.value.replace(/\s*$/, "") + ". " : "") + t2; } })));
    $("#fi-notes").textContent = r.notes || "";
    $("#fi-montant").value = r.montantNum || "";
    const infos = [["Téléphone", r.tel], ["E-mail", r.email], ["Détails", r.details], ["Message", r.message], ["Estimation", r.estimation], ["Origine", [r.source, r.connu].filter(Boolean).join(" · ")], ["Ligne du CRM", String(r.row)]];
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
    const res = await api("update", { row: r.row, nom: r.nom, fields: f });
    if (!res.ok) return msg("m-fiche", err(res));
    tracer("Fiche modifiée", (r.nom || "?") + (f.statut ? " → " + f.statut : "") + (f.noteAjout ? " · " + f.noteAjout.slice(0, 80) : ""), r.row);
    $("#fiche").close(); toast("Enregistré dans le CRM");
    await refresh(true);
  }));

  /* ----- Nouvelle demande ----- */
  const PRESTA = ["Installation", "Entretien", "Dépannage", "Remplacement", "Mise en service", "Autre"];
  const SOURCES = { "Appel Google Ads": ["Appel Google Ads", ""], "Appel direct": ["Autre", "Appel direct"], "Bouche-à-oreille": ["Autre", "Bouche-à-oreille"], "Facebook / Instagram": ["Autre", "Facebook / Instagram"], "Client existant": ["Autre", "Client existant"], "Autre": ["Autre", ""] };
  const pick = { presta: "", source: "" };
  function chipsPick(box, list, key) {
    box.replaceChildren(...list.map(v => el("button", { type: "button", "aria-pressed": String(pick[key] === v), text: v, onclick: () => { pick[key] = pick[key] === v ? "" : v; chipsPick(box, list, key); } })));
  }
  $("#b-new").addEventListener("click", () => {
    $("#f-new").reset(); pick.presta = pick.source = ""; msg("m-new", "");
    chipsPick($("#nv-presta"), PRESTA, "presta"); chipsPick($("#nv-source"), Object.keys(SOURCES), "source");
    $("#nouveau").showModal(); setTimeout(() => $("#nv-nom").focus(), 60);
  });
  $("#f-new").addEventListener("submit", e => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const src = SOURCES[pick.source] || ["", ""];
      const res = await api("add", { fields: { nom: $("#nv-nom").value.trim(), tel: $("#nv-tel").value.trim(), commune: $("#nv-commune").value.trim(), prestation: pick.presta, details: $("#nv-details").value.trim(), source: src[0], connu: src[1] } });
      if (!res.ok) return msg("m-new", err(res));
      tracer("Client ajouté", $("#nv-nom").value.trim() + ($("#nv-commune").value.trim() ? " (" + $("#nv-commune").value.trim() + ")" : ""), res.row);
      $("#nouveau").close(); toast("Demande créée dans le CRM");
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
  const saisirMontant = (q, def) => { const s = prompt(q, def || ""); if (s === null) return null; const m = lireMontant(String(s).replace(/\s/g, "")); if (!(m > 0)) { toast("Montant invalide."); return null; } return m; };
  function validerAcompte(r) {
    if (!state.statuts.includes("Acompte reçu")) return toast("L'étape « Acompte reçu » manque dans le CRM.");
    const m = saisirMontant("Montant de l'acompte reçu de " + (r.nom || "ce client") + " (en €) :", r.montantNum ? Math.round(r.montantNum * 0.3) : "");
    if (m === null) return;
    const f = { noteAjout: "Acompte reçu : " + euro(m) + " (avant : " + r.statut + ")" };
    if (r.statut === "Signé") f.statut = "Acompte reçu";
    tracer("Acompte reçu", (r.nom || "?") + " · " + euro(m), r.row);
    busy(null, () => majFiche(r, f, "Acompte de " + euro(m) + " noté"));
  }
  function validerPaiement(r) {
    if (!state.statuts.includes("Soldé")) return toast("L'étape « Soldé » manque dans le CRM.");
    const m = saisirMontant("Montant encaissé pour " + (r.nom || "ce client") + " (en €) :", reste(r) || r.montantNum);
    if (m === null) return;
    const f = { statut: "Soldé", noteAjout: "Paiement validé : " + euro(m) + " encaissés (avant : " + r.statut + ")" };
    if (!r.montantNum) f.montant = String(m);
    tracer("Paiement reçu", (r.nom || "?") + " · " + euro(m), r.row);
    busy(null, () => majFiche(r, f, euro(m) + " encaissés"));
  }
  function annulerPaiement(r) {
    const m = String(r.notes || "").match(/\(avant : ([^)]+)\)(?![\s\S]*\(avant : )/);
    const avant = m && A_ENCAISSER.includes(m[1]) ? m[1] : "Signé";
    if (!confirm("Remettre " + (r.nom || "ce client") + " en attente de paiement (« " + avant + " ») ?")) return;
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
      depensesPanel(),
      el("h2", { class: "ad-h2", text: "Arrive à la prochaine étape" }),
      soon([["Livre des recettes", "Tenu automatiquement, obligatoire en micro-entreprise"], ["Factures et avoirs", "Numérotation continue, HT, TVA, TTC, payée ou en retard"], ["Encaissements", "Acomptes et soldes, par virement, chèque, espèces ou carte"], ["Dépenses et justificatifs", "Matériel par chantier, carburant, Google Ads, assurances, photo du ticket"], ["Marge par chantier", "Devis moins matériel et déplacement"], ["Compteurs", "Seuil de TVA, plafond micro, argent à mettre de côté pour l'URSSAF"], ["Export comptable", "Un tableur par mois pour le comptable"]]));
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
      el("button", { class: "ad-btn ad-btn--danger", type: "button", text: "Déconnecter tous les appareils", onclick: async () => { if (!confirm("Déconnecter tous les appareils, y compris celui-ci ?")) return; await api("logoutAll"); store.set(""); startLogin(); } }));
    s.replaceChildren(secu,
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
      ["Devis envoyé", "Client Démo B", "06 00 00 00 02", "demo.b@exemple.fr", "Istres", "Remplacement", "Tri-split, sinistre", "", "", "Appel Google Ads", "", "Relancer le " + jm(0), "4900", "[" + jm(-5) + " 10:12] Devis envoyé"],
      ["Devis envoyé", "Client Démo C", "06 00 00 00 03", "demo.c@exemple.fr", "Aix-en-Provence", "Installation", "Bi-split 2 pièces", "", "dès 3 618 €", "Site - Google Ads", "", "Envoyer les autres modèles le " + jm(-1), "3640", ""],
      ["Rappelé", "Client Démo D", "06 00 00 00 04", "", "Saint-Chamas", "Dépannage", "Clim en panne après la pluie", "", "", "Autre", "", "Diagnostic le " + jm(1) + " à 16h", "", ""],
      ["", "Client Démo E", "06 00 00 00 05", "demo.e@exemple.fr", "Pélissanne", "Entretien", "2 unités", "Bonjour, je voudrais un entretien", "293 €", "Site - Google Ads", "", "", "", ""],
      ["Hors cible", "Client Démo F", "", "demo.f@exemple.fr", "Salon-de-Provence", "Installation", "Pièce 38 m²", "", "", "Site - Google Ads", "", "", "", ""]
    ];
    return {
      rows: rows.map((v, i) => ({ row: i + 2, recu: j(-12 + i * 2), statut: v[0], nom: v[1], tel: v[2], email: v[3], commune: v[4], prestation: v[5], details: v[6], message: v[7], estimation: v[8], source: v[9], connu: v[10], action: v[11], montant: v[12], montantNum: Number(v[12]) || 0, notes: v[13] })),
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
        rows.push({ row, recu: new Date().toLocaleDateString("fr-FR"), statut: "Nouveau", nom: f.nom, tel: f.tel, email: "", commune: f.commune, prestation: f.prestation, details: f.details, message: "", estimation: "", source: f.source, connu: f.connu, action: "", montant: "", montantNum: 0, notes: "" });
        return { ok: true, row };
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
      case "traces": return { ok: true, rows: (state.traces || []).slice() };
      case "depenses": return { ok: true, rows: [
        { date: new Date(Date.now() - 3 * 864e5).toLocaleDateString("fr-FR"), montant: 412.5, fournisseur: "Grossiste clim (démo)", categorie: "Matériel", chantier: "Client Démo A", ligne: 2, description: "Liaisons frigo", lien: "" },
        { date: new Date(Date.now() - 864e5).toLocaleDateString("fr-FR"), montant: 68, fournisseur: "Station (démo)", categorie: "Carburant", chantier: "", ligne: "", description: "", lien: "" }] };
      case "security": return { ok: true, sessions: [{ device: "Windows · Chrome", created: Date.now(), last: Date.now(), current: true }], journal: D.journal };
      default: return { ok: true };
    }
  }

  start();
})();
