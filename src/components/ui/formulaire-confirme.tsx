"use client";

/**
 * Formulaire qui demande confirmation avant d'agir.
 *
 * Toute suppression de l'application passe par là : rien ne disparaît sur un clic
 * distrait. Le message dit ce qui va être supprimé et ce qu'il devient —
 * « part à la corbeille » n'engage pas la même décision que « définitivement ».
 */
export function FormulaireConfirme({
  action,
  message,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
