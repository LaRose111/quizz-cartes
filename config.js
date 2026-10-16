// Configuration Microsoft 365 du Quizz Cartes.
// Ces trois valeurs ne sont PAS secrètes : elles sont fournies par l'administrateur
// Microsoft 365 du groupe (étape 4 du tuto de configuration).
// Tant qu'elles sont vides, le quizz tourne en MODE DÉMO : tout est stocké
// uniquement dans le navigateur, rien n'est envoyé nulle part.
window.QUIZZ_CONFIG = {
  clientId: "",   // ID d'application (client)
  tenantId: "",   // ID de l'annuaire (locataire)
  siteUrl: "",    // ex. https://nomdugroupe.sharepoint.com/sites/QuizzCartes
};
