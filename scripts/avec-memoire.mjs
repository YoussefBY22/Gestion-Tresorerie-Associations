/**
 * Lance une commande avec un tas Node élargi.
 *
 * L'ERP a dépassé la taille où le plafond par défaut de Node (~4 Go) suffit :
 * le serveur de développement, qui vit plusieurs jours et accumule à chaque
 * rechargement à chaud, finissait par le heurter. Le symptôme ne ressemblait
 * pas à sa cause — « Jest worker encountered child process exceptions »,
 * c'est-à-dire un processus de compilation tué faute de mémoire. Idem pour
 * `tsc`, qui abandonnait au milieu du typage.
 *
 * Passer par ce lanceur plutôt que par `NODE_OPTIONS=…` en préfixe de script :
 * cette syntaxe n'existe pas sous Windows, où npm exécute les scripts via cmd.
 *
 * Usage : node scripts/avec-memoire.mjs <commande> [args…]
 */
import { spawn } from "node:child_process";

const TAILLE_TAS_MO = 8192;

const commande = process.argv.slice(2);
if (commande.length === 0) {
  console.error("Usage : node scripts/avec-memoire.mjs <commande> [args…]");
  process.exit(1);
}

// Commande passée d'un seul tenant : sous Windows il faut un shell pour
// atteindre les binaires de node_modules/.bin, et la forme « chaîne unique »
// évite l'avertissement de dépréciation de la forme « chaîne + arguments ».
const enfant = spawn(commande.join(" "), {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--max-old-space-size=${TAILLE_TAS_MO}`]
      .filter(Boolean)
      .join(" "),
  },
});

enfant.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
