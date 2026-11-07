/* Thermaz : réservation en ligne d'un entretien (reserver.html?c=<commune>&n=<nombre de clims>&f=contrat). */
(function () {
  "use strict";
  const API_URL = "https://script.google.com/macros/s/AKfycbxePxnHl8FiHMrCn6O8SJbn3LiGjTtBUezzQGw8p3IvoVlFAWyJTKAKblQ2iOuzql6H/exec";
  const TEL = "06 51 10 64 35";
  const q = new URLSearchParams(location.search);
  const DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && q.has("demo");
  const app = document.getElementById("app");

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }
  const show = (...nodes) => app.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
  const euro = n => Number(n).toLocaleString("fr-FR") + " €";

  async function api(action, data) {
    if (DEMO) return demo(action, data);
    try {
      const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...data, action }) });
      return await res.json();
    } catch (e) { return { ok: false, error: "reseau" }; }
  }

  const st = { commune: q.get("c") || "", n: Math.max(1, Math.min(6, Number(q.get("n")) || 1)), contrat: q.get("f") === "contrat", creneau: "", nom: "", tel: "", email: "", adresse: "", message: "" };
  let E = null, CR = [];

  function prix() {
    const z = E.zones.find(x => x.communes.includes(st.commune));
    const base = (st.contrat ? E.contrat : E.nettoyage) + (st.n - 1) * (E.extra || 0);
    if (!z) return null;
    const frais = st.contrat && z.fee_contrat !== undefined ? z.fee_contrat : z.fee;
    return { base, frais, total: base + frais, z };
  }

  async function init() {
    try { E = (await (await fetch("data/devis-rapide.json", { cache: "no-cache" })).json()).ent; } catch (e) { E = null; }
    if (!E) return erreur("La grille de prix n'a pas pu se charger. Rechargez la page ou appelez Andy au " + TEL + ".");
    const r = await api("creneauxEntretien", {});
    if (!r.ok) return erreur("Les créneaux n'ont pas pu se charger. Rechargez la page ou appelez Andy au " + TEL + ".");
    CR = r.creneaux || [];
    rendre();
  }
  function erreur(t) { show(el("h1", { class: "sg-h1", text: "Réserver un entretien" }), el("p", { class: "sg-msg", text: t })); }

  function rendre() {
    const communes = E.zones.flatMap(z => z.communes).sort((a, b) => a.localeCompare(b, "fr"));
    const p = prix();
    const sel = el("select", { id: "rs-commune", class: "rs-select", onchange: e => { st.commune = e.target.value; rendre(); } },
      el("option", { value: "", text: "Choisissez votre commune" }), communes.map(c => el("option", { value: c, text: c, selected: c === st.commune })), el("option", { value: "autre", text: "Autre commune", selected: st.commune === "autre" }));
    const radio = (name, items, cur, set) => el("div", { class: "rs-choix", role: "radiogroup" }, items.map(([v, t]) =>
      el("label", {}, el("input", { type: "radio", name, value: String(v), checked: String(cur) === String(v), onchange: () => { set(v); rendre(); } }), t)));
    const err = el("p", { class: "sg-err", role: "alert" });
    const jours = [];
    CR.forEach(c => { let j = jours.find(x => x.jour === c.jour); if (!j) jours.push(j = { jour: c.jour, l: [] }); j.l.push(c); });
    const champ = (id, lab, k, attrs) => [el("label", { class: "sg-l", for: id, text: lab }), el("input", { id, class: "sg-input", value: st[k], oninput: e => { st[k] = e.target.value; }, ...(attrs || {}) })];
    const horsZone = st.commune === "autre";
    show(
      el("h1", { class: "sg-h1", text: "Réserver l'entretien de votre clim" }),
      el("p", { class: "sg-sub", text: "Prix affiché selon votre commune, créneau au choix. Andy vous confirme par SMS." }),
      el("section", { class: "sg-card sg-form" },
        el("h2", { text: "1. Votre entretien" }),
        el("label", { class: "sg-l", for: "rs-commune", text: "Commune" }), sel,
        el("p", { class: "sg-l", text: "Nombre de clims (unités intérieures)" }),
        radio("n", [[1, "1"], [2, "2"], [3, "3"], [4, "4"]], st.n, v => { st.n = v; }),
        el("p", { class: "sg-l sg-mt", text: "Formule" }),
        radio("f", [["nettoyage", "Nettoyage complet"], ["contrat", "Contrat annuel"]], st.contrat ? "contrat" : "nettoyage", v => { st.contrat = v === "contrat"; }),
        horsZone ? el("p", { class: "sg-msg", text: "Pour une commune hors de mes zones, appelez-moi au " + TEL + " : je vous donne le prix du déplacement et on cale une date." }) : null,
        p ? el("div", { class: "rs-prix" }, el("span", {}, st.contrat ? "Contrat annuel" : "Nettoyage complet", el("small", { text: st.n + " clim" + (st.n > 1 ? "s" : "") + (p.frais ? " · déplacement " + euro(p.frais) + " compris" : " · déplacement offert") })),
          el("b", { text: euro(p.total) + (st.contrat ? "/an" : "") })) : null,
        st.contrat ? el("p", { class: "sg-info", text: "Le contrat : une visite par an au printemps, rappel automatique, garantie de pose prolongée et priorité en cas de panne. Cette réservation est la première visite." }) : null),
      p ? el("section", { class: "sg-card" },
        el("h2", { text: "2. Votre créneau" }),
        CR.length ? jours.map(j => [el("p", { class: "rs-jour", text: j.jour }), el("div", { class: "rs-heures" }, j.l.map(c =>
          el("button", { type: "button", "aria-pressed": String(st.creneau === c.id), text: c.heure, onclick: () => { st.creneau = c.id; rendre(); } })))])
          : el("p", { class: "sg-msg", text: "Plus de créneau libre en ligne pour les 2 prochaines semaines. Appelez Andy au " + TEL + "." })) : null,
      p && st.creneau ? el("section", { class: "sg-card sg-form" },
        el("h2", { text: "3. Vos coordonnées" }),
        champ("rs-nom", "Nom et prénom", "nom", { autocomplete: "name", maxlength: "80" }),
        champ("rs-tel", "Téléphone", "tel", { type: "tel", autocomplete: "tel", inputmode: "tel", maxlength: "20" }),
        champ("rs-email", "E-mail (facultatif, pour la confirmation)", "email", { type: "email", autocomplete: "email", maxlength: "120" }),
        champ("rs-adresse", "Adresse de l'intervention", "adresse", { autocomplete: "street-address", maxlength: "200" }),
        el("label", { class: "sg-l", for: "rs-msg", text: "Un détail utile ? (facultatif)" }),
        el("textarea", { id: "rs-msg", class: "sg-input", rows: "3", maxlength: "500", oninput: e => { st.message = e.target.value; } }, st.message),
        el("div", { class: "rs-piege", "aria-hidden": "true" }, el("label", { for: "rs-site", text: "Site" }), el("input", { id: "rs-site", tabindex: "-1", autocomplete: "off" })),
        el("button", { type: "button", class: "sg-btn", text: "Réserver ce créneau", onclick: e => reserver(e.currentTarget, err) }),
        err,
        el("p", { class: "sg-info", text: "Paiement sur place après l'intervention. Pour changer de date, il suffit d'appeler ou de répondre au SMS." })) : null);
  }

  async function reserver(btn, err) {
    err.textContent = "";
    if (st.nom.trim().length < 2) return (err.textContent = "Indiquez votre nom.");
    if (st.tel.replace(/\D/g, "").length < 10) return (err.textContent = "Indiquez un numéro de téléphone valide.");
    if (st.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(st.email.trim())) return (err.textContent = "L'adresse e-mail semble incomplète.");
    if (st.adresse.trim().length < 5) return (err.textContent = "Indiquez l'adresse de l'intervention.");
    btn.disabled = true; btn.textContent = "Réservation…";
    const piege = document.getElementById("rs-site");
    const r = await api("reserverEntretien", { creneau: st.creneau, nom: st.nom.trim(), tel: st.tel.trim(), email: st.email.trim(), adresse: st.adresse.trim(), commune: st.commune, n: st.n, contrat: st.contrat, message: st.message.trim(), site: piege ? piege.value : "" });
    if (!r.ok) {
      btn.disabled = false; btn.textContent = "Réserver ce créneau";
      if (r.error === "creneau") { st.creneau = ""; const c = await api("creneauxEntretien", {}); CR = (c && c.creneaux) || []; rendre(); return; }
      const t = { plein: "Trop de réservations aujourd'hui : appelez Andy au " + TEL + ".", reseau: "Connexion impossible : vérifiez internet et réessayez.", tel: "Le numéro de téléphone semble incomplet.", adresse: "Indiquez l'adresse complète." }[r.error];
      err.textContent = t || "Un souci est survenu. Réessayez, ou appelez Andy au " + TEL + ".";
      return;
    }
    window.scrollTo(0, 0);
    show(el("div", { class: "sg-ok" },
      el("h1", { text: "C'est réservé !" }),
      r.jour ? el("p", { text: "Entretien le " + r.jour + " à " + r.heure + " · " + r.prix + "." } ) : null,
      el("p", { text: "Andy vous confirme par SMS. Pour changer de date, appelez le " + TEL + "." })),
      el("p", { class: "sg-info" }, el("a", { href: "entretien-climatisation.html", text: "Retour à la page entretien" })));
  }

  function demo(action) {
    return new Promise(res => setTimeout(() => {
      if (action === "creneauxEntretien") return res({ ok: true, creneaux: [
        { id: "2026-11-10T08:30", jour: "mardi 10 novembre", heure: "08h30" }, { id: "2026-11-10T14:00", jour: "mardi 10 novembre", heure: "14h00" },
        { id: "2026-11-12T10:30", jour: "jeudi 12 novembre", heure: "10h30" }, { id: "2026-11-12T16:00", jour: "jeudi 12 novembre", heure: "16h00" }] });
      res({ ok: true, jour: "mardi 10 novembre", heure: "08h30", prix: "184 €" });
    }, 300));
  }

  init();
})();
