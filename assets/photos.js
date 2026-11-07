/* Thermaz : le client envoie ses photos (photos.html?r=<ligne>&k=<jeton personnel>). */
(function () {
  "use strict";
  const API_URL = "https://script.google.com/macros/s/AKfycbxePxnHl8FiHMrCn6O8SJbn3LiGjTtBUezzQGw8p3IvoVlFAWyJTKAKblQ2iOuzql6H/exec";
  const TEL = "06 51 10 64 35";
  const q = new URLSearchParams(location.search);
  const R = q.get("r") || "", K = q.get("k") || "";
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

  async function api(action, data) {
    if (DEMO) return new Promise(res => setTimeout(() => res(action === "photosInfo" ? { ok: true, prenom: "Claire", prestation: "Installation", deja: 0 } : { ok: true, n: 1 }), 500));
    try {
      const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...data, action, r: R, k: K }) });
      return await res.json();
    } catch (e) { return { ok: false, error: "reseau" }; }
  }

  // Réduit la photo (1600 px max, JPEG) : plus rapide à envoyer, même en 4G.
  function reduire(file) {
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("lecture")); };
      img.src = url;
    });
  }

  function conseils(p) {
    p = String(p || "").toLowerCase();
    if (/entretien/.test(p)) return ["Votre unité intérieure (de face)", "Le groupe extérieur", "L'étiquette avec la marque et le modèle, si vous la trouvez"];
    if (/panne|dépann|depann/.test(p)) return ["La clim en entier", "Le code erreur affiché, s'il y en a un", "L'étiquette avec la marque et le modèle", "Le groupe extérieur"];
    return ["L'endroit voulu pour l'unité intérieure (le mur entier)", "L'endroit voulu pour le groupe extérieur", "Le tableau électrique, si c'est facile", "La pièce vue depuis la porte"];
  }

  async function init() {
    if (!DEMO && (!/^\d+$/.test(R) || !/^[a-f0-9]{32}$/.test(K))) return lienInvalide();
    const info = await api("photosInfo", {});
    if (!info.ok) return info.error === "reseau" ? erreur("Connexion impossible. Vérifiez internet et rechargez la page.") : lienInvalide();
    rendre(info);
  }
  function lienInvalide() { erreur("Ce lien n'est pas valide ou a expiré. Envoyez vos photos par mail à thermaz.fr@gmail.com, ou appelez Andy au " + TEL + "."); }
  function erreur(t) { show(el("h1", { class: "sg-h1", text: "Envoyer mes photos" }), el("p", { class: "sg-msg", text: t })); }

  function rendre(info) {
    const liste = el("div", { class: "ph-liste" });
    const statut = el("p", { class: "sg-err", role: "status" });
    const input = el("input", { type: "file", accept: "image/*", multiple: true, id: "ph-input", class: "ph-input" });
    let envoyees = 0, enCours = false;
    input.addEventListener("change", async () => {
      const files = [...input.files].slice(0, 10);
      input.value = "";
      if (!files.length || enCours) return;
      enCours = true; statut.textContent = "";
      for (const f of files) {
        const ligne = el("div", { class: "ph-item" }, el("span", { class: "ph-nom", text: f.name || "photo" }), el("span", { class: "ph-etat", text: "préparation…" }));
        liste.append(ligne);
        const etat = ligne.querySelector(".ph-etat");
        try {
          const data = await reduire(f);
          ligne.prepend(el("img", { src: data, alt: "", width: "56", height: "56" }));
          etat.textContent = "envoi…";
          const r = await api("photosEnvoyer", { image: data, legende: "" });
          if (r.ok) { envoyees++; etat.textContent = "✓ reçue"; ligne.classList.add("ok"); }
          else { etat.textContent = r.error === "trop" ? "limite atteinte" : "échec, réessayez"; ligne.classList.add("ko"); if (r.error === "trop") break; }
        } catch (e) { etat.textContent = "photo illisible"; ligne.classList.add("ko"); }
      }
      enCours = false;
      if (envoyees) merci.hidden = false;
    });
    const merci = el("div", { class: "sg-ok", hidden: true },
      el("h1", { text: "Merci, c'est reçu !" }),
      el("p", { text: "Andy regarde vos photos et vous rappelle. Vous pouvez en ajouter d'autres si besoin." }));
    show(
      el("h1", { class: "sg-h1", text: "Bonjour" + (info.prenom ? " " + info.prenom : "") + ", envoyez vos photos" }),
      el("p", { class: "sg-sub", text: "Quelques photos prises avec votre téléphone suffisent. Elles arrivent directement chez Andy, l'artisan." }),
      el("section", { class: "sg-card" }, el("h2", { text: "Les photos utiles" }), el("ul", { class: "ph-conseils" }, conseils(info.prestation).map(t => el("li", { text: t })))),
      merci,
      el("label", { class: "sg-btn ph-bouton", for: "ph-input", text: "Choisir ou prendre des photos" }), input,
      el("p", { class: "sg-info", text: "Jusqu'à 10 photos à la fois. Elles sont réduites avant l'envoi pour aller vite." }),
      statut, liste,
      el("p", { class: "sg-info", text: "Une question ? Appelez Andy au " + TEL + "." }));
  }

  init();
})();
