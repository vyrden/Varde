import { redirect } from 'next/navigation';

/**
 * Index du wizard. Le middleware Next.js (PR 7.1 sous-livrable 4)
 * route déjà toute requête `/` vers `/setup/welcome` quand
 * l'instance n'est pas configurée, mais on garde cette redirection
 * en filet de sécurité pour le cas où un admin tape directement
 * `/setup` dans la barre d'adresse.
 */
export default function SetupIndex(): never {
  redirect('/setup/welcome');
}
