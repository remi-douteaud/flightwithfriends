// Theme ids match the file names in questions/.
export const THEMES = [
  { id: 'lol', name: 'League of Legends', color: '#0a5fbf' },
  { id: 'jeux-video', name: 'Jeux vidéo', color: '#7c3aed' },
  { id: 'warcraft', name: 'Warcraft', color: '#b45309' },
  { id: 'animaux', name: 'Animaux', color: '#15803d' },
  { id: 'legumes', name: 'Légumes', color: '#65a30d' },
  { id: 'fleurs', name: 'Fleurs', color: '#db2777' },
  { id: 'celebrites', name: 'Célébrités', color: '#c026d3' },
  { id: 'f1', name: 'Formule 1', color: '#dc2626' },
  { id: 'histoire', name: 'Histoire', color: '#92400e' },
  { id: 'rois-de-france', name: 'Rois de France', color: '#4338ca' },
  { id: 'geographie', name: 'Géographie', color: '#0891b2' },
  { id: 'drapeaux', name: 'Drapeaux', color: '#2563eb' },
  { id: 'formes', name: 'Formes de pays', color: '#0f766e' },
  { id: 'litterature', name: 'Littérature', color: '#78350f' },
  { id: 'harry-potter', name: 'Harry Potter', color: '#7f1d1d' },
  { id: 'musique-70-90', name: 'Musique 70s–90s', color: '#ea580c' },
  { id: 'musique-90-2010', name: 'Musique 90s–2010', color: '#d97706' },
  { id: 'musique-2010', name: 'Musique 2010+', color: '#f59e0b' },
  { id: 'art', name: 'Art', color: '#be185d' },
  { id: 'internet-fr', name: 'Internet français', color: '#6d28d9' },
  { id: 'cuisine', name: 'Cuisine', color: '#b91c1c' },
  { id: 'cinema', name: 'Cinéma', color: '#1f2937' },
  { id: 'seigneur-des-anneaux', name: 'Seigneur des Anneaux', color: '#3f6212' },
  { id: 'dinosaures', name: 'Dinosaures', color: '#047857' },
  { id: 'monde-1444', name: 'Le monde en 1444', color: '#57534e' },
];

export const THEME_NAME = Object.fromEntries(THEMES.map((t) => [t.id, t.name]));
export const THEME_COLOR = Object.fromEntries(THEMES.map((t) => [t.id, t.color]));
