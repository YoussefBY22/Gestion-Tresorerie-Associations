"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Bloc qu'on déplie d'un clic.
 *
 * Replié par défaut : ce qu'il contient se règle une fois et se consulte
 * rarement, mais doit rester à portée — donc réduit, pas caché. La flèche
 * pivote avec l'ouverture, pour que le mouvement dise dans quel sens on va.
 *
 * La hauteur est mesurée sur le contenu à chaque ouverture, et repasse à
 * `auto` quand l'animation se termine — un contenu qui grandirait ensuite
 * (message d'erreur, champ ajouté) ne resterait pas coupé.
 */
export function BlocRepliable({
  titre,
  resume,
  children,
}: {
  titre: string;
  /** Ce qu'on veut lire sans déplier. */
  resume?: string;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [hauteur, setHauteur] = useState<number | "auto">(0);
  const contenu = useRef<HTMLDivElement>(null);

  function basculer() {
    const mesure = contenu.current?.scrollHeight ?? 0;
    // L'état bascule tout de suite, dans tous les cas : le laisser dépendre
    // d'une image d'animation, c'est risquer un bloc qui refuse de se fermer.
    setOuvert(!ouvert);
    if (!ouvert) {
      setHauteur(mesure);
      return;
    }
    // Fermeture : on repart d'une hauteur chiffrée, car une transition
    // partant de `auto` ne s'anime pas.
    setHauteur(mesure);
    requestAnimationFrame(() => requestAnimationFrame(() => setHauteur(0)));
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={basculer}
        aria-expanded={ouvert}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <ChevronDown
          size={18}
          aria-hidden
          className="shrink-0 text-muted-foreground"
          style={{
            transform: `rotate(${ouvert ? 180 : 0}deg)`,
            transition: "transform 300ms ease-out",
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{titre}</span>
          {resume && !ouvert ? (
            <span className="block truncate text-xs text-muted-foreground">
              {resume}
            </span>
          ) : null}
        </span>
      </button>

      <div
        style={{
          height: hauteur === "auto" ? "auto" : `${hauteur}px`,
          overflow: "hidden",
          transition: "height 300ms ease-out",
        }}
        onTransitionEnd={(e) => {
          if (e.propertyName === "height" && ouvert) setHauteur("auto");
        }}
      >
        <div ref={contenu} className="border-t border-border px-4 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
