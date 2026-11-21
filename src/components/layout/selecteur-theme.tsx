"use client";

import { useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { definirTheme } from "@/modules/core/actions/theme";
import type { Theme } from "@/modules/core/services/theme";

const CHOIX: { valeur: Theme; libelle: string; icone: React.ReactNode }[] = [
  { valeur: "clair", libelle: "Thème clair", icone: <Sun size={15} /> },
  { valeur: "sombre", libelle: "Thème sombre", icone: <Moon size={15} /> },
  { valeur: "systeme", libelle: "Selon le système", icone: <Monitor size={15} /> },
];

/**
 * Bascule clair / sombre / système.
 *
 * L'attribut `data-theme` est appliqué au DOM immédiatement (retour visuel
 * instantané) puis persisté en cookie par la Server Action, qui redevient la
 * source de vérité au rendu suivant.
 */
export function SelecteurTheme({ theme }: { theme: Theme }) {
  const [enCours, demarrer] = useTransition();

  function choisir(valeur: Theme) {
    const racine = document.documentElement;
    // Coupe les transitions CSS le temps du basculement (évite le fondu global).
    racine.setAttribute("data-theme-transition", "off");
    if (valeur === "systeme") racine.removeAttribute("data-theme");
    else racine.setAttribute("data-theme", valeur);
    window.setTimeout(() => racine.removeAttribute("data-theme-transition"), 80);

    demarrer(() => {
      void definirTheme(valeur);
    });
  }

  return (
    <div
      role="group"
      aria-label="Thème de l'interface"
      className={cn(
        "flex items-center gap-0.5 rounded-md border border-border p-0.5",
        enCours && "opacity-60"
      )}
    >
      {CHOIX.map((c) => {
        const actif = theme === c.valeur;
        return (
          <button
            key={c.valeur}
            type="button"
            onClick={() => choisir(c.valeur)}
            title={c.libelle}
            aria-label={c.libelle}
            aria-pressed={actif}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              actif
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {c.icone}
          </button>
        );
      })}
    </div>
  );
}
