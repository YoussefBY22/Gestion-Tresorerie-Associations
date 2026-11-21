import { cn } from "@/lib/utils";

const PALETTE = [
  "var(--primary)",
  "var(--accent-slate)",
  "var(--accent-gold)",
  "var(--accent-teal)",
  "var(--accent-plum)",
  "var(--success)",
];

function hachage(texte: string): number {
  let h = 0;
  for (let i = 0; i < texte.length; i++) h = (h * 31 + texte.charCodeAt(i)) >>> 0;
  return h;
}

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

const TAILLES = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-11 w-11 text-sm" };

/** Avatar déterministe : initiales + couleur stable dérivées du nom (pas de photo à gérer). */
export function Avatar({
  nom,
  taille = "md",
  className,
}: {
  nom: string;
  taille?: keyof typeof TAILLES;
  className?: string;
}) {
  const couleur = PALETTE[hachage(nom) % PALETTE.length];
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        TAILLES[taille],
        className
      )}
      style={{ backgroundColor: couleur }}
    >
      {initiales(nom)}
    </div>
  );
}
