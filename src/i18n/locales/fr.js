/**
 * French dictionary: the reference language. Every key must exist here;
 * other languages may be incomplete and fall back to French.
 */
export default {
  app: {
    title: 'Libreca',
    tagline: 'Posez votre livre, Libreca s\'occupe du reste.',
  },
  settings: {
    title: 'Paramètres',
    language: 'Langue',
  },
  diagnostics: {
    title: 'Vérifications',
    secureContext: 'Contexte sécurisé (HTTPS ou localhost) :',
    opencv: 'OpenCV.js :',
    yes: 'oui',
    no: 'non : la caméra sera refusée',
    loading: 'chargement…',
    loaded: 'chargé (version {version})',
    missing: 'introuvable : placez opencv.js dans src/vendor/opencv/',
    failed: 'échec du chargement : {error}',
  },
  camera: {
    title: 'Test de la caméra',
    source: 'Source vidéo',
    start: 'Démarrer',
    stop: 'Arrêter',
    defaultSource: 'Caméra par défaut',
    unnamed: 'Caméra {index}',
    unsupported: 'Ce navigateur ne permet pas l\'accès à la caméra.',
    insecure: 'Accès caméra impossible : ouvrez la page en HTTPS ou sur localhost.',
    starting: 'Démarrage de la caméra…',
    running: 'Caméra active : {width} × {height}',
    stopped: 'Caméra arrêtée.',
    denied: 'Accès à la caméra refusé.',
    notFound: 'Aucune caméra trouvée.',
    busy: 'La caméra est déjà utilisée par une autre application.',
    error: 'Erreur caméra : {error}',
  },
};
