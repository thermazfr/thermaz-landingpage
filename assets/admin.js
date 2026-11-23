/* L'espace admin a changé d'interface le 23/11/2026 (fichiers admin-v3).
   Une ancienne page gardée en mémoire par le téléphone, ou une icône d'écran d'accueil, charge encore ce fichier :
   on la renvoie vers la nouvelle interface. L'ancienne reste disponible sur admin-v2.html (script admin-v2.js). */
location.replace("admin.html?v=" + Date.now());